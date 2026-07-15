import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

/** Project root (parent of `server/` or `dist/` when bundled). */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function getLocalStorageDir() {
  const configured = process.env.LOCAL_STORAGE_DIR || "./storage";
  if (path.isAbsolute(configured)) {
    return path.resolve(configured);
  }
  // Resolve relative to app root — process.cwd() breaks under IIS / Windows services.
  return path.resolve(appRoot, configured);
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

/**
 * Alternate relative keys under LOCAL_STORAGE_DIR.
 * Upload/signing history used private/, local/uploads/, and bare uploads/ prefixes.
 */
export function localObjectRelativeCandidates(objectPath: string): string[] {
  const rel = objectPathToRelative(objectPath);
  const privateDir = getPrivateObjectDirName();
  const privateEscaped = privateDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bare = rel
    .replace(/^local\/uploads\//, "")
    .replace(/^local\//, "")
    .replace(new RegExp(`^${privateEscaped}/uploads/`), "")
    .replace(new RegExp(`^${privateEscaped}/`), "")
    .replace(/^uploads\//, "");

  const candidates: string[] = [];
  const add = (value: string) => {
    try {
      const clean = sanitizeRelativePath(value);
      if (!candidates.includes(clean)) candidates.push(clean);
    } catch {
      /* skip invalid */
    }
  };

  add(rel);
  for (const prefix of [
    "",
    "uploads/",
    "local/",
    "local/uploads/",
    `${privateDir}/`,
    `${privateDir}/uploads/`,
  ]) {
    add(`${prefix}${bare}`);
  }
  if (bare !== rel) {
    add(`${privateDir}/${rel}`);
    add(`local/${rel}`);
  }

  return candidates;
}

/** First existing absolute path on disk for a stored object, or null. */
export async function resolveLocalObjectAbsolutePath(objectPath: string): Promise<string | null> {
  const root = getLocalStorageDir();
  for (const rel of localObjectRelativeCandidates(objectPath)) {
    const abs = path.join(root, rel);
    try {
      await fs.access(abs);
      return abs;
    } catch {
      continue;
    }
  }
  return null;
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

  // /api/storage/upload/<bucket>/<path> — bucket must stay in the stored relative path (e.g. local/uploads/id).
  const storagePrefix = "/api/storage/upload/";
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

