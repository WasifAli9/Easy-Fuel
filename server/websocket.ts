import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { supabaseAuth } from "./supabase";
import type { IncomingMessage } from "http";
import { parse } from "url";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
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
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      console.log("New WebSocket connection attempt");

      // Extract token from query params
      const { query } = parse(req.url || "", true);
      const token = query.token as string;

      if (!token) {
        console.log("WebSocket connection rejected: No token provided");
        ws.close(1008, "Authentication required");
        return;
      }

      // Verify token with Supabase
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

      if (error || !user) {
        console.log("WebSocket connection rejected: Invalid token");
        ws.close(1008, "Invalid authentication token");
        return;
      }

      // Attach user ID to WebSocket
      ws.userId = user.id;
      ws.isAlive = true;

      // Add client to the map
      if (!this.clients.has(user.id)) {
        this.clients.set(user.id, new Set());
      }
      this.clients.get(user.id)!.add(ws);

      console.log(`WebSocket authenticated for user ${user.id}`);

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
          console.error("Error parsing WebSocket message:", error);
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
          console.log(`WebSocket disconnected for user ${ws.userId}`);
        }
      });

      // Send welcome message
      this.sendToSocket(ws, {
        type: "connected",
        payload: { userId: user.id, timestamp: new Date().toISOString() },
      });
    });

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

    this.wss.on("close", () => {
      clearInterval(heartbeatInterval);
    });

    console.log("WebSocket server initialized on path /ws");
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    console.log(`Received message from user ${ws.userId}:`, message.type);

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
        console.log(`Unknown message type: ${message.type}`);
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
      console.log(`Sent ${message.type} to user ${userId} (${userClients.size} connections)`);
      return true;
    } else {
      console.log(`User ${userId} not connected via WebSocket`);
      return false;
    }
  }

  sendDispatchOffer(driverId: string, offer: any) {
    return this.sendToUser(driverId, {
      type: "dispatch_offer",
      payload: offer,
    });
  }

  sendOrderUpdate(userId: string, order: any) {
    return this.sendToUser(userId, {
      type: "order_update",
      payload: order,
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
}

export const websocketService = new WebSocketService();
