// Dynamic Expo config (mirrors Inspect360 mobile pattern) so EAS and local builds
// pick up EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_BASE_URL and embed a production default.
const apiFromEnv =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

const defaultProductionApi = "https://portal.easyfuel.ai";

export default {
  expo: {
    name: "Easy Fuel",
    slug: "easy-fuel-mobile",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "easyfuel",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    /** Used for iOS + Android store / launcher (see android.adaptiveIcon for Android 8+). */
    icon: "./assets/images/icon-512.png",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.easyfuel.mobile",
      buildNumber: "1",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.easyfuel.mobile",
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon-512.png",
        backgroundColor: "#0D9488",
      },
      versionCode: 1,
      /** Resize the app window when the keyboard opens so inputs stay visible (vs pan). */
      softwareKeyboardLayoutMode: "resize",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_NETWORK_STATE",
        "INTERNET",
      ],
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      "@react-native-community/datetimepicker",
      "expo-secure-store",
      "expo-local-authentication",
      "expo-location",
      "expo-notifications",
      "expo-asset",
      "expo-font",
      "./plugins/with-network-security.js",
    ],
    extra: {
      eas: {
        projectId: "84b0d361-c107-4a26-8a03-5f01d4ae72f5",
      },
      apiUrl: apiFromEnv || defaultProductionApi,
      apiBaseUrl: apiFromEnv || defaultProductionApi,
    },
  },
};
