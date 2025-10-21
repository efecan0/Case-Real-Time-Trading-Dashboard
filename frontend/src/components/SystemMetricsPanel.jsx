"use client";
import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/WebSocketContext";

/**
 * SystemMetricsPanel — gerçek zamanlı sistem metriklerini gösterir.
 * UML: Metrics { latencyMs, throughput, errorRate, connCount }
 * Ayrıca AlertingService.evaluate() mantığına benzer kritik eşik göstergesi içerir.
 */

export default function SystemMetricsPanel() {
  const { metrics: wsMetrics, getMetricsData } = useWebSocket();
  const [metrics, setMetrics] = useState({
    latencyMs: 12,
    throughput: 12340,
    errorRate: 0.12,
    connCount: 40,
    uptimeMs: 0,
    totalOrders: 0,
    totalCancels: 0,
    totalErrors: 0,
    activeSessions: 0
  });

  const [alert, setAlert] = useState(null);

  useEffect(() => {
    // Load metrics data on mount
    getMetricsData();
  }, [getMetricsData]);

  // Update metrics from WebSocket data
  useEffect(() => {
    if (wsMetrics && typeof wsMetrics === 'object') {
      console.log('📊 SystemMetricsPanel received metrics:', wsMetrics);
      
      // Handle new API format with systemPerformance object
      const systemPerf = wsMetrics.systemPerformance || {};
      const newMetrics = {
        latencyMs: systemPerf.latency?.avg || wsMetrics.latencyMs || 0,
        throughput: systemPerf.throughput?.value || wsMetrics.throughput || 0,
        errorRate: systemPerf.errorRate?.value ? systemPerf.errorRate.value / 100 : wsMetrics.errorRate || 0, // Convert % to decimal
        connCount: systemPerf.connectionCount?.value || wsMetrics.connCount || 0,
        uptimeMs: wsMetrics.uptimeMs || wsMetrics.ts || 0,
        totalOrders: systemPerf.totalOrders?.value || wsMetrics.totalOrders || 0,
        totalCancels: systemPerf.cancelled?.value || wsMetrics.totalCancels || 0,
        totalErrors: systemPerf.errors?.value || wsMetrics.totalErrors || 0,
        activeSessions: systemPerf.activeSessions?.value || wsMetrics.activeSessions || 0
      };
      
      setMetrics(prev => ({
        ...prev,
        ...newMetrics
      }));

      // Alert detection using new format
      const latency = newMetrics.latencyMs;
      const errorRate = newMetrics.errorRate * 100; // Convert to percentage for comparison
      
      if (latency > 100 || errorRate > 1) {
        setAlert({
          message: "System threshold exceeded!",
          severity: latency > 100 ? "latency" : "errorRate",
          value: latency > 100 ? latency.toFixed(1) : errorRate.toFixed(2),
        });
      } else {
        setAlert(null);
      }
    }
  }, [wsMetrics]);

  return (
    <div className="glass p-4 rounded-lg border border-white/10">
      <h3 className="text-sm font-semibold mb-3">System Performance</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricBox
          label="Latency (avg)"
          value={`${metrics.latencyMs.toFixed(1)} ms`}
          sub="p95"
          color={metrics.latencyMs > 80 ? "text-red-400" : "text-green-400"}
        />
        <MetricBox
          label="Throughput"
          value={`${metrics.throughput.toFixed(0)} tx/s`}
          sub="1m avg."
        />
        <MetricBox
          label="Error Rate"
          value={`${(metrics.errorRate * 100).toFixed(2)}%`}
          sub="Last 5 min"
          color={metrics.errorRate > 0.01 ? "text-red-400" : "text-green-400"}
        />
        <MetricBox
          label="Connection Count"
          value={metrics.connCount}
          sub="active"
        />
      </div>

      {/* Additional metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <MetricBox
          label="Total Orders"
          value={metrics.totalOrders || 0}
          sub="lifetime"
        />
        <MetricBox
          label="Cancelled"
          value={metrics.totalCancels || 0}
          sub="total"
        />
        <MetricBox
          label="Errors"
          value={metrics.totalErrors || 0}
          sub="total"
        />
        <MetricBox
          label="Active Sessions"
          value={metrics.activeSessions || 0}
          sub="current"
        />
      </div>

      {/* Alerts */}
      <div className="mt-4 text-xs">
        {alert ? (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 flex justify-between items-center">
            <span>
              ⚠️ {alert.message} ({alert.severity}: {alert.value})
            </span>
            <button
              className="text-[10px] border border-red-500/40 px-2 py-1 rounded hover:bg-red-500/20"
              onClick={() => setAlert(null)}
            >
              Close
            </button>
          </div>
        ) : (
          <div className="text-gray-400 border border-white/10 rounded-md p-2 text-center">
            System status: <span className="text-green-400">Normal</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MetricBox — alt bileşen: her bir metrik için mini kart
 */
function MetricBox({ label, value, sub, color = "text-gray-200" }) {
  return (
    <div className="p-3 rounded-md glass border border-white/10 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-2 text-lg font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
