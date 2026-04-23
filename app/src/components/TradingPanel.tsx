/**
 * TradingPanel.tsx
 *
 * Order entry panel. Shows the full encryption flow:
 * user fills in collateral/size/leverage → values are encrypted before being
 * sent to the Solana program → Arcium MPC computes liquidation price privately.
 */

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LEVERAGE_OPTIONS } from "../lib/constants";
import { OpenPositionParams } from "../hooks/usePositions";
import { ComputationStatus } from "../lib/arcium";
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

  // Liquidation price preview
  const liqDistance = entryPrice / leverage;
  const liqPrice =
    side === "LONG"
      ? entryPrice - liqDistance
      : entryPrice + liqDistance;

  const isDisabled =
    computationStatus !== "idle" || isSubmitting || collateralNum <= 0;

  async function handleSubmit() {
    if (!connected) {
      setVisible(true);
      return;
    }
    if (isDisabled) return;

    setIsSubmitting(true);
    try {
      await onOpenPosition({
        market,
        direction: side,
        collateralUsdc: collateralNum,
        sizeTokens,
        entryPrice,
        leverageX: leverage,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto scroll-hide p-4">

      {/* Order type tabs */}
      <div className="flex border-b border-white/5">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider capitalize transition-all ${
              orderType === t ? "tab-active" : "tab-inactive"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("LONG")}
          className={`py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
            side === "LONG" ? "long-btn active" : "long-btn"
          }`}
        >
          <span className="material-symbols-outlined text-[14px] align-middle mr-1">trending_up</span>
          Long
        </button>
        <button
          onClick={() => setSide("SHORT")}
          className={`py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
            side === "SHORT" ? "short-btn active" : "short-btn"
          }`}
        >
          <span className="material-symbols-outlined text-[14px] align-middle mr-1">trending_down</span>
          Short
        </button>
      </div>

      {/* Collateral input */}
      <div>
        <label className="block text-[10px] text-zinc-500 uppercase tracking-widest font-mono mb-1">
          Collateral (USDC)
        </label>
        <div className="relative">
          <input
            type="number"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="0.00"
            className="trading-input pr-14"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-mono">
            USDC
          </span>
        </div>
        <div className="flex gap-2 mt-2">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setCollateral(String(Math.round(1000 * pct / 100)))}
              className="flex-1 py-1 text-[10px] text-zinc-400 border border-white/10 rounded hover:bg-white/5 hover:text-white transition-all font-mono"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Limit price */}
      {orderType === "limit" && (
        <div>
          <label className="block text-[10px] text-zinc-500 uppercase tracking-widest font-mono mb-1">
            Limit Price (USDC)
          </label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={currentPrice.toFixed(2)}
            className="trading-input"
          />
        </div>
      )}

      {/* Leverage */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">
            Leverage
          </label>
          <span className="text-sm text-white font-mono font-bold">{leverage}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={50}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-primary-container"
        />
        <div className="flex gap-1 mt-2">
          {LEVERAGE_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => setLeverage(l)}
              className={`flex-1 py-1 text-[10px] rounded border font-mono transition-all ${
                leverage === l
                  ? "border-primary-container text-primary-container bg-primary-container/10"
                  : "border-white/10 text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
              }`}
            >
              {l}×
            </button>
          ))}
        </div>
      </div>

      {/* Order Summary */}
      <div className="glass-panel rounded-lg p-3 space-y-2 border border-white/5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500 font-mono">Entry Price</span>
          <span className="text-zinc-200 font-mono">
            {orderType === "market" ? "~" : ""}${entryPrice.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500 font-mono">Position Size</span>
          <span className="text-zinc-200 font-mono">
            {sizeTokens.toFixed(4)} {market.split("/")[0]}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500 font-mono">Notional</span>
          <span className="text-zinc-200 font-mono">${notional.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs border-t border-white/5 pt-2">
          <span className="text-zinc-500 font-mono flex items-center gap-1">
            <span className="material-symbols-outlined icon-filled text-[12px] text-tertiary">shield</span>
            Est. Liq. Price
          </span>
          <span className={`font-mono font-bold text-xs ${side === "LONG" ? "text-error" : "text-tertiary"}`}>
            ${liqPrice.toFixed(2)} <span className="text-[9px] text-zinc-600">(encrypted by MPC)</span>
          </span>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-2 px-3 py-2 bg-tertiary/5 border border-tertiary/15 rounded-lg">
        <span className="material-symbols-outlined icon-filled text-tertiary text-[14px] mt-0.5 shrink-0">lock</span>
        <p className="text-[10px] text-zinc-400 leading-relaxed">
          Position size, entry price, and liquidation threshold are{" "}
          <span className="text-tertiary font-bold">encrypted by Arcium MPC</span>.
          Only you can decrypt your PnL.
        </p>
      </div>

      {/* Arcium computation status */}
      <EncryptionStatus status={computationStatus} lastTxSig={lastTxSig} />

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isDisabled && connected}
        className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
          !connected
            ? "bg-primary-container text-white hover:brightness-110 active:scale-[0.98] shadow-lg shadow-primary-container/20"
            : side === "LONG"
            ? `bg-tertiary/20 border border-tertiary/40 text-tertiary hover:bg-tertiary/30 active:scale-[0.98] ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`
            : `bg-error/20 border border-error/40 text-error hover:bg-error/30 active:scale-[0.98] ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`
        }`}
      >
        {!connected ? (
          <>
            <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
            Connect Wallet
          </>
        ) : computationStatus !== "idle" ? (
          <>
            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            {computationStatus === "encrypting" ? "Encrypting..." :
             computationStatus === "mpc_computing" ? "MPC Computing..." :
             "Processing..."}
          </>
        ) : (
          <>
            <span className="material-symbols-outlined icon-filled text-[16px]">
              {side === "LONG" ? "trending_up" : "trending_down"}
            </span>
            {side === "LONG" ? "Open Long" : "Open Short"} {leverage}×
          </>
        )}
      </button>
    </div>
  );
}
