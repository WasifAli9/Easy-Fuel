/**
 * Short-lived JWT links so clients can open `/objects/...` files in an external viewer (no Bearer header).
 */
import fs from "fs/promises";
import path from "path";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import { extensionToMime, setFileResponseHeaders } from "./file-response-utils";
import { objectPathToAbsolute } from "./local-object-storage";

const SECRET = process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me";

export function normalizeToObjectPath(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) {
    throw new Error("objectPath is required");
  }
  if (s.startsWith("/objects/")) {
    return s;
  }
  if (s.startsWith("objects/")) {
    return `/${s}`;
  }
  return `/objects/${s.replace(/^\/+/, "")}`;
}

export function signObjectViewToken(objectPath: string): string {
  return jwt.sign({ typ: "obj-read", objectPath }, SECRET, { expiresIn: 60 * 60 });
}

export function readObjectViewToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET) as { typ?: string; objectPath?: string };
    if (p.typ !== "obj-read" || typeof p.objectPath !== "string" || !p.objectPath.startsWith("/objects/")) {
      return null;
    }
    return p.objectPath;
  } catch {
    return null;
  }
}

export async function streamLocalObjectToResponse(
  res: Response,
  objectPath: string,
  opts?: { filename?: string; mimeType?: string; inline?: boolean },
): Promise<void> {
  const abs = objectPathToAbsolute(objectPath);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimeType = opts?.mimeType || extensionToMime(ext) || "application/octet-stream";
  setFileResponseHeaders(res, {
    filename: opts?.filename,
    mimeType,
    inline: opts?.inline ?? true,
    size: buf.length,
    cacheControl: "private, no-store",
  });
  res.send(buf);
}
