import { z } from "zod";
import type { ResearchBible } from "@shared/schema";

// ─── Story Architect Output Validation Schema ─────────────

const RelationshipSchema = z.object({
  characterName: z.string(),
  type: z.string(),
  description: z.string(),
});

const CharacterRosterItemSchema = z.object({
  name: z.string(),
  role: z.string(),
  backstory: z.string(),
  personalityProfile: z.string(),
  physicalDescription: z.string(),
  relationships: z.array(RelationshipSchema),
});

const ChapterSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyEvents: z.array(z.string()),
  characters: z.array(z.string()),
});

const ActSchema = z.object({
  actNumber: z.number(),
  title: z.string(),
  summary: z.string(),
  chapters: z.array(ChapterSchema),
});

const NarrativeStructureSchema = z.object({
  acts: z.array(ActSchema),
});

const ObjectiveSchema = z.object({
  description: z.string(),
  type: z.string(),
  optional: z.boolean(),
});

const RewardSchema = z.object({
  type: z.string(),
  description: z.string(),
});

const QuestBlueprintSchema = z.object({
  title: z.string(),
  description: z.string(),
  objectives: z.array(ObjectiveSchema),
  rewards: z.array(RewardSchema),
  prerequisites: z.array(z.string()),
});

const LocationSchema = z.object({
  name: z.string(),
  description: z.string(),
  significance: z.string(),
});

const FactionSchema = z.object({
  name: z.string(),
  description: z.string(),
  goals: z.string(),
  alignment: z.string(),
});

const HistoryEntrySchema = z.object({
  era: z.string(),
  event: z.string(),
  impact: z.string(),
});

const WorldRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const WorldLoreSchema = z.object({
  locations: z.array(LocationSchema),
  factions: z.array(FactionSchema),
  history: z.array(HistoryEntrySchema),
  rules: z.array(WorldRuleSchema),
});

const BranchOptionSchema = z.object({
  label: z.string(),
  description: z.string(),
});

const BranchConsequenceSchema = z.object({
  optionLabel: z.string(),
  outcome: z.string(),
  affectedCharacters: z.array(z.string()),
  affectedQuests: z.array(z.string()),
});

const BranchingPointSchema = z.object({
  trigger: z.string(),
  options: z.array(BranchOptionSchema),
  consequences: z.array(BranchConsequenceSchema),
});

/**
 * Zod validation schema for the full Story Architect AI response.
 * Use this to validate the parsed JSON before storing it.
 */
export const StoryArchitectOutputSchema = z.object({
  narrativeStructure: NarrativeStructureSchema,
  characterRoster: z.array(CharacterRosterItemSchema),
  questBlueprints: z.array(QuestBlueprintSchema),
  worldLore: WorldLoreSchema,
  branchingPoints: z.array(BranchingPointSchema),
});

export type StoryArchitectOutput = z.infer<typeof StoryArchitectOutputSchema>;

// ─── Project Context Interface ────────────────────────────

export interface ProjectContext {
  name: string;
  description: string | null;
  gameType: string | null;
  gameContext: string | null;
}

// ─── Prompt Builder ───────────────────────────────────────

/**
 * Builds a comprehensive system+user prompt for the Story Architect AI agent.
 *
 * The prompt instructs the AI to return a single JSON object matching
 * StoryArchitectOutputSchema, using the research bible fields as creative
 * constraints and the project context for grounding.
 *
 * @param researchBible - The project's research bible (genre, themes, mechanics, etc.)
 * @param projectContext - Basic project metadata (name, description, gameType, gameContext)
 * @returns A single string containing the full system + user prompt
 */
export function buildStoryArchitectPrompt(
  researchBible: ResearchBible,
  projectContext: ProjectContext,
): string {
  const genre = researchBible.genre ?? "unspecified genre";
  const themes = researchBible.themes?.length ? researchBible.themes.join(", ") : "no specific themes";
  const tone = researchBible.narrativeFramework?.tone ?? "unspecified";
  const perspective = researchBible.narrativeFramework?.perspective ?? "unspecified";
  const worldBuilding = researchBible.narrativeFramework?.worldBuilding ?? "unspecified";
  const storyStructure = researchBible.narrativeFramework?.storyStructure ?? "three-act structure";
  const coreMechanics = researchBible.mechanics?.core?.length ? researchBible.mechanics.core.join(", ") : "none specified";
  const secondaryMechanics = researchBible.mechanics?.secondary?.length ? researchBible.mechanics.secondary.join(", ") : "none specified";
  const targetAudience = researchBible.targetAudience ?? "general audience";

  const projectName = projectContext.name;
  const projectDescription = projectContext.description ?? "No description provided.";
  const gameType = projectContext.gameType ?? "unspecified";
  const gameContext = projectContext.gameContext ?? "No additional game context provided.";

  return `You are Story Architect, an expert narrative designer for video games. Your job is to create a comprehensive story blueprint for a game project.

You MUST return ONLY valid JSON. Do NOT wrap your response in markdown code fences. Do NOT include any text before or after the JSON object. Do NOT include comments inside the JSON. Return a single JSON object and nothing else.

=== PROJECT CONTEXT ===
Project Name: ${projectName}
Description: ${projectDescription}
Game Type: ${gameType}
Game Context: ${gameContext}

=== CREATIVE CONSTRAINTS (from Research Bible) ===
Genre: ${genre}
Themes: ${themes}
Target Audience: ${targetAudience}
Narrative Tone: ${tone}
Perspective: ${perspective}
World-Building Approach: ${worldBuilding}
Story Structure: ${storyStructure}
Core Mechanics: ${coreMechanics}
Secondary Mechanics: ${secondaryMechanics}

=== INSTRUCTIONS ===
Using the project context and creative constraints above, generate a complete story blueprint as a single JSON object with EXACTLY these top-level keys:

1. "narrativeStructure" — The overall story arc broken into acts and chapters.
2. "characterRoster" — All major and supporting characters.
3. "questBlueprints" — Playable quests/missions derived from the narrative.
4. "worldLore" — Locations, factions, history, and world rules.
5. "branchingPoints" — Key decision points where the player can alter the story.

=== EXACT JSON SCHEMA ===
{
  "narrativeStructure": {
    "acts": [
      {
        "actNumber": <integer>,
        "title": <string>,
        "summary": <string describing this act's role in the overall story>,
        "chapters": [
          {
            "title": <string>,
            "summary": <string>,
            "keyEvents": [<string>, ...],
            "characters": [<string character names involved>, ...]
          }
        ]
      }
    ]
  },
  "characterRoster": [
    {
      "name": <string>,
      "role": <string, e.g. "protagonist", "antagonist", "mentor", "companion", "npc">,
      "backstory": <string, 2-4 sentences>,
      "personalityProfile": <string describing traits, motivations, flaws>,
      "physicalDescription": <string describing appearance for sprite/art generation>,
      "relationships": [
        {
          "characterName": <string, name of related character>,
          "type": <string, e.g. "ally", "rival", "mentor", "sibling", "enemy">,
          "description": <string, brief description of the relationship>
        }
      ]
    }
  ],
  "questBlueprints": [
    {
      "title": <string>,
      "description": <string>,
      "objectives": [
        {
          "description": <string>,
          "type": <string, e.g. "fetch", "defeat", "explore", "escort", "puzzle", "dialogue">,
          "optional": <boolean>
        }
      ],
      "rewards": [
        {
          "type": <string, e.g. "item", "ability", "lore", "currency", "relationship">,
          "description": <string>
        }
      ],
      "prerequisites": [<string quest titles or "none">, ...]
    }
  ],
  "worldLore": {
    "locations": [
      {
        "name": <string>,
        "description": <string>,
        "significance": <string, why this location matters to the story>
      }
    ],
    "factions": [
      {
        "name": <string>,
        "description": <string>,
        "goals": <string>,
        "alignment": <string, e.g. "benevolent", "neutral", "hostile", "ambiguous">
      }
    ],
    "history": [
      {
        "era": <string>,
        "event": <string>,
        "impact": <string, how this event shaped the current world>
      }
    ],
    "rules": [
      {
        "name": <string, e.g. "Magic System", "Technology Level", "Social Structure">,
        "description": <string>
      }
    ]
  },
  "branchingPoints": [
    {
      "trigger": <string, what event or condition triggers this decision point>,
      "options": [
        {
          "label": <string, short name for this choice>,
          "description": <string, what the player does>
        }
      ],
      "consequences": [
        {
          "optionLabel": <string, matches an option label above>,
          "outcome": <string, what happens as a result>,
          "affectedCharacters": [<string character names>, ...],
          "affectedQuests": [<string quest titles>, ...]
        }
      ]
    }
  ]
}

=== QUALITY GUIDELINES ===
- Create at least 3 acts with 2-4 chapters each.
- Include at least 4 characters with interconnected relationships.
- Design at least 5 quests that tie into the narrative structure.
- Create at least 4 locations, 2 factions, 3 historical events, and 2 world rules.
- Include at least 3 branching points with 2-3 options each.
- Ensure quests reference characters and locations from the world lore.
- Make branching point consequences reference specific characters and quests.
- Tailor all content to the genre (${genre}), themes (${themes}), and target audience (${targetAudience}).
- Ensure game mechanics (${coreMechanics}) are reflected in quest objective types.
- Keep the narrative tone consistent with: ${tone}.

Return ONLY the JSON object. No other text.`;
}
