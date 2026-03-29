import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { AppProviders } from "@/app/providers";
import { RootNavigator } from "@/navigation/RootNavigator";

export default function App() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  );
}
