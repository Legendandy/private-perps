import { useState } from "react";
import HomePage from "./pages/HomePage";
import TradingPage from "./pages/TradingPage";

export type AppPage = "home" | "trade";

export default function App() {
  const [page, setPage] = useState<AppPage>("home");
  const [selectedMarket, setSelectedMarket] = useState("SOL/USDC");

  if (page === "trade") {
    return (
      <TradingPage
        market={selectedMarket}
        onNavigate={(p) => setPage(p)}
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
