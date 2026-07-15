import { Linking, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { appConfig } from "@/services/config";
import { apiClient } from "@/services/api/client";
import { useSessionStore } from "@/store/session-store";

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export type StoredDocumentMeta = {
  title?: string;
  mime_type?: string | null;
  mimeType?: string | null;
};

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
        const rel = path.replace("/api/storage/upload/", "");
        return `/objects/${rel.startsWith("/") ? rel.slice(1) : rel}`;
      }
      if (path.startsWith("/api/object-storage/upload/")) {
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
    const rel = filePath.replace("/api/storage/upload/", "");
    return `/objects/${rel.startsWith("/") ? rel.slice(1) : rel}`;
  }

  if (filePath.startsWith("/api/object-storage/upload/")) {
    const path = filePath.replace("/api/object-storage/upload/", "");
    return `/objects/${path.startsWith("/") ? path.slice(1) : path}`;
  }

  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return `/objects/${cleanPath}`;
}

function buildDocumentFilename(title: string | undefined, mimeType?: string | null): string {
  const base = (title || "document").replace(/[/\\?%*:|"<>]/g, "-").trim() || "document";
  if (/\.\w{2,5}$/i.test(base)) return base;
  const mime = (mimeType || "application/pdf").toLowerCase().split(";")[0].trim();
  const ext = MIME_TO_EXT[mime] || "";
  return ext ? `${base}${ext}` : base;
}

/** Query string for `/objects/...` or presigned view URLs (filename + mime). */
export function documentViewParams(doc?: StoredDocumentMeta): { filename: string; mimeType: string } {
  const mimeType = (doc?.mime_type ?? doc?.mimeType ?? "application/pdf").split(";")[0].trim();
  const filename = buildDocumentFilename(doc?.title, mimeType);
  return { filename, mimeType };
}

export function resolveApiUrl(baseUrl: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const base = baseUrl.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/** After PUT upload, prefer server-returned object path (includes storage bucket prefix). */
export async function readUploadObjectPath(uploadResponse: Response, fallback?: string): Promise<string> {
  try {
    const body = (await uploadResponse.json()) as Record<string, unknown>;
    const candidate =
      (typeof body.objectPath === "string" && body.objectPath) ||
      (typeof body.fullPath === "string" && body.fullPath) ||
      (typeof body.path === "string" && body.path) ||
      (typeof body.location === "string" && body.location) ||
      fallback;
    if (!candidate) {
      throw new Error("Upload response missing object path");
    }
    const normalized = normalizeFilePath(candidate);
    if (!normalized) {
      throw new Error("Could not normalize uploaded file path");
    }
    return normalized.replace(/^\/objects\//, "");
  } catch (e) {
    if (fallback) {
      const normalized = normalizeFilePath(fallback);
      if (normalized) return normalized.replace(/^\/objects\//, "");
    }
    throw e;
  }
}

/** PUT binary to a relative upload URL from `/api/objects/upload` (session: cookie or Bearer on RN). */
export async function putFileToUploadUrl(uploadPath: string, body: Blob, contentType: string): Promise<Response> {
  const url = resolveApiUrl(appConfig.apiBaseUrl, uploadPath);
  const token = useSessionStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": contentType || "application/octet-stream",
  };
  if (token && token !== "cookie-session") {
    headers.Authorization = `Bearer ${token}`;
  }
  let credentials: RequestCredentials = "omit";
  try {
    const api = new URL(appConfig.apiBaseUrl.replace(/\/$/, ""));
    const target = new URL(url);
    if (target.hostname === api.hostname) {
      credentials = "include";
    }
  } catch {
    /* omit */
  }
  return fetch(url, { method: "PUT", headers, body, credentials });
}

function arrayBufferToBytes(raw: unknown): Uint8Array {
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof raw === "string" && raw.length > 0) {
    throw new Error("Invalid file response from server.");
  }
  throw new Error("Invalid file response from server.");
}

async function downloadObjectBytes(
  objectApiPath: string,
  doc?: StoredDocumentMeta,
  opts?: { asAttachment?: boolean },
): Promise<Uint8Array> {
  const { filename, mimeType } = documentViewParams(doc);
  const tryFetch = async (path: string) => {
    const response = await apiClient.get<ArrayBuffer>(path, {
      params: {
        filename,
        mime: mimeType,
        ...(opts?.asAttachment ? { download: "true" } : {}),
      },
      responseType: "arraybuffer",
      headers: { Accept: "application/pdf, application/octet-stream, */*" },
    });
    return arrayBufferToBytes(response.data as ArrayBuffer | ArrayBufferView);
  };

  try {
    const bytes = await tryFetch(objectApiPath);
    if (bytes.byteLength === 0) throw new Error("Document file is empty.");
    return bytes;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404) throw err;

    const alternates: string[] = [];
    const pushAlt = (path: string) => {
      if (path !== objectApiPath && !alternates.includes(path)) alternates.push(path);
    };

    if (objectApiPath.startsWith("/objects/uploads/")) {
      pushAlt(objectApiPath.replace("/objects/uploads/", "/objects/local/uploads/"));
      pushAlt(objectApiPath.replace("/objects/uploads/", "/objects/private/uploads/"));
    }
    if (objectApiPath.startsWith("/objects/local/uploads/")) {
      pushAlt(objectApiPath.replace("/objects/local/uploads/", "/objects/uploads/"));
      pushAlt(objectApiPath.replace("/objects/local/uploads/", "/objects/private/uploads/"));
    }
    if (objectApiPath.startsWith("/objects/private/uploads/")) {
      pushAlt(objectApiPath.replace("/objects/private/uploads/", "/objects/local/uploads/"));
      pushAlt(objectApiPath.replace("/objects/private/uploads/", "/objects/uploads/"));
    }

    for (const alt of alternates) {
      try {
        const bytes = await tryFetch(alt);
        if (bytes.byteLength === 0) throw new Error("Document file is empty.");
        return bytes;
      } catch {
        /* try next */
      }
    }
    throw err;
  }
}

async function saveDocumentToDevice(filename: string, mimeType: string, bytes: Uint8Array): Promise<string> {
  const safeName = filename.replace(/[/\\?%*:|"<>]/g, "-") || "document.pdf";
  const file = new File(Paths.document, safeName);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

async function promptSaveDownloadedFile(filename: string, mimeType: string, fileUri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: `Save ${filename}`,
      UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : undefined,
    });
    return;
  }

  const canOpen = await Linking.canOpenURL(fileUri);
  if (canOpen) {
    await Linking.openURL(fileUri);
    return;
  }

  throw new Error("No app available to save this document.");
}

async function openViaSignedUrl(objectPath: string, doc?: StoredDocumentMeta): Promise<void> {
  const { filename, mimeType } = documentViewParams(doc);
  const { data } = await apiClient.post<{ signedUrl: string }>("/api/objects/presigned-url", {
    objectPath,
    filename,
    mimeType,
  });
  if (!data?.signedUrl) {
    throw new Error("Could not resolve document URL");
  }
  const viewUrl = data.signedUrl.startsWith("http")
    ? data.signedUrl
    : resolveApiUrl(appConfig.apiBaseUrl, data.signedUrl);
  const canOpen = await Linking.canOpenURL(viewUrl);
  if (!canOpen) {
    throw new Error("Cannot open document link on this device.");
  }
  await Linking.openURL(viewUrl);
}

/**
 * Download a stored document to the device, then open the system save/share sheet.
 */
export async function downloadStoredDocument(
  filePath: string | null | undefined,
  doc?: StoredDocumentMeta,
): Promise<void> {
  if (!filePath?.trim()) {
    throw new Error("Document file path is missing.");
  }

  const normalized = normalizeFilePath(filePath);
  if (!normalized) {
    throw new Error("Invalid document file path.");
  }

  const { filename, mimeType } = documentViewParams(doc);
  const objectApiPath = normalized.startsWith("/objects/") ? normalized : `/objects/${normalized}`;
  const bytes = await downloadObjectBytes(objectApiPath, doc, { asAttachment: true });
  const fileUri = await saveDocumentToDevice(filename, mimeType, bytes);
  await promptSaveDownloadedFile(filename, mimeType, fileUri);
}

/**
 * Open a stored document (PDF) using an authenticated download, then the system viewer.
 */
export async function openStoredDocument(
  filePath: string | null | undefined,
  doc?: StoredDocumentMeta,
): Promise<void> {
  if (!filePath?.trim()) {
    throw new Error("Document file path is missing.");
  }

  const normalized = normalizeFilePath(filePath);
  if (!normalized) {
    throw new Error("Invalid document file path.");
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    await Linking.openURL(normalized);
    return;
  }

  const { filename, mimeType } = documentViewParams(doc);
  const objectApiPath = normalized.startsWith("/objects/") ? normalized : `/objects/${normalized}`;

  try {
    const bytes = await downloadObjectBytes(objectApiPath, doc);
    const fileUri = await saveDocumentToDevice(filename, mimeType, bytes);
    await promptSaveDownloadedFile(filename, mimeType, fileUri);
    return;
  } catch (primaryError) {
    if (Platform.OS === "web") {
      throw primaryError;
    }
    try {
      await openViaSignedUrl(normalized, doc);
    } catch {
      throw primaryError;
    }
  }
}
