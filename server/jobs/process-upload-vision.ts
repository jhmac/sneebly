import { db } from "../db";
import { uploads } from "@shared/schema";
import { eq, and, asc, like } from "drizzle-orm";
import { callVisionAPI } from "./call-vision-api";

const BATCH_SIZE = 5;

export interface ProcessUploadVisionResult {
  processed: number;
  analyzed: number;
  failed: number;
  ids: string[];
}

/**
 * Async job processor that picks up uploaded images and runs them through
 * the vision API to extract style, palette, proportions, and pose data.
 *
 * - Queries uploads with status='uploaded' and fileType starting with 'image/'
 * - Processes up to BATCH_SIZE uploads per invocation
 * - Each upload is handled independently so one failure doesn't block others
 * - Returns a summary object for logging
 */
export async function processUploadVision(): Promise<ProcessUploadVisionResult> {
  const result: ProcessUploadVisionResult = {
    processed: 0,
    analyzed: 0,
    failed: 0,
    ids: [],
  };

  // 1. Query for pending image uploads, oldest first
  const pendingUploads = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.status, "uploaded"),
        like(uploads.fileType, "image/%")
      )
    )
    .orderBy(asc(uploads.createdAt))
    .limit(BATCH_SIZE);

  if (pendingUploads.length === 0) {
    return result;
  }

  // 2. Process each upload independently
  for (const upload of pendingUploads) {
    result.processed++;
    result.ids.push(upload.id);

    try {
      // Transition to 'analyzing' immediately
      await db
        .update(uploads)
        .set({
          status: "analyzing",
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, upload.id));

      // 3. Call the vision API
      const visionResult = await callVisionAPI(upload.fileUrl);

      // 4. On success — persist all extracted fields and mark as analyzed
      await db
        .update(uploads)
        .set({
          analysisResult: visionResult.analysisResult ?? null,
          extractedStyle: visionResult.extractedStyle ?? null,
          extractedPalette: visionResult.extractedPalette ?? null,
          extractedProportions: visionResult.extractedProportions ?? null,
          extractedPose: visionResult.extractedPose ?? null,
          status: "analyzed",
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, upload.id));

      result.analyzed++;
    } catch (err: unknown) {
      // 5. On failure — mark as failed with error details in analysis_result
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      await db
        .update(uploads)
        .set({
          status: "failed",
          analysisResult: {
            error: "vision_api_failure",
            message: errorMessage,
            timestamp: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, upload.id));

      result.failed++;
      console.error(
        `[processUploadVision] Failed to analyze upload ${upload.id}:`,
        errorMessage
      );
    }
  }

  return result;
}
