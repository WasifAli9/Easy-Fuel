import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface WebSocketMessage {
  type: string;
  payload: any;
}

type MessageHandler = (message: WebSocketMessage) => void;

/** Cached short-lived WS token from GET /api/auth/ws-token (cookie sessions). */
let wsHandshakeTokenCache: { token: string; exp: number; userId: string } | null = null;

function invalidateWsHandshakeTokenCacheForUser(userId: string) {
  if (wsHandshakeTokenCache?.userId === userId) {
    wsHandshakeTokenCache = null;
  }
}

async function buildWebSocketTokenQuery(
  session: NonNullable<ReturnType<typeof useAuth>["session"]>,
): Promise<string | null> {
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

/** One browser WebSocket shared by every useWebSocket() subscriber. */
class SharedWebSocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<MessageHandler>();
  private connected = false;
  private connectionListeners = new Set<() => void>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private session: NonNullable<ReturnType<typeof useAuth>["session"]> | null = null;
  private sessionHolderCount = 0;
  private connectGeneration = 0;
  private cancelled = false;

  subscribe(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private emitConnectionChange() {
    this.connectionListeners.forEach((l) => l());
  }

  subscribeConnection(listener: () => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  getIsConnected() {
    return this.connected;
  }

  private dispatch(message: WebSocketMessage) {
    for (const handler of this.listeners) {
      try {
        handler(message);
      } catch (error) {
        console.error("[useWebSocket] Error in message handler callback:", error);
      }
    }
  }

  acquireSession(session: NonNullable<ReturnType<typeof useAuth>["session"]> | null) {
    this.sessionHolderCount++;
    this.applySession(session);
  }

  releaseSession() {
    this.sessionHolderCount = Math.max(0, this.sessionHolderCount - 1);
    if (this.sessionHolderCount === 0) {
      this.applySession(null);
    }
  }

  private applySession(session: NonNullable<ReturnType<typeof useAuth>["session"]> | null) {
    const prevKey = this.sessionKey(this.session);
    const nextKey = this.sessionKey(session);
    this.session = session;

    if (!session?.access_token) {
      wsHandshakeTokenCache = null;
      this.disconnect();
      return;
    }

    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      this.disconnect();
      return;
    }

    if (prevKey !== nextKey) {
      this.disconnect();
    }

    this.cancelled = false;
    void this.connect();
  }

  private sessionKey(session: NonNullable<ReturnType<typeof useAuth>["session"]> | null): string | null {
    if (!session?.access_token) return null;
    return `${session.user?.id ?? ""}:${session.access_token}`;
  }

  private disconnect() {
    this.cancelled = true;
    this.connectGeneration++;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.connected) {
      this.connected = false;
      this.emitConnectionChange();
    }
  }

  private scheduleReconnect() {
    if (this.cancelled || !this.session?.access_token) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[useWebSocket] Max reconnection attempts reached");
      }
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[useWebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
    }
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (!this.cancelled && this.session?.access_token) {
        void this.connect();
      }
    }, delay);
  }

  private async connect() {
    const session = this.session;
    if (!session?.access_token || this.cancelled) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const generation = ++this.connectGeneration;

    try {
      const tokenQuery = await buildWebSocketTokenQuery(session);
      if (this.cancelled || generation !== this.connectGeneration || !tokenQuery) {
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
        wsUrl = `${wsProtocol}//${window.location.host}/ws?${tokenQuery}`;
      }

      if (wsUrl.includes("undefined")) {
        throw new Error(`Invalid WebSocket URL: ${wsUrl}`);
      }

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (generation !== this.connectGeneration) return;
        if (process.env.NODE_ENV === "development") {
          console.log("[useWebSocket] Connected successfully");
        }
        this.reconnectAttempts = 0;
        this.connected = true;
        this.emitConnectionChange();
      };

      ws.onmessage = (event) => {
        if (generation !== this.connectGeneration) return;
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          if (message.type === "pong") return;
          if (process.env.NODE_ENV === "development") {
            console.log("[useWebSocket] Message received:", message.type);
          }
          this.dispatch(message);
        } catch (error) {
          console.error("[useWebSocket] Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = () => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[useWebSocket] Connection error (handled by onclose)");
        }
      };

      ws.onclose = (event) => {
        if (generation !== this.connectGeneration) return;
        this.ws = null;
        if (this.connected) {
          this.connected = false;
          this.emitConnectionChange();
        }

        if (!this.session?.access_token || this.cancelled) return;

        const isAuthClose = event.code === 1008 && event.reason === "Invalid authentication token";
        if (
          isAuthClose &&
          this.session.access_token === "cookie-session" &&
          this.session.user?.id
        ) {
          invalidateWsHandshakeTokenCacheForUser(this.session.user.id);
          this.scheduleReconnect();
          return;
        }

        if (isAuthClose) return;

        if (event.code !== 1008) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      if (this.connected) {
        this.connected = false;
        this.emitConnectionChange();
      }
    }
  }
}

const sharedWsManager = new SharedWebSocketManager();

export function useWebSocket(onMessage?: (message: WebSocketMessage) => void) {
  const { session } = useAuth();
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!onMessage) return;
    return sharedWsManager.subscribe((message) => {
      if (onMessageRef.current) {
        onMessageRef.current(message);
      }
    });
  }, [!!onMessage]);

  useEffect(() => {
    sharedWsManager.acquireSession(session ?? null);
    return () => {
      sharedWsManager.releaseSession();
    };
  }, [session?.access_token, session?.user?.id, session?.expires_at]);

  const isConnected = useSyncExternalStore(
    (onStoreChange) => sharedWsManager.subscribeConnection(onStoreChange),
    () => sharedWsManager.getIsConnected(),
    () => false,
  );

  return { isConnected };
}
