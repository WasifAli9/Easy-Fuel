CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('cheque', 'savings', 'transmission');--> statement-breakpoint
CREATE TYPE "public"."address_verification_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'compliance_officer', 'finance_manager', 'support_agent');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'needs_more_info', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."dispatch_offer_state" AS ENUM('offered', 'pending_customer', 'customer_accepted', 'customer_declined', 'accepted', 'rejected', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('za_id', 'passport', 'drivers_license', 'prdp', 'vehicle_registration', 'roadworthy_certificate', 'insurance_certificate', 'cipc_certificate', 'vat_certificate', 'tax_clearance', 'bbbee_certificate', 'dmre_license', 'coid_certificate', 'bank_statement', 'proof_of_address', 'msds', 'safety_certificate', 'dangerous_goods_training', 'medical_fitness', 'criminal_check', 'banking_proof', 'letter_of_authority', 'dg_vehicle_permit', 'environmental_authorisation', 'fire_certificate', 'sabs_certificate', 'calibration_certificate', 'public_liability_insurance', 'env_liability_insurance', 'site_license', 'fuel_trading_permit', 'other');--> statement-breakpoint
CREATE TYPE "public"."driver_availability" AS ENUM('offline', 'available', 'on_delivery', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('pending_compliance', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."driver_type" AS ENUM('individual', 'company_driver');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."id_type" AS ENUM('SA_ID', 'Passport');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."location_source" AS ENUM('gps', 'network', 'manual');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'location');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_created', 'order_awaiting_payment', 'order_paid', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'delivery_started', 'delivery_complete', 'order_cancelled', 'order_refunded', 'dispatch_offer_received', 'offer_timeout_warning', 'offer_expired', 'customer_accepted_offer', 'customer_declined_offer', 'order_accepted_by_customer', 'pickup_ready', 'delivery_instructions_updated', 'new_message', 'unread_messages_reminder', 'payment_received', 'payment_failed', 'payment_processing', 'payout_scheduled', 'payout_completed', 'payout_failed', 'new_order_for_supplier', 'stock_low', 'stock_critical', 'order_fulfilled', 'order_ready_for_pickup', 'supplier_rating_received', 'driver_rating_received', 'shift_reminder', 'document_expiring', 'vehicle_inspection_due', 'delivery_eta_update', 'driver_location_shared', 'price_estimate_available', 'favorite_driver_available', 'system_alert', 'account_verification_required', 'account_approved', 'account_rejected', 'account_suspended', 'terms_updated', 'maintenance_scheduled');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('created', 'awaiting_payment', 'paid', 'assigned', 'picked_up', 'en_route', 'delivered', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('customer', 'driver', 'supplier', 'vehicle');--> statement-breakpoint
CREATE TYPE "public"."payment_method_type" AS ENUM('bank_account', 'credit_card', 'debit_card');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('customer', 'driver', 'supplier', 'admin', 'company');--> statement-breakpoint
CREATE TYPE "public"."sender_type" AS ENUM('customer', 'driver');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('pending_compliance', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('pending_compliance', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."verification_level" AS ENUM('none', 'basic', 'enhanced');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"admin_role" "admin_role" DEFAULT 'support_agent' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb,
	"mfa_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"service_fee_percent" numeric DEFAULT '5' NOT NULL,
	"service_fee_min_cents" integer DEFAULT 10000 NOT NULL,
	"base_delivery_fee_cents" integer DEFAULT 35000 NOT NULL,
	"price_per_km_cents" integer DEFAULT 5000 NOT NULL,
	"dispatch_radius_km" numeric DEFAULT '50' NOT NULL,
	"dispatch_sla_seconds" integer DEFAULT 120 NOT NULL,
	"driver_radius_standard_miles" integer DEFAULT 200,
	"driver_radius_extended_miles" integer DEFAULT 500,
	"driver_radius_unlimited_miles" integer DEFAULT 999,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_type" "sender_type" NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"message" text NOT NULL,
	"attachment_url" text,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_threads_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"za_id_number" text,
	"dob" timestamp,
	"company_name" text,
	"trading_as" text,
	"registration_number" text,
	"vat_number" text,
	"sars_tax_number" text,
	"default_payment_method_id" text,
	"delivery_preferences" text,
	"billing_address_street" text,
	"billing_address_city" text,
	"billing_address_province" text,
	"billing_address_postal_code" text,
	"billing_address_country" text,
	"risk_tier" "risk_tier" DEFAULT 'low',
	"verification_level" "verification_level" DEFAULT 'none',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_street" text NOT NULL,
	"address_city" text NOT NULL,
	"address_province" text NOT NULL,
	"address_postal_code" text NOT NULL,
	"address_country" text DEFAULT 'South Africa' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"access_instructions" text,
	"verification_status" "address_verification_status" DEFAULT 'pending' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depot_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"depot_id" uuid NOT NULL,
	"fuel_type_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_street" text,
	"address_city" text,
	"address_province" text,
	"address_postal_code" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"open_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"state" "dispatch_offer_state" DEFAULT 'offered' NOT NULL,
	"proposed_delivery_time" timestamp,
	"proposed_price_per_km_cents" integer,
	"proposed_notes" text,
	"customer_response_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"doc_type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"uploaded_by" uuid,
	"verification_status" text DEFAULT 'pending',
	"verified_by" uuid,
	"verified_at" timestamp,
	"document_issue_date" timestamp,
	"expiry_date" timestamp,
	"document_rejection_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_company_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"company_id" uuid,
	"is_disabled_by_company" boolean DEFAULT false NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "driver_company_memberships_driver_id_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
CREATE TABLE "driver_depot_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"depot_id" uuid NOT NULL,
	"fuel_type_id" uuid NOT NULL,
	"litres" numeric NOT NULL,
	"actual_litres_delivered" numeric,
	"price_per_litre_cents" integer NOT NULL,
	"total_price_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text,
	"payment_method" text,
	"payment_proof_url" text,
	"payment_confirmed_at" timestamp,
	"payment_confirmed_by" uuid,
	"driver_signature_url" text,
	"driver_signed_at" timestamp,
	"supplier_signature_url" text,
	"supplier_signed_at" timestamp,
	"delivery_signature_url" text,
	"delivery_signed_at" timestamp,
	"pickup_date" timestamp,
	"completed_at" timestamp,
	"settlement_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_inventories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"fuel_type_id" uuid NOT NULL,
	"current_litres" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_capacity_litres" numeric(10, 2) NOT NULL,
	"last_restocked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_driver_fuel" UNIQUE("driver_id","fuel_type_id")
);
--> statement-breakpoint
CREATE TABLE "driver_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"order_id" uuid,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" double precision,
	"heading" double precision,
	"speed" double precision,
	"source" "location_source" DEFAULT 'gps' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"fuel_type_id" uuid NOT NULL,
	"fuel_price_per_liter_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer,
	"currency" text DEFAULT 'ZAR',
	"ozow_transaction_id" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"next_billing_at" timestamp,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_suppliers" (
	"driver_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"driver_type" "driver_type",
	"status" "driver_status" DEFAULT 'pending_compliance',
	"za_id_number" text,
	"passport_number" text,
	"passport_country" text,
	"id_type" "id_type",
	"id_issue_country" text,
	"dob" timestamp,
	"gender" "gender",
	"drivers_license_number" text,
	"license_code" text,
	"drivers_license_issue_date" timestamp,
	"drivers_license_expiry" timestamp,
	"prdp_number" text,
	"prdp_required" boolean DEFAULT false,
	"prdp_category" text,
	"prdp_issue_date" timestamp,
	"prdp_expiry" timestamp,
	"dg_training_required" boolean DEFAULT false,
	"dg_training_provider" text,
	"dg_training_certificate_number" text,
	"dg_training_issue_date" timestamp,
	"dg_training_expiry_date" timestamp,
	"criminal_check_status" text DEFAULT 'pending',
	"criminal_check_done" boolean DEFAULT false,
	"criminal_check_reference" text,
	"criminal_check_date" timestamp,
	"is_company_driver" boolean DEFAULT false,
	"company_id" uuid,
	"role_in_company" text,
	"sars_tax_number" text,
	"bank_account_name" text,
	"bank_name" text,
	"account_number" text,
	"branch_code" text,
	"account_type" "account_type",
	"next_of_kin_name" text,
	"next_of_kin_phone" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"province" text,
	"postal_code" text,
	"country" text DEFAULT 'South Africa',
	"insurance_required" boolean DEFAULT true,
	"insurance_status" text DEFAULT 'pending',
	"insurance_policy_number" text,
	"insurance_expiry" timestamp,
	"onboarding_checklist" jsonb DEFAULT '{}'::jsonb,
	"availability_status" "driver_availability" DEFAULT 'offline',
	"rating" double precision,
	"completed_trips" integer DEFAULT 0,
	"company_name" text,
	"cipc_number" text,
	"verified_with_cipc" boolean DEFAULT false NOT NULL,
	"vehicle_registration" text,
	"vehicle_capacity_litres" integer,
	"insurance_doc_url" text,
	"premium_status" text DEFAULT 'inactive',
	"subscription_tier" text,
	"job_radius_preference_miles" double precision DEFAULT 20,
	"current_lat" double precision,
	"current_lng" double precision,
	"compliance_status" text DEFAULT 'pending',
	"compliance_reviewer_id" uuid,
	"compliance_review_date" timestamp,
	"compliance_rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "local_auth_refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_auth_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"delivery_status" text DEFAULT 'pending',
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attachment_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"uploaded_by" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"fuel_type_id" uuid NOT NULL,
	"litres" numeric NOT NULL,
	"fuel_price_cents" integer NOT NULL,
	"delivery_fee_cents" integer NOT NULL,
	"service_fee_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"max_budget_cents" integer,
	"delivery_address_id" uuid,
	"drop_lat" double precision NOT NULL,
	"drop_lng" double precision NOT NULL,
	"access_instructions" text,
	"delivery_date" timestamp,
	"from_time" timestamp,
	"to_time" timestamp,
	"priority_level" "priority_level" DEFAULT 'medium' NOT NULL,
	"vehicle_registration" text,
	"equipment_type" text,
	"tank_capacity" numeric,
	"payment_method_id" uuid,
	"terms_accepted" boolean DEFAULT false NOT NULL,
	"terms_accepted_at" timestamp,
	"signature_data" text,
	"selected_depot_id" uuid,
	"state" "order_state" DEFAULT 'created' NOT NULL,
	"assigned_driver_id" uuid,
	"confirmed_delivery_time" timestamp,
	"paid_at" timestamp,
	"delivered_at" timestamp,
	"delivery_signature_data" text,
	"delivery_signature_name" text,
	"delivery_signed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"method_type" "payment_method_type" NOT NULL,
	"label" text NOT NULL,
	"bank_name" text,
	"account_holder_name" text,
	"account_number" text,
	"branch_code" text,
	"account_type" "account_type",
	"card_last_four" text,
	"card_brand" text,
	"card_expiry_month" text,
	"card_expiry_year" text,
	"payment_gateway_token" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway_ref" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"fuel_type_id" uuid NOT NULL,
	"old_price_cents" integer,
	"new_price_cents" integer NOT NULL,
	"changed_by" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"phone_country_code" text DEFAULT '+27',
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"profile_photo_url" text,
	"approval_status" "approval_status" DEFAULT 'pending' NOT NULL,
	"approval_reason" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"address_street" text,
	"address_city" text,
	"address_province" text,
	"address_postal_code" text,
	"address_country" text DEFAULT 'South Africa',
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_of_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"photo_url" text,
	"signature_url" text,
	"geotag" "point",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_subscription_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"status" text NOT NULL,
	"ozow_transaction_id" text,
	"paid_at" timestamp,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_type" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"total_cents" integer NOT NULL,
	"status" text NOT NULL,
	"settlement_type" text NOT NULL,
	"paid_at" timestamp,
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_subscription_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"status" text NOT NULL,
	"ozow_transaction_id" text,
	"paid_at" timestamp,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer,
	"currency" text DEFAULT 'ZAR',
	"ozow_transaction_id" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"next_billing_at" timestamp,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"registered_name" text NOT NULL,
	"trading_as" text,
	"name" text NOT NULL,
	"kyb_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"status" "supplier_status" DEFAULT 'pending_compliance',
	"registration_number" text,
	"director_names" text[],
	"registered_address" text,
	"vat_number" text,
	"vat_certificate_expiry" timestamp,
	"sars_tax_number" text,
	"tax_clearance_number" text,
	"tax_clearance_expiry" timestamp,
	"tax_clearance_pin" text,
	"bbbee_level" text,
	"coid_number" text,
	"dmre_license_number" text,
	"wholesale_license_issue_date" timestamp,
	"dmre_license_expiry" timestamp,
	"allowed_fuel_types" text[],
	"site_license_number" text,
	"depot_address" text,
	"permit_number" text,
	"permit_expiry_date" timestamp,
	"environmental_auth_number" text,
	"approved_storage_capacity_litres" integer,
	"fire_certificate_number" text,
	"fire_certificate_issue_date" timestamp,
	"fire_certificate_expiry_date" timestamp,
	"hse_file_verified" boolean DEFAULT false,
	"hse_file_last_updated" timestamp,
	"spill_compliance_confirmed" boolean DEFAULT false,
	"sabs_certificate_number" text,
	"sabs_certificate_issue_date" timestamp,
	"sabs_certificate_expiry_date" timestamp,
	"calibration_certificate_number" text,
	"calibration_certificate_issue_date" timestamp,
	"calibration_certificate_expiry_date" timestamp,
	"public_liability_policy_number" text,
	"public_liability_insurance_provider" text,
	"public_liability_coverage_amount_rands" integer,
	"public_liability_policy_expiry_date" timestamp,
	"env_insurance_number" text,
	"env_insurance_expiry_date" timestamp,
	"bank_account_name" text,
	"bank_name" text,
	"account_number" text,
	"branch_code" text,
	"account_type" "account_type",
	"primary_contact_name" text,
	"primary_contact_phone" text,
	"primary_contact_email" text,
	"service_regions" text[],
	"depot_addresses" jsonb DEFAULT '[]'::jsonb,
	"safety_certifications" text[],
	"msds_available" boolean DEFAULT false,
	"cipc_number" text,
	"verified_with_cipc" boolean DEFAULT false NOT NULL,
	"compliance_status" text DEFAULT 'pending',
	"compliance_reviewer_id" uuid,
	"compliance_review_date" timestamp,
	"compliance_rejection_reason" text,
	"subscription_tier" text,
	"account_manager_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid,
	"company_id" uuid,
	"registration_number" text NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"capacity_litres" integer,
	"fuel_types" text[],
	"vehicle_status" "vehicle_status" DEFAULT 'pending_compliance',
	"vehicle_reg_certificate_number" text,
	"license_disk_expiry" timestamp,
	"roadworthy_expiry" timestamp,
	"roadworthy_certificate_number" text,
	"roadworthy_issue_date" timestamp,
	"dg_vehicle_permit_required" boolean DEFAULT false,
	"dg_vehicle_permit_number" text,
	"dg_vehicle_permit_issue_date" timestamp,
	"dg_vehicle_permit_expiry_date" timestamp,
	"vehicle_insured" boolean DEFAULT false,
	"insurance_provider" text,
	"policy_number" text,
	"policy_expiry_date" timestamp,
	"insurance_expiry" timestamp,
	"loa_required" boolean DEFAULT false,
	"loa_issue_date" timestamp,
	"loa_expiry_date" timestamp,
	"tracker_installed" boolean DEFAULT false,
	"tracker_provider" text,
	"vehicle_registration_cert_doc_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_addresses" ADD CONSTRAINT "delivery_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_prices" ADD CONSTRAINT "depot_prices_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depot_prices" ADD CONSTRAINT "depot_prices_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depots" ADD CONSTRAINT "depots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_company_memberships" ADD CONSTRAINT "driver_company_memberships_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_company_memberships" ADD CONSTRAINT "driver_company_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_depot_orders" ADD CONSTRAINT "driver_depot_orders_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_depot_orders" ADD CONSTRAINT "driver_depot_orders_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_depot_orders" ADD CONSTRAINT "driver_depot_orders_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_depot_orders" ADD CONSTRAINT "driver_depot_orders_payment_confirmed_by_profiles_id_fk" FOREIGN KEY ("payment_confirmed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_inventories" ADD CONSTRAINT "driver_inventories_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_inventories" ADD CONSTRAINT "driver_inventories_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_pricing" ADD CONSTRAINT "driver_pricing_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_pricing" ADD CONSTRAINT "driver_pricing_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_subscriptions" ADD CONSTRAINT "driver_subscriptions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_suppliers" ADD CONSTRAINT "driver_suppliers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_suppliers" ADD CONSTRAINT "driver_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_auth_refresh_tokens" ADD CONSTRAINT "local_auth_refresh_tokens_user_id_local_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."local_auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_delivery_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."delivery_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_selected_depot_id_depots_id_fk" FOREIGN KEY ("selected_depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_driver_id_drivers_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_history" ADD CONSTRAINT "pricing_history_fuel_type_id_fuel_types_id_fk" FOREIGN KEY ("fuel_type_id") REFERENCES "public"."fuel_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_driver_subscription_id_driver_subscriptions_id_fk" FOREIGN KEY ("driver_subscription_id") REFERENCES "public"."driver_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoice_templates" ADD CONSTRAINT "supplier_invoice_templates_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_settlements" ADD CONSTRAINT "supplier_settlements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_subscription_payments" ADD CONSTRAINT "supplier_subscription_payments_supplier_subscription_id_supplier_subscriptions_id_fk" FOREIGN KEY ("supplier_subscription_id") REFERENCES "public"."supplier_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_subscriptions" ADD CONSTRAINT "supplier_subscriptions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_id_idx" ON "chat_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_threads_order_id_idx" ON "chat_threads" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "chat_threads_customer_id_idx" ON "chat_threads" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "chat_threads_driver_id_idx" ON "chat_threads" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_depot_orders_driver_id_idx" ON "driver_depot_orders" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_depot_orders_depot_id_idx" ON "driver_depot_orders" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "driver_depot_orders_status_idx" ON "driver_depot_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "driver_depot_orders_created_at_idx" ON "driver_depot_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "driver_depot_orders_settlement_id_idx" ON "driver_depot_orders" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "driver_locations_driver_id_idx" ON "driver_locations" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_locations_order_id_idx" ON "driver_locations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "driver_locations_created_at_idx" ON "driver_locations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");