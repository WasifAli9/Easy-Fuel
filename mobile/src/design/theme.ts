import { configureFonts, MD3DarkTheme, MD3LightTheme } from "react-native-paper";
import type { MD3Type } from "react-native-paper/lib/typescript/types";

/** Supplier portal action buttons (e.g. Download PDF) and shared mobile button shape. */
export const buttonBorderRadius = 12 as const;

/** For Paper MD3 `Button` / `SegmentedButtons`: corner radius is `5 * theme.roundness`. Use this in their `theme` prop, or import `Button` from `paper-button`. */
export const paperMd3ControlRoundness = buttonBorderRadius / 5;

type ThemeFonts = (typeof MD3LightTheme)["fonts"];

function scaleFont(font: MD3Type, sizeDelta: number, weight: MD3Type["fontWeight"], lineDelta = sizeDelta): MD3Type {
  return {
    ...font,
    fontSize: font.fontSize + sizeDelta,
    lineHeight: font.lineHeight + lineDelta,
    fontWeight: weight,
  };
}

/** Slightly larger, bolder MD3 scale for readability in bright light. */
function buildReadableFonts(base: ThemeFonts): ThemeFonts {
  return configureFonts({
    config: {
      ...base,
      headlineLarge: scaleFont(base.headlineLarge, 1, "700"),
      headlineMedium: scaleFont(base.headlineMedium, 1, "700"),
      headlineSmall: scaleFont(base.headlineSmall, 2, "700", 2),
      titleLarge: scaleFont(base.titleLarge, 2, "700", 2),
      titleMedium: scaleFont(base.titleMedium, 2, "700", 2),
      titleSmall: scaleFont(base.titleSmall, 1, "700", 1),
      labelLarge: scaleFont(base.labelLarge, 1, "600", 1),
      labelMedium: scaleFont(base.labelMedium, 2, "600", 2),
      labelSmall: scaleFont(base.labelSmall, 2, "600", 2),
      bodyLarge: scaleFont(base.bodyLarge, 1, "500", 1),
      bodyMedium: scaleFont(base.bodyMedium, 2, "500", 2),
      bodySmall: scaleFont(base.bodySmall, 2, "500", 2),
    },
  });
}

const lightFonts = buildReadableFonts(MD3LightTheme.fonts);
const darkFonts = buildReadableFonts(MD3DarkTheme.fonts);

export const lightTheme = {
  ...MD3LightTheme,
  roundness: buttonBorderRadius,
  fonts: lightFonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#0D9488",
    onPrimary: "#FFFFFF",
    primaryContainer: "#CCFBF1",
    onPrimaryContainer: "#115E59",
    secondary: "#E3E5E8",
    onSecondary: "#000000",
    secondaryContainer: "#E8F5F1",
    onSecondaryContainer: "#0F766E",
    tertiary: "#14B8A6",
    onTertiary: "#042F2E",
    background: "#EDFAF8",
    onBackground: "#000000",
    surface: "#FFFFFF",
    onSurface: "#000000",
    surfaceVariant: "#EEF2F1",
    onSurfaceVariant: "#1F1F1F",
    outline: "rgba(13, 148, 136, 0.28)",
    error: "#EF4343",
    onError: "#FEF6F6",
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: buttonBorderRadius,
  fonts: darkFonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#0D9488",
    onPrimary: "#FFFFFF",
    primaryContainer: "#134E4A",
    onPrimaryContainer: "#CCFBF1",
    secondary: "#282C34",
    onSecondary: "#F5F5F5",
    tertiary: "#5EEAD4",
    onTertiary: "#042F2E",
    background: "#14161A",
    onBackground: "#F5F5F5",
    surface: "#1D2025",
    onSurface: "#F5F5F5",
    surfaceVariant: "#272A30",
    onSurfaceVariant: "#D4D4D4",
    outline: "#373D48",
    error: "#EF4343",
    onError: "#FEF6F6",
  },
};

export const appTheme = lightTheme;
