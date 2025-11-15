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

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return; // Already connected
      }

      try {
        // Get WebSocket URL (convert http to ws)
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsHost = window.location.host;
        const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${session.access_token}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
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
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          setIsConnected(false);
          wsRef.current = null;

          // Attempt to reconnect
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
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

