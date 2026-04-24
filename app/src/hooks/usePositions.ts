import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  openPosition as arciumOpenPosition,
  closePosition as arciumClosePosition,
} from "../lib/programInstructions";
import type { ComputationStatus } from "../lib/arcium";
import { PROGRAM_ID } from "../lib/constants";
import { parsePrice } from "../lib/constants";

import IDL_JSON from "../idl/stealth_perps.json";
const IDL = IDL_JSON as any;

console.log("=== IDL LOADED ===", {
  address: IDL?.address,
  instructions: IDL?.instructions?.length,
  name: IDL?.metadata?.name ?? IDL?.name,
});

const MOCK_MODE = import.meta.env.VITE_MOCK_ARCIUM === "true";

export interface Position {
  id: string;
  market: string;
  direction: "LONG" | "SHORT";
  collateralSol: number;
  collateralUsd: number;
  sizeTokens: number;
  entryPrice: number;
  leverageX: number;
  ct_entry_price: string;
  ct_liq_price: string;
  liqPriceDecrypted: number;
  unrealizedPnl: number;
  fundingOwed: number;
  status: "pending_open" | "open" | "pending_close" | "closed" | "liquidated";
  openedAt: number;
  computationOffset: string;
  positionPda?: string;
  txSig?: string;
}

export interface OpenPositionParams {
  market: string;
  direction: "LONG" | "SHORT";
  collateralUsdc: number;
  sizeTokens: number;
  entryPrice: number;
  leverageX: number;
}

function getStorageKey(pubkey: string) {
  return `stealthperps_positions_${pubkey}`;
}

function savePositions(pubkey: string, positions: Position[]) {
  try {
    localStorage.setItem(getStorageKey(pubkey), JSON.stringify(positions));
  } catch (e) {
    console.error("Failed to save positions to localStorage:", e);
  }
}

function loadPositions(pubkey: string): Position[] {
  try {
    const raw = localStorage.getItem(getStorageKey(pubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Position[];
    // Filter out any corrupted entries with no market data
    return parsed.filter(
      (p) => p.market && p.market !== "Unknown" && p.entryPrice > 0
    );
  } catch {
    return [];
  }
}

export function usePositions() {
  const { connection } = useConnection();
  const { wallet, publicKey, signTransaction, signAllTransactions } = useWallet();

  const [positions, setPositions] = useState<Position[]>([]);
  const [computationStatus, setComputationStatus] = useState<ComputationStatus>("idle");
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);

  function getProvider(): anchor.AnchorProvider | null {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const anchorWallet = {
      publicKey,
      signTransaction: async (tx: any) => signTransaction(tx),
      signAllTransactions: async (txs: any[]) => signAllTransactions(txs),
      payer: null as any,
    };
    return new anchor.AnchorProvider(connection, anchorWallet as any, {
      commitment: "confirmed",
      skipPreflight: true,
    });
  }

  function getProgram(provider: anchor.AnchorProvider) {
    anchor.setProvider(provider);
    return new Program(IDL, provider) as any;
  }

  // ── Persist to localStorage whenever positions change ──────────────────
  useEffect(() => {
    if (!publicKey) return;
    // Only save positions that have real data
    const validPositions = positions.filter(
      (p) => p.market && p.market !== "Unknown" && p.entryPrice > 0
    );
    savePositions(publicKey.toBase58(), validPositions);
  }, [positions, publicKey]);

  // ── Sync chain status for locally-known positions only ─────────────────
  // We do NOT recover unknown positions from chain — they lack metadata.
  const syncChainStatus = useCallback(async (localPositions: Position[]) => {
    if (!publicKey || localPositions.length === 0) return;
    const provider = getProvider();
    if (!provider) return;

    // Only try to sync positions that have a PDA
    const positionsWithPda = localPositions.filter((p) => p.positionPda);
    if (positionsWithPda.length === 0) return;

    try {
      const program = getProgram(provider);

      // Fetch each known PDA's on-chain status
      const updates: Record<string, Position["status"]> = {};
      await Promise.all(
        positionsWithPda.map(async (pos) => {
          try {
            const acc = await program.account.position.fetch(
              new PublicKey(pos.positionPda!)
            );
            const state = acc.state;
            const status: Position["status"] =
              "open" in state ? "open" :
              "closing" in state ? "pending_close" :
              "closed" in state ? "closed" :
              "opening" in state ? "pending_open" : "open";
            updates[pos.id] = status;
          } catch {
            // Account not found — likely closed/never existed on this cluster
            // Keep existing local status, don't mark as closed automatically
          }
        })
      );

      if (Object.keys(updates).length > 0) {
        setPositions((prev) =>
          prev.map((p) =>
            updates[p.id] !== undefined ? { ...p, status: updates[p.id] } : p
          )
        );
      }
    } catch (e) {
      console.error("Failed to sync chain status:", e);
    }
  }, [publicKey, connection]);

  // ── On wallet connect: load from localStorage ──────────────────────────
  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      return;
    }
    const local = loadPositions(publicKey.toBase58());
    if (local.length > 0) {
      setPositions(local);
      // Optionally sync status in background (non-blocking)
      syncChainStatus(local).catch(() => {});
    }
  }, [publicKey?.toBase58()]);

  // ── Open Position ──────────────────────────────────────────────────────
  const openPosition = useCallback(
    async (params: OpenPositionParams) => {
      if (MOCK_MODE) return openPositionMock(params);

      const provider = getProvider();
      if (!provider) throw new Error("Wallet not connected");

      let program: any;
      try {
        program = getProgram(provider);
      } catch (e) {
        console.error("=== GET PROGRAM FAILED ===", e);
        throw e;
      }

      const collateralSol = params.collateralUsdc;
      const collateralLamports = BigInt(Math.round(collateralSol * 1_000_000_000));
      const size = BigInt(Math.round(params.sizeTokens * 1_000_000_000));
      const entryPrice = parsePrice(params.entryPrice.toFixed(6));
      const leverageBps = BigInt(params.leverageX * 100);
      const isLong = params.direction === "LONG";

      setComputationStatus("encrypting");

      try {
        const result = await arciumOpenPosition(
          program,
          provider.wallet,
          { collateralUsdc: collateralLamports, size, entryPrice, leverageBps, isLong },
          setComputationStatus
        );

        const collateralUsd = collateralSol * params.entryPrice;

        const position: Position = {
          id: `pos_${result.computationOffset.toString(16)}`,
          market: params.market,
          direction: params.direction,
          collateralSol,
          collateralUsd,
          sizeTokens: params.sizeTokens,
          entryPrice: params.entryPrice,
          leverageX: params.leverageX,
          ct_entry_price: "0x…encrypted…",
          ct_liq_price: "0x…encrypted…",
          liqPriceDecrypted: Number(result.liqPriceDecrypted) / 1_000_000,
          unrealizedPnl: 0,
          fundingOwed: 0,
          status: "open",
          openedAt: Date.now(),
          computationOffset: result.computationOffset.toString(),
          positionPda: result.positionPda.toBase58(),
          txSig: result.txSig,
        };

        setPositions((prev) => [position, ...prev]);
        setLastTxSig(result.txSig);
        setTimeout(() => setComputationStatus("idle"), 3000);
        return position;
      } catch (err) {
        console.error("=== OPEN POSITION INNER ERROR ===", err);
        setComputationStatus("error");
        setTimeout(() => setComputationStatus("idle"), 4000);
        throw err;
      }
    },
    [publicKey, connection, wallet]
  );

  // ── Close Position ─────────────────────────────────────────────────────
  const closePosition = useCallback(
    async (positionId: string, exitPrice: number) => {
      if (MOCK_MODE) return closePositionMock(positionId);

      const provider = getProvider();
      if (!provider) throw new Error("Wallet not connected");
      const program = getProgram(provider);

      const pos = positions.find((p) => p.id === positionId);
      if (!pos || !pos.positionPda) throw new Error("Position not found");

      setPositions((prev) =>
        prev.map((p) => (p.id === positionId ? { ...p, status: "pending_close" as const } : p))
      );
      setComputationStatus("encrypting");

      try {
        const result = await arciumClosePosition(
          program,
          provider.wallet,
          new PublicKey(pos.positionPda),
          parsePrice(exitPrice.toFixed(6)),
          0n,
          setComputationStatus
        );

        setPositions((prev) =>
          prev.map((p) =>
            p.id === positionId
              ? { ...p, status: "closed" as const, unrealizedPnl: Number(result.pnl) / 1_000_000, txSig: result.txSig }
              : p
          )
        );
        setLastTxSig(result.txSig);
        setTimeout(() => setComputationStatus("idle"), 3000);
      } catch (err) {
        setComputationStatus("error");
        setPositions((prev) =>
          prev.map((p) => (p.id === positionId ? { ...p, status: "open" as const } : p))
        );
        setTimeout(() => setComputationStatus("idle"), 4000);
        throw err;
      }
    },
    [positions, publicKey, connection]
  );

  // ── Update PnL from live prices ────────────────────────────────────────
  const updatePnl = useCallback(
    (marketPrices: Record<string, number>) => {
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.status !== "open") return pos;
          const mark = marketPrices[pos.market] ?? pos.entryPrice;
          const priceDiff =
            pos.direction === "LONG"
              ? mark - pos.entryPrice
              : pos.entryPrice - mark;
          const pnlPct = priceDiff / pos.entryPrice;
          return {
            ...pos,
            unrealizedPnl: pos.collateralUsd * pos.leverageX * pnlPct,
          };
        })
      );
    },
    []
  );

  // ── Mock helpers ───────────────────────────────────────────────────────
  async function openPositionMock(params: OpenPositionParams): Promise<Position> {
    setComputationStatus("encrypting");
    await sleep(500);
    setComputationStatus("queuing");
    await sleep(600);
    setComputationStatus("mpc_computing");
    await sleep(1800);
    setComputationStatus("awaiting_callback");
    await sleep(400);

    const liqDistance = params.entryPrice / params.leverageX;
    const liqPriceDecrypted =
      params.direction === "LONG"
        ? params.entryPrice - liqDistance
        : params.entryPrice + liqDistance;

    const collateralSol = params.collateralUsdc;
    const collateralUsd = collateralSol * params.entryPrice;

    const id = `pos_${Math.random().toString(36).slice(2, 10)}`;
    const position: Position = {
      id,
      market: params.market,
      direction: params.direction,
      collateralSol,
      collateralUsd,
      sizeTokens: params.sizeTokens,
      entryPrice: params.entryPrice,
      leverageX: params.leverageX,
      ct_entry_price: `0x${randomHex(8)}…`,
      ct_liq_price: `0x${randomHex(8)}…`,
      liqPriceDecrypted,
      unrealizedPnl: 0,
      fundingOwed: 0,
      status: "open",
      openedAt: Date.now(),
      computationOffset: Math.random().toString(16).slice(2, 18),
      txSig: `mock_${randomHex(16)}`,
    };

    setPositions((prev) => [position, ...prev]);
    setLastTxSig(position.txSig!);
    setComputationStatus("done");
    setTimeout(() => setComputationStatus("idle"), 2500);
    return position;
  }

  async function closePositionMock(positionId: string) {
    setPositions((prev) =>
      prev.map((p) => (p.id === positionId ? { ...p, status: "pending_close" as const } : p))
    );
    setComputationStatus("encrypting");
    await sleep(500);
    setComputationStatus("mpc_computing");
    await sleep(2000);
    setComputationStatus("awaiting_callback");
    await sleep(500);
    setPositions((prev) =>
      prev.map((p) => (p.id === positionId ? { ...p, status: "closed" as const } : p))
    );
    setComputationStatus("done");
    setTimeout(() => setComputationStatus("idle"), 2500);
  }

  return { positions, computationStatus, lastTxSig, openPosition, closePosition, updatePnl };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomHex(len: number) {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}
