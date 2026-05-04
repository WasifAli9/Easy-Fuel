import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { downloadAndShareSupplierInvoicePdf } from "@/features/supplier/supplierInvoicePdf";

type InvoiceRow = {
  id: string;
  depotName?: string;
  fuelType?: string;
  litres?: number;
  totalCents?: number;
  completedAt?: string;
};

function formatZarFromCents(totalCents: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(totalCents / 100);
}

/**
 * Same data and PDF endpoint as web `SupplierInvoicesTab` + `/api/supplier/invoices/:id/pdf?download=1`.
 */
export function SupplierReceiptScreen() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const subscriptionQuery = useQuery({
    queryKey: ["/api/supplier/subscription"],
    queryFn: async () => (await apiClient.get("/api/supplier/subscription")).data,
  });

  const hasActiveSub = useMemo(() => {
    const sub = subscriptionQuery.data as
      | { subscription?: { isActive?: boolean; status?: string }; subscriptionTier?: string | null }
      | undefined;
    if (!sub) return false;
    return !!sub.subscriptionTier && (sub.subscription?.isActive ?? sub.subscription?.status === "active");
  }, [subscriptionQuery.data]);

  const invoicesQuery = useQuery({
    queryKey: ["/api/supplier/invoices"],
    queryFn: async () => (await apiClient.get<{ invoices: InvoiceRow[] }>("/api/supplier/invoices")).data,
    enabled: hasActiveSub,
  });

  if (subscriptionQuery.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!hasActiveSub) {
    return (
      <View style={styles.container}>
        <View style={styles.locked}>
          <MaterialCommunityIcons name="file-document-outline" size={48} color={theme.colors.outline} />
          <Text style={styles.lockedText}>Subscribe to view and download invoices.</Text>
        </View>
      </View>
    );
  }

  if (invoicesQuery.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (invoicesQuery.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load invoices.</Text>
      </View>
    );
  }

  const invoices = invoicesQuery.data?.invoices ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Card mode="contained" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            Invoices
          </Text>
          <Text style={styles.cardSubtitle}>Completed driver depot orders (download as PDF).</Text>

          {invoices.length === 0 ? (
            <Text style={styles.empty}>No invoices yet.</Text>
          ) : (
            <View style={styles.list}>
              {invoices.map((inv, index) => (
                <View
                  key={inv.id}
                  style={[styles.row, index < invoices.length - 1 && styles.rowBorder]}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowPrimary}>
                      {inv.depotName || "Depot"} - {inv.fuelType || "Fuel"}
                    </Text>
                    <Text style={styles.rowSecondary}>
                      Order #{String(inv.id || "").slice(0, 8).toUpperCase()} •{" "}
                      {inv.completedAt ? new Date(inv.completedAt).toLocaleDateString() : "No date"} • {inv.litres ?? 0}{" "}
                      L
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.amount}>{formatZarFromCents(inv.totalCents ?? 0)}</Text>
                    <Button
                      mode="text"
                      compact
                      icon="download"
                      textColor={theme.colors.primary}
                      loading={pdfLoadingId === inv.id}
                      disabled={pdfLoadingId != null && pdfLoadingId !== inv.id}
                      onPress={async () => {
                        setPdfLoadingId(inv.id);
                        try {
                          await downloadAndShareSupplierInvoicePdf(inv.id);
                        } catch (e) {
                          const msg =
                            (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                            (e as Error).message ||
                            "Could not download PDF.";
                          Alert.alert("PDF", msg);
                        } finally {
                          setPdfLoadingId(null);
                        }
                      }}
                      style={styles.pdfBtn}
                    >
                      PDF
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    container: p.screenContainer,
    scroll: { ...p.screenScrollContentCompact, paddingBottom: 32 },
    card: { ...p.hero, marginBottom: 8 },
    cardTitle: { fontWeight: "700", color: theme.colors.onSurface },
    cardSubtitle: { marginTop: 6, fontSize: 14, color: theme.colors.onSurfaceVariant, lineHeight: 20 },
    empty: { marginTop: 12, fontSize: 14, color: theme.colors.onSurfaceVariant },
    list: { marginTop: 16 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      gap: 12,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    rowLeft: { flex: 1, minWidth: 0 },
    rowRight: { alignItems: "flex-end", gap: 4 },
    rowPrimary: { fontSize: 15, fontWeight: "600", color: theme.colors.onSurface },
    rowSecondary: { marginTop: 4, fontSize: 12, color: theme.colors.onSurfaceVariant },
    amount: { fontSize: 15, fontWeight: "600", color: theme.colors.onSurface },
    pdfBtn: { marginRight: -8 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
    lockedText: { textAlign: "center", color: theme.colors.onSurfaceVariant, fontSize: 15, lineHeight: 22 },
    error: { ...p.errorText, textAlign: "center", marginTop: 24 },
  });
};
