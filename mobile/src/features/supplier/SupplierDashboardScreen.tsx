import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Card, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SupplierDepotOrdersPanel } from "@/features/supplier/SupplierDepotOrdersPanel";

export function SupplierDashboardScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });
  const subscriptionQuery = useQuery({
    queryKey: ["/api/supplier/subscription"],
    queryFn: async () => (await apiClient.get("/api/supplier/subscription")).data,
  });

  const hasActiveSub = useMemo(() => {
    const sub = subscriptionQuery.data as { subscription?: { isActive?: boolean; status?: string }; subscriptionTier?: string | null } | undefined;
    if (!sub) return false;
    return !!sub.subscriptionTier && (sub.subscription?.isActive ?? sub.subscription?.status === "active");
  }, [subscriptionQuery.data]);

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.hero}>
        <Card.Content>
          <View style={styles.brandRow}>
            <View style={styles.brandPill}>
              <MaterialCommunityIcons name="warehouse" size={16} color={theme.colors.primary} />
              <Text style={styles.brandPillText}>EasyFuel</Text>
            </View>
          </View>
          <Text variant="headlineSmall">Supplier workspace</Text>
          <Text style={styles.subtitle}>
            Depot orders below. Use the menu for receipts and pricing; bottom tabs for depots, billing, and profile.
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

      <SupplierDepotOrdersPanel />
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: { ...p.screenContainer, minHeight: 0 },
    hero: { ...p.hero, margin: 12 },
    brandRow: p.brandRow,
    brandPill: p.brandPill,
    brandPillText: p.brandPillText,
    subtitle: p.subtitle,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    warn: { marginTop: 8, color: theme.colors.error },
  });
};
