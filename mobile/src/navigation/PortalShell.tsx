import { ReactNode, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { buttonBorderRadius, darkTheme, lightTheme } from "@/design/theme";
import { FuelPortalHeader } from "@/navigation/FuelPortalHeader";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useAuth } from "@/contexts/AuthContext";

export type PortalMenuItem = {
  key: string;
  label: string;
  icon: string;
};

type PortalShellProps = {
  title: string;
  menuTitle?: string;
  brandVariant?: "customer" | "supplier" | "company";
  menuItems: PortalMenuItem[];
  activeMenuKey: string;
  onSelectMenu: (key: string) => void;
  children: ReactNode;
};

/**
 * Header + slide-out menu shell matching the driver portal (DriverNavigator) layout and styling.
 */
const brandStylesByVariant = {
  customer: {
    menuActiveBgLight: "rgba(13, 148, 136, 0.12)",
    menuActiveBgDark: "rgba(45, 212, 191, 0.16)",
  },
  supplier: {
    menuActiveBgLight: "rgba(13, 148, 136, 0.12)",
    menuActiveBgDark: "rgba(45, 212, 191, 0.16)",
  },
  company: {
    menuActiveBgLight: "rgba(13, 148, 136, 0.12)",
    menuActiveBgDark: "rgba(45, 212, 191, 0.16)",
  },
};

export function PortalShell({
  title,
  menuTitle = "Menu",
  brandVariant = "customer",
  menuItems,
  activeMenuKey,
  onSelectMenu,
  children,
}: PortalShellProps) {
  const { logout } = useAuth();
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const brand = brandStylesByVariant[brandVariant];
  const menuActiveBg = mode === "dark" ? brand.menuActiveBgDark : brand.menuActiveBgLight;
  const styles = getStyles(theme, menuActiveBg);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View style={styles.root}>
      <FuelPortalHeader onOpenMenu={() => setMenuVisible(true)} />

      <View style={styles.content}>{children}</View>

      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sideMenu}>
            <Text variant="titleMedium" style={styles.menuTitle}>
              {menuTitle}
            </Text>
            <Text variant="bodySmall" style={styles.menuContextTitle}>
              {title}
            </Text>
            <ScrollView style={styles.menuList} contentContainerStyle={styles.menuListContent} showsVerticalScrollIndicator={false}>
              {menuItems.map((item) => {
                const selected = item.key === activeMenuKey;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.menuItem, selected && styles.menuItemActive]}
                    onPress={() => {
                      onSelectMenu(item.key);
                      setMenuVisible(false);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as never}
                      size={20}
                      color={selected ? theme.colors.primary : theme.colors.onSurface}
                    />
                    <Text style={[styles.menuItemText, selected && { color: theme.colors.primary }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.menuFooter}>
              <Button
                mode="contained"
                icon="logout"
                onPress={handleSignOut}
                loading={isSigningOut}
                disabled={isSigningOut}
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
              >
                Sign Out
              </Button>
            </View>
          </View>
          <Pressable style={styles.overlayTouch} onPress={() => setMenuVisible(false)} />
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (theme: typeof lightTheme, menuActiveBg: string) => {
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const fp = getFuelPortalTokens(theme, isDark);
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: fp.canvas,
    },
    content: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    sideMenu: {
      width: 300,
      height: "100%",
      backgroundColor: theme.colors.surface,
      borderRightWidth: 1,
      borderRightColor: theme.colors.outline,
    },
    menuTitle: {
      marginHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 4,
      color: theme.colors.onSurface,
      fontWeight: "700",
    },
    menuContextTitle: {
      marginHorizontal: 14,
      paddingBottom: 10,
      color: theme.colors.onSurfaceVariant,
    },
    menuList: {
      flex: 1,
    },
    menuListContent: {
      paddingHorizontal: 8,
      paddingBottom: 8,
      gap: 2,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 11,
      borderRadius: buttonBorderRadius,
    },
    menuItemActive: {
      backgroundColor: menuActiveBg,
    },
    menuItemText: {
      color: theme.colors.onSurface,
      fontSize: 17,
    },
    menuFooter: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: theme.colors.outline,
      backgroundColor: theme.colors.surface,
    },
    overlayTouch: {
      flex: 1,
    },
  });
};
