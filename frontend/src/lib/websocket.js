import msgpack from 'msgpack-lite';

class TradingWebSocketClient {
  constructor() {
    // Singleton pattern - use single instance
    if (TradingWebSocketClient.instance) {
      console.log('🔄 Returning existing WebSocket instance');
      return TradingWebSocketClient.instance;
    }
    
    console.log('🆕 Creating new WebSocket instance');
    TradingWebSocketClient.instance = this;
    this.ws = null;
    this.sessionId = null;
    this.userId = null;
    this.roles = [];
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.subscribedRooms = new Set();
    this.subscribedSymbols = new Set();
    this.autoSubscribed = false;
    
    // QoS1 Tracking
    this.messageId = 0;
    this.pendingMessages = new Map();
    
    // Start pending message cleanup timer
    this.startPendingMessageCleanup();
    
    // Authentication
    this.token = "trader-token"; // In production, this would be a JWT token
    this.sessionToken = null; // Will be set from localStorage or hello response
    
    // Load or generate persistent clientId and deviceId
    this.loadOrGenerateIds();
    
    // Check for existing session token
    this.loadSessionToken();
    
    // Connect only for new instance
    this.connect();
  }

  loadOrGenerateIds() {
    try {
      // Load or generate persistent clientId
      let clientId = localStorage.getItem('clientId');
      if (!clientId) {
        clientId = `react-user-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('clientId', clientId);
        console.log('🆕 Generated new clientId:', clientId);
      } else {
        console.log('🔑 Loaded existing clientId:', clientId);
      }
      this.clientId = clientId;

      // Load or generate persistent deviceId
      let deviceId = localStorage.getItem('deviceId');
      if (!deviceId) {
        deviceId = `web-${Date.now()}`;
        localStorage.setItem('deviceId', deviceId);
        console.log('🆕 Generated new deviceId:', deviceId);
      } else {
        console.log('🔑 Loaded existing deviceId:', deviceId);
      }
      this.deviceId = deviceId;

    } catch (error) {
      console.warn('⚠️ Could not load/generate IDs from localStorage, using random values:', error);
      // Fallback to random values if localStorage fails
      this.clientId = `react-user-${Math.random().toString(36).substr(2, 9)}`;
      this.deviceId = `web-${Date.now()}`;
    }
  }

  loadSessionToken() {
    try {
      const savedToken = localStorage.getItem('sessionToken');
      if (savedToken) {
        this.sessionToken = savedToken;
        console.log('🔑 Loaded session token from localStorage');
      } else {
        console.log('🆕 No existing session token found, will create new session');
      }
    } catch (error) {
      console.warn('⚠️ Could not load session token from localStorage:', error);
    }
  }

  saveSessionToken(token) {
    try {
      localStorage.setItem('sessionToken', token);
      this.sessionToken = token;
      console.log('💾 Session token saved to localStorage');
    } catch (error) {
      console.warn('⚠️ Could not save session token to localStorage:', error);
    }
  }

  clearSessionToken() {
    try {
      localStorage.removeItem('sessionToken');
      this.sessionToken = null;
      console.log('🗑️ Session token cleared from localStorage');
    } catch (error) {
      console.warn('⚠️ Could not clear session token from localStorage:', error);
    }
  }

  connect() {
    // Don't reconnect if already connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🔗 WebSocket already connected, skipping connect');
      return;
    }
    
    try {
      // Build WebSocket URL with session token if available
      let wsUrl = `ws://localhost:8082?clientId=${this.clientId}&deviceId=${this.deviceId}&token=${this.token}`;
      if (this.sessionToken) {
        wsUrl += `&sessionToken=${this.sessionToken}`;
        console.log('🔄 Connecting with existing session token');
      } else {
        console.log('🆕 Connecting to create new session');
      }
      
      console.log('🔌 Connecting to WebSocket...');
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.emit('error', error);
    }
  }

  handleOpen() {
    this.connected = true;
    this.reconnectAttempts = 0;
    this.emit('connectionStatus', 'connected');
    
    // Send hello request after a small delay to ensure connection is fully established
    setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendHello();
      } else {
        console.warn('⚠️ WebSocket not ready for hello, state:', this.ws ? this.ws.readyState : 'no ws');
      }
    }, 50);
  }

  handleMessage(event) {
    try {
      const arrayBuffer = event.data instanceof ArrayBuffer ? event.data : event.data.buffer;
      
      // QoS1 Frame Format Check - be more careful with frame detection
      // Large arrays (like orders.history) should go directly to MsgPack handling
      // Only check for QoS frames if buffer is small-to-medium size
      if (arrayBuffer.byteLength >= 9) {
        try {
          const view = new DataView(arrayBuffer);
          const frameType = view.getUint8(0);
          
          // Only treat as QoS frame if it's exactly 0x00 or 0x01 at the start
          // and the overall structure looks like a QoS frame (not MsgPack)
          if (frameType === 0x00 || frameType === 0x01) {
            // Additional check: MsgPack messages typically start with different byte patterns
            // QoS frames start with exactly 0x00 or 0x01 followed by 8 bytes of message ID
            if (arrayBuffer.byteLength >= 9) {
              // Try to read the message ID safely
              const messageIdLow = view.getUint32(1, true);
              const messageIdHigh = view.getUint32(5, true);
              const messageId = BigInt(messageIdLow) | (BigInt(messageIdHigh) << 32n);
              const payloadBytes = new Uint8Array(arrayBuffer.slice(9));
              
              // console.log(`🔌 QoS Frame detected: type=${frameType}, id=${messageId}, payload=${payloadBytes.length} bytes`);
              
              switch (frameType) {
                case 0x00: // FRAME_DATA - Server response
                  this.handleQoSDataFrame(messageId, payloadBytes);
                  return;
                case 0x01: // FRAME_ACK - Server ACK
                  this.handleQoSAck(Number(messageId));
                  return;
              }
            }
          }
        } catch (qosError) {
          console.warn('⚠️ QoS frame parsing failed, falling back to MsgPack:', qosError);
          // Continue to normal MsgPack handling
        }
      }
      
      // For large buffers (likely large arrays like orders.history), go directly to MsgPack
      
      // Fallback to original MsgPack handling for non-QoS messages
      const data = new Uint8Array(event.data);
      const message = msgpack.decode(data);
      
      //console.log('🔌 Regular MsgPack path - Raw message:', message);
      // Use common message processing logic
      this.processDecodedMessage(message);
      
    } catch (error) {
      console.error('❌ Message decode error:', error);
      this.emit('error', error);
    }
  }

  // Common message processing logic for both regular and QoS messages
  processDecodedMessage(message) {
    // Log incoming method to track orders.history
    console.log('📨 Received method:', message.method);
    
    // According to document format: {method, payload}
    if (message.method && message.payload) {
      let payload = message.payload;
      
      // Parse payload if it's a string (JSON format)
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          // Parse error - continue with string
        }
      }
      
      // Parse payload if it's Uint8Array (MsgPack encoded)
      if (payload instanceof Uint8Array) {
        try {
          // First try to decode as string (more reliable)
          const payloadString = new TextDecoder().decode(payload);
          
          // Parse JSON
          try {
            payload = JSON.parse(payloadString);
          } catch (jsonError) {
            // If JSON fails, try MsgPack
            try {
              payload = msgpack.decode(payload);
            } catch (msgpackError) {
              payload = payloadString;
            }
          }
        } catch (stringError) {
          // Last resort: try MsgPack
          try {
            payload = msgpack.decode(payload);
          } catch (msgpackError) {
            // All decode methods failed
          }
        }
      }
      
      // Market data is broadcast, not RPC response
      if (message.method === 'market_data') {
        this.handleBroadcast({
          method: message.method,
          data: payload
        });
        return;
      }
      
      // Handle other RPC responses
      if (message.method && payload !== undefined) {
        // Error handling
        if (payload.error) {
          message.error = payload.error;
        }
        // Success handling  
        if (payload.result) {
          message.result = payload.result;
        }
        // Direct payload (success case)
        if (!payload.error && !payload.result) {
          message.result = payload;
        }
        
        this.handleRpcResponse(message);
      }
    }
    
    // Handle other broadcasts (real-time data)
    if (message.data && message.method && message.method !== 'market_data') {
      this.handleBroadcast(message);
    }
  }

  handleClose(event) {
    console.log('WebSocket disconnected:', event.code, event.reason);
    this.connected = false;
    this.sessionId = null;
    this.emit('connectionStatus', 'disconnected');
    
    // Attempt to reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.emit('connectionStatus', 'reconnecting');
      
      setTimeout(() => {
        console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      // Max reconnection attempts reached, clear session token for fresh start
      console.log('🔄 Max reconnection attempts reached, clearing session token');
      this.clearSessionToken();
    }
  }

  handleError(error) {
    console.error('WebSocket error:', error);
    this.emit('error', error);
  }

  handleQoSDataFrame(messageId, payloadBytes) {
    // *** CRITICAL: Send ACK immediately first ***
    // This prevents server retry even if processing fails
    this.sendAck(messageId);
    
    try {
      // Check if payload is not empty
      if (payloadBytes.length === 0) {
        console.warn('⚠️ Received empty QoS payload');
        return;
      }
      
      // Parse the payload as MsgPack
      const message = msgpack.decode(payloadBytes);
      
      // Use the same processing logic as handleMessage
      this.processDecodedMessage(message);
      
    } catch (error) {
      console.error('❌ QoS payload decode error:', error);
      console.error('❌ Payload bytes length:', payloadBytes.length);
      // ACK already sent above, so server won't retry
    }
  }

  sendAck(messageId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Cannot send ACK: WebSocket not connected');
      return;
    }

    try {
      // Validate messageId
      if (!messageId || typeof messageId !== 'bigint') {
        console.error('❌ Invalid messageId for ACK:', messageId);
        return;
      }

      // Create ACK frame: [FrameType:1][MessageID:8]
      const frame = new ArrayBuffer(9);
      const view = new DataView(frame);
      
      view.setUint8(0, 0x01); // FRAME_ACK
      
      // Set 64-bit message ID (little-endian)
      // JavaScript BigInt doesn't work directly with DataView.setBigUint64 in all browsers
      // So we'll use two 32-bit values instead
      const messageIdLow = Number(messageId & 0xFFFFFFFFn);
      const messageIdHigh = Number(messageId >> 32n);
      
      // Use setUint32 for little-endian 64-bit representation
      view.setUint32(1, messageIdLow, true);  // Low 32 bits
      view.setUint32(5, messageIdHigh, true); // High 32 bits
      
      // console.log(`📤 Sending ACK for message ${messageId} (low: ${messageIdLow}, high: ${messageIdHigh})`);
      
      // Double-check WebSocket is still open before sending
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(frame);
      } else {
        console.warn('⚠️ WebSocket closed before ACK could be sent');
      }
    } catch (error) {
      console.error('❌ Failed to send ACK:', error);
      console.error('❌ MessageId was:', messageId, typeof messageId);
    }
  }

  handleQoSAck(messageId) {
    console.log(`✅ Received server ACK for message ${messageId}`);
    
    // Clean up pending message since server confirmed receipt
    if (this.pendingMessages.has(messageId)) {
      const pendingMessage = this.pendingMessages.get(messageId);
      
      // Validate message age (Python tests show timeout handling)
      const messageAge = Date.now() - pendingMessage.timestamp;
      if (messageAge > 30000) { // 30 second timeout
        console.warn(`⚠️ Received ACK for very old message ${messageId} (age: ${messageAge}ms)`);
      }
      
      console.log(`🧹 Cleaning up pending message ${messageId} (${pendingMessage.method}, age: ${messageAge}ms)`);
      this.pendingMessages.delete(messageId);
    } else {
      console.warn(`⚠️ Received ACK for unknown message ID: ${messageId}`);
      // This might indicate a race condition or server issue
      console.warn(`⚠️ Current pending messages:`, Array.from(this.pendingMessages.keys()));
    }
  }

  startPendingMessageCleanup() {
    // Clean up pending messages every 30 seconds to prevent memory leaks
    setInterval(() => {
      const now = Date.now();
      const timeoutMs = 30000; // 30 seconds
      
      for (const [messageId, message] of this.pendingMessages.entries()) {
        if (now - message.timestamp > timeoutMs) {
          console.warn(`⚠️ Cleaning up timed out message ${messageId} (${message.method})`);
          this.pendingMessages.delete(messageId);
        }
      }
    }, 30000); // Run every 30 seconds
  }

  sendHello() {
    // Use sendRpc method - it already encodes params
    this.sendRpc('hello', {
      token: this.token,
      clientId: this.clientId,
      deviceId: this.deviceId
    });
  }

  handleRpcResponse(message) {
    // Helper function to safely decode payload if it's still Uint8Array
    const safeDecodePayload = (payload) => {
      if (payload instanceof Uint8Array) {
        try {
          const payloadString = new TextDecoder().decode(payload);
          try {
            return JSON.parse(payloadString);
          } catch (jsonError) {
            return msgpack.decode(payload);
          }
        } catch (decodeError) {
          console.error(`❌ Failed to decode payload for ${message.method}:`, decodeError);
          return payload;
        }
      }
      return payload;
    };

    // Ensure result and error are properly decoded
    const safeResult = message.result ? safeDecodePayload(message.result) : message.result;
    const safeError = message.error ? safeDecodePayload(message.error) : message.error;
    
    // Create safe message with decoded data
    const safeMessage = {
      ...message,
      result: safeResult,
      error: safeError
    };

    switch (message.method) {
      case 'hello':
        if (safeResult) {
          this.sessionId = safeResult.sessionId;
          this.userId = safeResult.userId;
          this.roles = safeResult.roles;
          
          // Save session token if provided in response
          if (safeResult.token) {
            this.saveSessionToken(safeResult.token);
          }
          this.emit('hello', safeResult);
          this.emit('connectionStatus', 'connected'); // Ensure connection status is updated after auth
          
          // Auto-subscribe to metrics, alerts, market data, and load order history
          // Use setTimeout to ensure WebSocket is fully ready
          setTimeout(() => {
            this.getMetrics();
            this.subscribeToAlerts();
            this.getAlerts();
            
            // Subscribe to all major trading pairs
            const allSymbols = ['BTC-USD', 'ETH-USD', 'DOGE-USD', 'ADA-USD', 'MATIC-USD', 'LINK-USD', 'AVAX-USD'];
            this.subscribeToMarket(allSymbols);
            
            // Load order history (fetch all with large limit for client-side pagination)
            this.getOrderHistory(1000);
          }, 100); // Small delay to ensure connection is fully established
        } else if (safeError) {
          console.error('❌ Authentication failed:', safeError);
          // Clear session token on authentication error to force fresh auth
          this.clearSessionToken();
        }
        break;
        
      case 'orders.place':
        const result = safeResult || safeError;
        let finalResult = result;
        
        // Try to enrich response with pending order data (fallback for old responses)
        const keyToUse = result.echoKey || result.idempotencyKey;
        if (result && keyToUse && this.pendingOrders) {
          const pendingData = this.pendingOrders.get(keyToUse);
          if (pendingData) {
            const pendingPrice =
              (typeof pendingData.price === 'number' && pendingData.price > 0)
                ? pendingData.price
                : (typeof pendingData.displayPrice === 'number' && pendingData.displayPrice > 0)
                  ? pendingData.displayPrice
                  : 0;
            const responsePrice =
              (typeof result.price === 'number' && result.price > 0) ? result.price : 0;

            finalResult = {
              ...result,
              symbol: result.symbol || pendingData.symbol,
              side: result.side || pendingData.side,
              type: result.type || pendingData.type,
              quantity: result.quantity || pendingData.qty,  // Map qty to quantity
              qty: result.qty || pendingData.qty,
              price: responsePrice || pendingPrice,
              displayPrice: result.displayPrice || pendingData.displayPrice || pendingPrice || responsePrice
            };
            console.log('📦 Enriched order response (fallback):', finalResult);
          }
          
          // Clean up pending order after use
          this.pendingOrders.delete(keyToUse);
        }
        
        // Single emit - no duplicates
        console.log('📤 Order response (final):', finalResult);
        this.emit('orderPlaced', finalResult);
        break;
        
      case 'orders.cancel':
        this.emit('orderCancelled', safeResult || safeError);
        break;
        
      case 'orders.status':
        this.emit('orderStatus', safeResult || safeError);
        break;
        
      case 'orders.history':
        this.emit('orderHistory', safeResult || safeError);
        break;
        
      case 'market.subscribe':
        if (safeResult) {
          const rooms = safeResult.rooms || [];
          const subscribed = safeResult.subscribed || [];
          
          rooms.forEach(room => this.subscribedRooms.add(room));
          
          // Update subscribedSymbols from response if available
          if (Array.isArray(subscribed) && subscribed.length > 0) {
            subscribed.forEach(symbol => {
              if (typeof symbol === 'string') {
                this.subscribedSymbols.add(symbol);
              }
            });
          }
        }
        this.emit('marketSubscribed', safeResult || safeError);
        break;
        
      case 'market.subscribe_response':
        if (safeResult) {
          const rooms = safeResult.rooms || [];
          const subscribed = safeResult.subscribed || [];
          
          rooms.forEach(room => this.subscribedRooms.add(room));
          
          // Update subscribedSymbols Set
          this.subscribedSymbols.clear(); // Clear previous subscriptions
          
          if (Array.isArray(subscribed)) {
            subscribed.forEach((symbolOrArray) => {
              // If nested array (e.g.: [["BTC-USD"]]), take inner array
              if (Array.isArray(symbolOrArray)) {
                symbolOrArray.forEach(symbol => {
                  this.subscribedSymbols.add(symbol);
                });
              } else {
                // If direct symbol (e.g.: ["BTC-USD"])
                this.subscribedSymbols.add(symbolOrArray);
              }
            });
          }
        }
        this.emit('marketSubscribed', safeResult || safeError);
        break;
        
      case 'market.unsubscribe':
        this.emit('marketUnsubscribed', safeResult || safeError);
        break;
        
      case 'market.list':
        this.emit('marketList', safeResult || safeError);
        break;
        
      case 'history.query':
        this.emit('historyData', safeResult || safeError);
        break;
        
      case 'history.latest':
        this.emit('latestHistory', safeResult || safeError);
        break;
        
      case 'metrics.get':
        this.emit('metrics', safeResult || safeError);
        break;
        
      case 'alerts.subscribe':
        this.emit('alertsSubscribed', safeResult || safeError);
        break;
        
      case 'alerts.list':
        this.emit('alertsList', safeResult || safeError);
        break;
        
      case 'alerts.register':
        this.emit('alertRegistered', safeResult || safeError);
        break;
        
      case 'alerts.disable':
        this.emit('alertDisabled', safeResult || safeError);
        break;
        
      default:
        // No logging needed
    }
  }

  handleBroadcast(message) {
    switch (message.method) {
      case 'market_data':
        // Only accept data for subscribed symbols
        if (message.data && message.data.symbol) {
          const symbol = message.data.symbol;
          const isSubscribed = this.subscribedSymbols.has(symbol);
          
          if (isSubscribed) {
            this.emit('marketTick', message.data);
          }
        }
        break;
        
      case 'alerts.push':
        this.emit('alertPush', message.data);
        break;
    }
  }

  sendRpc(method, payload = {}) {
    // More detailed connection state check
    if (!this.ws) {
      console.error('❌ WebSocket instance not available for method:', method);
      return;
    }
    
    if (this.ws.readyState !== WebSocket.OPEN) {
      const stateName = {
        0: 'CONNECTING',
        1: 'OPEN', 
        2: 'CLOSING',
        3: 'CLOSED'
      }[this.ws.readyState] || 'UNKNOWN';
      console.error('❌ WebSocket not ready for method:', method, 'state:', `${this.ws.readyState} (${stateName})`);
      
      // For critical startup methods, schedule retry
      if (method === 'hello' || method === 'orders.history' || method === 'metrics.get') {
        console.log('⏰ Scheduling retry for critical method:', method);
        setTimeout(() => this.sendRpc(method, payload), 200);
      }
      return;
    }
    
    try {
      // Generate unique message ID for QoS1 (Python tests show sequential IDs work well)
      this.messageId++;
      const currentMessageId = this.messageId;
      
      // Basic validation to prevent integer overflow (following Python test patterns)
      if (currentMessageId >= 2147483647) { // Reset before MAX_SAFE_INTEGER
        console.warn('⚠️ Message ID approaching limit, resetting...');
        this.messageId = 1;
      }
      
      // According to document format: method, payload, id
      const message = {
        method: method,
        payload: payload,  // Direct object, not encoded
        id: currentMessageId     // Use incremental message ID for QoS1
      };
      
      
      // Store pending message for QoS1 tracking
      this.pendingMessages.set(currentMessageId, {
        method: method,
        payload: payload,
        timestamp: Date.now()
      });
      
      // Send as QoS1 DATA frame
      this.sendQoSDataFrame(BigInt(currentMessageId), message);
      
    } catch (error) {
      console.error('❌ RPC send error:', error);
      this.emit('error', error);
    }
  }

  sendQoSDataFrame(messageId, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Cannot send QoS frame: WebSocket not connected');
      return;
    }

    try {
      // Encode the data as MsgPack
      const encodedData = msgpack.encode(data);
      
      // Create QoS1 DATA frame: [FrameType:1][MessageID:8][Payload:variable]
      const frame = new ArrayBuffer(9 + encodedData.length);
      const view = new DataView(frame);
      
      view.setUint8(0, 0x00); // FRAME_DATA
      
      // Set 64-bit message ID (little-endian)
      const messageIdLow = Number(messageId & 0xFFFFFFFFn);
      const messageIdHigh = Number(messageId >> 32n);
      
      view.setUint32(1, messageIdLow, true);  // Low 32 bits
      view.setUint32(5, messageIdHigh, true); // High 32 bits
      
      // Copy payload data
      const payloadView = new Uint8Array(frame, 9);
      payloadView.set(new Uint8Array(encodedData));
      
      // QoS frame sent (no logging)
      
      // Double-check WebSocket is still open before sending
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(frame);
      } else {
        console.warn('⚠️ WebSocket closed before QoS frame could be sent');
      }
    } catch (error) {
      console.error('❌ Failed to send QoS DATA frame:', error);
      console.error('❌ MessageId was:', messageId, typeof messageId);
    }
  }

  // Market Data Methods
  subscribeToMarket(symbols) {
    // Immediately add symbols to subscribedSymbols for optimistic update
    if (Array.isArray(symbols)) {
      symbols.forEach(symbol => {
        this.subscribedSymbols.add(symbol);
      });
    }
    
    this.sendRpc('market.subscribe', { symbols });
  }

  unsubscribeFromMarket(symbols) {
    this.sendRpc('market.unsubscribe', { symbols });
  }

  getMarketList() {
    this.sendRpc('market.list', {});
  }

  // Order Methods
  placeOrder(orderData) {
    const idempotencyKey = orderData.idempotencyKey || `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const payload = {
      idempotencyKey,
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      qty: orderData.qty,  // Request uses 'qty' field
      price: orderData.price
    };

    console.log('📤 Order Place Request:', payload);

    // Store order data for response matching
    this.pendingOrders = this.pendingOrders || new Map();
    this.pendingOrders.set(idempotencyKey, {
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      qty: orderData.qty,
      price: orderData.price,
      displayPrice: orderData.displayPrice ?? orderData.price,
      timestamp: Date.now()
    });

    this.sendRpc('orders.place', payload);
  }

  cancelOrder(orderId) {
    this.sendRpc('orders.cancel', { orderId });
  }

  getOrderStatus(orderId) {
    this.sendRpc('orders.status', { orderId });
  }

  getOrderHistory(limit = 100) {
    this.sendRpc('orders.history', { limit });
  }

  // Historical Data Methods
  queryHistory(symbol, fromTs, toTs, interval = 'M1', limit = 1000) {
    this.sendRpc('history.query', {
      symbol,
      fromTs,
      toTs,
      interval,
      limit
    });
  }

  getLatestHistory(symbols, limit = 100) {
    this.sendRpc('history.latest', { symbols, limit });
  }

  // System Methods
  getMetrics() {
    this.sendRpc('metrics.get', {});
  }

  // Alert Methods
  subscribeToAlerts() {
    this.sendRpc('alerts.subscribe', {});
  }

  getAlerts() {
    this.sendRpc('alerts.list', {});
  }

  registerAlert(ruleId, metricKey, operator, threshold, enabled = true) {
    this.sendRpc('alerts.register', {
      ruleId,
      metricKey,
      operator,
      threshold,
      enabled
    });
  }

  disableAlert(ruleId) {
    this.sendRpc('alerts.disable', { ruleId });
  }

  // Utility Methods
  resubscribeToRooms() {
    if (this.subscribedRooms.size > 0) {
      const symbols = Array.from(this.subscribedRooms)
        .filter(room => room.startsWith('market:'))
        .map(room => room.replace('market:', ''));
      
      if (symbols.length > 0) {
        this.subscribeToMarket(symbols);
      }
    }
  }

  // Session Token Methods
  getSessionToken() {
    return this.sessionToken;
  }

  hasValidSession() {
    return this.sessionToken !== null && this.sessionToken !== undefined;
  }

  // Event Management
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event callback error:', error);
        }
      });
    }
  }

  // Connection Management
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
      this.sessionId = null;
    }
  }

  getConnectionState() {
    return {
      connected: this.connected,
      sessionId: this.sessionId,
      userId: this.userId,
      roles: this.roles,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
let wsInstance = null;

export const getWebSocketInstance = () => {
  if (!wsInstance) {
    wsInstance = new TradingWebSocketClient();
  }
  return wsInstance;
};

export default TradingWebSocketClient;
