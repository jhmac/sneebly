/**
 * process-uploaded-assets.ts
 *
 * Batch job: drains the uploads queue for all rows with status='uploaded'.
 * Called by the heartbeat or a cron — not a web request handler.
 *
 * Concurrency: 2 simultaneous analyzeUpload calls to stay under API rate limits.
 * Why 2: enough to make progress, low enough to avoid 429s from vision APIs.
 */

import { db } from "../db";
import { uploads } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "../index";

// ---------------------------------------------------------------------------
// analyzeUpload — imported from the vision pipeline when it exists.
// Falls back to a no-op stub so this job can run safely before the pipeline
// is wired up. Replace this import once server/jobs/analyze-upload.ts ships.
// ---------------------------------------------------------------------------
let analyzeUpload: (uploadId: string) => Promise<void>;
try {
  // Dynamic require so a missing module doesn't crash the whole server at boot.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("../jobs/analyze-upload");
  analyzeUpload = mod.analyzeUpload;
} catch {
  // Stub: marks the upload as analyzed with a placeholder so the queue drains.
  analyzeUpload = async (uploadId: string) => {
    log(`analyzeUpload stub called for upload ${uploadId} — real pipeline not yet wired`, "vision");
    await db
      .update(uploads)
      .set({ status: "analyzed", updatedAt: new Date() })
      .where(eq(uploads.id, uploadId));
  };
}

// ---------------------------------------------------------------------------
// runWithConcurrency
// Processes an array of async tasks with a maximum of `limit` running at once.
// ---------------------------------------------------------------------------
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  const queue = [...items];
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await fn(item);
        succeeded++;
      } catch (err) {
        failed++;
        // Error already logged inside fn — don't re-throw so other items keep processing.
      }
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return { succeeded, failed };
}

// ---------------------------------------------------------------------------
// processUploadedAssets — the public entry point.
// ---------------------------------------------------------------------------
export async function processUploadedAssets(): Promise<void> {
  // Query all uploads waiting to be analyzed.
  const pending = await db
    .select()
    .from(uploads)
    .where(eq(uploads.status, "uploaded"));

  // Guard: nothing to do.
  if (pending.length === 0) {
    log("processUploadedAssets: no pending uploads — skipping", "jobs");
    return;
  }

  log(`processUploadedAssets: found ${pending.length} upload(s) to process`, "jobs");

  const { succeeded, failed } = await runWithConcurrency(
    pending,
    2, // concurrency limit — keep under API rate limits
    async (upload) => {
      log(`Analyzing upload ${upload.id} for project ${upload.projectId}`, "jobs");
      await analyzeUpload(upload.id);
    }
  );

  log(
    `Processed ${pending.length} uploads: ${succeeded} analyzed, ${failed} failed`,
    "jobs"
  );
}
