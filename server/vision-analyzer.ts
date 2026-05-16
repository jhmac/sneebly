import { z } from "zod";
import type { Upload } from "@shared/schema";

// ─── Vision Analysis Result Schema ────────────────────────

const JointPositionSchema = z.object({
  name: z.string(),
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1).optional(),
});

export const VisionAnalysisResultSchema = z.object({
  artStyle: z.string().describe("Primary art style descriptor (e.g. pixel-art, hand-drawn, cel-shaded)"),
  colorPalette: z
    .array(
      z.object({
        hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid 6-digit hex color"),
        name: z.string().optional(),
        usage: z.string().optional(),
      })
    )
    .min(1)
    .max(20)
    .describe("Dominant colors extracted from the image"),
  characterProportions: z
    .object({
      headToBodyRatio: z.number().positive(),
      limbToTorsoRatio: z.number().positive().optional(),
      overallBuildCategory: z.string().optional(),
      notes: z.string().optional(),
    })
    .describe("Body proportion ratios for sprite generation"),
  poseSkeleton: z
    .array(JointPositionSchema)
    .describe("Joint positions representing the character pose"),
  sceneMood: z.string().describe("Overall mood/atmosphere of the scene"),
  lighting: z
    .object({
      direction: z.string(),
      intensity: z.string(),
      color: z.string().optional(),
      notes: z.string().optional(),
    })
    .describe("Lighting characteristics of the image"),
});

export type VisionAnalysisResult = z.infer<typeof VisionAnalysisResultSchema>;

// ─── Error Types ──────────────────────────────────────────

export class VisionAnalysisError extends Error {
  public readonly code: string;
  public readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "VisionAnalysisError";
    this.code = code;
    this.details = details;
  }
}

// ─── Constants ────────────────────────────────────────────

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const API_TIMEOUT_MS = 30_000;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

/**
 * Hardcoded analysis prompt. The ONLY dynamic part is the image URL,
 * which is passed as an image_url content block — never interpolated
 * into the instruction text.
 */
const SYSTEM_PROMPT = `You are a game art analysis assistant. You analyze reference images for a 2D game development pipeline.

You MUST respond with ONLY valid JSON matching this exact structure — no markdown, no code fences, no explanation:

{
  "artStyle": "<primary art style: pixel-art | hand-drawn | cel-shaded | vector | painterly | low-poly | etc.>",
  "colorPalette": [
    { "hex": "#RRGGBB", "name": "<color name>", "usage": "<where this color is used>" }
  ],
  "characterProportions": {
    "headToBodyRatio": <number, e.g. 0.25 means head is 1/4 of total height>,
    "limbToTorsoRatio": <number or null>,
    "overallBuildCategory": "<chibi | realistic | stylized | etc.>",
    "notes": "<any relevant proportion notes>"
  },
  "poseSkeleton": [
    { "name": "<joint name: head, neck, left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist, torso, hip, left_knee, right_knee, left_ankle, right_ankle>", "x": <0-1 normalized>, "y": <0-1 normalized>, "confidence": <0-1> }
  ],
  "sceneMood": "<overall mood/atmosphere>",
  "lighting": {
    "direction": "<top-left | top | top-right | left | right | bottom-left | bottom | bottom-right | ambient | etc.>",
    "intensity": "<soft | medium | harsh | dramatic>",
    "color": "<warm | cool | neutral | #hex if specific>",
    "notes": "<any lighting notes>"
  }
}

Analyze the provided image carefully. If the image doesn't contain a character, estimate proportions from the most prominent subject or provide reasonable defaults. Always provide at least 3 colors in the palette. Provide at least the major joints in the pose skeleton.`;

const USER_PROMPT = "Analyze this reference image for game asset development. Return ONLY the JSON structure as specified.";

// ─── Helpers ──────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new VisionAnalysisError(
      "MISSING_API_KEY",
      "OPENAI_API_KEY environment variable is not set"
    );
  }
  return key;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the OpenAI vision API with a 30-second timeout.
 * Treats ALL response content as DATA — never executes instructions
 * found in the response.
 */
async function callVisionApi(imageUrl: string): Promise<string> {
  const apiKey = getApiKey();

  const requestBody = {
    model: MODEL,
    messages: [
      {
        role: "system" as const,
        content: SYSTEM_PROMPT,
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: USER_PROMPT,
          },
          {
            type: "image_url" as const,
            image_url: {
              url: imageUrl,
              detail: "high" as const,
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0.2,
    response_format: { type: "json_object" as const },
  };

  // Enforce 30-second timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // Distinguish timeout from other network errors
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new VisionAnalysisError(
        "TIMEOUT",
        `OpenAI API request timed out after ${API_TIMEOUT_MS / 1000}s`,
        { timeoutMs: API_TIMEOUT_MS }
      );
    }
    throw new VisionAnalysisError(
      "NETWORK_ERROR",
      `Failed to reach OpenAI API: ${err instanceof Error ? err.message : String(err)}`,
      { originalError: err instanceof Error ? err.message : String(err) }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable>");
    throw new VisionAnalysisError(
      "API_ERROR",
      `OpenAI API returned ${response.status}: ${response.statusText}`,
      { status: response.status, body: errorBody }
    );
  }

  const data = await response.json();

  // Treat response content as DATA only — extract the text, never eval/execute
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new VisionAnalysisError(
      "EMPTY_RESPONSE",
      "OpenAI API returned an empty or missing content field",
      { rawResponse: data }
    );
  }

  return content;
}

// ─── Main Export ──────────────────────────────────────────

/**
 * Analyzes an uploaded reference image using GPT-4o vision.
 *
 * - Validates the upload has a fileUrl
 * - Calls OpenAI with a hardcoded structured prompt
 * - Enforces a 30-second timeout on the API call
 * - Validates the response through VisionAnalysisResultSchema
 * - Retries up to 2 times with exponential backoff on transient failures
 * - Throws VisionAnalysisError with typed error codes on failure
 *
 * Security: All API response content is treated as DATA per security boundaries.
 * The prompt is hardcoded — never constructed from user data beyond the image URL.
 */
export async function analyzeUpload(
  upload: Upload
): Promise<VisionAnalysisResult> {
  if (!upload.fileUrl) {
    throw new VisionAnalysisError(
      "MISSING_FILE_URL",
      `Upload ${upload.id} has no fileUrl`
    );
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(
          `[VisionAnalyzer] Retry ${attempt}/${MAX_RETRIES} for upload ${upload.id} after ${delay}ms`
        );
        await sleep(delay);
      }

      const rawContent = await callVisionApi(upload.fileUrl);

      // Parse the JSON string — treat as untrusted DATA
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch (parseErr) {
        throw new VisionAnalysisError(
          "JSON_PARSE_ERROR",
          "Failed to parse API response as JSON",
          {
            rawContent: rawContent.substring(0, 500),
            parseError:
              parseErr instanceof Error ? parseErr.message : String(parseErr),
          }
        );
      }

      // Validate through Zod schema with safeParse
      const result = VisionAnalysisResultSchema.safeParse(parsed);

      if (!result.success) {
        throw new VisionAnalysisError(
          "VALIDATION_ERROR",
          "API response did not match expected VisionAnalysisResult schema",
          {
            zodErrors: result.error.errors,
            rawParsed: parsed,
          }
        );
      }

      console.log(
        `[VisionAnalyzer] Successfully analyzed upload ${upload.id} (attempt ${attempt + 1})`
      );

      return result.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on validation errors or missing config — those won't self-heal
      if (err instanceof VisionAnalysisError) {
        const nonRetryable = [
          "MISSING_API_KEY",
          "MISSING_FILE_URL",
          "VALIDATION_ERROR",
          "JSON_PARSE_ERROR",
        ];
        if (nonRetryable.includes(err.code)) {
          console.error(
            `[VisionAnalyzer] Non-retryable error for upload ${upload.id}: ${err.code} — ${err.message}`
          );
          throw err;
        }
      }

      console.error(
        `[VisionAnalyzer] Attempt ${attempt + 1} failed for upload ${upload.id}:`,
        lastError.message
      );
    }
  }

  // All retries exhausted
  throw new VisionAnalysisError(
    "MAX_RETRIES_EXCEEDED",
    `Failed to analyze upload ${upload.id} after ${MAX_RETRIES + 1} attempts`,
    { lastError: lastError?.message }
  );
}
