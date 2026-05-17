import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Card, Chip, Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { filterOutOldCustomerOrders, formatCustomerOrderAddress } from "@/features/customer/customerOrderUtils";
import { CustomerCreateOrderModal } from "@/features/customer/CustomerCreateOrderModal";
import { CustomerOrderDetailModal } from "@/features/customer/CustomerOrderDetailModal";
import { useNotificationDeepLinkStore } from "@/store/notification-deep-link-store";

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
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const styles = getStyles(theme);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const consumeDeepLink = useNotificationDeepLinkStore((s) => s.consume);

  const ordersQuery = useQuery({
    queryKey: ["/api/orders"],
    queryFn: async () => (await apiClient.get<OrderRow[]>("/api/orders")).data ?? [],
    staleTime: 15_000,
  });

  useEffect(() => {
    const link = useNotificationDeepLinkStore.getState().pending;
    if (!link?.orderId) return;

    const exists = (ordersQuery.data ?? []).some((o) => o.id === link.orderId);
    if (!exists && !ordersQuery.isSuccess) return;

    const consumed = consumeDeepLink();
    if (!consumed?.orderId) return;

    setDetailId(consumed.orderId);
    setDetailOpen(true);
  }, [ordersQuery.data, ordersQuery.isSuccess, consumeDeepLink]);

  const summary = useMemo(() => {
    const list = ordersQuery.data ?? [];
    const recent = filterOutOldCustomerOrders(list);
    const active = recent.filter((o) => !["delivered", "cancelled"].includes(o.state ?? ""));
    const completed = recent.filter((o) => (o.state ?? "") === "delivered").length;
    return {
      total: recent.length,
      active: active.length,
      completed,
      recent: recent.slice(0, 5),
    };
  }, [ordersQuery.data]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroOuter}>
        <View style={[styles.hero, { backgroundColor: t.heroBg }]}>
          <View style={styles.heroBlob} />
          <Text style={styles.kicker}>Workspace dashboard</Text>
          <Text style={styles.heroTitle}>Customer workspace</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badgeFill, { backgroundColor: t.badgeActiveTint }]}>
              <Text style={[styles.badgeFillText, { color: t.badgeActiveText }]}>ACTIVE</Text>
            </View>
            <View style={styles.badgeOutline}>
              <Text style={styles.badgeOutlineText}>ORDERS</Text>
            </View>
          </View>
          <View style={styles.statsRowHero}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Active orders</Text>
              <Text style={styles.statValue}>{summary.active}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Completed</Text>
              <Text style={styles.statValue}>{summary.completed}</Text>
            </View>
          </View>
          <Button
            mode="contained"
            buttonColor={t.badgeActiveText}
            textColor={theme.colors.onPrimary}
            style={styles.heroCta}
            onPress={() => setCreateOpen(true)}
          >
            Create Order
          </Button>
        </View>
      </View>

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
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const t = getFuelPortalTokens(theme, isDark);
  return StyleSheet.create({
    container: p.screenContainer,
    content: { paddingBottom: 32 },
    heroOuter: {
      width: "100%",
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 8,
    },
    hero: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: t.heroRadius,
      borderBottomRightRadius: t.heroRadius,
      paddingVertical: 20,
      paddingHorizontal: 20,
      overflow: "hidden",
    },
    heroBlob: {
      position: "absolute",
      top: -40,
      right: -30,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    kicker: {
      color: t.heroKicker,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    heroTitle: {
      marginTop: 8,
      color: t.heroOn,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    badgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 14,
    },
    badgeFill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
    },
    badgeFillText: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
    },
    badgeOutline: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.85)",
    },
    badgeOutlineText: {
      color: t.heroOn,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
    },
    statsRowHero: {
      flexDirection: "row",
      marginTop: 22,
      gap: 16,
    },
    statCol: {
      flex: 1,
    },
    statLabel: {
      color: t.heroMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    statValue: {
      marginTop: 6,
      color: t.heroOn,
      fontSize: 24,
      fontWeight: "800",
    },
    heroCta: { marginTop: 16, alignSelf: "flex-start", borderRadius: buttonBorderRadius },
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
