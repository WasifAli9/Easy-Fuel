import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SignInScreen } from "@/features/auth/screens/SignInScreen";
import { hydrateSessionFromStorage } from "@/services/api/auth";
import { useSessionStore } from "@/store/session-store";
import { RootStackParamList } from "@/navigation/types";
import { initializeRoleCapabilities } from "@/services/mobile-capabilities";
import { DriverNavigator } from "@/navigation/DriverNavigator";
import { SupplierNavigator } from "@/navigation/SupplierNavigator";
import { CustomerNavigator } from "@/navigation/CustomerNavigator";
import { CompanyNavigator } from "@/navigation/CompanyNavigator";

const Stack = createNativeStackNavigator<RootStackParamList>();

function SplashScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}

export function RootNavigator() {
  const { hydrated, role, accessToken } = useSessionStore();

  useEffect(() => {
    hydrateSessionFromStorage().catch(() => {
      useSessionStore.getState().markHydrated();
    });
  }, []);

  useEffect(() => {
    if (accessToken && role) {
      initializeRoleCapabilities(role).catch(() => {
        // Capability initialization failures should not block core app access.
      });
    }
  }, [accessToken, role]);

  if (!hydrated) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!accessToken ? (
        <Stack.Screen name="AuthSignIn" component={SignInScreen} />
      ) : role === "driver" ? (
        <Stack.Screen name="DriverHome" component={DriverNavigator} />
      ) : role === "supplier" ? (
        <Stack.Screen name="SupplierHome" component={SupplierNavigator} />
      ) : role === "company" ? (
        <Stack.Screen name="CompanyHome" component={CompanyNavigator} />
      ) : (
        <Stack.Screen name="CustomerHome" component={CustomerNavigator} />
      )}
    </Stack.Navigator>
  );
}
