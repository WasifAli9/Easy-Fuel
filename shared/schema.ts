import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  uuid, 
  timestamp, 
  numeric, 
  integer, 
  boolean, 
  jsonb,
  doublePrecision,
  smallint,
  pgEnum,
  point,
  unique,
  index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["customer", "driver", "supplier", "admin"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "needs_more_info", "suspended"]);
export const kycStatusEnum = pgEnum("kyc_status", ["pending", "approved", "rejected"]);
export const orderStateEnum = pgEnum("order_state", [
  "created",
  "awaiting_payment",
  "paid",
  "assigned",
  "picked_up",
  "en_route",
  "delivered",
  "cancelled",
  "refunded"
]);
export const dispatchOfferStateEnum = pgEnum("dispatch_offer_state", [
  "offered",
  "pending_customer",
  "customer_accepted",
  "customer_declined",
  "accepted",
  "rejected",
  "timeout"
]);
export const verificationLevelEnum = pgEnum("verification_level", ["none", "basic", "enhanced"]);
export const riskTierEnum = pgEnum("risk_tier", ["low", "medium", "high"]);
export const driverAvailabilityEnum = pgEnum("driver_availability", ["offline", "available", "on_delivery", "unavailable"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);
export const accountTypeEnum = pgEnum("account_type", ["cheque", "savings", "transmission"]);
export const adminRoleEnum = pgEnum("admin_role", ["super_admin", "compliance_officer", "finance_manager", "support_agent"]);
export const documentTypeEnum = pgEnum("document_type", [
  "za_id",
  "passport",
  "drivers_license",
  "prdp",
  "vehicle_registration",
  "roadworthy_certificate",
  "insurance_certificate",
  "cipc_certificate",
  "vat_certificate",
  "tax_clearance",
  "bbbee_certificate",
  "dmre_license",
  "coid_certificate",
  "bank_statement",
  "proof_of_address",
  "msds",
  "safety_certificate",
  "other"
]);
export const ownerTypeEnum = pgEnum("owner_type", ["customer", "driver", "supplier", "vehicle"]);
export const priorityLevelEnum = pgEnum("priority_level", ["low", "medium", "high", "urgent"]);
export const paymentMethodTypeEnum = pgEnum("payment_method_type", ["bank_account", "credit_card", "debit_card"]);
export const addressVerificationStatusEnum = pgEnum("address_verification_status", ["pending", "verified", "rejected"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  // Order lifecycle - Customer
  "order_created",
  "order_awaiting_payment",
  "order_paid",
  "driver_assigned",
  "driver_en_route",
  "driver_arrived",
  "delivery_started",
  "delivery_complete",
  "order_cancelled",
  "order_refunded",
  
  // Dispatch & Offers - Driver
  "dispatch_offer_received",
  "offer_timeout_warning",
  "offer_expired",
  "customer_accepted_offer",
  "customer_declined_offer",
  
  // Order updates - Driver
  "order_accepted_by_customer",
  "pickup_ready",
  "delivery_instructions_updated",
  
  // Chat - Both Customer & Driver
  "new_message",
  "unread_messages_reminder",
  
  // Payment - All roles
  "payment_received",
  "payment_failed",
  "payment_processing",
  "payout_scheduled",
  "payout_completed",
  "payout_failed",
  
  // Supplier specific
  "new_order_for_supplier",
  "stock_low",
  "stock_critical",
  "order_fulfilled",
  "order_ready_for_pickup",
  "supplier_rating_received",
  
  // Driver specific
  "driver_rating_received",
  "shift_reminder",
  "document_expiring",
  "vehicle_inspection_due",
  
  // Customer specific
  "delivery_eta_update",
  "driver_location_shared",
  "price_estimate_available",
  "favorite_driver_available",
  
  // System & Admin
  "system_alert",
  "account_verification_required",
  "account_approved",
  "account_rejected",
  "account_suspended",
  "terms_updated",
  "maintenance_scheduled"
]);
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "location"]);
export const locationSourceEnum = pgEnum("location_source", ["gps", "network", "manual"]);
export const senderTypeEnum = pgEnum("sender_type", ["customer", "driver"]);

// Profiles table - id references Supabase auth.users(id)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(),
  role: roleEnum("role").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  phoneCountryCode: text("phone_country_code").default("+27"),
  currency: text("currency").notNull().default("ZAR"), // ISO 4217 currency code (ZAR, USD, EUR, etc.)
  profilePhotoUrl: text("profile_photo_url"),
  approvalStatus: approvalStatusEnum("approval_status").notNull().default("pending"),
  approvalReason: text("approval_reason"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressProvince: text("address_province"),
  addressPostalCode: text("address_postal_code"),
  addressCountry: text("address_country").default("South Africa"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// App Settings table
export const appSettings = pgTable("app_settings", {
  id: smallint("id").primaryKey().default(1),
  serviceFeePercent: numeric("service_fee_percent").notNull().default("5"),
  serviceFeeMinCents: integer("service_fee_min_cents").notNull().default(10000),
  baseDeliveryFeeCents: integer("base_delivery_fee_cents").notNull().default(35000),
  dispatchRadiusKm: numeric("dispatch_radius_km").notNull().default("50"),
  dispatchSlaSeconds: integer("dispatch_sla_seconds").notNull().default(120),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Fuel Types table
export const fuelTypes = pgTable("fuel_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Suppliers table - owner_id references auth.users(id)
export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  registeredName: text("registered_name").notNull(),
  tradingAs: text("trading_as"),
  name: text("name").notNull(),
  kybStatus: kycStatusEnum("kyb_status").notNull().default("pending"),
  registrationNumber: text("registration_number"),
  vatNumber: text("vat_number"),
  sarsTaxNumber: text("sars_tax_number"),
  bbbeeLevel: text("bbbee_level"),
  coidNumber: text("coid_number"),
  taxClearancePin: text("tax_clearance_pin"),
  dmreLicenseNumber: text("dmre_license_number"),
  dmreLicenseExpiry: timestamp("dmre_license_expiry"),
  bankAccountName: text("bank_account_name"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  branchCode: text("branch_code"),
  accountType: accountTypeEnum("account_type"),
  primaryContactName: text("primary_contact_name"),
  primaryContactPhone: text("primary_contact_phone"),
  primaryContactEmail: text("primary_contact_email"),
  serviceRegions: text("service_regions").array(),
  depotAddresses: jsonb("depot_addresses").default([]),
  safetyCertifications: text("safety_certifications").array(),
  msdsAvailable: boolean("msds_available").default(false),
  cipcNumber: text("cipc_number"),
  verifiedWithCipc: boolean("verified_with_cipc").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Depots table
export const depots = pgTable("depots", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  name: text("name").notNull(),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressProvince: text("address_province"),
  addressPostalCode: text("address_postal_code"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  openHours: jsonb("open_hours").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Depot Prices table
export const depotPrices = pgTable("depot_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  depotId: uuid("depot_id").notNull().references(() => depots.id),
  fuelTypeId: uuid("fuel_type_id").notNull().references(() => fuelTypes.id),
  priceCents: integer("price_cents").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Drivers table - user_id references auth.users(id)
export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  kycStatus: kycStatusEnum("kyc_status").notNull().default("pending"),
  zaIdNumber: text("za_id_number"),
  passportNumber: text("passport_number"),
  passportCountry: text("passport_country"),
  dob: timestamp("dob"),
  gender: genderEnum("gender"),
  driversLicenseNumber: text("drivers_license_number"),
  driversLicenseExpiry: timestamp("drivers_license_expiry"),
  prdpNumber: text("prdp_number"),
  prdpExpiry: timestamp("prdp_expiry"),
  sarsTaxNumber: text("sars_tax_number"),
  bankAccountName: text("bank_account_name"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  branchCode: text("branch_code"),
  accountType: accountTypeEnum("account_type"),
  nextOfKinName: text("next_of_kin_name"),
  nextOfKinPhone: text("next_of_kin_phone"),
  criminalCheckStatus: text("criminal_check_status").default("pending"),
  insuranceRequired: boolean("insurance_required").default(true),
  insuranceStatus: text("insurance_status").default("pending"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insuranceExpiry: timestamp("insurance_expiry"),
  onboardingChecklist: jsonb("onboarding_checklist").default({}),
  availabilityStatus: driverAvailabilityEnum("availability_status").default("offline"),
  rating: doublePrecision("rating"),
  completedTrips: integer("completed_trips").default(0),
  companyName: text("company_name"),
  cipcNumber: text("cipc_number"),
  verifiedWithCipc: boolean("verified_with_cipc").notNull().default(false),
  vehicleRegistration: text("vehicle_registration"),
  vehicleCapacityLitres: integer("vehicle_capacity_litres"),
  insuranceDocUrl: text("insurance_doc_url"),
  premiumStatus: text("premium_status").default("inactive"),
  jobRadiusPreferenceMiles: doublePrecision("job_radius_preference_miles").default(20),
  currentLat: doublePrecision("current_lat"),
  currentLng: doublePrecision("current_lng"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Vehicles table - linked to drivers
export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  registrationNumber: text("registration_number").notNull(),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  capacityLitres: integer("capacity_litres"),
  fuelTypes: text("fuel_types").array(),
  licenseDiskExpiry: timestamp("license_disk_expiry"),
  roadworthyExpiry: timestamp("roadworthy_expiry"),
  insuranceExpiry: timestamp("insurance_expiry"),
  trackerInstalled: boolean("tracker_installed").default(false),
  trackerProvider: text("tracker_provider"),
  vehicleRegistrationCertDocId: uuid("vehicle_registration_cert_doc_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Driver Suppliers junction table
export const driverSuppliers = pgTable("driver_suppliers", {
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Customers table - user_id references auth.users(id)
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  zaIdNumber: text("za_id_number"),
  dob: timestamp("dob"),
  companyName: text("company_name"),
  tradingAs: text("trading_as"),
  registrationNumber: text("registration_number"),
  vatNumber: text("vat_number"),
  sarsTaxNumber: text("sars_tax_number"),
  defaultPaymentMethodId: text("default_payment_method_id"),
  deliveryPreferences: text("delivery_preferences"),
  billingAddressStreet: text("billing_address_street"),
  billingAddressCity: text("billing_address_city"),
  billingAddressProvince: text("billing_address_province"),
  billingAddressPostalCode: text("billing_address_postal_code"),
  billingAddressCountry: text("billing_address_country"),
  riskTier: riskTierEnum("risk_tier").default("low"),
  verificationLevel: verificationLevelEnum("verification_level").default("none"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Delivery Addresses table
export const deliveryAddresses = pgTable("delivery_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  label: text("label").notNull(), // e.g., "Home", "Office", "Warehouse"
  addressStreet: text("address_street").notNull(),
  addressCity: text("address_city").notNull(),
  addressProvince: text("address_province").notNull(),
  addressPostalCode: text("address_postal_code").notNull(),
  addressCountry: text("address_country").notNull().default("South Africa"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accessInstructions: text("access_instructions"),
  verificationStatus: addressVerificationStatusEnum("verification_status").notNull().default("pending"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Payment Methods table
export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  methodType: paymentMethodTypeEnum("method_type").notNull(),
  label: text("label").notNull(), // e.g., "Personal Card", "Company Account"
  
  // Bank account fields
  bankName: text("bank_name"),
  accountHolderName: text("account_holder_name"),
  accountNumber: text("account_number"),
  branchCode: text("branch_code"),
  accountType: accountTypeEnum("account_type"),
  
  // Card fields (tokenized)
  cardLastFour: text("card_last_four"),
  cardBrand: text("card_brand"), // e.g., "Visa", "Mastercard"
  cardExpiryMonth: text("card_expiry_month"),
  cardExpiryYear: text("card_expiry_year"),
  paymentGatewayToken: text("payment_gateway_token"), // Stripe/PayFast token
  
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admins table - user_id references auth.users(id)
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  adminRole: adminRoleEnum("admin_role").notNull().default("support_agent"),
  permissions: jsonb("permissions").default({}),
  mfaEnabled: boolean("mfa_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Documents table - stores all uploaded files
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerType: ownerTypeEnum("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  docType: documentTypeEnum("doc_type").notNull(),
  title: text("title").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedBy: uuid("uploaded_by"),
  verificationStatus: text("verification_status").default("pending"),
  verifiedBy: uuid("verified_by"),
  verifiedAt: timestamp("verified_at"),
  expiryDate: timestamp("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Orders table
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  fuelTypeId: uuid("fuel_type_id").notNull().references(() => fuelTypes.id),
  
  // Fuel and pricing
  litres: numeric("litres").notNull(),
  fuelPriceCents: integer("fuel_price_cents").notNull(), // Cost per litre in cents
  deliveryFeeCents: integer("delivery_fee_cents").notNull(),
  serviceFeeCents: integer("service_fee_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  maxBudgetCents: integer("max_budget_cents"), // Customer's maximum budget cap (optional)
  
  // Delivery details
  deliveryAddressId: uuid("delivery_address_id").references(() => deliveryAddresses.id),
  dropLat: doublePrecision("drop_lat").notNull(),
  dropLng: doublePrecision("drop_lng").notNull(),
  accessInstructions: text("access_instructions"),
  deliveryDate: timestamp("delivery_date"),
  fromTime: timestamp("from_time"),
  toTime: timestamp("to_time"),
  priorityLevel: priorityLevelEnum("priority_level").notNull().default("medium"),
  
  // Vehicle/Equipment information
  vehicleRegistration: text("vehicle_registration"),
  equipmentType: text("equipment_type"),
  tankCapacity: numeric("tank_capacity"),
  
  // Payment and Legal
  paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
  termsAccepted: boolean("terms_accepted").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  signatureData: text("signature_data"), // Base64 encoded signature
  
  // Order management
  selectedDepotId: uuid("selected_depot_id").references(() => depots.id),
  state: orderStateEnum("state").notNull().default("created"),
  assignedDriverId: uuid("assigned_driver_id").references(() => drivers.id),
  confirmedDeliveryTime: timestamp("confirmed_delivery_time"),
  paidAt: timestamp("paid_at"),
  deliveredAt: timestamp("delivered_at"),
  deliverySignatureData: text("delivery_signature_data"),
  deliverySignatureName: text("delivery_signature_name"),
  deliverySignedAt: timestamp("delivery_signed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Dispatch Offers table
export const dispatchOffers = pgTable("dispatch_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  state: dispatchOfferStateEnum("state").notNull().default("offered"),
  proposedDeliveryTime: timestamp("proposed_delivery_time"),
  proposedPricePerKmCents: integer("proposed_price_per_km_cents"), // Driver's price per km in cents
  proposedNotes: text("proposed_notes"),
  customerResponseAt: timestamp("customer_response_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Proof of Delivery table
export const proofOfDelivery = pgTable("proof_of_delivery", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  photoUrl: text("photo_url"),
  signatureUrl: text("signature_url"),
  geotag: point("geotag"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Payments table
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  gatewayRef: text("gateway_ref"),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Order Attachments table - for proof of payment and other documents
export const orderAttachments = pgTable("order_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  attachmentType: text("attachment_type").notNull(), // e.g., "proof_of_payment", "invoice", "other"
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedBy: uuid("uploaded_by").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Driver Subscriptions table
export const driverSubscriptions = pgTable("driver_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  planCode: text("plan_code").notNull(),
  status: text("status").notNull(),
  nextBillingAt: timestamp("next_billing_at"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Driver Pricing table - drivers set their fuel price per liter per fuel type
export const driverPricing = pgTable("driver_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  fuelTypeId: uuid("fuel_type_id").notNull().references(() => fuelTypes.id),
  fuelPricePerLiterCents: integer("fuel_price_per_liter_cents").notNull(), // Driver's fuel price per liter in cents
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Pricing History table - journals all pricing changes for drivers and suppliers
export const pricingHistory = pgTable("pricing_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(), // "driver" or "depot"
  entityId: uuid("entity_id").notNull(), // driver_id or depot_id
  fuelTypeId: uuid("fuel_type_id").notNull().references(() => fuelTypes.id),
  oldPriceCents: integer("old_price_cents"),
  newPriceCents: integer("new_price_cents").notNull(),
  changedBy: uuid("changed_by").notNull(), // user_id who made the change
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Driver Inventories table - tracks current fuel stock for each driver
export const driverInventories = pgTable("driver_inventories", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  fuelTypeId: uuid("fuel_type_id").notNull().references(() => fuelTypes.id),
  currentLitres: numeric("current_litres", { precision: 10, scale: 2 }).notNull().default("0"),
  maxCapacityLitres: numeric("max_capacity_litres", { precision: 10, scale: 2 }).notNull(),
  lastRestockedAt: timestamp("last_restocked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueDriverFuel: unique("unique_driver_fuel").on(table.driverId, table.fuelTypeId),
}));

// Driver Locations table - GPS tracking history
export const driverLocations = pgTable("driver_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  orderId: uuid("order_id").references(() => orders.id), // Optional - track which order driver was on
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"), // GPS accuracy in meters
  heading: doublePrecision("heading"), // Direction of travel in degrees
  speed: doublePrecision("speed"), // Speed in km/h
  source: locationSourceEnum("source").notNull().default("gps"),
  isCurrent: boolean("is_current").notNull().default(true), // Flag for latest location
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  driverIdIdx: index("driver_locations_driver_id_idx").on(table.driverId),
  orderIdIdx: index("driver_locations_order_id_idx").on(table.orderId),
  createdAtIdx: index("driver_locations_created_at_idx").on(table.createdAt),
}));

// Notifications table
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // References auth.users(id) - ideally foreign key but Supabase auth is separate schema
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"), // Additional data (order_id, driver_id, etc.)
  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at"),
  deliveryStatus: text("delivery_status").default("pending"), // pending, sent, failed
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("notifications_user_id_idx").on(table.userId),
  readIdx: index("notifications_read_idx").on(table.read),
  userReadIdx: index("notifications_user_read_idx").on(table.userId, table.read),
}));

// Push Subscriptions table - for PWA push notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // References auth.users(id) - ideally foreign key but Supabase auth is separate schema
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("push_subscriptions_user_id_idx").on(table.userId),
}));

// Chat Threads table - conversation between customer and driver for an order
export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orderIdUnique: unique("chat_threads_order_id_unique").on(table.orderId),
  orderIdIdx: index("chat_threads_order_id_idx").on(table.orderId),
  customerIdIdx: index("chat_threads_customer_id_idx").on(table.customerId),
  driverIdIdx: index("chat_threads_driver_id_idx").on(table.driverId),
}));

// Chat Messages table
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => chatThreads.id),
  senderId: uuid("sender_id").notNull(), // References auth.users(id) - could be customer or driver
  senderType: senderTypeEnum("sender_type").notNull(), // Explicitly track if sender is customer or driver
  messageType: messageTypeEnum("message_type").notNull().default("text"),
  message: text("message").notNull(),
  attachmentUrl: text("attachment_url"), // For image/file messages
  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  threadIdIdx: index("chat_messages_thread_id_idx").on(table.threadId),
  threadCreatedIdx: index("chat_messages_thread_created_idx").on(table.threadId, table.createdAt),
}));

// Insert Schemas
export const insertProfileSchema = createInsertSchema(profiles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertFuelTypeSchema = createInsertSchema(fuelTypes).omit({ 
  id: true, 
  createdAt: true 
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDepotSchema = createInsertSchema(depots).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDepotPriceSchema = createInsertSchema(depotPrices).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDriverSchema = createInsertSchema(drivers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertOrderSchema = createInsertSchema(orders).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDispatchOfferSchema = createInsertSchema(dispatchOffers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertProofOfDeliverySchema = createInsertSchema(proofOfDelivery).omit({ 
  id: true, 
  createdAt: true 
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDriverSubscriptionSchema = createInsertSchema(driverSubscriptions).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDriverPricingSchema = createInsertSchema(driverPricing).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertPricingHistorySchema = createInsertSchema(pricingHistory).omit({ 
  id: true, 
  createdAt: true 
});

export const insertDriverInventorySchema = createInsertSchema(driverInventories).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDriverLocationSchema = createInsertSchema(driverLocations).omit({ 
  id: true, 
  createdAt: true 
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ 
  id: true, 
  createdAt: true 
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ 
  id: true, 
  createdAt: true 
});

export const insertChatThreadSchema = createInsertSchema(chatThreads).omit({ 
  id: true, 
  createdAt: true 
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ 
  id: true, 
  createdAt: true 
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertAdminSchema = createInsertSchema(admins).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertDeliveryAddressSchema = createInsertSchema(deliveryAddresses).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertOrderAttachmentSchema = createInsertSchema(orderAttachments).omit({ 
  id: true, 
  createdAt: true 
});

// Types
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;

export type InsertFuelType = z.infer<typeof insertFuelTypeSchema>;
export type FuelType = typeof fuelTypes.$inferSelect;

export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

export type InsertDepot = z.infer<typeof insertDepotSchema>;
export type Depot = typeof depots.$inferSelect;

export type InsertDepotPrice = z.infer<typeof insertDepotPriceSchema>;
export type DepotPrice = typeof depotPrices.$inferSelect;

export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type InsertDispatchOffer = z.infer<typeof insertDispatchOfferSchema>;
export type DispatchOffer = typeof dispatchOffers.$inferSelect;

export type InsertProofOfDelivery = z.infer<typeof insertProofOfDeliverySchema>;
export type ProofOfDelivery = typeof proofOfDelivery.$inferSelect;

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export type InsertDriverSubscription = z.infer<typeof insertDriverSubscriptionSchema>;
export type DriverSubscription = typeof driverSubscriptions.$inferSelect;

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertDeliveryAddress = z.infer<typeof insertDeliveryAddressSchema>;
export type DeliveryAddress = typeof deliveryAddresses.$inferSelect;

export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;

export type InsertOrderAttachment = z.infer<typeof insertOrderAttachmentSchema>;
export type OrderAttachment = typeof orderAttachments.$inferSelect;

export type InsertDriverPricing = z.infer<typeof insertDriverPricingSchema>;
export type DriverPricing = typeof driverPricing.$inferSelect;

export type InsertPricingHistory = z.infer<typeof insertPricingHistorySchema>;
export type PricingHistory = typeof pricingHistory.$inferSelect;

export type InsertDriverInventory = z.infer<typeof insertDriverInventorySchema>;
export type DriverInventory = typeof driverInventories.$inferSelect;

export type InsertDriverLocation = z.infer<typeof insertDriverLocationSchema>;
export type DriverLocation = typeof driverLocations.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export type InsertChatThread = z.infer<typeof insertChatThreadSchema>;
export type ChatThread = typeof chatThreads.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
