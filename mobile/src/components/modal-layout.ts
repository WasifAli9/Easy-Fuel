import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Max height for embedded order chat on order-detail modals (scales with screen). */
export function getOrderDetailChatMaxHeight(windowHeight: number): number {
  return Math.min(300, Math.max(160, Math.round(windowHeight * 0.34)));
}

export function useModalLayout() {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const chatMaxHeight = getOrderDetailChatMaxHeight(windowHeight);

  return {
    windowHeight,
    windowWidth,
    insets,
    chatMaxHeight,
    footerPaddingBottom: Math.max(insets.bottom, 12),
    headerPaddingTop: Math.max(insets.top, Platform.OS === "android" ? 8 : 0),
  };
}
