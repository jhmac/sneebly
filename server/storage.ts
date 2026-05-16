import {
  type Project, type InsertProject,
  type Animation, type InsertAnimation,
  type Profile, type InsertProfile,
  type User, type InsertUser,
  type Story, type InsertStory,
  type Character, type InsertCharacter,
  type SpriteSheet, type InsertSpriteSheet,
  type Environment, type InsertEnvironment,
  type Tileset, type InsertTileset,
  type EnvironmentProp, type InsertEnvironmentProp,
  type Quest, type InsertQuest,
  type Upload, type InsertUpload,
  type Export, type InsertExport,
  type AgentRun, type InsertAgentRun,
  type AgentTeam, type InsertAgentTeam,
  type AgentTeamMember, type InsertAgentTeamMember,
  projects, animations, profiles,
  users, stories, characters, spriteSheets,
  environments, tilesets, environmentProps,
  quests, uploads, projectExports, agentRuns,
  agentTeams, agentTeamMembers,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, asc, sql, isNull } from "drizzle-orm";

export interface AssetCounts {
  sprites: number;
  animations: number;
  tilesets: number;
  environments: number;
}

export interface ProjectAssetsForExport {
  project: Project;
  characters: Character[];
  spriteSheets: SpriteSheet[];
  animations: Animation[];
  environments: Environment[];
  tilesets: Tileset[];
  environmentProps: EnvironmentProp[];
  stories: Story[];
}

export interface UploadAnalysisData {
  status: string;
  analysisResult: Record<string, any> | null;
  extractedStyle: Record<string, any> | null;
  extractedPalette: Record<string, any> | null;
  extractedProportions: Record<string, any> | null;
  extractedPose: Record<string, any> | null;
}

/** Input shape for storeVisionAnalysisResults — all five JSONB fields from Vision AI */
export interface VisionAnalysisFields {
  analysisResult: Record<string, any>;
  extractedStyle: Record<string, any> | null;
  extractedPalette: Record<string, any> | null;
  extractedProportions: Record<string, any> | null;
  extractedPose: Record<string, any> | null;
}

export interface IStorage {
  // ─── Projects ─────────────────────────────────────────
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;

  // ─── Animations ───────────────────────────────────────
  getAnimations(projectId: string): Promise<Animation[]>;
  getAnimation(id: string): Promise<Animation | undefined>;
  createAnimation(animation: InsertAnimation): Promise<Animation>;
  updateAnimation(id: string, data: Partial<InsertAnimation>): Promise<Animation | undefined>;
  deleteAnimation(id: string): Promise<void>;

  // ─── Profiles ─────────────────────────────────────────
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile | undefined>;

  // ─── Users ────────────────────────────────────────────
  getUser(clerkId: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(clerkId: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // ─── Stories ──────────────────────────────────────────
  getStories(projectId: string): Promise<Story[]>;
  getStory(id: string): Promise<Story | undefined>;
  createStory(data: InsertStory): Promise<Story>;
  updateStory(id: string, data: Partial<InsertStory>): Promise<Story | undefined>;
  deleteStory(id: string): Promise<void>;

  // ─── Characters ───────────────────────────────────────
  getCharacters(projectId: string): Promise<Character[]>;
  getCharacter(id: string): Promise<Character | undefined>;
  createCharacter(data: InsertCharacter): Promise<Character>;
  updateCharacter(id: string, data: Partial<InsertCharacter>): Promise<Character | undefined>;
  deleteCharacter(id: string): Promise<void>;

  // ─── Sprite Sheets ────────────────────────────────────
  getSpriteSheets(projectId: string): Promise<SpriteSheet[]>;
  getSpriteSheet(id: string): Promise<SpriteSheet | undefined>;
  createSpriteSheet(data: InsertSpriteSheet): Promise<SpriteSheet>;
  updateSpriteSheet(id: string, data: Partial<InsertSpriteSheet>): Promise<SpriteSheet | undefined>;
  deleteSpriteSheet(id: string): Promise<void>;

  // ─── Environments ─────────────────────────────────────
  getEnvironments(projectId: string): Promise<Environment[]>;
  getEnvironment(id: string): Promise<Environment | undefined>;
  createEnvironment(data: InsertEnvironment): Promise<Environment>;
  updateEnvironment(id: string, data: Partial<InsertEnvironment>): Promise<Environment | undefined>;
  deleteEnvironment(id: string): Promise<void>;

  // ─── Tilesets ─────────────────────────────────────────
  getTilesets(environmentId: string): Promise<Tileset[]>;
  getTileset(id: string): Promise<Tileset | undefined>;
  createTileset(data: InsertTileset): Promise<Tileset>;
  updateTileset(id: string, data: Partial<InsertTileset>): Promise<Tileset | undefined>;
  deleteTileset(id: string): Promise<void>;

  // ─── Environment Props ────────────────────────────────
  getEnvironmentProps(environmentId: string): Promise<EnvironmentProp[]>;
  getEnvironmentProp(id: string): Promise<EnvironmentProp | undefined>;
  createEnvironmentProp(data: InsertEnvironmentProp): Promise<EnvironmentProp>;
  updateEnvironmentProp(id: string, data: Partial<InsertEnvironmentProp>): Promise<EnvironmentProp | undefined>;
  deleteEnvironmentProp(id: string): Promise<void>;

  // ─── Quests ───────────────────────────────────────────
  getQuests(projectId: string): Promise<Quest[]>;
  getQuest(id: string): Promise<Quest | undefined>;
  createQuest(data: InsertQuest): Promise<Quest>;
  updateQuest(id: string, data: Partial<InsertQuest>): Promise<Quest | undefined>;
  deleteQuest(id: string): Promise<void>;

  // ─── Uploads ──────────────────────────────────────────
  getUploads(projectId: string): Promise<Upload[]>;
  getUpload(id: string): Promise<Upload | undefined>;
  createUpload(data: InsertUpload): Promise<Upload>;
  updateUpload(id: string, data: Partial<InsertUpload>): Promise<Upload | undefined>;
  deleteUpload(id: string): Promise<void>;
  /** Fetch uploads by status, with optional limit for batch processing */
  getUploadsByStatus(status: string, limit?: number): Promise<Upload[]>;
  /** Atomically transition upload status — returns true if the row was updated, false if it was already claimed */
  transitionUploadStatus(id: string, fromStatus: string, toStatus: string): Promise<boolean>;
  /** Update upload with full analysis results and status */
  updateUploadAnalysis(id: string, data: UploadAnalysisData): Promise<Upload | undefined>;

  // ─── Vision Pipeline ──────────────────────────────────
  /** Fetch up to 10 uploads with status='uploaded', ordered by created_at ASC */
  getUploadsPendingAnalysis(): Promise<Upload[]>;
  /** Update only the status and updated_at fields on an upload */
  updateUploadStatus(id: string, status: string): Promise<Upload | undefined>;
  /** Store all five Vision AI JSONB fields, set status='analyzed', update updated_at */
  storeVisionAnalysisResults(id: string, data: VisionAnalysisFields): Promise<Upload | undefined>;
  /** Mark upload as failed — sets status='failed', stores error info in analysis_result, updates updated_at */
  markUploadFailed(id: string, errorInfo: Record<string, any>): Promise<Upload | undefined>;

  // ─── Exports ──────────────────────────────────────────
  getExports(projectId: string): Promise<Export[]>;
  getExport(id: string): Promise<Export | undefined>;
  createExport(data: InsertExport): Promise<Export>;
  updateExport(id: string, data: Partial<InsertExport>): Promise<Export | undefined>;
  getExportsByProject(projectId: string): Promise<Export[]>;
  updateExportStatus(id: string, status: string, fileUrl?: string): Promise<Export>;

  // ─── Agent Runs ───────────────────────────────────────
  getAgentRun(id: string): Promise<AgentRun | undefined>;
  getAgentRuns(projectId: string): Promise<AgentRun[]>;
  createAgentRun(data: InsertAgentRun): Promise<AgentRun>;
  updateAgentRun(id: string, data: Partial<InsertAgentRun>): Promise<AgentRun | undefined>;

  // ─── Character Agent Methods ──────────────────────────
  /** Joins character with its project's styleGuide and researchBible */
  getCharacterWithContext(characterId: string): Promise<{ character: Character; styleGuide: Record<string, any> | null; researchBible: Record<string, any> | null } | undefined>;
  /** Patches the motion_profile JSONB on characters table */
  updateCharacterMotionProfile(characterId: string, motionProfile: Record<string, any>): Promise<Character | undefined>;
  /** Bulk-inserts multiple animation records linked to characterId */
  createAnimationBatch(animationBatch: InsertAnimation[]): Promise<Animation[]>;
  /** Queries characters where no matching sprite_sheet exists */
  getCharactersNeedingSprites(projectId: string): Promise<Character[]>;
  /** Inserts/updates agent_runs for the character-agent with step-level state tracking */
  recordAgentRun(data: InsertAgentRun & { id?: string }): Promise<AgentRun>;

  // ─── Export Helper ────────────────────────────────────
  getProjectAssetsForExport(projectId: string): Promise<ProjectAssetsForExport>;

  // ─── Asset Counts ─────────────────────────────────────
  getAssetCounts(projectId: string): Promise<AssetCounts>;

  // ─── Agent Teams ──────────────────────────────────────
  getAgentTeams(userId: string): Promise<AgentTeam[]>;
  getAllAgentTeams(): Promise<AgentTeam[]>;
  getAgentTeam(id: string): Promise<AgentTeam | undefined>;
  createAgentTeam(data: InsertAgentTeam): Promise<AgentTeam>;
  updateAgentTeam(id: string, data: Partial<AgentTeam>): Promise<AgentTeam | undefined>;
  disbandAgentTeam(id: string): Promise<AgentTeam | undefined>;
  getAgentTeamMembers(teamId: string): Promise<AgentTeamMember[]>;
  getAgentTeamMember(id: string): Promise<AgentTeamMember | undefined>;
  createAgentTeamMember(data: InsertAgentTeamMember): Promise<AgentTeamMember>;
  updateAgentTeamMember(id: string, data: Partial<AgentTeamMember>): Promise<AgentTeamMember | undefined>;
}

export class DatabaseStorage implements IStorage {
  // ─── Projects ───────────────────────────────────────────

  async getProjects(userId: string): Promise<Project[]> {
    try {
      return await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
    } catch (error) {
      console.error('[Storage] getProjects failed:', { userId, error });
      throw error;
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      return project;
    } catch (error) {
      console.error('[Storage] getProject failed:', { id, error });
      throw error;
    }
  }

  async createProject(data: InsertProject): Promise<Project> {
    try {
      const [project] = await db.insert(projects).values(data).returning();
      return project;
    } catch (error) {
      console.error('[Storage] createProject failed:', { data, error });
      throw error;
    }
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    try {
      const [project] = await db
        .update(projects)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return project;
    } catch (error) {
      console.error('[Storage] updateProject failed:', { id, data, error });
      throw error;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await db.delete(projects).where(eq(projects.id, id));
    } catch (error) {
      console.error('[Storage] deleteProject failed:', { id, error });
      throw error;
    }
  }

  // ─── Animations ─────────────────────────────────────────

  async getAnimations(projectId: string): Promise<Animation[]> {
    return db.select().from(animations).where(eq(animations.projectId, projectId)).orderBy(animations.sortOrder);
  }

  async getAnimation(id: string): Promise<Animation | undefined> {
    const [animation] = await db.select().from(animations).where(eq(animations.id, id));
    return animation;
  }

  async createAnimation(data: InsertAnimation): Promise<Animation> {
    const [animation] = await db.insert(animations).values(data).returning();
    return animation;
  }

  async updateAnimation(id: string, data: Partial<InsertAnimation>): Promise<Animation | undefined> {
    const [animation] = await db
      .update(animations)
      .set(data)
      .where(eq(animations.id, id))
      .returning();
    return animation;
  }

  async deleteAnimation(id: string): Promise<void> {
    await db.delete(animations).where(eq(animations.id, id));
  }

  // ─── Profiles ───────────────────────────────────────────

  async getProfile(userId: string): Promise<Profile | undefined> {
    try {
      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
      return profile;
    } catch (error) {
      console.error('[Storage] getProfile failed:', { userId, error });
      throw error;
    }
  }

  async createProfile(data: InsertProfile): Promise<Profile> {
    try {
      const [profile] = await db.insert(profiles).values(data).returning();
      return profile;
    } catch (error) {
      console.error('[Storage] createProfile failed:', { data, error });
      throw error;
    }
  }

  async updateProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile | undefined> {
    try {
      const [profile] = await db
        .update(profiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(profiles.userId, userId))
        .returning();
      return profile;
    } catch (error) {
      console.error('[Storage] updateProfile failed:', { userId, data, error });
      throw error;
    }
  }

  // ─── Users ──────────────────────────────────────────────

  async getUser(clerkId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(clerkId: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.clerkId, clerkId))
      .returning();
    return user;
  }

  // ─── Stories ────────────────────────────────────────────

  async getStories(projectId: string): Promise<Story[]> {
    return db.select().from(stories).where(eq(stories.projectId, projectId)).orderBy(desc(stories.updatedAt));
  }

  async getStory(id: string): Promise<Story | undefined> {
    const [story] = await db.select().from(stories).where(eq(stories.id, id));
    return story;
  }

  async createStory(data: InsertStory): Promise<Story> {
    const [story] = await db.insert(stories).values(data).returning();
    return story;
  }

  async updateStory(id: string, data: Partial<InsertStory>): Promise<Story | undefined> {
    const [story] = await db
      .update(stories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stories.id, id))
      .returning();
    return story;
  }

  async deleteStory(id: string): Promise<void> {
    await db.delete(stories).where(eq(stories.id, id));
  }

  // ─── Characters ─────────────────────────────────────────

  async getCharacters(projectId: string): Promise<Character[]> {
    return db.select().from(characters).where(eq(characters.projectId, projectId)).orderBy(desc(characters.updatedAt));
  }

  async getCharacter(id: string): Promise<Character | undefined> {
    const [character] = await db.select().from(characters).where(eq(characters.id, id));
    return character;
  }

  async createCharacter(data: InsertCharacter): Promise<Character> {
    const [character] = await db.insert(characters).values(data).returning();
    return character;
  }

  async updateCharacter(id: string, data: Partial<InsertCharacter>): Promise<Character | undefined> {
    const [character] = await db
      .update(characters)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(characters.id, id))
      .returning();
    return character;
  }

  async deleteCharacter(id: string): Promise<void> {
    await db.delete(characters).where(eq(characters.id, id));
  }

  // ─── Sprite Sheets ──────────────────────────────────────

  async getSpriteSheets(projectId: string): Promise<SpriteSheet[]> {
    return db.select().from(spriteSheets).where(eq(spriteSheets.projectId, projectId)).orderBy(desc(spriteSheets.updatedAt));
  }

  async getSpriteSheet(id: string): Promise<SpriteSheet | undefined> {
    const [sheet] = await db.select().from(spriteSheets).where(eq(spriteSheets.id, id));
    return sheet;
  }

  async createSpriteSheet(data: InsertSpriteSheet): Promise<SpriteSheet> {
    const [sheet] = await db.insert(spriteSheets).values(data).returning();
    return sheet;
  }

  async updateSpriteSheet(id: string, data: Partial<InsertSpriteSheet>): Promise<SpriteSheet | undefined> {
    const [sheet] = await db
      .update(spriteSheets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(spriteSheets.id, id))
      .returning();
    return sheet;
  }

  async deleteSpriteSheet(id: string): Promise<void> {
    await db.delete(spriteSheets).where(eq(spriteSheets.id, id));
  }

  // ─── Environments ───────────────────────────────────────

  async getEnvironments(projectId: string): Promise<Environment[]> {
    return db.select().from(environments).where(eq(environments.projectId, projectId)).orderBy(desc(environments.updatedAt));
  }

  async getEnvironment(id: string): Promise<Environment | undefined> {
    const [env] = await db.select().from(environments).where(eq(environments.id, id));
    return env;
  }

  async createEnvironment(data: InsertEnvironment): Promise<Environment> {
    const [env] = await db.insert(environments).values(data).returning();
    return env;
  }

  async updateEnvironment(id: string, data: Partial<InsertEnvironment>): Promise<Environment | undefined> {
    const [env] = await db
      .update(environments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(environments.id, id))
      .returning();
    return env;
  }

  async deleteEnvironment(id: string): Promise<void> {
    await db.delete(environments).where(eq(environments.id, id));
  }

  // ─── Tilesets ───────────────────────────────────────────

  async getTilesets(environmentId: string): Promise<Tileset[]> {
    return db.select().from(tilesets).where(eq(tilesets.environmentId, environmentId));
  }

  async getTileset(id: string): Promise<Tileset | undefined> {
    const [tileset] = await db.select().from(tilesets).where(eq(tilesets.id, id));
    return tileset;
  }

  async createTileset(data: InsertTileset): Promise<Tileset> {
    const [tileset] = await db.insert(tilesets).values(data).returning();
    return tileset;
  }

  async updateTileset(id: string, data: Partial<InsertTileset>): Promise<Tileset | undefined> {
    const [tileset] = await db
      .update(tilesets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tilesets.id, id))
      .returning();
    return tileset;
  }

  async deleteTileset(id: string): Promise<void> {
    await db.delete(tilesets).where(eq(tilesets.id, id));
  }

  // ─── Environment Props ──────────────────────────────────

  async getEnvironmentProps(environmentId: string): Promise<EnvironmentProp[]> {
    return db.select().from(environmentProps).where(eq(environmentProps.environmentId, environmentId));
  }

  async getEnvironmentProp(id: string): Promise<EnvironmentProp | undefined> {
    const [prop] = await db.select().from(environmentProps).where(eq(environmentProps.id, id));
    return prop;
  }

  async createEnvironmentProp(data: InsertEnvironmentProp): Promise<EnvironmentProp> {
    const [prop] = await db.insert(environmentProps).values(data).returning();
    return prop;
  }

  async updateEnvironmentProp(id: string, data: Partial<InsertEnvironmentProp>): Promise<EnvironmentProp | undefined> {
    const [prop] = await db
      .update(environmentProps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(environmentProps.id, id))
      .returning();
    return prop;
  }

  async deleteEnvironmentProp(id: string): Promise<void> {
    await db.delete(environmentProps).where(eq(environmentProps.id, id));
  }

  // ─── Quests ─────────────────────────────────────────────

  async getQuests(projectId: string): Promise<Quest[]> {
    return db.select().from(quests).where(eq(quests.projectId, projectId)).orderBy(desc(quests.updatedAt));
  }

  async getQuest(id: string): Promise<Quest | undefined> {
    const [quest] = await db.select().from(quests).where(eq(quests.id, id));
    return quest;
  }

  async createQuest(data: InsertQuest): Promise<Quest> {
    const [quest] = await db.insert(quests).values(data).returning();
    return quest;
  }

  async updateQuest(id: string, data: Partial<InsertQuest>): Promise<Quest | undefined> {
    const [quest] = await db
      .update(quests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(quests.id, id))
      .returning();
    return quest;
  }

  async deleteQuest(id: string): Promise<void> {
    await db.delete(quests).where(eq(quests.id, id));
  }

  // ─── Uploads ────────────────────────────────────────────

  async getUploads(projectId: string): Promise<Upload[]> {
    return db.select().from(uploads).where(eq(uploads.projectId, projectId)).orderBy(desc(uploads.createdAt));
  }

  async getUpload(id: string): Promise<Upload | undefined> {
    const [upload] = await db.select().from(uploads).where(eq(uploads.id, id));
    return upload;
  }

  async createUpload(data: InsertUpload): Promise<Upload> {
    const [upload] = await db.insert(uploads).values(data).returning();
    return upload;
  }

  async updateUpload(id: string, data: Partial<InsertUpload>): Promise<Upload | undefined> {
    const [upload] = await db
      .update(uploads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(uploads.id, id))
      .returning();
    return upload;
  }

  async deleteUpload(id: string): Promise<void> {
    await db.delete(uploads).where(eq(uploads.id, id));
  }

  async getUploadsByStatus(status: string, limit?: number): Promise<Upload[]> {
    const query = db
      .select()
      .from(uploads)
      .where(eq(uploads.status, status))
      .orderBy(asc(uploads.createdAt));
    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async transitionUploadStatus(id: string, fromStatus: string, toStatus: string): Promise<boolean> {
    const result = await db
      .update(uploads)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(eq(uploads.id, id), eq(uploads.status, fromStatus)))
      .returning();
    return result.length > 0;
  }

  async updateUploadAnalysis(id: string, data: UploadAnalysisData): Promise<Upload | undefined> {
    const [upload] = await db
      .update(uploads)
      .set({
        status: data.status,
        analysisResult: data.analysisResult,
        extractedStyle: data.extractedStyle,
        extractedPalette: data.extractedPalette,
        extractedProportions: data.extractedProportions,
        extractedPose: data.extractedPose,
        updatedAt: new Date(),
      })
      .where(eq(uploads.id, id))
      .returning();
    return upload;
  }

  // ─── Vision Pipeline ────────────────────────────────────

  async getUploadsPendingAnalysis(): Promise<Upload[]> {
    return db
      .select()
      .from(uploads)
      .where(eq(uploads.status, "uploaded"))
      .orderBy(asc(uploads.createdAt))
      .limit(10);
  }

  async updateUploadStatus(id: string, status: string): Promise<Upload | undefined> {
    const [upload] = await db
      .update(uploads)
      .set({ status, updatedAt: new Date() })
      .where(eq(uploads.id, id))
      .returning();
    return upload;
  }

  async storeVisionAnalysisResults(id: string, data: VisionAnalysisFields): Promise<Upload | undefined> {
    const [upload] = await db
      .update(uploads)
      .set({
        analysisResult: data.analysisResult,
        extractedStyle: data.extractedStyle,
        extractedPalette: data.extractedPalette,
        extractedProportions: data.extractedProportions,
        extractedPose: data.extractedPose,
        status: "analyzed",
        updatedAt: new Date(),
      })
      .where(eq(uploads.id, id))
      .returning();
    return upload;
  }

  async markUploadFailed(id: string, errorInfo: Record<string, any>): Promise<Upload | undefined> {
    const [upload] = await db
      .update(uploads)
      .set({
        status: "failed",
        analysisResult: errorInfo,
        updatedAt: new Date(),
      })
      .where(eq(uploads.id, id))
      .returning();
    return upload;
  }

  // ─── Exports ────────────────────────────────────────────

  async getExports(projectId: string): Promise<Export[]> {
    return db.select().from(projectExports).where(eq(projectExports.projectId, projectId)).orderBy(desc(projectExports.createdAt));
  }

  async getExport(id: string): Promise<Export | undefined> {
    const [exp] = await db.select().from(projectExports).where(eq(projectExports.id, id));
    return exp;
  }

  async createExport(data: InsertExport): Promise<Export> {
    const [exp] = await db.insert(projectExports).values(data).returning();
    return exp;
  }

  async updateExport(id: string, data: Partial<InsertExport>): Promise<Export | undefined> {
    const [exp] = await db
      .update(projectExports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectExports.id, id))
      .returning();
    return exp;
  }

  async getExportsByProject(projectId: string): Promise<Export[]> {
    return db.select().from(projectExports).where(eq(projectExports.projectId, projectId)).orderBy(desc(projectExports.createdAt));
  }

  async updateExportStatus(id: string, status: string, fileUrl?: string): Promise<Export> {
    const updateData: any = { status, updatedAt: new Date() };
    if (fileUrl) updateData.fileUrl = fileUrl;
    const [exp] = await db
      .update(projectExports)
      .set(updateData)
      .where(eq(projectExports.id, id))
      .returning();
    return exp;
  }

  // ─── Agent Runs ─────────────────────────────────────────

  async getAgentRun(id: string): Promise<AgentRun | undefined> {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id));
    return run;
  }

  async getAgentRuns(projectId: string): Promise<AgentRun[]> {
    return db.select().from(agentRuns).where(eq(agentRuns.projectId, projectId)).orderBy(desc(agentRuns.createdAt));
  }

  async createAgentRun(data: InsertAgentRun): Promise<AgentRun> {
    const [run] = await db.insert(agentRuns).values(data).returning();
    return run;
  }

  async updateAgentRun(id: string, data: Partial<InsertAgentRun>): Promise<AgentRun | undefined> {
    const [run] = await db
      .update(agentRuns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentRuns.id, id))
      .returning();
    return run;
  }

  // ─── Export Helper ──────────────────────────────────────

  async getProjectAssetsForExport(projectId: string): Promise<ProjectAssetsForExport> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const [chars, sheets, anims, envs, tiles, props, stors] = await Promise.all([
      this.getCharacters(projectId),
      this.getSpriteSheets(projectId),
      this.getAnimations(projectId),
      this.getEnvironments(projectId),
      db.select().from(tilesets).where(eq(tilesets.projectId, projectId)),
      db.select().from(environmentProps).where(eq(environmentProps.projectId, projectId)),
      this.getStories(projectId),
    ]);

    return {
      project,
      characters: chars,
      spriteSheets: sheets,
      animations: anims,
      environments: envs,
      tilesets: tiles,
      environmentProps: props,
      stories: stors,
    };
  }

  // ─── Asset Counts ───────────────────────────────────────

  async getAssetCounts(projectId: string): Promise<AssetCounts> {
    const [spriteCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(spriteSheets)
      .where(eq(spriteSheets.projectId, projectId));

    const [animCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(animations)
      .where(eq(animations.projectId, projectId));

    const [tilesetCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tilesets)
      .where(eq(tilesets.projectId, projectId));

    const [envCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(environments)
      .where(eq(environments.projectId, projectId));

    return {
      sprites: Number(spriteCount?.count ?? 0),
      animations: Number(animCount?.count ?? 0),
      tilesets: Number(tilesetCount?.count ?? 0),
      environments: Number(envCount?.count ?? 0),
    };
  }

  // ─── Agent Teams ────────────────────────────────────────

  async getAgentTeams(userId: string): Promise<AgentTeam[]> {
    return db.select().from(agentTeams).where(eq(agentTeams.userId, userId)).orderBy(desc(agentTeams.createdAt));
  }

  async getAllAgentTeams(): Promise<AgentTeam[]> {
    return db.select().from(agentTeams).orderBy(desc(agentTeams.createdAt));
  }

  async getAgentTeam(id: string): Promise<AgentTeam | undefined> {
    const [team] = await db.select().from(agentTeams).where(eq(agentTeams.id, id));
    return team;
  }

  async createAgentTeam(data: InsertAgentTeam): Promise<AgentTeam> {
    const [team] = await db.insert(agentTeams).values(data).returning();
    return team;
  }

  async updateAgentTeam(id: string, data: Partial<AgentTeam>): Promise<AgentTeam | undefined> {
    const [team] = await db.update(agentTeams).set(data).where(eq(agentTeams.id, id)).returning();
    return team;
  }

  async disbandAgentTeam(id: string): Promise<AgentTeam | undefined> {
    const [team] = await db
      .update(agentTeams)
      .set({ status: "disbanded", disbandedAt: new Date() })
      .where(eq(agentTeams.id, id))
      .returning();
    return team;
  }

  async getAgentTeamMembers(teamId: string): Promise<AgentTeamMember[]> {
    return db.select().from(agentTeamMembers).where(eq(agentTeamMembers.teamId, teamId)).orderBy(asc(agentTeamMembers.createdAt));
  }

  async getAgentTeamMember(id: string): Promise<AgentTeamMember | undefined> {
    const [member] = await db.select().from(agentTeamMembers).where(eq(agentTeamMembers.id, id));
    return member;
  }

  async createAgentTeamMember(data: InsertAgentTeamMember): Promise<AgentTeamMember> {
    const [member] = await db.insert(agentTeamMembers).values(data).returning();
    return member;
  }

  async updateAgentTeamMember(id: string, data: Partial<AgentTeamMember>): Promise<AgentTeamMember | undefined> {
    const [member] = await db.update(agentTeamMembers).set(data).where(eq(agentTeamMembers.id, id)).returning();
    return member;
  }

  async getCharacterWithContext(characterId: string): Promise<{ character: Character; styleGuide: Record<string, any> | null; researchBible: Record<string, any> | null } | undefined> {
    const [character] = await db.select().from(characters).where(eq(characters.id, characterId));
    if (!character) return undefined;
    const [project] = await db.select().from(projects).where(eq(projects.id, character.projectId));
    return {
      character,
      styleGuide: (project?.styleGuide as Record<string, any> | null) ?? null,
      researchBible: (project?.researchBible as Record<string, any> | null) ?? null,
    };
  }

  async updateCharacterMotionProfile(characterId: string, motionProfile: Record<string, any>): Promise<Character | undefined> {
    const [character] = await db
      .update(characters)
      .set({ motionProfile, updatedAt: new Date() })
      .where(eq(characters.id, characterId))
      .returning();
    return character;
  }

  async createAnimationBatch(animationBatch: InsertAnimation[]): Promise<Animation[]> {
    if (animationBatch.length === 0) return [];
    return db.insert(animations).values(animationBatch).returning();
  }

  async getCharactersNeedingSprites(projectId: string): Promise<Character[]> {
    const projectCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId));
    const sheets = await db.select().from(spriteSheets).where(eq(spriteSheets.projectId, projectId));
    const characterIdsWithSprites = new Set(sheets.map(s => s.characterId));
    return projectCharacters.filter(c => !characterIdsWithSprites.has(c.id));
  }

  async recordAgentRun(data: InsertAgentRun & { id?: string }): Promise<AgentRun> {
    if (data.id) {
      const [updated] = await db
        .update(agentRuns)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agentRuns.id, data.id))
        .returning();
      if (updated) return updated;
    }
    const { id: _id, ...insertData } = data;
    const [run] = await db.insert(agentRuns).values(insertData).returning();
    return run;
  }
}

export const storage = new DatabaseStorage();