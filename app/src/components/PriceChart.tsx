/**
 * PriceChart.tsx
 * 
 * SVG candlestick chart driven by real OHLCV data from Binance WebSocket.
 * Shows current price dashed line, live label, and optional encrypted PnL badge.
 */

import { useMemo, useRef, useEffect, useState } from "react";

export interface Candle {
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
  isLive?: boolean;
}

const W = 800;
const H = 220;
const PAD_L = 8;
const PAD_R = 60; // space for price labels
const PAD_T = 12;
const PAD_B = 20;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

export default function PriceChart({ symbol, price, change, candles, unrealizedPnl, isLive }: Props) {
  const isUp = change >= 0;
  const GREEN = "#22D3A5";
  const RED = "#F87171";
  const priceColor = isUp ? GREEN : RED;

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { normalized, minP, maxP, priceY } = useMemo(() => {
    if (candles.length < 2) return { normalized: [], minP: 0, maxP: 0, priceY: 0 };
    const allPrices = candles.flatMap((c) => [c.high, c.low]);
    const rawMin = Math.min(...allPrices);
    const rawMax = Math.max(...allPrices);
    const pad = (rawMax - rawMin) * 0.08;
    const minP = rawMin - pad;
    const maxP = rawMax + pad;
    const range = maxP - minP || 1;

    const toY = (p: number) => PAD_T + CHART_H - ((p - minP) / range) * CHART_H;

    const normalized = candles.map((c, i) => ({
      ...c,
      x: PAD_L + (i / (candles.length - 1)) * CHART_W,
      yHigh: toY(c.high),
      yLow: toY(c.low),
      yOpen: toY(c.open),
      yClose: toY(c.close),
      isGreen: c.close >= c.open,
    }));

    const priceY = toY(price);
    return { normalized, minP, maxP, priceY };
  }, [candles, price]);

  const candleW = normalized.length > 1
    ? Math.max(2, (CHART_W / normalized.length) * 0.6)
    : 6;

  // Y-axis price labels
  const priceLabels = useMemo(() => {
    if (maxP === minP) return [];
    const step = (maxP - minP) / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const p = minP + step * i;
      const range = maxP - minP || 1;
      const y = PAD_T + CHART_H - ((p - minP) / range) * CHART_H;
      return { p, y };
    });
  }, [minP, maxP]);

  const hovered = hoveredIdx !== null ? normalized[hoveredIdx] : null;

  function formatPrice(p: number): string {
    if (p >= 10000) return `${(p / 1000).toFixed(1)}K`;
    if (p >= 1000) return p.toFixed(0);
    if (p >= 10) return p.toFixed(2);
    return p.toFixed(4);
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden" style={{ background: "var(--color-surface)" }}>
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.025]">
        <span className="font-display text-[90px] font-black text-white tracking-tighter">ARCIUM</span>
      </div>

      {/* Live badge */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        {isLive ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md chip-green">
            <span className="live-dot" style={{ width: 5, height: 5, animation: 'live-ping 1.6s ease-out infinite' }} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest">Live</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md chip-blue">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest">Connecting…</span>
          </div>
        )}
      </div>

      {/* Hover OHLCV tooltip */}
      {hovered && (
        <div className="absolute top-3 left-24 z-10 flex items-center gap-4 px-3 py-1.5 rounded-lg glass-bright animate-slide-up">
          {[
            { l: "O", v: formatPrice(hovered.open), c: "text-zinc-300" },
            { l: "H", v: formatPrice(hovered.high), c: "text-[#22D3A5]" },
            { l: "L", v: formatPrice(hovered.low),  c: "text-[#F87171]" },
            { l: "C", v: formatPrice(hovered.close), c: hovered.isGreen ? "text-[#22D3A5]" : "text-[#F87171]" },
          ].map((item) => (
            <span key={item.l} className="font-mono text-[11px]">
              <span className="text-zinc-600">{item.l} </span>
              <span className={item.c}>{item.v}</span>
            </span>
          ))}
          <span className="font-mono text-[10px] text-zinc-600">
            {new Date(hovered.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {/* SVG Chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          if (!svgRef.current || normalized.length === 0) return;
          const rect = svgRef.current.getBoundingClientRect();
          const xRatio = (e.clientX - rect.left) / rect.width;
          const chartX = xRatio * W - PAD_L;
          const idx = Math.round((chartX / CHART_W) * (normalized.length - 1));
          setHoveredIdx(Math.max(0, Math.min(normalized.length - 1, idx)));
        }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Grid */}
        {priceLabels.map((lbl, i) => (
          <g key={i}>
            <line
              x1={PAD_L} x2={PAD_L + CHART_W}
              y1={lbl.y} y2={lbl.y}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1}
            />
            <text
              x={PAD_L + CHART_W + 4} y={lbl.y + 4}
              fill="rgba(255,255,255,0.2)"
              fontSize={9}
              fontFamily="IBM Plex Mono, monospace"
            >
              {formatPrice(lbl.p)}
            </text>
          </g>
        ))}

        {/* Area fill under closing prices */}
        {normalized.length > 1 && (() => {
          const pts = normalized.map((c) => `${c.x},${c.yClose}`).join(" ");
          const lastX = normalized[normalized.length - 1].x;
          const firstX = normalized[0].x;
          return (
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? GREEN : RED} stopOpacity={0.12} />
                <stop offset="100%" stopColor={isUp ? GREEN : RED} stopOpacity={0} />
              </linearGradient>
            </defs>
          );
        })()}
        {normalized.length > 1 && (() => {
          const pts = normalized.map((c) => `${c.x},${c.yClose}`).join(" L ");
          const lastX = normalized[normalized.length - 1].x;
          const firstX = normalized[0].x;
          const bottom = PAD_T + CHART_H;
          return (
            <path
              d={`M ${firstX},${bottom} L ${pts} L ${lastX},${bottom} Z`}
              fill="url(#areaGrad)"
            />
          );
        })()}

        {/* Candles */}
        {normalized.map((c, i) => (
          <g key={c.time} opacity={hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1}>
            {/* Wick */}
            <line
              x1={c.x} x2={c.x}
              y1={c.yHigh} y2={c.yLow}
              stroke={c.isGreen ? GREEN : RED}
              strokeWidth={1}
              opacity={0.7}
            />
            {/* Body */}
            <rect
              x={c.x - candleW / 2}
              y={Math.min(c.yOpen, c.yClose)}
              width={candleW}
              height={Math.max(1, Math.abs(c.yOpen - c.yClose))}
              fill={c.isGreen ? GREEN : RED}
              opacity={0.88}
              rx={0.5}
            />
          </g>
        ))}

        {/* Current price dashed line */}
        {normalized.length > 0 && (
          <>
            <line
              x1={PAD_L} x2={PAD_L + CHART_W}
              y1={priceY} y2={priceY}
              stroke={priceColor}
              strokeWidth={1}
              strokeDasharray="5 4"
              opacity={0.6}
            />
            {/* Price label on right */}
            <rect
              x={PAD_L + CHART_W + 2} y={priceY - 9}
              width={PAD_R - 4} height={15}
              fill={priceColor}
              rx={2}
              opacity={0.9}
            />
            <text
              x={PAD_L + CHART_W + (PAD_R - 4) / 2 + 2}
              y={priceY + 3}
              textAnchor="middle"
              fill="#000"
              fontSize={9}
              fontWeight="bold"
              fontFamily="IBM Plex Mono, monospace"
            >
              {formatPrice(price)}
            </text>
          </>
        )}

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line
              x1={hovered.x} x2={hovered.x}
              y1={PAD_T} y2={PAD_T + CHART_H}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={hovered.x} cy={hovered.yClose} r={3} fill={hovered.isGreen ? GREEN : RED} />
          </>
        )}
      </svg>

      {/* Encrypted PnL overlay */}
      {unrealizedPnl !== undefined && (
        <div className="absolute top-3 right-4 z-10 glass enc-glow p-3 rounded-xl flex flex-col gap-0.5 min-w-[130px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-text-2)" }}>
              Unrealized PnL
            </span>
            <span className="material-symbols-outlined icon-fill text-[12px]" style={{ color: "var(--color-green)" }}>
              shield
            </span>
          </div>
          <div
            className="pnl-blur font-display text-xl font-black"
            style={{ color: unrealizedPnl >= 0 ? "var(--color-green)" : "var(--color-red)" }}
            title="Hover to reveal — decrypted locally"
          >
            {unrealizedPnl >= 0 ? "+" : ""}${Math.abs(unrealizedPnl).toFixed(2)}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: "var(--color-text-3)" }}>
            Only you can see this
          </div>
        </div>
      )}
    </div>
  );
}
