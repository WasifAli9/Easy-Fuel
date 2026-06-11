import webpush from "web-push";
import {
  deletePushSubscriptionsByIds,
  listExpoPushTokensByUser,
  listWebPushSubscriptionsByUser,
} from "./data/push-subscriptions-repo";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:support@easyfuel.za",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  tag?: string;
  requireInteraction?: boolean;
}

class PushNotificationService {
  private parseExpoTickets(json: unknown): Array<{ status?: string; message?: string; details?: unknown }> {
    const root = json as { data?: unknown };
    if (Array.isArray(root?.data)) {
      return root.data as Array<{ status?: string; message?: string; details?: unknown }>;
    }
    if (root?.data && typeof root.data === "object") {
      return [root.data as { status?: string; message?: string; details?: unknown }];
    }
    return [];
  }

  private async sendExpoPush(token: string, payload: PushNotificationPayload): Promise<boolean> {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify({
          to: token,
          sound: "default",
          title: payload.title,
          body: payload.body,
          data: payload.data ?? {},
          channelId: "default",
          priority: "high",
        }),
      });
      if (!response.ok) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[push] Expo HTTP error:", response.status, token.slice(0, 28));
        }
        return false;
      }
      const json = await response.json();
      const tickets = this.parseExpoTickets(json);
      const ok = tickets.some((ticket) => ticket.status === "ok");
      if (!ok) {
        console.warn("[push] Expo ticket rejected:", token.slice(0, 28), tickets);
      }
      return ok;
    } catch (error) {
      console.warn("[push] Expo send failed:", error);
      return false;
    }
  }

  async sendToUser(userId: string, payload: PushNotificationPayload): Promise<number> {
    try {
      const expoTokens = await listExpoPushTokensByUser(userId);
      const webSubscriptions = await listWebPushSubscriptionsByUser(userId);
      let sentCount = 0;
      const failedSubscriptions: string[] = [];

      if (expoTokens.length === 0 && webSubscriptions.length === 0) {
        console.debug("[push] no device subscriptions for user", userId);
      }

      for (const tokenRow of expoTokens) {
        const ok = await this.sendExpoPush(tokenRow.endpoint, payload);
        if (ok) sentCount++;
      }

      for (const subscription of webSubscriptions) {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          };

          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify(payload)
          );
          sentCount++;
        } catch (error: any) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            failedSubscriptions.push(subscription.id);
          }
        }
      }

      if (failedSubscriptions.length > 0) {
        await deletePushSubscriptionsByIds(failedSubscriptions);
      }

      return sentCount;
    } catch (error) {
      return 0;
    }
  }

  async sendOrderUpdate(
    userId: string,
    orderId: string,
    title: string,
    body: string,
    additionalData?: any
  ): Promise<number> {
    return this.sendToUser(userId, {
      title,
      body,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: `order-${orderId}`,
      data: {
        type: "order_update",
        orderId,
        ...additionalData,
      },
    });
  }

  async sendDriverAssignment(
    customerId: string,
    orderId: string,
    driverName: string
  ): Promise<number> {
    return this.sendOrderUpdate(
      customerId,
      orderId,
      "Driver Assigned",
      `${driverName} has been assigned to your fuel delivery`,
      { action: "view_order" }
    );
  }

  async sendNewDispatchOffer(
    driverId: string,
    orderId: string,
    fuelType: string,
    litres: number,
    earnings: number,
    currency: string
  ): Promise<number> {
    return this.sendToUser(driverId, {
      title: "New Fuel Request",
      body: `${litres}L ${fuelType} delivery - Earn ${currency}${earnings.toFixed(2)}`,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: `offer-${orderId}`,
      requireInteraction: true,
      data: {
        type: "dispatch_offer",
        orderId,
        action: "view_offers",
      },
    });
  }

  async sendChatMessage(
    recipientUserId: string,
    senderName: string,
    message: string,
    orderId: string
  ): Promise<number> {
    return this.sendToUser(recipientUserId, {
      title: senderName,
      body: message,
      icon: "/icon-192.png",
      tag: `chat-${orderId}`,
      data: {
        type: "chat_message",
        orderId,
        action: "view_chat",
      },
    });
  }
}

export const pushNotificationService = new PushNotificationService();
