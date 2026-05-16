// @ts-nocheck
import { Router } from "express";
import { db } from "../db";
import { projects } from "../../shared/schema";
import { eq } from "drizzle-orm";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

type Project = InferSelectModel<typeof projects>;
type NewProject = InferInsertModel<typeof projects>;

interface CreateProjectBody {
  name: string;
  description?: string;
}

interface UpdateProjectBody {
  name?: string;
  description?: string;
}

interface ProjectParams {
  id: string;
}

const router = Router();

// GET /api/projects - List all projects
router.get("/", async (req, res) => {
  try {
    const allProjects: Project[] = await db.select().from(projects);
    res.json(allProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// GET /api/projects/:id - Get a single project
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params as ProjectParams;
    const projectId = parseInt(id, 10);
    
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const result: Project[] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (result.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// POST /api/projects - Create a new project
router.post("/", async (req, res) => {
  try {
    const body = req.body as CreateProjectBody;
    
    if (!body.name || typeof body.name !== "string") {
      res.status(400).json({ error: "Project name is required" });
      return;
    }

    const newProject: NewProject = {
      name: body.name,
      description: body.description || null,
    };

    const result: Project[] = await db
      .insert(projects)
      .values(newProject)
      .returning();

    if (result.length === 0) {
      res.status(500).json({ error: "Failed to create project" });
      return;
    }

    res.status(201).json(result[0]);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// PATCH /api/projects/:id - Update a project
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params as ProjectParams;
    const projectId = parseInt(id, 10);
    
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const body = req.body as UpdateProjectBody;
    
    if (!body.name && !body.description) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const updates: Partial<NewProject> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const result: Project[] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, projectId))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params as ProjectParams;
    const projectId = parseInt(id, 10);
    
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const result: Project[] = await db
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
