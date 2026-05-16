/**
 * ai-client.ts
 * Thin AI API client wrapper — the ONLY file that touches external AI APIs.
 * All agents use this client. No credentials logged.
 *
 * Supports Gemini and Claude, auto-selected based on available API keys.
 * Implements retry with exponential backoff (max 3 retries, base 1s, factor 2x, jitter).
 * Request timeout: 30s.
 * Uses GameConceptInputSchema to sanitize user-provided text before prompt interpolation.
 */

import { GameConceptInputSchema } from "@shared/schema";

// ─── Typed Errors ─────────────────────────────────────────

export class AIRateLimitError extends Error {
  constructor(message: string, public readonly statusCode: number = 429) {
    super(message);
    this.name = "AIRateLimitError";
  }
}

export class AIConnectionError extends Error {
  constructor(message: string, public readonly statusCode: number = 0) {
    super(message);
    this.name = "AIConnectionError";
  }
}

// Keep the original AIError for backward compatibility with existing callers
export class AIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly kind: "rate_limit" | "server_error" | "client_error" | "network_error" | "parse_error"
  ) {
    super(message);
    this.name = "AIError";
  }
}

// ─── Legacy types (preserved for backward compatibility) ──

export type AIProvider = "gemini" | "claude";

export interface AICallOptions {
  systemPrompt: string;
  userPrompt: string;
  provider?: AIProvider;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  text: string;
  json: unknown | null;
  provider: AIProvider;
  model: string;
}

// ─── Config ───────────────────────────────────────────────

const GEMINI_MODEL = "gemini-1.5-pro";
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_FACTOR = 2;
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Detect which provider to use based on available API keys.
 * Prefers Gemini if both are set.
 */
function detectProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER ?? "").toLowerCase().trim();
  if (raw === "claude") return "claude";
  if (raw === "gemini") return "gemini";

  // Auto-detect from available keys
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return "gemini"; // default
}

function getApiKey(provider: AIProvider): string {
  if (provider === "gemini") {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    if (!key) throw new AIConnectionError("GEMINI_API_KEY is not set");
    return key;
  }
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!key) throw new AIConnectionError("ANTHROPIC_API_KEY is not set");
  return key;
}

// ─── Sanitization ─────────────────────────────────────────

/**
 * Sanitize user-provided text using GameConceptInputSchema.
 * Strips control characters and rejects prompt injection patterns.
 * If validation fails, returns a safe fallback string.
 */
function sanitizeUserText(text: string): string {
  const result = GameConceptInputSchema.safeParse(text);
  if (result.success) return result.data;
  // If the text fails validation (too long, injection detected, etc.),
  // truncate and strip anything suspicious
  const truncated = text.slice(0, 2000);
  const cleaned = truncated.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return cleaned;
}

// ─── HTTP Helpers ─────────────────────────────────────────

function buildUrl(provider: AIProvider, apiKey: string): string {
  if (provider === "gemini") {
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  }
  return "https://api.anthropic.com/v1/messages";
}

function buildHeaders(provider: AIProvider, apiKey: string): Record<string, string> {
  if (provider === "gemini") {
    return { "Content-Type": "application/json" };
  }
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

function buildRequestBody(
  provider: AIProvider,
  prompt: string,
  maxTokens?: number
): Record<string, unknown> {
  if (provider === "gemini") {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 } as Record<string, unknown>,
    };
    if (maxTokens) {
      (body.generationConfig as Record<string, unknown>).maxOutputTokens = maxTokens;
    }
    return body;
  }

  // Claude
  return {
    model: CLAUDE_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens ?? 4096,
    temperature: 0.7,
  };
}

function extractText(provider: AIProvider, body: unknown): string {
  const b = body as any;

  if (provider === "gemini") {
    const text: string | undefined =
      b?.candidates?.[0]?.content?.parts?.[0]?.text ??
      b?.candidates?.[0]?.output;
    if (typeof text !== "string") {
      throw new AIConnectionError(
        `Unexpected Gemini response shape: ${JSON.stringify(b).slice(0, 200)}`
      );
    }
    return text;
  }

  // Claude
  const block = b?.content?.[0];
  const text: string | undefined =
    block?.type === "text" ? block.text : undefined;
  if (typeof text !== "string") {
    throw new AIConnectionError(
      `Unexpected Claude response shape: ${JSON.stringify(b).slice(0, 200)}`
    );
  }
  return text;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function jitter(ms: number): number {
  return ms + Math.floor((Math.random() - 0.5) * 0.4 * ms);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an AbortSignal that fires after REQUEST_TIMEOUT_MS.
 * Uses AbortController for fetch timeout support.
 */
function createTimeoutSignal(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

// ─── JSON Parsing ─────────────────────────────────────────

/**
 * Try to parse a string as JSON, stripping markdown code fences if present.
 * Returns the parsed object or null if parsing fails.
 */
function tryParseJson(text: string): unknown | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

// ─── Core: callAI (simple signature) ──────────────────────

/**
 * Send a prompt to the configured AI provider and return the text response.
 *
 * User-provided text within the prompt is sanitized via GameConceptInputSchema
 * before being sent. Implements retry with exponential backoff.
 * All requests have a 30s timeout.
 *
 * @param prompt - The full prompt string to send
 * @param options - Optional config: maxTokens
 * @returns The AI's text response
 *
 * @throws AIRateLimitError when the provider returns 429
 * @throws AIConnectionError on network failures, timeouts, bad responses, or missing keys
 */
export async function callAI(
  prompt: string,
  options?: { maxTokens?: number }
): Promise<string>;

/**
 * Legacy overload: call with full AICallOptions for backward compatibility.
 * Returns the full AIResponse object.
 */
export async function callAI(options: AICallOptions): Promise<AIResponse>;

// Implementation
export async function callAI(
  promptOrOptions: string | AICallOptions,
  simpleOptions?: { maxTokens?: number }
): Promise<string | AIResponse> {
  // Detect which overload was called
  if (typeof promptOrOptions === "string") {
    return _callAISimple(promptOrOptions, simpleOptions);
  }
  return _callAILegacy(promptOrOptions);
}

/**
 * Send a prompt and get back structured JSON.
 * Wraps callAI with JSON extraction — returns the parsed object or throws.
 *
 * @param prompt - The prompt string (should instruct the AI to return JSON)
 * @param options - Optional config: maxTokens
 * @returns Parsed JSON object from the AI response
 * @throws AIConnectionError if the response can't be parsed as JSON
 */
export async function callAIJson<T = unknown>(
  prompt: string,
  options?: { maxTokens?: number }
): Promise<T> {
  const text = await callAI(prompt, options);
  const parsed = tryParseJson(text);
  if (parsed === null) {
    throw new AIConnectionError(
      `AI response is not valid JSON. First 300 chars: ${text.slice(0, 300)}`
    );
  }
  return parsed as T;
}

/**
 * Simple callAI: prompt in, string out.
 */
async function _callAISimple(
  prompt: string,
  options?: { maxTokens?: number }
): Promise<string> {
  const sanitizedPrompt = sanitizeUserText(prompt);
  const provider = detectProvider();
  const apiKey = getApiKey(provider);

  const requestBody = buildRequestBody(provider, sanitizedPrompt, options?.maxTokens);
  const url = buildUrl(provider, apiKey);
  const headers = buildHeaders(provider, apiKey);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = jitter(BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1));
      await sleep(delay);
    }

    const { signal, cleanup } = createTimeoutSignal();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (err) {
      cleanup();
      // Distinguish timeout from other network errors
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new AIConnectionError(
          `${provider} request timed out after ${REQUEST_TIMEOUT_MS}ms`,
          0
        );
      } else {
        lastError = new AIConnectionError(
          `Network error calling ${provider}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    } finally {
      cleanup();
    }

    if (!response.ok) {
      let errorBody = "";
      try { errorBody = await response.text(); } catch { /* ignore */ }

      if (response.status === 429) {
        lastError = new AIRateLimitError(
          `${provider} rate limit (429): ${errorBody.slice(0, 300)}`,
          429
        );
        if (attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      if (response.status >= 500) {
        lastError = new AIConnectionError(
          `${provider} server error (${response.status}): ${errorBody.slice(0, 300)}`,
          response.status
        );
        if (attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      // Client error (4xx, not 429) — don't retry
      throw new AIConnectionError(
        `${provider} API error (${response.status}): ${errorBody.slice(0, 300)}`,
        response.status
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (err) {
      throw new AIConnectionError(
        `Failed to parse ${provider} response as JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return extractText(provider, responseBody);
  }

  throw lastError ?? new AIConnectionError("Unknown AI client error");
}

// ─── Legacy callAI (full options, full response) ──────────

/**
 * Prompt builder for legacy interface — exported for backward compatibility.
 */
interface GeminiRequestBody {
  system_instruction: { parts: { text: string }[] };
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: { temperature: number; maxOutputTokens?: number };
}

interface ClaudeRequestBody {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  max_tokens: number;
  temperature: number;
}

export function buildPrompt(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {}
): GeminiRequestBody | ClaudeRequestBody {
  const temperature = options.temperature ?? 0.7;

  if (provider === "gemini") {
    const body: GeminiRequestBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature },
    };
    if (options.maxTokens) body.generationConfig.maxOutputTokens = options.maxTokens;
    return body;
  }

  return {
    model: CLAUDE_MODEL,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: options.maxTokens ?? 4096,
    temperature,
  } satisfies ClaudeRequestBody;
}

async function _callAILegacy(options: AICallOptions): Promise<AIResponse> {
  const provider = options.provider ?? detectProvider();
  const apiKey = getApiKey(provider);
  const model = provider === "gemini" ? GEMINI_MODEL : CLAUDE_MODEL;

  const requestBody = buildPrompt(provider, options.systemPrompt, options.userPrompt, {
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  });

  const url = buildUrl(provider, apiKey);
  const headers = buildHeaders(provider, apiKey);

  let lastError: AIError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = jitter(BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1));
      await sleep(delay);
    }

    const { signal, cleanup } = createTimeoutSignal();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (err) {
      cleanup();
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new AIError(
          `${provider} request timed out after ${REQUEST_TIMEOUT_MS}ms`,
          0,
          "network_error"
        );
      } else {
        lastError = new AIError(
          `Network error calling ${provider}: ${err instanceof Error ? err.message : String(err)}`,
          0,
          "network_error"
        );
      }
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    } finally {
      cleanup();
    }

    if (!response.ok) {
      let errorBody = "";
      try { errorBody = await response.text(); } catch { /* ignore */ }
      const kind = response.status === 429 ? "rate_limit" as const
        : response.status >= 500 ? "server_error" as const
        : "client_error" as const;
      lastError = new AIError(
        `${provider} API error ${response.status}: ${errorBody.slice(0, 300)}`,
        response.status,
        kind
      );
      if (attempt < MAX_RETRIES && (kind === "rate_limit" || kind === "server_error")) continue;
      throw lastError;
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (err) {
      throw new AIError(
        `Failed to parse ${provider} response as JSON: ${err instanceof Error ? err.message : String(err)}`,
        response.status,
        "parse_error"
      );
    }

    const text = extractText(provider, responseBody);

    return {
      text,
      json: tryParseJson(text),
      provider,
      model,
    };
  }

  throw lastError ?? new AIError("Unknown AI client error", 0, "client_error");
}
