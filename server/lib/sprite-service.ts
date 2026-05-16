// @ts-nocheck
import { db } from '../db';
import { sprites } from '@db/schema';
import { eq } from 'drizzle-orm';
import type { Sprite } from '@db/schema';

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

export class SpriteService {
  /**
   * Get all sprites for a project
   */
  async getSpritesByProject(projectId: number): Promise<Sprite[]> {
    const results = await db
      .select()
      .from(sprites)
      .where(eq(sprites.projectId, projectId)) as Sprite[];
    
    return results;
  }

  /**
   * Get a specific sprite by ID
   */
  async getSpriteById(id: number): Promise<Sprite | null> {
    const results = await db
      .select()
      .from(sprites)
      .where(eq(sprites.id, id)) as Sprite[];
    
    return results[0] || null;
  }

  /**
   * Create a new sprite
   */
  async createSprite(spriteData: { name: string; projectId: number; frameData?: any }): Promise<Sprite> {
    if (!isValidSpriteData(spriteData)) {
      throw new Error('Invalid sprite data. Required: name (non-empty string), projectId (positive number)');
    }

    if (spriteData.frameData !== undefined && !isValidFrameData(spriteData.frameData)) {
      throw new Error('Invalid frameData format');
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
      throw new Error('Failed to create sprite');
    }

    return newSprite;
  }

  /**
   * Update an existing sprite
   */
  async updateSprite(id: number, updateData: { name?: string; projectId?: number; frameData?: any }): Promise<Sprite> {
    // Check if sprite exists
    const existingSprite = await this.getSpriteById(id);
    
    if (!existingSprite) {
      throw new Error('Sprite not found');
    }

    // Validate update data
    if (updateData.name !== undefined && (typeof updateData.name !== 'string' || updateData.name.trim().length === 0)) {
      throw new Error('Invalid name: must be a non-empty string');
    }

    if (updateData.projectId !== undefined && (typeof updateData.projectId !== 'number' || updateData.projectId <= 0)) {
      throw new Error('Invalid projectId: must be a positive number');
    }

    if (updateData.frameData !== undefined && !isValidFrameData(updateData.frameData)) {
      throw new Error('Invalid frameData format');
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
      throw new Error('Failed to update sprite');
    }

    return updatedSprite;
  }

  /**
   * Delete a sprite
   */
  async deleteSprite(id: number): Promise<void> {
    // Check if sprite exists
    const existingSprite = await this.getSpriteById(id);
    
    if (!existingSprite) {
      throw new Error('Sprite not found');
    }

    await db.delete(sprites).where(eq(sprites.id, id));
  }
}

export const spriteService = new SpriteService();
