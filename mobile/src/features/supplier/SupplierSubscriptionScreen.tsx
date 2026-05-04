import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type SupplierPlan = {
  code: string;
  name: string;
  priceCents: number | null;
  priceZAR: number | null;
  isCustomPricing: boolean;
  platformListing: boolean;
  orderManagementDashboard: boolean;
  orderManagementMultiBranch: boolean;
  driverAccess: string;
  analyticsLevel: string;
  invoicing: boolean;
  invoicingCustomTemplates: boolean;
  settlementSpeed: string;
  accountManager: boolean;
};

type SubscriptionPayload = {
  id?: string;
  plan_code?: string;
  planCode?: string;
  status?: string;
  isActive?: boolean;
  next_billing_at?: string | null;
  nextBillingAt?: string | null;
} | null;

type SubscriptionResponse = {
  subscription: SubscriptionPayload;
  subscriptionTier?: string | null;
};

function planCodeOf(sub: SubscriptionPayload): string | undefined {
  if (!sub) return undefined;
  return sub.plan_code ?? sub.planCode;
}

function nextBillingOf(sub: SubscriptionPayload): string | null | undefined {
  if (!sub) return undefined;
  return sub.next_billing_at ?? sub.nextBillingAt ?? null;
}

function underscoreToWords(s: string) {
  return s.replace(/_/g, " ");
}

function settlementLabel(s: string) {
  return s.replace(/_/g, "-");
}

function planFeatureLines(plan: SupplierPlan): string[] {
  return [
    `Platform listing: ${plan.platformListing ? "Yes" : "No"}`,
    `Order management: ${plan.orderManagementMultiBranch ? "Multi-branch" : "Yes"}`,
    `Driver access: ${underscoreToWords(plan.driverAccess)}`,
    `Analytics: ${underscoreToWords(plan.analyticsLevel)}`,
    `Invoicing: ${plan.invoicingCustomTemplates ? "Yes + custom templates" : "Yes"}`,
    `Settlement: ${settlementLabel(plan.settlementSpeed)}`,
    `Account manager: ${plan.accountManager ? "Yes (dedicated)" : "No"}`,
  ];
}

const ENTERPRISE_MAIL =
  "mailto:sales@easyfuel.co.za?subject=Enterprise%20plan%20inquiry";

export function SupplierSubscriptionScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const subQuery = useQuery({
    queryKey: ["/api/supplier/subscription"],
    queryFn: async () => (await apiClient.get<SubscriptionResponse>("/api/supplier/subscription")).data,
  });
  const plansQuery = useQuery({
    queryKey: ["/api/supplier/subscription/plans"],
    queryFn: async () =>
      (await apiClient.get<{ plans: SupplierPlan[]; ozowConfigured?: boolean; testMode?: boolean }>(
        "/api/supplier/subscription/plans",
      )).data,
  });

  const payMutation = useMutation({
    mutationFn: async (planCode: string) => {
      const { data } = await apiClient.post<{ redirectUrl?: string; success?: boolean; error?: string }>(
        "/api/supplier/subscription/create-payment",
        { planCode },
      );
      if (data.redirectUrl) {
        await Linking.openURL(data.redirectUrl);
      } else if (data.success) {
        return;
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

  const plans: SupplierPlan[] = useMemo(() => plansQuery.data?.plans ?? [], [plansQuery.data]);
  const ozowConfigured = plansQuery.data?.ozowConfigured ?? false;
  const testMode = plansQuery.data?.testMode ?? false;

  const sub = subQuery.data;
  const subscription = sub?.subscription ?? null;
  const planCode = planCodeOf(subscription);
  const tier = sub?.subscriptionTier ?? null;

  const hasActive =
    subscription?.isActive ?? (!!tier && subscription?.status === "active");

  const nextBillingRaw = nextBillingOf(subscription);
  const nextBillingDate = nextBillingRaw ? new Date(nextBillingRaw) : null;

  const standardSubscribeDisabled =
    (!ozowConfigured && !testMode) ||
    payMutation.isPending ||
    (hasActive && tier === "standard");

  const enterpriseContactDisabled = hasActive && tier === "enterprise";

  if (subQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card mode="contained" style={styles.billingCard}>
        <Card.Content>
          <Text variant="headlineSmall">Billing</Text>
          <Text style={styles.subtitle}>Subscription state mirrors the web supplier billing page.</Text>
          <Text style={styles.meta}>Tier: {tier ?? "—"}</Text>
          <Text style={styles.meta}>Plan: {planCode ?? "—"}</Text>
          <Text style={styles.meta}>Status: {subscription?.status ?? "—"}</Text>
          {planCode === "enterprise" && hasActive ? (
            <Text style={styles.meta}>
              Next billing: custom pricing – contact your account manager for billing.
            </Text>
          ) : (
            <Text style={styles.meta}>
              Next billing:{" "}
              {nextBillingDate && !Number.isNaN(nextBillingDate.getTime())
                ? nextBillingDate.toLocaleString("en-ZA")
                : "—"}
            </Text>
          )}
          {hasActive && planCode === "standard" ? (
            <Button
              mode="outlined"
              textColor={theme.colors.error}
              onPress={() => cancelMutation.mutate()}
              loading={cancelMutation.isPending}
              style={styles.mt8}
            >
              Cancel at period end
            </Button>
          ) : null}
        </Card.Content>
      </Card>

      {!ozowConfigured && !testMode ? (
        <Card mode="outlined" style={styles.noticeCard}>
          <Card.Content>
            <Text variant="titleSmall">Payment gateway not configured</Text>
            <Text style={styles.meta}>
              Standard plan checkout will be available once OZOW is configured (same as web).
            </Text>
          </Card.Content>
        </Card>
      ) : null}

      {testMode ? (
        <Card mode="outlined" style={styles.testNoticeCard}>
          <Card.Content>
            <Text variant="titleSmall">Test mode</Text>
            <Text style={styles.meta}>Subscribing activates the plan immediately without payment checkout.</Text>
          </Card.Content>
        </Card>
      ) : null}

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Available plans
      </Text>
      {plansQuery.isLoading ? (
        <ActivityIndicator style={styles.plansLoading} />
      ) : null}

      {plans.map((plan) => (
        <Card key={plan.code} mode="outlined" style={styles.planCard}>
          <Card.Content>
            <Text variant="titleMedium">{plan.name}</Text>
            <Text style={styles.meta}>
              {plan.isCustomPricing || plan.priceZAR == null
                ? "Custom"
                : `R ${Number(plan.priceZAR).toFixed(2)} / month`}
            </Text>
            <View style={styles.planDetailBox}>
              {planFeatureLines(plan).map((line) => (
                <Text key={`${plan.code}-${line}`} style={styles.bullet}>
                  • {line}
                </Text>
              ))}
            </View>
            {plan.code === "standard" ? (
              <Button
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                style={styles.mt8}
                onPress={() => payMutation.mutate("standard")}
                loading={payMutation.isPending}
                disabled={standardSubscribeDisabled}
              >
                {hasActive && tier === "standard"
                  ? "Current plan"
                  : testMode
                    ? "Subscribe (test)"
                    : "Pay with Ozow"}
              </Button>
            ) : (
              <Button
                mode="outlined"
                style={styles.mt8}
                onPress={() => Linking.openURL(ENTERPRISE_MAIL)}
                disabled={enterpriseContactDisabled}
              >
                {hasActive && tier === "enterprise" ? "Current plan" : "Contact sales"}
              </Button>
            )}
          </Card.Content>
        </Card>
      ))}

      {payMutation.isError ? <Text style={styles.error}>{(payMutation.error as Error).message}</Text> : null}
    </ScrollView>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    content: { ...p.screenScrollContentCompact, paddingBottom: 32 },
    billingCard: { ...p.hero, marginBottom: 4 },
    subtitle: p.subtitle,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    sectionTitle: { marginTop: 16, marginBottom: 8, fontWeight: "600" },
    planCard: p.listCard,
    planDetailBox: p.planDetailBox,
    bullet: { marginTop: 6, color: theme.colors.onSurfaceVariant, fontSize: 14, lineHeight: 20 },
    mt8: p.mt8,
    center: p.center,
    error: p.errorText,
    noticeCard: { ...p.listCard, marginTop: 8, borderColor: theme.colors.outline },
    testNoticeCard: {
      ...p.listCard,
      marginTop: 8,
      borderColor: "#F59E0B",
      backgroundColor: modeSurfaceTint(theme, "rgba(245, 158, 11, 0.08)"),
    },
    plansLoading: { marginVertical: 12 },
  });
};

function modeSurfaceTint(theme: typeof lightTheme, lightTint: string) {
  // Subtle amber wash in light mode; darker surface tint in dark mode
  return theme.dark ? "rgba(245, 158, 11, 0.12)" : lightTint;
}
