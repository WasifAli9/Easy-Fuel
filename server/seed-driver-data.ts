import { supabaseAdmin } from "./supabase";

/**
 * Seed script to create dummy data for testing driver dashboard functionality
 * Creates:
 * - A test driver account
 * - A test customer account
 * - A test supplier with depot
 * - Sample orders in different states (for Active/Completed jobs)
 * - Sample dispatch offers (for Available jobs)
 */

async function seedDriverDashboardData() {
  console.log("\n🚛 Seeding driver dashboard test data...\n");

  try {
    // 1. Find any existing driver profile
    const { data: drivers } = await supabaseAdmin
      .from("drivers")
      .select("id, user_id")
      .limit(1);

    if (!drivers || drivers.length === 0) {
      console.error("❌ No driver profiles found. Please:");
      console.error("   1. Log in as driver@deffinity.com");
      console.error("   2. Complete role setup to create driver profile");
      console.error("   3. Run this script again");
      return;
    }

    const driverId = drivers[0].id;
    console.log(`✅ Using existing driver profile: ${driverId}`);

    // 3. Create or find test customer
    const customerEmail = "testcustomer@easyfuel.ai";
    let customerId: string | null = null;
    let customerUserId: string | null = null;

    // Try to create auth user, or find existing
    const { data: customerAuthData, error: customerAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: customerEmail,
      password: "Test123#!",
      email_confirm: true,
      user_metadata: {
        full_name: "Test Customer",
      },
    });

    if (customerAuthError && customerAuthError.message.includes("already")) {
      // User already exists, find them
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = users?.users.find(u => u.email === customerEmail);
      customerUserId = existingUser?.id || null;
    } else if (customerAuthData?.user?.id) {
      customerUserId = customerAuthData.user.id;
    }

    if (!customerUserId) {
      console.error("❌ Could not create or find customer auth user");
      return;
    }

    // Check if customer profile exists
    const { data: existingCustomer } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", customerUserId)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      console.log(`✅ Using existing customer: ${customerId}`);
    } else {
      // Create customer profile
      const { data: newCustomer, error: customerError } = await supabaseAdmin
        .from("customers")
        .insert({
          user_id: customerUserId,
          company_name: "Test Company Ltd",
          vat_number: "4123456789",
          billing_address_street: "123 Test Street",
          billing_address_city: "Johannesburg",
          billing_address_province: "Gauteng",
          billing_address_postal_code: "2000",
          billing_address_country: "South Africa",
        })
        .select("id")
        .single();

      if (customerError) {
        console.error("❌ Error creating customer profile:", customerError.message);
        return;
      }

      customerId = newCustomer?.id || null;
      console.log(`✅ Customer created: ${customerId}`);
    }

    if (!customerId) {
      console.error("❌ Could not create customer");
      return;
    }

    // 4. Create delivery address for customer
    const { data: deliveryAddress } = await supabaseAdmin
      .from("delivery_addresses")
      .insert({
        customer_id: customerId,
        label: "Main Office",
        street_address: "456 Business Park Drive",
        suburb: "Sandton",
        city: "Johannesburg",
        province: "Gauteng",
        postal_code: "2196",
        lat: -26.1076,
        lng: 28.0567,
        is_default: true,
        access_instructions: "Security gate, buzz for access",
      })
      .select("id")
      .single();

    console.log(`✅ Delivery address created`);

    // 5. Get a fuel type
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

    // 6. Create sample orders in different states
    const orders = [
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 500,
        delivery_address_id: deliveryAddress?.id,
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
        confirmed_delivery_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 1000,
        delivery_address_id: deliveryAddress?.id,
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
        confirmed_delivery_time: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // 1 hour from now
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 750,
        delivery_address_id: deliveryAddress?.id,
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
        confirmed_delivery_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
      },
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 300,
        delivery_address_id: deliveryAddress?.id,
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
        confirmed_delivery_time: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
      },
    ];

    const { data: createdOrders } = await supabaseAdmin
      .from("orders")
      .insert(orders)
      .select("id, state");

    console.log(`✅ Created ${createdOrders?.length || 0} sample orders`);

    // 7. Create sample dispatch offers (available jobs)
    const availableJobOrders = [
      {
        customer_id: customerId,
        fuel_type_id: fuelTypeId,
        litres: 600,
        delivery_address_id: deliveryAddress?.id,
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
        delivery_address_id: deliveryAddress?.id,
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

    const { data: availableOrders } = await supabaseAdmin
      .from("orders")
      .insert(availableJobOrders)
      .select("id");

    if (availableOrders && availableOrders.length > 0) {
      // Create dispatch offers for these orders
      const offers = availableOrders.map(order => ({
        order_id: order.id,
        driver_id: driverId,
        state: "pending" as const,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Expires in 15 minutes
      }));

      const { data: createdOffers } = await supabaseAdmin
        .from("dispatch_offers")
        .insert(offers)
        .select("id");

      console.log(`✅ Created ${createdOffers?.length || 0} dispatch offers (available jobs)`);
    }

    console.log("\n✅ Driver dashboard data seeded successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Active jobs: 2 (assigned, picked_up)`);
    console.log(`   - Completed jobs: 2 (delivered)`);
    console.log(`   - Available jobs: ${availableOrders?.length || 0} (pending dispatch offers)`);
    console.log(`\n🔐 Test Credentials:`);
    console.log(`   Customer: ${customerEmail} / Test123#!`);

  } catch (error) {
    console.error("❌ Error seeding driver dashboard data:", error);
    throw error;
  }
}

// Run the seed function
seedDriverDashboardData()
  .then(() => {
    console.log("\n✅ Seed completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  });
