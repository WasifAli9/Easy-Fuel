import { useState } from "react";
import { Image, type ImageStyle, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getEasyFuelLogoSource } from "@/design/brand";

type EasyFuelLogoProps = {
  /** Width and height of the logo box (image scales inside with `contain`). */
  size: number;
  borderRadius?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * App / portal icon: bundled asset by default (works offline and when `/icon-512.png` is broken on the server).
 */
export function EasyFuelLogo({ size, borderRadius = 12, style, containerStyle }: EasyFuelLogoProps) {
  const source = getEasyFuelLogoSource();
  const r = borderRadius;
  const [failed, setFailed] = useState(false);
  const isRemote = typeof source === "object" && source !== null && "uri" in source;
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius }, containerStyle]}>
      {isRemote && failed ? (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: r }]}>
          <MaterialCommunityIcons name="fuel" size={Math.round(size * 0.62)} color="#ffffff" />
        </View>
      ) : (
        <Image
          accessibilityLabel="Easy Fuel logo"
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={source}
          onError={() => isRemote && setFailed(true)}
          style={[{ width: size, height: size, borderRadius: r }, style]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  fallback: {
    backgroundColor: "#45c2c4",
    alignItems: "center",
    justifyContent: "center",
  },
});
