import { StyleSheet } from "react-native";
import type { lightTheme } from "@/design/theme";

export type PortalTheme = typeof lightTheme;

/**
 * Shared layout + surfaces aligned with the driver KYC screen (clean cards, hero band, spacing).
 * Merge into screen-specific StyleSheet.create({ ...getPortalUiStyleDefs(theme), ... }).
 */
export function getPortalUiStyleDefs(theme: PortalTheme) {
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const statTintPrimary = isDark ? "rgba(38, 237, 217, 0.14)" : "#ECFEFF";
  const statBorderPrimary = isDark ? "rgba(38, 237, 217, 0.35)" : "#99F6E4";
  const statTintSecondary = isDark ? "rgba(129, 140, 248, 0.18)" : "#EEF2FF";
  const statBorderSecondary = isDark ? "rgba(129, 140, 248, 0.35)" : "#C7D2FE";

  return {
    screenContainer: { flex: 1, backgroundColor: theme.colors.background },
    screenScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 36,
      gap: 14,
    },
    screenScrollContentCompact: { padding: 14, gap: 12, paddingBottom: 28 },

    hero: {
      borderRadius: 16,
      padding: 18,
      backgroundColor: theme.colors.surface,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.07,
      shadowRadius: 10,
      elevation: 3,
    },
    heroTopRow: { flexDirection: "row" as const, alignItems: "flex-start" as const },
    heroIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    heroTextCol: { flex: 1, marginLeft: 14 },
    heroTitle: { fontWeight: "700" as const, color: theme.colors.onSurface },
    heroSubtitle: { marginTop: 6, color: theme.colors.onSurfaceVariant, lineHeight: 22 },

    brandRow: { marginBottom: 6, flexDirection: "row" as const, justifyContent: "flex-end" as const },
    brandPill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: statBorderPrimary,
      backgroundColor: statTintPrimary,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    brandPillText: {
      fontSize: 12,
      fontWeight: "700" as const,
      color: isDark ? theme.colors.primary : "#0E7490",
    },

    sectionKicker: {
      color: theme.colors.primary,
      fontWeight: "700" as const,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
      marginBottom: 4,
    },
    blockTitle: { marginTop: 4, fontWeight: "700" as const, color: theme.colors.onSurface },
    blockHint: { color: theme.colors.onSurfaceVariant, lineHeight: 20, marginBottom: 4 },

    sectionCard: {
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.outline,
    },
    sectionCardContent: { paddingVertical: 10 },

    listCard: {
      borderRadius: 14,
      marginBottom: 2,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.outline,
    },

    subtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    meta: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    metaStrong: { marginTop: 2, marginBottom: 2, color: theme.colors.onSurface, fontWeight: "600" as const },
    muted: { color: theme.colors.onSurfaceVariant },

    input: { marginTop: 8, backgroundColor: theme.colors.surface },
    row: { flexDirection: "row" as const, gap: 8, marginTop: 10, flexWrap: "wrap" as const },
    rowBetween: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    twoCol: { marginTop: 8, gap: 8 },

    statsRow: { flexDirection: "row" as const, gap: 10, flexWrap: "wrap" as const },
    statCard: {
      flex: 1,
      minWidth: 140,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.outline,
    },
    statCardActive: {
      backgroundColor: statTintPrimary,
      borderWidth: 1,
      borderColor: statBorderPrimary,
    },
    statCardRecent: {
      backgroundColor: statTintSecondary,
      borderWidth: 1,
      borderColor: statBorderSecondary,
    },
    statLabelActive: { color: isDark ? theme.colors.primary : "#0E7490", fontWeight: "700" as const },
    statLabelRecent: { color: isDark ? "#A5B4FC" : "#4338CA", fontWeight: "700" as const },

    empty: {
      textAlign: "center" as const,
      marginTop: 24,
      color: theme.colors.onSurfaceVariant,
      paddingVertical: 16,
    },
    center: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const },

    primaryButton: { marginTop: 12, alignSelf: "flex-start" as const, borderRadius: 10 },
    primaryButtonCompact: { borderRadius: 8 },
    primaryButtonContent: {
      paddingVertical: 4,
      paddingHorizontal: 14,
      minHeight: 40,
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },

    errorText: { marginTop: 8, color: theme.colors.error },
    planDetailBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.background,
    },

    headerCard: {
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.outline,
    },
    itemCard: {
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.outline,
    },
    itemSubtitle: { marginTop: 4, color: theme.colors.onSurfaceVariant },
    centerWrap: { alignItems: "center" as const, justifyContent: "center" as const, paddingVertical: 32 },
    errorCard: {
      borderRadius: 14,
      borderColor: theme.colors.error,
      borderWidth: 1,
      backgroundColor: theme.colors.surface,
    },
    retryButton: { marginTop: 12, alignSelf: "flex-start" as const },
    headerButton: { marginTop: 12, alignSelf: "flex-start" as const },

    mt8: { marginTop: 8 },
  };
}

export function createPortalUiStyles(theme: PortalTheme) {
  return StyleSheet.create(getPortalUiStyleDefs(theme));
}
