import { ScrollView, StyleSheet, View } from "react-native";
import { Card, Switch, Text } from "react-native-paper";
import { darkTheme, lightTheme } from "@/design/theme";
import { saveThemeMode } from "@/services/storage";
import { useUiThemeStore } from "@/store/ui-theme-store";

/**
 * Shared appearance + account exit — matches the driver settings “Appearance” section pattern.
 */
export function PortalSettingsScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const setThemeMode = useUiThemeStore((state) => state.setMode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);

  const toggleTheme = async (nextDarkEnabled: boolean) => {
    const nextMode = nextDarkEnabled ? "dark" : "light";
    setThemeMode(nextMode);
    await saveThemeMode(nextMode);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="headlineSmall">Appearance</Text>
          <Text style={styles.subtitle}>Match the web portal light and dark themes.</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Dark mode</Text>
            <Switch value={mode === "dark"} onValueChange={toggleTheme} />
          </View>
        </Card.Content>
      </Card>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">About</Text>
          <Text style={styles.subtitle}>Use the menu to switch sections. Sign out is available from the menu drawer.</Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

function getStyles(theme: typeof lightTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 14, gap: 12, paddingBottom: 24 },
    card: { backgroundColor: theme.colors.surface },
    subtitle: { marginTop: 6, color: theme.colors.onSurfaceVariant },
    label: { color: theme.colors.onSurface },
    rowBetween: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
  });
}
