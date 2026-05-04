import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  SegmentedButtons,
  Text,
  TextInput,
} from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useUiOverlayStore } from "@/store/ui-overlay-store";
import { OrderChatPanel } from "@/features/chat/OrderChatPanel";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Signature from "react-native-signature-canvas";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type DriverOrder = {
  id: string;
  state: "assigned" | "en_route" | "picked_up" | "delivered" | string;
  litres?: number;
  total_cents?: number;
  fuel_types?: { label?: string };
  delivery_addresses?: {
    address_street?: string;
    address_city?: string;
    address_province?: string;
  };
  customers?: {
    company_name?: string;
    profiles?: { full_name?: string; phone?: string };
  };
};

function formatAmount(cents?: number) {
  const value = Number(cents ?? 0) / 100;
  return `R ${value.toFixed(2)}`;
}

function deliveryAddress(order: DriverOrder) {
  const d = order.delivery_addresses;
  return [d?.address_street, d?.address_city, d?.address_province].filter(Boolean).join(", ") || "Address not specified";
}

function customerName(order: DriverOrder) {
  return order.customers?.profiles?.full_name || order.customers?.company_name || "Customer";
}

function stateLabel(state: string) {
  return state.replace("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function DriverOrdersScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [segment, setSegment] = useState<"assigned" | "history">("assigned");
  const [selectedOrder, setSelectedOrder] = useState<DriverOrder | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [pendingCompleteOrderId, setPendingCompleteOrderId] = useState<string | null>(null);
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const signatureRef = useRef<any>(null);
  const queryClient = useQueryClient();
  const setHideDriverHeader = useUiOverlayStore((state) => state.setHideDriverHeader);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setHideDriverHeader(!!selectedOrder);
    return () => setHideDriverHeader(false);
  }, [selectedOrder, setHideDriverHeader]);

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

  const loading = segment === "assigned" ? assignedQuery.isLoading : completedQuery.isLoading;
  const isError = segment === "assigned" ? assignedQuery.isError : completedQuery.isError;

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.headerCard}>
        <Card.Content>
          <View style={styles.brandRow}>
            <View style={styles.brandPill}>
              <MaterialCommunityIcons name="gas-station" size={16} color={theme.colors.primary} />
              <Text style={styles.brandPillText}>EasyFuel</Text>
            </View>
          </View>
          <Text variant="headlineSmall">Driver Orders</Text>
          <Text style={styles.headerSubtitle}>Open orders, update status, and chat with customers.</Text>
          <SegmentedButtons
            value={segment}
            onValueChange={(val) => setSegment(val as "assigned" | "history")}
            style={styles.segment}
            buttons={[
              { value: "assigned", label: "Active Orders" },
              { value: "history", label: "Completed" },
            ]}
          />
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
                  <Text variant="titleMedium">
                    {(item.fuel_types?.label || "Fuel")} - {item.litres ?? 0}L
                  </Text>
                  <Chip compact>{stateLabel(item.state)}</Chip>
                </View>
                <Text style={styles.orderMeta}>Order #{item.id.slice(-8)}</Text>
                <Text style={styles.orderMeta}>Customer: {customerName(item)}</Text>
                <Text style={styles.orderMeta}>Address: {deliveryAddress(item)}</Text>
                <Text style={styles.orderAmount}>{formatAmount(item.total_cents)}</Text>
                <Button
                  mode="contained"
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
                  Open Order
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
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 10) }]}>
            <Text variant="titleLarge">Order Details</Text>
            <Button onPress={() => setSelectedOrder(null)}>Close</Button>
          </View>
          {selectedOrder ? (
            <View style={styles.modalContent}>
              <View style={styles.detailCard}>
                <Text variant="titleMedium">
                  {(selectedOrder.fuel_types?.label || "Fuel")} - {selectedOrder.litres ?? 0}L
                </Text>
                <Text>Order #{selectedOrder.id.slice(-8)}</Text>
                <Text>State: {stateLabel(selectedOrder.state)}</Text>
                <Text>Customer: {customerName(selectedOrder)}</Text>
                <Text>Contact: {selectedOrder.customers?.profiles?.phone || "N/A"}</Text>
                <Text>Address: {deliveryAddress(selectedOrder)}</Text>
                <Text>Amount: {formatAmount(selectedOrder.total_cents)}</Text>
                <Divider style={styles.divider} />
                <View style={styles.actionRow}>
                  {selectedOrder.state === "assigned" ? (
                    <Button
                      mode="contained"
                      buttonColor={theme.colors.primary}
                      textColor={theme.colors.onPrimary}
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
                      onPress={() => statusMutation.mutate({ action: "pickup", orderId: selectedOrder.id })}
                      loading={statusMutation.isPending}
                    >
                      Mark Picked Up
                    </Button>
                  ) : null}
                  {selectedOrder.state === "picked_up" ? (
                    <>
                      <TextInput
                        mode="outlined"
                        label="Signature Name"
                        value={signatureName}
                        onChangeText={setSignatureName}
                        style={styles.signatureInput}
                      />
                      <Text style={styles.signatureLabel}>Customer Signature *</Text>
                      <View style={styles.signatureCanvas}>
                        <Signature
                          key={`sig-pad-${signaturePadKey}`}
                          ref={signatureRef}
                          onOK={(sig) => setSignatureData(sig)}
                          onEmpty={() => setSignatureData(null)}
                          onClear={() => {
                            setSignatureData(null);
                            setHasDrawnSignature(false);
                          }}
                          onEnd={() => setHasDrawnSignature(true)}
                          webStyle={`
                            .m-signature-pad { box-shadow: none; border: none; }
                            .m-signature-pad--footer { display: none; margin: 0; }
                            body, html { width: 100%; height: 100%; }
                            canvas { border: none; }
                          `}
                          autoClear={false}
                          imageType="image/png"
                          descriptionText=""
                        />
                      </View>
                      <Button
                        mode="outlined"
                        onPress={() => {
                          setSignatureData(null);
                          setHasDrawnSignature(false);
                          setPendingCompleteOrderId(null);
                          setSignaturePadKey((k) => k + 1);
                        }}
                      >
                        Clear Signature
                      </Button>
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => {
                          if (!selectedOrder?.id) return;
                          setPendingCompleteOrderId(selectedOrder.id);
                          signatureRef.current?.readSignature?.();
                        }}
                        loading={statusMutation.isPending}
                        disabled={statusMutation.isPending || !hasDrawnSignature}
                      >
                        Complete Delivery
                      </Button>
                    </>
                  ) : null}
                </View>
                <Divider style={styles.divider} />
                <Button
                  mode="contained"
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  onPress={() => setChatVisible((prev) => !prev)}
                >
                  {chatVisible ? "Hide Chat" : "Open Chat"}
                </Button>
                {chatVisible ? (
                  <View style={styles.chatSection}>
                    <OrderChatPanel orderId={selectedOrder.id} viewerRole="driver" />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 14,
  },
  headerCard: {
    ...p.hero,
    marginBottom: 10,
  },
  brandRow: p.brandRow,
  brandPill: p.brandPill,
  brandPillText: p.brandPillText,
  headerSubtitle: {
    marginTop: 6,
    color: theme.colors.onSurfaceVariant,
  },
  segment: {
    marginTop: 12,
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
  divider: {
    marginVertical: 8,
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
  signatureCanvas: {
    height: 180,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: theme.colors.primary,
    backgroundColor: "#FFFFFF",
    position: "relative",
    overflow: "hidden",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  modalContent: {
    padding: 14,
    flex: 1,
  },
  detailCard: {
    ...p.sectionCard,
    padding: 12,
    flex: 1,
  },
  chatSection: {
    marginTop: 10,
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.outline,
    borderRadius: 14,
    padding: 12,
    backgroundColor: theme.colors.background,
  },
  });
};
