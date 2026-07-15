import { randomUUID } from "crypto";
import {
  getPrivateObjectDirName,
  resolveLocalObjectAbsolutePath,
  uploadUrlToObjectPath,
} from "./local-object-storage";
import { normalizeToObjectPath } from "./object-view-token";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/** Map legacy GCS URLs stored in the DB to `/objects/...` paths. */
function legacyGcsUrlToObjectPath(raw: string): string | null {
  if (!raw.startsWith("https://storage.googleapis.com/")) {
    return null;
  }
  try {
    const pathname = new URL(raw).pathname;
    const privateDir = getPrivateObjectDirName();
    const prefixes = [`/${privateDir}/`, `/${privateDir}`];
    for (const prefix of prefixes) {
      if (pathname.startsWith(prefix)) {
        const entityId = pathname.slice(prefix.length).replace(/^\/+/, "");
        if (entityId) return `/objects/${entityId}`;
      }
    }
    const trimmed = pathname.replace(/^\/+/, "");
    if (trimmed) return `/objects/${trimmed}`;
  } catch {
    /* ignore */
  }
  return null;
}

/** Normalize any stored upload reference and verify the file exists on disk. */
export async function ensureStoredObjectPath(raw: string): Promise<string> {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new ObjectNotFoundError();
  }

  let objectPath: string;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const legacy = legacyGcsUrlToObjectPath(trimmed);
    if (!legacy) {
      throw new ObjectNotFoundError();
    }
    objectPath = legacy;
  } else {
    try {
      objectPath = uploadUrlToObjectPath(trimmed);
    } catch {
      objectPath = normalizeToObjectPath(trimmed);
    }
  }

  const abs = await resolveLocalObjectAbsolutePath(objectPath);
  if (!abs) {
    throw new ObjectNotFoundError();
  }
  return objectPath.replace(/^\/objects\//, "");
}

export class ObjectStorageService {
  /** Returns a local upload target handled by `PUT /api/storage/upload/:bucket/:path`. */
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    return `local://uploads/${objectId}`;
  }

  /** @deprecated ACL metadata was Replit/GCS-only; local files use session auth on `/objects/...`. */
  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return ensureStoredObjectPath(rawPath);
  }
}
