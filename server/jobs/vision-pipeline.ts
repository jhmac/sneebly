import { storage } from "../storage";
import type { Upload } from "@shared/schema";

/**
 * Maximum number of uploads to process per queue run.
 * Keeps Vision API usage bounded and prevents overloading.
 */
const MAX_BATCH_SIZE = 10;

/**
 * Placeholder for the actual Vision AI analysis function.
 * Replace with real implementation (e.g. OpenAI Vision, Google Cloud Vision)
 * when the module is ready.
 *
 * @param fileUrl - Public URL of the uploaded image to analyze
 * @returns Structured analysis result with style, palette, proportions, and pose
 */
async function analyzeImage(fileUrl: string): Promise<{
  analysisResult: Record<string, any>;
  extractedStyle: Record<string, any>;
  extractedPalette: Record<string, any>;
  extractedProportions: Record<string, any>;
  extractedPose: Record<string, any>;
}> {
  // TODO: Wire up to real Vision AI provider
  // For now, return a structured placeholder so the pipeline shape is testable
  return {
    analysisResult: { provider: "placeholder", fileUrl, analyzedAt: new Date().toISOString() },
    extractedStyle: {},
    extractedPalette: {},
    extractedProportions: {},
    extractedPose: {},
  };
}

export interface VisionQueueSummary {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Process the vision analysis queue.
 *
 * 1. Fetches up to MAX_BATCH_SIZE uploads with status='uploaded'.
 * 2. For each upload, atomically transitions status to 'analyzing' (skip if another worker got it).
 * 3. Calls analyzeImage with the upload's file_url.
 * 4. On success, stores all five extracted JSONB fields and sets status='analyzed'.
 * 5. On failure, sets status='failed' and stores the error in analysis_result.
 * 6. Each upload is wrapped in try/catch so one failure doesn't block the batch.
 * 7. Returns a summary object for logging.
 */
export async function processVisionQueue(): Promise<VisionQueueSummary> {
  const summary: VisionQueueSummary = { processed: 0, succeeded: 0, failed: 0 };

  // Step 1: Fetch pending uploads
  const pending = await storage.getUploadsByStatus("uploaded", MAX_BATCH_SIZE);

  if (pending.length === 0) {
    return summary;
  }

  for (const upload of pending) {
    summary.processed++;

    try {
      // Step 2: Atomically claim this upload — skip if another worker got it
      const claimed = await storage.transitionUploadStatus(
        upload.id,
        "uploaded",
        "analyzing"
      );

      if (!claimed) {
        // Another worker already transitioned this upload; skip it
        summary.processed--;
        continue;
      }

      // Step 3: Run vision analysis
      const result = await analyzeImage(upload.fileUrl);

      // Step 4: Store results and mark as analyzed
      await storage.updateUploadAnalysis(upload.id, {
        status: "analyzed",
        analysisResult: result.analysisResult,
        extractedStyle: result.extractedStyle,
        extractedPalette: result.extractedPalette,
        extractedProportions: result.extractedProportions,
        extractedPose: result.extractedPose,
      });

      summary.succeeded++;
    } catch (error: unknown) {
      // Step 5: Mark as failed, store error message in analysis_result
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      try {
        await storage.updateUploadAnalysis(upload.id, {
          status: "failed",
          analysisResult: { error: errorMessage, failedAt: new Date().toISOString() },
          extractedStyle: null,
          extractedPalette: null,
          extractedProportions: null,
          extractedPose: null,
        });
      } catch (updateError) {
        // If we can't even update the status, log it but don't throw —
        // we don't want one broken record to halt the entire batch
        console.error(
          `[vision-pipeline] Failed to mark upload ${upload.id} as failed:`,
          updateError
        );
      }

      summary.failed++;
      console.error(
        `[vision-pipeline] Analysis failed for upload ${upload.id}:`,
        errorMessage
      );
    }
  }

  return summary;
}
