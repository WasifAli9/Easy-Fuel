import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

/** Supplier portal action buttons (e.g. Download PDF) and shared mobile button shape. */
export const buttonBorderRadius = 12 as const;

/** For Paper MD3 `Button` / `SegmentedButtons`: corner radius is `5 * theme.roundness`. Use this in their `theme` prop, or import `Button` from `paper-button`. */
export const paperMd3ControlRoundness = buttonBorderRadius / 5;

export const lightTheme = {
  ...MD3LightTheme,
  roundness: buttonBorderRadius,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#0D9488",
    onPrimary: "#FFFFFF",
    primaryContainer: "#CCFBF1",
    onPrimaryContainer: "#115E59",
    secondary: "#E3E5E8",
    onSecondary: "#14161A",
    secondaryContainer: "#E8F5F1",
    onSecondaryContainer: "#0F766E",
    tertiary: "#14B8A6",
    onTertiary: "#042F2E",
    background: "#EDFAF8",
    onBackground: "#14161A",
    surface: "#FFFFFF",
    onSurface: "#14161A",
    surfaceVariant: "#EEF2F1",
    onSurfaceVariant: "#6B7280",
    outline: "rgba(13, 148, 136, 0.22)",
    error: "#EF4343",
    onError: "#FEF6F6",
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: buttonBorderRadius,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#0D9488",
    onPrimary: "#FFFFFF",
    primaryContainer: "#134E4A",
    onPrimaryContainer: "#CCFBF1",
    secondary: "#282C34",
    onSecondary: "#F2F2F2",
    tertiary: "#5EEAD4",
    onTertiary: "#042F2E",
    background: "#14161A",
    onBackground: "#F2F2F2",
    surface: "#1D2025",
    onSurface: "#F2F2F2",
    surfaceVariant: "#272A30",
    onSurfaceVariant: "#A6A6A6",
    outline: "#373D48",
    error: "#EF4343",
    onError: "#FEF6F6",
  },
};

export const appTheme = lightTheme;
