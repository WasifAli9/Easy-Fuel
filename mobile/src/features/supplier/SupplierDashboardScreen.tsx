import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SupplierDepotOrdersPanel } from "@/features/supplier/SupplierDepotOrdersPanel";
import { formatMoneyFromCents } from "@/lib/format-currency";

type DepotOrder = {
  id: string;
  status: string;
  total_price_cents?: number;
  created_at?: string;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function SupplierDashboardScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const styles = getStyles(t);

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });
  const ordersQuery = useQuery({
    queryKey: ["/api/supplier/driver-depot-orders"],
    queryFn: async () => (await apiClient.get("/api/supplier/driver-depot-orders")).data,
  });

  const orders: DepotOrder[] = useMemo(() => {
    const data = ordersQuery.data as { orders?: DepotOrder[] } | DepotOrder[] | undefined;
    if (Array.isArray(data)) return data;
    return data?.orders ?? [];
  }, [ordersQuery.data]);

  const { pendingCount, todayRevenueCents } = useMemo(() => {
    const start = startOfToday();
    let pending = 0;
    let todayCents = 0;
    for (const o of orders) {
      if (o.status === "pending") pending++;
      if (o.status === "completed" && o.created_at) {
        const c = new Date(o.created_at);
        if (!Number.isNaN(c.getTime()) && c >= start) {
          todayCents += o.total_price_cents ?? 0;
        }
      }
    }
    return { pendingCount: pending, todayRevenueCents: todayCents };
  }, [orders]);

  const profile = profileQuery.data as { status?: string; compliance_status?: string } | undefined;
  const rawStatus = String(profile?.status ?? "").toLowerCase();
  const rawCompliance = String(profile?.compliance_status ?? "").toLowerCase();
  const isActiveSupplier = rawStatus === "active" || rawStatus === "approved";
  const isApprovedCompliance = rawCompliance === "approved" || rawCompliance === "complete";

  const listHeader = (
    <View style={styles.heroOuter}>
      <View style={[styles.hero, { backgroundColor: t.heroBg }]}>
        <View style={styles.heroBlob} />
        <Text style={styles.kicker}>Workspace dashboard</Text>
        <Text style={styles.heroTitle}>Supplier workspace</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badgeFill, { backgroundColor: t.badgeActiveTint }]}>
            <Text style={[styles.badgeFillText, { color: t.badgeActiveText }]}>
              {isActiveSupplier ? "ACTIVE" : "SETUP"}
            </Text>
          </View>
          <View style={styles.badgeOutline}>
            <Text style={styles.badgeOutlineText}>{isApprovedCompliance ? "APPROVED" : "PENDING"}</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>Pending orders</Text>
            <Text style={styles.statValue}>{pendingCount}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>{"Today's revenue"}</Text>
            <Text style={styles.statValue}>{formatMoneyFromCents(todayRevenueCents, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <SupplierDepotOrdersPanel listHeader={listHeader} />
    </View>
  );
}

function getStyles(t: ReturnType<typeof getFuelPortalTokens>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    heroOuter: {
      width: "100%" as const,
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
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
    statsRow: {
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
  });
}
