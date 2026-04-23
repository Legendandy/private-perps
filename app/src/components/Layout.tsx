import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { AppPage } from "../App";

interface Props {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

export default function Layout({ activePage, onNavigate }: Props) {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const addr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <header
      className="fixed top-0 left-0 w-full z-[100] flex justify-between items-center px-6 h-14"
      style={{
        background: "rgba(8,10,15,0.85)",
        backdropFilter: "blur(20px) saturate(140%)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-8">
        <button
          onClick={() => onNavigate("home")}
          className="font-display text-lg font-black tracking-tighter text-white uppercase"
        >
          STEALTH<span style={{ color: "var(--color-green)" }}>PERPS</span>
        </button>

        <nav className="hidden md:flex items-center gap-5">
          {[
            { label: "Markets", page: "trade" as AppPage },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => onNavigate(item.page)}
              className="font-mono text-[10px] uppercase tracking-widest transition-all"
              style={{
                color: activePage === item.page ? "white" : "var(--color-text-3)",
                borderBottom: activePage === item.page ? "1px solid var(--color-green)" : "1px solid transparent",
                paddingBottom: 2,
              }}
            >
              {item.label}
            </button>
          ))}
          <a
            href="https://docs.arcium.com"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] uppercase tracking-widest transition-all"
            style={{ color: "var(--color-text-3)" }}
          >
            Docs
          </a>
        </nav>
      </div>

      {/* Right: wallet */}
      <div className="flex items-center gap-3">
        {connected ? (
          <>
            {/* MPC active badge */}
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ background: "rgba(34,211,165,0.08)", border: "1px solid rgba(34,211,165,0.2)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--color-green)", boxShadow: "0 0 5px var(--color-green)" }}
              />
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-green)" }}>
                MPC Active
              </span>
            </div>

            {/* Wallet address */}
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#60A5FA", boxShadow: "0 0 4px #60A5FA" }}
              />
              <span className="font-mono text-[10px] text-white">{addr}</span>
            </div>

            <button
              onClick={() => disconnect()}
              className="transition-all p-1"
              style={{ color: "var(--color-text-3)" }}
              title="Disconnect"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => setVisible(true)}
            className="font-mono text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-lg transition-all"
            style={{
              background: "rgba(167,139,250,0.15)",
              border: "1px solid rgba(167,139,250,0.3)",
              color: "#A78BFA",
            }}
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
