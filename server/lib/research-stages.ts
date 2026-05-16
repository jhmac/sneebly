import { z } from "zod";
import { ResearchBibleSchema, type ResearchBible } from "@shared/schema";
import { callAI } from "./ai-client";

// ─── Subset Schemas ───────────────────────────────────────

const GenreResultSchema = ResearchBibleSchema.pick({
  genre: true,
  subGenre: true,
  themes: true,
  targetAudience: true,
});

const DeepResearchResultSchema = ResearchBibleSchema.pick({
  artDirection: true,
  narrativeFramework: true,
});

const CompetitiveResultSchema = ResearchBibleSchema.pick({
  competitiveAnalysis: true,
});

const BestPracticesResultSchema = ResearchBibleSchema.pick({
  mechanics: true,
  technicalConstraints: true,
});

// ─── Helpers ──────────────────────────────────────────────

/**
 * Attempts to parse a JSON string from AI output.
 * Strips markdown fences and leading/trailing whitespace before parsing.
 */
function parseJSONResponse(raw: string): unknown {
  let cleaned = raw.trim();
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return JSON.parse(cleaned);
}

/**
 * Extracts the text content from an AI response.
 * Handles both string responses and object responses with text/content fields.
 */
function extractText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (response && typeof response === "object") {
    const resp = response as Record<string, unknown>;
    if (typeof resp.text === "string") return resp.text;
    if (typeof resp.content === "string") return resp.content;
    if (typeof resp.message === "string") return resp.message;
    if (typeof resp.response === "string") return resp.response;
  }
  return String(response);
}

/**
 * Calls AI with a prompt, parses JSON response, validates with schema.
 * On malformed JSON, retries once with a stricter prompt before throwing.
 */
async function callAndValidate<T extends z.ZodTypeAny>(
  prompt: string,
  schema: T,
  retryContext: string,
): Promise<z.infer<T>> {
  let raw: string;

  // First attempt
  try {
    const aiResponse = await callAI({ systemPrompt: "You are a game design research analyst. Respond with valid JSON only — no markdown fences, no explanation text.", userPrompt: prompt });
    raw = extractText(aiResponse);
    const parsed = parseJSONResponse(raw);
    return schema.parse(parsed);
  } catch (firstError) {
    // If it's a Zod validation error on valid JSON, don't retry — the AI returned wrong shape
    // But if it's a JSON parse error, retry with stricter prompt
    const isJsonParseError =
      firstError instanceof SyntaxError ||
      (firstError instanceof Error && firstError.message.includes("JSON"));

    if (!isJsonParseError && firstError instanceof z.ZodError) {
      throw new Error(
        `AI returned valid JSON but failed schema validation for ${retryContext}: ${firstError.message}`,
      );
    }

    // Retry with stricter prompt
    const stricterPrompt = [
      "IMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.",
      "Do not include any text before or after the JSON object.",
      "",
      prompt,
    ].join("\n");

    try {
      const retryResponse = await callAI({ systemPrompt: "You are a game design research analyst. Respond with valid JSON only — no markdown fences, no explanation text.", userPrompt: stricterPrompt });
      raw = extractText(retryResponse);
      const parsed = parseJSONResponse(raw);
      return schema.parse(parsed);
    } catch (retryError) {
      throw new Error(
        `Failed to get valid JSON from AI for ${retryContext} after retry. ` +
          `Last error: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
      );
    }
  }
}

// ─── Stage 1: Genre Detection ─────────────────────────────

/**
 * Detects genre, sub-genre, themes, and target audience from a game concept.
 */
export async function detectGenre(
  concept: string,
): Promise<Pick<ResearchBible, "genre" | "subGenre" | "themes" | "targetAudience">> {
  const prompt = [
    "You are a game design research analyst. Analyze the following game concept and identify its genre classification.",
    "",
    "Game Concept:",
    concept,
    "",
    "Respond with a JSON object containing exactly these fields:",
    '- "genre": string — the primary game genre (e.g. "Platformer", "RPG", "Puzzle", "Action-Adventure")',
    '- "subGenre": string — a more specific sub-genre (e.g. "Metroidvania", "Tactical RPG", "Match-3")',
    '- "themes": string[] — 3-5 thematic elements (e.g. ["exploration", "friendship", "nature"])',
    '- "targetAudience": string — the target audience description (e.g. "Casual gamers aged 12-25 who enjoy cozy exploration games")',
    "",
    "Respond with ONLY the JSON object. No markdown, no explanation.",
  ].join("\n");

  return callAndValidate(prompt, GenreResultSchema, "detectGenre");
}

// ─── Stage 2: Deep Genre Research ─────────────────────────

/**
 * Researches art direction and narrative framework based on concept and detected genre.
 */
export async function researchGenreDeep(
  concept: string,
  genre: string,
): Promise<Pick<ResearchBible, "artDirection" | "narrativeFramework">> {
  const prompt = [
    "You are a game design research analyst specializing in art direction and narrative design.",
    `Analyze the following game concept within the "${genre}" genre and provide detailed art and narrative guidance.`,
    "",
    "Game Concept:",
    concept,
    "",
    "Respond with a JSON object containing exactly these fields:",
    '- "artDirection": object with:',
    '  - "style": string — the recommended art style (e.g. "16-bit pixel art", "hand-painted watercolor", "cel-shaded 3D")',
    '  - "colorPalette": string[] — 4-6 hex color codes that define the palette (e.g. ["#2D1B69", "#FF6B35"])',
    '  - "references": string[] — 2-4 visual reference games or art styles',
    '  - "mood": string — the overall visual mood (e.g. "whimsical and warm", "dark and foreboding")',
    '- "narrativeFramework": object with:',
    '  - "tone": string — narrative tone (e.g. "lighthearted with moments of tension")',
    '  - "perspective": string — narrative perspective (e.g. "third-person omniscient", "first-person journal entries")',
    '  - "worldBuilding": string — approach to world-building (1-2 sentences)',
    '  - "storyStructure": string — recommended story structure (e.g. "three-act with branching side quests")',
    "",
    "Respond with ONLY the JSON object. No markdown, no explanation.",
  ].join("\n");

  return callAndValidate(prompt, DeepResearchResultSchema, "researchGenreDeep");
}

// ─── Stage 3: Competitive Analysis ────────────────────────

/**
 * Analyzes comparable titles in the genre for competitive insights.
 */
export async function analyzeComparableTitles(
  concept: string,
  genre: string,
): Promise<Pick<ResearchBible, "competitiveAnalysis">> {
  const prompt = [
    "You are a game market research analyst.",
    `Identify 3-5 comparable titles in the "${genre}" genre that are relevant to the following game concept.`,
    "",
    "Game Concept:",
    concept,
    "",
    "Respond with a JSON object containing exactly this field:",
    '- "competitiveAnalysis": array of objects, each with:',
    '  - "title": string — the game title (must be a real, published game)',
    '  - "relevance": string — why this title is relevant (1-2 sentences)',
    '  - "takeaways": string[] — 2-3 specific lessons or design patterns to learn from this title',
    "",
    "Include 3-5 titles. Focus on games that share mechanical or thematic DNA with the concept.",
    "",
    "Respond with ONLY the JSON object. No markdown, no explanation.",
  ].join("\n");

  return callAndValidate(prompt, CompetitiveResultSchema, "analyzeComparableTitles");
}

// ─── Stage 4: Best Practices & Mechanics ──────────────────

/**
 * Extracts recommended mechanics and technical constraints for the concept.
 */
export async function extractBestPractices(
  concept: string,
  genre: string,
): Promise<Pick<ResearchBible, "mechanics" | "technicalConstraints">> {
  const prompt = [
    "You are a game design systems analyst.",
    `Recommend core mechanics and technical constraints for a "${genre}" game based on the following concept.`,
    "",
    "Game Concept:",
    concept,
    "",
    "Respond with a JSON object containing exactly these fields:",
    '- "mechanics": object with:',
    '  - "core": string[] — 3-5 core gameplay mechanics the game MUST have',
    '  - "secondary": string[] — 2-4 secondary mechanics that enhance the experience',
    '  - "inspirations": string[] — 2-3 games whose mechanics should inspire the design',
    '- "technicalConstraints": object with:',
    '  - "engine": string — recommended engine or framework (e.g. "Phaser 3", "Unity 2D")',
    '  - "platform": string — target platform (e.g. "Web (HTML5 Canvas)", "Mobile + Web")',
    '  - "resolution": string — recommended base resolution (e.g. "320x180 scaled to 1280x720")',
    '  - "performanceBudget": string — performance target (e.g. "60fps on mid-range mobile, <50MB total assets")',
    "",
    "Be specific and practical. These constraints will guide asset creation and development.",
    "",
    "Respond with ONLY the JSON object. No markdown, no explanation.",
  ].join("\n");

  return callAndValidate(prompt, BestPracticesResultSchema, "extractBestPractices");
}
