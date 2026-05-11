import type { ComponentProps } from "react";
import { Button as RNPButton } from "react-native-paper";
import { buttonBorderRadius } from "@/design/theme";

export type PaperButtonProps = ComponentProps<typeof RNPButton>;

/**
 * Pins visible corner radius to {@link buttonBorderRadius}. Paper MD3 would otherwise use `5 * theme.roundness` (~60 with default theme).
 */
export function Button({ style, ...rest }: PaperButtonProps) {
  return <RNPButton {...rest} style={[{ borderRadius: buttonBorderRadius }, style]} />;
}
