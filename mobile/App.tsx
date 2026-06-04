import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "@/bootstrap/providers";
import { RootNavigator } from "@/navigation/RootNavigator";
import { useUiThemeStore } from "@/store/ui-theme-store";

function ThemedStatusBar() {
  const mode = useUiThemeStore((s) => s.mode);
  return <StatusBar style={mode === "dark" ? "light" : "dark"} translucent={false} />;
}

export default function App() {
  return (
    <AppProviders>
      <ThemedStatusBar />
      <RootNavigator />
    </AppProviders>
  );
}
