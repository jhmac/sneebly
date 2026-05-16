/**
 * ai-client.ts
 *
 * Minimal AI client wrapper. One function, no classes, no abstractions.
 * Supports Anthropic Claude (primary) with exponential backoff retry.
 *
 * Why: Every agent in the pipeline needs to call an LLM. Rather than
 * duplicating retry logic everywhere, this single function handles it.
 * Inline and simple — easy to audit, easy to replace.
 */

const BASE_DELAY_MS = 1000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay with jitter.
 * attempt=0 → ~1s, attempt=1 → ~2s, attempt=2 → ~4s
 */
function backoffDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 200; // up to 200ms jitter
  return exponential + jitter;
}

/**
 * callAI — calls the Anthropic API with inline retry and exponential backoff.
 *
 * @param prompt     The user prompt to send.
 * @param options    Optional overrides for maxRetries and model.
 * @returns          Raw text response from the model.
 * @throws           After maxRetries exhausted, throws the last error.
 */
export async function callAI(
  prompt: string,
  options?: { maxRetries?: number; model?: string }
): Promise<string> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const model = options?.model ?? "claude-opus-4-5";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[ai-client] ANTHROPIC_API_KEY is not set. Cannot call AI."
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(
      `[ai-client] Attempt ${attempt + 1}/${maxRetries} — model: ${model}`
    );

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `[ai-client] HTTP ${response.status}: ${errorBody}`
        );
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
      };

      const textBlock = data.content?.find((block) => block.type === "text");
      if (!textBlock || typeof textBlock.text !== "string") {
        throw new Error(
          "[ai-client] Unexpected response shape — no text block found"
        );
      }

      console.log(
        `[ai-client] Success on attempt ${attempt + 1} — ${textBlock.text.length} chars returned`
      );
      return textBlock.text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[ai-client] Attempt ${attempt + 1} failed: ${lastError.message}`
      );

      if (attempt < maxRetries - 1) {
        const delay = backoffDelay(attempt);
        console.log(
          `[ai-client] Retrying in ${Math.round(delay)}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `[ai-client] All ${maxRetries} attempts failed. Last error: ${
      lastError?.message ?? "unknown"
    }`
  );
}
