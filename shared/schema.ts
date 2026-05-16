import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Prompt Injection Patterns ────────────────────────────

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+all\s+previous/i,
  /ignore\s+above\s+instructions/i,
  /disregard\s+previous/i,
  /forget\s+previous/i,
  /override\s+previous/i,
  /you\s+are\s+now/i,
  /new\s+instructions:/i,
  /SYSTEM\s*:/i,
  /ADMIN\s*:/i,
  /SYSTEM\s+OVERRIDE/i,
  /\bdo\s+not\s+follow\b.*\binstructions\b/i,
  /\bact\s+as\b.*\badmin\b/i,
];

// ─── Validation Schemas ───────────────────────────────────

/**
 * Zod schema for the research_bible JSONB structure.
 * This is the shared context that downstream agents read.
 */
export const ResearchBibleSchema = z.object({
  genre: z.string().optional(),
  subGenre: z.string().optional(),
  themes: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  artDirection: z.object({
    style: z.string().optional(),
    colorPalette: z.array(z.string()).optional(),
    references: z.array(z.string()).optional(),
    mood: z.string().optional(),
  }).optional(),
  mechanics: z.object({
    core: z.array(z.string()).optional(),
    secondary: z.array(z.string()).optional(),
    inspirations: z.array(z.string()).optional(),
  }).optional(),
  narrativeFramework: z.object({
    tone: z.string().optional(),
    perspective: z.string().optional(),
    worldBuilding: z.string().optional(),
    storyStructure: z.string().optional(),
  }).optional(),
  technicalConstraints: z.object({
    engine: z.string().optional(),
    platform: z.string().optional(),
    resolution: z.string().optional(),
    performanceBudget: z.string().optional(),
  }).optional(),
  competitiveAnalysis: z.array(z.object({
    title: z.string(),
    relevance: z.string().optional(),
    takeaways: z.array(z.string()).optional(),
  })).optional(),
  generatedAt: z.string().optional(),
  version: z.number().optional(),
});

/**
 * Zod schema that sanitizes and validates game_concept text inputs.
 * Strips control characters, enforces max length, and rejects prompt injection.
 */
export const GameConceptInputSchema = z
  .string()
  .max(2000, "Game concept must be 2000 characters or fewer")
  .transform((val) => {
    // Strip control characters (keep newlines and tabs for readability)
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  })
  .refine(
    (val) => {
      return !PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(val));
    },
    {
      message:
        "Input contains disallowed patterns. Please describe your game concept without system-level directives.",
    }
  );

/**
 * Zod schema for Phaser 3 animation configuration.
 * Stored in sprite_sheets.phaser_config for explicit Phaser export settings.
 */
export const PhaserAnimConfigSchema = z.object({
  frameRate: z.number().min(1).max(120).default(12),
  repeat: z.number().int().min(-1).default(-1), // -1 = infinite loop
  yoyo: z.boolean().default(false),
  delay: z.number().min(0).default(0),
  hideOnComplete: z.boolean().default(false),
});

/**
 * Zod schema for character motion profiles.
 * Stored in characters.motion_profile for animation generation guidance.
 */
export const MotionProfileSchema = z.object({
  locomotionType: z.enum(["bipedal", "quadrupedal", "flying", "swimming", "slithering", "rolling", "hovering"]),
  gaitCycle: z.enum(["walk", "run", "sprint", "sneak", "limp", "bounce", "glide", "custom"]),
  weightClass: z.enum(["featherweight", "light", "medium", "heavy", "massive"]),
  anticipationFrames: z.number().int().min(0).max(30).default(2),
  followThroughFrames: z.number().int().min(0).max(30).default(3),
  squashStretchFactor: z.number().min(0).max(2).default(0.5),
});

// ─── Inferred Types from Validation Schemas ───────────────

export type ResearchBible = z.infer<typeof ResearchBibleSchema>;
export type GameConceptInput = z.infer<typeof GameConceptInputSchema>;
export type PhaserAnimConfig = z.infer<typeof PhaserAnimConfigSchema>;
export type MotionProfile = z.infer<typeof MotionProfileSchema>;

// ─── Tables ───────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id"),
  name: text("name").notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  gameType: text("game_type"),
  gameContext: text("game_context"),
  pov: text("pov").default("Side-Scrolling"),
  movementStyle: text("movement_style").default("Fluid & Bouncy"),
  characterImage: text("character_image"),
  researchBible: jsonb("research_bible"),
  styleGuide: jsonb("style_guide"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const animations = pgTable("animations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  characterId: varchar("character_id").references(() => characters.id),
  characterName: text("character_name").default("player"),
  name: text("name").notNull(),
  animationKey: text("animation_key"),
  prefix: text("prefix"),
  fps: integer("fps").default(12),
  frameCount: integer("frame_count").default(8),
  loop: boolean("loop").default(true),
  priority: text("priority").default("CORE"),
  atlasKey: text("atlas_key"),
  keyframes: jsonb("keyframes").$type<Record<string, any>[]>().default([]),
  sortOrder: integer("sort_order").default(0),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: text("role").default("user").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stories = pgTable("stories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary"),
  acts: jsonb("acts"),
  chapters: jsonb("chapters"),
  branchingPoints: jsonb("branching_points"),
  characterRelationshipWeb: jsonb("character_relationship_web"),
  worldLore: jsonb("world_lore"),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const characters = pgTable("characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyId: varchar("story_id").references(() => stories.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  backstory: text("backstory"),
  personalityProfile: text("personality_profile"),
  physicalDescription: text("physical_description"),
  visualDescription: jsonb("visual_description"),
  colorPalette: jsonb("color_palette"),
  animationStates: text("animation_states").array(),
  motionProfile: jsonb("motion_profile"),
  dialogueTree: jsonb("dialogue_tree"),
  designNotes: text("design_notes"),
  status: text("status").default("draft").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const spriteSheets = pgTable("sprite_sheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  characterId: varchar("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  atlasJsonUrl: text("atlas_json_url"),
  frameWidth: integer("frame_width").notNull(),
  frameHeight: integer("frame_height").notNull(),
  frameCount: integer("frame_count").notNull(),
  animationState: text("animation_state").notNull(),
  frameRate: integer("frame_rate").default(12),
  loop: boolean("loop").default(true),
  metadata: jsonb("metadata"),
  phaserConfig: jsonb("phaser_config"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const environments = pgTable("environments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  zoneType: text("zone_type"),
  description: text("description"),
  mood: text("mood"),
  lightingDirection: text("lighting_direction"),
  colorPalette: jsonb("color_palette"),
  atmosphericEffects: jsonb("atmospheric_effects"),
  layoutBlueprint: jsonb("layout_blueprint"),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tilesets = pgTable("tilesets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  environmentId: varchar("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileUrl: text("file_url").notNull(),
  tileWidth: integer("tile_width").notNull(),
  tileHeight: integer("tile_height").notNull(),
  tileCount: integer("tile_count").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const environmentProps = pgTable("environment_props", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  environmentId: varchar("environment_id").notNull().references(() => environments.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  propType: text("prop_type").notNull(),
  spriteUrl: text("sprite_url"),
  phaserMetadata: jsonb("phaser_metadata"),
  position: jsonb("position"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quests = pgTable("quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  storyId: varchar("story_id").references(() => stories.id),
  title: text("title").notNull(),
  questType: text("quest_type").notNull(),
  description: text("description"),
  objectives: jsonb("objectives"),
  rewards: jsonb("rewards"),
  failureStates: jsonb("failure_states"),
  narrativeHooks: text("narrative_hooks"),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Uploads table — stores user-uploaded reference images and their Vision AI analysis.
 *
 * Status field state machine (text column, valid values):
 *   'uploaded'  → Initial state when file is stored. No analysis yet.
 *   'analyzing' → Vision AI analysis is in progress.
 *   'analyzed'  → Analysis complete. JSONB result columns are populated.
 *   'failed'    → Analysis failed. Check agent_runs for error details.
 *
 * Transitions:
 *   uploaded → analyzing → analyzed
 *                        → failed
 *   failed → analyzing (retry)
 */
export const uploads = pgTable("uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  /** Full structured output from Vision AI analysis */
  analysisResult: jsonb("analysis_result"),
  /** Extracted art style descriptors (e.g. pixel-art, hand-drawn, cel-shaded) */
  extractedStyle: jsonb("extracted_style"),
  /** Extracted color palette as hex values and descriptors */
  extractedPalette: jsonb("extracted_palette"),
  /** Extracted body/sprite proportions (e.g. head-to-body ratio, limb lengths) */
  extractedProportions: jsonb("extracted_proportions"),
  /** Extracted pose/stance information for animation reference */
  extractedPose: jsonb("extracted_pose"),
  /** Status: 'uploaded' | 'analyzing' | 'analyzed' | 'failed' — see state machine above */
  status: text("status").default("uploaded").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projectExports = pgTable("exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  exportType: text("export_type").notNull(),
  fileUrl: text("file_url"),
  includesGdd: boolean("includes_gdd").default(false),
  includesPhaserBoilerplate: boolean("includes_phaser_boilerplate").default(true),
  status: text("status").default("queued").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentRuns = pgTable("agent_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  agentType: text("agent_type").notNull(),
  inputContext: jsonb("input_context"),
  outputResult: jsonb("output_result"),
  status: text("status").default("queued").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Agent Team Tables ────────────────────────────────────

/**
 * agentTeams — top-level container for a named Claude agent team assembled for a specific build goal.
 *
 * Status state machine:
 *   'assembling' → Claude is generating the role roster.
 *   'running'    → Agents are executing work.
 *   'validating' → End-of-build validation in progress.
 *   'disbanded'  → Team completed and archived.
 *   'failed'     → Team encountered a fatal error.
 */
export const agentTeams = pgTable("agent_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  goal: text("goal").notNull(),
  status: text("status").default("assembling").notNull(),
  roles: jsonb("roles").$type<Array<{ name: string; description: string }>>().default([]),
  validationResult: jsonb("validation_result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  disbandedAt: timestamp("disbanded_at"),
});

/**
 * agentTeamMembers — individual agent in a team.
 *
 * Status state machine:
 *   'pending'    → Waiting for earlier agents to finish.
 *   'running'    → Currently executing work.
 *   'done'       → Finished successfully.
 *   'failed'     → Encountered an error.
 */
export const agentTeamMembers = pgTable("agent_team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => agentTeams.id, { onDelete: "cascade" }),
  roleName: text("role_name").notNull(),
  roleDescription: text("role_description"),
  modelUsed: text("model_used"),
  status: text("status").default("pending").notNull(),
  outputLog: text("output_log"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentTeamSchema = createInsertSchema(agentTeams).omit({ id: true, createdAt: true, disbandedAt: true });
export const insertAgentTeamMemberSchema = createInsertSchema(agentTeamMembers).omit({ id: true, createdAt: true });

export type AgentTeam = typeof agentTeams.$inferSelect;
export type InsertAgentTeam = z.infer<typeof insertAgentTeamSchema>;
export type AgentTeamMember = typeof agentTeamMembers.$inferSelect;
export type InsertAgentTeamMember = z.infer<typeof insertAgentTeamMemberSchema>;

// ─── Insert Schemas ───────────────────────────────────────

// ─── Chat Tables (Sneebly conversation history) ───────────

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── Insert Schemas ───────────────────────────────────────

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnimationSchema = createInsertSchema(animations).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStorySchema = createInsertSchema(stories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCharacterSchema = createInsertSchema(characters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpriteSheetSchema = createInsertSchema(spriteSheets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEnvironmentSchema = createInsertSchema(environments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTilesetSchema = createInsertSchema(tilesets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEnvironmentPropSchema = createInsertSchema(environmentProps).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestSchema = createInsertSchema(quests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUploadSchema = createInsertSchema(uploads).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExportSchema = createInsertSchema(projectExports).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAgentRunSchema = createInsertSchema(agentRuns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true, updatedAt: true });

// ─── Inferred Types ───────────────────────────────────────

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type Animation = typeof animations.$inferSelect;
export type InsertAnimation = typeof animations.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Story = typeof stories.$inferSelect;
export type InsertStory = typeof stories.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;
export type SpriteSheet = typeof spriteSheets.$inferSelect;
export type InsertSpriteSheet = typeof spriteSheets.$inferInsert;
export type Environment = typeof environments.$inferSelect;
export type InsertEnvironment = typeof environments.$inferInsert;
export type Tileset = typeof tilesets.$inferSelect;
export type InsertTileset = typeof tilesets.$inferInsert;
export type EnvironmentProp = typeof environmentProps.$inferSelect;
export type InsertEnvironmentProp = typeof environmentProps.$inferInsert;
export type Quest = typeof quests.$inferSelect;
export type InsertQuest = typeof quests.$inferInsert;
export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;
export type Export = typeof projectExports.$inferSelect;
export type InsertExport = typeof projectExports.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
