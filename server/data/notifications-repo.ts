import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { notifications, type Notification } from "@shared/schema";

export async function listUnreadNotifications(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .orderBy(desc(notifications.createdAt));
}

export async function listRecentReadNotifications(userId: string, limit = 10) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, true)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(userId: string) {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return Number(rows[0]?.value ?? 0);
}

export async function findUserNotification(notificationId: string, userId: string) {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function markNotificationRead(notificationId: string, userId: string) {
  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}

export async function cleanupOldReadNotifications(userId: string, keepLatest = 10) {
  const readRows = await db
    .select({ id: notifications.id, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, true)))
    .orderBy(desc(notifications.createdAt))
    .limit(keepLatest + 1);

  if (readRows.length <= keepLatest) return;
  const cutoff = readRows[keepLatest]?.createdAt;
  if (!cutoff) return;

  await db
    .delete(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, true), lt(notifications.createdAt, cutoff)));
}

export async function createNotification(input: {
  userId: string;
  type: Notification["type"];
  title: string;
  message: string;
  data?: any;
}) {
  const rows = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data ?? null,
      read: false,
      deliveryStatus: "pending",
    })
    .returning();
  return rows[0] ?? null;
}

export async function markNotificationDelivered(notificationId: string) {
  await db
    .update(notifications)
    .set({
      deliveryStatus: "sent",
      deliveredAt: new Date(),
    })
    .where(eq(notifications.id, notificationId));
}

export async function markNotificationFailed(notificationId: string) {
  await db
    .update(notifications)
    .set({
      deliveryStatus: "failed",
    })
    .where(eq(notifications.id, notificationId));
}

export async function findRecentDuplicateNotification(input: {
  userId: string;
  type: Notification["type"];
  dedupeKey: string;
  windowSeconds?: number;
}) {
  const since = new Date(Date.now() - (input.windowSeconds ?? 8) * 1000);
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.type, input.type),
        gte(notifications.createdAt, since),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(10);
  if (rows.length === 0) return null;
  // Lightweight dedupe: same user + type inside small time window.
  return rows[0] ?? null;
}

