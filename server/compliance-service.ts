import { db } from "./db";
import { documents, drivers, suppliers, vehicles } from "@shared/schema";
import { and, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";

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
}

/**
 * Required documents for drivers
 */
const DRIVER_REQUIRED_DOCUMENTS = [
  "za_id",
  "passport", // If not SA_ID
  "proof_of_address",
  "drivers_license",
  "prdp", // If transporting fuel
  "dangerous_goods_training", // If transporting fuel
  "medical_fitness", // If transporting fuel
  "criminal_check",
  "banking_proof",
];

/**
 * Required documents for vehicles
 */
const VEHICLE_REQUIRED_DOCUMENTS = [
  "vehicle_registration",
  "roadworthy_certificate",
  "insurance_certificate",
  "dg_vehicle_permit", // If transporting fuel
  "letter_of_authority", // If vehicle not in driver's name
];

/**
 * Required documents for suppliers
 */
const SUPPLIER_REQUIRED_DOCUMENTS = [
  "cipc_certificate",
  "vat_certificate",
  "tax_clearance",
  "dmre_license",
  "site_license",
  "environmental_authorisation",
  "fire_certificate",
  "sabs_certificate",
  "calibration_certificate",
  "public_liability_insurance",
];

/**
 * Get driver compliance status and checklist
 */
export async function getDriverComplianceStatus(driverId: string): Promise<ComplianceStatus> {
  try {
    // Get driver record
    const driverRows = await db
      .select({
        id: drivers.id,
        user_id: drivers.userId,
        prdp_required: drivers.prdpRequired,
        dg_training_required: drivers.dgTrainingRequired,
        compliance_status: drivers.complianceStatus,
        status: drivers.status,
        compliance_rejection_reason: drivers.complianceRejectionReason,
        compliance_reviewer_id: drivers.complianceReviewerId,
        compliance_review_date: drivers.complianceReviewDate,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    const driver = driverRows[0];
    if (!driver) {
      throw new Error("Driver not found");
    }

    // Get all documents for driver
    // NOTE: Documents are stored with owner_id = driver.id (not driver.user_id)
    const driverDocuments = await db
      .select({
        id: documents.id,
        doc_type: documents.docType,
        verification_status: documents.verificationStatus,
        document_status: documents.verificationStatus,
        owner_type: documents.ownerType,
        owner_id: documents.ownerId,
        title: documents.title,
      })
      .from(documents)
      .where(and(eq(documents.ownerType, "driver"), eq(documents.ownerId, driver.id)));

    // Get vehicle documents
    const vehicleRows = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.driverId, driverId));
    const vehicleIds = vehicleRows.map((v) => v.id);
    let vehicleDocuments: any[] = [];

    if (vehicleIds.length > 0) {
      const vDocs = await db
        .select({
          id: documents.id,
          doc_type: documents.docType,
          verification_status: documents.verificationStatus,
          document_status: documents.verificationStatus,
          owner_type: documents.ownerType,
          owner_id: documents.ownerId,
          title: documents.title,
        })
        .from(documents)
        .where(and(eq(documents.ownerType, "vehicle"), inArray(documents.ownerId, vehicleIds)));
      vehicleDocuments = vDocs || [];
    }

    const allDocuments = [...(driverDocuments || []), ...vehicleDocuments];

    // Debug: Log all documents found
    console.log("[Compliance Service] Driver documents found:", {
      driverId: driverId,
      driverUserId: driver.user_id,
      documentsCount: driverDocuments?.length || 0,
      vehicleDocumentsCount: vehicleDocuments.length,
      allDocumentsCount: allDocuments.length,
      documentDetails: allDocuments.map(d => ({
        id: d.id,
        doc_type: d.doc_type,
        verification_status: d.verification_status,
        document_status: d.document_status,
        owner_type: d.owner_type,
        owner_id: d.owner_id,
        title: d.title
      }))
    });

    // Determine required documents based on driver type and requirements
    const requiredDocs = [...DRIVER_REQUIRED_DOCUMENTS];
    
    // If driver is transporting fuel, add fuel-specific requirements
    if (driver.prdp_required || driver.dg_training_required) {
      // Already included in DRIVER_REQUIRED_DOCUMENTS
    }

    // Check which documents are uploaded, approved, rejected, pending
    const uploaded = allDocuments.map(d => d.doc_type);
    // Check for approved documents - support multiple status values
    const approvedDocs = allDocuments.filter(d => {
      const isApproved = d.verification_status === "verified" || 
                         d.verification_status === "approved" || 
                         d.document_status === "approved";
      if (isApproved) {
        console.log("[Compliance Service] Found approved document:", {
          doc_type: d.doc_type,
          verification_status: d.verification_status,
          document_status: d.document_status,
          title: d.title
        });
      }
      return isApproved;
    });
    const approved = approvedDocs.map(d => d.doc_type);
    
    console.log("[Compliance Service] Document status summary:", {
      uploaded: uploaded,
      approved: approved,
      approvedCount: approved.length,
      requiredDocs: requiredDocs
    });
    const rejected = allDocuments.filter(d => 
      d.verification_status === "rejected" || 
      d.document_status === "rejected"
    ).map(d => d.doc_type);
    const pending = allDocuments.filter(d => 
      (d.verification_status === "pending" || 
       d.verification_status === "pending_review" || 
       d.document_status === "pending" || 
       d.document_status === "pending_review") && 
      !approved.includes(d.doc_type)
    ).map(d => d.doc_type);
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

    // Determine overall status
    let overallStatus: "pending" | "approved" | "rejected" | "incomplete" = "pending";
    let canAccessPlatform = false;

    if (driver.compliance_status === "approved" && driver.status === "active") {
      overallStatus = "approved";
      canAccessPlatform = true;
    } else if (driver.compliance_status === "rejected" || driver.status === "rejected") {
      overallStatus = "rejected";
      canAccessPlatform = false;
    } else if (missing.length > 0 || pending.length > 0) {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    } else if (approved.length === requiredDocs.length && driver.compliance_status === "pending") {
      // All documents approved but compliance status not yet set
      overallStatus = "pending";
      canAccessPlatform = false;
    }

    return {
      overallStatus,
      canAccessPlatform,
      checklist,
      rejectionReason: driver.compliance_rejection_reason || undefined,
      reviewerId: driver.compliance_reviewer_id || undefined,
      reviewDate: driver.compliance_review_date || undefined,
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

    const requiredDocs = [...VEHICLE_REQUIRED_DOCUMENTS];
    if (vehicle.dg_vehicle_permit_required) {
      // Already included
    }
    if (vehicle.loa_required) {
      // Already included
    }

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
 * Get supplier compliance status and checklist
 */
export async function getSupplierComplianceStatus(supplierId: string): Promise<ComplianceStatus> {
  try {
    const supplierRows = await db
      .select({
        id: suppliers.id,
        owner_id: suppliers.ownerId,
        compliance_status: suppliers.complianceStatus,
        status: suppliers.status,
        compliance_rejection_reason: suppliers.complianceRejectionReason,
        compliance_reviewer_id: suppliers.complianceReviewerId,
        compliance_review_date: suppliers.complianceReviewDate,
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
      })
      .from(documents)
      .where(and(eq(documents.ownerType, "supplier"), eq(documents.ownerId, supplier.owner_id)));

    const requiredDocs = [...SUPPLIER_REQUIRED_DOCUMENTS];

    const uploaded = (supplierDocuments || []).map(d => d.doc_type);
    const approved = (supplierDocuments || []).filter(d => d.verification_status === "verified" || d.verification_status === "approved" || d.document_status === "approved").map(d => d.doc_type);
    const rejected = (supplierDocuments || []).filter(d => d.verification_status === "rejected" || d.document_status === "rejected").map(d => d.doc_type);
    const pending = (supplierDocuments || []).filter(d => (d.verification_status === "pending" || d.verification_status === "pending_review" || d.document_status === "pending" || d.document_status === "pending_review") && !approved.includes(d.doc_type)).map(d => d.doc_type);
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

    if (supplier.compliance_status === "approved" && supplier.status === "active") {
      overallStatus = "approved";
      canAccessPlatform = true;
    } else if (supplier.compliance_status === "rejected" || supplier.status === "rejected") {
      overallStatus = "rejected";
      canAccessPlatform = false;
    } else if (missing.length > 0 || pending.length > 0) {
      overallStatus = "incomplete";
      canAccessPlatform = false;
    } else if (approved.length === requiredDocs.length && supplier.compliance_status === "pending") {
      overallStatus = "pending";
      canAccessPlatform = false;
    }

    return {
      overallStatus,
      canAccessPlatform,
      checklist,
      rejectionReason: supplier.compliance_rejection_reason || undefined,
      reviewerId: supplier.compliance_reviewer_id || undefined,
      reviewDate: supplier.compliance_review_date || undefined,
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

    // TODO: Send notifications for expiring documents
    // This would integrate with the notification service
    console.log(`Found ${expiringDocs?.length || 0} documents expiring within 30 days`);
  } catch (error) {
    console.error("Error in checkExpiringDocuments:", error);
  }
}

