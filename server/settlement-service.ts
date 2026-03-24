/**
 * Supplier settlement job: groups completed driver_depot_orders by supplier,
 * creates supplier_settlements (next_day for Standard, same_day for Enterprise).
 */

import { supabaseAdmin } from "./supabase";

export async function runSupplierSettlementsJob(): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  try {
    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from("driver_depot_orders")
      .select("id, depot_id, total_price_cents, completed_at, settlement_id")
      .eq("status", "completed")
      .is("settlement_id", null);

    if (ordersErr) {
      errors.push(ordersErr.message);
      return { created: 0, errors };
    }
    const orderList = (orders || []).filter((o: any) => o.completed_at != null);
    if (orderList.length === 0) return { created: 0, errors };

    const depotIds = [...new Set(orderList.map((o: any) => o.depot_id))];
    const { data: depots } = await supabaseAdmin
      .from("depots")
      .select("id, supplier_id")
      .in("id", depotIds);
    const depotToSupplier = new Map((depots || []).map((d: any) => [d.id, d.supplier_id]));

    const supplierIds = [...new Set(orderList.map((o: any) => depotToSupplier.get(o.depot_id)).filter(Boolean))];
    const { data: suppliers } = await supabaseAdmin
      .from("suppliers")
      .select("id, subscription_tier")
      .in("id", supplierIds);
    const supplierTier = new Map((suppliers || []).map((s: any) => [s.id, s.subscription_tier]));

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
        const { data: settlement, error: insErr } = await supabaseAdmin
          .from("supplier_settlements")
          .insert({
            supplier_id: supplierId,
            period_start: startOfToday.toISOString(),
            period_end: now.toISOString(),
            total_cents: totalCents,
            status: "pending",
            settlement_type: "same_day",
            reference: `SDL-${supplierId.slice(0, 8)}-${Date.now()}`,
          })
          .select("id")
          .single();
        if (insErr) {
          errors.push(`supplier ${supplierId}: ${insErr.message}`);
          continue;
        }
        await supabaseAdmin
          .from("driver_depot_orders")
          .update({ settlement_id: settlement.id })
          .in("id", todayOrders.map((o: any) => o.id));
        created++;
      } else {
        const yesterdayOrders = orderList.filter((o: any) => {
          const sid = depotToSupplier.get(o.depot_id);
          const completed = new Date(o.completed_at);
          return sid === supplierId && completed >= startOfYesterday && completed <= endOfYesterday;
        });
        if (yesterdayOrders.length === 0) continue;
        const totalCents = yesterdayOrders.reduce((s: number, o: any) => s + (Number(o.total_price_cents) || 0), 0);
        const { data: settlement, error: insErr } = await supabaseAdmin
          .from("supplier_settlements")
          .insert({
            supplier_id: supplierId,
            period_start: startOfYesterday.toISOString(),
            period_end: endOfYesterday.toISOString(),
            total_cents: totalCents,
            status: "pending",
            settlement_type: "next_day",
            reference: `NDL-${supplierId.slice(0, 8)}-${Date.now()}`,
          })
          .select("id")
          .single();
        if (insErr) {
          errors.push(`supplier ${supplierId}: ${insErr.message}`);
          continue;
        }
        await supabaseAdmin
          .from("driver_depot_orders")
          .update({ settlement_id: settlement.id })
          .in("id", yesterdayOrders.map((o: any) => o.id));
        created++;
      }
    }
  } catch (e: any) {
    errors.push(e.message || "runSupplierSettlementsJob failed");
  }
  return { created, errors };
}
