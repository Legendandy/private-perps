export const PROGRAM_ID = "StLtHpErPs1111111111111111111111111111111111";

export const ARCIUM_CLUSTER_OFFSET = 456; // devnet offset from Arcium.toml

export const MARKETS = [
  {
    symbol: "SOL/USDC",
    label: "SOLANA",
    icon: "token",
    price: 142.18,
    change: 5.11,
    high24h: 148.5,
    low24h: 138.2,
    volume24h: "284M",
    openInterest: "91M",
    fundingRate: 0.0082,
  },
  {
    symbol: "ETH/USDC",
    label: "ETHEREUM",
    icon: "monetization_on",
    price: 2442.81,
    change: 2.41,
    high24h: 2488.1,
    low24h: 2390.44,
    volume24h: "1.2B",
    openInterest: "480M",
    fundingRate: 0.0071,
  },
  {
    symbol: "BTC/USDC",
    label: "BITCOIN",
    icon: "currency_bitcoin",
    price: 64120.44,
    change: -0.82,
    high24h: 65200.0,
    low24h: 63400.0,
    volume24h: "3.8B",
    openInterest: "1.4B",
    fundingRate: 0.0095,
  },
  {
    symbol: "JUP/USDC",
    label: "JUPITER",
    icon: "public",
    price: 0.841,
    change: 8.32,
    high24h: 0.92,
    low24h: 0.77,
    volume24h: "18M",
    openInterest: "6M",
    fundingRate: 0.0112,
  },
  {
    symbol: "WIF/USDC",
    label: "DOGWIFHAT",
    icon: "pets",
    price: 2.18,
    change: -3.44,
    high24h: 2.41,
    low24h: 2.02,
    volume24h: "42M",
    openInterest: "15M",
    fundingRate: 0.0155,
  },
];

export const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 50];

export const MAX_LEVERAGE = 50;
export const MAINTENANCE_MARGIN_BPS = 50; // 0.5%

/** Scale factor: 6 decimal places (μUSDC) */
export const SCALE = 1_000_000n;
