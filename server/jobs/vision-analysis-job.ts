import { storage } from "../storage";
import type { Upload } from "@shared/schema";
import type { VisionAnalysisFields } from "../storage";

/**
 * Placeholder for the actual Vision AI analysis function.
 * Replace this import with the real module once it exists.
 *
 * Expected signature:
 *   analyzeUploadImage(fileUrl: string) => Promise<VisionAnalysisFields>
 *
 * Should return the five JSONB fields:
 *   analysisResult, extractedStyle, extractedPalette, extractedProportions, extractedPose
 */
async function analyzeUploadImage(fileUrl: string): Promise<VisionAnalysisFields> {
  // TODO: wire up to the real Vision AI module (e.g. OpenAI gpt-4o vision)
  throw new Error(`analyzeUploadImage not yet implemented for: ${fileUrl}`);
}

export interface VisionJobSummary {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Async job runner for the Vision Analysis pipeline.
 *
 * 1. Fetches uploads with status='uploaded' via storage.getUploadsPendingAnalysis()
 * 2. Processes each upload sequentially (respects API rate limits)
 * 3. For each upload:
 *    - Transitions status to 'analyzing'
 *    - Calls analyzeUploadImage with the upload's fileUrl
 *    - On success: stores results via storage.storeVisionAnalysisResults
 *    - On failure: marks upload failed via storage.markUploadFailed
 * 4. Returns a summary object for logging
 * 5. One upload failure does NOT kill the batch
 */
export async function processVisionAnalysisQueue(): Promise<VisionJobSummary> {
  const summary: VisionJobSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
  };

  let pendingUploads: Upload[];

  try {
    pendingUploads = await storage.getUploadsPendingAnalysis();
  } catch (error) {
    console.error("[VisionJob] Failed to fetch pending uploads:", error);
    return summary;
  }

  if (pendingUploads.length === 0) {
    return summary;
  }

  console.log(`[VisionJob] Found ${pendingUploads.length} upload(s) pending analysis`);

  // Process sequentially to respect API rate limits
  for (const upload of pendingUploads) {
    summary.processed++;

    try {
      // Transition status: uploaded → analyzing
      await storage.updateUploadStatus(upload.id, "analyzing");

      // Call Vision AI analysis
      const results = await analyzeUploadImage(upload.fileUrl);

      // Store results and transition status: analyzing → analyzed
      await storage.storeVisionAnalysisResults(upload.id, {
        analysisResult: results.analysisResult,
        extractedStyle: results.extractedStyle,
        extractedPalette: results.extractedPalette,
        extractedProportions: results.extractedProportions,
        extractedPose: results.extractedPose,
      });

      summary.succeeded++;
      console.log(`[VisionJob] ✓ Analyzed upload ${upload.id} (${upload.originalFilename})`);
    } catch (error) {
      summary.failed++;

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[VisionJob] ✗ Failed upload ${upload.id} (${upload.originalFilename}):`,
        errorMessage
      );

      // Mark as failed — stores error info in analysis_result JSONB
      try {
        await storage.markUploadFailed(upload.id, {
          error: errorMessage,
          failedAt: new Date().toISOString(),
          uploadId: upload.id,
          fileUrl: upload.fileUrl,
        });
      } catch (markError) {
        // Don't let a failure-marking error kill the batch either
        console.error(
          `[VisionJob] Failed to mark upload ${upload.id} as failed:`,
          markError
        );
      }
    }
  }

  console.log(
    `[VisionJob] Complete — processed: ${summary.processed}, succeeded: ${summary.succeeded}, failed: ${summary.failed}`
  );

  return summary;
}
