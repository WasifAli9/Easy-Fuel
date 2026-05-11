import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { useAuth } from "@/contexts/AuthContext";
import { appTheme } from "@/design/theme";
import { appConfig, getResolvedApiBaseUrl } from "@/services/config";

function isLikelyNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const m = error.message.toLowerCase();
  return /network request failed|failed to fetch|fetch failed|network error|timed out|offline|abort/i.test(m);
}

function isLikelyInvalidCredentials(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message.toLowerCase();
  return (
    /invalid email or password|wrong password|incorrect password|unauthorized|401/.test(m) ||
    m.includes("invalid credentials")
  );
}

export function SignInScreen() {
  const { login, isLoading: authBusy } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const logoUri = `${appConfig.apiBaseUrl.replace(/\/api\/?$/, "")}/icon-512.png`;

  async function onSubmit() {
    try {
      setLoading(true);
      await login(email.trim(), password);
    } catch (error) {
      const portalOrigin = getResolvedApiBaseUrl().replace(/\/api\/?$/i, "");
      const envHint =
        "If the URL is wrong, set EXPO_PUBLIC_API_URL or EXPO_PUBLIC_API_BASE_URL in mobile/.env and restart Expo with cache clear: npx expo start -c";

      if (isLikelyInvalidCredentials(error)) {
        Alert.alert(
          "Sign in failed",
          error instanceof Error ? error.message : "Please check your credentials and try again.",
        );
      } else if (isLikelyNetworkFailure(error)) {
        Alert.alert(
          "Cannot reach server",
          `Check that ${portalOrigin} opens in your phone's browser. Try Wi‑Fi or disable VPN. ${envHint}`,
        );
      } else {
        Alert.alert(
          "Sign in failed",
          error instanceof Error ? error.message : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Image source={{ uri: logoUri }} style={styles.logoImage} />
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
        />
        <Button
          mode="contained"
          loading={loading || authBusy}
          onPress={onSubmit}
          disabled={loading || authBusy || !email.trim() || !password}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Sign In
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: appTheme.colors.background,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  logoImage: {
    width: 68,
    height: 68,
    borderRadius: 14,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginTop: 2,
    fontWeight: "600",
  },
  description: {
    textAlign: "center",
    color: "#6B7280",
    marginTop: 6,
    marginBottom: 16,
  },
  input: {
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  button: {
    marginTop: 6,
    borderRadius: 14,
  },
  buttonContent: {
    height: 48,
  },
});
