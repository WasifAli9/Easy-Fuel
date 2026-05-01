import { ReactNode, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { signOut } from "@/services/api/auth";

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
    badgeBg: "#CCFBF1",
    badgeBorder: "#99F6E4",
    badgeText: "#0F766E",
    iconName: "gas-station" as const,
    menuActiveBg: "#DBEAFE",
  },
  supplier: {
    badgeBg: "#DBEAFE",
    badgeBorder: "#BFDBFE",
    badgeText: "#1E3A8A",
    iconName: "warehouse" as const,
    menuActiveBg: "#DBEAFE",
  },
  company: {
    badgeBg: "#FFEDD5",
    badgeBorder: "#FED7AA",
    badgeText: "#9A3412",
    iconName: "domain" as const,
    menuActiveBg: "#FFEDD5",
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
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const brand = brandStylesByVariant[brandVariant];
  const styles = getStyles(theme, brand.menuActiveBg);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => setMenuVisible(true)} style={styles.menuButton}>
          <MaterialCommunityIcons name="menu" size={24} color={theme.colors.onSurface} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text variant="titleLarge" style={styles.headerTitle}>
            {title}
          </Text>
          <View style={[styles.brandPill, { backgroundColor: brand.badgeBg, borderColor: brand.badgeBorder }]}>
            <MaterialCommunityIcons name={brand.iconName} size={14} color={brand.badgeText} />
            <Text style={[styles.brandPillText, { color: brand.badgeText }]}>EasyFuel</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>{children}</View>

      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sideMenu}>
            <Text variant="titleMedium" style={styles.menuTitle}>
              {menuTitle}
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

const getStyles = (theme: typeof lightTheme, menuActiveBg: string) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 60,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
    },
    menuButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitleWrap: {
      flex: 1,
      marginLeft: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    headerTitle: {
      color: theme.colors.onSurface,
      fontWeight: "600",
    },
    brandPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    brandPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#0F766E",
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
      paddingBottom: 10,
      color: theme.colors.onSurface,
      fontWeight: "700",
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
      borderRadius: 10,
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
