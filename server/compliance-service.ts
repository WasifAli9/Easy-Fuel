import { db } from "./db";
import { customers, documents, drivers, suppliers, vehicles } from "@shared/schema";
import { and, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { notificationService } from "./notification-service";
import {
  getDriverKycMissingDocuments,
  getDriverKycMissingFields,
  getRequiredDriverDocumentTypes,
  getSupplierKybMissingDocuments,
  getSupplierKybMissingFields,
  latestDocStatusByType,
  latestDocVerificationByType,
  isDocStatusSatisfying,
  SUPPLIER_REQUIRED_DOCUMENT_TYPES,
} from "./kyc-requirements";

export interface ComplianceChecklist {
  required: string[];
  optional: string[];
  uploaded: string[];
  approved: string[];
  rejected: string[];
  pending: string[];
  missing: string[];
}

export interface ComplianceStatus {
  overallStatus: "pending" | "approved" | "rejected" | "incomplete";
  canAccessPlatform: boolean;
  checklist: ComplianceChecklist;
  rejectionReason?: string;
  reviewerId?: string;
  reviewDate?: string;
  /** ISO timestamp when full KYC/KYB package was submitted for review (null while drafting). */
  packageSubmittedAt?: string | null;
  /** Driver-only: missing compliance fields (not documents). */
  missingFields?: string[];
}

/**
 * Required documents for vehicles
 */
const VEHICLE_BASE_REQUIRED_DOCUMENTS = [
  "vehicle_registration",
  "roadworthy_certificate",
  "insurance_certificate",
];

function vehicleRequiredDocTypes(vehicle: {
  dg_vehicle_permit_required?: boolean | null;
  loa_required?: boolean | null;
}) {
  const required = [...VEHICLE_BASE_REQUIRED_DOCUMENTS];
  if (vehicle.dg_vehicle_permit_required) required.push("dg_vehicle_permit");
  if (vehicle.loa_required) required.push("letter_of_authority");
  return required;
}

/**
 * Get driver compliance status and checklist
 */
export async function getDriverComplianceStatus(driverId: string): Promise<ComplianceStatus> {
  try {
    const driverRows = await db
      .select({
        id: drivers.id,
        userId: drivers.userId,
        idType: drivers.idType,
        prdpRequired: drivers.prdpRequired,
        dgTrainingRequired: drivers.dgTrainingRequired,
        complianceStatus: drivers.complianceStatus,
        status: drivers.status,
        complianceRejectionReason: drivers.complianceRejectionReason,
        complianceReviewerId: drivers.complianceReviewerId,
        complianceReviewDate: drivers.complianceReviewDate,
        kycSubmittedAt: drivers.kycSubmittedAt,
        addressLine1: drivers.addressLine1,
        city: drivers.city,
        province: drivers.province,
        postalCode: drivers.postalCode,
        driversLicenseNumber: drivers.driversLicenseNumber,
        licenseCode: drivers.licenseCode,
        driversLicenseIssueDate: drivers.driversLicenseIssueDate,
        driversLicenseExpiry: drivers.driversLicenseExpiry,
        prdpNumber: drivers.prdpNumber,
        prdpCategory: drivers.prdpCategory,
        prdpIssueDate: drivers.prdpIssueDate,
        prdpExpiry: drivers.prdpExpiry,
        dgTrainingProvider: drivers.dgTrainingProvider,
        dgTrainingCertificateNumber: drivers.dgTrainingCertificateNumber,
        dgTrainingIssueDate: drivers.dgTrainingIssueDate,
        dgTrainingExpiryDate: drivers.dgTrainingExpiryDate,
        criminalCheckDone: drivers.criminalCheckDone,
        criminalCheckReference: drivers.criminalCheckReference,
        criminalCheckDate: drivers.criminalCheckDate,
        bankAccountName: drivers.bankAccountName,
        bankName: drivers.bankName,
        accountNumber: drivers.accountNumber,
        branchCode: drivers.branchCode,
        zaIdNumber: drivers.zaIdNumber,
        passportNumber: drivers.passportNumber,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    const driver = driverRows[0];
    if (!driver) {
      throw new Error("Driver not found");
    }

    const driverDocuments = await db
      .select({
        id: documents.id,
        doc_type: documents.docType,
        verification_status: documents.verificationStatus,
        document_status: documents.verificationStatus,
        owner_type: documents.ownerType,
        owner_id: documents.ownerId,
        title: documents.title,
        created_at: documents.createdAt,
      })
      .from(documents)
      .where(and(eq(documents.ownerType, "driver"), eq(documents.ownerId, driver.id)));

    const docCtx = {
      idType: driver.idType,
      prdpRequired: !!driver.prdpRequired,
      dgTrainingRequired: !!driver.dgTrainingRequired,
      criminalCheckDone: !!driver.criminalCheckDone,
    };

    const missingDocKeys = getDriverKycMissingDocuments(driverDocuments, docCtx);
    const requiredDocs = getRequiredDriverDocumentTypes(docCtx).filter((d) => d !== "__identity__");
    if (getRequiredDriverDocumentTypes(docCtx).includes("__identity__")) {
      requiredDocs.push("za_id_or_passport");
    }

    const satisfyingLatest = latestDocStatusByType(driverDocuments);
    const uploaded = [...satisfyingLatest.keys()].filter((k) =>
      isDocStatusSatisfying(satisfyingLatest.get(k)),
    );

    const inclusiveLatest = latestDocVerificationByType(driverDocuments);
    const approved = [...inclusiveLatest.entries()]
      .filter(([, st]) => st === "approved" || st === "verified")
      .map(([k]) => k);
    const rejected = [...inclusiveLatest.entries()].filter(([, st]) => st === "rejected").map(([k]) => k);
    const pending = [...inclusiveLatest.entries()]
      .filter(([, st]) => st === "pending" || st === "pending_review" || st === "draft")
      .map(([k]) => k);

    const missingFields = getDriverKycMissingFields(driver);

    const checklist: ComplianceChecklist = {
      required: requiredDocs,
      optional: [],
      uploaded,
      approved,
      rejected,
      pending,
      missing: missingDocKeys,
    };

    let overallStatus: "pending" | "approved" | "rejected" | "incomplete" = "pending";
    let canAccessPlatform = false;

    const submittedAt = driver.kycSubmittedAt;
    const packageSubmittedAt =
      submittedAt instanceof Date
        ? submittedAt.toISOString()
        : submittedAt
          ? String(submittedAt)
          : null;

    if (driver.complianceStatus === "approved" && driver.status === "active") {
      overallStatus = "approved";
      canAccessPlatform = true;
    } else if (driver.complianceStatus === "rejected" || driver.status === "rejected") {
      overallStatus = "rejected";
      canAccessPlatform = false;
    } else if (missingDocKeys.length > 0 || missingFields.length > 0) {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    } else if (packageSubmittedAt && driver.complianceStatus === "pending") {
      overallStatus = "pending";
      canAccessPlatform = false;
    } else {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    }

    return {
      overallStatus,
      canAccessPlatform,
      checklist,
      rejectionReason: driver.complianceRejectionReason || undefined,
      reviewerId: driver.complianceReviewerId || undefined,
      reviewDate:
        driver.complianceReviewDate instanceof Date
          ? driver.complianceReviewDate.toISOString()
          : driver.complianceReviewDate
            ? String(driver.complianceReviewDate)
            : undefined,
      packageSubmittedAt,
      missingFields,
    };
  } catch (error: any) {
    console.error("Error getting driver compliance status:", error);
    throw error;
  }
}

/**
 * Get vehicle compliance status
 */
export async function getVehicleComplianceStatus(vehicleId: string): Promise<ComplianceStatus> {
  try {
    const vehicleRows = await db
      .select({
        id: vehicles.id,
        vehicle_status: vehicles.vehicleStatus,
        dg_vehicle_permit_required: vehicles.dgVehiclePermitRequired,
        loa_required: vehicles.loaRequired,
      })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    const vehicle = vehicleRows[0];
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    const vehicleDocuments = await db
      .select({
        doc_type: documents.docType,
        verification_status: documents.verificationStatus,
        document_status: documents.verificationStatus,
      })
      .from(documents)
      .where(and(eq(documents.ownerType, "vehicle"), eq(documents.ownerId, vehicleId)));

    const requiredDocs = vehicleRequiredDocTypes(vehicle);

    const uploaded = (vehicleDocuments || []).map(d => d.doc_type);
    const approved = (vehicleDocuments || []).filter(d => d.verification_status === "verified" || d.verification_status === "approved" || d.document_status === "approved").map(d => d.doc_type);
    const rejected = (vehicleDocuments || []).filter(d => d.verification_status === "rejected" || d.document_status === "rejected").map(d => d.doc_type);
    const pending = (vehicleDocuments || []).filter(d => (d.verification_status === "pending" || d.verification_status === "pending_review" || d.document_status === "pending" || d.document_status === "pending_review") && !approved.includes(d.doc_type)).map(d => d.doc_type);
    const missing = requiredDocs.filter(doc => !uploaded.includes(doc));

    const checklist: ComplianceChecklist = {
      required: requiredDocs,
      optional: [],
      uploaded,
      approved,
      rejected,
      pending,
      missing,
    };

    let overallStatus: "pending" | "approved" | "rejected" | "incomplete" = "pending";
    let canAccessPlatform = false;

    if (vehicle.vehicle_status === "active") {
      overallStatus = "approved";
      canAccessPlatform = true;
    } else if (vehicle.vehicle_status === "rejected") {
      overallStatus = "rejected";
      canAccessPlatform = false;
    } else if (missing.length > 0 || pending.length > 0) {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    }

    return {
      overallStatus,
      canAccessPlatform,
      checklist,
    };
  } catch (error: any) {
    console.error("Error getting vehicle compliance status:", error);
    throw error;
  }
}

/**
 * Whether a vehicle may be set as the driver's active job vehicle.
 * Auto-activates pending_compliance vehicles when all required docs are approved.
 */
export async function evaluateVehicleJobEligibility(vehicleId: string): Promise<{
  eligible: boolean;
  error?: string;
}> {
  const vehicleRows = await db
    .select({
      vehicleStatus: vehicles.vehicleStatus,
      dgVehiclePermitRequired: vehicles.dgVehiclePermitRequired,
      loaRequired: vehicles.loaRequired,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  const vehicle = vehicleRows[0];
  if (!vehicle) return { eligible: false, error: "Vehicle not found" };

  const status = vehicle.vehicleStatus;
  if (status === "rejected") {
    return { eligible: false, error: "This vehicle was rejected. Re-upload documents or contact support." };
  }
  if (status === "suspended") {
    return { eligible: false, error: "This vehicle is suspended and cannot be used for jobs." };
  }
  if (status === "active") {
    return { eligible: true };
  }

  const compliance = await getVehicleComplianceStatus(vehicleId);
  const { checklist } = compliance;

  if (checklist.rejected.length > 0) {
    return {
      eligible: false,
      error: "One or more vehicle documents were rejected. Fix them under vehicle compliance.",
    };
  }
  if (checklist.missing.length > 0) {
    return {
      eligible: false,
      error: `Upload required vehicle documents first (${checklist.missing.join(", ").replace(/_/g, " ")}).`,
    };
  }
  if (checklist.pending.length > 0) {
    return {
      eligible: false,
      error: "Vehicle documents are awaiting admin review. You can use this vehicle for jobs once they are approved.",
    };
  }

  const required = vehicleRequiredDocTypes({
    dg_vehicle_permit_required: vehicle.dgVehiclePermitRequired,
    loa_required: vehicle.loaRequired,
  });
  const allApproved = required.every((doc) => checklist.approved.includes(doc));
  if (!allApproved) {
    return {
      eligible: false,
      error: "Complete vehicle compliance (all required documents approved) before using for jobs.",
    };
  }

  await db
    .update(vehicles)
    .set({ vehicleStatus: "active", updatedAt: new Date() })
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.vehicleStatus, "pending_compliance")));

  return { eligible: true };
}

/**
 * After a vehicle document is approved, promote vehicle to active when fully compliant.
 */
export async function tryAutoActivateVehicleAfterDocumentApproval(vehicleId: string): Promise<void> {
  const result = await evaluateVehicleJobEligibility(vehicleId);
  if (!result.eligible) return;
}

/**
 * Get supplier compliance status and checklist
 */
export async function getSupplierComplianceStatus(supplierId: string): Promise<ComplianceStatus> {
  try {
    const supplierRows = await db
      .select({
        id: suppliers.id,
        ownerId: suppliers.ownerId,
        complianceStatus: suppliers.complianceStatus,
        status: suppliers.status,
        complianceRejectionReason: suppliers.complianceRejectionReason,
        complianceReviewerId: suppliers.complianceReviewerId,
        complianceReviewDate: suppliers.complianceReviewDate,
        kybSubmittedAt: suppliers.kybSubmittedAt,
        registeredName: suppliers.registeredName,
        cipcNumber: suppliers.cipcNumber,
        registrationNumber: suppliers.registrationNumber,
        bankAccountName: suppliers.bankAccountName,
        bankName: suppliers.bankName,
        accountNumber: suppliers.accountNumber,
        branchCode: suppliers.branchCode,
      })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);
    const supplier = supplierRows[0];
    if (!supplier) {
      throw new Error("Supplier not found");
    }

    const supplierDocuments = await db
      .select({
        doc_type: documents.docType,
        verification_status: documents.verificationStatus,
        document_status: documents.verificationStatus,
        created_at: documents.createdAt,
      })
      .from(documents)
      .where(and(eq(documents.ownerType, "supplier"), eq(documents.ownerId, supplier.ownerId)));

    const requiredDocs = [...SUPPLIER_REQUIRED_DOCUMENT_TYPES];
    const missingDocs = getSupplierKybMissingDocuments(supplierDocuments);

    const satisfyingLatest = latestDocStatusByType(supplierDocuments);
    const uploaded = [...satisfyingLatest.keys()].filter((k) =>
      isDocStatusSatisfying(satisfyingLatest.get(k)),
    );

    const inclusiveLatest = latestDocVerificationByType(supplierDocuments);
    const approved = [...inclusiveLatest.entries()]
      .filter(([, st]) => st === "approved" || st === "verified")
      .map(([k]) => k);
    const rejected = [...inclusiveLatest.entries()].filter(([, st]) => st === "rejected").map(([k]) => k);
    const pending = [...inclusiveLatest.entries()]
      .filter(([, st]) => st === "pending" || st === "pending_review" || st === "draft")
      .map(([k]) => k);

    const missingFields = getSupplierKybMissingFields({
      registeredName: supplier.registeredName,
      cipcNumber: supplier.cipcNumber,
      registrationNumber: supplier.registrationNumber,
      bankAccountName: supplier.bankAccountName,
      bankName: supplier.bankName,
      accountNumber: supplier.accountNumber,
      branchCode: supplier.branchCode,
    });

    const checklist: ComplianceChecklist = {
      required: requiredDocs,
      optional: [],
      uploaded,
      approved,
      rejected,
      pending,
      missing: missingDocs,
    };

    let overallStatus: "pending" | "approved" | "rejected" | "incomplete" = "pending";
    let canAccessPlatform = false;

    const submittedAt = supplier.kybSubmittedAt;
    const packageSubmittedAt =
      submittedAt instanceof Date
        ? submittedAt.toISOString()
        : submittedAt
          ? String(submittedAt)
          : null;

    if (supplier.complianceStatus === "approved" && supplier.status === "active") {
      overallStatus = "approved";
      canAccessPlatform = true;
    } else if (supplier.complianceStatus === "rejected" || supplier.status === "rejected") {
      overallStatus = "rejected";
      canAccessPlatform = false;
    } else if (missingDocs.length > 0 || missingFields.length > 0) {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    } else if (packageSubmittedAt && supplier.complianceStatus === "pending") {
      overallStatus = "pending";
      canAccessPlatform = false;
    } else {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    }

    return {
      overallStatus,
      canAccessPlatform,
      checklist,
      rejectionReason: supplier.complianceRejectionReason || undefined,
      reviewerId: supplier.complianceReviewerId || undefined,
      reviewDate:
        supplier.complianceReviewDate instanceof Date
          ? supplier.complianceReviewDate.toISOString()
          : supplier.complianceReviewDate
            ? String(supplier.complianceReviewDate)
            : undefined,
      packageSubmittedAt,
      missingFields,
    };
  } catch (error: any) {
    console.error("Error getting supplier compliance status:", error);
    throw error;
  }
}

/**
 * Check if driver can access platform features
 */
export async function canDriverAccessPlatform(driverId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ status: drivers.status, compliance_status: drivers.complianceStatus })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    const driver = rows[0];

    if (!driver) return false;

    return driver.status === "active" && driver.compliance_status === "approved";
  } catch (error) {
    console.error("Error checking driver access:", error);
    return false;
  }
}

/**
 * Check if supplier can access platform features
 */
export async function canSupplierAccessPlatform(supplierId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ status: suppliers.status, compliance_status: suppliers.complianceStatus })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);
    const supplier = rows[0];

    if (!supplier) return false;

    return supplier.status === "active" && supplier.compliance_status === "approved";
  } catch (error) {
    console.error("Error checking supplier access:", error);
    return false;
  }
}

/**
 * Check for expiring documents and send notifications
 */
export async function checkExpiringDocuments(): Promise<void> {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringDocs = await db
      .select({ id: documents.id, owner_type: documents.ownerType, owner_id: documents.ownerId })
      .from(documents)
      .where(
        and(
          isNotNull(documents.expiryDate),
          lte(documents.expiryDate, thirtyDaysFromNow),
          gt(documents.expiryDate, new Date()),
          eq(documents.verificationStatus, "verified"),
        ),
      );

    if (!expiringDocs?.length) return;

    const byOwnerType = {
      customer: expiringDocs.filter((d) => d.owner_type === "customer").map((d) => d.owner_id),
      driver: expiringDocs.filter((d) => d.owner_type === "driver").map((d) => d.owner_id),
      supplier: expiringDocs.filter((d) => d.owner_type === "supplier").map((d) => d.owner_id),
    };

    const [customerUsers, driverUsers, supplierUsers] = await Promise.all([
      byOwnerType.customer.length
        ? db
            .select({ ownerId: customers.id, userId: customers.userId })
            .from(customers)
            .where(inArray(customers.id, byOwnerType.customer))
        : Promise.resolve([]),
      byOwnerType.driver.length
        ? db
            .select({ ownerId: drivers.id, userId: drivers.userId })
            .from(drivers)
            .where(inArray(drivers.id, byOwnerType.driver))
        : Promise.resolve([]),
      byOwnerType.supplier.length
        ? db
            .select({ ownerId: suppliers.id, userId: suppliers.ownerId })
            .from(suppliers)
            .where(inArray(suppliers.id, byOwnerType.supplier))
        : Promise.resolve([]),
    ]);

    const ownerToUser = new Map<string, string>();
    for (const row of customerUsers) ownerToUser.set(row.ownerId, row.userId);
    for (const row of driverUsers) ownerToUser.set(row.ownerId, row.userId);
    for (const row of supplierUsers) ownerToUser.set(row.ownerId, row.userId);

    const notifyJobs = expiringDocs
      .map((doc) => ({
        docId: doc.id,
        userId: ownerToUser.get(doc.owner_id),
      }))
      .filter((j): j is { docId: string; userId: string } => Boolean(j.userId))
      .map((j) =>
        notificationService.createNotification({
          userId: j.userId,
          type: "document_expiring",
          title: "Document Expiring Soon",
          message: "One of your verified documents expires within 30 days. Please renew it to avoid service interruption.",
          data: { documentId: j.docId },
          entityType: "profile",
          entityId: j.docId,
          dedupeKey: `document_expiring:${j.docId}`,
          priority: "high",
        }),
      );

    await Promise.allSettled(notifyJobs);
    console.log(`Sent ${notifyJobs.length} document-expiry notifications`);
  } catch (error) {
    console.error("Error in checkExpiringDocuments:", error);
  }
}

