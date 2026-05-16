// @ts-nocheck
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { animations, sprites } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// Type guard for animation creation data
function isValidAnimationData(data: any): data is { name: string; projectId: number; spriteId: number } {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.name === 'string' &&
    data.name.trim().length > 0 &&
    typeof data.projectId === 'number' &&
    typeof data.spriteId === 'number'
  );
}

// Type guard for animation update data
function isValidAnimationUpdateData(data: any): data is Partial<{ name: string; frameRate: number; isLooping: boolean }> {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim().length === 0)) {
    return false;
  }
  
  if (data.frameRate !== undefined && typeof data.frameRate !== 'number') {
    return false;
  }
  
  if (data.isLooping !== undefined && typeof data.isLooping !== 'boolean') {
    return false;
  }
  
  return true;
}

// GET /api/animations/:projectId - Get all animations for a project
router.get('/:projectId', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      res.status(400).json({ error: 'Invalid project ID' });
      return;
    }
    
    const projectAnimations = await db
      .select()
      .from(animations)
      .where(eq(animations.projectId, projectId));
    
    res.json(projectAnimations);
  } catch (error) {
    console.error('Error fetching animations:', error);
    res.status(500).json({ error: 'Failed to fetch animations' });
  }
});

// POST /api/animations - Create a new animation
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;
    
    if (!isValidAnimationData(data)) {
      res.status(400).json({ 
        error: 'Invalid animation data. Required fields: name (non-empty string), projectId (number), spriteId (number)' 
      });
      return;
    }
    
    // Verify sprite exists and belongs to the project
    const sprite = await db
      .select()
      .from(sprites)
      .where(and(
        eq(sprites.id, data.spriteId),
        eq(sprites.projectId, data.projectId)
      ))
      .limit(1);
    
    if (!sprite || sprite.length === 0) {
      res.status(404).json({ error: 'Sprite not found or does not belong to this project' });
      return;
    }
    
    const [newAnimation] = await db
      .insert(animations)
      .values({
        name: data.name,
        projectId: data.projectId,
        spriteId: data.spriteId,
        frameRate: data.frameRate || 12,
        isLooping: data.isLooping ?? true
      })
      .returning();
    
    if (!newAnimation) {
      res.status(500).json({ error: 'Failed to create animation' });
      return;
    }
    
    res.status(201).json(newAnimation);
  } catch (error) {
    console.error('Error creating animation:', error);
    res.status(500).json({ error: 'Failed to create animation' });
  }
});

// GET /api/animations/single/:id - Get a specific animation
router.get('/single/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid animation ID' });
      return;
    }
    
    const [animation] = await db
      .select()
      .from(animations)
      .where(eq(animations.id, id))
      .limit(1);
    
    if (!animation) {
      res.status(404).json({ error: 'Animation not found' });
      return;
    }
    
    res.json(animation);
  } catch (error) {
    console.error('Error fetching animation:', error);
    res.status(500).json({ error: 'Failed to fetch animation' });
  }
});

// PATCH /api/animations/:id - Update an animation
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid animation ID' });
      return;
    }
    
    const data = req.body;
    
    if (!isValidAnimationUpdateData(data)) {
      res.status(400).json({ error: 'Invalid update data' });
      return;
    }
    
    // Check if animation exists
    const [existing] = await db
      .select()
      .from(animations)
      .where(eq(animations.id, id))
      .limit(1);
    
    if (!existing) {
      res.status(404).json({ error: 'Animation not found' });
      return;
    }
    
    const [updated] = await db
      .update(animations)
      .set(data)
      .where(eq(animations.id, id))
      .returning();
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to update animation' });
      return;
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating animation:', error);
    res.status(500).json({ error: 'Failed to update animation' });
  }
});

// DELETE /api/animations/:id - Delete an animation
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid animation ID' });
      return;
    }
    
    // Check if animation exists
    const [existing] = await db
      .select()
      .from(animations)
      .where(eq(animations.id, id))
      .limit(1);
    
    if (!existing) {
      res.status(404).json({ error: 'Animation not found' });
      return;
    }
    
    await db
      .delete(animations)
      .where(eq(animations.id, id));
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting animation:', error);
    res.status(500).json({ error: 'Failed to delete animation' });
  }
});

export default router;
