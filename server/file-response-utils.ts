import type { Response } from "express";

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

const EXT_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function mimeToExtension(mimeType?: string | null): string {
  if (!mimeType) return "";
  return MIME_TO_EXT[mimeType.toLowerCase().split(";")[0].trim()] || "";
}

export function extensionToMime(ext?: string | null): string | undefined {
  if (!ext) return undefined;
  const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return EXT_TO_MIME[normalized];
}

export function sanitizeDownloadFilename(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const base = raw.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return base || undefined;
}

export function buildDocumentFilename(title: string | undefined, mimeType?: string | null): string {
  const base = sanitizeDownloadFilename(title) || "document";
  if (/\.\w{2,5}$/i.test(base)) return base;
  const ext = mimeToExtension(mimeType);
  return ext ? `${base}${ext}` : base;
}

export function parseObjectFileQuery(req: {
  query: Record<string, unknown>;
}): { filename?: string; mimeType?: string; inline: boolean } {
  const filename =
    typeof req.query.filename === "string"
      ? sanitizeDownloadFilename(req.query.filename)
      : undefined;
  const mimeType = typeof req.query.mime === "string" ? req.query.mime.split(";")[0].trim() : undefined;
  const download =
    req.query.download === "1" ||
    req.query.download === "true" ||
    req.query.download === true;
  return { filename, mimeType, inline: !download };
}

export function setFileResponseHeaders(
  res: Response,
  opts: {
    filename?: string;
    mimeType?: string;
    inline?: boolean;
    size?: number;
    cacheControl?: string;
  },
) {
  const mimeType = opts.mimeType || "application/octet-stream";
  res.setHeader("Content-Type", mimeType);
  if (opts.size != null) {
    res.setHeader("Content-Length", String(opts.size));
  }
  if (opts.cacheControl) {
    res.setHeader("Cache-Control", opts.cacheControl);
  }
  if (opts.filename) {
    const safe = opts.filename.replace(/"/g, "'");
    const encoded = encodeURIComponent(safe);
    const disposition = opts.inline !== false ? "inline" : "attachment";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`,
    );
  }
}
