import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { darkTheme, lightTheme } from "@/design/theme";
import { readableType } from "@/design/typography";
import { useUiThemeStore } from "@/store/ui-theme-store";

type ModalScreenHeaderProps = {
  title: string;
  onClose: () => void;
  /** When true, header is inside ModalSafeArea — skip extra top inset. */
  insetTopApplied?: boolean;
};

export function ModalScreenHeader({ title, onClose, insetTopApplied = true }: ModalScreenHeaderProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: theme.colors.outline,
          backgroundColor: theme.colors.surface,
          borderLeftColor: theme.colors.primary,
          paddingTop: insetTopApplied ? 10 : undefined,
        },
      ]}
    >
      <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={2}>
        {title}
      </Text>
      <Pressable
        onPress={onClose}
        style={styles.closeHit}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <MaterialCommunityIcons name="close" size={26} color={theme.colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    minHeight: 52,
  },
  title: {
    flex: 1,
    ...readableType.title,
  },
  closeHit: {
    padding: 6,
    marginRight: -4,
  },
});
