import { useEffect, useState } from "react";
import SystemMetricsPanel from "../../components/SystemMetricsPanel";
import AlertRulesPanel from "../../components/AlertRulesPanel";

export default function PerformancePage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Mock performance data (will be fetched from here when backend integration comes)
    const mockStats = {
      totalTrades: 128,
      profitableTrades: 87,
      successRate: (87 / 128) * 100,
      avgHoldingTime: "2h 15m",
      totalProfit: 15430.45,
      totalLoss: -3480.22,
      bestTrade: 890,
      worstTrade: -420,
    };

    setStats(mockStats);
  }, []);

  if (!stats) {
    return <div className="p-6 text-sm text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-green-400">Performance Summary</h1>
      <p className="text-gray-400 text-sm">
        System statistics.
      </p>

      {/* System metrics */}
      <SystemMetricsPanel />
      <AlertRulesPanel />
    </div>
  );
}
