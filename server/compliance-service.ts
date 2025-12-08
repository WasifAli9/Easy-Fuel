import { supabaseAdmin } from "./supabase";

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
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !driver) {
      throw new Error("Driver not found");
    }

    // Get all documents for driver
    const { data: documents, error: docsError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "driver")
      .eq("owner_id", driver.user_id);

    if (docsError) {
      console.error("Error fetching driver documents:", docsError);
    }

    // Get vehicle documents
    const { data: vehicles } = await supabaseAdmin
      .from("vehicles")
      .select("id")
      .eq("driver_id", driverId);

    const vehicleIds = vehicles?.map(v => v.id) || [];
    let vehicleDocuments: any[] = [];

    if (vehicleIds.length > 0) {
      const { data: vDocs } = await supabaseAdmin
        .from("documents")
        .select("*")
        .eq("owner_type", "vehicle")
        .in("owner_id", vehicleIds);

      vehicleDocuments = vDocs || [];
    }

    const allDocuments = [...(documents || []), ...vehicleDocuments];

    // Determine required documents based on driver type and requirements
    const requiredDocs = [...DRIVER_REQUIRED_DOCUMENTS];
    
    // If driver is transporting fuel, add fuel-specific requirements
    if (driver.prdp_required || driver.dg_training_required) {
      // Already included in DRIVER_REQUIRED_DOCUMENTS
    }

    // Check which documents are uploaded, approved, rejected, pending
    const uploaded = allDocuments.map(d => d.doc_type);
    const approved = allDocuments.filter(d => d.verification_status === "verified").map(d => d.doc_type);
    const rejected = allDocuments.filter(d => d.verification_status === "rejected").map(d => d.doc_type);
    const pending = allDocuments.filter(d => d.verification_status === "pending").map(d => d.doc_type);
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
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (vehicleError || !vehicle) {
      throw new Error("Vehicle not found");
    }

    const { data: documents, error: docsError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "vehicle")
      .eq("owner_id", vehicleId);

    if (docsError) {
      console.error("Error fetching vehicle documents:", docsError);
    }

    const requiredDocs = [...VEHICLE_REQUIRED_DOCUMENTS];
    if (vehicle.dg_vehicle_permit_required) {
      // Already included
    }
    if (vehicle.loa_required) {
      // Already included
    }

    const uploaded = (documents || []).map(d => d.doc_type);
    const approved = (documents || []).filter(d => d.verification_status === "verified").map(d => d.doc_type);
    const rejected = (documents || []).filter(d => d.verification_status === "rejected").map(d => d.doc_type);
    const pending = (documents || []).filter(d => d.verification_status === "pending").map(d => d.doc_type);
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
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplier) {
      throw new Error("Supplier not found");
    }

    const { data: documents, error: docsError } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "supplier")
      .eq("owner_id", supplier.owner_id);

    if (docsError) {
      console.error("Error fetching supplier documents:", docsError);
    }

    const requiredDocs = [...SUPPLIER_REQUIRED_DOCUMENTS];

    const uploaded = (documents || []).map(d => d.doc_type);
    const approved = (documents || []).filter(d => d.verification_status === "verified").map(d => d.doc_type);
    const rejected = (documents || []).filter(d => d.verification_status === "rejected").map(d => d.doc_type);
    const pending = (documents || []).filter(d => d.verification_status === "pending").map(d => d.doc_type);
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
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("status, compliance_status")
      .eq("id", driverId)
      .single();

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
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("status, compliance_status")
      .eq("id", supplierId)
      .single();

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

    const { data: expiringDocs, error } = await supabaseAdmin
      .from("documents")
      .select("*, owner_type, owner_id")
      .not("expiry_date", "is", null)
      .lte("expiry_date", thirtyDaysFromNow.toISOString())
      .gt("expiry_date", new Date().toISOString())
      .eq("verification_status", "verified");

    if (error) {
      console.error("Error checking expiring documents:", error);
      return;
    }

    // TODO: Send notifications for expiring documents
    // This would integrate with the notification service
    console.log(`Found ${expiringDocs?.length || 0} documents expiring within 30 days`);
  } catch (error) {
    console.error("Error in checkExpiringDocuments:", error);
  }
}

