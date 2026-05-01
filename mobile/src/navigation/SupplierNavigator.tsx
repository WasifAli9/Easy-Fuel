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

const Tab = createBottomTabNavigator();

const supplierMenuItems: PortalMenuItem[] = [
  { key: "portal", label: "Supplier Portal", icon: "view-dashboard-outline" },
  { key: "dashboard", label: "Workspace", icon: "chart-box-outline" },
  { key: "depot-orders", label: "Depot Orders", icon: "clipboard-list-outline" },
  { key: "depots", label: "Depots", icon: "map-marker-outline" },
  { key: "subscription", label: "Subscription", icon: "credit-card-outline" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
  { key: "settings", label: "Settings", icon: "cog-outline" },
];

type SupplierSection = "portal" | "dashboard" | "depot-orders" | "depots" | "subscription" | "profile" | "settings";

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
      <Tab.Screen name="SupplierDashboard" component={SupplierDashboardScreen} options={{ tabBarLabel: "Workspace" }} />
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
      : section === "dashboard"
        ? "Workspace"
        : section === "depot-orders"
          ? "Depot Orders"
          : section === "depots"
            ? "Depots"
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
      ) : section === "dashboard" ? (
        <SupplierDashboardScreen />
      ) : section === "depot-orders" ? (
        <SupplierDepotOrdersPanel />
      ) : section === "depots" ? (
        <SupplierDepotsScreen />
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
