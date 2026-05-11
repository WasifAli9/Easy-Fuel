import { ReactNode, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { downloadAndShareSupplierInvoicePdf } from "@/features/supplier/supplierInvoicePdf";

type DepotOrder = {
  id: string;
  status: string;
  payment_status?: string;
  payment_method?: string;
  payment_proof_url?: string | null;
  litres?: number;
  total_price_cents?: number;
  created_at?: string;
  depots?: { name?: string };
  fuel_types?: { label?: string };
  drivers?: { profile?: { full_name?: string } };
};

function fuelIconName(label: string) {
  const l = label.toLowerCase();
  if (l.includes("adblue")) return "water-outline" as const;
  return "gas-station-outline" as const;
}

function formatStatusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "pending") return "Pending";
  if (status === "pending_payment") return "Pending payment";
  return status.replace(/_/g, " ");
}

function statusBadgeStyle(status: string, t: ReturnType<typeof getFuelPortalTokens>, theme: typeof lightTheme) {
  if (status === "completed") {
    return { bg: t.accentPositive, fg: "#FFFFFF" };
  }
  if (status === "pending") {
    return { bg: t.badgeActiveTint, fg: t.badgeActiveText };
  }
  if (status === "rejected" || status === "cancelled") {
    return { bg: "rgba(148, 163, 184, 0.4)", fg: theme.colors.onSurface };
  }
  return { bg: "rgba(100,116,139,0.22)", fg: theme.colors.onSurface };
}

type SupplierDepotOrdersPanelProps = {
  listHeader?: ReactNode;
  /** Full dashboard-style section heading + footer hint; use "minimal" on standalone depot-orders route. */
  listChrome?: "default" | "minimal";
};

export function SupplierDepotOrdersPanel({ listHeader, listChrome = "default" }: SupplierDepotOrdersPanelProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const styles = getStyles(theme, t);
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [receiptOrder, setReceiptOrder] = useState<DepotOrder | null>(null);
  const [receiptPdfLoading, setReceiptPdfLoading] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["/api/supplier/driver-depot-orders"],
    queryFn: async () => (await apiClient.get("/api/supplier/driver-depot-orders")).data,
    refetchInterval: 15_000,
  });

  const orders: DepotOrder[] = useMemo(() => {
    const data = ordersQuery.data as { orders?: DepotOrder[] } | DepotOrder[] | undefined;
    if (Array.isArray(data)) return data;
    return data?.orders ?? [];
  }, [ordersQuery.data]);

  const acceptMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/accept`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/reject`, { reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/verify-payment`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/reject-payment`, { reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
    },
  });

  if (ordersQuery.isLoading && !listHeader) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const listHeaderComposite = (
    <>
      {listHeader}
      {listChrome === "default" ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent deliveries</Text>
          <Pressable hitSlop={8}>
            <Text style={styles.viewAll}>View all</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <FlatList
        style={{ flex: 1 }}
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeaderComposite}
        ListEmptyComponent={
          ordersQuery.isLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator />
            </View>
          ) : (
            <Text style={styles.muted}>No driver depot orders yet.</Text>
          )
        }
        renderItem={({ item }) => {
          const fuelLabel = item.fuel_types?.label ?? "Fuel";
          const badge = statusBadgeStyle(item.status, t, theme);
          return (
            <Card mode="elevated" elevation={isDark ? 2 : 3} style={styles.card}>
              <Card.Content style={styles.cardInner}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.orderId, { color: theme.colors.primary }]}>#{item.id.slice(0, 8)}</Text>
                  <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusPillText, { color: badge.fg }]}>{formatStatusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.fuelTitle}>{fuelLabel}</Text>
                <View style={styles.driverRow}>
                  <MaterialCommunityIcons name="account-outline" size={18} color={theme.colors.onSurfaceVariant} />
                  <Text style={styles.driverText}>Driver: {item.drivers?.profile?.full_name ?? "—"}</Text>
                </View>
                <View style={styles.volumeRow}>
                  <MaterialCommunityIcons name={fuelIconName(fuelLabel)} size={18} color={theme.colors.onSurfaceVariant} />
                  <Text style={styles.volumeText}>{item.litres ?? 0} L</Text>
                  <Text style={styles.dot}>·</Text>
                  <Text style={[styles.priceText, { color: t.accentPositiveStrong }]}>
                    R {((item.total_price_cents ?? 0) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                {item.status === "pending" ? (
                  <View style={styles.actions}>
                    <Button
                      mode="contained"
                      buttonColor={theme.colors.primary}
                      textColor={theme.colors.onPrimary}
                      onPress={() => acceptMutation.mutate(item.id)}
                      loading={acceptMutation.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      onPress={() =>
                        rejectMutation.mutate({ orderId: item.id, reason: rejectReason[item.id] || undefined })
                      }
                      loading={rejectMutation.isPending}
                    >
                      Reject
                    </Button>
                  </View>
                ) : null}
                {item.status === "pending" ? (
                  <TextInput
                    mode="outlined"
                    label="Reject reason (optional)"
                    value={rejectReason[item.id] ?? ""}
                    onChangeText={(text) => setRejectReason((p) => ({ ...p, [item.id]: text }))}
                    style={styles.input}
                  />
                ) : null}
                {item.status === "pending_payment" &&
                item.payment_status === "paid" &&
                item.payment_method === "bank_transfer" &&
                item.payment_proof_url ? (
                  <View style={styles.actions}>
                    <Button
                      mode="contained"
                      onPress={() => verifyPaymentMutation.mutate(item.id)}
                      loading={verifyPaymentMutation.isPending}
                    >
                      Confirm payment
                    </Button>
                    <Button
                      onPress={() => rejectPaymentMutation.mutate({ orderId: item.id })}
                      loading={rejectPaymentMutation.isPending}
                    >
                      Reject payment
                    </Button>
                  </View>
                ) : null}
                {item.status === "completed" ? (
                  <View style={styles.dualActions}>
                    <Button
                      mode="contained"
                      buttonColor={t.brandText}
                      textColor="#FFFFFF"
                      icon="download-outline"
                      style={styles.actionBtn}
                      contentStyle={styles.actionBtnContent}
                      onPress={async () => {
                        try {
                          await downloadAndShareSupplierInvoicePdf(item.id);
                        } catch (e) {
                          const msg =
                            (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                            (e as Error).message ||
                            "Could not download receipt.";
                          Alert.alert("PDF", msg);
                        }
                      }}
                    >
                      Download PDF
                    </Button>
                    <Button
                      mode="outlined"
                      textColor={theme.colors.primary}
                      theme={{ colors: { outline: theme.colors.primary } }}
                      style={styles.actionBtn}
                      contentStyle={styles.actionBtnContent}
                      icon="receipt"
                      onPress={() => setReceiptOrder(item)}
                    >
                      Receipt
                    </Button>
                  </View>
                ) : null}
              </Card.Content>
            </Card>
          );
        }}
        ListFooterComponent={
          listChrome === "default" ? (
            <View style={styles.listFooter}>
              <MaterialCommunityIcons name="history" size={18} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.footerHint}>Showing last 24 hours</Text>
            </View>
          ) : (
            <View style={{ height: 16 }} />
          )
        }
      />
      <Modal visible={!!receiptOrder} animationType="slide" onRequestClose={() => setReceiptOrder(null)}>
        <View style={styles.receiptModal}>
          <View style={styles.receiptHeader}>
            <Text variant="titleLarge">Receipt</Text>
            <Button onPress={() => setReceiptOrder(null)}>Close</Button>
          </View>
          {receiptOrder ? (
            <View style={styles.receiptBody}>
              <Text style={styles.meta}>Order #{receiptOrder.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.meta}>
                {receiptOrder.depots?.name ?? "Depot"} · {receiptOrder.fuel_types?.label ?? "Fuel"}
              </Text>
              <Text style={styles.meta}>
                Driver: {receiptOrder.drivers?.profile?.full_name ?? "—"} · {receiptOrder.litres ?? 0} L
              </Text>
              <Text style={styles.metaStrong}>
                Total R {((receiptOrder.total_price_cents ?? 0) / 100).toFixed(2)}
              </Text>
              <Text style={styles.meta}>
                {receiptOrder.created_at ? `Created ${new Date(receiptOrder.created_at).toLocaleString("en-ZA")}` : ""}
              </Text>
              <Button
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                style={styles.receiptDownload}
                loading={receiptPdfLoading}
                onPress={async () => {
                  if (!receiptOrder) return;
                  setReceiptPdfLoading(true);
                  try {
                    await downloadAndShareSupplierInvoicePdf(receiptOrder.id);
                  } catch (e) {
                    const msg =
                      (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                      (e as Error).message ||
                      "Could not download receipt.";
                    Alert.alert("PDF", msg);
                  } finally {
                    setReceiptPdfLoading(false);
                  }
                }}
              >
                Download PDF
              </Button>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const getStyles = (theme: typeof lightTheme, t: ReturnType<typeof getFuelPortalTokens>) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    center: { padding: 24, alignItems: "center" },
    inlineLoading: { paddingVertical: 28, alignItems: "center" },
    list: { gap: 12, paddingBottom: 28, paddingHorizontal: 0 },
    card: {
      ...p.listCard,
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
    },
    cardInner: { paddingVertical: 4 },
    rowBetween: p.rowBetween,
    orderId: { fontSize: 15, fontWeight: "700" },
    statusPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusPillText: { fontSize: 12, fontWeight: "700" },
    fuelTitle: { marginTop: 10, fontSize: 17, fontWeight: "700", color: theme.colors.onSurface },
    driverRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
    driverText: { fontSize: 14, color: theme.colors.onSurfaceVariant },
    volumeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
    volumeText: { fontSize: 14, color: theme.colors.onSurfaceVariant, fontWeight: "600" },
    dot: { color: theme.colors.onSurfaceVariant, fontWeight: "700" },
    priceText: { fontSize: 15, fontWeight: "800" },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginTop: 4,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.onSurface },
    viewAll: { fontSize: 14, fontWeight: "700", color: theme.colors.primary },
    listFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    footerHint: {
      fontSize: 13,
      fontStyle: "italic",
      color: theme.colors.onSurfaceVariant,
    },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    dualActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    actionBtn: { flex: 1, borderRadius: buttonBorderRadius },
    actionBtnContent: { height: 44 },
    input: { ...p.input, marginTop: 8 },
    muted: { ...p.empty, paddingVertical: 8, paddingHorizontal: 16 },
    receiptModal: { flex: 1, backgroundColor: theme.colors.background },
    receiptHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    receiptBody: { padding: 16, gap: 4 },
    metaStrong: { marginTop: 8, fontWeight: "700", color: theme.colors.onSurface, fontSize: 18 },
    receiptDownload: { marginTop: 20 },
  });
};
