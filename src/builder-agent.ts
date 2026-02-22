import fs from "fs";
import path from "path";
import { loadCurrentPlan, markStepDone, markStepFailed, markStepInProgress } from "./planner-agent";
import { isPathSafe } from "./path-safety";
import { getSafePaths, getNeverModifyPaths } from "./identity";
import { extractJson, callClaude } from "./utils";
import { runShellCommand } from "./shell-executor";

function isSafePath(filePath: string): boolean {
  const safePaths = getSafePaths();
  const neverModify = getNeverModifyPaths();
  return isPathSafe(filePath, safePaths, neverModify);
}

function readFileContent(filePath: string): string {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) return `[File does not exist: ${filePath}]`;
    const content = fs.readFileSync(resolved, "utf-8");
    if (content.length > 15000) {
      const lines = content.split("\n");
      const keptLines = content.slice(0, 15000).split("\n");
      return content.slice(0, 15000) +
        `\n\n[TRUNCATED — showing ${keptLines.length} of ${lines.length} lines. ` +
        `You MUST preserve lines ${keptLines.length + 1}–${lines.length} exactly as they are. ` +
        `Only modify the section relevant to the task.]`;
    }
    return content;
  } catch {
    return `[Cannot read: ${filePath}]`;
  }
}


function writeFileContent(filePath: string, content: string): boolean {
  if (!isSafePath(filePath)) {
    console.log(`[Builder] Blocked write to unsafe path: ${filePath}`);
    return false;
  }
  const fullPath = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(fullPath)) {
    const backupDir = path.join(process.cwd(), ".sneebly", "backups", "builder");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const safeName = filePath.replace(/[\/\\]/g, "__");
    fs.copyFileSync(fullPath, path.join(backupDir, `${safeName}.${Date.now()}.bak`));
  }
  fs.writeFileSync(fullPath, content, "utf-8");
  return true;
}

interface BuildResult {
  stepId: string;
  success: boolean;
  filesModified: string[];
  error?: string;
  usedOpus?: boolean;
}

async function builderCallClaude(
  model: string,
  prompt: string,
  agent: string,
  task: string,
  effort?: "low" | "medium" | "high" | "max"
): Promise<{ text: string }> {
  const result = await callClaude(prompt, {
    model,
    maxTokens: 16000,
    temperature: 0.2,
    effort,
    agent,
    task,
    feature: "autonomy-build",
  });
  return { text: result.text };
}

function inferRelatedFiles(filePath: string, description: string): string[] {
  const related: Set<string> = new Set();
  const descLower = description.toLowerCase();

  if (filePath.includes("routes.ts")) {
    related.add("server/storage.ts");
    related.add("shared/schema.ts");
  }
  if (filePath.includes("storage.ts")) {
    related.add("shared/schema.ts");
    related.add("server/routes.ts");
  }
  if (filePath.startsWith("client/src/")) {
    related.add("shared/schema.ts");
  }
  if (filePath.startsWith("client/src/pages/")) {
    related.add("client/src/App.tsx");
    related.add("client/src/lib/queryClient.ts");
  }
  if (filePath.startsWith("client/src/components/")) {
    related.add("client/src/lib/queryClient.ts");
  }
  if (filePath.includes("schema.ts")) {
    related.add("server/storage.ts");
    related.add("drizzle.config.ts");
  }
  if (descLower.includes("api") || descLower.includes("endpoint") || descLower.includes("route")) {
    related.add("server/routes.ts");
    related.add("server/storage.ts");
    related.add("shared/schema.ts");
  }
  if (descLower.includes("database") || descLower.includes("table") || descLower.includes("schema") || descLower.includes("migration")) {
    related.add("shared/schema.ts");
    related.add("server/storage.ts");
    related.add("drizzle.config.ts");
  }
  if (descLower.includes("component") || descLower.includes("page") || descLower.includes("ui")) {
    related.add("shared/schema.ts");
  }
  if (descLower.includes("auth") || descLower.includes("clerk") || descLower.includes("user")) {
    related.add("shared/schema.ts");
    related.add("server/routes.ts");
  }

  related.delete(filePath);

  return Array.from(related).filter(f => {
    try {
      return fs.existsSync(path.resolve(process.cwd(), f));
    } catch { return false; }
  }).slice(0, 6);
}

function buildPrompt(step: { id: string; action: string; filePath: string; description: string }): string {
  const currentContent = readFileContent(step.filePath);
  const relatedFiles = inferRelatedFiles(step.filePath, step.description);
  const relatedContent = relatedFiles.map(f => `=== ${f} ===\n${readFileContent(f)}`).join("\n\n");

  return `Implement this code change.

## Task
- File: ${step.filePath}
- Action: ${step.action}
- Description: ${step.description}

## Current File
=== ${step.filePath} ===
${currentContent}

## Related Files
${relatedContent}

Output the COMPLETE file content. Include all imports. Match existing code style.

You can also run shell commands when needed (e.g., for migrations, type checking, package installs, linting).
Allowed commands include:
- npx drizzle-kit push/generate/migrate/check — database schema operations
- npx tsc --noEmit / tsc --noEmit — TypeScript type checking
- npm run <script> — safe npm scripts only (build, check, lint, dev, start, test, typecheck, format, db:push, db:generate, db:migrate, db:check, preview, clean)
- npm install <package> — install specific npm packages (no global installs)
- npm test — run tests
- npx eslint / npx prettier — linting and formatting
- cat, ls, head, tail, grep, find, wc — read and search files
- mkdir, cp, mv, touch — create and manage files/directories
- sed, awk, sort, uniq, diff — text processing
- git status, git diff, git log — version control (read-only)

IMPORTANT: Do NOT chain commands with && or ; — use separate shellCommands entries instead.

Respond in JSON:
{
  "fileChanges": [
    { "filePath": "path/to/file.ts", "action": "create|replace|append", "content": "complete file content" }
  ],
  "shellCommands": [
    { "command": "npx drizzle-kit push", "description": "Push schema changes to database", "required": true }
  ]
}`;
}

async function executeShellCommands(buildOutput: any): Promise<{ results: any[]; allSucceeded: boolean }> {
  const commands = buildOutput.shellCommands || [];
  if (commands.length === 0) return { results: [], allSucceeded: true };

  const results: any[] = [];
  let allSucceeded = true;

  for (const cmd of commands) {
    console.log(`[Builder] Running shell command: ${cmd.command} — ${cmd.description || ""}`);
    const result = await runShellCommand(cmd.command, { timeoutMs: 60000 });
    results.push({ ...cmd, ...result });

    if (!result.success && cmd.required) {
      console.log(`[Builder] Required command failed: ${cmd.command}`);
      allSucceeded = false;
    }
  }

  return { results, allSucceeded };
}

function applyChanges(buildOutput: any): string[] {
  const modified: string[] = [];
  for (const change of (buildOutput.fileChanges || [])) {
    if (!isSafePath(change.filePath)) {
      console.log(`[Builder] Skipped unsafe path: ${change.filePath}`);
      continue;
    }
    if (change.action === "create" || change.action === "replace") {
      if (writeFileContent(change.filePath, change.content)) {
        modified.push(change.filePath);
      }
    } else if (change.action === "append") {
      const fullPath = path.resolve(process.cwd(), change.filePath);
      if (fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, "utf-8");
        if (writeFileContent(change.filePath, existing + "\n" + change.content)) {
          modified.push(change.filePath);
        }
      }
    }
  }
  return modified;
}

export async function executeStep(step: {
  id: string;
  action: string;
  filePath: string;
  description: string;
}, failureContext?: string): Promise<BuildResult> {
  const result: BuildResult = { stepId: step.id, success: false, filesModified: [] };

  if (!isSafePath(step.filePath)) {
    result.error = `Unsafe path: ${step.filePath}`;
    markStepFailed(step.id);
    return result;
  }

  markStepInProgress(step.id);

  try {
    let prompt = buildPrompt(step);
    if (failureContext) {
      prompt += `\n\n## Recent Failures (avoid repeating these mistakes)\n${failureContext}`;
    }

    // Step 1: Opus with effort "medium" builds directly
    console.log(`[Builder/Opus] Building (medium effort): ${step.description}`);
    const buildResult1 = await builderCallClaude("claude-opus-4-6", prompt, "builder-opus", `build-${step.id}`, "medium");
    const parsed1 = extractJson(buildResult1.text);
    result.usedOpus = true;

    let shellSuccess = true;
    let hadShellCommands = false;

    if (parsed1) {
      result.filesModified = applyChanges(parsed1);
      const shellResults = await executeShellCommands(parsed1);
      shellSuccess = shellResults.allSucceeded;
      hadShellCommands = (parsed1.shellCommands?.length || 0) > 0;
    }

    // Step 2: If step 1 produced nothing, retry with effort "high"
    if (result.filesModified.length === 0 && !hadShellCommands) {
      console.log(`[Builder/Opus] First attempt produced no changes, retrying (high effort)...`);
      const retryPrompt = prompt + "\n\nIMPORTANT: Your previous attempt produced no usable output. You MUST respond with valid JSON containing fileChanges and/or shellCommands.";
      const buildResult2 = await builderCallClaude("claude-opus-4-6", retryPrompt, "builder-opus-retry", `build-retry-${step.id}`, "high");
      const parsed2 = extractJson(buildResult2.text);

      if (parsed2) {
        result.filesModified = applyChanges(parsed2);
        const shellResults2 = await executeShellCommands(parsed2);
        shellSuccess = shellResults2.allSucceeded;
        hadShellCommands = (parsed2.shellCommands?.length || 0) > 0;
      }

      if (result.filesModified.length === 0 && !hadShellCommands) {
        result.error = "Opus failed to produce valid changes after 2 attempts";
        markStepFailed(step.id);
        return result;
      }
    }

    result.success = (result.filesModified.length > 0 || hadShellCommands) && shellSuccess;
    if (!shellSuccess) {
      result.error = "One or more required shell commands failed";
    }

    if (result.success) {
      markStepDone(step.id);
    } else {
      result.error = "No files were modified";
      markStepFailed(step.id);
    }
  } catch (error: any) {
    result.error = error.message || String(error);
    markStepFailed(step.id);
  }

  return result;
}

export function rollbackFiles(filePaths: string[]): string[] {
  const rolledBack: string[] = [];
  const backupDir = path.join(process.cwd(), ".sneebly", "backups", "builder");
  if (!fs.existsSync(backupDir)) return rolledBack;

  for (const filePath of filePaths) {
    const safeName = filePath.replace(/[\/\\]/g, "__");
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(safeName + ".") && f.endsWith(".bak"))
      .sort()
      .reverse();

    if (backups.length > 0) {
      const latestBackup = path.join(backupDir, backups[0]);
      const fullPath = path.resolve(process.cwd(), filePath);
      try {
        fs.copyFileSync(latestBackup, fullPath);
        rolledBack.push(filePath);
        console.log(`[Builder] Rolled back ${filePath} from backup`);
      } catch (err: any) {
        console.log(`[Builder] Failed to rollback ${filePath}: ${err.message}`);
      }
    }
  }
  return rolledBack;
}

export async function executePlan(): Promise<BuildResult[]> {
  let plan = loadCurrentPlan();
  if (!plan || plan.status !== "active") return [];

  const results: BuildResult[] = [];
  console.log(`[Builder] Executing plan: ${plan.goal} (${plan.steps.length} steps)`);

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    plan = loadCurrentPlan();
    if (!plan || plan.status !== "active") break;

    for (const step of plan.steps) {
      if (step.status !== "pending") continue;

      const depsReady = step.dependsOn.every(dep => {
        const depStep = plan!.steps.find(s => s.id === dep);
        return depStep?.status === "done";
      });
      const depsBlocked = step.dependsOn.some(dep => {
        const depStep = plan!.steps.find(s => s.id === dep);
        return depStep?.status === "failed";
      });

      if (depsBlocked) {
        markStepFailed(step.id);
        continue;
      }
      if (!depsReady) continue;

      const result = await executeStep(step);
      results.push(result);
      madeProgress = true;

      if (!result.success) {
        console.log(`[Builder] Step failed: ${step.id} — ${result.error}`);
      }

      await new Promise(r => setTimeout(r, 3000));
      break;
    }
  }

  return results;
}
