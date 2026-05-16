import { storage } from "../storage";
import type { Upload } from "@shared/schema";
import type { VisionAnalysisFields } from "../storage";

/**
 * Calls the Vision AI API with the given image URL.
 * Returns the full structured analysis response.
 *
 * TODO: Replace with actual Vision API integration (OpenAI, Google Vision, etc.)
 */
async function callVisionAPI(fileUrl: string): Promise<Record<string, any>> {
  // Placeholder — replace with real API call when the vision module is wired up.
  // The response shape should include at minimum:
  //   { artStyle, colorPalette, characterProportions, poseSkeleton, ... }
  throw new Error(`callVisionAPI not yet implemented for: ${fileUrl}`);
}

export interface VisionJobSummary {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Processes all uploads that are pending vision analysis.
 *
 * For each pending upload:
 *   1. Transitions status from 'uploaded' → 'analyzing' (atomic gate — prevents double-processing)
 *   2. Calls the Vision AI API with the upload's file URL
 *   3. On success: stores decomposed analysis fields and sets status to 'analyzed'
 *   4. On failure: marks the upload as failed with error details
 *
 * Each upload is wrapped in its own try/catch so one failure doesn't block others.
 * Returns a summary object for logging.
 */
export async function processVisionUploads(): Promise<VisionJobSummary> {
  const summary: VisionJobSummary = { processed: 0, succeeded: 0, failed: 0 };

  // Fetch up to 10 uploads with status='uploaded', ordered by created_at ASC
  const pendingUploads = await storage.getUploadsPendingAnalysis();

  if (pendingUploads.length === 0) {
    return summary;
  }

  for (const upload of pendingUploads) {
    summary.processed++;

    try {
      // Atomically transition status: 'uploaded' → 'analyzing'
      // If this returns false, another worker already claimed it — skip.
      const claimed = await storage.transitionUploadStatus(
        upload.id,
        "uploaded",
        "analyzing"
      );

      if (!claimed) {
        // Already claimed by another process — don't count as processed
        summary.processed--;
        continue;
      }

      // Call Vision AI with the upload's file URL
      const analysisResponse = await callVisionAPI(upload.fileUrl);

      // Decompose the response into the five JSONB fields
      const fields: VisionAnalysisFields = {
        analysisResult: analysisResponse,
        extractedStyle: analysisResponse.artStyle ?? null,
        extractedPalette: analysisResponse.colorPalette ?? null,
        extractedProportions: analysisResponse.characterProportions ?? null,
        extractedPose: analysisResponse.poseSkeleton ?? null,
      };

      // Store results — sets status to 'analyzed'
      await storage.storeVisionAnalysisResults(upload.id, fields);
      summary.succeeded++;
    } catch (error: unknown) {
      summary.failed++;

      // Build a safe error info object for storage
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack =
        error instanceof Error ? error.stack : undefined;

      const errorInfo: Record<string, any> = {
        error: errorMessage,
        stack: errorStack,
        uploadId: upload.id,
        fileUrl: upload.fileUrl,
        failedAt: new Date().toISOString(),
      };

      try {
        await storage.markUploadFailed(upload.id, errorInfo);
      } catch (markError: unknown) {
        // If we can't even mark it as failed, log and move on.
        // Don't let a storage error in the error handler crash the whole batch.
        const markMsg =
          markError instanceof Error ? markError.message : String(markError);
        console.error(
          `[vision-upload-job] Failed to mark upload ${upload.id} as failed: ${markMsg}`
        );
      }
    }
  }

  return summary;
}
