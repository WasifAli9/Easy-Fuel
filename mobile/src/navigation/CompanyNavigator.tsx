import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  CompanyFleetScreen,
  CompanyOrdersScreen,
  CompanyOverviewScreen,
  CompanyProfileScreen,
} from "@/features/roles/RoleScreens";
import { PortalShell, type PortalMenuItem } from "@/navigation/PortalShell";
import { PortalSettingsScreen } from "@/features/common/PortalSettingsScreen";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

const Tab = createBottomTabNavigator();

const companyMenuItems: PortalMenuItem[] = [
  { key: "portal", label: "Company Portal", icon: "domain" },
  { key: "overview", label: "Overview", icon: "chart-line" },
  { key: "fleet", label: "Fleet", icon: "truck-outline" },
  { key: "orders", label: "Orders", icon: "clipboard-list-outline" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
  { key: "settings", label: "Settings", icon: "cog-outline" },
];

type CompanySection = "portal" | "overview" | "fleet" | "orders" | "profile" | "settings";

function CompanyTabNavigator() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#EA580C",
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: "#FFEDD5",
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
            CompanyOverview: "chart-line",
            CompanyFleet: "truck-outline",
            CompanyOrders: "clipboard-list-outline",
            CompanyProfile: "account-circle-outline",
          };
          return (
            <MaterialCommunityIcons name={(iconByRoute[route.name] ?? "circle-outline") as never} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="CompanyOverview" component={CompanyOverviewScreen} options={{ tabBarLabel: "Overview" }} />
      <Tab.Screen name="CompanyFleet" component={CompanyFleetScreen} options={{ tabBarLabel: "Fleet" }} />
      <Tab.Screen name="CompanyOrders" component={CompanyOrdersScreen} options={{ tabBarLabel: "Orders" }} />
      <Tab.Screen name="CompanyProfile" component={CompanyProfileScreen} options={{ tabBarLabel: "Profile" }} />
    </Tab.Navigator>
  );
}

export function CompanyNavigator() {
  const [section, setSection] = useState<CompanySection>("portal");

  const title =
    section === "settings"
      ? "Settings"
      : section === "overview"
        ? "Overview"
        : section === "fleet"
          ? "Fleet"
          : section === "orders"
            ? "Orders"
            : section === "profile"
              ? "Profile"
              : "Company Portal";

  return (
    <PortalShell
      title={title}
      menuTitle="Company Menu"
      brandVariant="company"
      menuItems={companyMenuItems}
      activeMenuKey={section}
      onSelectMenu={(key) => setSection(key as CompanySection)}
    >
      {section === "portal" ? (
        <CompanyTabNavigator />
      ) : section === "overview" ? (
        <CompanyOverviewScreen />
      ) : section === "fleet" ? (
        <CompanyFleetScreen />
      ) : section === "orders" ? (
        <CompanyOrdersScreen />
      ) : section === "profile" ? (
        <CompanyProfileScreen />
      ) : (
        <PortalSettingsScreen />
      )}
    </PortalShell>
  );
}
