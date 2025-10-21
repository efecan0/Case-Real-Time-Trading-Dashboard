"use client";
import { useWebSocket } from "@/lib/WebSocketContext";

/**
 * ConnectionStatus — WebSocket bağlantı durumunu gösterir
 * Real-time WebSocket connection state display
 */

export default function ConnectionStatus() {
  const { connectionState, connected } = useWebSocket();

  // Determine status based on connection state
  const getStatus = () => {
    if (connectionState.connected && connectionState.sessionId) return "connected";
    if (connectionState.reconnectAttempts > 0) return "reconnecting";
    return "disconnected";
  };

  const status = getStatus();

  const colorMap = {
    connected: "bg-green-500",
    reconnecting: "bg-yellow-400",
    disconnected: "bg-red-500",
  };

  const labelMap = {
    connected: "Connected",
    reconnecting: `Reconnecting... (${connectionState.reconnectAttempts})`,
    disconnected: "Disconnected",
  };

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 border border-white/10 rounded-md px-3 py-1 glass">
      <span className={`w-3 h-3 rounded-full ${colorMap[status]}`}></span>
      <span>{labelMap[status]}</span>
      {connectionState.sessionId && (
        <span className="text-gray-500 ml-2">
          ({connectionState.userId?.substring(0, 8)}...)
        </span>
      )}
    </div>
  );
}
