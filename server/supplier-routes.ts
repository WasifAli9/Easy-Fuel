import { Router } from "express";
import { supabaseAdmin } from "./supabase";
import { insertDepotSchema } from "../shared/schema";
import { z } from "zod";

const router = Router();

// Get all depots for the authenticated supplier with their pricing
router.get("/depots", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get supplier ID from user ID
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Get all depots with pricing
    const { data: depots, error: depotsError } = await supabaseAdmin
      .from("depots")
      .select(`
        *,
        depot_prices (
          id,
          fuel_type_id,
          price_cents,
          created_at,
          updated_at,
          fuel_types (
            id,
            label,
            code
          )
        )
      `)
      .eq("supplier_id", supplier.id)
      .order("name");

    if (depotsError) throw depotsError;

    res.json(depots || []);
  } catch (error: any) {
    console.error("Error fetching supplier depots:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get pricing for a specific depot
router.get("/depots/:depotId/pricing", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
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

    // Get depot pricing
    const { data: pricing, error: pricingError } = await supabaseAdmin
      .from("depot_prices")
      .select("*")
      .eq("depot_id", depotId);

    if (pricingError) throw pricingError;

    // Create a map of fuel type pricing
    const pricingMap = (pricing || []).reduce((acc: any, p: any) => {
      acc[p.fuel_type_id] = p;
      return acc;
    }, {});

    // Combine fuel types with pricing
    const result = fuelTypes?.map((ft: any) => ({
      ...ft,
      pricing: pricingMap[ft.id] || null,
    })) || [];

    res.json(result);
  } catch (error: any) {
    console.error("Error fetching depot pricing:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update depot pricing for a fuel type
router.put("/depots/:depotId/pricing/:fuelTypeId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;
  const fuelTypeId = req.params.fuelTypeId;
  const { priceCents, notes } = req.body;

  try {
    // Validate input
    if (!priceCents || priceCents < 0) {
      return res.status(400).json({ 
        error: "Valid price is required" 
      });
    }

    // Get supplier ID and verify depot belongs to this supplier
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
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

    // Check if pricing already exists
    const { data: existingPricing, error: checkError } = await supabaseAdmin
      .from("depot_prices")
      .select("*")
      .eq("depot_id", depotId)
      .eq("fuel_type_id", fuelTypeId)
      .maybeSingle();

    if (checkError) throw checkError;

    let oldPriceCents: number | null = null;

    if (existingPricing) {
      // Update existing pricing
      oldPriceCents = existingPricing.price_cents;

      const { error: updateError } = await supabaseAdmin
        .from("depot_prices")
        .update({ 
          price_cents: priceCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPricing.id);

      if (updateError) throw updateError;
    } else {
      // Create new pricing
      const { error: insertError } = await supabaseAdmin
        .from("depot_prices")
        .insert({
          depot_id: depotId,
          fuel_type_id: fuelTypeId,
          price_cents: priceCents,
        });

      if (insertError) throw insertError;
    }

    // Log to pricing history (using depot as entity for per-depot audit trail)
    const { error: historyError } = await supabaseAdmin
      .from("pricing_history")
      .insert({
        entity_type: "depot",
        entity_id: depotId,
        fuel_type_id: fuelTypeId,
        old_price_cents: oldPriceCents,
        new_price_cents: priceCents,
        changed_by: user.id,
        notes: notes || null,
      });

    if (historyError) {
      console.error("Error logging pricing history:", historyError);
    }

    res.json({ success: true, message: "Pricing updated successfully" });
  } catch (error: any) {
    console.error("Error updating depot pricing:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get pricing history for a depot
router.get("/depots/:depotId/pricing/history", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
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
    console.error("Error fetching pricing history:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create new depot
router.post("/depots", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get supplier ID from user ID
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: "Supplier profile not found" });
    }

    // Validate request body
    const depotData = insertDepotSchema.parse({
      ...req.body,
      supplier_id: supplier.id,
    });

    // Create depot
    const { data: depot, error: depotError } = await supabaseAdmin
      .from("depots")
      .insert(depotData)
      .select()
      .single();

    if (depotError) throw depotError;

    res.json(depot);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid depot data", details: error.errors });
    }
    console.error("Error creating depot:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update depot
router.patch("/depots/:depotId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
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
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("depots")
      .update({
        ...req.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", depotId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updated);
  } catch (error: any) {
    console.error("Error updating depot:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete depot
router.delete("/depots/:depotId", async (req, res) => {
  const user = (req as any).user;
  const depotId = req.params.depotId;

  try {
    // Get supplier ID and verify depot belongs to this supplier
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
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

    res.json({ success: true, message: "Depot deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting depot:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all orders for supplier's depots
router.get("/orders", async (req, res) => {
  const user = (req as any).user;

  try {
    // Get supplier ID from user ID
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (supplierError) throw supplierError;
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

    // Get all orders that reference these depots
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        customers!inner (
          id,
          name,
          profiles!inner (
            id,
            full_name,
            phone
          )
        ),
        drivers (
          id,
          profiles!inner (
            id,
            full_name,
            phone
          )
        ),
        delivery_addresses (
          id,
          address_line1,
          address_line2,
          city,
          province,
          postal_code
        ),
        fuel_types (
          id,
          label,
          code
        ),
        depots!inner (
          id,
          name,
          supplier_id
        )
      `)
      .in("depot_id", depotIds)
      .order("created_at", { ascending: false });

    if (ordersError) throw ordersError;

    res.json(orders || []);
  } catch (error: any) {
    console.error("Error fetching supplier orders:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
