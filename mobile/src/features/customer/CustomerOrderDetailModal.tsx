import { useEffect, useMemo } from "react";
import { KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Chip, Divider, Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { OrderChatPanel } from "@/features/chat/OrderChatPanel";
import { formatCustomerOrderAddress } from "@/features/customer/customerOrderUtils";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { useModalLayout } from "@/components/modal-layout";
import { DeliverySignatureDisplay } from "@/components/DeliverySignatureDisplay";
import { OrderDriverLocationMap } from "@/components/OrderDriverLocationMap";
import { formatMoneyAmount, formatMoneyFromCents } from "@/lib/format-currency";
import { formatOfferState, formatOrderState } from "@/lib/format-labels";

type Offer = {
  id: string;
  state?: string;
  driver?: {
    profile?: { fullName?: string; phone?: string } | null;
  } | null;
  estimatedPricing?: { total?: number; fuelCost?: number; deliveryFee?: number; distanceKm?: number };
};

function normalizeOffersResponse(raw: unknown): Offer[] {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (Array.isArray(v)) {
    return v as Offer[];
  }
  if (v && typeof v === "object" && Array.isArray((v as { offers?: unknown }).offers)) {
    return (v as { offers: Offer[] }).offers;
  }
  return [];
}

async function fetchOrderOffers(orderId: string): Promise<Offer[]> {
  const { data } = await apiClient.get(`/api/orders/${encodeURIComponent(orderId)}/offers`);
  return normalizeOffersResponse(data);
}

export function CustomerOrderDetailModal({
  orderId,
  visible,
  onDismiss,
}: {
  orderId: string | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const { chatMaxHeight, footerPaddingBottom } = useModalLayout();
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ["/api/orders", orderId],
    enabled: visible && !!orderId,
    queryFn: async () => (await apiClient.get(`/api/orders/${orderId}`)).data,
    refetchInterval: 15_000,
  });

  const orderState = (orderQuery.data as { state?: string } | undefined)?.state;
  const awaitingQuotes = orderState === "created" || orderState === "awaiting_payment";
  const offersPollMs = useMemo(() => (awaitingQuotes ? 4_000 : 15_000), [awaitingQuotes]);

  const offersQuery = useQuery({
    queryKey: ["/api/orders", orderId, "offers"],
    enabled: visible && !!orderId,
    queryFn: async () => fetchOrderOffers(orderId!),
    staleTime: 0,
    retry: 2,
    refetchInterval: offersPollMs,
  });

  useEffect(() => {
    if (!visible || !orderId) return;
    void queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
  }, [visible, orderId, queryClient]);

  useEffect(() => {
    if (!visible || !orderId || !orderQuery.data) return;
    const st = String((orderQuery.data as { state?: string }).state ?? "");
    if (st === "created" || st === "awaiting_payment") {
      void queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
    }
  }, [visible, orderId, orderQuery.data, orderQuery.dataUpdatedAt, queryClient]);

  const acceptMutation = useMutation({
    mutationFn: async (offerId: string) => {
      await apiClient.post(`/api/orders/${orderId}/offers/${offerId}/accept`, {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
    },
  });

  const order = orderQuery.data as
    | {
        state?: string;
        litres?: string | number;
        total_cents?: number;
        created_at?: string;
        fuel_types?: { label?: string };
      }
    | undefined;

  const orderRecord = order as Record<string, unknown> | undefined;
  const assignedDriverId =
    (orderRecord?.assigned_driver_id ?? orderRecord?.assignedDriverId) as string | undefined;
  const dropLatRaw = orderRecord?.drop_lat ?? orderRecord?.dropLat;
  const dropLngRaw = orderRecord?.drop_lng ?? orderRecord?.dropLng;
  const dropLat = dropLatRaw != null ? Number(dropLatRaw) : NaN;
  const dropLng = dropLngRaw != null ? Number(dropLngRaw) : NaN;
  const showTrackingMap =
    Boolean(assignedDriverId) &&
    ["assigned", "en_route", "picked_up"].includes(String(order?.state ?? "")) &&
    Number.isFinite(dropLat) &&
    Number.isFinite(dropLng);

  const sortedOffers = [...(offersQuery.data ?? [])].sort((a, b) => {
    const aDistance = a.estimatedPricing?.distanceKm;
    const bDistance = b.estimatedPricing?.distanceKm;
    const aHasDistance = aDistance != null && Number.isFinite(aDistance);
    const bHasDistance = bDistance != null && Number.isFinite(bDistance);
    if (aHasDistance && bHasDistance) return (aDistance ?? 0) - (bDistance ?? 0);
    if (aHasDistance) return -1;
    if (bHasDistance) return 1;
    return 0;
  });

  return (
    <Modal
      visible={visible && !!orderId}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      <ModalSafeArea style={[styles.modalSafe, { backgroundColor: theme.colors.background }]}>
        <KeyboardAvoidingView
          style={styles.flexFill}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <ModalScreenHeader title="Order details" onClose={onDismiss} />
          {orderQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : orderQuery.isError || !order ? (
            <Text style={styles.center}>Could not load this order.</Text>
          ) : (
            <View style={styles.flexFill}>
              <ScrollView
                style={styles.bodyScroll}
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets
                refreshControl={
                  <RefreshControl
                    refreshing={orderQuery.isFetching || offersQuery.isFetching}
                    onRefresh={() => {
                      void queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
                      void queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "offers"] });
                    }}
                  />
                }
              >
            <Card mode="outlined" style={styles.card}>
              <Card.Content>
                <View style={styles.rowBetween}>
                  <Text variant="titleMedium">{order.fuel_types?.label ?? "Fuel"}</Text>
                  <Chip>{formatOrderState(order.state)}</Chip>
                </View>
                <Text style={styles.meta}>
                  {order.litres != null ? `${order.litres} L` : ""} · {formatMoneyFromCents(order.total_cents ?? 0)}
                </Text>
                <Text style={styles.meta}>{formatCustomerOrderAddress(order as any)}</Text>
                <Text style={styles.meta}>
                  {order.created_at ? new Date(order.created_at).toLocaleString("en-ZA") : ""}
                </Text>
                {order.state === "delivered" ? (
                  <DeliverySignatureDisplay order={order as Record<string, unknown>} />
                ) : null}
              </Card.Content>
            </Card>

            {showTrackingMap && orderId ? (
              <OrderDriverLocationMap orderId={orderId} deliveryLat={dropLat} deliveryLng={dropLng} />
            ) : null}

            <View style={styles.offersHeaderRow}>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                Driver offers ({sortedOffers.length})
              </Text>
              <Button mode="outlined" compact onPress={() => void offersQuery.refetch()}>
                Refresh
              </Button>
            </View>
            {offersQuery.isError ? (
              <Text style={styles.error}>
                {(offersQuery.error as Error)?.message || "Could not load offers."}
              </Text>
            ) : offersQuery.isFetching && sortedOffers.length === 0 ? (
              <ActivityIndicator style={styles.offersLoading} />
            ) : sortedOffers.length === 0 ? (
              <Text style={styles.meta}>
                No quotes yet. Eligible drivers need active pricing for this fuel type. Pull down to refresh.
              </Text>
            ) : (
              sortedOffers.map((offer) => (
                <Card key={offer.id} mode="outlined" style={styles.card}>
                  <Card.Content>
                    <Text variant="titleSmall">{offer.driver?.profile?.fullName ?? "Driver"}</Text>
                    <Text style={styles.meta}>
                      {offer.estimatedPricing?.total != null
                        ? `Est. total ${formatMoneyAmount(offer.estimatedPricing.total)}`
                        : "Quote pending"}
                    </Text>
                    <Text style={styles.meta}>
                      Distance:{" "}
                      {offer.estimatedPricing?.distanceKm != null && Number.isFinite(offer.estimatedPricing.distanceKm)
                        ? `${offer.estimatedPricing.distanceKm.toFixed(1)} km away`
                        : "Not available"}
                    </Text>
                    <Text style={styles.meta}>Status: {formatOfferState(offer.state)}</Text>
                    {offer.state === "pending_customer" || offer.state === "offered" ? (
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        style={styles.mt}
                        onPress={() => acceptMutation.mutate(offer.id)}
                        loading={acceptMutation.isPending}
                      >
                        Accept offer
                      </Button>
                    ) : null}
                  </Card.Content>
                </Card>
              ))
            )}
            {acceptMutation.isError ? (
              <Text style={styles.error}>{(acceptMutation.error as Error).message}</Text>
            ) : null}

            <Divider style={styles.divider} />
              </ScrollView>
              <View style={[styles.chatDock, { paddingBottom: footerPaddingBottom }]}>
                <OrderChatPanel
                  orderId={orderId!}
                  viewerRole="customer"
                  orderDetailLayout
                  maxChatHeight={chatMaxHeight}
                  readOnly={["delivered", "cancelled", "refunded"].includes(orderState ?? "")}
                />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </ModalSafeArea>
    </Modal>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    modalSafe: { flex: 1 },
    flexFill: { flex: 1, minHeight: 0 },
    chatDock: {
      flexShrink: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outline,
      paddingHorizontal: 14,
      paddingTop: 6,
      backgroundColor: theme.colors.surface,
    },
    bodyScroll: { flex: 1, minHeight: 0 },
    scroll: { padding: 14, paddingBottom: 16, gap: 10 },
    offersHeaderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginTop: 4,
    },
    center: { ...p.center, padding: 24 },
    card: p.listCard,
    rowBetween: p.rowBetween,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    sectionTitle: { marginTop: 8, fontWeight: "600" },
    mt: { marginTop: 10, borderRadius: buttonBorderRadius },
    divider: { marginVertical: 12 },
    error: p.errorText,
    offersLoading: { marginVertical: 12 },
  });
};
