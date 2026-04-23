/**
 * useMarketData.ts
 * Simulates a live price feed. In production, connect to a Pyth / Switchboard oracle
 * or a websocket from your backend keeper.
 */

import { useState, useEffect, useRef } from "react";
import { MARKETS } from "../lib/constants";

export interface MarketTick {
  symbol: string;
  price: number;
  change: number;
  high24h: number;
  low24h: number;
  volume24h: string;
  openInterest: string;
  fundingRate: number;
}

type MarketMap = Record<string, MarketTick>;

function buildInitialMap(): MarketMap {
  const map: MarketMap = {};
  for (const m of MARKETS) {
    map[m.symbol] = { ...m };
  }
  return map;
}

export function useMarketData() {
  const [markets, setMarkets] = useState<MarketMap>(buildInitialMap);
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Simulate live price ticks every 1.5 seconds
    tickRef.current = setInterval(() => {
      setMarkets((prev) => {
        const next = { ...prev };
        for (const sym of Object.keys(next)) {
          const market = next[sym];
          // Random walk: ±0.15%
          const delta = market.price * (Math.random() * 0.003 - 0.0015);
          const newPrice = Math.max(market.price + delta, 0.01);
          const changeFromBase = ((newPrice - MARKETS.find((m) => m.symbol === sym)!.price) /
            MARKETS.find((m) => m.symbol === sym)!.price) * 100;
          next[sym] = {
            ...market,
            price: newPrice,
            change: changeFromBase,
          };
        }
        return next;
      });
    }, 1500);

    return () => clearInterval(tickRef.current);
  }, []);

  /** Generate N candle data points for chart rendering */
  function generateCandles(symbol: string, count = 60) {
    const basePrice = markets[symbol]?.price ?? 100;
    const candles = [];
    let price = basePrice * 0.95;
    const now = Date.now();

    for (let i = count; i >= 0; i--) {
      const open = price;
      const change = price * (Math.random() * 0.02 - 0.01);
      const close = open + change;
      const high = Math.max(open, close) * (1 + Math.random() * 0.005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.005);
      candles.push({
        time: (now - i * 60_000) / 1000,
        open,
        high,
        low,
        close,
      });
      price = close;
    }
    return candles;
  }

  return { markets, generateCandles };
}
