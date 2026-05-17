import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Menu, Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { ProfilePhotoPicker } from "@/components/ProfilePhotoPicker";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useAuth } from "@/contexts/AuthContext";

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

type Profile = {
  full_name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  profile_photo_url?: string | null;
  profilePhotoUrl?: string | null;
  company_name?: string;
  companyName?: string;
  trading_as?: string;
  tradingAs?: string;
  vat_number?: string;
  vatNumber?: string;
  billing_address_street?: string;
  billingAddressStreet?: string;
  billing_address_city?: string;
  billingAddressCity?: string;
  billing_address_province?: string;
  billingAddressProvince?: string;
  billing_address_postal_code?: string;
  billingAddressPostalCode?: string;
  billing_address_country?: string;
  billingAddressCountry?: string;
};

function field(p: Profile | undefined, snake: keyof Profile, camel: keyof Profile) {
  if (!p) return "";
  const v = p[snake] ?? p[camel];
  return v != null ? String(v) : "";
}

export function CustomerProfileScreen() {
  const { logout } = useAuth();
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["/api/profile"],
    queryFn: async () => (await apiClient.get<Profile>("/api/profile")).data,
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [tradingAs, setTradingAs] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [billingStreet, setBillingStreet] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingProvince, setBillingProvince] = useState("");
  const [billingPostal, setBillingPostal] = useState("");
  const [billingCountry, setBillingCountry] = useState("South Africa");

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setFullName(field(p, "full_name", "fullName"));
    setPhone(field(p, "phone", "phone"));
    setCompanyName(field(p, "company_name", "companyName"));
    setTradingAs(field(p, "trading_as", "tradingAs"));
    setVatNumber(field(p, "vat_number", "vatNumber"));
    setBillingStreet(field(p, "billing_address_street", "billingAddressStreet"));
    setBillingCity(field(p, "billing_address_city", "billingAddressCity"));
    setBillingProvince(field(p, "billing_address_province", "billingAddressProvince"));
    setBillingPostal(field(p, "billing_address_postal_code", "billingAddressPostalCode"));
    setBillingCountry(field(p, "billing_address_country", "billingAddressCountry") || "South Africa");
  }, [profileQuery.dataUpdatedAt]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.put("/api/profile", {
        fullName,
        phone,
        companyName,
        tradingAs,
        vatNumber,
        billingAddressStreet: billingStreet,
        billingAddressCity: billingCity,
        billingAddressProvince: billingProvince,
        billingAddressPostalCode: billingPostal,
        billingAddressCountry: billingCountry,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  if (profileQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading profile…</Text>
      </View>
    );
  }

  const photoUrl =
    profileQuery.data?.profile_photo_url ?? profileQuery.data?.profilePhotoUrl ?? null;

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
          <ProfilePhotoPicker role="customer" photoUrl={photoUrl} />
          <TextInput mode="outlined" label="Full Name" value={fullName} onChangeText={setFullName} style={styles.input} />
          <Text style={styles.meta}>Email: {profileQuery.data?.email ?? "—"}</Text>
          <Text style={styles.metaHint}>Email cannot be changed</Text>
          <TextInput
            mode="outlined"
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Company Information</Text>
          <Text style={styles.sectionSubtitle}>Optional business details</Text>
          <TextInput mode="outlined" label="Company Name" value={companyName} onChangeText={setCompanyName} style={styles.input} />
          <TextInput mode="outlined" label="Trading As" value={tradingAs} onChangeText={setTradingAs} style={styles.input} />
          <TextInput mode="outlined" label="VAT Number" value={vatNumber} onChangeText={setVatNumber} style={styles.input} />
        </Card.Content>
      </Card>

      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Billing Address</Text>
          <Text style={styles.sectionSubtitle}>Your default billing address</Text>
          <TextInput mode="outlined" label="Street Address" value={billingStreet} onChangeText={setBillingStreet} style={styles.input} />
          <TextInput mode="outlined" label="City" value={billingCity} onChangeText={setBillingCity} style={styles.input} />
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchor={
              <Button mode="outlined" onPress={() => setMenuOpen(true)} style={styles.input}>
                Province: {billingProvince || "Select province"}
              </Button>
            }
          >
            {PROVINCES.map((p) => (
              <Menu.Item
                key={p}
                onPress={() => {
                  setBillingProvince(p);
                  setMenuOpen(false);
                }}
                title={p}
              />
            ))}
          </Menu>
          <TextInput mode="outlined" label="Postal Code" value={billingPostal} onChangeText={setBillingPostal} style={styles.input} />
          <TextInput mode="outlined" label="Country" value={billingCountry} onChangeText={setBillingCountry} style={styles.input} />
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        buttonColor={theme.colors.primary}
        textColor={theme.colors.onPrimary}
        onPress={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
      >
        Save changes
      </Button>
      {saveMutation.isSuccess ? <Text style={styles.success}>Profile updated successfully.</Text> : null}
      {saveMutation.isError ? <Text style={styles.error}>{(saveMutation.error as Error).message}</Text> : null}

      <Button mode="contained-tonal" onPress={() => void logout()} style={styles.signOut}>
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
    input: p.input,
    meta: { marginTop: 8, color: theme.colors.onSurface },
    metaHint: { marginTop: 2, fontSize: 12, color: theme.colors.onSurfaceVariant },
    center: p.center,
    error: p.errorText,
    success: { marginTop: 8, color: theme.colors.primary },
    signOut: { marginTop: 8, borderRadius: buttonBorderRadius },
  });
};
