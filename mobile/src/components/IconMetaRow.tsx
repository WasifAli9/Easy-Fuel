import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";
import { readableType } from "@/design/typography";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";

type IconMetaRowProps = {
  icon: string;
  children: ReactNode;
  color?: string;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
  iconSize?: number;
};

/** Compact label row: small icon + single line of meta text (saves space vs icon-only headers). */
export function IconMetaRow({
  icon,
  children,
  color,
  iconColor,
  style,
  numberOfLines = 2,
  iconSize = 17,
}: IconMetaRowProps) {
  const mode = useUiThemeStore((s) => s.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const textColor = color ?? theme.colors.onSurfaceVariant;
  const glyphColor = iconColor ?? color ?? theme.colors.onSurfaceVariant;

  return (
    <View style={[styles.row, style]}>
      <MaterialCommunityIcons
        name={icon as never}
        size={iconSize}
        color={glyphColor}
        style={styles.icon}
      />
      <Text
        style={[styles.text, { color: textColor }]}
        numberOfLines={numberOfLines}
      >
        {children}
      </Text>
    </View>
  );
}

type SectionTitleRowProps = {
  icon: string;
  title: string;
  subtitle?: string;
  iconBg?: string;
  iconColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** Section header with icon badge — tighter than headline-only blocks. */
export function SectionTitleRow({
  icon,
  title,
  subtitle,
  iconBg,
  iconColor,
  titleColor,
  subtitleColor,
  style,
}: SectionTitleRowProps) {
  return (
    <View style={[styles.sectionRow, style]}>
      <View style={[styles.sectionIconWrap, iconBg != null ? { backgroundColor: iconBg } : null]}>
        <MaterialCommunityIcons name={icon as never} size={22} color={iconColor} />
      </View>
      <View style={styles.sectionTextCol}>
        <Text variant="titleMedium" style={[styles.sectionTitle, titleColor != null ? { color: titleColor } : null]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.sectionSubtitle, subtitleColor != null ? { color: subtitleColor } : null]}
            numberOfLines={3}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    ...readableType.meta,
    flex: 1,
    color: undefined,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTextCol: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontWeight: "700",
  },
  sectionSubtitle: {
    ...readableType.meta,
    marginTop: 4,
  },
});
