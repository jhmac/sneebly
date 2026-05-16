// @ts-nocheck
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { exports as exportsTable } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { exportBundler } from '../services/exportBundler';
import { gddGenerator } from '../services/gddGenerator';

const router = Router();

// POST /api/projects/:projectId/export — kick off an export
router.post('/api/projects/:projectId/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { exportType, includesGdd } = req.body;
    const userId = req.user!.id;

    // Validate export type
    if (exportType !== 'phaser3-zip') {
      return res.status(400).json({ error: 'Unsupported export type. Supported: phaser3-zip' });
    }

    // Validate user owns the project
    const [project] = await db
      .select()
      .from(require('../../shared/schema').projects)
      .where(
        and(
          eq(require('../../shared/schema').projects.id, projectId),
          eq(require('../../shared/schema').projects.userId, userId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Create export record with status 'processing'
    const [exportRecord] = await db
      .insert(exportsTable)
      .values({
        projectId,
        userId,
        exportType,
        includesGdd: includesGdd ?? false,
        status: 'processing',
      })
      .returning();

    // Process export async — don't block the response
    processExport(exportRecord.id, projectId, userId, includesGdd ?? false).catch((err) => {
      console.error(`Export ${exportRecord.id} failed:`, err);
    });

    return res.status(201).json({
      id: exportRecord.id,
      status: 'processing',
      message: 'Export started. Poll GET /api/exports/:exportId for status.',
    });
  } catch (err) {
    console.error('Failed to create export:', err);
    return res.status(500).json({ error: 'Failed to start export' });
  }
});

// GET /api/projects/:projectId/exports — list past exports for a project
router.get('/api/projects/:projectId/exports', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;

    // Validate user owns the project
    const [project] = await db
      .select()
      .from(require('../../shared/schema').projects)
      .where(
        and(
          eq(require('../../shared/schema').projects.id, projectId),
          eq(require('../../shared/schema').projects.userId, userId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    const exportsList = await db
      .select({
        id: exportsTable.id,
        exportType: exportsTable.exportType,
        includesGdd: exportsTable.includesGdd,
        status: exportsTable.status,
        createdAt: exportsTable.createdAt,
      })
      .from(exportsTable)
      .where(
        and(
          eq(exportsTable.projectId, projectId),
          eq(exportsTable.userId, userId)
        )
      )
      .orderBy(desc(exportsTable.createdAt));

    return res.json({ exports: exportsList });
  } catch (err) {
    console.error('Failed to list exports:', err);
    return res.status(500).json({ error: 'Failed to list exports' });
  }
});

// GET /api/exports/:exportId — get export status
router.get('/api/exports/:exportId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;
    const userId = req.user!.id;

    const [exportRecord] = await db
      .select()
      .from(exportsTable)
      .where(
        and(
          eq(exportsTable.id, exportId),
          eq(exportsTable.userId, userId)
        )
      )
      .limit(1);

    if (!exportRecord) {
      return res.status(404).json({ error: 'Export not found' });
    }

    return res.json({
      id: exportRecord.id,
      exportType: exportRecord.exportType,
      includesGdd: exportRecord.includesGdd,
      status: exportRecord.status,
      createdAt: exportRecord.createdAt,
    });
  } catch (err) {
    console.error('Failed to get export:', err);
    return res.status(500).json({ error: 'Failed to get export status' });
  }
});

// GET /api/exports/:exportId/download — stream the ZIP file
router.get('/api/exports/:exportId/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;
    const userId = req.user!.id;

    const [exportRecord] = await db
      .select()
      .from(exportsTable)
      .where(
        and(
          eq(exportsTable.id, exportId),
          eq(exportsTable.userId, userId)
        )
      )
      .limit(1);

    if (!exportRecord) {
      return res.status(404).json({ error: 'Export not found' });
    }

    if (exportRecord.status !== 'complete') {
      return res.status(400).json({
        error: `Export is not ready. Current status: ${exportRecord.status}`,
      });
    }

    if (!exportRecord.fileUrl) {
      return res.status(500).json({ error: 'Export file missing' });
    }

    // Handle base64 data URL format: data:application/zip;base64,<data>
    if (exportRecord.fileUrl.startsWith('data:')) {
      const matches = exportRecord.fileUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return res.status(500).json({ error: 'Invalid export file format' });
      }

      const contentType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      const filename = `export-${exportRecord.projectId}-${exportRecord.id}.zip`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }

    // If fileUrl is a regular URL, redirect to it
    return res.redirect(exportRecord.fileUrl);
  } catch (err) {
    console.error('Failed to download export:', err);
    return res.status(500).json({ error: 'Failed to download export' });
  }
});

/**
 * Process an export in the background.
 * Generates the ZIP bundle, optionally includes GDD, updates the export record.
 */
async function processExport(
  exportId: string,
  projectId: string,
  userId: string,
  includesGdd: boolean
): Promise<void> {
  try {
    let gddContent: string | undefined;

    if (includesGdd) {
      gddContent = await gddGenerator.generate(projectId);
    }

    const zipBuffer = await exportBundler.bundle(projectId, {
      includeGdd: includesGdd,
      gddContent,
    });

    // Store as base64 data URL
    const base64 = zipBuffer.toString('base64');
    const fileUrl = `data:application/zip;base64,${base64}`;

    await db
      .update(exportsTable)
      .set({
        status: 'complete',
        fileUrl,
        updatedAt: new Date(),
      })
      .where(eq(exportsTable.id, exportId));

    console.log(`Export ${exportId} complete for project ${projectId}`);
  } catch (err) {
    console.error(`Export ${exportId} failed:`, err);

    await db
      .update(exportsTable)
      .set({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(exportsTable.id, exportId));
  }
}

export default router;
