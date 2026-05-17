import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { EasyFuelLogo } from "@/design/EasyFuelLogo";
import { appTheme } from "@/design/theme";
import { getResolvedApiBaseUrl } from "@/services/config";

function isLikelyNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const m = error.message.toLowerCase();
  const code = String((error as { code?: string }).code ?? "").toLowerCase();
  return (
    /network request failed|failed to fetch|fetch failed|network error|timed out|timeout|offline|abort|econnrefused|econnreset|etimedout|econnaborted|socket hang up|certificate|ssl handshake|unable to resolve host|enotfound|err_network|load failed|could not connect|the internet connection appears to be offline|not connected to the internet|secured connection|app transport security|ats|nsurlerrordomain|cancelled|canceled|dns/i.test(
      `${m} ${code}`,
    )
  );
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
  const insets = useSafeAreaInsets();

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
        const baseMsg = `Check that ${portalOrigin} opens in your phone's browser. Try Wi‑Fi or disable VPN. ${envHint}`;
        const body =
          __DEV__ && error instanceof Error
            ? `${baseMsg}\n\n--- Debug (from app) ---\n${error.message}\n\nAlso watch Metro for lines starting with [API] Transport diagnostic`
            : baseMsg;
        Alert.alert("Cannot reach server", body);
      } else {
        const msg = error instanceof Error ? error.message : "Something went wrong. Please try again.";
        const title =
          /server reply was missing|could not read the server response|expected json from the server/i.test(msg)
            ? "Wrong server or API version"
            : /administrator sign-in|app role assigned/i.test(msg)
              ? "Account not allowed here"
              : "Sign in failed";
        Alert.alert(title, msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const scrollContent = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + 48,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <EasyFuelLogo size={68} borderRadius={14} />
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
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {Platform.OS === "android" ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
          {scrollContent}
        </KeyboardAvoidingView>
      ) : (
        scrollContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
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
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
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
