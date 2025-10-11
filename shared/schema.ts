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
  point
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["customer", "driver", "supplier", "admin"]);
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
  "accepted",
  "rejected",
  "timeout"
]);

// Profiles table - id references Supabase auth.users(id)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(),
  role: roleEnum("role").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
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
  name: text("name").notNull(),
  kybStatus: kycStatusEnum("kyb_status").notNull().default("pending"),
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
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  openHours: jsonb("open_hours").notNull().default({}),
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
  companyName: text("company_name"),
  cipcNumber: text("cipc_number"),
  verifiedWithCipc: boolean("verified_with_cipc").notNull().default(false),
  vehicleRegistration: text("vehicle_registration"),
  vehicleCapacityLitres: integer("vehicle_capacity_litres"),
  insuranceDocUrl: text("insurance_doc_url"),
  premiumStatus: text("premium_status").default("inactive"),
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
  companyName: text("company_name"),
  vatNumber: text("vat_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Orders table
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  fuelTypeId: uuid("fuel_type_id").notNull().references(() => fuelTypes.id),
  litres: numeric("litres").notNull(),
  dropLat: doublePrecision("drop_lat").notNull(),
  dropLng: doublePrecision("drop_lng").notNull(),
  timeWindow: jsonb("time_window"),
  fuelPriceCents: integer("fuel_price_cents").notNull(),
  deliveryFeeCents: integer("delivery_fee_cents").notNull(),
  serviceFeeCents: integer("service_fee_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  selectedDepotId: uuid("selected_depot_id").references(() => depots.id),
  state: orderStateEnum("state").notNull().default("created"),
  assignedDriverId: uuid("assigned_driver_id").references(() => drivers.id),
  paidAt: timestamp("paid_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Dispatch Offers table
export const dispatchOffers = pgTable("dispatch_offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  state: dispatchOfferStateEnum("state").notNull().default("offered"),
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
