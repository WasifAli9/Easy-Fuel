import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Modal, ScrollView, StyleSheet, View } from "react-native";
import { IconMetaRow, SectionTitleRow } from "@/components/IconMetaRow";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Switch, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import axios from "axios";
import { apiClient } from "@/services/api/client";
import { getCurrentLocation } from "@/services/location";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Address = {
  id: string;
  label?: string;
  address_street?: string;
  address_city?: string;
  address_province?: string;
  address_postal_code?: string;
  address_country?: string;
  lat?: number;
  lng?: number;
  is_default?: boolean;
};

function normalizeAddress(input: Address & Record<string, any>): Address {
  return {
    ...input,
    label: input.label ?? "",
    address_street: input.address_street ?? input.addressStreet ?? "",
    address_city: input.address_city ?? input.addressCity ?? "",
    address_province: input.address_province ?? input.addressProvince ?? "",
    address_postal_code: input.address_postal_code ?? input.addressPostalCode ?? "",
    address_country: input.address_country ?? input.addressCountry ?? "South Africa",
    lat: Number(input.lat ?? 0),
    lng: Number(input.lng ?? 0),
    is_default: Boolean(input.is_default ?? input.isDefault ?? false),
  };
}

function parseCoord(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

function formatSaveError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const serverMsg = (error.response?.data as { error?: string } | undefined)?.error;
    if (serverMsg) return serverMsg;
  }
  return error instanceof Error ? error.message : "Could not save address";
}

export function CustomerAddressesScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["/api/delivery-addresses"],
    queryFn: async () => {
      const rows = (await apiClient.get<Address[]>("/api/delivery-addresses")).data ?? [];
      return rows.map((row) => normalizeAddress(row as Address & Record<string, any>));
    },
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [label, setLabel] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [isDefault, setIsDefault] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoHint, setGeoHint] = useState("");

  const fillLiveCoordinates = useCallback(async () => {
    setGeoLoading(true);
    setGeoHint("");
    try {
      const coords = await getCurrentLocation();
      if (!coords) {
        setGeoHint("Location permission denied. Enter coordinates manually.");
        return;
      }
      setLat(coords.latitude.toFixed(6));
      setLng(coords.longitude.toFixed(6));
      setGeoHint("Coordinates updated from your current location.");
    } catch {
      setGeoHint("Could not read location. Enter coordinates manually.");
    } finally {
      setGeoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!editing) {
      setLabel("");
      setStreet("");
      setCity("");
      setProvince("");
      setPostal("");
      setCountry("South Africa");
      setIsDefault(false);
      setLat("");
      setLng("");
      setGeoHint("");
      return;
    }
    setLabel(editing.label ?? "");
    setStreet(editing.address_street ?? "");
    setCity(editing.address_city ?? "");
    setProvince(editing.address_province ?? "");
    setPostal(editing.address_postal_code ?? "");
    setCountry(editing.address_country ?? "South Africa");
    setIsDefault(!!editing.is_default);
    setLat(editing.lat ? String(editing.lat) : "");
    setLng(editing.lng ? String(editing.lng) : "");
    setGeoHint("");
  }, [editing, modalOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedLat = parseCoord(lat);
      const parsedLng = parseCoord(lng);
      if (parsedLat == null || parsedLng == null) {
        throw new Error("Latitude and longitude are required");
      }
      const body = {
        label,
        addressStreet: street,
        addressCity: city,
        addressProvince: province,
        addressPostalCode: postal,
        addressCountry: country,
        lat: parsedLat,
        lng: parsedLng,
        isDefault,
      };
      if (editing) {
        await apiClient.patch(`/api/delivery-addresses/${editing.id}`, body);
      } else {
        await apiClient.post("/api/delivery-addresses", body);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/delivery-addresses"] });
      setModalOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/delivery-addresses/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/delivery-addresses"] });
    },
  });

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.header}>
        <Card.Content>
          <Text variant="headlineSmall">Saved addresses</Text>
          <Text style={styles.subtitle}>Used when you place fuel orders</Text>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            onPress={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Add address
          </Button>
        </Card.Content>
      </Card>

      <FlatList
        data={listQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={listQuery.isRefetching}
        onRefresh={() => listQuery.refetch()}
        ListEmptyComponent={<Text style={styles.muted}>No addresses yet.</Text>}
        renderItem={({ item }) => (
          <Card mode="outlined" style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall">{item.label || "Address"}</Text>
              <IconMetaRow icon="map-marker-outline" color={theme.colors.onSurfaceVariant} iconColor={theme.colors.onSurfaceVariant}>
                {[item.address_street, item.address_city, item.address_province, item.address_postal_code].filter(Boolean).join(", ")}
              </IconMetaRow>
              {item.is_default ? <Text style={styles.badge}>Default</Text> : null}
              <View style={styles.row}>
                <Button
                  compact
                  icon="pencil-outline"
                  onPress={() => {
                    setEditing(item);
                    setModalOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button compact icon="delete-outline" textColor={theme.colors.error} onPress={() => deleteMutation.mutate(item.id)}>
                  Delete
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}
      />

      <Modal visible={modalOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setModalOpen(false)}>
        <ModalSafeArea style={styles.modal}>
          <ModalScreenHeader
            title={editing ? "Edit address" : "New address"}
            onClose={() => setModalOpen(false)}
          />
          <ScrollView
            style={styles.modalBodyScroll}
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <TextInput mode="outlined" label="Label" value={label} onChangeText={setLabel} style={styles.input} />
            <TextInput mode="outlined" label="Street" value={street} onChangeText={setStreet} style={styles.input} />
            <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
            <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
            <TextInput mode="outlined" label="Postal code" value={postal} onChangeText={setPostal} style={styles.input} />
            <TextInput mode="outlined" label="Country" value={country} onChangeText={setCountry} style={styles.input} />
            <Button
              mode="outlined"
              icon="crosshairs-gps"
              loading={geoLoading}
              onPress={() => fillLiveCoordinates()}
              style={styles.geoButton}
            >
              Get live coordinates
            </Button>
            {geoHint ? <Text style={styles.geoHint}>{geoHint}</Text> : null}
            <View style={styles.coordRow}>
              <TextInput
                mode="outlined"
                label="Latitude"
                value={lat}
                onChangeText={setLat}
                keyboardType="decimal-pad"
                style={[styles.input, styles.coordInput]}
              />
              <TextInput
                mode="outlined"
                label="Longitude"
                value={lng}
                onChangeText={setLng}
                keyboardType="decimal-pad"
                style={[styles.input, styles.coordInput]}
              />
            </View>
            <View style={styles.switchRow}>
              <Text>Default delivery address</Text>
              <Switch value={isDefault} onValueChange={setIsDefault} />
            </View>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              Save
            </Button>
            {saveMutation.isError ? (
              <Text style={styles.error}>{formatSaveError(saveMutation.error)}</Text>
            ) : null}
          </ScrollView>
        </ModalSafeArea>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    header: { ...p.hero, margin: 12 },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant, marginBottom: 8 },
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
    card: p.listCard,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    badge: { marginTop: 4, color: theme.colors.primary, fontWeight: "600" },
    row: { flexDirection: "row", gap: 8, marginTop: 8 },
    muted: { ...p.empty },
    modal: { flex: 1, backgroundColor: theme.colors.background },
    modalBodyScroll: { flex: 1, minHeight: 0 },
    modalBody: { padding: 16, paddingBottom: 28, gap: 8 },
    input: p.input,
    geoButton: { marginTop: 4 },
    geoHint: { color: theme.colors.onSurfaceVariant, fontSize: 13, marginTop: 2 },
    coordRow: { flexDirection: "row", gap: 8 },
    coordInput: { flex: 1 },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 },
    error: p.errorText,
  });
};
