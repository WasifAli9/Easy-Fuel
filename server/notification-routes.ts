import { Router } from "express";
import { supabaseAdmin } from "./supabase";

const router = Router();

function isSchemaCacheError(error: any): boolean {
  if (!error) return false;
  return (
    error?.code === "PGRST205" ||
    error?.message?.includes("schema cache") ||
    error?.message?.includes("Could not find the table 'public.notifications'")
  );
}

function respondSchemaCacheIssue(res: any) {
  return res.status(503).json({
    error: "Supabase schema cache is out of date for the notifications table.",
    resolution:
      "In Supabase SQL editor run `NOTIFY pgrst, 'reload schema';` then wait ~10 seconds. If the table truly does not exist, run the migration that creates `public.notifications`.",
    code: "SCHEMA_CACHE_NOTIFICATIONS",
  });
}

// Get all notifications for the authenticated user
router.get("/", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: notifications, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[notification-routes] Error fetching notifications:", error);
      console.error("[notification-routes] Error details:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId: user.id,
      });
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json(notifications || []);
  } catch (error: any) {
    console.error("[notification-routes] Exception fetching notifications:", error);
    console.error("[notification-routes] Exception details:", {
      error,
      message: error?.message,
      stack: error?.stack,
      userId: user?.id,
    });
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Get unread notification count
router.get("/unread-count", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      console.error("[notification-routes] Error fetching unread count:", error);
      console.error("[notification-routes] Error details:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId: user.id,
      });
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json({ count: count || 0 });
  } catch (error: any) {
    console.error("[notification-routes] Exception fetching unread count:", error);
    console.error("[notification-routes] Exception details:", {
      error,
      message: error?.message,
      stack: error?.stack,
      userId: user?.id,
    });
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Mark notification as read
router.patch("/:id/read", async (req, res) => {
  const user = (req as any).user;
  const notificationId = req.params.id;
  
  try {
    // Verify notification belongs to user
    const { data: notification, error: checkError } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("id", notificationId)
      .eq("user_id", user.id)
      .single();

    if (checkError) {
      console.error("[notification-routes] Error checking notification:", checkError);
      console.error("[notification-routes] Error details:", {
        error: checkError,
        code: checkError.code,
        message: checkError.message,
        details: checkError.details,
        hint: checkError.hint,
        userId: user.id,
        notificationId,
      });
      if (isSchemaCacheError(checkError)) return respondSchemaCacheIssue(res);
      throw checkError;
    }

    if (!notification) {
      console.warn("[notification-routes] Notification not found:", { userId: user.id, notificationId });
      return res.status(404).json({ error: "Notification not found" });
    }

    // Mark as read
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[notification-routes] Error marking notification as read:", error);
      console.error("[notification-routes] Error details:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId: user.id,
        notificationId,
      });
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[notification-routes] Exception marking notification as read:", error);
    console.error("[notification-routes] Exception details:", {
      error,
      message: error?.message,
      stack: error?.stack,
      userId: user?.id,
      notificationId,
    });
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Mark all notifications as read
router.patch("/read-all", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) {
      console.error("[notification-routes] Error marking all notifications as read:", error);
      console.error("[notification-routes] Error details:", {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId: user.id,
      });
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[notification-routes] Exception marking all notifications as read:", error);
    console.error("[notification-routes] Exception details:", {
      error,
      message: error?.message,
      stack: error?.stack,
      userId: user?.id,
    });
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;

