import { useState, useEffect } from "react";
import { useWebSocket } from "../../lib/WebSocketContext";
import OrderHistoryPanel from "../../components/OrderHistoryPanel";
import MarketTable from "../../components/MarketDataPanel";

export default function HomePage() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC-USD");
  const { queryHistory, connected, subscribeToAllMarkets } = useWebSocket();

  // Ana sayfa mount olduğunda tüm market'lere subscribe ol
  useEffect(() => {
    if (connected && subscribeToAllMarkets) {
      console.log('🏠 Main page: Subscribing to all markets');
      subscribeToAllMarkets();
    }
  }, [connected, subscribeToAllMarkets]);

  // Symbol seçildiğinde history çek
  useEffect(() => {
    if (selectedSymbol && connected) {
      console.log(`📊 Fetching history for ${selectedSymbol}...`);
      
      // 24 saatlik history çek (M1 interval)
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000); // 24 saat öncesi

      queryHistory(
        selectedSymbol,
        dayAgo,
        now,
        'M1', // 1 dakikalık mumlar
        1440  // 24*60 = 1440 mum
      );
    }
  }, [selectedSymbol, connected, queryHistory]);

  const handleSymbolSelect = (symbol) => {
    console.log(`🎯 Symbol selected: ${symbol}`);
    setSelectedSymbol(symbol);
  };


  return (
    <div className="w-full overflow-x-hidden">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-full min-w-0">
        <div className="lg:col-span-2 space-y-6 min-w-0 overflow-hidden">
          <MarketTable onSelectSymbol={handleSymbolSelect} />
        </div>

        <div className="space-y-6 min-w-0 overflow-hidden">
          <OrderHistoryPanel
            maxItems={10}
            title="Last 10 Orders"
            notice="This list contains only the last 10 orders received."
          />
        </div>
      </section>

      <footer className="mt-8 text-xs text-gray-500 text-center">
        Real-time data and order processing active via WebSocket.
        <br />
        Running on Bull Trading Server (ws://localhost:8082) connection.
      </footer>
    </div>
  );
}
