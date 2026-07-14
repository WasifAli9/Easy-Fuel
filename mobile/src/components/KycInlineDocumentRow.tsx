import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button } from "@/design/paper-button";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { formatSnakeCaseLabel } from "@/lib/format-labels";
import { useUiThemeStore } from "@/store/ui-theme-store";

export type KycInlineDocument = {
  doc_type: string;
  title?: string;
  file_path?: string | null;
  verification_status?: string | null;
  created_at?: string | null;
};

export function findKycDocument(
  documents: KycInlineDocument[] | undefined,
  docType: string,
  aliases: string[] = [],
): KycInlineDocument | undefined {
  const keys = new Set([docType, ...aliases]);
  return (documents ?? []).find((row) => keys.has(row.doc_type));
}

export function kycDocumentIcon(docType: string): string {
  const map: Record<string, string> = {
    cipc_certificate: "office-building-outline",
    vat_certificate: "file-percent-outline",
    tax_clearance: "file-certificate-outline",
    dmre_license: "gas-station-outline",
    site_license: "warehouse",
    environmental_authorisation: "leaf",
    fire_certificate: "fire",
    sabs_certificate: "flask-outline",
    calibration_certificate: "gauge",
    public_liability_insurance: "shield-check-outline",
    za_id: "card-account-details-outline",
    id_document: "card-account-details-outline",
    passport: "passport",
    proof_of_address: "map-marker-outline",
    drivers_license: "card-text-outline",
    prdp: "badge-account-horizontal-outline",
    prdp_document: "badge-account-horizontal-outline",
    dangerous_goods_training: "school-outline",
    criminal_check: "shield-search",
    banking_proof: "bank-outline",
    bank_proof: "bank-outline",
    medical_fitness: "heart-pulse",
  };
  return map[docType] ?? "file-document-outline";
}

function statusChipStyle(label: string, isDark: boolean) {
  if (label === "approved") {
    return {
      backgroundColor: isDark ? "rgba(34, 197, 94, 0.22)" : "#DCFCE7",
      textColor: isDark ? "#86EFAC" : "#166534",
    };
  }
  if (label === "rejected") {
    return {
      backgroundColor: isDark ? "rgba(239, 68, 68, 0.22)" : "#FEE2E2",
      textColor: isDark ? "#FCA5A5" : "#991B1B",
    };
  }
  if (label === "draft") {
    return {
      backgroundColor: isDark ? "rgba(148, 163, 184, 0.22)" : "#E2E8F0",
      textColor: isDark ? "#CBD5E1" : "#475569",
    };
  }
  return {
    backgroundColor: isDark ? "rgba(251, 191, 36, 0.18)" : "#FEF3C7",
    textColor: isDark ? "#FCD34D" : "#92400E",
  };
}

type Props = {
  label?: string;
  docType: string;
  title: string;
  required?: boolean;
  aliases?: string[];
  documents: KycInlineDocument[] | undefined;
  uploading: boolean;
  downloading: boolean;
  optional?: boolean;
  onUpload: (docType: string, title: string) => void;
  onDownload: (doc: KycInlineDocument) => void;
};

export function KycInlineDocumentRow({
  label,
  docType,
  title,
  required = true,
  optional,
  aliases = [],
  documents,
  uploading,
  downloading,
  onUpload,
  onDownload,
}: Props) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const styles = getStyles(theme, isDark);

  const isRequired = optional === undefined ? required : !optional;
  const uploaded = findKycDocument(documents, docType, aliases);
  const normalizedStatus = (uploaded?.verification_status || "pending").toLowerCase();
  const statusLabel =
    normalizedStatus === "verified" || normalizedStatus === "approved"
      ? "approved"
      : normalizedStatus === "rejected"
        ? "rejected"
        : normalizedStatus === "draft"
          ? "draft"
          : "pending";
  const chip = statusChipStyle(statusLabel, isDark);
  const iconName = kycDocumentIcon(docType);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name={iconName as never} size={18} color={theme.colors.primary} />
        <Text variant="labelLarge" style={styles.label}>
          {label ?? `${title} (PDF)`}
          {isRequired ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: chip.backgroundColor }]}>
          <Text style={[styles.statusBadgeText, { color: chip.textColor }]}>
            {formatSnakeCaseLabel(statusLabel)}
          </Text>
        </View>
      </View>
      <Text style={styles.hint}>
        {isRequired ? "Required" : "Optional"} · PDF only
        {uploaded?.created_at
          ? ` · Uploaded ${new Date(uploaded.created_at).toLocaleDateString("en-ZA")}`
          : " · Not uploaded yet"}
      </Text>
      <View style={styles.actions}>
        <Button
          mode="outlined"
          compact
          icon="download-outline"
          loading={downloading}
          onPress={() => uploaded && downloadDocSafe(uploaded, onDownload)}
          disabled={!uploaded?.file_path || downloading}
          style={styles.actionBtn}
          contentStyle={styles.actionBtnContent}
          labelStyle={styles.actionBtnLabel}
        >
          Download
        </Button>
        <Button
          mode="contained"
          compact
          icon={uploaded ? "file-replace" : "file-upload-outline"}
          buttonColor={theme.colors.primary}
          textColor={theme.colors.onPrimary}
          loading={uploading}
          onPress={() => onUpload(docType, title)}
          style={styles.actionBtn}
          contentStyle={styles.actionBtnContent}
          labelStyle={styles.actionBtnLabel}
        >
          {uploaded ? "Replace" : "Upload"}
        </Button>
      </View>
    </View>
  );
}

function downloadDocSafe(doc: KycInlineDocument, onDownload: (doc: KycInlineDocument) => void) {
  if (doc.file_path) onDownload(doc);
}

function getStyles(theme: typeof lightTheme, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outlineVariant,
      gap: 6,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    label: {
      flex: 1,
      fontWeight: "600",
      color: theme.colors.onSurface,
      paddingTop: 1,
    },
    requiredMark: {
      color: "#DC2626",
      fontWeight: "700",
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      flexShrink: 0,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      lineHeight: 14,
      textAlign: "center",
    },
    hint: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      lineHeight: 17,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    actionBtn: {
      flex: 1,
      borderRadius: buttonBorderRadius,
    },
    actionBtnContent: {
      paddingVertical: 0,
      minHeight: 34,
    },
    actionBtnLabel: {
      fontSize: 12,
      marginVertical: 0,
    },
  });
}
