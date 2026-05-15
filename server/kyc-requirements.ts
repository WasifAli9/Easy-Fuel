/**
 * Central rules for driver KYC / supplier KYB document requirements and field readiness.
 * Used by compliance-service, readiness GET, and submit-kyc/kyb POST.
 */

export const SUPPLIER_REQUIRED_DOCUMENT_TYPES = [
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
] as const;

export type DriverKycDocContext = {
  idType: string | null | undefined;
  prdpRequired: boolean | null | undefined;
  dgTrainingRequired: boolean | null | undefined;
  criminalCheckDone?: boolean | null | undefined;
};

/** Status values that mean "file exists and is not rejected" (draft = saved locally). */
export const SATISFYING_DOC_STATUSES = new Set(["draft", "pending", "pending_review", "approved", "verified"]);

export function isDocStatusSatisfying(status: string | null | undefined): boolean {
  if (!status) return false;
  return SATISFYING_DOC_STATUSES.has(String(status).toLowerCase());
}

/** Latest non-rejected row wins; rejected-only slot counts as missing. */
export function latestDocStatusByType(
  rows: { doc_type: string; verification_status: string | null; created_at?: Date | string | null }[],
): Map<string, string> {
  const map = new Map<string, { status: string; t: number }>();
  for (const row of rows) {
    const type = String(row.doc_type || "").toLowerCase();
    if (!type) continue;
    const st = String(row.verification_status || "pending").toLowerCase();
    if (st === "rejected") continue;
    const raw = row.created_at;
    const t =
      raw instanceof Date
        ? raw.getTime()
        : typeof raw === "string"
          ? new Date(raw).getTime()
          : 0;
    const prev = map.get(type);
    if (!prev || t >= prev.t) {
      map.set(type, { status: st, t });
    }
  }
  const out = new Map<string, string>();
  for (const [k, v] of map) out.set(k, v.status);
  return out;
}

/** Latest row per doc_type including rejected (by created_at). */
export function latestDocVerificationByType(
  rows: { doc_type: string; verification_status: string | null; created_at?: Date | string | null }[],
): Map<string, string> {
  const map = new Map<string, { status: string; t: number }>();
  for (const row of rows) {
    const type = String(row.doc_type || "").toLowerCase();
    if (!type) continue;
    const st = String(row.verification_status || "pending").toLowerCase();
    const raw = row.created_at;
    const t =
      raw instanceof Date
        ? raw.getTime()
        : typeof raw === "string"
          ? new Date(raw).getTime()
          : 0;
    const prev = map.get(type);
    if (!prev || t >= prev.t) {
      map.set(type, { status: st, t });
    }
  }
  const out = new Map<string, string>();
  for (const [k, v] of map) out.set(k, v.status);
  return out;
}

/**
 * Required driver-owned document types for a full KYC submit (person only; vehicles excluded).
 */
export function getRequiredDriverDocumentTypes(ctx: DriverKycDocContext): string[] {
  const required: string[] = ["drivers_license", "banking_proof"];
  const id = String(ctx.idType || "")
    .trim()
    .toUpperCase();
  if (id === "SA_ID" || id === "SOUTH_AFRICA") {
    required.push("za_id");
  } else if (id === "PASSPORT") {
    required.push("passport");
  } else {
    // Until id_type is chosen, readiness treats identity as a separate gate (see getDriverKycMissingDocuments).
    required.push("__identity__");
  }
  if (ctx.prdpRequired) {
    required.push("prdp");
  }
  if (ctx.dgTrainingRequired) {
    required.push("dangerous_goods_training");
  }
  if (ctx.criminalCheckDone) {
    required.push("criminal_check");
  }
  return required;
}

export function getDriverKycMissingDocuments(
  driverDocs: { doc_type: string; verification_status: string | null; created_at?: Date | string | null }[],
  ctx: DriverKycDocContext,
): string[] {
  const byStatus = latestDocStatusByType(driverDocs);
  const required = getRequiredDriverDocumentTypes(ctx);
  const missing: string[] = [];
  for (const doc of required) {
    if (doc === "__identity__") {
      const hasZa = isDocStatusSatisfying(byStatus.get("za_id"));
      const hasPass = isDocStatusSatisfying(byStatus.get("passport"));
      if (!hasZa && !hasPass) {
        missing.push("za_id_or_passport");
      }
      continue;
    }
    if (!isDocStatusSatisfying(byStatus.get(doc))) {
      missing.push(doc);
    }
  }
  return missing;
}

export type DriverRowShape = {
  idType?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  driversLicenseNumber?: string | null;
  licenseCode?: string | null;
  driversLicenseIssueDate?: string | Date | null;
  driversLicenseExpiry?: string | Date | null;
  prdpRequired?: boolean | null;
  prdpNumber?: string | null;
  prdpCategory?: string | null;
  prdpIssueDate?: string | Date | null;
  prdpExpiry?: string | Date | null;
  dgTrainingRequired?: boolean | null;
  dgTrainingProvider?: string | null;
  dgTrainingCertificateNumber?: string | null;
  dgTrainingIssueDate?: string | Date | null;
  dgTrainingExpiryDate?: string | Date | null;
  criminalCheckDone?: boolean | null;
  criminalCheckReference?: string | null;
  criminalCheckDate?: string | Date | null;
  bankAccountName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  branchCode?: string | null;
  zaIdNumber?: string | null;
  passportNumber?: string | null;
};

function nonempty(v: unknown): boolean {
  return v != null && String(v).trim().length > 0;
}

export function getDriverKycMissingFields(driver: DriverRowShape): string[] {
  const missing: string[] = [];
  if (!nonempty(driver.addressLine1)) missing.push("address_line_1");
  if (!nonempty(driver.city)) missing.push("city");
  if (!nonempty(driver.province)) missing.push("province");
  if (!nonempty(driver.postalCode)) missing.push("postal_code");

  const idType = String(driver.idType || "")
    .trim()
    .toUpperCase();
  if (!idType) {
    missing.push("id_type");
  } else if (idType === "SA_ID" || idType === "SOUTH_AFRICA") {
    if (!nonempty(driver.zaIdNumber)) missing.push("za_id_number");
  } else if (idType === "PASSPORT") {
    if (!nonempty(driver.passportNumber)) missing.push("passport_number");
  }

  if (!nonempty(driver.driversLicenseNumber)) missing.push("drivers_license_number");
  if (!nonempty(driver.licenseCode)) missing.push("license_code");
  if (!driver.driversLicenseIssueDate) missing.push("drivers_license_issue_date");
  if (!driver.driversLicenseExpiry) missing.push("drivers_license_expiry");

  if (driver.prdpRequired) {
    if (!nonempty(driver.prdpNumber)) missing.push("prdp_number");
    if (!nonempty(driver.prdpCategory)) missing.push("prdp_category");
    if (!driver.prdpIssueDate) missing.push("prdp_issue_date");
    if (!driver.prdpExpiry) missing.push("prdp_expiry");
  }
  if (driver.dgTrainingRequired) {
    if (!nonempty(driver.dgTrainingProvider)) missing.push("dg_training_provider");
    if (!nonempty(driver.dgTrainingCertificateNumber)) missing.push("dg_training_certificate_number");
    if (!driver.dgTrainingIssueDate) missing.push("dg_training_issue_date");
    if (!driver.dgTrainingExpiryDate) missing.push("dg_training_expiry_date");
  }

  if (driver.criminalCheckDone) {
    if (!nonempty(driver.criminalCheckReference)) missing.push("criminal_check_reference");
    if (!driver.criminalCheckDate) missing.push("criminal_check_date");
  }

  if (!nonempty(driver.bankAccountName)) missing.push("bank_account_name");
  if (!nonempty(driver.bankName)) missing.push("bank_name");
  if (!nonempty(driver.accountNumber)) missing.push("account_number");
  if (!nonempty(driver.branchCode)) missing.push("branch_code");

  return missing;
}

export function getSupplierKybMissingDocuments(
  supplierDocs: { doc_type: string; verification_status: string | null; created_at?: Date | string | null }[],
): string[] {
  const byStatus = latestDocStatusByType(supplierDocs);
  const missing: string[] = [];
  for (const doc of SUPPLIER_REQUIRED_DOCUMENT_TYPES) {
    if (!isDocStatusSatisfying(byStatus.get(doc))) {
      missing.push(doc);
    }
  }
  return missing;
}

/** Minimal supplier profile fields required before KYB submit (company identity + banking). */
export function getSupplierKybMissingFields(s: {
  registeredName?: string | null;
  cipcNumber?: string | null;
  bankAccountName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  branchCode?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!nonempty(s.registeredName)) missing.push("registered_name");
  if (!nonempty(s.cipcNumber)) missing.push("cipc_number");
  if (!nonempty(s.bankAccountName)) missing.push("bank_account_name");
  if (!nonempty(s.bankName)) missing.push("bank_name");
  if (!nonempty(s.accountNumber)) missing.push("account_number");
  if (!nonempty(s.branchCode)) missing.push("branch_code");
  return missing;
}
