# Easy Fuel ZA - Production Fuel Delivery Marketplace

## Overview
Easy Fuel ZA is a production-ready fuel delivery marketplace for South Africa. It connects customers, vetted drivers, and suppliers to facilitate fuel delivery. The platform supports multi-role authentication, intelligent dispatch with SLA-based driver scoring, KYC/KYB workflows with document verification, PayFast payment integration, real-time order tracking, and comprehensive admin controls. The project aims to capture a significant share of the South African fuel delivery market by providing a robust and efficient solution.

## User Preferences
- **Database**: Supabase (not Replit database)
- **Authentication**: Supabase Auth (not Replit Auth)
- **Branding**: Easy Fuel teal (#1fbfb8/#0e6763)
- **Target Market**: South Africa
- **Design**: Mobile-first PWA
- **Architecture**: Production-ready with scalability

## System Architecture

### Design System and UI/UX
The application features a mobile-first design optimized for various screen sizes, incorporating the Easy Fuel teal branding (`#1fbfb8` primary, `#0e6763` primary dark). It includes full dark mode support with automatic theme switching, using HSL-based color tokens for flexibility. The UI is built with React, styled using Tailwind CSS and shadcn/ui, and leverages a component library for consistent elements like logos, cards, and forms.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite, Wouter for routing, and TanStack Query for state management.
- **Backend**: Express and Node.js for API services.
- **Database**: Supabase (PostgreSQL) with Drizzle as the ORM.
- **Authentication**: Supabase Auth with Email OTP/Magic Link, providing robust role-based access control (Customer, Driver, Supplier, Admin) and protected routes.
- **Storage**: Object storage integration with presigned URLs for secure file uploads, supporting public ACL for profile pictures and private ACL for sensitive documents.
- **Order Management**: Comprehensive CRUD API for orders, including depot-based pricing, state-based validation, delivery address management, payment method management, electronic signature capture, and vehicle/equipment details.
- **Security**: Implementation of `requireAuth` and `requireAdmin` middleware for API endpoint protection, ensuring only authorized and appropriate roles can access specific resources.

### Feature Specifications
- **User Roles**: Distinct roles for Customer (order fuel), Driver (accept jobs, manage dispatches), Supplier (manage depots, inventory, pricing), and Admin (system management, KYC/KYB verification).
- **Database Schema**: A comprehensive 17-table schema managing profiles, customer/driver/supplier-specific data, orders, delivery addresses, payment methods, order attachments, dispatch offers, fuel types, depots, payments, proof of delivery, KYC documents, app settings, and driver scores.
- **User Profile Management**: Allows users to manage their profiles, including role selection during setup.
- **Admin Dashboard**: Card-based dashboard with enhanced user management, search filters, and summary statistics.
- **Vehicle Management**: CRUD operations for driver vehicles (registration, capacity, compliance).

## External Dependencies
- **Supabase**: Backend-as-a-Service for database (PostgreSQL), authentication, and object storage.
- **PayFast**: Payment gateway integration (pending).
- **ZeptoMail**: SMTP service for email communication (implemented for email OTP/Magic Link).

## Recent Changes (October 2025)

### Enhanced Customer Order Management System ✅
Completed comprehensive enhancement of the customer order flow with production-ready features:

#### New Database Tables
1. **delivery_addresses** - Customer saved delivery locations
   - Fields: label, full address (street/city/province/postal), lat/lng, access_instructions, is_default, verification_status
   - Supports multiple addresses per customer with default selection
   
2. **payment_methods** - Payment method management
   - Supports bank accounts (account_holder, account_number, branch_code, account_type)
   - Supports cards (card_last_four, card_brand, expiry_month/year)
   - Payment gateway token support for PayFast integration
   - Soft delete (is_active flag) and default method selection
   
3. **order_attachments** - Order-related file management
   - Stores proof of payment, invoices, delivery receipts
   - Links to object storage with file metadata

#### Enhanced Orders Table (15+ New Fields)
- `delivery_address_id` - FK to delivery_addresses
- `from_time`, `to_time` - Delivery time window (replaced single text field)
- `priority_level` - low/medium/high (enum)
- `access_instructions` - Driver access details
- `vehicle_registration`, `equipment_type`, `tank_capacity` - Vehicle/equipment details
- `payment_method_id` - FK to payment_methods
- `terms_accepted`, `terms_accepted_at` - Legal compliance
- `signature_data` - Electronic signature (base64)

#### New API Endpoints (server/customer-routes.ts)
- `GET /api/customer/delivery-addresses` - List saved addresses
- `POST /api/customer/delivery-addresses` - Create new address
- `PATCH /api/customer/delivery-addresses/:id` - Update address
- `DELETE /api/customer/delivery-addresses/:id` - Delete address
- `GET /api/customer/payment-methods` - List payment methods
- `POST /api/customer/payment-methods` - Add payment method
- `DELETE /api/customer/payment-methods/:id` - Remove payment method (soft delete)
- `POST /api/orders` - **Enhanced** to accept all new order fields with validation

#### New UI Components
1. **CreateOrderDialog** (client/src/components/CreateOrderDialog.tsx)
   - Tabbed interface (4 tabs: Fuel, Delivery, Vehicle, Payment)
   - Delivery address dropdown (fetches saved addresses)
   - Time window with from/to time pickers
   - Vehicle/equipment section with validation
   - Payment method selection
   - Electronic signature canvas (HTML5 canvas with touch/mouse support)
   - Terms acceptance checkbox with validation
   - Priority level selection
   - Comprehensive form validation with zod

2. **DeliveryAddressManager** (client/src/components/DeliveryAddressManager.tsx)
   - Full CRUD interface for delivery addresses
   - Card-based layout with add/edit/delete actions
   - Default address marking with Star badge
   - Address verification status display
   - Access instructions management
   - Responsive grid layout

#### Validation & Security
- Frontend: Zod schema validation for all fields including tank capacity numeric validation
- Backend: Server-side validation guards (terms acceptance, numeric fields, address ownership)
- Authorization: All endpoints verify customer ownership before CRUD operations
- Default handling: Automatically unsets other defaults when setting new default address/payment method

### Next Steps Required
⚠️ **Database Migration Required**: User must run `npm run db:push` and select "create column" when prompted for delivery_address_id to push schema changes to Supabase database.

### Integration Points
- Ready for PayFast payment gateway integration (payment_gateway_token field present)
- Ready for order attachment uploads (order_attachments table ready)
- Signature data stored as base64 for POD (proof of delivery) integration
- Vehicle/equipment details support fleet management features

### Enhanced Admin Driver Details View ✅
Completed comprehensive admin interface for viewing and managing driver information:

#### Backend Enhancements (server/admin-routes.ts)
1. **Enhanced GET /api/admin/users/:userId**:
   - Now fetches email from Supabase Auth (admin.getUserById)
   - Fetches driver's vehicles from vehicles table with full details
   - Returns complete driver profile with vehicles array
   
2. **Enhanced PATCH /api/admin/users/:userId**:
   - Added email update capability via Supabase Auth admin API
   - Added availability_status update support for drivers
   - Maintains all existing profile and role-specific field updates

#### Frontend Enhancements (client/src/components/UserDetailsDialogEnhanced.tsx)
1. **Email Management**:
   - Added email field to Profile tab with display and edit capability
   - Email is fetched from Supabase Auth and can be updated by admin
   - Field includes proper validation and testid attributes

2. **Driver Availability Status**:
   - Made availability_status editable via dropdown (offline/online/busy)
   - Located in Details tab under driver information
   - Allows admin to manually override driver availability

3. **New Vehicles Tab** (Driver-only):
   - Conditionally displayed 5th tab for drivers
   - Shows comprehensive vehicle information:
     - Vehicle count badge
     - Vehicle cards with make, model, year, registration
     - Capacity display in liters
     - Supported fuel types
     - Tracker installation status and provider
     - Expiry dates: license disk, roadworthy, insurance
   - Empty state with appropriate messaging
   - Fully responsive card layout

4. **Fixed Dialog Accessibility**:
   - Fixed DialogDescription nesting warnings
   - Moved badges outside DialogDescription to prevent DOM nesting errors
   - Added proper DialogDescription text content
   - Maintains Radix UI accessibility standards

#### Features Implemented
✅ View and edit driver email addresses
✅ View all driver vehicles with detailed specifications
✅ View vehicle capacities for fleet management
✅ Toggle driver availability status (in-service control)
✅ Fixed dialog accessibility issues

#### Technical Notes
- No driver-specific pricing history exists (pricing is depot-based via depot_prices table)
- Vehicles are linked to drivers via driver_id foreign key
- Email updates use Supabase Auth admin API for security
- All changes maintain existing validation and authorization patterns