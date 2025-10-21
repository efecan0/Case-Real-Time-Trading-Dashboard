"use client";
import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/WebSocketContext";

export default function OrderPanel({ onSubmit, symbol: propSymbol = "BTC-USD" }) {
  const { placeOrder, connected, marketData } = useWebSocket();
  const [symbol, setSymbol] = useState(propSymbol);
  const [type, setType] = useState("LIMIT");
  const [qty, setQty] = useState(0.1);
  const [price, setPrice] = useState(0);
  const [priceInitialized, setPriceInitialized] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [lastOrderTime, setLastOrderTime] = useState(0);

  useEffect(() => {
    setSymbol(propSymbol);
    setPriceInitialized(false);
  }, [propSymbol]);

  // Update price when market data changes
  useEffect(() => {
    if (priceInitialized) {
      return;
    }

    const symbolData = marketData[symbol];
    if (symbolData && typeof symbolData.price === "number") {
      setPrice(symbolData.price);
      // Update total amount when market price changes
      if (qty > 0) {
        setTotalAmount(symbolData.price * qty);
      }
      setPriceInitialized(true);
    }
  }, [symbol, marketData, qty, priceInitialized]);

  // Handle quantity change - update total amount
  const handleQtyChange = (newQty) => {
    setQty(newQty);
    if (price > 0 && newQty !== null && newQty !== undefined) {
      setTotalAmount(price * newQty);
    } else if (newQty === 0) {
      setTotalAmount(0);
    }
  };

  // Handle total amount change - update quantity  
  const handleTotalAmountChange = (newTotalAmount) => {
    setTotalAmount(newTotalAmount);
    if (price > 0 && newTotalAmount !== null && newTotalAmount !== undefined) {
      const calculatedQty = newTotalAmount / price;
      setQty(parseFloat(calculatedQty.toFixed(8))); // 8 decimal precision for crypto
    } else if (newTotalAmount === 0) {
      setQty(0);
    }
  };

  // Handle price change - update total amount if quantity exists
  const handlePriceChange = (newPrice) => {
    setPriceInitialized(true);
    setPrice(newPrice);
    if (
      qty !== null &&
      qty !== undefined &&
      newPrice !== null &&
      newPrice !== undefined
    ) {
      setTotalAmount(newPrice * qty);
    }
  };

  const handleOrder = async (orderSide) => {
    // Rate limiting check (1 second minimum between orders)
    const now = Date.now();
    if (now - lastOrderTime < 1000) {
      setStatus("Rate Limited - Wait 1 second");
      return;
    }

    if (!connected) {
      setStatus("Not Connected");
      return;
    }

    // Validation checks
    if (qty <= 0) {
      setStatus("Quantity must be greater than 0");
      setTimeout(() => setStatus("Ready"), 3000);
      return;
    }

    if (type === "LIMIT" && price <= 0) {
      setStatus("Price must be greater than 0 for Limit orders");
      setTimeout(() => setStatus("Ready"), 3000);
      return;
    }

    setStatus("Submitting...");
    setLastOrderTime(now);

    try {
      const marketPrice =
        marketData?.[symbol] && typeof marketData[symbol].price === "number"
          ? marketData[symbol].price
          : null;
      const parsedLimitPrice = Number.isFinite(price)
        ? price
        : Number.isFinite(parseFloat(price))
        ? parseFloat(price)
        : 0;
      const displayPrice =
        type === "LIMIT"
          ? parsedLimitPrice
          : marketPrice ?? (parsedLimitPrice > 0 ? parsedLimitPrice : 0);

      const orderData = {
        idempotencyKey: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        side: orderSide,
        qty: parseFloat(qty), // Ensure it's a proper number
        price: type === "LIMIT" ? parseFloat(price) : 0,
        type,
        displayPrice,
      };

      console.log('📤 Sending order:', orderData);
      console.log('📊 Order validation:', { qty, price, type, side: orderSide });
      
      if (orderData.qty <= 0) {
        setStatus("Invalid quantity");
        return;
      }

      placeOrder(orderData);
      
      // The actual order result will come via WebSocket callback
      // Reset status after a short delay
      setTimeout(() => {
        setStatus("Ready");
      }, 2000);
      
    } catch (error) {
      console.error('Order placement error:', error);
      setStatus("Error");
    }
  };

  const statusColor = (() => {
    if (status.includes("Submitted") || status === "Ready") return "text-green-400";
    if (status.includes("Error") || status.includes("Not Connected") || status.includes("Rate Limited")) return "text-red-400";
    if (status.includes("Submitting")) return "text-blue-400";
    return "text-gray-400";
  })();

  return (
    <div className="glass p-4 rounded-lg border border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Order Entry</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-gray-400">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Symbol"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setPriceInitialized(false);
            }}
            className="flex-1 bg-transparent border border-white/10 rounded px-3 py-2 text-sm"
          />
          <label
            htmlFor="order-type-select"
            className="flex items-center text-xs text-gray-500 gap-2"
          >
            <span>Type</span>
            <select
              id="order-type-select"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="text-sm border border-white/15 rounded px-3 py-2 bg-[#111827] text-gray-100 focus:outline-none focus:ring-1 focus:ring-white/30"
              style={{ color: "#E5E7EB", backgroundColor: "#111827" }}
            >
              <option value="LIMIT" className="bg-[#111827] text-gray-100">
                Limit
              </option>
              <option value="MARKET" className="bg-[#111827] text-gray-100">
                Market
              </option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Quantity</label>
            <input
              type="number"
              step="0.00000001"
              placeholder="0.5"
              value={isNaN(qty) ? '' : qty.toString()}
              onChange={(e) => {
                const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                if (!isNaN(value)) {
                  handleQtyChange(value);
                }
              }}
              className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Price</label>
            <input
              type="number"
              step="0.01"
              placeholder="Price"
              value={isNaN(price) ? '' : price.toString()}
              onChange={(e) => {
                const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                if (!isNaN(value)) {
                  handlePriceChange(value);
                }
              }}
              className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-400">Total Amount (USD)</label>
          <input
            type="number"
            step="0.01"
            placeholder="Enter total amount"
            value={isNaN(totalAmount) ? '' : totalAmount.toString()}
            onChange={(e) => {
              const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
              if (!isNaN(value)) {
                handleTotalAmountChange(value);
              }
            }}
            className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleOrder("BUY")}
            disabled={!connected || status === "Submitting..."}
            className={`flex-1 py-2 rounded-md font-semibold transition ${
              !connected || status === "Submitting..." 
                ? "bg-gray-600 text-gray-400 cursor-not-allowed" 
                : "bg-gradient-to-r from-green-500 to-green-400 hover:scale-[1.01]"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => handleOrder("SELL")}
            disabled={!connected || status === "Submitting..."}
            className={`flex-1 py-2 rounded-md font-semibold transition ${
              !connected || status === "Submitting..." 
                ? "bg-gray-600 text-gray-400 cursor-not-allowed" 
                : "bg-gradient-to-r from-red-500 to-red-400 hover:scale-[1.01]"
            }`}
          >
            Sell
          </button>
        </div>


        <div className="text-xs text-gray-400">
          Order status: <span className={`${statusColor} font-medium`}>{status}</span>
        </div>
      </div>
    </div>
  );
}
