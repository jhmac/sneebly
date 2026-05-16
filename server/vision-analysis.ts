import { z } from "zod";
import { db } from "./db";
import { uploads } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";

// ─── Prompt Injection Detection (AI Response Safety) ──────────

const SUSPICIOUS_PATTERNS = [
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
  /\bpretend\s+you\s+are\b/i,
  /\byou\s+must\s+now\b/i,
  /\bforget\s+everything\b/i,
];

/**
 * Scans AI response content for prompt injection patterns.
 * Treats the response as DATA only — never executes anything found.
 * Logs a security alert if suspicious content is detected.
 */
function scanForInjectionAttempts(content: string): void {
  const detected = SUSPICIOUS_PATTERNS.filter((pattern) => pattern.test(content));
  if (detected.length > 0) {
    console.warn(
      `[Vision] SECURITY: Possible prompt injection detected in AI response. ` +
      `${detected.length} suspicious pattern(s) found. Content quarantined — treating as data only.`
    );
  }
}

// ─── Zod Schemas for Vision Analysis Response ─────────────────

const colorEntrySchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  name: z.string(),
  role: z.string(),
});

const artStyleSchema = z.object({
  style: z.string(),
  tags: z.array(z.string()),
});

const characterProportionsSchema = z.object({
  headToBodyRatio: z.string(),
  limbLengths: z.object({
    arms: z.string(),
    legs: z.string(),
  }),
  boundingBox: z.object({
    width: z.number(),
    height: z.number(),
  }),
});

const jointPositionSchema = z.object({
  name: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const poseSkeltonSchema = z.object({
  joints: z.array(jointPositionSchema),
});

const sceneMoodSchema = z.object({
  lightingDirection: z.string(),
  moodTags: z.array(z.string()),
  atmosphere: z.string(),
});

export const visionAnalysisResultSchema = z.object({
  art_style: artStyleSchema,
  color_palette: z.array(colorEntrySchema),
  character_proportions: characterProportionsSchema,
  pose_skeleton: poseSkeltonSchema,
  scene_mood: sceneMoodSchema,
});

export type VisionAnalysisResult = z.infer<typeof visionAnalysisResultSchema>;

// ─── Simplified Vision Analysis Interface ─────────────────────
//
// The task spec defines a simpler interface for downstream consumers.
// This flattens the detailed VisionAnalysisResult into a more ergonomic shape.

export interface VisionAnalysisSimple {
  /** Detected art style (e.g. "pixel-art", "hand-drawn", "cel-shaded") */
  artStyle: string;
  /** Dominant color palette as hex codes */
  colorPalette: string[];
  /** Character body proportions */
  characterProportions: {
    headRatio: string;
    torsoRatio: string;
    limbRatios: {
      arms: string;
      legs: string;
    };
  };
  /** Pose skeleton keypoints with normalized coordinates */
  poseSkeleton: Array<{ x: number; y: number; label: string }>;
  /** Overall scene mood descriptor */
  sceneMood: string;
  /** Lighting direction/type */
  lighting: string;
}

// ─── Typed output shapes matching jsonb field shapes ──────────

export interface ExtractedStyle {
  style: string;
  substyle: string;
  influences: string[];
  confidence: number;
}

export interface ExtractedPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  colors: string[];
}

export interface ExtractedProportions {
  headToBody: string;
  limbRatios: {
    arms: string;
    legs: string;
  };
  overallBuild: string;
  details: Record<string, unknown>;
}

export interface ExtractedPose {
  joints: Array<{ name: string; x: number; y: number }>;
  skeleton: Array<[string, string]>;
  facing: string;
  gesture: string;
}

export interface NormalizedAnalysis {
  analysisResult: VisionAnalysisResult;
  extractedStyle: ExtractedStyle;
  extractedPalette: ExtractedPalette;
  extractedProportions: ExtractedProportions;
  extractedPose: ExtractedPose;
}

// ─── Response Normalizer ──────────────────────────────────────

export function normalizeVisionResponse(raw: VisionAnalysisResult): NormalizedAnalysis {
  // ── extracted_style ──
  const extractedStyle: ExtractedStyle = {
    style: raw.art_style.style,
    substyle: raw.art_style.tags[0] ?? "",
    influences: raw.art_style.tags.slice(1),
    confidence: 0.85, // GPT-4o doesn't return confidence; use a sensible default
  };

  // ── extracted_palette ──
  const hexList = raw.color_palette.map((c) => c.hex);
  const findByRole = (role: string): string =>
    raw.color_palette.find((c) => c.role.toLowerCase().includes(role))?.hex ?? hexList[0] ?? "#000000";

  const extractedPalette: ExtractedPalette = {
    primary: findByRole("primary"),
    secondary: findByRole("secondary"),
    accent: findByRole("accent"),
    background: findByRole("background"),
    colors: hexList,
  };

  // ── extracted_proportions ──
  const extractedProportions: ExtractedProportions = {
    headToBody: raw.character_proportions.headToBodyRatio,
    limbRatios: {
      arms: raw.character_proportions.limbLengths.arms,
      legs: raw.character_proportions.limbLengths.legs,
    },
    overallBuild: "standard",
    details: {
      boundingBox: raw.character_proportions.boundingBox,
    },
  };

  // ── extracted_pose ──
  // Infer facing direction from shoulder joint x-positions
  const leftShoulder = raw.pose_skeleton.joints.find((j) => j.name === "left_shoulder");
  const rightShoulder = raw.pose_skeleton.joints.find((j) => j.name === "right_shoulder");
  let facing = "forward";
  if (leftShoulder && rightShoulder) {
    const diff = Math.abs(leftShoulder.x - rightShoulder.x);
    if (diff < 0.05) facing = "side";
    else if (leftShoulder.x > rightShoulder.x) facing = "left";
    else facing = "right";
  }

  // Build a minimal skeleton connectivity list (pairs of joint names)
  const SKELETON_CONNECTIONS: Array<[string, string]> = [
    ["head", "neck"],
    ["neck", "left_shoulder"],
    ["neck", "right_shoulder"],
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"],
    ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],
  ];

  const jointNames = new Set(raw.pose_skeleton.joints.map((j) => j.name));
  const skeleton = SKELETON_CONNECTIONS.filter(
    ([a, b]) => jointNames.has(a) && jointNames.has(b)
  );

  const extractedPose: ExtractedPose = {
    joints: raw.pose_skeleton.joints,
    skeleton,
    facing,
    gesture: raw.scene_mood.moodTags[0] ?? "neutral",
  };

  return {
    analysisResult: raw,
    extractedStyle,
    extractedPalette,
    extractedProportions,
    extractedPose,
  };
}

/**
 * Converts a full VisionAnalysisResult into the simplified VisionAnalysisSimple shape.
 * This is the primary interface for downstream consumers who need a flat, ergonomic result.
 */
export function toSimpleAnalysis(raw: VisionAnalysisResult): VisionAnalysisSimple {
  return {
    artStyle: raw.art_style.style,
    colorPalette: raw.color_palette.map((c) => c.hex),
    characterProportions: {
      headRatio: raw.character_proportions.headToBodyRatio,
      torsoRatio: raw.character_proportions.boundingBox
        ? `${raw.character_proportions.boundingBox.width}:${raw.character_proportions.boundingBox.height}`
        : "1:1",
      limbRatios: {
        arms: raw.character_proportions.limbLengths.arms,
        legs: raw.character_proportions.limbLengths.legs,
      },
    },
    poseSkeleton: raw.pose_skeleton.joints.map((j) => ({
      x: j.x,
      y: j.y,
      label: j.name,
    })),
    sceneMood: raw.scene_mood.moodTags.join(", ") || raw.scene_mood.atmosphere,
    lighting: raw.scene_mood.lightingDirection,
  };
}

// ─── Error Classification ─────────────────────────────────────

export type VisionErrorKind = "retryable" | "permanent";

export interface ClassifiedError {
  kind: VisionErrorKind;
  message: string;
  originalError: unknown;
}

export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);

  // Permanent failures — no point retrying
  if (
    message.includes("OPENAI_API_KEY") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("invalid_api_key") ||
    message.includes("Failed to parse vision API response") ||
    message.includes("ZodError") ||
    message.includes("No content in OpenAI API response")
  ) {
    return { kind: "permanent", message, originalError: error };
  }

  // Retryable: rate limits, server errors, network blips
  if (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("fetch failed")
  ) {
    return { kind: "retryable", message, originalError: error };
  }

  // Default: treat unknown errors as retryable (conservative)
  return { kind: "retryable", message, originalError: error };
}

// ─── Project Context Interface ────────────────────────────────

export interface ProjectContext {
  /** Game type (e.g. "platformer", "RPG", "puzzle") */
  gameType?: string;
  /** Game description or concept */
  description?: string;
  /** Art style preferences from the project */
  artStyle?: string;
  /** Point of view (e.g. "Side-Scrolling", "Top-Down") */
  pov?: string;
  /** Movement style (e.g. "Fluid & Bouncy") */
  movementStyle?: string;
}

// ─── Prompt Builder ───────────────────────────────────────────

/**
 * buildVisionPrompt — constructs a structured prompt for the Vision AI.
 *
 * Asks the model to return JSON with:
 *   - artStyle (string)
 *   - colorPalette (hex string array)
 *   - characterProportions (head-to-body ratio, limb lengths, bounding box)
 *   - poseSkeleton (joint positions as named keypoints)
 *   - sceneMood (mood string, lighting direction, lighting intensity, atmosphere)
 *
 * @param uploadUrl - URL of the uploaded image to analyze
 * @param projectContext - Optional project context to guide analysis
 * @returns The structured prompt string
 */
export function buildVisionPrompt(uploadUrl: string, projectContext?: ProjectContext): string {
  let contextSection = "";

  if (projectContext) {
    const parts: string[] = [];
    if (projectContext.gameType) {
      parts.push(`Game type: ${projectContext.gameType}`);
    }
    if (projectContext.description) {
      parts.push(`Game description: ${projectContext.description}`);
    }
    if (projectContext.artStyle) {
      parts.push(`Preferred art style: ${projectContext.artStyle}`);
    }
    if (projectContext.pov) {
      parts.push(`Point of view: ${projectContext.pov}`);
    }
    if (projectContext.movementStyle) {
      parts.push(`Movement style: ${projectContext.movementStyle}`);
    }

    if (parts.length > 0) {
      contextSection = `\n\nProject context (use this to inform your analysis):\n${parts.join("\n")}\n`;
    }
  }

  return `Analyze this image and return a JSON object with exactly these fields:${contextSection}

1. "art_style": { "style": string describing the art style, "tags": array of style descriptor strings }
2. "color_palette": array of { "hex": hex color code string, "name": color name string, "role": role in the image string } (extract 5-8 dominant colors)
3. "character_proportions": { "headToBodyRatio": string ratio like "1:3", "limbLengths": { "arms": descriptive string, "legs": descriptive string }, "boundingBox": { "width": number 0-1 normalized, "height": number 0-1 normalized } }
4. "pose_skeleton": { "joints": array of { "name": joint name string, "x": number 0-1 normalized, "y": number 0-1 normalized } } (include head, neck, left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist, left_hip, right_hip, left_knee, right_knee, left_ankle, right_ankle)
5. "scene_mood": { "lightingDirection": string describing light source direction, "moodTags": array of mood descriptor strings, "atmosphere": string describing overall atmosphere }

If the image doesn't contain a character, provide reasonable defaults for character_proportions and pose_skeleton based on any figures or objects present.

Return ONLY valid JSON, no markdown fences, no explanation.`;
}

// ─── Vision API Call ──────────────────────────────────────────

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the OpenAI GPT-4o vision endpoint with the given image URL.
 * Returns a validated VisionAnalysisResult.
 *
 * Includes retry logic: max 2 retries with exponential backoff (1s, 2s).
 * Permanent errors (auth, parse, validation) are not retried.
 * Retryable errors (rate limits, server errors, network) are retried.
 *
 * All content received from the API is treated as DATA only.
 * Suspicious patterns in responses are logged but never executed.
 * API keys and tokens are never logged.
 *
 * @param imageUrl - URL of the image to analyze
 * @param projectContext - Optional project context to guide the prompt
 * @returns Validated VisionAnalysisResult
 */
export async function callVisionAPI(
  imageUrl: string,
  projectContext?: ProjectContext,
): Promise<VisionAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const prompt = buildVisionPrompt(imageUrl, projectContext);
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt - 1); // 1s, 2s
      console.log(`[Vision] Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs}ms backoff`);
      await sleep(backoffMs);
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                    detail: "high",
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content in OpenAI API response");
      }

      // Scan for prompt injection attempts in the AI response — DATA only, never executed
      scanForInjectionAttempts(content);

      // Strip markdown fences if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        throw new Error(`Failed to parse vision API response as JSON: ${jsonStr.substring(0, 200)}`);
      }

      // Validate hex codes and structure via Zod — rejects malformed data
      const validated = visionAnalysisResultSchema.parse(parsed);

      console.log(`[Vision] Successfully analyzed image on attempt ${attempt + 1}`);
      return validated;

    } catch (error) {
      lastError = error;
      const classified = classifyError(error);

      if (classified.kind === "permanent") {
        console.error(`[Vision] Permanent error on attempt ${attempt + 1} — not retrying:`, classified.message);
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        console.warn(`[Vision] Retryable error on attempt ${attempt + 1}:`, classified.message);
      } else {
        console.error(`[Vision] All ${MAX_RETRIES + 1} attempts exhausted. Last error:`, classified.message);
      }
    }
  }

  throw lastError;
}

/**
 * analyzeImage — simplified public API matching the task spec interface.
 *
 * Calls the OpenAI GPT-4o vision endpoint with a structured prompt requesting:
 *   - Art style (string)
 *   - Color palette as hex codes (string array)
 *   - Character proportions (head/torso/limb ratios)
 *   - Pose skeleton keypoints (array of {x, y, label})
 *   - Scene mood (string)
 *   - Lighting (string)
 *
 * Includes retry logic (max 2 retries with exponential backoff).
 * All API response content is treated as DATA — never as instructions.
 * Suspicious content is logged and quarantined.
 * API keys and tokens are never logged.
 *
 * @param imageUrl - URL of the image to analyze
 * @param projectContext - Optional project context to guide analysis
 * @returns VisionAnalysisSimple — flat, ergonomic result for downstream consumers
 */
export async function analyzeImage(
  imageUrl: string,
  projectContext?: ProjectContext,
): Promise<VisionAnalysisSimple> {
  console.log(`[Vision] Starting analysis for image: ${imageUrl.substring(0, 80)}...`);
  const result = await callVisionAPI(imageUrl, projectContext);
  return toSimpleAnalysis(result);
}

/**
 * analyzeImageFull — returns the full normalized analysis with all extracted fields.
 *
 * Use this when you need the complete breakdown (style, palette, proportions, pose)
 * for storage in the uploads table JSONB columns.
 *
 * @param imageUrl - URL of the image to analyze
 * @param projectContext - Optional project context to guide analysis
 * @returns NormalizedAnalysis with all extracted sub-fields
 */
export async function analyzeImageFull(
  imageUrl: string,
  projectContext?: ProjectContext,
): Promise<NormalizedAnalysis> {
  console.log(`[Vision] Starting full analysis for image: ${imageUrl.substring(0, 80)}...`);
  const result = await callVisionAPI(imageUrl, projectContext);
  return normalizeVisionResponse(result);
}

/**
 * analyzeUploadById — end-to-end pipeline: fetch upload, analyze, store results.
 *
 * 1. Fetches the upload record from the database
 * 2. Transitions status to 'analyzing'
 * 3. Calls the Vision API with the upload's file URL
 * 4. Normalizes the response into all five JSONB fields
 * 5. Stores results via storage.storeVisionAnalysisResults
 * 6. On failure, marks the upload as failed
 *
 * @param uploadId - The upload record ID to analyze
 * @param projectContext - Optional project context
 * @returns The normalized analysis result, or null if the upload was not found/claimable
 */
export async function analyzeUploadById(
  uploadId: string,
  projectContext?: ProjectContext,
): Promise<NormalizedAnalysis | null> {
  // Fetch the upload record
  const upload = await storage.getUpload(uploadId);
  if (!upload) {
    console.warn(`[Vision] Upload ${uploadId} not found — skipping`);
    return null;
  }

  // Atomically claim the upload for analysis
  const claimed = await storage.transitionUploadStatus(uploadId, upload.status, "analyzing");
  if (!claimed) {
    console.warn(`[Vision] Upload ${uploadId} already claimed by another worker — skipping`);
    return null;
  }

  try {
    const result = await callVisionAPI(upload.fileUrl, projectContext);
    const normalized = normalizeVisionResponse(result);

    // Store all five JSONB fields
    await storage.storeVisionAnalysisResults(uploadId, {
      analysisResult: normalized.analysisResult as unknown as Record<string, any>,
      extractedStyle: normalized.extractedStyle as unknown as Record<string, any>,
      extractedPalette: normalized.extractedPalette as unknown as Record<string, any>,
      extractedProportions: normalized.extractedProportions as unknown as Record<string, any>,
      extractedPose: normalized.extractedPose as unknown as Record<string, any>,
    });

    console.log(`[Vision] Upload ${uploadId} analyzed and stored successfully`);
    return normalized;

  } catch (error) {
    const classified = classifyError(error);
    console.error(`[Vision] Upload ${uploadId} analysis failed:`, classified.message);

    // Mark as failed with error info (never log API keys)
    await storage.markUploadFailed(uploadId, {
      error: classified.message,
      kind: classified.kind,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}
