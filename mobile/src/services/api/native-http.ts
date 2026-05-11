import { Platform } from "react-native";

/**
 * Mobile Chrome / Safari user agents. Some CDNs and WAFs (e.g. Cloudflare bot rules) drop or reset
 * connections that use okhttp/React-Native default profiles or custom short agents like "EasyFuel-Mobile".
 * The site can still load in Chrome while API calls from the app fail with ERR_NETWORK.
 */
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const IOS_MOBILE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Default headers for JSON API calls (native uses a browser-like UA; web leaves UA to the browser). */
export function getDefaultApiHeaders(): Record<string, string> {
  if (Platform.OS === "web") {
    return { Accept: "application/json" };
  }
  return {
    Accept: "application/json",
    "User-Agent": Platform.OS === "android" ? ANDROID_CHROME_UA : IOS_MOBILE_SAFARI_UA,
  };
}
