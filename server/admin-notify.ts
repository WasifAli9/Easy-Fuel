import { pool } from "./db";
import { notificationService } from "./notification-service";

export async function getAdminUserIds(): Promise<string[]> {
  const result = await pool.query(`SELECT id::text FROM profiles WHERE role = 'admin'`);
  return result.rows.map((row: { id: string }) => row.id);
}

export async function getProfileDisplayName(userId: string): Promise<string> {
  const result = await pool.query(
    `SELECT p.full_name, lau.email
     FROM profiles p
     LEFT JOIN local_auth_users lau ON lau.id = p.id
     WHERE p.id = $1::uuid
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  return row?.full_name || row?.email || "User";
}

export async function notifyAdminsUserRegistered(params: {
  userId: string;
  fullName: string;
  role: string;
}) {
  const adminIds = await getAdminUserIds();
  if (!adminIds.length) {
    console.warn("[notifyAdminsUserRegistered] No admin profiles found — skipping alert");
    return;
  }

  const roleLabel =
    params.role === "company"
      ? "fleet company"
      : params.role === "supplier"
        ? "supplier"
        : params.role === "driver"
          ? "driver"
          : params.role === "customer"
            ? "customer"
            : params.role;

  await notificationService.sendToMultipleUsers(adminIds, {
    type: "system_alert",
    title: "New user registered",
    message: `${params.fullName} registered as a ${roleLabel}. Open their profile to review if needed.`,
    data: {
      userId: params.userId,
      userName: params.fullName,
      userType: params.role,
      dedupeKey: `user_registered:${params.userId}`,
      action: "open_user",
    },
    priority: "medium",
    dedupeKey: `user_registered:${params.userId}`,
  });
}

async function hasUnreadAdminAlert(adminId: string, dedupeKey: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1::uuid
       AND read = false
       AND (data->>'dedupeKey' = $2 OR data->>'dedupe_key' = $2)
     LIMIT 1`,
    [adminId, dedupeKey],
  );
  return result.rows.length > 0;
}

/** Create inbox alerts for compliance queue items that never triggered a live notification. */
export async function seedMissingAdminComplianceAlerts(): Promise<void> {
  const adminIds = await getAdminUserIds();
  if (!adminIds.length) return;

  const drivers = await pool.query(
    `SELECT DISTINCT d.id::text AS driver_id, d.user_id::text, p.full_name,
            d.kyc_status, d.kyc_submitted_at,
            EXISTS (
              SELECT 1 FROM documents doc
              WHERE doc.owner_type = 'driver' AND doc.owner_id = d.id
                AND doc.verification_status IN ('pending', 'pending_review', 'draft')
            ) AS has_pending_doc
     FROM drivers d
     LEFT JOIN profiles p ON p.id = d.user_id
     WHERE (
       (d.kyc_status = 'pending' AND d.kyc_submitted_at IS NOT NULL)
       OR EXISTS (
         SELECT 1 FROM documents doc
         WHERE doc.owner_type = 'driver' AND doc.owner_id = d.id
           AND doc.verification_status IN ('pending', 'pending_review', 'draft')
       )
     )`,
  );

  for (const row of drivers.rows) {
    const name = row.full_name || "Driver";
    const userId = row.user_id;

    if (row.has_pending_doc) {
      const dedupeKey = `pending_doc:driver:${row.driver_id}`;
      for (const adminId of adminIds) {
        if (await hasUnreadAdminAlert(adminId, dedupeKey)) continue;
        await notificationService.createAndSend({
          userId: adminId,
          type: "admin_document_uploaded",
          title: "Document awaiting review",
          message: `${name} has compliance document(s) awaiting review.`,
          data: { userId, ownerType: "driver", ownerName: name, dedupeKey },
          dedupeKey,
          priority: "medium",
        });
      }
    }

    if (row.kyc_status === "pending" && row.kyc_submitted_at) {
      const dedupeKey = `pending_kyc:driver:${row.driver_id}`;
      for (const adminId of adminIds) {
        if (await hasUnreadAdminAlert(adminId, dedupeKey)) continue;
        await notificationService.createAndSend({
          userId: adminId,
          type: "admin_kyc_submitted",
          title: "Driver KYC awaiting review",
          message: `${name} submitted driver verification. Please review.`,
          data: { userId, userName: name, userType: "driver", dedupeKey },
          dedupeKey,
          priority: "high",
          requireInteraction: true,
        });
      }
    }
  }

  const suppliers = await pool.query(
    `SELECT DISTINCT s.id::text AS supplier_id, s.owner_id::text, s.name, s.registered_name,
            s.kyb_status, s.kyb_submitted_at,
            EXISTS (
              SELECT 1 FROM documents doc
              WHERE doc.owner_type = 'supplier' AND doc.owner_id = s.id
                AND doc.verification_status IN ('pending', 'pending_review', 'draft')
            ) AS has_pending_doc
     FROM suppliers s
     WHERE (
       (s.kyb_status = 'pending' AND s.kyb_submitted_at IS NOT NULL)
       OR EXISTS (
         SELECT 1 FROM documents doc
         WHERE doc.owner_type = 'supplier' AND doc.owner_id = s.id
           AND doc.verification_status IN ('pending', 'pending_review', 'draft')
       )
     )`,
  );

  for (const row of suppliers.rows) {
    const name = row.name || row.registered_name || "Supplier";
    const userId = row.owner_id;

    if (row.has_pending_doc) {
      const dedupeKey = `pending_doc:supplier:${row.supplier_id}`;
      for (const adminId of adminIds) {
        if (await hasUnreadAdminAlert(adminId, dedupeKey)) continue;
        await notificationService.createAndSend({
          userId: adminId,
          type: "admin_document_uploaded",
          title: "Document awaiting review",
          message: `${name} has compliance document(s) awaiting review.`,
          data: { userId, ownerType: "supplier", ownerName: name, dedupeKey },
          dedupeKey,
          priority: "medium",
        });
      }
    }

    if (row.kyb_status === "pending" && row.kyb_submitted_at) {
      const dedupeKey = `pending_kyc:supplier:${row.supplier_id}`;
      for (const adminId of adminIds) {
        if (await hasUnreadAdminAlert(adminId, dedupeKey)) continue;
        await notificationService.createAndSend({
          userId: adminId,
          type: "admin_kyc_submitted",
          title: "Supplier KYB awaiting review",
          message: `${name} submitted supplier verification. Please review.`,
          data: { userId, userName: name, userType: "supplier", dedupeKey },
          dedupeKey,
          priority: "high",
          requireInteraction: true,
        });
      }
    }
  }

  const vehicles = await pool.query(
    `SELECT v.id::text AS vehicle_id, v.registration_number, c.name AS company_name, c.owner_user_id::text
     FROM vehicles v
     INNER JOIN companies c ON c.id = v.company_id
     WHERE COALESCE(v.vehicle_status::text, 'pending_compliance') NOT IN ('active', 'rejected')
        OR EXISTS (
          SELECT 1 FROM documents doc
          WHERE doc.owner_type = 'vehicle' AND doc.owner_id = v.id
            AND doc.verification_status IN ('pending', 'pending_review', 'draft')
        )`,
  );

  for (const row of vehicles.rows) {
    const label = row.registration_number || row.company_name || "Fleet vehicle";
    const dedupeKey = `pending_vehicle:${row.vehicle_id}`;
    for (const adminId of adminIds) {
      if (await hasUnreadAdminAlert(adminId, dedupeKey)) continue;
      await notificationService.createAndSend({
        userId: adminId,
        type: "admin_vehicle_review_required",
        title: "Fleet vehicle awaiting review",
        message: `${label} (${row.company_name || "company fleet"}) needs compliance review.`,
        data: {
          vehicleId: row.vehicle_id,
          registrationNumber: row.registration_number,
          userId: row.owner_user_id,
          dedupeKey,
        },
        dedupeKey,
        priority: "high",
        requireInteraction: true,
      });
    }
  }

  const driverVehicles = await pool.query(
    `SELECT v.id::text AS vehicle_id, v.registration_number, d.user_id::text, p.full_name
     FROM vehicles v
     INNER JOIN drivers d ON d.id = v.driver_id
     LEFT JOIN profiles p ON p.id = d.user_id
     WHERE v.driver_id IS NOT NULL
       AND (
         COALESCE(v.vehicle_status::text, 'pending_compliance') NOT IN ('active', 'rejected')
         OR EXISTS (
           SELECT 1 FROM documents doc
           WHERE doc.owner_type = 'vehicle' AND doc.owner_id = v.id
             AND doc.verification_status IN ('pending', 'pending_review', 'draft')
         )
       )`,
  );

  for (const row of driverVehicles.rows) {
    const name = row.full_name || "Driver";
    const label = row.registration_number || "Vehicle";
    const dedupeKey = `pending_vehicle:${row.vehicle_id}`;
    for (const adminId of adminIds) {
      if (await hasUnreadAdminAlert(adminId, dedupeKey)) continue;
      await notificationService.createAndSend({
        userId: adminId,
        type: "admin_vehicle_review_required",
        title: "Driver vehicle awaiting review",
        message: `${name} — vehicle ${label} needs compliance review.`,
        data: {
          vehicleId: row.vehicle_id,
          registrationNumber: row.registration_number,
          userId: row.user_id,
          dedupeKey,
        },
        dedupeKey,
        priority: "high",
        requireInteraction: true,
      });
    }
  }
}
