import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
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
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { putFileToUploadUrl, readUploadObjectPath } from "@/lib/files";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme, paperMd3ControlRoundness } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SignatureCapturePad, type SignatureCapturePadRef } from "@/components/SignatureCapturePad";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { formatDepotOrderStatus } from "@/lib/format-labels";
import { DepotOrderReceiptModal } from "@/components/DepotOrderReceiptModal";

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
      const serverMsg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const raw = (error as Error)?.message || "Failed to place order.";
      const msg =
        serverMsg ||
        (raw.includes("status code 400") ? "Could not place this order. Please check your details and try again." : raw);
      setCreateOrderError(msg);
      Alert.alert("Cannot place order", msg);
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
      closePaymentModal();
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

  const closePaymentModal = () => {
    setSelectedOrderForPayment(null);
    setPaymentMethod("");
    setPaymentProofUrl("");
    setPaymentError("");
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

  const resolveApplicableStock = (litresNum: number): number | null => {
    if (!selectedFuelPrices.length) return null;
    const tiers = [...selectedFuelPrices].sort(
      (a, b) => Number(b.min_litres ?? b.minLitres ?? 0) - Number(a.min_litres ?? a.minLitres ?? 0),
    );
    let tier = tiers[tiers.length - 1];
    for (const t of tiers) {
      if (litresNum >= Number(t.min_litres ?? t.minLitres ?? 0)) {
        tier = t;
        break;
      }
    }
    const stock = Number(tier?.available_litres ?? tier?.availableLitres ?? 0);
    return Number.isFinite(stock) ? stock : 0;
  };

  const stockLimitMessage = (availableLitres: number) =>
    `Please choose an amount under the available stock (${availableLitres} L).`;

  const handlePlaceDepotOrder = () => {
    setCreateOrderError("");
    const litresNum = Number(litres);
    if (!Number.isFinite(litresNum) || litresNum <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid number of litres.");
      return;
    }
    const available = resolveApplicableStock(litresNum);
    if (available !== null && available > 0 && litresNum >= available) {
      const msg = stockLimitMessage(available);
      setCreateOrderError(msg);
      Alert.alert("Amount too high", msg);
      return;
    }
    createOrderMutation.mutate();
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
                    <Chip compact icon="information-outline">
                      {formatDepotOrderStatus({
                        status: item.status,
                        payment_status: item.payment_status,
                      })}
                    </Chip>
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
                      <Button mode="outlined" compact icon="receipt-text-outline" onPress={() => setSelectedOrderForReceipt(item)}>
                        View receipt
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
            <View style={[styles.modalFooter, { paddingBottom: footerPaddingBottom }]}>
              <Button onPress={() => setSelectedDepot(null)} style={styles.footerBtn}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handlePlaceDepotOrder}
                loading={createOrderMutation.isPending}
                style={styles.footerBtnPrimary}
              >
                Place Order
              </Button>
            </View>
          </ModalSafeArea>
        </Modal>
      </Portal>

      <Modal
        visible={!!selectedOrderForPayment}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closePaymentModal}
      >
        <ModalSafeArea style={styles.modalContainer}>
          <ModalScreenHeader title="Pay for Order" onClose={closePaymentModal} />
          <ScrollView
            contentContainerStyle={[styles.modalScroll, { paddingBottom: footerPaddingBottom + 88 }]}
            keyboardShouldPersistTaps="handled"
          >
            <Card mode="outlined" style={styles.modalCard}>
              <Card.Content>
                <Text variant="titleMedium">{selectedOrderForPayment?.depots?.name || "Depot"}</Text>
                <IconMetaRow icon="gas-station-outline" color={theme.colors.onSurfaceVariant} style={styles.summaryRow}>
                  {selectedOrderForPayment?.fuel_types?.label || selectedOrderForPayment?.fuelTypes?.label || "-"}
                </IconMetaRow>
                <IconMetaRow icon="water-outline" color={theme.colors.onSurfaceVariant} style={styles.summaryRow}>
                  {selectedOrderForPayment?.litres ?? "-"} L
                </IconMetaRow>
                <View style={styles.paymentTotalBox}>
                  <Text style={styles.paymentTotalLabel}>Total amount</Text>
                  <Text style={styles.paymentTotalValue}>
                    {formatMoneyFromCents(selectedOrderForPayment?.total_price_cents || 0)}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            <Card mode="outlined" style={[styles.modalCard, styles.paymentCard]}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.paymentSectionTitle}>
                  Payment method
                </Text>
                <View style={styles.paymentMethodList}>
                  <Button
                    mode={paymentMethod === "bank_transfer" ? "contained" : "outlined"}
                    icon="bank-outline"
                    contentStyle={styles.paymentMethodBtnContent}
                    style={styles.paymentMethodBtn}
                    buttonColor={paymentMethod === "bank_transfer" ? theme.colors.primary : undefined}
                    textColor={paymentMethod === "bank_transfer" ? theme.colors.onPrimary : theme.colors.onSurface}
                    onPress={() => setPaymentMethod("bank_transfer")}
                  >
                    Bank transfer — upload proof
                  </Button>
                  <Button
                    mode={paymentMethod === "online_payment" ? "contained" : "outlined"}
                    icon="credit-card-outline"
                    contentStyle={styles.paymentMethodBtnContent}
                    style={styles.paymentMethodBtn}
                    buttonColor={paymentMethod === "online_payment" ? theme.colors.primary : undefined}
                    textColor={paymentMethod === "online_payment" ? theme.colors.onPrimary : theme.colors.onSurface}
                    onPress={() => setPaymentMethod("online_payment")}
                  >
                    Online payment (OZOW)
                  </Button>
                  <Button
                    mode={paymentMethod === "pay_outside_app" ? "contained" : "outlined"}
                    icon="hand-coin-outline"
                    contentStyle={styles.paymentMethodBtnContent}
                    style={styles.paymentMethodBtn}
                    buttonColor={paymentMethod === "pay_outside_app" ? theme.colors.primary : undefined}
                    textColor={paymentMethod === "pay_outside_app" ? theme.colors.onPrimary : theme.colors.onSurface}
                    onPress={() => setPaymentMethod("pay_outside_app")}
                  >
                    Pay outside app
                  </Button>
                </View>

                {paymentMethod === "online_payment" ? (
                  <Text style={styles.paymentHint}>
                    You will be redirected to OZOW to pay securely by card or instant EFT.
                  </Text>
                ) : null}

                {paymentMethod === "bank_transfer" ? (
                  <View style={styles.bankProofWrap}>
                    <Button mode="outlined" icon="file-upload-outline" onPress={handleUploadProof} loading={uploadingProof}>
                      {paymentProofUrl ? "Reupload proof" : "Upload proof of payment"}
                    </Button>
                    {paymentProofUrl ? <Text style={styles.paymentHintSuccess}>Proof uploaded</Text> : null}
                  </View>
                ) : null}

                {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}
              </Card.Content>
            </Card>
          </ScrollView>
          <View style={[styles.modalFooter, { paddingBottom: footerPaddingBottom }]}>
            <Button onPress={closePaymentModal} style={styles.footerBtn}>
              Cancel
            </Button>
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
              style={styles.footerBtnPrimary}
            >
              Submit payment
            </Button>
          </View>
        </ModalSafeArea>
      </Modal>

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

      <DepotOrderReceiptModal
        order={selectedOrderForReceipt}
        visible={!!selectedOrderForReceipt}
        onClose={() => setSelectedOrderForReceipt(null)}
      />
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
  paymentCard: { marginTop: 12 },
  summaryRow: { marginTop: 8 },
  paymentTotalBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceVariant,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  paymentTotalLabel: { color: theme.colors.onSurfaceVariant, fontWeight: "600" },
  paymentTotalValue: { fontSize: 20, fontWeight: "800", color: theme.colors.primary },
  paymentSectionTitle: { marginBottom: 10, fontWeight: "700" },
  paymentMethodList: { gap: 8 },
  paymentMethodBtn: {
    borderRadius: buttonBorderRadius,
    justifyContent: "flex-start",
  },
  paymentMethodBtnContent: {
    justifyContent: "flex-start",
    paddingVertical: 6,
  },
  paymentHint: { marginTop: 12, color: theme.colors.onSurfaceVariant, lineHeight: 20 },
  paymentHintSuccess: { marginTop: 8, color: theme.colors.primary, fontWeight: "600" },
  modalFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  footerBtn: { minWidth: 100 },
  footerBtnPrimary: { flex: 1 },
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
  priceHints: { marginTop: 10, gap: 2 },
  bankProofWrap: { marginTop: 12, gap: 8 },
  errorText: p.errorText,
  });
};
