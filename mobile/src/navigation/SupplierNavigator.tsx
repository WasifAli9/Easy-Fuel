import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  SupplierDashboardScreen,
  SupplierDepotsScreen,
  SupplierProfileScreen,
  SupplierSubscriptionScreen,
} from "@/features/roles/RoleScreens";
import { PortalShell, type PortalMenuItem } from "@/navigation/PortalShell";
import { PortalSettingsScreen } from "@/features/common/PortalSettingsScreen";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { SupplierDepotOrdersPanel } from "@/features/supplier/SupplierDepotOrdersPanel";
import { SupplierPricingScreen } from "@/features/supplier/SupplierPricingScreen";
import { SupplierReceiptScreen } from "@/features/supplier/SupplierReceiptScreen";

const Tab = createBottomTabNavigator();

const supplierMenuItems: PortalMenuItem[] = [
  { key: "portal", label: "Supplier Portal", icon: "view-dashboard-outline" },
  { key: "depot-orders", label: "Depot Orders", icon: "clipboard-list-outline" },
  { key: "depots", label: "Depots", icon: "map-marker-outline" },
  { key: "pricing", label: "Pricing", icon: "cash-multiple" },
  { key: "receipt", label: "Receipt", icon: "file-document-outline" },
  { key: "subscription", label: "Subscription", icon: "credit-card-outline" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
  { key: "settings", label: "Settings", icon: "cog-outline" },
];

type SupplierSection =
  | "portal"
  | "depot-orders"
  | "depots"
  | "pricing"
  | "receipt"
  | "subscription"
  | "profile"
  | "settings";

function SupplierTabNavigator() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#1D4ED8",
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: "#DBEAFE",
          borderTopWidth: 1,
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
            SupplierDashboard: "view-dashboard-outline",
            SupplierDepots: "map-marker-outline",
            SupplierSubscription: "credit-card-outline",
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
      <Tab.Screen name="SupplierSubscription" component={SupplierSubscriptionScreen} options={{ tabBarLabel: "Billing" }} />
      <Tab.Screen name="SupplierProfile" component={SupplierProfileScreen} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

export function SupplierNavigator() {
  const [section, setSection] = useState<SupplierSection>("portal");

  const title =
    section === "settings"
      ? "Settings"
      : section === "depot-orders"
        ? "Depot Orders"
        : section === "depots"
          ? "Depots"
          : section === "pricing"
            ? "Pricing"
            : section === "receipt"
              ? "Receipt"
              : section === "subscription"
                ? "Subscription"
                : section === "profile"
                  ? "Profile"
                  : "Supplier Portal";

  return (
    <PortalShell
      title={title}
      menuTitle="Supplier Menu"
      brandVariant="supplier"
      menuItems={supplierMenuItems}
      activeMenuKey={section}
      onSelectMenu={(key) => setSection(key as SupplierSection)}
    >
      {section === "portal" ? (
        <SupplierTabNavigator />
      ) : section === "depot-orders" ? (
        <SupplierDepotOrdersPanel />
      ) : section === "depots" ? (
        <SupplierDepotsScreen />
      ) : section === "pricing" ? (
        <SupplierPricingScreen />
      ) : section === "receipt" ? (
        <SupplierReceiptScreen />
      ) : section === "subscription" ? (
        <SupplierSubscriptionScreen />
      ) : section === "profile" ? (
        <SupplierProfileScreen />
      ) : (
        <PortalSettingsScreen />
      )}
    </PortalShell>
  );
}
