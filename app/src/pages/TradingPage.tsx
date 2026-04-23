/**
 * TradingPage.tsx — Full trading terminal
 *
 * Layout: [MarketList | Chart + Positions | TradingPanel]
 * Matches the Arcium Sentinel design from the uploaded UI screens.
 */

import { useEffect } from "react";
import Layout from "../components/Layout";
import MarketList from "../components/MarketList";
import TradingPanel from "../components/TradingPanel";
import PositionTable from "../components/PositionTable";
import PriceChart from "../components/PriceChart";
import { usePositions } from "../hooks/usePositions";
import { useMarketData } from "../hooks/useMarketData";
import { MARKETS } from "../lib/constants";
import type { AppPage } from "../App";

interface Props {
  market: string;
  onNavigate: (p: AppPage) => void;
}

export default function TradingPage({ market: initialMarket, onNavigate }: Props) {
  // We use a local selected market state to allow in-page switching
  const [selectedMarket, setSelectedMarket] = [
    initialMarket,
    (_m: string) => onNavigate("home"), // simplified — in production, update parent state
  ];

  const { markets, generateCandles } = useMarketData();
  const {
    positions,
    computationStatus,
    lastTxSig,
    openPosition,
    closePosition,
    updatePnl,
  } = usePositions();

  const activeMarket = markets[selectedMarket] ?? MARKETS[0];
  const candles = generateCandles(selectedMarket);
  const prices = Object.fromEntries(
    Object.entries(markets).map(([sym, m]) => [sym, m.price])
  );

  // Update PnL every time prices change
  useEffect(() => {
    updatePnl(prices);
  }, [JSON.stringify(prices)]);

  const totalUnrealizedPnl = positions
    .filter((p) => p.status === "open")
    .reduce((sum, p) => sum + p.unrealizedPnl, 0);

  return (
    <div className="bg-background text-on-surface font-sans antialiased h-screen flex flex-col overflow-hidden">
      <Layout activePage="trade" onNavigate={onNavigate} />

      {/* ── Main terminal layout ─────────────────────────────────────────── */}
      <main className="mt-16 flex-1 flex overflow-hidden max-w-[1800px] mx-auto w-full gap-px bg-white/[0.03]">

        {/* Left: Market list */}
        <MarketList
          markets={markets}
          selected={selectedMarket}
          onSelect={(sym) => onNavigate("home")} // simplified navigation
        />

        {/* Center: Chart + positions */}
        <section className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">

          {/* Market header bar */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-8">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider">
                  {selectedMarket}
                </div>
                <div className="text-xl font-bold text-white flex items-center gap-2 font-mono">
                  ${activeMarket.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className={`text-xs font-normal px-2 rounded-full font-mono ${
                    activeMarket.change >= 0
                      ? "text-tertiary bg-tertiary/10"
                      : "text-error bg-error/10"
                  }`}>
                    {activeMarket.change >= 0 ? "+" : ""}{activeMarket.change.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="hidden xl:flex gap-6">
                {[
                  { label: "24h High", value: `$${activeMarket.high24h.toFixed(2)}` },
                  { label: "24h Low", value: `$${activeMarket.low24h.toFixed(2)}` },
                  { label: "Volume", value: activeMarket.volume24h },
                  { label: "Open Int.", value: activeMarket.openInterest },
                  { label: "Funding", value: `${activeMarket.fundingRate.toFixed(4)}%/hr` },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="text-[9px] text-zinc-500 uppercase font-mono tracking-widest">{m.label}</div>
                    <div className="text-sm font-mono text-zinc-200">{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Reveal mode */}
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs font-mono">
                <span className="material-symbols-outlined text-sm">visibility</span>
                Reveal Mode
              </button>

              {/* Risk shield */}
              {positions.some((p) => p.status === "open") && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-tertiary/10 border border-tertiary/20">
                  <span className="material-symbols-outlined icon-filled text-sm text-tertiary">shield</span>
                  <div className="text-xs font-mono">
                    <span className="text-tertiary font-bold">
                      {positions.filter((p) => p.status === "open").length} Active
                    </span>
                    <span className="text-zinc-500 ml-1">positions</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          <PriceChart
            symbol={selectedMarket}
            price={activeMarket.price}
            change={activeMarket.change}
            candles={candles}
            unrealizedPnl={positions.some((p) => p.status === "open") ? totalUnrealizedPnl : undefined}
          />

          {/* Positions table */}
          <PositionTable
            positions={positions}
            currentPrices={prices}
            onClose={closePosition}
          />
        </section>

        {/* Right: Order entry panel */}
        <aside className="w-80 glass-panel flex flex-col h-full shrink-0">
          {/* Panel header */}
          <div className="p-4 border-b border-white/5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white uppercase tracking-wide">
                Place Order
              </span>
              <div className="chip-encrypted px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase flex items-center gap-1">
                <span className="material-symbols-outlined icon-filled text-[10px]">shield</span>
                MPC Encrypted
              </div>
            </div>
          </div>

          <TradingPanel
            market={selectedMarket}
            currentPrice={activeMarket.price}
            computationStatus={computationStatus}
            lastTxSig={lastTxSig}
            onOpenPosition={openPosition}
          />
        </aside>
      </main>
    </div>
  );
}
