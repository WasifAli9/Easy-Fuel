import { useEffect, useMemo, useState } from "react";
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
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useUiOverlayStore } from "@/store/ui-overlay-store";

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

type ChatThread = { id: string };
type ChatMessage = {
  id: string;
  senderType: "customer" | "driver";
  senderName?: string;
  message: string;
  createdAt: string;
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

function OrderChat({ orderId }: { orderId: string }) {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [messageText, setMessageText] = useState("");
  const queryClient = useQueryClient();

  const threadQuery = useQuery({
    queryKey: ["/api/chat/thread", orderId],
    queryFn: async () => {
      const { data } = await apiClient.get<ChatThread>(`/api/chat/thread/${orderId}`);
      return data;
    },
    refetchInterval: 10_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["/api/chat/messages", threadQuery.data?.id],
    enabled: !!threadQuery.data?.id,
    queryFn: async () => {
      const { data } = await apiClient.get<ChatMessage[]>(`/api/chat/messages/${threadQuery.data?.id}`);
      return data;
    },
    refetchInterval: 5_000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!threadQuery.data?.id || !messageText.trim()) return;
      await apiClient.post("/api/chat/messages", {
        threadId: threadQuery.data.id,
        message: messageText.trim(),
        messageType: "text",
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", threadQuery.data?.id] });
    },
  });

  if (threadQuery.isLoading || messagesQuery.isLoading) {
    return (
      <View style={styles.chatLoading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (threadQuery.isError) {
    return <Text style={styles.chatError}>Chat is not available for this order yet.</Text>;
  }

  return (
    <View style={styles.chatWrap}>
      <Text variant="titleSmall" style={styles.chatTitle}>
        Messages
      </Text>
      <FlatList
        data={messagesQuery.data ?? []}
        keyExtractor={(item) => item.id}
        style={styles.chatList}
        contentContainerStyle={styles.chatListContent}
        nestedScrollEnabled
        ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet.</Text>}
        renderItem={({ item }) => {
          const own = item.senderType === "driver";
          return (
            <View style={[styles.messageRow, own ? styles.messageRowOwn : null]}>
              <Text style={styles.messageMeta}>
                {own ? "You" : item.senderName || "Customer"}{" "}
                {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={[styles.messageBubble, own ? styles.messageBubbleOwn : null]}>{item.message}</Text>
            </View>
          );
        }}
      />
      <View style={styles.chatInputRow}>
        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={messageText}
          onChangeText={setMessageText}
          style={styles.chatInput}
        />
        <Button
          mode="contained"
          onPress={() => sendMessageMutation.mutate()}
          loading={sendMessageMutation.isPending}
          disabled={!messageText.trim() || sendMessageMutation.isPending}
        >
          Send
        </Button>
      </View>
    </View>
  );
}

export function DriverOrdersScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [segment, setSegment] = useState<"assigned" | "history">("assigned");
  const [selectedOrder, setSelectedOrder] = useState<DriverOrder | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const queryClient = useQueryClient();
  const setHideDriverHeader = useUiOverlayStore((state) => state.setHideDriverHeader);

  useEffect(() => {
    setHideDriverHeader(!!selectedOrder);
    return () => setHideDriverHeader(false);
  }, [selectedOrder, setHideDriverHeader]);

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
        return apiClient.post(`/api/driver/orders/${orderId}/complete`, {
          signatureData: `mobile-signature-${Date.now()}-${signatureName || "driver"}`,
          signatureName: signatureName || "Driver",
        });
      }
      return apiClient.post(`/api/driver/orders/${orderId}/${action}`);
    },
    onSuccess: async () => {
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
      <Card style={styles.headerCard}>
        <Card.Content>
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
            <Card style={styles.orderCard}>
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
        statusBarTranslucent
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
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
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => statusMutation.mutate({ action: "complete", orderId: selectedOrder.id })}
                        loading={statusMutation.isPending}
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
                    <OrderChat orderId={selectedOrder.id} />
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

const getStyles = (theme: typeof lightTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 14,
  },
  headerCard: {
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
  },
  headerSubtitle: {
    marginTop: 6,
    color: theme.colors.onSurfaceVariant,
  },
  segment: {
    marginTop: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    gap: 10,
    paddingBottom: 28,
  },
  emptyText: {
    textAlign: "center",
    color: theme.colors.onSurfaceVariant,
    marginTop: 20,
  },
  orderCard: {
    backgroundColor: theme.colors.surface,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
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
  divider: {
    marginVertical: 8,
  },
  actionRow: {
    gap: 8,
  },
  signatureInput: {
    backgroundColor: theme.colors.surface,
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  modalContent: {
    padding: 14,
    flex: 1,
  },
  detailCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    flex: 1,
  },
  chatSection: {
    marginTop: 10,
    flex: 1,
  },
  chatWrap: {
    gap: 8,
    flex: 1,
  },
  chatTitle: {
    marginTop: 2,
  },
  chatLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  chatError: {
    color: theme.colors.onSurfaceVariant,
  },
  chatList: {
    maxHeight: 420,
    minHeight: 220,
    borderRadius: 8,
    overflow: "hidden",
  },
  chatListContent: {
    gap: 8,
    paddingBottom: 8,
  },
  chatEmpty: {
    color: theme.colors.onSurfaceVariant,
  },
  messageRow: {
    gap: 4,
  },
  messageRowOwn: {
    alignItems: "flex-end",
  },
  messageMeta: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  messageBubble: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    maxWidth: "92%",
  },
  messageBubbleOwn: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.onPrimary,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
});
