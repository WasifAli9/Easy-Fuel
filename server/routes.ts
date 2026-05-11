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
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { websocketService } from "./websocket";
import {
  bootstrapLocalAuth,
  changeLocalPassword,
  getLocalUserFromRequest,
  loginLocalUser,
  refreshLocalTokens,
  registerLocalUser,
} from "./auth-local";
import { db } from "./db";
import { companies, fuelTypes, profiles } from "@shared/schema";
import { and, asc, eq, ilike } from "drizzle-orm";
import fs from "fs/promises";
import { objectPathToAbsolute, writeLocalObject } from "./local-object-storage";
import {
  normalizeToObjectPath,
  readObjectViewToken,
  signObjectViewToken,
  streamLocalObjectToResponse,
} from "./object-view-token";
import { getRequestUser } from "./auth";

/** API user: Bearer JWT (`auth-local`) or Passport session (`setupAuth`). */
export async function resolveAuthedUser(req: Request) {
  const local = await getLocalUserFromRequest(req);
  if (local) {
    return { id: local.id, email: local.email };
  }
  const sessionUser = getRequestUser(req);
  if (sessionUser?.id) {
    return { id: sessionUser.id, email: sessionUser.email };
  }
  return null;
}

// Auth middleware for protected routes
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await resolveAuthedUser(req);
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

  const profRows = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const profile = profRows[0];
  if (!profile || profile.role !== "admin") {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }

  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

  await bootstrapLocalAuth();

  const handlePasswordLogin = async (req: Request, res: Response) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email.trim() || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }
      const result = await loginLocalUser(email, password);
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed.";
      return res.status(401).json({ message });
    }
  };

  // Same contract as Inspect360 mobile: POST JSON { email, password } → JWT + user (no cookies required).
  app.post("/api/login", handlePasswordLogin);
  app.post("/api/auth/login", handlePasswordLogin);

  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const fullName = typeof req.body?.fullName === "string" ? req.body.fullName : "";
      const roleRaw = typeof req.body?.role === "string" ? req.body.role : "";
      const allowed = new Set(["customer", "driver", "supplier", "admin", "company"]);
      if (!email.trim() || !password || !fullName.trim()) {
        return res.status(400).json({ message: "email, password, and fullName are required." });
      }
      if (!allowed.has(roleRaw)) {
        return res.status(400).json({ message: "Invalid role." });
      }
      if (roleRaw === "admin") {
        return res.status(403).json({ message: "Admin accounts cannot be registered here." });
      }
      const result = await registerLocalUser({
        email,
        password,
        fullName: fullName.trim(),
        role: roleRaw as "customer" | "driver" | "supplier" | "admin" | "company",
      });
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed.";
      return res.status(400).json({ message });
    }
  });

  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
      if (!refreshToken) {
        return res.status(400).json({ message: "refreshToken is required." });
      }
      const out = await refreshLocalTokens(refreshToken);
      return res.json(out);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Refresh failed.";
      return res.status(401).json({ message });
    }
  });

  /** Inspect360-style current user for mobile AuthContext (`authService.getCurrentUser`). */
  app.get("/api/auth/user", requireAuth, async (req: Request, res: Response) => {
    const u = (req as { user?: { id: string; email?: string } }).user;
    if (!u?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const profRows = await db
        .select({
          role: profiles.role,
          fullName: profiles.fullName,
          phone: profiles.phone,
          profilePhotoUrl: profiles.profilePhotoUrl,
        })
        .from(profiles)
        .where(eq(profiles.id, u.id))
        .limit(1);
      const profile = profRows[0];
      return res.json({
        id: u.id,
        email: u.email ?? "",
        role: profile?.role ?? null,
        fullName: profile?.fullName ?? "",
        phone: profile?.phone ?? null,
        profilePhotoUrl: profile?.profilePhotoUrl ?? null,
      });
    } catch (e: unknown) {
      console.error("[api/auth/user]", e);
      return res.status(500).json({ message: "Failed to load user." });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = (req as { user?: { id: string } }).user;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const profRows = await db
        .select({ profilePhotoUrl: profiles.profilePhotoUrl })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);
      const data = profRows[0];
      return res.json({
        profile: {
          profile_photo_url: data?.profilePhotoUrl ?? null,
        },
      });
    } catch (e: unknown) {
      console.error("[api/auth/me]", e);
      return res.status(500).json({ message: "Failed to load profile." });
    }
  });

  app.post("/api/logout", (_req: Request, res: Response) => {
    res.json({ message: "Logged out successfully" });
  });

  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    const user = (req as { user?: { id: string } }).user;
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!user?.id || !currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required." });
    }
    try {
      await changeLocalPassword(user.id, currentPassword, newPassword);
      return res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Password update failed.";
      return res.status(400).json({ message });
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

  /** Time-limited link for opening stored files without a Bearer header (e.g. mobile `Linking.openURL`). */
  app.get("/api/objects/view", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const objectPath = readObjectViewToken(token);
      if (!objectPath) {
        return res.status(401).json({ error: "Invalid or expired link" });
      }
      await streamLocalObjectToResponse(res, objectPath);
    } catch (e) {
      console.error("[api/objects/view]", e);
      return res.status(404).json({ error: "File not found" });
    }
  });

  // Private objects: local disk (LOCAL_STORAGE_DIR) first, then Replit/GCS object storage if configured.
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const user = await resolveAuthedUser(req);
    const userId = user?.id;
    const objectPathParam = req.params.objectPath;
    if (!objectPathParam?.trim()) {
      return res.status(400).json({ error: "Invalid file path: path cannot be empty" });
    }
    const canonicalPath = req.path.startsWith("/objects/") ? req.path : `/objects/${objectPathParam}`;

    try {
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      try {
        const abs = objectPathToAbsolute(canonicalPath);
        await fs.access(abs);
        await streamLocalObjectToResponse(res, canonicalPath);
        return;
      } catch {
        // fall through to Replit / GCS-backed object storage
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
      if (error?.message?.includes("PRIVATE_OBJECT_DIR not set")) {
        return res.status(503).json({
          error: "Object storage is not configured",
          hint: "Set LOCAL_STORAGE_DIR (e.g. ./storage) for local files, or PRIVATE_OBJECT_DIR for hosted object storage.",
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/objects/presigned-url", requireAuth, async (req, res) => {
    try {
      const raw = req.body?.objectPath;
      if (!raw) {
        return res.status(400).json({ error: "objectPath is required" });
      }
      const objectPath = normalizeToObjectPath(String(raw));
      try {
        await fs.access(objectPathToAbsolute(objectPath));
      } catch {
        return res.status(404).json({ error: "File not found" });
      }
      const host = req.get("host") || "localhost";
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
      const base = `${proto}://${host}`;
      const token = signObjectViewToken(objectPath);
      const signedUrl = `${base}/api/objects/view?token=${encodeURIComponent(token)}`;
      res.json({ signedUrl });
    } catch (error: any) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: error.message || "Failed to generate presigned URL" });
    }
  });

  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      if (uploadURL.startsWith("local://")) {
        const rest = uploadURL.replace("local://", "").replace(/^\/+/, "");
        return res.json({
          uploadURL: `/api/storage/upload/local/${rest}`,
          storageType: "local",
          objectPath: rest,
        });
      }
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({
        error: "Failed to generate upload URL",
        message: error?.message || "Failed to generate upload URL",
      });
    }
  });

  app.put("/api/storage/upload/:bucket/:path(*)", requireAuth, async (req, res) => {
    const { bucket, path: pathParam } = req.params;
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      await new Promise<void>((resolve, reject) => {
        req.on("end", () => resolve());
        req.on("error", reject);
      });
      const fileBuffer = Buffer.concat(chunks);
      if (!fileBuffer.length) {
        return res.status(400).json({ error: "No file data received" });
      }

      const relative = `${bucket}/${pathParam}`.replace(/\/+/g, "/").replace(/^\/+/, "");
      const storedPath = await writeLocalObject(relative, fileBuffer);
      const pathOnly = storedPath.replace(/^\/objects\//, "");

      return res.status(200).json({
        objectPath: pathOnly,
        path: pathParam,
        fullPath: pathOnly,
        uploadURL: pathOnly,
        location: storedPath,
        url: storedPath,
        bucket,
      });
    } catch (error: any) {
      console.error("Error in storage upload endpoint:", error);
      return res.status(500).json({
        error: "Failed to upload file",
        message: error?.message || "Unknown error",
      });
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
      if (profilePictureURL.includes("/") && !profilePictureURL.startsWith("/") && !profilePictureURL.startsWith("http")) {
        res.json({ objectPath: profilePictureURL });
        return;
      }

      // Hosted object storage (Replit/GCS): apply ACL metadata
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
      const rows = await db
        .select()
        .from(fuelTypes)
        .where(eq(fuelTypes.active, true))
        .orderBy(asc(fuelTypes.label));
      res.json(rows);
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
      const conditions = [eq(companies.status, "active")];
      if (q.length > 0) {
        conditions.push(ilike(companies.name, `%${q}%`));
      }
      const rows = await db
        .select({ id: companies.id, name: companies.name, status: companies.status })
        .from(companies)
        .where(and(...conditions))
        .orderBy(asc(companies.name))
        .limit(100);
      res.json(rows);
    } catch (error: any) {
      console.error("Error fetching companies list:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Register company routes (protected)
  app.use("/api/company", requireAuth, companyRoutes);

  // Register customer routes (protected with auth middleware)
  app.use("/api", requireAuth, customerRoutes);

  // Register driver routes (protected with auth middleware)
  app.use("/api/driver", requireAuth, driverRoutes);

  // Register supplier routes (protected with auth middleware)
  app.use("/api/supplier", requireAuth, supplierRoutes);

  // Register admin routes (protected with auth and admin middleware)
  app.use("/api/admin", requireAuth, requireAdmin, adminRoutes);

  // Register push notification routes (protected with auth middleware)
  app.use("/api/push", requireAuth, pushRoutes);

  // Register location tracking routes (protected with auth middleware)
  app.use("/api/location", requireAuth, locationRoutes);

  // Register chat routes (protected with auth middleware)
  app.use("/api/chat", chatRoutes);

  // Register notification routes (protected with auth middleware)
  app.use("/api/notifications", requireAuth, notificationRoutes);

  const httpServer = createServer(app);

  // Initialize WebSocket server
  websocketService.initialize(httpServer);

  return httpServer;
}
