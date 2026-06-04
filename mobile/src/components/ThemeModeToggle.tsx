import { StyleSheet } from "react-native";
import { IconButton } from "react-native-paper";
import { darkTheme, lightTheme } from "@/design/theme";
import { saveThemeMode } from "@/services/storage";
import { useUiThemeStore } from "@/store/ui-theme-store";

/**
 * Header control: tap to switch light ↔ dark (persisted).
 * Crescent moon in light mode, sunny icon in dark mode — aligned with profile avatar styling.
 */
export function ThemeModeToggle() {
  const mode = useUiThemeStore((s) => s.mode);
  const setMode = useUiThemeStore((s) => s.setMode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const isDark = mode === "dark";

  const toggle = async () => {
    const nextMode = isDark ? "light" : "dark";
    setMode(nextMode);
    await saveThemeMode(nextMode);
  };

  return (
    <IconButton
      icon={isDark ? "white-balance-sunny" : "moon-waning-crescent"}
      mode="contained-tonal"
      size={22}
      containerColor={isDark ? theme.colors.surfaceVariant : theme.colors.primaryContainer}
      iconColor={theme.colors.primary}
      onPress={() => void toggle()}
      style={styles.button}
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    margin: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
});
