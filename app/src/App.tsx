import { useState } from "react";
import HomePage from "./pages/HomePage";
import TradingPage from "./pages/TradingPage";

export type AppPage = "home" | "trade";

export default function App() {
  const [page, setPage] = useState<AppPage>("home");
  const [selectedMarket, setSelectedMarket] = useState("BTC/USDC");

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
