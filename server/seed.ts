import { db } from "./db";
import { appSettings, fuelTypes } from "@shared/schema";

async function seed() {
  try {
    console.log("Seeding database...");

    // Insert default app settings
    await db.insert(appSettings).values({
      id: 1,
      serviceFeePercent: "5",
      serviceFeeMinCents: 10000, // R100
      baseDeliveryFeeCents: 35000, // R350
      dispatchRadiusKm: "50",
      dispatchSlaSeconds: 120,
    }).onConflictDoNothing();

    // Insert default fuel types
    const defaultFuelTypes = [
      { code: "diesel", label: "Diesel", active: true },
      { code: "petrol_95", label: "Petrol 95", active: true },
      { code: "petrol_93", label: "Petrol 93", active: true },
      { code: "paraffin", label: "Paraffin", active: true },
    ];

    for (const fuel of defaultFuelTypes) {
      await db.insert(fuelTypes).values(fuel).onConflictDoNothing();
    }

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

seed();
