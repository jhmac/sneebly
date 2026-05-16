import type { Express } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { storage } from "./storage.js";
import { buildExportBundle } from "./export-bundle.js";

/**
 * Register the export route. Call this from registerRoutes().
 */
export function registerExportRoutes(app: Express): void {
  app.post("/api/projects/:id/export", requireAuth(), async (req, res) => {
    let exportId: string | undefined;
    try {
      const projectId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { userId } = getAuth(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify ownership
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const includeGdd = req.body?.includeGdd === true;

      // Record the export in the database
      const exportRecord = await storage.createExport({
        projectId,
        userId,
        exportType: "phaser3_bundle",
        includesGdd: includeGdd,
        includesPhaserBoilerplate: true,
        status: "processing",
      });

      exportId = exportRecord.id;

      // Build the export bundle
      const bundle = await buildExportBundle({ projectId, includeGdd });

      // Mark export as completed
      await storage.updateExport(exportId, { status: "completed" });

      // Return as JSON — the client handles downloading it
      res.json(bundle);
    } catch (error) {
      console.error("Export failed:", error);

      // Mark export as failed if we have a record
      if (exportId) {
        try {
          await storage.updateExport(exportId, { status: "failed" });
        } catch (updateError) {
          console.error("Failed to update export status to failed:", updateError);
        }
      }

      const message = error instanceof Error ? error.message : "Export failed";
      res.status(500).json({ message });
    }
  });
}
