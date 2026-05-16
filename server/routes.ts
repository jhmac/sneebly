import type { Express } from "express";
import { type Server } from "http";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { storage } from "./storage";
import anthropicClient from "./anthropic-client";
import { db } from "./db";
import {
  insertProjectSchema, insertAnimationSchema,
  insertStorySchema, insertCharacterSchema,
  insertSpriteSheetSchema, insertEnvironmentSchema,
  insertTilesetSchema, insertEnvironmentPropSchema,
  insertQuestSchema, insertUploadSchema,
  insertExportSchema, insertAgentRunSchema,
  agentRuns,
} from "@shared/schema";
import { z, ZodError } from "zod";
import { clerkMiddleware, getAuth, requireAuth } from "@clerk/express";
import { log } from "./index";
import { setupSpecWatcher } from "./spec-validator";
import { setupAutoDbPush } from "./auto-db-push";
import { getChatHtml } from "./chat-ui";
import { getCommandCenterHtml } from "./command-center";
import { getBudgetHtml } from "./budget-ui";
import { getAgentTeamsHtml } from "./agent-teams-ui";
import { sendMessage, getMessages, clearMessages, sendMessageStream } from "./chat-handler";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 4 }, // 10 MB per image, max 4
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});
import {
  startAutonomyLoop,
  stopAutonomyLoop,
  triggerSingleCycle,
  getAutonomyState,
  getActivityLog,
  getRecentJournalEntries,
  getUserActions,
  dismissUserAction,
  fixTscErrors,
  writeUserActionNeeded,
} from "./autonomy-loop";
import { loadCurrentPlan } from "./planner-agent";
import { runStoryArchitect } from "./agents/story-architect";
import { loadRoadmap, generateRoadmap, resetFeatureStatus, getNextFeatures } from "./roadmap-orchestrator";
import { getCostSummary, getRecentCosts, syncFromSneeblyLogs } from "./cost-tracker";
import { generateExpenseReport, getBudgetConfig, setBudget } from "./expense-tracker";
import { getLiveOutput } from "./live-output";
import { eq, desc, sql } from "drizzle-orm";

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

// Placeholder — replace with actual analyzeUpload import when the module exists
async function analyzeUpload(id: string): Promise<void> {
  // TODO: wire up to the real vision analysis pipeline
  log(`analyzeUpload called for upload ${id}`, "vision");
}

/**
 * DB health check — runs a simple SELECT 1 to verify the database connection is alive.
 * Returns { status: "healthy", timestamp } on success, throws on failure.
 */
async function checkDbHealth(): Promise<{ status: string; timestamp: string }> {
  await db.execute(sql`SELECT 1`);
  return { status: "healthy", timestamp: new Date().toISOString() };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  log("Initializing Clerk middleware...");
  const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!publishableKey || !secretKey) {
    log("CRITICAL: Clerk API keys are missing!", "clerk");
  }

  app.use((req, res, next) => {
    if (req.path.startsWith("/sneebly") || req.path.startsWith("/api/sneebly-cc") || req.path === "/health" || req.path === "/api/health") {
      return next();
    }
    return clerkMiddleware({
      publishableKey,
      secretKey,
    })(req, res, next);
  });

  // ─── Health Check ───────────────────────────────────────

  app.get("/api/health", async (_req, res) => {
    try {
      const result = await checkDbHealth();
      res.json(result);
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({ status: "unhealthy", error: "Database connection failed", timestamp: new Date().toISOString() });
    }
  });

  // Alias: /health → /api/health (for internal monitors and verify-agent compatibility)
  app.get("/health", async (_req, res) => {
    try {
      const result = await checkDbHealth();
      res.json(result);
    } catch {
      res.status(503).json({ status: "unhealthy", timestamp: new Date().toISOString() });
    }
  });

  // ─── Pipeline Status ────────────────────────────────────

  app.get("/api/projects/:id/pipeline-status", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.id);
      const { userId } = getAuth(req);

      // Verify project exists and belongs to the user
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      // Query agent_runs for this project, sorted by creation time ascending
      const runs = await storage.getAgentRuns(projectId);

      // Sort by createdAt ascending (oldest first) for pipeline ordering
      const sorted = runs.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });

      const pipelineStatus = sorted.map((run) => ({
        agentType: run.agentType,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        error: run.errorMessage || null,
      }));

      res.json(pipelineStatus);
    } catch (error) {
      console.error("Error fetching pipeline status:", error);
      res.status(500).json({ message: "Failed to fetch pipeline status" });
    }
  });

  // ─── Projects ───────────────────────────────────────────

  app.get("/api/projects", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      const projects = await storage.getProjects(userId!);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const project = await storage.getProject(id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const { userId } = getAuth(req);
      if (project.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      const data = insertProjectSchema.parse({ ...req.body, userId });
      const project = await storage.createProject(data);

      const gameType = (data.gameType || "platformer").toLowerCase();
      const defaultAnims = getDefaultAnimations(gameType);

      for (let i = 0; i < defaultAnims.length; i++) {
        await storage.createAnimation({
          projectId: project.id,
          characterName: defaultAnims[i].character,
          name: defaultAnims[i].name,
          animationKey: `${defaultAnims[i].character}_${defaultAnims[i].key}`,
          prefix: `${defaultAnims[i].character}_${defaultAnims[i].key}_`,
          fps: defaultAnims[i].fps,
          frameCount: defaultAnims[i].frames,
          loop: defaultAnims[i].loop,
          priority: defaultAnims[i].priority,
          atlasKey: defaultAnims[i].character,
          sortOrder: i,
        });
      }

      res.status(201).json(project);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      console.error("Error creating project:", e);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const { userId } = getAuth(req);
      const existing = await storage.getProject(id);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const data = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(id, data);
      res.json(project);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      throw e;
    }
  });

  app.delete("/api/projects/:id", requireAuth(), async (req, res) => {
    const id = paramStr(req.params.id);
    const { userId } = getAuth(req);
    const existing = await storage.getProject(id);
    if (!existing) return res.status(404).json({ message: "Project not found" });
    if (existing.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    await storage.deleteProject(id);
    res.status(204).send();
  });

  app.post("/api/projects/:id/duplicate", requireAuth(), async (req, res) => {
    const id = paramStr(req.params.id);
    const { userId } = getAuth(req);
    const original = await storage.getProject(id);
    if (!original) return res.status(404).json({ message: "Project not found" });
    if (original.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const copy = await storage.createProject({
      name: `${original.name} (Copy)`,
      userId,
      description: original.description,
      gameType: original.gameType,
      gameContext: original.gameContext,
      pov: original.pov,
      movementStyle: original.movementStyle,
      characterImage: original.characterImage,
    });

    const anims = await storage.getAnimations(original.id);
    for (const anim of anims) {
      await storage.createAnimation({
        projectId: copy.id,
        characterName: anim.characterName,
        name: anim.name,
        animationKey: anim.animationKey,
        prefix: anim.prefix,
        fps: anim.fps,
        frameCount: anim.frameCount,
        loop: anim.loop,
        priority: anim.priority,
        atlasKey: anim.atlasKey,
        sortOrder: anim.sortOrder,
      });
    }

    res.status(201).json(copy);
  });

  app.get("/api/projects/:projectId/animations", requireAuth(), async (req, res) => {
    const projectId = paramStr(req.params.projectId);
    const { userId } = getAuth(req);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    const anims = await storage.getAnimations(projectId);
    res.json(anims);
  });

  app.post("/api/projects/:projectId/animations", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const data = insertAnimationSchema.parse({
        ...req.body,
        projectId,
      });
      const anim = await storage.createAnimation(data);
      res.status(201).json(anim);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      throw e;
    }
  });

  app.patch("/api/animations/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const { userId } = getAuth(req);
      const existing = await storage.getAnimation(id);
      if (!existing) return res.status(404).json({ message: "Animation not found" });
      const project = await storage.getProject(existing.projectId);
      if (!project || project.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const { projectId: _discard, ...safeBody } = req.body;
      const data = insertAnimationSchema.partial().parse(safeBody);
      const anim = await storage.updateAnimation(id, data);
      res.json(anim);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      throw e;
    }
  });

  app.delete("/api/animations/:id", requireAuth(), async (req, res) => {
    const id = paramStr(req.params.id);
    const { userId } = getAuth(req);
    const existing = await storage.getAnimation(id);
    if (!existing) return res.status(404).json({ message: "Animation not found" });
    const project = await storage.getProject(existing.projectId);
    if (!project || project.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    await storage.deleteAnimation(id);
    res.status(204).send();
  });

  app.get("/api/users/me", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      const user = await storage.getUser(userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) { res.status(500).json({ message: "Failed to fetch user" }); }
  });

  app.post("/api/users", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      const existing = await storage.getUser(userId!);
      if (existing) return res.json(existing);
      const data = { ...req.body, clerkId: userId! };
      res.status(201).json(await storage.createUser(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/me", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      const user = await storage.updateUser(userId!, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  async function verifyProjectOwnership(projectId: string, userId: string, res: any): Promise<boolean> {
    const project = await storage.getProject(projectId);
    if (!project) { res.status(404).json({ message: "Project not found" }); return false; }
    if (project.userId !== userId) { res.status(403).json({ message: "Forbidden" }); return false; }
    return true;
  }

  app.get("/api/projects/:projectId/stories", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getStories(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch stories" }); }
  });

  app.post("/api/projects/:projectId/stories", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertStorySchema.parse({ ...req.body, projectId });
      res.status(201).json(await storage.createStory(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create story" });
    }
  });

  app.get("/api/stories/:id", requireAuth(), async (req, res) => {
    try {
      const story = await storage.getStory(paramStr(req.params.id));
      if (!story) return res.status(404).json({ message: "Story not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(story.projectId, userId!, res))) return;
      res.json(story);
    } catch (error) { res.status(500).json({ message: "Failed to fetch story" }); }
  });

  app.patch("/api/stories/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getStory(id);
      if (!existing) return res.status(404).json({ message: "Story not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertStorySchema.partial().parse(req.body);
      res.json(await storage.updateStory(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update story" });
    }
  });

  app.delete("/api/stories/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getStory(id);
      if (!existing) return res.status(404).json({ message: "Story not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteStory(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete story" }); }
  });

  // ─── Story Architect Agent ───────────────────────────────
  app.post("/api/projects/:projectId/storyArchitect", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const result = await runStoryArchitect(projectId);
      res.json(result);
    } catch (error: any) {
      const msg = error?.message || "Failed to run Story Architect";
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId/characters", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getCharacters(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch characters" }); }
  });

  app.post("/api/projects/:projectId/characters", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertCharacterSchema.parse({ ...req.body, projectId });
      res.status(201).json(await storage.createCharacter(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create character" });
    }
  });

  app.get("/api/characters/:id", requireAuth(), async (req, res) => {
    try {
      const character = await storage.getCharacter(paramStr(req.params.id));
      if (!character) return res.status(404).json({ message: "Character not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(character.projectId, userId!, res))) return;
      res.json(character);
    } catch (error) { res.status(500).json({ message: "Failed to fetch character" }); }
  });

  app.patch("/api/characters/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getCharacter(id);
      if (!existing) return res.status(404).json({ message: "Character not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertCharacterSchema.partial().parse(req.body);
      res.json(await storage.updateCharacter(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update character" });
    }
  });

  app.delete("/api/characters/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getCharacter(id);
      if (!existing) return res.status(404).json({ message: "Character not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteCharacter(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete character" }); }
  });

  app.get("/api/projects/:projectId/sprite-sheets", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getSpriteSheets(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch sprite sheets" }); }
  });

  app.post("/api/projects/:projectId/sprite-sheets", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertSpriteSheetSchema.parse({ ...req.body, projectId });
      res.status(201).json(await storage.createSpriteSheet(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create sprite sheet" });
    }
  });

  app.get("/api/sprite-sheets/:id", requireAuth(), async (req, res) => {
    try {
      const sheet = await storage.getSpriteSheet(paramStr(req.params.id));
      if (!sheet) return res.status(404).json({ message: "Sprite sheet not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(sheet.projectId, userId!, res))) return;
      res.json(sheet);
    } catch (error) { res.status(500).json({ message: "Failed to fetch sprite sheet" }); }
  });

  app.patch("/api/sprite-sheets/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getSpriteSheet(id);
      if (!existing) return res.status(404).json({ message: "Sprite sheet not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertSpriteSheetSchema.partial().parse(req.body);
      res.json(await storage.updateSpriteSheet(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update sprite sheet" });
    }
  });

  app.delete("/api/sprite-sheets/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getSpriteSheet(id);
      if (!existing) return res.status(404).json({ message: "Sprite sheet not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteSpriteSheet(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete sprite sheet" }); }
  });

  app.get("/api/projects/:projectId/environments", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getEnvironments(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch environments" }); }
  });

  app.post("/api/projects/:projectId/environments", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertEnvironmentSchema.parse({ ...req.body, projectId });
      res.status(201).json(await storage.createEnvironment(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create environment" });
    }
  });

  app.get("/api/environments/:id", requireAuth(), async (req, res) => {
    try {
      const environment = await storage.getEnvironment(paramStr(req.params.id));
      if (!environment) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(environment.projectId, userId!, res))) return;
      res.json(environment);
    } catch (error) { res.status(500).json({ message: "Failed to fetch environment" }); }
  });

  app.patch("/api/environments/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getEnvironment(id);
      if (!existing) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertEnvironmentSchema.partial().parse(req.body);
      res.json(await storage.updateEnvironment(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update environment" });
    }
  });

  app.delete("/api/environments/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getEnvironment(id);
      if (!existing) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteEnvironment(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete environment" }); }
  });

  app.get("/api/environments/:environmentId/tilesets", requireAuth(), async (req, res) => {
    try {
      const environmentId = paramStr(req.params.environmentId);
      const environment = await storage.getEnvironment(environmentId);
      if (!environment) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(environment.projectId, userId!, res))) return;
      res.json(await storage.getTilesets(environmentId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch tilesets" }); }
  });

  app.post("/api/environments/:environmentId/tilesets", requireAuth(), async (req, res) => {
    try {
      const environmentId = paramStr(req.params.environmentId);
      const environment = await storage.getEnvironment(environmentId);
      if (!environment) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(environment.projectId, userId!, res))) return;
      const data = insertTilesetSchema.parse({ ...req.body, environmentId, projectId: environment.projectId });
      res.status(201).json(await storage.createTileset(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create tileset" });
    }
  });

  app.patch("/api/tilesets/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getTileset(id);
      if (!existing) return res.status(404).json({ message: "Tileset not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertTilesetSchema.partial().parse(req.body);
      res.json(await storage.updateTileset(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update tileset" });
    }
  });

  app.delete("/api/tilesets/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getTileset(id);
      if (!existing) return res.status(404).json({ message: "Tileset not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteTileset(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete tileset" }); }
  });

  app.get("/api/environments/:environmentId/props", requireAuth(), async (req, res) => {
    try {
      const environmentId = paramStr(req.params.environmentId);
      const environment = await storage.getEnvironment(environmentId);
      if (!environment) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(environment.projectId, userId!, res))) return;
      res.json(await storage.getEnvironmentProps(environmentId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch environment props" }); }
  });

  app.post("/api/environments/:environmentId/props", requireAuth(), async (req, res) => {
    try {
      const environmentId = paramStr(req.params.environmentId);
      const environment = await storage.getEnvironment(environmentId);
      if (!environment) return res.status(404).json({ message: "Environment not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(environment.projectId, userId!, res))) return;
      const data = insertEnvironmentPropSchema.parse({ ...req.body, environmentId, projectId: environment.projectId });
      res.status(201).json(await storage.createEnvironmentProp(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create environment prop" });
    }
  });

  app.patch("/api/props/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getEnvironmentProp(id);
      if (!existing) return res.status(404).json({ message: "Environment prop not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertEnvironmentPropSchema.partial().parse(req.body);
      res.json(await storage.updateEnvironmentProp(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update environment prop" });
    }
  });

  app.delete("/api/props/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getEnvironmentProp(id);
      if (!existing) return res.status(404).json({ message: "Environment prop not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteEnvironmentProp(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete environment prop" }); }
  });

  app.get("/api/projects/:projectId/quests", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getQuests(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch quests" }); }
  });

  app.post("/api/projects/:projectId/quests", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertQuestSchema.parse({ ...req.body, projectId });
      res.status(201).json(await storage.createQuest(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create quest" });
    }
  });

  app.get("/api/quests/:id", requireAuth(), async (req, res) => {
    try {
      const quest = await storage.getQuest(paramStr(req.params.id));
      if (!quest) return res.status(404).json({ message: "Quest not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(quest.projectId, userId!, res))) return;
      res.json(quest);
    } catch (error) { res.status(500).json({ message: "Failed to fetch quest" }); }
  });

  app.patch("/api/quests/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getQuest(id);
      if (!existing) return res.status(404).json({ message: "Quest not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertQuestSchema.partial().parse(req.body);
      res.json(await storage.updateQuest(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update quest" });
    }
  });

  app.delete("/api/quests/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getQuest(id);
      if (!existing) return res.status(404).json({ message: "Quest not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      await storage.deleteQuest(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete quest" }); }
  });

  // ─── Uploads ────────────────────────────────────────────

  app.get("/api/projects/:projectId/uploads", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getUploads(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch uploads" }); }
  });

  app.post("/api/projects/:projectId/uploads", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertUploadSchema.parse({ ...req.body, projectId, userId });
      res.status(201).json(await storage.createUpload(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create upload" });
    }
  });

  app.get("/api/uploads/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const upload = await storage.getUpload(id);
      if (!upload) return res.status(404).json({ message: "Upload not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(upload.projectId, userId!, res))) return;
      res.json(upload);
    } catch (error) { res.status(500).json({ message: "Failed to fetch upload" }); }
  });

  app.delete("/api/uploads/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const upload = await storage.getUpload(id);
      if (!upload) return res.status(404).json({ message: "Upload not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(upload.projectId, userId!, res))) return;
      await storage.deleteUpload(id);
      res.status(204).send();
    } catch (error) { res.status(500).json({ message: "Failed to delete upload" }); }
  });

  // ─── Upload Vision Analysis ──────────────────────────────

  /**
   * POST /api/uploads/:id/analyze
   * Manually triggers vision analysis for a single upload.
   * Validates upload exists and status is 'uploaded', then calls the analysis flow.
   * Returns the updated upload record on success, or an error response.
   */
  app.post("/api/uploads/:id/analyze", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const { userId } = getAuth(req);

      // Validate upload exists
      const upload = await storage.getUpload(id);
      if (!upload) return res.status(404).json({ message: "Upload not found" });

      // Verify ownership via project
      if (!(await verifyProjectOwnership(upload.projectId, userId!, res))) return;

      // Only trigger analysis if status is 'uploaded'
      if (upload.status !== "uploaded") {
        return res.status(409).json({
          message: `Cannot analyze upload with status '${upload.status}'. Expected 'uploaded'.`,
          currentStatus: upload.status,
        });
      }

      // Trigger the analysis (fire and await — manual trigger is synchronous from caller's perspective)
      try {
        await analyzeUpload(id);
      } catch (analysisError) {
        console.error(`Vision analysis failed for upload ${id}:`, analysisError);
        // Fetch the latest state of the upload (analyzeUpload may have updated it to 'failed')
        const failedUpload = await storage.getUpload(id);
        return res.status(500).json({
          message: "Vision analysis failed",
          upload: failedUpload ?? upload,
        });
      }

      // Return the updated upload record
      const updatedUpload = await storage.getUpload(id);
      res.json(updatedUpload ?? upload);
    } catch (error) {
      console.error("Error triggering upload analysis:", error);
      res.status(500).json({ message: "Failed to trigger upload analysis" });
    }
  });

  /**
   * GET /api/uploads/:id/analysis
   * Returns the analysis results for a given upload.
   * Fields returned: analysis_result, extracted_style, extracted_palette,
   * extracted_proportions, extracted_pose, status.
   */
  app.get("/api/uploads/:id/analysis", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const { userId } = getAuth(req);

      // Validate upload exists
      const upload = await storage.getUpload(id);
      if (!upload) return res.status(404).json({ message: "Upload not found" });

      // Verify ownership via project
      if (!(await verifyProjectOwnership(upload.projectId, userId!, res))) return;

      // Return only the analysis-related fields
      res.json({
        id: upload.id,
        status: upload.status,
        analysisResult: upload.analysisResult ?? null,
        extractedStyle: upload.extractedStyle ?? null,
        extractedPalette: upload.extractedPalette ?? null,
        extractedProportions: upload.extractedProportions ?? null,
        extractedPose: upload.extractedPose ?? null,
      });
    } catch (error) {
      console.error("Error fetching upload analysis:", error);
      res.status(500).json({ message: "Failed to fetch upload analysis" });
    }
  });

  // ─── Exports ────────────────────────────────────────────

  app.get("/api/projects/:projectId/exports", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getExports(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch exports" }); }
  });

  app.post("/api/projects/:projectId/exports", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertExportSchema.parse({ ...req.body, projectId, userId });
      res.status(201).json(await storage.createExport(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create export" });
    }
  });

  app.get("/api/exports/:id", requireAuth(), async (req, res) => {
    try {
      const exportRecord = await storage.getExport(paramStr(req.params.id));
      if (!exportRecord) return res.status(404).json({ message: "Export not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(exportRecord.projectId, userId!, res))) return;
      res.json(exportRecord);
    } catch (error) { res.status(500).json({ message: "Failed to fetch export" }); }
  });

  app.patch("/api/exports/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getExport(id);
      if (!existing) return res.status(404).json({ message: "Export not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertExportSchema.partial().parse(req.body);
      res.json(await storage.updateExport(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update export" });
    }
  });

  // ─── Agent Runs ─────────────────────────────────────────

  app.get("/api/projects/:projectId/agent-runs", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      res.json(await storage.getAgentRuns(projectId));
    } catch (error) { res.status(500).json({ message: "Failed to fetch agent runs" }); }
  });

  app.post("/api/projects/:projectId/agent-runs", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.projectId);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;
      const data = insertAgentRunSchema.parse({ ...req.body, projectId });
      res.status(201).json(await storage.createAgentRun(data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to create agent run" });
    }
  });

  app.get("/api/agent-runs/:id", requireAuth(), async (req, res) => {
    try {
      const run = await storage.getAgentRun(paramStr(req.params.id));
      if (!run) return res.status(404).json({ message: "Agent run not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(run.projectId, userId!, res))) return;
      res.json(run);
    } catch (error) { res.status(500).json({ message: "Failed to fetch agent run" }); }
  });

  app.patch("/api/agent-runs/:id", requireAuth(), async (req, res) => {
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getAgentRun(id);
      if (!existing) return res.status(404).json({ message: "Agent run not found" });
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(existing.projectId, userId!, res))) return;
      const data = insertAgentRunSchema.partial().parse(req.body);
      res.json(await storage.updateAgentRun(id, data));
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: "Failed to update agent run" });
    }
  });

  // ─── Sneebly Key (used by agent team and chat UI routes) ─
  const sneeblyKey = process.env.SNEEBLY_KEY || "anim-8822-tools";

  // ─── Agent Teams ────────────────────────────────────────

  app.get("/api/agent-teams", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const teams = await storage.getAgentTeams(userId);
      const teamsWithMembers = await Promise.all(
        teams.map(async (team) => {
          const members = await storage.getAgentTeamMembers(team.id);
          return { ...team, members };
        })
      );
      res.json(teamsWithMembers);
    } catch (error) {
      console.error("Error fetching agent teams:", error);
      res.status(500).json({ message: "Failed to fetch agent teams" });
    }
  });

  app.post("/api/agent-teams", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { goal } = req.body;
      if (!goal || typeof goal !== "string" || !goal.trim()) {
        return res.status(400).json({ message: "goal is required" });
      }
      const { createAndLaunchTeam } = await import("./team-factory");
      const team = await createAndLaunchTeam(goal.trim(), userId);
      res.status(201).json(team);
    } catch (error: any) {
      console.error("Error creating agent team:", error);
      res.status(500).json({ message: error?.message || "Failed to create agent team" });
    }
  });

  app.get("/api/agent-teams/:id", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = paramStr(req.params.id);
      const team = await storage.getAgentTeam(id);
      if (!team || team.userId !== userId) return res.status(404).json({ message: "Agent team not found" });
      const members = await storage.getAgentTeamMembers(id);
      res.json({ ...team, members });
    } catch (error) {
      console.error("Error fetching agent team:", error);
      res.status(500).json({ message: "Failed to fetch agent team" });
    }
  });

  app.post("/api/agent-teams/:id/disband", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = paramStr(req.params.id);
      const existing = await storage.getAgentTeam(id);
      if (!existing || existing.userId !== userId) return res.status(404).json({ message: "Agent team not found" });
      if (existing.status === "disbanded") {
        return res.status(409).json({ message: "Team is already disbanded" });
      }
      const { disbandTeamWithCleanup } = await import("./team-factory");
      const team = await disbandTeamWithCleanup(id);
      res.json(team);
    } catch (error) {
      console.error("Error disbanding agent team:", error);
      res.status(500).json({ message: "Failed to disband agent team" });
    }
  });

  app.get("/api/agent-teams/:teamId/members/:memberId/log", requireAuth(), async (req, res) => {
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const teamId = paramStr(req.params.teamId);
      const memberId = paramStr(req.params.memberId);
      const team = await storage.getAgentTeam(teamId);
      if (!team || team.userId !== userId) return res.status(404).json({ message: "Team not found" });
      const member = await storage.getAgentTeamMember(memberId);
      if (!member) return res.status(404).json({ message: "Member not found" });
      if (member.teamId !== teamId) return res.status(404).json({ message: "Member not found in team" });
      res.json({ memberId: member.id, roleName: member.roleName, outputLog: member.outputLog || "" });
    } catch (error) {
      console.error("Error fetching member log:", error);
      res.status(500).json({ message: "Failed to fetch member log" });
    }
  });

  app.get("/api/sneebly-cc/agent-teams", async (req, res) => {
    const key = req.query.key as string;
    if (key !== sneeblyKey) return res.status(401).json({ message: "Unauthorized" });
    try {
      const teams = await storage.getAllAgentTeams();
      const teamsWithMembers = await Promise.all(
        teams.map(async (team) => {
          const members = await storage.getAgentTeamMembers(team.id);
          return { ...team, members };
        })
      );
      res.json(teamsWithMembers);
    } catch (error) {
      console.error("Error fetching agent teams:", error);
      res.status(500).json({ message: "Failed to fetch agent teams" });
    }
  });

  app.post("/api/sneebly-cc/agent-teams", async (req, res) => {
    const key = req.query.key as string;
    if (key !== sneeblyKey) return res.status(401).json({ message: "Unauthorized" });
    try {
      const { goal } = req.body;
      if (!goal || typeof goal !== "string" || !goal.trim()) {
        return res.status(400).json({ message: "goal is required" });
      }
      const { createAndLaunchTeam } = await import("./team-factory");
      const team = await createAndLaunchTeam(goal.trim(), "sneebly-admin");
      res.status(201).json(team);
    } catch (error: any) {
      console.error("Error creating agent team:", error);
      res.status(500).json({ message: error?.message || "Failed to create agent team" });
    }
  });

  app.post("/api/sneebly-cc/agent-teams/:id/disband", async (req, res) => {
    const key = req.query.key as string;
    if (key !== sneeblyKey) return res.status(401).json({ message: "Unauthorized" });
    try {
      const id = paramStr(req.params.id);
      const existing = await storage.getAgentTeam(id);
      if (!existing) return res.status(404).json({ message: "Agent team not found" });
      if (existing.status === "disbanded") {
        return res.status(409).json({ message: "Team is already disbanded" });
      }
      const { disbandTeamWithCleanup } = await import("./team-factory");
      const team = await disbandTeamWithCleanup(id);
      res.json(team);
    } catch (error) {
      console.error("Error disbanding agent team:", error);
      res.status(500).json({ message: "Failed to disband agent team" });
    }
  });

  // ─── Sneebly Chat UI ────────────────────────────────────

  app.get("/sneebly", (_req, res) => {
    res.send(getChatHtml(sneeblyKey));
  });

  app.get("/sneebly/chat", (_req, res) => {
    res.send(getChatHtml(sneeblyKey));
  });

  app.get("/sneebly/cc", (req, res) => {
    if (req.query.key !== sneeblyKey) return res.status(401).send("Unauthorized");
    res.send(getCommandCenterHtml(sneeblyKey));
  });

  app.get("/sneebly/command-center", (req, res) => {
    if (req.query.key !== sneeblyKey) return res.status(401).send("Unauthorized");
    res.send(getCommandCenterHtml(sneeblyKey));
  });

  app.get("/sneebly/budget", (req, res) => {
    if (req.query.key !== sneeblyKey) return res.status(401).send("Unauthorized");
    res.send(getBudgetHtml(sneeblyKey));
  });

  app.get("/sneebly/teams", (req, res) => {
    if (req.query.key !== sneeblyKey) return res.status(401).send("Unauthorized");
    res.send(getAgentTeamsHtml(sneeblyKey));
  });

  // Chat: GET /api/sneebly-cc/chat/:channel — load message history
  app.get("/api/sneebly-cc/chat/:channel", (req, res) => {
    const channel = req.params.channel as string;
    try {
      const messages = getMessages(channel);
      res.json({ messages });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Chat: POST /api/sneebly-cc/chat/:channel — send a message
  app.post("/api/sneebly-cc/chat/:channel", async (req, res) => {
    const channel = req.params.channel as string;
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });
      const result = await sendMessage(channel, message);
      res.json(result);
    } catch (error: any) {
      console.error("Error sending message:", error);
      const msg = error?.message || "Failed to send message";
      if (msg.includes("Budget limit")) {
        return res.status(429).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  });

  // Chat: POST /api/sneebly-cc/chat/:channel/clear — clear history
  app.post("/api/sneebly-cc/chat/:channel/clear", (req, res) => {
    const channel = req.params.channel as string;
    try {
      clearMessages(channel);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error clearing messages:", error);
      res.status(500).json({ error: "Failed to clear messages" });
    }
  });

  // Chat: POST /api/sneebly-cc/chat/:channel/stream — SSE streaming with live tool steps
  // Accepts either multipart/form-data (when images attached) or application/json
  app.post(
    "/api/sneebly-cc/chat/:channel/stream",
    upload.array("images", 4),
    async (req, res) => {
      const channel = req.params.channel as string;
      // multer puts text fields in req.body, files in req.files
      const message: string = (req.body?.message as string) || "";
      const files = (req.files as Express.Multer.File[]) || [];

      if (!message.trim() && files.length === 0) {
        res.status(400).json({ error: "Message or image is required" });
        return;
      }

      // Convert uploaded file buffers to base64 image attachments for Anthropic
      const images = files.map((f) => ({
        data: f.buffer.toString("base64"),
        mediaType: f.mimetype,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      function emit(evt: object) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }

      try {
        await sendMessageStream(channel, message, emit, images.length ? images : undefined);
      } catch (err: any) {
        emit({ type: "error", message: err?.message || "Stream error" });
      }
      res.end();
    }
  );

  // ─── Autonomy Loop ──────────────────────────────────────

  app.post("/api/sneebly-cc/autonomy/start", async (_req, res) => {
    try {
      startAutonomyLoop();
      res.json({ message: "Autonomy loop started" });
    } catch (error) {
      res.status(500).json({ message: "Failed to start autonomy loop" });
    }
  });

  app.post("/api/sneebly-cc/autonomy/stop", async (_req, res) => {
    try {
      stopAutonomyLoop();
      res.json({ message: "Autonomy loop stopped" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop autonomy loop" });
    }
  });

  app.post("/api/sneebly-cc/autonomy/trigger", async (_req, res) => {
    try {
      await triggerSingleCycle();
      res.json({ message: "Single cycle triggered" });
    } catch (error) {
      res.status(500).json({ message: "Failed to trigger cycle" });
    }
  });

  app.get("/api/sneebly-cc/autonomy/state", async (_req, res) => {
    try {
      const state = getAutonomyState();
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to get autonomy state" });
    }
  });

  app.post("/api/sneebly-cc/autonomy/fix-tsc", async (_req, res) => {
    try {
      await fixTscErrors();
      res.json({ message: "TSC error fix triggered" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fix TSC errors" });
    }
  });

  app.post("/api/sneebly-cc/run-playwright", (_req, res) => {
    const t0 = Date.now();
    const chunks: Buffer[] = [];
    const child = spawn("npx", ["playwright", "test", "--reporter=list"], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => chunks.push(c));
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      if (!res.headersSent) {
        res.status(500).json({ message: "Playwright timed out after 120s", durationMs: 120_000 });
      }
    }, 120_000);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (res.headersSent) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      const durationMs = Date.now() - t0;
      const passedMatch = raw.match(/(\d+)\s+passed/);
      const failedMatch = raw.match(/(\d+)\s+failed/);
      const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const success = code === 0;
      res.json({ passed, failed, total: passed + failed, output: raw, durationMs, success, exitCode: code, signal });
    });
    child.on("error", (err: Error) => {
      clearTimeout(timeout);
      if (!res.headersSent) res.status(500).json({ message: err.message, durationMs: Date.now() - t0 });
    });
  });

  // ─── Sneebly Data Endpoints ──────────────────────────────

  app.get("/api/sneebly-cc/plan", (_req, res) => {
    try { res.json(loadCurrentPlan() || {}); }
    catch { res.json({}); }
  });

  app.get("/api/sneebly-cc/activity", (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit || "20"));
      res.json(getActivityLog(limit));
    } catch { res.json([]); }
  });

  app.get("/api/sneebly-cc/journal", (req, res) => {
    try {
      const limit = parseInt(String(req.query.limit || "20"));
      res.json(getRecentJournalEntries(limit));
    } catch { res.json([]); }
  });

  app.get("/api/sneebly-cc/blockers", (_req, res) => {
    try { res.json({ blockers: getUserActions() }); }
    catch { res.json({ blockers: [] }); }
  });

  app.post("/api/sneebly-cc/blockers/:id/resolve", (req, res) => {
    try { res.json({ ok: dismissUserAction(req.params.id) }); }
    catch { res.status(500).json({ message: "Failed" }); }
  });

  app.post("/api/sneebly-cc/blockers/:id/dismiss", (req, res) => {
    try { res.json({ ok: dismissUserAction(req.params.id) }); }
    catch { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/sneebly/roadmap", (_req, res) => {
    try { res.json(loadRoadmap() || { features: [] }); }
    catch { res.json({ features: [] }); }
  });

  app.post("/api/sneebly/roadmap/regenerate", async (_req, res) => {
    try { res.json(await generateRoadmap()); }
    catch { res.status(500).json({ message: "Roadmap regeneration failed" }); }
  });

  app.get("/api/sneebly/elon-status", (_req, res) => {
    try {
      const gtPath = ".sneebly/elon-context.json";
      const monitorPath = ".sneebly/elon-monitor.json";
      const gtData = fs.existsSync(gtPath)
        ? JSON.parse(fs.readFileSync(gtPath, "utf-8"))
        : { status: "not_run", constraints: [] };
      const monitorData = fs.existsSync(monitorPath)
        ? JSON.parse(fs.readFileSync(monitorPath, "utf-8"))
        : null;
      res.json({
        ...gtData,
        healthOk: monitorData ? monitorData.healthOk : true,
        tscErrors: monitorData ? monitorData.tscErrors : null,
        findings: monitorData ? monitorData.findings : [],
        monitorCycles: monitorData ? monitorData.monitorCycles : 0,
        lastRun: monitorData ? monitorData.runAt : null,
      });
    } catch { res.json({ status: "error", healthOk: true }); }
  });

  // ─── Costs & Budget ──────────────────────────────────────

  app.get("/api/sneebly-cc/costs", (_req, res) => {
    try {
      syncFromSneeblyLogs();
      res.json(getCostSummary());
    } catch { res.json({ totalToday: 0, totalAllTime: 0, totalThisHour: 0, entriesCount: 0, byModel: {}, byAgent: {}, byFeature: {}, activeSessions: [] }); }
  });

  app.get("/api/sneebly-cc/expenses", (_req, res) => {
    try {
      syncFromSneeblyLogs();
      res.json(generateExpenseReport());
    } catch { res.json({ totalSpent: 0, byFeature: [] }); }
  });

  app.get("/api/sneebly-cc/processes", (_req, res) => {
    try {
      const summary = getCostSummary();
      res.json({ processes: summary.activeSessions || [] });
    } catch { res.json({ processes: [] }); }
  });

  app.get("/api/sneebly-cc/budget", (_req, res) => {
    try {
      syncFromSneeblyLogs();
      const config = getBudgetConfig();
      const report = generateExpenseReport();
      res.json({ ...config, ...report });
    } catch { res.json({ limit: 120, mode: "stop", totalSpent: 0 }); }
  });

  app.post("/api/sneebly-cc/budget", (req, res) => {
    try {
      const { limit, mode } = req.body as { limit?: number; mode?: "notify" | "stop" };
      const cfg = getBudgetConfig();
      const updated = setBudget(limit ?? cfg.limit, mode ?? cfg.mode, "user");
      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to update budget" }); }
  });

  app.get("/api/sneebly-cc/user-actions", (_req, res) => {
    try { res.json({ actions: getUserActions() }); }
    catch { res.json({ actions: [] }); }
  });

  app.post("/api/sneebly-cc/user-actions/:id/dismiss", (req, res) => {
    try { res.json({ ok: dismissUserAction(req.params.id) }); }
    catch { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/sneebly-cc/live", (req, res) => {
    try {
      const after = req.query.after as string | undefined;
      res.json({ entries: getLiveOutput(after, 30) });
    } catch { res.json({ entries: [] }); }
  });

  // ─── Spec Watcher & Auto DB Push ────────────────────────

  setupSpecWatcher();
  setupAutoDbPush();

  // ─── Auto-Restart Watchdog ───────────────────────────────
  // If the server restarts while features are still pending/in_progress,
  // Sneebly auto-detects this and resumes building after a brief settle delay.
  setTimeout(async () => {
    try {
      const roadmap = loadRoadmap();
      if (!roadmap) return;
      const { running } = getAutonomyState();
      if (running) return; // already running, nothing to do

      // Heal orphaned in_progress features from a previous crashed session
      const orphaned = roadmap.features.filter(f => f.status === "in_progress");
      for (const f of orphaned) {
        await resetFeatureStatus(f.id);
        console.log(`[Sneebly/Boot] Auto-healed orphaned feature: ${f.id} (${f.title}) → pending`);
      }

      // Check if any work remains
      const remaining = roadmap.features.filter(f => f.status === "pending" || f.status === "in_progress");
      if (remaining.length === 0) {
        console.log("[Sneebly/Boot] All features done — no auto-start needed.");
        return;
      }

      const ready = getNextFeatures();
      if (ready.length === 0) {
        console.log(`[Sneebly/Boot] ${remaining.length} feature(s) remain but none are unblocked yet — writing alert.`);
        writeUserActionNeeded(
          "Sneebly paused — blocked features",
          `${remaining.length} feature(s) remain on the roadmap but all are blocked by unresolved dependencies. Review the roadmap and resolve blockers, then press Start Autonomy.`
        );
        return;
      }

      console.log(`[Sneebly/Boot] Detected ${remaining.length} remaining feature(s) — auto-starting autonomy loop.`);
      writeUserActionNeeded(
        "Sneebly resumed automatically",
        `Server restarted with ${remaining.length} feature(s) still on the roadmap. Autonomy loop has been resumed automatically. Currently building: ${ready.map(f => f.title).join(", ")}.`
      );
      startAutonomyLoop();
    } catch (err: any) {
      console.log(`[Sneebly/Boot] Auto-restart watchdog error: ${err.message}`);
    }
  }, 30_000); // 30s settle time so server is fully ready before building starts

  // ─── Character Agent with Motion Intelligence ─────────────
  // Feature-016: Character Agent API for sprite animation planning

  const characterAgentAnalyzeSchema = z.object({
    characterId: z.string().optional(),
    characterDescription: z.string().min(1),
    gameType: z.string().min(1),
    movementStyle: z.string().optional(),
    pov: z.string().optional(),
  });

  app.post("/api/character-agent/analyze", async (req, res) => {
    try {
      const body = characterAgentAnalyzeSchema.parse(req.body);
      const { characterDescription, gameType, movementStyle, pov } = body;

      const motionProfile = buildCharacterAgentMotionProfile(gameType, movementStyle ?? "standard");
      const animations = getDefaultAnimations(gameType);

      const result = {
        characterDescription,
        gameType,
        movementStyle: movementStyle ?? "standard",
        pov: pov ?? "side",
        motionProfile,
        recommendedAnimations: animations,
        spriteSheetConfig: {
          frameWidth: 64,
          frameHeight: 64,
          columns: 8,
          rows: Math.ceil(animations.length / 8),
          format: "PNG",
          phaserKey: `${gameType.replace(/\s+/g, "_").toLowerCase()}_character_sheet`,
        },
        generatedAt: new Date().toISOString(),
      };

      res.json({ success: true, characterAgent: result });
    } catch (err: any) {
      if (err instanceof ZodError) return res.status(400).json({ error: "Invalid request", details: err.errors });
      res.status(500).json({ error: err.message ?? "Character agent analysis failed" });
    }
  });

  app.get("/api/character-agent/motion-profile/:gameType", (req, res) => {
    try {
      const { gameType } = req.params;
      const motionProfile = buildCharacterAgentMotionProfile(gameType, "standard");
      res.json({ success: true, gameType, motionProfile });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to get motion profile" });
    }
  });

  // ─── World Builder Agent ─────────────────────────────────────────────────────

  app.post("/api/projects/:id/world-builder/generate", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.id);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const prompt = `You are a World Builder AI for a ${project.gameType ?? "platformer"} game called "${project.name}".
${project.gameContext ? `Game context: ${project.gameContext}` : ""}
${project.movementStyle ? `Movement style: ${project.movementStyle}` : ""}

Generate exactly 3 distinct game environments as a JSON array. Each environment must have:
- name: string (short, evocative name)
- zoneType: string (e.g. "outdoor", "indoor", "dungeon", "sky", "underwater")
- description: string (2-3 sentences describing the visual and gameplay feel)
- mood: string (one word: e.g. "eerie", "serene", "chaotic", "mystical")
- lightingDirection: string (e.g. "top-left", "overhead", "dramatic-side")
- atmosphericEffects: array of strings (e.g. ["fog", "rain", "fireflies"])

Return ONLY a JSON array with 3 objects. No markdown, no explanation.`;

      const message = await anthropicClient.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "[]";
      let envDefs: Array<{
        name: string;
        zoneType?: string;
        description?: string;
        mood?: string;
        lightingDirection?: string;
        atmosphericEffects?: string[];
      }>;

      try {
        const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        envDefs = JSON.parse(cleaned);
        if (!Array.isArray(envDefs)) throw new Error("Not an array");
      } catch {
        return res.status(500).json({ message: "World Builder returned invalid JSON", raw });
      }

      const created: typeof envDefs = [];
      for (const def of envDefs.slice(0, 3)) {
        if (!def.name) continue;
        await storage.createEnvironment({
          projectId,
          name: def.name,
          zoneType: def.zoneType ?? null,
          description: def.description ?? null,
          mood: def.mood ?? null,
          lightingDirection: def.lightingDirection ?? null,
          colorPalette: null,
          atmosphericEffects: def.atmosphericEffects ?? null,
          layoutBlueprint: null,
          status: "draft",
        });
        created.push(def);
      }

      res.json({ success: true, created: created.length, environments: created });
    } catch (err: any) {
      console.error("[WorldBuilder] Error:", err);
      res.status(500).json({ message: err.message ?? "World Builder failed" });
    }
  });

  // ─── Agent Pipeline Orchestration ────────────────────────────────────────────

  app.post("/api/projects/:id/agents/pipeline", requireAuth(), async (req, res) => {
    try {
      const projectId = paramStr(req.params.id);
      const { userId } = getAuth(req);
      if (!(await verifyProjectOwnership(projectId, userId!, res))) return;

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const characters = await storage.getCharacters(projectId);
      const steps: string[] = [];

      // Step 1: Character Agent — analyze each character
      for (const char of characters) {
        await storage.createAgentRun({
          projectId,
          agentType: "character-agent",
          inputContext: {
            characterId: char.id,
            characterName: char.name,
            gameType: project.gameType ?? "platformer",
          },
          status: "queued",
        });
        steps.push(`character-agent:${char.name}`);
      }

      // Step 2: World Builder Agent — generate environments
      const envResult = await fetch(
        `http://localhost:5000/api/projects/${projectId}/world-builder/generate`,
        {
          method: "POST",
          headers: { Authorization: req.headers.authorization ?? "", cookie: req.headers.cookie ?? "" },
        }
      ).then((r) => r.json()).catch(() => ({ created: 0 }));
      steps.push(`world-builder:${envResult.created ?? 0} environments`);

      // Step 3: Queue a phaser3-zip export
      const exportRecord = await storage.createExport({
        projectId,
        userId: userId!,
        exportType: "phaser3-zip",
        fileUrl: null,
        includesGdd: true,
        includesPhaserBoilerplate: true,
        status: "queued",
        metadata: { triggeredBy: "pipeline" },
      });
      steps.push(`export:${exportRecord.id}`);

      res.json({
        success: true,
        projectId,
        steps,
        message: `Pipeline started: ${steps.length} steps queued`,
      });
    } catch (err: any) {
      console.error("[Pipeline] Error:", err);
      res.status(500).json({ message: err.message ?? "Pipeline orchestration failed" });
    }
  });

  return httpServer;
}

function buildCharacterAgentMotionProfile(gameType: string, movementStyle: string) {
  const isTopDown = gameType.includes("top") || gameType.includes("rpg") || gameType.includes("adventure");
  const isRunner = gameType.includes("runner") || gameType.includes("endless");

  return {
    locomotionType: isTopDown ? "8-directional" : isRunner ? "forward-scroll" : "2d-platformer",
    gravityScale: isTopDown ? 0 : 1,
    maxRunSpeed: isRunner ? 300 : 200,
    jumpHeight: isTopDown ? 0 : 180,
    animationBlendTime: 0.1,
    movementStyle,
    biomechanicsHints: {
      idleBobAmplitude: 2,
      runCycleDuration: isRunner ? 0.4 : 0.5,
      jumpSquashFactor: 0.85,
      landingSquashFactor: 0.75,
      anticipationFrames: 2,
      followThroughFrames: 3,
    },
    phaserConfig: {
      physics: isTopDown ? "arcade-topdown" : "arcade-platformer",
      drag: isTopDown ? 800 : 0,
      maxVelocityX: isRunner ? 400 : 300,
      maxVelocityY: isTopDown ? 300 : 500,
    },
  };
}

// ─── Default Animations Helper ──────────────────────────

function getDefaultAnimations(gameType: string) {
  const platformerAnims = [
    { character: "player", name: "Idle", key: "idle", fps: 8, frames: 4, loop: true, priority: "CORE" },
    { character: "player", name: "Run", key: "run", fps: 12, frames: 8, loop: true, priority: "CORE" },
    { character: "player", name: "Jump", key: "jump", fps: 8, frames: 4, loop: false, priority: "CORE" },
    { character: "player", name: "Fall", key: "fall", fps: 8, frames: 4, loop: true, priority: "CORE" },
    { character: "player", name: "Land", key: "land", fps: 12, frames: 3, loop: false, priority: "SECONDARY" },
    { character: "player", name: "Attack", key: "attack", fps: 12, frames: 6, loop: false, priority: "SECONDARY" },
    { character: "player", name: "Hurt", key: "hurt", fps: 10, frames: 3, loop: false, priority: "SECONDARY" },
    { character: "player", name: "Death", key: "death", fps: 10, frames: 6, loop: false, priority: "SECONDARY" },
  ];

  const topDownAnims = [
    { character: "player", name: "Idle Down", key: "idle_down", fps: 8, frames: 4, loop: true, priority: "CORE" },
    { character: "player", name: "Idle Up", key: "idle_up", fps: 8, frames: 4, loop: true, priority: "CORE" },
    { character: "player", name: "Idle Side", key: "idle_side", fps: 8, frames: 4, loop: true, priority: "CORE" },
    { character: "player", name: "Walk Down", key: "walk_down", fps: 12, frames: 8, loop: true, priority: "CORE" },
    { character: "player", name: "Walk Up", key: "walk_up", fps: 12, frames: 8, loop: true, priority: "CORE" },
    { character: "player", name: "Walk Side", key: "walk_side", fps: 12, frames: 8, loop: true, priority: "CORE" },
    { character: "player", name: "Attack", key: "attack", fps: 12, frames: 6, loop: false, priority: "SECONDARY" },
    { character: "player", name: "Hurt", key: "hurt", fps: 10, frames: 3, loop: false, priority: "SECONDARY" },
  ];

  const runnerAnims = [
    { character: "player", name: "Run", key: "run", fps: 12, frames: 8, loop: true, priority: "CORE" },
    { character: "player", name: "Jump", key: "jump", fps: 8, frames: 4, loop: false, priority: "CORE" },
    { character: "player", name: "Slide", key: "slide", fps: 8, frames: 4, loop: false, priority: "CORE" },
    { character: "player", name: "Hurt", key: "hurt", fps: 10, frames: 3, loop: false, priority: "SECONDARY" },
    { character: "player", name: "Death", key: "death", fps: 10, frames: 6, loop: false, priority: "SECONDARY" },
  ];

  if (gameType.includes("top") || gameType.includes("rpg") || gameType.includes("adventure")) {
    return topDownAnims;
  }
  if (gameType.includes("runner") || gameType.includes("endless")) {
    return runnerAnims;
  }
  return platformerAnims;
}
