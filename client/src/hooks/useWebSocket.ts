import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface WebSocketMessage {
  type: string;
  payload: any;
}

export function useWebSocket(onMessage?: (message: WebSocketMessage) => void) {
  const { session } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const onMessageRef = useRef(onMessage);

  // Keep the callback ref up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!session?.access_token) {
      // Close connection if no session
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Check if token is expired
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      // Token expired - don't attempt connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Prevent multiple connections
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return; // Already connected or connecting
    }

    const connect = () => {
      // Double-check before creating new connection
      if (wsRef.current?.readyState === WebSocket.OPEN || 
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return; // Already connected or connecting
      }

      try {
        // Get WebSocket URL (convert http to ws)
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        
        // Construct host with fallback port to handle undefined port cases
        let wsHost = window.location.host;
        
        // Check if host is invalid or contains "undefined" (can happen in some edge cases)
        if (!wsHost || wsHost === "undefined" || wsHost.includes("undefined") || wsHost === "localhost" || wsHost === "localhost:") {
          const hostname = window.location.hostname || "localhost";
          const port = window.location.port;
          // Default to 5002 if port is undefined, empty, or "undefined" (development server default)
          const defaultPort = port && port !== "undefined" && port !== "" ? port : (wsProtocol === "wss:" ? "443" : "5002");
          wsHost = `${hostname}:${defaultPort}`;
        }
        
        const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${session.access_token}`;
        
        // Validate URL before creating WebSocket
        if (wsUrl.includes("undefined")) {
          console.error("[useWebSocket] Invalid WebSocket URL constructed:", wsUrl);
          throw new Error(`Invalid WebSocket URL: ${wsUrl}`);
        }

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          // Only log in development
          if (process.env.NODE_ENV === "development") {
            console.log("[useWebSocket] Connected successfully");
          }
          setIsConnected(true);
          reconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            
            // Handle ping/pong
            if (message.type === "pong") {
              return;
            }
            
            // Only log in development
            if (process.env.NODE_ENV === "development" && message.type !== "pong") {
              console.log("[useWebSocket] Message received:", message.type);
            }
            
            // Call the message handler using ref to avoid stale closures
            if (onMessageRef.current) {
              try {
                onMessageRef.current(message);
              } catch (error) {
                console.error("[useWebSocket] Error in message handler callback:", error);
                console.error("[useWebSocket] Error details:", {
                  error,
                  message: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  messageType: message.type,
                  payload: message.payload,
                });
              }
            } else {
              console.warn("[useWebSocket] No message handler registered for message type:", message.type);
            }
          } catch (error) {
            console.error("[useWebSocket] Error parsing WebSocket message:", error);
            console.error("[useWebSocket] Error details:", {
              error,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              rawData: event.data,
            });
          }
        };

        ws.onerror = (error) => {
          // Only log in development
          if (process.env.NODE_ENV === "development") {
            console.error("WebSocket error:", error);
          }
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          wsRef.current = null;

          // Only log errors or max attempts, not normal reconnections
          if (event.code === 1008 && event.reason === "Invalid authentication token") {
            // Token expired or invalid - don't reconnect, wait for new session
            if (process.env.NODE_ENV === "development") {
              console.warn("[useWebSocket] Authentication failed - waiting for new session");
            }
            return; // Don't attempt to reconnect with invalid token
          }

          // Attempt to reconnect only for non-auth errors
          if (event.code !== 1008 && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
            
            // Only log in development
            if (process.env.NODE_ENV === "development") {
              console.log(`[useWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
            }
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else if (reconnectAttempts.current >= maxReconnectAttempts) {
            console.error("[useWebSocket] Max reconnection attempts reached");
          }
        };

        wsRef.current = ws;
      } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [session?.access_token]);

  return { isConnected };
}

