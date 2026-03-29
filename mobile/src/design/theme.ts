import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 12,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#26EDD9",
    onPrimary: "#F6FEFD",
    secondary: "#E3E5E8",
    onSecondary: "#14161A",
    background: "#FFFFFF",
    onBackground: "#14161A",
    surface: "#FAFAFA",
    onSurface: "#14161A",
    surfaceVariant: "#EEF2F1",
    onSurfaceVariant: "#6B7280",
    outline: "#E8EAEE",
    error: "#EF4343",
    onError: "#FEF6F6",
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 12,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#26EDD9",
    onPrimary: "#14161A",
    secondary: "#282C34",
    onSecondary: "#F2F2F2",
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

// Backward-compatible alias for existing imports.
export const appTheme = lightTheme;
