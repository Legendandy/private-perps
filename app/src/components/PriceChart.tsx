/**
 * PriceChart.tsx
 * Renders a live candlestick chart using CSS-drawn pseudo-candles.
 * In production, integrate lightweight-charts (TradingView) for real OHLCV data.
 */

import { useMemo } from "react";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  symbol: string;
  price: number;
  change: number;
  candles: Candle[];
  unrealizedPnl?: number;
}

export default function PriceChart({ symbol, price, change, candles, unrealizedPnl }: Props) {
  const isUp = change >= 0;

  // Normalize candles to fit within chart height
  const { normalized, minP, maxP } = useMemo(() => {
    if (!candles.length) return { normalized: [], minP: 0, maxP: 0 };
    const prices = candles.flatMap((c) => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const normalized = candles.map((c) => ({
      ...c,
      nHigh: 1 - (c.high - minP) / range,
      nLow: 1 - (c.low - minP) / range,
      nOpen: 1 - (c.open - minP) / range,
      nClose: 1 - (c.close - minP) / range,
    }));
    return { normalized, minP, maxP };
  }, [candles]);

  const chartH = 200;
  const chartW = 700;
  const candleW = Math.max(3, chartW / candles.length - 2);

  return (
    <div className="flex-1 relative overflow-hidden chart-placeholder">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
        <span className="text-8xl font-black text-white tracking-tighter select-none">ARCIUM</span>
      </div>

      {/* Chart canvas (SVG) */}
      <div className="absolute inset-0 p-4">
        <div className="w-full h-full rounded-xl border border-white/5 overflow-hidden relative bg-black/20">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((pct) => (
              <line
                key={pct}
                x1={0}
                x2={chartW}
                y1={chartH * pct}
                y2={chartH * pct}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
              />
            ))}

            {/* Candles */}
            {normalized.map((c, i) => {
              const x = (i / candles.length) * chartW + candleW / 2;
              const isGreen = c.close >= c.open;
              const color = isGreen ? "#10B981" : "#ffb4ab";
              const bodyTop = Math.min(c.nOpen, c.nClose) * chartH;
              const bodyH = Math.max(1, Math.abs(c.nOpen - c.nClose) * chartH);

              return (
                <g key={i}>
                  {/* Wick */}
                  <line
                    x1={x}
                    x2={x}
                    y1={c.nHigh * chartH}
                    y2={c.nLow * chartH}
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.7}
                  />
                  {/* Body */}
                  <rect
                    x={x - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={color}
                    opacity={0.85}
                    rx={0.5}
                  />
                </g>
              );
            })}

            {/* Current price line */}
            {normalized.length > 0 && (() => {
              const range = maxP - minP || 1;
              const y = (1 - (price - minP) / range) * chartH;
              return (
                <line
                  x1={0}
                  x2={chartW}
                  y1={y}
                  y2={y}
                  stroke={isUp ? "#10B981" : "#ffb4ab"}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
              );
            })()}
          </svg>

          {/* Encrypted PnL badge overlay */}
          {unrealizedPnl !== undefined && (
            <div className="absolute top-4 right-4 glass-panel encryption-glow p-4 rounded-xl border border-tertiary/20 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
                  Encrypted PnL
                </span>
                <span className="material-symbols-outlined icon-filled text-tertiary text-sm">shield</span>
              </div>
              <div
                className="text-2xl font-black pnl-blur text-tertiary cursor-help"
                title="Hover to reveal — decrypted locally with your private key"
              >
                {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}
              </div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest text-right">
                Only you can see this
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
