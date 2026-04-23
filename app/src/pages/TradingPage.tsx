/**
 * TradingPage.tsx — Full trading terminal
 * Layout: [MarketList | Chart + Positions | TradingPanel]
 * Live data from Binance WebSocket. Real Arcium MPC on position open/close.
 */

import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import MarketList from "../components/MarketList";
import TradingPanel from "../components/TradingPanel";
import PositionTable from "../components/PositionTable";
import PriceChart from "../components/PriceChart";
import { usePositions } from "../hooks/usePositions";
import { useMarketData } from "../hooks/useMarketData";
import type { AppPage } from "../App";

interface Props {
  market: string;
  onNavigate: (p: AppPage) => void;
  onMarketChange: (m: string) => void;
}

export default function TradingPage({ market: initialMarket, onNavigate, onMarketChange }: Props) {
  const [selectedMarket, setSelectedMarket] = useState(initialMarket);

  const { markets, wsConnected, getCandles } = useMarketData();
  const { positions, computationStatus, lastTxSig, openPosition, closePosition, updatePnl } = usePositions();

  const active = markets[selectedMarket];
  const candles = getCandles(selectedMarket);
  const prices = Object.fromEntries(Object.entries(markets).map(([s, m]) => [s, m.price]));

  useEffect(() => {
    updatePnl(prices);
  }, [JSON.stringify(prices)]);

  const openPositions = positions.filter((p) => p.status === "open");
  const totalPnl = openPositions.reduce((s, p) => s + p.unrealizedPnl, 0);

  const C = {
    border: "var(--color-border)",
    text2: "var(--color-text-2)",
    text3: "var(--color-text-3)",
    green: "var(--color-green)",
    red: "var(--color-red)",
  };

  function handleSelect(sym: string) {
    setSelectedMarket(sym);
    onMarketChange(sym);
  }

  function formatPrice(p: number): string {
    if (!p) return "—";
    if (p >= 10000) return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(2)}`;
    return `$${p.toFixed(4)}`;
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden font-body"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Layout activePage="trade" onNavigate={onNavigate} />

      <main
        className="mt-14 flex-1 flex overflow-hidden"
        style={{ gap: "1px", background: "var(--color-border)" }}
      >
        {/* Left: market list */}
        <MarketList
          markets={markets}
          selected={selectedMarket}
          onSelect={handleSelect}
          wsConnected={wsConnected}
        />

        {/* Center: chart + positions */}
        <section
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
          style={{ background: "var(--color-surface)" }}
        >
          {/* Market header bar */}
          <div
            className="h-14 flex items-center justify-between px-5 shrink-0 border-b"
            style={{ borderColor: C.border }}
          >
            <div className="flex items-center gap-6">
              {/* Symbol + price */}
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: C.text3 }}>
                  {selectedMarket}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-black text-white">
                    {formatPrice(active?.price ?? 0)}
                  </span>
                  {active && (
                    <span
                      className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        color: active.change >= 0 ? C.green : C.red,
                        background: active.change >= 0 ? "rgba(34,211,165,0.1)" : "rgba(248,113,113,0.1)",
                      }}
                    >
                      {active.change >= 0 ? "+" : ""}{active.change.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              {active && (
                <div className="hidden xl:flex items-center gap-5">
                  {[
                    { l: "24h High", v: formatPrice(active.high24h) },
                    { l: "24h Low",  v: formatPrice(active.low24h)  },
                    { l: "Volume",   v: active.volume24h             },
                    { l: "Funding",  v: `${active.fundingRate.toFixed(4)}%/hr` },
                  ].map((s) => (
                    <div key={s.l}>
                      <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: C.text3 }}>{s.l}</div>
                      <div className="font-mono text-[11px]" style={{ color: "var(--color-text)" }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side: active positions badge */}
            <div className="flex items-center gap-3">
              {openPositions.length > 0 && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(34,211,165,0.08)", border: "1px solid rgba(34,211,165,0.2)" }}
                >
                  <span className="material-symbols-outlined icon-fill text-[13px]" style={{ color: C.green }}>shield</span>
                  <span className="font-mono text-[10px]">
                    <span style={{ color: C.green }} className="font-bold">{openPositions.length}</span>
                    <span style={{ color: C.text2 }}> active</span>
                  </span>
                </div>
              )}

              {/* WS connection */}
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                style={{
                  background: wsConnected ? "rgba(34,211,165,0.05)" : "rgba(245,158,11,0.05)",
                  border: `1px solid ${wsConnected ? "rgba(34,211,165,0.15)" : "rgba(245,158,11,0.15)"}`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: wsConnected ? C.green : "#F59E0B",
                    boxShadow: wsConnected ? `0 0 5px ${C.green}` : "0 0 5px #F59E0B",
                  }}
                />
                <span
                  className="font-mono text-[8px] uppercase font-bold"
                  style={{ color: wsConnected ? C.green : "#F59E0B" }}
                >
                  {wsConnected ? "Binance Live" : "Connecting…"}
                </span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <PriceChart
            symbol={selectedMarket}
            price={active?.price ?? 0}
            change={active?.change ?? 0}
            candles={candles}
            unrealizedPnl={openPositions.length > 0 ? totalPnl : undefined}
            isLive={wsConnected && (active?.isLive ?? false)}
          />

          {/* Positions table */}
          <PositionTable
            positions={positions}
            currentPrices={prices}
            onClose={closePosition}
          />
        </section>

        {/* Right: order panel */}
        <aside
          className="w-72 flex flex-col h-full shrink-0"
          style={{ background: "var(--color-surface-2)", borderLeft: "1px solid var(--color-border)" }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between shrink-0"
            style={{ borderColor: C.border }}
          >
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-white">
              Place Order
            </span>
            <div className="chip-green px-2 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase flex items-center gap-1">
              <span className="material-symbols-outlined icon-fill text-[9px]">shield</span>
              MPC Encrypted
            </div>
          </div>

          <TradingPanel
            market={selectedMarket}
            currentPrice={active?.price ?? 0}
            computationStatus={computationStatus}
            lastTxSig={lastTxSig}
            onOpenPosition={openPosition}
          />
        </aside>
      </main>
    </div>
  );
}
