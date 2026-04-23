/**
 * PositionTable.tsx
 * Positions / Orders / History tabs.
 * PnL is blurred by default — privacy UX.
 * On-chain ciphertexts shown to illustrate that positions are opaque.
 */

import { useState } from "react";
import type { Position } from "../hooks/usePositions";

interface Props {
  positions: Position[];
  currentPrices: Record<string, number>;
  onClose: (id: string, exitPrice: number) => void;
}

type Tab = "positions" | "orders" | "history";

export default function PositionTable({ positions, currentPrices, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("positions");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const open = positions.filter((p) => p.status === "open" || p.status === "pending_close");
  const closed = positions.filter((p) => p.status === "closed" || p.status === "liquidated");

  const C = {
    border: "var(--color-border)",
    text2: "var(--color-text-2)",
    text3: "var(--color-text-3)",
    green: "var(--color-green)",
    red: "var(--color-red)",
  };

  return (
    <div
      className="glass border-t flex flex-col shrink-0"
      style={{ height: 240, borderColor: C.border }}
    >
      {/* Tabs */}
      <div className="flex items-center px-5 border-b shrink-0" style={{ borderColor: C.border, height: 44 }}>
        <div className="flex gap-5">
          {(["positions", "orders", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="font-mono text-[10px] font-bold uppercase tracking-widest border-b-2 h-11 capitalize transition-all"
              style={{
                borderBottomColor: tab === t ? C.green : "transparent",
                color: tab === t ? "white" : C.text3,
              }}
            >
              {t}
              {t === "positions" && open.length > 0 && (
                <span
                  className="ml-1.5 px-1 py-px rounded text-[8px]"
                  style={{ background: "rgba(34,211,165,0.12)", color: C.green }}
                >
                  {open.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1 chip-green px-2 py-0.5 rounded-full">
          <span className="material-symbols-outlined icon-fill text-[10px]">shield</span>
          <span className="font-mono text-[8px] font-bold uppercase tracking-wider">Arcium Encrypted</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto scroll-hide">
        {tab === "positions" && (
          <table className="w-full text-left text-[11px] min-w-[900px]">
            <thead className="font-mono sticky top-0" style={{ background: "var(--color-surface)", color: C.text3 }}>
              <tr>
                {["Market","Size","Entry","Mark","Liq. Price","PnL (Encrypted)","Ciphertext","Actions"].map((h) => (
                  <th key={h} className="px-5 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center font-mono" style={{ color: C.text3 }}>
                    No open positions. Connect wallet and open a position above.
                  </td>
                </tr>
              ) : (
                open.map((pos) => {
                  const mark = currentPrices[pos.market] ?? pos.entryPrice;
                  const pnl = pos.unrealizedPnl;
                  const isRev = revealed[pos.id];

                  return (
                    <tr
                      key={pos.id}
                      className="tr-hover border-b animate-slide-up"
                      style={{ borderColor: "rgba(255,255,255,0.04)" }}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono font-bold"
                            style={{ color: pos.direction === "LONG" ? C.green : C.red }}
                          >
                            {pos.market} {pos.direction}
                          </span>
                          <span
                            className="px-1.5 rounded font-mono text-[9px]"
                            style={{ background: "rgba(96,165,250,0.1)", color: "var(--color-blue)" }}
                          >
                            {pos.leverageX}×
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 font-mono" style={{ color: "var(--color-text)" }}>
                        {pos.sizeTokens.toFixed(4)} {pos.market.split("/")[0]}
                      </td>
                      <td className="px-5 py-2.5 font-mono">${pos.entryPrice.toFixed(2)}</td>
                      <td className="px-5 py-2.5 font-mono">${mark.toFixed(2)}</td>
                      <td className="px-5 py-2.5 font-mono" style={{ color: C.red }}>
                        ${pos.liqPriceDecrypted.toFixed(2)}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold ${!isRev ? "pnl-blur" : ""}`}
                            style={{ color: isRev ? (pnl >= 0 ? C.green : C.red) : "var(--color-text)" }}
                            onClick={() => setRevealed((p) => ({ ...p, [pos.id]: !p[pos.id] }))}
                          >
                            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                          </span>
                          <button
                            onClick={() => setRevealed((p) => ({ ...p, [pos.id]: !p[pos.id] }))}
                            style={{ color: C.text3 }}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {isRev ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined icon-fill text-[10px]" style={{ color: C.green }}>shield</span>
                          <span className="font-mono text-[9px]" style={{ color: C.text3 }}>{pos.ct_entry_price}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {pos.status === "pending_close" ? (
                          <span className="font-mono text-[9px] animate-pulse" style={{ color: C.text2 }}>Closing…</span>
                        ) : (
                          <button
                            onClick={() => onClose(pos.id, mark)}
                            className="px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider rounded border transition-all"
                            style={{
                              border: `1px solid rgba(248,113,113,0.3)`,
                              color: C.red,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.1)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
          <table className="w-full text-left text-[11px] min-w-[600px]">
            <thead className="font-mono sticky top-0" style={{ background: "var(--color-surface)", color: C.text3 }}>
              <tr>
                {["Market","Direction","Status","Realized PnL","Opened"].map((h) => (
                  <th key={h} className="px-5 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {closed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center font-mono" style={{ color: C.text3 }}>
                    No closed positions yet.
                  </td>
                </tr>
              ) : (
                closed.map((pos) => (
                  <tr key={pos.id} className="tr-hover border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    <td className="px-5 py-2.5 font-mono">{pos.market}</td>
                    <td className="px-5 py-2.5">
                      <span className="font-mono font-bold" style={{ color: pos.direction === "LONG" ? C.green : C.red }}>
                        {pos.direction} {pos.leverageX}×
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="chip-green px-2 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase">
                        {pos.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined icon-fill text-[10px]" style={{ color: C.green }}>lock</span>
                        <span className="pnl-blur font-mono font-bold" style={{ color: "var(--color-text)" }}>
                          ${pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[9px]" style={{ color: C.text3 }}>
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
            <p className="font-mono text-[11px]" style={{ color: C.text3 }}>No open orders.</p>
          </div>
        )}
      </div>
    </div>
  );
}
