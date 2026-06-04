import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

type ModalSafeAreaProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Default: all edges (status bar, notch, home indicator). */
  edges?: Edge[];
}>;

/**
 * Full-screen modal safe area using explicit inset padding.
 * SafeAreaView inside React Native Modal is unreliable on some iOS devices (content under notch / home bar).
 */
export function ModalSafeArea({
  children,
  style,
  edges = ["top", "right", "bottom", "left"],
}: ModalSafeAreaProps) {
  const insets = useSafeAreaInsets();

  const paddingStyle: ViewStyle = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
    paddingLeft: edges.includes("left") ? insets.left : 0,
    paddingRight: edges.includes("right") ? insets.right : 0,
  };

  return <View style={[styles.root, paddingStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
