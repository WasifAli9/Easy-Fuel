import { Router } from "express";
import { z } from "zod";
import { vehicleToCamelCase, syncDriverVehicleCapacityLitres } from "./vehicle-utils";
import { websocketService } from "./websocket";
import { db } from "./db";
import { companies, driverCompanyMemberships, drivers, orders, profiles, vehicles } from "@shared/schema";
import { and, desc, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { pool } from "./db";
import { getDriverUserId, releaseCompanyVehiclesForDriver } from "./fleet-membership-service";

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
    vehicle_reg_certificate_number: row.vehicleRegCertificateNumber,
    roadworthy_certificate_number: row.roadworthyCertificateNumber,
    roadworthy_issue_date: row.roadworthyIssueDate,
    dg_vehicle_permit_required: row.dgVehiclePermitRequired,
    dg_vehicle_permit_number: row.dgVehiclePermitNumber,
    dg_vehicle_permit_issue_date: row.dgVehiclePermitIssueDate,
    dg_vehicle_permit_expiry_date: row.dgVehiclePermitExpiryDate,
    vehicle_insured: row.vehicleInsured,
    insurance_provider: row.insuranceProvider,
    policy_number: row.policyNumber,
    policy_expiry_date: row.policyExpiryDate,
    loa_required: row.loaRequired,
    loa_issue_date: row.loaIssueDate,
    loa_expiry_date: row.loaExpiryDate,
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
  const r = await pool.query(
    `SELECT id FROM driver_company_memberships
     WHERE driver_id = $1 AND company_id = $2 AND membership_status = 'approved'
     LIMIT 1`,
    [driverId, companyId],
  );
  return !!r.rows[0];
}

/** Same driver universe as GET /drivers: memberships, legacy drivers.company_id, and assignees on company vehicles. */
async function getCompanyLinkedDriverIds(companyId: string): Promise<string[]> {
  const memberships = await db
    .select({ driver_id: driverCompanyMemberships.driverId })
    .from(driverCompanyMemberships)
    .where(eq(driverCompanyMemberships.companyId, companyId));
  const membershipIds = (memberships || []).map((r: any) => r.driver_id).filter(Boolean);

  const legacyLinked = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.companyId, companyId));

  const assignedOnCompanyVehicles = await db
    .select({ driver_id: vehicles.driverId })
    .from(vehicles)
    .where(and(eq(vehicles.companyId, companyId), isNotNull(vehicles.driverId)));

  const set = new Set<string>();
  for (const id of membershipIds) set.add(String(id));
  for (const r of legacyLinked || []) set.add(String((r as any).id));
  for (const r of assignedOnCompanyVehicles || []) {
    const id = (r as any).driver_id;
    if (id) set.add(String(id));
  }
  return Array.from(set);
}

const fleetVehicleCreateBody = z.object({
  registration_number: z.string().min(1),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.coerce.number().optional().nullable(),
  capacity_litres: z.coerce.number().optional().nullable(),
  fuel_types: z.array(z.string()).nullable().optional(),
  license_disk_expiry: z.string().nullable().optional(),
  roadworthy_expiry: z.string().nullable().optional(),
  insurance_expiry: z.string().nullable().optional(),
  vehicle_reg_certificate_number: z.string().nullable().optional(),
  roadworthy_certificate_number: z.string().nullable().optional(),
  roadworthy_issue_date: z.string().nullable().optional(),
  dg_vehicle_permit_required: z.boolean().optional(),
  dg_vehicle_permit_number: z.string().nullable().optional(),
  dg_vehicle_permit_issue_date: z.string().nullable().optional(),
  dg_vehicle_permit_expiry_date: z.string().nullable().optional(),
  vehicle_insured: z.boolean().optional(),
  insurance_provider: z.string().nullable().optional(),
  policy_number: z.string().nullable().optional(),
  policy_expiry_date: z.string().nullable().optional(),
  loa_required: z.boolean().optional(),
  loa_issue_date: z.string().nullable().optional(),
  loa_expiry_date: z.string().nullable().optional(),
  tracker_installed: z.boolean().optional(),
  tracker_provider: z.string().nullable().optional(),
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
      vehicleRegCertificateNumber: b.vehicle_reg_certificate_number ?? null,
      roadworthyCertificateNumber: b.roadworthy_certificate_number ?? null,
      roadworthyIssueDate: b.roadworthy_issue_date ? new Date(b.roadworthy_issue_date) : null,
      dgVehiclePermitRequired: b.dg_vehicle_permit_required ?? false,
      dgVehiclePermitNumber: b.dg_vehicle_permit_number ?? null,
      dgVehiclePermitIssueDate: b.dg_vehicle_permit_issue_date ? new Date(b.dg_vehicle_permit_issue_date) : null,
      dgVehiclePermitExpiryDate: b.dg_vehicle_permit_expiry_date ? new Date(b.dg_vehicle_permit_expiry_date) : null,
      vehicleInsured: b.vehicle_insured ?? false,
      insuranceProvider: b.insurance_provider ?? null,
      policyNumber: b.policy_number ?? null,
      policyExpiryDate: b.policy_expiry_date ? new Date(b.policy_expiry_date) : null,
      loaRequired: b.loa_required ?? false,
      loaIssueDate: b.loa_issue_date ? new Date(b.loa_issue_date) : null,
      loaExpiryDate: b.loa_expiry_date ? new Date(b.loa_expiry_date) : null,
      trackerInstalled: b.tracker_installed ?? false,
      trackerProvider: b.tracker_provider ?? null,
    };
    const inserted = await db.insert(vehicles).values(insert).returning();
    const vehicle = inserted[0];
    try {
      const { getAdminUserIds, getProfileDisplayName } = await import("./admin-notify");
      const adminUserIds = await getAdminUserIds();
      const authUser = (req as any).user;
      if (adminUserIds.length > 0 && authUser?.id) {
        const { notificationService } = await import("./notification-service");
        const submitterName = await getProfileDisplayName(authUser.id);
        await notificationService.notifyAdminsVehicleReviewRequired(
          adminUserIds,
          {
            vehicleId: String((vehicle as any).id),
            registrationNumber: String((vehicle as any).registrationNumber ?? b.registration_number),
            submittedByUserId: authUser.id,
            submitterName,
            scope: "company",
          },
        );
      }
    } catch (e) {
      console.error("[company/vehicles] admin notify:", e);
    }
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
    const driverIds = await getCompanyLinkedDriverIds(companyId);
    const memberships = await db
      .select({
        driver_id: driverCompanyMemberships.driverId,
        is_disabled_by_company: driverCompanyMemberships.isDisabledByCompany,
      })
      .from(driverCompanyMemberships)
      .where(eq(driverCompanyMemberships.companyId, companyId));

    const disabledByDriver = new Map<string, boolean>();
    for (const r of memberships || []) {
      if (r.driver_id) disabledByDriver.set(String(r.driver_id), !!r.is_disabled_by_company);
    }
    const totalDrivers = driverIds.length;
    let disabledCount = 0;
    for (const id of driverIds) {
      if (disabledByDriver.get(id)) disabledCount++;
    }
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
    const memRes = await pool.query(
      `SELECT driver_id, is_disabled_by_company, disabled_reason, updated_at,
              membership_status::text AS membership_status
       FROM driver_company_memberships
       WHERE company_id = $1 AND membership_status = 'approved'`,
      [companyId],
    );
    const membershipRows = memRes.rows || [];

    // Backward compatibility: some environments still link drivers via drivers.company_id.
    // Merge those into the company driver list when no membership row exists yet.
    const legacyLinked = await db
      .select({ driver_id: drivers.id })
      .from(drivers)
      .where(eq(drivers.companyId, companyId));

    // Additional source of truth: drivers currently assigned to company-owned vehicles.
    const assignedOnCompanyVehicles = await db
      .select({ driver_id: vehicles.driverId })
      .from(vehicles)
      .where(and(eq(vehicles.companyId, companyId), isNotNull(vehicles.driverId)));

    const byDriverId = new Map<string, any>();
    for (const r of membershipRows) {
      byDriverId.set(String(r.driver_id), r);
    }
    for (const r of legacyLinked || []) {
      const id = String((r as any).driver_id);
      if (!byDriverId.has(id)) {
        byDriverId.set(id, {
          driver_id: id,
          is_disabled_by_company: false,
          disabled_reason: null,
          updated_at: null,
        });
      }
    }
    for (const r of assignedOnCompanyVehicles || []) {
      const id = String((r as any).driver_id);
      if (!id || id === "null") continue;
      if (!byDriverId.has(id)) {
        byDriverId.set(id, {
          driver_id: id,
          is_disabled_by_company: false,
          disabled_reason: null,
          updated_at: null,
        });
      }
    }

    const rows = Array.from(byDriverId.values());
    if (rows.length === 0) return res.json([]);

    const driverIds = Array.from(new Set(rows.map((r: any) => r.driver_id as string)));

    let driverRows: any[] = [];
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
      driverRows = dRows || [];
    }

    const userIds = Array.from(new Set(driverRows.map((d: any) => d.user_id).filter(Boolean)));
    let profileRows: any[] = [];
    if (userIds.length > 0) {
      const pRows = await db
        .select({ id: profiles.id, full_name: profiles.fullName, phone: profiles.phone })
        .from(profiles)
        .where(inArray(profiles.id, userIds as string[]));
      profileRows = pRows || [];
    }

    const profileByUserId = new Map(profileRows.map((p: any) => [p.id, p]));
    const driverById = new Map(driverRows.map((d: any) => [d.id, d]));

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

  if (!(await driverLinkedToCompany(driverId, companyId))) {
    return res.status(404).json({ error: "Driver is not an approved member of your company" });
  }

  await pool.query(
    `UPDATE driver_company_memberships
     SET is_disabled_by_company = true, disabled_reason = $3, updated_at = $4
     WHERE driver_id = $1 AND company_id = $2`,
    [driverId, companyId, parsed.data.reason ?? null, new Date()],
  );
  res.json({ ok: true });
});

router.post("/drivers/:driverId/enable", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;

  if (!(await driverLinkedToCompany(driverId, companyId))) {
    return res.status(404).json({ error: "Driver is not an approved member of your company" });
  }

  await pool.query(
    `UPDATE driver_company_memberships
     SET is_disabled_by_company = false, disabled_reason = NULL, updated_at = $3
     WHERE driver_id = $1 AND company_id = $2`,
    [driverId, companyId, new Date()],
  );
  res.json({ ok: true });
});

router.get("/driver-applications", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const rows = await pool.query(
      `SELECT m.driver_id, m.applied_at, d.user_id, d.status, d.compliance_status
       FROM driver_company_memberships m
       JOIN drivers d ON d.id = m.driver_id
       WHERE m.company_id = $1 AND m.membership_status = 'pending'
       ORDER BY m.applied_at DESC NULLS LAST`,
      [companyId],
    );
    const userIds = rows.rows.map((r: any) => r.user_id).filter(Boolean);
    let profilesMap = new Map<string, any>();
    if (userIds.length) {
      const pRows = await db
        .select({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })
        .from(profiles)
        .where(inArray(profiles.id, userIds));
      profilesMap = new Map(pRows.map((p) => [p.id, p]));
    }
    res.json(
      rows.rows.map((r: any) => {
        const prof = profilesMap.get(r.user_id);
        return {
          driverId: r.driver_id,
          userId: r.user_id,
          fullName: prof?.fullName ?? null,
          phone: prof?.phone ?? null,
          status: r.status,
          complianceStatus: r.compliance_status,
          appliedAt: r.applied_at,
        };
      }),
    );
  } catch (e: any) {
    console.error("GET /company/driver-applications:", e);
    res.status(500).json({ error: e.message });
  }
});

const rejectApplicationBody = z.object({
  reason: z.string().max(500).optional(),
});

router.post("/driver-applications/:driverId/approve", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const company = (req as any).companyRecord;
  const driverId = req.params.driverId;
  const user = (req as any).user;
  try {
    const check = await pool.query(
      `SELECT id FROM driver_company_memberships
       WHERE driver_id = $1 AND company_id = $2 AND membership_status = 'pending'`,
      [driverId, companyId],
    );
    if (!check.rows[0]) return res.status(404).json({ error: "No pending application found" });
    await pool.query(
      `UPDATE driver_company_memberships
       SET membership_status = 'approved', reviewed_at = NOW(), reviewed_by = $3, rejection_reason = NULL, updated_at = NOW()
       WHERE driver_id = $1 AND company_id = $2`,
      [driverId, companyId, user.id],
    );
    const driverUserId = await getDriverUserId(driverId);
    if (driverUserId) {
      const { notificationService } = await import("./notification-service");
      await notificationService.notifyFleetJoinApproved(driverUserId, company.name, companyId);
      websocketService.sendToUser(driverUserId, { type: "fleet_join_approved", payload: { companyId } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("POST approve application:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/driver-applications/:driverId/reject", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const company = (req as any).companyRecord;
  const driverId = req.params.driverId;
  const user = (req as any).user;
  const parsed = rejectApplicationBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const check = await pool.query(
      `SELECT id FROM driver_company_memberships
       WHERE driver_id = $1 AND company_id = $2 AND membership_status = 'pending'`,
      [driverId, companyId],
    );
    if (!check.rows[0]) return res.status(404).json({ error: "No pending application found" });
    await pool.query(
      `UPDATE driver_company_memberships
       SET membership_status = 'rejected', company_id = NULL, reviewed_at = NOW(), reviewed_by = $3,
           rejection_reason = $4, updated_at = NOW()
       WHERE driver_id = $1 AND company_id = $2`,
      [driverId, companyId, user.id, parsed.data.reason ?? null],
    );
    const driverUserId = await getDriverUserId(driverId);
    if (driverUserId) {
      const { notificationService } = await import("./notification-service");
      await notificationService.notifyFleetJoinRejected(
        driverUserId,
        company.name,
        parsed.data.reason,
      );
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("POST reject application:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/drivers/:driverId/orders", async (req, res) => {
  const companyId = (req as any).companyId as string;
  const driverId = req.params.driverId;

  if (!(await driverLinkedToCompany(driverId, companyId))) {
    return res.status(404).json({ error: "Driver is not an approved member of your company" });
  }

  const orderRows = await db
    .select({
      id: orders.id,
      state: orders.state,
      total_cents: orders.totalCents,
      litres: orders.litres,
      created_at: orders.createdAt,
      delivered_at: orders.deliveredAt,
      paid_at: orders.paidAt,
      fleet_company_id: orders.fleetCompanyId,
      vehicle_id: orders.vehicleId,
    })
    .from(orders)
    .where(
      and(
        eq(orders.assignedDriverId, driverId),
        or(eq(orders.fleetCompanyId, companyId), isNull(orders.fleetCompanyId)),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(100);
  res.json(orderRows || []);
});

/** Daily delivered order counts for charts (last 30 days) */
router.get("/analytics/daily-deliveries", async (req, res) => {
  const companyId = (req as any).companyId as string;
  try {
    const driverIds = await getCompanyLinkedDriverIds(companyId);
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
