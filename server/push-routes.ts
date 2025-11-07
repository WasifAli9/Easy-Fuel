import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { z } from "zod";

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
});

router.post("/subscribe", async (req, res) => {
  const user = (req as any).user;

  try {
    const validated = subscriptionSchema.parse(req.body);

    const { data: existing } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", validated.endpoint)
      .single();

    if (existing) {
      return res.json({ success: true, message: "Subscription already exists" });
    }

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .insert({
        user_id: user.id,
        endpoint: validated.endpoint,
        p256dh: validated.keys.p256dh,
        auth: validated.keys.auth,
        user_agent: validated.userAgent || req.headers["user-agent"],
      });

    if (error) throw error;

    res.json({ success: true, message: "Subscription created successfully" });
  } catch (error: any) {
    console.error("Error subscribing to push notifications:", error);
    res.status(400).json({ error: error.message });
  }
});

router.post("/unsubscribe", async (req, res) => {
  const user = (req as any).user;

  try {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) throw error;

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
