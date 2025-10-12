import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import adminRoutes from "./admin-routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Register admin routes
  app.use(adminRoutes);

  const httpServer = createServer(app);

  return httpServer;
}
