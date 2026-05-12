import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SignInScreen } from "@/features/auth/screens/SignInScreen";
import { useAuth } from "@/contexts/AuthContext";
import { RootStackParamList, type UserRole } from "@/navigation/types";
import { RoleTabs } from "@/navigation/RoleTabs";
import { initializeRoleCapabilities } from "@/services/mobile-capabilities";
import { DriverNavigator } from "@/navigation/DriverNavigator";
import { SupplierNavigator } from "@/navigation/SupplierNavigator";
import { CustomerNavigator } from "@/navigation/CustomerNavigator";

const Stack = createNativeStackNavigator<RootStackParamList>();

const MOBILE_APP_ROLES: readonly UserRole[] = ["customer", "driver", "supplier", "company"];

function SplashScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}

export function RootNavigator() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const role = user?.role;
    if (role && role !== "admin" && (MOBILE_APP_ROLES as readonly string[]).includes(role)) {
      void initializeRoleCapabilities(role as UserRole).catch(() => {
        // Capability initialization failures should not block core app access.
      });
    }
  }, [user?.role]);

  if (isLoading) {
    return <SplashScreen />;
  }

  const role = user?.role ?? null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="AuthSignIn" component={SignInScreen} />
      ) : role === "driver" ? (
        <Stack.Screen name="DriverHome" component={DriverNavigator} />
      ) : role === "supplier" ? (
        <Stack.Screen name="SupplierHome" component={SupplierNavigator} />
      ) : role === "company" ? (
        <Stack.Screen name="CompanyHome" component={RoleTabs} />
      ) : (
        <Stack.Screen name="CustomerRoot" component={CustomerNavigator} />
      )}
    </Stack.Navigator>
  );
}
