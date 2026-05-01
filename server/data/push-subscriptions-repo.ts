import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { pushSubscriptions } from "@shared/schema";

export async function findPushSubscriptionByEndpoint(endpoint: string) {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function listPushSubscriptionsByUser(userId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function listExpoPushTokensByUser(userId: string) {
  const rows = await listPushSubscriptionsByUser(userId);
  return rows.filter((row) => row.endpoint.startsWith("ExpoPushToken["));
}

export async function listWebPushSubscriptionsByUser(userId: string) {
  const rows = await listPushSubscriptionsByUser(userId);
  return rows.filter((row) => row.endpoint.startsWith("http://") || row.endpoint.startsWith("https://"));
}

export async function deletePushSubscriptionsByIds(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids));
}

