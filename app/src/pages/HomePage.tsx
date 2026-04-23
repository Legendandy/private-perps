/**
 * HomePage.tsx — Landing page with live market preview cards.
 * Market prices come from the Binance WebSocket via useMarketData.
 */

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Layout from "../components/Layout";
import { useMarketData } from "../hooks/useMarketData";
import { MARKETS } from "../lib/constants";
import type { AppPage } from "../App";

interface Props {
  onLaunchApp: () => void;
  onSelectMarket: (symbol: string) => void;
}

const PRIVACY_FEATURES = [
  {
    icon: "lock",
    title: "Encrypted Positions",
    desc: "Size, entry price, and leverage are encrypted with x25519 + RescueCipher before touching the blockchain.",
    color: "var(--color-green)",
  },
  {
    icon: "shield",
    title: "Private Liquidations",
    desc: "Liquidation thresholds computed inside Arcium MPC. Keepers only learn a boolean — not your prices.",
    color: "var(--color-blue)",
  },
  {
    icon: "visibility_off",
    title: "Confidential PnL",
    desc: "PnL calculated entirely in MPC and returned encrypted. Only you — with your private key — can decrypt.",
    color: "var(--color-purple)",
  },
  {
    icon: "group_off",
    title: "Anti Copy-Trading",
    desc: "Zero plaintext position data on-chain. Bots cannot shadow your trades.",
    color: "var(--color-green)",
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Encrypt Inputs", desc: "Browser generates ephemeral x25519 keypair. Position data encrypted with shared secret before leaving your device." },
  { step: "02", title: "Submit to Solana", desc: "Encrypted blobs stored on-chain. Anchor program queues computation to Arcium MPC network." },
  { step: "03", title: "MPC Computes", desc: "Arcium threshold MPC nodes execute the circuit on encrypted data. No node sees plaintext." },
  { step: "04", title: "Decrypt Locally", desc: "Encrypted result emitted in a Solana event. Your browser decrypts it with your private key only." },
];

export default function HomePage({ onLaunchApp, onSelectMarket }: Props) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { markets, wsConnected } = useMarketData();

  function handleCTA() {
    if (!connected) { setVisible(true); } else { onLaunchApp(); }
  }

  function formatPrice(p: number, sym: string): string {
    if (p >= 10000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (p >= 1) return `$${p.toFixed(2)}`;
    return `$${p.toFixed(4)}`;
  }

  return (
    <div className="min-h-screen font-body" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <Layout activePage="home" onNavigate={(p) => p === "trade" && onLaunchApp()} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 pt-14 hero-bg">
        <div className="max-w-[1100px] w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center z-10">
          {/* Left */}
          <div className="space-y-7">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: "rgba(34,211,165,0.08)", border: "1px solid rgba(34,211,165,0.2)" }}
            >
              <span className="material-symbols-outlined icon-fill text-[13px]" style={{ color: "var(--color-green)" }}>security</span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-green)" }}>
                Encrypted Perpetual Trading
              </span>
            </div>

            <h1 className="font-display text-[60px] leading-[0.95] font-black text-white tracking-tight">
              Trade Perps.<br />
              <span className="grad-text">Stay Invisible.</span>
            </h1>

            <p className="text-base leading-relaxed max-w-md" style={{ color: "var(--color-text-2)" }}>
              Fully private perpetual futures powered by{" "}
              <span style={{ color: "var(--color-green)" }} className="font-semibold">Arcium MPC</span>.
              Execute institutional strategies without revealing your position.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleCTA}
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold transition-all"
                style={{
                  background: "rgba(167,139,250,0.2)",
                  border: "1px solid rgba(167,139,250,0.35)",
                  color: "#A78BFA",
                  boxShadow: "0 0 20px rgba(167,139,250,0.2)",
                }}
              >
                {connected ? "Launch App" : "Connect Wallet"}
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
              <a
                href="https://docs.arcium.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold transition-all glass"
                style={{ color: "var(--color-text-2)" }}
              >
                Arcium Docs
              </a>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 pt-2">
              {[
                { l: "Positions Encrypted", v: "100%" },
                { l: "Plaintext On-chain",  v: "0 bytes" },
                { l: "MPC Threshold",       v: "2-of-3" },
              ].map((m) => (
                <div key={m.l}>
                  <div className="font-display text-2xl font-black text-white">{m.v}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — showcase card */}
          <div className="relative hidden lg:block">
            <div
              className="glass enc-glow rounded-2xl p-5 rotate-1 relative z-20"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(167,139,250,0.2)" }}>
                    <span className="material-symbols-outlined text-[18px]" style={{ color: "#A78BFA" }}>token</span>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-white">SOL/USDC-PERP</div>
                    <div className="font-mono text-[9px] flex items-center gap-1" style={{ color: "var(--color-green)" }}>
                      <span className="material-symbols-outlined icon-fill text-[10px]">shield</span>
                      ENCRYPTED ORDER
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-sm font-black text-white">
                    {formatPrice(markets["SOL/USDC"]?.price ?? 140, "SOL/USDC")}
                  </div>
                  <div
                    className="font-mono text-[10px]"
                    style={{ color: (markets["SOL/USDC"]?.change ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)" }}
                  >
                    {(markets["SOL/USDC"]?.change ?? 0) >= 0 ? "+" : ""}
                    {(markets["SOL/USDC"]?.change ?? 0).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {[
                  { label: "Size (encrypted)",     ct: "0x7f3a2c1b4e…" },
                  { label: "Entry (encrypted)",    ct: "0xa8f1094de2…" },
                  { label: "Leverage (encrypted)", ct: "0x3c91ba4f00…" },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="flex justify-between items-center p-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>{f.label}</span>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined icon-fill text-[9px]" style={{ color: "var(--color-green)" }}>lock</span>
                      <span className="font-mono text-[9px]" style={{ color: "var(--color-text-3)" }}>{f.ct}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Leverage", v: "10× Private" },
                  { l: "Privacy",  v: "100%" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="p-2.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div className="font-mono text-[8px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-text-3)" }}>{s.l}</div>
                    <div className="font-mono text-sm font-bold" style={{ color: s.l === "Privacy" ? "var(--color-green)" : "white" }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Glow orbs */}
            <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full pointer-events-none" style={{ background: "rgba(167,139,250,0.12)", filter: "blur(60px)" }} />
            <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full pointer-events-none" style={{ background: "rgba(34,211,165,0.08)", filter: "blur(60px)" }} />
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
              style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}
            >
              <span className="material-symbols-outlined icon-fill text-[12px]" style={{ color: "var(--color-blue)" }}>memory</span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-blue)" }}>Powered by Arcium MPC</span>
            </div>
            <h2 className="font-display text-4xl font-black text-white mb-3">How Privacy Works</h2>
            <p className="max-w-lg mx-auto" style={{ color: "var(--color-text-2)" }}>
              Every sensitive operation flows through Arcium's decentralized MPC network.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div
                key={step.step}
                className="glass p-5 rounded-xl transition-all hover:border-opacity-40"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <div className="font-display text-4xl font-black mb-3" style={{ color: "rgba(167,139,250,0.2)" }}>{step.step}</div>
                <h3 className="font-display text-base font-black text-white mb-2">{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-2)" }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Markets Preview ──────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="flex justify-between items-center mb-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-3xl font-black text-white">Markets</h2>
                {wsConnected && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md chip-green">
                    <span className="live-dot" style={{ width: 5, height: 5, animation: 'live-ping 1.6s ease-out infinite' }} />
                    <span className="font-mono text-[8px] font-bold uppercase">Live</span>
                  </div>
                )}
              </div>
              <p className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--color-text-3)" }}>
                Prices via Binance WebSocket
              </p>
            </div>
            <button
              onClick={onLaunchApp}
              className="font-mono text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 transition-all"
              style={{ color: "var(--color-green)" }}
            >
              View all
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MARKETS.slice(0, 6).map((m) => {
              const live = markets[m.symbol];
              const isUp = (live?.change ?? 0) >= 0;
              return (
                <button
                  key={m.symbol}
                  onClick={() => onSelectMarket(m.symbol)}
                  className="glass p-4 rounded-xl text-left transition-all group"
                  style={{ border: "1px solid var(--color-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(34,211,165,0.2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(167,139,250,0.1)" }}
                      >
                        <span className="material-symbols-outlined text-[16px]" style={{ color: "#A78BFA" }}>{m.icon}</span>
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-white">{m.symbol}</div>
                        <div className="font-mono text-[9px]" style={{ color: "var(--color-text-3)" }}>{m.label}</div>
                      </div>
                    </div>
                    <div className="chip-green px-2 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase flex items-center gap-0.5">
                      <span className="material-symbols-outlined icon-fill text-[9px]">shield</span>
                      Private
                    </div>
                  </div>

                  <div className="font-display text-xl font-black text-white mb-0.5">
                    {formatPrice(live?.price ?? m.seedPrice, m.symbol)}
                  </div>
                  <div className="font-mono text-xs" style={{ color: isUp ? "var(--color-green)" : "var(--color-red)" }}>
                    {isUp ? "+" : ""}{(live?.change ?? 0).toFixed(2)}%
                  </div>

                  <div
                    className="mt-3 pt-3 flex justify-between"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <div>
                      <div className="font-mono text-[8px] uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>Volume</div>
                      <div className="font-mono text-xs" style={{ color: "var(--color-text)" }}>{live?.volume24h ?? "—"}</div>
                    </div>
                    <div>
                      <div className="font-mono text-[8px] uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>Funding</div>
                      <div className="font-mono text-xs" style={{ color: "var(--color-text)" }}>{(live?.fundingRate ?? 0.0082).toFixed(4)}%</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Privacy Features ─────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ borderTop: "1px solid var(--color-border)", background: "rgba(0,0,0,0.2)" }}>
        <div className="max-w-[1100px] mx-auto">
          <h2 className="font-display text-3xl font-black text-white text-center mb-12">Privacy Guarantees</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRIVACY_FEATURES.map((f) => (
              <div
                key={f.title}
                className="glass p-7 rounded-xl transition-all"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <span className="material-symbols-outlined icon-fill text-[20px]" style={{ color: f.color }}>{f.icon}</span>
                </div>
                <h3 className="font-display text-base font-black text-white mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-2)" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 relative overflow-hidden hero-bg" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="max-w-[700px] mx-auto text-center relative z-10">
          <h2 className="font-display text-[48px] font-black text-white mb-5 leading-tight">
            Trade Without<br />
            <span className="grad-text">Fear of Exposure</span>
          </h2>
          <p className="mb-10 text-lg" style={{ color: "var(--color-text-2)" }}>
            Your positions, your secrets. Powered by Arcium MPC.
          </p>
          <button
            onClick={handleCTA}
            className="font-bold text-base px-12 py-4 rounded-xl transition-all"
            style={{
              background: "rgba(167,139,250,0.2)",
              border: "1px solid rgba(167,139,250,0.35)",
              color: "#A78BFA",
              boxShadow: "0 0 30px rgba(167,139,250,0.2)",
            }}
          >
            {connected ? "Open Trading Terminal" : "Connect Wallet to Start"}
          </button>
        </div>
      </section>
    </div>
  );
}
