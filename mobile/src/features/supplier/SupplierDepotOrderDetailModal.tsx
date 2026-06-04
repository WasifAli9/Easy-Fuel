import { useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, View } from "react-native";
import { ModalSafeArea } from "@/components/ModalSafeArea";
import { ModalScreenHeader } from "@/components/ModalScreenHeader";
import { formatMoneyFromCents } from "@/lib/format-currency";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiClient } from "@/services/api/client";
import { openStoredDocument } from "@/lib/files";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { downloadAndShareSupplierInvoicePdf } from "@/features/supplier/supplierInvoicePdf";
import {
  formatOrderStatusLabel,
  fuelIconName,
  getDriverDisplayName,
  mutationErrorMessage,
  type SupplierDepotOrder,
} from "@/features/supplier/supplierDepotOrderHelpers";

type SupplierDepotOrderDetailModalProps = {
  order: SupplierDepotOrder | null;
  visible: boolean;
  onDismiss: () => void;
};

export function SupplierDepotOrderDetailModal({ order, visible, onDismiss }: SupplierDepotOrderDetailModalProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/supplier/driver-depot-orders"] });
  };

  const acceptMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/accept`),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Order accepted", "The driver can proceed with payment.");
      onDismiss();
    },
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/reject`, { reason }),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Order rejected", "The driver has been notified.");
      onDismiss();
    },
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/verify-payment`),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Payment confirmed", "Order is ready for fuel release.");
      onDismiss();
    },
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/reject-payment`, { reason }),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Payment rejected", "The driver will be notified.");
      onDismiss();
    },
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  const releaseFuelMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.post(`/api/supplier/driver-depot-orders/${orderId}/release`),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Fuel released", "The driver will be notified to sign for receipt.");
      onDismiss();
    },
    onError: (e) => Alert.alert("Error", mutationErrorMessage(e)),
  });

  if (!order) return null;

  const fuelLabel = order.fuel_types?.label ?? "Fuel";
  const statusLabel = formatOrderStatusLabel(order);
  const isBusy =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    verifyPaymentMutation.isPending ||
    rejectPaymentMutation.isPending ||
    releaseFuelMutation.isPending;

  const confirmRelease = () => {
    Alert.alert(
      "Release fuel",
      `Release ${order.litres ?? 0} L of ${fuelLabel} to ${getDriverDisplayName(order)}? The driver will sign for receipt.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release",
          onPress: () => releaseFuelMutation.mutate(order.id),
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onDismiss}>
      <ModalSafeArea style={styles.safe}>
        <ModalScreenHeader title={`Order #${order.id.slice(0, 8)}`} onClose={onDismiss} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{statusLabel}</Text>
          </View>

          <Text style={styles.row}>
            <Text style={styles.label}>Driver: </Text>
            {getDriverDisplayName(order)}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Depot: </Text>
            {order.depots?.name ?? "—"}
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Fuel: </Text>
            {fuelLabel}
          </Text>
          <View style={styles.volumeRow}>
            <MaterialCommunityIcons name={fuelIconName(fuelLabel)} size={18} color={theme.colors.onSurfaceVariant} />
            <Text style={styles.volumeText}>
              {order.litres ?? 0} L · {formatMoneyFromCents(order.total_price_cents ?? 0)}
            </Text>
          </View>
          {order.created_at ? (
            <Text style={styles.meta}>Created {new Date(order.created_at).toLocaleString("en-ZA")}</Text>
          ) : null}

          <Text variant="titleSmall" style={styles.actionsTitle}>
            Actions
          </Text>

          {order.status === "pending" ? (
            <View style={styles.actions}>
              <Button
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                onPress={() => acceptMutation.mutate(order.id)}
                loading={acceptMutation.isPending}
                disabled={isBusy}
              >
                Accept order
              </Button>
              <TextInput
                mode="outlined"
                label="Reject reason (optional)"
                value={rejectReason}
                onChangeText={setRejectReason}
                style={styles.input}
              />
              <Button
                onPress={() => rejectMutation.mutate({ orderId: order.id, reason: rejectReason || undefined })}
                loading={rejectMutation.isPending}
                disabled={isBusy}
              >
                Reject order
              </Button>
            </View>
          ) : null}

          {order.status === "pending_payment" &&
          order.payment_status === "paid" &&
          order.payment_method === "bank_transfer" &&
          order.payment_proof_url ? (
            <View style={styles.actions}>
              <Button
                mode="outlined"
                icon="eye-outline"
                onPress={async () => {
                  try {
                    await openStoredDocument(order.payment_proof_url);
                  } catch (e) {
                    Alert.alert("Payment proof", mutationErrorMessage(e));
                  }
                }}
              >
                View payment proof
              </Button>
              <Button
                mode="contained"
                onPress={() => verifyPaymentMutation.mutate(order.id)}
                loading={verifyPaymentMutation.isPending}
                disabled={isBusy}
              >
                Confirm payment
              </Button>
              <Button
                onPress={() => rejectPaymentMutation.mutate({ orderId: order.id })}
                loading={rejectPaymentMutation.isPending}
                disabled={isBusy}
              >
                Payment not received
              </Button>
            </View>
          ) : null}

          {order.status === "ready_for_pickup" ? (
            <View style={styles.actions}>
              <Text style={styles.hint}>
                Confirm fuel is ready, then release it so the driver can sign for receipt (same as the web portal).
              </Text>
              <Button
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                icon="gas-station"
                onPress={confirmRelease}
                loading={releaseFuelMutation.isPending}
                disabled={isBusy}
              >
                Release fuel
              </Button>
            </View>
          ) : null}

          {order.status === "awaiting_signature" || order.status === "released" ? (
            <Text style={styles.hint}>Waiting for the driver to sign for receipt. No action needed from you.</Text>
          ) : null}

          {order.status === "completed" ? (
            <View style={styles.actions}>
              <Button
                mode="contained"
                icon="download-outline"
                loading={pdfLoading}
                onPress={async () => {
                  setPdfLoading(true);
                  try {
                    await downloadAndShareSupplierInvoicePdf(order.id);
                  } catch (e) {
                    Alert.alert("PDF", mutationErrorMessage(e));
                  } finally {
                    setPdfLoading(false);
                  }
                }}
              >
                Download PDF
              </Button>
            </View>
          ) : null}

          {![
            "pending",
            "pending_payment",
            "ready_for_pickup",
            "awaiting_signature",
            "released",
            "completed",
          ].includes(order.status) ? (
            <Text style={styles.hint}>No actions available for this status right now.</Text>
          ) : null}
        </ScrollView>
      </ModalSafeArea>
    </Modal>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    body: { padding: 16, paddingBottom: 32, gap: 8 },
    statusRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
    },
    statusLabel: { fontWeight: "700", color: theme.colors.onSurfaceVariant },
    statusValue: { fontWeight: "800", color: theme.colors.primary },
    row: { fontSize: 15, color: theme.colors.onSurface },
    label: { fontWeight: "700", color: theme.colors.onSurfaceVariant },
    volumeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    volumeText: { fontSize: 16, fontWeight: "700", color: theme.colors.onSurface },
    meta: { color: theme.colors.onSurfaceVariant, marginTop: 4 },
    actionsTitle: { marginTop: 16, marginBottom: 4, fontWeight: "800" },
    actions: { gap: 10, marginTop: 4 },
    input: p.input,
    hint: { color: theme.colors.onSurfaceVariant, lineHeight: 20, marginBottom: 4 },
  });
};
