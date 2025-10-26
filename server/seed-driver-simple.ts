import { supabaseAdmin } from "./supabase";

/**
 * Simplified seed script for driver dashboard - works around PostgREST schema cache issues
 * Creates sample orders and dispatch offers for testing
 */

async function seedDriverDashboardSimple() {
  console.log("\n🚛 Seeding driver dashboard test data (simplified)...\n");

  try {
    // 1. Find any existing driver profile
    const { data: drivers } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id")
      .limit(1);

    if (!drivers || drivers.length === 0) {
      console.error("❌ No driver profiles found. Please log in and complete driver role setup first.");
      return;
    }

    const driverId = drivers[0].id;
    console.log(`✅ Using driver: ${driverId}`);

    // 2. Find any existing customer
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id")
      .limit(1);

    if (!customers || customers.length === 0) {
      console.error("❌ No customers found. Please create at least one customer profile first.");
      console.log("   You can do this by logging in with a customer account");
      return;
    }

    const customerId = customers[0].id;
    console.log(`✅ Using customer: ${customerId}`);

    // 3. Get a fuel type
    const { data: fuelTypes } = await supabaseAdmin
      .from("fuel_types")
      .select("id, code")
      .limit(1);

    if (!fuelTypes || fuelTypes.length === 0) {
      console.error("❌ No fuel types found");
      return;
    }

    const fuelTypeId = fuelTypes[0].id;
    console.log(`✅ Using fuel type: ${fuelTypes[0].code}`);

    // 4. Create sample orders in different states
    const orders = [
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 500,
        pickup_lat: -26.0000,
        pickup_lng: 28.0000,
        drop_lat: -26.1076,
        drop_lng: 28.0567,
        fuel_price_cents: 1050000, // R10,500
        delivery_fee_cents: 35000, // R350
        service_fee_cents: 22050, // R220.50
        total_cents: 1107050, // R11,070.50
        state: "assigned" as const,
        driver_id: driverId,
        payment_method: "credit_card" as const,
        payment_status: "paid" as const,
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 1000,
        pickup_lat: -26.0000,
        pickup_lng: 28.0000,
        drop_lat: -26.1076,
        drop_lng: 28.0567,
        fuel_price_cents: 2100000, // R21,000
        delivery_fee_cents: 45000, // R450
        service_fee_cents: 42900, // R429
        total_cents: 2187900, // R21,879
        state: "picked_up" as const,
        driver_id: driverId,
        payment_method: "eft" as const,
        payment_status: "paid" as const,
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 750,
        pickup_lat: -26.0000,
        pickup_lng: 28.0000,
        drop_lat: -26.1076,
        drop_lng: 28.0567,
        fuel_price_cents: 1575000, // R15,750
        delivery_fee_cents: 40000, // R400
        service_fee_cents: 32300, // R323
        total_cents: 1647300, // R16,473
        state: "delivered" as const,
        driver_id: driverId,
        payment_method: "credit_card" as const,
        payment_status: "paid" as const,
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 300,
        pickup_lat: -26.0000,
        pickup_lng: 28.0000,
        drop_lat: -26.1076,
        drop_lng: 28.0567,
        fuel_price_cents: 630000, // R6,300
        delivery_fee_cents: 28000, // R280
        service_fee_cents: 13160, // R131.60
        total_cents: 671160, // R6,711.60
        state: "delivered" as const,
        driver_id: driverId,
        payment_method: "eft" as const,
        payment_status: "paid" as const,
      },
    ];

    const { data: createdOrders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .insert(orders)
      .select("id, state");

    if (ordersError) {
      console.error("❌ Error creating orders:", ordersError.message);
      return;
    }

    console.log(`✅ Created ${createdOrders?.length || 0} orders`);

    // 5. Create sample dispatch offers (available jobs)
    const availableJobOrders = [
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 600,
        pickup_lat: -26.0000,
        pickup_lng: 28.0000,
        drop_lat: -26.1076,
        drop_lng: 28.0567,
        fuel_price_cents: 1260000, // R12,600
        delivery_fee_cents: 38000, // R380
        service_fee_cents: 25960, // R259.60
        total_cents: 1323960, // R13,239.60
        state: "pending_dispatch" as const,
        payment_method: "credit_card" as const,
        payment_status: "paid" as const,
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 800,
        pickup_lat: -26.0000,
        pickup_lng: 28.0000,
        drop_lat: -26.1076,
        drop_lng: 28.0567,
        fuel_price_cents: 1680000, // R16,800
        delivery_fee_cents: 42000, // R420
        service_fee_cents: 34440, // R344.40
        total_cents: 1756440, // R17,564.40
        state: "pending_dispatch" as const,
        payment_method: "eft" as const,
        payment_status: "paid" as const,
      },
    ];

    const { data: availableOrders, error: availableOrdersError } = await supabaseAdmin
      .from("orders")
      .insert(availableJobOrders)
      .select("id");

    if (availableOrdersError) {
      console.error("❌ Error creating available job orders:", availableOrdersError.message);
      return;
    }

    console.log(`✅ Created ${availableOrders?.length || 0} available job orders`);

    if (availableOrders && availableOrders.length > 0) {
      // Create dispatch offers for these orders
      const offers = availableOrders.map(order => ({
        order_id: order.id,
        driver_id: driverId,
        state: "pending" as const,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Expires in 15 minutes
      }));

      const { data: createdOffers, error: offersError } = await supabaseAdmin
        .from("dispatch_offers")
        .insert(offers)
        .select("id");

      if (offersError) {
        console.error("❌ Error creating dispatch offers:", offersError.message);
        return;
      }

      console.log(`✅ Created ${createdOffers?.length || 0} dispatch offers`);
    }

    console.log("\n✅ Driver dashboard data seeded successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Active jobs: 2 (assigned, picked_up)`);
    console.log(`   - Completed jobs: 2 (delivered)`);
    console.log(`   - Available jobs: ${availableOrders?.length || 0} (pending dispatch offers)`);
    console.log(`\n🎯 Refresh the driver dashboard to see the new jobs!`);

  } catch (error) {
    console.error("❌ Error seeding driver dashboard data:", error);
    throw error;
  }
}

// Run the seed function
seedDriverDashboardSimple()
  .then(() => {
    console.log("\n✅ Seed completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  });
