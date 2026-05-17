import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Consistent safe-area padding for portal screens and scroll content (iOS + Android). */
export function useSafeAreaPadding() {
  const insets = useSafeAreaInsets();

  return {
    insets,
    /** Top inset — only for screens without FuelPortalHeader (e.g. sign-in). */
    top: insets.top,
    bottom: insets.bottom,
    /** Scroll content below the portal header (no tab bar). */
    scrollContent: {
      paddingBottom: 28 + insets.bottom,
    },
    /** Scroll content when a bottom tab bar is shown (tab bar already includes bottom inset). */
    scrollContentWithTabBar: {
      paddingBottom: 16,
    },
  };
}
