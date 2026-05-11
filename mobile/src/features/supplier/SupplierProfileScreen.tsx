import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { signOut } from "@/services/api/auth";

function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

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
  const compliance = (complianceQuery.data as any) ?? {};
  const overallStatus = compliance.overallStatus ?? compliance.overall_status ?? "pending";
  const canAccessPlatform = Boolean(compliance.canAccessPlatform ?? compliance.can_access_platform);
  const checklist = compliance.checklist ?? {};
  const requiredDocs = asStringList(checklist.required);
  const missingDocs = asStringList(checklist.missing);
  const approvedDocs = asStringList(checklist.approved);
  const pendingDocs = asStringList(checklist.pending);
  const rejectedDocs = asStringList(checklist.rejected);

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

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Compliance</Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                overallStatus === "approved"
                  ? styles.badgeSuccess
                  : overallStatus === "rejected"
                    ? styles.badgeDanger
                    : styles.badgeMuted,
              ]}
            >
              <Text style={styles.badgeText}>Status: {toTitleCase(String(overallStatus))}</Text>
            </View>
            <View style={[styles.badge, canAccessPlatform ? styles.badgeSuccess : styles.badgeMuted]}>
              <Text style={styles.badgeText}>{canAccessPlatform ? "Platform access: Yes" : "Platform access: No"}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <Text style={styles.summaryItem}>Required: {requiredDocs.length}</Text>
            <Text style={styles.summaryItem}>Approved: {approvedDocs.length}</Text>
            <Text style={styles.summaryItem}>Pending: {pendingDocs.length}</Text>
            <Text style={styles.summaryItem}>Rejected: {rejectedDocs.length}</Text>
            <Text style={styles.summaryItem}>Missing: {missingDocs.length}</Text>
          </View>

          {requiredDocs.length > 0 ? (
            <View style={styles.listWrap}>
              <Text style={styles.sectionLabel}>Required document checklist</Text>
              {requiredDocs.map((doc) => {
                const state = rejectedDocs.includes(doc)
                  ? "Rejected"
                  : approvedDocs.includes(doc)
                    ? "Approved"
                    : pendingDocs.includes(doc)
                      ? "Pending"
                      : missingDocs.includes(doc)
                        ? "Missing"
                        : "Not uploaded";
                return (
                  <View key={doc} style={styles.listRow}>
                    <Text style={styles.listTitle}>{toTitleCase(doc)}</Text>
                    <Text style={styles.listStatus}>{state}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.meta}>No checklist available yet.</Text>
          )}
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
    badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
    badgeText: { fontSize: 12, fontWeight: "600", color: theme.colors.onSurface },
    badgeSuccess: { backgroundColor: modeColor(theme, "success") },
    badgeDanger: { backgroundColor: modeColor(theme, "danger") },
    badgeMuted: { backgroundColor: theme.colors.surfaceVariant },
    summaryGrid: { marginTop: 12, gap: 4 },
    summaryItem: { color: theme.colors.onSurfaceVariant, fontSize: 13 },
    sectionLabel: { marginTop: 12, marginBottom: 8, fontWeight: "700", color: theme.colors.onSurface },
    listWrap: { marginTop: 2 },
    listRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outlineVariant,
    },
    listTitle: { flex: 1, color: theme.colors.onSurface, marginRight: 8 },
    listStatus: { color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: "600" },
    center: p.center,
  });
};

function modeColor(theme: typeof lightTheme, kind: "success" | "danger") {
  if (kind === "success") return theme.dark ? "#1E3A2E" : "#D9F5E4";
  return theme.dark ? "#4B1E1E" : "#FDE2E2";
}
