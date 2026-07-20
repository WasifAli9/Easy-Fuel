import { and, eq, inArray } from "drizzle-orm";
import { fuelTypes } from "@shared/schema";
import { db } from "./db";

export async function isActiveFuelTypeId(fuelTypeId: string): Promise<boolean> {
  const row = await db
    .select({ id: fuelTypes.id })
    .from(fuelTypes)
    .where(and(eq(fuelTypes.id, fuelTypeId), eq(fuelTypes.active, true)))
    .limit(1);
  return row.length > 0;
}

export async function validateActiveFuelTypeId(fuelTypeId: string): Promise<string | null> {
  return (await isActiveFuelTypeId(fuelTypeId))
    ? null
    : "This fuel type is disabled or does not exist";
}

export async function validateActiveFuelTypeCodes(codes: string[] | null | undefined): Promise<string | null> {
  const normalized = Array.from(
    new Set((codes ?? []).map((code) => String(code).trim()).filter(Boolean)),
  );
  if (normalized.length === 0) return null;

  const rows = await db
    .select({ code: fuelTypes.code })
    .from(fuelTypes)
    .where(and(inArray(fuelTypes.code, normalized), eq(fuelTypes.active, true)));
  const activeCodes = new Set(rows.map((row) => row.code));
  const invalid = normalized.filter((code) => !activeCodes.has(code));

  return invalid.length > 0
    ? `Disabled or unknown fuel type${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}`
    : null;
}
