import fs from "fs";
import path from "path";
import { oneShot } from "./claude-session";
import { getMemoryForPrompt, addFixPattern } from "./memory-manager";
import { quickHealthCheck } from "./verify-agent";
import { isPathSafe } from "./path-safety";
import { extractJson } from "./utils";

const SNEEBLY_SAFE_FILES = [
  "server/auto-fixer.ts",
  "server/planner-agent.ts",
  "server/builder-agent.ts",
  "server/verify-agent.ts",
  "server/learning-loop.ts",
  "server/progress-tracker.ts",
  "server/memory-manager.ts",
  "server/claude-session.ts",
  "server/self-modify.ts",
  "server/autonomy-loop.ts",
  "server/spec-monitor.ts",
  "server/needs-detector.ts",
  ".sneebly/skills/",
  ".sneebly/memory.md",
];

const NEVER_SELF_MODIFY = [
  "server/index.ts",
  "server/routes.ts",
  "server/storage.ts",
  "shared/schema.ts",
  ".env",
  "package.json",
  "drizzle.config.ts",
  "vite.config.ts",
  "tsconfig.json",
];

const BACKUP_DIR = path.join(process.cwd(), ".sneebly", "backups", "self-modify");

interface SelfModifyResult {
  filePath: string;
  success: boolean;
  action: string;
  backupPath: string | null;
  rolledBack: boolean;
  error?: string;
}

function isSelfModifySafe(filePath: string): boolean {
  return isPathSafe(filePath, SNEEBLY_SAFE_FILES, NEVER_SELF_MODIFY);
}

function backupFile(filePath: string): string | null {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return null;

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = Date.now();
  const backupName = `${filePath.replace(/[\/\\]/g, '__')}.${timestamp}.bak`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.copyFileSync(resolved, backupPath);
  return backupPath;
}

function restoreFromBackup(filePath: string, backupPath: string): boolean {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    fs.copyFileSync(backupPath, resolved);
    return true;
  } catch {
    return false;
  }
}

export async function selfImprove(
  filePath: string,
  improvement: string
): Promise<SelfModifyResult> {
  const result: SelfModifyResult = {
    filePath,
    success: false,
    action: "self-modify",
    backupPath: null,
    rolledBack: false,
  };

  if (!isSelfModifySafe(filePath)) {
    result.error = `File not in self-modify safe list: ${filePath}`;
    return result;
  }

  result.backupPath = backupFile(filePath);

  const currentContent = (() => {
    try {
      const resolved = path.resolve(process.cwd(), filePath);
      if (!fs.existsSync(resolved)) return "[File does not exist]";
      return fs.readFileSync(resolved, "utf-8");
    } catch {
      return "[Cannot read file]";
    }
  })();

  const memory = getMemoryForPrompt(["Conventions", "Fix Patterns"]);

  try {
    const prompt = `You are improving Sneebly's own code. Modify the following file to implement the requested improvement.

## File: ${filePath}
${currentContent}

## Requested Improvement
${improvement}

## Conventions
${memory}

## Rules
1. Output the COMPLETE updated file — not a diff or partial content
2. Preserve all existing functionality
3. Only add/change what's needed for the improvement
4. Follow TypeScript best practices
5. Keep the same import style and patterns
6. Do NOT add unnecessary comments

Respond in JSON:
{
  "updatedContent": "complete file content here",
  "changesSummary": "brief description of what changed"
}`;

    const response = await oneShot(prompt, { maxTokens: 12000, task: "self-modification", feature: "self-modify" });
    const output = extractJson(response);

    if (!output) {
      result.error = "Claude did not return valid JSON";
      return result;
    }

    if (!output.updatedContent) {
      result.error = "No updated content provided";
      return result;
    }

    const resolved = path.resolve(process.cwd(), filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, output.updatedContent, "utf-8");

    await new Promise(r => setTimeout(r, 3000));

    const healthy = await quickHealthCheck();

    if (!healthy && result.backupPath) {
      console.log(`[SelfModify] Health check failed after modifying ${filePath} — rolling back`);
      restoreFromBackup(filePath, result.backupPath);
      result.rolledBack = true;
      result.error = "Health check failed after modification — rolled back";
      addFixPattern(`Self-modify of ${filePath} caused health failure — rolled back. Improvement attempted: ${improvement}`);
      return result;
    }

    result.success = true;
    console.log(`[SelfModify] Successfully improved ${filePath}: ${output.changesSummary}`);

  } catch (error: any) {
    result.error = error.message || String(error);

    if (result.backupPath) {
      restoreFromBackup(filePath, result.backupPath);
      result.rolledBack = true;
    }
  }

  return result;
}

export function listSelfModifyBackups(): { file: string; timestamp: number; size: number }[] {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    const files = fs.readdirSync(BACKUP_DIR);
    return files.map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const timestampMatch = f.match(/\.(\d+)\.bak$/);
      return {
        file: f,
        timestamp: timestampMatch ? parseInt(timestampMatch[1]) : stat.mtimeMs,
        size: stat.size,
      };
    }).sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}
