import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Card, Chip, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme, paperMd3ControlRoundness } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useUiOverlayStore } from "@/store/ui-overlay-store";
import { useNotificationDeepLinkStore } from "@/store/notification-deep-link-store";
import { OrderChatPanel } from "@/features/chat/OrderChatPanel";
import { formatCustomerOrderAddress } from "@/features/customer/customerOrderUtils";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { useModalLayout } from "@/components/modal-layout";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { IconMetaRow } from "@/components/IconMetaRow";
import { DeliverySignatureDisplay } from "@/components/DeliverySignatureDisplay";
import { SignatureCapturePad, type SignatureCapturePadRef } from "@/components/SignatureCapturePad";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { formatOrderIdShort, formatOrderState } from "@/lib/format-labels";

type DriverOrder = {
  id: string;
  state: "assigned" | "en_route" | "picked_up" | "delivered" | string;
  litres?: number;
  total_cents?: number;
  fuel_types?: { label?: string };
  /** Set when customer picks a saved address; otherwise use drop coordinates. */
  delivery_addresses?: {
    address_street?: string;
    address_city?: string;
    address_province?: string;
  } | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
  customers?: {
    company_name?: string;
    profiles?: { full_name?: string; phone?: string };
  };
  delivery_signature_data?: string | null;
  delivery_signature_name?: string | null;
  delivery_signed_at?: string | null;
  delivered_at?: string | null;
};

function deliveryAddressLine(order: DriverOrder) {
  return formatCustomerOrderAddress(order);
}

function customerName(order: DriverOrder) {
  return order.customers?.profiles?.full_name || order.customers?.company_name || "Customer";
}

function orderDetailShortId(id: string) {
  return formatOrderIdShort(id);
}

export function DriverOrdersScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const styles = getStyles(theme);
  const { chatMaxHeight, footerPaddingBottom } = useModalLayout();
  const [segment, setSegment] = useState<"assigned" | "history">("assigned");
  const [selectedOrder, setSelectedOrder] = useState<DriverOrder | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [pendingCompleteOrderId, setPendingCompleteOrderId] = useState<string | null>(null);
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const [signatureScrollLocked, setSignatureScrollLocked] = useState(false);
  const signatureRef = useRef<SignatureCapturePadRef>(null);
  const orderModalScrollRef = useRef<ScrollView>(null);
  const queryClient = useQueryClient();
  const setHideDriverHeader = useUiOverlayStore((state) => state.setHideDriverHeader);

  useEffect(() => {
    setHideDriverHeader(!!selectedOrder);
    return () => setHideDriverHeader(false);
  }, [selectedOrder, setHideDriverHeader]);

  useEffect(() => {
    if (!selectedOrder || selectedOrder.state !== "picked_up") {
      setSignatureScrollLocked(false);
    }
    if (selectedOrder?.state === "delivered") {
      setChatVisible(false);
    }
  }, [selectedOrder?.id, selectedOrder?.state]);

  const consumeDeepLink = useNotificationDeepLinkStore((s) => s.consume);

  useEffect(() => {
    if (!pendingCompleteOrderId || !signatureData) return;
    statusMutation.mutate({ action: "complete", orderId: pendingCompleteOrderId });
    setPendingCompleteOrderId(null);
  }, [pendingCompleteOrderId, signatureData]);

  const assignedQuery = useQuery({
    queryKey: ["/api/driver/assigned-orders"],
    queryFn: async () => (await apiClient.get<DriverOrder[]>("/api/driver/assigned-orders")).data,
    staleTime: 20_000,
  });
  const completedQuery = useQuery({
    queryKey: ["/api/driver/completed-orders"],
    queryFn: async () => (await apiClient.get<DriverOrder[]>("/api/driver/completed-orders")).data,
    staleTime: 20_000,
  });

  useEffect(() => {
    const link = useNotificationDeepLinkStore.getState().pending;
    if (!link?.orderId) return;

    const all = [...(assignedQuery.data ?? []), ...(completedQuery.data ?? [])];
    const match = all.find((o) => o.id === link.orderId);
    if (!match) return;

    const consumed = consumeDeepLink();
    if (!consumed?.orderId) return;

    setSelectedOrder(match);
    if (consumed.openChat) {
      setChatVisible(true);
    }
  }, [assignedQuery.data, completedQuery.data, consumeDeepLink]);

  const statusMutation = useMutation({
    mutationFn: async ({ action, orderId }: { action: "start" | "pickup" | "complete"; orderId: string }) => {
      if (action === "complete") {
        return (
          await apiClient.post(`/api/driver/orders/${orderId}/complete`, {
            signatureData: signatureData || `mobile-signature-${Date.now()}-${signatureName || "driver"}`,
            signatureName: signatureName || "Driver",
          })
        ).data as DriverOrder;
      }
      return (await apiClient.post(`/api/driver/orders/${orderId}/${action}`)).data as DriverOrder;
    },
    onSuccess: async (updatedOrder, variables) => {
      setSelectedOrder((prev) => {
        if (!prev || prev.id !== variables.orderId) return prev;
        const nextState = (updatedOrder as any)?.state || prev.state;
        return { ...prev, ...(updatedOrder as any), state: nextState };
      });

      const nextState = (updatedOrder as any)?.state;
      if (nextState === "delivered") {
        setSignatureData(null);
        setHasDrawnSignature(false);
        setPendingCompleteOrderId(null);
        setSignaturePadKey((k) => k + 1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/driver/assigned-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/completed-orders"] }),
      ]);
    },
  });

  const data = useMemo(
    () => (segment === "assigned" ? assignedQuery.data ?? [] : completedQuery.data ?? []),
    [segment, assignedQuery.data, completedQuery.data],
  );
  const assignedCount = assignedQuery.data?.length ?? 0;
  const completedCount = completedQuery.data?.length ?? 0;

  const loading = segment === "assigned" ? assignedQuery.isLoading : completedQuery.isLoading;
  const isError = segment === "assigned" ? assignedQuery.isError : completedQuery.isError;

  return (
    <View style={styles.container}>
      <View style={styles.heroOuter}>
        <View style={[styles.hero, { backgroundColor: t.heroBg }]}>
          <View style={styles.heroBlob} />
          <Text style={styles.kicker}>Workspace dashboard</Text>
          <Text style={styles.heroTitle}>Driver workspace</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badgeFill, { backgroundColor: t.badgeActiveTint }]}>
              <Text style={[styles.badgeFillText, { color: t.badgeActiveText }]}>ACTIVE</Text>
            </View>
            <View style={styles.badgeOutline}>
              <Text style={styles.badgeOutlineText}>DELIVERIES</Text>
            </View>
          </View>
          <View style={styles.statsRowHero}>
            <View style={styles.statCol}>
              <View style={styles.statLabelRow}>
                <MaterialCommunityIcons name="truck-delivery-outline" size={16} color={t.badgeActiveText} />
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <Text style={styles.statValue}>{assignedCount}</Text>
            </View>
            <View style={styles.statCol}>
              <View style={styles.statLabelRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={t.badgeActiveText} />
                <Text style={styles.statLabel}>Done</Text>
              </View>
              <Text style={styles.statValue}>{completedCount}</Text>
            </View>
          </View>
        </View>
      </View>
      <Card mode="contained" style={styles.headerCard}>
        <Card.Content>
          <SegmentedButtons
            theme={{ roundness: paperMd3ControlRoundness }}
            value={segment}
            onValueChange={(val) => setSegment(val as "assigned" | "history")}
            style={styles.segment}
            buttons={[
              { value: "assigned", label: "Active", icon: "truck-delivery-outline" },
              { value: "history", label: "Done", icon: "history" },
            ]}
          />
          <Text style={styles.headerSubtitle}>Open orders, update status, and chat with customers.</Text>
        </Card.Content>
      </Card>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text>Could not load driver orders.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No orders found.</Text>}
          renderItem={({ item }) => (
            <Card mode="outlined" style={styles.orderCard}>
              <Card.Content>
                <View style={styles.rowBetween}>
                  <View style={styles.orderTitleRow}>
                    <MaterialCommunityIcons name="fuel" size={20} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={styles.orderTitleText}>
                      {(item.fuel_types?.label || "Fuel")} · {item.litres ?? 0}L
                    </Text>
                  </View>
                  <Chip compact icon={item.state === "delivered" ? "check" : "progress-clock"}>
                    {formatOrderState(item.state)}
                  </Chip>
                </View>
                <IconMetaRow icon="identifier" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  #{item.id.slice(-8)}
                </IconMetaRow>
                <IconMetaRow icon="account-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {customerName(item)}
                </IconMetaRow>
                <IconMetaRow icon="map-marker-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {deliveryAddressLine(item)}
                </IconMetaRow>
                <IconMetaRow icon="cash" color={theme.colors.onSurface} iconColor={theme.colors.primary} style={styles.orderAmountRow}>
                  {formatMoneyFromCents(item.total_cents ?? 0)}
                </IconMetaRow>
                <Button
                  mode="contained"
                  compact
                  icon="clipboard-text-outline"
                  style={styles.openButton}
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  onPress={() => {
                    setSelectedOrder(item);
                    setChatVisible(false);
                    setSignatureData(null);
                    setHasDrawnSignature(false);
                    setPendingCompleteOrderId(null);
                    setSignaturePadKey((k) => k + 1);
                  }}
                >
                  Open
                </Button>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <Modal
        visible={!!selectedOrder}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <ModalSafeArea style={styles.modalContainer}>
          {selectedOrder ? (
            <>
              <ModalScreenHeader title="Order Details" onClose={() => setSelectedOrder(null)} />
              <KeyboardAvoidingView
                style={styles.modalKeyboardWrap}
                behavior={
                  selectedOrder.state === "picked_up"
                    ? undefined
                    : Platform.OS === "ios"
                      ? "padding"
                      : "height"
                }
                keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
              >
                <View style={styles.modalBodySplit}>
                  <ScrollView
                    ref={orderModalScrollRef}
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={selectedOrder.state === "picked_up" ? "none" : "on-drag"}
                    automaticallyAdjustKeyboardInsets={selectedOrder.state !== "picked_up"}
                    scrollEnabled={!signatureScrollLocked}
                    showsVerticalScrollIndicator={false}
                  >
                <View style={[styles.statusPill, { backgroundColor: theme.colors.primaryContainer }]}>
                  <View style={[styles.statusDot, { backgroundColor: theme.colors.primary }]} />
                  <Text style={[styles.statusPillText, { color: theme.colors.primary }]}>
                    {formatOrderState(selectedOrder.state)}
                  </Text>
                </View>

                <View style={[styles.infoCard, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface }]}>
                  <View style={styles.infoTopRow}>
                    <View style={styles.infoCol}>
                      <Text style={styles.fieldCaps}>Order ID</Text>
                      <Text style={styles.orderIdText}>#{orderDetailShortId(selectedOrder.id)}</Text>
                    </View>
                    <View style={[styles.infoCol, styles.infoColRight]}>
                      <Text style={styles.fieldCaps}>Amount</Text>
                      <Text style={[styles.amountText, { color: theme.colors.primary }]}>
                        {formatMoneyFromCents(selectedOrder.total_cents ?? 0)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={[styles.detailIconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <MaterialCommunityIcons name="flask-outline" size={20} color={theme.colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailFieldLabel}>Fuel Type</Text>
                      <Text style={styles.detailFieldValue}>
                        {(selectedOrder.fuel_types?.label || "Fuel")} - {selectedOrder.litres ?? 0}L
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={[styles.detailIconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <MaterialCommunityIcons name="account-outline" size={20} color={theme.colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailFieldLabel}>Customer</Text>
                      <Text style={styles.detailFieldValue}>
                        {customerName(selectedOrder)} ({selectedOrder.customers?.profiles?.phone?.trim() || "N/A"})
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={[styles.detailIconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <MaterialCommunityIcons name="map-marker-outline" size={20} color={theme.colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailFieldLabel}>Delivery Address</Text>
                      <Text
                        style={[
                          styles.detailFieldValue,
                          deliveryAddressLine(selectedOrder) === "Address not set" ? styles.detailItalic : null,
                        ]}
                      >
                        {deliveryAddressLine(selectedOrder) === "Address not set"
                          ? "*Address not set*"
                          : deliveryAddressLine(selectedOrder)}
                      </Text>
                    </View>
                  </View>
                </View>

                {selectedOrder.state === "delivered" ? (
                  <DeliverySignatureDisplay order={selectedOrder} />
                ) : null}

                <View style={styles.modalActions}>
                  {selectedOrder.state === "assigned" ? (
                    <Button
                      mode="contained"
                      buttonColor={theme.colors.primary}
                      textColor={theme.colors.onPrimary}
                      style={styles.primaryFullBtn}
                      contentStyle={styles.primaryFullBtnInner}
                      onPress={() => statusMutation.mutate({ action: "start", orderId: selectedOrder.id })}
                      loading={statusMutation.isPending}
                    >
                      Start Delivery
                    </Button>
                  ) : null}
                  {selectedOrder.state === "en_route" ? (
                    <Button
                      mode="contained"
                      buttonColor={theme.colors.primary}
                      textColor={theme.colors.onPrimary}
                      style={styles.primaryFullBtn}
                      contentStyle={styles.primaryFullBtnInner}
                      onPress={() => statusMutation.mutate({ action: "pickup", orderId: selectedOrder.id })}
                      loading={statusMutation.isPending}
                    >
                      Mark Picked Up
                    </Button>
                  ) : null}
                </View>

                {selectedOrder.state !== "delivered" ? (
                  <Button
                    mode="outlined"
                    style={styles.secondaryFullBtn}
                    textColor={theme.colors.onSurface}
                    theme={{ colors: { outline: theme.colors.outline } }}
                    onPress={() => setChatVisible((prev) => !prev)}
                  >
                    {chatVisible ? "Hide Chat" : "Open Chat"}
                  </Button>
                ) : null}

                  </ScrollView>

                  {selectedOrder.state === "picked_up" ? (
                    <View style={styles.signatureDock}>
                      <Text style={styles.signatureDockTitle}>Customer sign-off</Text>
                      <TextInput
                        mode="outlined"
                        label="Signature Name"
                        value={signatureName}
                        onChangeText={setSignatureName}
                        style={styles.signatureInput}
                      />
                      <Text style={styles.signatureLabel}>Customer Signature *</Text>
                      <SignatureCapturePad
                        ref={signatureRef}
                        padKey={signaturePadKey}
                        style={[styles.signatureCanvas, { borderColor: theme.colors.primary }]}
                        onOK={(sig) => setSignatureData(sig)}
                        onEmpty={() => setSignatureData(null)}
                        onClear={() => {
                          setSignatureData(null);
                          setHasDrawnSignature(false);
                        }}
                        onEnd={() => setHasDrawnSignature(true)}
                        onDrawingStart={() => setSignatureScrollLocked(true)}
                        onDrawingEnd={() => setSignatureScrollLocked(false)}
                      />
                      <Button
                        mode="outlined"
                        style={styles.secondaryFullBtn}
                        onPress={() => {
                          setSignatureData(null);
                          setHasDrawnSignature(false);
                          setPendingCompleteOrderId(null);
                          setSignaturePadKey((k) => k + 1);
                          setSignatureScrollLocked(false);
                        }}
                      >
                        Clear Signature
                      </Button>
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        style={styles.primaryFullBtn}
                        contentStyle={styles.primaryFullBtnInner}
                        onPress={() => {
                          if (!selectedOrder?.id) return;
                          setPendingCompleteOrderId(selectedOrder.id);
                          signatureRef.current?.readSignature();
                        }}
                        loading={statusMutation.isPending}
                        disabled={statusMutation.isPending || !hasDrawnSignature}
                      >
                        Complete Delivery
                      </Button>
                    </View>
                  ) : null}

                  {chatVisible && selectedOrder.state !== "delivered" ? (
                    <View style={[styles.modalChatDock, { paddingBottom: footerPaddingBottom }]}>
                      <OrderChatPanel
                        orderId={selectedOrder.id}
                        viewerRole="driver"
                        orderDetailLayout
                        maxChatHeight={chatMaxHeight}
                      />
                    </View>
                  ) : null}
                </View>
              </KeyboardAvoidingView>
            </>
          ) : null}
        </ModalSafeArea>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const t = getFuelPortalTokens(theme, isDark);
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
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
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  headerCard: {
    ...p.hero,
    marginHorizontal: 14,
    marginBottom: 10,
    borderLeftWidth: 0,
  },
  headerSubtitle: {
    marginTop: 10,
    color: theme.colors.onSurfaceVariant,
  },
  segment: {
    marginTop: 2,
  },
  center: p.center,
  listContent: {
    gap: 10,
    paddingBottom: 28,
  },
  emptyText: {
    ...p.empty,
    marginTop: 20,
  },
  orderCard: p.listCard,
  rowBetween: p.rowBetween,
  orderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  orderTitleText: {
    flex: 1,
  },
  orderAmountRow: {
    marginTop: 6,
  },
  orderMeta: {
    marginTop: 6,
    color: theme.colors.onSurfaceVariant,
  },
  orderAmount: {
    marginTop: 8,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  openButton: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  dialog: {
    maxHeight: "90%",
  },
  dialogContent: {
    gap: 8,
    paddingBottom: 8,
  },
  actionRow: {
    gap: 8,
  },
  signatureInput: {
    backgroundColor: theme.colors.surface,
  },
  signatureLabel: {
    marginTop: 4,
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "600",
  },
  signatureDock: {
    flexShrink: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  signatureDockTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.onSurface,
  },
  signatureCanvas: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  modalKeyboardWrap: {
    flex: 1,
    minHeight: 0,
  },
  modalBodySplit: {
    flex: 1,
    minHeight: 0,
  },
  modalChatDock: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outline,
    paddingHorizontal: 18,
    paddingTop: 8,
    backgroundColor: theme.colors.surface,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 0,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
  },
  infoTopRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  infoCol: {
    flex: 1,
  },
  infoColRight: {
    alignItems: "flex-end",
  },
  fieldCaps: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: theme.colors.onSurfaceVariant,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  orderIdText: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.onSurface,
  },
  amountText: {
    fontSize: 17,
    fontWeight: "800",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginTop: 14,
  },
  detailIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTextCol: {
    flex: 1,
    paddingTop: 2,
  },
  detailFieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.onSurfaceVariant,
    marginBottom: 4,
  },
  detailFieldValue: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.onSurface,
    lineHeight: 21,
  },
  detailItalic: {
    fontStyle: "italic",
    fontWeight: "500",
    color: theme.colors.onSurfaceVariant,
  },
  modalActions: {
    gap: 12,
    marginBottom: 12,
  },
  primaryFullBtn: {
    borderRadius: buttonBorderRadius,
    marginTop: 0,
  },
  primaryFullBtnInner: {
    height: 48,
  },
  secondaryFullBtn: {
    borderRadius: buttonBorderRadius,
    marginTop: 4,
    marginBottom: 8,
  },
  });
};
