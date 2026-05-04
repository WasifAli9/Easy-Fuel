import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, Button, Card, Text, TextInput } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Depot = {
  id: string;
  name?: string;
  address_city?: string;
  address_province?: string;
};

type PricingTier = {
  id: string;
  fuel_type_id?: string;
  price_cents: number;
  min_litres: number;
  available_litres?: number | null;
};

type FuelTypeWithTiers = {
  id: string;
  label?: string;
  code?: string;
  pricing_tiers: PricingTier[];
};

function errMessage(e: unknown): string {
  const ax = e as { response?: { data?: { error?: string; details?: string } }; message?: string };
  return ax.response?.data?.error || ax.response?.data?.details || ax.message || "Request failed";
}

export function SupplierPricingScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [depotId, setDepotId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addFuelTypeId, setAddFuelTypeId] = useState<string | null>(null);
  const [addPrice, setAddPrice] = useState("");
  const [addMinL, setAddMinL] = useState("0");
  const [addStock, setAddStock] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTier, setEditTier] = useState<PricingTier | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editMinL, setEditMinL] = useState("");
  const [editStock, setEditStock] = useState("");

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });

  const depotsQuery = useQuery({
    queryKey: ["/api/supplier/depots"],
    queryFn: async () => (await apiClient.get<Depot[]>("/api/supplier/depots")).data ?? [],
  });

  const pricingQuery = useQuery({
    queryKey: ["/api/supplier/depots", depotId, "pricing"],
    queryFn: async () =>
      (await apiClient.get<FuelTypeWithTiers[]>(`/api/supplier/depots/${depotId}/pricing`)).data ?? [],
    enabled: !!depotId,
  });

  const kycOk =
    profileQuery.data &&
    (profileQuery.data as { status?: string; compliance_status?: string }).status === "active" &&
    (profileQuery.data as { compliance_status?: string }).compliance_status === "approved";

  const invalidatePricing = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots", depotId, "pricing"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
  };

  const addTierMutation = useMutation({
    mutationFn: async () => {
      if (!depotId || !addFuelTypeId) return;
      const priceCents = Math.round((Number(addPrice) || 0) * 100);
      const minLitres = Number(addMinL) || 0;
      const body: { priceCents: number; minLitres: number; availableLitres?: number } = {
        priceCents,
        minLitres,
      };
      if (addStock.trim() !== "") {
        const s = Number(addStock);
        if (!Number.isNaN(s) && s >= 0) body.availableLitres = s;
      }
      await apiClient.post(`/api/supplier/depots/${depotId}/pricing/${addFuelTypeId}/tiers`, body);
    },
    onSuccess: async () => {
      await invalidatePricing();
      setAddOpen(false);
      setAddPrice("");
      setAddMinL("0");
      setAddStock("");
      setAddFuelTypeId(null);
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async () => {
      if (!depotId || !editTier?.id) return;
      const priceCents = Math.round((Number(editPrice) || 0) * 100);
      const minLitres = Number(editMinL);
      if (Number.isNaN(minLitres) || minLitres < 0) throw new Error("Minimum litres must be a valid number");
      const body: { priceCents: number; minLitres: number; availableLitres?: number } = {
        priceCents,
        minLitres,
      };
      if (editStock.trim() !== "") {
        const s = Number(editStock);
        if (!Number.isNaN(s) && s >= 0) body.availableLitres = s;
      }
      await apiClient.put(`/api/supplier/depots/${depotId}/pricing/tiers/${editTier.id}`, body);
    },
    onSuccess: async () => {
      await invalidatePricing();
      setEditOpen(false);
      setEditTier(null);
    },
  });

  const deleteTierMutation = useMutation({
    mutationFn: async (tierId: string) => {
      if (!depotId) return;
      await apiClient.delete(`/api/supplier/depots/${depotId}/pricing/tiers/${tierId}`);
    },
    onSuccess: async () => {
      await invalidatePricing();
    },
  });

  const depots = depotsQuery.data ?? [];

  useEffect(() => {
    const list = depotsQuery.data ?? [];
    if (list.length === 0) {
      setDepotId(null);
      return;
    }
    if (!depotId || !list.some((d) => d.id === depotId)) {
      setDepotId(list[0].id);
    }
  }, [depotsQuery.data, depotId]);

  const sortedFuelTypes = useMemo(() => {
    const rows = pricingQuery.data ?? [];
    return rows.map((ft) => ({
      ...ft,
      pricing_tiers: [...(ft.pricing_tiers ?? [])].sort((a, b) => (a.min_litres ?? 0) - (b.min_litres ?? 0)),
    }));
  }, [pricingQuery.data]);

  const openAdd = (fuelTypeId: string) => {
    setAddFuelTypeId(fuelTypeId);
    setAddPrice("");
    setAddMinL("0");
    setAddStock("");
    setAddOpen(true);
  };

  const openEdit = (tier: PricingTier) => {
    setEditTier(tier);
    setEditPrice((tier.price_cents / 100).toFixed(2));
    setEditMinL(String(tier.min_litres ?? 0));
    setEditStock(
      tier.available_litres != null && tier.available_litres !== undefined
        ? String(tier.available_litres)
        : "",
    );
    setEditOpen(true);
  };

  const selectedDepot = depots.find((d) => d.id === depotId);

  const modalBodyPad = { paddingBottom: Math.max(insets.bottom, 20) };

  return (
    <View style={styles.container}>
      {depotsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card mode="contained" style={styles.hero}>
            <Card.Content>
              <View style={styles.heroTop}>
                <View style={styles.heroIconWrap}>
                  <MaterialCommunityIcons name="cash-multiple" size={26} color={theme.colors.primary} />
                </View>
                <View style={styles.heroTextCol}>
                  <Text variant="headlineSmall" style={styles.heroTitle}>
                    Depot pricing
                  </Text>
                  <Text style={styles.heroSubtitle}>
                    Choose a depot, then set per-litre prices and volume tiers. Stock is shared across tiers for each
                    fuel type.
                  </Text>
                </View>
              </View>
              {!kycOk ? <Text style={styles.warn}>Complete KYC in Profile before editing prices.</Text> : null}
            </Card.Content>
          </Card>

          <View style={styles.depotSection}>
            <Text style={styles.sectionKicker}>Location</Text>
            {depots.length === 0 ? (
              <Card mode="outlined" style={styles.emptyDepotCard}>
                <Card.Content style={styles.emptyDepotInner}>
                  <MaterialCommunityIcons name="map-marker-off-outline" size={40} color={theme.colors.outline} />
                  <Text style={styles.emptyDepotTitle}>No depots yet</Text>
                  <Text style={styles.emptyDepotMeta}>Add a depot from the side menu to manage pricing.</Text>
                </Card.Content>
              </Card>
            ) : (
              <>
                <Text style={styles.depotHint}>Tap a depot to load its fuel types and tiers.</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.depotPillsRow}
                >
                  {depots.map((d) => {
                    const selected = depotId === d.id;
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => setDepotId(d.id)}
                        style={({ pressed }) => [
                          styles.depotPill,
                          selected ? styles.depotPillSelected : styles.depotPillIdle,
                          pressed && styles.depotPillPressed,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="gas-station-outline"
                          size={18}
                          color={selected ? theme.colors.onPrimary : theme.colors.primary}
                        />
                        <View style={styles.depotPillTextCol}>
                          <Text
                            numberOfLines={1}
                            style={[styles.depotPillName, selected && styles.depotPillNameSelected]}
                          >
                            {d.name || "Depot"}
                          </Text>
                          {(d.address_city || d.address_province) && (
                            <Text numberOfLines={1} style={[styles.depotPillSub, selected && styles.depotPillSubSelected]}>
                              {[d.address_city, d.address_province].filter(Boolean).join(", ")}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>

          {selectedDepot && depotId ? (
            <View style={styles.pricingBlock}>
              <View style={styles.pricingBlockHeader}>
                <Text style={styles.sectionKicker}>Fuel & tiers</Text>
                <Text style={styles.selectedDepotCaption} numberOfLines={1}>
                  {selectedDepot.name}
                </Text>
              </View>

              {pricingQuery.isLoading ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator color={theme.colors.primary} />
                  <Text style={styles.loadingHint}>Loading pricing…</Text>
                </View>
              ) : pricingQuery.isError ? (
                <Card mode="outlined" style={styles.errorCard}>
                  <Card.Content>
                    <Text style={styles.error}>{errMessage(pricingQuery.error)}</Text>
                  </Card.Content>
                </Card>
              ) : sortedFuelTypes.length === 0 ? (
                <Card mode="outlined" style={styles.softCard}>
                  <Card.Content>
                    <Text style={styles.softCardText}>No fuel types to display.</Text>
                  </Card.Content>
                </Card>
              ) : (
                sortedFuelTypes.map((ft) => (
                  <Card key={ft.id} mode="contained" style={styles.fuelCard}>
                    <Card.Content>
                      <View style={styles.fuelHeader}>
                        <View style={styles.fuelTitleRow}>
                          <View style={styles.fuelIconSmall}>
                            <MaterialCommunityIcons name="fuel" size={20} color={theme.colors.primary} />
                          </View>
                          <View style={styles.fuelTitleText}>
                            <Text variant="titleMedium" style={styles.fuelLabel}>
                              {ft.label ?? "Fuel"}
                            </Text>
                            {ft.code ? (
                              <View style={styles.codePill}>
                                <Text style={styles.codePillText}>{String(ft.code).toUpperCase()}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <Button
                          mode="contained-tonal"
                          compact
                          icon="plus"
                          disabled={!kycOk}
                          onPress={() => openAdd(ft.id)}
                          style={styles.addTierBtn}
                        >
                          Tier
                        </Button>
                      </View>

                      {(ft.pricing_tiers ?? []).length === 0 ? (
                        <View style={styles.emptyTiers}>
                          <Text style={styles.emptyTiersText}>
                            No price bands yet. Add a tier (e.g. from 0 L) to publish a price.
                          </Text>
                        </View>
                      ) : (
                        (ft.pricing_tiers ?? []).map((tier, idx) => (
                          <View
                            key={tier.id}
                            style={[styles.tierShell, idx === 0 && styles.tierShellFirst]}
                          >
                            <View style={styles.tierTopRow}>
                              <View>
                                <Text style={styles.tierPrice}>
                                  R {(tier.price_cents / 100).toFixed(2)}
                                  <Text style={styles.tierPriceSuffix}> / L</Text>
                                </Text>
                                <Text style={styles.tierMeta}>
                                  From {tier.min_litres ?? 0} L minimum
                                </Text>
                              </View>
                              <View style={styles.stockPill}>
                                <MaterialCommunityIcons
                                  name="barrel-outline"
                                  size={14}
                                  color={theme.colors.onSurfaceVariant}
                                />
                                <Text style={styles.stockPillText}>
                                  {tier.available_litres != null && tier.available_litres !== undefined
                                    ? `${tier.available_litres} L stock`
                                    : "Stock —"}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.tierActions}>
                              <Button
                                mode="outlined"
                                compact
                                disabled={!kycOk}
                                onPress={() => openEdit(tier)}
                                textColor={theme.colors.primary}
                                style={[styles.tierOutlineBtn, { borderColor: theme.colors.primary }]}
                              >
                                Edit
                              </Button>
                              <Button
                                mode="outlined"
                                compact
                                textColor={theme.colors.error}
                                disabled={!kycOk || deleteTierMutation.isPending}
                                onPress={() => deleteTierMutation.mutate(tier.id)}
                                style={[styles.tierOutlineBtn, { borderColor: theme.colors.error }]}
                              >
                                Delete
                              </Button>
                            </View>
                          </View>
                        ))
                      )}
                    </Card.Content>
                  </Card>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={addOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text variant="titleLarge" style={styles.modalTitle}>
                New tier
              </Text>
              <Text style={styles.modalSubtitle}>Price band for this fuel type</Text>
            </View>
            <Button onPress={() => setAddOpen(false)}>Close</Button>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, modalBodyPad]} keyboardShouldPersistTaps="handled">
            <TextInput
              mode="outlined"
              label="Price per litre (ZAR)"
              value={addPrice}
              onChangeText={setAddPrice}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Minimum litres"
              value={addMinL}
              onChangeText={setAddMinL}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Stock (litres, optional)"
              value={addStock}
              onChangeText={setAddStock}
              keyboardType="numeric"
              style={styles.input}
            />
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              contentStyle={styles.modalPrimaryBtn}
              onPress={() => addTierMutation.mutate()}
              loading={addTierMutation.isPending}
              disabled={!addPrice || !kycOk}
            >
              Save tier
            </Button>
            {addTierMutation.isError ? <Text style={styles.error}>{errMessage(addTierMutation.error)}</Text> : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text variant="titleLarge" style={styles.modalTitle}>
                Edit tier
              </Text>
              <Text style={styles.modalSubtitle}>Update price, minimum litres, or stock</Text>
            </View>
            <Button onPress={() => setEditOpen(false)}>Close</Button>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, modalBodyPad]} keyboardShouldPersistTaps="handled">
            <TextInput
              mode="outlined"
              label="Price per litre (ZAR)"
              value={editPrice}
              onChangeText={setEditPrice}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Minimum litres"
              value={editMinL}
              onChangeText={setEditMinL}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Stock (litres)"
              value={editStock}
              onChangeText={setEditStock}
              keyboardType="numeric"
              style={styles.input}
            />
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              contentStyle={styles.modalPrimaryBtn}
              onPress={() => updateTierMutation.mutate()}
              loading={updateTierMutation.isPending}
              disabled={!editTier || !kycOk}
            >
              Save changes
            </Button>
            {updateTierMutation.isError ? (
              <Text style={styles.error}>{errMessage(updateTierMutation.error)}</Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const pillIdleBg = isDark ? theme.colors.surfaceVariant : "#F8FAFC";
  const tierBg = isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9";

  return StyleSheet.create({
    container: { ...p.screenContainer, minHeight: 0 },
    mainScroll: { flex: 1 },
    pageContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 36,
      gap: 0,
    },
    hero: {
      ...p.hero,
      marginBottom: 20,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    heroIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: isDark ? "rgba(38, 237, 217, 0.12)" : "#ECFEFF",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    heroTextCol: { flex: 1, minWidth: 0 },
    heroTitle: { fontWeight: "700", color: theme.colors.onSurface },
    heroSubtitle: {
      marginTop: 6,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 22,
      fontSize: 14,
    },
    warn: { marginTop: 12, color: theme.colors.error, fontSize: 13, lineHeight: 18 },
    sectionKicker: { ...p.sectionKicker },
    depotSection: { marginBottom: 8 },
    depotHint: {
      fontSize: 13,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 10,
      lineHeight: 18,
    },
    depotPillsRow: {
      flexDirection: "row",
      gap: 10,
      paddingRight: 8,
      paddingBottom: 4,
    },
    depotPill: {
      flexDirection: "row",
      alignItems: "center",
      maxWidth: 220,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      gap: 10,
      borderWidth: 1,
    },
    depotPillIdle: {
      backgroundColor: pillIdleBg,
      borderColor: theme.colors.outline,
    },
    depotPillSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    depotPillPressed: { opacity: 0.88 },
    depotPillTextCol: { flex: 1, minWidth: 0 },
    depotPillName: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.colors.onSurface,
    },
    depotPillNameSelected: { color: theme.colors.onPrimary },
    depotPillSub: {
      fontSize: 12,
      marginTop: 2,
      color: theme.colors.onSurfaceVariant,
    },
    depotPillSubSelected: { color: theme.colors.onPrimary, opacity: 0.9 },
    emptyDepotCard: {
      borderRadius: 16,
      borderStyle: "dashed",
      backgroundColor: isDark ? theme.colors.surface : theme.colors.surface,
    },
    emptyDepotInner: { alignItems: "center", paddingVertical: 28 },
    emptyDepotTitle: {
      marginTop: 12,
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.onSurface,
    },
    emptyDepotMeta: {
      marginTop: 6,
      textAlign: "center",
      color: theme.colors.onSurfaceVariant,
      paddingHorizontal: 16,
      lineHeight: 20,
    },
    pricingBlock: { marginTop: 8 },
    pricingBlockHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 12,
      gap: 8,
    },
    selectedDepotCaption: {
      flex: 1,
      textAlign: "right",
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.primary,
    },
    inlineLoading: {
      alignItems: "center",
      paddingVertical: 32,
      gap: 10,
    },
    loadingHint: { color: theme.colors.onSurfaceVariant, fontSize: 14 },
    errorCard: { ...p.listCard, borderColor: theme.colors.error },
    softCard: { ...p.listCard, backgroundColor: tierBg, borderColor: "transparent" },
    softCardText: { textAlign: "center", color: theme.colors.onSurfaceVariant },
    fuelCard: {
      borderRadius: 16,
      marginBottom: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    fuelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
      gap: 8,
    },
    fuelTitleRow: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
    fuelIconSmall: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? "rgba(38, 237, 217, 0.12)" : "#ECFEFF",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    fuelTitleText: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    fuelLabel: { fontWeight: "700", color: theme.colors.onSurface },
    codePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
    },
    codePillText: { fontSize: 11, fontWeight: "700", color: theme.colors.onSurfaceVariant, letterSpacing: 0.5 },
    addTierBtn: { borderRadius: 10 },
    emptyTiers: {
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: tierBg,
    },
    emptyTiersText: { fontSize: 13, color: theme.colors.onSurfaceVariant, lineHeight: 20, textAlign: "center" },
    tierShell: {
      marginTop: 10,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outlineVariant,
    },
    tierShellFirst: {
      marginTop: 0,
      paddingTop: 0,
      borderTopWidth: 0,
    },
    tierTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    tierPrice: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.onSurface,
      letterSpacing: -0.3,
    },
    tierPriceSuffix: { fontSize: 15, fontWeight: "600", color: theme.colors.onSurfaceVariant },
    tierMeta: { marginTop: 4, fontSize: 13, color: theme.colors.onSurfaceVariant },
    stockPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surfaceVariant,
      alignSelf: "flex-start",
    },
    stockPillText: { fontSize: 12, fontWeight: "600", color: theme.colors.onSurfaceVariant },
    tierActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 10,
      gap: 8,
      flexWrap: "wrap",
    },
    tierOutlineBtn: {
      borderRadius: 10,
      borderWidth: 1,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    error: p.errorText,
    modal: { flex: 1, backgroundColor: theme.colors.background },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    modalTitle: { fontWeight: "700" },
    modalSubtitle: { marginTop: 4, fontSize: 13, color: theme.colors.onSurfaceVariant },
    modalBody: { padding: 16, gap: 12 },
    modalPrimaryBtn: { paddingVertical: 6 },
    input: p.input,
  });
};
