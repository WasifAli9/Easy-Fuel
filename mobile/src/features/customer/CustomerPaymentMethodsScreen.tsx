import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, SegmentedButtons, Switch, Text, TextInput } from "react-native-paper";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type MethodType = "bank_account" | "credit_card" | "debit_card";

type PaymentMethod = {
  id: string;
  method_type: MethodType | string;
  label?: string;
  bank_name?: string;
  account_holder_name?: string;
  account_number?: string;
  branch_code?: string;
  account_type?: string;
  card_last_four?: string;
  card_brand?: string;
  card_expiry_month?: string;
  card_expiry_year?: string;
  is_default?: boolean;
};

export function CustomerPaymentMethodsScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["/api/payment-methods"],
    queryFn: async () => (await apiClient.get<PaymentMethod[]>("/api/payment-methods")).data ?? [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [methodType, setMethodType] = useState<MethodType>("bank_account");
  const [label, setLabel] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [accountType, setAccountType] = useState<"cheque" | "savings" | "transmission">("cheque");
  const [cardLastFour, setCardLastFour] = useState("");
  const [cardBrand, setCardBrand] = useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("");
  const [cardExpiryYear, setCardExpiryYear] = useState("");

  useEffect(() => {
    if (!modalOpen) return;
    setLabel("");
    setIsDefault(false);
    setBankName("");
    setAccountHolderName("");
    setAccountNumber("");
    setBranchCode("");
    setAccountType("cheque");
    setCardLastFour("");
    setCardBrand("");
    setCardExpiryMonth("");
    setCardExpiryYear("");
    setMethodType("bank_account");
  }, [modalOpen]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        methodType,
        label: label.trim() || "Saved method",
        isDefault,
      };
      if (methodType === "bank_account") {
        Object.assign(body, {
          bankName: bankName.trim(),
          accountHolderName: accountHolderName.trim(),
          accountNumber: accountNumber.trim(),
          branchCode: branchCode.trim(),
          accountType,
        });
      } else {
        Object.assign(body, {
          cardLastFour: cardLastFour.trim(),
          cardBrand: cardBrand.trim(),
          cardExpiryMonth: cardExpiryMonth.trim(),
          cardExpiryYear: cardExpiryYear.trim(),
        });
      }
      await apiClient.post("/api/payment-methods", body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/payment-methods/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
    },
  });

  const onSave = () => {
    if (methodType === "bank_account") {
      if (!bankName.trim() || !accountHolderName.trim() || !accountNumber.trim() || !branchCode.trim()) {
        Alert.alert("Missing fields", "Please fill bank name, account holder, account number, and branch code.");
        return;
      }
    } else {
      if (!cardLastFour.trim() || !cardBrand.trim() || !cardExpiryMonth.trim() || !cardExpiryYear.trim()) {
        Alert.alert("Missing fields", "Please fill card details.");
        return;
      }
    }
    createMutation.mutate();
  };

  const formatType = (t: string) => {
    const map: Record<string, string> = {
      bank_account: "Bank account",
      credit_card: "Credit card",
      debit_card: "Debit card",
    };
    return map[t] ?? t;
  };

  return (
    <View style={styles.container}>
      <Card mode="contained" style={styles.header}>
        <Card.Content>
          <Text variant="headlineSmall">Payment methods</Text>
          <Text style={styles.subtitle}>Saved methods for checkout (same data as the web portal).</Text>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            onPress={() => setModalOpen(true)}
          >
            Add payment method
          </Button>
        </Card.Content>
      </Card>

      <FlatList
        data={listQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={listQuery.isRefetching}
        onRefresh={() => listQuery.refetch()}
        ListEmptyComponent={<Text style={styles.muted}>No payment methods yet.</Text>}
        renderItem={({ item }) => (
          <Card mode="outlined" style={styles.methodCard}>
            <Card.Content>
              <View style={styles.rowBetween}>
                <Text variant="titleSmall">{item.label ?? "Method"}</Text>
                {item.is_default ? (
                  <Text style={styles.badge}>Default</Text>
                ) : null}
              </View>
              <Text style={styles.meta}>{formatType(item.method_type)}</Text>
              {item.method_type === "bank_account" ? (
                <>
                  <Text style={styles.meta}>{item.bank_name}</Text>
                  <Text style={styles.meta}>····{String(item.account_number ?? "").slice(-4)}</Text>
                </>
              ) : (
                <Text style={styles.meta}>
                  {item.card_brand} ·····{item.card_last_four}
                </Text>
              )}
              <Button
                mode="text"
                textColor={theme.colors.error}
                onPress={() => {
                  Alert.alert("Remove method", "Remove this payment method?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", onPress: () => deleteMutation.mutate(item.id) },
                  ]);
                }}
              >
                Remove
              </Button>
            </Card.Content>
          </Card>
        )}
      />

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Add payment method
            </Text>
            <SegmentedButtons
              value={methodType}
              onValueChange={(v) => setMethodType(v as MethodType)}
              buttons={[
                { value: "bank_account", label: "Bank" },
                { value: "credit_card", label: "Credit" },
                { value: "debit_card", label: "Debit" },
              ]}
              style={styles.segment}
            />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <TextInput mode="outlined" label="Label" value={label} onChangeText={setLabel} />
              <View style={styles.rowBetween}>
                <Text>Set as default</Text>
                <Switch value={isDefault} onValueChange={setIsDefault} />
              </View>
              {methodType === "bank_account" ? (
                <>
                  <TextInput mode="outlined" label="Bank name" value={bankName} onChangeText={setBankName} />
                  <TextInput mode="outlined" label="Account holder" value={accountHolderName} onChangeText={setAccountHolderName} />
                  <TextInput mode="outlined" label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" />
                  <TextInput mode="outlined" label="Branch code" value={branchCode} onChangeText={setBranchCode} />
                  <SegmentedButtons
                    value={accountType}
                    onValueChange={(v) => setAccountType(v as typeof accountType)}
                    buttons={[
                      { value: "cheque", label: "Cheque" },
                      { value: "savings", label: "Savings" },
                      { value: "transmission", label: "Transmission" },
                    ]}
                  />
                </>
              ) : (
                <>
                  <TextInput mode="outlined" label="Last 4 digits" value={cardLastFour} onChangeText={setCardLastFour} keyboardType="number-pad" maxLength={4} />
                  <TextInput mode="outlined" label="Brand (e.g. Visa)" value={cardBrand} onChangeText={setCardBrand} />
                  <TextInput mode="outlined" label="Expiry month (MM)" value={cardExpiryMonth} onChangeText={setCardExpiryMonth} keyboardType="number-pad" />
                  <TextInput mode="outlined" label="Expiry year (YYYY)" value={cardExpiryYear} onChangeText={setCardExpiryYear} keyboardType="number-pad" />
                </>
              )}
              <View style={styles.modalActions}>
                <Button onPress={() => setModalOpen(false)}>Cancel</Button>
                <Button mode="contained" onPress={onSave} loading={createMutation.isPending} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
                  Save
                </Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(theme: typeof lightTheme) {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    header: { ...p.hero, margin: 12 },
    subtitle: { marginVertical: 8, color: theme.colors.onSurfaceVariant },
    list: { padding: 12, paddingBottom: 32, gap: 10 },
    methodCard: { ...p.listCard, marginBottom: 8 },
    rowBetween: p.rowBetween,
    meta: { color: theme.colors.onSurfaceVariant, marginTop: 4 },
    badge: { fontSize: 12, color: theme.colors.primary, fontWeight: "600" },
    muted: { ...p.empty },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    modalCard: {
      maxHeight: "90%",
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: 3,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      borderLeftColor: theme.colors.primary,
      padding: 16,
    },
    modalTitle: { marginBottom: 8, fontWeight: "700" },
    segment: { marginVertical: 8 },
    form: { gap: 10, paddingBottom: 24 },
    modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  });
}
