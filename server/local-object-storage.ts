import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

export function getLocalStorageDir() {
  return path.resolve(process.env.LOCAL_STORAGE_DIR || "./storage");
}

export function getPrivateObjectDirName() {
  return (process.env.PRIVATE_OBJECT_DIR || "private").replace(/^\/+|\/+$/g, "");
}

export function createLocalUploadRelativePath() {
  return `${getPrivateObjectDirName()}/${randomUUID()}`;
}

function sanitizeRelativePath(raw: string) {
  const normalized = raw.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid object path");
  }
  return normalized;
}

export function objectPathToRelative(objectPath: string) {
  const withoutPrefix = objectPath.replace(/^\/objects\//, "");
  return sanitizeRelativePath(withoutPrefix);
}

export function objectPathToAbsolute(objectPath: string) {
  const rel = objectPathToRelative(objectPath);
  return path.join(getLocalStorageDir(), rel);
}

export async function ensureLocalParentDir(absoluteFilePath: string) {
  const dir = path.dirname(absoluteFilePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeLocalObject(relativePath: string, body: Buffer) {
  const rel = sanitizeRelativePath(relativePath);
  const abs = path.join(getLocalStorageDir(), rel);
  await ensureLocalParentDir(abs);
  await fs.writeFile(abs, body);
  return `/objects/${rel}`;
}

export function uploadUrlToObjectPath(uploadUrl: string) {
  let candidate = (uploadUrl || "").trim();
  if (!candidate) {
    throw new Error("Unsupported local upload URL format");
  }

  // Accept absolute URLs from browser/client and normalize to path.
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    try {
      const parsed = new URL(candidate);
      candidate = parsed.pathname;
    } catch {
      throw new Error("Unsupported local upload URL format");
    }
  }

  // Supported local upload URLs:
  // /api/object-storage/upload/<relative-path>
  // /api/storage/upload/local/<relative-path>
  if (candidate.startsWith("/objects/")) return candidate;

  const objectStoragePrefix = "/api/object-storage/upload/";
  if (candidate.startsWith(objectStoragePrefix)) {
    const rel = sanitizeRelativePath(candidate.slice(objectStoragePrefix.length));
    return `/objects/${rel}`;
  }

  const storagePrefix = "/api/storage/upload/local/";
  if (candidate.startsWith(storagePrefix)) {
    const rel = sanitizeRelativePath(candidate.slice(storagePrefix.length));
    return `/objects/${rel}`;
  }

  // If caller already sent relative path, convert directly.
  if (!candidate.startsWith("/api/")) {
    const rel = sanitizeRelativePath(candidate);
    return `/objects/${rel}`;
  }

  throw new Error("Unsupported local upload URL format");
}

/** Upper bound for data-URL signatures stored in text columns (~0.8M chars). */
export const MAX_SIGNATURE_DATA_URL_CHARS = 800_000;

/**
 * Persisted value for signature fields: canvas **data URL** (`data:image/png;base64,...`)
 * or a normal object path / upload URL (normalized to `/objects/...` when possible).
 */
export function normalizeSignatureForStorage(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (!raw) {
    throw new Error("signatureUrl is required");
  }
  if (raw.startsWith("data:image/")) {
    if (raw.length > MAX_SIGNATURE_DATA_URL_CHARS) {
      throw new Error("Signature image is too large; try clearing and signing again");
    }
    return raw;
  }
  try {
    return uploadUrlToObjectPath(raw);
  } catch {
    return raw;
  }
}

