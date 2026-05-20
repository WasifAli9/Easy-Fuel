import { pool } from "./db";
import { db } from "./db";
import { companies, drivers, profiles, vehicles } from "@shared/schema";
import { eq } from "drizzle-orm";

export type FleetMembershipStatus = "none" | "pending" | "approved" | "rejected";

export type DriverMembershipRow = {
  driver_id: string;
  company_id: string | null;
  membership_status: FleetMembershipStatus;
  work_independent: boolean;
  is_disabled_by_company: boolean;
  disabled_reason: string | null;
  applied_at: Date | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  updated_at: Date | null;
};

let fleetColumnsReady = false;

export async function ensureFleetMembershipColumns() {
  if (fleetColumnsReady) return;
  try {
    await pool.query(`
      DO $patch$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fleet_membership_status') THEN
          CREATE TYPE public.fleet_membership_status AS ENUM ('none', 'pending', 'approved', 'rejected');
        END IF;
      END
      $patch$`);
    await pool.query(`
      ALTER TABLE driver_company_memberships
        ADD COLUMN IF NOT EXISTS membership_status public.fleet_membership_status NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS work_independent boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS applied_at timestamp,
        ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
        ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rejection_reason text`);
    await pool.query(`
      UPDATE driver_company_memberships
      SET membership_status = 'approved', work_independent = true
      WHERE company_id IS NOT NULL AND membership_status::text = 'none'`);
    await pool.query(`
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS active_vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL`);
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS fleet_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL`);
    fleetColumnsReady = true;
  } catch (e) {
    console.warn("[fleet-membership] Auto-migration skipped:", e);
  }
}

export async function getMembershipForDriver(driverId: string): Promise<DriverMembershipRow | null> {
  await ensureFleetMembershipColumns();
  const r = await pool.query(
    `SELECT driver_id, company_id, membership_status::text AS membership_status,
            work_independent, is_disabled_by_company, disabled_reason,
            applied_at, reviewed_at, rejection_reason, updated_at
     FROM driver_company_memberships
     WHERE driver_id = $1
     LIMIT 1`,
    [driverId],
  );
  return (r.rows[0] as DriverMembershipRow) ?? null;
}

export async function ensureMembershipRow(driverId: string): Promise<DriverMembershipRow> {
  await ensureFleetMembershipColumns();
  const existing = await getMembershipForDriver(driverId);
  if (existing) return existing;
  await pool.query(
    `INSERT INTO driver_company_memberships (driver_id, company_id, membership_status, work_independent)
     VALUES ($1, NULL, 'none', true)
     ON CONFLICT (driver_id) DO NOTHING`,
    [driverId],
  );
  return (await getMembershipForDriver(driverId))!;
}

export async function releaseCompanyVehiclesForDriver(driverId: string) {
  const now = new Date();
  await pool.query(
    `UPDATE vehicles SET driver_id = NULL, updated_at = $2
     WHERE driver_id = $1 AND company_id IS NOT NULL`,
    [driverId, now],
  );
  await pool.query(
    `UPDATE drivers SET active_vehicle_id = NULL, updated_at = $2
     WHERE id = $1
       AND active_vehicle_id IN (SELECT id FROM vehicles WHERE company_id IS NOT NULL)`,
    [driverId, now],
  );
}

export function canUseCompanyFleet(mem: DriverMembershipRow | null): boolean {
  return !!(
    mem?.company_id &&
    mem.membership_status === "approved" &&
    !mem.is_disabled_by_company
  );
}

export async function buildMembershipApiResponse(driverId: string) {
  const mem = await ensureMembershipRow(driverId);
  let companyName: string | null = null;
  if (mem.company_id) {
    const rows = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, mem.company_id)).limit(1);
    companyName = rows[0]?.name ?? null;
  }
  const canFleet = canUseCompanyFleet(mem);
  return {
    workIndependent: mem.work_independent,
    membershipStatus: mem.membership_status,
    companyId: mem.company_id,
    companyName,
    isDisabledByCompany: mem.is_disabled_by_company,
    disabledReason: mem.disabled_reason,
    rejectionReason: mem.rejection_reason,
    appliedAt: mem.applied_at,
    reviewedAt: mem.reviewed_at,
    canUseCompanyFleet: canFleet,
    /** @deprecated use workIndependent + membershipStatus */
    mode: canFleet ? ("company" as const) : ("independent" as const),
    updatedAt: mem.updated_at,
  };
}

export async function getCompanyOwnerUserId(companyId: string): Promise<string | null> {
  const rows = await db
    .select({ ownerUserId: companies.ownerUserId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return rows[0]?.ownerUserId ?? null;
}

export async function getDriverUserId(driverId: string): Promise<string | null> {
  const rows = await db.select({ userId: drivers.userId }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
  return rows[0]?.userId ?? null;
}

export async function validateVehicleForActiveJob(driverId: string, vehicleId: string) {
  const mem = await ensureMembershipRow(driverId);
  const vRes = await pool.query(
    `SELECT id, driver_id, company_id, capacity_litres, vehicle_status, registration_number, make, model
     FROM vehicles WHERE id = $1 LIMIT 1`,
    [vehicleId],
  );
  const vehicle = vRes.rows[0];
  if (!vehicle) return { ok: false as const, error: "Vehicle not found" };
  if (vehicle.driver_id !== driverId) {
    return { ok: false as const, error: "Vehicle is not assigned to you" };
  }
  if (vehicle.vehicle_status && vehicle.vehicle_status !== "active") {
    return { ok: false as const, error: "Vehicle is not active for jobs" };
  }
  if (vehicle.company_id) {
    if (!canUseCompanyFleet(mem)) {
      return { ok: false as const, error: "Fleet company membership must be approved to use company vehicles" };
    }
    if (vehicle.company_id !== mem.company_id) {
      return { ok: false as const, error: "Vehicle belongs to another company" };
    }
  } else if (!mem.work_independent) {
    return { ok: false as const, error: "Enable independent work to use your personal vehicles" };
  }
  return { ok: true as const, vehicle };
}

export type DriverFleetApplicationEmailDetails = {
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string;
  licenseNumber: string | null;
};

function formatDriverAddress(row: {
  address_line_1?: string | null;
  address_line_2?: string | null;
  driver_city?: string | null;
  driver_province?: string | null;
  driver_postal_code?: string | null;
  driver_country?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
}): string {
  const parts: string[] = [];
  const line1 = (row.address_line_1 || row.address_street || "").trim();
  const line2 = (row.address_line_2 || "").trim();
  const city = (row.driver_city || row.address_city || "").trim();
  const province = (row.driver_province || row.address_province || "").trim();
  const postal = (row.driver_postal_code || row.address_postal_code || "").trim();
  const country = (row.driver_country || row.address_country || "").trim();
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);
  const locality = [city, province, postal].filter(Boolean).join(", ");
  if (locality) parts.push(locality);
  if (country && !locality.includes(country)) parts.push(country);
  return parts.join("\n") || "Not provided";
}

/** Driver profile fields for fleet join application emails. */
export async function getDriverFleetApplicationEmailDetails(
  driverId: string,
): Promise<DriverFleetApplicationEmailDetails | null> {
  const r = await pool.query(
    `SELECT p.full_name, p.phone,
            p.address_street, p.address_city, p.address_province, p.address_postal_code, p.address_country,
            d.drivers_license_number,
            d.address_line_1, d.address_line_2,
            d.city AS driver_city, d.province AS driver_province,
            d.postal_code AS driver_postal_code, d.country AS driver_country,
            d.user_id,
            lau.email AS login_email
     FROM drivers d
     INNER JOIN profiles p ON p.id = d.user_id
     LEFT JOIN local_auth_users lau ON lau.id = d.user_id
     WHERE d.id = $1
     LIMIT 1`,
    [driverId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    fullName: row.full_name || "Driver",
    phone: row.phone?.trim() || null,
    email: row.login_email?.trim() || null,
    address: formatDriverAddress(row),
    licenseNumber: row.drivers_license_number?.trim() || null,
  };
}

/** Company owner login email, falling back to companies.contact_email. */
export async function getCompanyNotifyEmail(companyId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(lau.email), ''), NULLIF(TRIM(c.contact_email), '')) AS email
     FROM companies c
     LEFT JOIN local_auth_users lau ON lau.id = c.owner_user_id
     WHERE c.id = $1
     LIMIT 1`,
    [companyId],
  );
  const email = r.rows[0]?.email;
  return email ? String(email).trim().toLowerCase() : null;
}

export async function getActiveVehicleForDriver(driverId: string) {
  const dRes = await pool.query(
    `SELECT active_vehicle_id FROM drivers WHERE id = $1 LIMIT 1`,
    [driverId],
  );
  const activeId = dRes.rows[0]?.active_vehicle_id;
  if (!activeId) return null;
  const vRes = await pool.query(
    `SELECT id, driver_id, company_id, capacity_litres, registration_number, make, model, vehicle_status
     FROM vehicles WHERE id = $1 LIMIT 1`,
    [activeId],
  );
  return vRes.rows[0] ?? null;
}
