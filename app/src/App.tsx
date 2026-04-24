import { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import TradingPage from "./pages/TradingPage";

export type AppPage = "home" | "trade";

const PAGE_KEY = "stealthperps_page";
const MARKET_KEY = "stealthperps_market";

function getSavedPage(): AppPage {
  try {
    const p = sessionStorage.getItem(PAGE_KEY);
    if (p === "trade" || p === "home") return p;
  } catch {}
  return "home";
}

function getSavedMarket(): string {
  try {
    return sessionStorage.getItem(MARKET_KEY) || "BTC/USDC";
  } catch {}
  return "BTC/USDC";
}

export default function App() {
  const [page, setPage] = useState<AppPage>(getSavedPage);
  const [selectedMarket, setSelectedMarket] = useState<string>(getSavedMarket);

  // Persist page + market on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(PAGE_KEY, page);
    } catch {}
  }, [page]);

  useEffect(() => {
    try {
      sessionStorage.setItem(MARKET_KEY, selectedMarket);
    } catch {}
  }, [selectedMarket]);

  if (page === "trade") {
    return (
      <TradingPage
        market={selectedMarket}
        onNavigate={(p) => setPage(p)}
        onMarketChange={(m) => setSelectedMarket(m)}
      />
    );
  }

  return (
    <HomePage
      onLaunchApp={() => setPage("trade")}
      onSelectMarket={(m) => {
        setSelectedMarket(m);
        setPage("trade");
      }}
    />
  );
}
