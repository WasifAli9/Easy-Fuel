import { eq } from "drizzle-orm";
import { db } from "./db";
import { profiles } from "@shared/schema";
import { notificationService } from "./notification-service";
import { websocketService } from "./websocket";

/** Statuses that appear in admin Compliance Review for per-document approval. */
export const DOCUMENT_AWAITING_ADMIN_REVIEW = ["pending", "pending_review", "draft"] as const;

export async function notifyAdminsComplianceDocumentUploaded(params: {
  documentId: string;
  docType: string;
  ownerType: "driver" | "supplier" | "vehicle";
  ownerDisplayName: string;
  uploaderUserId: string;
}) {
  const adminProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.role, "admin"));

  if (!adminProfiles.length) return;

  const adminUserIds = adminProfiles.map((p) => p.id);
  await notificationService.notifyAdminDocumentUploaded(
    adminUserIds,
    params.documentId,
    params.docType,
    params.ownerType,
    params.ownerDisplayName,
    params.uploaderUserId,
  );

  try {
    websocketService.broadcastToRole("admin", {
      type: "compliance_document_uploaded",
      payload: {
        documentId: params.documentId,
        docType: params.docType,
        ownerType: params.ownerType,
        ownerName: params.ownerDisplayName,
        userId: params.uploaderUserId,
      },
    });
  } catch (e) {
    console.error("[notifyAdminsComplianceDocumentUploaded] websocket:", e);
  }
}
