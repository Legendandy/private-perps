/**
 * MarketList.tsx
 * Left panel — live market ticker list driven by Binance WebSocket data.
 */

import { useState } from "react";
import type { MarketTick } from "../hooks/useMarketData";
import { MARKETS } from "../lib/constants";

interface Props {
  markets: Record<string, MarketTick>;
  selected: string;
  onSelect: (symbol: string) => void;
  wsConnected: boolean;
}

export default function MarketList({ markets, selected, onSelect, wsConnected }: Props) {
  const [search, setSearch] = useState("");

  const filtered = MARKETS.filter(
    (m) =>
      search === "" ||
      m.symbol.toLowerCase().includes(search.toLowerCase()) ||
      m.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside
      className="w-64 flex flex-col h-full shrink-0 glass border-r"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className="font-mono text-[10px] uppercase tracking-widest font-bold"
            style={{ color: "var(--color-text-2)" }}
          >
            Markets
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: wsConnected ? "var(--color-green)" : "#F59E0B",
                boxShadow: wsConnected ? "0 0 6px var(--color-green)" : "0 0 6px #F59E0B",
              }}
            />
            <span
              className="font-mono text-[9px] uppercase"
              style={{ color: wsConnected ? "var(--color-green)" : "#F59E0B" }}
            >
              {wsConnected ? "Live" : "Connecting"}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <span
            className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px]"
            style={{ color: "var(--color-text-3)" }}
          >
            search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none font-mono"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scroll-hide py-2">
        {filtered.map((m) => {
          const live = markets[m.symbol] ?? { price: m.seedPrice, change: 0 };
          const isSelected = selected === m.symbol;
          const isUp = live.change >= 0;

          return (
            <button
              key={m.symbol}
              onClick={() => onSelect(m.symbol)}
              className="w-full flex items-center justify-between px-4 py-2.5 transition-all text-left relative"
              style={{
                background: isSelected ? "rgba(34,211,165,0.06)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--color-green)" : "2px solid transparent",
              }}
            >
              {/* Icon + name */}
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="material-symbols-outlined text-[18px] shrink-0"
                  style={{ color: isSelected ? "var(--color-green)" : "var(--color-text-3)" }}
                >
                  {m.icon}
                </span>
                <div className="min-w-0">
                  <div
                    className="font-mono text-[11px] font-bold truncate"
                    style={{ color: isSelected ? "white" : "var(--color-text)" }}
                  >
                    {m.symbol}
                  </div>
                  <div className="font-mono text-[9px] truncate" style={{ color: "var(--color-text-3)" }}>
                    {m.label}
                  </div>
                </div>
              </div>

              {/* Price + change */}
              <div className="text-right shrink-0 ml-2">
                <div
                  className="font-mono text-[11px] font-bold"
                  style={{ color: isSelected ? "white" : "var(--color-text)" }}
                >
                  {live.price >= 1000
                    ? `$${(live.price / 1000).toFixed(1)}K`
                    : live.price >= 1
                    ? `$${live.price.toFixed(2)}`
                    : `$${live.price.toFixed(4)}`}
                </div>
                <div
                  className="font-mono text-[9px]"
                  style={{ color: isUp ? "var(--color-green)" : "var(--color-red)" }}
                >
                  {isUp ? "+" : ""}{live.change.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Arcium footer */}
      <div
        className="p-4 border-t"
        style={{ borderColor: "var(--color-border)", background: "rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="material-symbols-outlined icon-fill text-[13px]"
            style={{ color: "var(--color-green)" }}
          >
            verified_user
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-widest font-bold"
            style={{ color: "var(--color-text-2)" }}
          >
            Arcium MPC Active
          </span>
        </div>
        <div
          className="h-1 w-full rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "100%", background: "var(--color-green)", opacity: 0.5 }}
          />
        </div>
        <p
          className="font-mono text-[8px] mt-1.5 uppercase tracking-widest leading-tight"
          style={{ color: "var(--color-text-3)" }}
        >
          Positions encrypted · Zero plaintext on-chain
        </p>
      </div>
    </aside>
  );
}
