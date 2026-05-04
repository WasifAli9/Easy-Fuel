import axios from "axios";
import { appConfig } from "@/services/config";
import { clearSecureSession, readSessionCookie } from "@/services/storage";
import { useSessionStore } from "@/store/session-store";

export const apiClient = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: 15_000,
  withCredentials: true,
});

function toSnakeCase(key: string) {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function toCamelCase(key: string) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return false;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) return false;
  const proto = Object.getPrototypeOf(value as object);
  return proto === Object.prototype || proto === null;
}

function withCaseAliasesDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => withCaseAliasesDeep(item)) as T;
  }
  if (!isPlainObject(input)) return input;

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedValue = withCaseAliasesDeep(value);
    out[key] = normalizedValue;

    const snake = toSnakeCase(key);
    const camel = toCamelCase(key);
    if (out[snake] === undefined) out[snake] = normalizedValue;
    if (out[camel] === undefined) out[camel] = normalizedValue;
  }
  return out as T;
}

apiClient.interceptors.response.use(
  (response) => {
    const rt = response.config.responseType;
    if (rt === "arraybuffer" || rt === "blob") {
      return response;
    }
    response.data = withCaseAliasesDeep(response.data);
    return response;
  },
  async (error) => {
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }
    const url = String(error.config?.url || "");
    if (url.includes("/api/auth/login") || url.includes("/api/auth/register")) {
      return Promise.reject(error);
    }
    await clearSecureSession();
    useSessionStore.getState().clearSession();
    return Promise.reject(error);
  },
);

apiClient.interceptors.request.use(async (config) => {
  const sessionCookie = await readSessionCookie();
  if (sessionCookie) {
    const h: any = config.headers ?? {};
    if (typeof h.set === "function") {
      h.set("Cookie", sessionCookie);
    } else {
      h.Cookie = sessionCookie;
    }
    config.headers = h;
  }

  const contentType =
    (config.headers as any)?.["Content-Type"] ||
    (config.headers as any)?.["content-type"] ||
    "";

  const isFormData =
    typeof FormData !== "undefined" && config.data instanceof FormData;

  if (!isFormData && Array.isArray(config.data)) {
    config.data = withCaseAliasesDeep(config.data);
    return config;
  }

  if (!isFormData && isPlainObject(config.data)) {
    config.data = withCaseAliasesDeep(config.data);
    return config;
  }

  if (
    !isFormData &&
    typeof config.data === "string" &&
    String(contentType).includes("application/json")
  ) {
    try {
      const parsed = JSON.parse(config.data);
      config.data = JSON.stringify(withCaseAliasesDeep(parsed));
    } catch {
      // Ignore invalid JSON string body and send as-is.
    }
  }

  return config;
});
