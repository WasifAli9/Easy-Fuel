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

## External Dependencies
- **Supabase**: Provides PostgreSQL database, authentication services, and object storage.
- **PayFast**: Payment gateway integration (pending).
- **ZeptoMail**: SMTP service used for email communications (e.g., OTP/Magic Link).