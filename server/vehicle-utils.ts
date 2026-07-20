import { db } from "./db";
import { drivers, vehicles } from "@shared/schema";
import { eq } from "drizzle-orm";

export function vehicleToCamelCase(vehicle: any) {
  if (!vehicle) return null;
  return {
    id: vehicle.id,
    driverId: vehicle.driver_id ?? null,
    companyId: vehicle.company_id ?? null,
    registrationNumber: vehicle.registration_number,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    capacityLitres: vehicle.capacity_litres,
    fuelTypes: vehicle.fuel_types,
    licenseDiskExpiry: vehicle.license_disk_expiry,
    roadworthyExpiry: vehicle.roadworthy_expiry,
    insuranceExpiry: vehicle.insurance_expiry,
    trackerInstalled: vehicle.tracker_installed,
    trackerProvider: vehicle.tracker_provider,
    vehicleRegCertificateNumber: vehicle.vehicle_reg_certificate_number,
    roadworthyCertificateNumber: vehicle.roadworthy_certificate_number,
    roadworthyIssueDate: vehicle.roadworthy_issue_date,
    dgVehiclePermitRequired: vehicle.dg_vehicle_permit_required,
    dgVehiclePermitNumber: vehicle.dg_vehicle_permit_number,
    dgVehiclePermitIssueDate: vehicle.dg_vehicle_permit_issue_date,
    dgVehiclePermitExpiryDate: vehicle.dg_vehicle_permit_expiry_date,
    vehicleInsured: vehicle.vehicle_insured,
    insuranceProvider: vehicle.insurance_provider,
    policyNumber: vehicle.policy_number,
    policyExpiryDate: vehicle.policy_expiry_date,
    loaRequired: vehicle.loa_required,
    loaIssueDate: vehicle.loa_issue_date,
    loaExpiryDate: vehicle.loa_expiry_date,
    vehicleRegistrationCertDocId: vehicle.vehicle_registration_cert_doc_id,
    vehicleStatus: vehicle.vehicle_status,
    createdAt: vehicle.created_at,
    updatedAt: vehicle.updated_at,
  };
}

/**
 * Sets drivers.vehicle_capacity_litres to the max capacity_litres among vehicles
 * where driver_id = driverId (personal + company-assigned fleet).
 */
export async function syncDriverVehicleCapacityLitres(driverId: string): Promise<void> {
  let rows: Array<{ capacityLitres: number | null }> = [];
  try {
    rows = await db
      .select({ capacityLitres: vehicles.capacityLitres })
      .from(vehicles)
      .where(eq(vehicles.driverId, driverId));
  } catch (error: any) {
    console.error("[syncDriverVehicleCapacityLitres]", driverId, error.message);
    return;
  }
  const caps = rows
    .map((r) => r.capacityLitres)
    .filter((c): c is number => typeof c === "number" && c > 0);
  const maxCap = caps.length > 0 ? Math.max(...caps) : null;
  await db
    .update(drivers)
    .set({
      vehicleCapacityLitres: maxCap,
      updatedAt: new Date(),
    })
    .where(eq(drivers.id, driverId));
}
