/**
 * HomePage.tsx — Stealth Perps landing page
 * Follows the Arcium Sentinel design system exactly.
 */

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Layout from "../components/Layout";
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
    desc: "Your position size, entry price, and leverage are encrypted with x25519 + RescueCipher before ever touching the blockchain. No on-chain observer can read your strategy.",
    color: "text-primary",
  },
  {
    icon: "shield",
    title: "Private Liquidations",
    desc: "Liquidation thresholds are computed inside Arcium's MPC network. Keepers only learn a boolean result — not your exact prices. Front-running liquidations becomes impossible.",
    color: "text-tertiary",
  },
  {
    icon: "visibility_off",
    title: "Confidential PnL",
    desc: "Realized PnL is calculated entirely in MPC and returned encrypted. Only you — holding your ephemeral private key — can decrypt your final profit or loss.",
    color: "text-secondary",
  },
  {
    icon: "group_off",
    title: "Anti Copy-Trading",
    desc: "Without plaintext position data on-chain, bots cannot shadow your trades. Institutional strategies stay institutional.",
    color: "text-primary",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Encrypt Inputs",
    desc: "Your browser generates an ephemeral x25519 keypair. Position data is encrypted with the shared secret before leaving your device.",
  },
  {
    step: "02",
    title: "Submit to Solana",
    desc: "Encrypted blobs are stored on-chain. The Anchor program queues a computation to Arcium's MPC network.",
  },
  {
    step: "03",
    title: "MPC Computes",
    desc: "Arcium's threshold MPC nodes execute the liquidation / PnL circuit on encrypted data. No node sees plaintext.",
  },
  {
    step: "04",
    title: "Decrypt Locally",
    desc: "The encrypted result is emitted in a Solana event. Your browser decrypts it with your private key. Only you see the number.",
  },
];

export default function HomePage({ onLaunchApp, onSelectMarket }: Props) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  function handleCTA() {
    if (!connected) {
      setVisible(true);
    } else {
      onLaunchApp();
    }
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-sans antialiased overflow-x-hidden">
      <Layout activePage="home" onNavigate={(p) => p === "trade" && onLaunchApp()} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-8 pt-16">
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-0 hero-gradient-2" />

        <div className="max-w-[1200px] w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center z-10">
          {/* Left */}
          <div className="space-y-8 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 glass-panel rounded-full border border-tertiary/20">
              <span className="material-symbols-outlined icon-filled text-tertiary text-sm">security</span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-tertiary">
                Encrypted Perpetual Trading
              </span>
            </div>

            <h1 className="text-[64px] leading-[1] font-black text-white tracking-tight">
              Trade Perps.<br />
              <span className="gradient-text">Stay Invisible.</span>
            </h1>

            <p className="text-body-lg text-zinc-400 max-w-lg">
              Fully private perpetual futures powered by{" "}
              <span className="text-primary font-semibold">Arcium MPC</span>.
              Execute complex institutional strategies without revealing your position to the market.
            </p>

            <div className="flex flex-wrap gap-4 pt-4">
              <button
                onClick={handleCTA}
                className="bg-primary-container text-white px-8 py-4 rounded-xl font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 shadow-lg shadow-primary-container/30 purple-glow"
              >
                {connected ? "Launch App" : "Connect Wallet"}
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
              <a
                href="https://docs.arcium.com"
                target="_blank"
                rel="noreferrer"
                className="glass-panel text-white px-8 py-4 rounded-xl font-bold hover:bg-white/10 active:scale-[0.98] transition-all"
              >
                View Arcium Docs
              </a>
            </div>

            {/* Trust metrics */}
            <div className="flex flex-wrap gap-8 pt-2">
              {[
                { label: "Positions Encrypted", value: "100%" },
                { label: "Plaintext On-chain", value: "0 bytes" },
                { label: "MPC Threshold", value: "2-of-3" },
              ].map((m) => (
                <div key={m.label}>
                  <div className="text-2xl font-black text-white font-mono">{m.value}</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-mono">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — animated card */}
          <div className="relative hidden lg:block">
            <div className="glass-panel encryption-glow rounded-2xl p-6 border border-white/10 transform rotate-1 relative z-20">
              {/* Card header */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-white">token</span>
                  </div>
                  <div>
                    <div className="text-white font-bold font-mono">SOL/USDC-PERP</div>
                    <div className="text-tertiary text-xs font-mono flex items-center gap-1">
                      <span className="material-symbols-outlined icon-filled text-[12px]">shield</span>
                      ENCRYPTED ORDER
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold font-mono">$142.18</div>
                  <div className="text-tertiary text-xs font-mono">+5.11%</div>
                </div>
              </div>

              {/* Encrypted fields display */}
              <div className="space-y-3 mb-4">
                {[
                  { label: "Size (encrypted)", ct: "0x7f3a2c1b4e..." },
                  { label: "Entry (encrypted)", ct: "0xa8f1094de2..." },
                  { label: "Leverage (encrypted)", ct: "0x3c91ba4f00..." },
                ].map((f) => (
                  <div key={f.label} className="flex justify-between items-center p-2 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">{f.label}</span>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined icon-filled text-tertiary text-[10px]">lock</span>
                      <span className="text-zinc-500 text-[10px] font-mono">{f.ct}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="text-zinc-500 text-[10px] uppercase font-mono tracking-wider">Leverage</div>
                  <div className="text-white font-mono font-bold">10× Private</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="text-zinc-500 text-[10px] uppercase font-mono tracking-wider">Privacy</div>
                  <div className="text-tertiary font-mono font-bold">100%</div>
                </div>
              </div>
            </div>

            {/* Glow orbs */}
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary-container/20 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-tertiary/15 blur-[80px] rounded-full pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="py-32 px-8 border-t border-white/5">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 glass-panel rounded-full mb-4 border border-primary/20">
              <span className="material-symbols-outlined icon-filled text-primary text-sm">memory</span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                Powered by Arcium MPC
              </span>
            </div>
            <h2 className="text-h2 text-white mb-4">How Privacy Works</h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              Every sensitive operation flows through Arcium's decentralized Multi-Party Computation network. Here's the pipeline:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-white/10 to-transparent z-0" />
                )}
                <div className="glass-panel p-6 rounded-xl border border-white/5 hover:border-primary/20 transition-all group relative z-10">
                  <div className="text-4xl font-black text-primary-container/20 font-mono mb-4 group-hover:text-primary-container/40 transition-colors">
                    {step.step}
                  </div>
                  <h3 className="text-white font-bold mb-2">{step.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy Features ─────────────────────────────────────────────── */}
      <section className="py-24 px-8 bg-surface-container-lowest/50">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="text-h2 text-white text-center mb-16">Privacy Guarantees</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PRIVACY_FEATURES.map((f) => (
              <div
                key={f.title}
                className="glass-panel p-8 rounded-xl border border-white/5 hover:border-white/10 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 ${f.color}`}>
                  <span className="material-symbols-outlined icon-filled text-[22px]">{f.icon}</span>
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Markets preview ──────────────────────────────────────────────── */}
      <section className="py-24 px-8 border-t border-white/5">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-h2 text-white">Markets</h2>
            <button
              onClick={onLaunchApp}
              className="text-primary text-sm font-semibold hover:text-primary-container transition-colors flex items-center gap-1"
            >
              View all markets
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MARKETS.slice(0, 3).map((m) => {
              const isUp = m.change >= 0;
              return (
                <button
                  key={m.symbol}
                  onClick={() => onSelectMarket(m.symbol)}
                  className="glass-panel p-5 rounded-xl border border-white/5 hover:border-primary/20 text-left transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary-container/20 rounded-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-[18px]">{m.icon}</span>
                      </div>
                      <div>
                        <div className="text-white font-bold font-mono">{m.symbol}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{m.label}</div>
                      </div>
                    </div>
                    <div className="chip-encrypted px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase">
                      <span className="material-symbols-outlined icon-filled text-[10px] mr-0.5">shield</span>
                      Private
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white font-mono mb-1">
                    ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-sm font-mono ${isUp ? "text-tertiary" : "text-error"}`}>
                    {isUp ? "+" : ""}{m.change.toFixed(2)}%
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 flex justify-between">
                    <div>
                      <div className="text-[9px] text-zinc-600 font-mono uppercase">Volume 24h</div>
                      <div className="text-xs text-zinc-300 font-mono">{m.volume24h}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-600 font-mono uppercase">Open Int.</div>
                      <div className="text-xs text-zinc-300 font-mono">{m.openInterest}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-600 font-mono uppercase">Funding</div>
                      <div className="text-xs text-zinc-300 font-mono">{m.fundingRate.toFixed(4)}%</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA Footer ───────────────────────────────────────────────────── */}
      <section className="py-32 px-8 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 hero-gradient" />
        <div className="max-w-[800px] mx-auto text-center relative z-10">
          <h2 className="text-[48px] font-black text-white mb-6 leading-tight">
            Trade Without<br />
            <span className="gradient-text">Fear of Exposure</span>
          </h2>
          <p className="text-zinc-400 text-body-lg mb-10">
            Join the next generation of private DeFi. Your positions, your secrets.
          </p>
          <button
            onClick={handleCTA}
            className="bg-primary-container text-white px-12 py-5 rounded-xl font-bold text-lg hover:brightness-110 active:scale-[0.98] transition-all shadow-2xl shadow-primary-container/30 purple-glow"
          >
            {connected ? "Open Trading Terminal" : "Connect Wallet to Start"}
          </button>
        </div>
      </section>
    </div>
  );
}
