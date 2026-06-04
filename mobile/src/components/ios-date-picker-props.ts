import type { IOSNativeProps } from "@react-native-community/datetimepicker";
import { Platform, StyleSheet } from "react-native";
import { darkTheme, lightTheme, type lightTheme as LightTheme } from "@/design/theme";

/** Native iOS UIDatePicker spinner needs a fixed height or wheels collapse / render blank. */
export const IOS_DATE_PICKER_HEIGHT = 216;

export function getIosDatePickerNativeProps(
  themeMode: "light" | "dark",
): Pick<IOSNativeProps, "themeVariant" | "textColor" | "display"> {
  const isDark = themeMode === "dark";
  const theme = isDark ? darkTheme : lightTheme;
  return {
    display: "spinner",
    themeVariant: isDark ? "dark" : "light",
    textColor: theme.colors.onSurface,
  };
}

export function iosDatePickerWrapStyle(theme: typeof LightTheme) {
  return {
    height: IOS_DATE_PICKER_HEIGHT,
    width: "100%" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.surface,
    overflow: "hidden" as const,
  };
}

export function iosDatePickerStyle() {
  if (Platform.OS !== "ios") return undefined;
  return {
    width: "100%" as const,
    height: IOS_DATE_PICKER_HEIGHT,
  };
}

export const iosDatePickerWrapStyles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
  },
});
