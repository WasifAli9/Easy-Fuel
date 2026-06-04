import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Text } from "react-native-paper";
import { Button } from "@/design/paper-button";
import {
  IOS_DATE_PICKER_HEIGHT,
  getIosDatePickerNativeProps,
  iosDatePickerStyle,
  iosDatePickerWrapStyle,
} from "@/components/ios-date-picker-props";
import { darkTheme, lightTheme } from "@/design/theme";
import { useUiThemeStore } from "@/store/ui-theme-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IosDatePickerSheetProps = {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
};

export function IosDatePickerSheet({
  visible,
  value,
  onChange,
  onCancel,
  onConfirm,
  title = "Select date",
}: IosDatePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const iosPickerProps = getIosDatePickerNativeProps(mode);

  if (Platform.OS !== "ios") {
    return null;
  }

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "dismissed" || !date) return;
    onChange(date);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onCancel} accessibilityLabel="Dismiss date picker" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.toolbar, { borderBottomColor: theme.colors.outline }]}>
            <Button mode="text" textColor={theme.colors.primary} onPress={onCancel}>
              Cancel
            </Button>
            <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
              {title}
            </Text>
            <Button mode="text" textColor={theme.colors.primary} onPress={onConfirm}>
              Done
            </Button>
          </View>
          <View style={iosDatePickerWrapStyle(theme)}>
            <DateTimePicker
              value={value}
              mode="date"
              onChange={handleChange}
              style={iosDatePickerStyle()}
              {...iosPickerProps}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export { IOS_DATE_PICKER_HEIGHT };
