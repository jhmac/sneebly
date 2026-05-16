/**
 * Prompt Sanitization & Research Prompt Builder
 *
 * Exports:
 *   - SanitizationError: typed error wrapping Zod validation issues
 *   - sanitizeForPrompt(input): validates & cleans user input via GameConceptInputSchema
 *   - buildResearchPrompt(gameConcept): constructs system+user prompt for Player Agent research
 *
 * All prompt text is hardcoded — never sourced from external data.
 */

import { ZodError, type ZodIssue } from "zod";
import { GameConceptInputSchema } from "@shared/schema";

// ─── Typed Error ──────────────────────────────────────────

export class SanitizationError extends Error {
  public readonly issues: ZodIssue[];

  constructor(zodError: ZodError) {
    const summary = zodError.issues
      .map((i) => `[${i.path.join(".")}] ${i.message}`)
      .join("; ");
    super(`Sanitization failed: ${summary}`);
    this.name = "SanitizationError";
    this.issues = zodError.issues;
  }
}

// ─── Sanitize ─────────────────────────────────────────────

/**
 * Validates and cleans a raw user string through GameConceptInputSchema.
 * On success returns the transformed/cleaned string.
 * On failure throws a SanitizationError with full Zod issue details.
 */
export function sanitizeForPrompt(input: string): string {
  const result = GameConceptInputSchema.safeParse(input);

  if (!result.success) {
    throw new SanitizationError(result.error);
  }

  return result.data;
}

// ─── Research Prompt Builder ──────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are a senior game design researcher. Your job is to analyze a game concept and produce a comprehensive research bible that downstream agents will use to build the game.

You MUST respond with valid JSON matching the exact structure below. Do not include any text outside the JSON object.

{
  "genre": "Primary genre (e.g. Platformer, RPG, Roguelike, Puzzle, etc.)",
  "subGenre": "More specific sub-genre classification (e.g. Metroidvania, Action-RPG, Tower Defense, etc.)",
  "themes": ["theme1", "theme2", "theme3"],
  "targetAudience": "Description of the ideal player demographic, age range, and gaming preferences",
  "artDirection": {
    "style": "Recommended art style (e.g. pixel-art, hand-drawn, cel-shaded, low-poly)",
    "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
    "references": ["Visual reference game or artwork 1", "Visual reference 2"],
    "mood": "Overall visual mood (e.g. whimsical, dark, vibrant, muted)"
  },
  "mechanics": {
    "core": ["Primary mechanic 1", "Primary mechanic 2"],
    "secondary": ["Supporting mechanic 1", "Supporting mechanic 2"],
    "inspirations": ["Game that inspired mechanic design 1", "Game 2"]
  },
  "narrativeFramework": {
    "tone": "Narrative tone (e.g. lighthearted, gritty, mysterious, comedic)",
    "perspective": "Narrative perspective (e.g. first-person, third-person, omniscient)",
    "worldBuilding": "Brief description of the world and its rules",
    "storyStructure": "Recommended story structure (e.g. three-act, episodic, open-ended)"
  },
  "competitiveAnalysis": [
    {
      "title": "Comparable Game Title",
      "relevance": "Why this game is relevant to the concept",
      "takeaways": ["What to learn from this title", "Another takeaway"]
    }
  ],
  "generatedAt": "ISO 8601 timestamp",
  "version": 1
}

Guidelines:
- Identify the genre and sub-genre with confidence. Pick the best fit, don't hedge.
- Extract 2-5 core themes from the concept.
- Suggest an art direction that fits the concept's tone and target audience.
- List 2-4 core mechanics and 2-4 secondary mechanics.
- Provide a narrative framework even if the concept is light on story — infer what fits.
- Include 3-5 comparable titles in the competitive analysis, each with concrete takeaways.
- Be specific and actionable. Downstream agents will use this to generate art, code, and narrative.`;

/**
 * Builds the full system + user prompt pair for the Player Agent research task.
 * The gameConcept is sanitized before embedding.
 *
 * Returns an object with `system` and `user` prompt strings.
 */
export function buildResearchPrompt(gameConcept: string): {
  system: string;
  user: string;
} {
  const sanitized = sanitizeForPrompt(gameConcept);

  const userPrompt = `Analyze the following game concept and produce a complete research bible as specified.

Game Concept:
"""${sanitized}"""\n\nRespond with the JSON research bible only. No additional commentary.`;

  return {
    system: RESEARCH_SYSTEM_PROMPT,
    user: userPrompt,
  };
}
