import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { DriverOrdersScreen } from "@/features/driver/DriverOrdersScreen";
import { DriverVehiclesScreen } from "@/features/driver/DriverVehiclesScreen";
import { DriverDepotScreen } from "@/features/driver/DriverDepotScreen";
import { signOut } from "@/services/api/auth";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useUiOverlayStore } from "@/store/ui-overlay-store";
import {
  DriverHistoryMenuScreen,
  DriverKycDocumentsScreen,
  DriverNotificationsMenuScreen,
  DriverPricingMenuScreen,
  DriverProfileMenuScreen,
  DriverSettingsMenuScreen,
  DriverSubscriptionMenuScreen,
} from "@/features/driver/DriverMenuScreens";

const Tab = createBottomTabNavigator();

type DriverScreenKey =
  | "portal"
  | "profile"
  | "kyc"
  | "subscription"
  | "notifications"
  | "pricing"
  | "history"
  | "settings";

type MenuItem = {
  key: DriverScreenKey;
  label: string;
  icon: string;
};

const menuItems: MenuItem[] = [
  { key: "portal", label: "Driver Portal", icon: "view-dashboard-outline" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
  { key: "kyc", label: "KYC Documents", icon: "file-document-outline" },
  { key: "subscription", label: "Subscription", icon: "credit-card-outline" },
  { key: "notifications", label: "Notifications", icon: "bell-outline" },
  { key: "pricing", label: "Pricing", icon: "cash-multiple" },
  { key: "history", label: "History", icon: "history" },
  { key: "settings", label: "Settings", icon: "cog-outline" },
];

function DriverPortalTabs() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        tabBarIcon: ({ color, size }) => {
          const iconByRoute: Record<string, string> = {
            DriverOrders: "truck-delivery-outline",
            DriverVehicles: "car-outline",
            DriverDepot: "warehouse",
          };
          return (
            <MaterialCommunityIcons
              name={(iconByRoute[route.name] ?? "circle-outline") as never}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="DriverOrders" component={DriverOrdersScreen} options={{ title: "Orders" }} />
      <Tab.Screen name="DriverVehicles" component={DriverVehiclesScreen} options={{ title: "Vehicles" }} />
      <Tab.Screen name="DriverDepot" component={DriverDepotScreen} options={{ title: "Depot" }} />
    </Tab.Navigator>
  );
}

export function DriverNavigator() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const hideDriverHeader = useUiOverlayStore((state) => state.hideDriverHeader);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeScreen, setActiveScreen] = useState<DriverScreenKey>("portal");

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const activeTitle = menuItems.find((item) => item.key === activeScreen)?.label ?? "Driver Portal";

  const renderContent = () => {
    switch (activeScreen) {
      case "profile":
        return <DriverProfileMenuScreen />;
      case "kyc":
        return <DriverKycDocumentsScreen />;
      case "subscription":
        return <DriverSubscriptionMenuScreen />;
      case "notifications":
        return <DriverNotificationsMenuScreen />;
      case "pricing":
        return <DriverPricingMenuScreen />;
      case "history":
        return <DriverHistoryMenuScreen />;
      case "settings":
        return <DriverSettingsMenuScreen />;
      case "portal":
      default:
        return <DriverPortalTabs />;
    }
  };

  return (
    <View style={styles.root}>
      {!hideDriverHeader ? (
        <View style={styles.header}>
          <Pressable onPress={() => setMenuVisible(true)} style={styles.menuButton}>
            <MaterialCommunityIcons name="menu" size={24} color={theme.colors.onSurface} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text variant="titleLarge" style={styles.headerTitle}>
              {activeTitle}
            </Text>
            <View style={styles.brandPill}>
              <MaterialCommunityIcons name="gas-station" size={14} color={theme.colors.primary} />
              <Text style={styles.brandPillText}>EasyFuel</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.content}>{renderContent()}</View>

      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sideMenu}>
            <Text variant="titleMedium" style={styles.menuTitle}>
              Driver Menu
            </Text>
            <ScrollView style={styles.menuList} contentContainerStyle={styles.menuListContent} showsVerticalScrollIndicator={false}>
              {menuItems.map((item) => {
                const selected = item.key === activeScreen;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.menuItem, selected && styles.menuItemActive]}
                    onPress={() => {
                      setActiveScreen(item.key);
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

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const menuActiveBg = isDark ? "rgba(38, 237, 217, 0.14)" : "rgba(38, 237, 217, 0.16)";
  return StyleSheet.create({
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outline,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
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
    brandPill: p.brandPill,
    brandPillText: p.brandPillText,
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
      paddingTop: 12,
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
};
