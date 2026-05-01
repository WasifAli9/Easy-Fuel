import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Chip, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

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
    <FlatList
      style={{ flex: 1 }}
      data={orders}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.muted}>No driver depot orders yet.</Text>}
      renderItem={({ item }) => (
        <Card style={styles.card}>
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
          </Card.Content>
        </Card>
      )}
    />
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    center: { padding: 24, alignItems: "center" },
    list: { gap: 10, paddingBottom: 24 },
    card: { backgroundColor: theme.colors.surface },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    input: { marginTop: 8, backgroundColor: theme.colors.surface },
    muted: { textAlign: "center", color: theme.colors.onSurfaceVariant },
  });
