import { Image, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { EasyFuelLogo } from "@/design/EasyFuelLogo";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { apiClient } from "@/services/api/client";
import { normalizeFilePath, resolveApiUrl } from "@/lib/files";
import { appConfig } from "@/services/config";

type FuelPortalHeaderProps = {
  onOpenMenu: () => void;
};

/**
 * Top bar: logo + wordmark (opens menu) and avatar affordance (opens menu) — matches portal reference layout.
 */
export function FuelPortalHeader({ onOpenMenu }: FuelPortalHeaderProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const authMeQuery = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => (await apiClient.get("/api/auth/me")).data as { profile?: { profile_photo_url?: string | null } },
    staleTime: 60_000,
  });

  const rawPhotoUrl = authMeQuery.data?.profile?.profile_photo_url ?? null;
  const normalizedPhotoPath = normalizeFilePath(rawPhotoUrl);
  const avatarUri = normalizedPhotoPath
    ? resolveApiUrl(appConfig.apiBaseUrl, normalizedPhotoPath)
    : null;

  return (
    <View style={[styles.bar, { backgroundColor: t.headerBg, borderBottomColor: t.borderSubtle }]}>
      <Pressable
        onPress={onOpenMenu}
        style={styles.leftBrand}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <EasyFuelLogo size={40} borderRadius={10} />
        <Text style={[styles.wordmark, { color: t.brandText }]}>Easy Fuel</Text>
      </Pressable>
      <Pressable
        onPress={onOpenMenu}
        style={[
          styles.avatar,
          { borderColor: t.borderSubtle, backgroundColor: isDark ? theme.colors.surfaceVariant : theme.colors.primaryContainer },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Account and menu"
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <MaterialCommunityIcons name="account" size={26} color={t.brandText} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leftBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
});
