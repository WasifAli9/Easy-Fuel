import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import adminRoutes from "./admin-routes";
import customerRoutes from "./customer-routes";
import driverRoutes from "./driver-routes";
import supplierRoutes from "./supplier-routes";
import pushRoutes from "./push-routes";
import { supabaseAdmin } from "./supabase";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { websocketService } from "./websocket";

// Middleware to extract Supabase user from JWT
export async function getSupabaseUser(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }

  return user;
}

// Auth middleware for protected routes
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getSupabaseUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  (req as any).user = user;
  next();
}

// Admin middleware for admin-only routes
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Check if user has admin role in the profiles table
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }

  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  const objectStorageService = new ObjectStorageService();

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
    const user = await getSupabaseUser(req);
    const userId = user?.id;
    
    try {
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
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get presigned upload URL (protected)
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
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
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        profilePictureURL,
        {
          owner: user.id,
          visibility: "public", // Profile pictures are public
        }
      );

      res.json({ objectPath });
    } catch (error) {
      console.error("Error setting profile picture ACL:", error);
      res.status(500).json({ error: "Internal server error" });
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

  const httpServer = createServer(app);

  // Initialize WebSocket server
  websocketService.initialize(httpServer);

  return httpServer;
}
