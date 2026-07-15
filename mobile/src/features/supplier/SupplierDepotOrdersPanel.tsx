import { ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { openStoredDocument } from "@/lib/files";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useNotificationDeepLinkStore } from "@/store/notification-deep-link-store";
import { DepotOrderReceiptModal } from "@/components/DepotOrderReceiptModal";
import { SupplierDepotOrderDetailModal } from "@/features/supplier/SupplierDepotOrderDetailModal";
import {
  formatOrderStatusLabel,
  fuelIconName,
  getDriverDisplayName,
  isSupplierBankIncompleteError,
  mutationErrorMessage,
  statusBadgeStyle,
  type SupplierDepotOrder,
} from "@/features/supplier/supplierDepotOrderHelpers";

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
  const [receiptOrder, setReceiptOrder] = useState<SupplierDepotOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<SupplierDepotOrder | null>(null);
  const [showAllOrders, setShowAllOrders] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["/api/supplier/driver-depot-orders"],
    queryFn: async () => (await apiClient.get("/api/supplier/driver-depot-orders")).data,
    refetchInterval: 15_000,
  });

  const orders: SupplierDepotOrder[] = useMemo(() => {
    const data = ordersQuery.data as { orders?: SupplierDepotOrder[] } | SupplierDepotOrder[] | undefined;
    if (Array.isArray(data)) return data;
    return data?.orders ?? [];
  }, [ordersQuery.data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
  };

  const acceptMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/accept`),
    onSuccess: invalidate,
    onError: (e) => {
      if (isSupplierBankIncompleteError(e)) {
        Alert.alert(
          "Bank details required",
          "Please add your company bank details in your profile before accepting a driver order.",
          [{ text: "OK" }],
        );
        return;
      }
      Alert.alert("Could not accept order", mutationErrorMessage(e));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/reject`, { reason }),
    onSuccess: invalidate,
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/verify-payment`),
    onSuccess: invalidate,
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/reject-payment`, { reason }),
    onSuccess: invalidate,
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const releaseFuelMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/release`),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Fuel released", "The driver will be notified to sign for receipt.");
    },
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const consumeDeepLink = useNotificationDeepLinkStore((s) => s.consume);

  useEffect(() => {
    const link = useNotificationDeepLinkStore.getState().pending;
    const targetId = link?.depotOrderId ?? (link?.openDepotOrders ? link.orderId : undefined);
    if (!targetId) return;
    if (!ordersQuery.isSuccess) return;

    const match = orders.find((o) => o.id === targetId);
    if (!match) return;

    const consumed = consumeDeepLink();
    const consumedId = consumed?.depotOrderId ?? consumed?.orderId;
    if (!consumedId) return;

    const resolved = orders.find((o) => o.id === consumedId);
    if (resolved) {
      setDetailOrder(resolved);
    }
  }, [orders, ordersQuery.isSuccess, consumeDeepLink]);

  const openOrderDetail = (order: SupplierDepotOrder) => setDetailOrder(order);

  const confirmReleaseFuel = (order: SupplierDepotOrder) => {
    Alert.alert(
      "Release fuel",
      `Release ${order.litres ?? 0} L to ${getDriverDisplayName(order)}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Release", onPress: () => releaseFuelMutation.mutate(order.id) },
      ],
    );
  };

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
          <Pressable hitSlop={8} onPress={() => setShowAllOrders(true)}>
            <Text style={styles.viewAll}>View all</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  const renderOrderCard = (item: SupplierDepotOrder) => {
    const fuelLabel = item.fuel_types?.label ?? "Fuel";
    const badge = statusBadgeStyle(item.status, t, theme);
    const statusLabel = formatOrderStatusLabel(item);

    return (
      <Pressable onPress={() => openOrderDetail(item)} accessibilityRole="button">
        <Card mode="elevated" elevation={isDark ? 2 : 3} style={styles.card}>
          <Card.Content style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <Text style={[styles.orderId, { color: theme.colors.primary }]}>#{item.id.slice(0, 8)}</Text>
              <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusPillText, { color: badge.fg }]}>{statusLabel}</Text>
              </View>
            </View>
            <Text style={styles.fuelTitle}>{fuelLabel}</Text>
            <View style={styles.driverRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.driverText}>Driver: {getDriverDisplayName(item)}</Text>
            </View>
            <View style={styles.volumeRow}>
              <MaterialCommunityIcons name={fuelIconName(fuelLabel)} size={18} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.volumeText}>{item.litres ?? 0} L</Text>
              <Text style={styles.dot}>·</Text>
              <Text style={[styles.priceText, { color: t.accentPositiveStrong }]}>
                {formatMoneyFromCents(item.total_price_cents ?? 0)}
              </Text>
            </View>
            <Text style={styles.tapHint}>Tap to manage order</Text>

            {item.status === "pending" ? (
              <View style={styles.actions} onStartShouldSetResponder={() => true}>
                <Button
                  mode="contained"
                  buttonColor={t.accentPositiveStrong}
                  textColor="#FFFFFF"
                  style={styles.offerActionBtn}
                  icon="check-circle-outline"
                  onPress={() => acceptMutation.mutate(item.id)}
                  loading={acceptMutation.isPending}
                >
                  Accept
                </Button>
                <Button
                  mode="contained"
                  buttonColor={theme.colors.error}
                  textColor={theme.colors.onError}
                  style={styles.offerActionBtn}
                  icon="close-circle-outline"
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
              <View style={styles.actions} onStartShouldSetResponder={() => true}>
                <Button
                  mode="outlined"
                  onPress={async () => {
                    try {
                      await openStoredDocument(item.payment_proof_url);
                    } catch (e) {
                      Alert.alert("Payment proof", mutationErrorMessage(e));
                    }
                  }}
                >
                  View proof
                </Button>
                <Button
                  mode="contained"
                  onPress={() => verifyPaymentMutation.mutate(item.id)}
                  loading={verifyPaymentMutation.isPending}
                >
                  Confirm payment
                </Button>
              </View>
            ) : null}
            {item.status === "ready_for_pickup" ? (
              <View style={styles.actions} onStartShouldSetResponder={() => true}>
                <Button
                  mode="contained"
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  icon="gas-station"
                  onPress={() => confirmReleaseFuel(item)}
                  loading={releaseFuelMutation.isPending}
                >
                  Release fuel
                </Button>
              </View>
            ) : null}
            {item.status === "completed" ? (
              <View style={styles.singleAction} onStartShouldSetResponder={() => true}>
                <Button
                  mode="contained"
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  icon="receipt-text-outline"
                  style={styles.actionBtnFull}
                  contentStyle={styles.actionBtnContent}
                  onPress={() => setReceiptOrder(item)}
                >
                  View receipt
                </Button>
              </View>
            ) : null}
          </Card.Content>
        </Card>
      </Pressable>
    );
  };

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
        renderItem={({ item }) => renderOrderCard(item)}
        ListFooterComponent={
          listChrome === "default" ? (
            <View style={styles.listFooter}>
              <MaterialCommunityIcons name="history" size={18} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.footerHint}>Showing last 24 hours · tap an order to manage</Text>
            </View>
          ) : (
            <View style={{ height: 16 }} />
          )
        }
      />

      <SupplierDepotOrderDetailModal
        order={detailOrder}
        visible={!!detailOrder}
        onDismiss={() => setDetailOrder(null)}
      />

      <Modal visible={showAllOrders} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowAllOrders(false)}>
        <ModalSafeArea style={styles.allOrdersModal}>
          <View style={styles.receiptHeader}>
            <Text variant="titleLarge">All depot orders</Text>
            <Button onPress={() => setShowAllOrders(false)}>Close</Button>
          </View>
          <FlatList
            data={orders}
            keyExtractor={(item) => `all-${item.id}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => renderOrderCard(item)}
            ListEmptyComponent={<Text style={styles.muted}>No orders.</Text>}
          />
        </ModalSafeArea>
      </Modal>

      <DepotOrderReceiptModal
        order={receiptOrder}
        visible={!!receiptOrder}
        onClose={() => setReceiptOrder(null)}
        driverName={receiptOrder ? getDriverDisplayName(receiptOrder) : undefined}
      />
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
    cardHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    orderId: { fontSize: 15, fontWeight: "700", flexShrink: 0 },
    statusPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      flexShrink: 1,
      maxWidth: "100%",
    },
    statusPillText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
    fuelTitle: { marginTop: 10, fontSize: 17, fontWeight: "700", color: theme.colors.onSurface },
    driverRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
    driverText: { fontSize: 14, color: theme.colors.onSurfaceVariant, flexShrink: 1 },
    volumeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
    volumeText: { fontSize: 14, color: theme.colors.onSurfaceVariant, fontWeight: "600" },
    dot: { color: theme.colors.onSurfaceVariant, fontWeight: "700" },
    priceText: { fontSize: 15, fontWeight: "800", flexShrink: 0 },
    tapHint: { marginTop: 10, fontSize: 12, color: theme.colors.primary, fontWeight: "600" },
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
    offerActionBtn: { flex: 1, borderRadius: buttonBorderRadius },
    singleAction: { marginTop: 16 },
    actionBtnFull: { borderRadius: buttonBorderRadius },
    actionBtnContent: { height: 44 },
    input: { ...p.input, marginTop: 8 },
    muted: { ...p.empty, paddingVertical: 8, paddingHorizontal: 16 },
    allOrdersModal: { flex: 1, backgroundColor: theme.colors.background },
    receiptHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
  });
};
