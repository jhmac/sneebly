import fs from "fs";
import path from "path";
import { onSpecBlocked } from "./spec-monitor";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const BLOCKED_DIR = path.join(DATA_DIR, "blocked");
const FAILED_DIR = path.join(DATA_DIR, "failed");
const FAILED_QUEUE_DIR = path.join(DATA_DIR, "failed-queue");

let lastCheckTime = Date.now();
const processedFiles = new Set<string>();

function scanForNewBlockedSpecs(): void {
  const dirsToCheck = [BLOCKED_DIR, FAILED_DIR, FAILED_QUEUE_DIR];

  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const dirName = path.basename(dir);
    for (const file of files) {
      const fileKey = `${dirName}/${file}`;
      if (processedFiles.has(fileKey)) continue;

      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < lastCheckTime) {
          processedFiles.add(fileKey);
          continue;
        }

        const spec = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        processedFiles.add(fileKey);

        onSpecBlocked(
          {
            status: dir.includes("blocked") ? "blocked" : "max-iterations",
            reason:
              spec._failureReason ||
              `Spec failed after multiple attempts targeting ${spec.filePath || "unknown"}`,
            iterations: spec._iterations || 10,
            specPath: filePath,
            failureHistory: spec._failureHistory || [],
          },
          spec
        );
      } catch {}
    }
  }

  lastCheckTime = Date.now();
}

function scanDailyLogForBlocks(): void {
  const today = new Date().toISOString().split("T")[0];
  const logPath = path.join(DATA_DIR, "daily", `${today}.md`);
  if (!fs.existsSync(logPath)) return;

  const content = fs.readFileSync(logPath, "utf-8");
  const lines = content.split("\n");

  const blockedPattern =
    /Ralph Loop: BLOCKED|stopped after \d+ consecutive test failures/;
  const recentLines = lines.slice(-20);

  for (const line of recentLines) {
    if (blockedPattern.test(line)) {
      const specMatch = line.match(/Spec:\s*(\S+)/);
      if (specMatch) {
        const specFile = specMatch[1];
        const alertKey = `daily-${today}-${specFile}`;
        if (!processedFiles.has(alertKey)) {
          processedFiles.add(alertKey);
        }
      }
    }
  }
}

let watchInterval: ReturnType<typeof setInterval> | null = null;

export function startSpecWatcher(intervalMs = 10000): void {
  if (watchInterval) return;

  processedFiles.clear();
  const dirs = [BLOCKED_DIR, FAILED_DIR, FAILED_QUEUE_DIR];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const dirName = path.basename(dir);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
      for (const file of files) processedFiles.add(`${dirName}/${file}`);
    }
  }

  watchInterval = setInterval(() => {
    try {
      scanForNewBlockedSpecs();
      scanDailyLogForBlocks();
    } catch {}
  }, intervalMs);
}

export function stopSpecWatcher(): void {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
}
