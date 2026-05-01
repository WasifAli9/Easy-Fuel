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

        // Build host safely and guard against malformed runtime values like "localhost:undefined".
        const parsed = new URL(window.location.href);
        const hostname = parsed.hostname || "localhost";
        const rawPort = (parsed.port || "").trim();
        const validPort = /^\d+$/.test(rawPort) ? rawPort : "";
        const fallbackPort = wsProtocol === "wss:" ? "443" : "5002";
        const wsPort = validPort || fallbackPort;
        const wsHost = `${hostname}:${wsPort}`;
        
        const tokenQuery =
          session.access_token && session.access_token !== "cookie-session"
            ? `?token=${encodeURIComponent(session.access_token)}`
            : "";
        const wsUrl = `${wsProtocol}//${wsHost}/ws${tokenQuery}`;
        
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
          // Suppress WebSocket errors - they're handled by onclose
          // Only log in development for debugging
          if (process.env.NODE_ENV === "development") {
            console.warn("[useWebSocket] Connection error (handled by onclose):", error);
          }
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          wsRef.current = null;

          // Don't reconnect if user logged out (no session)
          if (!session?.access_token) {
            return; // User logged out - don't attempt reconnection
          }

          // Only log errors or max attempts, not normal reconnections
          if (event.code === 1008 && event.reason === "Invalid authentication token") {
            // Token expired or invalid - don't reconnect, wait for new session
            // Suppress console errors for expected auth failures
            return; // Don't attempt to reconnect with invalid token
          }

          // Attempt to reconnect only for non-auth errors and if we still have a session
          if (event.code !== 1008 && session?.access_token && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
            
            // Only log in development
            if (process.env.NODE_ENV === "development") {
              console.log(`[useWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
            }
            
            reconnectTimeoutRef.current = setTimeout(() => {
              // Check session again before reconnecting
              if (session?.access_token) {
                connect();
              }
            }, delay);
          } else if (reconnectAttempts.current >= maxReconnectAttempts && session?.access_token) {
            // Only log if we still have a session (not logged out)
            if (process.env.NODE_ENV === "development") {
              console.warn("[useWebSocket] Max reconnection attempts reached");
            }
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

