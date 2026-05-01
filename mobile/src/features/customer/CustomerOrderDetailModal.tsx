import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Chip, Divider, Text } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { OrderChatPanel } from "@/features/chat/OrderChatPanel";
import { formatCustomerOrderAddress } from "@/features/customer/customerOrderUtils";

type Offer = {
  id: string;
  state?: string;
  driver?: {
    profile?: { fullName?: string; phone?: string } | null;
  } | null;
  estimatedPricing?: { total?: number; fuelCost?: number; deliveryFee?: number; distanceKm?: number };
};

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
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ["/api/orders", orderId],
    enabled: visible && !!orderId,
    queryFn: async () => (await apiClient.get(`/api/orders/${orderId}`)).data,
    refetchInterval: 15_000,
  });

  const offersQuery = useQuery({
    queryKey: ["/api/orders", orderId, "offers"],
    enabled: visible && !!orderId,
    queryFn: async () => (await apiClient.get<Offer[]>(`/api/orders/${orderId}/offers`)).data ?? [],
    refetchInterval: 15_000,
  });

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
    <Modal visible={visible && !!orderId} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="titleLarge">Order details</Text>
          <Button onPress={onDismiss}>Close</Button>
        </View>
        {orderQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : orderQuery.isError || !order ? (
          <Text style={styles.center}>Could not load this order.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.rowBetween}>
                  <Text variant="titleMedium">{order.fuel_types?.label ?? "Fuel"}</Text>
                  <Chip>{order.state ?? ""}</Chip>
                </View>
                <Text style={styles.meta}>
                  {order.litres != null ? `${order.litres} L` : ""} · R {((order.total_cents ?? 0) / 100).toFixed(2)}
                </Text>
                <Text style={styles.meta}>{formatCustomerOrderAddress(order as any)}</Text>
                <Text style={styles.meta}>
                  {order.created_at ? new Date(order.created_at).toLocaleString("en-ZA") : ""}
                </Text>
              </Card.Content>
            </Card>

            <Text variant="titleSmall" style={styles.sectionTitle}>
              Driver offers
            </Text>
            {sortedOffers.length === 0 ? (
              <Text style={styles.meta}>No offers yet. Drivers will appear here when available.</Text>
            ) : (
              sortedOffers.map((offer) => (
                <Card key={offer.id} style={styles.card}>
                  <Card.Content>
                    <Text variant="titleSmall">{offer.driver?.profile?.fullName ?? "Driver"}</Text>
                    <Text style={styles.meta}>
                      {offer.estimatedPricing?.total != null
                        ? `Est. total R ${offer.estimatedPricing.total.toFixed(2)}`
                        : "Quote pending"}
                    </Text>
                    <Text style={styles.meta}>
                      Distance:{" "}
                      {offer.estimatedPricing?.distanceKm != null && Number.isFinite(offer.estimatedPricing.distanceKm)
                        ? `${offer.estimatedPricing.distanceKm.toFixed(1)} km away`
                        : "Not available"}
                    </Text>
                    <Text style={styles.meta}>Status: {offer.state ?? ""}</Text>
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
            <OrderChatPanel orderId={orderId!} viewerRole="customer" />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    scroll: { padding: 14, paddingBottom: 40, gap: 10 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    card: { backgroundColor: theme.colors.surface },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    sectionTitle: { marginTop: 8 },
    mt: { marginTop: 10 },
    divider: { marginVertical: 12 },
    error: { color: theme.colors.error },
  });
