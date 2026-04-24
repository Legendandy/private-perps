/**
 * usePositions.ts
 */

import { useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  openPosition as arciumOpenPosition,
  closePosition as arciumClosePosition,
} from "../lib/programInstructions";
import type { ComputationStatus } from "../lib/arcium";
import { PROGRAM_ID, SCALE, MAINTENANCE_MARGIN_BPS } from "../lib/constants";
import { parsePrice } from "../lib/constants";

let IDL: any;
try {
  IDL = require("../idl/stealth_perps.json");
} catch {
  IDL = { version: "0.1.0", name: "stealth_perps", instructions: [], accounts: [], events: [] };
}

const MOCK_MODE = import.meta.env.VITE_MOCK_ARCIUM === "true";

export interface Position {
  id: string;
  market: string;
  direction: "LONG" | "SHORT";
  collateralUsdc: number;
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

export function usePositions() {
  const { connection } = useConnection();
  const { wallet, publicKey, signTransaction, signAllTransactions } = useWallet();

  const [positions, setPositions] = useState<Position[]>([]);
  const [computationStatus, setComputationStatus] = useState<ComputationStatus>("idle");
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);

  function getProvider(): anchor.AnchorProvider | null {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const anchorWallet = { publicKey, signTransaction, signAllTransactions };
    return new anchor.AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
  }

  function getProgram(provider: anchor.AnchorProvider) {
    return new Program(IDL, new PublicKey(PROGRAM_ID), provider);
  }

  const openPosition = useCallback(
    async (params: OpenPositionParams) => {
      if (MOCK_MODE) {
        return openPositionMock(params);
      }

      const provider = getProvider();
      if (!provider) throw new Error("Wallet not connected");
      const program = getProgram(provider);

      // ── DEBUG ──────────────────────────────────────────────────────────────
      console.log("=== PROGRAM DEBUG ===", {
        programId: program.programId?.toString(),
        idlInstructions: IDL?.instructions?.length,
        idlAddress: IDL?.address,
        providerWallet: provider.wallet?.publicKey?.toString(),
      });

      const collateralUsdc = BigInt(Math.round(params.collateralUsdc * 1_000_000));
      const size = BigInt(Math.round(params.sizeTokens * 1_000_000));
      const entryPrice = parsePrice(params.entryPrice.toFixed(6));
      const leverageBps = BigInt(params.leverageX * 100);
      const isLong = params.direction === "LONG";

      console.log("=== PARAMS TO ARCIUM ===", {
        collateralUsdc: collateralUsdc.toString(),
        size: size.toString(),
        entryPrice: entryPrice.toString(),
        leverageBps: leverageBps.toString(),
        isLong,
      });
      // ── END DEBUG ──────────────────────────────────────────────────────────

      setComputationStatus("encrypting");

      try {
        const result = await arciumOpenPosition(
          program as any,
          provider.wallet,
          {
            collateralUsdc,
            size,
            entryPrice,
            leverageBps,
            isLong,
          },
          setComputationStatus
        );

        const position: Position = {
          id: `pos_${result.computationOffset.toString(16)}`,
          market: params.market,
          direction: params.direction,
          collateralUsdc: params.collateralUsdc,
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
          program as any,
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

  const updatePnl = useCallback(
    (marketPrices: Record<string, number>) => {
      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.status !== "open") return pos;
          const mark = marketPrices[pos.market] ?? pos.entryPrice;
          const priceDiff = pos.direction === "LONG" ? mark - pos.entryPrice : pos.entryPrice - mark;
          const pnlPct = priceDiff / pos.entryPrice;
          return { ...pos, unrealizedPnl: pos.collateralUsdc * pos.leverageX * pnlPct };
        })
      );
    },
    []
  );

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

    const id = `pos_${Math.random().toString(36).slice(2, 10)}`;
    const position: Position = {
      id,
      market: params.market,
      direction: params.direction,
      collateralUsdc: params.collateralUsdc,
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
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}