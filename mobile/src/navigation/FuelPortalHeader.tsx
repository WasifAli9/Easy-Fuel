import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { EasyFuelLogo } from "@/design/EasyFuelLogo";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { apiClient } from "@/services/api/client";
import { resolveProfilePhotoDisplayUri } from "@/lib/profile-photo-display";

type FuelPortalHeaderProps = {
  onOpenMenu: () => void;
};

/**
 * Top bar: logo + wordmark (opens menu) and avatar affordance (opens menu) — matches portal reference layout.
 */
export function FuelPortalHeader({ onOpenMenu }: FuelPortalHeaderProps) {
  const insets = useSafeAreaInsets();
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";
  const t = getFuelPortalTokens(theme, isDark);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const authMeQuery = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () =>
      (await apiClient.get("/api/auth/me")).data as {
        profile?: { profile_photo_url?: string | null; profilePhotoUrl?: string | null };
      },
    staleTime: 60_000,
  });

  const rawPhotoUrl =
    authMeQuery.data?.profile?.profile_photo_url ?? authMeQuery.data?.profile?.profilePhotoUrl ?? null;

  const avatarQuery = useQuery({
    queryKey: ["profile-photo-display", "fuel-header", rawPhotoUrl],
    enabled: authMeQuery.isSuccess && Boolean(rawPhotoUrl),
    staleTime: 5 * 60_000,
    queryFn: () => resolveProfilePhotoDisplayUri(rawPhotoUrl),
  });

  const avatarUri = avatarQuery.data ?? null;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [rawPhotoUrl, avatarUri]);

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          backgroundColor: t.headerBg,
          borderBottomColor: t.borderSubtle,
        },
      ]}
    >
      <Pressable
        onPress={onOpenMenu}
        style={styles.leftBrand}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <EasyFuelLogo size={40} borderRadius={10} />
        <Text style={[styles.wordmark, { color: t.brandText }]}>EasyFuel</Text>
      </Pressable>
      <View style={styles.rightCluster}>
        <ThemeModeToggle />
        <Pressable
          onPress={onOpenMenu}
          style={[
            styles.avatar,
            {
              borderColor: t.borderSubtle,
              backgroundColor: isDark ? theme.colors.surfaceVariant : theme.colors.primaryContainer,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Account and menu"
        >
          {avatarUri && !avatarLoadFailed ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatarImage}
              resizeMode="cover"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <MaterialCommunityIcons name="account" size={26} color={t.brandText} />
          )}
        </Pressable>
      </View>
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
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
});
