/**
 * Short-lived JWT links so clients can open `/objects/...` files in an external viewer (no Bearer header).
 */
import fs from "fs/promises";
import path from "path";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import { objectPathToAbsolute } from "./local-object-storage";

const SECRET = process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

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

export async function streamLocalObjectToResponse(res: Response, objectPath: string): Promise<void> {
  const abs = objectPathToAbsolute(objectPath);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buf);
}
