import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { insertDepotSchema } from "../shared/schema";
import { z } from "zod";

const router = Router();

// Get all depots for the authenticated supplier with their pricing
router.get("/depots", async (req, res) => {
  const user = (req as any).user;

  try {
    if (!user || !user.id) {
      console.error("GET /depots: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      // Return empty array instead of error - supplier might not have created profile yet
      return res.json([]);
    }

    // Get all depots first
    const { data: depots, error: depotsError } = await supabaseAdmin
      .from("depots")
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at
      `)
      .eq("supplier_id", supplier.id)
      .order("name");

    if (depotsError) {
      console.error("Error fetching depots:", depotsError);
      return res.status(500).json({
        error: "Failed to fetch depots",
        details: depotsError.message
      });
    }

    // If no depots, return empty array
    if (!depots || depots.length === 0) {
      return res.json([]);
    }

    // Get pricing for all depots separately to avoid nested query issues
    const depotIds = depots.map(d => d.id);
    let allPricing: any[] = [];

    if (depotIds.length > 0) {
      try {
        // First try to get pricing with fuel_types relation
        const { data: pricing, error: pricingError } = await supabaseAdmin
          .from("depot_prices")
          .select(`
            id,
            depot_id,
            fuel_type_id,
            price_cents,
            min_litres,
            available_litres,
            created_at,
            updated_at,
            fuel_types (
              id,
              label,
              code
            )
          `)
          .in("depot_id", depotIds);

        if (pricingError) {
          console.error("Error fetching depot pricing with relations:", pricingError);
          // Fallback: try without nested relation
          const { data: pricingWithoutRelation, error: fallbackError } = await supabaseAdmin
            .from("depot_prices")
            .select(`
              id,
              depot_id,
              fuel_type_id,
              price_cents,
              min_litres,
              available_litres,
              created_at,
              updated_at
            `)
            .in("depot_id", depotIds);

          if (fallbackError) {
            console.error("Error fetching depot pricing (fallback):", fallbackError);
            // Continue without pricing
            allPricing = [];
          } else {
            // Fetch fuel types separately and merge
            const fuelTypeIds = Array.from(new Set((pricingWithoutRelation || []).map((p: any) => p.fuel_type_id).filter(Boolean)));
            if (fuelTypeIds.length > 0) {
              const { data: fuelTypes } = await supabaseAdmin
                .from("fuel_types")
                .select("id, label, code")
                .in("id", fuelTypeIds);

              const fuelTypeMap = new Map((fuelTypes || []).map((ft: any) => [ft.id, ft]));
              allPricing = (pricingWithoutRelation || []).map((p: any) => ({
                ...p,
                fuel_types: fuelTypeMap.get(p.fuel_type_id) || null
              }));
            } else {
              allPricing = pricingWithoutRelation || [];
            }
          }
        } else {
          allPricing = pricing || [];
        }
      } catch (error: any) {
        console.error("Unexpected error fetching depot pricing:", error);
        // Continue without pricing
        allPricing = [];
      }
    }

    // Group pricing by depot_id
    const pricingByDepot = new Map();
    if (allPricing) {
      allPricing.forEach((price: any) => {
        if (!pricingByDepot.has(price.depot_id)) {
          pricingByDepot.set(price.depot_id, []);
        }
        pricingByDepot.get(price.depot_id).push(price);
      });
    }

    // Attach pricing to each depot
    const depotsWithPricing = depots.map((depot: any) => ({
      ...depot,
      depot_prices: pricingByDepot.get(depot.id) || [],
    }));

    res.json(depotsWithPricing);
  } catch (error: any) {
    console.error("Error in GET /depots:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: error.stack
    });
  }
});

// Get pricing for a specific depot
router.get("/depots/:depotId/pricing", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get all fuel types
    const { data: fuelTypes, error: fuelTypesError } = await supabaseAdmin
      .from("fuel_types")
      .select("*")
      .eq("active", true)
      .order("label");

    if (fuelTypesError) throw fuelTypesError;

    // Get depot pricing (all tiers for each fuel type)
    const { data: pricing, error: pricingError } = await supabaseAdmin
      .from("depot_prices")
      .select("*")
      .eq("depot_id", depotId)
      .order("fuel_type_id", { ascending: true })
      .order("min_litres", { ascending: true });

    if (pricingError) throw pricingError;

    // Group pricing by fuel_type_id (each fuel type can have multiple tiers)
    const pricingByFuelType = (pricing || []).reduce((acc: any, p: any) => {
      if (!acc[p.fuel_type_id]) {
        acc[p.fuel_type_id] = [];
      }
      acc[p.fuel_type_id].push(p);
      return acc;
    }, {});

    // Combine fuel types with pricing tiers
    const result = fuelTypes?.map((ft: any) => ({
      ...ft,
      pricing_tiers: pricingByFuelType[ft.id] || [],
    })) || [];

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new pricing tier for a fuel type
router.post("/depots/:depotId/pricing/:fuelTypeId/tiers", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const fuelTypeId = req.params.fuelTypeId;
  const { priceCents, minLitres, availableLitres } = req.body;

  try {
    // Validate input
    if (!priceCents || priceCents < 0) {
      return res.status(400).json({ error: "Valid price is required" });
    }
    if (minLitres === undefined || minLitres === null || minLitres < 0) {
      return res.status(400).json({ error: "Minimum litres must be a non-negative number" });
    }

    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Check if tier with same min_litres already exists
    const { data: existingTier, error: checkError } = await supabaseAdmin
      .from("depot_prices")
      .select("*")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .eq("min_litres", minLitres)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingTier) {
      return res.status(400).json({
        error: `A pricing tier with minimum ${minLitres}L already exists for this fuel type`
      });
    }

    // Get existing tiers to get stock value (stock is shared across all tiers)
    const { data: existingTiers } = await supabaseAdmin
      .from("depot_prices")
      .select("available_litres")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .limit(1);

    // Stock is managed separately, so use existing stock if available, otherwise null
    const stockValue = existingTiers && existingTiers.length > 0
      ? existingTiers[0].available_litres
      : null;

    // Create tier (stock will be set separately)
    const { data: newTier, error: insertError } = await supabaseAdmin
      .from("depot_prices")
      .insert({
        depot_id: depotId,
        fuel_type_id: fuelTypeId,
        price_cents: priceCents,
        min_litres: minLitres,
        available_litres: stockValue, // Use existing stock or null
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return res.status(201).json(newTier);
  } catch (error: any) {
    console.error("Error creating pricing tier:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update a pricing tier
router.put("/depots/:depotId/pricing/tiers/:tierId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const tierId = req.params.tierId;
  const { priceCents, minLitres, availableLitres } = req.body;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get existing tier
    const { data: existingTier, error: tierError } = await supabaseAdmin
      .from("depot_prices")
      .select("*")
      .eq("id", tierId)
      .eq("depot_id", depotId)
      .single();

    if (tierError || !existingTier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (priceCents !== undefined) {
      if (priceCents < 0) {
        return res.status(400).json({ error: "Price must be non-negative" });
      }
      updateData.price_cents = priceCents;
    }

    if (minLitres !== undefined) {
      if (minLitres < 0) {
        return res.status(400).json({ error: "Minimum litres must be non-negative" });
      }
      // Check if another tier with this min_litres exists
      const { data: conflictingTier } = await supabaseAdmin
        .from("depot_prices")
        .select("id")
        .eq("depot_id", depotId)
        .eq("fuel_type_id", existingTier.fuel_type_id)
        .eq("min_litres", minLitres)
        .neq("id", tierId)
        .maybeSingle();

      if (conflictingTier) {
        return res.status(400).json({
          error: `Another pricing tier with minimum ${minLitres}L already exists`
        });
      }
      updateData.min_litres = minLitres;
    }

    // Update available_litres only if this is the first tier (min_litres = 0)
    // Stock is shared across all tiers for the same fuel type
    if (availableLitres !== undefined && existingTier.min_litres === 0) {
      const availableLitresNum = parseFloat(availableLitres);
      if (isNaN(availableLitresNum) || availableLitresNum < 0) {
        return res.status(400).json({
          error: "Available litres must be a non-negative number"
        });
      }
      // Update stock for all tiers of this fuel type
      await supabaseAdmin
        .from("depot_prices")
        .update({ available_litres: availableLitresNum.toString() })
        .eq("depot_id", depotId)
        .eq("fuel_type_id", existingTier.fuel_type_id);
    }

    // Update the tier
    const { data: updatedTier, error: updateError } = await supabaseAdmin
      .from("depot_prices")
      .update(updateData)
      .eq("id", tierId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedTier);
  } catch (error: any) {
    console.error("Error updating pricing tier:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a pricing tier
router.delete("/depots/:depotId/pricing/tiers/:tierId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const tierId = req.params.tierId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;
    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get existing tier
    const { data: existingTier, error: tierError } = await supabaseAdmin
      .from("depot_prices")
      .select("*")
      .eq("id", tierId)
      .eq("depot_id", depotId)
      .single();

    if (tierError || !existingTier) {
      return res.status(404).json({ error: "Pricing tier not found" });
    }

    // Check if this is the only tier (can't delete if it's the only one)
    const { data: allTiers } = await supabaseAdmin
      .from("depot_prices")
      .select("id")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", existingTier.fuel_type_id);

    if (allTiers && allTiers.length <= 1) {
      return res.status(400).json({
        error: "Cannot delete the last pricing tier for this fuel type"
      });
    }

    // Delete the tier
    const { error: deleteError } = await supabaseAdmin
      .from("depot_prices")
      .delete()
      .eq("id", tierId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: "Pricing tier deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting pricing tier:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get pricing history for a depot
router.get("/depots/:depotId/pricing/history", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id, name")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Get pricing history with fuel type details (per-depot with explicit type filter)
    const { data: history, error: historyError } = await supabaseAdmin
      .from("pricing_history")
      .select(`
        *,
        fuel_types (
          id,
          label,
          code
        )
      `)
      .eq("entity_type", "depot")
      .eq("entity_id", depotId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (historyError) throw historyError;

    res.json(history || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new depot
router.post("/depots", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Validate required fields
    if (!req.body.name || req.body.name.trim() === "") {
      return res.status(400).json({ error: "Depot name is required" });
    }

    if (req.body.lat === undefined || req.body.lat === null || isNaN(parseFloat(req.body.lat))) {
      return res.status(400).json({ error: "Valid latitude is required" });
    }

    if (req.body.lng === undefined || req.body.lng === null || isNaN(parseFloat(req.body.lng))) {
      return res.status(400).json({ error: "Valid longitude is required" });
    }

    // Validate and prepare all depot fields
    const depotData: any = {
      supplier_id: supplier.id,
      name: req.body.name.trim(),
      lat: parseFloat(req.body.lat),
      lng: parseFloat(req.body.lng),
      is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : true,
    };

    // Handle open_hours - can be object or string
    let openHours = {};
    if (req.body.open_hours) {
      if (typeof req.body.open_hours === 'string' && req.body.open_hours.trim()) {
        try {
          openHours = JSON.parse(req.body.open_hours);
        } catch (e) {
          // If not valid JSON, store as object with description
          openHours = { description: req.body.open_hours.trim() };
        }
      } else if (typeof req.body.open_hours === 'object' && req.body.open_hours !== null) {
        openHours = req.body.open_hours;
      }
    } else if (req.body.openHours) {
      // Handle camelCase version
      if (typeof req.body.openHours === 'string' && req.body.openHours.trim()) {
        try {
          openHours = JSON.parse(req.body.openHours);
        } catch (e) {
          openHours = { description: req.body.openHours.trim() };
        }
      } else if (typeof req.body.openHours === 'object' && req.body.openHours !== null) {
        openHours = req.body.openHours;
      }
    }
    depotData.open_hours = openHours;

    // Add optional address fields if provided
    if (req.body.address_street && req.body.address_street.trim()) {
      depotData.address_street = req.body.address_street.trim();
    }
    if (req.body.address_city && req.body.address_city.trim()) {
      depotData.address_city = req.body.address_city.trim();
    }
    if (req.body.address_province && req.body.address_province.trim()) {
      depotData.address_province = req.body.address_province.trim();
    }
    if (req.body.address_postal_code && req.body.address_postal_code.trim()) {
      depotData.address_postal_code = req.body.address_postal_code.trim();
    }
    if (req.body.notes && req.body.notes.trim()) {
      depotData.notes = req.body.notes.trim();
    }

    // Create depot with all fields
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .insert(depotData)
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at
      `)
      .single();

    if (depotError) {
      console.error("Error creating depot:", depotError);
      return res.status(500).json({
        error: "Failed to create depot",
        details: depotError.message,
        code: depotError.code
      });
    }

    // Broadcast depot creation to supplier via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "depot_created",
      payload: {
        depotId: depot.id,
        name: depot.name,
      },
    });

    res.json(depot);
  } catch (error: any) {
    console.error("Error in POST /depots:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid depot data", details: error.errors });
    }
    res.status(500).json({
      error: error.message || "Internal server error",
      details: error.stack
    });
  }
});

// Update depot
router.patch("/depots/:depotId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Update depot
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Update fields if provided
    if (req.body.name !== undefined) updateData.name = req.body.name.trim();
    if (req.body.lat !== undefined) updateData.lat = parseFloat(req.body.lat);
    if (req.body.lng !== undefined) updateData.lng = parseFloat(req.body.lng);
    if (req.body.is_active !== undefined) updateData.is_active = Boolean(req.body.is_active);
    if (req.body.notes !== undefined) updateData.notes = req.body.notes?.trim() || null;
    if (req.body.address_street !== undefined) updateData.address_street = req.body.address_street?.trim() || null;
    if (req.body.address_city !== undefined) updateData.address_city = req.body.address_city?.trim() || null;
    if (req.body.address_province !== undefined) updateData.address_province = req.body.address_province?.trim() || null;
    if (req.body.address_postal_code !== undefined) updateData.address_postal_code = req.body.address_postal_code?.trim() || null;

    // Handle open_hours
    if (req.body.open_hours !== undefined) {
      let openHours = {};
      if (req.body.open_hours) {
        if (typeof req.body.open_hours === 'string' && req.body.open_hours.trim()) {
          try {
            openHours = JSON.parse(req.body.open_hours);
          } catch (e) {
            openHours = { description: req.body.open_hours.trim() };
          }
        } else if (typeof req.body.open_hours === 'object' && req.body.open_hours !== null) {
          openHours = req.body.open_hours;
        }
      }
      updateData.open_hours = openHours;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("depots")
      .update(updateData)
      .eq("id", depotId)
      .select(`
        id,
        supplier_id,
        name,
        lat,
        lng,
        open_hours,
        notes,
        is_active,
        address_street,
        address_city,
        address_province,
        address_postal_code,
        created_at,
        updated_at
      `)
      .single();

    if (updateError) throw updateError;

    // Broadcast depot update to supplier via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "depot_updated",
      payload: {
        depotId: updated.id,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete depot
router.delete("/depots/:depotId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify depot belongs to supplier
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("id", depotId)
      .eq("supplier_id", supplier.id)
      .single();

    if (depotError || !depot) {
      return res.status(404).json({ error: "Depot not found" });
    }

    // Check if depot has any active pricing
    const { data: pricing, error: pricingError } = await supabaseAdmin
      .from("depot_prices")
      .select("id")
      .eq("depot_id", depotId)
      .limit(1);

    if (pricingError) throw pricingError;

    if (pricing && pricing.length > 0) {
      return res.status(400).json({
        error: "Cannot delete depot with existing pricing. Please remove all pricing first or set depot to inactive."
      });
    }

    // Delete depot
    const { error: deleteError } = await supabaseAdmin
      .from("depots")
      .delete()
      .eq("id", depotId);

    if (deleteError) throw deleteError;

    // Broadcast depot deletion to supplier via WebSocket
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "depot_deleted",
      payload: {
        depotId,
      },
    });

    res.json({ success: true, message: "Depot deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders for supplier's depots
// NOTE: Since we removed customer-supplier relationship, this endpoint now returns empty array
// Suppliers only interact with drivers through depot orders (see /driver-depot-orders)
router.get("/orders", async (req, res) => {
  const user = (req as any).user;

  try {
    if (!user || !user.id) {
      console.error("GET /orders: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier in /orders:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    // Since customer orders no longer link to depots, return empty array
    // Suppliers should use /driver-depot-orders endpoint instead
    return res.json([]);
  } catch (error: any) {
    console.error("Error in GET /orders:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// ============== SUPPLIER PROFILE ==============

// Get supplier profile
router.get("/profile", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get profile data
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      if (profileError.message?.includes("Invalid API key")) {
        throw profileError;
      }
      throw profileError;
    }

    // If no profile, user needs to complete setup
    if (!profile) {
      return res.status(404).json({
        error: "Supplier profile not found",
        code: "PROFILE_SETUP_REQUIRED",
        message: "Please complete your profile setup"
      });
    }

    // Get supplier-specific data
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("*")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      if (supplierError.message?.includes("Invalid API key")) {
        throw supplierError;
      }
      throw supplierError;
    }

    // If no supplier record but profile exists, create it
    if (!supplier) {
      const { data: newSupplier, error: createError } = await supabaseAdmin
        .from("suppliers")
        .insert({
          owner_id: user.id,
          name: profile.full_name || "Supplier",
          registered_name: profile.full_name || "Supplier",
          kyb_status: "pending"
        })
        .select()
        .single();

      if (createError) {
        // If RLS error, try to get the supplier record that might have been created
        if (createError.message?.includes("row-level security")) {
          const { data: existingSuppliers } = await supabaseAdmin
            .from("suppliers")
            .select("*")
            .eq("owner_id", user.id)
            .limit(1);

          const existingSupplier = existingSuppliers && existingSuppliers.length > 0 ? existingSuppliers[0] : null;

          if (existingSupplier) {
            return res.json({
              ...profile,
              ...existingSupplier,
              email: user.email || null
            });
          }
        }
        throw createError;
      }

      return res.json({
        ...profile,
        ...newSupplier,
        email: user.email || null
      });
    }

    // Combine profile, supplier, and email data
    res.json({
      ...profile,
      ...supplier,
      email: user.email || null
    });
  } catch (error: any) {
    // Handle PGRST116 error (no rows found) gracefully
    if (error?.code === 'PGRST116') {
      return res.status(404).json({
        error: "Supplier profile not found",
        code: "PROFILE_SETUP_REQUIRED"
      });
    }
    console.error("Error fetching supplier profile:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update supplier profile
router.put("/profile", async (req, res) => {
  const user = (req as any).user;
  const { fullName, phone, addressStreet, addressCity, addressProvince, addressPostalCode, addressCountry } = req.body;

  try {
    // Validate that at least one field is being updated
    const hasUpdates = fullName !== undefined || phone !== undefined ||
      addressStreet !== undefined || addressCity !== undefined ||
      addressProvince !== undefined || addressPostalCode !== undefined ||
      addressCountry !== undefined;

    if (!hasUpdates) {
      return res.status(400).json({ error: "At least one field must be provided for update" });
    }

    // Update profile table - only update fields that are provided
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Only include fields that are explicitly provided (allowing empty strings to clear fields)
    if (fullName !== undefined) {
      updateData.full_name = fullName || null;
    }

    if (phone !== undefined) {
      updateData.phone = phone || null;
    }

    if (addressStreet !== undefined) {
      updateData.address_street = addressStreet || null;
    }

    if (addressCity !== undefined) {
      updateData.address_city = addressCity || null;
    }

    if (addressProvince !== undefined) {
      updateData.address_province = addressProvince || null;
    }

    if (addressPostalCode !== undefined) {
      updateData.address_postal_code = addressPostalCode || null;
    }

    if (addressCountry !== undefined) {
      updateData.address_country = addressCountry || null;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (profileError) throw profileError;

    // Broadcast supplier profile update
    const { websocketService } = await import("./websocket");
    websocketService.sendToUser(user.id, {
      type: "supplier_profile_updated",
      payload: { userId: user.id },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============== DRIVER DEPOT ORDERS ==============

// Get all driver depot orders for supplier's depots
router.get("/driver-depot-orders", async (req, res) => {
  const user = (req as any).user;

  try {
    if (!user || !user.id) {
      console.error("GET /driver-depot-orders: User not authenticated", { hasUser: !!user, userId: user?.id });
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) {
      console.error("Error fetching supplier in /driver-depot-orders:", supplierError);
      return res.status(500).json({
        error: "Failed to fetch supplier profile",
        details: supplierError.message,
        code: supplierError.code
      });
    }

    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Get all depots for this supplier
    const { data: depots, error: depotsError } = await supabaseAdmin
      .from("depots")
      .select("id")
      .eq("supplier_id", supplier.id);

    if (depotsError) throw depotsError;

    if (!depots || depots.length === 0) {
      return res.json([]);
    }

    const depotIds = depots.map(d => d.id);

    // Get all driver depot orders for these depots
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots!inner (
          id,
          name,
          supplier_id
        ),
        drivers (
          id,
          user_id
        ),
        fuel_types (
          id,
          label,
          code
        )
      `)
      .in("depot_id", depotIds)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Error fetching driver depot orders:", ordersError);
      // If the table doesn't exist or has issues, return empty array
      if (ordersError.message?.includes("relation") || ordersError.message?.includes("does not exist")) {
        console.warn("driver_depot_orders table may not exist, returning empty array");
        return res.json([]);
      }
      throw ordersError;
    }

    // Enrich with driver profile data
    if (orders && orders.length > 0) {
      const driverUserIds = Array.from(
        new Set(orders.map((o: any) => o.drivers?.user_id).filter(Boolean))
      );

      if (driverUserIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", driverUserIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        orders.forEach((order: any) => {
          if (order.drivers?.user_id) {
            order.drivers.profile = profileMap.get(order.drivers.user_id) || null;
          }
        });
      }
    }

    res.json(orders || []);
  } catch (error: any) {
    console.error("Error fetching driver depot orders:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// Update driver depot order status (confirm/fulfill)
router.patch("/driver-depot-orders/:orderId", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { status } = req.body;

  try {
    if (!status || !["confirmed", "fulfilled", "cancelled"].includes(status)) {
      return res.status(400).json({
        error: "Valid status is required (confirmed, fulfilled, or cancelled)"
      });
    }

    // Get supplier ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    const supplier = suppliers && suppliers.length > 0 ? suppliers[0] : null;

    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Verify order belongs to supplier's depot
    const { data: order, error: orderError } = await supabaseAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots!inner (
          id,
          supplier_id
        ),
        drivers (
          id,
          user_id
        )
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.depots?.supplier_id !== supplier.id) {
      return res.status(403).json({
        error: "This order does not belong to your depot"
      });
    }

    // Update order status
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (
          id,
          name
        ),
        drivers (
          id,
          user_id
        ),
        fuel_types (
          id,
          label,
          code
        )
      `)
      .single();

    if (updateError) throw updateError;

    // Get current order status and litres before updating for stock management
    const currentStatus = order.status;
    const orderLitres = parseFloat(order.litres || "0");
    const fuelTypeId = order.fuel_type_id;
    const depotId = order.depots?.id;

    // Update available_litres based on status change
    if (depotId && fuelTypeId) {
      if (status === "confirmed" && currentStatus === "pending") {
        // Reduce stock when confirming order
        const { data: depotPrice } = await supabaseAdmin
          .from("depot_prices")
          .select("available_litres")
          .eq("depot_id", depotId)
          .eq("fuel_type_id", fuelTypeId)
          .single();

        if (depotPrice && depotPrice.available_litres !== null) {
          const currentStock = parseFloat(depotPrice.available_litres.toString());
          const newStock = Math.max(0, currentStock - orderLitres);

          await supabaseAdmin
            .from("depot_prices")
            .update({
              available_litres: newStock.toString(),
              updated_at: new Date().toISOString(),
            })
            .eq("depot_id", depotId)
            .eq("fuel_type_id", fuelTypeId);
        }
      } else if (status === "cancelled" && currentStatus === "confirmed") {
        // Add back stock when cancelling confirmed order (only confirmed orders reduce stock)
        const { data: depotPrice } = await supabaseAdmin
          .from("depot_prices")
          .select("available_litres")
          .eq("depot_id", depotId)
          .eq("fuel_type_id", fuelTypeId)
          .single();

        if (depotPrice) {
          const currentStock = depotPrice.available_litres
            ? parseFloat(depotPrice.available_litres.toString())
            : 0;
          const newStock = currentStock + orderLitres;

          await supabaseAdmin
            .from("depot_prices")
            .update({
              available_litres: newStock.toString(),
              updated_at: new Date().toISOString(),
            })
            .eq("depot_id", depotId)
            .eq("fuel_type_id", fuelTypeId);
        }
      }
    }

    // Notify driver about status change
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      const { notificationService } = await import("./notification-service");

      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelTypeLabel = updatedOrder.fuel_types?.label || "Fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      const pickupDate = updatedOrder.pickup_date;

      // Send WebSocket update for real-time delivery
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_updated",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Create notification based on status
      if (status === "confirmed") {
        await notificationService.notifyDriverDepotOrderConfirmed(
          order.drivers.user_id,
          updatedOrder.id,
          depotName,
          fuelTypeLabel,
          litres,
          pickupDate || new Date().toISOString()
        );
      } else if (status === "fulfilled") {
        await notificationService.notifyDriverDepotOrderFulfilled(
          order.drivers.user_id,
          updatedOrder.id,
          depotName,
          fuelTypeLabel,
          litres
        );
      } else if (status === "cancelled") {
        await notificationService.notifyDriverDepotOrderCancelled(
          user.id, // supplier user ID
          order.drivers.user_id,
          updatedOrder.id,
          depotName,
          fuelTypeLabel,
          litres,
          req.body.reason
        );
      }
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error updating driver depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
