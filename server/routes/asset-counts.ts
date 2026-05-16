// @ts-nocheck
import type { Express } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { storage } from "../storage.js";

export function registerAssetCountsRoute(app: Express): void {
  app.get("/api/projects/:projectId/asset-counts", requireAuth(), async (req, res) => {
    try {
      const projectId = Array.isArray(req.params.projectId)
        ? req.params.projectId[0]
        : req.params.projectId;

      const { userId } = getAuth(req);

      // Verify project exists and belongs to user
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const counts = await storage.getAssetCounts(projectId);
      res.json(counts);
    } catch (error) {
      console.error("Error fetching asset counts:", error);
      res.status(500).json({ message: "Failed to fetch asset counts" });
    }
  });
}
