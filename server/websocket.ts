import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import {
  getLocalUserFromAccessToken,
  getUserIdFromWebSocketHandshakeToken,
} from "./auth-local";
import type { IncomingMessage } from "http";
import { parse } from "url";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { profiles } from "@shared/schema";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: string;
  payload: any;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map();

  initialize(server: Server) {
    try {
      this.wss = new WebSocketServer({ server, path: "/ws" });

      console.log("[WebSocket] Server initialized on path /ws");

      this.wss.on("connection", async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
        try {
          const { query } = parse(req.url || "", true);
          const token = query.token as string;

          if (!token) {
            ws.close(1008, "Authentication required");
            return;
          }

          let authedUserId: string | null = (await getLocalUserFromAccessToken(token))?.id ?? null;
          if (!authedUserId) {
            authedUserId = getUserIdFromWebSocketHandshakeToken(token);
          }

          if (!authedUserId) {
            if (process.env.NODE_ENV === "development") {
              console.error("[WebSocket] Invalid or expired token");
            }
            ws.close(1008, "Invalid authentication token");
            return;
          }

          ws.userId = authedUserId;
          ws.isAlive = true;

          const profRows = await db
            .select({ role: profiles.role })
            .from(profiles)
            .where(eq(profiles.id, authedUserId))
            .limit(1);
          if (profRows[0]?.role) {
            ws.userRole = profRows[0].role;
          }

          if (!this.clients.has(authedUserId)) {
            this.clients.set(authedUserId, new Set());
          }
          this.clients.get(authedUserId)!.add(ws);

          ws.on("pong", () => {
            ws.isAlive = true;
          });

          ws.on("message", (data: string) => {
            try {
              const message: WebSocketMessage = JSON.parse(data.toString());
              this.handleMessage(ws, message);
            } catch {
              // Invalid message format, ignore
            }
          });

          ws.on("close", () => {
            if (ws.userId) {
              const userClients = this.clients.get(ws.userId);
              if (userClients) {
                userClients.delete(ws);
                if (userClients.size === 0) {
                  this.clients.delete(ws.userId);
                }
              }
            }
          });

          this.sendToSocket(ws, {
            type: "connected",
            payload: { userId: authedUserId, timestamp: new Date().toISOString() },
          });

          if (process.env.NODE_ENV === "development") {
            console.log(`[WebSocket] User ${authedUserId} connected`);
          }
        } catch (error) {
          console.error("[WebSocket] Error in connection handler:", error);
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1011, "Internal server error");
          }
        }
      });

      this.wss.on("error", (error) => {
        console.error("[WebSocket] Server error:", error);
      });
    } catch (error) {
      console.error("[WebSocket] Failed to initialize WebSocket server:", error);
    }

    const heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const authWs = ws as AuthenticatedWebSocket;
        if (authWs.isAlive === false) {
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, 30000);

    this.wss?.on("close", () => {
      clearInterval(heartbeatInterval);
    });
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    switch (message.type) {
      case "ping":
        this.sendToSocket(ws, { type: "pong", payload: { timestamp: new Date().toISOString() } });
        break;

      case "chat_message":
        this.sendToSocket(ws, {
          type: "chat_message_received",
          payload: { messageId: message.payload.messageId },
        });
        break;

      default:
    }
  }

  private sendToSocket(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendToUser(userId: string, message: WebSocketMessage) {
    const userClients = this.clients.get(userId);
    if (userClients && userClients.size > 0) {
      userClients.forEach((ws) => {
        this.sendToSocket(ws, message);
      });
      return true;
    }
    return false;
  }

  sendDispatchOffer(driverId: string, offer: any) {
    return this.sendToUser(driverId, {
      type: "dispatch_offer",
      payload: offer,
    });
  }

  sendOrderUpdate(userId: string, message: any) {
    if (message && typeof message === "object" && "type" in message) {
      return this.sendToUser(userId, message);
    }
    return this.sendToUser(userId, {
      type: "order_update",
      payload: message,
    });
  }

  sendChatMessage(userId: string, message: any) {
    return this.sendToUser(userId, {
      type: "chat_message",
      payload: message,
    });
  }

  sendLocationUpdate(userId: string, location: any) {
    return this.sendToUser(userId, {
      type: "location_update",
      payload: location,
    });
  }

  sendNotification(userId: string, message: any) {
    return this.sendToUser(userId, {
      type: "notification",
      payload: message,
    });
  }

  isUserConnected(userId: string): boolean {
    const userClients = this.clients.get(userId);
    return !!(userClients && userClients.size > 0);
  }

  getConnectedUsersCount(): number {
    return this.clients.size;
  }

  getConnectionsCount(): number {
    let count = 0;
    this.clients.forEach((clients) => {
      count += clients.size;
    });
    return count;
  }

  async broadcastToRole(role: string, message: WebSocketMessage): Promise<void> {
    if (!this.wss) return;

    const profs = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.role, role as (typeof profiles.$inferSelect)["role"]));

    if (!profs.length) return;

    const userIds = new Set(profs.map((p) => p.id));

    this.wss.clients.forEach((ws: WebSocket) => {
      const authWs = ws as AuthenticatedWebSocket;
      if (authWs.userId && userIds.has(authWs.userId)) {
        this.sendToSocket(authWs, message);
      }
    });
  }

  broadcastToAll(message: WebSocketMessage): void {
    if (!this.wss) return;

    this.wss.clients.forEach((ws: WebSocket) => {
      this.sendToSocket(ws, message);
    });
  }
}

export const websocketService = new WebSocketService();
