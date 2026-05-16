/**
 * AI Gateway — thin abstraction over Anthropic's API.
 * Preserves the original interface (ProviderConfig, GatewayResult, callAI)
 * so callers don't need to change.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────

export interface ProviderConfig {
  model: string;
  apiKeyEnvVar: string;
  provider: "openai" | "anthropic";
}

export interface GatewayResult {
  success: boolean;
  data?: string;
  error?: string;
  attempts: number;
}

export interface GatewayOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

// ─── Retry Config ─────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_FACTOR = 2;

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as any).status ?? (error as any).statusCode ?? null;
  if (typeof status === "number") return status === 429 || status >= 500;
  const message = String((error as any).message ?? "").toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests") ||
    message.includes("server error") || message.includes("service unavailable");
}

function computeDelay(attempt: number): number {
  const base = BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
  return Math.round(base + base * 0.2 * (Math.random() * 2 - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(`[ai-gateway] ${message}`);
}

// ─── Main Export ──────────────────────────────────────────

export async function callAI(
  providerConfig: ProviderConfig,
  prompt: string,
  options: GatewayOptions = {}
): Promise<GatewayResult> {
  const apiKey = process.env[providerConfig.apiKeyEnvVar] || process.env.SNEEBLY_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: `API key env var '${providerConfig.apiKeyEnvVar}' not set`, attempts: 0 };
  }

  const client = new Anthropic({ apiKey });
  let lastError: unknown = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    log(`Attempt ${attempt}/${MAX_RETRIES} — model: ${providerConfig.model}`);
    try {
      const result = await client.messages.create({
        model: providerConfig.model,
        max_tokens: options.maxTokens ?? 2048,
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: prompt }],
      });

      const block = result.content[0];
      const text = block?.type === "text" ? block.text : "";
      log(`Attempt ${attempt} succeeded — ${text.length} chars`);
      return { success: true, data: text, attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = isRetryable(error);
      log(`Attempt ${attempt} failed — retryable: ${retryable}`);
      if (!retryable || attempt >= MAX_RETRIES) break;
      await sleep(computeDelay(attempt));
    }
  }

  const errorMessage = (lastError as any)?.message ?? String(lastError) ?? "Unknown error";
  return { success: false, error: errorMessage, attempts: attempt };
}
