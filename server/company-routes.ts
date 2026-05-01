import { Router } from "express";
import { z } from "zod";
import { vehicleToCamelCase, syncDriverVehicleCapacityLitres } from "./vehicle-utils";
import { websocketService } from "./websocket";
import { db } from "./db";
import { companies, driverCompanyMemberships, drivers, orders, profiles, vehicles } from "@shared/schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

const router = Router();

function toVehicleRecord(row: any) {
  return {
    id: row.id,
    driver_id: row.driverId,
    company_id: row.companyId,
    registration_number: row.registrationNumber,
    make: row.make,
    model: row.model,
    year: row.year,
    capacity_litres: row.capacityLitres,
    fuel_types: row.fuelTypes,
    license_disk_expiry: row.licenseDiskExpiry,
    roadworthy_expiry: row.roadworthyExpiry,
    insurance_expiry: row.insuranceExpiry,
    tracker_installed: row.trackerInstalled,
    tracker_provider: row.trackerProvider,
    vehicle_registration_cert_doc_id: row.vehicleRegistrationCertDocId,
    vehicle_status: row.vehicleStatus,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function requireCompany(req: any, res: any, next: any) {
  try {
    const user = req.user;
    const profileRows = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
    const profile = profileRows[0];
    if (!profile || profile.role !== "company") {
      return res.status(403).json({ error: "Company access required" });
    }
    const companyRows = await db
      .select({ id: companies.id, name: companies.name, status: companies.status })
      .from(companies)
      .where(eq(companies.ownerUserId, user.id))
      .limit(1);
    const company = companyRows[0];
    if (!company) {
      return res.status(404).json({ error: "Company record not found" });
    }
    req.companyRecord = company;
    req.companyId = company.id;
    next();
  } catch (e: any) {
    console.error("requireCompany:", e);
    res.status(500).json({ error: e.message });
  }
}

router.use(requireCompany);

async function driverLinkedToCompany(driverId: string, companyId: string): Promise<boolean> {
  const data = await db
    .select({ id: driverCompanyMemberships.id })
    .from(driverCompanyMemberships)
    .where(and(eq(driverCompanyMemberships.companyId, companyId), eq(driverCompanyMemberships.driverId, driverId)))
    .limit(1);
  return !!data;
}

const fleetVehicleCreateBody = z.object({
  registration_number: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().optional().nullable(),
  capacity_litres: z.coerce.number().optional().nullable(),
  fuel_types: z.array(z.string()).optional(),
  license_disk_expiry: z.string().nullable().optional(),
  roadworthy_expiry: z.string().nullable().optional(),
  insurance_expiry: z.string().nullable().optional(),
  tracker_installed: z.boolean().optional(),
  tracker_provider: z.string().optional(),
});

const assignBody = z.object({
  driverId: z.string().uuid(),
});

/** Fleet vehicles for this company (pool + assigned), with driver display names */
router.get("/vehicles", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const vehs = await db.select().from(vehicles).where(eq(vehicles.companyId, companyId)).orderBy(desc(vehicles.createdAt));

    const driverIds = Array.from(
      new Set((vehs || []).map((v: any) => v.driverId).filter(Boolean))
    ) as string[];
    let profileByDriver = new Map<string, string | null>();
    if (driverIds.length > 0) {
      const drs = await db.select({ id: drivers.id, user_id: drivers.userId }).from(drivers).where(inArray(drivers.id, driverIds));
      const userIds = Array.from(new Set((drs || []).map((d: any) => d.user_id).filter(Boolean)));
      const profs = userIds.length > 0
        ? await db.select({ id: profiles.id, full_name: profiles.fullName }).from(profiles).where(inArray(profiles.id, userIds as string[]))
        : [];
      const nameByUser = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      for (const d of drs || []) {
        profileByDriver.set((d as any).id, nameByUser.get((d as any).user_id) ?? null);
      }
    }

    const list = (vehs || []).map((v: any) => ({
      ...vehicleToCamelCase(toVehicleRecord(v)),
      assignedDriverName: v.driverId ? profileByDriver.get(v.driverId) ?? null : null,
    }));
    res.json(list);
  } catch (e: any) {
    console.error("GET /company/vehicles:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/vehicles", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const parsed = fleetVehicleCreateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  try {
    const insert = {
      companyId: companyId,
      driverId: null as string | null,
      registrationNumber: b.registration_number,
      make: b.make ?? null,
      model: b.model ?? null,
      year: b.year ?? null,
      capacityLitres: b.capacity_litres ?? null,
      fuelTypes: b.fuel_types ?? null,
      licenseDiskExpiry: b.license_disk_expiry ? new Date(b.license_disk_expiry) : null,
      roadworthyExpiry: b.roadworthy_expiry ? new Date(b.roadworthy_expiry) : null,
      insuranceExpiry: b.insurance_expiry ? new Date(b.insurance_expiry) : null,
      trackerInstalled: b.tracker_installed ?? false,
      trackerProvider: b.tracker_provider ?? null,
    };
    const inserted = await db.insert(vehicles).values(insert).returning();
    const vehicle = inserted[0];
    res.json(vehicleToCamelCase(toVehicleRecord(vehicle)));
  } catch (e: any) {
    console.error("POST /company/vehicles:", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/vehicles/:vehicleId", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  try {
    const existingRows = await db
      .select({ id: vehicles.id, company_id: vehicles.companyId })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing || existing.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const updateData: Record<string, unknown> = {};
    const b = req.body || {};
    if (b.registration_number !== undefined) updateData.registrationNumber = b.registration_number;
    if (b.make !== undefined) updateData.make = b.make;
    if (b.model !== undefined) updateData.model = b.model;
    if (b.year !== undefined) updateData.year = b.year;
    if (b.capacity_litres !== undefined) updateData.capacityLitres = b.capacity_litres;
    if (b.fuel_types !== undefined) updateData.fuelTypes = b.fuel_types;
    if (b.license_disk_expiry !== undefined) updateData.licenseDiskExpiry = b.license_disk_expiry ? new Date(b.license_disk_expiry) : null;
    if (b.roadworthy_expiry !== undefined) updateData.roadworthyExpiry = b.roadworthy_expiry ? new Date(b.roadworthy_expiry) : null;
    if (b.insurance_expiry !== undefined) updateData.insuranceExpiry = b.insurance_expiry ? new Date(b.insurance_expiry) : null;
    if (b.tracker_installed !== undefined) updateData.trackerInstalled = b.tracker_installed;
    if (b.tracker_provider !== undefined) updateData.trackerProvider = b.tracker_provider;
    updateData.updatedAt = new Date();

    const updated = await db.update(vehicles).set(updateData).where(eq(vehicles.id, vehicleId)).returning();
    const vehicle = updated[0];
    const assignedId = vehicle.driverId as string | null;
    if (assignedId) await syncDriverVehicleCapacityLitres(assignedId);
    res.json(vehicleToCamelCase(toVehicleRecord(vehicle)));
  } catch (e: any) {
    console.error("PATCH /company/vehicles:", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/vehicles/:vehicleId", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  try {
    const existingRows = await db
      .select({ id: vehicles.id, company_id: vehicles.companyId, driver_id: vehicles.driverId })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing || existing.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    if (existing.driver_id) {
      return res.status(400).json({ error: "Unassign the vehicle from the driver before deleting" });
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /company/vehicles:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/vehicles/:vehicleId/assign", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  const parsed = assignBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const newDriverId = parsed.data.driverId;

  try {
    const vehicleRows = await db
      .select({ id: vehicles.id, company_id: vehicles.companyId, driver_id: vehicles.driverId })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    const vehicle = vehicleRows[0];
    if (!vehicle || vehicle.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const ok = await driverLinkedToCompany(newDriverId, companyId);
    if (!ok) return res.status(400).json({ error: "Driver is not linked to your company" });

    const previousDriverId = vehicle.driver_id as string | null;

    const updatedRows = await db
      .update(vehicles)
      .set({
        driverId: newDriverId,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning();
    const updated = updatedRows[0];

    if (previousDriverId && previousDriverId !== newDriverId) {
      await syncDriverVehicleCapacityLitres(previousDriverId);
    }
    await syncDriverVehicleCapacityLitres(newDriverId);

    const drowRows = await db.select({ user_id: drivers.userId }).from(drivers).where(eq(drivers.id, newDriverId)).limit(1);
    const drow = drowRows[0];
    if (drow?.user_id) {
      websocketService.sendToUser(drow.user_id, {
        type: "vehicle_updated",
        payload: { vehicleId },
      });
    }

    res.json(vehicleToCamelCase(toVehicleRecord(updated)));
  } catch (e: any) {
    console.error("POST /company/vehicles/assign:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/vehicles/:vehicleId/unassign", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  try {
    const vehicleRows = await db
      .select({ id: vehicles.id, company_id: vehicles.companyId, driver_id: vehicles.driverId })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    const vehicle = vehicleRows[0];
    if (!vehicle || vehicle.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const prev = vehicle.driver_id as string | null;
    if (!prev) return res.json(vehicleToCamelCase(toVehicleRecord(vehicle)));

    const updatedRows = await db
      .update(vehicles)
      .set({
        driverId: null,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning();
    const updated = updatedRows[0];

    await syncDriverVehicleCapacityLitres(prev);

    const drowRows = await db.select({ user_id: drivers.userId }).from(drivers).where(eq(drivers.id, prev)).limit(1);
    const drow = drowRows[0];
    if (drow?.user_id) {
      websocketService.sendToUser(drow.user_id, {
        type: "vehicle_updated",
        payload: { vehicleId },
      });
    }

    res.json(vehicleToCamelCase(toVehicleRecord(updated)));
  } catch (e: any) {
    console.error("POST /company/vehicles/unassign:", e);
    res.status(500).json({ error: e.message });
  }
});

/** Aggregated KPIs for company dashboard */
router.get("/overview", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const memberships = await db
      .select({
        driver_id: driverCompanyMemberships.driverId,
        is_disabled_by_company: driverCompanyMemberships.isDisabledByCompany,
      })
      .from(driverCompanyMemberships)
      .where(eq(driverCompanyMemberships.companyId, companyId));

    const rows = (memberships || []).filter((r: any) => r.driver_id);
    const driverIds = rows.map((r: any) => r.driver_id);
    const totalDrivers = rows.length;
    const disabledCount = rows.filter((r: any) => r.is_disabled_by_company).length;
    const activeFleetCount = totalDrivers - disabledCount;

    let completedDeliveries = 0;
    let revenueCents = 0;
    if (driverIds.length > 0) {
      const orderRows = await db
        .select({ id: orders.id, total_cents: orders.totalCents })
        .from(orders)
        .where(and(inArray(orders.assignedDriverId, driverIds), eq(orders.state, "delivered")));
      completedDeliveries = orderRows.length;
      revenueCents = orderRows.reduce((s: number, o: any) => s + (o.total_cents || 0), 0);
    }

    return res.json({
      companyId,
      totalDrivers,
      activeFleetCount,
      disabledDrivers: disabledCount,
      completedDeliveries,
      revenueCents,
    });
  } catch (e: any) {
    console.error("GET /company/overview:", e);
    res.status(500).json({ error: e.message });
  }
});

/** Drivers linked to this company */
router.get("/drivers", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const memberships = await db
      .select({
        driver_id: driverCompanyMemberships.driverId,
        is_disabled_by_company: driverCompanyMemberships.isDisabledByCompany,
        disabled_reason: driverCompanyMemberships.disabledReason,
        updated_at: driverCompanyMemberships.updatedAt,
      })
      .from(driverCompanyMemberships)
      .where(eq(driverCompanyMemberships.companyId, companyId));
    const rows = (memberships || []).filter((r: any) => r.driver_id);
    if (rows.length === 0) return res.json([]);

    const driverIds = Array.from(new Set(rows.map((r: any) => r.driver_id as string)));

    let drivers: any[] = [];
    if (driverIds.length > 0) {
      const dRows = await db
        .select({
          id: drivers.id,
          user_id: drivers.userId,
          status: drivers.status,
          compliance_status: drivers.complianceStatus,
          availability_status: drivers.availabilityStatus,
          completed_trips: drivers.completedTrips,
          rating: drivers.rating,
        })
        .from(drivers)
        .where(inArray(drivers.id, driverIds));
      drivers = dRows || [];
    }

    const userIds = Array.from(new Set(drivers.map((d: any) => d.user_id).filter(Boolean)));
    let profiles: any[] = [];
    if (userIds.length > 0) {
      const pRows = await db
        .select({ id: profiles.id, full_name: profiles.fullName, phone: profiles.phone })
        .from(profiles)
        .where(inArray(profiles.id, userIds as string[]));
      profiles = pRows || [];
    }

    const profileByUserId = new Map(profiles.map((p: any) => [p.id, p]));
    const driverById = new Map(drivers.map((d: any) => [d.id, d]));

    const list = rows.map((r: any) => {
      const d = driverById.get(r.driver_id);
      const prof = d?.user_id ? profileByUserId.get(d.user_id) : undefined;
      return {
        driverId: r.driver_id,
        userId: d?.user_id ?? null,
        fullName: prof?.full_name ?? null,
        phone: prof?.phone ?? null,
        status: d?.status ?? "pending_compliance",
        complianceStatus: d?.compliance_status ?? "pending",
        availabilityStatus: d?.availability_status ?? "offline",
        completedTrips: d?.completed_trips ?? 0,
        rating: d?.rating ?? null,
        isDisabledByCompany: r.is_disabled_by_company ?? false,
        disabledReason: r.disabled_reason ?? null,
        membershipUpdatedAt: r.updated_at ?? null,
      };
    });

    res.json(list);
  } catch (e: any) {
    console.error("GET /company/drivers:", e);
    res.status(500).json({ error: e.message });
  }
});

const disableBody = z.object({
  reason: z.string().max(500).optional(),
});

router.post("/drivers/:driverId/disable", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;
  const parsed = disableBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const memRows = await db
    .select({ id: driverCompanyMemberships.id })
    .from(driverCompanyMemberships)
    .where(and(eq(driverCompanyMemberships.companyId, companyId), eq(driverCompanyMemberships.driverId, driverId)))
    .limit(1);
  const mem = memRows[0];
  if (!mem) return res.status(404).json({ error: "Driver is not linked to your company" });

  await db
    .update(driverCompanyMemberships)
    .set({
      isDisabledByCompany: true,
      disabledReason: parsed.data.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(driverCompanyMemberships.id, mem.id));
  res.json({ ok: true });
});

router.post("/drivers/:driverId/enable", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;

  const memRows = await db
    .select({ id: driverCompanyMemberships.id })
    .from(driverCompanyMemberships)
    .where(and(eq(driverCompanyMemberships.companyId, companyId), eq(driverCompanyMemberships.driverId, driverId)))
    .limit(1);
  const mem = memRows[0];
  if (!mem) return res.status(404).json({ error: "Driver is not linked to your company" });

  await db
    .update(driverCompanyMemberships)
    .set({
      isDisabledByCompany: false,
      disabledReason: null,
      updatedAt: new Date(),
    })
    .where(eq(driverCompanyMemberships.id, mem.id));
  res.json({ ok: true });
});

router.get("/drivers/:driverId/orders", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;

  const memRows = await db
    .select({ id: driverCompanyMemberships.id })
    .from(driverCompanyMemberships)
    .where(and(eq(driverCompanyMemberships.companyId, companyId), eq(driverCompanyMemberships.driverId, driverId)))
    .limit(1);
  const mem = memRows[0];
  if (!mem) return res.status(404).json({ error: "Driver is not linked to your company" });

  const orderRows = await db
    .select({
      id: orders.id,
      state: orders.state,
      total_cents: orders.totalCents,
      litres: orders.litres,
      created_at: orders.createdAt,
      delivered_at: orders.deliveredAt,
      paid_at: orders.paidAt,
    })
    .from(orders)
    .where(eq(orders.assignedDriverId, driverId))
    .orderBy(desc(orders.createdAt))
    .limit(100);
  res.json(orderRows || []);
});

/** Daily delivered order counts for charts (last 30 days) */
router.get("/analytics/daily-deliveries", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const memberships = await db
      .select({ driver_id: driverCompanyMemberships.driverId })
      .from(driverCompanyMemberships)
      .where(eq(driverCompanyMemberships.companyId, companyId));
    const driverIds = (memberships || []).map((r: any) => r.driver_id);
    if (driverIds.length === 0) return res.json([]);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const orderRows = await db
      .select({ delivered_at: orders.deliveredAt })
      .from(orders)
      .where(
        and(
          inArray(orders.assignedDriverId, driverIds),
          eq(orders.state, "delivered"),
          gte(orders.deliveredAt, since),
        ),
      );

    const byDay = new Map<string, number>();
    for (const o of orderRows || []) {
      const d = (o as any).delivered_at;
      if (!d) continue;
      const day = String(d).slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    const sorted = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    res.json(sorted.map(([date, count]) => ({ date, count })));
  } catch (e: any) {
    console.error("GET /company/analytics/daily-deliveries:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
