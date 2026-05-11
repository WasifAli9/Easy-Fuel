import type { ImageSourcePropType } from "react-native";

/**
 * Bundled PWA icon (matches `public/icon-512.png` / web portal). Optional `EXPO_PUBLIC_LOGO_URL` overrides for remote assets.
 */
export function getEasyFuelLogoSource(): ImageSourcePropType {
  const override = process.env.EXPO_PUBLIC_LOGO_URL?.trim();
  if (override) {
    return { uri: override };
  }
  return require("../../assets/images/icon-512.png");
}
