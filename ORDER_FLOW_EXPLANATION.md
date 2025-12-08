# Complete Order Flow Explanation

## Overview
This document explains the complete order flow from when a customer places an order to final delivery, including all states, actions, and transitions.

---

## 📋 Order States

The order goes through these states in sequence:
1. **`created`** - Order just created, waiting for driver selection
2. **`assigned`** - Customer selected a driver, order assigned
3. **`en_route`** - Driver started delivery (going to pickup location)
4. **`picked_up`** - Driver collected fuel from depot
5. **`delivered`** - Fuel delivered to customer
6. **`cancelled`** - Order cancelled (can happen at any stage)
7. **`refunded`** - Order refunded (if payment was made)

---

## 🔄 Complete Order Flow

### **STEP 1: Customer Places Order** 
**State: `created`**

#### What Happens:
1. **Customer fills out order form** (`CreateOrderDialog`)
   - Selects fuel type (Diesel, Petrol, etc.)
   - Enters quantity in litres
   - Selects delivery address
   - Optionally: delivery date, time window, vehicle details, access notes

2. **Order is created** (`POST /api/orders`)
   - Order saved to database with state `"created"`
   - Initial pricing set to 0 (will be calculated when driver selected)

3. **System automatically calculates pricing for ALL eligible drivers**
   - Finds all drivers who:
     - Have pricing set for the fuel type
     - Have vehicle capacity ≥ order litres
     - Are within their job radius preference
   - For each driver, calculates:
     ```
     Fuel Cost = Driver's price per liter × Order litres
     Delivery Fee = Admin-set price per km × Distance (driver to customer)
     Total = Fuel Cost + Delivery Fee
     ```
   - Creates `dispatch_offers` records with state `"pending_customer"`

4. **ViewOrderDialog opens automatically**
   - Customer sees all available drivers immediately
   - Each driver shows:
     - Name, phone, profile photo
     - Total price (sorted lowest first)
     - Pricing breakdown (fuel cost + delivery fee)
     - Distance from driver to customer
   - Customer can select any driver

---

### **STEP 2: Customer Selects Driver**
**State: `created` → `assigned`**

#### What Happens:
1. **Customer clicks "Select Driver"** on a driver card
   - Calls `POST /api/orders/:id/offers/:offerId/accept`

2. **System finalizes pricing**
   - Recalculates distance from driver's current location to customer
   - Finalizes fuel cost and delivery fee
   - Updates order with:
     - `state = "assigned"`
     - `assigned_driver_id = selected driver's ID`
     - `fuel_price_cents = driver's price per liter × litres`
     - `delivery_fee_cents = price per km × distance`
     - `total_cents = fuel_cost + delivery_fee`

3. **Offer state updated**
   - Selected offer: `state = "customer_accepted"`
   - Other offers: `state = "customer_declined"` (or remain `pending_customer`)

4. **Notifications sent**
   - Driver receives notification: "Order assigned to you"
   - Customer receives confirmation
   - WebSocket updates sent to both parties

5. **Chat thread created** (if not exists)
   - Customer and driver can now chat about the order

---

### **STEP 3: Driver Starts Delivery**
**State: `assigned` → `en_route`**

#### What Happens:
1. **Driver sees order in "Assigned Orders"** section
   - Shows order details, customer info, delivery location
   - "Start Delivery" button appears

2. **Driver clicks "Start Delivery"**
   - Calls `POST /api/driver/orders/:orderId/en-route`
   - Order state changes to `"en_route"`

3. **Real-time tracking begins**
   - Driver's GPS location starts being tracked
   - Customer can see driver's location on map
   - Live map shows:
     - Driver's current location (blue marker)
     - Customer's delivery location (red marker)
     - Route between them

4. **Notifications sent**
   - Customer: "Driver has started delivery"
   - Driver: Confirmation

---

### **STEP 4: Driver Picks Up Fuel**
**State: `en_route` → `picked_up`**

#### What Happens:
1. **Driver arrives at depot/supplier**
   - Driver collects the fuel from their chosen depot
   - This is tracked separately (driver manages depot relationships)

2. **Driver clicks "Mark Picked Up"**
   - Calls `POST /api/driver/orders/:orderId/pickup`
   - Order state changes to `"picked_up"`

3. **Notifications sent**
   - Customer: "Driver has collected fuel and is on the way"

---

### **STEP 5: Driver Delivers Fuel**
**State: `picked_up` → `delivered`**

#### What Happens:
1. **Driver arrives at customer location**
   - GPS tracking shows driver at delivery location
   - Customer can see driver's arrival

2. **Driver completes delivery**
   - Driver clicks "Complete Delivery" button
   - Calls `POST /api/driver/orders/:orderId/complete`
   - Order state changes to `"delivered"`
   - `delivered_at` timestamp is set

3. **Final notifications sent**
   - Customer: "Delivery completed"
   - Driver: "Delivery marked as complete"
   - Order moves to "Completed Orders" section

4. **Order is finalized**
   - No further state changes possible
   - Order appears in customer's "Completed" tab
   - Order appears in driver's "Completed Orders" section

---

## 🗺️ Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CUSTOMER PLACES ORDER                                     │
│    State: "created"                                           │
│    • Fill order form                                         │
│    • System auto-calculates pricing for ALL drivers          │
│    • ViewOrderDialog opens with all drivers                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CUSTOMER SELECTS DRIVER                                  │
│    State: "created" → "assigned"                             │
│    • Customer clicks "Select Driver"                         │
│    • Pricing finalized                                       │
│    • Driver assigned                                         │
│    • Chat enabled                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. DRIVER STARTS DELIVERY                                    │
│    State: "assigned" → "en_route"                            │
│    • Driver clicks "Start Delivery"                          │
│    • GPS tracking begins                                     │
│    • Customer sees driver on map                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. DRIVER PICKS UP FUEL                                      │
│    State: "en_route" → "picked_up"                           │
│    • Driver collects fuel from depot                        │
│    • Driver clicks "Mark Picked Up"                          │
│    • Customer notified                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. DRIVER DELIVERS FUEL                                      │
│    State: "picked_up" → "delivered"                          │
│    • Driver arrives at customer                             │
│    • Driver clicks "Complete Delivery"                      │
│    • Order finalized                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 💬 Chat & Communication

### When Chat is Available:
- **Enabled**: From `"assigned"` state until `"delivered"`
- **Disabled**: Before assignment or after delivery

### Chat Features:
- Real-time messaging between customer and driver
- Text messages
- Location sharing
- Image sharing (if implemented)

---

## 📍 GPS Tracking

### When Tracking is Active:
- **Starts**: When order state becomes `"en_route"`
- **Ends**: When order state becomes `"delivered"`

### What Customer Sees:
- Driver's current location (updated in real-time)
- Delivery location (customer's address)
- Route between driver and customer
- Estimated time of arrival (if calculated)

---

## 🔔 Notifications

### Customer Receives:
1. Order created confirmation
2. Drivers available (with pricing)
3. Driver assigned
4. Driver started delivery
5. Driver picked up fuel
6. Driver arrived / delivery completed

### Driver Receives:
1. New order available (with auto-calculated pricing)
2. Order assigned to them
3. Customer messages
4. Order status updates

---

## ❌ Cancellation Flow

### Customer Can Cancel:
- Before driver is assigned (`"created"` state)
- After assignment, only if driver hasn't started delivery

### Driver Can Cancel:
- Before starting delivery (`"assigned"` state)
- After starting, cancellation requires admin approval

### What Happens on Cancellation:
- Order state → `"cancelled"`
- All related offers marked as declined
- Refund processed (if payment was made)
- Notifications sent to both parties

---

## 💰 Pricing Breakdown

### How Pricing Works:

1. **When Order is Created:**
   - System calculates pricing for ALL eligible drivers
   - Formula: `(Driver's price per liter × litres) + (Admin price per km × distance)`
   - Prices shown to customer immediately

2. **When Customer Selects Driver:**
   - Pricing is finalized using driver's current location
   - Final distance calculated: Driver location → Customer location
   - Total locked in: `fuel_price_cents + delivery_fee_cents = total_cents`

3. **Pricing Components:**
   - **Fuel Cost**: Driver's set price per liter × order litres
   - **Delivery Fee**: Admin-set price per km × distance in km
   - **Service Fee**: Currently 0 (can be added later)
   - **Total**: Sum of all components

---

## 🔄 State Transition Rules

| From State | To State | Who Can Do It | Condition |
|------------|----------|---------------|-----------|
| `created` | `assigned` | Customer | Selects a driver |
| `created` | `cancelled` | Customer | Before driver assigned |
| `assigned` | `en_route` | Driver | Clicks "Start Delivery" |
| `assigned` | `cancelled` | Customer/Driver | Before delivery starts |
| `en_route` | `picked_up` | Driver | Clicks "Mark Picked Up" |
| `picked_up` | `delivered` | Driver | Clicks "Complete Delivery" |
| Any | `cancelled` | Customer/Driver/Admin | Based on rules above |

---

## 📱 User Interfaces

### Customer Dashboard:
- **All Orders Tab**: Shows all orders (created, assigned, en_route, etc.)
- **Completed Tab**: Shows delivered orders
- **Order Card**: Click to view details and select driver
- **ViewOrderDialog**: Shows order details, available drivers, pricing, chat, map

### Driver Dashboard:
- **Available Orders**: Shows orders with auto-calculated pricing (for reference)
- **Assigned Orders**: Shows orders assigned to this driver
- **Completed Orders**: Shows delivered orders
- **Order Actions**: Start Delivery, Mark Picked Up, Complete Delivery buttons

---

## 🎯 Key Features

1. **Automatic Pricing**: No driver involvement needed for pricing
2. **Immediate Availability**: All drivers shown instantly when order created
3. **Real-time Tracking**: GPS tracking from start to finish
4. **Live Chat**: Communication throughout delivery
5. **Transparent Pricing**: Customer sees exact breakdown before selecting
6. **Distance-based Pricing**: Fair pricing based on actual distance

---

## 🔧 Technical Details

### Database Tables Involved:
- `orders` - Main order record
- `dispatch_offers` - Driver pricing offers (auto-created)
- `driver_pricing` - Driver's fuel prices per liter
- `app_settings` - Admin-set price per km
- `order_messages` - Chat messages
- `driver_locations` - GPS tracking data

### API Endpoints:
- `POST /api/orders` - Create order
- `GET /api/orders/:id/offers` - Get driver offers with pricing
- `POST /api/orders/:id/offers/:offerId/accept` - Select driver
- `POST /api/driver/orders/:orderId/en-route` - Start delivery
- `POST /api/driver/orders/:orderId/pickup` - Mark picked up
- `POST /api/driver/orders/:orderId/complete` - Complete delivery

---

This flow ensures a smooth, transparent, and efficient fuel delivery process from order creation to completion!

