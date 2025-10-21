"use client";
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";

const PricesContext = createContext(null);

export function PricesProvider({ children }) {
  const [prices, setPrices] = useState({});

  const setPrice = useCallback((symbol, price) => {
    setPrices((prev) => {
      // Only update if the price actually changed to prevent infinite loops
      if (prev[symbol] !== price) {
        return { ...prev, [symbol]: price };
      }
      return prev;
    });
  }, []);

  const value = useMemo(() => ({ prices, setPrice }), [prices, setPrice]);
  return <PricesContext.Provider value={value}>{children}</PricesContext.Provider>;
}

export function usePrices() {
  const ctx = useContext(PricesContext);
  if (!ctx) throw new Error("usePrices must be used within PricesProvider");
  return ctx;
}
