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

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <header className="fixed top-0 left-0 w-full z-[100] flex justify-between items-center px-8 h-16 bg-background/70 backdrop-blur-glass saturate-150 border-b border-white/5 shadow-2xl shadow-black">
      {/* Brand + Nav */}
      <div className="flex items-center gap-10">
        <button
          onClick={() => onNavigate("home")}
          className="text-xl font-black tracking-tighter text-white uppercase"
        >
          ARCIUM
        </button>
        <nav className="hidden md:flex items-center gap-6">
          <button
            onClick={() => onNavigate("trade")}
            className={
              activePage === "trade"
                ? "text-primary-container border-b-2 border-primary-container pb-0.5 font-semibold text-sm uppercase tracking-wider"
                : "text-zinc-400 font-medium hover:text-zinc-100 transition-all duration-200 text-sm uppercase tracking-wider"
            }
          >
            Markets
          </button>
          <button className="text-zinc-400 font-medium hover:text-zinc-100 transition-all duration-200 text-sm uppercase tracking-wider">
            Portfolio
          </button>
          <button className="text-zinc-400 font-medium hover:text-zinc-100 transition-all duration-200 text-sm uppercase tracking-wider">
            Docs
          </button>
        </nav>
      </div>

      {/* Wallet */}
      <div className="flex items-center gap-3">
        {connected ? (
          <>
            {/* Arcium status indicator */}
            <div className="hidden sm:flex items-center gap-2 bg-tertiary/10 px-3 py-1.5 rounded-full border border-tertiary/20">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
              <span className="text-tertiary text-xs font-mono font-semibold">
                MPC ACTIVE
              </span>
            </div>
            {/* Wallet badge */}
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse" />
              <span className="text-white text-xs font-mono">{shortAddress}</span>
            </div>
            <button
              onClick={() => disconnect()}
              className="text-zinc-400 hover:text-zinc-100 transition-all p-1"
              title="Disconnect"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => setVisible(true)}
            className="bg-primary-container text-white px-6 py-2 rounded-lg font-semibold hover:brightness-110 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-primary-container/20"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
