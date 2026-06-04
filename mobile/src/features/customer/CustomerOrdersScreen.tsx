import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Chip, Menu, SegmentedButtons, Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme, paperMd3ControlRoundness } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import {
  CustomerOrderTab,
  filterByCustomerTab,
  filterOrdersByFuelType,
  filterOutOldCustomerOrders,
  formatCustomerOrderAddress,
} from "@/features/customer/customerOrderUtils";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { formatOrderState } from "@/lib/format-labels";
import { CustomerCreateOrderModal } from "@/features/customer/CustomerCreateOrderModal";
import { CustomerOrderDetailModal } from "@/features/customer/CustomerOrderDetailModal";
import { IconMetaRow, SectionTitleRow } from "@/components/IconMetaRow";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type OrderRow = {
  id: string;
  state?: string;
  order_status?: string;
  litres?: string | number;
  total_cents?: number;
  created_at?: string;
  fuel_types?: { id?: string; label?: string };
  fuel_type_id?: string;
  delivery_addresses?: {
    address_street?: string | null;
    address_city?: string | null;
  } | null;
  drop_lat?: number;
  drop_lng?: number;
};

export function CustomerOrdersScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);

  const [tab, setTab] = useState<CustomerOrderTab>("all");
  const [fuelMenuOpen, setFuelMenuOpen] = useState(false);
  const [selectedFuelTypeId, setSelectedFuelTypeId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["/api/orders"],
    queryFn: async () => (await apiClient.get<OrderRow[]>("/api/orders")).data ?? [],
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const fuelTypesQuery = useQuery({
    queryKey: ["/api/fuel-types"],
    queryFn: async () => (await apiClient.get<{ id: string; label: string }[]>("/api/fuel-types")).data ?? [],
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }, [queryClient]),
  );

  const handleRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await ordersQuery.refetch();
    } finally {
      setManualRefreshing(false);
    }
  }, [ordersQuery]);

  const filtered = useMemo(() => {
    const raw = ordersQuery.data ?? [];
    const recent = filterOutOldCustomerOrders(raw);
    const byTab = filterByCustomerTab(recent, tab);
    return filterOrdersByFuelType(byTab, selectedFuelTypeId);
  }, [ordersQuery.data, tab, selectedFuelTypeId]);

  const selectedFuelLabel = selectedFuelTypeId
    ? fuelTypesQuery.data?.find((f) => f.id === selectedFuelTypeId)?.label
    : null;

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <SectionTitleRow
                icon="clipboard-list-outline"
                title="My orders"
                subtitle="Track and manage fuel deliveries"
                iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
                iconColor={theme.colors.primary}
                subtitleColor={theme.colors.onSurfaceVariant}
              />
            </View>
            <Button
              mode="contained"
              icon="plus"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => setCreateOpen(true)}
              style={styles.newOrderBtn}
              compact
            >
              New
            </Button>
          </View>
          <SegmentedButtons
            theme={{ roundness: paperMd3ControlRoundness }}
            style={styles.segment}
            value={tab}
            onValueChange={(v) => setTab(v as CustomerOrderTab)}
            buttons={[
              { value: "all", label: "All", icon: "format-list-bulleted" },
              { value: "active", label: "Active", icon: "truck-delivery-outline" },
              { value: "completed", label: "Done", icon: "check-circle-outline" },
            ]}
          />
          <Menu
            visible={fuelMenuOpen}
            onDismiss={() => setFuelMenuOpen(false)}
            anchor={
              <Button compact icon="fuel" mode="outlined" onPress={() => setFuelMenuOpen(true)}>
                Fuel
              </Button>
            }
          >
            <Menu.Item
              onPress={() => {
                setSelectedFuelTypeId(null);
                setFuelMenuOpen(false);
              }}
              title="All fuel types"
            />
            {(fuelTypesQuery.data ?? []).map((ft) => (
              <Menu.Item
                key={ft.id}
                onPress={() => {
                  setSelectedFuelTypeId(ft.id);
                  setFuelMenuOpen(false);
                }}
                title={ft.label}
              />
            ))}
          </Menu>
          {selectedFuelLabel ? <Text style={styles.filterHint}>Filtered by {selectedFuelLabel}</Text> : null}
        </Card.Content>
      </Card>

      {ordersQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : ordersQuery.isError ? (
        <Text style={styles.center}>Could not load orders.</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No orders match your filters.</Text>}
          renderItem={({ item }) => (
            <Card mode="outlined" style={styles.card}>
              <Card.Content>
                <View style={styles.rowBetween}>
                  <View style={styles.orderTitleRow}>
                    <MaterialCommunityIcons name="fuel" size={18} color={theme.colors.primary} />
                    <Text variant="titleMedium">{item.fuel_types?.label ?? "Fuel"}</Text>
                  </View>
                  <Chip compact icon="information-outline">{formatOrderState(item.state ?? item.order_status)}</Chip>
                </View>
                <IconMetaRow icon="map-marker-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {formatCustomerOrderAddress(item)}
                </IconMetaRow>
                <IconMetaRow icon="gauge" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {item.litres != null ? `${item.litres} L` : "—"} · {formatMoneyFromCents(item.total_cents ?? 0)}
                </IconMetaRow>
                <IconMetaRow icon="clock-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {item.created_at ? new Date(item.created_at).toLocaleString("en-ZA") : ""}
                </IconMetaRow>
                <Button
                  mode="contained-tonal"
                  compact
                  icon="eye-outline"
                  onPress={() => {
                    setDetailId(item.id);
                    setDetailOpen(true);
                  }}
                  style={styles.open}
                >
                  Details
                </Button>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <CustomerCreateOrderModal
        visible={createOpen}
        onDismiss={() => setCreateOpen(false)}
        onCreated={(id) => {
          setDetailId(id);
          setDetailOpen(true);
        }}
      />
      <CustomerOrderDetailModal orderId={detailId} visible={detailOpen} onDismiss={() => setDetailOpen(false)} />
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    headerCard: { ...p.hero, margin: 12 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    headerInfo: { flex: 1, paddingRight: 6 },
    newOrderBtn: { alignSelf: "flex-start", borderRadius: buttonBorderRadius },
    subtitle: p.subtitle,
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    orderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    segment: { marginTop: 12 },
    filterHint: { marginTop: 8, color: theme.colors.primary, fontWeight: "600" },
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
    card: p.listCard,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    open: { marginTop: 10, alignSelf: "flex-start" },
    center: p.center,
    empty: { ...p.empty, marginTop: 24 },
  });
};
