/**
 * openai.ts — re-implemented using Anthropic (no OpenAI key configured).
 * Preserves the same exported interface so callers don't need to change.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.SNEEBLY_ANTHROPIC_API_KEY });

export async function generateCompletion(prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("No text content in response");
  }
  return block.text;
}

export { anthropic as openai };
