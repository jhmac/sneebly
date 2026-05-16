// @ts-nocheck
import { Router } from 'express';
import { db } from '../db';
import { frames, layers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { Frame, Layer, NewFrame, NewLayer } from '../db/schema';

const router = Router();

// Type guard for frame data validation
function isValidFrameData(data: any): data is { name?: string; duration?: number; layers?: any[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data.name === undefined || typeof data.name === 'string') &&
    (data.duration === undefined || typeof data.duration === 'number') &&
    (data.layers === undefined || Array.isArray(data.layers))
  );
}

// Type guard for layer data validation
function isValidLayerData(data: any): data is { type?: string; content?: any; position?: any } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data.type === undefined || typeof data.type === 'string')
  );
}

// GET /api/frames - Get all frames for a project
router.get('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const result: Frame[] = await db
      .select()
      .from(frames)
      .where(eq(frames.projectId, projectId));

    res.json(result);
  } catch (error) {
    console.error('Error fetching frames:', error);
    res.status(500).json({ error: 'Failed to fetch frames' });
  }
});

// POST /api/frames - Create a new frame
router.post('/', async (req, res) => {
  try {
    const frameData = req.body;

    if (!isValidFrameData(frameData)) {
      return res.status(400).json({ error: 'Invalid frame data' });
    }

    if (!frameData.name || typeof frameData.name !== 'string') {
      return res.status(400).json({ error: 'Frame name is required' });
    }

    const newFrame: NewFrame = {
      projectId: frameData.projectId,
      name: frameData.name,
      duration: frameData.duration || 1000,
      order: frameData.order || 0
    };

    const result: Frame[] = await db
      .insert(frames)
      .values(newFrame)
      .returning();

    const createdFrame = result[0];
    if (!createdFrame) {
      return res.status(500).json({ error: 'Failed to create frame' });
    }

    // Create layers if provided
    if (frameData.layers && Array.isArray(frameData.layers) && frameData.layers.length > 0) {
      const layersToCreate: NewLayer[] = frameData.layers.map((layer: any, index: number) => ({
        frameId: createdFrame.id,
        type: layer.type || 'text',
        content: layer.content || {},
        position: layer.position || { x: 0, y: 0 },
        order: layer.order !== undefined ? layer.order : index
      }));

      await db.insert(layers).values(layersToCreate);
    }

    res.status(201).json(createdFrame);
  } catch (error) {
    console.error('Error creating frame:', error);
    res.status(500).json({ error: 'Failed to create frame' });
  }
});

// PUT /api/frames/:id - Update a frame
router.put('/:id', async (req, res) => {
  try {
    const frameId = parseInt(req.params.id);
    const frameData = req.body;

    if (isNaN(frameId)) {
      return res.status(400).json({ error: 'Invalid frame ID' });
    }

    if (!isValidFrameData(frameData)) {
      return res.status(400).json({ error: 'Invalid frame data' });
    }

    const updateData: Partial<NewFrame> = {};
    if (frameData.name !== undefined) updateData.name = frameData.name;
    if (frameData.duration !== undefined) updateData.duration = frameData.duration;
    if (frameData.order !== undefined) updateData.order = frameData.order;

    const result: Frame[] = await db
      .update(frames)
      .set(updateData)
      .where(eq(frames.id, frameId))
      .returning();

    const updatedFrame = result[0];
    if (!updatedFrame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    res.json(updatedFrame);
  } catch (error) {
    console.error('Error updating frame:', error);
    res.status(500).json({ error: 'Failed to update frame' });
  }
});

// DELETE /api/frames/:id - Delete a frame
router.delete('/:id', async (req, res) => {
  try {
    const frameId = parseInt(req.params.id);

    if (isNaN(frameId)) {
      return res.status(400).json({ error: 'Invalid frame ID' });
    }

    // Delete associated layers first
    await db.delete(layers).where(eq(layers.frameId, frameId));

    const result: Frame[] = await db
      .delete(frames)
      .where(eq(frames.id, frameId))
      .returning();

    const deletedFrame = result[0];
    if (!deletedFrame) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting frame:', error);
    res.status(500).json({ error: 'Failed to delete frame' });
  }
});

export default router;
