import { PropsWithChildren, useEffect, useMemo } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { darkTheme, lightTheme } from "@/design/theme";
import { readThemeMode } from "@/services/storage";
import { useUiThemeStore } from "@/store/ui-theme-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

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
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <PaperProvider theme={paperTheme}>
          <QueryClientProvider client={queryClient}>
            <NavigationContainer theme={navTheme}>{children}</NavigationContainer>
          </QueryClientProvider>
        </PaperProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
