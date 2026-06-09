/** Tokens that stay uppercase in user-facing labels (e.g. PRU, KYC). */
const PRESERVE_ACRONYMS = new Set([
  "PRU",
  "KYC",
  "KYB",
  "LOA",
  "DG",
  "VAT",
  "EFT",
  "ID",
  "GPS",
  "API",
  "PDF",
  "CIPC",
  "ZA",
]);

/** Canonical labels for snake_case codes shown in the UI. */
const LABEL_OVERRIDES: Record<string, string> = {
  // Fuel delivery order states
  created: "Created",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  assigned: "Assigned",
  en_route: "En Route",
  picked_up: "Picked Up",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  // Offers / dispatch
  offered: "Offered",
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  timeout: "Timeout",
  pending_customer: "Pending Customer",
  customer_accepted: "Customer Accepted",
  pending_review: "Pending Review",
  // Compliance / vehicles
  pending_compliance: "Pending Compliance",
  verified: "Verified",
  approved: "Approved",
  active: "Active",
  inactive: "Inactive",
  // Payment
  bank_transfer: "Bank Transfer",
  bank_account: "Bank Account",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  pending_payment: "Pending Payment",
  payment_failed: "Payment Failed",
  // Depot orders
  ready_for_pickup: "Ready for Pickup",
  awaiting_signature: "Awaiting Signature",
  awaiting_signatures: "Awaiting Signatures",
  released: "Released",
  completed: "Completed",
  waiting_payment_confirmation: "Waiting Payment Confirmation",
  // Order priority
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
  // Roles
  driver: "Driver",
  customer: "Customer",
  supplier: "Supplier",
  admin: "Admin",
  company: "Company",
  // KYC / compliance document types
  za_id: "South African ID",
  passport: "Passport",
  drivers_license: "Driver's License",
  prdp: "PrDP",
  banking_proof: "Banking Proof",
  criminal_check: "Criminal Clearance",
  proof_of_address: "Proof of Address",
  dangerous_goods_training: "Dangerous Goods Training",
  cipc_certificate: "CIPC Certificate",
  vat_certificate: "VAT Certificate",
  tax_clearance: "Tax Clearance",
  vehicle_registration: "Vehicle Registration Certificate",
  roadworthy_certificate: "Roadworthy Certificate",
  insurance_certificate: "Insurance Certificate",
  dg_vehicle_permit: "Dangerous Goods Vehicle Permit",
  letter_of_authority: "Letter of Authority",
};

function formatWord(word: string): string {
  const trimmed = word.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (PRESERVE_ACRONYMS.has(upper)) return upper;
  if (trimmed.length <= 4 && trimmed === upper && /^[A-Z]+$/.test(trimmed)) return upper;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Converts snake_case (or spaced) codes to consistent Title Case labels.
 * Uses overrides for domain-specific wording (e.g. picked_up → "Picked Up").
 */
export function formatSnakeCaseLabel(value?: string | null, fallback = "—"): string {
  if (value == null || !String(value).trim()) return fallback;
  const raw = String(value).trim();
  const key = raw.toLowerCase();
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  return raw
    .replace(/_/g, " ")
    .split(/\s+/)
    .map(formatWord)
    .join(" ");
}

/** Fuel delivery order state shown to users. */
export function formatOrderState(state?: string | null): string {
  return formatSnakeCaseLabel(state, "Pending");
}

/** Order / job priority level (low, medium, high, urgent). */
export function formatPriorityLevel(level?: string | null): string {
  return formatSnakeCaseLabel(level, "Medium");
}

/**
 * Formats API field values for list/detail UI based on field name.
 * Leaves dates and plain text unchanged.
 */
export function formatDisplayFieldValue(fieldKey: string, value?: string | null): string {
  if (value == null || !String(value).trim()) return "—";
  const raw = String(value).trim();
  const leaf = (fieldKey.split(".").pop() ?? fieldKey).toLowerCase();

  if (/_at$|_date$|^date$|scheduled_date$/.test(leaf)) return raw;
  if (leaf === "email" || leaf.includes("email")) return raw;
  if (/^\+?\d[\d\s-]{6,}$/.test(raw)) return raw;

  if (leaf === "state" || leaf === "order_state") return formatOrderState(raw);
  if (leaf === "priority" || leaf === "priority_level" || leaf === "prioritylevel") {
    return formatPriorityLevel(raw);
  }
  if (leaf === "status" || leaf.endsWith("_status") || leaf === "compliance_status" || leaf === "kyb_status") {
    return formatSnakeCaseLabel(raw);
  }
  if (leaf === "role" || leaf === "account_type") return formatRole(raw);
  if (leaf === "payment_method" || leaf === "payment_status") return formatSnakeCaseLabel(raw);
  if (/^[a-z][a-z0-9_]*$/.test(raw)) return formatSnakeCaseLabel(raw);

  return raw;
}

/** Driver offer / dispatch offer state. */
export function formatOfferState(state?: string | null): string {
  return formatSnakeCaseLabel(state, "Pending");
}

/** KYC / vehicle / generic document type. */
export function formatDocumentType(docType?: string | null): string {
  return formatSnakeCaseLabel(docType, "Document");
}

/** Payment method code. */
export function formatPaymentMethod(method?: string | null): string {
  return formatSnakeCaseLabel(method, "—");
}

/** User role or account type. */
export function formatRole(role?: string | null): string {
  return formatSnakeCaseLabel(role, "—");
}

/** Fuel type code (e.g. diesel → DIESEL for badges). */
export function formatFuelTypeCode(code?: string | null): string {
  if (!code?.trim()) return "";
  return code.trim().toUpperCase();
}

/** Short order id for display (#XXXXXXXX). */
export function formatOrderIdShort(id: string, length = 8): string {
  const slice = id.length > length ? id.slice(0, length) : id;
  return slice.toUpperCase();
}

export type DepotOrderStatusInput = {
  status: string;
  payment_status?: string;
  payment_method?: string;
};

/** Supplier/driver depot order status line. */
export function formatDepotOrderStatus(order: DepotOrderStatusInput): string {
  const status = order.status;
  const paymentStatus = order.payment_status;

  if (status === "pending_payment") {
    if (paymentStatus === "paid" && order.payment_method === "bank_transfer") {
      return LABEL_OVERRIDES.waiting_payment_confirmation;
    }
    if (paymentStatus === "payment_failed") {
      return LABEL_OVERRIDES.payment_failed;
    }
    return "Awaiting Payment";
  }
  if (status === "paid") return LABEL_OVERRIDES.awaiting_signatures;
  if (status === "ready_for_pickup") return LABEL_OVERRIDES.ready_for_pickup;
  if (status === "awaiting_signature" || status === "released") {
    return "Awaiting Driver Signature";
  }
  return formatSnakeCaseLabel(status, status);
}
