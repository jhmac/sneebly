import fs from "fs";
import path from "path";
import { loadCurrentPlan, markStepDone, markStepFailed, markStepInProgress } from "./planner-agent";
import { isPathSafe } from "./path-safety";
import { getSafePaths, getNeverModifyPaths } from "./identity";
import { extractJson, callClaude } from "./utils";
import { runShellCommand, runPackageInstall } from "./shell-executor";
import { detectMissingPackages } from "./package-detector";
import { classifyShellResult, rewriteBlockedCommandWithAI, preflightCommands } from "./shell-classifier";
import { getGroundTruth } from "./ground-truth-builder";
import { selectModel } from "./model-router";

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
  skipReason?: string;
  model?: string;
  routerReason?: string;
  patchStats?: { hits: number; misses: number; patchActions: number; replaceActions: number; createActions: number };
}

async function builderCallClaude(
  model: string,
  prompt: string,
  agent: string,
  task: string,
  effort?: "low" | "medium" | "high" | "max",
  routerReason?: string
): Promise<{ text: string }> {
  const result = await callClaude(prompt, {
    model,
    maxTokens: 16000,
    temperature: 0.2,
    effort,
    agent,
    task,
    feature: "autonomy-build",
    routerReason,
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

function autoCorrectStep(step: { id: string; action: string; filePath: string; description: string }): { id: string; action: string; filePath: string; description: string; corrections: string[] } {
  const corrections: string[] = [];
  let { action, filePath, description } = step;

  const fullPath = path.resolve(process.cwd(), filePath);
  const fileExists = fs.existsSync(fullPath);

  if (action === "create" && fileExists) {
    action = "modify";
    corrections.push(`Auto-corrected action: "create" → "modify" (${filePath} already exists)`);
  } else if (action === "modify" && !fileExists) {
    action = "create";
    corrections.push(`Auto-corrected action: "modify" → "create" (${filePath} does not exist)`);
  }

  const descLower = description.toLowerCase();
  const isSchemaWork = descLower.includes("table") || descLower.includes("schema") || descLower.includes("pgTable") || descLower.includes("migration") || descLower.includes("database column") || descLower.includes("add column");
  const wrongSchemaTargets = ["server/db.ts", "server/database.ts", "db.ts", "src/db.ts", "server/models.ts"];

  if (isSchemaWork && wrongSchemaTargets.includes(filePath)) {
    const oldPath = filePath;
    filePath = "shared/schema.ts";
    action = fs.existsSync(path.resolve(process.cwd(), "shared/schema.ts")) ? "modify" : "create";
    corrections.push(`Auto-corrected filePath: "${oldPath}" → "shared/schema.ts" (schema changes belong in shared/schema.ts)`);
  }

  const isRouteWork = descLower.includes("endpoint") || descLower.includes("api route") || descLower.includes("express route");
  if (isRouteWork && filePath === "server/index.ts") {
    const routesExists = fs.existsSync(path.resolve(process.cwd(), "server/routes.ts"));
    if (routesExists) {
      filePath = "server/routes.ts";
      action = "modify";
      corrections.push(`Auto-corrected filePath: "server/index.ts" → "server/routes.ts" (routes belong in routes.ts)`);
    }
  }

  const isStorageWork = descLower.includes("storage") || descLower.includes("repository") || descLower.includes("crud");
  if (isStorageWork && (filePath === "server/db.ts" || filePath === "server/database.ts")) {
    const storageExists = fs.existsSync(path.resolve(process.cwd(), "server/storage.ts"));
    if (storageExists) {
      filePath = "server/storage.ts";
      action = "modify";
      corrections.push(`Auto-corrected filePath: "${step.filePath}" → "server/storage.ts" (storage ops belong in storage.ts)`);
    }
  }

  if (corrections.length > 0) {
    console.log(`[Builder] Auto-corrected step ${step.id}: ${corrections.join("; ")}`);
  }

  return { id: step.id, action, filePath, description, corrections };
}

export interface PreExistenceCheckResult {
  skip: boolean;
  reason: string;
}

export function preExistenceCheck(step: { action: string; filePath: string; description: string }): PreExistenceCheckResult {
  const filePath = step.filePath;

  // File-exists check runs regardless of ground-truth availability
  if (step.action === "create") {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const lines = fs.readFileSync(fullPath, "utf-8").split("\n").length;
      return {
        skip: true,
        reason: `File "${filePath}" already exists (${lines} lines) — "create" action skipped to avoid overwriting.`,
      };
    }
  }

  // Table checks require ground truth
  const gt = getGroundTruth();
  if (!gt) return { skip: false, reason: "" };

  const TABLE_PATTERNS = [
    /(?:add|create|define|implement)\s+(\w+)\s+table/i,
    /(\w+)\s+table\s+schema/i,
    /schema\s+for\s+(\w+)\s+table/i,
    /drizzle\s+(?:schema|table)\s+(?:for\s+)?(\w+)/i,
  ];

  for (const pat of TABLE_PATTERNS) {
    const m = step.description.match(pat);
    if (m) {
      const tableName = m[1].toLowerCase().replace(/_/g, "");
      const inDb = gt.dbTables.find(t => t.toLowerCase().replace(/_/g, "") === tableName);
      const inSchema = gt.schemaTableNames.find(t => t.toLowerCase().replace(/_/g, "") === tableName);
      // Skip if the table already exists in either the DB OR the schema — either signals it's already built
      if (inDb || inSchema) {
        const where = inDb ? `PostgreSQL (as "${inDb}")` : `shared/schema.ts (as "${inSchema}")`;
        return {
          skip: true,
          reason: `Table "${tableName}" already exists in ${where} — step is already done.`,
        };
      }
    }
  }

  return { skip: false, reason: "" };
}

function buildGroundTruthSection(filePath: string, relatedFiles: string[] = []): string {
  const gt = getGroundTruth();
  if (!gt) return "";
  const lines: string[] = [
    "\n## Verified Ground Truth (AUTHORITATIVE — trust this over assumptions)",
    `**DB tables that exist in PostgreSQL:** ${gt.dbTables.join(", ") || "none"}`,
    `**Tables in shared/schema.ts:** ${gt.schemaTableNames.join(", ") || "none"}`,
  ];

  // Target file existence
  const fileInfo = gt.keyFiles[filePath];
  const targetExists = fileInfo ? fileInfo.exists : fs.existsSync(path.resolve(process.cwd(), filePath));
  const targetLines = fileInfo?.lines ?? (targetExists ? fs.readFileSync(path.resolve(process.cwd(), filePath), "utf-8").split("\n").length : 0);
  lines.push(`**Target file "${filePath}":** ${targetExists ? `EXISTS (${targetLines} lines)` : "DOES NOT EXIST — use action 'create'"}`);

  // Related files existence
  if (relatedFiles.length > 0) {
    lines.push("**Related files:**");
    for (const rf of relatedFiles) {
      const rfInfo = gt.keyFiles[rf];
      const rfExists = rfInfo ? rfInfo.exists : fs.existsSync(path.resolve(process.cwd(), rf));
      const rfLines = rfInfo?.lines ?? 0;
      lines.push(`  - ${rf}: ${rfExists ? `exists (${rfLines > 0 ? rfLines + " lines" : "non-empty"})` : "MISSING"}`);
    }
  }

  if (gt.resolvedConstraints.length > 0) {
    lines.push("**Already resolved (DO NOT redo):**");
    gt.resolvedConstraints.slice(0, 5).forEach(r => lines.push(`  - ${r.description}: ${r.evidence}`));
  }
  return lines.join("\n") + "\n";
}

function buildPrompt(step: { id: string; action: string; filePath: string; description: string }): string {
  const currentContent = readFileContent(step.filePath);
  const relatedFiles = inferRelatedFiles(step.filePath, step.description);
  const relatedContent = relatedFiles.map(f => `=== ${f} ===\n${readFileContent(f)}`).join("\n\n");

  const fileExists = fs.existsSync(path.resolve(process.cwd(), step.filePath));
  const groundTruthSection = buildGroundTruthSection(step.filePath, relatedFiles);

  return `Implement this code change.${groundTruthSection}

## Project Conventions (CRITICAL — follow exactly)
- ALL database tables go in shared/schema.ts — NEVER create separate model files
- NEVER create migration SQL files (drizzle/*.sql, migrations/*.sql) — they are AUTO-GENERATED by drizzle-kit
- To add/modify database tables: (1) edit shared/schema.ts, (2) run "npx drizzle-kit push" to apply
- CRUD methods go in server/storage.ts (IStorage interface + DatabaseStorage class)
- API routes go in server/routes.ts
- NEVER run "npm run dev" or "npm run start" — the server is already running

## Task
- File: ${step.filePath}
- Action: ${step.action}
- File exists: ${fileExists ? "YES — modify the existing file" : "NO — create a new file"}
- Description: ${step.description}

## Current File
=== ${step.filePath} ===
${currentContent}

## Related Files
${relatedContent}

You can also run shell commands when needed (e.g., for migrations, type checking, linting).
Allowed commands include:
- npx drizzle-kit push/generate/migrate/check — database schema operations
- npx tsc --noEmit / tsc --noEmit — TypeScript type checking
- npm run <script> — safe scripts only (build, check, lint, test, typecheck, format, db:push, db:generate, db:migrate, db:check, preview, clean). NEVER run dev or start.
- npm test — run tests
- npx eslint / npx prettier — linting and formatting
- cat, ls, head, tail, grep, find, wc — read and search files
- mkdir, cp, mv, touch — create and manage files/directories
- sed, awk, sort, uniq, diff — text processing
- git status, git diff, git log — version control (read-only)

PACKAGE INSTALLATION: If your code imports npm packages not already in package.json, declare them in a "requiredPackages" array in your JSON response and they will be auto-installed before the files are written. You do NOT need to emit npm install shell commands — just list the packages. Example: "requiredPackages": ["lodash", "uuid"]

IMPORTANT: Do NOT chain commands with && or ; — use separate shellCommands entries instead.

## Output format — choose the right action for each file change

**Use action "patch" (preferred for existing files)** when you are modifying an existing file and the change affects less than ~40% of the file. Emit only the exact hunks that change — do NOT output the full file. Each hunk must have an "oldText" that appears VERBATIM in the current file (copy it exactly, including indentation and surrounding lines for uniqueness) and a "newText" to replace it with. Edits are applied sequentially.

**Use action "replace"** only when you need a complete structural rewrite of an existing file, or the change is so large (>40% of file) that patch hunks would be unwieldy.

**Use action "create"** for brand new files that do not yet exist. Provide full content.

**Use action "append"** only to add content at the end of an existing file.

Respond in JSON (use \\n for newlines inside string values):
{
  "fileChanges": [
    {
      "filePath": "server/routes.ts",
      "action": "patch",
      "edits": [
        {
          "description": "Add story architect endpoint before health check",
          "oldText": "// health check\\napp.get('/api/health', (_req, res) => res.json({ ok: true }));",
          "newText": "app.post('/api/story', requireAuth, storyHandler);\\n\\n// health check\\napp.get('/api/health', (_req, res) => res.json({ ok: true }));"
        }
      ]
    },
    {
      "filePath": "server/story-agent.ts",
      "action": "create",
      "content": "// complete new file content"
    }
  ],
  "shellCommands": [
    { "command": "npx drizzle-kit push", "description": "Push schema changes to database", "required": true }
  ]
}`;
}

async function executeShellCommands(buildOutput: any): Promise<{ results: any[]; allSucceeded: boolean }> {
  const rawCommands: Array<{ command: string; description?: string; required?: boolean }> = buildOutput.shellCommands || [];
  if (rawCommands.length === 0) return { results: [], allSucceeded: true };

  const preflight = preflightCommands(rawCommands);
  const rewrittenMap = new Map<string, string>();
  const aiSkippedSet = new Set<string>();

  for (const issue of preflight) {
    if (issue.canRewrite && issue.rewritten) {
      console.log(`[Builder/Preflight] Deterministic rewrite (${issue.strategy}): ${issue.command} → ${issue.rewritten}`);
      rewrittenMap.set(issue.command, issue.rewritten);
    } else if (!issue.canRewrite) {
      console.log(`[Builder/Preflight] Deterministic rewrite failed — asking AI to rewrite: ${issue.command}`);
      const aiResult = await rewriteBlockedCommandWithAI(issue.command, issue.reason);
      if (aiResult.canRetry && aiResult.rewritten) {
        console.log(`[Builder/Preflight] AI rewrite (${aiResult.strategy}): ${issue.command} → ${aiResult.rewritten}`);
        rewrittenMap.set(issue.command, aiResult.rewritten);
      } else {
        console.log(`[Builder/Preflight] AI could not rewrite command — marking skipped-safe: ${issue.command}`);
        aiSkippedSet.add(issue.command);
      }
    }
  }

  const commands = rawCommands.map(cmd => ({
    ...cmd,
    command: rewrittenMap.get(cmd.command) ?? cmd.command,
    _originalCommand: cmd.command,
    _wasRewritten: rewrittenMap.has(cmd.command),
    _skipped: aiSkippedSet.has(cmd.command),
  }));

  const results: any[] = [];
  let allSucceeded = true;

  for (const cmd of commands) {
    if (cmd._skipped) {
      console.log(`[Builder] Skipping safety-blocked command (skipped-safe — no rewrite possible): ${cmd._originalCommand}`);
      results.push({ ...cmd, success: false, signal: "safety-blocked", skipped: true });
      continue;
    }

    console.log(`[Builder] Running shell command: ${cmd.command} — ${cmd.description || ""}${cmd._wasRewritten ? " [rewritten]" : ""}`);
    const result = await runShellCommand(cmd.command, { timeoutMs: 60000 });
    const classified = classifyShellResult(cmd.command, result);
    results.push({ ...cmd, ...result, signal: classified.signal, signalMessage: classified.message });

    if (classified.signal === "safety-blocked") {
      console.log(`[Builder] Safety-blocked at runtime — asking AI to rewrite: ${cmd.command}`);
      const aiRewrite = await rewriteBlockedCommandWithAI(cmd.command, classified.message);
      if (aiRewrite.canRetry && aiRewrite.rewritten) {
        console.log(`[Builder] AI rewrite for runtime block (${aiRewrite.strategy}): ${aiRewrite.rewritten}`);
        const retryResult = await runShellCommand(aiRewrite.rewritten, { timeoutMs: 60000 });
        const retryClassified = classifyShellResult(aiRewrite.rewritten, retryResult);
        results[results.length - 1] = { ...cmd, ...retryResult, signal: retryClassified.signal, signalMessage: retryClassified.message, rewritten: aiRewrite.rewritten };
        if (cmd.required && retryClassified.signal === "real-failure") {
          console.log(`[Builder] Required command failed after AI rewrite: ${aiRewrite.rewritten}`);
          allSucceeded = false;
        }
      } else {
        console.log(`[Builder] AI could not rewrite runtime-blocked command — marking skipped-safe (continuing): ${cmd.command}`);
      }
      continue;
    }

    if (classified.signal === "empty-result") {
      console.log(`[Builder] Command returned empty result (not a failure): ${cmd.command}`);
      continue;
    }

    if (classified.signal === "real-failure" && cmd.required) {
      console.log(`[Builder] Required command failed: ${cmd.command} — ${classified.message}`);
      allSucceeded = false;
    }
  }

  return { results, allSucceeded };
}

function applyChanges(buildOutput: any): { modified: string[]; patchHits: number; patchMisses: number; patchActions: number; replaceActions: number; createActions: number } {
  const modified: string[] = [];
  let patchHits = 0;
  let patchMisses = 0;
  let patchActions = 0;
  let replaceActions = 0;
  let createActions = 0;
  for (const change of (buildOutput.fileChanges || [])) {
    if (!isSafePath(change.filePath)) {
      console.log(`[Builder] Skipped unsafe path: ${change.filePath}`);
      continue;
    }
    if (change.action === "create" || change.action === "replace") {
      if (change.action === "create") createActions++; else replaceActions++;
      if (writeFileContent(change.filePath, change.content)) {
        console.log(`[Builder] ${change.action === "create" ? "Created" : "Replaced"} ${change.filePath}`);
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
    } else if (change.action === "patch") {
      const fullPath = path.resolve(process.cwd(), change.filePath);
      // Guard: file must exist (patch can't create files)
      if (!fs.existsSync(fullPath)) {
        console.log(`[Builder/Patch] MISS — file does not exist: ${change.filePath}. Use action "create" instead.`);
        patchActions++;
        patchMisses++;
        continue;
      }
      const edits: Array<{ oldText: string; newText: string; description?: string }> = change.edits || [];
      // Guard: patch with no edits is a miss (not a no-op)
      if (edits.length === 0) {
        console.log(`[Builder/Patch] MISS — no edits provided for ${change.filePath}`);
        patchActions++;
        patchMisses++;
        continue;
      }
      patchActions++;
      let content = fs.readFileSync(fullPath, "utf-8");
      console.log(`[Builder] Applying ${edits.length} patch hunk(s) to ${change.filePath}`);
      let localHits = 0;
      let localMisses = 0;
      for (const edit of edits) {
        if (!edit.oldText) {
          console.log(`[Builder/Patch] MISS — malformed hunk (empty oldText) in ${change.filePath}`);
          localMisses++;
          patchMisses++;
          continue;
        }
        if (content.includes(edit.oldText)) {
          // Use function replacement to prevent JS from interpreting $& $' $` etc. in newText
          const safeNewText = edit.newText ?? "";
          content = content.replace(edit.oldText, () => safeNewText);
          localHits++;
          patchHits++;
          if (edit.description) {
            console.log(`[Builder/Patch] Applied hunk in ${change.filePath}: ${edit.description}`);
          }
        } else {
          console.log(`[Builder/Patch] MISS — oldText not found in ${change.filePath}: "${edit.oldText.slice(0, 100).replace(/\n/g, "\\n")}"`);
          localMisses++;
          patchMisses++;
        }
      }
      // Always write what matched (partial writes allowed). Caller detects patchMisses > 0 and fails the step.
      if (localHits > 0) {
        const writeOk = writeFileContent(change.filePath, content);
        if (writeOk) modified.push(change.filePath);
        if (localMisses > 0) {
          console.log(`[Builder/Patch] Partial: ${localHits} hit(s), ${localMisses} miss(es) in ${change.filePath} — partial write done, step will retry`);
        } else {
          console.log(`[Builder/Patch] Applied ${localHits}/${edits.length} hunk(s) to ${change.filePath} ✓`);
        }
      } else if (localMisses > 0) {
        console.log(`[Builder/Patch] 0 hits, ${localMisses} miss(es) in ${change.filePath} — nothing written, step will retry`);
      } else {
        console.log(`[Builder/Patch] No edits to apply in ${change.filePath}`);
      }
    }
  }
  return { modified, patchHits, patchMisses, patchActions, replaceActions, createActions };
}

async function quickTscCheck(filePaths: string[]): Promise<{ passed: boolean; errors: string }> {
  const tsFiles = filePaths.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
  if (tsFiles.length === 0) return { passed: true, errors: "" };

  const { exec: execCmd } = await import("child_process");
  return new Promise((resolve) => {
    execCmd("npx tsc --noEmit --pretty false", { cwd: process.cwd(), timeout: 45000, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
      const output = ((stdout || "") + (stderr || "")).trim();
      if (!error || !output) {
        resolve({ passed: true, errors: "" });
        return;
      }
      const allLines = output.split("\n");
      const relevantLines = allLines.filter((l: string) => tsFiles.some(f => l.includes(f)));
      if (relevantLines.length > 0) {
        resolve({ passed: false, errors: relevantLines.slice(0, 15).join("\n") });
      } else {
        resolve({ passed: true, errors: "" });
      }
    });
  });
}

function buildFixPrompt(
  step: { filePath: string; description: string },
  currentErrors: string,
  lastAttemptFiles: string[],
  errorHistory: string[] = []
): string {
  const fileContents = lastAttemptFiles.map(f => `=== ${f} ===\n${readFileContent(f)}`).join("\n\n");
  const relatedFiles = inferRelatedFiles(step.filePath, step.description);
  const groundTruthSection = buildGroundTruthSection(step.filePath, relatedFiles);

  const priorAttemptsSection = errorHistory.length > 1
    ? `\n## All Prior Errors (full history — do NOT repeat the same mistakes)\n${errorHistory.map((e, i) => `### Attempt ${i + 1}\n${e}`).join("\n\n")}\n`
    : "";

  return `Your previous code change caused TypeScript errors. Fix them while preserving the intended functionality.${groundTruthSection}
## Original Task
- File: ${step.filePath}
- Description: ${step.description}
${priorAttemptsSection}
## Current Errors to Fix
${currentErrors}

## Current File Contents (with your changes applied)
${fileContents}

Fix ONLY the specific lines causing errors. Prefer action "patch" with targeted hunks — do NOT rewrite the entire file unless the errors span disconnected sections covering more than 40% of it. In that case, fall back to action "replace" with the complete corrected file content.

For patches, use an "edits" array containing the exact "oldText" (as it currently appears in the file, including enough surrounding lines for uniqueness) and the corrected "newText". Include enough context lines in "oldText" that the string is unique in the file.

Respond in JSON:
{
  "fileChanges": [
    {
      "filePath": "path/to/file.ts",
      "action": "patch",
      "edits": [
        {
          "description": "Fix the specific error",
          "oldText": "exact lines from file including context for uniqueness",
          "newText": "corrected replacement lines"
        }
      ]
    }
  ],
  "shellCommands": []
}`;
}

async function installMissingPackagesFromPlan(parsedPlan: any): Promise<{ success: boolean; failedPackage?: string }> {
  const sources: string[] = [];

  for (const change of (parsedPlan.fileChanges || [])) {
    if (change.action === "create" || change.action === "replace") {
      if (change.content) sources.push(change.content);
    } else if (change.action === "patch" && change.edits) {
      for (const edit of change.edits) {
        if (edit.newText) sources.push(edit.newText);
      }
    } else if (change.action === "append" && change.content) {
      sources.push(change.content);
    }
  }

  const declared: string[] = Array.isArray(parsedPlan.requiredPackages) ? parsedPlan.requiredPackages : [];
  const detected = detectMissingPackages(sources);
  const allMissing = Array.from(new Set([...declared, ...detected]));

  if (allMissing.length === 0) return { success: true };

  console.log(`[Builder] Auto-installing missing packages: ${allMissing.join(", ")}`);
  for (const pkg of allMissing) {
    const installResult = await runPackageInstall(pkg);
    if (installResult.success) {
      console.log(`[Builder] Installed: ${pkg}`);
    } else {
      console.log(`[Builder] Failed to install ${pkg}: ${installResult.stderr?.slice(0, 200)}`);
      return { success: false, failedPackage: pkg };
    }
  }
  return { success: true };
}

const MAX_FIX_ATTEMPTS = 2;

export async function executeStep(rawStep: {
  id: string;
  action: string;
  filePath: string;
  description: string;
  failCount?: number;
}, failureContext?: string): Promise<BuildResult> {
  const result: BuildResult = { stepId: rawStep.id, success: false, filesModified: [] };

  if (!isSafePath(rawStep.filePath)) {
    result.error = `Unsafe path: ${rawStep.filePath}`;
    return result;
  }

  markStepInProgress(rawStep.id);

  // Pre-existence check runs on the RAW step (before autoCorrectStep changes "create" to "modify")
  const preCheck = preExistenceCheck(rawStep);
  if (preCheck.skip) {
    console.log(`[Builder] Pre-existence check: SKIP — ${preCheck.reason}`);
    result.success = true;
    result.filesModified = [];
    result.skipReason = preCheck.reason;
    return result;
  }

  const corrected = autoCorrectStep(rawStep);
  const step = { id: corrected.id, action: corrected.action, filePath: corrected.filePath, description: corrected.description };

  const priorFailures = rawStep.failCount || 0;
  const modelSelection = selectModel({
    action: step.action,
    fileCount: 1,
    isRetry: priorFailures > 0,
    touchesSchema: step.filePath.includes("schema") || step.description.toLowerCase().includes("schema"),
    touchesAuth: step.description.toLowerCase().includes("auth") || step.description.toLowerCase().includes("clerk"),
    touchesPayments: step.description.toLowerCase().includes("payment") || step.description.toLowerCase().includes("stripe"),
    priorFailureCount: priorFailures,
    description: step.description,
    filePath: step.filePath,
  });

  try {
    let prompt = buildPrompt(step);
    if (corrected.corrections.length > 0) {
      prompt += `\n\n## Auto-Corrections Applied\nThe following corrections were made to the original plan step:\n${corrected.corrections.map(c => `- ${c}`).join("\n")}\nWork with the corrected values above, not the original plan.`;
    }
    if (failureContext) {
      prompt += `\n\n## Recent Failures (avoid repeating these mistakes)\n${failureContext}`;
    }

    console.log(`[Builder] Building: ${step.description.slice(0, 80)} — ${modelSelection.model} @ ${modelSelection.effort} (${modelSelection.reason})`);
    result.model = modelSelection.model;
    result.routerReason = modelSelection.reason;
    const buildResult1 = await builderCallClaude(modelSelection.model, prompt, "builder", `build-${step.id}`, modelSelection.effort, modelSelection.reason);
    const parsed1 = extractJson(buildResult1.text);
    result.usedOpus = modelSelection.model.includes("opus");

    let shellSuccess = true;
    let hadShellCommands = false;

    if (parsed1) {
      const installResult1 = await installMissingPackagesFromPlan(parsed1);
      if (!installResult1.success) {
        result.error = `Package installation failed for "${installResult1.failedPackage}" — aborting step to avoid shipping code with unresolved dependencies`;
        return result;
      }
      const applyResult1 = applyChanges(parsed1);
      result.filesModified = applyResult1.modified;
      result.patchStats = { hits: applyResult1.patchHits, misses: applyResult1.patchMisses, patchActions: applyResult1.patchActions, replaceActions: applyResult1.replaceActions, createActions: applyResult1.createActions };
      if (applyResult1.patchMisses > 0) {
        result.error = `Patch miss: ${applyResult1.patchMisses} hunk(s) not found — partial changes written, step must retry`;
        return result;
      }
      const shellResults = await executeShellCommands(parsed1);
      shellSuccess = shellResults.allSucceeded;
      hadShellCommands = (parsed1.shellCommands?.length || 0) > 0;
    }

    if (result.filesModified.length === 0 && !hadShellCommands) {
      const retryModel = selectModel({ ...modelSelection, isRetry: true, priorFailureCount: (rawStep.failCount || 0) + 1, action: step.action, filePath: step.filePath, description: step.description });
      console.log(`[Builder] First attempt empty, retrying — ${retryModel.model} @ ${retryModel.effort} (${retryModel.reason})`);
      const retryPrompt = prompt + "\n\nIMPORTANT: Your previous attempt produced no usable output. You MUST respond with valid JSON containing fileChanges and/or shellCommands.";
      result.model = retryModel.model;
      result.routerReason = retryModel.reason;
      const buildResult2 = await builderCallClaude(retryModel.model, retryPrompt, "builder-retry", `build-retry-${step.id}`, retryModel.effort, retryModel.reason);
      const parsed2 = extractJson(buildResult2.text);

      if (parsed2) {
        const installResult2 = await installMissingPackagesFromPlan(parsed2);
        if (!installResult2.success) {
          result.error = `Package installation failed for "${installResult2.failedPackage}" — aborting step to avoid shipping code with unresolved dependencies`;
          return result;
        }
        const applyResult2 = applyChanges(parsed2);
        result.filesModified = applyResult2.modified;
        result.patchStats = { hits: applyResult2.patchHits, misses: applyResult2.patchMisses, patchActions: applyResult2.patchActions, replaceActions: applyResult2.replaceActions, createActions: applyResult2.createActions };
        if (applyResult2.patchMisses > 0) {
          result.error = `Patch miss (retry attempt): ${applyResult2.patchMisses} hunk(s) not found — partial changes written, step must retry`;
          return result;
        }
        const shellResults2 = await executeShellCommands(parsed2);
        shellSuccess = shellResults2.allSucceeded;
        hadShellCommands = (parsed2.shellCommands?.length || 0) > 0;
      }

      if (result.filesModified.length === 0 && !hadShellCommands) {
        result.error = "Opus failed to produce valid changes after 2 attempts";
        return result;
      }
    }

    if (result.filesModified.length > 0) {
      const tscCheck = await quickTscCheck(result.filesModified);

      if (!tscCheck.passed) {
        console.log(`[Builder/Opus] TypeScript errors detected — entering fix loop (max ${MAX_FIX_ATTEMPTS} attempts)`);
        const errorHistory: string[] = [tscCheck.errors];

        let currentErrors = tscCheck.errors;
        for (let fixAttempt = 1; fixAttempt <= MAX_FIX_ATTEMPTS; fixAttempt++) {
          console.log(`[Builder/Opus] Fix attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS}...`);
          const fixPrompt = buildFixPrompt(step, currentErrors, result.filesModified, errorHistory);
          const fixEffort: "medium" | "high" = fixAttempt === 1 ? "medium" : "high";
          const fixResult = await builderCallClaude("claude-opus-4-6", fixPrompt, "builder-opus-fix", `fix-${step.id}-${fixAttempt}`, fixEffort);
          const fixParsed = extractJson(fixResult.text);

          if (fixParsed?.fileChanges) {
            const fixApplyResult = applyChanges(fixParsed);
            for (const f of fixApplyResult.modified) {
              if (!result.filesModified.includes(f)) result.filesModified.push(f);
            }
            // Accumulate patch stats across all apply calls in this step
            result.patchStats = {
              hits: (result.patchStats?.hits ?? 0) + fixApplyResult.patchHits,
              misses: (result.patchStats?.misses ?? 0) + fixApplyResult.patchMisses,
              patchActions: (result.patchStats?.patchActions ?? 0) + fixApplyResult.patchActions,
              replaceActions: (result.patchStats?.replaceActions ?? 0) + fixApplyResult.replaceActions,
              createActions: (result.patchStats?.createActions ?? 0) + fixApplyResult.createActions,
            };
            // Uniform rule: any patch miss = step failure regardless of where it occurs.
            // Partial writes already committed; outer retry loop starts the step fresh.
            if (fixApplyResult.patchMisses > 0) {
              result.error = `Fix-loop patch miss (attempt ${fixAttempt}): ${fixApplyResult.patchMisses} hunk(s) not found — partial changes written, step must retry from scratch`;
              return result;
            }
          }

          const recheck = await quickTscCheck(result.filesModified);
          if (recheck.passed) {
            console.log(`[Builder/Opus] Fix attempt ${fixAttempt} resolved TypeScript errors`);
            break;
          }

          currentErrors = recheck.errors;
          errorHistory.push(recheck.errors);

          if (fixAttempt === MAX_FIX_ATTEMPTS) {
            console.log(`[Builder/Opus] TypeScript errors persist after ${MAX_FIX_ATTEMPTS} fix attempts — continuing with best effort`);
            result.error = `TS errors after ${MAX_FIX_ATTEMPTS} fix attempts: ${recheck.errors.slice(0, 300)}`;
          }
        }
      }
    }

    result.success = (result.filesModified.length > 0 || hadShellCommands) && shellSuccess;
    if (!shellSuccess) {
      result.error = "One or more required shell commands failed";
    }

    if (result.success) {
      markStepDone(step.id);
    } else if (!result.error) {
      result.error = "No files were modified";
    }
  } catch (error: any) {
    result.error = error.message || String(error);
  }

  return result;
}

export function rollbackFiles(filePaths: string[]): string[] {
  const rolledBack: string[] = [];
  const backupDir = path.join(process.cwd(), ".sneebly", "backups", "builder");
  const hasBackupDir = fs.existsSync(backupDir);

  for (const filePath of filePaths) {
    const fullPath = path.resolve(process.cwd(), filePath);
    let restored = false;

    if (hasBackupDir) {
      const safeName = filePath.replace(/[\/\\]/g, "__");
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(safeName + ".") && f.endsWith(".bak"))
        .sort()
        .reverse();

      if (backups.length > 0) {
        const latestBackup = path.join(backupDir, backups[0]);
        try {
          fs.copyFileSync(latestBackup, fullPath);
          rolledBack.push(filePath);
          console.log(`[Builder] Rolled back ${filePath} from backup`);
          restored = true;
        } catch (err: any) {
          console.log(`[Builder] Failed to rollback ${filePath}: ${err.message}`);
        }
      }
    }

    // No backup existed → this was a newly created file; delete it to prevent orphans
    if (!restored) {
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`[Builder] Deleted newly created file during rollback: ${filePath}`);
        }
      } catch (err: any) {
        console.log(`[Builder] Could not delete new file ${filePath}: ${err.message}`);
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
        return depStep?.status === "done" || depStep?.status === "skipped";
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
