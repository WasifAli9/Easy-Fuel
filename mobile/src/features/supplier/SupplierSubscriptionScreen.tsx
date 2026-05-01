import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Plan = {
  code: string;
  name: string;
  priceZAR?: number | null;
  priceCents?: number | null;
};

export function SupplierSubscriptionScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const subQuery = useQuery({
    queryKey: ["/api/supplier/subscription"],
    queryFn: async () => (await apiClient.get("/api/supplier/subscription")).data,
  });
  const plansQuery = useQuery({
    queryKey: ["/api/supplier/subscription/plans"],
    queryFn: async () => (await apiClient.get("/api/supplier/subscription/plans")).data,
  });

  const payMutation = useMutation({
    mutationFn: async (planCode: string) => {
      const { data } = await apiClient.post<{ redirectUrl?: string; error?: string }>("/api/supplier/subscription/create-payment", {
        planCode,
      });
      if (data.redirectUrl) {
        await Linking.openURL(data.redirectUrl);
      } else {
        throw new Error(data.error || "No redirect URL from server");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/subscription"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.post("/api/supplier/subscription/cancel"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/subscription"] });
    },
  });

  const plans: Plan[] = useMemo(() => (plansQuery.data as { plans?: Plan[] })?.plans ?? [], [plansQuery.data]);
  const sub = subQuery.data as
    | { subscription?: { plan_code?: string; status?: string; isActive?: boolean; next_billing_at?: string | null }; subscriptionTier?: string | null }
    | undefined;

  const hasActive =
    sub?.subscription?.isActive ?? (!!sub?.subscriptionTier && sub?.subscription?.status === "active");

  if (subQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="headlineSmall">Billing</Text>
          <Text style={styles.subtitle}>Subscription state mirrors the web supplier billing page.</Text>
          <Text style={styles.meta}>Tier: {sub?.subscriptionTier ?? "—"}</Text>
          <Text style={styles.meta}>Plan: {sub?.subscription?.plan_code ?? "—"}</Text>
          <Text style={styles.meta}>Status: {sub?.subscription?.status ?? "—"}</Text>
          <Text style={styles.meta}>
            Next billing: {sub?.subscription?.next_billing_at ? new Date(sub.subscription.next_billing_at).toLocaleString("en-ZA") : "—"}
          </Text>
          {hasActive ? (
            <Button mode="outlined" textColor={theme.colors.error} onPress={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
              Cancel at period end
            </Button>
          ) : null}
        </Card.Content>
      </Card>

      <Text variant="titleMedium" style={styles.section}>
        Available plans
      </Text>
      {plansQuery.isLoading ? <ActivityIndicator /> : null}
      {plans.map((p) => (
        <Card key={p.code} style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall">{p.name}</Text>
            <Text style={styles.meta}>
              {p.priceZAR != null ? `R ${p.priceZAR.toFixed(2)} / month` : p.priceCents != null ? `R ${(p.priceCents / 100).toFixed(2)}` : "Custom"}
            </Text>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => payMutation.mutate(p.code)}
              loading={payMutation.isPending}
            >
              Pay with Ozow
            </Button>
          </Card.Content>
        </Card>
      ))}
      {payMutation.isError ? <Text style={styles.error}>{(payMutation.error as Error).message}</Text> : null}
    </ScrollView>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 14, paddingBottom: 32, gap: 12 },
    card: { backgroundColor: theme.colors.surface },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    section: { marginTop: 8 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    error: { color: theme.colors.error },
  });
