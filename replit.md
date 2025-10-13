# Easy Fuel ZA - Production Fuel Delivery Marketplace

## Project Overview
Easy Fuel ZA is a production-ready fuel delivery marketplace for South Africa that connects customers, vetted drivers, and suppliers. The platform features multi-role authentication, intelligent dispatch with SLA-based driver scoring, KYC/KYB workflows with document verification, PayFast payment integration, real-time order tracking, and comprehensive admin controls.

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + Node.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email OTP/Magic Link)
- **ORM**: Drizzle
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter

## Project Status: Authentication Phase Complete ✅

### Completed Features
1. ✅ Supabase integration with environment variables
2. ✅ Email OTP/Magic Link authentication
3. ✅ Role-based access control (Customer, Driver, Supplier, Admin)
4. ✅ Protected routes with automatic redirects
5. ✅ User profile management with role selection
6. ✅ Comprehensive database schema (14 tables)
7. ✅ Mobile-first design with Easy Fuel teal branding
8. ✅ Dark mode support
9. ✅ Component library (Logo, Cards, Forms)

### Current Phase: Supabase Configuration Required
The authentication system is fully implemented but requires Supabase configuration:
- ⚠️ Email provider must be enabled in Supabase Dashboard
- ⚠️ Redirect URLs must be configured
- ⚠️ Database migration must be applied
- ⚠️ Foreign key constraints must be added
- ⚠️ Run seed script to create test accounts

**See `SUPABASE_SETUP.md` for complete setup instructions**

### Test Accounts Available
Run `tsx server/seed.ts` to create 4 pre-configured test accounts:
- 👤 `customer@easyfuel.ai` - Customer with company details
- 🚚 `driver@easyfuel.ai` - Driver (KYC approved, vehicle ready)
- 🏢 `supplier@easyfuel.ai` - Supplier (KYB approved, CIPC verified)
- 👑 `admin@easyfuel.ai` - Admin user

**See `TEST_ACCOUNTS.md` for complete details**

## Architecture

### Authentication Flow
```
Unauthenticated → Landing → /auth → Email OTP → /setup → Role Selection → Dashboard
```

### User Roles
- **Customer**: Order fuel delivery
- **Driver**: Accept delivery jobs, manage dispatches
- **Supplier**: Manage depots, fuel inventory, pricing
- **Admin**: Manage users, KYC/KYB verification, system settings

### Database Schema (14 Tables)
- `profiles` - User profiles with role
- `customers` - Customer-specific data
- `drivers` - Driver KYC, vehicle info, scoring
- `suppliers` - Supplier KYB, CIPC verification
- `orders` - Fuel delivery orders
- `dispatch_offers` - Driver dispatch system
- `fuel_types` - Fuel types & pricing
- `depots` - Supplier depot locations
- `payments` - PayFast transaction records
- `proof_of_delivery` - POD with photos/signatures
- `driver_suppliers` - Driver-supplier assignments
- `kyc_documents` - Document verification
- `app_settings` - System configuration
- `driver_scores` - SLA-based driver performance

## Design System

### Branding
- **Primary Color**: Teal (#1fbfb8)
- **Primary Dark**: Dark Teal (#0e6763)
- **Logo**: Fuel pump icon with "Easy Fuel" text
- **Mobile-First**: Optimized for mobile screens
- **Dark Mode**: Full support with automatic theme switching

### Color Tokens (index.css)
All colors use HSL format for theme compatibility:
- `--primary`: 175 92% 44% (teal)
- `--primary-foreground`: 0 0% 100% (white)
- And 20+ other semantic tokens

## Key Files

### Documentation
- `AUTH_IMPLEMENTATION.md` - Complete auth system documentation
- `SUPABASE_SETUP.md` - Supabase configuration guide
- `replit.md` - This file

### Frontend Core
- `client/src/App.tsx` - Main app with routing
- `client/src/contexts/AuthContext.tsx` - Auth state management
- `client/src/pages/Auth.tsx` - Email OTP sign-in
- `client/src/pages/RoleSetup.tsx` - Role selection for new users
- `client/src/pages/Landing.tsx` - Public landing page

### Backend Core
- `server/index.ts` - Express server
- `server/supabase.ts` - Supabase server client
- `server/routes.ts` - API routes (to be implemented)
- `server/storage.ts` - Storage interface (to be implemented)

### Schema & Types
- `shared/schema.ts` - Complete database schema with Drizzle
- All Zod schemas for validation
- TypeScript types for type safety

### UI Components
- `client/src/components/Logo.tsx` - Easy Fuel logo
- `client/src/components/AppHeader.tsx` - Header with auth menu
- `client/src/components/ui/*` - shadcn/ui components
- Component library for OrderCard, JobCard, DepotCard, etc. (to be built)

## Environment Variables (Replit Secrets)
- `DATABASE_URL` - Supabase database connection
- `SESSION_SECRET` - Express session secret
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Development Commands
```bash
npm run dev          # Start development server (port 5000)
npm run build        # Build for production
npm run db:generate  # Generate Drizzle migrations
npm run db:push      # Push schema to database
```

## Next Development Phases

### Phase 1: Complete Supabase Setup ⏳
- [ ] User enables email auth in Supabase
- [ ] User applies database migration
- [ ] User adds foreign key constraints
- [ ] Test complete auth flow end-to-end

### Phase 2: KYC/KYB Workflows
- [ ] Driver KYC document upload (ID, license, vehicle docs)
- [ ] Supplier KYB with CIPC verification
- [ ] Admin verification dashboard
- [ ] Document status tracking & notifications

### Phase 3: Core Marketplace Features
- [ ] Customer order placement UI
- [ ] Driver job acceptance & dispatch
- [ ] Real-time order tracking
- [ ] PayFast payment integration
- [ ] Proof of delivery with photos

### Phase 4: Advanced Features
- [ ] Depot management for suppliers
- [ ] Fuel inventory & pricing
- [ ] SLA-based driver scoring algorithm
- [ ] Admin analytics dashboard
- [ ] Mobile PWA optimizations

## User Preferences
- **Database**: Supabase (not Replit database)
- **Authentication**: Supabase Auth (not Replit Auth)
- **Branding**: Easy Fuel teal (#1fbfb8/#0e6763)
- **Target Market**: South Africa
- **Design**: Mobile-first PWA
- **Architecture**: Production-ready with scalability

## Recent Changes (Latest Session)
- ✅ **Admin User Creation System** - Complete with rollback logic and validation
  - Dynamic form shows role-specific fields (customer/driver/supplier/admin)
  - Server-side validation with automatic cleanup if creation fails
  - Supplier company name enforced as required (frontend + backend)
  - Successfully tested: Creates customer, driver, and supplier accounts
  - Rollback logic prevents orphaned records in Supabase
- ✅ **Admin KYC/KYB Approval Queue** - Real-time pending applications
  - Fetches pending drivers and suppliers with profile data
  - Approve/reject functionality with status updates
  - Toast notifications for success/error feedback
- ✅ **Admin Customers View** - Complete customer management
  - Customers tab shows all registered customers in table format
  - Displays name, company, VAT number, phone, registration date
  - API endpoint: GET /api/admin/customers with profile data
  - Successfully tested with 5 customer accounts visible
- ✅ Configured ZeptoMail SMTP (10,000 free emails/month) in Supabase
- ✅ Fixed password reset redirect flow to /reset-password page
- ✅ Created admin profile for nadeem.mohammed@deffinity.com
- ✅ Implemented Row Level Security policies for users and admin access
- ✅ Fixed ProtectedRoute to allow /setup for users without profiles
- ✅ Added foreign key documentation in SUPABASE_SETUP.md
- ✅ Created comprehensive documentation (AUTH_IMPLEMENTATION.md)

## Known Issues & Limitations
1. ⚠️ Email authentication returns 400 until Supabase is configured (expected)
2. ⚠️ Foreign keys to auth.users must be added via raw SQL (Drizzle limitation)
3. ⚠️ Database migration must be manually applied in Supabase SQL Editor
4. 📝 Row Level Security policies not yet implemented
5. 📝 PayFast integration pending
6. 📝 Real-time features (tracking, notifications) not yet implemented

## Testing Status
- ✅ Auth page navigation tested
- ✅ Email input and form submission tested
- ⚠️ Magic link flow pending Supabase configuration
- ⚠️ Role selection flow pending Supabase setup
- ⚠️ Dashboard access pending implementation

## Security Considerations
- Foreign keys ensure data integrity
- Role-based access control enforced
- Magic links provide passwordless auth
- Environment secrets properly configured
- RLS policies needed in Supabase (next phase)
