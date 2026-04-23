/**
 * PositionTable.tsx
 *
 * Displays open positions. PnL is blurred by default (privacy UX).
 * The encrypted ciphertexts are shown to illustrate that the data on-chain is opaque.
 */

import { useState } from "react";
import { Position } from "../hooks/usePositions";

interface Props {
  positions: Position[];
  currentPrices: Record<string, number>;
  onClose: (id: string) => void;
}

type Tab = "positions" | "orders" | "history";

export default function PositionTable({ positions, currentPrices, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("positions");
  const [revealPnl, setRevealPnl] = useState<Record<string, boolean>>({});

  const openPositions = positions.filter((p) => p.status === "open" || p.status === "pending_close");
  const closedPositions = positions.filter((p) => p.status === "closed" || p.status === "liquidated");

  function toggleReveal(id: string) {
    setRevealPnl((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="glass-panel border-t border-white/10 flex flex-col" style={{ height: "260px" }}>
      {/* Tabs */}
      <div className="flex items-center px-6 h-12 border-b border-white/5 shrink-0">
        <div className="flex gap-6">
          {(["positions", "orders", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-mono font-semibold uppercase tracking-widest h-12 border-b-2 transition-all capitalize ${
                tab === t ? "text-primary border-primary-container" : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              {t}
              {t === "positions" && openPositions.length > 0 && (
                <span className="ml-1 text-[9px] bg-primary-container/20 text-primary px-1 rounded">
                  {openPositions.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Privacy badge */}
        <div className="ml-auto flex items-center gap-1 chip-encrypted px-2 py-0.5 rounded-full">
          <span className="material-symbols-outlined icon-filled text-[10px]">shield</span>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider">
            Arcium Encrypted
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto scroll-hide">
        {tab === "positions" && (
          <table className="w-full text-left text-[12px] min-w-[900px]">
            <thead className="text-zinc-500 font-mono border-b border-white/5 sticky top-0 bg-[#0e0e0e]">
              <tr>
                <th className="px-6 py-2.5">Market</th>
                <th className="px-6 py-2.5">Size</th>
                <th className="px-6 py-2.5">Entry Price</th>
                <th className="px-6 py-2.5">Mark Price</th>
                <th className="px-6 py-2.5">Liq. Price</th>
                <th className="px-6 py-2.5">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined icon-filled text-[10px] text-tertiary">shield</span>
                    PnL (Encrypted)
                  </span>
                </th>
                <th className="px-6 py-2.5">On-chain Ciphertext</th>
                <th className="px-6 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {openPositions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-zinc-600 font-mono text-xs">
                    No open positions. Connect wallet and open a position above.
                  </td>
                </tr>
              ) : (
                openPositions.map((pos) => {
                  const mark = currentPrices[pos.market] ?? pos.entryPrice;
                  const pnl = pos.unrealizedPnl;
                  const isPnlPos = pnl >= 0;
                  const isRevealed = revealPnl[pos.id];

                  return (
                    <tr
                      key={pos.id}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors animate-slide-up"
                    >
                      {/* Market + direction */}
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold font-mono ${pos.direction === "LONG" ? "text-tertiary" : "text-error"}`}>
                            {pos.market} {pos.direction}
                          </span>
                          <span className="bg-primary-container/20 text-primary px-1.5 rounded text-[10px] font-mono">
                            {pos.leverageX}×
                          </span>
                        </div>
                      </td>
                      {/* Size */}
                      <td className="px-6 py-3 font-mono text-zinc-200">
                        {pos.sizeTokens.toFixed(4)} {pos.market.split("/")[0]}
                      </td>
                      {/* Entry */}
                      <td className="px-6 py-3 font-mono">${pos.entryPrice.toFixed(2)}</td>
                      {/* Mark */}
                      <td className="px-6 py-3 font-mono">${mark.toFixed(2)}</td>
                      {/* Liq price */}
                      <td className="px-6 py-3 font-mono text-error">
                        ${pos.liqPriceApprox.toFixed(2)}
                      </td>
                      {/* PnL — encrypted reveal */}
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold ${
                              isRevealed
                                ? isPnlPos ? "text-tertiary" : "text-error"
                                : ""
                            } ${!isRevealed ? "pnl-blur text-zinc-300" : ""}`}
                            onClick={() => toggleReveal(pos.id)}
                            title="Click to reveal / hide PnL"
                          >
                            {isPnlPos ? "+" : ""}${pnl.toFixed(2)}
                          </span>
                          <button
                            onClick={() => toggleReveal(pos.id)}
                            className="text-zinc-500 hover:text-zinc-200 transition-colors"
                            title={isRevealed ? "Hide PnL" : "Reveal PnL (decrypt locally)"}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {isRevealed ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </td>
                      {/* On-chain ciphertext sample */}
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined icon-filled text-[10px] text-tertiary">shield</span>
                          <span className="text-[10px] text-zinc-600 font-mono">
                            {pos.ct_entry_price}
                          </span>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-3 text-right">
                        {pos.status === "pending_close" ? (
                          <span className="text-[10px] text-primary font-mono animate-pulse">Closing...</span>
                        ) : (
                          <button
                            onClick={() => onClose(pos.id)}
                            className="px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded border border-error/30 text-error hover:bg-error/10 transition-all"
                          >
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {tab === "history" && (
          <table className="w-full text-left text-[12px] min-w-[700px]">
            <thead className="text-zinc-500 font-mono border-b border-white/5 sticky top-0 bg-[#0e0e0e]">
              <tr>
                <th className="px-6 py-2.5">Market</th>
                <th className="px-6 py-2.5">Direction</th>
                <th className="px-6 py-2.5">Status</th>
                <th className="px-6 py-2.5">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined icon-filled text-[10px] text-tertiary">shield</span>
                    Realized PnL
                  </span>
                </th>
                <th className="px-6 py-2.5">Opened</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              {closedPositions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-600 font-mono text-xs">
                    No closed positions yet.
                  </td>
                </tr>
              ) : (
                closedPositions.map((pos) => (
                  <tr key={pos.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-mono">{pos.market}</td>
                    <td className="px-6 py-3">
                      <span className={`font-mono font-bold ${pos.direction === "LONG" ? "text-tertiary" : "text-error"}`}>
                        {pos.direction} {pos.leverageX}×
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`chip-encrypted px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase`}>
                        {pos.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono font-bold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined icon-filled text-[10px] text-tertiary">lock</span>
                        <span className="pnl-blur text-zinc-300" title="Click to reveal">
                          ${pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono text-zinc-500 text-[10px]">
                      {new Date(pos.openedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "orders" && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 font-mono text-xs">No open orders.</p>
          </div>
        )}
      </div>
    </div>
  );
}
