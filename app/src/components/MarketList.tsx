import { MarketTick } from "../hooks/useMarketData";
import { MARKETS } from "../lib/constants";

interface Props {
  markets: Record<string, MarketTick>;
  selected: string;
  onSelect: (symbol: string) => void;
}

export default function MarketList({ markets, selected, onSelect }: Props) {
  return (
    <aside className="w-72 glass-panel flex flex-col h-full shrink-0">
      {/* Search */}
      <div className="p-4 border-b border-white/5">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
            search
          </span>
          <input
            className="w-full bg-white/5 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary/50 placeholder:text-zinc-600 text-white outline-none"
            placeholder="Search markets..."
            type="text"
          />
        </div>
      </div>

      {/* Market list */}
      <div className="flex-1 overflow-y-auto scroll-hide">
        <div className="p-2 space-y-1">
          {MARKETS.map((m) => {
            const live = markets[m.symbol] ?? m;
            const isSelected = selected === m.symbol;
            const isUp = live.change >= 0;

            return (
              <button
                key={m.symbol}
                onClick={() => onSelect(m.symbol)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all text-left ${
                  isSelected
                    ? "bg-primary-container/10 border border-primary-container/20"
                    : "hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-[20px] ${
                      isSelected ? "text-primary" : "text-zinc-500 group-hover:text-white"
                    }`}
                  >
                    {m.icon}
                  </span>
                  <div>
                    <div className={`font-bold text-sm ${isSelected ? "text-white" : "text-zinc-300"}`}>
                      {m.symbol}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">{m.label}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-sm font-mono ${isSelected ? "text-white" : "text-zinc-300"}`}>
                    ${live.price.toFixed(live.price > 100 ? 2 : 4)}
                  </div>
                  <div className={`text-[10px] font-mono ${isUp ? "text-tertiary" : "text-error"}`}>
                    {isUp ? "+" : ""}{live.change.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Arcium status footer */}
      <div className="p-4 bg-black/40 border-t border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined icon-filled text-tertiary text-[14px]">
            verified_user
          </span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
            Arcium Secure Computation
          </span>
        </div>
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-tertiary w-full opacity-60" />
        </div>
        <p className="text-[8px] text-zinc-600 mt-2 uppercase tracking-widest leading-tight">
          Computing environment: MPC + TEE ACTIVE
        </p>
      </div>
    </aside>
  );
}
