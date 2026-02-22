import fs from "fs";
import path from "path";
import { isPathSafe } from "./path-safety";
import { getSafePaths, getNeverModifyPaths } from "./identity";
import { extractJson, callClaude } from "./utils";
import { runShellCommand } from "./shell-executor";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const BLOCKERS_FILE = path.join(DATA_DIR, "blockers.json");
const FIX_LOG_FILE = path.join(DATA_DIR, "auto-fixer-log.jsonl");
const BLOCKED_DIR = path.join(DATA_DIR, "blocked");
const SKILLS_DIR = path.join(DATA_DIR, "skills");

interface BlockerAlert {
  id: string;
  specId: string;
  specFile: string;
  targetFile: string;
  description: string;
  reason: string;
  attempts: number;
  userInstructions: string[];
  suggestedSkill: string | null;
  createdAt: string;
  status: "active" | "resolved" | "dismissed";
}

interface FixResult {
  blockerId: string;
  specId: string;
  success: boolean;
  action: "fixed" | "skipped" | "failed";
  diagnosis: string;
  filesModified: string[];
  timestamp: string;
  error?: string;
}

function isSafePath(filePath: string): boolean {
  return isPathSafe(filePath, getSafePaths(), getNeverModifyPaths());
}

function loadBlockers(): { blockers: BlockerAlert[]; raw: any } {
  try {
    if (!fs.existsSync(BLOCKERS_FILE)) return { blockers: [], raw: { blockers: [] } };
    const raw = JSON.parse(fs.readFileSync(BLOCKERS_FILE, "utf-8"));
    return { blockers: raw.blockers || [], raw };
  } catch {
    return { blockers: [], raw: { blockers: [] } };
  }
}

function saveBlockers(blockers: BlockerAlert[]): void {
  fs.writeFileSync(
    BLOCKERS_FILE,
    JSON.stringify({ blockers, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

function logFix(result: FixResult): void {
  fs.appendFileSync(FIX_LOG_FILE, JSON.stringify(result) + "\n", "utf-8");
}

function loadSkillContext(): string {
  try {
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md"));
    return files.map(f => {
      const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
      return `=== Skill: ${f} ===\n${content}`;
    }).join("\n\n");
  } catch {
    return "";
  }
}

function readFileContext(filePath: string): string {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) return `[File does not exist: ${filePath}]`;
    const content = fs.readFileSync(resolved, "utf-8");
    if (content.length > 15000) {
      return content.slice(0, 15000) + "\n...[truncated]";
    }
    return content;
  } catch {
    return `[Cannot read: ${filePath}]`;
  }
}

function loadBlockedSpec(specFile: string): any {
  try {
    if (fs.existsSync(specFile)) {
      return JSON.parse(fs.readFileSync(specFile, "utf-8"));
    }
  } catch {}
  return null;
}

async function diagnoseAndFix(blocker: BlockerAlert): Promise<FixResult> {
  const result: FixResult = {
    blockerId: blocker.id,
    specId: blocker.specId,
    success: false,
    action: "skipped",
    diagnosis: "",
    filesModified: [],
    timestamp: new Date().toISOString(),
  };

  if (!isSafePath(blocker.targetFile)) {
    const isWrongPathSpec = blocker.targetFile.includes("/types/") ||
      blocker.targetFile.includes("/models/") ||
      blocker.targetFile.includes("/interfaces/");

    if (isWrongPathSpec) {
      const schemaContent = readFileContext("shared/schema.ts").toLowerCase();
      const descLower = blocker.description.toLowerCase();
      const tableMatch = descLower.match(/(?:table|schema|type)\s+(?:for\s+)?(\w+)/);
      const tableName = tableMatch ? tableMatch[1] : "";
      const workExists = tableName && (
        schemaContent.includes(`export const ${tableName}`) ||
        schemaContent.includes(`"${tableName}"`) ||
        schemaContent.includes(`type ${tableName[0].toUpperCase()}${tableName.slice(1)}`)
      );

      if (workExists) {
        result.diagnosis = `Spec targeted wrong path ${blocker.targetFile} — this project keeps all types in shared/schema.ts. Verified that "${tableName}" already exists in schema. Auto-resolving.`;
        result.action = "skipped";
        result.success = true;
        logFix(result);
        return result;
      }

      result.diagnosis = `Spec targeted ${blocker.targetFile} (wrong path convention) but could not verify the work exists in shared/schema.ts. Leaving for manual review.`;
      result.action = "skipped";
      logFix(result);
      return result;
    }

    result.diagnosis = `Target file ${blocker.targetFile} is not in safe paths — skipping auto-fix`;
    result.action = "skipped";
    logFix(result);
    return result;
  }

  const spec = loadBlockedSpec(blocker.specFile);
  const targetContent = readFileContext(blocker.targetFile);
  const schemaContent = readFileContext("shared/schema.ts");
  const storageContent = readFileContext("server/storage.ts");
  const skillContext = loadSkillContext();

  const prompt = `You are a code fixer. A build agent (Sneebly) tried to execute a spec but got blocked. Your job is to diagnose the root cause and produce a fix.

## Project Conventions (CRITICAL)
- ALL database tables go in shared/schema.ts — NEVER create separate model files like shared/types/*.ts or shared/models/*.ts
- ID pattern: varchar("id").primaryKey().default(sql\`gen_random_uuid()\`) — NOT uuid().defaultRandom()
- The variable for the exports table is \`projectExports\` (NOT \`exports\`) to avoid CJS conflicts
- After each table, export createInsertSchema, InsertX type, and X select type
- CRUD methods go in server/storage.ts (IStorage interface + DatabaseStorage class)  
- API routes go in server/routes.ts with Clerk auth

## Skill Context
${skillContext}

## Blocked Spec
${spec ? JSON.stringify(spec, null, 2) : "No spec file found"}

## Blocker Info
- ID: ${blocker.id}
- Target File: ${blocker.targetFile}
- Description: ${blocker.description}
- Failure Reason: ${blocker.reason}
- Attempts: ${blocker.attempts}

## Current File Contents
=== ${blocker.targetFile} ===
${targetContent}

=== shared/schema.ts (first 200 lines) ===
${schemaContent.split("\n").slice(0, 200).join("\n")}

=== server/storage.ts (first 50 lines) ===
${storageContent.split("\n").slice(0, 50).join("\n")}

## Your Task
1. Diagnose: What was the spec trying to do? Why did it fail?
2. Decide: Can this be fixed by modifying the target file, or is the spec itself wrong (targeting a wrong file/pattern)?
3. If the spec was targeting the WRONG file (e.g., trying to create shared/types/*.ts when types belong in shared/schema.ts), explain that the work is already done or redirect to the correct approach.
4. If the fix is straightforward and the target file is correct, provide the exact file changes.

You can also run shell commands when needed (e.g., for migrations, type checking, package installs).
Allowed commands: npx drizzle-kit push/generate/migrate/check, npx tsc --noEmit, npm run <script>, npm install <package>, npm test, npx eslint, cat, ls, head, tail, grep, find, wc, mkdir, cp, mv, touch, sed, awk, diff, sort, uniq, git status/diff/log.
IMPORTANT: Do NOT chain commands with && or ; — use separate shellCommands entries instead.

Respond in JSON:
{
  "diagnosis": "What went wrong and why",
  "canFix": true/false,
  "reason": "Why it can or can't be fixed automatically",
  "fixes": [
    {
      "filePath": "path/to/file",
      "action": "create" | "replace" | "append",
      "content": "full file content for create, or replacement content",
      "oldContent": "content to replace (for replace action only, must be exact match)",
      "description": "what this change does"
    }
  ],
  "shellCommands": [
    { "command": "npx drizzle-kit push", "description": "Push schema changes", "required": true }
  ]
}

If the work is already done (e.g., schema already has the table), set canFix to false and explain in diagnosis that no action needed — the blocker should just be resolved.`;

  try {
    const claudeResult = await callClaude(prompt, {
      model: "claude-sonnet-4-6",
      maxTokens: 8192,
      effort: "medium",
      agent: "auto-fixer",
      task: `fix-${blocker.specId}`,
      feature: "auto-fixer",
      context: `blocker: ${blocker.id} — ${blocker.description.slice(0, 100)}`,
    });

    const fix = extractJson(claudeResult.text);
    if (!fix) {
      result.diagnosis = "Claude did not return valid JSON";
      result.action = "failed";
      result.error = claudeResult.text.slice(0, 500);
      logFix(result);
      return result;
    }
    result.diagnosis = fix.diagnosis || "No diagnosis provided";

    if (!fix.canFix) {
      result.action = "skipped";
      result.diagnosis += " — No fix needed, marking blocker as resolved.";
      result.success = true;
      logFix(result);
      return result;
    }

    if (!fix.fixes || fix.fixes.length === 0) {
      result.action = "skipped";
      result.diagnosis += " — No concrete fixes provided.";
      logFix(result);
      return result;
    }

    for (const f of fix.fixes) {
      if (!isSafePath(f.filePath)) {
        result.diagnosis += ` — Skipped unsafe path: ${f.filePath}`;
        continue;
      }

      const repoRoot = process.cwd();
      const fullPath = path.resolve(repoRoot, f.filePath);
      const relative = path.relative(repoRoot, fullPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        result.diagnosis += ` — Blocked path traversal attempt: ${f.filePath}`;
        continue;
      }

      if (f.action === "create") {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, f.content, "utf-8");
        result.filesModified.push(f.filePath);
      } else if (f.action === "replace" && f.oldContent) {
        if (fs.existsSync(fullPath)) {
          let current = fs.readFileSync(fullPath, "utf-8");
          if (current.includes(f.oldContent)) {
            current = current.replace(f.oldContent, f.content);
            fs.writeFileSync(fullPath, current, "utf-8");
            result.filesModified.push(f.filePath);
          } else {
            result.diagnosis += ` — Replace target not found in ${f.filePath}`;
          }
        }
      } else if (f.action === "append") {
        if (fs.existsSync(fullPath)) {
          fs.appendFileSync(fullPath, "\n" + f.content, "utf-8");
          result.filesModified.push(f.filePath);
        }
      }
    }

    const shellCommands = fix.shellCommands || [];
    let shellSuccess = true;
    for (const cmd of shellCommands) {
      console.log(`[AutoFixer] Running shell command: ${cmd.command} — ${cmd.description || ""}`);
      const shellResult = await runShellCommand(cmd.command, { timeoutMs: 60000 });
      if (!shellResult.success) {
        const errMsg = ` — Shell command failed: ${cmd.command} (exit ${shellResult.exitCode}, stderr: ${shellResult.stderr?.slice(0, 300)})`;
        result.diagnosis += errMsg;
        console.log(`[AutoFixer]${errMsg}`);
        if (cmd.required !== false) {
          shellSuccess = false;
        }
      } else {
        console.log(`[AutoFixer] Shell command succeeded: ${cmd.command} (${shellResult.durationMs}ms)`);
      }
    }

    const hasChanges = result.filesModified.length > 0 || shellCommands.length > 0;
    result.success = (hasChanges && shellSuccess) || !fix.canFix;
    result.action = result.success ? "fixed" : "failed";
    if (!shellSuccess) {
      result.error = "Required shell command(s) failed";
    }
    logFix(result);
    return result;

  } catch (error: any) {
    result.action = "failed";
    result.error = error.message || String(error);
    result.diagnosis = `Claude API call failed: ${result.error}`;
    logFix(result);
    return result;
  }
}

let isRunning = false;
let fixInterval: ReturnType<typeof setInterval> | null = null;
let stats = {
  totalProcessed: 0,
  fixed: 0,
  skipped: 0,
  failed: 0,
  lastRun: null as string | null,
};

async function processBlockers(): Promise<FixResult[]> {
  if (isRunning) return [];
  isRunning = true;
  const results: FixResult[] = [];

  try {
    const { blockers } = loadBlockers();
    const activeBlockers = blockers.filter(b => b.status === "active");

    if (activeBlockers.length === 0) {
      isRunning = false;
      return results;
    }

    console.log(`[AutoFixer] Processing ${activeBlockers.length} active blockers...`);

    for (const blocker of activeBlockers.slice(0, 3)) {
      const result = await diagnoseAndFix(blocker);
      results.push(result);
      stats.totalProcessed++;

      if (result.success || result.action === "skipped") {
        const { blockers: current } = loadBlockers();
        const b = current.find(x => x.id === blocker.id);
        if (b) {
          b.status = "resolved";
          saveBlockers(current);
        }
        if (result.action === "fixed") stats.fixed++;
        else stats.skipped++;
      } else {
        stats.failed++;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    stats.lastRun = new Date().toISOString();
    console.log(`[AutoFixer] Run complete: ${results.length} blockers processed`);
  } catch (error) {
    console.error("[AutoFixer] Error during processing:", error);
  } finally {
    isRunning = false;
  }

  return results;
}

export function startAutoFixer(intervalMs = 180000): void {
  if (fixInterval) return;

  console.log(`[AutoFixer] Starting auto-fixer (interval: ${intervalMs}ms)`);

  setTimeout(() => processBlockers(), 10000);

  fixInterval = setInterval(() => {
    processBlockers().catch(err => {
      console.error("[AutoFixer] Interval error:", err);
    });
  }, intervalMs);
}

export function stopAutoFixer(): void {
  if (fixInterval) {
    clearInterval(fixInterval);
    fixInterval = null;
    console.log("[AutoFixer] Stopped");
  }
}

export async function triggerAutoFixer(): Promise<FixResult[]> {
  return processBlockers();
}

export function getAutoFixerStats() {
  return {
    ...stats,
    isRunning,
  };
}

export function getFixLog(limit = 20): FixResult[] {
  try {
    if (!fs.existsSync(FIX_LOG_FILE)) return [];
    const lines = fs.readFileSync(FIX_LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map(l => JSON.parse(l)).reverse();
  } catch {
    return [];
  }
}
