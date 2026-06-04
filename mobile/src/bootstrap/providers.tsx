import { PropsWithChildren, useEffect, useMemo } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { darkTheme, lightTheme } from "@/design/theme";
import { RealtimeSync } from "@/bootstrap/RealtimeSync";
import { PushNotificationSync } from "@/bootstrap/PushNotificationSync";
import { readThemeMode } from "@/services/storage";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { navigationRef } from "@/navigation/navigationRef";
import { queryClient } from "@/bootstrap/queryClient";
import { AuthProvider } from "@/contexts/AuthContext";

export function AppProviders({ children }: PropsWithChildren) {
  const { mode, setMode, markHydrated } = useUiThemeStore();
  const paperTheme = mode === "dark" ? darkTheme : lightTheme;

  useEffect(() => {
    readThemeMode()
      .then((saved) => {
        if (saved) {
          setMode(saved);
        }
      })
      .finally(() => markHydrated());
  }, [markHydrated, setMode]);

  const navTheme = useMemo(
    () => ({
      ...(mode === "dark" ? NavDarkTheme : DefaultTheme),
      colors: {
        ...(mode === "dark" ? NavDarkTheme.colors : DefaultTheme.colors),
        background: paperTheme.colors.background,
        card: paperTheme.colors.surface,
        text: paperTheme.colors.onSurface,
        primary: paperTheme.colors.primary,
        border: paperTheme.colors.outline,
      },
    }),
    [mode, paperTheme.colors.background, paperTheme.colors.onSurface, paperTheme.colors.outline, paperTheme.colors.primary, paperTheme.colors.surface],
  );

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RealtimeSync>
              <PushNotificationSync>
                <NavigationContainer ref={navigationRef} theme={navTheme}>
                  {children}
                </NavigationContainer>
              </PushNotificationSync>
            </RealtimeSync>
          </AuthProvider>
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
