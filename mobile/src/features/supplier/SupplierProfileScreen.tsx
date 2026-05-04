import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { signOut } from "@/services/api/auth";

export function SupplierProfileScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["/api/supplier/profile"],
    queryFn: async () => (await apiClient.get("/api/supplier/profile")).data,
  });
  const complianceQuery = useQuery({
    queryKey: ["/api/supplier/compliance/status"],
    queryFn: async () => (await apiClient.get("/api/supplier/compliance/status")).data,
  });
  const documentsQuery = useQuery({
    queryKey: ["/api/supplier/documents"],
    queryFn: async () => (await apiClient.get<any[]>("/api/supplier/documents")).data ?? [],
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("South Africa");

  useEffect(() => {
    const p = profileQuery.data as any;
    if (!p) return;
    setFullName(p.full_name ?? "");
    setPhone(p.phone ?? "");
    setStreet(p.address_street ?? "");
    setCity(p.address_city ?? "");
    setProvince(p.address_province ?? "");
    setPostal(p.address_postal_code ?? "");
    setCountry(p.address_country ?? "South Africa");
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.put("/api/supplier/profile", {
        fullName,
        phone,
        addressStreet: street,
        addressCity: city,
        addressProvince: province,
        addressPostalCode: postal,
        addressCountry: country,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/supplier/profile"] });
    },
  });

  if (profileQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const p = profileQuery.data as any;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="headlineSmall">Supplier profile</Text>
          <Text style={styles.subtitle}>Business details and compliance (same API as web).</Text>
          <Text style={styles.meta}>
            Status: {p?.status} · KYB: {p?.kyb_status} · Compliance: {p?.compliance_status}
          </Text>
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Contact & address</Text>
          <TextInput mode="outlined" label="Full name" value={fullName} onChangeText={setFullName} style={styles.input} />
          <Text style={styles.meta}>Email: {p?.email ?? "—"}</Text>
          <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} style={styles.input} />
          <TextInput mode="outlined" label="Street" value={street} onChangeText={setStreet} style={styles.input} />
          <TextInput mode="outlined" label="City" value={city} onChangeText={setCity} style={styles.input} />
          <TextInput mode="outlined" label="Province" value={province} onChangeText={setProvince} style={styles.input} />
          <TextInput mode="outlined" label="Postal code" value={postal} onChangeText={setPostal} style={styles.input} />
          <TextInput mode="outlined" label="Country" value={country} onChangeText={setCountry} style={styles.input} />
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          >
            Save
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Compliance</Text>
          <Text style={styles.meta}>{JSON.stringify(complianceQuery.data ?? {}, null, 2)}</Text>
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Documents</Text>
          {(documentsQuery.data ?? []).length === 0 ? (
            <Text style={styles.meta}>No documents uploaded yet.</Text>
          ) : (
            (documentsQuery.data ?? []).map((d: any) => (
              <Text key={d.id} style={styles.meta}>
                {d.doc_type}: {d.status ?? "pending"}
              </Text>
            ))
          )}
          <Text style={styles.hint}>Upload and advanced KYB flows remain available on the web portal.</Text>
        </Card.Content>
      </Card>

      <Button mode="contained-tonal" onPress={() => void signOut()}>
        Sign out
      </Button>
    </ScrollView>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    content: { ...p.screenScrollContentCompact, paddingBottom: 32 },
    card: p.sectionCard,
    subtitle: p.subtitle,
    meta: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    input: p.input,
    hint: { marginTop: 8, color: theme.colors.onSurfaceVariant, fontSize: 12 },
    center: p.center,
  });
};
