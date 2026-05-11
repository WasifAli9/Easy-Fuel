import { darkTheme, lightTheme } from "@/design/theme";

export type AppTheme = typeof lightTheme | typeof darkTheme;

export function getFuelPortalTokens(theme: AppTheme, isDark: boolean) {
  const primary = theme.colors.primary;
  return {
    canvas: theme.colors.background,
    headerBg: isDark ? theme.colors.surface : "#FFFFFF",
    heroBg: isDark ? theme.colors.primaryContainer : "#115E59",
    heroOn: isDark ? theme.colors.onPrimaryContainer : "#FFFFFF",
    heroMuted: isDark ? "#9ECFC4" : "rgba(255,255,255,0.72)",
    heroKicker: isDark ? "#C8EDE4" : "rgba(255,255,255,0.88)",
    accentPositive: "#22C55E",
    accentPositiveSoft: isDark ? "rgba(34,197,94,0.22)" : "#DCFCE7",
    accentPositiveText: isDark ? "#86EFAC" : "#166534",
    accentPositiveStrong: isDark ? "#4ADE80" : "#15803D",
    badgeActiveTint: isDark ? "rgba(13, 148, 136, 0.22)" : "#CCFBF1",
    badgeActiveText: isDark ? "#99F6E4" : "#0F766E",
    borderSubtle: theme.colors.outline,
    cardRadius: 18,
    heroRadius: 28,
    brandText: primary,
    tabBarActive: primary,
    shadowCard: isDark
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 5,
        }
      : {
          shadowColor: "#0D9488",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.12,
          shadowRadius: 22,
          elevation: 8,
        },
  };
}

export function fuelPortalTabBarOptions(theme: AppTheme, isDark: boolean) {
  const t = getFuelPortalTokens(theme, isDark);
  return {
    headerShown: false,
    tabBarActiveTintColor: t.tabBarActive,
    tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
    tabBarStyle: {
      backgroundColor: isDark ? theme.colors.surface : "#FFFFFF",
      borderTopColor: t.borderSubtle,
      borderTopWidth: 1,
      height: 62,
      paddingBottom: 8,
      paddingTop: 6,
    },
    tabBarLabelStyle: {
      fontSize: 12,
      fontWeight: "600" as const,
    },
  };
}
