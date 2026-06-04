// Dynamic Expo config (mirrors Inspect360 mobile pattern) so EAS and local builds
// pick up EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_BASE_URL and embed a production default.
const apiFromEnv =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

const defaultProductionApi = "https://portal.easyfuel.ai";

export default {
  expo: {
    /** Classic App.tsx entry — do not use `src/app` (Expo Router would hijack the project). */
    name: "Easy Fuel",
    slug: "easy-fuel-mobile",
    version: "1.0.1",
    orientation: "portrait",
    scheme: "easyfuel",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    icon: "./assets/images/icon-512.png",
    assetBundlePatterns: ["**/*"],
    splash: {
      image: "./assets/images/icon-512.png",
      resizeMode: "contain",
      backgroundColor: "#0D9488",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.easyfuel.mobile",
      buildNumber: "1",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "Easy Fuel uses your location to show nearby depots, set your work area, and support deliveries while you use the app.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Easy Fuel uses your location to support delivery tracking while you use the app.",
        NSCameraUsageDescription: "Easy Fuel may use the camera to capture documents or signatures when required.",
        NSPhotoLibraryUsageDescription:
          "Easy Fuel accesses your photo library so you can choose a profile picture and upload images.",
        NSFaceIDUsageDescription: "Easy Fuel uses Face ID for quick sign-in.",
      },
    },
    android: {
      package: "com.easyfuel.mobile",
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon-512.png",
        backgroundColor: "#0D9488",
      },
      versionCode: 1,
      softwareKeyboardLayoutMode: "resize",
      permissions: [
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "POST_NOTIFICATIONS",
        "USE_BIOMETRIC",
        "USE_FINGERPRINT",
        "VIBRATE",
      ],
      edgeToEdgeEnabled: false,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/images/icon-512.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#0D9488",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Easy Fuel uses your location for delivery routing and depot distance while you use the app.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon-512.png",
          color: "#0D9488",
          defaultChannel: "default",
          sounds: [],
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Easy Fuel accesses your photo library so you can choose a profile picture and upload images.",
        },
      ],
      "@react-native-community/datetimepicker",
      "expo-secure-store",
      "expo-local-authentication",
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
    owner: "wasifali9",
  },
};
