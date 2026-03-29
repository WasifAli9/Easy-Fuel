import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { ComponentType } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { UserRole } from "@/navigation/types";
import { appTheme } from "@/design/theme";
import {
  CompanyFleetScreen,
  CompanyOrdersScreen,
  CompanyOverviewScreen,
  CompanyProfileScreen,
  CustomerAddressesScreen,
  CustomerDashboardScreen,
  CustomerOrdersScreen,
  CustomerProfileScreen,
  DriverProfileScreen,
  SupplierDashboardScreen,
  SupplierDepotsScreen,
  SupplierProfileScreen,
  SupplierSubscriptionScreen,
} from "@/features/roles/RoleScreens";
import { DriverOrdersScreen } from "@/features/driver/DriverOrdersScreen";
import { DriverVehiclesScreen } from "@/features/driver/DriverVehiclesScreen";
import { DriverDepotScreen } from "@/features/driver/DriverDepotScreen";

const Tab = createBottomTabNavigator();

type TabConfig = {
  name: string;
  label: string;
  icon: string;
  component: ComponentType;
};

function getTabsForRole(role: UserRole): TabConfig[] {
  if (role === "driver") {
    return [
      { name: "DriverOrders", label: "Orders", icon: "truck-delivery-outline", component: DriverOrdersScreen },
      { name: "DriverVehicles", label: "Vehicles", icon: "car-outline", component: DriverVehiclesScreen },
      { name: "DriverDepot", label: "Depot", icon: "warehouse", component: DriverDepotScreen },
      { name: "DriverProfile", label: "Profile", icon: "account-circle-outline", component: DriverProfileScreen },
    ];
  }

  if (role === "supplier") {
    return [
      { name: "SupplierDashboard", label: "Dashboard", icon: "view-dashboard-outline", component: SupplierDashboardScreen },
      { name: "SupplierDepots", label: "Depots", icon: "map-marker-outline", component: SupplierDepotsScreen },
      { name: "SupplierSubscription", label: "Subscription", icon: "credit-card-outline", component: SupplierSubscriptionScreen },
      { name: "SupplierProfile", label: "Profile", icon: "account-circle-outline", component: SupplierProfileScreen },
    ];
  }

  if (role === "company") {
    return [
      { name: "CompanyOverview", label: "Overview", icon: "chart-line", component: CompanyOverviewScreen },
      { name: "CompanyFleet", label: "Fleet", icon: "truck-outline", component: CompanyFleetScreen },
      { name: "CompanyOrders", label: "Orders", icon: "clipboard-list-outline", component: CompanyOrdersScreen },
      { name: "CompanyProfile", label: "Profile", icon: "account-circle-outline", component: CompanyProfileScreen },
    ];
  }

  return [
    { name: "CustomerDashboard", label: "Dashboard", icon: "home-outline", component: CustomerDashboardScreen },
    { name: "CustomerOrders", label: "Orders", icon: "clipboard-list-outline", component: CustomerOrdersScreen },
    { name: "CustomerAddresses", label: "Addresses", icon: "map-marker-outline", component: CustomerAddressesScreen },
    { name: "CustomerProfile", label: "Profile", icon: "account-circle-outline", component: CustomerProfileScreen },
  ];
}

export function RoleTabs({ role }: { role: UserRole }) {
  const tabs = getTabsForRole(role);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: appTheme.colors.primary,
        tabBarInactiveTintColor: "#6B7280",
        tabBarStyle: { backgroundColor: appTheme.colors.surface, borderTopColor: appTheme.colors.outline },
        tabBarIcon: ({ color, size }) => {
          const tab = tabs.find((item) => item.name === route.name);
          return <MaterialCommunityIcons name={(tab?.icon ?? "circle-outline") as never} size={size} color={color} />;
        },
      })}
    >
      {tabs.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} options={{ tabBarLabel: tab.label }} />
      ))}
    </Tab.Navigator>
  );
}
