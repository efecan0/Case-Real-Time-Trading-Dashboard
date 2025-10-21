import React from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { PricesProvider } from "../lib/PricesContext";
import { WebSocketProvider, useWebSocket } from "../lib/WebSocketContext";
import HomePage from "./pages/HomePage";
import MarketDetailPage from "./pages/MarketDetailPage";
import OrderHistoryPage from "./pages/OrderHistoryPage";
import PerformancePage from "./pages/PerformancePage";
import "./globals.css";

// Toast Component
function ToastNotification() {
  const { toast, clearToast } = useWebSocket();

  if (!toast) return null;

  const variant = (() => {
    switch (toast.type) {
      case "success":
        return {
          container: "bg-green-600 text-white border border-green-500",
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ),
        };
      case "error":
        return {
          container: "bg-red-600 text-white border border-red-500",
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          ),
        };
      default:
        return {
          container: "bg-blue-600 text-white border border-blue-500",
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9 2a1 1 0 011 1v1.1a6.002 6.002 0 015.657 7.401 4 4 0 10-1.8 4.233A6 6 0 119 4.1V4a1 1 0 011-1z" />
            </svg>
          ),
        };
    }
  })();

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg transition-all duration-300 ${variant.container}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{variant.icon}</span>
        <div className="flex-1">
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={clearToast}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Dismiss notification"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WebSocketProvider>
      <PricesProvider>
        <div className="min-h-screen bg-[#0b0b10] text-gray-200 flex overflow-x-hidden">
          <aside className="w-64 hidden md:flex flex-col p-6 border-r border-white/5 flex-shrink-0">
            <Sidebar />
          </aside>
          <div className="flex-1 min-w-0 overflow-x-hidden">
            <main className="p-6 space-y-6 max-w-full">
              <header className="flex items-center justify-between mb-4">
                <Topbar />
              </header>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/market/:symbol" element={<MarketDetailPage />} />
                <Route path="/order-history" element={<OrderHistoryPage />} />
                <Route path="/performance" element={<PerformancePage />} />
              </Routes>
            </main>
          </div>
          <ToastNotification />
        </div>
      </PricesProvider>
    </WebSocketProvider>
  );
}
