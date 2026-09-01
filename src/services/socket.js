/**
 * WebSocket Real-Time Client for Bug Hunt
 * 
 * Manages persistent connection, in-band auth handshake, auto-reconnection, and message dispatch.
 */

import { api } from './api.js';

class SocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.connected = false;
  }

  connect() {
    if (!api.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const hostUrl = api.getHostUrl();
      // Clean connection URL without sensitive token in query string
      const wsUrl = hostUrl.replace(/^http/, 'ws') + '/ws';
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Send initial in-band authentication handshake
        if (api.token && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'AUTH',
            token: api.token
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'AUTH_SUCCESS') {
            this.connected = true;
            this.emit('connection_change', { connected: true });

            // Start ping heartbeat once authenticated
            clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => {
              if (this.ws && this.ws.readyState === WebSocket.OPEN && this.connected) {
                this.ws.send(JSON.stringify({ type: 'PING' }));
              }
            }, 15000);
            return;
          }

          if (data.type) {
            this.emit(data.type, data.payload);
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        clearInterval(this.pingTimer);
        this.emit('connection_change', { connected: false });
        
        // Try reconnecting after 3 seconds if session is active
        clearTimeout(this.reconnectTimer);
        if (api.token) {
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (err) {
      console.error('Failed to init WebSocket:', err);
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      }
    }
  }
}

export const socket = new SocketService();
