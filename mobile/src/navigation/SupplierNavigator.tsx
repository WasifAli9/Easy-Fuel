import { useEffect, useMemo, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  SupplierDashboardScreen,
  SupplierDepotsScreen,
  SupplierProfileScreen,
} from "@/features/roles/RoleScreens";
import { PortalShell, type PortalMenuItem } from "@/navigation/PortalShell";
import { fuelPortalTabBarOptions } from "@/design/fuel-portal-tokens";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SupplierDepotOrdersPanel } from "@/features/supplier/SupplierDepotOrdersPanel";
import { SupplierPricingScreen } from "@/features/supplier/SupplierPricingScreen";
import { SupplierReceiptScreen } from "@/features/supplier/SupplierReceiptScreen";
import { PortalNotificationsScreen } from "@/features/common/PortalNotificationsScreen";
import { SupplierKycDocumentsScreen } from "@/features/supplier/SupplierKycDocumentsScreen";
import { useNotificationDeepLinkStore } from "@/store/notification-deep-link-store";

const Tab = createBottomTabNavigator();

const supplierMenuItems: PortalMenuItem[] = [
  { key: "portal", label: "Supplier Portal", icon: "view-dashboard-outline" },
  { key: "depot-orders", label: "Depot Orders", icon: "clipboard-list-outline" },
  { key: "depots", label: "Depots", icon: "map-marker-outline" },
  { key: "pricing", label: "Pricing", icon: "cash-multiple" },
  { key: "receipt", label: "Receipt", icon: "file-document-outline" },
  { key: "notifications", label: "Notifications", icon: "bell-outline" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
  { key: "kyc", label: "KYC Documents", icon: "file-document-outline" },
];

type SupplierSection =
  | "portal"
  | "depot-orders"
  | "depots"
  | "pricing"
  | "receipt"
  | "notifications"
  | "profile"
  | "kyc";

function SupplierTabNavigator() {
  const insets = useSafeAreaInsets();
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const tabOpts = useMemo(
    () => fuelPortalTabBarOptions(theme, mode === "dark", insets.bottom),
    [theme, mode, insets.bottom],
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...tabOpts,
        tabBarIcon: ({ color, size }) => {
          const iconByRoute: Record<string, string> = {
            SupplierDashboard: "view-dashboard-outline",
            SupplierDepots: "map-marker-outline",
            SupplierProfile: "account-circle-outline",
          };
          return (
            <MaterialCommunityIcons name={(iconByRoute[route.name] ?? "circle-outline") as never} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="SupplierDashboard" component={SupplierDashboardScreen} options={{ tabBarLabel: "Portal" }} />
      <Tab.Screen name="SupplierDepots" component={SupplierDepotsScreen} options={{ tabBarLabel: "Depots" }} />
      <Tab.Screen name="SupplierProfile" component={SupplierProfileScreen} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

export function SupplierNavigator() {
  const [section, setSection] = useState<SupplierSection>("portal");
  const pendingDeepLink = useNotificationDeepLinkStore((s) => s.pending);

  useEffect(() => {
    if (!pendingDeepLink) return;
    if (pendingDeepLink.openDepotOrders || pendingDeepLink.depotOrderId) {
      setSection("depot-orders");
      return;
    }
    if (pendingDeepLink.orderId) {
      setSection("portal");
    }
  }, [pendingDeepLink?.orderId, pendingDeepLink?.depotOrderId, pendingDeepLink?.openDepotOrders]);

  const title =
    section === "depot-orders"
        ? "Depot Orders"
        : section === "depots"
          ? "Depots"
          : section === "pricing"
            ? "Pricing"
            : section === "receipt"
              ? "Receipt"
              : section === "notifications"
                ? "Notifications"
              : section === "profile"
                ? "Profile"
                : section === "kyc"
                  ? "KYC Documents"
                : "Supplier Portal";

  return (
    <PortalShell
      title={title}
      menuTitle="Supplier Menu"
      brandVariant="supplier"
      menuItems={supplierMenuItems}
      activeMenuKey={section}
      onSelectMenu={(key) => setSection(key as SupplierSection)}
      contentUsesTabBar={section === "portal"}
    >
      {section === "portal" ? (
        <SupplierTabNavigator />
      ) : section === "depot-orders" ? (
        <SupplierDepotOrdersPanel listChrome="minimal" />
      ) : section === "depots" ? (
        <SupplierDepotsScreen />
      ) : section === "pricing" ? (
        <SupplierPricingScreen />
      ) : section === "receipt" ? (
        <SupplierReceiptScreen />
      ) : section === "notifications" ? (
        <PortalNotificationsScreen role="supplier" />
      ) : section === "profile" ? (
        <SupplierProfileScreen />
      ) : section === "kyc" ? (
        <SupplierKycDocumentsScreen />
      ) : (
        <SupplierTabNavigator />
      )}
    </PortalShell>
  );
}
