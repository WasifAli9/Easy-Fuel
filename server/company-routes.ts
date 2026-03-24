import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { z } from "zod";
import { vehicleToCamelCase, syncDriverVehicleCapacityLitres } from "./vehicle-utils";
import { websocketService } from "./websocket";

const router = Router();

async function requireCompany(req: any, res: any, next: any) {
  try {
    const user = req.user;
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (pErr || !profile || profile.role !== "company") {
      return res.status(403).json({ error: "Company access required" });
    }
    const { data: company, error: cErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, status")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (cErr || !company) {
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
  const { data, error } = await supabaseAdmin
    .from("driver_company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error) return false;
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
    const { data: vehs, error } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const driverIds = Array.from(
      new Set((vehs || []).map((v: any) => v.driver_id).filter(Boolean))
    ) as string[];
    let profileByDriver = new Map<string, string | null>();
    if (driverIds.length > 0) {
      const { data: drs } = await supabaseAdmin.from("drivers").select("id, user_id").in("id", driverIds);
      const userIds = (drs || []).map((d: any) => d.user_id);
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds);
      const nameByUser = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      for (const d of drs || []) {
        profileByDriver.set((d as any).id, nameByUser.get((d as any).user_id) ?? null);
      }
    }

    const list = (vehs || []).map((v: any) => ({
      ...vehicleToCamelCase(v),
      assignedDriverName: v.driver_id ? profileByDriver.get(v.driver_id) ?? null : null,
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
      company_id: companyId,
      driver_id: null as string | null,
      registration_number: b.registration_number,
      make: b.make ?? null,
      model: b.model ?? null,
      year: b.year ?? null,
      capacity_litres: b.capacity_litres ?? null,
      fuel_types: b.fuel_types ?? null,
      license_disk_expiry: b.license_disk_expiry ?? null,
      roadworthy_expiry: b.roadworthy_expiry ?? null,
      insurance_expiry: b.insurance_expiry ?? null,
      tracker_installed: b.tracker_installed ?? false,
      tracker_provider: b.tracker_provider ?? null,
    };
    const { data: vehicle, error } = await supabaseAdmin.from("vehicles").insert(insert).select().single();
    if (error) throw error;
    res.json(vehicleToCamelCase(vehicle));
  } catch (e: any) {
    console.error("POST /company/vehicles:", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/vehicles/:vehicleId", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  try {
    const { data: existing, error: e0 } = await supabaseAdmin
      .from("vehicles")
      .select("id, company_id")
      .eq("id", vehicleId)
      .maybeSingle();
    if (e0) throw e0;
    if (!existing || existing.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const updateData: Record<string, unknown> = {};
    const b = req.body || {};
    if (b.registration_number !== undefined) updateData.registration_number = b.registration_number;
    if (b.make !== undefined) updateData.make = b.make;
    if (b.model !== undefined) updateData.model = b.model;
    if (b.year !== undefined) updateData.year = b.year;
    if (b.capacity_litres !== undefined) updateData.capacity_litres = b.capacity_litres;
    if (b.fuel_types !== undefined) updateData.fuel_types = b.fuel_types;
    if (b.license_disk_expiry !== undefined) updateData.license_disk_expiry = b.license_disk_expiry;
    if (b.roadworthy_expiry !== undefined) updateData.roadworthy_expiry = b.roadworthy_expiry;
    if (b.insurance_expiry !== undefined) updateData.insurance_expiry = b.insurance_expiry;
    if (b.tracker_installed !== undefined) updateData.tracker_installed = b.tracker_installed;
    if (b.tracker_provider !== undefined) updateData.tracker_provider = b.tracker_provider;
    updateData.updated_at = new Date().toISOString();

    const { data: vehicle, error } = await supabaseAdmin
      .from("vehicles")
      .update(updateData)
      .eq("id", vehicleId)
      .select()
      .single();
    if (error) throw error;
    const assignedId = vehicle.driver_id as string | null;
    if (assignedId) await syncDriverVehicleCapacityLitres(assignedId);
    res.json(vehicleToCamelCase(vehicle));
  } catch (e: any) {
    console.error("PATCH /company/vehicles:", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/vehicles/:vehicleId", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  try {
    const { data: existing, error: e0 } = await supabaseAdmin
      .from("vehicles")
      .select("id, company_id, driver_id")
      .eq("id", vehicleId)
      .maybeSingle();
    if (e0) throw e0;
    if (!existing || existing.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    if (existing.driver_id) {
      return res.status(400).json({ error: "Unassign the vehicle from the driver before deleting" });
    }
    const { error } = await supabaseAdmin.from("vehicles").delete().eq("id", vehicleId);
    if (error) throw error;
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
    const { data: vehicle, error: e0 } = await supabaseAdmin
      .from("vehicles")
      .select("id, company_id, driver_id")
      .eq("id", vehicleId)
      .maybeSingle();
    if (e0) throw e0;
    if (!vehicle || vehicle.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const ok = await driverLinkedToCompany(newDriverId, companyId);
    if (!ok) return res.status(400).json({ error: "Driver is not linked to your company" });

    const previousDriverId = vehicle.driver_id as string | null;

    const { data: updated, error } = await supabaseAdmin
      .from("vehicles")
      .update({
        driver_id: newDriverId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vehicleId)
      .select()
      .single();
    if (error) throw error;

    if (previousDriverId && previousDriverId !== newDriverId) {
      await syncDriverVehicleCapacityLitres(previousDriverId);
    }
    await syncDriverVehicleCapacityLitres(newDriverId);

    const { data: drow } = await supabaseAdmin.from("drivers").select("user_id").eq("id", newDriverId).single();
    if (drow?.user_id) {
      websocketService.sendToUser(drow.user_id, {
        type: "vehicle_updated",
        payload: { vehicleId },
      });
    }

    res.json(vehicleToCamelCase(updated));
  } catch (e: any) {
    console.error("POST /company/vehicles/assign:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/vehicles/:vehicleId/unassign", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const { vehicleId } = req.params;
  try {
    const { data: vehicle, error: e0 } = await supabaseAdmin
      .from("vehicles")
      .select("id, company_id, driver_id")
      .eq("id", vehicleId)
      .maybeSingle();
    if (e0) throw e0;
    if (!vehicle || vehicle.company_id !== companyId) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const prev = vehicle.driver_id as string | null;
    if (!prev) return res.json(vehicleToCamelCase(vehicle));

    const { data: updated, error } = await supabaseAdmin
      .from("vehicles")
      .update({
        driver_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vehicleId)
      .select()
      .single();
    if (error) throw error;

    await syncDriverVehicleCapacityLitres(prev);

    const { data: drow } = await supabaseAdmin.from("drivers").select("user_id").eq("id", prev).single();
    if (drow?.user_id) {
      websocketService.sendToUser(drow.user_id, {
        type: "vehicle_updated",
        payload: { vehicleId },
      });
    }

    res.json(vehicleToCamelCase(updated));
  } catch (e: any) {
    console.error("POST /company/vehicles/unassign:", e);
    res.status(500).json({ error: e.message });
  }
});

/** Aggregated KPIs for company dashboard */
router.get("/overview", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("driver_company_memberships")
      .select("driver_id, is_disabled_by_company")
      .eq("company_id", companyId);
    if (mErr) throw mErr;

    const rows = (memberships || []).filter((r: any) => r.driver_id);
    const driverIds = rows.map((r: any) => r.driver_id);
    const totalDrivers = rows.length;
    const disabledCount = rows.filter((r: any) => r.is_disabled_by_company).length;
    const activeFleetCount = totalDrivers - disabledCount;

    let completedDeliveries = 0;
    let revenueCents = 0;
    if (driverIds.length > 0) {
      const { data: orders, error: oErr } = await supabaseAdmin
        .from("orders")
        .select("id, state, total_cents")
        .in("assigned_driver_id", driverIds)
        .eq("state", "delivered");
      if (oErr) throw oErr;
      completedDeliveries = (orders || []).length;
      revenueCents = (orders || []).reduce((s: number, o: any) => s + (o.total_cents || 0), 0);
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
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("driver_company_memberships")
      .select("driver_id, is_disabled_by_company, disabled_reason, updated_at")
      .eq("company_id", companyId);
    if (mErr) throw mErr;
    const rows = (memberships || []).filter((r: any) => r.driver_id);
    if (rows.length === 0) return res.json([]);

    const driverIds = [...new Set(rows.map((r: any) => r.driver_id as string))];

    let drivers: any[] = [];
    if (driverIds.length > 0) {
      const { data: dRows, error: dErr } = await supabaseAdmin
        .from("drivers")
        .select("id, user_id, status, compliance_status")
        .in("id", driverIds);
      if (dErr) throw dErr;
      drivers = dRows || [];
    }

    const userIds = [...new Set(drivers.map((d: any) => d.user_id).filter(Boolean))];
    let profiles: any[] = [];
    if (userIds.length > 0) {
      const { data: pRows, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);
      if (pErr) throw pErr;
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

  const { data: mem, error } = await supabaseAdmin
    .from("driver_company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!mem) return res.status(404).json({ error: "Driver is not linked to your company" });

  const { error: uErr } = await supabaseAdmin
    .from("driver_company_memberships")
    .update({
      is_disabled_by_company: true,
      disabled_reason: parsed.data.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mem.id);
  if (uErr) return res.status(500).json({ error: uErr.message });
  res.json({ ok: true });
});

router.post("/drivers/:driverId/enable", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;

  const { data: mem, error } = await supabaseAdmin
    .from("driver_company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!mem) return res.status(404).json({ error: "Driver is not linked to your company" });

  const { error: uErr } = await supabaseAdmin
    .from("driver_company_memberships")
    .update({
      is_disabled_by_company: false,
      disabled_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mem.id);
  if (uErr) return res.status(500).json({ error: uErr.message });
  res.json({ ok: true });
});

router.get("/drivers/:driverId/orders", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;

  const { data: mem, error } = await supabaseAdmin
    .from("driver_company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!mem) return res.status(404).json({ error: "Driver is not linked to your company" });

  const { data: orders, error: oErr } = await supabaseAdmin
    .from("orders")
    .select("id, state, total_cents, litres, created_at, delivered_at, paid_at")
    .eq("assigned_driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (oErr) return res.status(500).json({ error: oErr.message });
  res.json(orders || []);
});

/** Daily delivered order counts for charts (last 30 days) */
router.get("/analytics/daily-deliveries", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("driver_company_memberships")
      .select("driver_id")
      .eq("company_id", companyId);
    if (mErr) throw mErr;
    const driverIds = (memberships || []).map((r: any) => r.driver_id);
    if (driverIds.length === 0) return res.json([]);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString();

    const { data: orders, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("delivered_at")
      .in("assigned_driver_id", driverIds)
      .eq("state", "delivered")
      .gte("delivered_at", sinceIso);
    if (oErr) throw oErr;

    const byDay = new Map<string, number>();
    for (const o of orders || []) {
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
