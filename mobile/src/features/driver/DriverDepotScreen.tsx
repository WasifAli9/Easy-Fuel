import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { IconMetaRow, SectionTitleRow } from "@/components/IconMetaRow";
import { getIosDatePickerNativeProps, iosDatePickerStyle, iosDatePickerWrapStyle } from "@/components/ios-date-picker-props";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { useModalLayout } from "@/components/modal-layout";
import { readableType } from "@/design/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Card,
  Chip,
  Dialog,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  RadioButton,
} from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { putFileToUploadUrl, readUploadObjectPath } from "@/lib/files";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme, paperMd3ControlRoundness } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SignatureCapturePad, type SignatureCapturePadRef } from "@/components/SignatureCapturePad";
import { formatMoneyFromCents } from "@/lib/format-currency";
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
  distance_km?: number | null;
  lat?: number | null;
  lng?: number | null;
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

function depotDistanceCaption(depot: Depot): string {
  const km = depot.distance_km;
  if (km != null && Number.isFinite(Number(km))) {
    return `${Number(km).toFixed(1)} km away`;
  }
  const hasDepotCoords =
    depot.lat != null &&
    depot.lng != null &&
    Number.isFinite(Number(depot.lat)) &&
    Number.isFinite(Number(depot.lng));
  if (!hasDepotCoords) {
    return "Distance n/a — depot has no map coordinates yet";
  }
  return "Distance n/a — your saved location is missing (enable location / open the app on the road)";
}

/** One row per fuel type; stock = max available_litres across pricing tiers for that fuel. */
function depotFuelStockRows(depot: Depot): { fuelTypeId: string; label: string; stockL: number }[] {
  const prices = depot.depot_prices ?? depot.depotPrices ?? [];
  const byFuel = new Map<string, { label: string; stockL: number }>();
  for (const p of prices) {
    const fuelTypeId = p.fuel_type_id ?? p.fuelTypeId;
    if (!fuelTypeId) continue;
    const label = p.fuel_types?.label || p.fuelTypes?.label || "Fuel";
    const avail = Number(p.available_litres ?? p.availableLitres ?? 0);
    const prev = byFuel.get(fuelTypeId);
    if (!prev) byFuel.set(fuelTypeId, { label, stockL: avail });
    else byFuel.set(fuelTypeId, { label, stockL: Math.max(prev.stockL, avail) });
  }
  return Array.from(byFuel.entries()).map(([fuelTypeId, v]) => ({ fuelTypeId, ...v }));
}

export function DriverDepotScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const { footerPaddingBottom, windowHeight } = useModalLayout();
  const signaturePadHeight = Math.min(340, Math.max(220, Math.round(windowHeight * 0.32)));
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
  const signatureRef = useRef<SignatureCapturePadRef>(null);
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
      closeSignatureModal();
      setSignaturePadKey((k) => k + 1);
      await queryClient.invalidateQueries({ queryKey: ["/api/driver/depot-orders"] });
    },
    onError: () => {
      setPendingSignatureSubmit(false);
    },
  });

  useEffect(() => {
    if (pendingSignatureSubmit && signatureData && !submitSignatureMutation.isPending) {
      setPendingSignatureSubmit(false);
      submitSignatureMutation.mutate();
    }
  }, [pendingSignatureSubmit, signatureData, submitSignatureMutation]);

  const closeSignatureModal = () => {
    setSelectedOrderForSignature(null);
    setSignatureData("");
    setHasDrawnSignature(false);
    setPendingSignatureSubmit(false);
  };

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

      const storedRelativePath = await readUploadObjectPath(uploaded, uploadMeta.uploadURL);
      const aclRes = await apiClient.put("/api/documents", { documentURL: storedRelativePath });
      const path =
        (aclRes.data as { objectPath?: string }).objectPath || storedRelativePath;
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
      const total = formatMoneyFromCents(selectedOrderForReceipt.total_price_cents || 0);
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
            <p style="font-size:18px;"><strong>Total Amount:</strong> ${total}</p>
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
          <SectionTitleRow
            icon="warehouse"
            title="Depot"
            subtitle="My depot orders and nearby fuel depots."
            iconBg={mode === "dark" ? "rgba(13, 148, 136, 0.18)" : "rgba(13, 148, 136, 0.14)"}
            iconColor={theme.colors.primary}
            subtitleColor={theme.colors.onSurfaceVariant}
          />
          <SegmentedButtons
            theme={{ roundness: paperMd3ControlRoundness }}
            style={styles.segment}
            value={segment}
            onValueChange={(value) => setSegment(value as "orders" | "depots")}
            buttons={[
              { value: "orders", label: "My orders", icon: "clipboard-list-outline" },
              { value: "depots", label: "Depots", icon: "map-marker-radius" },
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
                    <Chip compact icon="information-outline">{item.status.replace(/_/g, " ")}</Chip>
                  </View>
                  <IconMetaRow icon="fuel" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.primary}>
                    {item.fuel_types?.label || item.fuelTypes?.label || "Fuel"} · {item.litres} L
                  </IconMetaRow>
                  <IconMetaRow icon="calendar-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                    {item.pickup_date ? new Date(item.pickup_date).toLocaleDateString("en-ZA") : "No date"}
                  </IconMetaRow>
                  <IconMetaRow icon="cash" color={theme.colors.onSurface} iconColor={theme.colors.primary}>
                    {formatMoneyFromCents(Number(item.total_price_cents || 0))}
                  </IconMetaRow>
                  <View style={styles.actionRow}>
                    {item.status === "pending" ? (
                      <Button
                        mode="outlined"
                        compact
                        icon="close-circle-outline"
                        onPress={() => cancelOrderMutation.mutate(item.id)}
                        loading={cancelOrderMutation.isPending}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    {item.status === "pending_payment" ? (
                      <Button
                        mode="contained"
                        compact
                        icon="credit-card-outline"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => {
                          setSelectedOrderForPayment(item);
                          setPaymentMethod("");
                          setPaymentProofUrl("");
                          setPaymentError("");
                        }}
                      >
                        Pay
                      </Button>
                    ) : null}
                    {(item.status === "awaiting_signature" || item.status === "released") ? (
                      <Button
                        mode="contained"
                        compact
                        icon="draw"
                        buttonColor={theme.colors.primary}
                        textColor={theme.colors.onPrimary}
                        onPress={() => {
                          setSelectedOrderForSignature(item);
                          setSignatureData("");
                          setSignaturePadKey((k) => k + 1);
                        }}
                      >
                        Sign
                      </Button>
                    ) : null}
                    {item.status === "completed" ? (
                      <Button mode="outlined" compact icon="receipt" onPress={() => setSelectedOrderForReceipt(item)}>
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
          renderItem={({ item }) => {
            const fuelRows = depotFuelStockRows(item);
            return (
            <Card mode="outlined" style={styles.itemCard}>
              <Card.Content>
                <Text variant="titleMedium">{item.name || "Depot"}</Text>
                <IconMetaRow icon="map-marker-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                  {[item.address_city, item.address_province].filter(Boolean).join(", ") || "Location unavailable"}
                </IconMetaRow>
                <IconMetaRow icon="map-marker-distance" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.primary}>
                  {depotDistanceCaption(item)}
                </IconMetaRow>
                {fuelRows.length > 0 ? (
                  <View style={styles.fuelStockBlock}>
                    {fuelRows.map((row) => (
                      <View key={row.fuelTypeId} style={styles.fuelStockRow}>
                        <Text style={styles.fuelStockLabel} numberOfLines={1}>
                          {row.label}
                        </Text>
                        <Text style={styles.fuelStockValue}>{row.stockL.toLocaleString("en-ZA")} L</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.meta}>No fuel types listed for this depot.</Text>
                )}
                <Button
                  mode="contained"
                  compact
                  icon="gas-station"
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
                  Order fuel
                </Button>
              </Card.Content>
            </Card>
            );
          }}
        />
      )}

      <Portal>
        <Modal visible={!!selectedDepot} onRequestClose={() => setSelectedDepot(null)} animationType="slide" presentationStyle="fullScreen">
          <ModalSafeArea style={styles.modalContainer}>
            <ModalScreenHeader title="Place Depot Order" onClose={() => setSelectedDepot(null)} />
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
                    <View style={iosDatePickerWrapStyle(theme)}>
                      <DateTimePicker
                        value={pickupDateValue}
                        mode="datetime"
                        minimumDate={new Date()}
                        onChange={handlePickupDateChange}
                        style={iosDatePickerStyle()}
                        {...getIosDatePickerNativeProps(mode)}
                      />
                    </View>
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
                            {selectedFuelLabel || p.fuel_types?.label || p.fuelTypes?.label || "Fuel"}: {formatMoneyFromCents(p.price_cents ?? p.priceCents ?? 0)} / L
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
          </ModalSafeArea>
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
              Total: {formatMoneyFromCents(selectedOrderForPayment?.total_price_cents || 0)}
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
                  <Text>Online Payment (OZOW — card / instant EFT)</Text>
                </View>
                <View style={styles.radioRow}>
                  <RadioButton value="pay_outside_app" />
                  <Text>Pay Outside App</Text>
                </View>
              </RadioButton.Group>
            </View>

            {paymentMethod === "online_payment" ? (
              <Text style={styles.meta}>
                You will be redirected to OZOW to pay securely by card or instant EFT at your bank.
              </Text>
            ) : null}

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

      <Modal
        visible={!!selectedOrderForSignature}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeSignatureModal}
      >
        <ModalSafeArea style={styles.signatureModalRoot}>
          <ModalScreenHeader title="Sign receipt" onClose={closeSignatureModal} />
          <View style={styles.signatureModalBody}>
            {selectedOrderForSignature ? (
              <Card mode="outlined" style={styles.signatureOrderCard}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.signatureOrderTitle}>
                    {selectedOrderForSignature.depots?.name ?? "Depot order"}
                  </Text>
                  <Text style={styles.meta}>
                    {(selectedOrderForSignature.fuel_types?.label ||
                      selectedOrderForSignature.fuelTypes?.label ||
                      "Fuel")}{" "}
                    · {selectedOrderForSignature.litres} L ·{" "}
                    {formatMoneyFromCents(Number(selectedOrderForSignature.total_price_cents || 0))}
                  </Text>
                </Card.Content>
              </Card>
            ) : null}
            <Text style={styles.signatureHint}>
              Sign in the box below to confirm you received the fuel from the supplier.
            </Text>
            <Text style={styles.signatureLabel}>Your signature *</Text>
            <SignatureCapturePad
              ref={signatureRef}
              padKey={`depot-signature-${signaturePadKey}`}
              height={signaturePadHeight}
              style={[styles.signatureCanvas, { borderColor: theme.colors.outline }]}
              onOK={(sig) => setSignatureData(sig)}
              onEmpty={() => setSignatureData("")}
              onClear={() => {
                setSignatureData("");
                setHasDrawnSignature(false);
              }}
              onEnd={() => setHasDrawnSignature(true)}
            />
            {submitSignatureMutation.isError ? (
              <Text style={styles.errorText}>
                {(submitSignatureMutation.error as Error)?.message || "Failed to submit signature."}
              </Text>
            ) : null}
          </View>
          <View style={[styles.signatureModalFooter, { paddingBottom: footerPaddingBottom }]}>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              style={styles.signaturePrimaryBtn}
              contentStyle={styles.signaturePrimaryBtnInner}
              onPress={() => {
                setPendingSignatureSubmit(true);
                signatureRef.current?.readSignature();
              }}
              loading={submitSignatureMutation.isPending}
              disabled={submitSignatureMutation.isPending || !hasDrawnSignature}
            >
              Submit signature
            </Button>
            <View style={styles.signatureSecondaryRow}>
              <Button
                mode="outlined"
                style={styles.signatureSecondaryBtn}
                textColor={theme.colors.onSurface}
                theme={{ colors: { outline: theme.colors.outline } }}
                onPress={() => {
                  setSignatureData("");
                  setHasDrawnSignature(false);
                  setPendingSignatureSubmit(false);
                  setSignaturePadKey((k) => k + 1);
                }}
                disabled={submitSignatureMutation.isPending}
              >
                Clear
              </Button>
              <Button
                mode="outlined"
                style={styles.signatureSecondaryBtn}
                textColor={theme.colors.onSurface}
                theme={{ colors: { outline: theme.colors.outline } }}
                onPress={closeSignatureModal}
                disabled={submitSignatureMutation.isPending}
              >
                Cancel
              </Button>
            </View>
          </View>
        </ModalSafeArea>
      </Modal>

      <Modal
        visible={!!selectedOrderForReceipt}
        onRequestClose={() => setSelectedOrderForReceipt(null)}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <ModalSafeArea style={styles.modalContainer}>
          <ModalScreenHeader title="Depot Order Receipt" onClose={() => setSelectedOrderForReceipt(null)} />
          <View style={styles.receiptHeaderActions}>
            <Button onPress={handleDownloadReceipt} loading={downloadingReceipt} disabled={downloadingReceipt}>
              Download
            </Button>
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
                  {formatMoneyFromCents(selectedOrderForReceipt?.total_price_cents || 0)}
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
        </ModalSafeArea>
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
  fuelStockBlock: {
    marginTop: 8,
    gap: 6,
  },
  fuelStockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fuelStockLabel: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: "600",
  },
  fuelStockValue: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 0,
  },
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
    borderRadius: buttonBorderRadius,
    justifyContent: "flex-start",
    borderColor: theme.colors.outline,
  },
  input: p.input,
  stockText: { marginTop: 8, color: theme.colors.primary, fontWeight: "700" },
  signatureModalRoot: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  signatureModalBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    minHeight: 0,
  },
  signatureOrderCard: {
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
  },
  signatureOrderTitle: {
    fontWeight: "700",
    color: theme.colors.onSurface,
  },
  signatureHint: {
    ...readableType.body,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
  },
  signatureLabel: {
    ...readableType.label,
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  signatureCanvas: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  signatureModalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  signaturePrimaryBtn: {
    borderRadius: buttonBorderRadius,
  },
  signaturePrimaryBtnInner: {
    paddingVertical: 6,
  },
  signatureSecondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  signatureSecondaryBtn: {
    flex: 1,
    borderRadius: buttonBorderRadius,
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
