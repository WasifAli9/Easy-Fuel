import { apiClient } from "@/services/api/client";
import { appConfig } from "@/services/config";
import { normalizeFilePath, resolveApiUrl } from "@/lib/files";

/** Ensure signed/API URLs use HTTPS when talking to the production portal (Android blocks cleartext). */
export function absolutizeMediaUrl(pathOrUrl: string): string {
  let url = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : resolveApiUrl(appConfig.apiBaseUrl, pathOrUrl);

  try {
    const api = new URL(appConfig.apiBaseUrl);
    const u = new URL(url);
    if (api.protocol === "https:" && u.protocol === "http:" && u.hostname === api.hostname) {
      u.protocol = "https:";
      return u.toString();
    }
  } catch {
    /* keep as-is */
  }
  return url;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in Hermes / RN
  return globalThis.btoa(binary);
}

/**
 * Resolve a profile photo path into a URI that React Native `Image` can load.
 * Prefers an authenticated byte download (Bearer/cookie) → data URI, because
 * RN Image does not send session cookies to `/objects/...`.
 */
export async function resolveProfilePhotoDisplayUri(
  photoUrl: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeFilePath(photoUrl);
  if (!normalized) return null;

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return absolutizeMediaUrl(normalized);
  }

  const objectPath = normalized.startsWith("/objects/") ? normalized : `/objects/${normalized}`;

  try {
    const response = await apiClient.get<ArrayBuffer>(objectPath, {
      responseType: "arraybuffer",
      headers: { Accept: "image/jpeg,image/png,image/webp,image/*,*/*" },
    });
    const raw = response.data;
    const bytes =
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : ArrayBuffer.isView(raw)
          ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
          : null;
    if (!bytes || bytes.byteLength === 0) {
      throw new Error("Empty image response");
    }
    const contentType = String(
      (response.headers as Record<string, string>)["content-type"] ||
        (response.headers as Record<string, string>)["Content-Type"] ||
        "image/jpeg",
    )
      .split(";")[0]
      .trim();
    const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
    return `data:${mime};base64,${uint8ToBase64(bytes)}`;
  } catch {
    const { data } = await apiClient.post<{ signedUrl: string }>("/api/objects/presigned-url", {
      objectPath: normalized,
      mimeType: "image/jpeg",
    });
    if (!data?.signedUrl) return null;
    return absolutizeMediaUrl(data.signedUrl);
  }
}
