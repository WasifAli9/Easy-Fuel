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
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json(notifications || []);
  } catch (error: any) {
    console.error("Error fetching notifications:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message });
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
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json({ count: count || 0 });
  } catch (error: any) {
    console.error("Error fetching unread count:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message });
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
      if (isSchemaCacheError(checkError)) return respondSchemaCacheIssue(res);
      throw checkError;
    }

    if (!notification) {
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
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error marking notification as read:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message });
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
      if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
      throw error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error marking all notifications as read:", error);
    if (isSchemaCacheError(error)) return respondSchemaCacheIssue(res);
    res.status(500).json({ error: error.message });
  }
});

export default router;

