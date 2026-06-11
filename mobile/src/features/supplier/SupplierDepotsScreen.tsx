import { useMemo, useState } from "react";
import { FlatList, Modal, ScrollView, StyleSheet, View } from "react-native";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Chip, Divider, Switch, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { fuelIconName } from "@/features/supplier/supplierDepotOrderHelpers";

type DepotPriceRow = {
  id: string;
  fuel_type_id?: string;
  price_cents?: number;
  min_litres?: number | string;
  available_litres?: number | string | null;
  fuel_types?: { id?: string; label?: string; code?: string } | null;
};

type Depot = {
  id: string;
  name?: string;
  address_street?: string;
  address_city?: string;
  address_province?: string;
  is_active?: boolean;
  lat?: number;
  lng?: number;
  depot_prices?: DepotPriceRow[];
};

type DepotFuelSummary = {
  fuelTypeId: string;
  label: string;
  stockLitres: number | null;
  priceCents: number | null;
};

function formatDepotAddress(depot: Depot): string {
  const parts = [depot.address_street, depot.address_city, depot.address_province].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No address set";
}

function summarizeDepotFuels(prices: DepotPriceRow[] | undefined): DepotFuelSummary[] {
  const byFuel = new Map<string, DepotFuelSummary>();
  for (const row of prices ?? []) {
    const fuelTypeId = row.fuel_type_id;
    if (!fuelTypeId) continue;
    const label = row.fuel_types?.label || "Unknown fuel";
    let entry = byFuel.get(fuelTypeId);
    if (!entry) {
      entry = { fuelTypeId, label, stockLitres: null, priceCents: null };
      byFuel.set(fuelTypeId, entry);
    }
    if (row.available_litres != null && row.available_litres !== "") {
      const stock = Number(row.available_litres);
      if (!Number.isNaN(stock)) {
        entry.stockLitres = stock;
      }
    }
    const minL = Number(row.min_litres ?? 0);
    if (row.price_cents != null && (entry.priceCents == null || minL === 0)) {
      entry.priceCents = row.price_cents;
    }
  }
  return Array.from(byFuel.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function stockLabel(stock: number | null): { text: string; tone: "muted" | "ok" | "low" | "empty" } {
  if (stock == null || Number.isNaN(stock)) {
    return { text: "Stock not set", tone: "muted" };
  }
  if (stock <= 0) {
    return { text: "Out of stock", tone: "empty" };
  }
  if (stock < 500) {
    return { text: `${stock.toLocaleString("en-ZA")} L`, tone: "low" };
  }
  return { text: `${stock.toLocaleString("en-ZA")} L`, tone: "ok" };
}

export function SupplierDepotsScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const styles = getStyles(theme, t);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [street, setStreet] = useState("");
  const [active, setActive] = useState(true);

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });

  const depotsQuery = useQuery({
    queryKey: ["/api/supplier/depots"],
    queryFn: async () => (await apiClient.get<Depot[]>("/api/supplier/depots")).data ?? [],
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/api/supplier/depots", {
        name,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address_city: city,
        address_province: province,
        address_street: street,
        is_active: active,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
      setModalOpen(false);
      setName("");
      setLat("");
      setLng("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/supplier/depots/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
    },
  });

  const kycOk =
    profileQuery.data &&
    (profileQuery.data as { status?: string; compliance_status?: string }).status === "active" &&
    (profileQuery.data as { status?: string; compliance_status?: string }).compliance_status === "approved";

  const depotList = depotsQuery.data ?? [];

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.header}>
        <Card.Content>
          <Text variant="headlineSmall">Depots</Text>
          <Text style={styles.subtitle}>Fuel supply locations with live stock levels.</Text>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            onPress={() => {
              if (!kycOk) return;
              setModalOpen(true);
            }}
            disabled={!kycOk}
          >
            Add depot
          </Button>
          {!kycOk ? <Text style={styles.warn}>Complete KYC approval in Profile before adding depots.</Text> : null}
        </Card.Content>
      </Card>

      {depotsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={depotList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No depots yet.</Text>}
          renderItem={({ item }) => (
            <DepotListCard
              depot={item}
              theme={theme}
              t={t}
              isDark={isDark}
              styles={styles}
              onDelete={() => deleteMutation.mutate(item.id)}
              deleting={deleteMutation.isPending}
            />
          )}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setModalOpen(false)}>
        <ModalSafeArea style={styles.modal}>
          <ModalScreenHeader title="New depot" onClose={() => setModalOpen(false)} />
          <ScrollView
            style={styles.modalBodyScroll}
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput mode="outlined" label="Name" value={name} onChangeText={setName} style={styles.input} />
            <TextInput mode="outlined" label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" style={styles.input} />
            <TextInput mode="outlined" label="Longitude" value={lng} onChangeText={setLng} keyboardType="numeric" style={styles.input} />
            <TextInput mode="outlined" label="Street" value={street} onChangeText={setStreet} style={styles.input} />
            <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
            <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
            <View style={styles.switchRow}>
              <Text>Active</Text>
              <Switch value={active} onValueChange={setActive} />
            </View>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!name || !lat || !lng}
            >
              Create depot
            </Button>
            {createMutation.isError ? <Text style={styles.error}>{(createMutation.error as Error).message}</Text> : null}
          </ScrollView>
        </ModalSafeArea>
      </Modal>
    </View>
  );
}

function DepotListCard({
  depot,
  theme,
  t,
  isDark,
  styles,
  onDelete,
  deleting,
}: {
  depot: Depot;
  theme: typeof lightTheme;
  t: ReturnType<typeof getFuelPortalTokens>;
  isDark: boolean;
  styles: ReturnType<typeof getStyles>;
  onDelete: () => void;
  deleting: boolean;
}) {
  const fuels = useMemo(() => summarizeDepotFuels(depot.depot_prices), [depot.depot_prices]);
  const isActive = depot.is_active !== false;
  const address = formatDepotAddress(depot);

  const stockToneStyle = (tone: ReturnType<typeof stockLabel>["tone"]) => {
    if (tone === "ok") {
      return { bg: t.accentPositiveSoft, fg: t.accentPositiveText };
    }
    if (tone === "low") {
      return { bg: isDark ? "rgba(251, 191, 36, 0.18)" : "#FEF3C7", fg: isDark ? "#FCD34D" : "#92400E" };
    }
    if (tone === "empty") {
      return { bg: isDark ? "rgba(239, 68, 68, 0.22)" : "#FEE2E2", fg: isDark ? "#FCA5A5" : "#991B1B" };
    }
    return { bg: theme.colors.surfaceVariant, fg: theme.colors.onSurfaceVariant };
  };

  return (
    <Card style={styles.card} mode="contained">
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleCol}>
            <Text variant="titleMedium" style={styles.depotName}>
              {depot.name || "Unnamed depot"}
            </Text>
            <View style={styles.locationRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.locationText} numberOfLines={2}>
                {address}
              </Text>
            </View>
          </View>
          <Chip
            compact
            style={{
              backgroundColor: isActive ? t.badgeActiveTint : theme.colors.surfaceVariant,
            }}
            textStyle={{
              color: isActive ? t.badgeActiveText : theme.colors.onSurfaceVariant,
              fontWeight: "600",
              fontSize: 11,
            }}
          >
            {isActive ? "Active" : "Inactive"}
          </Chip>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.fuelsHeader}>
          <MaterialCommunityIcons name="gas-station-outline" size={18} color={theme.colors.primary} />
          <Text variant="titleSmall" style={styles.fuelsTitle}>
            Fuels & stock
          </Text>
        </View>

        {fuels.length === 0 ? (
          <Text style={styles.noFuels}>No fuels configured yet. Set pricing and stock in the Pricing section.</Text>
        ) : (
          fuels.map((fuel) => {
            const stock = stockLabel(fuel.stockLitres);
            const chipColors = stockToneStyle(stock.tone);
            return (
              <View key={fuel.fuelTypeId} style={styles.fuelRow}>
                <View style={[styles.fuelIconBox, { backgroundColor: isDark ? "rgba(13, 148, 136, 0.14)" : "rgba(13, 148, 136, 0.12)" }]}>
                  <MaterialCommunityIcons name={fuelIconName(fuel.label)} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.fuelInfo}>
                  <Text style={styles.fuelLabel}>{fuel.label}</Text>
                  {fuel.priceCents != null ? (
                    <Text style={styles.fuelPrice}>From {formatMoneyFromCents(fuel.priceCents)}/L</Text>
                  ) : (
                    <Text style={styles.fuelPriceMuted}>Price not set</Text>
                  )}
                </View>
                <View style={styles.stockCol}>
                  <Text style={styles.stockCaption}>Stock</Text>
                  <Chip
                    compact
                    style={{ backgroundColor: chipColors.bg, marginTop: 2 }}
                    textStyle={{ color: chipColors.fg, fontWeight: "700", fontSize: 11 }}
                  >
                    {stock.text}
                  </Chip>
                </View>
              </View>
            );
          })
        )}

        <Button
          mode="outlined"
          textColor={theme.colors.error}
          style={styles.deleteBtn}
          onPress={onDelete}
          loading={deleting}
        >
          Delete
        </Button>
      </Card.Content>
    </Card>
  );
}

const getStyles = (theme: typeof lightTheme, t: ReturnType<typeof getFuelPortalTokens>) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    header: { ...p.hero, margin: 12 },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant, marginBottom: 8 },
    warn: { color: theme.colors.error, marginTop: 8 },
    center: p.center,
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 12 },
    card: {
      ...p.listCard,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    cardContent: { gap: 4 },
    cardTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
    cardTitleCol: { flex: 1, minWidth: 0 },
    depotName: { fontWeight: "700" },
    locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8 },
    locationText: { flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 20 },
    divider: { marginVertical: 12 },
    fuelsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    fuelsTitle: { fontWeight: "700", color: theme.colors.onSurface },
    noFuels: { color: theme.colors.onSurfaceVariant, fontStyle: "italic", marginBottom: 8, lineHeight: 20 },
    fuelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      marginBottom: 8,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
    },
    fuelIconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    fuelInfo: { flex: 1, minWidth: 0 },
    fuelLabel: { fontWeight: "600", color: theme.colors.onSurface },
    fuelPrice: { marginTop: 2, fontSize: 12, color: t.accentPositiveStrong },
    fuelPriceMuted: { marginTop: 2, fontSize: 12, color: theme.colors.onSurfaceVariant },
    stockCol: { alignItems: "flex-end", minWidth: 72 },
    stockCaption: { fontSize: 10, color: theme.colors.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.4 },
    deleteBtn: {
      marginTop: 12,
      alignSelf: "flex-start",
      borderRadius: buttonBorderRadius,
      borderWidth: 1,
      borderColor: theme.colors.error,
    },
    muted: { ...p.empty },
    modal: { flex: 1, backgroundColor: theme.colors.background },
    modalBodyScroll: { flex: 1, minHeight: 0 },
    modalBody: { padding: 16, paddingBottom: 28, gap: 8 },
    input: p.input,
    switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    error: p.errorText,
  });
};
