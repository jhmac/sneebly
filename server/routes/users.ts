// @ts-nocheck
import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { z } from "zod";
import { db } from "./db";
import { users } from "@shared/schema-users";
import { eq } from "drizzle-orm";

const router = Router();

// Zod schema for user update
const updateUserSchema = z.object({
  name: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

// Zod schema for Clerk webhook user data
const clerkWebhookUserSchema = z.object({
  clerk_id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

// POST /api/users - Clerk webhook handler (upsert user)
router.post("/api/users", async (req, res, next) => {
  try {
    // TODO: Add Clerk webhook verification here
    // For now, accepting the request as-is
    const validatedData = clerkWebhookUserSchema.parse(req.body);
    
    // Upsert user (insert or update if clerk_id exists)
    const [user] = await db
      .insert(users)
      .values({
        clerk_id: validatedData.clerk_id,
        email: validatedData.email,
        name: validatedData.name || null,
        avatar_url: validatedData.avatar_url || null,
      })
      .onConflictDoUpdate({
        target: users.clerk_id,
        set: {
          email: validatedData.email,
          name: validatedData.name || null,
          avatar_url: validatedData.avatar_url || null,
          updated_at: new Date(),
        },
      })
      .returning();

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/me - Get current authenticated user
router.get("/api/users/me", requireAuth(), async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerk_id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/me - Update current user
router.put("/api/users/me", requireAuth(), async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const validatedData = updateUserSchema.parse(req.body);

    const [updatedUser] = await db
      .update(users)
      .set({
        ...validatedData,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId))
      .returning();

    if (!updatedUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

export default router;