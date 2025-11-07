# Easy Fuel ZA - Production Fuel Delivery Marketplace

## Overview
Easy Fuel ZA is a production-ready fuel delivery marketplace for South Africa, connecting customers, vetted drivers, and suppliers. The platform aims to secure a significant share of the South African fuel delivery market by offering multi-role authentication, intelligent dispatch with SLA-based driver scoring, KYC/KYB workflows with document verification, PayFast integration, real-time order tracking, and comprehensive admin controls.

## User Preferences
- **Database**: Supabase (not Replit database)
- **Authentication**: Supabase Auth (not Replit Auth)
- **Branding**: Easy Fuel teal (#1fbfb8/#0e6763)
- **Target Market**: South Africa
- **Design**: Mobile-first PWA
- **Architecture**: Production-ready with scalability

## System Architecture

### Design System and UI/UX
The application features a mobile-first, responsive design with full dark mode support, utilizing HSL-based color tokens for theming. The UI is built with React, styled using Tailwind CSS and shadcn/ui, adhering to the Easy Fuel teal brand identity. A custom component library ensures consistency, with specific responsiveness patterns for dashboards.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite, Wouter for routing, and TanStack Query for state management.
- **Backend**: Express and Node.js for API services.
- **Database**: Supabase (PostgreSQL) with Drizzle as the ORM.
- **Authentication**: Supabase Auth for robust role-based access control (Customer, Driver, Supplier, Admin) via Email OTP/Magic Link, securing all routes.
- **Storage**: Object storage with presigned URLs for file uploads, supporting public and private ACLs.
- **Order Management**: Comprehensive CRUD API supporting depot-based pricing, state-based validation, delivery/payment method management, electronic signature capture, and vehicle/equipment details.
- **Security**: API endpoints are protected using `requireAuth` and `requireAdmin` middleware.

### Feature Specifications
- **User Roles**: Distinct roles for Customers, Drivers, Suppliers, and Admins.
- **Database Schema**: A 17-table schema manages profiles, orders, delivery addresses, payment methods, attachments, dispatch offers, fuel types, depots, payments, KYC documents, and driver scores.
- **Fuel Types**: Comprehensive coverage of 10 typical African gas station fuel types (e.g., Diesel 500ppm, Petrol 95, LPG, AdBlue).
- **Customer Self-Service**: Profile management, CRUD for saved delivery addresses (with auto-geocoding via OpenStreetMap Nominatim), and payment methods (South African bank accounts, credit/debit cards).
- **User Profile Management**: Allows users to manage profiles, including initial role selection and profile picture uploads.
- **Admin Dashboard**: Card-based interface for user management, search filters, and summary statistics, displaying company name, contact, email, phone, and role-specific fields.
- **Vehicle Management**: CRUD operations for driver vehicles (registration, capacity, compliance documents, tracker info).
- **Intelligent Driver Dispatch System**: Prioritizes premium drivers with exclusive 5-minute access to new offers, followed by regular drivers. Includes a driver acceptance workflow that updates order status, driver availability, and sends customer notifications.
- **Pricing Management System**: Drivers set delivery fees per fuel type, and Suppliers manage fuel prices per litre for each depot. Both include real-time inline editing, optional notes, and pricing history audit trails.
- **Real-Time GPS Tracking System**: Customers can view real-time driver locations on interactive maps (Leaflet + OpenStreetMap) in order details. Drivers update their location every 30 seconds when on delivery.
- **Supplier Depot Management System**: Full CRUD functionality for depots, including name, address, GPS coordinates, operating hours, contact details, status tracking, and notes. Suppliers can also view orders associated with their depots.

## External Dependencies
- **Supabase**: PostgreSQL database, authentication, and object storage.
- **PayFast**: Payment gateway integration (pending).
- **ZeptoMail**: SMTP service for email communications.