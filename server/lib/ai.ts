/**
 * ai.ts — Anthropic-based text generation (replaces the Gemini version).
 * Keeps the original exported function name so callers don't need to change.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.SNEEBLY_ANTHROPIC_API_KEY });

export async function generateWithGemini(prompt: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("AI returned no text content");
  }
  return block.text;
}
