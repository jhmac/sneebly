/**
 * AI Provider Factory — provider-agnostic interface.
 * Both Gemini and Claude providers use Anthropic under the hood
 * since only SNEEBLY_ANTHROPIC_API_KEY is configured.
 */

import { withRetry } from "./retry";
import Anthropic from "@anthropic-ai/sdk";

// ─── Interface ────────────────────────────────────────────

export interface AIProvider {
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

// ─── Shared Anthropic call ────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.SNEEBLY_ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user" as const, content: userPrompt }],
  });
  const block = message.content[0];
  if (!block || block.type !== "text") throw new Error("Claude returned no text content");
  return block.text;
}

// ─── Gemini Provider (falls back to Claude) ───────────────

export function createGeminiProvider(): AIProvider {
  return {
    async generate(systemPrompt: string, userPrompt: string): Promise<string> {
      return withRetry(() => callClaude(systemPrompt, userPrompt), "gemini-generate");
    },
  };
}

// ─── Claude Provider ──────────────────────────────────────

export function createClaudeProvider(): AIProvider {
  return {
    async generate(systemPrompt: string, userPrompt: string): Promise<string> {
      return withRetry(() => callClaude(systemPrompt, userPrompt), "claude-generate");
    },
  };
}

// ─── Factory ──────────────────────────────────────────────

export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER ?? "claude").toLowerCase().trim();
  switch (provider) {
    case "gemini": return createGeminiProvider();
    case "claude": return createClaudeProvider();
    default:
      console.warn(`[ai-provider] Unknown AI_PROVIDER "${provider}". Falling back to claude.`);
      return createClaudeProvider();
  }
}
