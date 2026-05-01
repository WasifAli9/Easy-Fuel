import { Router } from "express";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";
import { db, pool } from "./db";
import * as sharedSchema from "../shared/schema";
import { insertDepotSchema } from "../shared/schema";
import { getSupplierComplianceStatus, canSupplierAccessPlatform } from "./compliance-service";
import { buildPaymentRedirectUrl, isOzowConfigured } from "./ozow-service";
import { getSupplierPlan, SUPPLIER_PLAN_CODES, SUPPLIER_SUBSCRIPTION_PLANS } from "../shared/supplier-subscription-plans";
import { z } from "zod";
import { normalizeSignatureForStorage } from "./local-object-storage";
import PDFDocument from "pdfkit";

type FilterOp = "eq" | "neq" | "in" | "gte" | "lte" | "gt" | "lt";
type FilterClause = { op: FilterOp; column: string; value: any };
type OrderClause = { column: string; ascending: boolean };

const tableMap: Record<string, any> = {
  suppliers: sharedSchema.suppliers,
  supplier_subscriptions: sharedSchema.supplierSubscriptions,
  depots: sharedSchema.depots,
  depot_prices: sharedSchema.depotPrices,
  documents: sharedSchema.documents,
  fuel_types: sharedSchema.fuelTypes,
  pricing_history: sharedSchema.pricingHistory,
  profiles: sharedSchema.profiles,
  admins: sharedSchema.admins,
  supplier_subscription_payments: sharedSchema.supplierSubscriptionPayments,
  driver_depot_orders: sharedSchema.driverDepotOrders,
  supplier_invoice_templates: sharedSchema.supplierInvoiceTemplates,
  supplier_settlements: sharedSchema.supplierSettlements,
};

function getTable(tableName: string) {
  const table = tableMap[tableName];
  if (!table) throw new Error(`Unsupported table for drizzleClient adapter: ${tableName}`);
  return table;
}

function getColumn(table: any, column: string) {
  if (table[column]) return table[column];
  const entries = Object.entries(table) as Array<[string, any]>;
  const byDbName = entries.find(([, col]) => col?.name === column);
  return byDbName?.[1] ?? null;
}

function getColumnEntry(table: any, column: string) {
  const entries = Object.entries(table) as Array<[string, any]>;
  const direct = entries.find(([key]) => key === column);
  if (direct) return direct;
  return entries.find(([, col]) => col?.name === column) ?? null;
}

function snakeCaseRow(table: any, row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const column = table[key];
    if (column?.name) out[column.name] = value;
    else out[key] = value;
  }
  return out;
}

function toTableData(table: any, data: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const columnEntry = getColumnEntry(table, key);
    if (!columnEntry) continue;
    out[columnEntry[0]] = value;
  }
  return out;
}

class DrizzleCompatQuery {
  private filters: FilterClause[] = [];
  private orders: OrderClause[] = [];
  private limitValue: number | undefined;
  private selectClause = "*";
  private selectRequested = false;
  private expectSingle = false;
  private expectMaybeSingle = false;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private insertPayload: any = null;
  private updatePayload: any = null;
  constructor(private readonly tableName: string) {}

  select(columns = "*") { this.selectClause = columns; this.selectRequested = true; return this; }
  eq(column: string, value: any) { this.filters.push({ op: "eq", column, value }); return this; }
  neq(column: string, value: any) { this.filters.push({ op: "neq", column, value }); return this; }
  in(column: string, value: any[]) { this.filters.push({ op: "in", column, value }); return this; }
  gte(column: string, value: any) { this.filters.push({ op: "gte", column, value }); return this; }
  lte(column: string, value: any) { this.filters.push({ op: "lte", column, value }); return this; }
  gt(column: string, value: any) { this.filters.push({ op: "gt", column, value }); return this; }
  lt(column: string, value: any) { this.filters.push({ op: "lt", column, value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.limitValue = value; return this; }
  single() { this.expectSingle = true; return this; }
  maybeSingle() { this.expectMaybeSingle = true; return this; }
  insert(values: any) { this.mode = "insert"; this.insertPayload = values; return this; }
  update(values: any) { this.mode = "update"; this.updatePayload = values; return this; }
  delete() { this.mode = "delete"; return this; }
  then(resolve: any, reject: any) { return this.execute().then(resolve, reject); }

  private buildConditions(table: any) {
    const conditions = this.filters.map((f) => {
      const col = getColumn(table, f.column);
      if (!col) throw new Error(`Unknown column ${f.column} on table ${this.tableName}`);
      if (f.op === "eq") return eq(col, f.value);
      if (f.op === "neq") return ne(col, f.value);
      if (f.op === "in") return inArray(col, f.value);
      if (f.op === "gte") return gte(col, f.value);
      if (f.op === "lte") return lte(col, f.value);
      if (f.op === "gt") return gt(col, f.value);
      return lt(col, f.value);
    });
    return conditions.length ? and(...conditions) : undefined;
  }

  private buildSelection(table: any): Record<string, any> | undefined {
    if (!this.selectClause || this.selectClause.trim() === "*") return undefined;
    const selection: Record<string, any> = {};
    const fields = this.selectClause.split(",").map((s) => s.trim()).filter(Boolean);
    for (const field of fields) {
      if (field.includes("(") || field.includes(")")) continue;
      const col = getColumn(table, field);
      if (col) selection[field] = col;
    }
    return Object.keys(selection).length ? selection : undefined;
  }

  private async attachFuelTypes(rows: any[]) {
    if (!rows.length) return rows;
    if (!(this.selectClause.includes("fuel_types") && (this.tableName === "depot_prices" || this.tableName === "pricing_history"))) {
      return rows;
    }
    const ids = Array.from(new Set(rows.map((r) => r.fuel_type_id).filter(Boolean)));
    if (!ids.length) return rows.map((r) => ({ ...r, fuel_types: null }));
    const fuelRows = await db
      .select({ id: sharedSchema.fuelTypes.id, label: sharedSchema.fuelTypes.label, code: sharedSchema.fuelTypes.code })
      .from(sharedSchema.fuelTypes)
      .where(inArray(sharedSchema.fuelTypes.id, ids));
    const fuelMap = new Map(fuelRows.map((f) => [f.id, f]));
    return rows.map((row) => ({ ...row, fuel_types: fuelMap.get(row.fuel_type_id) ?? null }));
  }

  async execute() {
    try {
      const table = getTable(this.tableName);
      const whereCondition = this.buildConditions(table);
      if (this.mode === "insert") {
        const values = Array.isArray(this.insertPayload) ? this.insertPayload.map((v) => toTableData(table, v)) : toTableData(table, this.insertPayload ?? {});
        const result = this.selectRequested ? await db.insert(table).values(values as any).returning() : await db.insert(table).values(values as any);
        const rows = Array.isArray(result) ? result.map((r) => snakeCaseRow(table, r as any)) : [];
        return this.finalize(rows);
      }
      if (this.mode === "update") {
        const values = toTableData(table, this.updatePayload ?? {});
        const query = db.update(table).set(values as any);
        const withWhere = whereCondition ? query.where(whereCondition) : query;
        const result = this.selectRequested ? await withWhere.returning() : await withWhere;
        const rows = Array.isArray(result) ? result.map((r) => snakeCaseRow(table, r as any)) : [];
        return this.finalize(rows);
      }
      if (this.mode === "delete") {
        const query = db.delete(table);
        const withWhere = whereCondition ? query.where(whereCondition) : query;
        await withWhere;
        return { data: null, error: null };
      }

      const selection = this.buildSelection(table);
      let query: any = selection ? db.select(selection).from(table) : db.select().from(table);
      if (whereCondition) query = query.where(whereCondition);
      for (const orderEntry of this.orders) {
        const col = getColumn(table, orderEntry.column);
        if (col) query = query.orderBy(orderEntry.ascending ? asc(col) : desc(col));
      }
      if (typeof this.limitValue === "number") query = query.limit(this.limitValue);
      const result = await query;
      const rows = (result ?? []).map((r: any) => selection ? r : snakeCaseRow(table, r));
      const rowsWithRelations = await this.attachFuelTypes(rows);
      return this.finalize(rowsWithRelations);
    } catch (error: any) {
      return { data: null, error: { message: error?.message ?? "Query failed" } };
    }
  }

  private finalize(rows: any[]) {
    if (this.expectSingle) {
      return { data: rows?.[0] ?? null, error: rows?.[0] ? null : { message: "No rows found" } };
    }
    if (this.expectMaybeSingle) return { data: rows?.[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

const drizzleClient = {
  from(tableName: string) {
    return new DrizzleCompatQuery(tableName);
  },
};

const router = Router();
let depotPricingTierColumnsReady = false;
let depotPricingTierColumnsInFlight: Promise<void> | null = null;

async function ensureDepotPricingTierColumns() {
  if (depotPricingTierColumnsReady) return;
  if (depotPricingTierColumnsInFlight) return depotPricingTierColumnsInFlight;
  depotPricingTierColumnsInFlight = (async () => {
    try {
      await pool.query(
        `ALTER TABLE depot_prices
         ADD COLUMN IF NOT EXISTS min_litres integer DEFAULT 0`
      );
      await pool.query(
        `ALTER TABLE depot_prices
         ADD COLUMN IF NOT EXISTS available_litres double precision`
      );
      await pool.query(
        `UPDATE depot_prices
         SET min_litres = 0
         WHERE min_litres IS NULL`
      );
    } catch (error: any) {
      // In some environments the app DB user cannot ALTER table schema.
      // Continue serving requests and rely on manual pgAdmin migration.
      if (error?.code === "42501") {
        console.warn(
          "[supplier] Skipping depot_prices auto-migration due to insufficient privileges. " +
          "Apply migration SQL manually in pgAdmin."
        );
      } else {
        throw error;
      }
    }
    depotPricingTierColumnsReady = true;
  })().finally(() => {
    depotPricingTierColumnsInFlight = null;
  });
  return depotPricingTierColumnsInFlight;
}

router.use(async (_req, _res, next) => {
  try {
    await ensureDepotPricingTierColumns();
    next();
  } catch (error) {
    console.error("[supplier] Depot pricing schema check failed:", error);
    next();
  }
});

// Helper middleware to check supplier compliance
async function checkSupplierCompliance(req: any, res: any, next: any) {
  try {
    const user = req.user;
    const { data: supplier } = await drizzleClient
      .from("suppliers")
      .select("id, status, compliance_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (supplier.status !== "active" || supplier.compliance_status !== "approved") {
      return res.status(403).json({
        error: "Compliance not approved",
        code: "COMPLIANCE_REQUIRED",
        message: "Your compliance documents must be approved before accessing this feature. Please complete your compliance profile.",
        status: supplier.status,
        compliance_status: supplier.compliance_status,
      });
    }

    req.supplierId = supplier.id;
    next();
  } catch (error: any) {
    console.error("Error checking supplier compliance:", error);
    res.status(500).json({ error: error.message });
  }
}

/** Require active supplier subscription (Standard or Enterprise). Use on depots write, driver-depot-orders, analytics, invoices. */
async function requireSupplierSubscription(req: any, res: any, next: any) {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "User not authenticated" });
    const supplierResult = await pool.query(
      `SELECT id, subscription_tier
       FROM suppliers
       WHERE owner_id = $1
       LIMIT 1`,
      [user.id]
    );
    const supplier = supplierResult.rows[0] ?? null;
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const subResult = await pool.query(
      `SELECT id, status, current_period_end
       FROM supplier_subscriptions
       WHERE supplier_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [supplier.id]
    );
    const sub = subResult.rows[0] ?? null;
    const now = new Date();
    const hasActiveSubscription = Boolean(
      sub &&
      sub.status === "active" &&
      (!sub.current_period_end || new Date(sub.current_period_end) >= now)
    );
    const hasActiveTier = supplier.subscription_tier === "standard" || supplier.subscription_tier === "enterprise";

    if (!hasActiveSubscription && !hasActiveTier) {
      return res.status(403).json({
        error: "Active subscription required",
        code: "SUBSCRIPTION_REQUIRED",
        message: "Subscribe to list on the platform and receive orders.",
      });
    }
    req.supplierId = supplier.id;
    next();
  } catch (error: any) {
    console.error("requireSupplierSubscription error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get all depots for the authenticated supplier with their pricing
// Note: Allow viewing depots even if compliance is pending (similar to drivers)
router.get("/depots", async (req, res) => {
  const user = (req as any).user;

  try {
    if (!user || !user.id) {
      console.error("GET /depots: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      // Return empty array instead of error - supplier might not have created profile yet
      return res.json([]);
    }

    // Check compliance status - if not approved, return empty array (can view but no depots shown)
    const { data: supplierStatus } = await drizzleClient
      .from("suppliers")
      .select("status, compliance_status")
      .eq("id", supplier.id)
      .single();
    
    if (!supplierStatus || supplierStatus.status !== "active" || supplierStatus.compliance_status !== "approved") {
      // Return empty array instead of error - allows UI to load but shows no depots
      return res.json([]);
    }

    // Get all depots first
    const { data: depots, error: depotsError } = await drizzleClient
      .from("depots")
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at
      `)
      .eq("supplier_id", supplier.id)
      .order("name");

    if (depotsError) {
      console.error("Error fetching depots:", depotsError);
      return res.status(500).json({
        error: "Failed to fetch depots",
        details: depotsError.message
      });
    }

    // If no depots, return empty array
    if (!depots || depots.length === 0) {
      return res.json([]);
    }

    // Get pricing for all depots separately to avoid nested query issues
    const depotIds = depots.map(d => d.id);
    let allPricing: any[] = [];

    if (depotIds.length > 0) {
      try {
        // First try to get pricing with fuel_types relation
        const { data: pricing, error: pricingError } = await drizzleClient
          .from("depot_prices")
          .select(`
            id,
            depot_id,
            fuel_type_id,
            price_cents,
            min_litres,
            available_litres,
            created_at,
            updated_at,
            fuel_types (
              id,
              label,
              code
            )
          `)
          .in("depot_id", depotIds);

        if (pricingError) {
          console.error("Error fetching depot pricing with relations:", pricingError);
          // Fallback: try without nested relation
          const { data: pricingWithoutRelation, error: fallbackError } = await drizzleClient
            .from("depot_prices")
            .select(`
              id,
              depot_id,
              fuel_type_id,
              price_cents,
              min_litres,
              available_litres,
              created_at,
              updated_at
            `)
            .in("depot_id", depotIds);

          if (fallbackError) {
            console.error("Error fetching depot pricing (fallback):", fallbackError);
            // Continue without pricing
            allPricing = [];
          } else {
            // Fetch fuel types separately and merge
            const fuelTypeIds = Array.from(new Set((pricingWithoutRelation || []).map((p: any) => p.fuel_type_id).filter(Boolean)));
            if (fuelTypeIds.length > 0) {
              const { data: fuelTypes } = await drizzleClient
                .from("fuel_types")
                .select("id, label, code")
                .in("id", fuelTypeIds);

              const fuelTypeMap = new Map((fuelTypes || []).map((ft: any) => [ft.id, ft]));
              allPricing = (pricingWithoutRelation || []).map((p: any) => ({
                ...p,
                fuel_types: fuelTypeMap.get(p.fuel_type_id) || null
              }));
            } else {
              allPricing = pricingWithoutRelation || [];
            }
          }
        } else {
          allPricing = pricing || [];
        }
      } catch (error: any) {
        console.error("Unexpected error fetching depot pricing:", error);
        // Continue without pricing
        allPricing = [];
      }
    }

    // Group pricing by depot_id
    const pricingByDepot = new Map();
    if (allPricing) {
      allPricing.forEach((price: any) => {
        if (!pricingByDepot.has(price.depot_id)) {
          pricingByDepot.set(price.depot_id, []);
        }
        pricingByDepot.get(price.depot_id).push(price);
      });
    }

    // Attach pricing to each depot
    const depotsWithPricing = depots.map((depot: any) => ({
      ...depot,
      depot_prices: pricingByDepot.get(depot.id) || [],
    }));

    res.json(depotsWithPricing);
  } catch (error: any) {
    console.error("Error in GET /depots:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: error.stack
    });
  }
});

// Get pricing for a specific depot
router.get("/depots/:depotId/pricing", requireSupplierSubscription, checkSupplierCompliance, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get all fuel types
    const { data: fuelTypes, error: fuelTypesError } = await drizzleClient
      .from("fuel_types")
      .select("*")
      .eq("active", true)
      .order("label");

    if (fuelTypesError) throw fuelTypesError;

    // Get depot pricing (all tiers for each fuel type)
    const { data: pricing, error: pricingError } = await drizzleClient
      .from("depot_prices")
      .select("*")
      .eq("depot_id", depotId)
      .order("fuel_type_id", { ascending: true })
      .order("min_litres", { ascending: true });

    if (pricingError) throw pricingError;

    // Group pricing by fuel_type_id (each fuel type can have multiple tiers)
    const pricingByFuelType = (pricing || []).reduce((acc: any, p: any) => {
      if (!acc[p.fuel_type_id]) {
        acc[p.fuel_type_id] = [];
      }
      acc[p.fuel_type_id].push(p);
      return acc;
    }, {});

    // Combine fuel types with pricing tiers
    const result = fuelTypes?.map((ft: any) => ({
      ...ft,
      pricing_tiers: pricingByFuelType[ft.id] || [],
    })) || [];

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new pricing tier for a fuel type
router.post("/depots/:depotId/pricing/:fuelTypeId/tiers", requireSupplierSubscription, checkSupplierCompliance, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const fuelTypeId = req.params.fuelTypeId;
  const { priceCents, minLitres, availableLitres } = req.body;

  try {
    // Validate input
    if (!priceCents || priceCents < 0) {
      return res.status(400).json({ error: "Valid price is required" });
    }
    if (minLitres === undefined || minLitres === null || minLitres < 0) {
      return res.status(400).json({ error: "Minimum litres must be a non-negative number" });
    }

    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Check if tier with same min_litres already exists
    const { data: existingTier, error: checkError } = await drizzleClient
      .from("depot_prices")
      .select("*")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .eq("min_litres", minLitres)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingTier) {
      return res.status(400).json({
        error: `A pricing tier with minimum ${minLitres}L already exists for this fuel type`
      });
    }

    // Get existing tiers to get stock value (stock is shared across all tiers)
    const { data: existingTiers } = await drizzleClient
      .from("depot_prices")
      .select("available_litres")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .limit(1);

    // Stock is managed separately, so use existing stock if available, otherwise null
    const stockValue = existingTiers && existingTiers.length > 0
      ? existingTiers[0].available_litres
      : (availableLitres ?? null);

    // Create tier (stock will be set separately/shared)
    const { data: newTier, error: insertError } = await drizzleClient
      .from("depot_prices")
      .insert({
        depot_id: depotId,
        fuel_type_id: fuelTypeId,
        price_cents: priceCents,
        min_litres: minLitres,
        available_litres: stockValue,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return res.status(201).json(newTier);
  } catch (error: any) {
    console.error("Error creating pricing tier:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update stock for a fuel type (creates default tier if none exists)
// This route must come BEFORE the tier update route to avoid route conflicts
router.put("/depots/:depotId/pricing/:fuelTypeId/stock", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const fuelTypeId = req.params.fuelTypeId;
  const { availableLitres } = req.body;

  try {
    // Validate input
    const availableLitresNum = parseFloat(availableLitres);
    if (isNaN(availableLitresNum) || availableLitresNum < 0) {
      return res.status(400).json({
        error: "Available litres must be a non-negative number"
      });
    }

    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Check if any tiers exist for this fuel type
    const { data: existingTiers, error: tiersError } = await drizzleClient
      .from("depot_prices")
      .select("id")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .limit(1);

    if (tiersError) throw tiersError;

    if (existingTiers && existingTiers.length > 0) {
      // Update stock for all existing tiers
      const { error: updateError } = await drizzleClient
        .from("depot_prices")
        .update({ available_litres: availableLitresNum })
        .eq("depot_id", depotId)
        .eq("fuel_type_id", fuelTypeId);

      if (updateError) throw updateError;

      // Return one of the updated tiers
      const { data: updatedTier } = await drizzleClient
        .from("depot_prices")
        .select("*")
        .eq("depot_id", depotId)
        .eq("fuel_type_id", fuelTypeId)
        .limit(1)
        .single();

      return res.json(updatedTier);
    } else {
      // No tiers exist, create a default tier with stock
      // Use min_litres = 0 and price_cents = 10000 (R 100.00 default price)
      const { data: newTier, error: insertError } = await drizzleClient
        .from("depot_prices")
        .insert({
          depot_id: depotId,
          fuel_type_id: fuelTypeId,
          price_cents: 10000, // Default price: R 100.00
          min_litres: 0,
          available_litres: availableLitresNum,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return res.json(newTier);
    }
  } catch (error: any) {
    console.error("Error updating stock:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update a pricing tier
router.put("/depots/:depotId/pricing/tiers/:tierId", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const tierId = req.params.tierId;
  const { priceCents, minLitres, availableLitres } = req.body;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get existing tier
    const { data: existingTier, error: tierError } = await drizzleClient
      .from("depot_prices")
      .select("*")
      .eq("id", tierId)
      .eq("depot_id", depotId)
      .single();

    if (tierError || !existingTier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (priceCents !== undefined) {
      if (priceCents < 0) {
        return res.status(400).json({ error: "Price must be non-negative" });
      }
      updateData.price_cents = priceCents;
    }

    if (minLitres !== undefined) {
      if (minLitres < 0) {
        return res.status(400).json({ error: "Minimum litres must be non-negative" });
      }
      // Check if another tier with this min_litres exists
      const { data: conflictingTier } = await drizzleClient
        .from("depot_prices")
        .select("id")
        .eq("depot_id", depotId)
        .eq("fuel_type_id", existingTier.fuel_type_id)
        .eq("min_litres", minLitres)
        .neq("id", tierId)
        .maybeSingle();

      if (conflictingTier) {
        return res.status(400).json({
          error: `Another pricing tier with minimum ${minLitres}L already exists`
        });
      }
      updateData.min_litres = minLitres;
    }

    // Update available_litres (stock is shared across all tiers for the same fuel type)
    // Allow stock update from any tier, not just the one with min_litres = 0
    if (availableLitres !== undefined) {
      const availableLitresNum = parseFloat(availableLitres);
      if (isNaN(availableLitresNum) || availableLitresNum < 0) {
        return res.status(400).json({
          error: "Available litres must be a non-negative number"
        });
      }
      // Update stock for all tiers of this fuel type
      const { data: updatedStockTiers, error: stockUpdateError } = await drizzleClient
        .from("depot_prices")
        .update({ available_litres: availableLitresNum })
        .eq("depot_id", depotId)
        .eq("fuel_type_id", existingTier.fuel_type_id)
        .select();
      
      if (stockUpdateError) {
        console.error("Error updating stock:", stockUpdateError);
        return res.status(500).json({
          error: "Failed to update stock",
          details: stockUpdateError.message
        });
      }
      
      // If only stock is being updated (no priceCents or minLitres), return the updated tier
      if (priceCents === undefined && minLitres === undefined) {
        const updatedTierWithStock = updatedStockTiers?.find(t => t.id === tierId);
        if (updatedTierWithStock) {
          return res.json(updatedTierWithStock);
        }
      }
    }

    // Update the tier
    const { data: updatedTier, error: updateError } = await drizzleClient
      .from("depot_prices")
      .update(updateData)
      .eq("id", tierId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedTier);
  } catch (error: any) {
    console.error("Error updating pricing tier:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a pricing tier
router.delete("/depots/:depotId/pricing/tiers/:tierId", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const tierId = req.params.tierId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get existing tier
    const { data: existingTier, error: tierError } = await drizzleClient
      .from("depot_prices")
      .select("*")
      .eq("id", tierId)
      .eq("depot_id", depotId)
      .single();

    if (tierError || !existingTier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    // Delete the tier (no restriction - allow deletion of any tier, even if it's the only one)
    const { error: deleteError } = await drizzleClient
      .from("depot_prices")
      .delete()
      .eq("id", tierId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: "Pricing tier deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting pricing tier:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get pricing history for a depot
router.get("/depots/:depotId/pricing/history", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id, name")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get pricing history with fuel type details (per-depot with explicit type filter)
    const { data: history, error: historyError } = await drizzleClient
      .from("pricing_history")
      .select(`
        *,
        fuel_types (
          id,
          label,
          code
        )
      `)
      .eq("entity_type", "depot")
      .eq("entity_id", depotId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (historyError) throw historyError;

    res.json(history || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new depot
router.post("/depots", requireSupplierSubscription, checkSupplierCompliance, async (req, res) => {
  const user = (req as any).user;

  try {
    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id, status, compliance_status")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Check if supplier KYC is approved
    if (supplier.status !== "active" || supplier.compliance_status !== "approved") {
      return res.status(403).json({
        error: "KYC approval required",
        code: "KYC_REQUIRED",
        message: "Please apply for KYC from profile management and wait for approval before adding depots.",
        status: supplier.status,
        compliance_status: supplier.compliance_status,
      });
    }

    // Validate required fields
    if (!req.body.name || req.body.name.trim() === "") {
      return res.status(400).json({ error: "Depot name is required" });
    }

    if (req.body.lat === undefined || req.body.lat === null || isNaN(parseFloat(req.body.lat))) {
      return res.status(400).json({ error: "Valid latitude is required" });
    }

    if (req.body.lng === undefined || req.body.lng === null || isNaN(parseFloat(req.body.lng))) {
      return res.status(400).json({ error: "Valid longitude is required" });
    }

    // Validate and prepare all depot fields
    const depotData: any = {
      supplier_id: supplier.id,
      name: req.body.name.trim(),
      lat: parseFloat(req.body.lat),
      lng: parseFloat(req.body.lng),
      is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : true,
    };

    // Handle open_hours - can be object or string
    let openHours = {};
    if (req.body.open_hours) {
      if (typeof req.body.open_hours === 'string' && req.body.open_hours.trim()) {
        try {
          openHours = JSON.parse(req.body.open_hours);
        } catch (e) {
          // If not valid JSON, store as object with description
          openHours = { description: req.body.open_hours.trim() };
        }
      } else if (typeof req.body.open_hours === 'object' && req.body.open_hours !== null) {
        openHours = req.body.open_hours;
      }
    } else if (req.body.openHours) {
      // Handle camelCase version
      if (typeof req.body.openHours === 'string' && req.body.openHours.trim()) {
        try {
          openHours = JSON.parse(req.body.openHours);
        } catch (e) {
          openHours = { description: req.body.openHours.trim() };
        }
      } else if (typeof req.body.openHours === 'object' && req.body.openHours !== null) {
        openHours = req.body.openHours;
      }
    }
    depotData.open_hours = openHours;

    // Add optional address fields if provided
    if (req.body.address_street && req.body.address_street.trim()) {
      depotData.address_street = req.body.address_street.trim();
    }
    if (req.body.address_city && req.body.address_city.trim()) {
      depotData.address_city = req.body.address_city.trim();
    }
    if (req.body.address_province && req.body.address_province.trim()) {
      depotData.address_province = req.body.address_province.trim();
    }
    if (req.body.address_postal_code && req.body.address_postal_code.trim()) {
      depotData.address_postal_code = req.body.address_postal_code.trim();
    }
    if (req.body.notes && req.body.notes.trim()) {
      depotData.notes = req.body.notes.trim();
    }

    // Create depot with all fields
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .insert(depotData)
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at
      `)
      .single();

    if (depotError) {
      console.error("Error creating depot:", depotError);
      return res.status(500).json({
        error: "Failed to create depot",
        details: depotError.message,
        code: depotError.code
      });
    }

    // Broadcast depot creation to supplier via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "depot_created",
      payload: {
        depotId: depot.id,
        name: depot.name,
      },
    });

    res.json(depot);
  } catch (error: any) {
    console.error("Error in POST /depots:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid depot data", details: error.errors });
    }
    res.status(500).json({
      error: error.message || "Internal server error",
      details: error.stack
    });
  }
});

// Update depot
router.patch("/depots/:depotId", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Update depot
    const updateData: any = {
      updated_at: new Date(),
    };

    // Update fields if provided
    if (req.body.name !== undefined) updateData.name = req.body.name.trim();
    if (req.body.lat !== undefined) updateData.lat = parseFloat(req.body.lat);
    if (req.body.lng !== undefined) updateData.lng = parseFloat(req.body.lng);
    if (req.body.is_active !== undefined) updateData.is_active = Boolean(req.body.is_active);
    if (req.body.notes !== undefined) updateData.notes = req.body.notes?.trim() || null;
    if (req.body.address_street !== undefined) updateData.address_street = req.body.address_street?.trim() || null;
    if (req.body.address_city !== undefined) updateData.address_city = req.body.address_city?.trim() || null;
    if (req.body.address_province !== undefined) updateData.address_province = req.body.address_province?.trim() || null;
    if (req.body.address_postal_code !== undefined) updateData.address_postal_code = req.body.address_postal_code?.trim() || null;

    // Handle open_hours
    if (req.body.open_hours !== undefined) {
      let openHours = {};
      if (req.body.open_hours) {
        if (typeof req.body.open_hours === 'string' && req.body.open_hours.trim()) {
          try {
            openHours = JSON.parse(req.body.open_hours);
          } catch (e) {
            openHours = { description: req.body.open_hours.trim() };
          }
        } else if (typeof req.body.open_hours === 'object' && req.body.open_hours !== null) {
          openHours = req.body.open_hours;
        }
      }
      updateData.open_hours = openHours;
    }

    const { data: updated, error: updateError } = await drizzleClient
      .from("depots")
      .update(updateData)
      .eq("id", depotId)
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at
      `)
      .single();

    if (updateError) throw updateError;

    // Broadcast depot update to supplier via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "depot_updated",
      payload: {
        depotId: updated.id,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete depot
router.delete("/depots/:depotId", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await drizzleClient
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Check if depot has any active pricing
    const { data: pricing, error: pricingError } = await drizzleClient
      .from("depot_prices")
      .select("id")
      .eq("depot_id", depotId)
      .limit(1);

    if (pricingError) throw pricingError;

    if (pricing && pricing.length > 0) {
      return res.status(400).json({
        error: "Cannot delete depot with existing pricing. Please remove all pricing first or set depot to inactive."
      });
    }

    // Delete depot
    const { error: deleteError } = await drizzleClient
      .from("depots")
      .delete()
      .eq("id", depotId);

    if (deleteError) throw deleteError;

    // Broadcast depot deletion to supplier via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "depot_deleted",
      payload: {
        depotId,
      },
    });

    res.json({ success: true, message: "Depot deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders for supplier's depots
// NOTE: Since we removed customer-supplier relationship, this endpoint now returns empty array
// Suppliers only interact with drivers through depot orders (see /driver-depot-orders)
router.get("/orders", async (req, res) => {
  const user = (req as any).user;

  try {
    if (!user || !user.id) {
      console.error("GET /orders: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier in /orders:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    // Since customer orders no longer link to depots, return empty array
    // Suppliers should use /driver-depot-orders endpoint instead
    return res.json([]);
  } catch (error: any) {
    console.error("Error in GET /orders:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// ============== SUPPLIER PROFILE ==============

// Get supplier profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get profile data
    const { data: profile, error: profileError } = await drizzleClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      if (profileError.message?.includes("Invalid API key")) {
        throw profileError;
      }
      throw profileError;
    }

    // If no profile, user needs to complete setup
    if (!profile) {
      return res.status(404).json({
        error: "Supplier profile not found",
        code: "PROFILE_SETUP_REQUIRED",
        message: "Please complete your profile setup"
      });
    }

    // Get supplier-specific data
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("*")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      if (supplierError.message?.includes("Invalid API key")) {
        throw supplierError;
      }
      throw supplierError;
    }

    // If no supplier record but profile exists, create it
    if (!supplier) {
      const { data: newSupplier, error: createError } = await drizzleClient
        .from("suppliers")
        .insert({
          owner_id: user.id,
          name: profile.full_name || "Supplier",
          registered_name: profile.full_name || "Supplier",
          kyb_status: "pending"
        })
        .select()
        .single();

      if (createError) {
        // If RLS error, try to get the supplier record that might have been created
        if (createError.message?.includes("row-level security")) {
          const { data: existingSuppliers } = await drizzleClient
            .from("suppliers")
            .select("*")
            .eq("owner_id", user.id)
            .limit(1);

          const existingSupplier = existingSuppliers && existingSuppliers.length > 0 ? existingSuppliers[0] : null;

          if (existingSupplier) {
            return res.json({
              ...profile,
              ...existingSupplier,
              email: user.email || null
            });
          }
        }
        throw createError;
      }

      return res.json({
        ...profile,
        ...newSupplier,
        email: user.email || null
      });
    }

    // Account manager (Enterprise only): include when subscription_tier is enterprise and assigned
    let accountManager: { name: string; email: string } | null = null;
    if ((supplier as any).subscription_tier === "enterprise" && (supplier as any).account_manager_id) {
      const { data: admin } = await drizzleClient
        .from("admins")
        .select("user_id")
        .eq("id", (supplier as any).account_manager_id)
        .maybeSingle();
      if (admin?.user_id) {
        const { data: amProfile } = await drizzleClient
          .from("profiles")
          .select("full_name")
          .eq("id", admin.user_id)
          .maybeSingle();
        accountManager = {
          name: (amProfile as any)?.full_name || "Account Manager",
          email: "", // email may be on auth.users; omit unless we have it from profile
        };
      }
    }

    // Combine profile, supplier, and email data
    res.json({
      ...profile,
      ...supplier,
      email: user.email || null,
      ...(accountManager && { accountManager }),
    });
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.status(404).json({
        error: "Supplier profile not found",
        code: "PROFILE_SETUP_REQUIRED"
      });
    }
    console.error("Error fetching supplier profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update supplier profile
router.put("/profile", async (req, res) => {
  const user = (req as any).user;
  const { fullName, phone, addressStreet, addressCity, addressProvince, addressPostalCode, addressCountry } = req.body;

  try {
    // Validate that at least one field is being updated
    const hasUpdates = fullName !== undefined || phone !== undefined ||
      addressStreet !== undefined || addressCity !== undefined ||
      addressProvince !== undefined || addressPostalCode !== undefined ||
      addressCountry !== undefined;

    if (!hasUpdates) {
      return res.status(400).json({ error: "At least one field must be provided for update" });
    }

    // Check if supplier was rejected - if so, reset to pending for resubmission
    const { data: supplier } = await drizzleClient
      .from("suppliers")
      .select("id, kyb_status, status, compliance_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (supplier && (supplier.kyb_status === "rejected" || supplier.status === "rejected" || supplier.compliance_status === "rejected")) {
      try {
        console.log(`[KYB Resubmission] Supplier ${supplier.id} was rejected, resetting to pending status for resubmission`);
        
        // Update supplier status
        const { error: supplierUpdateError } = await drizzleClient
          .from("suppliers")
          .update({
            kyb_status: "pending",
            status: "pending_compliance",
            compliance_status: "pending",
            compliance_rejection_reason: null,
            updated_at: new Date()
          })
          .eq("id", supplier.id);
        
        if (supplierUpdateError) {
          console.error(`[KYB Resubmission] Error updating supplier ${supplier.id} status:`, supplierUpdateError);
          throw supplierUpdateError;
        }
        
        // Also update profile approval status
        const { error: profileUpdateError } = await drizzleClient
          .from("profiles")
          .update({ 
            approval_status: "pending",
            updated_at: new Date()
          })
          .eq("id", user.id);
        
        if (profileUpdateError) {
          console.error(`[KYB Resubmission] Error updating profile for supplier ${supplier.id}:`, profileUpdateError);
          // Continue with notifications even if profile update fails
        }

        // Notify admins and supplier
        try {
          const { notificationService } = await import("./notification-service");
          const { websocketService } = await import("./websocket");
          
          // Get admin user IDs
          const { data: adminProfiles, error: adminProfilesError } = await drizzleClient
            .from("profiles")
            .select("id")
            .eq("role", "admin");
          
          if (adminProfilesError) {
            console.error("[KYB Resubmission] Error fetching admin profiles:", adminProfilesError);
          } else if (adminProfiles && adminProfiles.length > 0) {
            const adminUserIds = adminProfiles.map(p => p.id);
            
            // Get supplier name
            const { data: supplierProfile, error: profileError } = await drizzleClient
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle();
            
            if (profileError) {
              console.error("[KYB Resubmission] Error fetching supplier profile:", profileError);
            }
            
            const userName = supplierProfile?.full_name || "Supplier";
            
            // Notify admins that supplier has resubmitted KYB
            try {
              await notificationService.notifyAdminKycSubmitted(
                adminUserIds,
                user.id,
                userName,
                "supplier"
              );
            } catch (notifyError) {
              console.error("[KYB Resubmission] Error notifying admins:", notifyError);
            }
            
            // Broadcast resubmission to admins via WebSocket
            try {
              websocketService.broadcastToRole("admin", {
                type: "kyc_submitted",
                payload: {
                  supplierId: supplier.id,
                  userId: user.id,
                  type: "supplier",
                  isResubmission: true
                },
              });
            } catch (wsError) {
              console.error("[KYB Resubmission] Error broadcasting WebSocket message:", wsError);
            }
          }
          
          // Notify supplier that resubmission was received
          try {
            await notificationService.createNotification({
              user_id: user.id,
              type: "account_verification_required",
              title: "KYB Resubmission Received",
              message: "Your KYB resubmission has been received and is under review. You will be notified once it's been reviewed.",
              metadata: { supplierId: supplier.id, type: "kyb_resubmission" }
            });
          } catch (supplierNotifError) {
            console.error("[KYB Resubmission] Error notifying supplier:", supplierNotifError);
          }
        } catch (notifError) {
          console.error("[KYB Resubmission] Error in notification flow:", notifError);
          // Don't fail the update if notification fails
        }
      } catch (resubmissionError) {
        console.error(`[KYB Resubmission] Error resetting supplier ${supplier.id} status:`, resubmissionError);
        // Continue with the main update - don't fail the entire request
      }
    }

    // Update profile table - only update fields that are provided
    const updateData: any = {
      updated_at: new Date()
    };

    // Only include fields that are explicitly provided (allowing empty strings to clear fields)
    if (fullName !== undefined) {
      updateData.full_name = fullName || null;
    }

    if (phone !== undefined) {
      updateData.phone = phone || null;
    }

    if (addressStreet !== undefined) {
      updateData.address_street = addressStreet || null;
    }

    if (addressCity !== undefined) {
      updateData.address_city = addressCity || null;
    }

    if (addressProvince !== undefined) {
      updateData.address_province = addressProvince || null;
    }

    if (addressPostalCode !== undefined) {
      updateData.address_postal_code = addressPostalCode || null;
    }

    if (addressCountry !== undefined) {
      updateData.address_country = addressCountry || null;
    }

    const { error: profileError } = await drizzleClient
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (profileError) throw profileError;

    // Broadcast supplier profile update
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "supplier_profile_updated",
      payload: { userId: user.id },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============== SUPPLIER SUBSCRIPTION ==============

// GET /api/supplier/subscription – current subscription for authenticated supplier
router.get("/subscription", async (req, res) => {
  const user = (req as any).user;
  try {
    if (!user?.id) return res.status(401).json({ error: "User not authenticated" });
    const { data: supplier, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id, subscription_tier")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierError || !supplier) return res.status(404).json({ error: "Supplier not found" });

    const { data: sub, error: subError } = await drizzleClient
      .from("supplier_subscriptions")
      .select("id, plan_code, status, amount_cents, currency, current_period_start, current_period_end, next_billing_at")
      .eq("supplier_id", supplier.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) return res.status(500).json({ error: subError.message });
    const now = new Date();
    const isActive = sub?.status === "active" && sub?.current_period_end && new Date(sub.current_period_end) >= now;
    return res.json({
      subscription: sub ? { ...sub, isActive } : null,
      subscriptionTier: supplier.subscription_tier,
    });
  } catch (e: any) {
    console.error("GET /subscription error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/supplier/subscription/plans – list plans (Standard R500, Enterprise custom)
router.get("/subscription/plans", async (_req, res) => {
  try {
    const plans = SUPPLIER_PLAN_CODES.map((code) => SUPPLIER_SUBSCRIPTION_PLANS[code]);
    const testMode = process.env.SUBSCRIPTION_TEST_MODE === "true";
    return res.json({ plans, ozowConfigured: isOzowConfigured(), testMode });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const createSupplierPaymentSchema = z.object({ planCode: z.enum(["standard"]) });

// POST /api/supplier/subscription/create-payment – Standard only; create pending payment, return OZOW redirect URL
router.post("/subscription/create-payment", async (req, res) => {
  const user = (req as any).user;
  try {
    const parsed = createSupplierPaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid planCode", details: parsed.error.flatten() });
    const { planCode } = parsed.data as { planCode: "standard" };
    const plan = getSupplierPlan(planCode);
    if (!plan || plan.isCustomPricing) return res.status(400).json({ error: "Only Standard plan can be paid via OZOW" });

    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });

    // Test mode: activate subscription immediately without checkout redirect
    if (process.env.SUBSCRIPTION_TEST_MODE === "true") {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const nextBilling = new Date(periodEnd);

      const { data: existingSub } = await drizzleClient
        .from("supplier_subscriptions")
        .select("id")
        .eq("supplier_id", supplier.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let subscriptionId: string;
      if (existingSub) {
        await drizzleClient
          .from("supplier_subscriptions")
          .update({
            plan_code: planCode,
            status: "active",
            amount_cents: plan.priceCents!,
            currency: "ZAR",
            current_period_start: periodStart,
            current_period_end: periodEnd,
            next_billing_at: nextBilling,
            updated_at: now,
          })
          .eq("id", existingSub.id);
        subscriptionId = existingSub.id;
      } else {
        const { data: newSub, error: insertErr } = await drizzleClient
          .from("supplier_subscriptions")
          .insert({
            supplier_id: supplier.id,
            plan_code: planCode,
            status: "active",
            amount_cents: plan.priceCents!,
            currency: "ZAR",
            current_period_start: periodStart,
            current_period_end: periodEnd,
            next_billing_at: nextBilling,
          })
          .select("id")
          .single();
        if (insertErr || !newSub) return res.status(500).json({ error: "Failed to create subscription", details: insertErr?.message });
        subscriptionId = newSub.id;
      }

      await drizzleClient
        .from("supplier_subscription_payments")
        .insert({
          supplier_subscription_id: subscriptionId,
          amount_cents: plan.priceCents!,
          currency: "ZAR",
          status: "completed",
          paid_at: now,
        });

      await drizzleClient
        .from("suppliers")
        .update({ subscription_tier: planCode, updated_at: now })
        .eq("id", supplier.id);

      return res.json({ success: true });
    }

    if (!isOzowConfigured()) return res.status(503).json({ error: "Payment gateway not configured", code: "OZOW_NOT_CONFIGURED" });

    const baseUrl = process.env.PUBLIC_APP_URL || (req.protocol + "://" + req.get("host") || "http://localhost:5000");
    const successUrl = `${baseUrl}/supplier/subscription?success=true`;
    const cancelUrl = `${baseUrl}/supplier/subscription?cancelled=true`;
    const notificationUrl = `${baseUrl}/api/webhooks/ozow-supplier-subscription`;

    const { data: existingSub } = await drizzleClient
      .from("supplier_subscriptions")
      .select("id")
      .eq("supplier_id", supplier.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscriptionId: string;
    if (existingSub) {
      await drizzleClient
        .from("supplier_subscriptions")
        .update({
          plan_code: planCode,
          status: "pending",
          amount_cents: plan.priceCents!,
          currency: "ZAR",
          updated_at: new Date(),
        })
        .eq("id", existingSub.id);
      subscriptionId = existingSub.id;
    } else {
      const { data: newSub, error: insertErr } = await drizzleClient
        .from("supplier_subscriptions")
        .insert({
          supplier_id: supplier.id,
          plan_code: planCode,
          status: "pending",
          amount_cents: plan.priceCents!,
          currency: "ZAR",
        })
        .select("id")
        .single();
      if (insertErr || !newSub) return res.status(500).json({ error: "Failed to create subscription", details: insertErr?.message });
      subscriptionId = newSub.id;
    }

    const { data: paymentRow, error: payErr } = await drizzleClient
      .from("supplier_subscription_payments")
      .insert({
        supplier_subscription_id: subscriptionId,
        amount_cents: plan.priceCents!,
        currency: "ZAR",
        status: "pending",
      })
      .select("id")
      .single();
    if (payErr || !paymentRow) return res.status(500).json({ error: "Failed to create payment record", details: payErr?.message });

    const transactionReference = `supplier_sub_${paymentRow.id}`;
    const redirectUrl = buildPaymentRedirectUrl({
      amountRands: plan.priceZAR!,
      transactionReference,
      successUrl,
      cancelUrl,
      notificationUrl,
      customerEmail: user.email ?? undefined,
      customerName: (user.user_metadata?.full_name as string) || (req.body?.customerName as string) || undefined,
    });

    return res.json({ redirectUrl, paymentId: paymentRow.id, subscriptionId });
  } catch (e: any) {
    console.error("Error creating supplier subscription payment:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/supplier/subscription/cancel – cancel at period end
router.post("/subscription/cancel", async (req, res) => {
  const user = (req as any).user;
  try {
    if (!user?.id) return res.status(401).json({ error: "User not authenticated" });
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });

    const { error } = await drizzleClient
      .from("supplier_subscriptions")
      .update({ status: "cancelled", updated_at: new Date() })
      .eq("supplier_id", supplier.id)
      .eq("status", "active");
    if (error) return res.status(500).json({ error: error.message });
    await drizzleClient
      .from("suppliers")
      .update({ subscription_tier: null, updated_at: new Date() })
      .eq("id", supplier.id);
    return res.json({ ok: true, message: "Subscription cancelled at period end." });
  } catch (e: any) {
    console.error("POST /subscription/cancel error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============== ANALYTICS ==============

// GET /api/supplier/analytics – basic (Standard) or advanced (Enterprise via ?detail=advanced)
router.get("/analytics", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const detail = (req.query.detail as string) || "";
  const isAdvanced = detail === "advanced";

  try {
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id, subscription_tier")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });

    const tier = (supplier as any).subscription_tier;
    if (isAdvanced && tier !== "enterprise") {
      return res.status(403).json({ error: "Advanced analytics and API access are available on Enterprise plan.", code: "SUBSCRIPTION_TIER_REQUIRED" });
    }

    const { data: depots } = await drizzleClient
      .from("depots")
      .select("id, name")
      .eq("supplier_id", supplier.id);
    const depotIds = (depots || []).map((d: any) => d.id);
    if (depotIds.length === 0) {
      const base = { ordersToday: 0, ordersThisWeek: 0, byStatus: {}, totalLitres: 0, totalValueCents: 0 };
      return res.json(isAdvanced ? { ...base, byDepot: [], byFuelType: [], byPeriod: [] } : base);
    }

    const { data: orders, error: ordersErr } = await drizzleClient
      .from("driver_depot_orders")
      .select("id, status, depot_id, fuel_type_id, litres, actual_litres_delivered, total_price_cents, created_at")
      .in("depot_id", depotIds);

    if (ordersErr) return res.status(500).json({ error: ordersErr.message });
    const orderList = orders || [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekIso = startOfWeek.toISOString();

    const ordersToday = orderList.filter((o: any) => o.created_at >= startOfToday).length;
    const ordersThisWeek = orderList.filter((o: any) => o.created_at >= startOfWeekIso).length;
    const byStatus: Record<string, number> = {};
    orderList.forEach((o: any) => {
      const s = o.status || "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    const totalLitres = orderList.reduce((sum: number, o: any) => sum + (Number(o.actual_litres_delivered ?? o.litres ?? 0) || 0), 0);
    const totalValueCents = orderList.reduce((sum: number, o: any) => sum + (Number(o.total_price_cents) || 0), 0);

    const base = {
      ordersToday,
      ordersThisWeek,
      byStatus,
      totalLitres: Math.round(totalLitres * 100) / 100,
      totalValueCents,
    };

    if (!isAdvanced) return res.json(base);

    const depotMap = new Map((depots || []).map((d: any) => [d.id, d]));
    const byDepot = depotIds.map((depotId: string) => {
      const depotOrders = orderList.filter((o: any) => o.depot_id === depotId);
      const litres = depotOrders.reduce((s: number, o: any) => s + (Number(o.actual_litres_delivered ?? o.litres ?? 0) || 0), 0);
      const valueCents = depotOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
      return {
        depotId,
        depotName: depotMap.get(depotId)?.name || "",
        orderCount: depotOrders.length,
        totalLitres: Math.round(litres * 100) / 100,
        totalValueCents: valueCents,
      };
    });

    const fuelTypeIds = [...new Set(orderList.map((o: any) => o.fuel_type_id).filter(Boolean))];
    const { data: fuelTypes } = fuelTypeIds.length
      ? await drizzleClient.from("fuel_types").select("id, label, code").in("id", fuelTypeIds)
      : { data: [] };
    const fuelMap = new Map((fuelTypes || []).map((f: any) => [f.id, f]));
    const byFuelType = fuelTypeIds.map((ftId: string) => {
      const ftOrders = orderList.filter((o: any) => o.fuel_type_id === ftId);
      const litres = ftOrders.reduce((s: number, o: any) => s + (Number(o.actual_litres_delivered ?? o.litres ?? 0) || 0), 0);
      const valueCents = ftOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
      return {
        fuelTypeId: ftId,
        fuelTypeLabel: fuelMap.get(ftId)?.label || ftId,
        orderCount: ftOrders.length,
        totalLitres: Math.round(litres * 100) / 100,
        totalValueCents: valueCents,
      };
    });

    const byPeriod = [
      { period: "today", orders: ordersToday, start: startOfToday, end: now.toISOString() },
      { period: "this_week", orders: ordersThisWeek, start: startOfWeekIso, end: now.toISOString() },
      { period: "all", orders: orderList.length, totalLitres: base.totalLitres, totalValueCents: base.totalValueCents },
    ];

    return res.json({ ...base, byDepot, byFuelType, byPeriod });
  } catch (e: any) {
    console.error("GET /analytics error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/supplier/analytics/export – Enterprise only (JSON or CSV via ?format=csv)
router.get("/analytics/export", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const format = (req.query.format as string) || "json";

  try {
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id, subscription_tier")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });
    if ((supplier as any).subscription_tier !== "enterprise") {
      return res.status(403).json({ error: "Export and API access are available on Enterprise plan.", code: "SUBSCRIPTION_TIER_REQUIRED" });
    }

    const { data: depots } = await drizzleClient.from("depots").select("id, name").eq("supplier_id", supplier.id);
    const depotIds = (depots || []).map((d: any) => d.id);
    if (depotIds.length === 0) {
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        return res.send("depotId,depotName,orderCount,totalLitres,totalValueCents\n");
      }
      return res.json({ byDepot: [], byFuelType: [], byPeriod: [] });
    }

    const { data: orders } = await drizzleClient
      .from("driver_depot_orders")
      .select("id, status, depot_id, fuel_type_id, litres, actual_litres_delivered, total_price_cents, created_at")
      .in("depot_id", depotIds);

    const orderList = orders || [];
    const depotMap = new Map((depots || []).map((d: any) => [d.id, d]));
    const byDepot = depotIds.map((depotId: string) => {
      const depotOrders = orderList.filter((o: any) => o.depot_id === depotId);
      const litres = depotOrders.reduce((s: number, o: any) => s + (Number(o.actual_litres_delivered ?? o.litres ?? 0) || 0), 0);
      const valueCents = depotOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
      return { depotId, depotName: depotMap.get(depotId)?.name || "", orderCount: depotOrders.length, totalLitres: Math.round(litres * 100) / 100, totalValueCents: valueCents };
    });

    const fuelTypeIds = [...new Set(orderList.map((o: any) => o.fuel_type_id).filter(Boolean))];
    const { data: fuelTypes } = fuelTypeIds.length ? await drizzleClient.from("fuel_types").select("id, label").in("id", fuelTypeIds) : { data: [] };
    const fuelMap = new Map((fuelTypes || []).map((f: any) => [f.id, f]));
    const byFuelType = fuelTypeIds.map((ftId: string) => {
      const ftOrders = orderList.filter((o: any) => o.fuel_type_id === ftId);
      const litres = ftOrders.reduce((s: number, o: any) => s + (Number(o.actual_litres_delivered ?? o.litres ?? 0) || 0), 0);
      const valueCents = ftOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
      return { fuelTypeId: ftId, fuelTypeLabel: fuelMap.get(ftId)?.label || ftId, orderCount: ftOrders.length, totalLitres: Math.round(litres * 100) / 100, totalValueCents: valueCents };
    });

    if (format === "csv") {
      const rows: string[] = ["depotId,depotName,orderCount,totalLitres,totalValueCents"];
      byDepot.forEach((r: any) => rows.push([r.depotId, r.depotName, r.orderCount, r.totalLitres, r.totalValueCents].join(",")));
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=analytics-by-depot.csv");
      return res.send(rows.join("\n"));
    }
    return res.json({ byDepot, byFuelType, exportedAt: new Date().toISOString() });
  } catch (e: any) {
    console.error("GET /analytics/export error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============== INVOICES ==============

// GET /api/supplier/invoices – list invoices (completed driver_depot_orders)
router.get("/invoices", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });

    const { data: depots } = await drizzleClient.from("depots").select("id, name").eq("supplier_id", supplier.id);
    const depotIds = (depots || []).map((d: any) => d.id);
    if (depotIds.length === 0) return res.json({ invoices: [] });

    const ordersResult = await pool.query(
      `SELECT o.id,
              o.status,
              o.depot_id,
              o.fuel_type_id,
              o.litres,
              o.actual_litres_delivered,
              o.price_per_litre_cents,
              o.total_price_cents,
              o.created_at,
              o.completed_at,
              d.name AS depot_name,
              COALESCE(ft.label, ft.code, 'Unknown') AS fuel_label
       FROM driver_depot_orders o
       INNER JOIN depots d ON d.id = o.depot_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       WHERE o.depot_id = ANY($1::uuid[])
         AND o.status = 'completed'
       ORDER BY o.completed_at DESC
       LIMIT 200`,
      [depotIds]
    );

    const list = (ordersResult.rows || []).map((o: any) => ({
      id: o.id,
      depotName: o.depot_name || "Unknown depot",
      fuelType: o.fuel_label || "Unknown fuel",
      litres: Number(o.actual_litres_delivered ?? o.litres ?? 0),
      pricePerLitreCents: Number(o.price_per_litre_cents ?? 0),
      totalCents: o.total_price_cents,
      completedAt: o.completed_at,
      createdAt: o.created_at,
    }));
    return res.json({ invoices: list });
  } catch (e: any) {
    console.error("GET /invoices error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/supplier/invoices/:id – single invoice data (for PDF or view)
router.get("/invoices/:id", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  try {
    const { data: supplier } = await drizzleClient.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle();
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const { data: depots } = await drizzleClient.from("depots").select("id").eq("supplier_id", supplier.id);
    const depotIds = (depots || []).map((d: any) => d.id);
    if (depotIds.length === 0) return res.status(404).json({ error: "Invoice not found" });

    const orderResult = await pool.query(
      `SELECT o.*,
              json_build_object(
                'id', d.id,
                'name', d.name,
                'supplier_id', d.supplier_id,
                'address_street', d.address_street,
                'address_city', d.address_city,
                'address_province', d.address_province,
                'address_postal_code', d.address_postal_code
              ) AS depots,
              json_build_object(
                'id', ft.id,
                'label', COALESCE(ft.label, ft.code, 'Unknown'),
                'code', ft.code
              ) AS fuel_types,
              json_build_object(
                'id', dr.id,
                'user_id', dr.user_id,
                'profile', json_build_object(
                  'id', p.id,
                  'full_name', COALESCE(NULLIF(p.full_name, ''), split_part(lau.email, '@', 1), 'Driver'),
                  'phone', p.phone
                )
              ) AS drivers
       FROM driver_depot_orders o
       INNER JOIN depots d ON d.id = o.depot_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       LEFT JOIN drivers dr ON dr.id = o.driver_id
       LEFT JOIN profiles p ON p.id = dr.user_id
       LEFT JOIN local_auth_users lau ON lau.id = dr.user_id
       WHERE o.id = $1
         AND o.depot_id = ANY($2::uuid[])
       LIMIT 1`,
      [id, depotIds]
    );

    const order = orderResult.rows?.[0];
    if (!order) return res.status(404).json({ error: "Invoice not found" });
    if ((order as any).status !== "completed") return res.status(400).json({ error: "Order not completed" });

    const invoice = {
      id: order.id,
      depot: (order as any).depots,
      fuelType: (order as any).fuel_types,
      driver: (order as any).drivers,
      litres: Number((order as any).actual_litres_delivered ?? (order as any).litres ?? 0),
      pricePerLitreCents: Number((order as any).price_per_litre_cents ?? 0),
      totalCents: (order as any).total_price_cents,
      completedAt: (order as any).completed_at,
      createdAt: (order as any).created_at,
    };
    return res.json(invoice);
  } catch (e: any) {
    console.error("GET /invoices/:id error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/supplier/invoices/:id/pdf – HTML invoice (print/save as PDF)
router.get("/invoices/:id/pdf", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const shouldDownload = String(req.query.download || "").toLowerCase() === "1" || String(req.query.download || "").toLowerCase() === "true";
  try {
    const { data: supplier } = await drizzleClient.from("suppliers").select("id, name").eq("owner_id", user.id).maybeSingle();
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const { data: depots } = await drizzleClient.from("depots").select("id").eq("supplier_id", supplier.id);
    const depotIds = (depots || []).map((d: any) => d.id);
    if (depotIds.length === 0) return res.status(404).json({ error: "Invoice not found" });

    const orderResult = await pool.query(
      `SELECT o.*,
              json_build_object(
                'id', d.id,
                'name', d.name,
                'supplier_id', d.supplier_id,
                'address_street', d.address_street,
                'address_city', d.address_city,
                'address_province', d.address_province,
                'address_postal_code', d.address_postal_code
              ) AS depots,
              json_build_object(
                'id', ft.id,
                'label', COALESCE(ft.label, ft.code, 'Unknown'),
                'code', ft.code
              ) AS fuel_types,
              json_build_object(
                'id', dr.id,
                'user_id', dr.user_id,
                'profile', json_build_object(
                  'id', p.id,
                  'full_name', COALESCE(NULLIF(p.full_name, ''), split_part(lau.email, '@', 1), 'Driver'),
                  'phone', p.phone
                )
              ) AS drivers
       FROM driver_depot_orders o
       INNER JOIN depots d ON d.id = o.depot_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       LEFT JOIN drivers dr ON dr.id = o.driver_id
       LEFT JOIN profiles p ON p.id = dr.user_id
       LEFT JOIN local_auth_users lau ON lau.id = dr.user_id
       WHERE o.id = $1
         AND o.depot_id = ANY($2::uuid[])
       LIMIT 1`,
      [id, depotIds]
    );

    const order = orderResult.rows?.[0];
    if (!order) return res.status(404).json({ error: "Invoice not found" });
    if ((order as any).status !== "completed") return res.status(400).json({ error: "Order not completed" });

    const driverName = (order as any).drivers?.profile?.full_name || "Driver";
    const depotName = (order as any).depots?.name || "Depot";
    const fuelLabel = (order as any).fuel_types?.label || "";
    const litres = Number((order as any).actual_litres_delivered ?? (order as any).litres ?? 0);
    const pricePerLitre = Number((order as any).price_per_litre_cents ?? 0) / 100;
    const totalCents = (order as any).total_price_cents || 0;
    const totalZAR = (totalCents / 100).toFixed(2);
    const completedAt = (order as any).completed_at
      ? new Date((order as any).completed_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
      : "";
    const createdAt = (order as any).created_at
      ? new Date((order as any).created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
      : "";
    const depotAddress = [
      (order as any).depots?.address_street,
      (order as any).depots?.address_city,
      (order as any).depots?.address_province,
      (order as any).depots?.address_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    const orderShortId = String(order.id).slice(0, 8).toUpperCase();
    const filename = `EasyFuel-Receipt-${orderShortId}.pdf`;
    const formatZar = (value: number) =>
      `R ${new Intl.NumberFormat("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${shouldDownload ? "attachment" : "inline"}; filename="${filename}"`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 80;
    const cardX = 40;
    let y = 40;

    doc.lineWidth(1.5).strokeColor("#d1d5db").roundedRect(cardX, y, contentWidth, 730, 10).stroke();
    y += 18;

    doc.font("Helvetica-Bold").fontSize(24).fillColor("#0f172a").text("Easy Fuel", cardX + 14, y);
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text("Fuel Delivery Receipt", cardX + 14, y + 30);
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text("Order ID", cardX + contentWidth - 130, y + 5, { width: 110, align: "right" });
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(`#${orderShortId}`, cardX + contentWidth - 130, y + 20, { width: 110, align: "right" });
    y += 60;

    doc.moveTo(cardX + 12, y).lineTo(cardX + contentWidth - 12, y).strokeColor("#d1d5db").stroke();
    y += 16;

    const leftX = cardX + 14;
    const rightX = cardX + contentWidth / 2 + 5;
    const colWidth = contentWidth / 2 - 20;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("DRIVER INFORMATION", leftX, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("DEPOT INFORMATION", rightX, y);
    y += 14;

    doc.roundedRect(leftX, y, colWidth, 34, 6).fillAndStroke("#f1f5f9", "#e2e8f0");
    doc.roundedRect(rightX, y, colWidth, 34, 6).fillAndStroke("#f1f5f9", "#e2e8f0");
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(driverName, leftX + 8, y + 11, { width: colWidth - 16 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(depotName, rightX + 8, y + 8, { width: colWidth - 16 });
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text(`Supplier: ${(supplier as any).name || "Supplier"}`, rightX + 8, y + 21, { width: colWidth - 16 });
    y += 52;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("DEPOT ADDRESS", leftX, y);
    y += 12;
    doc.roundedRect(leftX, y, contentWidth - 28, 24, 6).fillAndStroke("#f1f5f9", "#e2e8f0");
    doc.font("Helvetica").fontSize(9).fillColor("#0f172a").text(depotAddress || "Address not available", leftX + 8, y + 8, { width: contentWidth - 44 });
    y += 38;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("FUEL COLLECTION DETAILS", leftX, y);
    y += 12;
    doc.roundedRect(leftX, y, contentWidth - 28, 48, 6).fillAndStroke("#f8fafc", "#d1d5db");
    const sectionW = (contentWidth - 52) / 3;
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text("Fuel Type", leftX + 8, y + 8).text("Quantity", leftX + 8 + sectionW, y + 8).text("Price per Litre", leftX + 8 + sectionW * 2, y + 8);
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(fuelLabel, leftX + 8, y + 22).text(`${litres}L`, leftX + 8 + sectionW, y + 22).text(formatZar(pricePerLitre), leftX + 8 + sectionW * 2, y + 22);
    y += 62;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("PRICING BREAKDOWN", leftX, y);
    y += 12;
    doc.roundedRect(leftX, y, contentWidth - 28, 24, 6).fillAndStroke("#f1f5f9", "#e2e8f0");
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a").text(`Subtotal (${litres}L x ${formatZar(pricePerLitre)})`, leftX + 8, y + 8);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(formatZar(Number(totalZAR)), leftX, y + 8, { width: contentWidth - 44, align: "right" });
    y += 32;

    doc.roundedRect(leftX, y, contentWidth - 28, 32, 6).fillAndStroke("#f3f4f6", "#d1d5db");
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text("Total Amount", leftX + 8, y + 9);
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#0f172a").text(formatZar(Number(totalZAR)), leftX, y + 5, { width: contentWidth - 44, align: "right" });
    y += 46;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("ORDER DATE", leftX, y);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text("COMPLETED DATE", rightX, y);
    y += 12;
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a").text(createdAt || "N/A", leftX, y);
    doc.font("Helvetica").fontSize(10).fillColor("#0f172a").text(completedAt || "N/A", rightX, y);

    doc.end();
  } catch (e: any) {
    console.error("GET /invoices/:id/pdf error:", e);
    res.status(500).json({ error: e.message || "Failed to generate invoice" });
  }
});

// GET /api/supplier/invoice-templates – Enterprise only: list custom templates
router.get("/invoice-templates", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id, subscription_tier")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });
    if ((supplier as any).subscription_tier !== "enterprise") {
      return res.status(403).json({ error: "Custom invoice templates are available on Enterprise plan.", code: "SUBSCRIPTION_TIER_REQUIRED" });
    }
    const { data: list, error } = await drizzleClient
      .from("supplier_invoice_templates")
      .select("id, name, template_type, content, updated_at")
      .eq("supplier_id", supplier.id)
      .order("updated_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ templates: list || [] });
  } catch (e: any) {
    console.error("GET /invoice-templates error:", e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/supplier/invoice-templates – Enterprise only: create or update custom template
router.put("/invoice-templates", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { id, name, templateType, content } = req.body || {};
  try {
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id, subscription_tier")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });
    if ((supplier as any).subscription_tier !== "enterprise") {
      return res.status(403).json({ error: "Custom invoice templates are available on Enterprise plan.", code: "SUBSCRIPTION_TIER_REQUIRED" });
    }
    if (!name || !templateType || content === undefined) {
      return res.status(400).json({ error: "name, templateType, and content are required" });
    }
    if (id) {
      const { data: updated, error } = await drizzleClient
        .from("supplier_invoice_templates")
        .update({ name, template_type: templateType, content, updated_at: new Date() })
        .eq("id", id)
        .eq("supplier_id", supplier.id)
        .select("id")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(updated);
    }
    const { data: created, error } = await drizzleClient
      .from("supplier_invoice_templates")
      .insert({ supplier_id: supplier.id, name, template_type: templateType, content })
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(created);
  } catch (e: any) {
    console.error("PUT /invoice-templates error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============== SETTLEMENTS ==============

// GET /api/supplier/settlements – list settlements (period, amount, status)
router.get("/settlements", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  try {
    const { data: supplier, error: supplierErr } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (supplierErr || !supplier) return res.status(404).json({ error: "Supplier not found" });

    const { data: list, error } = await drizzleClient
      .from("supplier_settlements")
      .select("id, period_start, period_end, total_cents, status, settlement_type, paid_at, reference, created_at")
      .eq("supplier_id", supplier.id)
      .order("period_end", { ascending: false })
      .limit(100);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settlements: list || [] });
  } catch (e: any) {
    console.error("GET /settlements error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============== DRIVER DEPOT ORDERS ==============

// Get all driver depot orders for supplier's depots (optional ?depot_id= for multi-branch/Enterprise)
router.get("/driver-depot-orders", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const depotId = (req.query.depot_id as string) || undefined;

  try {
    if (!user || !user.id) {
      console.error("GET /driver-depot-orders: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id, subscription_tier")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier in /driver-depot-orders:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Get all depots for this supplier (id, name for branch selector and summary)
    const { data: depots, error: depotsError } = await drizzleClient
      .from("depots")
      .select("id, name")
      .eq("supplier_id", supplier.id)
      .order("name");

    if (depotsError) throw depotsError;

    if (!depots || depots.length === 0) {
      return res.json({ orders: [], depots: [], summaryByDepot: [] });
    }

    const depotIds = depots.map(d => d.id);
    if (depotId && !depotIds.includes(depotId)) {
      return res.status(400).json({ error: "Invalid depot_id for this supplier" });
    }
    // Optional filter by branch (Enterprise multi-branch)
    const filterDepotIds = depotId ? [depotId] : depotIds;

    // Get all driver depot orders for these depots.
    // Use direct SQL joins to guarantee driver/depot/fuel hydration (avoids partial nested relation results).
    const ordersResult = await pool.query(
      `SELECT o.*,
              json_build_object(
                'id', d.id,
                'name', d.name,
                'supplier_id', d.supplier_id,
                'address_street', d.address_street,
                'address_city', d.address_city,
                'address_province', d.address_province,
                'address_postal_code', d.address_postal_code,
                'suppliers', json_build_object(
                  'id', s.id,
                  'name', s.name,
                  'registered_name', s.registered_name,
                  'owner_id', s.owner_id
                )
              ) AS depots,
              json_build_object(
                'id', dr.id,
                'user_id', dr.user_id,
                'email', lau.email,
                'profile', json_build_object(
                  'id', p.id,
                  'full_name', COALESCE(NULLIF(p.full_name, ''), split_part(lau.email, '@', 1), 'Unknown Driver'),
                  'phone', p.phone
                )
              ) AS drivers,
              json_build_object(
                'id', ft.id,
                'label', COALESCE(ft.label, ft.code, 'Unknown'),
                'code', ft.code
              ) AS fuel_types
       FROM driver_depot_orders o
       INNER JOIN depots d ON d.id = o.depot_id
       INNER JOIN suppliers s ON s.id = d.supplier_id
       LEFT JOIN drivers dr ON dr.id = o.driver_id
       LEFT JOIN profiles p ON p.id = dr.user_id
       LEFT JOIN local_auth_users lau ON lau.id = dr.user_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       WHERE o.depot_id = ANY($1::uuid[])
       ORDER BY o.created_at DESC`,
      [filterDepotIds]
    );
    const orders = ordersResult.rows || [];

    // Per-depot summary (order count, total litres) for multi-branch dashboard
    const summaryByDepot = (depots || []).map((d: { id: string; name: string }) => {
      const depotOrders = (orders || []).filter((o: any) => o.depot_id === d.id);
      const totalLitres = depotOrders.reduce(
        (sum: number, o: any) => sum + (Number(o.actual_litres_delivered ?? o.litres ?? 0) || 0),
        0
      );
      return { depotId: d.id, depotName: d.name, orderCount: depotOrders.length, totalLitres };
    });

    // Orders are fully hydrated by SQL joins above.

    res.json({
      orders: orders || [],
      depots: depots || [],
      summaryByDepot,
      subscriptionTier: (supplier as any).subscription_tier,
    });
  } catch (error: any) {
    console.error("Error fetching driver depot orders:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// Helper function to verify order ownership
async function verifyOrderOwnership(orderId: string, supplierId: string) {
  const orderResult = await pool.query(
    `SELECT o.*,
            json_build_object('id', d.id, 'supplier_id', d.supplier_id, 'name', d.name) AS depots,
            json_build_object('id', dr.id, 'user_id', dr.user_id) AS drivers,
            json_build_object('id', ft.id, 'label', ft.label, 'code', ft.code) AS fuel_types
     FROM driver_depot_orders o
     JOIN depots d ON d.id = o.depot_id
     LEFT JOIN drivers dr ON dr.id = o.driver_id
     LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
     WHERE o.id = $1
     LIMIT 1`,
    [orderId]
  );
  const order = orderResult.rows[0] || null;

  if (!order) {
    return { error: "Order not found", order: null };
  }

  if (order.depots?.supplier_id !== supplierId) {
    return { error: "This order does not belong to your depot", order: null };
  }

  return { error: null, order };
}

// Accept driver depot order (moves from pending to pending_payment)
router.post("/driver-depot-orders/:orderId/accept", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only accept if status is pending
    if (order.status !== "pending") {
      return res.status(400).json({ error: `Cannot accept order with status: ${order.status}` });
    }

    // Update order to pending_payment
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        status: "pending_payment",
        payment_status: "pending_payment",
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_accepted",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      const pickupDate = updatedOrder.pickup_date || updatedOrder.created_at;
      
      await notificationService.notifyDriverDepotOrderAccepted(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        pickupDate
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error accepting driver depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject driver depot order
router.post("/driver-depot-orders/:orderId/reject", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { reason } = req.body;

  try {
    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only reject if status is pending
    if (order.status !== "pending") {
      return res.status(400).json({ error: `Cannot reject order with status: ${order.status}` });
    }

    // Update order to rejected
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        status: "rejected",
        updated_at: new Date(),
        notes: reason ? `${order.notes || ""}\n[Rejection reason: ${reason}]`.trim() : order.notes,
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_rejected",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        reason,
      });
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error rejecting driver depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Verify payment (for bank transfer - supplier confirms payment received)
router.post("/driver-depot-orders/:orderId/verify-payment", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only verify if payment_status is paid (driver uploaded proof)
    if (order.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment status must be 'paid' to verify. Current: ${order.payment_status}` });
    }
    
    // For online payments, they're already at ready_for_pickup - no need to verify
    if (order.payment_method === "online_payment") {
      return res.status(400).json({ error: "Online payments are automatically processed and do not require verification" });
    }
    
    // Check if payment proof exists (for bank transfers)
    if (order.payment_method === "bank_transfer" && !order.payment_proof_url) {
      return res.status(400).json({ error: "Payment proof is required for bank transfer verification" });
    }

    // Update payment status and order status - go directly to ready_for_pickup
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        payment_status: "payment_verified",
        status: "ready_for_pickup", // Go directly to ready for pickup, skip signatures
        payment_confirmed_at: new Date(),
        payment_confirmed_by: user.id,
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_payment_verified",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        message: "Payment confirmed. Order is ready for pickup.",
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      
      await notificationService.notifyDriverDepotPaymentVerified(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject payment (supplier marks payment as not received)
router.post("/driver-depot-orders/:orderId/reject-payment", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { reason } = req.body;

  try {
    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only reject if payment_status is paid (driver uploaded proof)
    if (order.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment status must be 'paid' to reject. Current: ${order.payment_status}` });
    }
    
    // Check if payment proof exists (for bank transfers)
    if (order.payment_method === "bank_transfer" && !order.payment_proof_url) {
      return res.status(400).json({ error: "Payment proof is required for bank transfer rejection" });
    }

    // Update payment status - reset to pending_payment so driver can pay again
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        payment_status: "payment_failed",
        status: "pending_payment",
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_payment_rejected",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        message: reason || "Payment not received. Please try again.",
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      
      await notificationService.notifyDriverDepotPaymentRejected(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        reason
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error rejecting payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add supplier signature (before fuel release)
router.post("/driver-depot-orders/:orderId/supplier-signature", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const signatureUrlRaw = (req.body as any)?.signatureUrl ?? (req.body as any)?.signature_url;

  try {
    let toStore: string;
    try {
      toStore = normalizeSignatureForStorage(signatureUrlRaw);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Invalid signature" });
    }

    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Check if payment is verified
    // For online payments, they're already processed and don't need verification
    // For other payment methods, payment must be verified
    if (order.payment_method !== "online_payment" && order.payment_method !== "pay_outside_app") {
      if (order.payment_status !== "payment_verified" && order.payment_status !== "paid") {
        return res.status(400).json({ error: "Payment must be verified before signing" });
      }
    }

    // Update supplier signature
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        supplier_signature_url: toStore,
        supplier_signed_at: new Date(),
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Check if both signatures are present - if so, move to ready_for_pickup
    // BUT: Skip this for online_payment - those orders should already be at ready_for_pickup
    // and should not require signatures before release
    if (updatedOrder.driver_signature_url && updatedOrder.supplier_signature_url && updatedOrder.payment_method !== "online_payment") {
      await drizzleClient
        .from("driver_depot_orders")
        .update({
          status: "ready_for_pickup",
          updated_at: new Date(),
        })
        .eq("id", orderId);
      
      updatedOrder.status = "ready_for_pickup";
    }

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_signed",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error adding supplier signature:", error);
    res.status(500).json({ error: error.message });
  }
});

// Release fuel (moves from ready_for_pickup to released)
router.post("/driver-depot-orders/:orderId/release", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    if (order.status !== "ready_for_pickup") {
      return res.status(400).json({ error: `Order must be ready_for_pickup to release. Current: ${order.status}` });
    }

    // Update order to awaiting_signature - driver needs to sign to complete
    // Using "awaiting_signature" (19 chars) instead of "awaiting_driver_signature" (25 chars) due to varchar(20) limit
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        status: "awaiting_signature",
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Reduce stock when fuel is released
    const orderLitres = parseFloat(order.litres || "0");
    const fuelTypeId = order.fuel_type_id;
    const depotId = order.depots?.id;

    if (depotId && fuelTypeId) {
      const { data: depotPrice } = await drizzleClient
        .from("depot_prices")
        .select("available_litres")
        .eq("depot_id", depotId)
        .eq("fuel_type_id", fuelTypeId)
        .single();

      if (depotPrice && depotPrice.available_litres !== null) {
        const currentStock = parseFloat(depotPrice.available_litres.toString());
        const newStock = Math.max(0, currentStock - orderLitres);

        await drizzleClient
          .from("depot_prices")
          .update({
            available_litres: newStock.toString(),
            updated_at: new Date(),
          })
          .eq("depot_id", depotId)
          .eq("fuel_type_id", fuelTypeId);
      }
    }

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_fuel_released",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      
      await notificationService.notifyDriverDepotOrderReleased(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error releasing fuel:", error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm delivery (supplier enters actual litres and driver signs)
router.post("/driver-depot-orders/:orderId/confirm-delivery", requireSupplierSubscription, async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { actualLitres } = req.body;

  try {
    // Get supplier ID
    const { data: suppliers, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only confirm if status is released
    if (order.status !== "released") {
      return res.status(400).json({ error: `Order must be released to confirm delivery. Current: ${order.status}` });
    }

    // Validate actual litres
    const actualLitresNum = actualLitres ? parseFloat(actualLitres) : null;
    if (actualLitresNum !== null && (isNaN(actualLitresNum) || actualLitresNum < 0)) {
      return res.status(400).json({ error: "Invalid actual litres value" });
    }

    // Update order with actual litres (driver signature will be added separately)
    const { data: updatedOrder, error: updateError } = await drizzleClient
      .from("driver_depot_orders")
      .update({
        actual_litres_delivered: actualLitresNum !== null ? actualLitresNum.toString() : null,
        updated_at: new Date(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver to sign for receipt
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_delivery_confirmed",
        orderId: updatedOrder.id,
        actualLitres: actualLitresNum,
      });
    }

    // Note: Supplier notification for order completion will be sent when driver confirms receipt
    // See driver-routes.ts confirm-receipt endpoint

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error confirming delivery:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============== DOCUMENTS ROUTES ==============

// Get supplier documents
router.get("/documents", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: documents, error } = await drizzleClient
      .from("documents")
      .select("*")
      .eq("owner_type", "supplier")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(documents || []);
  } catch (error: any) {
    console.error("Error fetching supplier documents:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create supplier document
router.post("/documents", async (req, res) => {
  const user = (req as any).user;
  
  if (!user || !user.id) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  const { owner_type, doc_type, title, file_path, file_size, mime_type, document_issue_date, expiry_date } = req.body;
  
  // Validate required fields
  if (!doc_type || !file_path) {
    return res.status(400).json({ error: "doc_type and file_path are required" });
  }
  
  try {
    // Insert document first
    const { data, error } = await drizzleClient
      .from("documents")
      .insert({
        owner_type: owner_type || "supplier",
        owner_id: user.id,
        doc_type,
        title: title || doc_type,
        file_path,
        file_size: file_size || null,
        mime_type: mime_type || null,
        document_issue_date: document_issue_date || null,
        expiry_date: expiry_date || null,
        uploaded_by: user.id,
      })
      .select()
      .single();
    
    if (error) {
      console.error("[supplier/documents] Database error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to create document",
        code: error.code 
      });
    }

    if (!data) {
      return res.status(500).json({ error: "Document created but no data returned" });
    }

    // Send notifications asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const { notificationService } = await import("./notification-service");
        
        // Fetch admin profiles and supplier data in parallel
        const [adminProfilesResult, supplierProfileResult, supplierResult] = await Promise.all([
          drizzleClient
            .from("profiles")
            .select("id")
            .eq("role", "admin"),
          drizzleClient
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle(),
          drizzleClient
            .from("suppliers")
            .select("id, kyb_status, status, compliance_status")
            .eq("owner_id", user.id)
            .maybeSingle()
        ]);
        
        // Check for errors in parallel queries
        if (adminProfilesResult.error) {
          console.error("[supplier/documents] Error fetching admin profiles:", adminProfilesResult.error);
        }
        if (supplierProfileResult.error) {
          console.error("[supplier/documents] Error fetching supplier profile:", supplierProfileResult.error);
        }
        if (supplierResult.error) {
          console.error("[supplier/documents] Error fetching supplier:", supplierResult.error);
        }
        
        const adminProfiles = adminProfilesResult.data;
        const supplierProfile = supplierProfileResult.data;
        const supplier = supplierResult.data;
        
        if (adminProfiles && adminProfiles.length > 0) {
          const adminUserIds = adminProfiles.map(p => p.id);
          const ownerName = supplierProfile?.full_name || "Supplier";
          
          // Send document upload notification
          await notificationService.notifyAdminDocumentUploaded(
            adminUserIds,
            data.id,
            doc_type,
            "supplier",
            ownerName,
            user.id
          ).catch(err => console.error("[supplier/documents] Notification error:", err));

          // Check if supplier was rejected - if so, reset to pending for resubmission
          if (supplier && (supplier.kyb_status === "rejected" || supplier.status === "rejected" || supplier.compliance_status === "rejected")) {
            try {
              console.log(`[KYB Resubmission] Supplier ${supplier.id} was rejected, resetting to pending status after document upload`);
              
              // Update supplier status
              const { error: supplierUpdateError } = await drizzleClient
                .from("suppliers")
                .update({
                  kyb_status: "pending",
                  status: "pending_compliance",
                  compliance_status: "pending",
                  compliance_rejection_reason: null,
                  updated_at: new Date()
                })
                .eq("id", supplier.id);
              
              if (supplierUpdateError) {
                console.error(`[KYB Resubmission] Error updating supplier ${supplier.id} status:`, supplierUpdateError);
                throw supplierUpdateError;
              }
              
              // Also update profile approval status
              const { error: profileUpdateError } = await drizzleClient
                .from("profiles")
                .update({ 
                  approval_status: "pending",
                  updated_at: new Date()
                })
                .eq("id", user.id);
              
              if (profileUpdateError) {
                console.error(`[KYB Resubmission] Error updating profile for supplier ${supplier.id}:`, profileUpdateError);
                // Continue with notifications even if profile update fails
              }
              
              // Notify admins that supplier has resubmitted KYB
              try {
                await notificationService.notifyAdminKycSubmitted(
                  adminUserIds,
                  user.id,
                  ownerName,
                  "supplier"
                );
              } catch (notifyError) {
                console.error("[KYB Resubmission] Error notifying admins:", notifyError);
              }
              
              // Broadcast resubmission to admins via WebSocket
              try {
                const { websocketService } = await import("./websocket");
                websocketService.broadcastToRole("admin", {
                  type: "kyc_submitted",
                  payload: {
                    supplierId: supplier.id,
                    userId: user.id,
                    type: "supplier",
                    isResubmission: true
                  },
                });
              } catch (wsError) {
                console.error("[KYB Resubmission] Error broadcasting WebSocket message:", wsError);
              }
              
              // Notify supplier that resubmission was received
              try {
                await notificationService.createNotification({
                  user_id: user.id,
                  type: "account_verification_required",
                  title: "KYB Resubmission Received",
                  message: "Your KYB resubmission has been received and is under review. You will be notified once it's been reviewed.",
                  metadata: { supplierId: supplier.id, type: "kyb_resubmission" }
                });
              } catch (supplierNotifError) {
                console.error("[KYB Resubmission] Error notifying supplier:", supplierNotifError);
              }
            } catch (resubmissionError) {
              console.error(`[KYB Resubmission] Error in resubmission flow for supplier ${supplier.id}:`, resubmissionError);
              // Don't fail the document upload if resubmission logic fails
            }
          } else if (supplier && (supplier.kyb_status === "pending" || supplier.status === "pending_compliance")) {
            // Check if this is the first document (new KYC submission)
            const { data: existingDocs } = await drizzleClient
              .from("documents")
              .select("id")
              .eq("owner_type", "supplier")
              .eq("owner_id", user.id)
              .neq("id", data.id)
              .limit(1);
            
            if (!existingDocs || existingDocs.length === 0) {
              await notificationService.notifyAdminKycSubmitted(
                adminUserIds,
                user.id,
                ownerName,
                "supplier"
              ).catch(err => console.error("[supplier/documents] KYC notification error:", err));
            }
          }
        }
      } catch (notifError) {
        console.error("[supplier/documents] Error in notification handler:", notifError);
        // Don't fail the upload if notification fails
      }
    });

    res.json(data);
  } catch (error: any) {
    console.error("[supplier/documents] Unexpected error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// ============== COMPLIANCE ROUTES ==============

// Get supplier compliance status
router.get("/compliance/status", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get supplier ID
    const { data: supplier, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const complianceStatus = await getSupplierComplianceStatus(supplier.id);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting supplier compliance status:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update supplier compliance information
router.put("/compliance", async (req, res) => {
  const user = (req as any).user;
  
  try {
    console.log("PUT /compliance - Request body:", JSON.stringify(req.body, null, 2));
    
    // Get supplier ID and current status
    const { data: supplier, error: supplierError } = await drizzleClient
      .from("suppliers")
      .select("id, kyb_status, status, compliance_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (supplierError || !supplier) {
      console.error("Supplier not found:", { supplierError, supplier, userId: user.id });
      return res.status(404).json({ error: "Supplier not found" });
    }

    console.log("Found supplier:", supplier.id);

    // Check if supplier was rejected - if so, reset to pending for resubmission
    if (supplier.kyb_status === "rejected" || supplier.status === "rejected" || supplier.compliance_status === "rejected") {
      try {
        console.log(`[KYB Resubmission] Supplier ${supplier.id} was rejected, resetting to pending status for resubmission`);
        
        // Update supplier status to pending (will be included in the main update)
        updateData.kyb_status = "pending";
        updateData.status = "pending_compliance";
        updateData.compliance_status = "pending";
        updateData.compliance_rejection_reason = null;
        
        // Also update profile approval status
        const { error: profileUpdateError } = await drizzleClient
          .from("profiles")
          .update({ 
            approval_status: "pending",
            updated_at: new Date()
          })
          .eq("id", user.id);
        
        if (profileUpdateError) {
          console.error(`[KYB Resubmission] Error updating profile for supplier ${supplier.id}:`, profileUpdateError);
          // Continue with supplier update even if profile update fails
        }
      } catch (resubmissionError) {
        console.error(`[KYB Resubmission] Error resetting supplier ${supplier.id} status:`, resubmissionError);
        // Continue with the main update - don't fail the entire request
      }
    }

    // Extract all fields from request body
    const bodyFields = req.body;
    
    // Helper function to check if a value should be included in update
    const shouldInclude = (value: any): boolean => {
      if (value === undefined) return false;
      if (value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    };

    // Extract fields - map frontend names to database columns
    const {
      // Note: company_name maps to registered_name in database, but we'll handle it separately
      registration_number,
      director_names,
      registered_address,
      vat_number,
      vat_certificate_expiry,
      tax_clearance_number,
      tax_clearance_expiry,
      wholesale_license_number,
      wholesale_license_issue_date,
      wholesale_license_expiry_date,
      allowed_fuel_types,
      site_license_number,
      depot_address,
      permit_number,
      permit_expiry_date,
      environmental_auth_number,
      approved_storage_capacity_litres,
      fire_certificate_number,
      fire_certificate_issue_date,
      fire_certificate_expiry_date,
      hse_file_verified,
      hse_file_last_updated,
      spill_compliance_confirmed,
      sabs_certificate_number,
      sabs_certificate_issue_date,
      sabs_certificate_expiry_date,
      calibration_certificate_number,
      calibration_certificate_issue_date,
      calibration_certificate_expiry_date,
      public_liability_policy_number,
      public_liability_insurance_provider,
      public_liability_coverage_amount_rands,
      public_liability_policy_expiry_date,
      env_insurance_number,
      env_insurance_expiry_date,
    } = bodyFields;

    const updateData: any = {};
    
    // Process each field - only include non-null, non-empty values
    // Map company_name to registered_name (database column name)
    if (shouldInclude(bodyFields.company_name)) updateData.registered_name = bodyFields.company_name;
    if (shouldInclude(registration_number)) updateData.registration_number = registration_number;
    if (director_names !== undefined) {
      if (director_names === "" || director_names === null) {
        // Don't include - skip updating this field
      } else if (Array.isArray(director_names) && director_names.length > 0) {
        updateData.director_names = director_names;
      } else if (typeof director_names === 'string') {
        try {
          const parsed = JSON.parse(director_names);
          if (Array.isArray(parsed) && parsed.length > 0) {
            updateData.director_names = parsed;
          }
        } catch {
          // If it's a string, convert to array if not empty
          if (director_names.trim() !== '') {
            updateData.director_names = [director_names];
          }
        }
      }
    }
    if (shouldInclude(registered_address)) updateData.registered_address = registered_address;
    if (shouldInclude(vat_number)) updateData.vat_number = vat_number;
    if (shouldInclude(vat_certificate_expiry)) updateData.vat_certificate_expiry = vat_certificate_expiry;
    if (shouldInclude(tax_clearance_number)) updateData.tax_clearance_number = tax_clearance_number;
    if (shouldInclude(tax_clearance_expiry)) updateData.tax_clearance_expiry = tax_clearance_expiry;
    // Map wholesale_license_number to dmre_license_number (database column name)
    if (shouldInclude(wholesale_license_number)) updateData.dmre_license_number = wholesale_license_number;
    if (shouldInclude(wholesale_license_issue_date)) updateData.wholesale_license_issue_date = wholesale_license_issue_date;
    // Map wholesale_license_expiry_date to dmre_license_expiry (database column name)
    if (shouldInclude(wholesale_license_expiry_date)) updateData.dmre_license_expiry = wholesale_license_expiry_date;
    if (allowed_fuel_types !== undefined) {
      if (allowed_fuel_types === "" || allowed_fuel_types === null) {
        // Don't include - skip updating this field
      } else if (Array.isArray(allowed_fuel_types) && allowed_fuel_types.length > 0) {
        updateData.allowed_fuel_types = allowed_fuel_types;
      } else if (typeof allowed_fuel_types === 'string') {
        try {
          const parsed = JSON.parse(allowed_fuel_types);
          if (Array.isArray(parsed) && parsed.length > 0) {
            updateData.allowed_fuel_types = parsed;
          }
        } catch {
          if (allowed_fuel_types.trim() !== '') {
            updateData.allowed_fuel_types = [allowed_fuel_types];
          }
        }
      }
    }
    if (shouldInclude(site_license_number)) updateData.site_license_number = site_license_number;
    if (shouldInclude(depot_address)) updateData.depot_address = depot_address;
    if (shouldInclude(permit_number)) updateData.permit_number = permit_number;
    if (shouldInclude(permit_expiry_date)) updateData.permit_expiry_date = permit_expiry_date;
    if (shouldInclude(environmental_auth_number)) updateData.environmental_auth_number = environmental_auth_number;
    if (approved_storage_capacity_litres !== undefined && approved_storage_capacity_litres !== null && approved_storage_capacity_litres !== '') {
      const parsed = typeof approved_storage_capacity_litres === 'number' ? approved_storage_capacity_litres : parseInt(approved_storage_capacity_litres);
      if (!isNaN(parsed)) {
        updateData.approved_storage_capacity_litres = parsed;
      }
    }
    if (shouldInclude(fire_certificate_number)) updateData.fire_certificate_number = fire_certificate_number;
    if (shouldInclude(fire_certificate_issue_date)) updateData.fire_certificate_issue_date = fire_certificate_issue_date;
    if (shouldInclude(fire_certificate_expiry_date)) updateData.fire_certificate_expiry_date = fire_certificate_expiry_date;
    if (hse_file_verified !== undefined) updateData.hse_file_verified = Boolean(hse_file_verified);
    if (shouldInclude(hse_file_last_updated)) updateData.hse_file_last_updated = hse_file_last_updated;
    if (spill_compliance_confirmed !== undefined) updateData.spill_compliance_confirmed = Boolean(spill_compliance_confirmed);
    if (shouldInclude(sabs_certificate_number)) updateData.sabs_certificate_number = sabs_certificate_number;
    if (shouldInclude(sabs_certificate_issue_date)) updateData.sabs_certificate_issue_date = sabs_certificate_issue_date;
    if (shouldInclude(sabs_certificate_expiry_date)) updateData.sabs_certificate_expiry_date = sabs_certificate_expiry_date;
    if (shouldInclude(calibration_certificate_number)) updateData.calibration_certificate_number = calibration_certificate_number;
    if (shouldInclude(calibration_certificate_issue_date)) updateData.calibration_certificate_issue_date = calibration_certificate_issue_date;
    if (shouldInclude(calibration_certificate_expiry_date)) updateData.calibration_certificate_expiry_date = calibration_certificate_expiry_date;
    if (shouldInclude(public_liability_policy_number)) updateData.public_liability_policy_number = public_liability_policy_number;
    if (shouldInclude(public_liability_insurance_provider)) updateData.public_liability_insurance_provider = public_liability_insurance_provider;
    if (public_liability_coverage_amount_rands !== undefined && public_liability_coverage_amount_rands !== null && public_liability_coverage_amount_rands !== '') {
      const parsed = typeof public_liability_coverage_amount_rands === 'number' ? public_liability_coverage_amount_rands : parseInt(public_liability_coverage_amount_rands);
      if (!isNaN(parsed)) {
        updateData.public_liability_coverage_amount_rands = parsed;
      }
    }
    if (shouldInclude(public_liability_policy_expiry_date)) updateData.public_liability_policy_expiry_date = public_liability_policy_expiry_date;
    if (shouldInclude(env_insurance_number)) updateData.env_insurance_number = env_insurance_number;
    if (shouldInclude(env_insurance_expiry_date)) updateData.env_insurance_expiry_date = env_insurance_expiry_date;

    // Only proceed if we have fields to update
    if (Object.keys(updateData).length === 0) {
      return res.json({ message: "No fields to update", supplier });
    }

    updateData.updated_at = new Date();

    console.log("Update data:", JSON.stringify(updateData, null, 2));

    const { data: updatedSupplier, error: updateError } = await drizzleClient
      .from("suppliers")
      .update(updateData)
      .eq("id", supplier.id)
      .select()
      .single();

    // If supplier was rejected and we reset to pending, notify admins
    if (supplier.kyb_status === "rejected" || supplier.status === "rejected" || supplier.compliance_status === "rejected") {
      try {
        const { notificationService } = await import("./notification-service");
        const { websocketService } = await import("./websocket");
        
        // Get admin user IDs
        const { data: adminProfiles, error: adminProfilesError } = await drizzleClient
          .from("profiles")
          .select("id")
          .eq("role", "admin");
        
        if (adminProfilesError) {
          console.error("[KYB Resubmission] Error fetching admin profiles:", adminProfilesError);
        } else if (adminProfiles && adminProfiles.length > 0) {
          const adminUserIds = adminProfiles.map(p => p.id);
          
          // Get supplier name
          const { data: supplierProfile, error: profileError } = await drizzleClient
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          
          if (profileError) {
            console.error("[KYB Resubmission] Error fetching supplier profile:", profileError);
          }
          
          const userName = supplierProfile?.full_name || "Supplier";
          
          // Notify admins that supplier has resubmitted KYB
          try {
            await notificationService.notifyAdminKycSubmitted(
              adminUserIds,
              user.id,
              userName,
              "supplier"
            );
          } catch (notifyError) {
            console.error("[KYB Resubmission] Error notifying admins:", notifyError);
          }
          
          // Broadcast resubmission to admins via WebSocket
          try {
            websocketService.broadcastToRole("admin", {
              type: "kyc_submitted",
              payload: {
                supplierId: supplier.id,
                userId: user.id,
                type: "supplier",
                isResubmission: true
              },
            });
          } catch (wsError) {
            console.error("[KYB Resubmission] Error broadcasting WebSocket message:", wsError);
          }
        }
        
        // Notify supplier that resubmission was received
        try {
          const { notificationService: notifService } = await import("./notification-service");
          await notifService.createNotification({
            user_id: user.id,
            type: "account_verification_required",
            title: "KYB Resubmission Received",
            message: "Your KYB resubmission has been received and is under review. You will be notified once it's been reviewed.",
            metadata: { supplierId: supplier.id, type: "kyb_resubmission" }
          });
        } catch (supplierNotifError) {
          console.error("[KYB Resubmission] Error notifying supplier:", supplierNotifError);
        }
      } catch (notifError) {
        console.error("[KYB Resubmission] Error in notification flow:", notifError);
        // Don't fail the update if notification fails
      }
    }

    if (updateError) {
      console.error("Database update error:", updateError);
      
      // Check if it's a schema cache error or column not found error
      const isColumnError = updateError.message?.includes("Could not find") || 
                           updateError.message?.includes("schema cache") || 
                           updateError.code === '42703' ||
                           updateError.message?.includes("column");
      
      if (isColumnError) {
        console.error("Schema/column error:", updateError.message);
        console.error("Attempted to update fields:", Object.keys(updateData));
        
        // Try to identify which column is missing
        const missingColumnMatch = updateError.message?.match(/Could not find the '(\w+)' column/);
        const missingColumn = missingColumnMatch ? missingColumnMatch[1] : 'unknown';
        
        // Remove the problematic column and try again
        const cleanedUpdateData = { ...updateData };
        delete cleanedUpdateData[missingColumn];
        delete cleanedUpdateData.updated_at;
        
        if (Object.keys(cleanedUpdateData).length > 0) {
          cleanedUpdateData.updated_at = new Date();
          console.log(`Removed problematic column '${missingColumn}' and retrying with remaining fields...`);
          
          // Retry without the problematic column
          const retryResult = await drizzleClient
            .from("suppliers")
            .update(cleanedUpdateData)
            .eq("id", supplier.id)
            .select()
            .single();
          
          if (retryResult.error) {
            return res.status(500).json({ 
              error: `Database column '${missingColumn}' not found in suppliers table.`,
              details: updateError.message,
              hint: `Please add the '${missingColumn}' column to the suppliers table or refresh schema metadata by running: NOTIFY pgrst, 'reload schema'; in your PostgreSQL SQL tool.`,
              attemptedFields: Object.keys(updateData),
              skippedField: missingColumn
            });
          }
          
          return res.json({ 
            ...retryResult.data,
            warning: `Field '${missingColumn}' was skipped because it doesn't exist in the database.`
          });
        } else {
          return res.status(500).json({ 
            error: `Database column '${missingColumn}' not found and no other fields to update.`,
            details: updateError.message,
            hint: `Please add the '${missingColumn}' column to the suppliers table or refresh the schema cache.`
          });
        }
      }
      
      throw updateError;
    }

    console.log("Update successful:", updatedSupplier?.id);

    res.json(updatedSupplier);
  } catch (error: any) {
    console.error("Error updating supplier compliance:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: error.message || "Failed to update compliance information",
      code: error.code,
      details: error.details,
      hint: error.hint
    });
  }
});

export default router;

