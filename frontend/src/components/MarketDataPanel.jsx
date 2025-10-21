import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { usePrices } from "../lib/PricesContext";
import { useWebSocket } from "../lib/WebSocketContext";

export default function MarketDataPanel({ onSelectSymbol, onPriceUpdate }) {
  const { setPrice } = usePrices();
  const { marketData: wsMarketData, connected, subscribeToSymbol } = useWebSocket();
  const navigate = useNavigate();
  const [initialPrices, setInitialPrices] = useState({});

  // Convert WebSocket data to array format and calculate changes
  const marketData = useMemo(() => {
    if (!wsMarketData || Object.keys(wsMarketData).length === 0) {
      return [];
    }

    return Object.entries(wsMarketData).map(([symbol, wsData]) => {
      if (!wsData || typeof wsData.price !== 'number') {
        return null;
      }

      const initialPrice = initialPrices[symbol];
      let change = 0;
      
      // Calculate change based on initial price when first received
      if (initialPrice && initialPrice !== 0) {
        change = ((wsData.price - initialPrice) / initialPrice) * 100;
      }
      
      return {
        symbol,
        price: wsData.price,
        bid: wsData.bid,
        ask: wsData.ask,
        volume: wsData.volume,
        change: parseFloat(change.toFixed(2))
      };
    }).filter(Boolean);
  }, [wsMarketData, initialPrices]);

  // Set initial prices only once when first received to calculate change from baseline
  useEffect(() => {
    if (!wsMarketData) return;
    
    setInitialPrices(prev => {
      const updates = {};
      let hasUpdates = false;
      
      Object.keys(wsMarketData).forEach(symbol => {
        const wsData = wsMarketData[symbol];
        if (wsData && typeof wsData.price === 'number' && 
            !prev[symbol]) { // Only set if we don't have an initial price yet
          updates[symbol] = wsData.price;
          hasUpdates = true;
          console.log(`🎯 Setting initial price for ${symbol}: ${wsData.price}`);
        }
      });
      
      return hasUpdates ? { ...prev, ...updates } : prev;
    });
  }, [wsMarketData]); // Only depends on wsMarketData

  // Update PricesContext with current market data
  useEffect(() => {
    if (!marketData || marketData.length === 0) return;
    
    marketData.forEach((item) => {
      try {
        const price = Number(item.price);
        if (!isNaN(price)) {
          setPrice(item.symbol, price);
        }
        // Notify parent component of price updates
        if (onPriceUpdate && typeof onPriceUpdate === 'function') {
          onPriceUpdate(item.symbol, item.price);
        }
      } catch (error) {
        console.error('Error updating price for', item.symbol, error);
      }
    });
  }, [marketData, setPrice]); // Remove onPriceUpdate from dependencies to prevent loops

  const handleGrafikClick = (symbol, e) => {
    e.preventDefault(); // Prevent page navigation
    e.stopPropagation(); // Prevent row click
    
    console.log(`🎯 Chart clicked for ${symbol}, sending subscribe request for this symbol only...`);
    console.log(`📤 CLIENT SENDING: subscribeToSymbol with symbol:`, symbol);
    
    // Subscribe only to this symbol (server will cleanup)
    if (connected && subscribeToSymbol) {
      console.log(`🔄 Calling subscribeToSymbol for ${symbol}`);
      subscribeToSymbol(symbol);
      console.log(`📊 Sent subscribe request for ${symbol} only`);
      
      // Short wait for subscribe operation to complete
      setTimeout(() => {
        console.log(`🚀 Navigating to /market/${symbol} after subscribe`);
        navigate(`/market/${symbol}`);
      }, 100);
    } else {
      console.error(`❌ Cannot send subscribe: connected=${connected}, subscribeToSymbol=${!!subscribeToSymbol}`);
      // Navigate even in error case
      navigate(`/market/${symbol}`);
    }
    
    // Select symbol
    if (onSelectSymbol) {
      onSelectSymbol(symbol);
    }
  };

  return (
    <div className="glass p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Live Market Data</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-gray-400">
            {connected ? 'Real-time' : 'Disconnected'}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-white/5">
              <th className="text-left py-2 px-2">Symbol</th>
              <th className="text-left py-2 px-2">Price</th>
              <th className="text-left py-2 px-2">Bid/Ask</th>
              <th className="text-left py-2 px-2">Change</th>
              <th className="text-left py-2 px-2">Volume</th>
            </tr>
          </thead>
          <tbody>
            {marketData.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-8 text-center text-gray-400">
                  {connected ? 'Waiting for WebSocket data...' : 'Connecting to WebSocket...'}
                </td>
              </tr>
            ) : (
              marketData.map((row) => (
              
              <tr
                  key={row.symbol}
                  onClick={() => onSelectSymbol?.(row.symbol)}
                  className="border-b border-white/5 hover:bg-white/10 cursor-pointer transition"
                >
                  
                  <td className="py-2 px-2 font-medium text-blue-400">
                    <Link to={`/market/${row.symbol}`}>{row.symbol}</Link>
                    <span className="ml-2">
                      <Link
                        to={`/market/${row.symbol}`}
                        className="text-xs px-2 py-0.5 rounded border border-white/10 hover:bg-white/10"
                        onClick={(e) => handleGrafikClick(row.symbol, e)}
                      >
                        Chart
                      </Link>
                    </span>
                  </td>
                  
                  <td className={`py-2 px-2 font-mono tabular-nums transition-colors duration-300 ${
                    row.change === 0 
                      ? "text-white" 
                      : row.change > 0 
                        ? "text-green-300" 
                        : "text-red-300"
                  }`}>
                    ${typeof row.price === 'number' ? row.price.toFixed(2) : '0.00'}
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums text-xs">
                    {row.bid && row.ask ? (
                      <>
                        <span className="text-red-400">${row.bid.toFixed(2)}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-400">${row.ask.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="text-gray-500">--</span>
                    )}
                  </td>
                  <td
                    className={`py-2 px-2 font-mono tabular-nums transition-colors duration-300 ${
                      row.change === 0 
                        ? "text-gray-400" 
                        : row.change > 0 
                          ? "text-green-400" 
                          : "text-red-400"
                    }`}
                  >
                    <span className={`inline-flex items-center gap-1 ${
                      row.change > 0 ? 'text-green-400' : row.change < 0 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {row.change !== 0 && (
                        <span>
                          {row.change > 0 ? '↗' : '↘'}
                        </span>
                      )}
                      {row.change !== 0 && (row.change > 0 ? "+" : "")}
                      {row.change.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums">
                    {typeof row.volume === 'number' ? row.volume.toLocaleString() : '0'}
                  </td>
                  
                </tr>
                
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
