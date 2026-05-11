import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface WebSocketMessage {
  type: string;
  payload: any;
}

/** Cached short-lived WS token from GET /api/auth/ws-token (cookie sessions). Shared across hook instances. */
let wsHandshakeTokenCache: { token: string; exp: number; userId: string } | null = null;

function invalidateWsHandshakeTokenCacheForUser(userId: string) {
  if (wsHandshakeTokenCache?.userId === userId) {
    wsHandshakeTokenCache = null;
  }
}

async function buildWebSocketTokenQuery(session: NonNullable<ReturnType<typeof useAuth>["session"]>): Promise<string | null> {
  if (session.access_token !== "cookie-session") {
    return `token=${encodeURIComponent(session.access_token)}`;
  }

  const userId = session.user?.id;
  if (!userId) {
    return null;
  }

  const now = Date.now();
  if (
    wsHandshakeTokenCache &&
    wsHandshakeTokenCache.userId === userId &&
    wsHandshakeTokenCache.exp > now + 2000
  ) {
    return `token=${encodeURIComponent(wsHandshakeTokenCache.token)}`;
  }

  const r = await fetch("/api/auth/ws-token", { credentials: "include" });
  if (!r.ok) {
    return null;
  }
  const data = (await r.json()) as { wsToken?: string };
  const wsToken = data.wsToken;
  if (!wsToken) {
    return null;
  }
  wsHandshakeTokenCache = { token: wsToken, userId, exp: now + 4 * 60 * 1000 };
  return `token=${encodeURIComponent(wsToken)}`;
}

export function useWebSocket(onMessage?: (message: WebSocketMessage) => void) {
  const { session } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const onMessageRef = useRef(onMessage);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    cancelledRef.current = false;

    if (!session?.access_token) {
      wsHandshakeTokenCache = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const connect = async () => {
      if (cancelledRef.current) {
        return;
      }
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      try {
        const tokenQuery = await buildWebSocketTokenQuery(session);
        if (cancelledRef.current || !tokenQuery) {
          if (process.env.NODE_ENV === "development" && session.access_token && !tokenQuery) {
            console.warn("[useWebSocket] Missing WebSocket token (session not ready or /api/auth/ws-token failed).");
          }
          return;
        }

        const explicitWsUrl = (import.meta as any)?.env?.VITE_WS_URL as string | undefined;
        let wsUrl = "";

        if (explicitWsUrl && explicitWsUrl.trim()) {
          const sep = explicitWsUrl.includes("?") ? "&" : "?";
          wsUrl = `${explicitWsUrl}${sep}${tokenQuery}`;
        } else {
          const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const wsHost = window.location.host;
          wsUrl = `${wsProtocol}//${wsHost}/ws?${tokenQuery}`;
        }

        if (wsUrl.includes("undefined")) {
          console.error("[useWebSocket] Invalid WebSocket URL constructed:", wsUrl);
          throw new Error(`Invalid WebSocket URL: ${wsUrl}`);
        }

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (process.env.NODE_ENV === "development") {
            console.log("[useWebSocket] Connected successfully");
          }
          setIsConnected(true);
          reconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);

            if (message.type === "pong") {
              return;
            }

            if (process.env.NODE_ENV === "development" && message.type !== "pong") {
              console.log("[useWebSocket] Message received:", message.type);
            }

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
          if (process.env.NODE_ENV === "development") {
            console.warn("[useWebSocket] Connection error (handled by onclose):", error);
          }
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          wsRef.current = null;

          if (!session?.access_token) {
            return;
          }

          const isAuthClose = event.code === 1008 && event.reason === "Invalid authentication token";
          if (isAuthClose && session.access_token === "cookie-session" && session.user?.id) {
            invalidateWsHandshakeTokenCacheForUser(session.user.id);
            if (reconnectAttempts.current < maxReconnectAttempts) {
              reconnectAttempts.current++;
              const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
              if (process.env.NODE_ENV === "development") {
                console.log(
                  `[useWebSocket] WS token rejected; refreshing and reconnecting in ${delay}ms (${reconnectAttempts.current}/${maxReconnectAttempts})`,
                );
              }
              reconnectTimeoutRef.current = setTimeout(() => {
                if (session?.access_token) {
                  void connect();
                }
              }, delay);
            }
            return;
          }

          if (isAuthClose) {
            return;
          }

          if (event.code !== 1008 && session?.access_token && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);

            if (process.env.NODE_ENV === "development") {
              console.log(
                `[useWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`,
              );
            }

            reconnectTimeoutRef.current = setTimeout(() => {
              if (session?.access_token) {
                void connect();
              }
            }, delay);
          } else if (reconnectAttempts.current >= maxReconnectAttempts && session?.access_token) {
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

    void connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [session?.access_token, session?.user?.id, session?.expires_at]);

  return { isConnected };
}
