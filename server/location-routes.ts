import { Router } from "express";
import { z } from "zod";
import { db } from "./db";
import { customers, driverLocations, drivers, orders } from "@shared/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

const router = Router();

const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
});

router.post("/update", async (req, res) => {
  const user = (req as any).user;

  try {
    const validated = updateLocationSchema.parse(req.body);

    const driverRows = await db
      .select({ id: drivers.id, availabilityStatus: drivers.availabilityStatus })
      .from(drivers)
      .where(eq(drivers.userId, user.id))
      .limit(1);
    const driver = driverRows[0];
    if (!driver) {
      return res.status(404).json({ error: "Driver profile not found" });
    }

    await db
      .update(drivers)
      .set({
        currentLat: validated.latitude,
        currentLng: validated.longitude,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, driver.id));

    try {
      await db.insert(driverLocations).values({
        driverId: driver.id,
        lat: validated.latitude,
        lng: validated.longitude,
        accuracy: validated.accuracy ?? null,
      });
    } catch (historyError) {
      console.error("Error saving location history:", historyError);
    }

    res.json({ success: true, message: "Location updated successfully" });
  } catch (error: any) {
    console.error("Error updating driver location:", error);
    res.status(400).json({ error: error.message });
  }
});

router.get("/driver/:driverId", async (req, res) => {
  const user = (req as any).user;
  const { driverId } = req.params;

  try {
    const customerRows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, user.id))
      .limit(1);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(403).json({ error: "Only customers can view driver locations" });
    }

    const activeOrderRows = await db
      .select({ id: orders.id, state: orders.state })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customer.id),
          eq(orders.assignedDriverId, driverId),
          inArray(orders.state, ["assigned", "en_route", "in_progress"] as any),
        ),
      )
      .limit(1);
    const order = activeOrderRows[0];
    if (!order) {
      return res.status(403).json({ 
        error: "You can only view the location of drivers assigned to your active orders" 
      });
    }

    const driverRows = await db
      .select({
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        updatedAt: drivers.updatedAt,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    const driverLocation = driverRows[0];
    if (!driverLocation) {
      return res.status(404).json({ error: "Driver location not found" });
    }

    if (driverLocation.currentLat == null || driverLocation.currentLng == null) {
      return res.status(404).json({ error: "Driver location not available" });
    }

    res.json({
      latitude: driverLocation.currentLat,
      longitude: driverLocation.currentLng,
      lastUpdate: driverLocation.updatedAt,
    });
  } catch (error: any) {
    console.error("Error fetching driver location:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/history/:orderId", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    const orderRows = await db
      .select({
        assignedDriverId: orders.assignedDriverId,
        customerUserId: customers.userId,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, orderId))
      .limit(1);
    const order = orderRows[0];
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const customerUserId = order.customerUserId;
    if (customerUserId !== user.id) {
      return res.status(403).json({ error: "You can only view location history for your own orders" });
    }

    if (!order.assignedDriverId) {
      return res.status(404).json({ error: "No driver assigned to this order" });
    }

    const locations = await db
      .select({
        latitude: driverLocations.lat,
        longitude: driverLocations.lng,
        accuracy: driverLocations.accuracy,
        recordedAt: driverLocations.createdAt,
      })
      .from(driverLocations)
      .where(eq(driverLocations.driverId, order.assignedDriverId))
      .orderBy(asc(driverLocations.createdAt))
      .limit(100);

    res.json(locations);
  } catch (error: any) {
    console.error("Error fetching location history:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
