import { getAdminUserIds } from "./admin-notify";
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
  const adminUserIds = await getAdminUserIds();
  if (!adminUserIds.length) {
    console.warn("[notifyAdminsComplianceDocumentUploaded] No admin profiles found — skipping alert");
    return;
  }
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
