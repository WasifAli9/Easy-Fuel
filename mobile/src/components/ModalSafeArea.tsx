import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

type ModalSafeAreaProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Default: all edges (status bar, notch, home indicator). */
  edges?: Edge[];
}>;

/**
 * Wrap full-screen modals so content does not sit under the status bar or home indicator (iOS + Android).
 */
export function ModalSafeArea({
  children,
  style,
  edges = ["top", "right", "bottom", "left"],
}: ModalSafeAreaProps) {
  return (
    <SafeAreaView style={[styles.root, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
