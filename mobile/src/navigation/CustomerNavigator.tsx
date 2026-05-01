import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  CustomerAddressesScreen,
  CustomerOrdersScreen,
  CustomerProfileScreen,
} from "@/features/roles/RoleScreens";
import { CustomerPaymentMethodsScreen } from "@/features/customer/CustomerPaymentMethodsScreen";
import { PortalShell, type PortalMenuItem } from "@/navigation/PortalShell";
import { PortalSettingsScreen } from "@/features/common/PortalSettingsScreen";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

const Tab = createBottomTabNavigator();

const customerMenuItems: PortalMenuItem[] = [
  { key: "portal", label: "Customer Portal", icon: "home-outline" },
  { key: "addresses", label: "Saved Addresses", icon: "map-marker-outline" },
  { key: "payment-methods", label: "Payment methods", icon: "credit-card-outline" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
  { key: "settings", label: "Settings", icon: "cog-outline" },
];

type CustomerSection = "portal" | "addresses" | "payment-methods" | "profile" | "settings";

function CustomerTabNavigator() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0F766E",
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: "#CFFAFE",
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
            CustomerHome: "home-outline",
            CustomerAddresses: "map-marker-outline",
            CustomerProfile: "account-circle-outline",
          };
          return (
            <MaterialCommunityIcons name={(iconByRoute[route.name] ?? "circle-outline") as never} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="CustomerHome" component={CustomerOrdersScreen} options={{ tabBarLabel: "Dashboard" }} />
      <Tab.Screen name="CustomerAddresses" component={CustomerAddressesScreen} options={{ tabBarLabel: "Addresses" }} />
      <Tab.Screen name="CustomerProfile" component={CustomerProfileScreen} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  const [section, setSection] = useState<CustomerSection>("portal");

  const title =
    section === "settings"
      ? "Settings"
      : section === "payment-methods"
        ? "Payment methods"
        : section === "addresses"
            ? "Saved Addresses"
            : section === "profile"
              ? "Profile"
              : "Customer Portal";

  return (
    <PortalShell
      title={title}
      menuTitle="Customer Menu"
      brandVariant="customer"
      menuItems={customerMenuItems}
      activeMenuKey={section}
      onSelectMenu={(key) => setSection(key as CustomerSection)}
    >
      {section === "portal" ? (
        <CustomerTabNavigator />
      ) : section === "addresses" ? (
        <CustomerAddressesScreen />
      ) : section === "payment-methods" ? (
        <CustomerPaymentMethodsScreen />
      ) : section === "profile" ? (
        <CustomerProfileScreen />
      ) : (
        <PortalSettingsScreen />
      )}
    </PortalShell>
  );
}
