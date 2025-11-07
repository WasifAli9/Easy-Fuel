import { Router } from "express";
import { db } from "./db";
import { 
  chatThreads, 
  chatMessages,
  orders,
  customers,
  drivers,
  profiles
} from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { requireAuth } from "./routes";
import { websocketService } from "./websocket";

const router = Router();
router.use(requireAuth);

// Get or create chat thread for an order
router.get("/thread/:orderId", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get order first
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Get customer and driver to verify access
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, order.customerId),
    });
    const driver = order.assignedDriverId ? await db.query.drivers.findFirst({
      where: eq(drivers.id, order.assignedDriverId),
    }) : null;

    if (!customer) {
      return res.status(500).json({ error: "Customer not found" });
    }

    // Verify user is involved in this order (compare auth user IDs, not domain entity IDs)
    const isCustomer = customer.userId === user.id;
    const isDriver = driver?.userId === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    // Check if thread exists
    let thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.orderId, orderId),
    });

    // Create thread if it doesn't exist and order has a driver
    if (!thread && order.assignedDriverId) {
      const [newThread] = await db.insert(chatThreads).values({
        orderId: orderId,
        customerId: order.customerId,
        driverId: order.assignedDriverId,
      }).returning();
      thread = newThread;
    }

    if (!thread) {
      return res.status(400).json({ error: "Cannot create chat thread - no driver assigned" });
    }

    res.json(thread);
  } catch (error: any) {
    console.error("Error getting chat thread:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a thread
router.get("/messages/:threadId", async (req, res) => {
  const user = (req as any).user;
  const { threadId } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;
  const before = req.query.before as string | undefined; // For pagination

  try {
    // Get thread to verify access
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    // Get customer and driver to verify access
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, thread.customerId),
    });
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, thread.driverId),
    });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    // Verify user is involved in this thread
    const isCustomer = customer.userId === user.id;
    const isDriver = driver.userId === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    // Get messages
    const messages = await db.query.chatMessages.findMany({
      where: before
        ? and(
            eq(chatMessages.threadId, threadId),
            // Pagination: get messages created before the given message ID
          )
        : eq(chatMessages.threadId, threadId),
      orderBy: [desc(chatMessages.createdAt)],
      limit,
    });

    // Get sender profiles for display names/avatars (if messages exist)
    let messagesWithSenders = messages;
    if (messages.length > 0) {
      const senderIds = Array.from(new Set(messages.map(m => m.senderId)));
      const senderProfiles = await db.query.profiles.findMany({
        where: or(...senderIds.map(id => eq(profiles.id, id))),
      });

      const profileMap = new Map(senderProfiles.map(p => [p.id, p]));

      // Add sender info to messages
      messagesWithSenders = messages.map(msg => ({
        ...msg,
        senderName: profileMap.get(msg.senderId)?.fullName || "Unknown",
        senderAvatar: profileMap.get(msg.senderId)?.profilePhotoUrl,
      }));
    }

    res.json(messagesWithSenders.reverse()); // Return in chronological order
  } catch (error: any) {
    console.error("Error getting messages:", error);
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post("/messages", async (req, res) => {
  const user = (req as any).user;
  const { threadId, message, messageType = "text", attachmentUrl } = req.body;

  try {
    if (!threadId || !message) {
      return res.status(400).json({ error: "Thread ID and message are required" });
    }

    // Get thread to verify access and determine sender type
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
      with: {
        orders: true,
      },
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    // Get customer and driver user IDs for this thread
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, thread.customerId),
    });
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, thread.driverId),
    });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    // Determine sender type and recipient ID (using auth user IDs)
    let senderType: "customer" | "driver";
    let recipientId: string;

    if (customer.userId === user.id) {
      senderType = "customer";
      recipientId = driver.userId; // Send to driver's auth user ID
    } else if (driver.userId === user.id) {
      senderType = "driver";
      recipientId = customer.userId; // Send to customer's auth user ID
    } else {
      return res.status(403).json({ error: "Not authorized to send messages in this chat" });
    }

    // Create message
    const [newMessage] = await db.insert(chatMessages).values({
      threadId,
      senderId: user.id,
      senderType,
      messageType,
      message,
      attachmentUrl,
    }).returning();

    // Update thread last message time
    await db.update(chatThreads)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatThreads.id, threadId));

    // Get sender profile for display
    const senderProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, user.id),
    });

    const messageWithSender = {
      ...newMessage,
      senderName: senderProfile?.fullName || "Unknown",
      senderAvatar: senderProfile?.profilePhotoUrl,
    };

    // Send real-time notification via WebSocket
    websocketService.sendToUser(recipientId, {
      type: "new_message",
      payload: {
        threadId,
        orderId: thread.orderId,
        message: messageWithSender,
      },
    });

    res.json(messageWithSender);
  } catch (error: any) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as read
router.post("/messages/read", async (req, res) => {
  const user = (req as any).user;
  const { threadId } = req.body;

  try {
    if (!threadId) {
      return res.status(400).json({ error: "Thread ID is required" });
    }

    // Get thread to verify access
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    // Get customer and driver to verify access
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, thread.customerId),
    });
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, thread.driverId),
    });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    // Verify user is involved in this thread
    const isCustomer = customer.userId === user.id;
    const isDriver = driver.userId === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    // Mark all messages in this thread that were NOT sent by current user as read
    // Note: senderId is auth user ID, so we need to filter by sender != current user
    await db.update(chatMessages)
      .set({ 
        read: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(chatMessages.threadId, threadId),
          eq(chatMessages.read, false),
          // Mark messages not sent by current user (using auth user ID)
          or(
            and(
              eq(chatMessages.senderType, "customer"),
              isDriver ? eq(chatMessages.senderId, customer.userId) : sql`false`
            ),
            and(
              eq(chatMessages.senderType, "driver"),
              isCustomer ? eq(chatMessages.senderId, driver.userId) : sql`false`
            )
          )
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get unread message count
router.get("/unread/:threadId", async (req, res) => {
  const user = (req as any).user;
  const { threadId } = req.params;

  try {
    // Get thread to verify access
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
    });

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    // Get customer and driver to verify access
    const customer = await db.query.customers.findFirst({
      where: eq(customers.id, thread.customerId),
    });
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, thread.driverId),
    });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    // Verify user is involved in this thread
    const isCustomer = customer.userId === user.id;
    const isDriver = driver.userId === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    // Count unread messages not sent by current user
    // Note: senderId is auth user ID, so compare against current user's ID
    const unreadMessages = await db.query.chatMessages.findMany({
      where: and(
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.read, false),
        // Count messages NOT sent by current user (using auth user ID)
        or(
          and(
            eq(chatMessages.senderType, "customer"),
            isDriver ? eq(chatMessages.senderId, customer.userId) : sql`false`
          ),
          and(
            eq(chatMessages.senderType, "driver"),
            isCustomer ? eq(chatMessages.senderId, driver.userId) : sql`false`
          )
        )
      ),
    });

    res.json({ count: unreadMessages.length });
  } catch (error: any) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
