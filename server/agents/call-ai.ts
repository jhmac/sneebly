/**
 * Shared AI caller for agent pipelines.
 * Uses Anthropic (Claude) via SNEEBLY_ANTHROPIC_API_KEY.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.SNEEBLY_ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function callAI(
  prompt: string,
  options: { model?: string; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const client = getClient();
  const model = options.model ?? "claude-3-5-sonnet-20241022";
  const maxTokens = options.maxTokens ?? 2048;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: "You are a game design research analyst. Respond with valid JSON only — no markdown fences, no explanation text.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("AI returned an empty response");
  }
  return block.text;
}
