import { Router } from "express";
import { requireAuth } from "./routes";
import { supabaseAdmin } from "./supabase";
import { websocketService } from "./websocket";
import { isFinalOrderState } from "./chat-service";

const router = Router();
router.use(requireAuth);

function isSchemaCacheError(error: any): boolean {
  if (!error) return false;
  return (
    error?.code === "PGRST205" ||
    error?.message?.includes("schema cache") ||
    error?.message?.includes("Could not find the table 'public.chat_") // matches chat_tables missing
  );
}

function respondSchemaCacheIssue(res: any) {
  return res.status(503).json({
    error: "Supabase schema cache is out of date for chat tables.",
    resolution:
      "In Supabase SQL editor run `NOTIFY pgrst, 'reload schema';` then wait ~10 seconds. If the chat tables do not exist, run the migration that creates `chat_threads` and `chat_messages`.",
    code: "SCHEMA_CACHE_CHAT",
  });
}

function mapThread(record: any) {
  if (!record) return null;
  return {
    id: record.id,
    orderId: record.order_id,
    customerId: record.customer_id,
    driverId: record.driver_id,
    lastMessageAt: record.last_message_at,
    createdAt: record.created_at,
  };
}

function mapMessage(record: any, senderProfile?: any) {
  return {
    id: record.id,
    threadId: record.thread_id,
    senderId: record.sender_id,
    senderType: record.sender_type,
    messageType: record.message_type,
    message: record.message,
    attachmentUrl: record.attachment_url,
    read: record.read,
    readAt: record.read_at,
    createdAt: record.created_at,
    senderName: senderProfile?.full_name || "Unknown",
  };
}

async function fetchOrderWithParticipants(orderId: string) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, customer_id, assigned_driver_id, state")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw orderError;

  if (!order) {
    return { order: null };
  }

  const [{ data: customer, error: customerError }, { data: driver, error: driverError }] =
    await Promise.all([
      supabaseAdmin
        .from("customers")
        .select("id, user_id")
        .eq("id", order.customer_id)
        .maybeSingle(),
      order.assigned_driver_id
        ? supabaseAdmin
            .from("drivers")
            .select("id, user_id")
            .eq("id", order.assigned_driver_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (customerError) throw customerError;
  if (driverError) throw driverError;

  return { order, customer, driver };
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

    const { data: existingThread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (threadError) {
      if (isSchemaCacheError(threadError)) return respondSchemaCacheIssue(res);
      throw threadError;
    }

    if (isFinalOrderState(order.state)) {
      return res.status(410).json({ error: "Chat not available for completed order" });
    }

    if (!existingThread && !order.assigned_driver_id) {
      return res.status(400).json({ error: "Cannot create chat thread - no driver assigned" });
    }

    let threadRecord = existingThread;

    if (!threadRecord) {
      const { data: newThread, error: insertError } = await supabaseAdmin
        .from("chat_threads")
        .insert({
          order_id: orderId,
          customer_id: order.customer_id,
          driver_id: order.assigned_driver_id,
        })
        .select()
        .single();

      if (insertError) {
        if (isSchemaCacheError(insertError)) return respondSchemaCacheIssue(res);
        throw insertError;
      }

      threadRecord = newThread;
    }

    res.json(mapThread(threadRecord));
  } catch (error: any) {
    console.error("Error getting chat thread:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
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
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("*")
      .eq("id", threadId)
      .maybeSingle();

    if (threadError) {
      if (isSchemaCacheError(threadError)) return respondSchemaCacheIssue(res);
      throw threadError;
    }

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const [{ data: customer, error: customerError }, { data: driver, error: driverError }] =
      await Promise.all([
        supabaseAdmin
          .from("customers")
          .select("id, user_id")
          .eq("id", thread.customer_id)
          .maybeSingle(),
        supabaseAdmin
          .from("drivers")
          .select("id, user_id")
          .eq("id", thread.driver_id)
          .maybeSingle(),
      ]);

    if (customerError) throw customerError;
    if (driverError) throw driverError;

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    let query = supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      if (isSchemaCacheError(messagesError)) return respondSchemaCacheIssue(res);
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      return res.json([]);
    }

    const senderIds = Array.from(new Set(messages.map((m) => m.sender_id)));
    const { data: senderProfiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds);

    if (profileError) throw profileError;

    const profileMap = new Map((senderProfiles || []).map((p) => [p.id, p]));

    const mapped = messages
      .map((msg) => mapMessage(msg, profileMap.get(msg.sender_id)))
      .reverse();

    res.json(mapped);
  } catch (error: any) {
    console.error("Error getting messages:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
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

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("*, orders!inner(id, customer_id, assigned_driver_id)")
      .eq("id", threadId)
      .maybeSingle();

    if (threadError) {
      if (isSchemaCacheError(threadError)) return respondSchemaCacheIssue(res);
      throw threadError;
    }

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const [{ data: customer, error: customerError }, { data: driver, error: driverError }] =
      await Promise.all([
        supabaseAdmin
          .from("customers")
          .select("id, user_id")
          .eq("id", thread.customer_id)
          .maybeSingle(),
        supabaseAdmin
          .from("drivers")
          .select("id, user_id")
          .eq("id", thread.driver_id)
          .maybeSingle(),
      ]);

    if (customerError) throw customerError;
    if (driverError) throw driverError;

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

    const { data: insertedMessage, error: insertError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_id: user.id,
        sender_type: senderType,
        message_type: messageType,
        message,
        attachment_url: attachmentUrl || null,
      })
      .select()
      .single();

    if (insertError) {
      if (isSchemaCacheError(insertError)) return respondSchemaCacheIssue(res);
      throw insertError;
    }

    await supabaseAdmin
      .from("chat_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId);

    const { data: senderProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const messageWithSender = mapMessage(insertedMessage, senderProfile);

    websocketService.sendToUser(recipientId, {
      type: "chat_message",
      payload: {
        threadId,
        orderId: thread.orders?.id || thread.order_id,
        message: messageWithSender,
      },
    });

    res.json(messageWithSender);
  } catch (error: any) {
    console.error("Error sending message:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
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

    const { data: thread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("*")
      .eq("id", threadId)
      .maybeSingle();

    if (threadError) {
      if (isSchemaCacheError(threadError)) return respondSchemaCacheIssue(res);
      throw threadError;
    }

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const [{ data: customer, error: customerError }, { data: driver, error: driverError }] =
      await Promise.all([
        supabaseAdmin
          .from("customers")
          .select("id, user_id")
          .eq("id", thread.customer_id)
          .maybeSingle(),
        supabaseAdmin
          .from("drivers")
          .select("id, user_id")
          .eq("id", thread.driver_id)
          .maybeSingle(),
      ]);

    if (customerError) throw customerError;
    if (driverError) throw driverError;

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    const senderToMatch = isCustomer ? driver.user_id : customer.user_id;

    const { error: updateError } = await supabaseAdmin
      .from("chat_messages")
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq("thread_id", threadId)
      .eq("read", false)
      .eq("sender_id", senderToMatch);

    if (updateError) {
      if (isSchemaCacheError(updateError)) return respondSchemaCacheIssue(res);
      throw updateError;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error marking messages as read:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message });
  }
});

// Get unread message count
router.get("/unread/:threadId", async (req, res) => {
  const user = (req as any).user;
  const { threadId } = req.params;

  try {
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("*")
      .eq("id", threadId)
      .maybeSingle();

    if (threadError) {
      if (isSchemaCacheError(threadError)) return respondSchemaCacheIssue(res);
      throw threadError;
    }

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const [{ data: customer, error: customerError }, { data: driver, error: driverError }] =
      await Promise.all([
        supabaseAdmin
          .from("customers")
          .select("id, user_id")
          .eq("id", thread.customer_id)
          .maybeSingle(),
        supabaseAdmin
          .from("drivers")
          .select("id, user_id")
          .eq("id", thread.driver_id)
          .maybeSingle(),
      ]);

    if (customerError) throw customerError;
    if (driverError) throw driverError;

    if (!customer || !driver) {
      return res.status(500).json({ error: "Failed to fetch thread participants" });
    }

    const isCustomer = customer.user_id === user.id;
    const isDriver = driver.user_id === user.id;

    if (!isCustomer && !isDriver) {
      return res.status(403).json({ error: "Not authorized to access this chat" });
    }

    const senderToMatch = isCustomer ? driver.user_id : customer.user_id;

    const { count, error: countError } = await supabaseAdmin
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .eq("read", false)
      .eq("sender_id", senderToMatch);

    if (countError) {
      if (isSchemaCacheError(countError)) return respondSchemaCacheIssue(res);
      throw countError;
    }

    res.json({ count: count || 0 });
  } catch (error: any) {
    console.error("Error getting unread count:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message });
  }
});

export default router;
