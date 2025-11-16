// Reference: blueprint:javascript_object_storage
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { supabaseAdmin } from "./supabase";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const USE_SUPABASE_STORAGE = process.env.USE_SUPABASE_STORAGE === "true" || !process.env.REPL_ID;

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' tool"
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      console.error("PRIVATE_OBJECT_DIR environment variable is not set!");
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set the PRIVATE_OBJECT_DIR environment variable"
      );
    }
    console.log("Using PRIVATE_OBJECT_DIR:", dir);
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";

      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    try {
      // Use Supabase Storage if not on Replit or if explicitly enabled
      if (USE_SUPABASE_STORAGE) {
        return await this.getSupabaseUploadURL();
      }
      
      const privateObjectDir = this.getPrivateObjectDir();
      if (!privateObjectDir) {
        throw new Error("PRIVATE_OBJECT_DIR environment variable is not set");
      }
      
      const objectId = randomUUID();
      const fullPath = `${privateObjectDir}/uploads/${objectId}`;
      
      let bucketName: string;
      let objectName: string;
      
      try {
        const parsed = parseObjectPath(fullPath);
        bucketName = parsed.bucketName;
        objectName = parsed.objectName;
      } catch (parseError: any) {
        throw new Error(`Failed to parse object path: ${parseError.message}. Path: ${fullPath}`);
      }

      return await signObjectURL({
        bucketName,
        objectName,
        method: "PUT",
        ttlSec: 900,
      });
    } catch (error: any) {
      console.error("Error in getObjectEntityUploadURL:", error);
      // If Replit sidecar fails and we haven't tried Supabase, fallback to Supabase
      if (!USE_SUPABASE_STORAGE && (error.message?.includes("Cannot connect to Replit") || error.message?.includes("ECONNREFUSED"))) {
        console.log("Replit sidecar unavailable, falling back to Supabase Storage");
        return await this.getSupabaseUploadURL();
      }
      throw error;
    }
  }

  private async getSupabaseUploadURL(): Promise<string> {
    try {
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "private-objects";
      const objectId = randomUUID();
      const objectPath = `uploads/${objectId}`;
      
      // Return a special format that indicates Supabase Storage should be used
      // The client will upload to our server endpoint which will handle Supabase Storage
      return `supabase://${bucketName}/${objectPath}`;
    } catch (error: any) {
      console.error("Error in getSupabaseUploadURL:", error);
      throw new Error(`Failed to generate Supabase upload URL: ${error.message || "Unknown error"}`);
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  try {
    console.log("Signing URL for:", { bucketName, objectName, method });
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    
    const sidecarUrl = `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`;
    console.log("Fetching from sidecar:", sidecarUrl);
    
    let response: Response;
    try {
      response = await fetch(sidecarUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        // Add timeout to detect connection issues faster
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
    } catch (fetchError: any) {
      console.error("Fetch error:", fetchError);
      
      // Check if it's a connection refused error
      if (
        fetchError.code === "ECONNREFUSED" || 
        fetchError.message?.includes("ECONNREFUSED") ||
        fetchError.name === "AbortError" ||
        fetchError.message?.includes("timeout")
      ) {
        throw new Error(
          `Cannot connect to Replit sidecar at ${REPLIT_SIDECAR_ENDPOINT}. ` +
          `This application requires Replit's object storage. ` +
          `If you're not running on Replit, please set up object storage or configure PRIVATE_OBJECT_DIR environment variable. ` +
          `Error: ${fetchError.message || "Connection refused"}`
        );
      }
      throw new Error(`Network error connecting to sidecar: ${fetchError.message || fetchError}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("Sidecar response error:", response.status, errorText);
      throw new Error(
        `Failed to sign object URL: HTTP ${response.status} - ${errorText}`
      );
    }

    const responseData = await response.json();
    console.log("Sidecar response received");
    
    if (!responseData.signed_url) {
      console.error("Response data:", responseData);
      throw new Error("No signed_url in response from sidecar");
    }
    
    return responseData.signed_url;
  } catch (error: any) {
    console.error("Error in signObjectURL:", error);
    if (error.message) {
      throw error;
    }
    throw new Error(`Failed to sign object URL: ${error.message || "Unknown error"}`);
  }
}
