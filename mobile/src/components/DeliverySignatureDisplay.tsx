import { Image, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  formatDeliverySignedAt,
  getDeliverySignatureFromOrder,
  type DeliverySignatureOrderFields,
} from "@/lib/delivery-signature";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Props = {
  order: DeliverySignatureOrderFields;
};

export function DeliverySignatureDisplay({ order }: Props) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const proof = getDeliverySignatureFromOrder(order);

  if (!proof.hasProof) {
    return null;
  }

  const signedAtLabel = formatDeliverySignedAt(proof.signedAt);
  const styles = getStyles(theme);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="draw" size={18} color={theme.colors.onSurface} />
        <Text style={styles.title}>Proof of delivery</Text>
      </View>

      {proof.signatureName ? (
        <View style={styles.field}>
          <Text style={styles.label}>Signed by</Text>
          <Text style={styles.value}>{proof.signatureName}</Text>
        </View>
      ) : null}

      {signedAtLabel ? (
        <View style={styles.field}>
          <Text style={styles.label}>Date & time</Text>
          <Text style={styles.value}>{signedAtLabel}</Text>
        </View>
      ) : null}

      {proof.imageUri ? (
        <View style={styles.field}>
          <Text style={styles.label}>Signature</Text>
          <View style={styles.imageBox}>
            <Image source={{ uri: proof.imageUri }} style={styles.signatureImage} resizeMode="contain" />
          </View>
        </View>
      ) : proof.signatureData && !proof.imageUri ? (
        <Text style={styles.hint}>Signature recorded (image not stored for this delivery).</Text>
      ) : null}
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
    imageBox: {
      marginTop: 4,
      padding: 8,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    signatureImage: { width: 220, height: 100 },
    hint: { fontSize: 12, color: theme.colors.onSurfaceVariant },
  });
