import type { TextStyle } from "react-native";

/** Shared text styles for outdoor / sunlight readability (Uber-like contrast and weight). */
export const readableType = {
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  } satisfies TextStyle,
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  } satisfies TextStyle,
  meta: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  } satisfies TextStyle,
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  } satisfies TextStyle,
  bodyBold: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  } satisfies TextStyle,
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  } satisfies TextStyle,
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
  } satisfies TextStyle,
  headline: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
  } satisfies TextStyle,
  kicker: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  } satisfies TextStyle,
};
