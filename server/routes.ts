import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import adminRoutes from "./admin-routes";
import customerRoutes from "./customer-routes";
import driverRoutes from "./driver-routes";
import supplierRoutes from "./supplier-routes";
import pushRoutes from "./push-routes";
import locationRoutes from "./location-routes";
import chatRoutes from "./chat-routes";
import notificationRoutes from "./notification-routes";
import { supabaseAdmin, supabaseAuth } from "./supabase";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { websocketService } from "./websocket";

// Check if we should use Supabase Storage (when not on Replit or explicitly enabled)
const USE_SUPABASE_STORAGE = process.env.USE_SUPABASE_STORAGE === "true" || !process.env.REPL_ID;

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

// Middleware to extract Supabase user from JWT
export async function getSupabaseUser(req: Request) {
  // Try to get token from Authorization header first
  let token: string | null = null;
  const authHeader = req.headers.authorization;
  
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    // Fallback: try to get token from cookies
    // Supabase stores session in cookies with key pattern: sb-<project-ref>-auth-token
    const cookieHeader = req.headers.cookie;
    
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader);
      
      // Look for Supabase auth token cookie (pattern: sb-*-auth-token)
      for (const [key, value] of Object.entries(cookies)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          try {
            // The cookie value is a JSON string containing the session
            const sessionData = JSON.parse(value);
            token = sessionData?.access_token || null;
            if (token) break;
          } catch (e) {
            // Cookie exists but not in expected JSON format, skip it
            continue;
          }
        }
      }
    }
  }

  if (!token) {
    return null;
  }
  
  try {
    // Validate token with Supabase
    // Use auth client with anon key for token validation
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    
    if (error || !user) {
      return null;
    }

    return user;
  } catch (error: any) {
    // Handle connection timeouts and network errors gracefully
    if (error?.code === 'UND_ERR_CONNECT_TIMEOUT' || error?.message?.includes('timeout')) {
      console.error("Supabase connection timeout:", error.message);
      return null;
    }
    // Log other errors but don't expose them
    console.error("Error validating user token:", error?.message || error);
    return null;
  }
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
      // If using Supabase Storage, redirect to Supabase Storage URL
      if (USE_SUPABASE_STORAGE || !process.env.PRIVATE_OBJECT_DIR) {
        const objectPath = req.params.objectPath;
        const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "private-objects";
        const supabaseUrl = process.env.SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co';
        
        // Construct Supabase Storage public URL
        const supabaseStorageUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${objectPath}`;
        
        // Redirect to Supabase Storage URL
        return res.redirect(302, supabaseStorageUrl);
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
      
      // If PRIVATE_OBJECT_DIR is not set and we're not using Supabase Storage, try Supabase Storage as fallback
      if (error.message?.includes("PRIVATE_OBJECT_DIR not set")) {
        const objectPath = req.params.objectPath;
        const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "private-objects";
        const supabaseUrl = process.env.SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co';
        const supabaseStorageUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${objectPath}`;
        return res.redirect(302, supabaseStorageUrl);
      }
      
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
      
      // If Supabase Storage is being used, return endpoint info
      if (uploadURL.startsWith("supabase://")) {
        const [, bucketName, ...pathParts] = uploadURL.replace("supabase://", "").split("/");
        const objectPath = pathParts.join("/");
        res.json({ 
          uploadURL: `/api/storage/upload/${bucketName}/${objectPath}`,
          storageType: "supabase",
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

  // Supabase Storage upload endpoint (protected)
  app.put("/api/storage/upload/:bucket/:path(*)", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { bucket, path } = req.params;
    
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

      // Check if bucket exists, create if it doesn't
      let bucketExists = false;
      try {
        const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
        if (listError) {
          console.warn("Could not list buckets:", listError);
        } else {
          bucketExists = buckets?.some((b: any) => b.name === bucket) || false;
        }
      } catch (listErr) {
        console.warn("Error checking buckets:", listErr);
      }
      
      if (!bucketExists) {
        console.log(`Bucket "${bucket}" not found, attempting to create it...`);
        try {
          const { data: newBucket, error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
            public: true, // Make bucket public for profile pictures
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/*'],
          });
          
          if (createError) {
            console.error("Error creating bucket:", createError);
            // Don't fail immediately - try to upload anyway in case bucket was created by another process
            // But provide helpful error message
            if (!createError.message?.includes("already exists")) {
              console.warn(`Bucket creation failed, but continuing with upload attempt. Error: ${createError.message}`);
            }
          } else {
            console.log(`Bucket "${bucket}" created successfully`);
          }
        } catch (createErr: any) {
          console.warn(`Bucket creation attempt failed: ${createErr.message}. Continuing with upload...`);
        }
      }

      // Upload to Supabase Storage
      console.log(`Uploading to Supabase Storage: bucket="${bucket}", path="${path}", size=${fileBuffer.length} bytes`);
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, fileBuffer, {
          contentType: req.headers["content-type"] || "application/octet-stream",
          upsert: false,
        });

      if (error) {
        console.error("Supabase storage upload error:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        
        // If bucket still doesn't exist after creation attempt, provide helpful error
        if (error.message?.includes("Bucket not found") || error.statusCode === '404' || error.status === 404) {
          return res.status(500).json({ 
            error: "Storage bucket not found",
            message: `Bucket "${bucket}" does not exist in Supabase Storage.`,
            hint: `Please create the bucket manually:
1. Go to your Supabase Dashboard (https://supabase.com/dashboard)
2. Select your project
3. Navigate to Storage
4. Click "New bucket"
5. Name it: "${bucket}"
6. Make it PUBLIC (toggle "Public bucket" ON)
7. Click "Create bucket"
Then try uploading again.`,
            bucketName: bucket
          });
        }
        
        return res.status(500).json({ 
          error: "Failed to upload to Supabase Storage",
          message: error.message,
          details: error
        });
      }

      // Return the object path in the format expected by the client
      // Also include uploadURL for Uppy compatibility
      if (!data) {
        console.error("Upload succeeded but no data returned from Supabase");
        return res.status(500).json({ 
          error: "Upload failed",
          message: "No data returned from storage service"
        });
      }

      const objectPath = `${bucket}/${data.path}`;
      const supabaseUrl = process.env.SUPABASE_URL || 'https://piejkqvpkxnrnudztrmt.supabase.co';
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${objectPath}`;
      
      console.log(`Upload successful: objectPath="${objectPath}"`);
      
      // Return 200 OK with JSON response
      res.status(200).json({ 
        objectPath,
        path: data.path,
        fullPath: objectPath,
        uploadURL: objectPath, // For Uppy compatibility
        location: publicUrl, // Public URL for the uploaded file
        url: publicUrl // Alternative field name
      });
    } catch (error: any) {
      console.error("Error in storage upload endpoint:", error);
      res.status(500).json({ 
        error: "Failed to upload file",
        message: error.message || "Unknown error"
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
      // If using Supabase Storage, the path is already in the format bucket/path
      // Just return it as-is (Supabase handles ACL through RLS policies)
      if (profilePictureURL.includes("/") && !profilePictureURL.startsWith("/") && !profilePictureURL.startsWith("http")) {
        // This is likely a Supabase Storage path (bucket/path)
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
      // If ACL setting fails but we have a path, still return it (for Supabase Storage)
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

  // Public route: Get all fuel types (no auth required)
  app.get("/api/fuel-types", async (req, res) => {
    try {
      const { data: fuelTypes, error } = await supabaseAdmin
        .from("fuel_types")
        .select("*")
        .eq("active", true)
        .order("label", { ascending: true });

      if (error) throw error;
      res.json(fuelTypes || []);
    } catch (error: any) {
      console.error("Error fetching fuel types:", error);
      res.status(500).json({ error: error.message });
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
