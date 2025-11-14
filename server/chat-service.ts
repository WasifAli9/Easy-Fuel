import { supabaseAdmin } from "./supabase";
import { websocketService } from "./websocket";

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
    const { data: existingThread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (threadError) {
      console.error("Error checking existing chat thread:", threadError);
      return null;
    }

    if (existingThread) {
      notifyParticipantsChatReady(orderId, existingThread.id, customerUserId, driverUserId);
      return existingThread;
    }

    const { data: newThread, error: insertError } = await supabaseAdmin
      .from("chat_threads")
      .insert({
        order_id: orderId,
        customer_id: customerId,
        driver_id: driverId,
      })
      .select()
      .single();

    if (insertError || !newThread) {
      console.error("Error creating chat thread:", insertError);
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
    const { data: thread, error: threadError } = await supabaseAdmin
      .from("chat_threads")
      .select("id, customer_id, driver_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (threadError) {
      console.error("Error fetching chat thread for cleanup:", threadError);
      return;
    }

    if (!thread) {
      return;
    }

    const [{ data: customer }, { data: driver }] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select("user_id")
        .eq("id", thread.customer_id)
        .maybeSingle(),
      supabaseAdmin
        .from("drivers")
        .select("user_id")
        .eq("id", thread.driver_id)
        .maybeSingle(),
    ]);

    await supabaseAdmin.from("chat_messages").delete().eq("thread_id", thread.id);
    await supabaseAdmin.from("chat_threads").delete().eq("id", thread.id);

    const payload = { orderId, threadId: thread.id };

    if (customer?.user_id) {
      websocketService.sendToUser(customer.user_id, {
        type: "chat_thread_closed",
        payload,
      });
    }

    if (driver?.user_id) {
      websocketService.sendToUser(driver.user_id, {
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

