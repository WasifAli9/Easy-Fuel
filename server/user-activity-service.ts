import { pool } from "./db";

export type UserActivityEntry = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  occurredAt: string;
};

function push(
  out: UserActivityEntry[],
  row: {
    id: string;
    kind: string;
    title: string;
    detail: string;
    occurred_at: Date | string | null;
  },
) {
  if (!row.occurred_at) return;
  const at = row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at);
  out.push({
    id: row.id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    occurredAt: at,
  });
}

function orderDetail(litres: unknown, fuel: string | null, state: string | null, cents: number | null) {
  const parts = [
    fuel || "Fuel order",
    litres != null ? `${litres}L` : null,
    state ? `Status: ${state}` : null,
    cents != null ? `R${(Number(cents) / 100).toFixed(2)}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Delivery order";
}

export async function getUserActivityLog(userId: string, role: string): Promise<UserActivityEntry[]> {
  const entries: UserActivityEntry[] = [];
  const limit = 80;

  const profileRes = await pool.query(
    `SELECT created_at FROM profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (profileRes.rows[0]?.created_at) {
    push(entries, {
      id: `profile_${userId}_registered`,
      kind: "account_registered",
      title: "Account registered",
      detail: "User joined the platform",
      occurred_at: profileRes.rows[0].created_at,
    });
  }

  if (role === "customer") {
    const r = await pool.query(
      `SELECT o.id, o.state, o.litres, o.total_cents, o.created_at, o.paid_at, o.delivered_at, o.updated_at,
              COALESCE(ft.label, ft.code) AS fuel_name
       FROM orders o
       INNER JOIN customers c ON c.id = o.customer_id
       LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
       WHERE c.user_id = $1
       ORDER BY o.created_at DESC NULLS LAST
       LIMIT $2`,
      [userId, limit],
    );
    for (const o of r.rows) {
      push(entries, {
        id: `order_${o.id}_placed`,
        kind: "order_placed",
        title: "New order placed",
        detail: orderDetail(o.litres, o.fuel_name, o.state, o.total_cents),
        occurred_at: o.created_at,
      });
      if (o.paid_at) {
        push(entries, {
          id: `order_${o.id}_paid`,
          kind: "order_paid",
          title: "Order payment received",
          detail: orderDetail(o.litres, o.fuel_name, o.state, o.total_cents),
          occurred_at: o.paid_at,
        });
      }
      if (o.delivered_at) {
        push(entries, {
          id: `order_${o.id}_delivered`,
          kind: "order_completed",
          title: "Order delivered",
          detail: orderDetail(o.litres, o.fuel_name, "delivered", o.total_cents),
          occurred_at: o.delivered_at,
        });
      } else if (o.state === "delivered" && o.updated_at) {
        push(entries, {
          id: `order_${o.id}_delivered_state`,
          kind: "order_completed",
          title: "Order marked delivered",
          detail: orderDetail(o.litres, o.fuel_name, o.state, o.total_cents),
          occurred_at: o.updated_at,
        });
      }
    }
  }

  if (role === "driver") {
    const driverRes = await pool.query(`SELECT id FROM drivers WHERE user_id = $1 LIMIT 1`, [userId]);
    const driverId = driverRes.rows[0]?.id;
    if (driverId) {
      const vehicles = await pool.query(
        `SELECT id, registration_number, vehicle_status, company_id, created_at
         FROM vehicles WHERE driver_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [driverId, limit],
      );
      for (const v of vehicles.rows) {
        const isFleet = !!v.company_id;
        push(entries, {
          id: `vehicle_${v.id}_added`,
          kind: isFleet ? "fleet_vehicle_claimed" : "vehicle_added",
          title: isFleet ? "Company vehicle claimed" : "Vehicle added",
          detail: `${v.registration_number || "Vehicle"} · ${v.vehicle_status || "pending_compliance"}`,
          occurred_at: v.created_at,
        });
      }

      const orders = await pool.query(
        `SELECT o.id, o.state, o.litres, o.total_cents, o.created_at, o.paid_at, o.delivered_at, o.updated_at,
                o.fleet_company_id, COALESCE(ft.label, ft.code) AS fuel_name
         FROM orders o
         LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
         WHERE o.assigned_driver_id = $1
         ORDER BY COALESCE(o.delivered_at, o.updated_at, o.created_at) DESC NULLS LAST
         LIMIT $2`,
        [driverId, limit],
      );
      for (const o of orders.rows) {
        push(entries, {
          id: `driver_order_${o.id}_assigned`,
          kind: "order_assigned",
          title: o.fleet_company_id ? "Fleet delivery assigned" : "Delivery assigned",
          detail: orderDetail(o.litres, o.fuel_name, o.state, o.total_cents),
          occurred_at: o.created_at,
        });
        if (o.delivered_at) {
          push(entries, {
            id: `driver_order_${o.id}_completed`,
            kind: "order_completed",
            title: "Delivery completed",
            detail: orderDetail(o.litres, o.fuel_name, "delivered", o.total_cents),
            occurred_at: o.delivered_at,
          });
        }
      }

      const depotOrders = await pool.query(
        `SELECT ddo.id, ddo.status, ddo.litres, ddo.total_price_cents, ddo.created_at, ddo.completed_at,
                ddo.payment_confirmed_at, dep.name AS depot_name
         FROM driver_depot_orders ddo
         LEFT JOIN depots dep ON dep.id = ddo.depot_id
         WHERE ddo.driver_id = $1
         ORDER BY ddo.created_at DESC NULLS LAST
         LIMIT $2`,
        [driverId, limit],
      );
      for (const d of depotOrders.rows) {
        push(entries, {
          id: `depot_order_${d.id}_created`,
          kind: "depot_order_created",
          title: "Depot fuel order placed",
          detail: `${d.depot_name || "Depot"} · ${d.litres}L · ${d.status || "pending"}`,
          occurred_at: d.created_at,
        });
        if (d.payment_confirmed_at) {
          push(entries, {
            id: `depot_order_${d.id}_paid`,
            kind: "depot_order_paid",
            title: "Depot order payment confirmed",
            detail: `${d.depot_name || "Depot"} · R${((d.total_price_cents || 0) / 100).toFixed(2)}`,
            occurred_at: d.payment_confirmed_at,
          });
        }
        if (d.completed_at) {
          push(entries, {
            id: `depot_order_${d.id}_completed`,
            kind: "depot_order_completed",
            title: "Depot order completed",
            detail: `${d.depot_name || "Depot"} · ${d.litres}L`,
            occurred_at: d.completed_at,
          });
        }
      }

      const membership = await pool.query(
        `SELECT m.applied_at, m.reviewed_at, m.membership_status::text AS membership_status,
                c.name AS company_name, m.rejection_reason
         FROM driver_company_memberships m
         LEFT JOIN companies c ON c.id = m.company_id
         WHERE m.driver_id = $1`,
        [driverId],
      );
      const mem = membership.rows[0];
      if (mem?.applied_at) {
        push(entries, {
          id: `fleet_apply_${driverId}`,
          kind: "fleet_application",
          title: "Applied to fleet company",
          detail: mem.company_name || "Fleet company",
          occurred_at: mem.applied_at,
        });
      }
      if (mem?.reviewed_at && mem.membership_status === "approved") {
        push(entries, {
          id: `fleet_approved_${driverId}`,
          kind: "fleet_approved",
          title: "Fleet application approved",
          detail: mem.company_name || "Fleet company",
          occurred_at: mem.reviewed_at,
        });
      }
      if (mem?.reviewed_at && mem.membership_status === "rejected") {
        push(entries, {
          id: `fleet_rejected_${driverId}`,
          kind: "fleet_rejected",
          title: "Fleet application declined",
          detail: mem.rejection_reason || mem.company_name || "Fleet company",
          occurred_at: mem.reviewed_at,
        });
      }

      const docs = await pool.query(
        `SELECT id, doc_type, title, verification_status, created_at
         FROM documents WHERE owner_type = 'driver' AND owner_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [driverId],
      );
      for (const doc of docs.rows) {
        push(entries, {
          id: `doc_${doc.id}`,
          kind: "document_uploaded",
          title: "Document uploaded",
          detail: `${doc.title || doc.doc_type} · ${doc.verification_status || "pending"}`,
          occurred_at: doc.created_at,
        });
      }
    }
  }

  if (role === "supplier") {
    const supplierRes = await pool.query(`SELECT id, name FROM suppliers WHERE owner_id = $1 LIMIT 1`, [userId]);
    const supplierId = supplierRes.rows[0]?.id;
    const supplierName = supplierRes.rows[0]?.name || "Supplier";
    if (supplierId) {
      const depotOrders = await pool.query(
        `SELECT ddo.id, ddo.status, ddo.litres, ddo.total_price_cents, ddo.created_at, ddo.completed_at,
                ddo.payment_confirmed_at, dep.name AS depot_name
         FROM driver_depot_orders ddo
         INNER JOIN depots dep ON dep.id = ddo.depot_id
         WHERE dep.supplier_id = $1
         ORDER BY ddo.created_at DESC NULLS LAST
         LIMIT $2`,
        [supplierId, limit],
      );
      for (const d of depotOrders.rows) {
        push(entries, {
          id: `supplier_depot_${d.id}_created`,
          kind: "depot_order_received",
          title: "Driver depot order received",
          detail: `${d.depot_name || supplierName} · ${d.litres}L · ${d.status}`,
          occurred_at: d.created_at,
        });
        if (d.completed_at) {
          push(entries, {
            id: `supplier_depot_${d.id}_done`,
            kind: "depot_order_completed",
            title: "Depot order completed",
            detail: `${d.depot_name || supplierName} · ${d.litres}L`,
            occurred_at: d.completed_at,
          });
        }
      }

      const docs = await pool.query(
        `SELECT id, doc_type, title, verification_status, created_at
         FROM documents WHERE owner_type = 'supplier' AND owner_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [supplierId],
      );
      for (const doc of docs.rows) {
        push(entries, {
          id: `doc_${doc.id}`,
          kind: "document_uploaded",
          title: "Document uploaded",
          detail: `${doc.title || doc.doc_type} · ${doc.verification_status || "pending"}`,
          occurred_at: doc.created_at,
        });
      }
    }
  }

  if (role === "company") {
    const companyRes = await pool.query(`SELECT id, name FROM companies WHERE owner_user_id = $1 LIMIT 1`, [userId]);
    const companyId = companyRes.rows[0]?.id;
    const companyName = companyRes.rows[0]?.name || "Fleet company";
    if (companyId) {
      const vehicles = await pool.query(
        `SELECT id, registration_number, vehicle_status, driver_id, created_at
         FROM vehicles WHERE company_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [companyId, limit],
      );
      for (const v of vehicles.rows) {
        push(entries, {
          id: `company_vehicle_${v.id}`,
          kind: "fleet_vehicle_added",
          title: "Fleet vehicle added",
          detail: `${v.registration_number || "Vehicle"} · ${v.vehicle_status || "pending_compliance"}`,
          occurred_at: v.created_at,
        });
      }

      const applications = await pool.query(
        `SELECT m.driver_id, m.applied_at, m.reviewed_at, m.membership_status::text AS membership_status,
                p.full_name
         FROM driver_company_memberships m
         INNER JOIN drivers d ON d.id = m.driver_id
         INNER JOIN profiles p ON p.id = d.user_id
         WHERE m.company_id = $1 AND (m.applied_at IS NOT NULL OR m.reviewed_at IS NOT NULL)
         ORDER BY COALESCE(m.reviewed_at, m.applied_at) DESC NULLS LAST
         LIMIT $2`,
        [companyId, limit],
      );
      for (const a of applications.rows) {
        if (a.applied_at) {
          push(entries, {
            id: `app_${a.driver_id}_applied`,
            kind: "driver_application",
            title: "Driver application received",
            detail: `${a.full_name || "Driver"} applied to join ${companyName}`,
            occurred_at: a.applied_at,
          });
        }
        if (a.reviewed_at && a.membership_status === "approved") {
          push(entries, {
            id: `app_${a.driver_id}_approved`,
            kind: "driver_approved",
            title: "Driver approved",
            detail: a.full_name || "Driver",
            occurred_at: a.reviewed_at,
          });
        }
        if (a.reviewed_at && a.membership_status === "rejected") {
          push(entries, {
            id: `app_${a.driver_id}_rejected`,
            kind: "driver_rejected",
            title: "Driver application declined",
            detail: a.full_name || "Driver",
            occurred_at: a.reviewed_at,
          });
        }
      }

      const fleetOrders = await pool.query(
        `SELECT o.id, o.state, o.litres, o.total_cents, o.created_at, o.delivered_at, COALESCE(ft.label, ft.code) AS fuel_name
         FROM orders o
         LEFT JOIN fuel_types ft ON ft.id = o.fuel_type_id
         WHERE o.fleet_company_id = $1
         ORDER BY o.created_at DESC NULLS LAST
         LIMIT $2`,
        [companyId, limit],
      );
      for (const o of fleetOrders.rows) {
        push(entries, {
          id: `fleet_order_${o.id}`,
          kind: "fleet_order",
          title: "Fleet delivery order",
          detail: orderDetail(o.litres, o.fuel_name, o.state, o.total_cents),
          occurred_at: o.created_at,
        });
        if (o.delivered_at) {
          push(entries, {
            id: `fleet_order_${o.id}_done`,
            kind: "order_completed",
            title: "Fleet order completed",
            detail: orderDetail(o.litres, o.fuel_name, "delivered", o.total_cents),
            occurred_at: o.delivered_at,
          });
        }
      }
    }
  }

  const notifRes = await pool.query(
    `SELECT id, type, title, message, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId],
  );
  for (const n of notifRes.rows) {
    push(entries, {
      id: `notif_${n.id}`,
      kind: `notification_${n.type}`,
      title: n.title || "Notification",
      detail: n.message || "",
      occurred_at: n.created_at,
    });
  }

  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const seen = new Set<string>();
  const deduped: UserActivityEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    deduped.push(e);
    if (deduped.length >= 100) break;
  }

  return deduped;
}
