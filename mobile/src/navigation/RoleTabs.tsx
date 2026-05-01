import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  CompanyFleetScreen,
  CompanyOrdersScreen,
  CompanyOverviewScreen,
  CompanyProfileScreen,
} from "@/features/roles/RoleScreens";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

const Tab = createBottomTabNavigator();

/**
 * Company role bottom tabs — theme matches driver/supplier/customer (dynamic light/dark).
 */
export function RoleTabs() {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline },
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
