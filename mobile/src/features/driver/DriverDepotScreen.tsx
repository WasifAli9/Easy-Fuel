import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
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
import { putFileToUploadUrl } from "@/lib/files";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import Signature from "react-native-signature-canvas";
import { appConfig } from "@/services/config";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

type DepotPrice = {
  fuel_type_id?: string;
  fuelTypeId?: string;
  price_cents?: number;
  priceCents?: number;
  min_litres?: number;
  minLitres?: number;
  available_litres?: number;
  availableLitres?: number;
  fuel_types?: { label?: string };
  fuelTypes?: { label?: string };
};

type Depot = {
  id: string;
  name?: string;
  address_city?: string;
  address_province?: string;
  distance_km?: number;
  depot_prices?: DepotPrice[];
  depotPrices?: DepotPrice[];
};

type DepotOrder = {
  id: string;
  status: string;
  litres: string;
  total_price_cents: number;
  payment_status?: string;
  depots?: { name?: string };
  fuel_types?: { label?: string };
  fuelTypes?: { label?: string };
  pickup_date?: string;
  delivery_signature_url?: string;
  completed_at?: string;
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
  const [pickupDateValue, setPickupDateValue] = useState<Date>(new Date(Date.now() + 60 * 60 * 1000));
  const [showPickupPicker, setShowPickupPicker] = useState(false);
  const [showFuelPickerDialog, setShowFuelPickerDialog] = useState(false);
  const [selectedFuelTypeId, setSelectedFuelTypeId] = useState<string>("");
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<DepotOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "online_payment" | "pay_outside_app" | "">("");
  const [paymentProofUrl, setPaymentProofUrl] = useState<string>("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [paymentError, setPaymentError] = useState<string>("");
  const [selectedOrderForSignature, setSelectedOrderForSignature] = useState<DepotOrder | null>(null);
  const [signatureData, setSignatureData] = useState<string>("");
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [pendingSignatureSubmit, setPendingSignatureSubmit] = useState(false);
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const signatureRef = useRef<any>(null);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<DepotOrder | null>(null);
  const [createOrderError, setCreateOrderError] = useState<string>("");
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
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
      setCreateOrderError("");
    },
    onError: (error) => {
      setCreateOrderError((error as Error)?.message || "Failed to place order.");
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

  const submitSignatureMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderForSignature?.id || !signatureData) {
        throw new Error("Please provide signature.");
      }
      return apiClient.post(`/api/driver/depot-orders/${selectedOrderForSignature.id}/driver-signature`, {
        signatureUrl: signatureData,
      });
    },
    onSuccess: async () => {
      setSelectedOrderForSignature(null);
      setSignatureData("");
      setHasDrawnSignature(false);
      setPendingSignatureSubmit(false);
      setSignaturePadKey((k) => k + 1);
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
    },
  });

  useEffect(() => {
    if (pendingSignatureSubmit && signatureData && !submitSignatureMutation.isPending) {
      setPendingSignatureSubmit(false);
      submitSignatureMutation.mutate();
    }
  }, [pendingSignatureSubmit, signatureData, submitSignatureMutation]);

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
      const uploaded = await putFileToUploadUrl(
        uploadMeta.uploadURL,
        blob,
        file.mimeType || "application/octet-stream",
      );
      if (!uploaded.ok) throw new Error("Upload failed.");

      const aclRes = await apiClient.put("/api/documents", { documentURL: uploadMeta.uploadURL });
      const path =
        (aclRes.data as { objectPath?: string }).objectPath ||
        uploadMeta.objectPath ||
        "";
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
  const selectedDepotPrices = useMemo(
    () => selectedDepot?.depot_prices ?? selectedDepot?.depotPrices ?? [],
    [selectedDepot],
  );
  const selectedFuelOptions = useMemo(() => {
    const byFuelType = new Map<string, { id: string; label: string }>();
    (selectedDepotPrices || []).forEach((p) => {
      const fuelTypeId = p.fuel_type_id ?? p.fuelTypeId;
      if (!fuelTypeId) return;
      if (!byFuelType.has(fuelTypeId)) {
        byFuelType.set(fuelTypeId, {
          id: fuelTypeId,
          label: p.fuel_types?.label || p.fuelTypes?.label || "Unknown Fuel",
        });
      }
    });
    return Array.from(byFuelType.values());
  }, [selectedDepotPrices]);
  const selectedFuelLabel = selectedFuelOptions.find((f) => f.id === selectedFuelTypeId)?.label || "";
  const selectedFuelPrices = useMemo(
    () =>
      (selectedDepotPrices || []).filter(
        (p) => (p.fuel_type_id ?? p.fuelTypeId) === selectedFuelTypeId,
      ),
    [selectedDepotPrices, selectedFuelTypeId],
  );
  const selectedFuelAvailableStock = useMemo(() => {
    if (!selectedFuelPrices.length) return null;
    return selectedFuelPrices.reduce((max, p) => Math.max(max, Number(p.available_litres ?? p.availableLitres ?? 0)), 0);
  }, [selectedFuelPrices]);

  const toImageUri = (raw?: string) => {
    if (!raw) return "";
    if (raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const normalized = raw.startsWith("/") ? raw : `/objects/${raw}`;
    return `${appConfig.apiBaseUrl}${normalized}`;
  };

  const handleDownloadReceipt = async () => {
    if (!selectedOrderForReceipt) return;
    setDownloadingReceipt(true);
    try {
      const fuelLabel = selectedOrderForReceipt.fuel_types?.label || selectedOrderForReceipt.fuelTypes?.label || "-";
      const completedAt = selectedOrderForReceipt.completed_at
        ? new Date(selectedOrderForReceipt.completed_at).toLocaleString("en-ZA")
        : "-";
      const total = ((selectedOrderForReceipt.total_price_cents || 0) / 100).toFixed(2);
      const sigUri = toImageUri(selectedOrderForReceipt.delivery_signature_url);

      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; color: #111827;">
            <h1 style="color:#14b8a6; margin-bottom: 4px;">Easy Fuel</h1>
            <p style="margin-top:0; color:#6b7280;">Fuel Collection Receipt</p>
            <hr />
            <p><strong>Order ID:</strong> #${selectedOrderForReceipt.id.slice(-8).toUpperCase()}</p>
            <p><strong>Depot:</strong> ${selectedOrderForReceipt.depots?.name || "-"}</p>
            <p><strong>Fuel:</strong> ${fuelLabel}</p>
            <p><strong>Litres:</strong> ${selectedOrderForReceipt.litres || "-"}</p>
            <p><strong>Completed:</strong> ${completedAt}</p>
            <p style="font-size:18px;"><strong>Total Amount:</strong> R ${total}</p>
            ${sigUri ? `<p><strong>Driver Receipt Signature:</strong></p><img src="${sigUri}" style="max-width: 100%; height: 120px; object-fit: contain; border:1px solid #d1d5db; border-radius:6px;" />` : ""}
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Download Receipt",
          UTI: "com.adobe.pdf",
        });
      }
    } finally {
      setDownloadingReceipt(false);
    }
  };

  const handlePickupDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "ios") {
      setShowPickupPicker(false);
    }
    if (event.type === "dismissed" || !date) {
      return;
    }
    setPickupDateValue(date);
    setPickupDate(date.toISOString());
  };

  const openPickupDatePicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: pickupDateValue,
        mode: "date",
        minimumDate: new Date(),
        onChange: (event, date) => {
          if (event.type === "dismissed" || !date) return;
          const next = new Date(pickupDateValue);
          next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
          DateTimePickerAndroid.open({
            value: next,
            mode: "time",
            is24Hour: true,
            onChange: (timeEvent, time) => {
              if (timeEvent.type === "dismissed" || !time) return;
              const finalDate = new Date(next);
              finalDate.setHours(time.getHours(), time.getMinutes(), 0, 0);
              setPickupDateValue(finalDate);
              setPickupDate(finalDate.toISOString());
            },
          });
        },
      });
      return;
    }
    setShowPickupPicker(true);
  };

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.headerCard}>
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
              <Card mode="outlined" style={styles.itemCard}>
                <Card.Content>
                  <View style={styles.rowBetween}>
                    <Text variant="titleMedium">{item.depots?.name || "Depot"}</Text>
                    <Chip compact>{item.status.replace(/_/g, " ")}</Chip>
                  </View>
                  <Text style={styles.meta}>{item.fuel_types?.label || item.fuelTypes?.label || "Fuel"}</Text>
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
                    {(item.status === "awaiting_signature" || item.status === "released") ? (
                      <Button
                        mode="contained"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => {
                          setSelectedOrderForSignature(item);
                          setSignatureData("");
                          setSignaturePadKey((k) => k + 1);
                        }}
                      >
                        Sign Receipt
                      </Button>
                    ) : null}
                    {item.status === "completed" ? (
                      <Button mode="outlined" onPress={() => setSelectedOrderForReceipt(item)}>
                        Receipt
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
            <Card mode="outlined" style={styles.itemCard}>
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
                    setSelectedFuelTypeId("");
                    setShowFuelPickerDialog(false);
                    setPickupDateValue(new Date(Date.now() + 60 * 60 * 1000));
                    setPickupDate(new Date(Date.now() + 60 * 60 * 1000).toISOString());
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
        <Modal visible={!!selectedDepot} onRequestClose={() => setSelectedDepot(null)} animationType="slide" presentationStyle="fullScreen">
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text variant="titleLarge">Place Depot Order</Text>
              <Button onPress={() => setSelectedDepot(null)}>Close</Button>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Card mode="outlined" style={styles.modalCard}>
                <Card.Content>
                  <Text variant="titleMedium">{selectedDepot?.name || "Depot"}</Text>
                  <Text style={styles.meta}>
                    {[selectedDepot?.address_city, selectedDepot?.address_province].filter(Boolean).join(", ") || "Location unavailable"}
                  </Text>

                  <Text style={styles.fieldLabel}>Fuel Type</Text>
                  <Button mode="outlined" onPress={() => setShowFuelPickerDialog(true)} contentStyle={styles.menuAnchorContent}>
                    {selectedFuelLabel || "Select fuel type"}
                  </Button>
                  {showFuelPickerDialog ? (
                    <View style={styles.inlineFuelPicker}>
                      {selectedFuelOptions.length ? (
                        selectedFuelOptions.map((fuel) => (
                          <Button
                            key={fuel.id}
                            mode={selectedFuelTypeId === fuel.id ? "contained" : "outlined"}
                            style={styles.fuelOptionBtn}
                            buttonColor={selectedFuelTypeId === fuel.id ? theme.colors.primary : theme.colors.surface}
                            textColor={selectedFuelTypeId === fuel.id ? theme.colors.onPrimary : theme.colors.onSurface}
                            onPress={() => {
                              setSelectedFuelTypeId(fuel.id);
                              setShowFuelPickerDialog(false);
                            }}
                          >
                            {fuel.label}
                          </Button>
                        ))
                      ) : (
                        <Text style={styles.meta}>No fuel types available for this depot.</Text>
                      )}
                      <Button onPress={() => setShowFuelPickerDialog(false)}>Close fuel list</Button>
                    </View>
                  ) : null}

                  <TextInput mode="outlined" label="Litres" keyboardType="numeric" value={litres} onChangeText={setLitres} style={styles.input} />

                  <Text style={styles.fieldLabel}>Pickup Date</Text>
                  <Button mode="outlined" onPress={openPickupDatePicker} contentStyle={styles.menuAnchorContent}>
                    {pickupDate ? pickupDateValue.toLocaleString("en-ZA") : "Select pickup date and time"}
                  </Button>
                  {Platform.OS === "ios" && showPickupPicker ? (
                    <DateTimePicker
                      value={pickupDateValue}
                      mode="datetime"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={handlePickupDateChange}
                    />
                  ) : null}

                  {selectedFuelAvailableStock !== null ? (
                    <Text style={styles.stockText}>Available stock: {selectedFuelAvailableStock} L</Text>
                  ) : null}

                  {selectedFuelPrices.length ? (
                    <View style={styles.priceHints}>
                      <Text variant="labelMedium">Available pricing tiers</Text>
                      {selectedFuelPrices
                        .sort((a, b) => Number(a.min_litres ?? a.minLitres ?? 0) - Number(b.min_litres ?? b.minLitres ?? 0))
                        .map((p) => (
                          <Text key={`${selectedDepot?.id}-${p.fuel_type_id ?? p.fuelTypeId}-${p.min_litres ?? p.minLitres}-${p.price_cents ?? p.priceCents}`} style={styles.meta}>
                            {selectedFuelLabel || p.fuel_types?.label || p.fuelTypes?.label || "Fuel"}: R {((p.price_cents ?? p.priceCents ?? 0) / 100).toFixed(2)} / L
                            {"  "}
                            (min {p.min_litres ?? p.minLitres ?? 0}L, stock {p.available_litres ?? p.availableLitres ?? 0}L)
                          </Text>
                        ))}
                    </View>
                  ) : null}
                  {createOrderError ? <Text style={styles.errorText}>{createOrderError}</Text> : null}
                </Card.Content>
              </Card>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Button onPress={() => setSelectedDepot(null)}>Cancel</Button>
              <Button mode="contained" onPress={() => createOrderMutation.mutate()} loading={createOrderMutation.isPending}>
                Place Order
              </Button>
            </View>
          </View>
        </Modal>

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

        <Dialog
          visible={!!selectedOrderForSignature}
          onDismiss={() => setSelectedOrderForSignature(null)}
          style={styles.dialog}
        >
          <Dialog.Title>Sign Receipt</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.meta}>Please sign to confirm fuel receipt.</Text>
            <View style={styles.signatureCanvas}>
              <Signature
                key={`depot-signature-${signaturePadKey}`}
                ref={signatureRef}
                onOK={(sig) => setSignatureData(sig)}
                onEmpty={() => setSignatureData("")}
                onClear={() => {
                  setSignatureData("");
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
            {submitSignatureMutation.isError ? (
              <Text style={styles.errorText}>{(submitSignatureMutation.error as Error)?.message || "Failed to submit signature."}</Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setSignatureData("");
                setHasDrawnSignature(false);
                setPendingSignatureSubmit(false);
                setSignaturePadKey((k) => k + 1);
              }}
            >
              Clear
            </Button>
            <Button onPress={() => setSelectedOrderForSignature(null)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={() => {
                setPendingSignatureSubmit(true);
                signatureRef.current?.readSignature?.();
              }}
              loading={submitSignatureMutation.isPending}
              disabled={submitSignatureMutation.isPending || !hasDrawnSignature}
            >
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>

      </Portal>

      <Modal
        visible={!!selectedOrderForReceipt}
        onRequestClose={() => setSelectedOrderForReceipt(null)}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text variant="titleLarge">Depot Order Receipt</Text>
            <View style={styles.receiptHeaderActions}>
              <Button onPress={handleDownloadReceipt} loading={downloadingReceipt} disabled={downloadingReceipt}>
                Download
              </Button>
              <Button onPress={() => setSelectedOrderForReceipt(null)}>Close</Button>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.receiptScroll}>
            <View style={styles.receiptCard}>
              <Text style={styles.receiptBrand}>Easy Fuel</Text>
              <Text style={styles.receiptSubTitle}>Fuel Collection Receipt</Text>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Order ID</Text>
                <Text style={styles.receiptValue}>#{selectedOrderForReceipt?.id?.slice(-8)?.toUpperCase() || "-"}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Depot</Text>
                <Text style={styles.receiptValue}>{selectedOrderForReceipt?.depots?.name || "-"}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Fuel</Text>
                <Text style={styles.receiptValue}>
                  {selectedOrderForReceipt?.fuel_types?.label || selectedOrderForReceipt?.fuelTypes?.label || "-"}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Litres</Text>
                <Text style={styles.receiptValue}>{selectedOrderForReceipt?.litres || "-"}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Completed</Text>
                <Text style={styles.receiptValue}>
                  {selectedOrderForReceipt?.completed_at
                    ? new Date(selectedOrderForReceipt.completed_at).toLocaleString("en-ZA")
                    : "-"}
                </Text>
              </View>

              <View style={styles.receiptTotalWrap}>
                <Text style={styles.receiptTotalLabel}>Total Amount</Text>
                <Text style={styles.receiptTotalValue}>
                  R {((selectedOrderForReceipt?.total_price_cents || 0) / 100).toFixed(2)}
                </Text>
              </View>

              <Text style={styles.receiptSignatureTitle}>Driver Receipt Signature</Text>
              {(selectedOrderForReceipt?.delivery_signature_url || "").length > 0 ? (
                <Image
                  source={{ uri: toImageUri(selectedOrderForReceipt?.delivery_signature_url) }}
                  style={styles.receiptSignature}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.meta}>No signature image available.</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 14 },
  headerCard: { ...p.hero, marginBottom: 10 },
  subtitle: { marginTop: 6, color: theme.colors.onSurfaceVariant },
  segment: { marginTop: 12 },
  center: p.center,
  list: { gap: 10, paddingBottom: 20 },
  empty: { ...p.empty, marginTop: 20 },
  itemCard: p.listCard,
  rowBetween: p.rowBetween,
  meta: { marginTop: 4, color: theme.colors.onSurfaceVariant },
  amount: { marginTop: 6, fontWeight: "700", color: theme.colors.primary },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  orderBtn: { marginTop: 10, alignSelf: "flex-start" },
  dialog: { maxHeight: "90%" },
  modalContainer: { flex: 1, backgroundColor: theme.colors.background },
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
  modalScroll: { padding: 14, paddingBottom: 100 },
  modalCard: p.sectionCard,
  modalFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  fieldLabel: { marginTop: 10, marginBottom: 6, color: theme.colors.onSurfaceVariant, fontWeight: "600" },
  menuAnchorContent: { justifyContent: "space-between" },
  inlineFuelPicker: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    backgroundColor: theme.colors.surfaceVariant,
  },
  fuelOptionBtn: {
    marginTop: 6,
    borderRadius: 10,
    justifyContent: "flex-start",
    borderColor: theme.colors.outline,
  },
  input: p.input,
  stockText: { marginTop: 8, color: theme.colors.primary, fontWeight: "700" },
  signatureCanvas: {
    height: 180,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: theme.colors.primary,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    marginTop: 8,
  },
  receiptSignature: {
    width: "100%",
    height: 120,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  receiptScroll: { padding: 14, paddingBottom: 30 },
  receiptCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  receiptBrand: { fontSize: 22, fontWeight: "700", color: theme.colors.primary },
  receiptSubTitle: { marginTop: 2, color: theme.colors.onSurfaceVariant },
  receiptHeaderActions: { flexDirection: "row", alignItems: "center" },
  receiptDivider: { height: 1, backgroundColor: theme.colors.outline, marginVertical: 10 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, gap: 10 },
  receiptLabel: { color: theme.colors.onSurfaceVariant, flex: 1 },
  receiptValue: { color: "#111827", flex: 1, textAlign: "right", fontWeight: "600" },
  receiptTotalWrap: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceVariant,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  receiptTotalLabel: { fontWeight: "700", color: theme.colors.onSurfaceVariant },
  receiptTotalValue: { fontSize: 18, fontWeight: "800", color: theme.colors.primary },
  receiptSignatureTitle: { marginTop: 12, marginBottom: 8, fontWeight: "700", color: theme.colors.onSurfaceVariant },
  priceHints: { marginTop: 10, gap: 2 },
  paymentOptions: { marginTop: 12, gap: 4 },
  radioRow: { flexDirection: "row", alignItems: "center" },
  bankProofWrap: { marginTop: 10, gap: 6 },
  errorText: p.errorText,
  });
};
