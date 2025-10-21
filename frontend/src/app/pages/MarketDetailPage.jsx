import { useParams } from "react-router-dom";
import TradingViewChart from "../../components/HistoryChart";
import OrderPanel from "../../components/OrderPanel";
import OrderHistoryPanel from "../../components/OrderHistoryPanel";
import { useState, useEffect } from "react";
import { usePrices } from "../../lib/PricesContext";
import { useWebSocket } from "../../lib/WebSocketContext";

export default function MarketDetailPage() {
  const { symbol } = useParams();
  const { prices } = usePrices();
  const { connected, subscribeToSymbol, marketData, queryHistory, historyData } = useWebSocket();

  // Sayfa mount olduğunda sadece bu symbol'e subscribe ol ve history çek
  useEffect(() => {
    if (symbol && connected && subscribeToSymbol) {
      console.log(`🎯 MarketDetailPage: Subscribing to ${symbol} only`);
      subscribeToSymbol(symbol);
    }
  }, [symbol, connected, subscribeToSymbol]);

  // Symbol değiştiğinde history çek
  useEffect(() => {
    if (symbol && connected && queryHistory) {
      console.log(`📊 Fetching 1-year history for ${symbol}...`);
      
      // 1 yıllık history çek (H1 interval - 1 saatlik mumlar)
      const now = Date.now();
      const yearAgo = now - (365 * 24 * 60 * 60 * 1000); // 365 gün öncesi

      queryHistory(
        symbol,
        yearAgo,
        now,
        'H1', // 1 saatlik mumlar
        8760  // 365*24 = 8760 saat
      );
    }
  }, [symbol, connected, queryHistory]);

  // Debug: History data'yı logla
  useEffect(() => {
    if (historyData && symbol) {
      console.log(`📈 History data for ${symbol}:`, historyData);
      if (historyData[symbol]) {
        console.log(`📈 ${symbol} history candles:`, historyData[symbol].length, 'items');
      }
    }
  }, [historyData, symbol]);

  // Debug: WebSocket market data ve price'ı logla
  const [previousPrice, setPreviousPrice] = useState(null);
  useEffect(() => {
    if (marketData?.[symbol]) {
      const currentPrice = marketData[symbol]?.price;
      if (currentPrice && previousPrice) {
        const change = currentPrice - previousPrice;
        const changePercent = ((change / previousPrice) * 100).toFixed(2);
        console.log(`💰 ${symbol} PRICE CHANGE: ${previousPrice} → ${currentPrice} (${change > 0 ? '+' : ''}${change.toFixed(4)}, ${changePercent}%)`);
      } else if (currentPrice) {
        console.log(`💰 ${symbol} INITIAL PRICE: ${currentPrice}`);
      }
      setPreviousPrice(currentPrice);
    }
  }, [marketData, symbol, previousPrice]);


  return (
    <div className="p-6 space-y-6 w-full max-w-full overflow-x-hidden">
      <h2 className="text-lg font-semibold">{symbol} Market</h2>

      <TradingViewChart 
        symbol={symbol} 
        livePrice={marketData?.[symbol]?.price || prices?.[symbol]}
        historyData={historyData?.[symbol]} 
      />
      <OrderPanel symbol={symbol} />
      <div className="w-full">
        <OrderHistoryPanel symbol={symbol} />
      </div>
    </div>
  );
}
