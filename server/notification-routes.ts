import { Router } from "express";
import {
  cleanupOldReadNotifications,
  countUnreadNotifications,
  findUserNotification,
  listRecentReadNotifications,
  listUnreadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./data/notifications-repo";

const router = Router();

// Get all notifications for the authenticated user
// Returns: All unread notifications + Last 10 read notifications
// Old read notifications are automatically deleted from the database
router.get("/", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // 1. Fetch ALL unread notifications (no limit)
    const unreadNotifications = await listUnreadNotifications(user.id);

    // 2. Fetch LAST 10 read notifications
    const readNotifications = await listRecentReadNotifications(user.id, 10);

    // 3. Clean up old read notifications (keep only last 10)
    // If we have 10 read notifications, delete all others older than the 10th
    await cleanupOldReadNotifications(user.id, 10);

    // 4. Combine unread and read notifications
    const allNotifications = [
      ...(unreadNotifications || []),
      ...(readNotifications || [])
    ].sort((a, b) => {
      // Sort by created_at descending (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Get unread notification count
router.get("/unread-count", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const unreadCount = await countUnreadNotifications(user.id);
    res.json({ count: unreadCount });
  } catch (error: any) {
    console.error("[notification-routes] Exception fetching unread count:", error);
    console.error("[notification-routes] Exception details:", {
      error,
      message: error?.message,
      stack: error?.stack,
      userId: user?.id,
    });
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Mark notification as read
router.patch("/:id/read", async (req, res) => {
  const user = (req as any).user;
  const notificationId = req.params.id;
  
  try {
    // Verify notification belongs to user
    const notification = await findUserNotification(notificationId, user.id);

    if (!notification) {
      console.warn("[notification-routes] Notification not found:", { userId: user.id, notificationId });
      return res.status(404).json({ error: "Notification not found" });
    }

    // Mark as read
    await markNotificationRead(notificationId, user.id);

    // Clean up old read notifications after marking as read
    // Keep only the last 10 read notifications
    try {
      await cleanupOldReadNotifications(user.id, 10);
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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Mark all notifications as read
router.patch("/read-all", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // First, get the current unread notifications to determine what will be kept
    await listUnreadNotifications(user.id);

    // Mark all as read
    await markAllNotificationsRead(user.id);

    // Clean up old read notifications after marking all as read
    // Keep only the last 10 read notifications
    try {
      await cleanupOldReadNotifications(user.id, 10);
    } catch (cleanupError) {
      // Don't fail the request if cleanup fails
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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;

