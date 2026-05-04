import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Chip, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
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

export function SupplierDepotOrdersPanel() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
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

  if (ordersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
    <FlatList
      style={{ flex: 1 }}
      data={orders}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.muted}>No driver depot orders yet.</Text>}
      renderItem={({ item }) => (
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <View style={styles.rowBetween}>
              <Text variant="titleSmall">#{item.id.slice(0, 8)}</Text>
              <Chip compact>{item.status}</Chip>
            </View>
            <Text style={styles.meta}>{item.depots?.name ?? "Depot"} · {item.fuel_types?.label ?? "Fuel"}</Text>
            <Text style={styles.meta}>
              Driver: {item.drivers?.profile?.full_name ?? "—"} · {item.litres ?? 0} L · R{" "}
              {((item.total_price_cents ?? 0) / 100).toFixed(2)}
            </Text>
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
                onChangeText={(t) => setRejectReason((p) => ({ ...p, [item.id]: t }))}
                style={styles.input}
              />
            ) : null}
            {item.status === "pending_payment" &&
            item.payment_status === "paid" &&
            item.payment_method === "bank_transfer" &&
            item.payment_proof_url ? (
              <View style={styles.actions}>
                <Button mode="contained" onPress={() => verifyPaymentMutation.mutate(item.id)} loading={verifyPaymentMutation.isPending}>
                  Confirm payment
                </Button>
                <Button onPress={() => rejectPaymentMutation.mutate({ orderId: item.id })} loading={rejectPaymentMutation.isPending}>
                  Reject payment
                </Button>
              </View>
            ) : null}
            {item.status === "completed" ? (
              <View style={styles.actions}>
                <Button mode="outlined" onPress={() => setReceiptOrder(item)}>
                  Receipt
                </Button>
                <Button
                  mode="contained"
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
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
              </View>
            ) : null}
          </Card.Content>
        </Card>
      )}
      ListFooterComponent={<View style={{ height: 8 }} />}
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
              <Text style={styles.meta}>{receiptOrder.depots?.name ?? "Depot"} · {receiptOrder.fuel_types?.label ?? "Fuel"}</Text>
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

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    center: { padding: 24, alignItems: "center" },
    list: { gap: 10, paddingBottom: 24, paddingHorizontal: 4 },
    card: p.listCard,
    rowBetween: p.rowBetween,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    input: p.input,
    muted: { ...p.empty, paddingVertical: 8 },
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
