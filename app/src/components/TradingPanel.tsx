/**
 * TradingPanel.tsx
 * Order entry panel — calls real Arcium MPC when wallet is connected.
 * Falls back to mock mode when VITE_MOCK_ARCIUM=true.
 */

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LEVERAGE_OPTIONS } from "../lib/constants";
import type { OpenPositionParams } from "../hooks/usePositions";
import type { ComputationStatus } from "../lib/arcium";
import EncryptionStatus from "./EncryptionStatus";

interface Props {
  market: string;
  currentPrice: number;
  computationStatus: ComputationStatus;
  lastTxSig: string | null;
  onOpenPosition: (params: OpenPositionParams) => Promise<void>;
}

type Side = "LONG" | "SHORT";

export default function TradingPanel({
  market,
  currentPrice,
  computationStatus,
  lastTxSig,
  onOpenPosition,
}: Props) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [side, setSide] = useState<Side>("LONG");
  const [collateral, setCollateral] = useState("100");
  const [leverage, setLeverage] = useState(10);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const collateralNum = parseFloat(collateral) || 0;
  const entryPrice = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : currentPrice;
  const notional = collateralNum * leverage;
  const sizeTokens = notional / (entryPrice || 1);
  const liqDist = entryPrice / leverage;
  const liqPrice = side === "LONG" ? entryPrice - liqDist : entryPrice + liqDist;

  const disabled = computationStatus !== "idle" || isSubmitting || collateralNum <= 0;

  async function handleSubmit() {
    if (!connected) { setVisible(true); return; }
    if (disabled) return;
    setIsSubmitting(true);

    const params: OpenPositionParams = {
      market,
      direction: side,
      collateralUsdc: collateralNum,
      sizeTokens,
      entryPrice,
      leverageX: leverage,
    };

    console.log("=== OPEN POSITION DEBUG ===");
    console.log("VITE_MOCK_ARCIUM:", import.meta.env.VITE_MOCK_ARCIUM);
    console.log("VITE_PROGRAM_ID:", import.meta.env.VITE_PROGRAM_ID);
    console.log("VITE_RPC_URL:", import.meta.env.VITE_RPC_URL);
    console.log("VITE_BACKEND_API_BASE:", import.meta.env.VITE_BACKEND_API_BASE);
    console.log("params:", JSON.stringify(params, null, 2));
    console.log("collateralNum:", collateralNum);
    console.log("entryPrice:", entryPrice);
    console.log("sizeTokens:", sizeTokens);
    console.log("currentPrice:", currentPrice);

    try {
      await onOpenPosition(params);
    } catch (e) {
      console.error("openPosition error:", e);
    } finally {
      setIsSubmitting(false);
    }
  }

  const C = {
    border: "var(--color-border)",
    text2: "var(--color-text-2)",
    text3: "var(--color-text-3)",
    green: "var(--color-green)",
    red: "var(--color-red)",
  };

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto scroll-hide p-4">

      {/* Order type */}
      <div className="flex border-b" style={{ borderColor: C.border }}>
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className="px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-widest capitalize transition-all border-b-2"
            style={{
              color: orderType === t ? "white" : C.text3,
              borderBottomColor: orderType === t ? C.green : "transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-2">
        {(["LONG", "SHORT"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className="py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              background: side === s
                ? s === "LONG" ? "rgba(34,211,165,0.2)" : "rgba(248,113,113,0.18)"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${side === s
                ? s === "LONG" ? "rgba(34,211,165,0.4)" : "rgba(248,113,113,0.35)"
                : "rgba(255,255,255,0.06)"}`,
              color: side === s
                ? s === "LONG" ? C.green : C.red
                : C.text3,
            }}
          >
            <span className="material-symbols-outlined text-[13px] align-middle mr-1">
              {s === "LONG" ? "trending_up" : "trending_down"}
            </span>
            {s}
          </button>
        ))}
      </div>

      {/* Collateral */}
      <div>
        <label className="block font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
          Collateral (USDC)
        </label>
        <div className="relative">
          <input
            type="number"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="0.00"
            className="t-input pr-14"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px]" style={{ color: C.text3 }}>
            USDC
          </span>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setCollateral(String(Math.round(1000 * pct / 100)))}
              className="flex-1 py-0.5 text-[9px] font-mono rounded transition-all"
              style={{
                border: "1px solid var(--color-border)",
                color: C.text3,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.text3)}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Limit price */}
      {orderType === "limit" && (
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
            Limit Price (USDC)
          </label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={currentPrice.toFixed(2)}
            className="t-input"
          />
        </div>
      )}

      {/* Leverage */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="font-mono text-[9px] uppercase tracking-widest" style={{ color: C.text2 }}>
            Leverage
          </label>
          <span className="font-mono text-sm font-bold" style={{ color: "white" }}>{leverage}×</span>
        </div>
        <input
          type="range" min={1} max={50} value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex gap-1 mt-1.5">
          {LEVERAGE_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              className="flex-1 py-0.5 text-[9px] font-mono rounded border transition-all"
              style={{
                borderColor: leverage === l ? C.green : "var(--color-border)",
                color: leverage === l ? C.green : C.text3,
                background: leverage === l ? "rgba(34,211,165,0.08)" : "transparent",
              }}
            >
              {l}×
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg p-3 space-y-1.5 border" style={{ border: "1px solid var(--color-border)", background: "rgba(0,0,0,0.25)" }}>
        {[
          { l: "Entry Price", v: `${orderType === "market" ? "~" : ""}$${entryPrice.toFixed(2)}` },
          { l: "Position Size", v: `${sizeTokens.toFixed(4)} ${market.split("/")[0]}` },
          { l: "Notional", v: `$${notional.toFixed(2)}` },
        ].map((r) => (
          <div key={r.l} className="flex justify-between text-[11px]">
            <span className="font-mono" style={{ color: C.text3 }}>{r.l}</span>
            <span className="font-mono" style={{ color: "var(--color-text)" }}>{r.v}</span>
          </div>
        ))}
        <div className="flex justify-between text-[11px] border-t pt-1.5" style={{ borderColor: "var(--color-border)" }}>
          <span className="font-mono flex items-center gap-1" style={{ color: C.text3 }}>
            <span className="material-symbols-outlined icon-fill text-[10px]" style={{ color: C.green }}>shield</span>
            Est. Liq. Price
          </span>
          <span className="font-mono font-bold" style={{ color: side === "LONG" ? C.red : C.green }}>
            ${liqPrice.toFixed(2)}{" "}
            <span className="font-normal text-[9px]" style={{ color: C.text3 }}>(MPC encrypted)</span>
          </span>
        </div>
      </div>

      {/* Privacy notice */}
      <div
        className="flex items-start gap-2 px-3 py-2 rounded-lg"
        style={{ background: "rgba(34,211,165,0.05)", border: "1px solid rgba(34,211,165,0.12)" }}
      >
        <span className="material-symbols-outlined icon-fill text-[13px] mt-0.5 shrink-0" style={{ color: C.green }}>lock</span>
        <p className="font-mono text-[9px] leading-relaxed" style={{ color: C.text2 }}>
          Size, entry & leverage{" "}
          <span style={{ color: C.green }} className="font-bold">encrypted by Arcium MPC</span>.
          Only you can decrypt your PnL.
        </p>
      </div>

      {/* Arcium status */}
      <EncryptionStatus status={computationStatus} lastTxSig={lastTxSig} />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={disabled && connected}
        className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2"
        style={{
          background: !connected ? "rgba(167,139,250,0.2)" :
                      side === "LONG" ? "rgba(34,211,165,0.15)" : "rgba(248,113,113,0.15)",
          border: `1px solid ${!connected ? "rgba(167,139,250,0.35)" :
                  side === "LONG" ? "rgba(34,211,165,0.35)" : "rgba(248,113,113,0.35)"}`,
          color: !connected ? "#A78BFA" :
                 side === "LONG" ? C.green : C.red,
          opacity: disabled && connected ? 0.5 : 1,
          cursor: disabled && connected ? "not-allowed" : "pointer",
        }}
      >
        {!connected ? (
          <>
            <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
            Connect Wallet
          </>
        ) : computationStatus !== "idle" ? (
          <>
            <span className="material-symbols-outlined text-[15px] animate-spin">sync</span>
            {computationStatus === "encrypting" ? "Encrypting…" :
             computationStatus === "mpc_computing" ? "MPC Computing…" : "Processing…"}
          </>
        ) : (
          <>
            <span className="material-symbols-outlined icon-fill text-[15px]">
              {side === "LONG" ? "trending_up" : "trending_down"}
            </span>
            {side === "LONG" ? "Open Long" : "Open Short"} {leverage}×
          </>
        )}
      </button>
    </div>
  );
}