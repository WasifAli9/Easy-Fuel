import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { parse } from "url";
import { getLocalUserFromAccessToken } from "./auth-local";
import { db } from "./db";
import { profiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { pool } from "./db";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userRole?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: string;
  payload: any;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const raw of cookieHeader.split(";")) {
    const [key, ...rest] = raw.trim().split("=");
    if (!key || rest.length === 0) continue;
    out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

async function getLocalUserFromSessionCookie(req: IncomingMessage): Promise<{ id: string } | null> {
  const cookies = parseCookies(req.headers.cookie);
  const rawSessionCookie = cookies["inspect360.sid"];
  if (!rawSessionCookie) return null;

  // express-session signed cookie format: s:<sid>.<sig>
  const unsigned = rawSessionCookie.startsWith("s:") ? rawSessionCookie.slice(2) : rawSessionCookie;
  const sid = unsigned.split(".")[0];
  if (!sid) return null;

  const sessionRows = await pool.query(
    `SELECT sess FROM user_sessions WHERE sid = $1 AND expire >= now() LIMIT 1`,
    [sid],
  );
  const sessionRow = sessionRows.rows[0];
  if (!sessionRow?.sess) return null;

  const sess =
    typeof sessionRow.sess === "string"
      ? JSON.parse(sessionRow.sess)
      : sessionRow.sess;

  const userId = sess?.passport?.user;
  if (!userId || typeof userId !== "string") return null;
  return { id: userId };
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map();

  initialize(server: Server) {
    try {
      this.wss = new WebSocketServer({ server, path: "/ws" });

      // Log WebSocket server initialization
      console.log("[WebSocket] Server initialized on path /ws");

      this.wss.on("connection", async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      try {
        // Extract token from query params
        const { query } = parse(req.url || "", true);
        const token = query.token as string;

        let user: { id: string } | null = null;
        let error: { message?: string } | null = null;
        if (token && token !== "cookie-session") {
          const localUser = await getLocalUserFromAccessToken(token);
          if (!localUser) {
            error = { message: "Invalid local token" };
          } else {
            user = { id: localUser.id };
          }
        } else {
          const cookieUser = await getLocalUserFromSessionCookie(req);
          if (!cookieUser) {
            error = { message: "Authentication required" };
          } else {
            user = { id: cookieUser.id };
          }
        }

        if (error || !user) {
          // Log auth errors for debugging (but not for expired tokens in production)
          const isExpiredToken = error?.message?.includes("expired") || error?.message?.includes("JWT");
          if (process.env.NODE_ENV === "development" || !isExpiredToken) {
            console.error("[WebSocket] Auth error:", error?.message || "User not found");
          }
          ws.close(1008, "Invalid authentication token");
          return;
        }

        // Attach user ID to WebSocket
        ws.userId = user.id;
        ws.isAlive = true;

        // Fetch user role from database
        const profileRows = await db
          .select({ role: profiles.role })
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);

        if (profileRows[0]?.role) {
          ws.userRole = profileRows[0].role;
        }

        // Add client to the map
        if (!this.clients.has(user.id)) {
          this.clients.set(user.id, new Set());
        }
        this.clients.get(user.id)!.add(ws);

        // Handle ping/pong for connection health
        ws.on("pong", () => {
          ws.isAlive = true;
        });

        // Handle incoming messages
        ws.on("message", (data: string) => {
          try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            this.handleMessage(ws, message);
          } catch (error) {
            // Invalid message format, ignore
          }
        });

        // Handle disconnection
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

        const authedUserId = ws.userId as string;
        // Send welcome message
        this.sendToSocket(ws, {
          type: "connected",
          payload: { userId: authedUserId, timestamp: new Date().toISOString() },
        });

        // Log successful connection (only in development)
        if (process.env.NODE_ENV === "development") {
          console.log(`[WebSocket] User ${authedUserId} connected`);
        }
      } catch (error) {
        console.error("[WebSocket] Error in connection handler:", error);
        // Only close if not already closed
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
      // Don't throw - allow server to continue without WebSocket
    }

    // Heartbeat to detect broken connections
    const heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const authWs = ws as AuthenticatedWebSocket;
        if (authWs.isAlive === false) {
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, 30000); // 30 seconds

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
        // Chat messages will be handled by the chat API
        // This is just for acknowledgment
        this.sendToSocket(ws, { 
          type: "chat_message_received", 
          payload: { messageId: message.payload.messageId } 
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
    } else {
      return false;
    }
  }

  sendDispatchOffer(driverId: string, offer: any) {
    return this.sendToUser(driverId, {
      type: "dispatch_offer",
      payload: offer,
    });
  }

  sendOrderUpdate(userId: string, message: any) {
    // If message already has a type field, send it directly
    // Otherwise, wrap it as an order_update message
    if (message && typeof message === 'object' && 'type' in message) {
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

  sendNotification(userId: string, notification: any) {
    return this.sendToUser(userId, {
      type: "notification",
      payload: notification,
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

  /**
   * Broadcast message to all users with a specific role
   */
  async broadcastToRole(role: string, message: WebSocketMessage): Promise<void> {
    if (!this.wss) return;

    // Get all user IDs with this role
    const roleProfiles = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.role, role as any));

    if (roleProfiles.length === 0) return;

    const userIds = new Set(roleProfiles.map((p) => p.id));

    // Send to all connected users with this role
    this.wss.clients.forEach((ws: WebSocket) => {
      const authWs = ws as AuthenticatedWebSocket;
      if (authWs.userId && userIds.has(authWs.userId)) {
        this.sendToSocket(authWs, message);
      }
    });
  }

  /**
   * Broadcast message to all connected users
   */
  broadcastToAll(message: WebSocketMessage): void {
    if (!this.wss) return;

    this.wss.clients.forEach((ws: WebSocket) => {
      this.sendToSocket(ws, message);
    });
  }
}

export const websocketService = new WebSocketService();
