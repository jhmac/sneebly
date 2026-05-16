/**
 * Player Agent Pipeline
 *
 * Four independent research steps that build up a ResearchBible incrementally.
 * Each step validates the concept input (defense in depth), calls AI, and parses
 * the response with the relevant ResearchBibleSchema subset — falling back to
 * empty defaults on parse failure rather than crashing.
 *
 * The exported async generator `runPlayerPipeline` yields after each step,
 * allowing the caller to persist incremental progress.
 */

import { z } from "zod";
import {
  GameConceptInputSchema,
  ResearchBibleSchema,
  type ResearchBible,
} from "@shared/schema";
import { callAI } from "../call-ai";

// ─── Types ────────────────────────────────────────────────

export interface PipelineStep {
  name: string;
  execute: (
    concept: string,
    accumulated: Partial<ResearchBible>,
  ) => Promise<Partial<ResearchBible>>;
}

export interface PipelineYield {
  stepName: string;
  partial: Partial<ResearchBible>;
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Re-validate the concept string through GameConceptInputSchema.
 * Throws if the concept is invalid — defense in depth so every step
 * independently rejects bad input even if the caller forgot to validate.
 */
function validateConcept(concept: string): string {
  return GameConceptInputSchema.parse(concept);
}

/**
 * Attempt to parse raw AI JSON output against a Zod schema.
 * Returns the parsed value on success, or the provided fallback on failure.
 */
function safeParse<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.warn(
    "[PlayerPipeline] Parse failed, using fallback:",
    result.error.issues.map((i) => i.message).join("; "),
  );
  return fallback;
}

/**
 * Parse a JSON string from AI output. Handles markdown code fences and
 * other common wrapper patterns. Returns `undefined` if parsing fails.
 */
function parseJsonResponse(text: string): unknown | undefined {
  try {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    return JSON.parse(cleaned);
  } catch {
    console.warn("[PlayerPipeline] Failed to parse AI JSON response");
    return undefined;
  }
}

// ─── Step Schemas (subsets of ResearchBibleSchema) ────────

const GenreDetectionSchema = ResearchBibleSchema.pick({
  genre: true,
  subGenre: true,
  themes: true,
  targetAudience: true,
});

const DeepGenreResearchSchema = ResearchBibleSchema.pick({
  artDirection: true,
  narrativeFramework: true,
  technicalConstraints: true,
});

const ComparableTitlesSchema = ResearchBibleSchema.pick({
  competitiveAnalysis: true,
});

const BestPracticesSchema = ResearchBibleSchema.pick({
  mechanics: true,
});

// ─── Pipeline Steps ───────────────────────────────────────

const genreDetection: PipelineStep = {
  name: "genreDetection",
  async execute(concept: string, _accumulated: Partial<ResearchBible>) {
    const validConcept = validateConcept(concept);

    const prompt = `You are a game design research analyst. Analyze the following game concept and identify its genre classification.

Game Concept:
"${validConcept}"

Respond with ONLY a JSON object (no markdown, no explanation) with these fields:
- "genre": primary genre (string)
- "subGenre": sub-genre (string)
- "themes": array of thematic elements (string[])
- "targetAudience": target audience description (string)`;

    const aiResponse = await callAI(prompt);
    const parsed = parseJsonResponse(aiResponse);

    return safeParse(GenreDetectionSchema, parsed ?? {}, {
      genre: undefined,
      subGenre: undefined,
      themes: [],
      targetAudience: undefined,
    });
  },
};

const deepGenreResearch: PipelineStep = {
  name: "deepGenreResearch",
  async execute(concept: string, accumulated: Partial<ResearchBible>) {
    const validConcept = validateConcept(concept);

    const genreContext = accumulated.genre
      ? `The game has been classified as genre: "${accumulated.genre}" / sub-genre: "${accumulated.subGenre ?? "unknown"}".`
      : "Genre has not yet been determined.";

    const prompt = `You are a game design research analyst performing deep genre research.

${genreContext}

Game Concept:
"${validConcept}"

Respond with ONLY a JSON object (no markdown, no explanation) with these fields:
- "artDirection": { "style": string, "colorPalette": string[], "references": string[], "mood": string }
- "narrativeFramework": { "tone": string, "perspective": string, "worldBuilding": string, "storyStructure": string }
- "technicalConstraints": { "engine": string, "platform": string, "resolution": string, "performanceBudget": string }`;

    const aiResponse = await callAI(prompt);
    const parsed = parseJsonResponse(aiResponse);

    return safeParse(DeepGenreResearchSchema, parsed ?? {}, {
      artDirection: undefined,
      narrativeFramework: undefined,
      technicalConstraints: undefined,
    });
  },
};

const comparableTitles: PipelineStep = {
  name: "comparableTitles",
  async execute(concept: string, accumulated: Partial<ResearchBible>) {
    const validConcept = validateConcept(concept);

    const genreContext = accumulated.genre
      ? `Genre: "${accumulated.genre}" / Sub-genre: "${accumulated.subGenre ?? "unknown"}". Themes: ${(accumulated.themes ?? []).join(", ") || "unknown"}.`
      : "Genre context not yet available.";

    const prompt = `You are a game market research analyst. Identify comparable titles for competitive analysis.

${genreContext}

Game Concept:
"${validConcept}"

Respond with ONLY a JSON object (no markdown, no explanation) with this field:
- "competitiveAnalysis": array of objects, each with:
  - "title": game title (string)
  - "relevance": why it's relevant (string)
  - "takeaways": key lessons to learn (string[])

Provide 3-5 comparable titles.`;

    const aiResponse = await callAI(prompt);
    const parsed = parseJsonResponse(aiResponse);

    return safeParse(ComparableTitlesSchema, parsed ?? {}, {
      competitiveAnalysis: [],
    });
  },
};

const bestPractices: PipelineStep = {
  name: "bestPractices",
  async execute(concept: string, accumulated: Partial<ResearchBible>) {
    const validConcept = validateConcept(concept);

    const genreContext = accumulated.genre
      ? `Genre: "${accumulated.genre}" / Sub-genre: "${accumulated.subGenre ?? "unknown"}".`
      : "Genre context not yet available.";

    const mechanicsHint = accumulated.competitiveAnalysis?.length
      ? `Comparable titles: ${accumulated.competitiveAnalysis.map((c) => c.title).join(", ")}.`
      : "";

    const prompt = `You are a game design systems analyst. Define the core and secondary game mechanics.

${genreContext}
${mechanicsHint}

Game Concept:
"${validConcept}"

Respond with ONLY a JSON object (no markdown, no explanation) with this field:
- "mechanics": { "core": string[], "secondary": string[], "inspirations": string[] }`;

    const aiResponse = await callAI(prompt);
    const parsed = parseJsonResponse(aiResponse);

    return safeParse(BestPracticesSchema, parsed ?? {}, {
      mechanics: undefined,
    });
  },
};

// ─── Pipeline Definition ──────────────────────────────────

export const PLAYER_PIPELINE_STEPS: PipelineStep[] = [
  genreDetection,
  deepGenreResearch,
  comparableTitles,
  bestPractices,
];

// ─── Pipeline Runner ──────────────────────────────────────

/**
 * Runs the Player Agent pipeline as an async generator.
 * Yields after each step completes with the step name and the partial
 * ResearchBible fragment produced by that step. The caller can persist
 * incremental progress after each yield.
 *
 * The accumulated state is built up across steps so later steps can
 * reference earlier results (e.g., genre context feeds into comparable titles).
 */
export async function* runPlayerPipeline(
  concept: string,
): AsyncGenerator<PipelineYield> {
  // Validate once up front — steps also validate individually (defense in depth)
  const validConcept = validateConcept(concept);

  let accumulated: Partial<ResearchBible> = {};

  for (const step of PLAYER_PIPELINE_STEPS) {
    try {
      const partial = await step.execute(validConcept, accumulated);

      // Merge this step's output into the accumulated state
      accumulated = { ...accumulated, ...partial };

      yield {
        stepName: step.name,
        partial,
      };
    } catch (error) {
      console.error(
        `[PlayerPipeline] Step "${step.name}" failed:`,
        error instanceof Error ? error.message : error,
      );

      // Yield an empty partial so the caller knows the step ran but produced nothing.
      // This keeps the pipeline moving — we don't crash on a single step failure.
      yield {
        stepName: step.name,
        partial: {},
      };
    }
  }
}
