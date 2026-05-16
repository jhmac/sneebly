/**
 * Prompt Builder Module
 *
 * Zod-validated prompt construction for the 4-phase research pipeline.
 * User input is NEVER interpolated into system prompts — it only appears
 * in the userPrompt field. This is a security boundary.
 *
 * Phases:
 *   1. genre_detection    — identify genre, sub-genre, themes
 *   2. deep_research      — mechanics, narrative, art direction deep-dive
 *   3. comparable_titles  — competitive analysis of similar games
 *   4. best_practices     — technical constraints and design best practices
 */

import { z } from "zod";
import { GameConceptInputSchema } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────

export const ResearchPhaseSchema = z.enum([
  "genre_detection",
  "deep_research",
  "comparable_titles",
  "best_practices",
]);

export type ResearchPhase = z.infer<typeof ResearchPhaseSchema>;

export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Typed error thrown when GameConceptInputSchema validation fails.
 * Carries the original Zod issues for structured error handling.
 */
export class GameConceptValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    const summary = issues.map((i) => `[${i.path.join(".")}] ${i.message}`).join("; ");
    super(`Game concept validation failed: ${summary}`);
    this.name = "GameConceptValidationError";
    this.issues = issues;
  }
}

// ─── Phase-Specific System Prompts ────────────────────────

const PHASE_SYSTEM_PROMPTS: Record<ResearchPhase, string> = {
  genre_detection: `You are a game genre classification expert. Analyze the provided game concept and return a JSON object with the following structure:

{
  "genre": "string — primary genre (e.g. platformer, RPG, roguelike)",
  "subGenre": "string — sub-genre if applicable (e.g. metroidvania, action-RPG)",
  "themes": ["string array — core thematic elements (e.g. exploration, survival, humor)"],
  "targetAudience": "string — target demographic description"
}

Rules:
- Return ONLY valid JSON. No markdown fences, no commentary.
- Be specific. "Action" alone is too broad — narrow it down.
- Themes should capture the emotional and narrative tone, not just mechanics.
- If the concept is ambiguous, pick the most likely classification and note alternatives in themes.`,

  deep_research: `You are a senior game designer conducting deep research on a game concept. Analyze the provided concept and return a JSON object with the following structure:

{
  "artDirection": {
    "style": "string — art style (e.g. pixel-art, hand-drawn, cel-shaded)",
    "colorPalette": ["string array — suggested hex colors or color descriptors"],
    "references": ["string array — visual reference games or media"],
    "mood": "string — overall visual mood"
  },
  "mechanics": {
    "core": ["string array — primary gameplay mechanics"],
    "secondary": ["string array — supporting mechanics"],
    "inspirations": ["string array — games that inspired these mechanics"]
  },
  "narrativeFramework": {
    "tone": "string — narrative tone (e.g. lighthearted, dark, satirical)",
    "perspective": "string — narrative perspective (e.g. first-person, omniscient)",
    "worldBuilding": "string — world-building approach description",
    "storyStructure": "string — story structure (e.g. linear, branching, emergent)"
  }
}

Rules:
- Return ONLY valid JSON. No markdown fences, no commentary.
- Be concrete and actionable. Vague suggestions are useless.
- Reference real games when possible to ground recommendations.
- Art direction should be implementable by a 2D sprite artist.`,

  comparable_titles: `You are a game market analyst. Analyze the provided game concept and identify comparable titles. Return a JSON object with the following structure:

{
  "competitiveAnalysis": [
    {
      "title": "string — game title",
      "relevance": "string — why this game is comparable",
      "takeaways": ["string array — specific lessons or patterns to adopt or avoid"]
    }
  ]
}

Rules:
- Return ONLY valid JSON. No markdown fences, no commentary.
- Include 3-6 comparable titles, ranked by relevance.
- Each title must have at least 2 concrete takeaways.
- Include both successful and cautionary examples.
- Focus on games released in the last 10 years when possible.`,

  best_practices: `You are a game technical director specializing in 2D browser games. Analyze the provided game concept and return a JSON object with the following structure:

{
  "technicalConstraints": {
    "engine": "string — recommended engine or framework (default to Phaser 3 for browser games)",
    "platform": "string — target platform (e.g. web-browser, mobile-web)",
    "resolution": "string — recommended base resolution",
    "performanceBudget": "string — performance targets and constraints"
  }
}

Rules:
- Return ONLY valid JSON. No markdown fences, no commentary.
- Assume Phaser 3 as the engine unless the concept strongly suggests otherwise.
- Performance budget should be specific (e.g. "60fps on mid-range mobile, <200MB total assets").
- Resolution should account for the art style and target platform.
- Be practical — these constraints will be used by artists and developers.`,
};

// ─── Builder Function ─────────────────────────────────────

/**
 * Builds a validated, phase-specific prompt pair for the research pipeline.
 *
 * Security: gameConcept is validated through GameConceptInputSchema (strips
 * control chars, enforces length, rejects prompt injection patterns) and is
 * ONLY placed in the userPrompt. System prompts are static templates.
 *
 * @param gameConcept - Raw user input describing their game idea
 * @param phase - One of the 4 research phases
 * @returns { systemPrompt, userPrompt } ready for LLM consumption
 * @throws GameConceptValidationError if input fails Zod validation
 * @throws z.ZodError if phase is not a valid ResearchPhase
 */
export function buildResearchPrompt(
  gameConcept: string,
  phase: string,
): PromptPair {
  // 1. Validate phase
  const validatedPhase = ResearchPhaseSchema.parse(phase);

  // 2. Validate and sanitize game concept through Zod schema
  const conceptResult = GameConceptInputSchema.safeParse(gameConcept);

  if (!conceptResult.success) {
    // Log the rejection for security monitoring
    console.error(
      `[prompt-builder] Game concept validation failed. Issues: ${JSON.stringify(conceptResult.error.issues)}`,
    );
    throw new GameConceptValidationError(conceptResult.error.issues);
  }

  const sanitizedConcept = conceptResult.data;

  // 3. Build the prompt pair — user input NEVER touches the system prompt
  const systemPrompt = PHASE_SYSTEM_PROMPTS[validatedPhase];

  const userPrompt = `Game Concept:\n\n${sanitizedConcept}`;

  return { systemPrompt, userPrompt };
}
