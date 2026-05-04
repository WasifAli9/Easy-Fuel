import { Linking } from "react-native";
import { appConfig } from "@/services/config";
import { apiClient } from "@/services/api/client";
import { readSessionCookie } from "@/services/storage";

/**
 * Match web `client/src/lib/utils.ts` so DB paths from the web app resolve the same way on mobile.
 */
export function normalizeFilePath(filePath: string | null | undefined): string | null {
  if (!filePath || filePath.trim() === "") {
    return null;
  }

  if (filePath.startsWith("/objects/")) {
    return filePath;
  }

  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    try {
      const url = new URL(filePath);
      let path = url.pathname;

      if (path.startsWith("/api/storage/upload/")) {
        path = path.replace("/api/storage/upload/", "");
      } else if (path.startsWith("/api/object-storage/upload/")) {
        path = path.replace("/api/object-storage/upload/", "");
      }

      if (!path.startsWith("/objects/")) {
        path = path.startsWith("/") ? path.slice(1) : path;
        return `/objects/${path}`;
      }

      return path;
    } catch {
      // fall through
    }
  }

  if (filePath.startsWith("/api/storage/upload/")) {
    const path = filePath.replace("/api/storage/upload/", "");
    return `/objects/${path}`;
  }

  if (filePath.startsWith("/api/object-storage/upload/")) {
    const path = filePath.replace("/api/object-storage/upload/", "");
    return `/objects/${path}`;
  }

  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return `/objects/${cleanPath}`;
}

export function resolveApiUrl(baseUrl: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const base = baseUrl.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/** PUT binary to a relative upload URL from `/api/objects/upload` (requires session cookie on RN). */
export async function putFileToUploadUrl(uploadPath: string, body: Blob, contentType: string): Promise<Response> {
  const url = resolveApiUrl(appConfig.apiBaseUrl, uploadPath);
  const cookieHeader = await readSessionCookie();
  const headers: Record<string, string> = {
    "Content-Type": contentType || "application/octet-stream",
  };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  return fetch(url, { method: "PUT", headers, body });
}

/**
 * Open a stored document: same rules as web (local `/objects/...` via API origin; S3 via presigned full URL).
 */
export async function openStoredDocument(filePath: string | null | undefined): Promise<void> {
  if (!filePath?.trim()) {
    return;
  }

  const normalized = normalizeFilePath(filePath);
  if (!normalized) {
    return;
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    await Linking.openURL(normalized);
    return;
  }

  if (normalized.startsWith("/objects/")) {
    await Linking.openURL(resolveApiUrl(appConfig.apiBaseUrl, normalized));
    return;
  }

  const stripped = normalized.replace(/^\/+/, "");
  const { data } = await apiClient.post<{ signedUrl: string }>("/api/objects/presigned-url", {
    objectPath: stripped,
  });

  if (!data?.signedUrl) {
    throw new Error("Could not resolve document URL");
  }

  await Linking.openURL(resolveApiUrl(appConfig.apiBaseUrl, data.signedUrl));
}
