"use client";

import { useEffect, useMemo, useState } from "react";
import { useWebSocket } from "@/lib/WebSocketContext";

const CANCELABLE_STATUSES = new Set(["PENDING", "NEW", "PARTIALLY_FILLED", "SUBMITTED", "OPEN"]);

export default function OrderHistoryPanel({
  orders = [],
  symbol,
  maxItems,
  title,
  notice,
  onCancel,
}) {
  const { orders: wsOrders, orderHistory, allOrderHistory, orderHistoryMeta, getOrderHistory, loadOrderHistoryPage, changePageSize, getCurrentPageOrders, cancelOrder, connected } = useWebSocket();
  const [loading, setLoading] = useState(false);

  // Load all order history when connected
  useEffect(() => {
    if (connected && getOrderHistory) {
      setLoading(true);
      getOrderHistory(); // Tüm order history'yi çek
    }
  }, [connected, getOrderHistory]);

  // Loading state'i allOrderHistory yüklendiğinde güncelle
  useEffect(() => {
    if (allOrderHistory.length > 0) {
      setLoading(false);
    }
  }, [allOrderHistory]);

  // Transform order history ve mevcut sayfa için verileri hesapla
  const transformedAllOrders = useMemo(() => {
    if (allOrderHistory && allOrderHistory.length > 0) {
      return allOrderHistory.map(histOrder => {
        // Parse result if it's a string
        let parsedResult = histOrder.result;
        if (typeof histOrder.result === 'string') {
          try {
            parsedResult = JSON.parse(histOrder.result);
          } catch (e) {
            console.warn('Could not parse order result:', histOrder.result);
            parsedResult = {};
          }
        }
        const resolvedPrice = (() => {
          const candidates = [
            histOrder.price,
            histOrder.displayPrice,
            parsedResult?.price,
            parsedResult?.displayPrice,
            parsedResult?.avgPrice,
            parsedResult?.averagePrice,
            parsedResult?.executedPrice,
            parsedResult?.executionPrice,
            Array.isArray(parsedResult?.fills)
              ? parsedResult.fills.find((fill) => typeof fill?.price === "number")?.price
              : undefined,
            Array.isArray(parsedResult?.trades)
              ? parsedResult.trades.find((trade) => typeof trade?.price === "number")?.price
              : undefined,
          ];
          const numeric = candidates.find((value) => typeof value === "number" && !Number.isNaN(value) && value > 0);
          return numeric ?? 0;
        })();

        return {
          id: histOrder.order_id,
          orderId: histOrder.order_id,
          symbol: histOrder.symbol || parsedResult?.symbol || 'Unknown',
          side: histOrder.side || parsedResult?.side || 'Unknown',
          type: histOrder.type || parsedResult?.type || 'Unknown',
          qty: histOrder.quantity || parsedResult?.qty || parsedResult?.quantity || 0,
          price: resolvedPrice,
          displayPrice: resolvedPrice,
          status: histOrder.status,
          createdAt: histOrder.timestamp,
          idemp_key: histOrder.idemp_key,
          result: parsedResult
        };
      });
    }
    
    // Fallback: WebSocket orders veya passed orders
    if (wsOrders && wsOrders.length > 0) {
      return wsOrders;
    }
    
    if (orders && orders.length > 0) {
      return orders;
    }

    return [];
  }, [allOrderHistory, wsOrders, orders]);

  // Mevcut sayfa için order'ları hesapla
  const rows = useMemo(() => {
    const { currentPage, pageSize } = orderHistoryMeta;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    let source = transformedAllOrders;
    if (symbol) {
      source = transformedAllOrders.filter((o) => o.symbol === symbol);
    }
    
    // Frontend pagination
    const paginatedSource = source.slice(startIndex, endIndex);
    
    return typeof maxItems === "number" ? paginatedSource.slice(0, maxItems) : paginatedSource;
  }, [transformedAllOrders, symbol, maxItems, orderHistoryMeta]);

  const heading = title ?? (symbol ? `${symbol} Order History` : "Order History");
  const emptyMessage = symbol ? "No orders found for this symbol." : "No orders yet.";

  const formatDate = (iso) => {
    if (!iso) return "-";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    
    if (isCompact) {
      // Kompakt mod için sadece saat:dakika göster
      return date.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    
    return `${date.toLocaleDateString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit" })} ${date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
  };

  const canCancel = (order) => {
    if (!order?.id && !order?.orderId) return false;
    return CANCELABLE_STATUSES.has(order.status) && connected;
  };

  const handleCancel = (order) => {
    if (!canCancel(order)) return;
    
    const orderId = order.orderId || order.id;
    
    // Use WebSocket to cancel real orders
    if (connected && cancelOrder) {
      cancelOrder(orderId);
    }
    
    // Call parent callback if provided
    onCancel?.(orderId);
  };

  const handlePageChange = (newPage) => {
    if (loadOrderHistoryPage) {
      loadOrderHistoryPage(newPage); // Frontend'de sayfa değiştir, loading yok
    }
  };

  // Pagination bilgilerini hesapla
  const paginationInfo = useMemo(() => {
    const source = symbol ? transformedAllOrders.filter((o) => o.symbol === symbol) : transformedAllOrders;
    const { currentPage, pageSize } = orderHistoryMeta;
    const totalCount = source.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;
    
    return {
      totalCount,
      totalPages,
      hasNextPage,
      hasPrevPage,
      currentPage,
      pageSize
    };
  }, [transformedAllOrders, symbol, orderHistoryMeta]);

  // Ana ekran için kompakt mod
  const isCompact = typeof maxItems === "number" && maxItems <= 10;
  
  return (
    <div className={`glass rounded-lg border border-white/10 w-full ${isCompact ? 'p-3' : 'p-6'}`}>
      <div className={isCompact ? 'mb-1' : 'mb-2'}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold ${isCompact ? 'text-xs' : 'text-sm'}`}>{heading}</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-gray-400">
              {loading ? 'Loading...' : allOrderHistory.length > 0 ? 'Full History' : wsOrders && wsOrders.length > 0 ? 'WebSocket' : 'Local'}
            </span>
          </div>
        </div>
        {notice && !isCompact ? <p className="mt-1 text-xs text-gray-500">{notice}</p> : null}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">Loading order history...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-gray-400">{emptyMessage}</div>
      ) : (
        <div className={`w-full overflow-hidden ${isCompact ? 'max-h-64 overflow-y-auto' : ''}`}>
          <div className="overflow-x-auto max-w-full">
            <table className={`w-full border-collapse table-fixed min-w-0 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              <colgroup>
                {isCompact ? (
                  <>
                    <col className="w-20" />
                    <col className="w-14" />
                    <col className="w-10" />
                    <col className="w-16" />
                    <col className="w-14" />
                    <col className="w-18" />
                    <col className="w-14" />
                  </>
                ) : (
                  <>
                    <col className="w-32" />
                    <col className="w-24" />
                    <col className="w-20" />
                    <col className="w-28" />
                    <col className="w-24" />
                    <col className="w-32" />
                    <col className="w-24" />
                  </>
                )}
              </colgroup>
              <thead className={isCompact ? 'sticky top-0 bg-black/50' : ''}>
                <tr className="text-gray-400 border-b border-white/10">
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Date</th>
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Symbol</th>
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Side</th>
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Price</th>
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Quantity</th>
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Status</th>
                  <th className={`text-left ${isCompact ? 'py-0.5 px-1' : 'py-2 px-3'}`}>Action</th>
                </tr>
              </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.orderId || order.id || `${order.symbol}-${order.createdAt}`} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} text-gray-400 whitespace-nowrap truncate`}>{formatDate(order.createdAt)}</td>
                  <td className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} font-medium text-gray-300 truncate`}>{order.symbol}</td>
                  <td className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} ${order.side === "BUY" ? "text-green-400" : "text-red-400"} font-semibold truncate`}>
                    {order.side}
                  </td>
                  <td className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} truncate`}>
                    {order.type === "MARKET" && (!order.price || order.price <= 0)
                      ? "Market"
                      : `$${Number(order.price || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                  </td>
                  <td className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} truncate`}>{typeof order.qty === 'number' ? (order.qty || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) : order.qty}</td>
                <td
                  className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} font-medium truncate ${
                    order.status === "FILLED"
                      ? "text-green-400"
                      : order.status === "REJECTED"
                      ? "text-red-400"
                      : order.status === "CANCELED"
                      ? "text-yellow-400"
                      : order.status === "PARTIALLY_FILLED"
                      ? "text-orange-400"
                      : order.status === "PENDING" || order.status === "NEW" || order.status === "SUBMITTED"
                      ? "text-blue-400"
                      : "text-gray-400"
                  }`}
                >
                  {order.status}
                </td>
                <td className={`${isCompact ? 'px-1 py-0.5' : 'px-3 py-2'} truncate`}>
                  {canCancel(order) ? (
                    <button
                      type="button"
                      onClick={() => handleCancel(order)}
                      className={`rounded border border-white/10 hover:bg-white/10 transition ${isCompact ? 'px-1 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'}`}
                    >
                      {isCompact ? 'X' : 'Cancel'}
                    </button>
                  ) : (
                    <span className="text-gray-500 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls - Hide in compact mode */}
      {!isCompact && transformedAllOrders.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-gray-400">
              Showing {((paginationInfo.currentPage - 1) * paginationInfo.pageSize) + 1} to{" "}
              {Math.min(paginationInfo.currentPage * paginationInfo.pageSize, paginationInfo.totalCount)} of{" "}
              {paginationInfo.totalCount} orders
            </span>
            <label
              htmlFor="order-history-page-size"
              className="flex items-center gap-2 text-gray-500"
            >
              <span>Rows</span>
              <select
                id="order-history-page-size"
                value={paginationInfo.pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                className="text-xs border border-white/15 rounded px-2 py-1 bg-[#111827] text-gray-100 focus:outline-none focus:ring-1 focus:ring-white/30"
                style={{ color: "#E5E7EB", backgroundColor: "#111827" }}
              >
                <option value={10} className="bg-[#111827] text-gray-100">
                  10 per page
                </option>
                <option value={25} className="bg-[#111827] text-gray-100">
                  25 per page
                </option>
                <option value={50} className="bg-[#111827] text-gray-100">
                  50 per page
                </option>
                <option value={100} className="bg-[#111827] text-gray-100">
                  100 per page
                </option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(paginationInfo.currentPage - 1)}
              disabled={!paginationInfo.hasPrevPage}
              className="px-3 py-1 text-xs rounded border border-white/10 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <span className="px-3 py-1 text-xs text-gray-400">
              Page {paginationInfo.currentPage} of {paginationInfo.totalPages}
            </span>

            <button
              onClick={() => handlePageChange(paginationInfo.currentPage + 1)}
              disabled={!paginationInfo.hasNextPage}
              className="px-3 py-1 text-xs rounded border border-white/10 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
