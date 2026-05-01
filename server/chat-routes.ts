import { Router } from "express";
import { requireAuth } from "./routes";
import { websocketService } from "./websocket";
import { isFinalOrderState } from "./chat-service";
import { chatNotifications } from "./notification-helpers";
import { db } from "./db";
import { chatMessages, chatThreads, customers, drivers, orders, profiles } from "@shared/schema";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

function mapThread(record: any) {
  if (!record) return null;
  return {
    id: record.id,
    orderId: record.orderId,
    customerId: record.customerId,
    driverId: record.driverId,
    lastMessageAt: record.lastMessageAt,
    createdAt: record.createdAt,
  };
}

function mapMessage(record: any, senderProfile?: any) {
  return {
    id: record.id,
    threadId: record.threadId,
    senderId: record.senderId,
    senderType: record.senderType,
    messageType: record.messageType,
    message: record.message,
    attachmentUrl: record.attachmentUrl,
    read: record.read,
    readAt: record.readAt,
    createdAt: record.createdAt,
    senderName: senderProfile?.fullName || senderProfile?.full_name || "Unknown",
  };
}

async function fetchOrderWithParticipants(orderId: string) {
  const orderRows = await db
    .select({
      id: orders.id,
      customer_id: orders.customerId,
      assigned_driver_id: orders.assignedDriverId,
      state: orders.state,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  const order = orderRows[0];

  if (!order) {
    return { order: null };
  }

  const [customerRows, driverRows] =
    await Promise.all([
      db
        .select({ id: customers.id, user_id: customers.userId })
        .from(customers)
        .where(eq(customers.id, order.customer_id))
        .limit(1),
      order.assigned_driver_id
        ? db
            .select({ id: drivers.id, user_id: drivers.userId })
            .from(drivers)
            .where(eq(drivers.id, order.assigned_driver_id))
            .limit(1)
        : Promise.resolve([]),
    ]);
  const customer = customerRows[0] ?? null;
  const driver = driverRows[0] ?? null;

  return { order, customer, driver };
}

async function getThreadParticipants(thread: { customerId: string; driverId: string }) {
  const [customerRows, driverRows] = await Promise.all([
    db
      .select({ id: customers.id, user_id: customers.userId })
      .from(customers)
      .where(eq(customers.id, thread.customerId))
      .limit(1),
    db
      .select({ id: drivers.id, user_id: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, thread.driverId))
      .limit(1),
  ]);

  return { customer: customerRows[0] ?? null, driver: driverRows[0] ?? null };
}

// Get or create chat thread for an order
router.get("/thread/:orderId", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const { order, customer, driver } = await fetchOrderWithParticipants(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!customer) {
      return res.status(500).json({ error: "Customer record not found" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver?.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    const existingThreadRows = await db.select().from(chatThreads).where(eq(chatThreads.orderId, orderId)).limit(1);
    const existingThread = existingThreadRows[0];

    if (isFinalOrderState(order.state)) {
      return res.status(410).json({ error: "Chat not available for completed order" });
    }

    if (!existingThread && !order.assigned_driver_id) {
      return res.status(400).json({ error: "Cannot create chat thread - no driver assigned" });
    }

    let threadRecord = existingThread;

    if (!threadRecord) {
      const inserted = await db
        .insert(chatThreads)
        .values({
          orderId,
          customerId: order.customer_id,
          driverId: order.assigned_driver_id,
        })
        .returning();
      threadRecord = inserted[0];
    }

    res.json(mapThread(threadRecord));
  } catch (error: any) {
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
    const threadRows = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    const thread = threadRows[0];

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const { customer, driver } = await getThreadParticipants({ customerId: thread.customerId, driverId: thread.driverId });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    const whereParts: any[] = [eq(chatMessages.threadId, threadId)];
    if (before) whereParts.push(lt(chatMessages.createdAt, new Date(before)));
    const messages = await db
      .select()
      .from(chatMessages)
      .where(and(...whereParts))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    if (!messages || messages.length === 0) {
      return res.json([]);
    }

    const senderIds = Array.from(new Set(messages.map((m) => m.senderId)));
    const senderProfiles = senderIds.length
      ? await db
          .select({ id: profiles.id, fullName: profiles.fullName })
          .from(profiles)
          .where(inArray(profiles.id, senderIds))
      : [];
    const profileMap = new Map((senderProfiles || []).map((p) => [p.id, p]));

    const mapped = messages
      .map((msg) => mapMessage(msg, profileMap.get(msg.senderId)))
      .reverse();

    res.json(mapped);
  } catch (error: any) {
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

    const threadRows = await db
      .select({
        id: chatThreads.id,
        order_id: chatThreads.orderId,
        customer_id: chatThreads.customerId,
        driver_id: chatThreads.driverId,
      })
      .from(chatThreads)
      .where(eq(chatThreads.id, threadId))
      .limit(1);
    const thread = threadRows[0];

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const { customer, driver } = await getThreadParticipants({ customerId: thread.customer_id, driverId: thread.driver_id });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    let senderType: "customer" | "driver";
    let recipientId: string;

    if (customer.user_id === user.id) {
      senderType = "customer";
      recipientId = driver.user_id;
    } else if (driver.user_id === user.id) {
      senderType = "driver";
      recipientId = customer.user_id;
    } else {
      return res.status(403).json({ error: "Not authorized to send messages in this chat" });
    }

    const insertedRows = await db
      .insert(chatMessages)
      .values({
        threadId,
        senderId: user.id,
        senderType,
        messageType,
        message,
        attachmentUrl: attachmentUrl || null,
      })
      .returning();
    const insertedMessage = insertedRows[0];

    await db.update(chatThreads).set({ lastMessageAt: new Date() }).where(eq(chatThreads.id, threadId));

    const senderProfileRows = await db
      .select({ id: profiles.id, full_name: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    const senderProfile = senderProfileRows[0];

    const messageWithSender = mapMessage(insertedMessage, senderProfile);

    websocketService.sendToUser(recipientId, {
      type: "chat_message",
      payload: {
        threadId,
        orderId: thread.order_id,
        message: messageWithSender,
      },
    });

    await chatNotifications.onNewMessage(
      recipientId,
      user.id,
      senderProfile?.full_name || "User",
      senderType,
      message,
      thread.order_id,
      threadId
    );

    res.json(messageWithSender);
  } catch (error: any) {
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

    const threadRows = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    const thread = threadRows[0];

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const { customer, driver } = await getThreadParticipants({ customerId: thread.customerId, driverId: thread.driverId });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    const senderToMatch = isCustomer ? driver.user_id : customer.user_id;

    await db
      .update(chatMessages)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.read, false), eq(chatMessages.senderId, senderToMatch)));

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread message count
router.get("/unread/:threadId", async (req, res) => {
  const user = (req as any).user;
  const { threadId } = req.params;

  try {
    const threadRows = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    const thread = threadRows[0];

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const { customer, driver } = await getThreadParticipants({ customerId: thread.customerId, driverId: thread.driverId });

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    const senderToMatch = isCustomer ? driver.user_id : customer.user_id;

    const countRows = await db
      .select({ value: count() })
      .from(chatMessages)
      .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.read, false), eq(chatMessages.senderId, senderToMatch)));

    res.json({ count: Number(countRows[0]?.value ?? 0) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
