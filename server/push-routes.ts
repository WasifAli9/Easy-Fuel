import { Router } from "express";
import { z } from "zod";
import {
  createPushSubscription,
  deletePushSubscription,
  findPushSubscriptionByEndpoint,
} from "./data/push-subscriptions-repo";

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
});

const expoSubscriptionSchema = z.object({
  expoPushToken: z.string().min(10),
  userAgent: z.string().optional(),
});

router.post("/subscribe", async (req, res) => {
  const user = (req as any).user;

  try {
    const isExpo = typeof req.body?.expoPushToken === "string";
    if (isExpo) {
      const validatedExpo = expoSubscriptionSchema.parse(req.body);
      const existingExpo = await findPushSubscriptionByEndpoint(validatedExpo.expoPushToken);
      if (existingExpo) {
        return res.json({ success: true, message: "Expo subscription already exists" });
      }

      await createPushSubscription({
        userId: user.id,
        endpoint: validatedExpo.expoPushToken,
        p256dh: "expo",
        auth: "expo",
        userAgent: validatedExpo.userAgent || (req.headers["user-agent"] as string | undefined),
      });
      return res.json({ success: true, message: "Expo subscription created successfully" });
    }

    const validated = subscriptionSchema.parse(req.body);

    const existing = await findPushSubscriptionByEndpoint(validated.endpoint);

    if (existing) {
      return res.json({ success: true, message: "Subscription already exists" });
    }

    await createPushSubscription({
      userId: user.id,
      endpoint: validated.endpoint,
      p256dh: validated.keys.p256dh,
      auth: validated.keys.auth,
      userAgent: validated.userAgent || (req.headers["user-agent"] as string | undefined),
    });

    res.json({ success: true, message: "Subscription created successfully" });
  } catch (error: any) {
    console.error("Error subscribing to push notifications:", error);
    res.status(400).json({ error: error.message });
  }
});

router.post("/unsubscribe", async (req, res) => {
  const user = (req as any).user;

  try {
    const { endpoint } = z.object({ endpoint: z.string().optional(), expoPushToken: z.string().optional() }).parse(req.body);
    const target = endpoint || req.body?.expoPushToken;
    if (!target) {
      return res.status(400).json({ error: "endpoint or expoPushToken is required" });
    }

    await deletePushSubscription(user.id, target);

    res.json({ success: true, message: "Subscription removed successfully" });
  } catch (error: any) {
    console.error("Error unsubscribing from push notifications:", error);
    res.status(400).json({ error: error.message });
  }
});

router.get("/vapid-public-key", (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  
  if (!publicKey) {
    return res.status(500).json({ error: "VAPID public key not configured" });
  }

  res.json({ publicKey });
});

export default router;
