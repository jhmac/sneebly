/**
 * AI Client Abstraction Layer
 *
 * Thin wrapper that isolates AI provider details from agent logic.
 * Reads AI_PROVIDER env var to decide which backend to call.
 * Returns raw text responses. Throws typed AIClientError so callers
 * can decide whether to retry (5xx / rate-limit) or fail fast (4xx auth).
 *
 * SECURITY: Never logs API keys.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Typed Error ──────────────────────────────────────────

export type AIProvider = "claude" | "gemini";

export class AIClientError extends Error {
  /** Which provider produced the error */
  public readonly provider: AIProvider;
  /** HTTP status code from the upstream API (0 if unknown / network error) */
  public readonly statusCode: number;
  /** Whether the caller should retry this request */
  public readonly retryable: boolean;

  constructor(
    message: string,
    opts: { provider: AIProvider; statusCode: number; retryable: boolean },
  ) {
    super(message);
    this.name = "AIClientError";
    this.provider = opts.provider;
    this.statusCode = opts.statusCode;
    this.retryable = opts.retryable;
  }
}

// ─── Helpers ──────────────────────────────────────────────

/** Determine whether an HTTP status code is retryable (5xx or 429 rate-limit). */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function getProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER || "claude").toLowerCase().trim();
  if (raw === "gemini") return "gemini";
  return "claude"; // default
}

// ─── Claude (Anthropic) ───────────────────────────────────

async function callClaude(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIClientError("ANTHROPIC_API_KEY is not set", {
      provider: "claude",
      statusCode: 0,
      retryable: false,
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text from the response content blocks
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    if (textBlocks.length === 0) {
      throw new AIClientError("Claude returned no text content", {
        provider: "claude",
        statusCode: 0,
        retryable: false,
      });
    }

    return textBlocks.map((b) => b.text).join("");
  } catch (error: unknown) {
    // Re-throw our own errors as-is
    if (error instanceof AIClientError) throw error;

    // Handle Anthropic SDK errors
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 0;
      throw new AIClientError(
        `Claude API error (${status}): ${error.message}`,
        {
          provider: "claude",
          statusCode: status,
          retryable: isRetryable(status),
        },
      );
    }

    // Network / unknown errors — assume retryable
    const msg =
      error instanceof Error ? error.message : "Unknown error calling Claude";
    throw new AIClientError(msg, {
      provider: "claude",
      statusCode: 0,
      retryable: true,
    });
  }
}

// ─── Gemini (Google) ──────────────────────────────────────

async function callGemini(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIClientError("GEMINI_API_KEY is not set", {
      provider: "gemini",
      statusCode: 0,
      retryable: false,
    });
  }

  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (networkError: unknown) {
    const msg =
      networkError instanceof Error
        ? networkError.message
        : "Network error calling Gemini";
    throw new AIClientError(msg, {
      provider: "gemini",
      statusCode: 0,
      retryable: true,
    });
  }

  if (!response.ok) {
    // Read body for error details but don't leak the API key
    let detail = "";
    try {
      const body = await response.text();
      detail = body.slice(0, 500);
    } catch {
      // ignore read errors
    }
    throw new AIClientError(
      `Gemini API error (${response.status}): ${detail}`,
      {
        provider: "gemini",
        statusCode: response.status,
        retryable: isRetryable(response.status),
      },
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new AIClientError("Failed to parse Gemini JSON response", {
      provider: "gemini",
      statusCode: 0,
      retryable: false,
    });
  }

  // Navigate Gemini response structure:
  // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string" || text.length === 0) {
    throw new AIClientError("Gemini returned no text content", {
      provider: "gemini",
      statusCode: 0,
      retryable: false,
    });
  }

  return text;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Call the configured AI provider with a prompt and system prompt.
 *
 * @param prompt      - The user/task prompt to send.
 * @param systemPrompt - The system-level instructions for the model.
 * @returns The raw text response from the AI provider.
 * @throws {AIClientError} with provider, statusCode, and retryable fields.
 */
export async function callAI(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const provider = getProvider();

  switch (provider) {
    case "claude":
      return callClaude(prompt, systemPrompt);
    case "gemini":
      return callGemini(prompt, systemPrompt);
    default: {
      // Exhaustive check — should never happen
      const _exhaustive: never = provider;
      throw new AIClientError(`Unknown AI provider: ${_exhaustive}`, {
        provider: "claude",
        statusCode: 0,
        retryable: false,
      });
    }
  }
}
