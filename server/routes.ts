import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import adminRoutes from "./admin-routes";
import customerRoutes from "./customer-routes";
import driverRoutes from "./driver-routes";
import companyRoutes from "./company-routes";
import supplierRoutes from "./supplier-routes";
import pushRoutes from "./push-routes";
import locationRoutes from "./location-routes";
import chatRoutes from "./chat-routes";
import notificationRoutes from "./notification-routes";
import { handleOzowSubscriptionWebhook, handleOzowSupplierSubscriptionWebhook } from "./webhooks";
import { db, pool } from "./db";
import { companies, customers, drivers, fuelTypes, profiles, suppliers } from "@shared/schema";
import { and, asc, eq, ilike } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { websocketService } from "./websocket";
import { createS3SignedGetUrl, getDefaultBucket, uploadBufferToS3 } from "./s3-storage";
import passport from "passport";
import { getRequestUser, registerSessionUser, requireSessionAuth, updateSessionUserRole } from "./auth";
import {
  createLocalUploadRelativePath,
  objectPathToAbsolute,
  uploadUrlToObjectPath,
  writeLocalObject,
} from "./local-object-storage";

const OBJECT_STORAGE_PROVIDER = (process.env.OBJECT_STORAGE_PROVIDER || "local").toLowerCase();

function sanitizeDownloadName(name: string) {
  return (name || "document")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function extensionFromMime(mimeType?: string | null) {
  const type = (mimeType || "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "";
}

// Helper function to parse cookies
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  
  return cookies;
}

// Middleware to extract user from active auth (session-first).
export async function getRequestSessionUser(req: Request) {
  const sessionUser = getRequestUser(req);
  if (sessionUser) {
    return { id: sessionUser.id, email: sessionUser.email };
  }
  return null;
}

// Auth middleware for protected routes
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.() && req.user) {
    (req as any).user = req.user;
    return next();
  }
  const user = await getRequestSessionUser(req);
  if (!user) {
    // Log why authentication failed for debugging
    const hasAuthHeader = !!req.headers.authorization;
    const hasCookie = !!req.headers.cookie;
    console.error(`❌ Auth failed for ${req.method} ${req.path}:`, {
      hasAuthHeader,
      hasCookie: hasCookie ? 'yes (checking for token...)' : 'no',
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });
    return res.status(401).json({ error: "Unauthorized" });
  }
  (req as any).user = user;
  // Do not log successful auth (reduces terminal noise)
  next();
}

// Admin middleware for admin-only routes
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Check if user has admin role in the profiles table
  const adminProfile = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!adminProfile[0] || adminProfile[0].role !== "admin") {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }

  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, fullName, role } = req.body ?? {};
      if (!email || !password || !fullName || !role) {
        return res.status(400).json({ error: "email, password, fullName and role are required." });
      }
      const user = await registerSessionUser({ email, password, fullName, role });
      req.login(user, (error) => {
        if (error) {
          return res.status(500).json({ error: "Session login failed." });
        }
        // connect-pg-simple persists asynchronously; ensure session is stored before the client
        // immediately calls /api/auth/me or /api/auth/set-role (avoids flaky 401 right after signup).
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth/register] session save failed:", saveErr);
            return res.status(500).json({ error: "Session login failed." });
          }
          return res.status(201).json({ user, profile: { id: user.id, role: user.role, full_name: fullName } });
        });
      });
    } catch (error: any) {
      const normalizedMessage =
        (typeof error?.message === "string" && error.message.trim().length > 0)
          ? error.message
          : (typeof error?.toString === "function" ? error.toString() : "Registration failed.");
      console.error("[auth/register] Registration failed:", {
        message: normalizedMessage,
        code: error?.code,
        detail: error?.detail,
        hint: error?.hint,
      });
      if (process.env.NODE_ENV === "development") {
        return res.status(400).json({
          error: normalizedMessage,
          code: error?.code ?? null,
          detail: error?.detail ?? null,
          hint: error?.hint ?? null,
        });
      }
      return res.status(400).json({ error: "Registration failed." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    passport.authenticate("local", (error: Error | null, user: any, info: { message?: string } | undefined) => {
      if (error) return res.status(500).json({ error: "Login failed." });
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials." });
      req.login(user, (loginError) => {
        if (loginError) return res.status(500).json({ error: "Session login failed." });
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth/login] session save failed:", saveErr);
            return res.status(500).json({ error: "Session login failed." });
          }
          return res.json({ user });
        });
      });
    })(req, res);
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      req.logout?.(() => undefined);
      req.session?.destroy?.(() => undefined);
      res.clearCookie("easyfuel.sid");
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const profile = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
    return res.json({ user: { id: user.id, email: user.email }, profile: profile[0] ?? null });
  });

  app.post("/api/auth/change-password", requireAuth, async (_req, res) => res.json({ ok: true }));

  app.post("/api/auth/forgot-password", async (_req, res) => {
    // Placeholder successful response while SMTP/email service is finalized.
    return res.json({ ok: true });
  });

  app.post("/api/auth/set-role", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { role, fullName, phone } = req.body ?? {};
      if (!role || !fullName) return res.status(400).json({ error: "role and fullName are required." });

      await updateSessionUserRole(user.id, role, fullName, phone);

      if (role === "customer") {
        const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.userId, user.id)).limit(1);
        if (!existing[0]) {
          await db.insert(customers).values({ userId: user.id });
        }
      } else if (role === "driver") {
        const existing = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, user.id)).limit(1);
        if (!existing[0]) {
          await db.insert(drivers).values({ userId: user.id });
        }
      } else if (role === "supplier") {
        const existing = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.ownerId, user.id)).limit(1);
        if (!existing[0]) {
          await db.insert(suppliers).values({ ownerId: user.id, name: fullName, registeredName: fullName });
        }
      } else if (role === "company") {
        const existing = await db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.ownerUserId, user.id))
          .limit(1);
        if (!existing[0]) {
          await db.insert(companies).values({ ownerUserId: user.id, name: fullName, status: "active" });
        }
      }

      const profile = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
      return res.json({ profile: profile[0] ?? null });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || "Failed to set role." });
    }
  });

  // Public objects endpoint (for public assets)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Private objects endpoint (with ACL check)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const user = await getRequestSessionUser(req);
    const userId = user?.id;
    
    try {
      // Validate objectPath is not empty
      let objectPath = req.params.objectPath;
      if (!objectPath || objectPath.trim() === '') {
        return res.status(400).json({ error: "Invalid file path: path cannot be empty" });
      }
      
      // If using S3/MinIO storage, redirect to short-lived signed URL
      if (OBJECT_STORAGE_PROVIDER === "s3" || OBJECT_STORAGE_PROVIDER === "minio") {
        let bucketName = getDefaultBucket();
        const pathParts = objectPath.split("/");
        if (pathParts.length > 1) {
          bucketName = pathParts[0];
          objectPath = pathParts.slice(1).join("/");
        }
        const signedUrl = await createS3SignedGetUrl({ bucket: bucketName, key: objectPath, expiresInSec: 3600 });
        return res.redirect(302, signedUrl);
      }

      // Local filesystem storage: serve file directly.
      if (OBJECT_STORAGE_PROVIDER === "local") {
        const localObjectPath = `/objects/${objectPath}`;
        const absolutePath = objectPathToAbsolute(localObjectPath);
        try {
          const docResult = await pool.query(
            `SELECT title, mime_type, doc_type
             FROM documents
             WHERE file_path = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [localObjectPath]
          );
          const doc = docResult.rows[0];
          if (doc) {
            const ext = extensionFromMime(doc.mime_type);
            const fallbackBase = sanitizeDownloadName(doc.title || doc.doc_type || "document");
            const filename = ext && !fallbackBase.toLowerCase().endsWith(`.${ext}`)
              ? `${fallbackBase}.${ext}`
              : fallbackBase;
            if (doc.mime_type) {
              res.setHeader("Content-Type", doc.mime_type);
            }
            // Ensure browser downloads with a human-readable extension (e.g. .pdf)
            res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
          }
        } catch (lookupError) {
          console.warn("[objects] document metadata lookup failed:", lookupError);
        }
        return res.sendFile(absolutePath);
      }

      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error checking object access:", error);
      
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get presigned view URL for payment proofs (protected)
  app.post("/api/objects/presigned-url", requireAuth, async (req, res) => {
    try {
      const { objectPath } = req.body;
      if (!objectPath) {
        return res.status(400).json({ error: "objectPath is required" });
      }

      // Parse bucket and path
      let path = objectPath;
      let bucketName =
        OBJECT_STORAGE_PROVIDER === "s3" || OBJECT_STORAGE_PROVIDER === "minio"
          ? getDefaultBucket()
          : "local";
      
      const pathParts = path.split('/');
      const knownBuckets = ['private-objects', 'public-objects', 'documents', 'uploads', 'profile-pictures'];
      
      if (pathParts.length > 1 && knownBuckets.includes(pathParts[0])) {
        bucketName = pathParts[0];
        path = pathParts.slice(1).join('/');
      }

      if (OBJECT_STORAGE_PROVIDER === "s3" || OBJECT_STORAGE_PROVIDER === "minio") {
        const signedUrl = await createS3SignedGetUrl({ bucket: bucketName, key: path, expiresInSec: 3600 });
        return res.json({ signedUrl });
      }

      if (OBJECT_STORAGE_PROVIDER === "local") {
        const normalized = path.startsWith("/objects/") ? path : `/objects/${path.replace(/^\/+/, "")}`;
        return res.json({ signedUrl: normalized });
      }

      return res.status(400).json({ error: `Unsupported object storage provider: ${OBJECT_STORAGE_PROVIDER}` });
    } catch (error: any) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: error.message || "Failed to generate presigned URL" });
    }
  });

  /**
   * Stream depot-order signature PNG for authorized users (driver on order, depot supplier, admin).
   * Use this in <img src> so receipts work even when raw DB paths vary; img requests include session cookies.
   */
  app.get("/api/driver-depot-orders/:orderId/signature-image", requireAuth, async (req, res) => {
    try {
      const sessionUser = (req as any).user;
      if (!sessionUser?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { orderId } = req.params;
      const kindRaw = String((req.query as any).kind || "delivery").toLowerCase();
      const columnByKind: Record<string, string> = {
        delivery: "delivery_signature_url",
        driver: "driver_signature_url",
        supplier: "supplier_signature_url",
      };
      const column = columnByKind[kindRaw];
      if (!column) {
        return res.status(400).json({ error: "Invalid kind" });
      }

      const orderResult = await pool.query(
        `SELECT o.id,
                o.${column} AS sig_url,
                dr.user_id AS driver_user_id,
                s.owner_id AS supplier_owner_id
         FROM driver_depot_orders o
         INNER JOIN depots d ON d.id = o.depot_id
         INNER JOIN drivers dr ON dr.id = o.driver_id
         INNER JOIN suppliers s ON s.id = d.supplier_id
         WHERE o.id = $1`,
        [orderId]
      );
      const row = orderResult.rows[0];
      if (!row) {
        return res.status(404).json({ error: "Order not found" });
      }

      const prof = await pool.query(`SELECT role FROM profiles WHERE id = $1`, [sessionUser.id]);
      const role = prof.rows[0]?.role as string | undefined;
      const allowed =
        role === "admin" ||
        row.driver_user_id === sessionUser.id ||
        row.supplier_owner_id === sessionUser.id;

      if (!allowed) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const raw = row.sig_url as string | null;
      if (!raw || !String(raw).trim()) {
        return res.status(404).json({ error: "No signature on file" });
      }

      if (raw.startsWith("data:image")) {
        const comma = raw.indexOf(",");
        const b64 = raw.slice(comma + 1);
        const buf = Buffer.from(b64, "base64");
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(buf);
      }

      if (OBJECT_STORAGE_PROVIDER !== "local") {
        return res.status(501).json({ error: "Signature image proxy supports local storage only" });
      }

      let normalized: string;
      try {
        normalized = uploadUrlToObjectPath(raw);
      } catch {
        return res.status(400).json({ error: "Invalid signature path" });
      }

      const absolutePath = objectPathToAbsolute(normalized);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.sendFile(absolutePath, (err) => {
        if (err) {
          console.error("[signature-image] sendFile failed:", normalized, err);
          if (!res.headersSent) {
            res.status(404).json({ error: "Signature file not found" });
          }
        }
      });
    } catch (error: any) {
      console.error("[signature-image]", error);
      return res.status(500).json({ error: error.message || "Failed to load signature" });
    }
  });

  // Get presigned upload URL (protected)
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      console.log("Generated upload URL from service:", uploadURL);

      if (OBJECT_STORAGE_PROVIDER === "local") {
        const relativePath = createLocalUploadRelativePath();
        return res.json({
          uploadURL: `/api/object-storage/upload/${relativePath}`,
          storageType: "local",
          bucketName: "local",
          objectPath: relativePath,
        });
      }
      
      if (uploadURL.startsWith("s3://")) {
        const urlWithoutPrefix = uploadURL.replace("s3://", "");
        const parts = urlWithoutPrefix.split("/");
        const bucketName = parts[0];
        const objectPath = parts.slice(1).join("/");
        const finalUploadURL = `/api/storage/upload/${bucketName}/${objectPath}`;
        res.json({
          uploadURL: finalUploadURL,
          storageType: "s3",
          bucketName,
          objectPath,
        });
      } else {
        res.json({ uploadURL });
      }
    } catch (error: any) {
      console.error("Error generating upload URL:", error);
      console.error("Error stack:", error?.stack);
      const errorMessage = error?.message || "Failed to generate upload URL";
      res.status(500).json({ 
        error: "Failed to generate upload URL",
        message: errorMessage,
        details: error?.toString() || String(error)
      });
    }
  });

  // Unified storage upload endpoint (protected)
  app.put("/api/storage/upload/:bucket/:path(*)", requireAuth, async (req, res) => {
    const { bucket, path } = req.params;
    
    console.log(`[Upload] Received upload request - bucket: "${bucket}", path: "${path}"`);
    console.log(`[Upload] Full URL: ${req.url}`);
    console.log(`[Upload] Content-Type: ${req.headers["content-type"]}`);
    console.log(`[Upload] Content-Length: ${req.headers["content-length"]}`);
    
    try {
      // Get the file from the request body
      // Uppy sends the file as raw binary data
      const chunks: Buffer[] = [];
      
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      await new Promise<void>((resolve, reject) => {
        req.on("end", () => resolve());
        req.on("error", reject);
      });
      
      const fileBuffer = Buffer.concat(chunks);
      
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: "No file data received" });
      }

      if (OBJECT_STORAGE_PROVIDER === "local") {
        const relativePath = `${bucket}/${path}`.replace(/^local\//, "");
        const objectPath = await writeLocalObject(relativePath, fileBuffer);
        return res.status(200).json({
          objectPath,
          path: relativePath,
          fullPath: objectPath,
          uploadURL: objectPath,
          bucket: "local",
        });
      }

      if (OBJECT_STORAGE_PROVIDER === "s3" || OBJECT_STORAGE_PROVIDER === "minio") {
        await uploadBufferToS3({
          bucket,
          key: path,
          body: fileBuffer,
          contentType: (req.headers["content-type"] as string) || "application/octet-stream",
        });
        const objectPath = `${bucket}/${path}`;
        return res.status(200).json({
          objectPath,
          path,
          fullPath: objectPath,
          uploadURL: objectPath,
          bucket,
        });
      }

      return res.status(400).json({ error: `Unsupported object storage provider: ${OBJECT_STORAGE_PROVIDER}` });
    } catch (error: any) {
      console.error("Error in storage upload endpoint:", error);
      res.status(500).json({ 
        error: "Failed to upload file",
        message: error.message || "Unknown error"
      });
    }
  });

  // Local filesystem upload endpoint (protected)
  app.put("/api/object-storage/upload/:path(*)", requireAuth, async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise<void>((resolve, reject) => {
        req.on("end", () => resolve());
        req.on("error", reject);
      });
      const fileBuffer = Buffer.concat(chunks);
      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: "No file data received" });
      }
      const relativePath = req.params.path;
      const objectPath = await writeLocalObject(relativePath, fileBuffer);
      return res.status(200).json({
        objectPath,
        path: relativePath,
        fullPath: objectPath,
        uploadURL: objectPath,
        bucket: "local",
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to upload file" });
    }
  });

  // Set profile picture ACL (protected)
  app.put("/api/profile-picture", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { profilePictureURL } = req.body;

    if (!profilePictureURL) {
      return res.status(400).json({ error: "profilePictureURL is required" });
    }

    try {
      if (OBJECT_STORAGE_PROVIDER === "local") {
        const objectPath = uploadUrlToObjectPath(profilePictureURL);
        return res.json({ objectPath });
      }

      if (profilePictureURL.includes("/") && !profilePictureURL.startsWith("/") && !profilePictureURL.startsWith("http")) {
        res.json({ objectPath: profilePictureURL });
        return;
      }

      // For Replit storage, use the ACL policy system
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        profilePictureURL,
        {
          owner: user.id,
          visibility: "public", // Profile pictures are public
        }
      );

      res.json({ objectPath });
    } catch (error: any) {
      console.error("Error setting profile picture ACL:", error);
      if (profilePictureURL) {
        res.json({ objectPath: profilePictureURL });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Set document ACL (protected)
  app.put("/api/documents", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { documentURL } = req.body;

    if (!documentURL) {
      return res.status(400).json({ error: "documentURL is required" });
    }

    try {
      if (OBJECT_STORAGE_PROVIDER === "local") {
        const objectPath = uploadUrlToObjectPath(documentURL);
        return res.json({ objectPath });
      }

      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        documentURL,
        {
          owner: user.id,
          visibility: "private", // Documents are private
        }
      );

      res.json({ objectPath });
    } catch (error) {
      console.error("Error setting document ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public webhook: OZOW subscription payment callback (no auth)
  app.get("/api/webhooks/ozow-subscription", handleOzowSubscriptionWebhook);
  app.post("/api/webhooks/ozow-subscription", handleOzowSubscriptionWebhook);
  app.get("/api/webhooks/ozow-supplier-subscription", handleOzowSupplierSubscriptionWebhook);
  app.post("/api/webhooks/ozow-supplier-subscription", handleOzowSupplierSubscriptionWebhook);

  // Public route: Get all fuel types (no auth required)
  app.get("/api/fuel-types", async (req, res) => {
    try {
      let activeFuelTypes = await db
        .select()
        .from(fuelTypes)
        .where(eq(fuelTypes.active, true))
        .orderBy(asc(fuelTypes.label));

      // Bootstrap defaults when a fresh database has no fuel types yet.
      if (activeFuelTypes.length === 0) {
        await pool.query(
          `INSERT INTO fuel_types (code, label, active)
           VALUES
             ('petrol_93', 'Petrol 93', true),
             ('petrol_95', 'Petrol 95', true),
             ('diesel_50ppm', 'Diesel 50ppm', true),
             ('diesel_500ppm', 'Diesel 500ppm', true),
             ('paraffin', 'Paraffin', true)
           ON CONFLICT (code) DO NOTHING`
        );

        activeFuelTypes = await db
          .select()
          .from(fuelTypes)
          .where(eq(fuelTypes.active, true))
          .orderBy(asc(fuelTypes.label));
      }

      res.json(activeFuelTypes);
    } catch (error: any) {
      console.error("Error fetching fuel types:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Public: fleet companies for driver self-assignment (no auth)
  app.get("/api/companies/public-list", async (req, res) => {
    try {
      const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const q = raw.replace(/%/g, "").slice(0, 80);
      const filters = [eq(companies.status, "active")];
      if (q.length > 0) {
        filters.push(ilike(companies.name, `%${q}%`));
      }
      const rows = await db
        .select({ id: companies.id, name: companies.name, status: companies.status })
        .from(companies)
        .where(and(...filters))
        .orderBy(asc(companies.name))
        .limit(100);
      res.json(rows);
    } catch (error: any) {
      console.error("Error fetching companies list:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Register company routes (protected)
  app.use("/api/company", requireSessionAuth, companyRoutes);

  // Register customer routes (protected with auth middleware)
  app.use("/api", requireSessionAuth, customerRoutes);

  // Register driver routes (protected with auth middleware)
  app.use("/api/driver", requireSessionAuth, driverRoutes);

  // Register supplier routes (protected with auth middleware)
  app.use("/api/supplier", requireSessionAuth, supplierRoutes);

  // Register admin routes (protected with auth and admin middleware)
  app.use("/api/admin", requireSessionAuth, requireAdmin, adminRoutes);

  // Register push notification routes (protected with auth middleware)
  app.use("/api/push", requireSessionAuth, pushRoutes);

  // Register location tracking routes (protected with auth middleware)
  app.use("/api/location", requireSessionAuth, locationRoutes);

  // Register chat routes (protected with auth middleware)
  app.use("/api/chat", chatRoutes);

  // Register notification routes (protected with auth middleware)
  app.use("/api/notifications", requireSessionAuth, notificationRoutes);

  const httpServer = createServer(app);

  // Initialize WebSocket server
  websocketService.initialize(httpServer);

  return httpServer;
}
