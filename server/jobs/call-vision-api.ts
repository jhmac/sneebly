/**
 * Vision API — wraps Anthropic's vision capability.
 * Returns a structured analysis result for uploaded images.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.SNEEBLY_ANTHROPIC_API_KEY });

export interface VisionAnalysisResult {
  analysisResult: string | null;
  extractedStyle: string | null;
  extractedPalette: string | null;
  extractedProportions: string | null;
  extractedPose: string | null;
}

export async function callVisionAPI(imageUrl: string): Promise<VisionAnalysisResult> {
  const prompt = `Analyse this game character/sprite image and return a JSON object with these exact keys:
- analysisResult: a general description of the image
- extractedStyle: the visual art style (e.g. pixel art, hand-drawn, 3D rendered)
- extractedPalette: the dominant colour palette as a comma-separated list
- extractedProportions: body proportion style (e.g. chibi, realistic, stylized)
- extractedPose: the character's pose or stance

Return ONLY valid JSON with no markdown or explanation.`;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    return { analysisResult: null, extractedStyle: null, extractedPalette: null, extractedProportions: null, extractedPose: null };
  }

  try {
    const parsed = JSON.parse(block.text);
    return {
      analysisResult: parsed.analysisResult ?? null,
      extractedStyle: parsed.extractedStyle ?? null,
      extractedPalette: parsed.extractedPalette ?? null,
      extractedProportions: parsed.extractedProportions ?? null,
      extractedPose: parsed.extractedPose ?? null,
    };
  } catch {
    return { analysisResult: block.text, extractedStyle: null, extractedPalette: null, extractedProportions: null, extractedPose: null };
  }
}
