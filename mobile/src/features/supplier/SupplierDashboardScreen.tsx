import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Card, SegmentedButtons, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SupplierDepotOrdersPanel } from "@/features/supplier/SupplierDepotOrdersPanel";

type SupplierTab = "orders" | "pricing" | "analytics" | "settlements" | "invoices";

export function SupplierDashboardScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [tab, setTab] = useState<SupplierTab>("orders");

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });
  const subscriptionQuery = useQuery({
    queryKey: ["/api/supplier/subscription"],
    queryFn: async () => (await apiClient.get("/api/supplier/subscription")).data,
  });
  const depotsQuery = useQuery({
    queryKey: ["/api/supplier/depots"],
    queryFn: async () => (await apiClient.get("/api/supplier/depots")).data,
  });
  const analyticsQuery = useQuery({
    queryKey: ["/api/supplier/analytics"],
    queryFn: async () => (await apiClient.get("/api/supplier/analytics")).data,
    enabled: tab === "analytics",
  });
  const settlementsQuery = useQuery({
    queryKey: ["/api/supplier/settlements"],
    queryFn: async () => (await apiClient.get("/api/supplier/settlements")).data,
    enabled: tab === "settlements",
  });
  const invoicesQuery = useQuery({
    queryKey: ["/api/supplier/invoices"],
    queryFn: async () => (await apiClient.get("/api/supplier/invoices")).data,
    enabled: tab === "invoices",
  });

  const hasActiveSub = useMemo(() => {
    const sub = subscriptionQuery.data as { subscription?: { isActive?: boolean; status?: string }; subscriptionTier?: string | null } | undefined;
    if (!sub) return false;
    return !!sub.subscriptionTier && (sub.subscription?.isActive ?? sub.subscription?.status === "active");
  }, [subscriptionQuery.data]);

  const depots = (depotsQuery.data as any[]) ?? [];

  return (
    <View style={styles.container}>
      <Card style={styles.hero}>
        <Card.Content>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <MaterialCommunityIcons name="gas-station" size={16} color="#1E3A8A" />
              <Text style={styles.brandText}>EasyFuel</Text>
            </View>
          </View>
          <Text variant="headlineSmall">Supplier workspace</Text>
          <Text style={styles.subtitle}>
            Driver depot orders, pricing view, analytics, settlements, and invoices — use the bottom tabs for Depots, Billing, and Profile.
          </Text>
          {profileQuery.data ? (
            <Text style={styles.meta}>
              Status: {(profileQuery.data as any).status} · Compliance: {(profileQuery.data as any).compliance_status}
            </Text>
          ) : null}
          {!hasActiveSub ? (
            <Text style={styles.warn}>No active subscription — some data may be limited. Open the Subscription tab to manage billing.</Text>
          ) : null}
        </Card.Content>
      </Card>

      <SegmentedButtons
        style={styles.segment}
        value={tab}
        onValueChange={(v) => setTab(v as SupplierTab)}
        buttons={[
          { value: "orders", label: "Orders" },
          { value: "pricing", label: "Pricing" },
          { value: "analytics", label: "Analytics" },
          { value: "settlements", label: "Settle" },
          { value: "invoices", label: "Invoices" },
        ]}
      />

      {tab === "orders" ? <SupplierDepotOrdersPanel /> : null}

      {tab === "pricing" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionHint}>
            Depot-level tier pricing is edited on the web for complex tables. Below is a read-only snapshot from your depots.
          </Text>
          {depotsQuery.isLoading ? (
            <ActivityIndicator />
          ) : (
            depots.map((d: any) => (
              <Card key={d.id} style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall">{d.name}</Text>
                  <Text style={styles.meta}>
                    {[d.address_city, d.address_province].filter(Boolean).join(", ") || "No address"}
                  </Text>
                  {(d.depot_prices ?? []).length === 0 ? (
                    <Text style={styles.meta}>No price rows.</Text>
                  ) : (
                    (d.depot_prices ?? []).map((dp: any) => (
                      <Text key={dp.id} style={styles.meta}>
                        {dp.fuel_types?.label ?? "Fuel"}: R {(dp.price_cents / 100).toFixed(2)} / L (min {dp.min_litres ?? 0} L)
                      </Text>
                    ))
                  )}
                </Card.Content>
              </Card>
            ))
          )}
        </ScrollView>
      ) : null}

      {tab === "analytics" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!hasActiveSub ? (
            <Text style={styles.muted}>Active subscription required for analytics (matches web).</Text>
          ) : analyticsQuery.isLoading ? (
            <ActivityIndicator />
          ) : (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleSmall">Summary</Text>
                <Text style={styles.meta}>Orders today: {(analyticsQuery.data as any)?.ordersToday ?? 0}</Text>
                <Text style={styles.meta}>Orders this week: {(analyticsQuery.data as any)?.ordersThisWeek ?? 0}</Text>
                <Text style={styles.meta}>Total litres: {(analyticsQuery.data as any)?.totalLitres ?? 0}</Text>
                <Text style={styles.meta}>
                  Total value: R {(((analyticsQuery.data as any)?.totalValueCents ?? 0) / 100).toFixed(2)}
                </Text>
              </Card.Content>
            </Card>
          )}
        </ScrollView>
      ) : null}

      {tab === "settlements" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!hasActiveSub ? (
            <Text style={styles.muted}>Active subscription required.</Text>
          ) : settlementsQuery.isLoading ? (
            <ActivityIndicator />
          ) : (
            ((settlementsQuery.data as any)?.settlements ?? []).map((s: any) => (
              <Card key={s.id} style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall">{s.period_start?.slice?.(0, 10)} → {s.period_end?.slice?.(0, 10)}</Text>
                  <Text style={styles.meta}>R {(s.total_cents / 100).toFixed(2)} · {s.status}</Text>
                </Card.Content>
              </Card>
            ))
          )}
        </ScrollView>
      ) : null}

      {tab === "invoices" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!hasActiveSub ? (
            <Text style={styles.muted}>Active subscription required.</Text>
          ) : invoicesQuery.isLoading ? (
            <ActivityIndicator />
          ) : (
            ((invoicesQuery.data as any)?.invoices ?? []).map((inv: any) => (
              <Card key={inv.id} style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall">{inv.depotName ?? "Depot"}</Text>
                  <Text style={styles.meta}>
                    {inv.fuelType} · {inv.litres} L · R {(inv.totalCents / 100).toFixed(2)}
                  </Text>
                  <Text style={styles.meta}>{inv.completedAt ? new Date(inv.completedAt).toLocaleString("en-ZA") : ""}</Text>
                </Card.Content>
              </Card>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, minHeight: 0 },
    hero: { margin: 12, backgroundColor: theme.colors.surface, borderRadius: 20 },
    brandRow: { marginBottom: 8, flexDirection: "row", justifyContent: "flex-end" },
    brandBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      backgroundColor: "#DBEAFE",
      borderWidth: 1,
      borderColor: "#BFDBFE",
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    brandText: { color: "#1E3A8A", fontWeight: "700", fontSize: 12 },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    warn: { marginTop: 8, color: "#B45309" },
    segment: { marginHorizontal: 12, marginBottom: 8 },
    scroll: { padding: 12, paddingBottom: 32, gap: 10 },
    sectionHint: { color: theme.colors.onSurfaceVariant, marginBottom: 8 },
    card: { backgroundColor: theme.colors.surface, borderRadius: 18 },
    muted: { color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 12 },
  });
