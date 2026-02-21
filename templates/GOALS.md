# GOALS.md — Sneebly North Star

## Mission

AnimAItion.tools is an AI-native game asset studio that transforms a single game idea into a complete library of production-ready game components for Phaser 3. It targets indie game developers and solo creators who lack large art/writing teams, solving the problem of the thousands of hours of production labor between a great idea and a playable prototype. The platform uses a coordinated multi-agent AI system — the Player Agent — to research game genres, generate narratives, design characters, produce sprite animations with biomechanical accuracy, build tilesets and environments, and export everything as ready-to-use Phaser 3 code bundles.

## Architecture Context

- **Framework**: Express 5 + React 18 (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM, Zod validation schemas
- **Auth**: Clerk OAuth (Google/GitHub)
- **Hosting**: Replit
- **Key Integrations**: Google Gemini API, Anthropic Claude API (via Replit AI Integrations), Phaser 3 engine (in-browser preview + export), Sneebly autonomous agent
- **Package Manager**: npm
- **Language**: TypeScript
- **CSS/Styling**: Tailwind CSS v4, Shadcn/UI, Framer Motion
- **State Management**: React Query <!-- ASSUMPTION: Not explicitly stated in spec; React Query assumed for server-state given Express API backend -->
- **Routing**: React Router <!-- ASSUMPTION: Not explicitly stated; assumed given React 18 SPA with Express backend -->

## Current Mode

**mode: auto**

## Current Phase

**phase: 1**

-----

## App Specification

### Data Models

#### users
- id (UUID, primary key, auto-generated)
- clerk_id (string, required, unique, indexed)
- email (string, required, unique)
- name (string, nullable)
- avatar_url (string, nullable)
- role (enum: user|admin, default: user)
- is_active (boolean, default: true)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### projects
- id (UUID, primary key, auto-generated)
- user_id (UUID, required, FK → users, indexed)
- name (string, required)
- description (text, nullable)
- game_concept (text, nullable)
- genre (string, nullable)
- status (enum: draft|researching|generating|complete|archived, default: draft)
- research_bible (jsonb, nullable)
- style_guide (jsonb, nullable)
- settings (jsonb, nullable)
- is_active (boolean, default: true)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### stories
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- title (string, required)
- summary (text, nullable)
- acts (jsonb, nullable)
- chapters (jsonb, nullable)
- branching_points (jsonb, nullable)
- character_relationship_web (jsonb, nullable)
- world_lore (jsonb, nullable)
- status (enum: draft|generating|complete, default: draft)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### characters
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- story_id (UUID, nullable, FK → stories)
- name (string, required)
- role (enum: protagonist|npc|enemy|boss|supporting, required)
- backstory (text, nullable)
- personality_profile (text, nullable)
- physical_description (text, nullable)
- visual_description (jsonb, nullable)
- color_palette (jsonb, nullable)
- animation_states (array of string, nullable)
- motion_profile (jsonb, nullable)
- dialogue_tree (jsonb, nullable)
- design_notes (text, nullable)
- status (enum: draft|generating|sprites_ready|animated|complete, default: draft)
- is_active (boolean, default: true)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### sprite_sheets
- id (UUID, primary key, auto-generated)
- character_id (UUID, required, FK → characters, indexed)
- project_id (UUID, required, FK → projects, indexed)
- file_url (string, required)
- atlas_json_url (string, nullable)
- frame_width (integer, required)
- frame_height (integer, required)
- frame_count (integer, required)
- animation_state (string, required)
- frame_rate (integer, default: 12)
- loop (boolean, default: true)
- metadata (jsonb, nullable)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### animations
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- character_id (UUID, required, FK → characters, indexed)
- sprite_sheet_id (UUID, required, FK → sprite_sheets)
- name (string, required)
- state (string, required)
- frame_start (integer, required)
- frame_end (integer, required)
- frame_rate (integer, default: 12)
- loop (boolean, default: true)
- phaser_config (jsonb, nullable)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### environments
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- name (string, required)
- zone_type (string, nullable)
- description (text, nullable)
- mood (string, nullable)
- lighting_direction (string, nullable)
- color_palette (jsonb, nullable)
- atmospheric_effects (jsonb, nullable)
- layout_blueprint (jsonb, nullable)
- status (enum: draft|generating|complete, default: draft)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### tilesets
- id (UUID, primary key, auto-generated)
- environment_id (UUID, required, FK → environments, indexed)
- project_id (UUID, required, FK → projects, indexed)
- name (string, required)
- file_url (string, required)
- tile_width (integer, required)
- tile_height (integer, required)
- tile_count (integer, required)
- metadata (jsonb, nullable)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### environment_props
- id (UUID, primary key, auto-generated)
- environment_id (UUID, required, FK → environments, indexed)
- project_id (UUID, required, FK → projects, indexed)
- name (string, required)
- prop_type (enum: interactive|decorative|light_source|spawn_point|trigger, required)
- sprite_url (string, nullable)
- phaser_metadata (jsonb, nullable)
- position (jsonb, nullable)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### quests
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- story_id (UUID, nullable, FK → stories)
- title (string, required)
- quest_type (enum: main|side|fetch|escort|boss, required)
- description (text, nullable)
- objectives (jsonb, nullable)
- rewards (jsonb, nullable)
- failure_states (jsonb, nullable)
- narrative_hooks (text, nullable)
- status (enum: draft|complete, default: draft)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### uploads
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- user_id (UUID, required, FK → users, indexed)
- file_url (string, required)
- file_type (enum: character_image|scene_image|reference|other, required)
- original_filename (string, required)
- analysis_result (jsonb, nullable)
- extracted_style (jsonb, nullable)
- extracted_palette (jsonb, nullable)
- extracted_proportions (jsonb, nullable)
- extracted_pose (jsonb, nullable)
- status (enum: uploaded|analyzing|analyzed|failed, default: uploaded)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### exports
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- user_id (UUID, required, FK → users, indexed)
- export_type (enum: full_bundle|sprites_only|tilemaps_only|gdd_only|code_only, required)
- file_url (string, nullable)
- includes_gdd (boolean, default: false)
- includes_phaser_boilerplate (boolean, default: true)
- status (enum: queued|generating|complete|failed, default: queued)
- metadata (jsonb, nullable)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

#### agent_runs
- id (UUID, primary key, auto-generated)
- project_id (UUID, required, FK → projects, indexed)
- agent_type (enum: player|story|art_director|character|world_builder|export|motion|vision, required)
- input_context (jsonb, nullable)
- output_result (jsonb, nullable)
- status (enum: queued|running|complete|failed, default: queued)
- started_at (timestamp, nullable)
- completed_at (timestamp, nullable)
- error_message (text, nullable)
- duration_ms (integer, nullable)
- created_at (timestamp, auto-generated)
- updated_at (timestamp, auto-generated)

**Relationships**:
- users → projects: one-to-many (user_id)
- projects → stories: one-to-many (project_id)
- projects → characters: one-to-many (project_id)
- projects → environments: one-to-many (project_id)
- projects → quests: one-to-many (project_id)
- projects → uploads: one-to-many (project_id)
- projects → exports: one-to-many (project_id)
- projects → agent_runs: one-to-many (project_id)
- characters → sprite_sheets: one-to-many (character_id)
- characters → animations: one-to-many (character_id)
- sprite_sheets → animations: one-to-many (sprite_sheet_id)
- environments → tilesets: one-to-many (environment_id)
- environments → environment_props: one-to-many (environment_id)
- stories → characters: one-to-many (story_id, nullable)
- stories → quests: one-to-many (story_id, nullable)

**Indexes**:
- projects: index on (user_id, status) — filter user's projects by status
- characters: index on (project_id, role) — filter characters by role
- agent_runs: index on (project_id, agent_type, status) — track agent pipeline progress
- uploads: index on (project_id, file_type) — filter uploads by type
- sprite_sheets: index on (character_id, animation_state) — lookup specific animation sprites

### API Endpoints

#### Health
- **GET /health** — Health check
  - Auth: public
  - Response: { success: true, status: "ok", timestamp: string }

#### Users
- **POST /api/users** — Create or sync user from Clerk webhook
  - Auth: webhook-verified
  - Request body: { clerk_id: string, email: string, name?: string, avatar_url?: string }
  - Response: { success: true, data: User }

- **GET /api/users/me** — Get current authenticated user profile
  - Auth: required
  - Response: { success: true, data: User }

- **PUT /api/users/me** — Update current user profile
  - Auth: required
  - Request body: { name?: string, avatar_url?: string }
  - Response: { success: true, data: User }

#### Projects
- **POST /api/projects** — Create a new project
  - Auth: required
  - Request body: { name: string, description?: string, game_concept?: string, genre?: string }
  - Response: { success: true, data: Project }
  - Notes: Sets status to "draft". Associates with authenticated user.

- **GET /api/projects** — List current user's projects
  - Auth: required
  - Query params: ?page=number&limit=number&status=string&search=string
  - Response: { success: true, data: Project[], pagination: { page, limit, total } }

- **GET /api/projects/:id** — Get project by ID
  - Auth: owner-only
  - Response: { success: true, data: Project }

- **PUT /api/projects/:id** — Update project
  - Auth: owner-only
  - Request body: { name?: string, description?: string, game_concept?: string, genre?: string, settings?: object }
  - Response: { success: true, data: Project }

- **POST /api/projects/:id/duplicate** — Duplicate a project
  - Auth: owner-only
  - Response: { success: true, data: Project }
  - Notes: Deep-copies project and all child entities (stories, characters, etc.)

- **DELETE /api/projects/:id** — Soft-delete project
  - Auth: owner-only
  - Response: { success: true }
  - Notes: Sets is_active=false on project and all child entities.

#### Stories
- **POST /api/projects/:projectId/stories** — Create a story for a project
  - Auth: owner-only
  - Request body: { title: string, summary?: string }
  - Response: { success: true, data: Story }

- **GET /api/projects/:projectId/stories** — List stories for a project
  - Auth: owner-only
  - Query params: ?page=number&limit=number
  - Response: { success: true, data: Story[], pagination: { page, limit, total } }

- **GET /api/projects/:projectId/stories/:id** — Get story by ID
  - Auth: owner-only
  - Response: { success: true, data: Story }

- **PUT /api/projects/:projectId/stories/:id** — Update story
  - Auth: owner-only
  - Request body: { title?: string, summary?: string, acts?: object, chapters?: object, branching_points?: object, character_relationship_web?: object, world_lore?: object }
  - Response: { success: true, data: Story }

- **DELETE /api/projects/:projectId/stories/:id** — Delete story
  - Auth: owner-only
  - Response: { success: true }

#### Characters
- **POST /api/projects/:projectId/characters** — Create a character
  - Auth: owner-only
  - Request body: { name: string, role: string, backstory?: string, physical_description?: string, animation_states?: string[] }
  - Response: { success: true, data: Character }

- **GET /api/projects/:projectId/characters** — List characters for a project
  - Auth: owner-only
  - Query params: ?page=number&limit=number&role=string
  - Response: { success: true, data: Character[], pagination: { page, limit, total } }

- **GET /api/projects/:projectId/characters/:id** — Get character by ID
  - Auth: owner-only
  - Response: { success: true, data: Character }
  - Notes: Includes related sprite_sheets and animations.

- **PUT /api/projects/:projectId/characters/:id** — Update character
  - Auth: owner-only
  - Request body: { name?: string, role?: string, backstory?: string, physical_description?: string, animation_states?: string[], dialogue_tree?: object }
  - Response: { success: true, data: Character }

- **DELETE /api/projects/:projectId/characters/:id** — Soft-delete character
  - Auth: owner-only
  - Response: { success: true }

#### Sprite Sheets
- **POST /api/projects/:projectId/characters/:characterId/sprite-sheets** — Create a sprite sheet
  - Auth: owner-only
  - Request body: { file_url: string, frame_width: number, frame_height: number, frame_count: number, animation_state: string, frame_rate?: number }
  - Response: { success: true, data: SpriteSheet }

- **GET /api/projects/:projectId/characters/:characterId/sprite-sheets** — List sprite sheets for a character
  - Auth: owner-only
  - Response: { success: true, data: SpriteSheet[] }

- **DELETE /api/projects/:projectId/characters/:characterId/sprite-sheets/:id** — Delete sprite sheet
  - Auth: owner-only
  - Response: { success: true }

#### Animations
- **POST /api/projects/:projectId/animations** — Create an animation definition
  - Auth: owner-only
  - Request body: { character_id: UUID, sprite_sheet_id: UUID, name: string, state: string, frame_start: number, frame_end: number, frame_rate?: number, loop?: boolean }
  - Response: { success: true, data: Animation }

- **GET /api/projects/:projectId/animations** — List animations for a project
  - Auth: owner-only
  - Query params: ?character_id=UUID
  - Response: { success: true, data: Animation[] }

- **GET /api/projects/:projectId/animations/:id** — Get animation by ID
  - Auth: owner-only
  - Response: { success: true, data: Animation }

- **PUT /api/projects/:projectId/animations/:id** — Update animation
  - Auth: owner-only
  - Request body: { name?: string, frame_start?: number, frame_end?: number, frame_rate?: number, loop?: boolean }
  - Response: { success: true, data: Animation }

- **DELETE /api/projects/:projectId/animations/:id** — Delete animation
  - Auth: owner-only
  - Response: { success: true }

#### Environments
- **POST /api/projects/:projectId/environments** — Create an environment
  - Auth: owner-only
  - Request body: { name: string, zone_type?: string, description?: string, mood?: string }
  - Response: { success: true, data: Environment }

- **GET /api/projects/:projectId/environments** — List environments for a project
  - Auth: owner-only
  - Query params: ?page=number&limit=number
  - Response: { success: true, data: Environment[], pagination: { page, limit, total } }

- **GET /api/projects/:projectId/environments/:id** — Get environment by ID
  - Auth: owner-only
  - Response: { success: true, data: Environment }
  - Notes: Includes related tilesets and props.

- **PUT /api/projects/:projectId/environments/:id** — Update environment
  - Auth: owner-only
  - Request body: { name?: string, zone_type?: string, description?: string, mood?: string, color_palette?: object, atmospheric_effects?: object, layout_blueprint?: object }
  - Response: { success: true, data: Environment }

- **DELETE /api/projects/:projectId/environments/:id** — Delete environment
  - Auth: owner-only
  - Response: { success: true }

#### Tilesets
- **POST /api/projects/:projectId/environments/:environmentId/tilesets** — Create a tileset
  - Auth: owner-only
  - Request body: { name: string, file_url: string, tile_width: number, tile_height: number, tile_count: number }
  - Response: { success: true, data: Tileset }

- **GET /api/projects/:projectId/environments/:environmentId/tilesets** — List tilesets
  - Auth: owner-only
  - Response: { success: true, data: Tileset[] }

- **DELETE /api/projects/:projectId/environments/:environmentId/tilesets/:id** — Delete tileset
  - Auth: owner-only
  - Response: { success: true }

#### Quests
- **POST /api/projects/:projectId/quests** — Create a quest
  - Auth: owner-only
  - Request body: { title: string, quest_type: string, description?: string, objectives?: object, rewards?: object }
  - Response: { success: true, data: Quest }

- **GET /api/projects/:projectId/quests** — List quests for a project
  - Auth: owner-only
  - Query params: ?page=number&limit=number&quest_type=string
  - Response: { success: true, data: Quest[], pagination: { page, limit, total } }

- **GET /api/projects/:projectId/quests/:id** — Get quest by ID
  - Auth: owner-only
  - Response: { success: true, data: Quest }

- **PUT /api/projects/:projectId/quests/:id** — Update quest
  - Auth: owner-only
  - Request body: { title?: string, quest_type?: string, description?: string, objectives?: object, rewards?: object, failure_states?: object }
  - Response: { success: true, data: Quest }

- **DELETE /api/projects/:projectId/quests/:id** — Delete quest
  - Auth: owner-only
  - Response: { success: true }

#### Uploads (Vision Pipeline)
- **POST /api/projects/:projectId/uploads** — Upload an image for analysis
  - Auth: owner-only
  - Request body: multipart/form-data { file: File, file_type: string }
  - Response: { success: true, data: Upload }
  - Notes: Triggers async vision analysis. Sets status to "uploaded", then "analyzing".

- **GET /api/projects/:projectId/uploads** — List uploads for a project
  - Auth: owner-only
  - Query params: ?file_type=string
  - Response: { success: true, data: Upload[] }

- **GET /api/projects/:projectId/uploads/:id** — Get upload with analysis results
  - Auth: owner-only
  - Response: { success: true, data: Upload }

- **DELETE /api/projects/:projectId/uploads/:id** — Delete upload
  - Auth: owner-only
  - Response: { success: true }
  - Notes: Also removes file from storage.

#### Agent Runs (AI Pipeline)
- **POST /api/projects/:projectId/agents/run** — Trigger an agent run
  - Auth: owner-only
  - Request body: { agent_type: string, input_context?: object }
  - Response: { success: true, data: AgentRun }
  - Notes: Queues agent for async execution. Validates agent_type against allowed enum values.

- **POST /api/projects/:projectId/agents/pipeline** — Run the full agent pipeline (Player → Story → Art Director → Character → World Builder → Export)
  - Auth: owner-only
  - Request body: { game_concept?: string, skip_agents?: string[] }
  - Response: { success: true, data: { pipeline_id: string, agent_runs: AgentRun[] } }
  - Notes: Orchestrates all agents in dependency order. Each agent waits for its upstream dependency to complete.

- **GET /api/projects/:projectId/agents** — List agent runs for a project
  - Auth: owner-only
  - Query params: ?agent_type=string&status=string
  - Response: { success: true, data: AgentRun[] }

- **GET /api/projects/:projectId/agents/:id** — Get agent run details
  - Auth: owner-only
  - Response: { success: true, data: AgentRun }

#### Exports
- **POST /api/projects/:projectId/exports** — Generate an export bundle
  - Auth: owner-only
  - Request body: { export_type: string, includes_gdd?: boolean, includes_phaser_boilerplate?: boolean }
  - Response: { success: true, data: Export }
  - Notes: Queues async export generation. Packages all project assets into structured zip.

- **GET /api/projects/:projectId/exports** — List exports for a project
  - Auth: owner-only
  - Response: { success: true, data: Export[] }

- **GET /api/projects/:projectId/exports/:id** — Get export by ID
  - Auth: owner-only
  - Response: { success: true, data: Export }

- **GET /api/projects/:projectId/exports/:id/download** — Download export bundle
  - Auth: owner-only
  - Response: binary file stream
  - Notes: Returns the zip file for download.

### Pages / UI

- **/login** — Login Page
  - Purpose: Authenticate via Clerk OAuth (Google/GitHub)
  - Auth: public
  - Components: Clerk SignIn widget
  - Data: Clerk SDK handles auth flow
  - Navigation: Redirects to /dashboard on success
  - Notes: Handles redirect loop fix from Phase 2

- **/dashboard** — Project Dashboard
  - Purpose: View, create, rename, duplicate, and delete projects
  - Auth: required
  - Components: Project card grid, create project modal, search bar, status filter tabs
  - Data: GET /api/projects, POST /api/projects, PUT /api/projects/:id, POST /api/projects/:id/duplicate, DELETE /api/projects/:id
  - Navigation: Click project → /projects/:id
  - Notes: Empty state for new users. Loading skeleton on fetch.

- **/projects/:id** — Project Workspace
  - Purpose: Main project hub — overview of all generated assets, agent pipeline status, concept input
  - Auth: owner-only
  - Components: Game concept text area, agent pipeline status tracker, asset summary cards (characters, environments, stories, quests), upload dropzone, action buttons (run pipeline, export)
  - Data: GET /api/projects/:id, POST /api/projects/:id/agents/pipeline, GET /api/projects/:id/agents
  - Navigation: Tabs/nav to /projects/:id/story, /projects/:id/characters, /projects/:id/environments, /projects/:id/exports
  - Notes: Real-time agent status updates. Progress indicators during generation.

- **/projects/:id/story** — Story Editor
  - Purpose: View and edit the generated narrative, character relationship web, world lore, quest designs
  - Auth: owner-only
  - Components: Story timeline view, chapter/act editor, character relationship graph, world lore panel, quest list
  - Data: GET /api/projects/:projectId/stories, PUT /api/projects/:projectId/stories/:id, GET /api/projects/:projectId/quests
  - Navigation: Click character in relationship web → /projects/:id/characters/:characterId

- **/projects/:id/characters** — Character Gallery
  - Purpose: Browse all characters, view sprite sheets, preview animations, edit character details
  - Auth: owner-only
  - Components: Character card grid with role filters, character detail panel, sprite sheet viewer, animation previewer (frame-by-frame), dialogue tree editor
  - Data: GET /api/projects/:projectId/characters, GET /api/projects/:projectId/characters/:id, GET /api/projects/:projectId/characters/:characterId/sprite-sheets, GET /api/projects/:projectId/animations?character_id=UUID
  - Navigation: Click character → detail panel with sprite/animation tabs

- **/projects/:id/characters/:characterId/editor** — Animation Editor
  - Purpose: Frame-by-frame animation previewer and editor for a specific character
  - Auth: owner-only
  - Components: Sprite sheet canvas, frame scrubber, play/pause, frame rate control, animation state selector, Phaser 3 live preview panel
  - Data: GET /api/projects/:projectId/characters/:characterId/sprite-sheets, GET /api/projects/:projectId/animations?character_id=UUID, PUT /api/projects/:projectId/animations/:id
  - Notes: This is the core editor interface from Phase 2.

- **/projects/:id/environments** — Environment Gallery
  - Purpose: Browse environments, view tilesets, preview parallax layers, manage props
  - Auth: owner-only
  - Components: Environment card grid, tileset viewer, parallax layer preview, prop list, Phaser tilemap preview
  - Data: GET /api/projects/:projectId/environments, GET /api/projects/:projectId/environments/:environmentId/tilesets

- **/projects/:id/uploads** — Upload Manager
  - Purpose: Upload character images and scene references, view analysis results
  - Auth: owner-only
  - Components: Upload dropzone, upload gallery, analysis result panels (style extraction, palette, proportions, pose detection)
  - Data: POST /api/projects/:projectId/uploads, GET /api/projects/:projectId/uploads, GET /api/projects/:projectId/uploads/:id

- **/projects/:id/exports** — Export Hub
  - Purpose: Generate and download Phaser 3 project bundles, GDDs
  - Auth: owner-only
  - Components: Export type selector, export history list, download buttons, export status indicators
  - Data: POST /api/projects/:projectId/exports, GET /api/projects/:projectId/exports, GET /api/projects/:projectId/exports/:id/download

- **/404** — Not Found Page
  - Purpose: Catch-all for unmatched routes
  - Auth: public
  - Components: Error message, link back to dashboard

### Key Behaviors

**Agent Pipeline Orchestration**:
- When user triggers POST /api/projects/:id/agents/pipeline, the system creates agent_runs for each agent in dependency order: Player Agent → Story Architect → Art Director → Character Agent + World Builder (parallel) → Export Agent
- The Motion Intelligence Engine is invoked as a sub-step within the Character Agent — it does not run as a standalone agent_run
- The Vision Pipeline is invoked as a sub-step if the project has uploads with status="analyzed" — style DNA from uploads is injected into the Art Director and Character Agent context
- Each agent_run transitions: queued → running → complete|failed
- If an agent fails, the pipeline halts. The failed agent_run stores the error_message. Downstream agents remain in "queued" status.
- The project.status field reflects pipeline state: draft → researching (Player Agent running) → generating (Story/Art/Character/World agents running) → complete (Export done)

**Shared Context Pipeline**:
- All agents share a unified context object stored in the project's research_bible and style_guide jsonb fields
- The Player Agent seeds research_bible with genre research, best practices, comparable titles analysis
- The Story Architect appends narrative structure, character roster, quest designs, world lore to research_bible
- The Art Director writes style_guide with color palettes, art style rules, proportion standards, animation timing rules
- Every downstream agent reads both research_bible and style_guide before generating

**Visual Upload Analysis Flow**:
- When a file is uploaded via POST /api/projects/:projectId/uploads, the upload status is set to "uploaded"
- An async job picks up the upload and sets status to "analyzing"
- The Vision Pipeline AI call extracts: art style, color palette (as hex codes), character proportions, pose skeleton, scene mood/lighting
- Results are stored in the upload's analysis_result, extracted_style, extracted_palette, extracted_proportions, extracted_pose jsonb fields
- Status transitions to "analyzed" on success, "failed" on error
- When the agent pipeline runs, if analyzed uploads exist, their extracted data is merged into the Art Director's input context, overriding or augmenting AI-generated style decisions

**Character Sprite Generation**:
- The Character Agent receives character profiles from the Story Architect and style rules from the Art Director
- For each character, it generates: base sprite → animation state expansion → spritesheet compilation → Phaser 3 export config
- The Motion Intelligence Engine is consulted for each animation state: it takes character_type + action and returns motion parameters (gait cycle data, weight distribution, anticipation frames, follow-through)
- Generated sprite sheets are stored in sprite_sheets table with file_url pointing to the stored PNG
- Corresponding animation definitions are created in the animations table with Phaser 3-compatible phaser_config jsonb

**Export Bundle Generation**:
- When POST /api/projects/:projectId/exports is called, export status is set to "queued"
- An async job collects all project assets: sprite_sheets, tilesets, animations, stories, quests
- For export_type="full_bundle": generates /assets/sprites/, /assets/tilemaps/, /assets/audio/, /assets/ui/ directory structure with all files, Phaser 3 Scene boilerplate code (preload + create methods), animation registry JSON, and optionally a GDD document
- The resulting zip is stored and file_url is updated
- Status transitions: queued → generating → complete|failed

**Project Duplication**:
- POST /api/projects/:id/duplicate creates a deep copy of the project and all child entities (stories, characters, sprite_sheets, animations, environments, tilesets, environment_props, quests)
- All IDs are regenerated as new UUIDs
- Foreign key relationships are remapped to the new IDs
- File URLs for sprites/tilesets are copied (files are shared, not duplicated)
- The duplicated project gets name = "Copy of {original_name}" and status = "draft"

**Input Validation**:
- All AI prompt endpoints (agent runs, pipeline triggers) must pass Zod validation before processing
- Game concept text is sanitized to prevent prompt injection
- File uploads are validated for mime type (image/png, image/jpeg, image/webp) and max file size

**Error Handling**:
- All async route handlers wrapped in try/catch with next(error)
- Global Express error handler returns { success: false, error: string } with appropriate HTTP status
- Database operations use retry logic and connection pooling for PostgreSQL resilience
- AI API calls (Gemini, Claude) use retry with exponential backoff on rate limit or transient errors

-----

## Roadmap

### Phase 1: Foundation — Database Schema + CRUD + Project Structure

- [ ] Create Drizzle schema for users table with id, clerk_id, email, name, avatar_url, role, is_active, timestamps
- [x] Create Drizzle schema for projects table (basic fields exist in shared/schema.ts — needs expansion for status enum, jsonb fields)
- [ ] Create Drizzle schema for stories table with all fields including acts, chapters, branching_points jsonb fields
- [ ] Create Drizzle schema for characters table with all fields including animation_states array, motion_profile, dialogue_tree jsonb
- [ ] Create Drizzle schema for sprite_sheets table with all fields including atlas_json_url and metadata
- [x] Create Drizzle schema for animations table (basic fields exist in shared/schema.ts — needs expansion for phaser_config jsonb)
- [ ] Create Drizzle schema for environments, tilesets, environment_props tables with all fields
- [ ] Create Drizzle schema for quests table with all fields including objectives, rewards, failure_states jsonb
- [ ] Create Drizzle schema for uploads table with all analysis result jsonb fields
- [ ] Create Drizzle schema for exports and agent_runs tables with status enums
- [x] Build POST/GET/PUT/DELETE endpoints for /api/projects with Zod validation and owner-only auth
- [ ] Build CRUD endpoints for /api/projects/:projectId/stories with Zod validation
- [ ] Build CRUD endpoints for /api/projects/:projectId/characters with role filter support
- [ ] Build CRUD endpoints for /api/projects/:projectId/environments and nested tilesets/props
- [ ] Build CRUD endpoints for /api/projects/:projectId/quests with quest_type filter
- [ ] Build POST/GET/DELETE endpoints for /api/projects/:projectId/uploads (file upload handling)
- [ ] Build GET /api/users/me and PUT /api/users/me endpoints
- [x] Build GET /health endpoint returning { success: true, status: "ok" }
- [x] Implement global Express error handler with { success: false, error: string } response format
- [x] Implement Clerk auth middleware that validates session and extracts user_id
- [x] Implement project ownership middleware (owner-only route guard)
- [x] Build project dashboard page at /dashboard with project card grid, create/rename/duplicate/delete
- [x] Build login page at /login with Clerk SignIn widget (redirect loop fix already done)

### Phase 2: Core AI Pipeline — Player Agent + Story Architect + Art Director

- [ ] Implement Player Agent v1: concept intake, genre detection, deep genre research via AI API call
- [ ] Implement Story Architect Engine: narrative generation from research bible — produces acts, chapters, character roster, quest blueprints, world lore
- [ ] Implement Art Director Agent: style guide generation from research bible + uploaded style DNA — produces color palettes, proportion rules, animation timing
- [ ] Build POST /api/projects/:projectId/agents/run endpoint with agent_type validation and async job queue
- [ ] Build POST /api/projects/:projectId/agents/pipeline endpoint that orchestrates agents in dependency order
- [ ] Build GET /api/projects/:projectId/agents endpoints for pipeline status tracking
- [ ] Implement shared context pipeline: research_bible and style_guide jsonb accumulation across agents
- [ ] Build project workspace page at /projects/:id with game concept input, agent pipeline status tracker, action buttons
- [ ] Build story editor page at /projects/:id/story with timeline view, chapter editor, character relationship graph
- [ ] Implement Visual Upload analysis pipeline: style extraction, palette extraction, proportion analysis, pose detection via Vision API
- [ ] Build upload manager page at /projects/:id/uploads with dropzone and analysis result panels

### Phase 3: Character Factory + Motion Intelligence + Animation Editor

- [ ] Implement Character Agent: base sprite generation from character profiles + style guide via AI image generation
- [ ] Implement Motion Intelligence Engine: biomechanics library with human gait cycles, weight distribution, anticipation/follow-through rules
- [ ] Add animal/creature motion knowledge: quadruped gaits, bird flight, aquatic movement, insect locomotion, fantasy creature synthesis
- [ ] Implement animation state expansion: generate multiple animation states (idle, run, jump, attack, hurt, death) from base sprite
- [ ] Implement spritesheet compilation: pack frames into Texture Atlas PNGs with pixel-perfect alignment
- [ ] Build POST/GET/DELETE endpoints for sprite sheets and animation definitions
- [ ] Build character gallery page at /projects/:id/characters with role filters and detail panels
- [ ] Build animation editor page at /projects/:id/characters/:characterId/editor with frame scrubber, play/pause, frame rate control
- [ ] Implement Phaser 3 live preview panel in animation editor — renders sprite with animation in-browser

### Phase 4: World Builder + Export System

- [ ] Implement World Builder Agent: tileset generation, environment props, parallax background layers, level layout blueprints from story + style guide
- [ ] Implement atmospheric effect spec generation: particle system configs for rain, snow, fog, fireflies as Phaser 3 ParticleEmitter JSON
- [ ] Build environment gallery page at /projects/:id/environments with tileset viewer and parallax preview
- [ ] Implement Game Blueprint Exporter: package all assets into structured Phaser 3 project bundle with organized /assets/ directory
- [ ] Implement Phaser 3 Scene boilerplate code generation: preload() with all assets, create() with animation definitions
- [ ] Implement animation registry JSON generation: master file mapping characters → animation states → frame ranges → frame rates
- [ ] Implement GDD document generator: compile story, characters, environments, quests, art direction into formatted document
- [ ] Build export hub page at /projects/:id/exports with export type selector, history, download buttons
- [ ] Build POST/GET endpoints for /api/projects/:projectId/exports with async generation and download

### Phase 5: Polish, Beta & Launch

- [ ] Implement database retry logic and connection pooling for PostgreSQL resilience
- [ ] Add Zod sanitization on all AI prompt endpoints to prevent prompt injection
- [ ] Implement React Error Boundaries on all page components
- [ ] Add loading skeletons and empty states to all list pages (dashboard, characters, environments, quests)
- [ ] Implement real-time agent pipeline status updates on project workspace (polling or SSE)
- [ ] Add CLERK_SECRET_KEY environment variable configuration
- [ ] Build admin dashboard for Sneebly monitoring
- [ ] Implement multi-project asset sharing
- [ ] End-to-end testing: concept input → full pipeline → export download → Phaser 3 project loads without errors
- [ ] Beta testing deployment and production hardening

-----

## Quality Targets

- API response: p95 under 500ms (excluding AI generation endpoints which are async)
- Error rate: below 1% on all endpoints
- Uptime: 99.5% minimum
- Zero unhandled promise rejections
- All API endpoints return proper HTTP status codes (not 500 for bad input)
- Health endpoint returns 200 with valid JSON
- Concept-to-export time: under 30 minutes for a 10-character game
- Style consistency: 95%+ visual coherence across all generated assets (AI self-evaluation)
- Phaser 3 compatibility: 100% of exports load in Phaser without errors
- Character animations: smooth 12-frame animations at 60fps with zero ground-sliding
- Upload style fidelity: 95%+ match to uploaded art style

## What's Already Built (Don't Rebuild, Improve)

- Monorepo architecture: full-stack TypeScript with shared Zod/Drizzle schemas
- Clerk authentication: OAuth login via Google/GitHub (working, redirect loop fixed)
- Project dashboard: create, rename, duplicate, delete projects (working)
- Data models: Zod/Drizzle schemas for Projects & Animations (partial — needs expansion)
- Sneebly integration: autonomous agent for codebase monitoring with force discovery heartbeat
- Module resolution: ES module conflicts resolved via .cjs migration
- Editor interface: frame-by-frame animation previewer UI (in progress)
- Error handling: global Express handlers + React Error Boundaries (in progress)
- Database resilience: retry logic and connection pooling (in progress)
- Input validation: Zod sanitization on AI prompt endpoints (in progress)

## Improvement Preferences

### Auto-approve these types of changes:

- Database index additions
- Dead code removal (unused exports, unreachable paths)
- Null check additions on external API responses
- Performance optimizations (query consolidation, caching)
- Error handling improvements (try/catch, transaction wrapping)
- Input validation additions (Zod schemas)
- New file creation in safe directories (build mode)
- Missing import additions
- Console.log cleanup
- Type annotation additions (TypeScript)
- Return type fixes

### Always require my approval for:

- Authentication/authorization changes
- AI prompt changes or model configuration (Gemini/Claude prompts)
- Database schema changes (new tables, column modifications, drops)
- New API endpoints that touch sensitive data
- Package.json modifications (new dependencies)
- Environment variable additions or changes
- Changes to deployment configuration
- Anything touching user passwords, tokens, or sessions
- Changes to the agent pipeline orchestration order
- Export bundle structure changes

### Focus areas this month:

- Complete Phase 1 foundation: all database schemas and CRUD endpoints
- Stabilize Phase 2 in-progress items: error handling, database resilience, input validation
- Begin Player Agent v1 implementation

### Ignore for now:

- UI/CSS styling changes (unless pages are broken/unusable)
- Test coverage improvements
- Documentation generation
- Dependency version bumps
- Performance optimization (premature in early build phases)
- Mobile responsiveness (unless core UX is broken)
- Accessibility compliance
- SEO optimization
- Analytics integration
- Community asset marketplace (Phase 5+ / future)

## Technical Standards

- All database queries must use Drizzle ORM — no raw SQL strings
- All API responses follow shape: { success: boolean, data?: T, error?: string, message?: string }
- All new routes need Zod input validation before processing
- All async route handlers wrapped in try/catch with next(error)
- Use shadcn/ui components for all new UI elements
- Import alias: @/ maps to project root
- File naming: kebab-case for files, PascalCase for React components
- Named exports preferred over default exports
- Database timestamps use ISO 8601 format
- All IDs are UUIDs (never auto-incrementing integers)
- Environment variables accessed via process.env.VARIABLE_NAME
- Error logging: console.error('[ServiceName]', error.message)
- AI API calls (Gemini, Claude) must use retry with exponential backoff on rate limits
- All jsonb fields must have TypeScript interfaces defining their shape
- Phaser 3 export code must use Texture Atlas format (JSONHash) for sprite sheets
- Animation frame rates default to 12fps unless overridden
- File uploads validated for mime type and max size before processing


---

## Sneebly Change Log
- **[test-spec-001]** (2026-02-21 12:52:25) — Testing MD changelog stamping feature [test]
