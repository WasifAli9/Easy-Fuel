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
- **Database Schema**: A 17-table schema manages profiles, orders, delivery addresses, payment methods, attachments, dispatch offers, fuel types, depots, payments, KYC documents, and driver scores.
- **User Profile Management**: Allows users to manage their profiles, including initial role selection.
- **Admin Dashboard**: Provides card-based interface with user management, search filters, and summary statistics.
- **Vehicle Management**: CRUD operations for driver vehicles, including registration, capacity, and compliance.

## External Dependencies
- **Supabase**: Provides PostgreSQL database, authentication services, and object storage.
- **PayFast**: Payment gateway integration (pending).
- **ZeptoMail**: SMTP service used for email communications (e.g., OTP/Magic Link).