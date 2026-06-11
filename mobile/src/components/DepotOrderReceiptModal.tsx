import { useState } from "react";
import { Alert, Image, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { useModalLayout } from "@/components/modal-layout";
import {
  downloadAndShareDepotReceiptPdf,
  getDepotReceiptDeliverySignature,
  getDepotReceiptDriverName,
  getDepotReceiptFuelLabel,
  resolveDepotReceiptSignatureUri,
  type DepotOrderReceiptFields,
} from "@/features/depot/depotOrderReceipt";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type DepotOrderReceiptModalProps = {
  order: DepotOrderReceiptFields | null;
  visible: boolean;
  onClose: () => void;
  /** When set, shown under the depot name (e.g. supplier view). */
  driverName?: string;
};

export function DepotOrderReceiptModal({ order, visible, onClose, driverName }: DepotOrderReceiptModalProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const { footerPaddingBottom } = useModalLayout();
  const [downloading, setDownloading] = useState(false);

  const resolvedDriver = driverName || (order ? getDepotReceiptDriverName(order) : "");
  const signatureUri = order ? resolveDepotReceiptSignatureUri(getDepotReceiptDeliverySignature(order)) : "";

  const handleDownload = async () => {
    if (!order) return;
    Alert.alert("Downloading", "Please wait while the receipt is being prepared.");
    setDownloading(true);
    try {
      await downloadAndShareDepotReceiptPdf(order);
      Alert.alert("Download complete", "Your receipt is ready. Use the menu to save or share the PDF.");
    } catch (e) {
      Alert.alert("Download failed", (e as Error)?.message || "Could not download receipt.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <ModalSafeArea style={styles.root}>
        <ModalScreenHeader title="Depot Order Receipt" onClose={onClose} />
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: footerPaddingBottom + 88 }]}
          keyboardShouldPersistTaps="handled"
        >
          {order ? (
            <View style={styles.receiptCard}>
              <Text style={styles.brand}>Easy Fuel</Text>
              <Text style={styles.subTitle}>Fuel Collection Receipt</Text>

              <View style={styles.divider} />

              <View style={styles.row}>
                <Text style={styles.label}>Order ID</Text>
                <Text style={styles.value}>#{order.id.slice(-8).toUpperCase()}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Depot</Text>
                <Text style={styles.value}>{order.depots?.name || "-"}</Text>
              </View>
              {resolvedDriver ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Driver</Text>
                  <Text style={styles.value}>{resolvedDriver}</Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <Text style={styles.label}>Fuel</Text>
                <Text style={styles.value}>{getDepotReceiptFuelLabel(order)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Litres</Text>
                <Text style={styles.value}>{order.litres ?? "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Completed</Text>
                <Text style={styles.value}>
                  {order.completed_at
                    ? new Date(order.completed_at).toLocaleString("en-ZA")
                    : order.created_at
                      ? new Date(order.created_at).toLocaleString("en-ZA")
                      : "-"}
                </Text>
              </View>

              <View style={styles.totalWrap}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>{formatMoneyFromCents(order.total_price_cents || 0)}</Text>
              </View>

              <Text style={styles.signatureTitle}>Driver Receipt Signature</Text>
              {signatureUri ? (
                <Image source={{ uri: signatureUri }} style={styles.signature} resizeMode="contain" />
              ) : (
                <Text style={styles.noSignature}>No signature image available.</Text>
              )}
            </View>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          <Button onPress={onClose} style={styles.footerBtn}>
            Close
          </Button>
          <Button
            mode="contained"
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
            icon="download-outline"
            onPress={handleDownload}
            loading={downloading}
            disabled={!order || downloading}
            style={styles.footerBtnPrimary}
          >
            Download
          </Button>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: 14 },
    receiptCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    brand: { fontSize: 22, fontWeight: "700", color: theme.colors.primary },
    subTitle: { marginTop: 2, color: theme.colors.onSurfaceVariant },
    divider: { height: 1, backgroundColor: theme.colors.outline, marginVertical: 10 },
    row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, gap: 10 },
    label: { color: theme.colors.onSurfaceVariant, flex: 1 },
    value: { color: theme.colors.onSurface, flex: 1, textAlign: "right", fontWeight: "600" },
    totalWrap: {
      marginTop: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceVariant,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalLabel: { fontWeight: "700", color: theme.colors.onSurfaceVariant },
    totalValue: { fontSize: 18, fontWeight: "800", color: theme.colors.primary },
    signatureTitle: { marginTop: 12, marginBottom: 8, fontWeight: "700", color: theme.colors.onSurfaceVariant },
    signature: {
      width: "100%",
      height: 120,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      borderRadius: 8,
      backgroundColor: "#FFFFFF",
    },
    noSignature: { ...p.muted, fontStyle: "italic" },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 14,
      paddingTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    footerBtn: { minWidth: 96 },
    footerBtnPrimary: { flex: 1 },
  });
};
