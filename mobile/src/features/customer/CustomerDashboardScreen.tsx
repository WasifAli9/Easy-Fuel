import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Chip, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { filterOutOldCustomerOrders, formatCustomerOrderAddress } from "@/features/customer/customerOrderUtils";
import { CustomerCreateOrderModal } from "@/features/customer/CustomerCreateOrderModal";
import { CustomerOrderDetailModal } from "@/features/customer/CustomerOrderDetailModal";

type OrderRow = {
  id: string;
  state?: string;
  order_status?: string;
  litres?: string | number;
  total_cents?: number;
  created_at?: string;
  fuel_types?: { label?: string };
  delivery_addresses?: {
    address_street?: string | null;
    address_city?: string | null;
  } | null;
  drop_lat?: number;
  drop_lng?: number;
};

export function CustomerDashboardScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["/api/orders"],
    queryFn: async () => (await apiClient.get<OrderRow[]>("/api/orders")).data ?? [],
    staleTime: 15_000,
  });

  const summary = useMemo(() => {
    const list = ordersQuery.data ?? [];
    const recent = filterOutOldCustomerOrders(list);
    const active = recent.filter((o) => !["delivered", "cancelled"].includes(o.state ?? ""));
    return {
      total: recent.length,
      active: active.length,
      recent: recent.slice(0, 5),
    };
  }, [ordersQuery.data]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card mode="contained" style={styles.hero}>
        <Card.Content>
          <View style={styles.brandRow}>
            <View style={styles.brandPill}>
              <MaterialCommunityIcons name="gas-station" size={16} color={theme.colors.primary} />
              <Text style={styles.brandPillText}>EasyFuel</Text>
            </View>
          </View>
          <Text variant="labelLarge" style={styles.kicker}>
            Customer
          </Text>
          <Text variant="headlineMedium">Dashboard</Text>
          <Text style={styles.subtitle}>Overview of your fuel orders</Text>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            style={styles.cta}
            onPress={() => setCreateOpen(true)}
          >
            Create order
          </Button>
        </Card.Content>
      </Card>

      <View style={styles.statsRow}>
        <Card mode="outlined" style={[styles.statCard, styles.statCardActive]}>
          <Card.Content>
            <Text variant="labelSmall" style={styles.statLabelActive}>Active</Text>
            <Text variant="headlineMedium">{summary.active}</Text>
          </Card.Content>
        </Card>
        <Card mode="outlined" style={[styles.statCard, styles.statCardRecent]}>
          <Card.Content>
            <Text variant="labelSmall" style={styles.statLabelRecent}>Recent (visible)</Text>
            <Text variant="headlineMedium">{summary.total}</Text>
          </Card.Content>
        </Card>
      </View>

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Recent orders
      </Text>
      {summary.recent.length === 0 ? (
        <Text style={styles.muted}>No orders yet. Create your first delivery request.</Text>
      ) : (
        summary.recent.map((item) => (
          <Card key={item.id} mode="outlined" style={styles.card}>
            <Card.Content>
              <View style={styles.orderHeader}>
                <Text variant="titleSmall">{item.fuel_types?.label ?? "Fuel"}</Text>
                <Chip compact style={styles.statusChip}>
                  {formatOrderStatus(item.state ?? item.order_status)}
                </Chip>
              </View>
              <Text style={styles.meta}>{formatCustomerOrderAddress(item)}</Text>
              <Text style={styles.meta}>
                {item.litres != null ? `${item.litres} L · ` : ""}R {((item.total_cents ?? 0) / 100).toFixed(2)}
              </Text>
              <Button
                mode="contained-tonal"
                onPress={() => {
                  setDetailId(item.id);
                  setDetailOpen(true);
                }}
              >
                Open
              </Button>
            </Card.Content>
          </Card>
        ))
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
    </ScrollView>
  );
}

function formatOrderStatus(state?: string) {
  if (!state) return "Pending";
  return state
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    content: { ...p.screenScrollContentCompact, paddingBottom: 32 },
    hero: p.hero,
    brandRow: p.brandRow,
    brandPill: p.brandPill,
    brandPillText: p.brandPillText,
    kicker: { color: theme.colors.primary, fontWeight: "600" },
    subtitle: p.subtitle,
    cta: { marginTop: 12, alignSelf: "flex-start", borderRadius: 10 },
    statsRow: p.statsRow,
    statCard: p.statCard,
    statCardActive: p.statCardActive,
    statCardRecent: p.statCardRecent,
    statLabelActive: p.statLabelActive,
    statLabelRecent: p.statLabelRecent,
    sectionTitle: { marginTop: 8, fontWeight: "600", color: theme.colors.onSurface },
    card: p.listCard,
    orderHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    statusChip: { backgroundColor: theme.colors.secondaryContainer },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    muted: p.muted,
  });
};
