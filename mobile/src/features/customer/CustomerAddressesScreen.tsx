import { useEffect, useState } from "react";
import { FlatList, Modal, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Switch, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
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
    is_default: Boolean(input.is_default ?? input.isDefault ?? false),
  };
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

  useEffect(() => {
    if (!editing) {
      setLabel("");
      setStreet("");
      setCity("");
      setProvince("");
      setPostal("");
      setCountry("South Africa");
      setIsDefault(false);
      return;
    }
    setLabel(editing.label ?? "");
    setStreet(editing.address_street ?? "");
    setCity(editing.address_city ?? "");
    setProvince(editing.address_province ?? "");
    setPostal(editing.address_postal_code ?? "");
    setCountry(editing.address_country ?? "South Africa");
    setIsDefault(!!editing.is_default);
  }, [editing, modalOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        label,
        addressStreet: street,
        addressCity: city,
        addressProvince: province,
        addressPostalCode: postal,
        addressCountry: country,
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
      <Card style={styles.header}>
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
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall">{item.label || "Address"}</Text>
              <Text style={styles.meta}>
                {[item.address_street, item.address_city, item.address_province, item.address_postal_code].filter(Boolean).join(", ")}
              </Text>
              {item.is_default ? <Text style={styles.badge}>Default</Text> : null}
              <View style={styles.row}>
                <Button
                  onPress={() => {
                    setEditing(item);
                    setModalOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button textColor={theme.colors.error} onPress={() => deleteMutation.mutate(item.id)}>
                  Delete
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}
      />

      <Modal visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text variant="titleLarge">{editing ? "Edit address" : "New address"}</Text>
            <Button onPress={() => setModalOpen(false)}>Close</Button>
          </View>
          <View style={styles.modalBody}>
            <TextInput mode="outlined" label="Label" value={label} onChangeText={setLabel} style={styles.input} />
            <TextInput mode="outlined" label="Street" value={street} onChangeText={setStreet} style={styles.input} />
            <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
            <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
            <TextInput mode="outlined" label="Postal code" value={postal} onChangeText={setPostal} style={styles.input} />
            <TextInput mode="outlined" label="Country" value={country} onChangeText={setCountry} style={styles.input} />
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
            {saveMutation.isError ? <Text style={styles.error}>{(saveMutation.error as Error).message}</Text> : null}
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
    list: { paddingHorizontal: 12, paddingBottom: 24, gap: 10 },
    card: { backgroundColor: theme.colors.surface },
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    badge: { marginTop: 4, color: theme.colors.primary, fontWeight: "600" },
    row: { flexDirection: "row", gap: 8, marginTop: 8 },
    muted: { textAlign: "center", color: theme.colors.onSurfaceVariant, marginTop: 24 },
    modal: { flex: 1, backgroundColor: theme.colors.background },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    modalBody: { padding: 16, gap: 8 },
    input: { backgroundColor: theme.colors.surface },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 },
    error: { color: theme.colors.error },
  });
