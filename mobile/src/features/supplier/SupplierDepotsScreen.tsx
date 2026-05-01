import { useState } from "react";
import { FlatList, Modal, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Switch, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Depot = {
  id: string;
  name?: string;
  address_city?: string;
  address_province?: string;
  is_active?: boolean;
  lat?: number;
  lng?: number;
};

export function SupplierDepotsScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [street, setStreet] = useState("");
  const [active, setActive] = useState(true);

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });

  const depotsQuery = useQuery({
    queryKey: ["/api/supplier/depots"],
    queryFn: async () => (await apiClient.get<Depot[]>("/api/supplier/depots")).data ?? [],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/api/supplier/depots", {
        name,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address_city: city,
        address_province: province,
        address_street: street,
        is_active: active,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
      setModalOpen(false);
      setName("");
      setLat("");
      setLng("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/supplier/depots/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/depots"] });
    },
  });

  const kycOk =
    profileQuery.data &&
    (profileQuery.data as any).status === "active" &&
    (profileQuery.data as any).compliance_status === "approved";

  return (
    <View style={styles.container}>
      <Card style={styles.header}>
        <Card.Content>
          <Text variant="headlineSmall">Depots</Text>
          <Text style={styles.subtitle}>Fuel supply locations (aligned with web depot management).</Text>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            onPress={() => {
              if (!kycOk) {
                return;
              }
              setModalOpen(true);
            }}
            disabled={!kycOk}
          >
            Add depot
          </Button>
          {!kycOk ? <Text style={styles.warn}>Complete KYC approval in Profile before adding depots.</Text> : null}
        </Card.Content>
      </Card>

      {depotsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={depotsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No depots yet.</Text>}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium">{item.name}</Text>
                <Text style={styles.meta}>
                  {[item.address_city, item.address_province].filter(Boolean).join(", ") || "—"}
                </Text>
                <Text style={styles.meta}>{item.is_active === false ? "Inactive" : "Active"}</Text>
                <Button textColor={theme.colors.error} onPress={() => deleteMutation.mutate(item.id)}>
                  Delete
                </Button>
              </Card.Content>
            </Card>
          )}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text variant="titleLarge">New depot</Text>
            <Button onPress={() => setModalOpen(false)}>Close</Button>
          </View>
          <View style={styles.modalBody}>
            <TextInput mode="outlined" label="Name" value={name} onChangeText={setName} style={styles.input} />
            <TextInput mode="outlined" label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" style={styles.input} />
            <TextInput mode="outlined" label="Longitude" value={lng} onChangeText={setLng} keyboardType="numeric" style={styles.input} />
            <TextInput mode="outlined" label="Street" value={street} onChangeText={setStreet} style={styles.input} />
            <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
            <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
            <View style={styles.switchRow}>
              <Text>Active</Text>
              <Switch value={active} onValueChange={setActive} />
            </View>
            <Button
              mode="contained"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              onPress={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!name || !lat || !lng}
            >
              Create depot
            </Button>
            {createMutation.isError ? <Text style={styles.error}>{(createMutation.error as Error).message}</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { margin: 12, backgroundColor: theme.colors.surface },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant, marginBottom: 8 },
    warn: { color: "#B45309", marginTop: 8 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
    card: { backgroundColor: theme.colors.surface },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    muted: { textAlign: "center", color: theme.colors.onSurfaceVariant, marginTop: 24 },
    modal: { flex: 1, backgroundColor: theme.colors.background },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    modalBody: { padding: 16, gap: 8 },
    input: { backgroundColor: theme.colors.surface },
    switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    error: { color: theme.colors.error },
  });
