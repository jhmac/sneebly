import fs from "fs";
import path from "path";
import { isPathSafe } from "./path-safety";
import { getSafePaths, getNeverModifyPaths } from "./identity";
import { extractJson, callClaude } from "./utils";
import { runShellCommand } from "./shell-executor";
import { validateSpec } from "./spec-validator";
import { onSpecBlocked } from "./spec-monitor";
import { validateConstraint, isConstraintResolved, markConstraintResolved } from "./constraint-pre-validator";
import { selectModel, taskFromSpec } from "./model-router";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const QUEUE_DIR = path.join(DATA_DIR, "queue", "pending");
const APPROVED_QUEUE_DIR = path.join(DATA_DIR, "approved-queue");
const BLOCKED_DIR = path.join(DATA_DIR, "blocked");
const ARCHIVE_DIR = path.join(DATA_DIR, "archive", "done");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const BLOCKED_CONSTRAINTS_FILE = path.join(DATA_DIR, "blocked-constraints.json");

const MAX_ITERATIONS = 3;
const MAX_STUCK_ATTEMPTS = 2;
const INTER_SPEC_DELAY_MS = 3000;
const MAX_SAME_ERROR_REPEATS = 2;
const MAX_SPECS_PER_CONSTRAINT = 2;
const CONSTRAINT_SIMILARITY_THRESHOLD = 0.6;
const FAIL_COUNT_TO_AUTO_BLOCK = 3;

interface SpecResult {
  specId: string;
  status: "done" | "max-iterations" | "stuck" | "blocked" | "skipped";
  iterations: number;
  filesModified: string[];
  error?: string;
  cost: number;
}

function ensureDirs(): void {
  for (const dir of [QUEUE_DIR, BLOCKED_DIR, ARCHIVE_DIR, DAILY_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function logToDaily(message: string): void {
  const today = new Date().toISOString().split("T")[0];
  const logPath = path.join(DAILY_DIR, `${today}.md`);
  const timestamp = new Date().toISOString();
  const line = `- [${timestamp}] ${message}\n`;
  fs.appendFileSync(logPath, line, "utf-8");
}

function isSafePath(filePath: string): boolean {
  return isPathSafe(filePath, getSafePaths(), getNeverModifyPaths());
}

interface BlockedConstraint {
  description: string;
  blockedAt: string;
  failCount: number;
  specIds: string[];
}

function loadBlockedConstraints(): BlockedConstraint[] {
  try {
    if (fs.existsSync(BLOCKED_CONSTRAINTS_FILE)) {
      return JSON.parse(fs.readFileSync(BLOCKED_CONSTRAINTS_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function saveBlockedConstraints(constraints: BlockedConstraint[]): void {
  fs.writeFileSync(BLOCKED_CONSTRAINTS_FILE, JSON.stringify(constraints, null, 2), "utf-8");
}

function tokenize(text: string): Set<string> {
  return new Set((text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
}

function constraintSimilarity(a: string, b: string): number {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  Array.from(tokA).forEach(t => { if (tokB.has(t)) intersection++; });
  return intersection / Math.min(tokA.size, tokB.size);
}

function normaliseConstraint(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function isConstraintBlocked(constraintDesc: string): boolean {
  if (!constraintDesc) return false;
  const norm = normaliseConstraint(constraintDesc);
  const blocked = loadBlockedConstraints();
  return blocked.some(bc => {
    const bcNorm = normaliseConstraint(bc.description);
    // Primary: normalized substring match (catches reworded variants)
    if (norm.includes(bcNorm) || bcNorm.includes(norm)) return true;
    // Secondary: token overlap similarity
    return constraintSimilarity(constraintDesc, bc.description) >= CONSTRAINT_SIMILARITY_THRESHOLD;
  });
}

function addBlockedConstraint(constraintDesc: string, specId: string): void {
  if (!constraintDesc) return;
  const blocked = loadBlockedConstraints();
  const normDesc = normaliseConstraint(constraintDesc);
  const existing = blocked.find(bc => {
    const bcNorm = normaliseConstraint(bc.description);
    return normDesc.includes(bcNorm) || bcNorm.includes(normDesc) ||
      constraintSimilarity(constraintDesc, bc.description) >= CONSTRAINT_SIMILARITY_THRESHOLD;
  });
  if (existing) {
    existing.failCount++;
    if (!existing.specIds.includes(specId)) existing.specIds.push(specId);
    if (existing.failCount >= FAIL_COUNT_TO_AUTO_BLOCK) {
      console.log(`[SpecExecutor] WARNING: Constraint has failed ${existing.failCount} times — ELON may be regenerating blocked specs. Constraint: "${constraintDesc.slice(0, 80)}"`);
      logToDaily(`ELON loop warning: constraint failed ${existing.failCount}x — "${constraintDesc.slice(0, 80)}". Check resolved-constraints.json and blocked-constraints.json.`);
    }
  } else {
    blocked.push({
      description: constraintDesc,
      blockedAt: new Date().toISOString(),
      failCount: 1,
      specIds: [specId],
    });
    console.log(`[SpecExecutor] Constraint blocked after failure: "${constraintDesc.slice(0, 80)}"`);
  }
  saveBlockedConstraints(blocked);
  feedbackToElon(constraintDesc);
}

function feedbackToElon(constraintDesc: string): void {
  try {
    const elonLogPath = path.join(DATA_DIR, "elon-log.json");
    if (!fs.existsSync(elonLogPath)) return;
    const elonLog = JSON.parse(fs.readFileSync(elonLogPath, "utf-8"));
    if (!elonLog.history) elonLog.history = [];
    const alreadyInHistory = elonLog.history.some((h: any) =>
      constraintSimilarity(h.description || h, constraintDesc) >= CONSTRAINT_SIMILARITY_THRESHOLD
    );
    if (!alreadyInHistory) {
      elonLog.history.push({
        description: constraintDesc,
        status: "blocked",
        blockedAt: new Date().toISOString(),
        reason: "Specs for this constraint repeatedly failed — constraint auto-blocked",
      });
      elonLog.failedAttempts = elonLog.failedAttempts || [];
      elonLog.failedAttempts.push({
        constraint: constraintDesc,
        failedAt: new Date().toISOString(),
        reason: "auto-blocked after repeated spec failures",
      });
      fs.writeFileSync(elonLogPath, JSON.stringify(elonLog, null, 2), "utf-8");
      logToDaily(`Feedback to ELON: blocked constraint added to history — "${constraintDesc.slice(0, 100)}"`);
    }
  } catch (err: any) {
    console.log(`[SpecExecutor] Failed to write ELON feedback: ${err.message}`);
  }
}

function sanitizeApprovedQueue(): number {
  let purged = 0;
  try {
    if (!fs.existsSync(APPROVED_QUEUE_DIR)) return 0;
    const files = fs.readdirSync(APPROVED_QUEUE_DIR).filter(f => f.endsWith(".json"));
    const constraintCounts: Record<string, number> = {};
    
    for (const file of files) {
      const filePath = path.join(APPROVED_QUEUE_DIR, file);
      try {
        const spec = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const constraint = spec.constraint || spec.elonConstraint || "";
        
        if (isConstraintBlocked(constraint)) {
          const rejectedDir = path.join(DATA_DIR, "rejected");
          if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
          fs.renameSync(filePath, path.join(rejectedDir, file));
          purged++;
          continue;
        }

        const alreadyResolved = isConstraintResolved(constraint);
        if (alreadyResolved.resolved) {
          const rejectedDir = path.join(DATA_DIR, "rejected");
          if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
          fs.renameSync(filePath, path.join(rejectedDir, file));
          purged++;
          console.log(`[SpecExecutor] Rejected spec "${file}" — constraint already resolved: ${alreadyResolved.evidence.slice(0, 80)}`);
          continue;
        }
        
        const key = normaliseConstraint(constraint);
        constraintCounts[key] = (constraintCounts[key] || 0) + 1;
        if (constraintCounts[key] > MAX_SPECS_PER_CONSTRAINT) {
          const rejectedDir = path.join(DATA_DIR, "rejected");
          if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
          fs.renameSync(filePath, path.join(rejectedDir, file));
          purged++;
        }
      } catch {}
    }
    
    if (purged > 0) {
      logToDaily(`Sanitized approved-queue: purged ${purged} spec(s) matching blocked constraints or exceeding per-constraint cap`);
      console.log(`[SpecExecutor] Sanitized approved-queue: purged ${purged} specs`);
    }
  } catch (err: any) {
    console.log(`[SpecExecutor] Failed to sanitize approved-queue: ${err.message}`);
  }
  return purged;
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
        `\n\n[TRUNCATED — showing ${keptLines.length} of ${lines.length} lines]`;
    }
    return content;
  } catch {
    return `[Cannot read: ${filePath}]`;
  }
}

function autoCorrectSpec(spec: any): { spec: any; corrections: string[] } {
  const corrections: string[] = [];
  const filePath = spec.filePath || "";
  const descLower = (spec.description || "").toLowerCase();
  const fullPath = path.resolve(process.cwd(), filePath);
  const fileExists = fs.existsSync(fullPath);

  if (spec.action === "create" && fileExists) {
    spec.action = "modify";
    corrections.push(`Action "create" → "modify" (${filePath} already exists)`);
  } else if ((spec.action === "modify" || spec.action === "replace") && !fileExists) {
    spec.action = "create";
    corrections.push(`Action "${spec.action}" → "create" (${filePath} does not exist)`);
  }

  const isSchemaWork = descLower.includes("table") || descLower.includes("schema") ||
    descLower.includes("pgtable") || descLower.includes("migration") ||
    descLower.includes("database column") || descLower.includes("add column");
  const wrongSchemaTargets = ["server/db.ts", "server/database.ts", "db.ts", "src/db.ts",
    "server/models.ts", "shared/types/user.ts", "shared/models/user.ts",
    "shared/models/users.ts", "shared/types/users.ts"];

  if (isSchemaWork && wrongSchemaTargets.some(t => filePath === t || filePath.startsWith("shared/models/") || filePath.startsWith("shared/types/"))) {
    const oldPath = spec.filePath;
    spec.filePath = "shared/schema.ts";
    spec.action = "modify";
    corrections.push(`FilePath "${oldPath}" → "shared/schema.ts" (all schema work goes in shared/schema.ts)`);

    if (spec.testCommand) {
      spec.testCommand = spec.testCommand
        .replace(new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "shared/schema.ts");
    }
  }

  if (filePath.match(/drizzle\/.*\.sql$/i) || filePath.match(/migrations\/.*\.sql$/i)) {
    spec.filePath = "shared/schema.ts";
    spec.action = "modify";
    spec.testCommand = "npx drizzle-kit push";
    corrections.push(`Redirected migration SQL file → shared/schema.ts + drizzle-kit push`);
  }

  return { spec, corrections };
}

function buildSpecPrompt(spec: any, iteration: number, previousError?: string): string {
  const filePath = spec.filePath;
  const currentContent = readFileContent(filePath);
  const fileExists = fs.existsSync(path.resolve(process.cwd(), filePath));

  const relatedContent = (spec.relatedFiles || [])
    .filter((f: string) => fs.existsSync(path.resolve(process.cwd(), f)))
    .slice(0, 4)
    .map((f: string) => `=== ${f} ===\n${readFileContent(f)}`)
    .join("\n\n");

  const schemaContent = filePath !== "shared/schema.ts"
    ? `\n=== shared/schema.ts ===\n${readFileContent("shared/schema.ts")}`
    : "";

  let prompt = `You are a code builder. Execute this spec precisely.

## Project Conventions (CRITICAL — follow exactly)
- ALL database tables go in shared/schema.ts — NEVER create separate model files
- NEVER create migration SQL files (drizzle/*.sql, migrations/*.sql) — they are AUTO-GENERATED by drizzle-kit from shared/schema.ts
- To add/modify database tables: (1) edit shared/schema.ts, (2) run "npx drizzle-kit push" to apply
- ID pattern: varchar("id").primaryKey().default(sql\`gen_random_uuid()\`) — NOT uuid().defaultRandom()
- Export insertSchema + InsertType + SelectType after each table
- CRUD methods go in server/storage.ts (IStorage interface + DatabaseStorage class)
- API routes go in server/routes.ts
- Types are inferred from Drizzle schema, NOT separate type files
- NEVER run "npm run dev" or "npm run start" — the server is already running

## Spec
- File: ${filePath}
- Action: ${spec.action}
- File exists: ${fileExists ? "YES — modify/extend the existing file" : "NO — create new file"}
- Description: ${spec.description}
${spec.buildNotes ? `- Build Notes: ${spec.buildNotes}` : ""}
${spec.constraint ? `- Constraint: ${spec.constraint}` : ""}

## Success Criteria
${(spec.successCriteria || []).map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

## Test Command
${spec.testCommand || "none"}

## Current File
=== ${filePath} ===
${currentContent}

## Related Files
${relatedContent}
${schemaContent}

## Instructions
Output the COMPLETE file content for ${filePath}. Include ALL existing code plus your additions.
Match the existing code style exactly. Do not remove existing code unless the spec explicitly says to.

You can also run shell commands when needed.
Allowed: npx drizzle-kit push/generate/check, npx tsc --noEmit, npm run <script> (NOT dev/start), npm test, npx eslint, cat, ls, grep, find, mkdir, cp, mv, touch.
Do NOT run npm install (causes server restarts). Do NOT chain commands with && or ; — use separate shellCommands entries.

Respond in JSON:
{
  "fileChanges": [
    { "filePath": "${filePath}", "action": "create|replace", "content": "complete file content" }
  ],
  "shellCommands": [
    { "command": "npx drizzle-kit push", "description": "Push schema changes", "required": true }
  ]
}`;

  if (previousError && iteration > 1) {
    prompt += `

## PREVIOUS ATTEMPT FAILED (attempt ${iteration - 1})
Error: ${previousError}
Do NOT repeat the same approach. Analyze the error and try a different strategy.`;
  }

  return prompt;
}

function backupFile(filePath: string): void {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return;

  const backupDir = path.join(DATA_DIR, "backups", "spec-executor");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const safeName = filePath.replace(/[\/\\]/g, "__");
  fs.copyFileSync(fullPath, path.join(backupDir, `${safeName}.${Date.now()}.bak`));
}

function rollbackFile(filePath: string): boolean {
  const backupDir = path.join(DATA_DIR, "backups", "spec-executor");
  if (!fs.existsSync(backupDir)) return false;

  const safeName = filePath.replace(/[\/\\]/g, "__");
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(safeName + ".") && f.endsWith(".bak"))
    .sort()
    .reverse();

  if (backups.length > 0) {
    const fullPath = path.resolve(process.cwd(), filePath);
    fs.copyFileSync(path.join(backupDir, backups[0]), fullPath);
    return true;
  }
  return false;
}

function applyChanges(buildOutput: any): string[] {
  const modified: string[] = [];
  for (const change of (buildOutput.fileChanges || [])) {
    if (!isSafePath(change.filePath)) {
      console.log(`[SpecExecutor] Skipped unsafe path: ${change.filePath}`);
      continue;
    }

    const fullPath = path.resolve(process.cwd(), change.filePath);
    backupFile(change.filePath);

    if (change.action === "create" || change.action === "replace") {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, change.content, "utf-8");
      modified.push(change.filePath);
    } else if (change.action === "append") {
      if (fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, "utf-8");
        fs.writeFileSync(fullPath, existing + "\n" + change.content, "utf-8");
        modified.push(change.filePath);
      }
    }
  }
  return modified;
}

async function runTestCommand(testCommand: string): Promise<{ passed: boolean; output: string }> {
  if (!testCommand || testCommand === "none") return { passed: true, output: "" };

  const commands = testCommand.includes("&&")
    ? testCommand.split("&&").map(c => c.trim())
    : [testCommand];

  for (const cmd of commands) {
    const result = await runShellCommand(cmd, { timeoutMs: 30000 });
    if (!result.success) {
      return {
        passed: false,
        output: `Command "${cmd}" failed (exit ${result.exitCode}): ${(result.stderr || result.stdout || "").slice(0, 500)}`,
      };
    }
  }

  return { passed: true, output: "All test commands passed" };
}

async function escalateToOpus(
  spec: any,
  lastError: string,
  partialResult: SpecResult
): Promise<{ solved: boolean; filesModified: string[]; reason: string }> {
  const filePath = spec.filePath;
  const currentContent = readFileContent(filePath);
  const schemaContent = filePath !== "shared/schema.ts" ? readFileContent("shared/schema.ts") : "";

  const relatedContent = (spec.relatedFiles || [])
    .filter((f: string) => fs.existsSync(path.resolve(process.cwd(), f)))
    .slice(0, 4)
    .map((f: string) => `=== ${f} ===\n${readFileContent(f)}`)
    .join("\n\n");

  const prompt = `You are Opus, the senior architect. Sonnet tried ${partialResult.iterations} times to implement this spec and failed every time. You must either:
1. SOLVE the problem directly by producing the correct file changes, OR
2. If the spec itself is flawed, produce CORRECTED file changes that achieve the spec's intent in a different way

## The Spec That Failed
- File: ${filePath}
- Action: ${spec.action}
- Description: ${spec.description}
${spec.buildNotes ? `- Build Notes: ${spec.buildNotes}` : ""}
${spec.constraint ? `- Constraint: ${spec.constraint}` : ""}

## Success Criteria
${(spec.successCriteria || []).map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

## Test Command
${spec.testCommand || "none"}

## Error History From Sonnet (all attempts)
${lastError}

## Current File State
=== ${filePath} ===
${currentContent}

${schemaContent ? `\n=== shared/schema.ts ===\n${schemaContent}` : ""}

## Related Files
${relatedContent}

## Project Conventions (CRITICAL)
- ALL database tables in shared/schema.ts — NEVER separate model files
- ID pattern: varchar("id").primaryKey().default(sql\`gen_random_uuid()\`)
- CRUD in server/storage.ts (IStorage interface + DatabaseStorage class)
- API routes in server/routes.ts
- Types inferred from Drizzle schema

## Your Task
Analyze WHY Sonnet failed. Common causes:
- Wrong file structure or missing imports
- Misunderstanding of existing code patterns
- Test command expects something the code doesn't provide
- The spec targets the wrong file or uses wrong conventions

Then produce the CORRECT implementation. Output COMPLETE file content.

Respond in JSON:
{
  "diagnosis": "Brief explanation of why Sonnet failed",
  "approach": "What you're doing differently",
  "fileChanges": [
    { "filePath": "${filePath}", "action": "create|replace", "content": "complete file content" }
  ],
  "shellCommands": [
    { "command": "...", "description": "...", "required": true }
  ]
}`;

  const escalationSelection = selectModel({ isEscalation: true, priorFailureCount: partialResult.iterations, description: spec.description, filePath: spec.filePath });
  console.log(`[SpecExecutor/Opus] Escalating spec ${partialResult.specId} — ${escalationSelection.model} @ ${escalationSelection.effort} (${escalationSelection.reason})`);

  const claudeResult = await callClaude(prompt, {
    model: escalationSelection.model,
    maxTokens: 32000,
    effort: escalationSelection.effort,
    agent: "spec-executor-opus-escalation",
    task: `opus-fix-${partialResult.specId}`,
    feature: "opus-escalation",
    context: `Fixing blocked spec: ${spec.description?.slice(0, 80)}`,
    routerReason: escalationSelection.reason,
  });

  partialResult.cost += claudeResult.cost;
  logToDaily(`spec-executor (opus escalation): $${claudeResult.cost.toFixed(3)}`);

  const parsed = extractJson(claudeResult.text);
  if (!parsed?.fileChanges?.length) {
    return { solved: false, filesModified: [], reason: "Opus produced no file changes" };
  }

  if (parsed.diagnosis) {
    console.log(`[SpecExecutor/Opus] Diagnosis: ${parsed.diagnosis}`);
  }
  if (parsed.approach) {
    console.log(`[SpecExecutor/Opus] Approach: ${parsed.approach}`);
  }

  for (const f of (parsed.fileChanges || [])) {
    backupFile(f.filePath);
  }
  const modified = applyChanges(parsed);

  const shellCommands = parsed.shellCommands || [];
  for (const cmd of shellCommands) {
    console.log(`[SpecExecutor/Opus] Running: ${cmd.command} — ${cmd.description || ""}`);
    const shellResult = await runShellCommand(cmd.command, { timeoutMs: 60000 });
    if (!shellResult.success && cmd.required !== false) {
      console.log(`[SpecExecutor/Opus] Command failed: ${cmd.command}`);
    }
  }

  const testResult = await runTestCommand(spec.testCommand);
  if (testResult.passed) {
    console.log(`[SpecExecutor/Opus] Opus SOLVED the spec — tests pass!`);
    return { solved: true, filesModified: modified, reason: "Opus fixed it" };
  }

  for (const f of modified) {
    rollbackFile(f);
  }
  console.log(`[SpecExecutor/Opus] Opus fix didn't pass tests either: ${testResult.output.slice(0, 200)}`);
  return { solved: false, filesModified: [], reason: `Opus changes also failed tests: ${testResult.output.slice(0, 200)}` };
}

async function executeSpec(spec: any): Promise<SpecResult> {
  const result: SpecResult = {
    specId: spec.id || "unknown",
    status: "max-iterations",
    iterations: 0,
    filesModified: [],
    cost: 0,
  };

  const { spec: correctedSpec, corrections } = autoCorrectSpec({ ...spec });
  if (corrections.length > 0) {
    console.log(`[SpecExecutor] Auto-corrected spec ${result.specId}: ${corrections.join("; ")}`);
    logToDaily(`spec auto-corrected: ${corrections.join("; ")}`);
  }

  let previousError: string | undefined;
  let stuckCount = 0;
  let sameErrorCount = 0;
  let lastErrorSignature = "";
  const errorHistory: string[] = [];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    result.iterations = iteration;

    try {
      const prompt = buildSpecPrompt(correctedSpec, iteration, previousError);

      const priorFailures = iteration - 1;
      const modelSelection = selectModel(taskFromSpec(correctedSpec, priorFailures));
      if (iteration > 1) {
        console.log(`[SpecExecutor] Retry ${iteration} — ${modelSelection.model} @ ${modelSelection.effort} (${modelSelection.reason})`);
      }

      const claudeResult = await callClaude(prompt, {
        model: modelSelection.model,
        maxTokens: modelSelection.thinkingTokens ? 16000 : 8192,
        effort: modelSelection.effort,
        agent: "spec-executor",
        task: `spec-${result.specId}-iter${iteration}`,
        feature: "spec-executor",
        context: correctedSpec.description?.slice(0, 100),
        routerReason: modelSelection.reason,
      });

      result.cost += claudeResult.cost;
      logToDaily(`spec-executor (${modelSelection.model}): queue — $${claudeResult.cost.toFixed(3)}`);

      const parsed = extractJson(claudeResult.text);

      if (!parsed || (!parsed.fileChanges?.length && !parsed.shellCommands?.length)) {
        const stuckReason = claudeResult.text.slice(0, 500);

        if (claudeResult.text.toLowerCase().includes("cannot") ||
            claudeResult.text.toLowerCase().includes("stuck") ||
            claudeResult.text.toLowerCase().includes("impossible") ||
            claudeResult.text.toLowerCase().includes("need clarification")) {
          stuckCount++;
          previousError = stuckReason;
          errorHistory.push(`Iteration ${iteration}: STUCK — ${stuckReason.slice(0, 200)}`);
          logToDaily(`Ralph Loop: attempt ${iteration} stuck (${stuckReason.slice(0, 200)}) — retrying with context`);

          if (stuckCount >= MAX_STUCK_ATTEMPTS) {
            logToDaily(`Ralph Loop: stuck after ${iteration} iteration(s) — ${stuckReason.slice(0, 300)} (after ${stuckCount} consecutive stuck attempts)`);
            result.status = "stuck";
            result.error = stuckReason;
            return result;
          }
          continue;
        }

        previousError = "No valid JSON output or no changes produced";
        logToDaily(`Ralph Loop: no output from Sonnet — retrying`);
        continue;
      }

      stuckCount = 0;

      const modified = applyChanges(parsed);
      result.filesModified = modified;

      const shellCommands = parsed.shellCommands || [];
      for (const cmd of shellCommands) {
        console.log(`[SpecExecutor] Running: ${cmd.command} — ${cmd.description || ""}`);
        const shellResult = await runShellCommand(cmd.command, { timeoutMs: 60000 });
        if (!shellResult.success && cmd.required !== false) {
          console.log(`[SpecExecutor] Required command failed: ${cmd.command}`);
        }
      }

      const testResult = await runTestCommand(correctedSpec.testCommand);

      if (testResult.passed) {
        logToDaily(`Ralph Loop: spec ${result.specId} PASSED on iteration ${iteration}`);
        result.status = "done";
        return result;
      }

      for (const f of modified) {
        rollbackFile(f);
      }
      previousError = testResult.output;
      errorHistory.push(`Iteration ${iteration}: TEST FAILED — ${testResult.output.slice(0, 300)}`);
      logToDaily(`Ralph Loop: tests failed after changes. Rolled back ${modified.length} file(s)`);

      const errorSig = (testResult.output || "").slice(0, 200);
      if (errorSig === lastErrorSignature) {
        sameErrorCount++;
        if (sameErrorCount >= MAX_SAME_ERROR_REPEATS) {
          console.log(`[SpecExecutor] Same error repeated ${sameErrorCount} times — escalating to Opus...`);
          logToDaily(`Ralph Loop: same error ${sameErrorCount} times — escalating to Opus`);
          try {
            const opusFixResult = await escalateToOpus(correctedSpec, errorHistory.join("\n\n"), result);
            if (opusFixResult.solved) {
              logToDaily(`Ralph Loop: Opus SOLVED repeated-error spec ${result.specId}`);
              result.status = "done";
              result.filesModified = opusFixResult.filesModified;
              return result;
            }
          } catch (err: any) {
            logToDaily(`Ralph Loop: Opus escalation failed for repeated error: ${err.message}`);
          }
          result.status = "blocked";
          result.error = `Same error repeated ${sameErrorCount} times: ${errorSig}`;
          return result;
        }
      } else {
        sameErrorCount = 1;
        lastErrorSignature = errorSig;
      }

    } catch (error: any) {
      if (error.name === "BudgetExceeded") {
        result.status = "blocked";
        result.error = "Budget exceeded";
        logToDaily(`Ralph Loop: budget exceeded — stopping spec ${result.specId}`);
        return result;
      }
      previousError = error.message || String(error);
      logToDaily(`Ralph Loop: error — ${previousError?.slice(0, 200)}`);
    }
  }

  console.log(`[SpecExecutor] Sonnet exhausted — escalating to Opus for diagnosis and fix...`);
  logToDaily(`Ralph Loop: Sonnet exhausted after ${result.iterations} iterations — escalating to Opus`);

  try {
    const fullErrorContext = errorHistory.length > 0 ? errorHistory.join("\n\n") : (previousError || "Max iterations reached");
    const opusResult = await escalateToOpus(correctedSpec, fullErrorContext, result);
    if (opusResult.solved) {
      logToDaily(`Ralph Loop: Opus SOLVED spec ${result.specId} that Sonnet couldn't handle`);
      result.status = "done";
      result.filesModified = opusResult.filesModified;
      return result;
    }
    logToDaily(`Ralph Loop: Opus also couldn't solve spec ${result.specId}: ${opusResult.reason}`);
    result.error = `Opus escalation failed: ${opusResult.reason}`;
  } catch (err: any) {
    logToDaily(`Ralph Loop: Opus escalation error: ${err.message}`);
    result.error = previousError || "Max iterations reached";
  }

  result.status = "blocked";
  logToDaily(`Ralph Loop: BLOCKED after ${result.iterations} iteration(s) + Opus escalation — ${result.error?.slice(0, 300)}`);
  return result;
}

function moveSpec(specFile: string, destDir: string, extraData?: Record<string, any>): void {
  const dest = path.join(destDir, path.basename(specFile));
  try {
    if (extraData) {
      const content = JSON.parse(fs.readFileSync(specFile, "utf-8"));
      Object.assign(content, extraData);
      fs.writeFileSync(dest, JSON.stringify(content, null, 2), "utf-8");
    } else {
      fs.copyFileSync(specFile, dest);
    }
    fs.unlinkSync(specFile);
  } catch (err: any) {
    console.log(`[SpecExecutor] Failed to move spec: ${err.message}`);
  }
}

let isProcessing = false;
let specInterval: ReturnType<typeof setInterval> | null = null;

let stats = {
  totalProcessed: 0,
  succeeded: 0,
  failed: 0,
  stuck: 0,
  skipped: 0,
  lastRun: null as string | null,
};

async function processQueue(): Promise<SpecResult[]> {
  if (isProcessing) return [];
  isProcessing = true;
  const results: SpecResult[] = [];

  try {
    const { shouldStopForBudget } = await import("./expense-tracker");
    if (shouldStopForBudget().stop) {
      console.log("[SpecExecutor] Budget exceeded (hard stop) — skipping spec processing");
      isProcessing = false;
      return results;
    }

    ensureDirs();
    const specFiles = fs.readdirSync(QUEUE_DIR)
      .filter(f => f.endsWith(".json"))
      .sort();

    if (specFiles.length === 0) {
      isProcessing = false;
      return results;
    }

    console.log(`[SpecExecutor] Processing ${specFiles.length} pending spec(s)...`);
    logToDaily(`Executing ${specFiles.length} approved specs...`);

    for (const specFile of specFiles) {
      const { shouldStopForBudget: budgetCheck } = await import("./expense-tracker");
      if (budgetCheck().stop) {
        console.log("[SpecExecutor] Budget exceeded mid-batch — stopping");
        logToDaily("SpecExecutor: Budget exceeded — halting spec processing");
        break;
      }

      const specPath = path.join(QUEUE_DIR, specFile);
      if (!fs.existsSync(specPath)) continue;

      let spec: any;
      try {
        spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
      } catch {
        console.log(`[SpecExecutor] Invalid JSON in ${specFile} — skipping`);
        continue;
      }

      const specConstraint = spec.constraint || spec.elonConstraint || "";
      if (specConstraint && isConstraintBlocked(specConstraint)) {
        console.log(`[SpecExecutor] Skipping spec ${specFile}: constraint "${specConstraint.slice(0, 80)}" is blocked`);
        logToDaily(`Skipped spec ${specFile}: constraint already blocked`);
        const rejectedDir = path.join(DATA_DIR, "rejected");
        if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
        moveSpec(specPath, rejectedDir, { _rejectedReason: `Constraint blocked: ${specConstraint.slice(0, 100)}` });
        stats.skipped++;
        continue;
      }

      if (specConstraint) {
        const alreadyResolved = isConstraintResolved(specConstraint);
        if (alreadyResolved.resolved) {
          console.log(`[SpecExecutor] Constraint pre-check: ALREADY RESOLVED — ${alreadyResolved.evidence}`);
          logToDaily(`Skipped spec ${specFile}: constraint already resolved — ${alreadyResolved.evidence}`);
          const rejectedDir = path.join(DATA_DIR, "rejected");
          if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
          moveSpec(specPath, rejectedDir, { _rejectedReason: `Constraint resolved: ${alreadyResolved.evidence}` });
          stats.skipped++;
          continue;
        }

        try {
          const preCheck = await validateConstraint(spec);
          if (preCheck.resolved) {
            console.log(`[SpecExecutor] Constraint pre-check: RESOLVED (${preCheck.method}) — ${preCheck.evidence}`);
            logToDaily(`Skipped spec ${specFile}: constraint resolved by ground-truth — ${preCheck.evidence}`);
            const rejectedDir = path.join(DATA_DIR, "rejected");
            if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
            moveSpec(specPath, rejectedDir, { _rejectedReason: `Constraint already resolved: ${preCheck.evidence}` });
            stats.skipped++;
            continue;
          }
        } catch {}
      }

      const validation = validateSpec(spec);
      if (validation.action === "reject") {
        console.log(`[SpecExecutor] Rejected spec ${specFile}: ${validation.reason}`);
        const rejectedDir = path.join(DATA_DIR, "rejected");
        if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });
        moveSpec(specPath, rejectedDir, { _rejectedReason: validation.reason });
        stats.skipped++;
        continue;
      }
      if (validation.action === "redirect" && validation.correctedSpec) {
        console.log(`[SpecExecutor] Auto-corrected spec ${specFile}: ${validation.reason}`);
        spec = { ...spec, ...validation.correctedSpec };
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf-8");
      }

      logToDaily(`Executing: ${specFile}`);
      console.log(`[SpecExecutor] Executing: ${specFile}`);

      const result = await executeSpec(spec);
      results.push(result);
      stats.totalProcessed++;

      if (result.status === "done") {
        moveSpec(specPath, ARCHIVE_DIR, {
          _completedAt: new Date().toISOString(),
          _iterations: result.iterations,
          _cost: result.cost,
        });
        stats.succeeded++;
        logToDaily(`Spec finished with status done: ${specFile} (${result.iterations} iterations, $${result.cost.toFixed(3)})`);
      } else {
        moveSpec(specPath, BLOCKED_DIR, {
          _failureReason: result.error || `${result.status} after ${result.iterations} iterations`,
          _iterations: result.iterations,
          _cost: result.cost,
          _status: result.status,
          _failedAt: new Date().toISOString(),
        });

        const failedConstraint = spec.constraint || spec.elonConstraint || "";
        if (failedConstraint) {
          addBlockedConstraint(failedConstraint, result.specId);
        }

        if (result.status === "stuck") {
          stats.stuck++;
          if (result.error && /human|manual|live server|curl|verification must be performed|cannot execute shell|cannot.*HTTP/i.test(result.error)) {
            try {
              const { writeUserActionNeeded } = await import("./autonomy-loop");
              const promptText = result.error.match(/curl\s+[^\n)}{]*/)?.[0] || "";
              writeUserActionNeeded(
                "Spec needs manual verification",
                `A spec targeting "${spec.targetFile || 'unknown'}" requires running commands against a live server — Sneebly can't do this itself.`,
                promptText || undefined
              );
            } catch (actionErr) {
              logToDaily(`Ralph Loop: Failed to write user action: ${(actionErr as Error).message}`);
            }
          }
        }
        else stats.failed++;

        logToDaily(`Spec finished with status ${result.status}: ${specFile}`);

        onSpecBlocked({
          status: result.status,
          reason: result.error || `Spec failed after ${result.iterations} iterations`,
          iterations: result.iterations,
          specPath: path.join(BLOCKED_DIR, path.basename(specPath)),
          failureHistory: [],
        }, spec);
      }

      if (result.status === "blocked") break;

      try {
        const { shouldStopForBudget } = await import("./expense-tracker");
        const budgetCheck = shouldStopForBudget();
        if (budgetCheck.stop) {
          console.log(`[SpecExecutor] Budget limit hit — stopping spec processing: ${budgetCheck.message}`);
          logToDaily(`Ralph Loop: Budget limit reached — halting spec processing`);
          break;
        }
      } catch {}

      await new Promise(r => setTimeout(r, INTER_SPEC_DELAY_MS));
    }

    stats.lastRun = new Date().toISOString();
    console.log(`[SpecExecutor] Queue processed: ${results.length} spec(s), ${results.filter(r => r.status === "done").length} succeeded`);
  } catch (error: any) {
    console.error("[SpecExecutor] Queue processing error:", error.message);
  } finally {
    isProcessing = false;
  }

  return results;
}

export function startSpecExecutor(intervalMs = 60000): void {
  if (specInterval) return;

  console.log(`[SpecExecutor] Starting spec executor (interval: ${intervalMs}ms)`);

  setTimeout(() => {
    sanitizeApprovedQueue();

    import("./expense-tracker").then(({ shouldStopForBudget }) => {
      if (shouldStopForBudget().stop) {
        console.log("[SpecExecutor] Budget exceeded at startup — not processing specs");
        return;
      }
      processQueue();
    }).catch(() => processQueue());
  }, 15000);

  specInterval = setInterval(() => {
    sanitizeApprovedQueue();
    processQueue().catch(err => {
      console.error("[SpecExecutor] Interval error:", err.message);
    });
  }, intervalMs);
}

export function stopSpecExecutor(): void {
  if (specInterval) {
    clearInterval(specInterval);
    specInterval = null;
    console.log("[SpecExecutor] Stopped");
  }
}

export async function triggerSpecExecutor(): Promise<SpecResult[]> {
  return processQueue();
}

export function getSpecExecutorStats() {
  const pendingCount = fs.existsSync(QUEUE_DIR)
    ? fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith(".json")).length
    : 0;

  return {
    ...stats,
    isProcessing,
    pendingCount,
  };
}

export function getBlockedConstraintsList(): BlockedConstraint[] {
  return loadBlockedConstraints();
}

export function clearBlockedConstraint(description: string): boolean {
  const blocked = loadBlockedConstraints();
  const idx = blocked.findIndex(bc => constraintSimilarity(bc.description, description) >= CONSTRAINT_SIMILARITY_THRESHOLD);
  if (idx >= 0) {
    blocked.splice(idx, 1);
    saveBlockedConstraints(blocked);
    logToDaily(`Unblocked constraint: "${description.slice(0, 100)}"`);
    return true;
  }
  return false;
}

export { sanitizeApprovedQueue };

export function getPendingSpecs(): any[] {
  try {
    if (!fs.existsSync(QUEUE_DIR)) return [];
    return fs.readdirSync(QUEUE_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), "utf-8"));
          return { ...content, _fileName: f };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
