/**
 * constants.ts — Stealth Perps configuration
 * Update PROGRAM_ID + BACKEND_API_BASE after deploying to devnet.
 */

export const PROGRAM_ID =
  import.meta.env.VITE_PROGRAM_ID || "57dAxRF57a33kHwa51Xhd4eNjLg7vc7Q1phfMKS4xtfy";

export const RPC_URL =
  import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";

export const BACKEND_API_BASE =
  import.meta.env.VITE_BACKEND_API_BASE || "http://localhost:4000";

export const ARCIUM_CLUSTER_OFFSET = 456;

/** Scale factor: 6 decimal places (μUSDC) */
export const SCALE = 1_000_000n;

export const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50];
export const MAX_LEVERAGE = 50;
export const MAINTENANCE_MARGIN_BPS = 50; // 0.5%

/**
 * Markets with CoinGecko IDs (for REST fallback) + Binance WS symbol
 * Prices are seeded here — they get overridden by live data immediately.
 */
export interface MarketConfig {
  symbol: string;       // display: "BTC/USDC"
  label: string;        // "BITCOIN"
  icon: string;         // material-symbols name
  binanceWs: string;    // Binance ws stream: "btcusdt@ticker"
  coingeckoId: string;  // for REST fallback
  seedPrice: number;
  seedChange: number;
}

export const MARKETS: MarketConfig[] = [
  {
    symbol: "BTC/USDC",
    label: "BITCOIN",
    icon: "currency_bitcoin",
    binanceWs: "btcusdt@ticker",
    coingeckoId: "bitcoin",
    seedPrice: 64000,
    seedChange: 0,
  },
  {
    symbol: "ETH/USDC",
    label: "ETHEREUM",
    icon: "monetization_on",
    binanceWs: "ethusdt@ticker",
    coingeckoId: "ethereum",
    seedPrice: 2400,
    seedChange: 0,
  },
  {
    symbol: "SOL/USDC",
    label: "SOLANA",
    icon: "token",
    binanceWs: "solusdt@ticker",
    coingeckoId: "solana",
    seedPrice: 140,
    seedChange: 0,
  },
  {
    symbol: "BNB/USDC",
    label: "BNB",
    icon: "toll",
    binanceWs: "bnbusdt@ticker",
    coingeckoId: "binancecoin",
    seedPrice: 580,
    seedChange: 0,
  },
  {
    symbol: "AVAX/USDC",
    label: "AVALANCHE",
    icon: "rocket_launch",
    binanceWs: "avaxusdt@ticker",
    coingeckoId: "avalanche-2",
    seedPrice: 28,
    seedChange: 0,
  },
  {
    symbol: "LINK/USDC",
    label: "CHAINLINK",
    icon: "link",
    binanceWs: "linkusdt@ticker",
    coingeckoId: "chainlink",
    seedPrice: 14,
    seedChange: 0,
  },
  {
    symbol: "JUP/USDC",
    label: "JUPITER",
    icon: "public",
    binanceWs: "jupusdt@ticker",
    coingeckoId: "jupiter-exchange-solana",
    seedPrice: 0.85,
    seedChange: 0,
  },
  {
    symbol: "WIF/USDC",
    label: "DOGWIFHAT",
    icon: "pets",
    binanceWs: "wifusdt@ticker",
    coingeckoId: "dogwifhat",
    seedPrice: 2.2,
    seedChange: 0,
  },
];

/** Parse a dollar string like "142.50" into scaled bigint */
export function parsePrice(s: string): bigint {
  const [whole = "0", frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}
