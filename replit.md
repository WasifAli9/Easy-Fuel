# Easy Fuel ZA - Production Fuel Delivery Marketplace

## Overview
Easy Fuel ZA is a production-ready fuel delivery marketplace for South Africa, connecting customers, vetted drivers, and suppliers. The platform offers multi-role authentication, intelligent dispatch with SLA-based driver scoring, KYC/KYB workflows with document verification, PayFast integration, real-time order tracking, and comprehensive admin controls. The project's ambition is to secure a significant share of the South African fuel delivery market through an efficient and robust solution.

## User Preferences
- **Database**: Supabase (not Replit database)
- **Authentication**: Supabase Auth (not Replit Auth)
- **Branding**: Easy Fuel teal (#1fbfb8/#0e6763)
- **Target Market**: South Africa
- **Design**: Mobile-first PWA
- **Architecture**: Production-ready with scalability

## System Architecture

### Design System and UI/UX
The application features a mobile-first, responsive design with full dark mode support, utilizing HSL-based color tokens for theming. The UI is built with React, styled using Tailwind CSS and shadcn/ui, and adheres to the Easy Fuel teal brand identity (`#1fbfb8` primary, `#0e6763` primary dark). A custom component library ensures consistency across the platform.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite, Wouter for routing, and TanStack Query for state management.
- **Backend**: Express and Node.js for API services.
- **Database**: Supabase (PostgreSQL) with Drizzle as the ORM.
- **Authentication**: Supabase Auth provides robust role-based access control (Customer, Driver, Supplier, Admin) via Email OTP/Magic Link, securing all routes.
- **Storage**: Object storage with presigned URLs manages file uploads, supporting both public and private access control lists (ACLs) for various document types.
- **Order Management**: Features a comprehensive CRUD API supporting depot-based pricing, state-based validation, delivery/payment method management, electronic signature capture, and vehicle/equipment details.
- **Security**: API endpoints are protected using `requireAuth` and `requireAdmin` middleware to enforce role-based access.

### Feature Specifications
- **User Roles**: Distinct roles for Customers (order fuel), Drivers (accept jobs), Suppliers (manage depots, inventory), and Admins (system management, KYC/KYB).
- **Database Schema**: A 17-table schema manages profiles, orders, delivery addresses, payment methods, attachments, dispatch offers, fuel types, depots, payments, KYC documents, and driver scores. Schema includes `profile_photo_url` column for user avatars (requires `npm run db:push` to sync).
- **Fuel Types**: Comprehensive coverage of all typical African gas station fuel types (10 total):
  - Diesel 500ppm, Diesel 50ppm (Ultra Low Sulphur)
  - Petrol 93, Petrol 95, Petrol 97 (Premium Unleaded), Unleaded Petrol
  - LPG (Liquefied Petroleum Gas)
  - AdBlue (Diesel Exhaust Fluid)
  - Paraffin, Illuminating Paraffin
  - Jet A1 (Aviation fuel)
- **Customer Self-Service Features**:
  - **Profile Management**: View and edit personal information, company details, and billing address
  - **Saved Delivery Addresses**: Full CRUD operations with:
    - Multiple saved addresses per customer
    - Default address selection
    - South African provinces dropdown
    - GPS coordinates (lat/lng) for precise location
    - **Automatic Geocoding**: Uses OpenStreetMap Nominatim API to automatically convert addresses to GPS coordinates
    - Access instructions for delivery drivers
    - Address verification status tracking
    - **Inline Address Creation**: Create new delivery addresses directly from the order creation dialog without navigating away - newly created addresses are automatically selected
  - **Payment Methods Management**: Full CRUD operations with:
    - Support for South African bank accounts (EFT) with account holder name, bank name, account number, branch code, and account type (cheque/savings/transmission)
    - Support for credit and debit cards with card brand, last 4 digits, and expiry date
    - Default payment method selection for quick checkout
    - Secure storage with sensitive data masked in UI
    - Dedicated page accessible from desktop and mobile navigation
  - **Navigation**: Desktop and mobile navigation links in AppHeader for easy access to Orders, Saved Addresses, Payment Methods, and Profile
- **User Profile Management**: Allows users to manage their profiles, including initial role selection and profile picture uploads.
- **Admin Dashboard**: 
  - Card-based interface with user management, search filters, and summary statistics
  - Consistent card layout across all entity types (Customer/Driver/Supplier)
  - All cards display: company name as title, contact person name, email, phone, and role-specific fields
  - Email data fetched from Supabase Auth for accuracy
  - Profile pictures supported with object storage ACLs and database persistence
  - Graceful degradation for missing database columns (backwards compatible)
- **Vehicle Management**: CRUD operations for driver vehicles, including registration, capacity, and compliance.
- **Intelligent Driver Dispatch System**: 
  - **Premium Driver Prioritization**: Premium drivers (with active subscriptions) receive exclusive 5-minute access to new order offers
  - **Tiered Dispatch Flow**: 
    1. Premium drivers receive offers immediately upon order creation (5-minute expiry)
    2. Regular drivers receive offers only after the 5-minute premium window expires (15-minute expiry)
    3. Regular offers are only created if the order hasn't been accepted by a premium driver
  - **Driver Acceptance Workflow**: 
    1. Driver views pending offers on their dashboard
    2. Driver accepts offer and inputs confirmed delivery time
    3. System automatically:
       - Updates order state to "assigned"
       - Sets driver availability to "on_delivery"
       - Sends email to customer via Resend with driver details (name, phone) and confirmed delivery time
    4. Customer dashboard displays assigned driver information and confirmed delivery time
  - **Technical Implementation**: 
    - Dispatch service (`server/dispatch-service.ts`) handles offer creation with setTimeout-based delayed notifications
    - Email service (`server/email-service.ts`) integrates with Resend for customer notifications
    - Driver routes (`server/driver-routes.ts`) provide API endpoints for viewing, accepting, and rejecting offers
    - `confirmed_delivery_time` field added to orders table for driver-confirmed scheduling
  - **Note**: Current implementation uses in-process setTimeout. For production resilience, consider replacing with a durable scheduler/queue system that survives process restarts.
- **Pricing Management System**:
  - **Driver Pricing**: Drivers can set delivery fees (in Rands) per fuel type via "Pricing" tab on their dashboard
    - Real-time pricing updates with inline editing
    - Optional notes field for documenting price changes
    - Pricing history with old→new price transitions
    - API: `/api/driver/pricing` (GET all), `/api/driver/pricing/:fuelTypeId` (PUT), `/api/driver/pricing/history` (GET)
  - **Supplier Pricing**: Suppliers manage fuel prices (per litre) for each depot via "Pricing" tab on their dashboard
    - Depot selection dropdown to choose which depot to manage
    - Real-time pricing updates per fuel type with inline editing
    - Optional notes field for documenting price changes
    - Pricing history per depot showing all changes
    - API: `/api/supplier/depots` (GET all depots), `/api/supplier/depots/:depotId/pricing` (GET), `/api/supplier/depots/:depotId/pricing/:fuelTypeId` (PUT), `/api/supplier/depots/:depotId/pricing/history` (GET)
  - **Database Tables**:
    - `driver_pricing`: Stores delivery fees (delivery_fee_cents) per driver per fuel type
    - `depot_prices`: Stores fuel prices (price_cents) per depot per fuel type (existing table, used for supplier pricing)
    - `pricing_history`: Audit trail for all pricing changes with entity_type ('driver'/'depot'), old/new prices, timestamps, changed_by user, and optional notes. Note: Supplier pricing uses entity_type='depot' to maintain per-depot audit trails.
  - **Technical Implementation**:
    - Backend: Express routes in `server/driver-routes.ts` and `server/supplier-routes.ts` with authentication middleware
    - Frontend: React components `DriverPricingManager` and `SupplierPricingManager` using TanStack Query
    - All pricing mutations automatically log changes to pricing_history table
    - Currency formatting uses South African Rand (R) convention

- **Driver Vehicle Management**: Complete CRUD functionality for drivers to manage multiple vehicles from their dashboard
  - **Features**:
    - "Vehicles" tab on driver dashboard with add/edit/delete operations
    - Vehicle information: registration number, make, model, year, capacity (litres)
    - Supported fuel types selection (multi-select from all available fuel types)
    - Compliance document tracking: license disk expiry, roadworthy expiry, insurance expiry
    - Tracker information: tracker installed status and provider name
  - **API Routes**: `/api/driver/vehicles` (GET all, POST create), `/api/driver/vehicles/:vehicleId` (PATCH update, DELETE delete)
  - **Database**: Uses existing `vehicles` table with driver_id foreign key
  - **UI Component**: `DriverVehicleManager` component with dialog-based add/edit forms
  - **Security**: All endpoints verify driver ownership via authenticated user.id → driver.id lookup

## Known Issues
- **PostgREST Schema Cache**: After creating new tables (`driver_pricing`, `pricing_history`), PostgREST's schema cache may not immediately reflect changes, resulting in "table not found in schema cache" errors
  - **Temporary Solution**: Wait 5-10 minutes for automatic cache refresh, or manually run `NOTIFY pgrst, 'reload schema';` in database console
  - **Root Cause**: PostgREST caches database schema for performance; manual NOTIFY commands may not propagate immediately in hosted environments
  - **Permanent Fix**: Ensure proper migration workflow using `npm run db:push --force` to sync schema changes

## External Dependencies
- **Supabase**: Provides PostgreSQL database, authentication services, and object storage.
- **PayFast**: Payment gateway integration (pending).
- **ZeptoMail**: SMTP service used for email communications (e.g., OTP/Magic Link).