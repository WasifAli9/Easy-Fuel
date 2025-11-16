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
// Returns: All unread notifications + Last 10 read notifications
// Old read notifications are automatically deleted from the database
router.get("/", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // 1. Fetch ALL unread notifications (no limit)
    const { data: unreadNotifications, error: unreadError } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("read", false)
      .order("created_at", { ascending: false });

    if (unreadError) {
      console.error("[notification-routes] Error fetching unread notifications:", unreadError);
      if (isSchemaCacheError(unreadError)) return respondSchemaCacheIssue(res);
      throw unreadError;
    }

    // 2. Fetch LAST 10 read notifications
    const { data: readNotifications, error: readError } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("read", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (readError) {
      console.error("[notification-routes] Error fetching read notifications:", readError);
      if (isSchemaCacheError(readError)) return respondSchemaCacheIssue(res);
      throw readError;
    }

    // 3. Clean up old read notifications (keep only last 10)
    // If we have 10 read notifications, delete all others older than the 10th
    if (readNotifications && readNotifications.length >= 10) {
      const oldestKeptNotification = readNotifications[readNotifications.length - 1];
      const oldestKeptDate = oldestKeptNotification.created_at;

      // Delete all read notifications older than the 10th one
      const { error: deleteError } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .eq("read", true)
        .lt("created_at", oldestKeptDate);

      if (deleteError) {
        console.error("[notification-routes] Error deleting old read notifications:", deleteError);
        // Don't fail the request if cleanup fails, just log it
      } else {
        console.log(`[notification-routes] Cleaned up old read notifications for user ${user.id}`);
      }
    }

    // 4. Combine unread and read notifications
    const allNotifications = [
      ...(unreadNotifications || []),
      ...(readNotifications || [])
    ].sort((a, b) => {
      // Sort by created_at descending (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json(allNotifications);
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

    // Clean up old read notifications after marking as read
    // Keep only the last 10 read notifications
    try {
      const { data: readNotifications } = await supabaseAdmin
        .from("notifications")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("read", true)
        .order("created_at", { ascending: false })
        .limit(11); // Get 11 to check if we need cleanup

      if (readNotifications && readNotifications.length > 10) {
        const oldestKeptNotification = readNotifications[9]; // 10th notification (0-indexed)
        const oldestKeptDate = oldestKeptNotification.created_at;

        // Delete all read notifications older than the 10th one
        await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("user_id", user.id)
          .eq("read", true)
          .lt("created_at", oldestKeptDate);
        
        console.log(`[notification-routes] Cleaned up old read notifications after marking ${notificationId} as read`);
      }
    } catch (cleanupError) {
      console.error("[notification-routes] Error cleaning up old notifications:", cleanupError);
      // Don't fail the request if cleanup fails
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
    // First, get the current unread notifications to determine what will be kept
    const { data: unreadNotifications } = await supabaseAdmin
      .from("notifications")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("read", false)
      .order("created_at", { ascending: false });

    // Mark all as read
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

    // Clean up old read notifications after marking all as read
    // Keep only the last 10 read notifications
    try {
      const { data: allReadNotifications } = await supabaseAdmin
        .from("notifications")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("read", true)
        .order("created_at", { ascending: false })
        .limit(11); // Get 11 to check if we need cleanup

      if (allReadNotifications && allReadNotifications.length > 10) {
        const oldestKeptNotification = allReadNotifications[9]; // 10th notification (0-indexed)
        const oldestKeptDate = oldestKeptNotification.created_at;

        // Delete all read notifications older than the 10th one
        await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("user_id", user.id)
          .eq("read", true)
          .lt("created_at", oldestKeptDate);
        
        console.log(`[notification-routes] Cleaned up old read notifications after marking all as read for user ${user.id}`);
      }
    } catch (cleanupError) {
      console.error("[notification-routes] Error cleaning up old notifications after mark all as read:", cleanupError);
      // Don't fail the request if cleanup fails
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

