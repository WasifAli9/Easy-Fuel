import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "./db";
import {
  customers,
  deliveryAddresses,
  depots,
  dispatchOffers,
  driverLocations,
  driverPricing,
  drivers,
  fuelTypes,
  localAuthUsers,
  orders,
  paymentMethods,
  profiles,
} from "@shared/schema";
import { createDispatchOffers } from "./dispatch-service";
import { sendDriverAcceptanceEmail } from "./email-service";
import { websocketService } from "./websocket";
import { pushNotificationService } from "./push-service";
import { ensureChatThreadForAssignment } from "./chat-service";
import { orderNotifications, offerNotifications } from "./notification-helpers";

const router = Router();

async function getCustomerByUserId(userId: string) {
  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.userId, userId))
    .limit(1);
  return customerRows[0] ?? null;
}

// Helper function to fetch full order data for WebSocket broadcast
async function fetchFullOrderData(orderId: string) {
  const orderRows = await db
    .select({
      order: orders,
      fuelType: {
        id: fuelTypes.id,
        code: fuelTypes.code,
        label: fuelTypes.label,
      },
      deliveryAddress: {
        id: deliveryAddresses.id,
        label: deliveryAddresses.label,
        address_street: deliveryAddresses.addressStreet,
        address_city: deliveryAddresses.addressCity,
        address_province: deliveryAddresses.addressProvince,
        address_postal_code: deliveryAddresses.addressPostalCode,
      },
      customer: {
        id: customers.id,
        company_name: customers.companyName,
        user_id: customers.userId,
      },
    })
    .from(orders)
    .leftJoin(fuelTypes, eq(fuelTypes.id, orders.fuelTypeId))
    .leftJoin(deliveryAddresses, eq(deliveryAddresses.id, orders.deliveryAddressId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId))
    .limit(1);

  const row = orderRows[0];
  if (!row) {
    return null;
  }

  return {
    ...row.order,
    fuel_types: row.fuelType,
    delivery_addresses: row.deliveryAddress,
    customers: row.customer,
  };
}

// Get all fuel types (for order creation)
router.get("/fuel-types", async (req, res) => {
  try {
    const fuelTypeRows = await db
      .select()
      .from(fuelTypes)
      .where(eq(fuelTypes.active, true))
      .orderBy(fuelTypes.label);
    res.json(fuelTypeRows || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders for the authenticated customer
router.get("/orders", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const customerRows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, user.id))
      .limit(1);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const orderRows = await db
      .select({
        order: orders,
        fuelType: {
          id: fuelTypes.id,
          code: fuelTypes.code,
          label: fuelTypes.label,
        },
        deliveryAddress: {
          id: deliveryAddresses.id,
          label: deliveryAddresses.label,
          address_street: deliveryAddresses.addressStreet,
          address_city: deliveryAddresses.addressCity,
          address_province: deliveryAddresses.addressProvince,
          address_postal_code: deliveryAddresses.addressPostalCode,
        },
      })
      .from(orders)
      .leftJoin(fuelTypes, eq(fuelTypes.id, orders.fuelTypeId))
      .leftJoin(deliveryAddresses, eq(deliveryAddresses.id, orders.deliveryAddressId))
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(orders.createdAt));

    res.json(
      orderRows.map((row) => ({
        ...row.order,
        fuel_types: row.fuelType,
        delivery_addresses: row.deliveryAddress,
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single order details
router.get("/orders/:id", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;

  try {
    const customerRows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, user.id))
      .limit(1);
    const customer = customerRows[0];
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const orderRows = await db
      .select({
        order: orders,
        fuelType: {
          id: fuelTypes.id,
          code: fuelTypes.code,
          label: fuelTypes.label,
        },
        depot: {
          id: depots.id,
          name: depots.name,
        },
        deliveryAddress: {
          id: deliveryAddresses.id,
          label: deliveryAddresses.label,
          address_street: deliveryAddresses.addressStreet,
          address_city: deliveryAddresses.addressCity,
          address_province: deliveryAddresses.addressProvince,
          address_postal_code: deliveryAddresses.addressPostalCode,
        },
      })
      .from(orders)
      .leftJoin(fuelTypes, eq(fuelTypes.id, orders.fuelTypeId))
      .leftJoin(depots, eq(depots.id, orders.selectedDepotId))
      .leftJoin(deliveryAddresses, eq(deliveryAddresses.id, orders.deliveryAddressId))
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)))
      .limit(1);

    const row = orderRows[0];
    const order = row
      ? {
          ...row.order,
          fuel_types: row.fuelType,
          depots: row.depot,
          delivery_addresses: row.deliveryAddress,
        }
      : null;
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // If driver is assigned, fetch driver details
    if (order.assigned_driver_id) {
      const driverRows = await db
        .select({ userId: drivers.userId })
        .from(drivers)
        .where(eq(drivers.id, order.assigned_driver_id))
        .limit(1);

      const driver = driverRows[0];
      if (driver) {
        const profileRows = await db
          .select({
            full_name: profiles.fullName,
            phone: profiles.phone,
            profile_photo_url: profiles.profilePhotoUrl,
          })
          .from(profiles)
          .where(eq(profiles.id, driver.userId))
          .limit(1);

        const driverProfile = profileRows[0];
        if (driverProfile) {
          (order as any).driver_details = driverProfile;
        }
      }
    }

    res.json(order);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get dispatch offers (driver quotes) for an order
router.get("/orders/:id/offers", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;

  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Ensure order belongs to customer
    const orderCheckRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)))
      .limit(1);
    const orderCheck = orderCheckRows[0];
    if (!orderCheck) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Get all offers for this order - including pending_customer (auto-calculated offers)
    const offers = await db
      .select({
        id: dispatchOffers.id,
        driver_id: dispatchOffers.driverId,
        state: dispatchOffers.state,
        proposed_delivery_time: dispatchOffers.proposedDeliveryTime,
        proposed_price_per_km_cents: dispatchOffers.proposedPricePerKmCents,
        proposed_notes: dispatchOffers.proposedNotes,
        created_at: dispatchOffers.createdAt,
        updated_at: dispatchOffers.updatedAt,
        customer_response_at: dispatchOffers.customerResponseAt,
      })
      .from(dispatchOffers)
      .where(
        and(
          eq(dispatchOffers.orderId, orderId),
          inArray(dispatchOffers.state, [
            "pending_customer",
            "customer_accepted",
            "customer_declined",
            "offered",
          ]),
          isNotNull(dispatchOffers.proposedPricePerKmCents),
        ),
      )
      .orderBy(desc(dispatchOffers.createdAt));

    if (!offers || offers.length === 0) {
      return res.json([]);
    }

    const driverIds = Array.from(new Set(offers.map((offer: any) => offer.driver_id)));
    const driverRows =
      driverIds.length > 0
        ? await db
            .select({
              id: drivers.id,
              user_id: drivers.userId,
              vehicle_capacity_litres: drivers.vehicleCapacityLitres,
              premium_status: drivers.premiumStatus,
            })
            .from(drivers)
            .where(inArray(drivers.id, driverIds))
        : [];

    const driverUserIds = Array.from(new Set(driverRows.map((driver: any) => driver.user_id)));
    const profileRows =
      driverUserIds.length > 0
        ? await db
            .select({
              id: profiles.id,
              full_name: profiles.fullName,
              phone: profiles.phone,
              profile_photo_url: profiles.profilePhotoUrl,
            })
            .from(profiles)
            .where(inArray(profiles.id, driverUserIds))
        : [];

    // Get order to fetch fuel_type_id for driver pricing lookup
    const orderForPricingRows = await db
      .select({
        fuel_type_id: orders.fuelTypeId,
        drop_lat: orders.dropLat,
        drop_lng: orders.dropLng,
        litres: orders.litres,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const orderForPricing = orderForPricingRows[0];

    // Fetch driver pricing for all drivers and the order's fuel type
    let driverPricingMap = new Map();
    if (orderForPricing?.fuel_type_id && driverIds.length > 0) {
      const driverPricingRows = await db
        .select({
          driver_id: driverPricing.driverId,
          fuel_price_per_liter_cents: driverPricing.fuelPricePerLiterCents,
        })
        .from(driverPricing)
        .where(
          and(
            eq(driverPricing.fuelTypeId, orderForPricing.fuel_type_id),
            inArray(driverPricing.driverId, driverIds),
            eq(driverPricing.active, true),
          ),
        );

      if (driverPricingRows) {
        driverPricingMap = new Map(
          driverPricingRows.map((p: any) => [p.driver_id, p.fuel_price_per_liter_cents]),
        );
      }
    }

    // Get driver locations for distance calculation
    const driversWithLocation =
      driverIds.length > 0
        ? await db
            .select({
              id: drivers.id,
              current_lat: drivers.currentLat,
              current_lng: drivers.currentLng,
            })
            .from(drivers)
            .where(inArray(drivers.id, driverIds))
        : [];

    const driverLocationMap = new Map(
      (driversWithLocation || []).map((d: any) => [d.id, { lat: d.current_lat, lng: d.current_lng }]),
    );

    const driverMap = new Map((driverRows || []).map((driver: any) => [driver.id, driver]));
    const profileMap = new Map((profileRows || []).map((profile: any) => [profile.id, profile]));

    const { calculateDistance, milesToKm } = await import("./utils/distance");

    const formattedOffers = offers.map((offer: any) => {
      const driver = driverMap.get(offer.driver_id);
      const profile = driver ? profileMap.get(driver.user_id) : null;
      const fuelPricePerLiterCents = driverPricingMap.get(offer.driver_id) || 0;

      // Calculate distance from driver's current location to customer drop location
      let distanceKm = 0;
      const driverLocation = driverLocationMap.get(offer.driver_id);
      if (driverLocation?.lat && driverLocation?.lng && orderForPricing?.drop_lat && orderForPricing?.drop_lng) {
        const distanceMiles = calculateDistance(
          driverLocation.lat,
          driverLocation.lng,
          orderForPricing.drop_lat,
          orderForPricing.drop_lng
        );
        distanceKm = milesToKm(distanceMiles);
      }

      // Calculate pricing for this quote
      const litres = parseFloat(orderForPricing?.litres || 0);
      const fuelCost = (fuelPricePerLiterCents / 100) * litres;
      const pricePerKmCents = offer.proposed_price_per_km_cents || 0;
      const pricePerKmRands = pricePerKmCents / 100;
      const deliveryFee = pricePerKmRands * distanceKm;
      const total = fuelCost + deliveryFee;

      return {
        ...offer,
        driver: driver
          ? {
              id: driver.id,
              premiumStatus: driver.premium_status,
              vehicleCapacityLitres: driver.vehicle_capacity_litres,
              profile: profile
                ? {
                    fullName: profile.full_name,
                    phone: profile.phone,
                    profilePhotoUrl: profile.profile_photo_url,
                  }
                : null,
            }
          : null,
        estimatedPricing: {
          fuelPricePerLiterCents,
          fuelCost,
          deliveryFee,
          distanceKm,
          total,
          pricePerKmCents,
        },
      };
    });

    res.json(formattedOffers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer accepts a driver quote
router.post("/orders/:id/offers/:offerId/accept", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;
  const offerId = req.params.offerId;

  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)))
      .limit(1);
    const order = orderRows[0];
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.state !== "created" && order.state !== "awaiting_payment") {
      return res.status(409).json({ error: "Order can no longer accept driver quotes" });
    }

    const offerRows = await db
      .select()
      .from(dispatchOffers)
      .where(and(eq(dispatchOffers.id, offerId), eq(dispatchOffers.orderId, orderId)))
      .limit(1);
    const offer = offerRows[0];
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    if (offer.state !== "pending_customer") {
      return res.status(409).json({ error: "This offer has already been actioned" });
    }

    const nowIso = new Date().toISOString();
    
    // Get driver's fuel price per liter for this fuel type
    const driverPricingRows = await db
      .select({ fuel_price_per_liter_cents: driverPricing.fuelPricePerLiterCents })
      .from(driverPricing)
      .where(
        and(
          eq(driverPricing.driverId, offer.driverId),
          eq(driverPricing.fuelTypeId, order.fuelTypeId),
          eq(driverPricing.active, true),
        ),
      )
      .limit(1);
    const pricing = driverPricingRows[0];
    
    const fuelPricePerLiterCents = pricing?.fuel_price_per_liter_cents || 0;
    const pricePerKmCents = Number(offer.proposedPricePerKmCents) || 0;
    const litres = Number(order.litres) || 0;
    
    // Calculate distance from driver's current location to customer drop location
    let distanceKm = 0;
    const driverRows = await db
      .select({ current_lat: drivers.currentLat, current_lng: drivers.currentLng })
      .from(drivers)
      .where(eq(drivers.id, offer.driverId))
      .limit(1);
    const driver = driverRows[0];
    
    if (driver?.current_lat && driver?.current_lng && order.dropLat && order.dropLng) {
      const { calculateDistance, milesToKm } = await import("./utils/distance");
      const distanceMiles = calculateDistance(
        driver.current_lat,
        driver.current_lng,
        order.dropLat,
        order.dropLng,
      );
      distanceKm = milesToKm(distanceMiles);
    }
    
    // Calculate total: (fuel_price_per_liter * litres) + (price_per_km * distance_km)
    const fuelCostCents = Math.round(fuelPricePerLiterCents * litres);
    const deliveryFeeCents = Math.round(pricePerKmCents * distanceKm);
    const serviceFee = Number(order.serviceFeeCents) || 0;
    const totalCents = fuelCostCents + deliveryFeeCents + serviceFee;

    const updatedOrderRows = await db
      .update(orders)
      .set({
        state: "assigned",
        assignedDriverId: offer.driverId,
        confirmedDeliveryTime: offer.proposedDeliveryTime,
        fuelPriceCents: fuelPricePerLiterCents,
        deliveryFeeCents: deliveryFeeCents,
        totalCents: totalCents,
        updatedAt: new Date(nowIso),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.customerId, customer.id),
          inArray(orders.state, ["created", "awaiting_payment"]),
        ),
      )
      .returning();
    const updatedOrder = updatedOrderRows[0];
    if (!updatedOrder) {
      return res.status(409).json({ error: "Failed to assign driver. Please refresh and try again." });
    }

    const customerRow = (
      await db
        .select({ user_id: customers.userId, company_name: customers.companyName })
        .from(customers)
        .where(eq(customers.id, updatedOrder.customerId))
        .limit(1)
    )[0];
    const fuelTypeRow = (
      await db
        .select({ label: fuelTypes.label })
        .from(fuelTypes)
        .where(eq(fuelTypes.id, updatedOrder.fuelTypeId))
        .limit(1)
    )[0];
    const deliveryAddressRow = updatedOrder.deliveryAddressId
      ? (
          await db
            .select({
              address_street: deliveryAddresses.addressStreet,
              address_city: deliveryAddresses.addressCity,
              address_province: deliveryAddresses.addressProvince,
            })
            .from(deliveryAddresses)
            .where(eq(deliveryAddresses.id, updatedOrder.deliveryAddressId))
            .limit(1)
        )[0]
      : null;
    const updatedOrderPayload: any = {
      ...updatedOrder,
      id: updatedOrder.id,
      customer_id: updatedOrder.customerId,
      litres: updatedOrder.litres,
      drop_lat: updatedOrder.dropLat,
      drop_lng: updatedOrder.dropLng,
      state: updatedOrder.state,
      customers: customerRow || null,
      fuel_types: fuelTypeRow || null,
      delivery_addresses: deliveryAddressRow || null,
    };

    // Fetch full updated order data for WebSocket broadcast
    const fullOrderData = await fetchFullOrderData(updatedOrderPayload.id);
    
    // Broadcast order update via WebSocket with full order data
    const { websocketService } = await import("./websocket");
    
    if (fullOrderData) {
      // Notify customer
      websocketService.sendOrderUpdate(user.id, {
        type: "order_updated",
        orderId: updatedOrderPayload.id,
        order: fullOrderData,
      });

      // Notify driver
      if (offer.driverId) {
        const driverUserRow = (
          await db
            .select({ user_id: drivers.userId })
            .from(drivers)
            .where(eq(drivers.id, offer.driverId))
            .limit(1)
        )[0];
        
        if (driverUserRow?.user_id) {
          websocketService.sendOrderUpdate(driverUserRow.user_id, {
            type: "order_updated",
            orderId: updatedOrderPayload.id,
            order: fullOrderData,
          });
        }
      }
    }

    // Broadcast to all drivers that this order is no longer available
    websocketService.broadcastToRole("driver", {
      type: "order_assigned",
      payload: {
        orderId: updatedOrder.id,
        state: updatedOrderPayload.state,
        assignedDriverId: updatedOrderPayload.assignedDriverId,
      },
    });

    await db
      .update(dispatchOffers)
      .set({
        state: "customer_accepted",
        customerResponseAt: new Date(nowIso),
        updatedAt: new Date(nowIso),
      })
      .where(eq(dispatchOffers.id, offerId));

    // Get all other offers that will be declined
    const otherOffers = await db
      .select({ driver_id: dispatchOffers.driverId })
      .from(dispatchOffers)
      .where(
        and(
          eq(dispatchOffers.orderId, orderId),
          ne(dispatchOffers.id, offerId),
          inArray(dispatchOffers.state, ["pending_customer", "offered"]),
        ),
      );

    await db
      .update(dispatchOffers)
      .set({
        state: "customer_declined",
        customerResponseAt: new Date(nowIso),
        updatedAt: new Date(nowIso),
      })
      .where(
        and(
          eq(dispatchOffers.orderId, orderId),
          ne(dispatchOffers.id, offerId),
          inArray(dispatchOffers.state, ["pending_customer", "offered"]),
        ),
      );

    // Notify drivers whose quotes were declined
    if (otherOffers && otherOffers.length > 0) {
      const declinedDriverIds = otherOffers.map((o: any) => o.driver_id);
      const declinedDrivers =
        declinedDriverIds.length > 0
          ? await db
              .select({ id: drivers.id, user_id: drivers.userId })
              .from(drivers)
              .where(inArray(drivers.id, declinedDriverIds))
          : [];

      for (const driver of declinedDrivers || []) {
        if (driver.user_id) {
          await offerNotifications.onCustomerDeclined(driver.user_id, offerId);
        }
      }
    }

    // Fetch driver profile for notifications
    const driverRecordRows = await db
      .select({ id: drivers.id, user_id: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, offer.driverId))
      .limit(1);
    const driverRecord = driverRecordRows[0];

    const driverUserId = driverRecord?.user_id;
    let driverProfileName = "Driver";

    let driverProfilePhone: string | null = null;
    if (driverUserId) {
      const driverProfile = (
        await db
          .select({ full_name: profiles.fullName, phone: profiles.phone })
          .from(profiles)
          .where(eq(profiles.id, driverUserId))
          .limit(1)
      )[0];
      if (driverProfile?.full_name) {
        driverProfileName = driverProfile.full_name;
      }
      if (driverProfile?.phone) {
        driverProfilePhone = driverProfile.phone;
      }
    }

    const customerUserId = updatedOrderPayload.customers?.user_id || user.id;
    let customerEmail: string | null = null;
    let customerName =
      updatedOrderPayload.customers?.company_name ||
      "Customer";

    if (customerUserId) {
      const customerProfile = (
        await db
          .select({ full_name: profiles.fullName })
          .from(profiles)
          .where(eq(profiles.id, customerUserId))
          .limit(1)
      )[0];
      const customerAuth = (
        await db
          .select({ email: localAuthUsers.email })
          .from(localAuthUsers)
          .where(eq(localAuthUsers.id, customerUserId))
          .limit(1)
      )[0];
      if (customerAuth?.email) {
        customerEmail = customerAuth.email;
      }
      if (customerProfile?.full_name) {
        customerName = customerProfile.full_name;
      }
    }

    const chatThread = await ensureChatThreadForAssignment({
      orderId,
      customerId: updatedOrder.customerId,
      driverId: offer.driverId,
      customerUserId,
      driverUserId,
    });

    // Notify both driver and customer using helper functions
    if (driverUserId) {
      await orderNotifications.onDriverAssigned(
        customerUserId,
        driverUserId,
        orderId,
        driverProfileName,
        driverProfilePhone || "Not available"
      );
    }

    // Send confirmation email to customer
    if (customerEmail) {
      const deliveryAddress = updatedOrder.delivery_addresses
        ? `${updatedOrderPayload.delivery_addresses.address_street}, ${updatedOrderPayload.delivery_addresses.address_city}, ${updatedOrderPayload.delivery_addresses.address_province}`
        : `${updatedOrderPayload.drop_lat}, ${updatedOrderPayload.drop_lng}`;

      const confirmedTime = offer.proposedDeliveryTime
        ? new Date(offer.proposedDeliveryTime).toLocaleString("en-ZA", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Africa/Johannesburg",
          })
        : "Not specified";

      sendDriverAcceptanceEmail({
        customerEmail,
        customerName,
        orderNumber: updatedOrderPayload.id.substring(0, 8).toUpperCase(),
        driverName: driverProfileName,
        driverPhone: driverProfilePhone || "Not available",
        confirmedDeliveryTime: confirmedTime,
        fuelType: updatedOrderPayload.fuel_types?.label || "Fuel",
        litres: String(updatedOrderPayload.litres),
        deliveryAddress,
      }).catch(() => {
        // Email send failed
      });
    }

    res.json({
      success: true,
      message: "Driver assigned successfully",
      orderId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to accept driver offer" });
  }
});

// Create new order
router.post("/orders", async (req, res) => {
  const user = (req as any).user;
  const {
    fuelTypeId,
    litres,
    maxBudgetCents,
    deliveryAddressId,
    deliveryDate,
    fromTime,
    toTime,
    accessNotes,
    priorityLevel,
    vehicleRegistration,
    equipmentType,
    tankCapacity,
    paymentMethodId,
    termsAccepted,
    signatureData,
    selectedDepotId,
  } = req.body;

  try {
    // Validate required inputs
    if (!fuelTypeId) {
      return res.status(400).json({ error: "Fuel type is required" });
    }

    const litresNum = parseFloat(litres);
    if (isNaN(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Invalid litres value" });
    }

    if (!termsAccepted) {
      return res.status(400).json({ error: "Terms and conditions must be accepted" });
    }

    // Validate tank capacity if provided
    if (tankCapacity) {
      const capacity = parseFloat(tankCapacity);
      if (isNaN(capacity) || capacity <= 0) {
        return res.status(400).json({ error: "Tank capacity must be a valid positive number" });
      }
    }

    // Get customer ID from user ID
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Get delivery address details if provided
    let lat, lng;
    if (deliveryAddressId) {
      const address = (
        await db
          .select({ lat: deliveryAddresses.lat, lng: deliveryAddresses.lng })
          .from(deliveryAddresses)
          .where(and(eq(deliveryAddresses.id, deliveryAddressId), eq(deliveryAddresses.customerId, customer.id)))
          .limit(1)
      )[0];

      if (!address) {
        return res.status(400).json({ error: "Invalid delivery address" });
      }

      lat = address.lat;
      lng = address.lng;
    } else {
      return res.status(400).json({ error: "Delivery address is required" });
    }

    // No longer linking orders to depots - drivers handle depot relationships
    // Remove depot linking from customer orders
    const depotId = null;

    // Pricing will be calculated when customer accepts a driver's offer
    // Set to 0 as placeholder (marketplace model - drivers compete with their delivery fees)
    const fuelPriceCents = 0;
    const deliveryFeeCents = 0;
    const serviceFeeCents = 0;
    const totalCents = 0;

    // Convert time strings (HH:MM) to full timestamps (South African timezone SAST = UTC+2)
    // Only create timestamps if we have a delivery date - otherwise leave as null
    let fromTimeTimestamp = null;
    let toTimeTimestamp = null;
    
    if (fromTime && deliveryDate) {
      // Validate HH:MM format
      if (!/^\d{2}:\d{2}$/.test(fromTime)) {
        return res.status(400).json({ error: "Invalid from time format. Expected HH:MM" });
      }
      // Parse with SAST offset (+02:00) and convert to ISO string for proper round-tripping
      const fromDateTime = new Date(`${deliveryDate}T${fromTime}:00+02:00`);
      fromTimeTimestamp = fromDateTime.toISOString();
    }
    
    if (toTime && deliveryDate) {
      // Validate HH:MM format
      if (!/^\d{2}:\d{2}$/.test(toTime)) {
        return res.status(400).json({ error: "Invalid to time format. Expected HH:MM" });
      }
      // Parse with SAST offset (+02:00) and convert to ISO string for proper round-tripping
      const toDateTime = new Date(`${deliveryDate}T${toTime}:00+02:00`);
      toTimeTimestamp = toDateTime.toISOString();
    }

    // Create order with all new fields
    const newOrderRows = await db
      .insert(orders)
      .values({
        customerId: customer.id,
        fuelTypeId,
        litres: litresNum.toString(),
        deliveryAddressId,
        dropLat: lat,
        dropLng: lng,
        accessInstructions: accessNotes || null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        fromTime: fromTimeTimestamp ? new Date(fromTimeTimestamp) : null,
        toTime: toTimeTimestamp ? new Date(toTimeTimestamp) : null,
        priorityLevel: priorityLevel || "medium",
        vehicleRegistration: vehicleRegistration || null,
        equipmentType: equipmentType || null,
        tankCapacity: tankCapacity ? String(parseFloat(tankCapacity)) : null,
        paymentMethodId: paymentMethodId || null,
        termsAccepted,
        termsAcceptedAt: termsAccepted ? new Date() : null,
        signatureData: signatureData || null,
        fuelPriceCents,
        deliveryFeeCents,
        serviceFeeCents,
        totalCents,
        selectedDepotId: depotId,
        state: "created",
      })
      .returning();
    const newOrder = newOrderRows[0];

    // Broadcast new order to all drivers via WebSocket
    // Use setImmediate to ensure database transaction is committed first
    const { websocketService } = await import("./websocket");
    setImmediate(async () => {
      await websocketService.broadcastToRole("driver", {
        type: "new_order",
        payload: {
          orderId: newOrder.id,
          fuelTypeId: newOrder.fuelTypeId,
          litres: litresNum,
          dropLat: lat,
          dropLng: lng,
          state: newOrder.state,
          createdAt: newOrder.createdAt,
        },
      });
    });

    // Also notify the customer who created the order
    websocketService.sendOrderUpdate(user.id, {
      type: "order_created",
      orderId: newOrder.id,
      state: newOrder.state,
    });

    // No longer notifying suppliers about customer orders
    // Suppliers only interact with drivers through depot orders

    // Create dispatch offers for drivers IMMEDIATELY (wait for completion)
    // This ensures drivers are available when customer views the order
    try {
      const orderFuelTypeId = (newOrder as any).fuelTypeId ?? (newOrder as any).fuel_type_id;
      if (!orderFuelTypeId) {
        console.warn(`[createDispatchOffers] Order ${newOrder.id}: missing fuel type id on created order payload`);
      }
      await createDispatchOffers({
        orderId: newOrder.id,
        fuelTypeId: orderFuelTypeId,
        dropLat: lat,
        dropLng: lng,
        litres: litresNum,
        maxBudgetCents: maxBudgetCents || null,
      });
    } catch (error) {
      console.error("Error creating dispatch offers:", error);
      // Don't fail the order creation if offers fail - they can be created later
    }

    res.status(201).json(newOrder);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update order (customer can only update before payment)
router.patch("/orders/:id", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;
  const {
    fuelTypeId,
    litres,
    dropLat,
    dropLng,
    timeWindow,
  } = req.body;

  try {
    // Get customer ID from user ID
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Check if order exists and belongs to customer
    const existingOrder = (
      await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)))
        .limit(1)
    )[0];
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow updates for orders in "created" or "awaiting_payment" state
    if (!["created", "awaiting_payment"].includes(existingOrder.state)) {
      return res.status(400).json({ 
        error: "Order cannot be modified in current state" 
      });
    }

    let updateData: any = {
      updated_at: new Date(),
    };

    // If fuel type or litres changed, update them but DON'T recalculate pricing
    // Pricing is calculated only when customer accepts a driver's offer (marketplace model)
    if (fuelTypeId || litres) {
      const newFuelTypeId = fuelTypeId || existingOrder.fuelTypeId;
      const newLitres = parseFloat(litres || existingOrder.litres);

      if (isNaN(newLitres) || newLitres <= 0) {
        return res.status(400).json({ error: "Invalid litres value" });
      }

      updateData = {
        ...updateData,
        fuelTypeId: newFuelTypeId,
        litres: newLitres.toString(),
        // Keep pricing at 0 until driver offer is accepted
        fuelPriceCents: 0,
        deliveryFeeCents: 0,
        serviceFeeCents: 0,
        totalCents: 0,
      };
    }

    if (dropLat !== undefined) {
      const lat = parseFloat(dropLat);
      if (isNaN(lat)) {
        return res.status(400).json({ error: "Invalid latitude value" });
      }
      updateData.dropLat = lat;
    }
    
    if (dropLng !== undefined) {
      const lng = parseFloat(dropLng);
      if (isNaN(lng)) {
        return res.status(400).json({ error: "Invalid longitude value" });
      }
      updateData.dropLng = lng;
    }
    
    if (timeWindow !== undefined) updateData.timeWindow = timeWindow;

    // Update order
    const updatedOrder = (
      await db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, orderId))
        .returning()
    )[0];

    // Broadcast order update
    websocketService.sendOrderUpdate(user.id, {
      type: "order_updated",
      orderId: orderId,
      state: updatedOrder?.state,
    });

    res.json(updatedOrder);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel order
router.delete("/orders/:id", async (req, res) => {
  const user = (req as any).user;
  const orderId = req.params.id;

  try {
    // Get customer ID from user ID
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Check if order exists and belongs to customer
    const existingOrder = (
      await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)))
        .limit(1)
    )[0];
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Only allow cancellation for orders that haven't been picked up yet
    const nonCancellableStates = ["delivered", "cancelled", "refunded", "picked_up", "en_route"];
    if (nonCancellableStates.includes(existingOrder.state)) {
      return res.status(400).json({ 
        error: "Order cannot be cancelled - already in progress or completed" 
      });
    }

    // Update order state to cancelled
    const cancelledOrder = (
      await db
        .update(orders)
        .set({
          state: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning()
    )[0];

    // Broadcast order cancellation
    websocketService.sendOrderUpdate(user.id, {
      type: "order_cancelled",
      orderId: orderId,
      state: cancelledOrder.state,
    });

    res.json(cancelledOrder);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === DELIVERY ADDRESSES ENDPOINTS ===

// Get all delivery addresses for the authenticated customer
router.get("/delivery-addresses", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const addresses = await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.customerId, customer.id))
      .orderBy(desc(deliveryAddresses.isDefault), desc(deliveryAddresses.createdAt));
    res.json(addresses || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new delivery address
router.post("/delivery-addresses", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { 
      label, 
      addressStreet, 
      addressCity, 
      addressProvince, 
      addressPostalCode, 
      addressCountry,
      lat,
      lng,
      accessInstructions,
      isDefault 
    } = req.body;

    // If this is being set as default, unset other defaults
    if (isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.customerId, customer.id));
    }

    const newAddress = (
      await db
        .insert(deliveryAddresses)
        .values({
          customerId: customer.id,
          label,
          addressStreet,
          addressCity,
          addressProvince,
          addressPostalCode,
          addressCountry: addressCountry || "South Africa",
          lat,
          lng,
          accessInstructions,
          isDefault: isDefault || false,
        })
        .returning()
    )[0];
    
    // Broadcast delivery address creation
    websocketService.sendToUser(user.id, {
      type: "address_created",
      payload: { addressId: newAddress.id },
    });
    
    res.json(newAddress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a delivery address
router.patch("/delivery-addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { 
      label, 
      addressStreet, 
      addressCity, 
      addressProvince, 
      addressPostalCode,
      addressCountry, 
      lat,
      lng,
      accessInstructions,
      isDefault 
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(and(eq(deliveryAddresses.customerId, customer.id), ne(deliveryAddresses.id, addressId)));
    }

    const updateData: any = { updatedAt: new Date() };
    if (label !== undefined) updateData.label = label;
    if (addressStreet !== undefined) updateData.addressStreet = addressStreet;
    if (addressCity !== undefined) updateData.addressCity = addressCity;
    if (addressProvince !== undefined) updateData.addressProvince = addressProvince;
    if (addressPostalCode !== undefined) updateData.addressPostalCode = addressPostalCode;
    if (addressCountry !== undefined) updateData.addressCountry = addressCountry;
    if (lat !== undefined) updateData.lat = lat;
    if (lng !== undefined) updateData.lng = lng;
    if (accessInstructions !== undefined) updateData.accessInstructions = accessInstructions;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const updatedAddress = (
      await db
        .update(deliveryAddresses)
        .set(updateData)
        .where(and(eq(deliveryAddresses.id, addressId), eq(deliveryAddresses.customerId, customer.id)))
        .returning()
    )[0];
    if (!updatedAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Broadcast delivery address update
    websocketService.sendToUser(user.id, {
      type: "address_updated",
      payload: { addressId: addressId },
    });

    res.json(updatedAddress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a delivery address
router.delete("/delivery-addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    await db
      .delete(deliveryAddresses)
      .where(and(eq(deliveryAddresses.id, addressId), eq(deliveryAddresses.customerId, customer.id)));
    
    // Broadcast delivery address deletion
    websocketService.sendToUser(user.id, {
      type: "address_deleted",
      payload: { addressId: addressId },
    });
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// === PAYMENT METHODS ENDPOINTS ===

// Get all payment methods for the authenticated customer
router.get("/payment-methods", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const paymentMethodRows = await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.customerId, customer.id), eq(paymentMethods.isActive, true)))
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
    res.json(paymentMethodRows || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new payment method
router.post("/payment-methods", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const { 
      methodType, 
      label, 
      bankName,
      accountHolderName,
      accountNumber,
      branchCode,
      accountType,
      cardLastFour,
      cardBrand,
      cardExpiryMonth,
      cardExpiryYear,
      paymentGatewayToken,
      isDefault 
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(paymentMethods)
        .set({ isDefault: false })
        .where(eq(paymentMethods.customerId, customer.id));
    }

    const newPaymentMethod = (
      await db
        .insert(paymentMethods)
        .values({
          customerId: customer.id,
          methodType,
          label,
          bankName,
          accountHolderName,
          accountNumber,
          branchCode,
          accountType,
          cardLastFour,
          cardBrand,
          cardExpiryMonth,
          cardExpiryYear,
          paymentGatewayToken,
          isDefault: isDefault || false,
          isActive: true,
        })
        .returning()
    )[0];
    
    // Broadcast payment method creation
    websocketService.sendToUser(user.id, {
      type: "payment_method_created",
      payload: { paymentMethodId: newPaymentMethod.id },
    });
    
    res.json(newPaymentMethod);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a payment method
router.delete("/payment-methods/:id", async (req, res) => {
  const user = (req as any).user;
  const paymentMethodId = req.params.id;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Soft delete by marking as inactive
    await db
      .update(paymentMethods)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.customerId, customer.id)));
    
    // Broadcast payment method deletion
    websocketService.sendToUser(user.id, {
      type: "payment_method_deleted",
      payload: { paymentMethodId: paymentMethodId },
    });
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============== DELIVERY ADDRESSES ==============

// Get all delivery addresses for the authenticated customer
router.get("/addresses", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const addresses = await db
      .select()
      .from(deliveryAddresses)
      .where(eq(deliveryAddresses.customerId, customer.id))
      .orderBy(desc(deliveryAddresses.isDefault), desc(deliveryAddresses.createdAt));
    res.json(addresses || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single delivery address
router.get("/addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    const address = (
      await db
        .select()
        .from(deliveryAddresses)
        .where(and(eq(deliveryAddresses.id, addressId), eq(deliveryAddresses.customerId, customer.id)))
        .limit(1)
    )[0];
    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json(address);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new delivery address
router.post("/addresses", async (req, res) => {
  const user = (req as any).user;
  const body = req.body ?? {};
  const label = body.label ?? null;
  const addressStreet = body.addressStreet ?? body.address_street ?? null;
  const addressCity = body.addressCity ?? body.address_city ?? null;
  const addressProvince = body.addressProvince ?? body.address_province ?? "Gauteng";
  const addressPostalCode = body.addressPostalCode ?? body.address_postal_code ?? null;
  const addressCountry = body.addressCountry ?? body.address_country ?? "South Africa";
  const lat = body.lat ?? null;
  const lng = body.lng ?? null;
  const accessInstructions = body.accessInstructions ?? body.access_instructions ?? null;
  const isDefault = body.isDefault ?? body.is_default ?? false;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.customerId, customer.id));
    }

    const newAddress = (
      await db
        .insert(deliveryAddresses)
        .values({
          customerId: customer.id,
          label,
          addressStreet,
          addressCity,
          addressProvince,
          addressPostalCode,
          addressCountry: addressCountry || "South Africa",
          lat,
          lng,
          accessInstructions,
          isDefault: isDefault || false,
        })
        .returning()
    )[0];
    
    // Broadcast address creation
    websocketService.sendToUser(user.id, {
      type: "address_created",
      payload: { addressId: newAddress.id },
    });
    
    res.json(newAddress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update delivery address
router.put("/addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  const body = req.body ?? {};
  const label = body.label ?? null;
  const addressStreet = body.addressStreet ?? body.address_street ?? null;
  const addressCity = body.addressCity ?? body.address_city ?? null;
  const addressProvince = body.addressProvince ?? body.address_province ?? "Gauteng";
  const addressPostalCode = body.addressPostalCode ?? body.address_postal_code ?? null;
  const addressCountry = body.addressCountry ?? body.address_country ?? "South Africa";
  const lat = body.lat ?? null;
  const lng = body.lng ?? null;
  const accessInstructions = body.accessInstructions ?? body.access_instructions ?? null;
  const isDefault = body.isDefault ?? body.is_default ?? false;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db
        .update(deliveryAddresses)
        .set({ isDefault: false })
        .where(eq(deliveryAddresses.customerId, customer.id));
    }

    const updatedAddress = (
      await db
        .update(deliveryAddresses)
        .set({
          label,
          addressStreet,
          addressCity,
          addressProvince,
          addressPostalCode,
          addressCountry,
          lat,
          lng,
          accessInstructions,
          isDefault,
          updatedAt: new Date(),
        })
        .where(and(eq(deliveryAddresses.id, addressId), eq(deliveryAddresses.customerId, customer.id)))
        .returning()
    )[0];
    if (!updatedAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Broadcast address update
    websocketService.sendToUser(user.id, {
      type: "address_updated",
      payload: { addressId: addressId },
    });

    res.json(updatedAddress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete delivery address
router.delete("/addresses/:id", async (req, res) => {
  const user = (req as any).user;
  const addressId = req.params.id;
  
  try {
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // First check if address exists
    const existingAddress = (
      await db
        .select({ id: deliveryAddresses.id })
        .from(deliveryAddresses)
        .where(and(eq(deliveryAddresses.id, addressId), eq(deliveryAddresses.customerId, customer.id)))
        .limit(1)
    )[0];
    if (!existingAddress) {
      return res.status(404).json({ error: "Address not found" });
    }

    await db
      .delete(deliveryAddresses)
      .where(and(eq(deliveryAddresses.id, addressId), eq(deliveryAddresses.customerId, customer.id)));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============== CUSTOMER PROFILE ==============

// Get customer profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const profile = (
      await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
    )[0];
    
    // If no profile, user needs to complete setup
    if (!profile) {
      return res.status(404).json({ 
        error: "Profile not found",
        code: "PROFILE_SETUP_REQUIRED",
        message: "Please complete your profile setup"
      });
    }

    let customer = (
      await db.select().from(customers).where(eq(customers.userId, user.id)).limit(1)
    )[0];
    
    // If no customer record but profile exists, create it
    if (!customer) {
      const newCustomer = (
        await db.insert(customers).values({ userId: user.id }).returning()
      )[0];

      return res.json({
        ...profile,
        ...newCustomer,
        email: user.email || null,
      });
    }

    res.json({
      ...profile,
      ...customer,
      email: user.email || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update customer profile
router.put("/profile", async (req, res) => {
  const user = (req as any).user;
  const {
    fullName,
    phone,
    companyName,
    tradingAs,
    vatNumber,
    billingAddressStreet,
    billingAddressCity,
    billingAddressProvince,
    billingAddressPostalCode,
    billingAddressCountry
  } = req.body;
  
  try {
    // Update profile table
    await db
      .update(profiles)
      .set({
        fullName: fullName,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, user.id));

    // Update customer table
    const updatedCustomer = (
      await db
        .update(customers)
        .set({
          companyName: companyName,
          tradingAs: tradingAs,
          vatNumber: vatNumber,
          billingAddressStreet: billingAddressStreet,
          billingAddressCity: billingAddressCity,
          billingAddressProvince: billingAddressProvince,
          billingAddressPostalCode: billingAddressPostalCode,
          billingAddressCountry: billingAddressCountry,
          updatedAt: new Date(),
        })
        .where(eq(customers.userId, user.id))
        .returning()
    )[0];

    // Broadcast customer profile update
    websocketService.sendToUser(user.id, {
      type: "customer_profile_updated",
      payload: { userId: user.id },
    });

    res.json({ success: true, customer: updatedCustomer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get driver's current location for an order
router.get("/orders/:orderId/driver-location", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get customer ID
    const customer = await getCustomerByUserId(user.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer profile not found" });
    }

    // Get order and verify it belongs to customer
    const order = (
      await db
        .select({
          id: orders.id,
          assigned_driver_id: orders.assignedDriverId,
          state: orders.state,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)))
        .limit(1)
    )[0];
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check if driver is assigned
    if (!order.assigned_driver_id) {
      return res.status(404).json({ error: "No driver assigned to this order" });
    }

    // Get driver info
    const driver = (
      await db
        .select({
          id: drivers.id,
          user_id: drivers.userId,
          current_lat: drivers.currentLat,
          current_lng: drivers.currentLng,
        })
        .from(drivers)
        .where(eq(drivers.id, order.assigned_driver_id))
        .limit(1)
    )[0];
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // Get driver location with fallback priority:
    // 1. Most recent location from driver_locations (for this order, then any order)
    // 2. Last known location from driver_locations (any time)
    // 3. Default location from driver settings (current_lat/current_lng)
    let latitude: number | null = null;
    let longitude: number | null = null;
    let lastUpdate: string | null = null;
    let locationSource: "realtime" | "last_known" | "default" = "default";

    if (["en_route", "picked_up"].includes(order.state)) {
      // Priority 1: Get the most recent location from driver_locations table for this specific order
      // Prioritize locations from the last 5 minutes to ensure we get fresh GPS data
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const recentLocation = (
        await db
          .select({
            lat: driverLocations.lat,
            lng: driverLocations.lng,
            created_at: driverLocations.createdAt,
          })
          .from(driverLocations)
          .where(
            and(
              eq(driverLocations.driverId, driver.id),
              eq(driverLocations.orderId, orderId),
              gte(driverLocations.createdAt, new Date(fiveMinutesAgo)),
            ),
          )
          .orderBy(desc(driverLocations.createdAt))
          .limit(1)
      )[0];

      // Priority 2: If no recent location for this order, try any recent location from this driver
      if (!recentLocation || !recentLocation.lat || !recentLocation.lng) {
        const fallbackLocation = (
          await db
            .select({
              lat: driverLocations.lat,
              lng: driverLocations.lng,
              created_at: driverLocations.createdAt,
            })
            .from(driverLocations)
            .where(
              and(
                eq(driverLocations.driverId, driver.id),
                gte(driverLocations.createdAt, new Date(fiveMinutesAgo)),
              ),
            )
            .orderBy(desc(driverLocations.createdAt))
            .limit(1)
        )[0];
        
        if (fallbackLocation && fallbackLocation.lat && fallbackLocation.lng) {
          latitude = fallbackLocation.lat;
          longitude = fallbackLocation.lng;
          lastUpdate = fallbackLocation.created_at;
          locationSource = "realtime";
        }
      } else {
        latitude = recentLocation.lat;
        longitude = recentLocation.lng;
        lastUpdate = recentLocation.created_at;
        locationSource = "realtime";
      }

      // Priority 3: If no recent location, get last known location (any time)
      if (!latitude || !longitude) {
        const lastKnownLocation = (
          await db
            .select({
              lat: driverLocations.lat,
              lng: driverLocations.lng,
              created_at: driverLocations.createdAt,
            })
            .from(driverLocations)
            .where(and(eq(driverLocations.driverId, driver.id), isNotNull(driverLocations.lat), isNotNull(driverLocations.lng)))
            .orderBy(desc(driverLocations.createdAt))
            .limit(1)
        )[0];
        
        if (lastKnownLocation && lastKnownLocation.lat && lastKnownLocation.lng) {
          latitude = lastKnownLocation.lat;
          longitude = lastKnownLocation.lng;
          lastUpdate = lastKnownLocation.created_at;
          locationSource = "last_known";
        }
      }
    }

    // Priority 4: Fallback to default location from driver settings (current_lat/current_lng)
    if (!latitude || !longitude) {
      if (driver.current_lat && driver.current_lng) {
        latitude = driver.current_lat;
        longitude = driver.current_lng;
        locationSource = "default";
      } else {
        return res.status(404).json({ error: "No driver location available" });
      }
    }

    // Get driver profile for additional details
    const driverProfile = (
      await db
        .select({ full_name: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.id, driver.user_id))
        .limit(1)
    )[0];

    res.json({
      latitude,
      longitude,
      driverName: driverProfile?.full_name || "Driver",
      orderState: order.state,
      lastUpdate: lastUpdate || null,
      locationSource, // Indicates if this is realtime, last_known, or default location
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
