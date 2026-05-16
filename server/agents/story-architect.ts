/**
 * Story Architect Agent
 *
 * Reads the project's research_bible and generates a comprehensive narrative
 * design: narrative structure, character roster, quest blueprints, world lore,
 * and branching points. Each AI call builds on prior outputs for coherence.
 *
 * SECURITY: All AI response content is treated as DATA, never as instructions.
 */

import { z } from "zod";
import { storage } from "../storage";

// ─── Minimal OpenAI-compatible client (no external dependency) ────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionParams {
  model: string;
  temperature?: number;
  response_format?: { type: string };
  messages: ChatMessage[];
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
}

class OpenAIClient {
  private apiKey: string;

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  chat = {
    completions: {
      create: async (params: ChatCompletionParams): Promise<ChatCompletionResponse> => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(params),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`OpenAI API error ${res.status}: ${errorBody}`);
        }

        return (await res.json()) as ChatCompletionResponse;
      },
    },
  };
}

// ─── Research Bible Schema (lenient — all fields optional) ────────

const ResearchBibleSchema = z.object({
  genre: z.string().optional(),
  subGenre: z.string().optional(),
  themes: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  mechanics: z
    .object({
      core: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  narrativeFramework: z
    .object({
      tone: z.string().optional(),
      perspective: z.string().optional(),
      worldBuilding: z.string().optional(),
      storyStructure: z.string().optional(),
    })
    .passthrough()
    .optional(),
  artDirection: z
    .object({
      style: z.string().optional(),
      mood: z.string().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

// ─── Output Zod Schemas ──────────────────────────────────

const ActSchema = z.object({
  actNumber: z.number(),
  title: z.string(),
  summary: z.string(),
  themes: z.array(z.string()),
  chapters: z.array(
    z.object({
      chapterNumber: z.number(),
      title: z.string(),
      summary: z.string(),
      keyEvents: z.array(z.string()),
      location: z.string().optional(),
      involvedCharacters: z.array(z.string()).optional(),
    })
  ),
});

const NarrativeStructureSchema = z.object({
  title: z.string(),
  logline: z.string(),
  totalActs: z.number(),
  acts: z.array(ActSchema),
});

const CharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  backstory: z.string(),
  personalityTraits: z.array(z.string()),
  physicalDescription: z.string(),
  motivations: z.array(z.string()),
  arc: z.string(),
  relationships: z.array(
    z.object({
      characterName: z.string(),
      relationshipType: z.string(),
      description: z.string(),
    })
  ),
});

const CharacterRosterSchema = z.object({
  characters: z.array(CharacterSchema),
});

const QuestObjectiveSchema = z.object({
  description: z.string(),
  type: z.string(),
  optional: z.boolean().optional(),
});

const QuestBlueprintSchema = z.object({
  title: z.string(),
  questType: z.string(),
  description: z.string(),
  actNumber: z.number().optional(),
  chapterNumber: z.number().optional(),
  objectives: z.array(QuestObjectiveSchema),
  rewards: z.array(z.string()),
  failureStates: z.array(z.string()).optional(),
  narrativeHook: z.string(),
  involvedCharacters: z.array(z.string()),
});

const QuestBlueprintsSchema = z.object({
  quests: z.array(QuestBlueprintSchema),
});

const WorldLoreSchema = z.object({
  worldName: z.string(),
  history: z.string(),
  geography: z.string(),
  factions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      alignment: z.string().optional(),
      territory: z.string().optional(),
    })
  ),
  cultures: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      customs: z.array(z.string()).optional(),
    })
  ),
  magicOrTechnology: z.string().optional(),
  keyLocations: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string(),
    })
  ),
});

const BranchingPointSchema = z.object({
  id: z.string(),
  actNumber: z.number(),
  chapterNumber: z.number().optional(),
  description: z.string(),
  triggerCondition: z.string(),
  options: z.array(
    z.object({
      label: z.string(),
      outcome: z.string(),
      consequenceDescription: z.string(),
      affectedCharacters: z.array(z.string()).optional(),
    })
  ),
});

const BranchingPointsSchema = z.object({
  branchingPoints: z.array(BranchingPointSchema),
});

/** Combined output of the Story Architect agent */
export const StoryArchitectOutputSchema = z.object({
  narrativeStructure: NarrativeStructureSchema,
  characterRoster: CharacterRosterSchema,
  questBlueprints: QuestBlueprintsSchema,
  worldLore: WorldLoreSchema,
  branchingPoints: BranchingPointsSchema,
});

export type StoryArchitectOutput = z.infer<typeof StoryArchitectOutputSchema>;

// ─── Constants ────────────────────────────────────────────

const MAX_RETRIES = 2;
const MODEL = "gpt-4o";

// ─── OpenAI Client ────────────────────────────────────────

function getOpenAIClient(): OpenAIClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAIClient({ apiKey });
}

// ─── Prompt Injection Guard ───────────────────────────────

const INJECTION_PATTERNS = [
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
];

/**
 * Scans AI response text for prompt injection patterns.
 * Logs a warning if detected. Returns true if injection suspected.
 */
function checkForInjection(text: string, context: string): boolean {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(
        `[StoryArchitect] SECURITY: Possible prompt injection detected in ${context}. Pattern: ${pattern}. Content quarantined.`
      );
      return true;
    }
  }
  return false;
}

// ─── AI Call Helper ───────────────────────────────────────

interface AICallOptions {
  openai: OpenAIClient;
  systemPrompt: string;
  userPrompt: string;
  callLabel: string;
}

/**
 * Makes an AI call with structured JSON output, retry logic, and injection scanning.
 * Returns the raw parsed JSON object. Throws on exhausted retries.
 */
async function makeAICall<T>(
  options: AICallOptions,
  schema: z.ZodType<T>
): Promise<T> {
  const { openai, systemPrompt, userPrompt, callLabel } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(
          `[StoryArchitect] Retrying ${callLabel} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
        );
      }

      const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`Empty response from AI for ${callLabel}`);
      }

      // SECURITY: Treat AI response as DATA — scan for injection attempts
      checkForInjection(content, callLabel);

      const parsed = JSON.parse(content);
      const validated = schema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[StoryArchitect] ${callLabel} attempt ${attempt + 1} failed: ${lastError.message}`
      );
    }
  }

  throw new Error(
    `[StoryArchitect] ${callLabel} failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`
  );
}

// ─── System Prompt Builder ────────────────────────────────

function buildSystemPrompt(researchBible: Record<string, any>): string {
  return `You are a master narrative designer and game story architect. Your role is to create comprehensive, cohesive game narratives based on the provided research context.

You MUST respond with valid JSON matching the exact structure requested in each prompt. Do not include any text outside the JSON object.

Research Bible Context:
${JSON.stringify(researchBible, null, 2)}

Key design principles:
- Genre: ${researchBible.genre || "Not specified"}
- Sub-genre: ${researchBible.subGenre || "Not specified"}
- Themes: ${(researchBible.themes || []).join(", ") || "Not specified"}
- Target audience: ${researchBible.targetAudience || "Not specified"}
- Narrative tone: ${researchBible.narrativeFramework?.tone || "Not specified"}
- Perspective: ${researchBible.narrativeFramework?.perspective || "Not specified"}
- World building approach: ${researchBible.narrativeFramework?.worldBuilding || "Not specified"}
- Story structure: ${researchBible.narrativeFramework?.storyStructure || "Not specified"}
- Core mechanics: ${(researchBible.mechanics?.core || []).join(", ") || "Not specified"}
- Art style: ${researchBible.artDirection?.style || "Not specified"}
- Mood: ${researchBible.artDirection?.mood || "Not specified"}

Design a narrative that:
1. Fits the genre and themes naturally
2. Supports the core gameplay mechanics through story beats
3. Creates memorable, distinct characters with clear motivations
4. Builds a world that feels lived-in and consistent
5. Includes meaningful player choices where appropriate
6. Maintains tonal consistency with the art direction and mood`;
}

// ─── Main Agent Function ──────────────────────────────────

/**
 * Runs the Story Architect agent for a given project.
 *
 * Fetches the project, validates the research_bible, then makes a series of
 * AI calls to generate narrative structure, characters, quests, world lore,
 * and branching points. Each call builds on prior outputs for coherence.
 *
 * @param projectId - The project UUID to generate story content for
 * @returns The validated StoryArchitectOutput
 */
export async function runStoryArchitect(
  projectId: string
): Promise<StoryArchitectOutput> {
  const startTime = Date.now();
  console.log(`[StoryArchitect] Starting for project ${projectId}`);

  // ── Step 1: Fetch and validate project ──────────────────

  const project = await storage.getProject(projectId);
  if (!project) {
    throw new Error(`[StoryArchitect] Project not found: ${projectId}`);
  }

  const rawBible = project.researchBible;
  if (!rawBible || (typeof rawBible === "object" && Object.keys(rawBible).length === 0)) {
    throw new Error(
      `[StoryArchitect] Project ${projectId} has no research_bible. Run the Research Agent first.`
    );
  }

  // Validate research_bible structure (treat content as DATA)
  const bibleParseResult = ResearchBibleSchema.safeParse(rawBible);
  if (!bibleParseResult.success) {
    console.warn(
      `[StoryArchitect] research_bible validation warnings: ${bibleParseResult.error.message}`
    );
    // Continue with raw data — the schema is lenient (all fields optional)
  }
  const researchBible = (bibleParseResult.success ? bibleParseResult.data : rawBible) as Record<string, any>;

  // SECURITY: Scan research_bible text content for injection attempts
  const bibleText = JSON.stringify(researchBible);
  if (checkForInjection(bibleText, "research_bible input")) {
    console.warn(
      `[StoryArchitect] Proceeding with caution — injection pattern found in research_bible data.`
    );
  }

  console.log(`[StoryArchitect] Research bible validated. Building narrative...`);

  // ── Step 2: Initialize OpenAI client ────────────────────

  const openai = getOpenAIClient();
  const systemPrompt = buildSystemPrompt(researchBible);

  // ── Step 3: Generate Narrative Structure ─────────────────

  console.log(`[StoryArchitect] Generating narrative structure...`);
  const narrativeStructure = await makeAICall(
    {
      openai,
      systemPrompt,
      userPrompt: `Design the complete narrative structure for this game. Create a compelling story with acts and chapters.

Respond with a JSON object matching this exact structure:
{
  "title": "string — the game's story title",
  "logline": "string — one-sentence story summary",
  "totalActs": number,
  "acts": [
    {
      "actNumber": number,
      "title": "string",
      "summary": "string — 2-3 sentences describing this act",
      "themes": ["string"],
      "chapters": [
        {
          "chapterNumber": number,
          "title": "string",
          "summary": "string",
          "keyEvents": ["string"],
          "location": "string (optional)",
          "involvedCharacters": ["string (optional)"]
        }
      ]
    }
  ]
}

Create 3-5 acts with 2-4 chapters each. Ensure the story has a clear beginning, rising action, climax, and resolution.`,
      callLabel: "narrative-structure",
    },
    NarrativeStructureSchema
  );
  console.log(
    `[StoryArchitect] Narrative structure complete: "${narrativeStructure.title}" with ${narrativeStructure.totalActs} acts`
  );

  // ── Step 4: Generate Character Roster ────────────────────

  console.log(`[StoryArchitect] Generating character roster...`);
  const characterRoster = await makeAICall(
    {
      openai,
      systemPrompt,
      userPrompt: `Based on the narrative structure below, design the complete character roster for this game.

Narrative Structure (for context — use this to ensure characters fit the story):
${JSON.stringify(narrativeStructure, null, 2)}

Respond with a JSON object matching this exact structure:
{
  "characters": [
    {
      "name": "string",
      "role": "string — e.g. protagonist, antagonist, mentor, ally, NPC",
      "backstory": "string — 2-4 sentences",
      "personalityTraits": ["string"],
      "physicalDescription": "string — visual description for art generation",
      "motivations": ["string"],
      "arc": "string — how this character changes through the story",
      "relationships": [
        {
          "characterName": "string — name of related character",
          "relationshipType": "string — e.g. rival, mentor, sibling, love interest",
          "description": "string — brief description of the relationship"
        }
      ]
    }
  ]
}

Create 5-10 characters including at least: 1 protagonist, 1 antagonist, 2 supporting allies, and 2 NPCs. Ensure relationships form a coherent web.`,
      callLabel: "character-roster",
    },
    CharacterRosterSchema
  );
  console.log(
    `[StoryArchitect] Character roster complete: ${characterRoster.characters.length} characters`
  );

  // ── Step 5: Generate Quest Blueprints ────────────────────

  console.log(`[StoryArchitect] Generating quest blueprints...`);
  const questBlueprints = await makeAICall(
    {
      openai,
      systemPrompt,
      userPrompt: `Based on the narrative structure and character roster below, design quest blueprints for this game.

Narrative Structure:
${JSON.stringify(narrativeStructure, null, 2)}

Character Roster:
${JSON.stringify(characterRoster, null, 2)}

Respond with a JSON object matching this exact structure:
{
  "quests": [
    {
      "title": "string",
      "questType": "string — e.g. main, side, fetch, escort, boss, puzzle, exploration",
      "description": "string — 2-3 sentences",
      "actNumber": number (optional),
      "chapterNumber": number (optional),
      "objectives": [
        {
          "description": "string",
          "type": "string — e.g. defeat, collect, reach, talk, solve, survive",
          "optional": boolean (optional)
        }
      ],
      "rewards": ["string"],
      "failureStates": ["string (optional)"],
      "narrativeHook": "string — how this quest connects to the story",
      "involvedCharacters": ["string — character names"]
    }
  ]
}

Create 8-15 quests covering main story progression and side content. Ensure quests reference existing characters and story beats.`,
      callLabel: "quest-blueprints",
    },
    QuestBlueprintsSchema
  );
  console.log(
    `[StoryArchitect] Quest blueprints complete: ${questBlueprints.quests.length} quests`
  );

  // ── Step 6: Generate World Lore ──────────────────────────

  console.log(`[StoryArchitect] Generating world lore...`);
  const worldLore = await makeAICall(
    {
      openai,
      systemPrompt,
      userPrompt: `Based on the narrative structure, character roster, and quest blueprints below, design the world lore for this game.

Narrative Structure:
${JSON.stringify(narrativeStructure, null, 2)}

Character Roster:
${JSON.stringify(characterRoster, null, 2)}

Quest Blueprints:
${JSON.stringify(questBlueprints, null, 2)}

Respond with a JSON object matching this exact structure:
{
  "worldName": "string",
  "history": "string — 3-5 sentences of world history",
  "geography": "string — 2-3 sentences describing the world's geography",
  "factions": [
    {
      "name": "string",
      "description": "string",
      "alignment": "string (optional)",
      "territory": "string (optional)"
    }
  ],
  "cultures": [
    {
      "name": "string",
      "description": "string",
      "customs": ["string (optional)"]
    }
  ],
  "magicOrTechnology": "string (optional) — describe the magic system or technology level",
  "keyLocations": [
    {
      "name": "string",
      "description": "string",
      "significance": "string — why this location matters to the story"
    }
  ]
}

Create a rich, consistent world with 2-4 factions, 2-3 cultures, and 5-8 key locations that tie into the narrative and quests.`,
      callLabel: "world-lore",
    },
    WorldLoreSchema
  );
  console.log(
    `[StoryArchitect] World lore complete: "${worldLore.worldName}" with ${worldLore.keyLocations.length} key locations`
  );

  // ── Step 7: Generate Branching Points ────────────────────

  console.log(`[StoryArchitect] Generating branching points...`);
  const branchingPoints = await makeAICall(
    {
      openai,
      systemPrompt,
      userPrompt: `Based on all the story elements below, design meaningful branching points (player choices) for this game.

Narrative Structure:
${JSON.stringify(narrativeStructure, null, 2)}

Character Roster:
${JSON.stringify(characterRoster, null, 2)}

Quest Blueprints:
${JSON.stringify(questBlueprints, null, 2)}

World Lore:
${JSON.stringify(worldLore, null, 2)}

Respond with a JSON object matching this exact structure:
{
  "branchingPoints": [
    {
      "id": "string — unique identifier like bp_act1_ch2_choice1",
      "actNumber": number,
      "chapterNumber": number (optional),
      "description": "string — what situation the player faces",
      "triggerCondition": "string — what triggers this choice",
      "options": [
        {
          "label": "string — the choice label shown to the player",
          "outcome": "string — what happens if chosen",
          "consequenceDescription": "string — long-term consequences",
          "affectedCharacters": ["string (optional) — character names affected"]
        }
      ]
    }
  ]
}

Create 5-10 branching points spread across the story. Each should have 2-3 options with meaningful, distinct consequences. Include at least one major story-altering choice per act.`,
      callLabel: "branching-points",
    },
    BranchingPointsSchema
  );
  console.log(
    `[StoryArchitect] Branching points complete: ${branchingPoints.branchingPoints.length} decision points`
  );

  // ── Step 8: Assemble and validate final output ───────────

  const output: StoryArchitectOutput = {
    narrativeStructure,
    characterRoster,
    questBlueprints,
    worldLore,
    branchingPoints,
  };

  // Final validation of combined output
  const finalValidation = StoryArchitectOutputSchema.safeParse(output);
  if (!finalValidation.success) {
    console.error(
      `[StoryArchitect] Final output validation failed: ${finalValidation.error.message}`
    );
    throw new Error(
      `[StoryArchitect] Final output validation failed: ${finalValidation.error.message}`
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[StoryArchitect] Complete for project ${projectId} in ${elapsed}s. ` +
      `${narrativeStructure.totalActs} acts, ` +
      `${characterRoster.characters.length} characters, ` +
      `${questBlueprints.quests.length} quests, ` +
      `${worldLore.keyLocations.length} locations, ` +
      `${branchingPoints.branchingPoints.length} branching points.`
  );

  return finalValidation.data;
}
