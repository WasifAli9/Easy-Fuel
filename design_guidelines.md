# Easy Fuel ZA - Design Guidelines

## Design Approach

**Reference-Based Approach**: Drawing inspiration from successful on-demand marketplaces (Uber, Grab, Postmates) combined with professional logistics platforms. The design prioritizes trust, operational clarity, and mobile-first efficiency while maintaining the Easy Fuel brand identity.

**Core Principle**: Create a professional, trustworthy platform that balances simplicity for customers with powerful tools for drivers, suppliers, and admins.

---

## Brand Identity & Color System

### Primary Colors
- **Teal Primary**: 174 85% 54% (from logo #1fbfb8)
- **Teal Dark**: 173 79% 23% (deeper shade #0e6763)
- **Teal Light**: 174 85% 70% (for hover states)

### Supporting Palette (Dark Mode)
- **Background**: 220 13% 9%
- **Surface**: 220 13% 13%
- **Surface Elevated**: 220 13% 18%
- **Text Primary**: 0 0% 95%
- **Text Secondary**: 0 0% 65%
- **Border**: 220 13% 25%

### Supporting Palette (Light Mode)
- **Background**: 0 0% 100%
- **Surface**: 0 0% 98%
- **Surface Elevated**: 0 0% 100%
- **Text Primary**: 220 13% 9%
- **Text Secondary**: 220 9% 46%
- **Border**: 220 13% 91%

### Semantic Colors
- **Success**: 142 76% 36% (green for delivered, approved)
- **Warning**: 38 92% 50% (amber for pending, en-route)
- **Error**: 0 84% 60% (red for rejected, cancelled)
- **Info**: 221 83% 53% (blue for notifications)

---

## Typography

### Font Families
- **Primary (UI)**: 'Inter', system-ui, -apple-system, sans-serif
- **Display (Headers)**: 'Inter', sans-serif with tighter tracking
- **Monospace (Codes/IDs)**: 'JetBrains Mono', monospace

### Type Scale
- **Hero**: text-5xl md:text-6xl font-bold tracking-tight
- **H1**: text-3xl md:text-4xl font-bold
- **H2**: text-2xl md:text-3xl font-semibold
- **H3**: text-xl font-semibold
- **Body Large**: text-lg
- **Body**: text-base
- **Small**: text-sm
- **Caption**: text-xs text-secondary

---

## Layout System

### Spacing Primitives
Core spacing units: **2, 4, 6, 8, 12, 16, 24** (Tailwind units)
- Micro spacing: gap-2, p-2 (8px)
- Standard spacing: gap-4, p-4 (16px)
- Section spacing: gap-8, py-8 (32px)
- Major sections: py-12 md:py-16 (48px-64px)

### Containers & Grids
- **Max Width**: max-w-7xl for main content
- **Page Padding**: px-4 sm:px-6 lg:px-8
- **Cards Grid**: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- **Dashboard Grid**: grid grid-cols-1 lg:grid-cols-3 gap-6 (2/3 + 1/3 split for main/sidebar)

---

## Component Library

### Navigation
- **App Header**: Fixed top, blur backdrop, logo left, role-based nav center, profile/notifications right
- **Mobile Nav**: Bottom tab bar for primary actions (Orders, Jobs, Profile)
- **Breadcrumbs**: For deep navigation (Admin, Supplier depot management)

### Cards & Surfaces
- **Order Card**: White/dark surface with colored left border (status), elevated on hover (shadow-md to shadow-lg)
- **Job Card (Driver)**: Timer badge top-right, accept/reject buttons bottom, premium indicator if applicable
- **Depot Card**: Map thumbnail, fuel type tags, price list, edit controls
- **KYC Card**: Document preview thumbnail, status badge, approve/reject admin controls

### Forms & Inputs
- **Input Fields**: Rounded-lg border with focus:ring-2 focus:ring-teal-500
- **Select/Dropdown**: Custom styled with chevron, same border treatment
- **Map Input**: Interactive map for address selection with search overlay
- **File Upload**: Drag-drop zone with preview thumbnails, progress indicators

### Buttons
- **Primary**: bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-6 py-3
- **Secondary**: border border-current text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950
- **Danger**: bg-red-600 hover:bg-red-700 for reject/cancel actions
- **Icon Buttons**: rounded-full p-2 hover:bg-surface-elevated

### Status & Badges
- **Status Pill**: Inline-flex items-center px-3 py-1 rounded-full text-xs font-medium
  - Pending: bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200
  - Approved: bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200
  - Active: bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200
- **Timer Badge**: Pulsing animation for dispatch offers (120s countdown)
- **Premium Badge**: Gold outline badge with star icon for premium drivers

### Data Display
- **Order Timeline**: Vertical stepper showing state transitions with timestamps
- **Price Breakdown**: Table with label-value rows, total row emphasized with border-top
- **Map Views**: Full-height on mobile, 60% width on desktop with details sidebar
- **Performance Charts**: Simple bar/line charts using Recharts, teal color scheme

### Modals & Overlays
- **Dialog**: Centered max-w-lg with backdrop blur
- **Sheet (Mobile)**: Slide up from bottom for actions, max-h-90vh
- **Toasts**: Top-right notifications, auto-dismiss, color-coded by type

---

## Page-Specific Design

### Landing Page (/)
- **Hero**: Full-viewport with Easy Fuel logo (large), headline "Fuel Delivered to Your Site", teal CTA button, subtle gradient background (teal to dark)
- **How It Works**: 3-column grid (Customer, Driver, Supplier) with icons and brief descriptions
- **Trust Section**: South Africa map visual, "Vetted Drivers • Approved Suppliers • Secure Payments"
- **CTA Footer**: Sign up role selector

### Customer Dashboard (/app/request, /app/orders)
- **Request Flow**: Multi-step wizard (Fuel Type → Location → Quantity → Price → Payment)
- **Map Prominent**: 60% viewport on desktop, full mobile, with floating control panel
- **Active Orders**: Live tracking map with driver location, ETA, contact driver button
- **Order History**: Filterable list cards with status, receipt download

### Driver Interface (/driver/jobs, /driver/navigation)
- **Jobs Inbox**: Priority sorted cards, timer prominent, one-tap accept
- **Navigation**: Embedded map with turn-by-turn, pickup/dropoff markers, "Mark Picked Up" floating button
- **Proof Capture**: Camera interface for photo, canvas signature pad, confirm button

### Supplier Portal (/supplier/depots)
- **Depot List**: Cards with edit inline, map thumbnail preview
- **Price Matrix**: Editable table (fuel types × price per litre), save all button
- **Orders View**: Fulfilled orders timeline, driver assignments

### Admin Console (/admin/*)
- **Dashboard**: KPI cards (Sales, Orders, Drivers) top row, live map below, charts right sidebar
- **KYC Queue**: Two-column (drivers/suppliers), document viewer modal, one-click approve/reject with notes
- **Settings**: Form groups (Pricing, Dispatch, System), save button sticky bottom

---

## Images & Visual Assets

### Hero Section
- **Large Hero Image**: Yes - Use South African landscape or urban delivery scene (truck/van at industrial site), overlaid with dark gradient for text contrast
- **Logo Placement**: Centered above headline, size: h-16 md:h-24

### Supporting Images
- **How It Works Icons**: Custom illustrated icons (fuel pump, truck, location pin) in teal
- **Empty States**: Friendly illustrations for "No orders yet", "No jobs available"
- **KYC Documents**: Thumbnail previews with zoom modal
- **Proof of Delivery**: Full-width photo display with signature overlay

---

## Responsive Behavior

- **Breakpoints**: sm:640px, md:768px, lg:1024px, xl:1280px
- **Mobile Priority**: Bottom nav, full-width cards, stacked forms
- **Desktop Enhancements**: Sidebars, multi-column grids, fixed headers
- **PWA Optimizations**: Offline indicators, install prompt, app-like transitions

---

## Accessibility & Dark Mode

- Maintain WCAG AA contrast ratios (4.5:1 text, 3:1 UI)
- Consistent dark mode across all components including form inputs
- Focus states visible with ring-2 ring-offset-2
- Icon buttons include aria-labels
- Status communicated via color + text/icons