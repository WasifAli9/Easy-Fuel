# Automatic Pricing Implementation Summary

## Changes Made

### 1. Database Schema
- Added `price_per_km_cents` field to `app_settings` table (admin-configurable)
- Migration file: `add-price-per-km-to-app-settings.sql`
- Default value: 5000 cents (R50 per km)

### 2. Backend Changes

#### `server/dispatch-service.ts`
- **Modified `createDispatchOffers`**: Now automatically calculates pricing for ALL eligible drivers immediately when order is created
- **Removed premium window**: All drivers get offers at the same time
- **Pricing formula**: `(driver's price per liter × litres) + (admin-set price per km × distance from driver to customer)`
- **State**: Offers are created with `"pending_customer"` state so customers can see them immediately

#### `server/customer-routes.ts`
- **Order creation**: Now waits for `createDispatchOffers` to complete before returning response
- **GET `/orders/:id/offers`**: Returns all offers including `"offered"` state, calculates distance from driver location to customer
- **POST `/orders/:id/offers/:offerId/accept`**: Uses driver-to-customer distance for final pricing

#### `server/driver-routes.ts`
- Made `pricePerKmCents` optional in driver offer acceptance (pricing is now auto-calculated)

### 3. Frontend Changes

#### `client/src/components/CreateOrderDialog.tsx`
- Added `onOrderCreated` callback prop
- Opens `ViewOrderDialog` immediately after order creation
- Waits 500ms for offers to be created before opening dialog

#### `client/src/components/ViewOrderDialog.tsx`
- Shows all available drivers with automatically calculated prices
- Displays total price prominently
- Shows pricing breakdown (fuel cost + delivery fee)
- Sorts drivers by total price (lowest first)
- Fixed Dialog accessibility warnings by ensuring `DialogDescription` is always present

#### `client/src/pages/CustomerDashboard.tsx`
- Passes callback to `CreateOrderDialog` to open `ViewOrderDialog` after order creation

## New Flow

1. **Customer places order** → Order created in database
2. **System automatically**:
   - Finds all eligible drivers (with pricing set, vehicle capacity, within radius)
   - Calculates pricing for each: `(fuel price × litres) + (price per km × distance)`
   - Creates offers with `"pending_customer"` state immediately
3. **Customer sees all driver prices** in the same window (ViewOrderDialog opens automatically)
4. **Customer selects a driver** → Order assigned, no driver action needed
5. **Rest of flow unchanged** (status updates, chat, map, etc.)

## Testing

1. Run the migration: Execute `add-price-per-km-to-app-settings.sql` in your database
2. Delete existing orders: Execute `delete-all-orders.sql` to start fresh
3. Create a new order and verify:
   - Drivers appear immediately with pricing
   - Pricing shows fuel cost + delivery fee
   - Distance is calculated from driver location to customer
   - Customer can select a driver immediately

## Notes

- Drivers no longer need to manually submit offers
- Pricing is calculated automatically based on:
  - Driver's fuel price per liter (from their portal)
  - Admin-set price per km (from app_settings)
  - Distance from driver's current location to customer's delivery address
- All drivers are treated equally (no premium window)

