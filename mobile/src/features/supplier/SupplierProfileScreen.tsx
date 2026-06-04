import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { ProfilePhotoPicker } from "@/components/ProfilePhotoPicker";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useAuth } from "@/contexts/AuthContext";
import { formatSnakeCaseLabel } from "@/lib/format-labels";

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function SupplierProfileScreen() {
  const { logout } = useAuth();
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
    const p = profileQuery.data as Record<string, unknown> | undefined;
    if (!p) return;
    setFullName(String(p.full_name ?? p.fullName ?? ""));
    setPhone(String(p.phone ?? ""));
    setStreet(String(p.address_street ?? p.addressStreet ?? ""));
    setCity(String(p.address_city ?? p.addressCity ?? ""));
    setProvince(String(p.address_province ?? p.addressProvince ?? ""));
    setPostal(String(p.address_postal_code ?? p.addressPostalCode ?? ""));
    setCountry(String(p.address_country ?? p.addressCountry ?? "South Africa"));
  }, [profileQuery.dataUpdatedAt]);

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
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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
      <View style={styles.pageHeader}>
        <Text variant="headlineSmall">My Profile</Text>
        <Text style={styles.pageSubtitle}>Manage your account information</Text>
      </View>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Personal Information</Text>
          <Text style={styles.sectionSubtitle}>Your basic account details</Text>
          <ProfilePhotoPicker
            role="supplier"
            photoUrl={(p?.profile_photo_url ?? p?.profilePhotoUrl) as string | null | undefined}
          />
          <Text style={styles.meta}>
            Status: {p?.status} · KYB: {p?.kyb_status ?? p?.kybStatus} · Compliance:{" "}
            {p?.compliance_status ?? p?.complianceStatus}
          </Text>
          <TextInput mode="outlined" label="Full Name" value={fullName} onChangeText={setFullName} style={styles.input} />
          <Text style={styles.meta}>Email: {p?.email ?? "—"}</Text>
          <Text style={styles.metaHint}>Email cannot be changed</Text>
          <TextInput mode="outlined" label="Phone Number" value={phone} onChangeText={setPhone} style={styles.input} />
          <Text variant="titleMedium" style={styles.addressTitle}>
            Address
          </Text>
          <Text style={styles.sectionSubtitle}>Your registered business address</Text>
          <TextInput mode="outlined" label="Street Address" value={street} onChangeText={setStreet} style={styles.input} />
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
              <Text style={styles.badgeText}>Status: {formatSnakeCaseLabel(String(overallStatus))}</Text>
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
                    <Text style={styles.listTitle}>{formatSnakeCaseLabel(doc)}</Text>
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

      <Button mode="contained-tonal" onPress={() => void logout()}>
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
    pageHeader: { marginBottom: 4, paddingHorizontal: 4 },
    pageSubtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 15 },
    card: p.sectionCard,
    sectionSubtitle: { ...p.subtitle, marginBottom: 12 },
    addressTitle: { marginTop: 16 },
    meta: { marginTop: 6, color: theme.colors.onSurface },
    metaHint: { marginTop: 2, fontSize: 12, color: theme.colors.onSurfaceVariant },
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
