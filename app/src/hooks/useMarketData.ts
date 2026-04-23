/**
 * useMarketData.ts
 *
 * LIVE market data via:
 *   1. Binance WebSocket streams (primary — zero rate limit, real-time ticks)
 *   2. CoinGecko REST API (fallback if WS fails or for initial load)
 *
 * Each ticker stream gives: last price, 24h change %, 24h high, 24h low, 24h volume.
 * Candles are built from a rolling buffer of prices we receive.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { MARKETS, type MarketConfig } from "../lib/constants";

export interface MarketTick {
  symbol: string;
  label: string;
  icon: string;
  price: number;
  change: number;      // 24h % change
  high24h: number;
  low24h: number;
  volume24h: string;   // formatted e.g. "3.8B"
  openInterest: string;
  fundingRate: number;
  lastUpdated: number; // timestamp ms
  isLive: boolean;     // true = WS connected, false = REST/seed
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type MarketMap = Record<string, MarketTick>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatVolume(usd: number): string {
  if (usd >= 1e9) return `${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(0)}M`;
  return `${(usd / 1e3).toFixed(0)}K`;
}

function seedTick(m: MarketConfig): MarketTick {
  return {
    symbol: m.symbol,
    label: m.label,
    icon: m.icon,
    price: m.seedPrice,
    change: m.seedChange,
    high24h: m.seedPrice * 1.04,
    low24h: m.seedPrice * 0.96,
    volume24h: "—",
    openInterest: "—",
    fundingRate: 0.0082,
    lastUpdated: Date.now(),
    isLive: false,
  };
}

function buildInitialMap(): MarketMap {
  const map: MarketMap = {};
  for (const m of MARKETS) {
    map[m.symbol] = seedTick(m);
  }
  return map;
}

// Binance stream name → our symbol
const binanceToSymbol: Record<string, string> = {};
for (const m of MARKETS) {
  binanceToSymbol[m.binanceWs.split("@")[0].toUpperCase() + "USDT"] = m.symbol;
  // also map lowercase pair
  binanceToSymbol[m.binanceWs.split("@")[0].toUpperCase()] = m.symbol;
}

// ── CoinGecko fallback ────────────────────────────────────────────────────────

async function fetchCoinGeckoPrices(): Promise<Partial<MarketMap>> {
  const ids = MARKETS.map((m) => m.coingeckoId).join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&sparkline=false&price_change_percentage=24h`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return {};
    const data: any[] = await res.json();

    const partial: Partial<MarketMap> = {};
    for (const coin of data) {
      const market = MARKETS.find((m) => m.coingeckoId === coin.id);
      if (!market) continue;
      partial[market.symbol] = {
        symbol: market.symbol,
        label: market.label,
        icon: market.icon,
        price: coin.current_price ?? market.seedPrice,
        change: coin.price_change_percentage_24h ?? 0,
        high24h: coin.high_24h ?? market.seedPrice * 1.04,
        low24h: coin.low_24h ?? market.seedPrice * 0.96,
        volume24h: formatVolume(coin.total_volume ?? 0),
        openInterest: "—",
        fundingRate: 0.0082,
        lastUpdated: Date.now(),
        isLive: false,
      };
    }
    return partial;
  } catch {
    return {};
  }
}

// ── Candle ring buffer ─────────────────────────────────────────────────────

const MAX_CANDLES = 120;
const CANDLE_INTERVAL_SEC = 60; // 1-minute candles

interface CandleState {
  candles: Candle[];
  currentOpen: number;
  currentHigh: number;
  currentLow: number;
  currentTime: number; // start of current candle interval
}

function nowCandle(): number {
  return Math.floor(Date.now() / 1000 / CANDLE_INTERVAL_SEC) * CANDLE_INTERVAL_SEC;
}

function makeCandleState(seedPrice: number): CandleState {
  // Pre-fill last 2 hours with random-walk candles
  const candles: Candle[] = [];
  let price = seedPrice * 0.97;
  const t0 = nowCandle() - MAX_CANDLES * CANDLE_INTERVAL_SEC;
  for (let i = 0; i < MAX_CANDLES - 1; i++) {
    const open = price;
    const move = price * (Math.random() * 0.012 - 0.006);
    const close = Math.max(open + move, 0.001);
    const high = Math.max(open, close) * (1 + Math.random() * 0.003);
    const low = Math.min(open, close) * (1 - Math.random() * 0.003);
    candles.push({ time: t0 + i * CANDLE_INTERVAL_SEC, open, high, low, close });
    price = close;
  }
  const ct = nowCandle();
  return {
    candles,
    currentOpen: price,
    currentHigh: price,
    currentLow: price,
    currentTime: ct,
  };
}

function updateCandleState(state: CandleState, newPrice: number): CandleState {
  const ct = nowCandle();
  if (ct !== state.currentTime) {
    // Finalize old candle, start new one
    const finalized: Candle = {
      time: state.currentTime,
      open: state.currentOpen,
      high: state.currentHigh,
      low: state.currentLow,
      close: newPrice,
    };
    const candles = [...state.candles, finalized].slice(-MAX_CANDLES);
    return {
      candles,
      currentOpen: newPrice,
      currentHigh: newPrice,
      currentLow: newPrice,
      currentTime: ct,
    };
  }
  return {
    ...state,
    currentHigh: Math.max(state.currentHigh, newPrice),
    currentLow: Math.min(state.currentLow, newPrice),
  };
}

// ── Main hook ──────────────────────────────────────────────────────────────

export function useMarketData() {
  const [markets, setMarkets] = useState<MarketMap>(buildInitialMap);
  const [wsConnected, setWsConnected] = useState(false);
  const candleStates = useRef<Record<string, CandleState>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();

  // Init candle states
  useEffect(() => {
    for (const m of MARKETS) {
      if (!candleStates.current[m.symbol]) {
        candleStates.current[m.symbol] = makeCandleState(m.seedPrice);
      }
    }
  }, []);

  // CoinGecko REST on mount for accurate seed prices
  useEffect(() => {
    fetchCoinGeckoPrices().then((partial) => {
      if (Object.keys(partial).length === 0) return;
      setMarkets((prev) => {
        const next = { ...prev };
        for (const [sym, tick] of Object.entries(partial)) {
          next[sym] = { ...next[sym], ...tick };
          // Re-seed candle states with real price
          if (candleStates.current[sym]) {
            const cs = candleStates.current[sym];
            candleStates.current[sym] = {
              ...cs,
              currentOpen: tick.price!,
              currentHigh: Math.max(cs.currentHigh, tick.price!),
              currentLow: Math.min(cs.currentLow, tick.price!),
            };
          }
        }
        return next;
      });
    });
  }, []);

  // Binance WebSocket for live ticks
  const connectBinanceWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const streams = MARKETS.map((m) => m.binanceWs).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const d = msg.data;
        if (!d || !d.s) return; // not a ticker

        // d.s = "BTCUSDT", d.c = last price, d.P = 24h % change, etc.
        const rawSym = d.s as string; // e.g. "BTCUSDT"
        // Match to our symbol
        const market = MARKETS.find(
          (m) =>
            m.binanceWs.split("@")[0].toUpperCase() + "USDT" === rawSym ||
            m.binanceWs.split("@")[0].toUpperCase() === rawSym
        );
        if (!market) return;

        const price = parseFloat(d.c);
        const change = parseFloat(d.P);
        const high = parseFloat(d.h);
        const low = parseFloat(d.l);
        const vol = parseFloat(d.q); // quote volume (USDT)
        if (isNaN(price) || price <= 0) return;

        // Update candle state
        candleStates.current[market.symbol] = updateCandleState(
          candleStates.current[market.symbol] ?? makeCandleState(price),
          price
        );

        setMarkets((prev) => ({
          ...prev,
          [market.symbol]: {
            ...prev[market.symbol],
            price,
            change,
            high24h: isNaN(high) ? prev[market.symbol].high24h : high,
            low24h: isNaN(low) ? prev[market.symbol].low24h : low,
            volume24h: isNaN(vol) ? prev[market.symbol].volume24h : formatVolume(vol),
            lastUpdated: Date.now(),
            isLive: true,
          },
        }));
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onclose = () => {
      setWsConnected(false);
      // Reconnect after 5s
      retryRef.current = setTimeout(() => connectBinanceWs(), 5000);
    };
  }, []);

  useEffect(() => {
    connectBinanceWs();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connectBinanceWs]);

  /** Get the current candle list for a symbol (includes the in-progress candle) */
  const getCandles = useCallback((symbol: string): Candle[] => {
    const cs = candleStates.current[symbol];
    if (!cs) return [];
    const current = markets[symbol];
    const inProgress: Candle = {
      time: cs.currentTime,
      open: cs.currentOpen,
      high: cs.currentHigh,
      low: cs.currentLow,
      close: current?.price ?? cs.currentOpen,
    };
    return [...cs.candles, inProgress];
  }, [markets]);

  return { markets, wsConnected, getCandles };
}
