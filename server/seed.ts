import { supabaseAdmin } from "./supabase";

async function seed() {
  try {
    console.log("Seeding database...");

    // Insert default app settings
    const { error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        id: 1,
        service_fee_percent: "5",
        service_fee_min_cents: 10000, // R100
        base_delivery_fee_cents: 35000, // R350
        dispatch_radius_km: "50",
        dispatch_sla_seconds: 120,
      });

    if (settingsError) {
      console.log("Settings already exist or error:", settingsError.message);
    }

    // Insert default fuel types
    const defaultFuelTypes = [
      { code: "diesel", label: "Diesel", active: true },
      { code: "petrol_95", label: "Petrol 95", active: true },
      { code: "petrol_93", label: "Petrol 93", active: true },
      { code: "paraffin", label: "Paraffin", active: true },
    ];

    for (const fuel of defaultFuelTypes) {
      const { error } = await supabaseAdmin
        .from("fuel_types")
        .upsert(fuel, { onConflict: "code" });
      
      if (error && !error.message.includes("duplicate")) {
        console.log(`Error inserting ${fuel.code}:`, error.message);
      }
    }

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

seed();
