import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Menu,
  SegmentedButtons,
  Text,
} from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import {
  CustomerOrderTab,
  filterByCustomerTab,
  filterOrdersByFuelType,
  filterOutOldCustomerOrders,
  formatCustomerOrderAddress,
} from "@/features/customer/customerOrderUtils";
import { CustomerCreateOrderModal } from "@/features/customer/CustomerCreateOrderModal";
import { CustomerOrderDetailModal } from "@/features/customer/CustomerOrderDetailModal";

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
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <Text variant="headlineSmall">My orders</Text>
              <Text style={styles.subtitle}>Track and manage your fuel deliveries</Text>
            </View>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => setCreateOpen(true)}
              style={styles.newOrderBtn}
              compact
            >
              New order
            </Button>
          </View>
          <SegmentedButtons
            style={styles.segment}
            value={tab}
            onValueChange={(v) => setTab(v as CustomerOrderTab)}
            buttons={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Done" },
            ]}
          />
          <Menu visible={fuelMenuOpen} onDismiss={() => setFuelMenuOpen(false)} anchor={<Button onPress={() => setFuelMenuOpen(true)}>Fuel filter</Button>}>
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
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.rowBetween}>
                  <Text variant="titleMedium">{item.fuel_types?.label ?? "Fuel"}</Text>
                  <Chip compact>{formatOrderStatus(item.state ?? item.order_status)}</Chip>
                </View>
                <Text style={styles.meta}>{formatCustomerOrderAddress(item)}</Text>
                <Text style={styles.meta}>
                  {item.litres != null ? `${item.litres} L` : ""} · R {((item.total_cents ?? 0) / 100).toFixed(2)}
                </Text>
                <Text style={styles.meta}>{item.created_at ? new Date(item.created_at).toLocaleString("en-ZA") : ""}</Text>
                <Button mode="contained-tonal" onPress={() => { setDetailId(item.id); setDetailOpen(true); }} style={styles.open}>
                  View details
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

function formatOrderStatus(state?: string) {
  if (!state) return "Pending";
  return state
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerCard: { margin: 12, backgroundColor: theme.colors.surface },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    headerInfo: { flex: 1, paddingRight: 6 },
    newOrderBtn: { alignSelf: "flex-start" },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    segment: { marginTop: 12 },
    filterHint: { marginTop: 8, color: theme.colors.primary },
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
    card: { backgroundColor: theme.colors.surface },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    open: { marginTop: 10, alignSelf: "flex-start" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    empty: { textAlign: "center", color: theme.colors.onSurfaceVariant, marginTop: 24 },
  });
