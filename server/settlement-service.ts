/**
 * Supplier settlement job: groups completed driver_depot_orders by supplier,
 * creates supplier_settlements (next_day for Standard, same_day for Enterprise).
 */

import { db } from "./db";
import { depots, driverDepotOrders, supplierSettlements, suppliers } from "@shared/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function runSupplierSettlementsJob(): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  try {
    const orders = await db
      .select({
        id: driverDepotOrders.id,
        depot_id: driverDepotOrders.depotId,
        total_price_cents: driverDepotOrders.totalPriceCents,
        completed_at: driverDepotOrders.completedAt,
      })
      .from(driverDepotOrders)
      .where(and(eq(driverDepotOrders.status, "completed"), isNull(driverDepotOrders.settlementId)));
    const orderList = (orders || []).filter((o: any) => o.completed_at != null);
    if (orderList.length === 0) return { created: 0, errors };

    const depotIds = [...new Set(orderList.map((o: any) => o.depot_id))];
    const depotsRows = await db
      .select({ id: depots.id, supplier_id: depots.supplierId })
      .from(depots)
      .where(inArray(depots.id, depotIds));
    const depotToSupplier = new Map((depotsRows || []).map((d: any) => [d.id, d.supplier_id]));

    const supplierIds = [...new Set(orderList.map((o: any) => depotToSupplier.get(o.depot_id)).filter(Boolean))];
    const suppliersRows = await db
      .select({ id: suppliers.id, subscription_tier: suppliers.subscriptionTier })
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIds as string[]));
    const supplierTier = new Map((suppliersRows || []).map((s: any) => [s.id, s.subscription_tier]));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const endOfYesterday = new Date(startOfToday.getTime() - 1);

    for (const supplierId of supplierIds) {
      const tier = supplierTier.get(supplierId) || "standard";
      const isEnterprise = tier === "enterprise";

      if (isEnterprise) {
        const todayOrders = orderList.filter((o: any) => {
          const sid = depotToSupplier.get(o.depot_id);
          return sid === supplierId && new Date(o.completed_at) >= startOfToday;
        });
        if (todayOrders.length === 0) continue;
        const totalCents = todayOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
        const inserted = await db
          .insert(supplierSettlements)
          .values({
            supplierId: supplierId as string,
            periodStart: startOfToday,
            periodEnd: now,
            totalCents,
            status: "pending",
            settlementType: "same_day",
            reference: `SDL-${String(supplierId).slice(0, 8)}-${Date.now()}`,
          })
          .returning({ id: supplierSettlements.id });
        const settlement = inserted[0];
        if (!settlement) {
          errors.push(`supplier ${supplierId}: failed to create settlement`);
          continue;
        }
        await db
          .update(driverDepotOrders)
          .set({ settlementId: settlement.id })
          .where(inArray(driverDepotOrders.id, todayOrders.map((o: any) => o.id)));
        created++;
      } else {
        const yesterdayOrders = orderList.filter((o: any) => {
          const sid = depotToSupplier.get(o.depot_id);
          const completed = new Date(o.completed_at);
          return sid === supplierId && completed >= startOfYesterday && completed <= endOfYesterday;
        });
        if (yesterdayOrders.length === 0) continue;
        const totalCents = yesterdayOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
        const inserted = await db
          .insert(supplierSettlements)
          .values({
            supplierId: supplierId as string,
            periodStart: startOfYesterday,
            periodEnd: endOfYesterday,
            totalCents,
            status: "pending",
            settlementType: "next_day",
            reference: `NDL-${String(supplierId).slice(0, 8)}-${Date.now()}`,
          })
          .returning({ id: supplierSettlements.id });
        const settlement = inserted[0];
        if (!settlement) {
          errors.push(`supplier ${supplierId}: failed to create settlement`);
          continue;
        }
        await db
          .update(driverDepotOrders)
          .set({ settlementId: settlement.id })
          .where(inArray(driverDepotOrders.id, yesterdayOrders.map((o: any) => o.id)));
        created++;
      }
    }
  } catch (e: any) {
    errors.push(e.message || "runSupplierSettlementsJob failed");
  }
  return { created, errors };
}
