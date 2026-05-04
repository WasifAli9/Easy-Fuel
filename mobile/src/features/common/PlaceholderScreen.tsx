import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type Props = {
  title: string;
  subtitle: string;
};

function getStyles(theme: typeof lightTheme) {
  const p = getPortalUiStyleDefs(theme);
  return StyleSheet.create({
    wrap: {
      ...p.screenContainer,
      justifyContent: "center",
      paddingHorizontal: 20,
      gap: 10,
    },
    title: { color: theme.colors.onSurface, fontWeight: "700" },
    subtitle: { color: theme.colors.onSurfaceVariant, lineHeight: 22 },
  });
}

export function PlaceholderScreen({ title, subtitle }: Props) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      <Text variant="headlineSmall" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {subtitle}
      </Text>
    </View>
  );
}
