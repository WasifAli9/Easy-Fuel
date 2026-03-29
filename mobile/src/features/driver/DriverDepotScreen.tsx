import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  RadioButton,
} from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type DepotPrice = {
  fuel_type_id: string;
  price_cents: number;
  min_litres: number;
  available_litres: number;
  fuel_types?: { label?: string };
};

type Depot = {
  id: string;
  name?: string;
  address_city?: string;
  address_province?: string;
  distance_km?: number;
  depot_prices?: DepotPrice[];
};

type DepotOrder = {
  id: string;
  status: string;
  litres: string;
  total_price_cents: number;
  payment_status?: string;
  depots?: { name?: string };
  fuel_types?: { label?: string };
  pickup_date?: string;
  created_at?: string;
};

export function DriverDepotScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [segment, setSegment] = useState<"orders" | "depots">("orders");
  const [selectedDepot, setSelectedDepot] = useState<Depot | null>(null);
  const [litres, setLitres] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [selectedFuelTypeId, setSelectedFuelTypeId] = useState<string>("");
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<DepotOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "online_payment" | "pay_outside_app" | "">("");
  const [paymentProofUrl, setPaymentProofUrl] = useState<string>("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [paymentError, setPaymentError] = useState<string>("");
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({
    queryKey: ["/api/driver/depot-orders"],
    queryFn: async () => (await apiClient.get<DepotOrder[]>("/api/driver/depot-orders")).data ?? [],
    refetchInterval: 10_000,
  });

  const depotsQuery = useQuery({
    queryKey: ["/api/driver/depots"],
    queryFn: async () => (await apiClient.get<Depot[]>("/api/driver/depots")).data ?? [],
    refetchInterval: 20_000,
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDepot?.id || !selectedFuelTypeId || !litres || !pickupDate) {
        throw new Error("Please complete all order fields.");
      }
      return apiClient.post("/api/driver/depot-orders", {
        depotId: selectedDepot.id,
        fuelTypeId: selectedFuelTypeId,
        litres: Number(litres),
        pickupDate,
      });
    },
    onSuccess: async () => {
      setSelectedDepot(null);
      setLitres("");
      setPickupDate("");
      setSelectedFuelTypeId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/driver/depots"] }),
      ]);
      setSegment("orders");
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => apiClient.post(`/api/driver/depot-orders/${orderId}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] }),
  });

  const submitPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderForPayment?.id) {
        throw new Error("No order selected.");
      }
      if (!paymentMethod) {
        throw new Error("Please select a payment method.");
      }
      if (paymentMethod === "bank_transfer" && !paymentProofUrl) {
        throw new Error("Please upload proof of payment.");
      }
      return apiClient.post(`/api/driver/depot-orders/${selectedOrderForPayment.id}/payment`, {
        paymentMethod,
        paymentProofUrl: paymentProofUrl || undefined,
      });
    },
    onSuccess: async () => {
      setSelectedOrderForPayment(null);
      setPaymentMethod("");
      setPaymentProofUrl("");
      setPaymentError("");
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
    },
    onError: (error) => {
      setPaymentError((error as Error)?.message || "Payment failed.");
    },
  });

  const handleUploadProof = async () => {
    setPaymentError("");
    setUploadingProof(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) {
        return;
      }
      const file = picked.assets[0];
      const uploadMeta = (await apiClient.post("/api/objects/upload")).data as { uploadURL: string; objectPath?: string };
      if (!uploadMeta?.uploadURL) throw new Error("Could not get upload URL.");

      const blob = await (await fetch(file.uri)).blob();
      const uploaded = await fetch(uploadMeta.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.mimeType || "application/octet-stream" },
        body: blob,
      });
      if (!uploaded.ok) throw new Error("Upload failed.");

      // Prefer explicit objectPath; otherwise derive from upload URL.
      let path = uploadMeta.objectPath || "";
      if (!path) {
        const raw = uploadMeta.uploadURL.split("?")[0];
        if (raw.includes("/api/storage/upload/")) {
          const match = raw.match(/\/api\/storage\/upload\/([^/]+)\/(.+)/);
          if (match) path = `${match[1]}/${match[2]}`;
        } else {
          path = raw;
        }
      }
      if (!path) throw new Error("Could not resolve uploaded file path.");
      setPaymentProofUrl(path);
    } catch (error) {
      setPaymentError((error as Error)?.message || "Failed to upload proof.");
    } finally {
      setUploadingProof(false);
    }
  };

  const orderData = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const depotData = useMemo(() => depotsQuery.data ?? [], [depotsQuery.data]);

  return (
    <View style={styles.container}>
      <Card style={styles.headerCard}>
        <Card.Content>
          <Text variant="headlineSmall">Depot</Text>
          <Text style={styles.subtitle}>My depot orders and available depots.</Text>
          <SegmentedButtons
            style={styles.segment}
            value={segment}
            onValueChange={(value) => setSegment(value as "orders" | "depots")}
            buttons={[
              { value: "orders", label: "My Depot Orders" },
              { value: "depots", label: "Available Depots" },
            ]}
          />
        </Card.Content>
      </Card>

      {segment === "orders" ? (
        ordersQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            data={orderData}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>No depot orders yet.</Text>}
            renderItem={({ item }) => (
              <Card style={styles.itemCard}>
                <Card.Content>
                  <View style={styles.rowBetween}>
                    <Text variant="titleMedium">{item.depots?.name || "Depot"}</Text>
                    <Chip compact>{item.status.replace(/_/g, " ")}</Chip>
                  </View>
                  <Text style={styles.meta}>{item.fuel_types?.label || "Fuel"}</Text>
                  <Text style={styles.meta}>Litres: {item.litres}</Text>
                  <Text style={styles.meta}>Date: {item.pickup_date ? new Date(item.pickup_date).toLocaleDateString("en-ZA") : "-"}</Text>
                  <Text style={styles.amount}>R {(Number(item.total_price_cents || 0) / 100).toFixed(2)}</Text>
                  <View style={styles.actionRow}>
                    {item.status === "pending" ? (
                      <Button mode="outlined" onPress={() => cancelOrderMutation.mutate(item.id)} loading={cancelOrderMutation.isPending}>
                        Cancel
                      </Button>
                    ) : null}
                    {item.status === "pending_payment" ? (
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => {
                          setSelectedOrderForPayment(item);
                          setPaymentMethod("");
                          setPaymentProofUrl("");
                          setPaymentError("");
                        }}
                      >
                        Pay Now
                      </Button>
                    ) : null}
                  </View>
                </Card.Content>
              </Card>
            )}
          />
        )
      ) : depotsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={depotData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No depots available.</Text>}
          renderItem={({ item }) => (
            <Card style={styles.itemCard}>
              <Card.Content>
                <Text variant="titleMedium">{item.name || "Depot"}</Text>
                <Text style={styles.meta}>
                  {[item.address_city, item.address_province].filter(Boolean).join(", ") || "Location unavailable"}
                </Text>
                <Text style={styles.meta}>
                  {item.distance_km ? `${item.distance_km.toFixed(1)} km away` : "Distance unavailable"}
                </Text>
                <Button
                  mode="contained"
                  style={styles.orderBtn}
                  buttonColor={theme.colors.primary}
                  textColor={theme.colors.onPrimary}
                  onPress={() => {
                    setSelectedDepot(item);
                    setSelectedFuelTypeId(item.depot_prices?.[0]?.fuel_type_id || "");
                  }}
                >
                  Order From Depot
                </Button>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <Portal>
        <Dialog visible={!!selectedDepot} onDismiss={() => setSelectedDepot(null)} style={styles.dialog}>
          <Dialog.Title>Place Depot Order</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.meta}>{selectedDepot?.name || "Depot"}</Text>
            <TextInput
              mode="outlined"
              label="Fuel Type ID"
              value={selectedFuelTypeId}
              onChangeText={setSelectedFuelTypeId}
              style={styles.input}
            />
            <TextInput mode="outlined" label="Litres" keyboardType="numeric" value={litres} onChangeText={setLitres} style={styles.input} />
            <TextInput
              mode="outlined"
              label="Pickup Date (YYYY-MM-DDTHH:mm)"
              value={pickupDate}
              onChangeText={setPickupDate}
              style={styles.input}
            />
            {selectedDepot?.depot_prices?.length ? (
              <View style={styles.priceHints}>
                <Text variant="labelMedium">Available pricing</Text>
                {selectedDepot.depot_prices.map((p) => (
                  <Text key={`${selectedDepot.id}-${p.fuel_type_id}-${p.min_litres}`} style={styles.meta}>
                    {p.fuel_types?.label || p.fuel_type_id}: R {(p.price_cents / 100).toFixed(2)} / L (min {p.min_litres}L, stock {p.available_litres}L)
                  </Text>
                ))}
              </View>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelectedDepot(null)}>Cancel</Button>
            <Button mode="contained" onPress={() => createOrderMutation.mutate()} loading={createOrderMutation.isPending}>
              Place Order
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={!!selectedOrderForPayment}
          onDismiss={() => setSelectedOrderForPayment(null)}
          style={styles.dialog}
        >
          <Dialog.Title>Pay for Order</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.meta}>Depot: {selectedOrderForPayment?.depots?.name || "Depot"}</Text>
            <Text style={styles.meta}>Fuel: {selectedOrderForPayment?.fuel_types?.label || "-"}</Text>
            <Text style={styles.meta}>Litres: {selectedOrderForPayment?.litres || "-"}</Text>
            <Text style={styles.amount}>
              Total: R {((selectedOrderForPayment?.total_price_cents || 0) / 100).toFixed(2)}
            </Text>

            <View style={styles.paymentOptions}>
              <Text variant="labelLarge">Payment Method</Text>
              <RadioButton.Group onValueChange={(v) => setPaymentMethod(v as any)} value={paymentMethod}>
                <View style={styles.radioRow}>
                  <RadioButton value="bank_transfer" />
                  <Text>Bank Transfer (upload proof)</Text>
                </View>
                <View style={styles.radioRow}>
                  <RadioButton value="online_payment" />
                  <Text>Online Payment</Text>
                </View>
                <View style={styles.radioRow}>
                  <RadioButton value="pay_outside_app" />
                  <Text>Pay Outside App</Text>
                </View>
              </RadioButton.Group>
            </View>

            {paymentMethod === "bank_transfer" ? (
              <View style={styles.bankProofWrap}>
                <Button mode="outlined" onPress={handleUploadProof} loading={uploadingProof}>
                  {paymentProofUrl ? "Reupload Proof" : "Upload Proof of Payment"}
                </Button>
                {paymentProofUrl ? <Text style={styles.meta}>Proof uploaded</Text> : null}
              </View>
            ) : null}

            {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelectedOrderForPayment(null)}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => submitPaymentMutation.mutate()}
              loading={submitPaymentMutation.isPending}
              disabled={
                submitPaymentMutation.isPending ||
                !paymentMethod ||
                (paymentMethod === "bank_transfer" && !paymentProofUrl)
              }
            >
              Submit Payment
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 14 },
  headerCard: { marginBottom: 10, backgroundColor: theme.colors.surface },
  subtitle: { marginTop: 6, color: theme.colors.onSurfaceVariant },
  segment: { marginTop: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { gap: 10, paddingBottom: 20 },
  empty: { textAlign: "center", marginTop: 20, color: theme.colors.onSurfaceVariant },
  itemCard: { backgroundColor: theme.colors.surface },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  meta: { marginTop: 4, color: theme.colors.onSurfaceVariant },
  amount: { marginTop: 6, fontWeight: "700", color: theme.colors.primary },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  orderBtn: { marginTop: 10, alignSelf: "flex-start" },
  dialog: { maxHeight: "90%" },
  input: { marginTop: 8, backgroundColor: theme.colors.surface },
  priceHints: { marginTop: 10, gap: 2 },
  paymentOptions: { marginTop: 12, gap: 4 },
  radioRow: { flexDirection: "row", alignItems: "center" },
  bankProofWrap: { marginTop: 10, gap: 6 },
  errorText: { marginTop: 8, color: "#DC2626" },
});
