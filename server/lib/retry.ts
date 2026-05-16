/**
 * Generic async retry with exponential backoff.
 *
 * Deliberately standalone — no dependencies beyond setTimeout.
 * Replaces inline retry logic across agent and API call sites.
 *
 * Usage:
 *   const result = await retryAsync(() => fetchSomething(), { maxRetries: 3, baseDelayMs: 250 });
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). The function is called up to maxRetries + 1 times total. */
  maxRetries?: number;
  /** Base delay in milliseconds before the first retry (default: 250). Doubles each attempt. */
  baseDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 250;

/**
 * Sleeps for the given number of milliseconds.
 * Extracted for testability — callers can mock this if needed.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff + jitter.
 *
 * @param fn - The async function to retry. Called with no arguments.
 * @param opts - Optional retry configuration.
 * @returns The resolved value of `fn` on the first successful attempt.
 * @throws The error from the last failed attempt after all retries are exhausted.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If we've used all retries, don't sleep — just fall through to throw.
      if (attempt >= maxRetries) {
        break;
      }

      // Exponential backoff: baseDelay * 2^attempt
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

      // Add jitter: random 0–50% of the exponential delay to avoid thundering herd
      const jitter = Math.random() * exponentialDelay * 0.5;

      const totalDelay = exponentialDelay + jitter;

      await sleep(totalDelay);
    }
  }

  // All retries exhausted — throw the last error
  throw lastError;
}

/** Alias for retryAsync — accepts an optional string label (ignored) for compatibility. */
export async function withRetry<T>(fn: () => Promise<T>, _label?: string): Promise<T> {
  return retryAsync(fn);
}
