import { useMemo, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  CompanyFleetScreen,
  CompanyOrdersScreen,
  CompanyOverviewScreen,
  CompanyProfileScreen,
} from "@/features/roles/RoleScreens";
import { PortalShell, type PortalMenuItem } from "@/navigation/PortalShell";
import { PortalSettingsScreen } from "@/features/common/PortalSettingsScreen";
import { fuelPortalTabBarOptions } from "@/design/fuel-portal-tokens";
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
      contentUsesTabBar={section === "portal"}
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
