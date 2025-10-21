"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const loadLightweightCharts = (() => {
  let promise;
  return () => {
    if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js";
        script.async = true;
        script.onload = () => resolve(window.LightweightCharts);
        script.onerror = () => reject(new Error("Lightweight Charts could not load"));
        document.head.appendChild(script);
      });
    }
    return promise;
  };
})();

const RANGE_OPTIONS = [
  { label: "50", value: 50 },
  { label: "120", value: 120 },
  { label: "240", value: 240 },
  { label: "All", value: null },
];

const INTERVAL_LABEL = {
  "1s": "1 second",
  "1m": "1 minute",
  "5m": "5 minutes",
  "1h": "1 hour",
};

const SERIES_BUILDERS = {
  candle: (chart) =>
    chart.addCandlestickSeries({
      upColor: "#22d3a6",
      downColor: "#ef4444",
      borderUpColor: "#22d3a6",
      borderDownColor: "#ef4444",
      wickUpColor: "#22d3a6",
      wickDownColor: "#ef4444",
    }),
  line: (chart) =>
    chart.addAreaSeries({
      topColor: "rgba(34,211,166,0.45)",
      bottomColor: "rgba(34,211,166,0.05)",
      lineColor: "#22d3a6",
      lineWidth: 2,
    }),
};

export default function TradingViewChart({ symbol = "BTC-USD", livePrice, historyData }) {
  const [chartType, setChartType] = useState("candle");
  const [interval, setIntervalValue] = useState("1s");
  const [displayCount, setDisplayCount] = useState(240);
  const [trigger, setTrigger] = useState(0);
  const [chartReady, setChartReady] = useState(false);
  const [chartError, setChartError] = useState(null);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLineRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const didInitRef = useRef(false);
  const prevDisplayCountRef = useRef(displayCount);

  const baseDataRef = useRef([]);

  // Only use real WebSocket livePrice, no fake data
  const latestKnownPrice = typeof livePrice === "number" ? livePrice : null;

  // Don't show history data on chart, only show in side panel
  // Chart will only show live data

  // Clear chart when symbol changes
  useEffect(() => {
    baseDataRef.current = [];
    setTrigger(prev => prev + 1);
  }, [symbol]);

  // Only use real WebSocket livePrice
  useEffect(() => {
    // Update chart only if real livePrice exists
    if (typeof livePrice === "number") {
      const now = Date.now();
      const raw = [...baseDataRef.current];
      
      // If no data, start new candle
      if (raw.length === 0) {
        baseDataRef.current = [{
          ts: now,
          open: livePrice,
          high: livePrice,
          low: livePrice,
          close: livePrice,
        }];
        setTrigger(prev => prev + 1);
        return;
      }
      
      const last = raw[raw.length - 1];

      // Update current candle if within same second
      if (last && Math.floor(last.ts / 1000) === Math.floor(now / 1000)) {
        raw[raw.length - 1] = {
          ...last,
          close: livePrice,
          high: Math.max(last.high, livePrice),
          low: Math.min(last.low, livePrice),
        };
      } else {
        // Yeni mum oluştur
        const newCandle = {
          ts: now,
          open: last ? last.close : livePrice,
          high: livePrice,
          low: livePrice,
          close: livePrice,
        };
        raw.push(newCandle);
        // Maksimum 500 mum tut (performans için)
        if (raw.length > 500) raw.shift();
      }

      baseDataRef.current = raw;
      setTrigger((prev) => prev + 1);
    }
  }, [livePrice]);

  const aggregatedData = useMemo(() => {
    const raw = baseDataRef.current;
    const secPerCandle = intervalToSeconds(interval);
    if (!raw.length) return [];

    const grouped = [];
    let bucket = [];
    let startBucket = Math.floor(raw[0].ts / 1000 / secPerCandle);

    for (const c of raw) {
      const currentBucket = Math.floor(c.ts / 1000 / secPerCandle);
      if (currentBucket !== startBucket && bucket.length) {
        grouped.push(aggregate(bucket));
        bucket = [];
        startBucket = currentBucket;
      }
      bucket.push(c);
    }

    if (bucket.length) grouped.push(aggregate(bucket));
    return grouped;
  }, [interval, trigger, symbol]);

  const displayedData = useMemo(() => {
    if (!displayCount) return aggregatedData;
    return aggregatedData.slice(-displayCount);
  }, [aggregatedData, displayCount]);

  const latestCandle = displayedData[displayedData.length - 1] ?? aggregatedData.at(-1);
  const latestPrice = latestCandle?.close ?? latestKnownPrice;
  const previousClose =
    displayedData.length > 1 ? displayedData[displayedData.length - 2]?.close : aggregatedData.at(-2)?.close;
  const priceDelta = latestPrice != null && previousClose != null ? latestPrice - previousClose : 0;
  const priceDeltaPct =
    latestPrice != null && previousClose
      ? previousClose === 0
        ? 0
        : (priceDelta / previousClose) * 100
      : 0;

  useEffect(() => {
    let active = true;
    let localChart;

    loadLightweightCharts()
      .then((LW) => {
        if (!LW || !containerRef.current || !active) return;
        setChartError(null);

        localChart = LW.createChart(containerRef.current, {
          layout: {
            background: { color: "transparent" },
            textColor: "#9ca3af",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "#1f2937" },
            horzLines: { color: "#1f2937" },
          },
          rightPriceScale: {
            borderColor: "rgba(148,163,184,0.25)",
          },
          timeScale: {
            borderColor: "rgba(148,163,184,0.25)",
            timeVisible: true,
            secondsVisible: interval === "1s",
          },
          crosshair: {
            mode: LW.CrosshairMode.Normal,
          },
          autoSize: true,
        });

        chartRef.current = localChart;
        priceLineRef.current = null;
        seriesRef.current = SERIES_BUILDERS[chartType](localChart);
        setChartReady(true);

        resizeObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || !localChart) return;
          localChart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        resizeObserverRef.current.observe(containerRef.current);
      })
      .catch((err) => setChartError(err.message || "Chart could not initialise"));

    return () => {
      active = false;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (chartRef.current && seriesRef.current) {
        chartRef.current.removeSeries(seriesRef.current);
      }
      priceLineRef.current = null;
      seriesRef.current = null;
      chartRef.current?.remove?.();
      chartRef.current = null;
      setChartReady(false);
    };
  }, [interval, chartType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    seriesRef.current = SERIES_BUILDERS[chartType](chart);
    priceLineRef.current = null;
    didInitRef.current = false;
  }, [chartType, chartReady]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !chartReady) return;

    updateSeriesData(series, chartType, displayedData);

    if (!displayedData.length) return;

    chart.timeScale().scrollToRealTime();
    if (!didInitRef.current || prevDisplayCountRef.current !== displayCount) {
      chart.timeScale().fitContent();
      didInitRef.current = true;
    }

    prevDisplayCountRef.current = displayCount;
  }, [displayedData, chartReady, chartType, displayCount]);

  useEffect(() => {
    const series = seriesRef.current;
    const price = latestPrice;
    if (!chartReady || !series || price == null) return;

    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }

    priceLineRef.current = series.createPriceLine({
      price: round(price),
      color: "#22d3a6",
      lineWidth: 1,
      axisLabelVisible: true,
      title: "Spot",
    });
  }, [latestPrice, chartReady, chartType]);

  const priceColor = priceDelta >= 0 ? "text-green-400" : "text-red-400";

  // History data statistics - detailed
  const historyStats = useMemo(() => {
    if (!historyData || !Array.isArray(historyData) || historyData.length === 0) {
      return null;
    }

    const prices = historyData.map(c => c.close);
    const highs = historyData.map(c => c.high);
    const lows = historyData.map(c => c.low);
    const opens = historyData.map(c => c.open);
    
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const firstOpen = opens[0];
    
    // Price change calculations
    const yearChange = firstPrice ? ((lastPrice - firstPrice) / firstPrice * 100) : 0;
    const priceRange = highest - lowest;
    const rangePercent = firstPrice ? (priceRange / firstPrice * 100) : 0;
    
    // Volatility calculation (standard deviation)
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance);
    const volatilityPercent = firstPrice ? (volatility / firstPrice * 100) : 0;
    
    // OHLC analizi
    const greenCandles = historyData.filter(c => c.close > c.open).length;
    const redCandles = historyData.filter(c => c.close < c.open).length;
    const dojis = historyData.filter(c => Math.abs(c.close - c.open) < (c.high - c.low) * 0.1).length;
    
    // Date range
    const daysAgo = Math.floor(historyData.length / 24);
    const weeksAgo = Math.floor(daysAgo / 7);
    const monthsAgo = Math.floor(daysAgo / 30);
    
    return {
      totalCandles: historyData.length,
      daysAgo,
      weeksAgo,
      monthsAgo,
      highest: { value: formatPrice(highest), raw: highest },
      lowest: { value: formatPrice(lowest), raw: lowest },
      firstPrice: { value: formatPrice(firstPrice), raw: firstPrice },
      lastPrice: { value: formatPrice(lastPrice), raw: lastPrice },
      yearChange: yearChange.toFixed(2),
      priceRange: { value: formatPrice(priceRange), raw: priceRange },
      rangePercent: rangePercent.toFixed(2),
      volatility: { value: formatPrice(volatility), raw: volatility },
      volatilityPercent: volatilityPercent.toFixed(2),
      candles: {
        total: historyData.length,
        green: greenCandles,
        red: redCandles,
        doji: dojis,
        greenPercent: ((greenCandles / historyData.length) * 100).toFixed(1)
      }
    };
  }, [historyData]);

  return (
    <div className="glass p-4 rounded-lg">
      <div className="flex justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold">{symbol} Chart</h3>
          <div className="text-xs text-gray-400">
            Last price:
            {latestPrice != null ? (
              <span className={priceColor}>
                {" "}
                {formatPrice(latestPrice)} ({priceDelta >= 0 ? "+" : ""}
                {formatNumber(priceDelta)} / {priceDelta >= 0 ? "+" : ""}
                {priceDeltaPct.toFixed(2)}%)
              </span>
            ) : (
              <span className="text-gray-500"> loading...</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label
            htmlFor="chart-interval-select"
            className="flex items-center gap-2 text-gray-500"
          >
            <span>Interval</span>
            <select
              id="chart-interval-select"
              value={interval}
              onChange={(e) => setIntervalValue(e.target.value)}
              className="text-xs border border-white/15 rounded px-2 py-1 bg-[#111827] text-gray-100 focus:outline-none focus:ring-1 focus:ring-white/30"
              style={{ color: "#E5E7EB", backgroundColor: "#111827" }}
            >
              <option value="1s" className="bg-[#111827] text-gray-100">
                1s
              </option>
              <option value="1m" className="bg-[#111827] text-gray-100">
                1m
              </option>
              <option value="5m" className="bg-[#111827] text-gray-100">
                5m
              </option>
              <option value="1h" className="bg-[#111827] text-gray-100">
                1h
              </option>
            </select>
          </label>
          <button
            onClick={() => setChartType(chartType === "line" ? "candle" : "line")}
            className="px-3 py-1 border border-white/10 rounded hover:bg-white/10 transition"
          >
            {chartType === "line" ? "Candlestick" : "Line"}
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Chart Area */}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
            <span className="text-gray-400">Zoom</span>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setDisplayCount(opt.value)}
                className={`px-2 py-1 rounded border border-white/10 transition ${
                  displayCount === opt.value ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full h-80" ref={containerRef}>
            {!chartReady && !chartError && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                Preparing chart...
              </div>
            )}
            {chartError && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400">
                {chartError}
              </div>
            )}
          </div>

          <div className="mt-3 text-xs text-gray-400">
            View: <span className="text-green-400 uppercase">{chartType}</span> • Interval: {INTERVAL_LABEL[interval]}
          </div>
        </div>

        {/* History Info Panel - Detaylı */}
        {historyStats && (
          <div className="w-80 bg-black/20 rounded-lg p-4 border border-white/10 max-h-96 overflow-y-auto">
            <h4 className="text-sm font-semibold mb-4 text-blue-400">📊 Detailed Historical Analysis</h4>
            
            {/* Period & Data Info */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold text-gray-300 mb-2">📅 Period Information</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Data range:</span>
                  <span className="text-white">{historyStats.monthsAgo > 0 ? `${historyStats.monthsAgo}m ` : ''}{historyStats.weeksAgo > 0 ? `${historyStats.weeksAgo}w ` : ''}{historyStats.daysAgo}d</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total candles:</span>
                  <span className="text-white">{historyStats.totalCandles.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Price Analysis */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold text-gray-300 mb-2">💰 Price Analysis</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Current:</span>
                  <span className={typeof livePrice === "number" ? (livePrice >= parseFloat(historyStats.firstPrice.raw) ? "text-green-400" : "text-red-400") : "text-white"}>
                    {typeof livePrice === "number" ? formatPrice(livePrice) : historyStats.lastPrice.value}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Started at:</span>
                  <span className="text-white">{historyStats.firstPrice.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Highest:</span>
                  <span className="text-green-400">{historyStats.highest.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lowest:</span>
                  <span className="text-red-400">{historyStats.lowest.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price range:</span>
                  <span className="text-yellow-400">{historyStats.priceRange.value}</span>
                </div>
              </div>
            </div>

            {/* Performance */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold text-gray-300 mb-2">📈 Performance</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total change:</span>
                  {(() => {
                    const currentPrice = typeof livePrice === "number" ? livePrice : historyStats.lastPrice.raw;
                    const changePercent = historyStats.firstPrice.raw ? ((currentPrice - historyStats.firstPrice.raw) / historyStats.firstPrice.raw * 100) : 0;
                    const isPositive = changePercent >= 0;
                    return (
                      <span className={isPositive ? "text-green-400" : "text-red-400"}>
                        {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
                      </span>
                    );
                  })()}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Range %:</span>
                  <span className="text-yellow-400">{historyStats.rangePercent}%</span>
                </div>
              </div>
            </div>

            {/* Volatility */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold text-gray-300 mb-2">📊 Volatility</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Std deviation:</span>
                  <span className="text-purple-400">{historyStats.volatility.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Volatility %:</span>
                  <span className="text-purple-400">{historyStats.volatilityPercent}%</span>
                </div>
              </div>
            </div>

            {/* Candle Analysis */}
            <div>
              <h5 className="text-xs font-semibold text-gray-300 mb-2">🕯️ Candle Analysis</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Bullish:</span>
                  <span className="text-green-400">{historyStats.candles.green} ({historyStats.candles.greenPercent}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bearish:</span>
                  <span className="text-red-400">{historyStats.candles.red}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Doji:</span>
                  <span className="text-gray-300">{historyStats.candles.doji}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function intervalToSeconds(intv) {
  if (intv === "1s") return 1;
  if (intv === "1m") return 60;
  if (intv === "5m") return 300;
  return 3600;
}

function aggregate(bucket) {
  const first = bucket[0];
  const last = bucket[bucket.length - 1];
  return {
    ts: last.ts,
    open: first.open,
    close: last.close,
    high: Math.max(...bucket.map((c) => c.high)),
    low: Math.min(...bucket.map((c) => c.low)),
  };
}

function updateSeriesData(series, type, data) {
  if (!series) return;
  if (type === "candle") {
    const formatted = data.map((d) => ({
      time: Math.floor(d.ts / 1000),
      open: round(d.open),
      high: round(d.high),
      low: round(d.low),
      close: round(d.close),
    }));
    series.setData(formatted);
  } else {
    const formatted = data.map((d) => ({
      time: Math.floor(d.ts / 1000),
      value: round(d.close),
    }));
    series.setData(formatted);
  }
}

function getBasePrice(symbol) {
  switch (symbol) {
    case "BTC-USD":
      return 52000;
    case "ETH-USD":
      return 3000;
    case "XRP-USD":
      return 0.62;
    case "BNB-USD":
      return 602;
    case "SOL-USD":
      return 184.23;
    case "ADA-USD":
      return 0.42;
    case "DOGE-USD":
      return 0.091;
    case "AVAX-USD":
      return 38.6;
    case "DOT-USD":
      return 7.21;
    case "MATIC-USD":
      return 0.83;
    case "LTC-USD":
      return 94.35;
    case "LINK-USD":
      return 18.55;
    case "ATOM-USD":
      return 9.43;
    case "UNI-USD":
      return 6.75;
    case "APT-USD":
      return 10.83;
    case "AR-USD":
      return 27.14;
    case "FIL-USD":
      return 5.73;
    case "NEAR-USD":
      return 6.21;
    case "SUI-USD":
      return 1.43;
    case "PEPE-USD":
      return 0.00000112;
    default:
      return 100;
  }
}

function round(value) {
  if (value == null) return value;
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return Number(num.toFixed(6));
}

function formatPrice(value) {
  if (value == null) return "-";
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatNumber(value) {
  if (value == null) return "0";
  if (Math.abs(value) >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
