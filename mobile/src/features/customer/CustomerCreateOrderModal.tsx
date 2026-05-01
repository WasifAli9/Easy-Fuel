import { useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Button,
  Card,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type FuelType = { id: string; label: string; code?: string };
type Address = {
  id: string;
  label?: string;
  address_street?: string;
  address_city?: string;
};

export function CustomerCreateOrderModal({
  visible,
  onDismiss,
  onCreated,
}: {
  visible: boolean;
  onDismiss: () => void;
  onCreated: (orderId: string) => void;
}) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const [fuelTypeId, setFuelTypeId] = useState("");
  const [litres, setLitres] = useState("");
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [deliveryDateTime, setDeliveryDateTime] = useState<Date | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);
  const [fuelMenuOpen, setFuelMenuOpen] = useState(false);
  const [addressMenuOpen, setAddressMenuOpen] = useState(false);
  const [accessNotes, setAccessNotes] = useState("");
  const [priorityLevel, setPriorityLevel] = useState<"low" | "medium" | "high">("medium");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [tankCapacity, setTankCapacity] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const fuelTypesQuery = useQuery({
    queryKey: ["/api/fuel-types"],
    queryFn: async () => (await apiClient.get<FuelType[]>("/api/fuel-types")).data ?? [],
    enabled: visible,
  });
  const addressesQuery = useQuery({
    queryKey: ["/api/delivery-addresses"],
    queryFn: async () => (await apiClient.get<Address[]>("/api/delivery-addresses")).data ?? [],
    enabled: visible,
  });
  const paymentMethodsQuery = useQuery({
    queryKey: ["/api/payment-methods"],
    queryFn: async () => (await apiClient.get<any[]>("/api/payment-methods")).data ?? [],
    enabled: visible,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/api/orders", {
        fuelTypeId,
        litres,
        maxBudgetCents: null,
        deliveryAddressId,
        deliveryDate: deliveryDate || null,
        fromTime: fromTime || null,
        toTime: toTime || null,
        accessNotes: accessNotes || null,
        priorityLevel,
        vehicleRegistration: vehicleRegistration || null,
        equipmentType: equipmentType || null,
        tankCapacity: tankCapacity || null,
        paymentMethodId: paymentMethodId || null,
        termsAccepted,
        signatureData: null,
      });
      return data as { id: string };
    },
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onCreated(order.id);
      onDismiss();
      setFuelTypeId("");
      setLitres("");
      setDeliveryAddressId("");
      setTermsAccepted(false);
    },
  });

  const fuelTypes = fuelTypesQuery.data ?? [];
  const addresses = addressesQuery.data ?? [];
  const paymentMethods = paymentMethodsQuery.data ?? [];
  const selectedFuelLabel = fuelTypes.find((f) => f.id === fuelTypeId)?.label ?? "";
  const selectedAddressLabel =
    addresses.find((a) => a.id === deliveryAddressId)?.label ||
    addresses.find((a) => a.id === deliveryAddressId)?.address_street ||
    "";

  const applyDateTime = (next: Date) => {
    setDeliveryDateTime(next);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, "0");
    const dd = String(next.getDate()).padStart(2, "0");
    const hh = String(next.getHours()).padStart(2, "0");
    const min = String(next.getMinutes()).padStart(2, "0");
    setDeliveryDate(`${yyyy}-${mm}-${dd}`);
    setFromTime(`${hh}:${min}`);
    setToTime("");
  };

  const handleDateChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "ios") {
      setShowDateTimePicker(false);
    }
    if (event.type === "dismissed" || !value) return;
    applyDateTime(value);
  };

  const openDateTimePicker = () => {
    const base = deliveryDateTime ?? new Date(Date.now() + 60 * 60 * 1000);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        minimumDate: new Date(),
        onChange: (event, selectedDate) => {
          if (event.type === "dismissed" || !selectedDate) return;
          const next = new Date(base);
          next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
          DateTimePickerAndroid.open({
            value: next,
            mode: "time",
            is24Hour: true,
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type === "dismissed" || !selectedTime) return;
              const finalDate = new Date(next);
              finalDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              applyDateTime(finalDate);
            },
          });
        },
      });
      return;
    }
    setShowDateTimePicker(true);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text variant="titleLarge">New order</Text>
          <Button onPress={onDismiss}>Close</Button>
        </View>
        {fuelTypesQuery.isLoading || addressesQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text variant="labelLarge">Fuel type</Text>
                <Button
                  mode="outlined"
                  onPress={() => setFuelMenuOpen((prev) => !prev)}
                  style={styles.menuAnchor}
                  contentStyle={styles.dropdownButtonContent}
                >
                  {selectedFuelLabel || "Select fuel type"}
                </Button>
                {fuelMenuOpen ? (
                  <View style={styles.dropdownList}>
                    {fuelTypes.length ? (
                      fuelTypes.map((ft) => (
                        <Button
                          key={ft.id}
                          mode={fuelTypeId === ft.id ? "contained" : "text"}
                          onPress={() => {
                            setFuelTypeId(ft.id);
                            setFuelMenuOpen(false);
                          }}
                          compact
                          style={styles.dropdownItem}
                          buttonColor={fuelTypeId === ft.id ? theme.colors.primary : "transparent"}
                          textColor={fuelTypeId === ft.id ? theme.colors.onPrimary : theme.colors.onSurface}
                        >
                          {ft.label}
                        </Button>
                      ))
                    ) : (
                      <Text style={styles.hint}>No fuel types available.</Text>
                    )}
                  </View>
                ) : null}
              </Card.Content>
            </Card>

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text variant="labelLarge">Delivery address</Text>
                <Button
                  mode="outlined"
                  onPress={() => setAddressMenuOpen((prev) => !prev)}
                  style={styles.menuAnchor}
                  contentStyle={styles.dropdownButtonContent}
                >
                  {selectedAddressLabel || "Select saved address"}
                </Button>
                {addressMenuOpen ? (
                  <View style={styles.dropdownList}>
                    {addresses.length ? (
                      addresses.map((a) => (
                        <Button
                          key={a.id}
                          mode={deliveryAddressId === a.id ? "contained" : "text"}
                          onPress={() => {
                            setDeliveryAddressId(a.id);
                            setAddressMenuOpen(false);
                          }}
                          compact
                          style={styles.dropdownItem}
                          buttonColor={deliveryAddressId === a.id ? theme.colors.tertiary : "transparent"}
                          textColor={deliveryAddressId === a.id ? theme.colors.onTertiary : theme.colors.onSurface}
                        >
                          {a.label || a.address_street || a.id.slice(0, 8)}
                        </Button>
                      ))
                    ) : (
                      <Text style={styles.hint}>No saved addresses found.</Text>
                    )}
                  </View>
                ) : null}
              </Card.Content>
            </Card>
            {addresses.length === 0 ? (
              <Text style={styles.hint}>Add a saved address under the Addresses tab first.</Text>
            ) : null}

            <TextInput
              mode="outlined"
              label="Litres"
              value={litres}
              onChangeText={setLitres}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Button mode="outlined" onPress={openDateTimePicker} style={styles.input}>
              {deliveryDateTime ? deliveryDateTime.toLocaleString("en-ZA") : "Select delivery date & time"}
            </Button>
            {Platform.OS === "ios" && showDateTimePicker ? (
              <DateTimePicker
                value={deliveryDateTime ?? new Date()}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                onChange={handleDateChange}
              />
            ) : null}
            <TextInput
              mode="outlined"
              label="Access notes"
              value={accessNotes}
              onChangeText={setAccessNotes}
              multiline
              style={styles.input}
            />
            <Text variant="labelLarge">Priority</Text>
            <View style={styles.chips}>
              {(["low", "medium", "high"] as const).map((p) => (
                <Button
                  key={p}
                  mode={priorityLevel === p ? "contained" : "outlined"}
                  onPress={() => setPriorityLevel(p)}
                  buttonColor={priorityLevel === p ? theme.colors.primary : undefined}
                  textColor={priorityLevel === p ? theme.colors.onPrimary : theme.colors.primary}
                >
                  {p}
                </Button>
              ))}
            </View>
            <TextInput
              mode="outlined"
              label="Vehicle registration (optional)"
              value={vehicleRegistration}
              onChangeText={setVehicleRegistration}
              style={styles.input}
            />
            <TextInput mode="outlined" label="Equipment type (optional)" value={equipmentType} onChangeText={setEquipmentType} style={styles.input} />
            <TextInput
              mode="outlined"
              label="Tank capacity (optional)"
              value={tankCapacity}
              onChangeText={setTankCapacity}
              keyboardType="decimal-pad"
              style={styles.input}
            />

            {paymentMethods.length > 0 ? (
              <>
                <Text variant="labelLarge" style={styles.mt}>
                  Payment method (optional)
                </Text>
                <View style={styles.chips}>
                  <Button mode={paymentMethodId === "" ? "contained" : "outlined"} onPress={() => setPaymentMethodId("")}>
                    None
                  </Button>
                  {paymentMethods.map((pm: { id?: string; label?: string }) => (
                    <Button
                      key={pm.id ?? "pm"}
                      mode={paymentMethodId === pm.id ? "contained" : "outlined"}
                      onPress={() => setPaymentMethodId(pm.id ?? "")}
                    >
                      {pm.label || pm.id}
                    </Button>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.termsRow}>
              <Text>I accept the terms and conditions</Text>
              <Switch value={termsAccepted} onValueChange={setTermsAccepted} />
            </View>

            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!fuelTypeId || !litres || !deliveryAddressId || !termsAccepted}
              style={styles.submit}
            >
              Place order
            </Button>
            {createMutation.isError ? (
              <Text style={styles.error}>{(createMutation.error as Error)?.message ?? "Failed to create order"}</Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    scroll: { padding: 16, paddingBottom: 40, gap: 10 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    sectionCard: { backgroundColor: theme.colors.surface, borderRadius: 14 },
    menuAnchor: { marginTop: 8, justifyContent: "space-between" },
    dropdownButtonContent: { justifyContent: "space-between" },
    dropdownList: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant || theme.colors.outline,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
      padding: 6,
      gap: 2,
    },
    dropdownItem: {
      justifyContent: "flex-start",
      borderRadius: 8,
      marginVertical: 1,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
    chip: { marginBottom: 4 },
    input: { marginTop: 8, backgroundColor: theme.colors.surface },
    row: { flexDirection: "row", gap: 8 },
    flex: { flex: 1 },
    mt: { marginTop: 12 },
    hint: { color: theme.colors.onSurfaceVariant, marginTop: 4 },
    termsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
    submit: { marginTop: 16 },
    error: { color: theme.colors.error, marginTop: 8 },
  });
