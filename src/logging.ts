import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const SNEEBLY_DATA_DIR = path.join(process.cwd(), ".sneebly");
const ERROR_LOG_PATH = path.join(SNEEBLY_DATA_DIR, "error-log.jsonl");
const REQUEST_LOG_PATH = path.join(SNEEBLY_DATA_DIR, "request-log.jsonl");

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function appendLog(filePath: string, entry: Record<string, unknown>) {
  try {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
  } catch {}
}

function computeSignature(message: string): string {
  return crypto.createHash("md5").update(message).digest("hex").slice(0, 12);
}

function sanitize(text: string): string {
  if (!text) return text;
  return text
    .replace(/(?:sk-|pk_|key_|token_|Bearer\s+)[A-Za-z0-9_\-]{10,}/g, "[REDACTED]")
    .replace(/(?:password|secret|apikey|api_key)[\s=:]+\S+/gi, "[REDACTED]");
}

function appendSneeblyError(error: {
  message: string;
  stack?: string;
  path?: string;
  method?: string;
}) {
  const sanitizedMessage = sanitize(error.message);
  const entry = {
    timestamp: new Date().toISOString(),
    message: sanitizedMessage,
    stack: sanitize(error.stack || ""),
    path: error.path || null,
    method: error.method || null,
    signature: computeSignature(sanitizedMessage),
  };
  appendLog(ERROR_LOG_PATH, entry);
}

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function (this: Response, ...args: any[]) {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      if (req.path.startsWith("/api") || req.path.startsWith("/sneebly")) {
        const entry = {
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          statusCode,
          duration,
        };

        appendLog(REQUEST_LOG_PATH, entry);

        if (statusCode >= 500) {
          appendSneeblyError({
            message: `HTTP ${statusCode} on ${req.method} ${req.path} (${duration}ms)`,
            path: req.path,
            method: req.method,
          });
        }
      }

      return originalEnd.apply(this, args as any);
    };

    next();
  };
}

export function errorLogger() {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    appendSneeblyError({
      message: err.message || String(err),
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    console.error(
      `[ERROR] ${req.method} ${req.path} - ${sanitize(err.message || String(err))}`
    );

    next(err);
  };
}

export function setupProcessErrorHandlers() {
  process.on("uncaughtException", (err) => {
    appendSneeblyError({
      message: `[Uncaught] ${err.message}`,
      stack: err.stack,
    });
    console.error("[FATAL] Uncaught exception:", sanitize(err.message));
  });

  process.on("unhandledRejection", (reason: any) => {
    const message =
      reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    appendSneeblyError({
      message: `[UnhandledRejection] ${message}`,
      stack,
    });
    console.error("[FATAL] Unhandled rejection:", sanitize(message));
  });
}
