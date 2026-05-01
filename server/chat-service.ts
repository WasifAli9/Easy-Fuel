import { websocketService } from "./websocket";
import { db } from "./db";
import { chatMessages, chatThreads, customers, drivers } from "@shared/schema";
import { eq } from "drizzle-orm";

interface EnsureChatThreadParams {
  orderId: string;
  customerId: string;
  driverId: string;
  customerUserId?: string | null;
  driverUserId?: string | null;
}

const FINAL_ORDER_STATES = new Set(["delivered", "cancelled", "refunded"]);

export async function ensureChatThreadForAssignment({
  orderId,
  customerId,
  driverId,
  customerUserId,
  driverUserId,
}: EnsureChatThreadParams) {
  try {
    const existingThreadRows = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(eq(chatThreads.orderId, orderId))
      .limit(1);
    const existingThread = existingThreadRows[0];

    if (existingThread) {
      notifyParticipantsChatReady(orderId, existingThread.id, customerUserId, driverUserId);
      return existingThread;
    }

    const inserted = await db
      .insert(chatThreads)
      .values({
        orderId,
        customerId,
        driverId,
      })
      .returning();
    const newThread = inserted[0];

    if (!newThread) {
      console.error("Error creating chat thread");
      return null;
    }

    notifyParticipantsChatReady(orderId, newThread.id, customerUserId, driverUserId);
    return newThread;
  } catch (error) {
    console.error("ensureChatThreadForAssignment error:", error);
    return null;
  }
}

function notifyParticipantsChatReady(
  orderId: string,
  threadId: string,
  customerUserId?: string | null,
  driverUserId?: string | null
) {
  const payload = { orderId, threadId };

  if (customerUserId) {
    websocketService.sendOrderUpdate(customerUserId, {
      orderId,
      state: "chat_ready",
      threadId,
    });
    websocketService.sendToUser(customerUserId, {
      type: "chat_thread_ready",
      payload,
    });
  }

  if (driverUserId) {
    websocketService.sendToUser(driverUserId, {
      type: "chat_thread_ready",
      payload,
    });
  }
}

export async function cleanupChatForOrder(orderId: string) {
  try {
    const threadRows = await db
      .select({ id: chatThreads.id, customerId: chatThreads.customerId, driverId: chatThreads.driverId })
      .from(chatThreads)
      .where(eq(chatThreads.orderId, orderId))
      .limit(1);
    const thread = threadRows[0];

    if (!thread) {
      return;
    }

    const [customerRows, driverRows] = await Promise.all([
      db
        .select({ userId: customers.userId })
        .from(customers)
        .where(eq(customers.id, thread.customerId))
        .limit(1),
      db
        .select({ userId: drivers.userId })
        .from(drivers)
        .where(eq(drivers.id, thread.driverId))
        .limit(1),
    ]);
    const customer = customerRows[0];
    const driver = driverRows[0];

    await db.delete(chatMessages).where(eq(chatMessages.threadId, thread.id));
    await db.delete(chatThreads).where(eq(chatThreads.id, thread.id));

    const payload = { orderId, threadId: thread.id };

    if (customer?.userId) {
      websocketService.sendToUser(customer.userId, {
        type: "chat_thread_closed",
        payload,
      });
    }

    if (driver?.userId) {
      websocketService.sendToUser(driver.userId, {
        type: "chat_thread_closed",
        payload,
      });
    }
  } catch (error) {
    console.error("cleanupChatForOrder error:", error);
  }
}

export function isFinalOrderState(state: string | null | undefined) {
  if (!state) return false;
  return FINAL_ORDER_STATES.has(state);
}

