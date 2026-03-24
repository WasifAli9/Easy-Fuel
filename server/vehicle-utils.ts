import { supabaseAdmin } from "./supabase";

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
  const { data: rows, error } = await supabaseAdmin
    .from("vehicles")
    .select("capacity_litres")
    .eq("driver_id", driverId);
  if (error) {
    console.error("[syncDriverVehicleCapacityLitres]", driverId, error.message);
    return;
  }
  const caps = (rows || [])
    .map((r: { capacity_litres: number | null }) => r.capacity_litres)
    .filter((c): c is number => typeof c === "number" && c > 0);
  const maxCap = caps.length > 0 ? Math.max(...caps) : null;
  await supabaseAdmin
    .from("drivers")
    .update({
      vehicle_capacity_litres: maxCap,
      updated_at: new Date().toISOString(),
    })
    .eq("id", driverId);
}
