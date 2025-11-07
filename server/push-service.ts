import webpush from "web-push";
import { supabaseAdmin } from "./supabase";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn("VAPID keys not configured. Push notifications will not work.");
} else {
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
  async sendToUser(userId: string, payload: PushNotificationPayload): Promise<number> {
    try {
      const { data: subscriptions, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching push subscriptions:", error);
        return 0;
      }

      if (!subscriptions || subscriptions.length === 0) {
        return 0;
      }

      let sentCount = 0;
      const failedSubscriptions: string[] = [];

      for (const subscription of subscriptions) {
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
          console.error("Error sending push notification:", error);
          
          if (error.statusCode === 404 || error.statusCode === 410) {
            failedSubscriptions.push(subscription.id);
          }
        }
      }

      if (failedSubscriptions.length > 0) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .in("id", failedSubscriptions);
      }

      return sentCount;
    } catch (error) {
      console.error("Error in sendToUser:", error);
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
