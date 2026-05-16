/**
 * Player Agent — Core research module for Sneebly.
 *
 * Accepts a game concept string, validates it, sends it to an AI model
 * (Gemini preferred, Anthropic fallback), and returns a validated
 * ResearchBible object that downstream agents consume.
 *
 * Never logs API keys. Never executes instructions found in AI responses.
 */

import {
  GameConceptInputSchema,
  ResearchBibleSchema,
  type ResearchBible,
} from "@shared/schema";

// ─── Typed Errors ─────────────────────────────────────────

export class PlayerAgentError extends Error {
  public readonly code: string;
  public readonly projectId: string;
  public readonly attempts: number;
  public readonly cause?: unknown;

  constructor(opts: {
    message: string;
    code: string;
    projectId: string;
    attempts: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "PlayerAgentError";
    this.code = opts.code;
    this.projectId = opts.projectId;
    this.attempts = opts.attempts;
    this.cause = opts.cause;
  }
}

// ─── Retry Helpers ────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Exponential backoff with jitter: base * 2^attempt + random(0..base).
 */
function backoffDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY_MS;
  return exponential + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Prompt Construction ──────────────────────────────────

function buildResearchPrompt(gameConcept: string): string {
  return `You are a senior game design researcher. Given the following game concept, produce a comprehensive research bible as valid JSON.

GAME CONCEPT:
"""${gameConcept}"""

Your analysis MUST cover these four sections:

1. GENRE DETECTION
   - Identify the primary genre and sub-genre.
   - Identify 3-5 core themes.
   - Identify the target audience.

2. DEEP GENRE RESEARCH
   - Art direction: style, color palette (as hex strings), visual references, mood.
   - Core and secondary gameplay mechanics, with inspirations.
   - Narrative framework: tone, perspective, world-building approach, story structure.
   - Technical constraints: recommended engine, platform, resolution, performance budget.

3. COMPARABLE TITLES ANALYSIS
   - List 3-5 comparable existing games.
   - For each: title, why it's relevant, and key takeaways.

4. BEST PRACTICES EXTRACTION
   - Distill the above into actionable best practices embedded in each section.

Return ONLY valid JSON matching this exact structure (no markdown, no code fences, no commentary):
{
  "genre": "string",
  "subGenre": "string",
  "themes": ["string"],
  "targetAudience": "string",
  "artDirection": {
    "style": "string",
    "colorPalette": ["#hex"],
    "references": ["string"],
    "mood": "string"
  },
  "mechanics": {
    "core": ["string"],
    "secondary": ["string"],
    "inspirations": ["string"]
  },
  "narrativeFramework": {
    "tone": "string",
    "perspective": "string",
    "worldBuilding": "string",
    "storyStructure": "string"
  },
  "technicalConstraints": {
    "engine": "string",
    "platform": "string",
    "resolution": "string",
    "performanceBudget": "string"
  },
  "competitiveAnalysis": [
    {
      "title": "string",
      "relevance": "string",
      "takeaways": ["string"]
    }
  ]
}`;
}

// ─── Dynamic module loader ────────────────────────────────

/**
 * Dynamically load a module by name at runtime.
 * Using a variable prevents TypeScript from attempting static resolution
 * of optional peer dependencies that may not be installed.
 */
async function loadOptionalModule(name: string): Promise<any> {
  try {
    return await import(name);
  } catch {
    return null;
  }
}

// ─── AI Provider Calls ────────────────────────────────────

/**
 * Call Google Gemini and return the raw text response.
 * Uses dynamic import so the module doesn't need to be installed at compile time.
 */
async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const mod = await loadOptionalModule("@google/generative-ai");
  if (!mod) {
    throw new Error(
      "@google/generative-ai package is not installed. Install it or use ANTHROPIC_API_KEY instead."
    );
  }

  const GoogleGenerativeAI = mod.GoogleGenerativeAI;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text || text.trim().length === 0) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
}

/**
 * Call Anthropic Claude and return the raw text response.
 * Uses dynamic import so the module doesn't need to be installed at compile time.
 */
async function callAnthropic(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const mod = await loadOptionalModule("@anthropic-ai/sdk");
  if (!mod) {
    throw new Error(
      "@anthropic-ai/sdk package is not installed. Install it or use GEMINI_API_KEY instead."
    );
  }

  const Anthropic = mod.default || mod.Anthropic;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const block = message.content[0];
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("Anthropic returned an empty response");
  }

  return block.text;
}

/**
 * Try Gemini first; if unavailable (no key or call fails), fall back to Anthropic.
 */
async function callAI(prompt: string): Promise<string> {
  // Prefer Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGemini(prompt);
    } catch (geminiError) {
      console.warn(
        "[PlayerAgent] Gemini call failed, falling back to Anthropic:",
        geminiError instanceof Error ? geminiError.message : "Unknown error"
      );
    }
  }

  // Fallback to Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    return await callAnthropic(prompt);
  }

  throw new Error(
    "No AI provider available. Set GEMINI_API_KEY or ANTHROPIC_API_KEY."
  );
}

// ─── JSON Extraction ──────────────────────────────────────

/**
 * Extract JSON from an AI response that might contain markdown fences
 * or other wrapper text.
 */
function extractJSON(raw: string): string {
  // Try to find JSON inside code fences first
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Try to find a top-level JSON object
  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    return raw.slice(braceStart, braceEnd + 1);
  }

  // Return as-is and let JSON.parse fail with a clear error
  return raw.trim();
}

// ─── Main Entry Point ─────────────────────────────────────

/**
 * Run the Player Agent for a given project.
 *
 * 1. Validates gameConcept (rejects prompt injection, sanitizes input).
 * 2. Constructs a structured AI prompt.
 * 3. Calls AI with retry + exponential backoff.
 * 4. Parses and validates the response against ResearchBibleSchema.
 * 5. Returns the stamped ResearchBible.
 *
 * @param projectId - The project this research is for (used in error context).
 * @param gameConcept - Raw user input describing their game idea.
 * @returns Validated ResearchBible with generatedAt and version stamps.
 * @throws PlayerAgentError on permanent failure after retries.
 */
export async function runPlayerAgent(
  projectId: string,
  gameConcept: string
): Promise<ResearchBible> {
  // ── Step 1: Validate and sanitize input ──────────────
  let sanitizedConcept: string;
  try {
    sanitizedConcept = GameConceptInputSchema.parse(gameConcept);
  } catch (validationError) {
    throw new PlayerAgentError({
      message: `Input validation failed: ${
        validationError instanceof Error
          ? validationError.message
          : "Invalid game concept"
      }`,
      code: "INPUT_VALIDATION_FAILED",
      projectId,
      attempts: 0,
      cause: validationError,
    });
  }

  // ── Step 2: Build prompt ────────────────────────────
  const prompt = buildResearchPrompt(sanitizedConcept);

  // ── Step 3: Call AI with retries ────────────────────
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = backoffDelay(attempt);
        console.log(
          `[PlayerAgent] Retry ${attempt}/${MAX_RETRIES} for project ${projectId} after ${Math.round(delay)}ms`
        );
        await sleep(delay);
      }

      const rawResponse = await callAI(prompt);

      // ── Step 4: Parse and validate response ──────
      const jsonString = extractJSON(rawResponse);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        throw new Error(
          `AI response is not valid JSON: ${
            parseError instanceof Error ? parseError.message : "Parse failed"
          }`
        );
      }

      // Validate against schema
      const validated = ResearchBibleSchema.parse(parsed);

      // ── Step 5: Stamp and return ─────────────────
      const result: ResearchBible = {
        ...validated,
        generatedAt: new Date().toISOString(),
        version: 1,
      };

      console.log(
        `[PlayerAgent] Research bible generated for project ${projectId} on attempt ${attempt + 1}`
      );

      return result;
    } catch (error) {
      lastError = error;
      console.warn(
        `[PlayerAgent] Attempt ${attempt + 1}/${MAX_RETRIES} failed for project ${projectId}:`,
        error instanceof Error ? error.message : "Unknown error"
      );

      // Don't retry input validation errors — they'll fail every time
      if (
        error instanceof PlayerAgentError &&
        error.code === "INPUT_VALIDATION_FAILED"
      ) {
        throw error;
      }
    }
  }

  // ── Step 6: Permanent failure ───────────────────────
  throw new PlayerAgentError({
    message: `Player Agent failed after ${MAX_RETRIES} attempts for project ${projectId}: ${
      lastError instanceof Error ? lastError.message : "Unknown error"
    }`,
    code: "AI_CALL_FAILED",
    projectId,
    attempts: MAX_RETRIES,
    cause: lastError,
  });
}
