import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Menu, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { signOut } from "@/services/api/auth";

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
  email?: string;
  phone?: string;
  company_name?: string;
  trading_as?: string;
  vat_number?: string;
  billing_address_street?: string;
  billing_address_city?: string;
  billing_address_province?: string;
  billing_address_postal_code?: string;
  billing_address_country?: string;
};

export function CustomerProfileScreen() {
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
    setFullName(p.full_name ?? "");
    setPhone(p.phone ?? "");
    setCompanyName(p.company_name ?? "");
    setTradingAs(p.trading_as ?? "");
    setVatNumber(p.vat_number ?? "");
    setBillingStreet(p.billing_address_street ?? "");
    setBillingCity(p.billing_address_city ?? "");
    setBillingProvince(p.billing_address_province ?? "");
    setBillingPostal(p.billing_address_postal_code ?? "");
    setBillingCountry(p.billing_address_country ?? "South Africa");
  }, [profileQuery.data]);

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
    },
  });

  if (profileQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading profile…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="headlineSmall">My profile</Text>
          <Text style={styles.subtitle}>Account details (same fields as the web portal)</Text>
          <TextInput mode="outlined" label="Full name" value={fullName} onChangeText={setFullName} style={styles.input} />
          <Text style={styles.meta}>Email: {profileQuery.data?.email ?? "—"} (read-only)</Text>
          <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Company</Text>
          <TextInput mode="outlined" label="Company name" value={companyName} onChangeText={setCompanyName} style={styles.input} />
          <TextInput mode="outlined" label="Trading as" value={tradingAs} onChangeText={setTradingAs} style={styles.input} />
          <TextInput mode="outlined" label="VAT number" value={vatNumber} onChangeText={setVatNumber} style={styles.input} />
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Billing address</Text>
          <TextInput mode="outlined" label="Street" value={billingStreet} onChangeText={setBillingStreet} style={styles.input} />
          <TextInput mode="outlined" label="City" value={billingCity} onChangeText={setBillingCity} style={styles.input} />
          <Menu
            visible={menuOpen}
            onDismiss={() => setMenuOpen(false)}
            anchor={
              <Button mode="outlined" onPress={() => setMenuOpen(true)} style={styles.input}>
                Province: {billingProvince || "Select"}
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
          <TextInput mode="outlined" label="Postal code" value={billingPostal} onChangeText={setBillingPostal} style={styles.input} />
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
      {saveMutation.isError ? <Text style={styles.error}>{(saveMutation.error as Error).message}</Text> : null}

      <Button mode="contained-tonal" onPress={() => void signOut()} style={styles.signOut}>
        Sign out
      </Button>
    </ScrollView>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 14, gap: 12, paddingBottom: 32 },
    card: { backgroundColor: theme.colors.surface },
    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    input: { marginTop: 8, backgroundColor: theme.colors.surface },
    meta: { marginTop: 8, color: theme.colors.onSurfaceVariant },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    error: { color: theme.colors.error },
    signOut: { marginTop: 8 },
  });
