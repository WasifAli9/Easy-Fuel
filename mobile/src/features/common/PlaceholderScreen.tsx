import { View } from "react-native";
import { Text } from "react-native-paper";

type Props = {
  title: string;
  subtitle: string;
};

export function PlaceholderScreen({ title, subtitle }: Props) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#F8FAFC",
        justifyContent: "center",
        paddingHorizontal: 20,
        gap: 8,
      }}
    >
      <Text variant="headlineSmall">{title}</Text>
      <Text variant="bodyMedium">{subtitle}</Text>
    </View>
  );
}
