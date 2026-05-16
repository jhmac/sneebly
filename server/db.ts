import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const { Pool } = pg;

// ─── Pool Configuration ───────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                        // Max clients in pool
  idleTimeoutMillis: 30_000,      // Close idle clients after 30s
  connectionTimeoutMillis: 5_000, // Fail if connect takes > 5s
});

// Log unexpected pool-level errors (e.g. backend termination)
pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

// ─── Retry Logic ──────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 250;

/**
 * PostgreSQL / network error codes that are safe to retry.
 * Includes connection errors, admin shutdowns, serialization
 * failures, and deadlocks.
 */
const TRANSIENT_ERROR_CODES = new Set([
  // Network / OS
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  // PostgreSQL operator-initiated
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  // PostgreSQL connection class
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  // Concurrency
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as any).code ?? (err as any).errno;
  if (typeof code === "string" && TRANSIENT_ERROR_CODES.has(code)) return true;
  const msg = ((err as any).message ?? "").toLowerCase();
  return (
    msg.includes("connection terminated") ||
    msg.includes("connection refused") ||
    msg.includes("timeout") ||
    msg.includes("econnreset")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with exponential-backoff retry for
 * transient DB/network errors.  Max 3 retries (4 total attempts),
 * delays: 250 ms → 500 ms → 1 000 ms.
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isTransientError(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[db] Transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${
            (err as Error).message ?? err
          }`
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  /* istanbul ignore next — belt-and-suspenders; loop always throws */
  throw lastError;
}

// ─── Wrap Pool with Retry ─────────────────────────────────
//
// Monkey-patch pool.query and pool.connect so that every
// consumer (drizzle, raw queries in routes, storage, etc.)
// automatically gets retry on transient failures.

const _originalQuery = pool.query.bind(pool) as (...a: unknown[]) => any;
(pool as any).query = function patchedQuery(...args: unknown[]) {
  // Callback-style call — pass through as-is
  if (typeof args[args.length - 1] === "function") {
    return _originalQuery.apply(pool, args);
  }
  // Promise-style call — wrap with retry
  return withRetry(() => _originalQuery.apply(pool, args));
};

const _originalConnect = pool.connect.bind(pool) as (...a: unknown[]) => any;
(pool as any).connect = function patchedConnect(...args: unknown[]) {
  // Callback-style
  if (typeof args[0] === "function") {
    return _originalConnect.apply(pool, args);
  }
  // Promise-style — wrap with retry
  return withRetry(() => _originalConnect.call(pool)) as any;
};

// ─── Drizzle Instance ─────────────────────────────────────

export const db = drizzle(pool);

// ─── Health Check ─────────────────────────────────────────

/**
 * Run `SELECT 1` to verify the database connection is alive.
 * Returns status, latency, and timestamp on success; throws on failure.
 * Can be imported by server/routes.ts for the /api/health endpoint.
 */
export async function checkDbHealth(): Promise<{
  status: string;
  latencyMs: number;
  timestamp: string;
}> {
  const start = Date.now();
  await db.execute(sql`SELECT 1`);
  return {
    status: "healthy",
    latencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
}

// Re-export pool for advanced use cases (e.g. graceful shutdown)
export { pool };
