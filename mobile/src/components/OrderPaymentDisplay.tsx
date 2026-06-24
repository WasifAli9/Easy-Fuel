import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  formatOrderPaidAt,
  formatOrderPaymentAmount,
  getOrderPaymentFromOrder,
  type OrderPaymentOrderFields,
} from "@/lib/order-payment-proof";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Props = {
  order: OrderPaymentOrderFields;
};

export function OrderPaymentDisplay({ order }: Props) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const proof = getOrderPaymentFromOrder(order);

  if (!proof.hasProof) {
    return null;
  }

  const paidAtLabel = formatOrderPaidAt(proof.paidAt);
  const amountLabel = formatOrderPaymentAmount(proof.amountCents);
  const styles = getStyles(theme);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="credit-card-outline" size={18} color={theme.colors.onSurface} />
        <Text style={styles.title}>Payment received</Text>
      </View>

      {amountLabel ? (
        <View style={styles.field}>
          <Text style={styles.label}>Amount paid</Text>
          <Text style={styles.value}>{amountLabel}</Text>
        </View>
      ) : null}

      {paidAtLabel ? (
        <View style={styles.field}>
          <Text style={styles.label}>Paid at</Text>
          <Text style={styles.value}>{paidAtLabel}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Payment method</Text>
        <Text style={styles.value}>Ozow</Text>
      </View>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme) =>
  StyleSheet.create({
    wrap: {
      marginTop: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.surfaceVariant,
      gap: 10,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { fontWeight: "700", fontSize: 15, color: theme.colors.onSurface },
    field: { gap: 4 },
    label: { fontSize: 12, fontWeight: "600", color: theme.colors.onSurfaceVariant },
    value: { fontSize: 15, fontWeight: "600", color: theme.colors.onSurface },
  });
