import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { insertDepotSchema } from "../shared/schema";
import { getSupplierComplianceStatus, canSupplierAccessPlatform } from "./compliance-service";
import { z } from "zod";

const router = Router();

// Helper middleware to check supplier compliance
async function checkSupplierCompliance(req: any, res: any, next: any) {
  try {
    const user = req.user;
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("id, status, compliance_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    if (supplier.status !== "active" || supplier.compliance_status !== "approved") {
      return res.status(403).json({
        error: "Compliance not approved",
        code: "COMPLIANCE_REQUIRED",
        message: "Your compliance documents must be approved before accessing this feature. Please complete your compliance profile.",
        status: supplier.status,
        compliance_status: supplier.compliance_status,
      });
    }

    req.supplierId = supplier.id;
    next();
  } catch (error: any) {
    console.error("Error checking supplier compliance:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get all depots for the authenticated supplier with their pricing
// Note: Allow viewing depots even if compliance is pending (similar to drivers)
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

    // Check compliance status - if not approved, return empty array (can view but no depots shown)
    const { data: supplierStatus } = await supabaseAdmin
      .from("suppliers")
      .select("status, compliance_status")
      .eq("id", supplier.id)
      .single();
    
    if (!supplierStatus || supplierStatus.status !== "active" || supplierStatus.compliance_status !== "approved") {
      // Return empty array instead of error - allows UI to load but shows no depots
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
router.get("/depots/:depotId/pricing", checkSupplierCompliance, async (req, res) => {
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
router.post("/depots/:depotId/pricing/:fuelTypeId/tiers", checkSupplierCompliance, async (req, res) => {
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

// Update stock for a fuel type (creates default tier if none exists)
// This route must come BEFORE the tier update route to avoid route conflicts
router.put("/depots/:depotId/pricing/:fuelTypeId/stock", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const fuelTypeId = req.params.fuelTypeId;
  const { availableLitres } = req.body;

  try {
    // Validate input
    const availableLitresNum = parseFloat(availableLitres);
    if (isNaN(availableLitresNum) || availableLitresNum < 0) {
      return res.status(400).json({
        error: "Available litres must be a non-negative number"
      });
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

    // Check if any tiers exist for this fuel type
    const { data: existingTiers, error: tiersError } = await supabaseAdmin
      .from("depot_prices")
      .select("id")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .limit(1);

    if (tiersError) throw tiersError;

    if (existingTiers && existingTiers.length > 0) {
      // Update stock for all existing tiers
      const { error: updateError } = await supabaseAdmin
        .from("depot_prices")
        .update({ available_litres: availableLitresNum })
        .eq("depot_id", depotId)
        .eq("fuel_type_id", fuelTypeId);

      if (updateError) throw updateError;

      // Return one of the updated tiers
      const { data: updatedTier } = await supabaseAdmin
        .from("depot_prices")
        .select("*")
        .eq("depot_id", depotId)
        .eq("fuel_type_id", fuelTypeId)
        .limit(1)
        .single();

      return res.json(updatedTier);
    } else {
      // No tiers exist, create a default tier with stock
      // Use min_litres = 0 and price_cents = 10000 (R 100.00 default price)
      const { data: newTier, error: insertError } = await supabaseAdmin
        .from("depot_prices")
        .insert({
          depot_id: depotId,
          fuel_type_id: fuelTypeId,
          price_cents: 10000, // Default price: R 100.00
          min_litres: 0,
          available_litres: availableLitresNum,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return res.json(newTier);
    }
  } catch (error: any) {
    console.error("Error updating stock:", error);
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

    // Update available_litres (stock is shared across all tiers for the same fuel type)
    // Allow stock update from any tier, not just the one with min_litres = 0
    if (availableLitres !== undefined) {
      const availableLitresNum = parseFloat(availableLitres);
      if (isNaN(availableLitresNum) || availableLitresNum < 0) {
        return res.status(400).json({
          error: "Available litres must be a non-negative number"
        });
      }
      // Update stock for all tiers of this fuel type
      const { data: updatedStockTiers, error: stockUpdateError } = await supabaseAdmin
        .from("depot_prices")
        .update({ available_litres: availableLitresNum })
        .eq("depot_id", depotId)
        .eq("fuel_type_id", existingTier.fuel_type_id)
        .select();
      
      if (stockUpdateError) {
        console.error("Error updating stock:", stockUpdateError);
        return res.status(500).json({
          error: "Failed to update stock",
          details: stockUpdateError.message
        });
      }
      
      // If only stock is being updated (no priceCents or minLitres), return the updated tier
      if (priceCents === undefined && minLitres === undefined) {
        const updatedTierWithStock = updatedStockTiers?.find(t => t.id === tierId);
        if (updatedTierWithStock) {
          return res.json(updatedTierWithStock);
        }
      }
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

    // Delete the tier (no restriction - allow deletion of any tier, even if it's the only one)
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
router.post("/depots", checkSupplierCompliance, async (req, res) => {
  const user = (req as any).user;

  try {
    // Get supplier ID from user ID
    // Use limit(1) to handle duplicate records gracefully
    const { data: suppliers, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id, status, compliance_status")
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

    // Check if supplier KYC is approved
    if (supplier.status !== "active" || supplier.compliance_status !== "approved") {
      return res.status(403).json({
        error: "KYC approval required",
        code: "KYC_REQUIRED",
        message: "Please apply for KYC from profile management and wait for approval before adding depots.",
        status: supplier.status,
        compliance_status: supplier.compliance_status,
      });
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

    // Get all driver depot orders for these depots (without nested suppliers to avoid relationship issues)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("driver_depot_orders")
      .select(`
        *,
        depots!inner (
          id,
          name,
          supplier_id,
          address_street,
          address_city,
          address_province,
          address_postal_code
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

    // Enrich with driver profile data and supplier information
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

      // Enrich with supplier information separately
      const supplierIds = [...new Set(
        orders
          .map((o: any) => o.depots?.supplier_id)
          .filter(Boolean)
      )];
      
      if (supplierIds.length > 0) {
        const { data: suppliers } = await supabaseAdmin
          .from("suppliers")
          .select("id, name, registered_name")
          .in("id", supplierIds);
        
        const supplierMap = new Map(
          (suppliers || []).map((s: any) => [s.id, s])
        );
        
        orders.forEach((order: any) => {
          if (order.depots?.supplier_id) {
            order.depots.suppliers = supplierMap.get(order.depots.supplier_id) || null;
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

// Helper function to verify order ownership
async function verifyOrderOwnership(orderId: string, supplierId: string) {
  const { data: order, error } = await supabaseAdmin
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
      ),
      fuel_types (
        id,
        label,
        code
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { error: "Order not found", order: null };
  }

  if (order.depots?.supplier_id !== supplierId) {
    return { error: "This order does not belong to your depot", order: null };
  }

  return { error: null, order };
}

// Accept driver depot order (moves from pending to pending_payment)
router.post("/driver-depot-orders/:orderId/accept", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only accept if status is pending
    if (order.status !== "pending") {
      return res.status(400).json({ error: `Cannot accept order with status: ${order.status}` });
    }

    // Update order to pending_payment
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        status: "pending_payment",
        payment_status: "pending_payment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_accepted",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      const pickupDate = updatedOrder.pickup_date || updatedOrder.created_at;
      
      await notificationService.notifyDriverDepotOrderAccepted(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        pickupDate
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error accepting driver depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject driver depot order
router.post("/driver-depot-orders/:orderId/reject", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { reason } = req.body;

  try {
    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only reject if status is pending
    if (order.status !== "pending") {
      return res.status(400).json({ error: `Cannot reject order with status: ${order.status}` });
    }

    // Update order to rejected
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
        notes: reason ? `${order.notes || ""}\n[Rejection reason: ${reason}]`.trim() : order.notes,
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_rejected",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        reason,
      });
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error rejecting driver depot order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Verify payment (for bank transfer - supplier confirms payment received)
router.post("/driver-depot-orders/:orderId/verify-payment", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only verify if payment_status is paid (driver uploaded proof)
    if (order.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment status must be 'paid' to verify. Current: ${order.payment_status}` });
    }
    
    // For online payments, they're already at ready_for_pickup - no need to verify
    if (order.payment_method === "online_payment") {
      return res.status(400).json({ error: "Online payments are automatically processed and do not require verification" });
    }
    
    // Check if payment proof exists (for bank transfers)
    if (order.payment_method === "bank_transfer" && !order.payment_proof_url) {
      return res.status(400).json({ error: "Payment proof is required for bank transfer verification" });
    }

    // Update payment status and order status - go directly to ready_for_pickup
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        payment_status: "payment_verified",
        status: "ready_for_pickup", // Go directly to ready for pickup, skip signatures
        payment_confirmed_at: new Date().toISOString(),
        payment_confirmed_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_payment_verified",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        message: "Payment confirmed. Order is ready for pickup.",
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      
      await notificationService.notifyDriverDepotPaymentVerified(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject payment (supplier marks payment as not received)
router.post("/driver-depot-orders/:orderId/reject-payment", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { reason } = req.body;

  try {
    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only reject if payment_status is paid (driver uploaded proof)
    if (order.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment status must be 'paid' to reject. Current: ${order.payment_status}` });
    }
    
    // Check if payment proof exists (for bank transfers)
    if (order.payment_method === "bank_transfer" && !order.payment_proof_url) {
      return res.status(400).json({ error: "Payment proof is required for bank transfer rejection" });
    }

    // Update payment status - reset to pending_payment so driver can pay again
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        payment_status: "payment_failed",
        status: "pending_payment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_payment_rejected",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        message: reason || "Payment not received. Please try again.",
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      
      await notificationService.notifyDriverDepotPaymentRejected(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres,
        reason
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error rejecting payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add supplier signature (before fuel release)
router.post("/driver-depot-orders/:orderId/supplier-signature", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { signatureUrl } = req.body;

  try {
    if (!signatureUrl) {
      return res.status(400).json({ error: "signatureUrl is required" });
    }

    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Check if payment is verified
    // For online payments, they're already processed and don't need verification
    // For other payment methods, payment must be verified
    if (order.payment_method !== "online_payment" && order.payment_method !== "pay_outside_app") {
      if (order.payment_status !== "payment_verified" && order.payment_status !== "paid") {
        return res.status(400).json({ error: "Payment must be verified before signing" });
      }
    }

    // Update supplier signature
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        supplier_signature_url: signatureUrl,
        supplier_signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Check if both signatures are present - if so, move to ready_for_pickup
    // BUT: Skip this for online_payment - those orders should already be at ready_for_pickup
    // and should not require signatures before release
    if (updatedOrder.driver_signature_url && updatedOrder.supplier_signature_url && updatedOrder.payment_method !== "online_payment") {
      await supabaseAdmin
        .from("driver_depot_orders")
        .update({
          status: "ready_for_pickup",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      
      updatedOrder.status = "ready_for_pickup";
    }

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_order_signed",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error adding supplier signature:", error);
    res.status(500).json({ error: error.message });
  }
});

// Release fuel (moves from ready_for_pickup to released)
router.post("/driver-depot-orders/:orderId/release", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;

  try {
    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    if (order.status !== "ready_for_pickup") {
      return res.status(400).json({ error: `Order must be ready_for_pickup to release. Current: ${order.status}` });
    }

    // Update order to awaiting_signature - driver needs to sign to complete
    // Using "awaiting_signature" (19 chars) instead of "awaiting_driver_signature" (25 chars) due to varchar(20) limit
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        status: "awaiting_signature",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Reduce stock when fuel is released
    const orderLitres = parseFloat(order.litres || "0");
    const fuelTypeId = order.fuel_type_id;
    const depotId = order.depots?.id;

    if (depotId && fuelTypeId) {
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
    }

    // Notify driver
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_fuel_released",
        orderId: updatedOrder.id,
        status: updatedOrder.status,
      });

      // Send notification to driver
      const { notificationService } = await import("./notification-service");
      const depotName = updatedOrder.depots?.name || "Depot";
      const fuelType = updatedOrder.fuel_types?.label || updatedOrder.fuel_types?.code || "fuel";
      const litres = parseFloat(updatedOrder.litres || "0");
      
      await notificationService.notifyDriverDepotOrderReleased(
        order.drivers.user_id,
        updatedOrder.id,
        depotName,
        fuelType,
        litres
      );
    }

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error releasing fuel:", error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm delivery (supplier enters actual litres and driver signs)
router.post("/driver-depot-orders/:orderId/confirm-delivery", async (req, res) => {
  const user = (req as any).user;
  const { orderId } = req.params;
  const { actualLitres } = req.body;

  try {
    // Get supplier ID
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

    // Verify order ownership
    const { error: ownershipError, order } = await verifyOrderOwnership(orderId, supplier.id);
    if (ownershipError || !order) {
      return res.status(ownershipError === "Order not found" ? 404 : 403).json({ error: ownershipError });
    }

    // Only confirm if status is released
    if (order.status !== "released") {
      return res.status(400).json({ error: `Order must be released to confirm delivery. Current: ${order.status}` });
    }

    // Validate actual litres
    const actualLitresNum = actualLitres ? parseFloat(actualLitres) : null;
    if (actualLitresNum !== null && (isNaN(actualLitresNum) || actualLitresNum < 0)) {
      return res.status(400).json({ error: "Invalid actual litres value" });
    }

    // Update order with actual litres (driver signature will be added separately)
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("driver_depot_orders")
      .update({
        actual_litres_delivered: actualLitresNum !== null ? actualLitresNum.toString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select(`
        *,
        depots (id, name),
        drivers (id, user_id),
        fuel_types (id, label, code)
      `)
      .single();

    if (updateError) throw updateError;

    // Notify driver to sign for receipt
    if (order.drivers?.user_id) {
      const { websocketService } = await import("./websocket");
      websocketService.sendOrderUpdate(order.drivers.user_id, {
        type: "driver_depot_delivery_confirmed",
        orderId: updatedOrder.id,
        actualLitres: actualLitresNum,
      });
    }

    // Note: Supplier notification for order completion will be sent when driver confirms receipt
    // See driver-routes.ts confirm-receipt endpoint

    res.json(updatedOrder);
  } catch (error: any) {
    console.error("Error confirming delivery:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============== DOCUMENTS ROUTES ==============

// Get supplier documents
router.get("/documents", async (req, res) => {
  const user = (req as any).user;
  
  try {
    const { data: documents, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("owner_type", "supplier")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(documents || []);
  } catch (error: any) {
    console.error("Error fetching supplier documents:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create supplier document
router.post("/documents", async (req, res) => {
  const user = (req as any).user;
  
  if (!user || !user.id) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  const { owner_type, doc_type, title, file_path, file_size, mime_type, document_issue_date, expiry_date } = req.body;
  
  // Validate required fields
  if (!doc_type || !file_path) {
    return res.status(400).json({ error: "doc_type and file_path are required" });
  }
  
  try {
    // Insert document first
    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        owner_type: owner_type || "supplier",
        owner_id: user.id,
        doc_type,
        title: title || doc_type,
        file_path,
        file_size: file_size || null,
        mime_type: mime_type || null,
        document_issue_date: document_issue_date || null,
        expiry_date: expiry_date || null,
        uploaded_by: user.id,
      })
      .select()
      .single();
    
    if (error) {
      console.error("[supplier/documents] Database error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to create document",
        code: error.code 
      });
    }

    if (!data) {
      return res.status(500).json({ error: "Document created but no data returned" });
    }

    // Send notifications asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const { notificationService } = await import("./notification-service");
        
        // Fetch admin profiles and supplier data in parallel
        const [adminProfilesResult, supplierProfileResult, supplierResult] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("role", "admin"),
          supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle(),
          supabaseAdmin
            .from("suppliers")
            .select("kyb_status, status")
            .eq("owner_id", user.id)
            .maybeSingle()
        ]);
        
        const adminProfiles = adminProfilesResult.data;
        const supplierProfile = supplierProfileResult.data;
        const supplier = supplierResult.data;
        
        if (adminProfiles && adminProfiles.length > 0) {
          const adminUserIds = adminProfiles.map(p => p.id);
          const ownerName = supplierProfile?.full_name || "Supplier";
          
          // Send document upload notification
          await notificationService.notifyAdminDocumentUploaded(
            adminUserIds,
            data.id,
            doc_type,
            "supplier",
            ownerName,
            user.id
          ).catch(err => console.error("[supplier/documents] Notification error:", err));

          // Check if this is a new KYC submission
          if (supplier && (supplier.kyb_status === "pending" || supplier.status === "pending_compliance")) {
            const { data: existingDocs } = await supabaseAdmin
              .from("documents")
              .select("id")
              .eq("owner_type", "supplier")
              .eq("owner_id", user.id)
              .neq("id", data.id)
              .limit(1);
            
            if (!existingDocs || existingDocs.length === 0) {
              await notificationService.notifyAdminKycSubmitted(
                adminUserIds,
                user.id,
                ownerName,
                "supplier"
              ).catch(err => console.error("[supplier/documents] KYC notification error:", err));
            }
          }
        }
      } catch (notifError) {
        console.error("[supplier/documents] Error in notification handler:", notifError);
        // Don't fail the upload if notification fails
      }
    });

    res.json(data);
  } catch (error: any) {
    console.error("[supplier/documents] Unexpected error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
});

// ============== COMPLIANCE ROUTES ==============

// Get supplier compliance status
router.get("/compliance/status", async (req, res) => {
  const user = (req as any).user;
  
  try {
    // Get supplier ID
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (supplierError || !supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const complianceStatus = await getSupplierComplianceStatus(supplier.id);
    res.json(complianceStatus);
  } catch (error: any) {
    console.error("Error getting supplier compliance status:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update supplier compliance information
router.put("/compliance", async (req, res) => {
  const user = (req as any).user;
  
  try {
    console.log("PUT /compliance - Request body:", JSON.stringify(req.body, null, 2));
    
    // Get supplier ID
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (supplierError || !supplier) {
      console.error("Supplier not found:", { supplierError, supplier, userId: user.id });
      return res.status(404).json({ error: "Supplier not found" });
    }

    console.log("Found supplier:", supplier.id);

    // Extract all fields from request body
    const bodyFields = req.body;
    
    // Helper function to check if a value should be included in update
    const shouldInclude = (value: any): boolean => {
      if (value === undefined) return false;
      if (value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    };

    // Extract fields - map frontend names to database columns
    const {
      // Note: company_name maps to registered_name in database, but we'll handle it separately
      registration_number,
      director_names,
      registered_address,
      vat_number,
      vat_certificate_expiry,
      tax_clearance_number,
      tax_clearance_expiry,
      wholesale_license_number,
      wholesale_license_issue_date,
      wholesale_license_expiry_date,
      allowed_fuel_types,
      site_license_number,
      depot_address,
      permit_number,
      permit_expiry_date,
      environmental_auth_number,
      approved_storage_capacity_litres,
      fire_certificate_number,
      fire_certificate_issue_date,
      fire_certificate_expiry_date,
      hse_file_verified,
      hse_file_last_updated,
      spill_compliance_confirmed,
      sabs_certificate_number,
      sabs_certificate_issue_date,
      sabs_certificate_expiry_date,
      calibration_certificate_number,
      calibration_certificate_issue_date,
      calibration_certificate_expiry_date,
      public_liability_policy_number,
      public_liability_insurance_provider,
      public_liability_coverage_amount_rands,
      public_liability_policy_expiry_date,
      env_insurance_number,
      env_insurance_expiry_date,
    } = bodyFields;

    const updateData: any = {};
    
    // Process each field - only include non-null, non-empty values
    // Map company_name to registered_name (database column name)
    if (shouldInclude(bodyFields.company_name)) updateData.registered_name = bodyFields.company_name;
    if (shouldInclude(registration_number)) updateData.registration_number = registration_number;
    if (director_names !== undefined) {
      if (director_names === "" || director_names === null) {
        // Don't include - skip updating this field
      } else if (Array.isArray(director_names) && director_names.length > 0) {
        updateData.director_names = director_names;
      } else if (typeof director_names === 'string') {
        try {
          const parsed = JSON.parse(director_names);
          if (Array.isArray(parsed) && parsed.length > 0) {
            updateData.director_names = parsed;
          }
        } catch {
          // If it's a string, convert to array if not empty
          if (director_names.trim() !== '') {
            updateData.director_names = [director_names];
          }
        }
      }
    }
    if (shouldInclude(registered_address)) updateData.registered_address = registered_address;
    if (shouldInclude(vat_number)) updateData.vat_number = vat_number;
    if (shouldInclude(vat_certificate_expiry)) updateData.vat_certificate_expiry = vat_certificate_expiry;
    if (shouldInclude(tax_clearance_number)) updateData.tax_clearance_number = tax_clearance_number;
    if (shouldInclude(tax_clearance_expiry)) updateData.tax_clearance_expiry = tax_clearance_expiry;
    // Map wholesale_license_number to dmre_license_number (database column name)
    if (shouldInclude(wholesale_license_number)) updateData.dmre_license_number = wholesale_license_number;
    if (shouldInclude(wholesale_license_issue_date)) updateData.wholesale_license_issue_date = wholesale_license_issue_date;
    // Map wholesale_license_expiry_date to dmre_license_expiry (database column name)
    if (shouldInclude(wholesale_license_expiry_date)) updateData.dmre_license_expiry = wholesale_license_expiry_date;
    if (allowed_fuel_types !== undefined) {
      if (allowed_fuel_types === "" || allowed_fuel_types === null) {
        // Don't include - skip updating this field
      } else if (Array.isArray(allowed_fuel_types) && allowed_fuel_types.length > 0) {
        updateData.allowed_fuel_types = allowed_fuel_types;
      } else if (typeof allowed_fuel_types === 'string') {
        try {
          const parsed = JSON.parse(allowed_fuel_types);
          if (Array.isArray(parsed) && parsed.length > 0) {
            updateData.allowed_fuel_types = parsed;
          }
        } catch {
          if (allowed_fuel_types.trim() !== '') {
            updateData.allowed_fuel_types = [allowed_fuel_types];
          }
        }
      }
    }
    if (shouldInclude(site_license_number)) updateData.site_license_number = site_license_number;
    if (shouldInclude(depot_address)) updateData.depot_address = depot_address;
    if (shouldInclude(permit_number)) updateData.permit_number = permit_number;
    if (shouldInclude(permit_expiry_date)) updateData.permit_expiry_date = permit_expiry_date;
    if (shouldInclude(environmental_auth_number)) updateData.environmental_auth_number = environmental_auth_number;
    if (approved_storage_capacity_litres !== undefined && approved_storage_capacity_litres !== null && approved_storage_capacity_litres !== '') {
      const parsed = typeof approved_storage_capacity_litres === 'number' ? approved_storage_capacity_litres : parseInt(approved_storage_capacity_litres);
      if (!isNaN(parsed)) {
        updateData.approved_storage_capacity_litres = parsed;
      }
    }
    if (shouldInclude(fire_certificate_number)) updateData.fire_certificate_number = fire_certificate_number;
    if (shouldInclude(fire_certificate_issue_date)) updateData.fire_certificate_issue_date = fire_certificate_issue_date;
    if (shouldInclude(fire_certificate_expiry_date)) updateData.fire_certificate_expiry_date = fire_certificate_expiry_date;
    if (hse_file_verified !== undefined) updateData.hse_file_verified = Boolean(hse_file_verified);
    if (shouldInclude(hse_file_last_updated)) updateData.hse_file_last_updated = hse_file_last_updated;
    if (spill_compliance_confirmed !== undefined) updateData.spill_compliance_confirmed = Boolean(spill_compliance_confirmed);
    if (shouldInclude(sabs_certificate_number)) updateData.sabs_certificate_number = sabs_certificate_number;
    if (shouldInclude(sabs_certificate_issue_date)) updateData.sabs_certificate_issue_date = sabs_certificate_issue_date;
    if (shouldInclude(sabs_certificate_expiry_date)) updateData.sabs_certificate_expiry_date = sabs_certificate_expiry_date;
    if (shouldInclude(calibration_certificate_number)) updateData.calibration_certificate_number = calibration_certificate_number;
    if (shouldInclude(calibration_certificate_issue_date)) updateData.calibration_certificate_issue_date = calibration_certificate_issue_date;
    if (shouldInclude(calibration_certificate_expiry_date)) updateData.calibration_certificate_expiry_date = calibration_certificate_expiry_date;
    if (shouldInclude(public_liability_policy_number)) updateData.public_liability_policy_number = public_liability_policy_number;
    if (shouldInclude(public_liability_insurance_provider)) updateData.public_liability_insurance_provider = public_liability_insurance_provider;
    if (public_liability_coverage_amount_rands !== undefined && public_liability_coverage_amount_rands !== null && public_liability_coverage_amount_rands !== '') {
      const parsed = typeof public_liability_coverage_amount_rands === 'number' ? public_liability_coverage_amount_rands : parseInt(public_liability_coverage_amount_rands);
      if (!isNaN(parsed)) {
        updateData.public_liability_coverage_amount_rands = parsed;
      }
    }
    if (shouldInclude(public_liability_policy_expiry_date)) updateData.public_liability_policy_expiry_date = public_liability_policy_expiry_date;
    if (shouldInclude(env_insurance_number)) updateData.env_insurance_number = env_insurance_number;
    if (shouldInclude(env_insurance_expiry_date)) updateData.env_insurance_expiry_date = env_insurance_expiry_date;

    // Only proceed if we have fields to update
    if (Object.keys(updateData).length === 0) {
      return res.json({ message: "No fields to update", supplier });
    }

    updateData.updated_at = new Date().toISOString();

    console.log("Update data:", JSON.stringify(updateData, null, 2));

    const { data: updatedSupplier, error: updateError } = await supabaseAdmin
      .from("suppliers")
      .update(updateData)
      .eq("id", supplier.id)
      .select()
      .single();

    if (updateError) {
      console.error("Database update error:", updateError);
      
      // Check if it's a schema cache error or column not found error
      const isColumnError = updateError.message?.includes("Could not find") || 
                           updateError.message?.includes("schema cache") || 
                           updateError.code === '42703' ||
                           updateError.message?.includes("column");
      
      if (isColumnError) {
        console.error("Schema/column error:", updateError.message);
        console.error("Attempted to update fields:", Object.keys(updateData));
        
        // Try to identify which column is missing
        const missingColumnMatch = updateError.message?.match(/Could not find the '(\w+)' column/);
        const missingColumn = missingColumnMatch ? missingColumnMatch[1] : 'unknown';
        
        // Remove the problematic column and try again
        const cleanedUpdateData = { ...updateData };
        delete cleanedUpdateData[missingColumn];
        delete cleanedUpdateData.updated_at;
        
        if (Object.keys(cleanedUpdateData).length > 0) {
          cleanedUpdateData.updated_at = new Date().toISOString();
          console.log(`Removed problematic column '${missingColumn}' and retrying with remaining fields...`);
          
          // Retry without the problematic column
          const retryResult = await supabaseAdmin
            .from("suppliers")
            .update(cleanedUpdateData)
            .eq("id", supplier.id)
            .select()
            .single();
          
          if (retryResult.error) {
            return res.status(500).json({ 
              error: `Database column '${missingColumn}' not found in suppliers table.`,
              details: updateError.message,
              hint: `Please add the '${missingColumn}' column to the suppliers table or refresh the schema cache by running: NOTIFY pgrst, 'reload schema'; in Supabase SQL Editor.`,
              attemptedFields: Object.keys(updateData),
              skippedField: missingColumn
            });
          }
          
          return res.json({ 
            ...retryResult.data,
            warning: `Field '${missingColumn}' was skipped because it doesn't exist in the database.`
          });
        } else {
          return res.status(500).json({ 
            error: `Database column '${missingColumn}' not found and no other fields to update.`,
            details: updateError.message,
            hint: `Please add the '${missingColumn}' column to the suppliers table or refresh the schema cache.`
          });
        }
      }
      
      throw updateError;
    }

    console.log("Update successful:", updatedSupplier?.id);

    res.json(updatedSupplier);
  } catch (error: any) {
    console.error("Error updating supplier compliance:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: error.message || "Failed to update compliance information",
      code: error.code,
      details: error.details,
      hint: error.hint
    });
  }
});

export default router;
