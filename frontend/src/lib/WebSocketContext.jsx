"use client";
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getWebSocketInstance } from './websocket';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [connectionState, setConnectionState] = useState({
    connected: false,
    sessionId: null,
    userId: null,
    roles: [],
    reconnectAttempts: 0
  });
  
  const [marketData, setMarketData] = useState({});
  const [orders, setOrders] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [allOrderHistory, setAllOrderHistory] = useState([]);
  const [orderHistoryMeta, setOrderHistoryMeta] = useState({
    currentPage: 1,
    pageSize: 10,
    totalCount: 0
  });
  const [alerts, setAlerts] = useState({});
  const [metrics, setMetrics] = useState({});
  const [historyData, setHistoryData] = useState({});
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const pendingOrders = useRef(new Map()); // Store pending order data by idempotencyKey
  
  const wsClientRef = useRef(null);

  // Initialize WebSocket client
  useEffect(() => {
    if (!wsClientRef.current) {
      wsClientRef.current = getWebSocketInstance();
      
      // Connection status listeners
      wsClientRef.current.on('connectionStatus', (status) => {
        setConnectionState(prev => ({
          ...prev,
          connected: status === 'connected',
          reconnectAttempts: status === 'reconnecting' ? prev.reconnectAttempts + 1 : 0
        }));
      });

      // Authentication listener
      wsClientRef.current.on('hello', (authData) => {
        setConnectionState(prev => ({
          ...prev,
          connected: true, // Mark as connected after successful authentication
          sessionId: authData.sessionId,
          userId: authData.userId,
          roles: authData.roles
        }));
        
        // Start metrics refresh timer after authentication
        const metricsTimer = setInterval(() => {
          if (wsClientRef.current) {
            wsClientRef.current.getMetrics();
          }
        }, 5000); // Refresh every 5 seconds
        
        // Store timer reference for cleanup
        wsClientRef.current._metricsTimer = metricsTimer;
      });

      // Market data listeners
      wsClientRef.current.on('marketTick', (tickData) => {
        // console.log('📊 MarketDataPanel received tick:', tickData);
        // console.log('📊 TickData type:', typeof tickData, 'Is object:', typeof tickData === 'object');
        
        // tickData bir object olmalı
        if (typeof tickData !== 'object' || tickData === null) {
          console.error('❌ Invalid tick data format:', tickData);
          return;
        }
        
        // symbol field'ı olmalı
        if (!tickData.symbol) {
          console.error('❌ Missing symbol in tick data:', tickData);
          return;
        }
        
        setMarketData(prev => {
          const newData = {
            ...prev,
            [tickData.symbol]: {
              symbol: tickData.symbol,
              price: tickData.price || tickData.last, // Dokümanda 'price', eski kodda 'last'
              bid: tickData.bid,
              ask: tickData.ask,
              volume: tickData.volume,
              timestamp: tickData.timestamp
            }
          };
          // console.log(`📊 React Context updating market data for ${tickData.symbol}:`, newData);
          return newData;
        });
      });

      wsClientRef.current.on('marketSubscribed', (result) => {
        // console.log('🔔 MarketDataPanel - subscription result:', result);
      });

      // Order listeners
      wsClientRef.current.on('orderPlaced', (result) => {
        console.log('📤 Order placed response:', result);
        console.log('🔍 Event listener triggered for orderId:', result?.orderId);
        
        // Map status codes to status strings
        const getOrderStatus = (statusCode) => {
          switch (statusCode) {
            case 1: return 'PENDING';      // ACK
            case 4: return 'FILLED';       // FILLED
            case 5: return 'REJECTED';     // REJECTED
            case -1: return 'ERROR';       // ERROR
            default: return 'PENDING';
          }
        };

        // Determine if this is an error
        const isError = result.status === -1 || result.status === 5 || result.error;
        const isInternalError = result.status === -1;
        
        if (result && result.orderId) {
          // Request sends 'qty' but response returns 'quantity' - map accordingly
          const orderQuantity = result.quantity || result.qty || 0;
          
          const resolvedPrice = (() => {
            const priceOptions = [
              result.price,
              result.displayPrice,
              result.avgPrice,
              result.averagePrice,
              result.executedPrice,
              result.executionPrice,
              result.fillPrice,
              Array.isArray(result.fills) ? result.fills.find((fill) => typeof fill?.price === "number")?.price : undefined,
              Array.isArray(result.trades) ? result.trades.find((trade) => typeof trade?.price === "number")?.price : undefined,
            ];
            const numeric = priceOptions.find((value) => typeof value === "number" && !Number.isNaN(value) && value > 0);
            return numeric ?? 0;
          })();

          const newOrder = {
            id: result.orderId,
            order_id: result.orderId,
            symbol: result.symbol || 'Unknown',
            side: result.side || 'Unknown',
            type: result.type || 'Unknown',
            qty: orderQuantity,  // Map response.quantity to qty for UI compatibility
            quantity: orderQuantity,  // Keep quantity field for order history compatibility
            price: resolvedPrice,
            displayPrice: resolvedPrice,
            status: getOrderStatus(result.status),
            timestamp: new Date().toISOString(),
            orderId: result.orderId,
            echoKey: result.echoKey || result.idempotencyKey || '',
            reason: result.reason || '',
            sessionId: result.sessionId || '',
            idemp_key: result.echoKey || result.idempotencyKey || '',
            idempotencyKey: result.idempotencyKey || result.echoKey || ''
          };

          console.log('📥 Order Place Response mapped:', {
            original: { quantity: result.quantity, qty: result.qty },
            mapped: { qty: newOrder.qty, quantity: newOrder.quantity }
          });

          // Add to real-time orders (avoid duplicates)
          setOrders(prev => {
            const exists = prev.some(order => order.orderId === newOrder.orderId);
            if (exists) {
              console.log('🚫 Duplicate order prevented in real-time orders:', newOrder.orderId);
              return prev;
            }
            console.log('✅ Adding new order to real-time orders:', newOrder.orderId);
            return [newOrder, ...prev.slice(0, 49)];
          });

          // Add to order history (add to beginning - newest first, avoid duplicates)
          setAllOrderHistory(prev => {
            const exists = prev.some(order => order.orderId === newOrder.orderId || order.order_id === newOrder.orderId);
            if (exists) {
              console.log('🚫 Duplicate order prevented in order history:', newOrder.orderId);
              return prev;
            }
            console.log('✅ Adding new order to order history:', newOrder.orderId);
            return [newOrder, ...prev];
          });

          // Show toast based on status
          if (result.status === 4) {
            setToast({
              type: 'success',
              message: `Order ${result.orderId} filled successfully!`
            });
          } else if (result.status === 1) {
            setToast({
              type: 'success', 
              message: `Order ${result.orderId} placed successfully`
            });
          } else if (result.status === 5) {
            setToast({
              type: 'error',
              message: `Order rejected: ${result.reason || 'Risk validation failed'}`
            });
          } else if (isInternalError) {
            setToast({
              type: 'error',
              message: `Order failed: ${result.reason || 'Internal error'}`
            });
          }

          // Auto hide toast
          const toastTimeout = (result.status === 5 || isInternalError) ? 5000 : 3000;
          setTimeout(() => setToast(null), toastTimeout);
        } else if (result && result.error) {
          setError(result.error);
          setToast({
            type: 'error',
            message: `Order failed: ${result.error.message || 'Unknown error'}`
          });
          setTimeout(() => setToast(null), 5000);
        }
      });

      wsClientRef.current.on('orderCancelled', (result) => {
        if (result && !result.error && result.orderId) {
          // Update real-time orders
          setOrders(prev => prev.map(order => 
            order.orderId === result.orderId 
              ? { ...order, status: 'CANCELLED' }
              : order
          ));
          
          // Update all order history
          setAllOrderHistory(prev => prev.map(order => 
            order.order_id === result.orderId 
              ? { ...order, status: 'CANCELLED' }
              : order
          ));
          
          // Show success toast
          setToast({
            type: 'success',
            message: result.message || `Order ${result.orderId} cancelled successfully`
          });
          
          // Auto hide toast after 3 seconds
          setTimeout(() => setToast(null), 3000);
        } else if (result && result.error) {
          // Show error toast
          setToast({
            type: 'error',
            message: result.error.message || 'Failed to cancel order'
          });
          
          // Auto hide toast after 5 seconds
          setTimeout(() => setToast(null), 5000);
        }
      });

      wsClientRef.current.on('orderStatus', (result) => {
        if (result && !result.error && result.orderId) {
          setOrders(prev => prev.map(order => 
            order.orderId === result.orderId 
              ? { ...order, status: result.status }
              : order
          ));
        }
      });

      wsClientRef.current.on('orderHistory', (result) => {
        console.log('📄 OrderHistory listener received:', result);
        console.log('📄 Result type:', typeof result, 'has error:', result && result.error, 'has orders:', result && result.orders);
        console.log('📄 Result keys:', result && typeof result === 'object' ? Object.keys(result) : 'not an object');
        
        // Handle different response formats
        let orders = null;
        let count = 0;
        let isError = false;
        
        if (result && result.error) {
          // Error case
          isError = true;
          console.error('📄 Order history error:', result.error);
          setError(result.error);
        } else if (result && result.orders && Array.isArray(result.orders)) {
          // Standard case: {orders: [], count: number}
          orders = result.orders;
          count = result.count || result.orders.length;
        } else if (result && Array.isArray(result)) {
          // Direct array case: [order1, order2, ...]
          orders = result;
          count = result.length;
        } else if (result && result.data && Array.isArray(result.data)) {
          // Alternative case: {data: [], count: number}
          orders = result.data;
          count = result.count || result.data.length;
        }
        
        if (orders && !isError) {
          // Store all order history
          setAllOrderHistory(orders);
          
          // Update pagination metadata
          setOrderHistoryMeta(prev => ({
            ...prev,
            totalCount: count
          }));
          
          console.log('📄 All Order History loaded:', {
            totalOrders: orders.length,
            totalCount: count,
            responseFormat: result.orders ? 'standard' : Array.isArray(result) ? 'direct_array' : 'alternative'
          });
        } else if (!isError) {
          console.warn('📄 Order history - unexpected result format:', result);
          console.warn('📄 Expected formats: {orders: [], count: number} | [orders...] | {data: [], count: number}');
        }
      });

      // Alert listeners
      wsClientRef.current.on('alertPush', (alertData) => {
        console.log('🚨 Alert push received:', alertData);
        
        // Handle new API format with type field and alerts object
        if (alertData && alertData.type === 'metrics_alert' && alertData.alerts) {
          setAlerts(prev => ({
            ...prev,
            ...alertData.alerts
          }));
          
          // Show toast for critical alerts
          Object.values(alertData.alerts).forEach(alert => {
            if (alert && alert.status === 'alert') {
              setToast({
                type: 'error',
                message: alert.message || 'System alert triggered'
              });
              setTimeout(() => setToast(null), 5000);
            }
          });
        } else if (alertData && alertData.alerts) {
          // Backward compatibility with old format
          setAlerts(prev => ({
            ...prev,
            ...alertData.alerts
          }));
          
          Object.values(alertData.alerts).forEach(alert => {
            if (alert && alert.status === 'alert') {
              setToast({
                type: 'error',
                message: alert.message || 'System alert triggered'
              });
              setTimeout(() => setToast(null), 5000);
            }
          });
        }
      });

      wsClientRef.current.on('alertsList', (result) => {
        console.log('📊 Alerts list received:', result);
        if (result && result.alerts) {
          setAlerts(result.alerts);
        } else if (result && result.error) {
          console.error('❌ Alerts list error:', result.error);
        }
      });

      // Metrics listeners
      wsClientRef.current.on('metrics', (result) => {
        console.log('📊 Metrics received:', result);
        if (result && !result.error) {
          setMetrics(result);
        } else if (result && result.error) {
          console.error('❌ Metrics error:', result.error);
        }
      });

      // Additional alert event listeners
      wsClientRef.current.on('alertsSubscribed', (result) => {
        console.log('🔔 Alerts subscription:', result);
        if (result && result.error) {
          console.error('❌ Alerts subscription error:', result.error);
        }
      });

      wsClientRef.current.on('alertRegistered', (result) => {
        console.log('✅ Alert rule registered:', result);
        if (result && result.error) {
          console.error('❌ Alert registration error:', result.error);
          setToast({
            type: 'error',
            message: `Alert registration failed: ${result.error.message || 'Unknown error'}`
          });
          setTimeout(() => setToast(null), 5000);
        } else if (result && result.ruleId) {
          setToast({
            type: 'success',
            message: `Alert rule "${result.ruleId}" registered successfully`
          });
          setTimeout(() => setToast(null), 3000);
        }
      });

      wsClientRef.current.on('alertDisabled', (result) => {
        console.log('✅ Alert rule disabled:', result);
        if (result && result.error) {
          console.error('❌ Alert disable error:', result.error);
          setToast({
            type: 'error',
            message: `Alert disable failed: ${result.error.message || 'Unknown error'}`
          });
          setTimeout(() => setToast(null), 5000);
        } else if (result && result.ruleId) {
          setToast({
            type: 'success',
            message: `Alert rule "${result.ruleId}" disabled successfully`
          });
          setTimeout(() => setToast(null), 3000);
        }
      });

      // History data listeners
      wsClientRef.current.on('historyData', (result) => {
        // console.log('📊 History data received:', result);
        if (result && result.symbol) {
          // console.log('📊 Setting history data for', result.symbol, 'candles:', result.candles?.length);
          setHistoryData(prev => ({
            ...prev,
            [result.symbol]: result.candles || []
          }));
        }
      });

      // Error listener
      wsClientRef.current.on('error', (error) => {
        setError(error);
        console.error('WebSocket error:', error);
      });
    }

    return () => {
      if (wsClientRef.current) {
        // Clear metrics timer if it exists
        if (wsClientRef.current._metricsTimer) {
          clearInterval(wsClientRef.current._metricsTimer);
        }
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
      }
    };
  }, []);

  // WebSocket API methods
  const placeOrder = useCallback((orderData) => {
    if (wsClientRef.current) {
      wsClientRef.current.placeOrder(orderData);
    }
  }, []);

  const cancelOrder = useCallback((orderId) => {
    if (wsClientRef.current) {
      wsClientRef.current.cancelOrder(orderId);
    }
  }, []);

  const subscribeToSymbol = useCallback((symbol) => {
    console.log(`🔄 WebSocketContext.subscribeToSymbol called with:`, symbol);
    if (wsClientRef.current) {
      console.log(`📤 Calling wsClient.subscribeToMarket([${symbol}])`);
      wsClientRef.current.subscribeToMarket([symbol]);
    } else {
      console.error(`❌ WebSocket client not available`);
    }
  }, []);

  const unsubscribeFromSymbol = useCallback((symbol) => {
    if (wsClientRef.current) {
      wsClientRef.current.unsubscribeFromMarket([symbol]);
    }
  }, []);

  const subscribeToAllMarkets = useCallback(() => {
    if (wsClientRef.current) {
      const SUPPORTED_CRYPTO_SYMBOLS = [
        "BTC-USD", "ETH-USD", "ADA-USD", "SOL-USD", 
        "DOGE-USD", "AVAX-USD", "MATIC-USD", "LINK-USD"
      ];
      console.log('🔔 Subscribing to all markets from WebSocketContext');
      wsClientRef.current.subscribeToMarket(SUPPORTED_CRYPTO_SYMBOLS);
      wsClientRef.current.subscribeToAlerts();
    }
  }, []);

  const getOrderStatus = useCallback((orderId) => {
    if (wsClientRef.current) {
      wsClientRef.current.getOrderStatus(orderId);
    }
  }, []);

  // Fetch all order history
  const getOrderHistory = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.getOrderHistory(1000, 0); // Fetch all with large limit
    }
  }, []);

  // Change page in frontend
  const loadOrderHistoryPage = useCallback((page) => {
    setOrderHistoryMeta(prev => ({ ...prev, currentPage: page }));
  }, []);

  // Change page size
  const changePageSize = useCallback((newPageSize) => {
    setOrderHistoryMeta(prev => ({ ...prev, pageSize: newPageSize, currentPage: 1 }));
  }, []);

  // Calculate orders for current page
  const getCurrentPageOrders = useCallback(() => {
    const { currentPage, pageSize } = orderHistoryMeta;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allOrderHistory.slice(startIndex, endIndex);
  }, [allOrderHistory, orderHistoryMeta]);

  const getMetricsData = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.getMetrics();
    }
  }, []);

  const getAlertsData = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.getAlerts();
    }
  }, []);

  const registerAlert = useCallback((ruleId, metricKey, operator, threshold, enabled = true) => {
    if (wsClientRef.current) {
      wsClientRef.current.registerAlert(ruleId, metricKey, operator, threshold, enabled);
    }
  }, []);

  const disableAlert = useCallback((ruleId) => {
    if (wsClientRef.current) {
      wsClientRef.current.disableAlert(ruleId);
    }
  }, []);

  const subscribeToAlerts = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.subscribeToAlerts();
    }
  }, []);

  const queryHistory = useCallback((symbol, fromTs, toTs, interval, limit) => {
    if (wsClientRef.current) {
      wsClientRef.current.queryHistory(symbol, fromTs, toTs, interval, limit);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const value = {
    // Connection state
    connectionState,
    connected: connectionState.connected,
    sessionId: connectionState.sessionId,
    userId: connectionState.userId,
    roles: connectionState.roles,
    
    // Data
    marketData,
    orders,
    orderHistory,
    allOrderHistory,
    orderHistoryMeta,
    alerts,
    metrics,
    historyData,
    error,
    toast,
    
    // Methods
    placeOrder,
    cancelOrder,
    subscribeToSymbol,
    unsubscribeFromSymbol,
    subscribeToAllMarkets,
    getOrderStatus,
    getOrderHistory,
    loadOrderHistoryPage,
    changePageSize,
    getCurrentPageOrders,
    getMetricsData,
    getAlertsData,
    registerAlert,
    disableAlert,
    subscribeToAlerts,
    queryHistory,
    clearError,
    clearToast,
    setToast
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
