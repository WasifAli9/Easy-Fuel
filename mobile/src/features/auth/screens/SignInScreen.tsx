import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "react-native-paper";
import { Button } from "@/design/paper-button";
import { AxiosError } from "axios";
import { signInWithPassword } from "@/services/api/auth";
import { getFuelPortalTokens } from "@/design/fuel-portal-tokens";
import { getPortalUiStyleDefs } from "@/design/portal-ui-styles";
import { darkTheme, lightTheme } from "@/design/theme";
import { EasyFuelLogo } from "@/design/EasyFuelLogo";
import { useUiThemeStore } from "@/store/ui-theme-store";

export function SignInScreen() {
  const mode = useUiThemeStore((state) => state.mode);
  const theme = mode === "dark" ? darkTheme : lightTheme;
  const styles = getStyles(theme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit() {
    try {
      setLoading(true);
      await signInWithPassword(email.trim(), password);
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      if (!axiosError.response) {
        Alert.alert(
          "Cannot reach server",
          "Please make sure your phone and backend are on the same network, then try again.",
        );
      } else {
        Alert.alert(
          "Sign in failed",
          axiosError.response.data?.message ?? "Please check your credentials and try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View style={styles.card}>
        <View style={styles.logoWrap}>
          <EasyFuelLogo size={68} borderRadius={12} />
        </View>
          <Text variant="headlineMedium" style={styles.title}>
            Easy Fuel
          </Text>
          <Text variant="titleMedium" style={styles.subtitle}>
            Welcome back
          </Text>
          <Text variant="bodyMedium" style={styles.description}>
            Sign in to manage orders, deliveries, and account activity.
          </Text>

          <TextInput
            mode="outlined"
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            left={<TextInput.Icon icon="email-outline" />}
            textColor={theme.colors.onSurface}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            theme={{ colors: { onSurfaceVariant: theme.colors.onSurfaceVariant } }}
          />
          <TextInput
            mode="outlined"
            label="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? "eye-off-outline" : "eye-outline"}
                onPress={() => setShowPassword((prev) => !prev)}
              />
            }
            textColor={theme.colors.onSurface}
            outlineColor={theme.colors.outline}
            activeOutlineColor={theme.colors.primary}
            theme={{ colors: { onSurfaceVariant: theme.colors.onSurfaceVariant } }}
          />
          <Button
            mode="contained"
            loading={loading}
            onPress={onSubmit}
            disabled={loading || !email.trim() || !password}
            style={styles.button}
            contentStyle={styles.buttonContent}
            buttonColor={theme.colors.primary}
            textColor={theme.colors.onPrimary}
          >
            Sign In
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (theme: typeof lightTheme) => {
  const p = getPortalUiStyleDefs(theme);
  const isDark = "dark" in theme && (theme as { dark?: boolean }).dark === true;
  const fp = getFuelPortalTokens(theme, isDark);
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: fp.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  card: {
    borderRadius: fp.cardRadius,
    padding: 22,
    backgroundColor: theme.colors.surface,
    ...fp.shadowCard,
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    textAlign: "center",
    color: theme.colors.onSurface,
  },
  subtitle: {
    textAlign: "center",
    marginTop: 2,
    fontWeight: "600",
    color: theme.colors.onSurface,
  },
  description: {
    textAlign: "center",
    color: theme.colors.onSurfaceVariant,
    marginTop: 6,
    marginBottom: 16,
  },
  input: {
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
  },
  button: {
    marginTop: 6,
    borderRadius: 12,
  },
  buttonContent: {
    height: 48,
  },
  });
};
