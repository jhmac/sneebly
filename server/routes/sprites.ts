// @ts-nocheck
import { Router } from 'express';
import { db } from '../db';
import { sprites } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import type { Sprite } from '@db/schema';

const router = Router();

// Type guard for sprite data validation
function isValidSpriteData(data: any): data is { name: string; projectId: number; frameData?: any } {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.name === 'string' &&
    data.name.trim().length > 0 &&
    typeof data.projectId === 'number' &&
    data.projectId > 0
  );
}

// Type guard for frame data validation
function isValidFrameData(data: any): boolean {
  if (data === null || data === undefined) return true;
  if (typeof data !== 'object') return false;
  return true;
}

// GET /api/sprites?projectId=:id - Get all sprites for a project
router.get('/', async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId as string);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    const results = await db
      .select()
      .from(sprites)
      .where(eq(sprites.projectId, projectId)) as Sprite[];

    res.json(results);
  } catch (error) {
    console.error('Error fetching sprites:', error);
    res.status(500).json({ error: 'Failed to fetch sprites' });
  }
});

// GET /api/sprites/:id - Get a specific sprite
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid sprite ID' });
    }

    const results = await db
      .select()
      .from(sprites)
      .where(eq(sprites.id, id)) as Sprite[];

    const sprite = results[0];

    if (!sprite) {
      return res.status(404).json({ error: 'Sprite not found' });
    }

    res.json(sprite);
  } catch (error) {
    console.error('Error fetching sprite:', error);
    res.status(500).json({ error: 'Failed to fetch sprite' });
  }
});

// POST /api/sprites - Create a new sprite
router.post('/', async (req, res) => {
  try {
    const spriteData = req.body;

    if (!isValidSpriteData(spriteData)) {
      return res.status(400).json({ 
        error: 'Invalid sprite data. Required: name (non-empty string), projectId (positive number)' 
      });
    }

    // Validate frameData if provided
    if (spriteData.frameData !== undefined && !isValidFrameData(spriteData.frameData)) {
      return res.status(400).json({ error: 'Invalid frameData format' });
    }

    const results = await db
      .insert(sprites)
      .values({
        name: spriteData.name,
        projectId: spriteData.projectId,
        frameData: spriteData.frameData || null,
      })
      .returning() as Sprite[];

    const newSprite = results[0];

    if (!newSprite) {
      return res.status(500).json({ error: 'Failed to create sprite' });
    }

    res.status(201).json(newSprite);
  } catch (error) {
    console.error('Error creating sprite:', error);
    res.status(500).json({ error: 'Failed to create sprite' });
  }
});

// PUT /api/sprites/:id - Update a sprite
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updateData = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid sprite ID' });
    }

    // Check if sprite exists
    const existingResults = await db
      .select()
      .from(sprites)
      .where(eq(sprites.id, id)) as Sprite[];

    const existingSprite = existingResults[0];

    if (!existingSprite) {
      return res.status(404).json({ error: 'Sprite not found' });
    }

    // Validate update data
    if (updateData.name !== undefined && (typeof updateData.name !== 'string' || updateData.name.trim().length === 0)) {
      return res.status(400).json({ error: 'Invalid name: must be a non-empty string' });
    }

    if (updateData.projectId !== undefined && (typeof updateData.projectId !== 'number' || updateData.projectId <= 0)) {
      return res.status(400).json({ error: 'Invalid projectId: must be a positive number' });
    }

    if (updateData.frameData !== undefined && !isValidFrameData(updateData.frameData)) {
      return res.status(400).json({ error: 'Invalid frameData format' });
    }

    const results = await db
      .update(sprites)
      .set({
        ...(updateData.name !== undefined && { name: updateData.name }),
        ...(updateData.projectId !== undefined && { projectId: updateData.projectId }),
        ...(updateData.frameData !== undefined && { frameData: updateData.frameData }),
      })
      .where(eq(sprites.id, id))
      .returning() as Sprite[];

    const updatedSprite = results[0];

    if (!updatedSprite) {
      return res.status(500).json({ error: 'Failed to update sprite' });
    }

    res.json(updatedSprite);
  } catch (error) {
    console.error('Error updating sprite:', error);
    res.status(500).json({ error: 'Failed to update sprite' });
  }
});

// DELETE /api/sprites/:id - Delete a sprite
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid sprite ID' });
    }

    // Check if sprite exists
    const existingResults = await db
      .select()
      .from(sprites)
      .where(eq(sprites.id, id)) as Sprite[];

    const existingSprite = existingResults[0];

    if (!existingSprite) {
      return res.status(404).json({ error: 'Sprite not found' });
    }

    await db.delete(sprites).where(eq(sprites.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting sprite:', error);
    res.status(500).json({ error: 'Failed to delete sprite' });
  }
});

export default router;
