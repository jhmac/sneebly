import fs from "fs";
import path from "path";
import { collectMetrics, compareMetrics, saveMetrics, MetricsSnapshot } from "./experiment-metrics";
import { callClaude, extractJson, checkBudgetOrThrow } from "./utils";
import { getSafePaths, getNeverModifyPaths } from "./identity";
import { isPathSafe } from "./path-safety";
import { appendToSection } from "./memory-manager";
import { getCostSummary } from "./cost-tracker";

const CWD = process.cwd();
const EXPERIMENTS_LOG = path.join(CWD, ".sneebly", "experiments.jsonl");
const RESEARCH_MD = path.join(CWD, ".sneebly", "research.md");
const BACKUP_DIR = path.join(CWD, ".sneebly", "backups", "experiment");
const MAX_EXPERIMENT_COST = 1.00;

export interface Experiment {
  id: string;
  timestamp: string;
  hypothesis: string;
  strategy: string;
  filesTarget: string[];
  filesChanged: string[];
  metricsBefore: MetricsSnapshot;
  metricsAfter: MetricsSnapshot | null;
  comparison: { improved: boolean; delta: Record<string, number>; reason: string; simplicityPenalty: number } | null;
  status: "kept" | "discarded" | "crashed" | "skipped";
  cost: number;
  error?: string;
  backups: Record<string, string>;
}

export function loadResearchStrategy(): string {
  try {
    if (fs.existsSync(RESEARCH_MD)) {
      return fs.readFileSync(RESEARCH_MD, "utf-8");
    }
  } catch {}
  return "Reduce TypeScript errors. Improve code simplicity. Remove TODO/FIXME comments. Improve error handling.";
}

export function logExperiment(exp: Experiment): void {
  try {
    const dir = path.dirname(EXPERIMENTS_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(EXPERIMENTS_LOG, JSON.stringify(exp) + "\n", "utf-8");
  } catch {}
}

export function loadExperiments(limit = 50): Experiment[] {
  try {
    if (!fs.existsSync(EXPERIMENTS_LOG)) return [];
    const lines = fs.readFileSync(EXPERIMENTS_LOG, "utf-8").split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean) as Experiment[];
  } catch {
    return [];
  }
}

export function getExperimentSummary(): {
  total: number;
  kept: number;
  discarded: number;
  crashed: number;
  totalCost: number;
  avgScoreDelta: number;
  successRate: number;
  recentExperiments: Experiment[];
} {
  const experiments = loadExperiments(100);
  const kept = experiments.filter((e) => e.status === "kept").length;
  const discarded = experiments.filter((e) => e.status === "discarded").length;
  const crashed = experiments.filter((e) => e.status === "crashed").length;
  const totalCost = experiments.reduce((s, e) => s + e.cost, 0);
  const withMetrics = experiments.filter((e) => e.comparison);
  const avgScoreDelta =
    withMetrics.length > 0
      ? withMetrics.reduce((s, e) => s + (e.comparison?.delta.score || 0), 0) / withMetrics.length
      : 0;
  const successRate = experiments.length > 0 ? kept / experiments.length : 0;

  return {
    total: experiments.length,
    kept,
    discarded,
    crashed,
    totalCost,
    avgScoreDelta: Math.round(avgScoreDelta * 10) / 10,
    successRate: Math.round(successRate * 100),
    recentExperiments: experiments.slice(-10),
  };
}

function backupFiles(files: string[]): Record<string, string> {
  const backups: Record<string, string> = {};
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const file of files) {
    try {
      const resolved = path.resolve(CWD, file);
      if (!fs.existsSync(resolved)) continue;
      const safeName = file.replace(/[\/\\]/g, "__");
      const backupPath = path.join(BACKUP_DIR, `${safeName}.${Date.now()}.bak`);
      fs.copyFileSync(resolved, backupPath);
      backups[file] = backupPath;
    } catch {}
  }
  return backups;
}

function restoreBackups(backups: Record<string, string>): void {
  for (const [file, backupPath] of Object.entries(backups)) {
    try {
      const resolved = path.resolve(CWD, file);
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, resolved);
        console.log(`[Experiment] Restored: ${file}`);
      }
    } catch (e: any) {
      console.log(`[Experiment] Restore failed for ${file}: ${e.message}`);
    }
  }
}

function readFileSafe(filePath: string): string {
  try {
    const resolved = path.resolve(CWD, filePath);
    if (!fs.existsSync(resolved)) return `[File does not exist: ${filePath}]`;
    const content = fs.readFileSync(resolved, "utf-8");
    return content.length > 12000 ? content.slice(0, 12000) + "\n[TRUNCATED]" : content;
  } catch {
    return `[Cannot read: ${filePath}]`;
  }
}

async function proposeHypothesis(strategy: string, metrics: MetricsSnapshot, history: Experiment[]): Promise<{
  hypothesis: string;
  filesTarget: string[];
  change: string;
  strategy: string;
} | null> {
  const recentHistory = history
    .slice(-5)
    .map((e) => `- ${e.hypothesis} → ${e.status} (score delta: ${e.comparison?.delta.score ?? "N/A"})`)
    .join("\n");

  const prompt = `You are an autonomous code optimizer for a TypeScript/React web application (AnimAItion.tools — an AI-powered sprite animation studio).

## Optimization Strategy
${strategy}

## Current Metrics
- Quality score: ${metrics.score}/100
- TypeScript errors: ${metrics.tscErrorCount}
- Server LOC: ${metrics.serverLoc}, Client LOC: ${metrics.clientLoc}
- Bundle size estimate: ${metrics.bundleSizeEstimateKb}kb
- Code complexity indicator: ${metrics.complexityIndicator} (conditional branches in server/)
- TODO count: ${metrics.todoCount}, FIXME count: ${metrics.fixmeCount}
- Server healthy: ${metrics.serverHealthy}
- Avg API latency: ${metrics.avgApiLatencyMs}ms
- Recent API latencies: ${JSON.stringify(metrics.apiLatencies)}

## Recent Experiment History
${recentHistory || "No experiments yet"}

## Task
Propose ONE small, safe, measurable code improvement. Focus on:
1. Fixing TypeScript errors (if tscErrorCount > 0)
2. Removing unused imports or dead code
3. Resolving TODO/FIXME comments (only trivial ones)
4. Simplifying overly complex utility functions
5. Improving error handling coverage

Rules:
- Target server/ or client/src/ files only
- Keep changes small (1-2 files max, < 50 lines changed)
- Do NOT touch schema.ts, package.json, drizzle.config.ts, or auth files
- Do NOT refactor working business logic
- The change must be verifiably better (fewer TSC errors, fewer TODOs, simpler code, lower latency)
- Prefer changes that reduce complexity (fewer conditional branches, less LOC) — adding code to fix one
  thing that adds a lot of complexity elsewhere will be penalized and discarded automatically
- Skip if no clear improvement is possible (prefer "skip" over a dubious change)

Respond in JSON:
{
  "hypothesis": "One sentence: what we're trying to improve and why",
  "filesTarget": ["server/example.ts"],
  "change": "Detailed description of the specific code change to make",
  "strategy": "tsc-errors|dead-code|todo-fix|error-handling|simplification",
  "skip": false
}

If no improvement is clear right now, set "skip": true with a brief reason in "hypothesis".`;

  try {
    const result = await callClaude(prompt, {
      model: "claude-sonnet-4-5",
      maxTokens: 2048,
      temperature: 0.3,
      agent: "experiment-proposer",
      task: "propose-hypothesis",
      feature: "autoresearch",
    });
    const parsed = extractJson(result.text);
    if (!parsed) return null;
    if (parsed.skip) {
      console.log(`[Experiment] Skipping: ${parsed.hypothesis}`);
      return null;
    }
    return parsed;
  } catch (e: any) {
    console.log(`[Experiment] Proposal error: ${e.message}`);
    return null;
  }
}

async function applyChange(hypothesis: string, change: string, filesTarget: string[]): Promise<{
  filesChanged: string[];
  backups: Record<string, string>;
}> {
  const safePaths = getSafePaths();
  const neverModify = getNeverModifyPaths();

  const safeFiles = filesTarget.filter((f) => isPathSafe(f, safePaths, neverModify));
  if (safeFiles.length === 0) {
    throw new Error("No safe target files");
  }

  const fileContents = safeFiles.map((f) => `=== ${f} ===\n${readFileSafe(f)}`).join("\n\n");

  const prompt = `You are a code editor. Apply this specific change to the file(s) below.

## Hypothesis
${hypothesis}

## Change Required
${change}

## Current File Contents
${fileContents}

Rules:
- Apply ONLY the described change, nothing else
- Preserve all existing functionality
- Do not change imports that are still used
- Output the COMPLETE updated file(s) — do not truncate

Respond in JSON:
{
  "fileChanges": [
    { "filePath": "server/example.ts", "content": "complete file content here" }
  ]
}`;

  const result = await callClaude(prompt, {
    model: "claude-sonnet-4-5",
    maxTokens: 16000,
    temperature: 0.1,
    agent: "experiment-applier",
    task: "apply-change",
    feature: "autoresearch",
  });

  const parsed = extractJson(result.text);
  if (!parsed?.fileChanges || !Array.isArray(parsed.fileChanges)) {
    throw new Error("No fileChanges in response");
  }

  const backups = backupFiles(safeFiles);
  const filesChanged: string[] = [];

  for (const change of parsed.fileChanges) {
    if (!isPathSafe(change.filePath, safePaths, neverModify)) {
      console.log(`[Experiment] Blocked unsafe write to: ${change.filePath}`);
      continue;
    }
    const fullPath = path.resolve(CWD, change.filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, change.content, "utf-8");
    filesChanged.push(change.filePath);
    console.log(`[Experiment] Applied change to: ${change.filePath}`);
  }

  return { filesChanged, backups };
}

let experimentRunning = false;

function getCostSpentSince(baselineCost: number): number {
  try {
    return getCostSummary().totalAllTime - baselineCost;
  } catch {
    return 0;
  }
}

const EMPTY_METRICS: MetricsSnapshot = {
  timestamp: new Date().toISOString(),
  tscErrorCount: 0,
  tscErrors: [],
  serverHealthy: false,
  apiLatencies: {},
  avgApiLatencyMs: 0,
  serverLoc: 0,
  clientLoc: 0,
  serverFileCount: 0,
  clientFileCount: 0,
  todoCount: 0,
  fixmeCount: 0,
  bundleSizeEstimateKb: 0,
  complexityIndicator: 0,
  score: 0,
};

export async function runExperiment(): Promise<Experiment | null> {
  if (experimentRunning) {
    console.log("[Experiment] Already running, skipping");
    return null;
  }
  experimentRunning = true;

  const expId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const costAtStart = getCostSummary().totalAllTime;

  try {
    checkBudgetOrThrow();

    console.log("[Experiment] Collecting baseline metrics...");
    const metricsBefore = await collectMetrics();
    saveMetrics(metricsBefore);

    console.log(`[Experiment] Baseline score: ${metricsBefore.score}/100, TSC errors: ${metricsBefore.tscErrorCount}, complexity: ${metricsBefore.complexityIndicator}, bundle: ${metricsBefore.bundleSizeEstimateKb}kb`);

    const strategy = loadResearchStrategy();
    const history = loadExperiments(20);

    console.log("[Experiment] Proposing hypothesis...");
    const proposal = await proposeHypothesis(strategy, metricsBefore, history);

    const costAfterProposal = getCostSpentSince(costAtStart);
    if (costAfterProposal >= MAX_EXPERIMENT_COST) {
      console.log(`[Experiment] Cost cap hit after proposal ($${costAfterProposal.toFixed(3)} / $${MAX_EXPERIMENT_COST}) — aborting`);
      const exp: Experiment = {
        id: expId,
        timestamp: new Date().toISOString(),
        hypothesis: proposal?.hypothesis ?? "Cost cap exceeded before proposal",
        strategy: "skip",
        filesTarget: [],
        filesChanged: [],
        metricsBefore,
        metricsAfter: null,
        comparison: null,
        status: "skipped",
        cost: costAfterProposal,
        error: `Per-experiment cost cap ($${MAX_EXPERIMENT_COST}) exceeded at proposal stage`,
        backups: {},
      };
      logExperiment(exp);
      return exp;
    }

    if (!proposal) {
      const exp: Experiment = {
        id: expId,
        timestamp: new Date().toISOString(),
        hypothesis: "No improvement proposed",
        strategy: "skip",
        filesTarget: [],
        filesChanged: [],
        metricsBefore,
        metricsAfter: null,
        comparison: null,
        status: "skipped",
        cost: costAfterProposal,
        backups: {},
      };
      logExperiment(exp);
      return exp;
    }

    console.log(`[Experiment] Hypothesis: ${proposal.hypothesis}`);
    console.log(`[Experiment] Target files: ${proposal.filesTarget.join(", ")}`);

    let filesChanged: string[] = [];
    let backups: Record<string, string> = {};

    try {
      const applied = await applyChange(proposal.hypothesis, proposal.change, proposal.filesTarget);
      filesChanged = applied.filesChanged;
      backups = applied.backups;
    } catch (e: any) {
      const costSoFar = getCostSpentSince(costAtStart);
      const exp: Experiment = {
        id: expId,
        timestamp: new Date().toISOString(),
        hypothesis: proposal.hypothesis,
        strategy: proposal.strategy,
        filesTarget: proposal.filesTarget,
        filesChanged: [],
        metricsBefore,
        metricsAfter: null,
        comparison: null,
        status: "crashed",
        cost: costSoFar,
        error: e.message,
        backups: {},
      };
      logExperiment(exp);
      return exp;
    }

    const costAfterApply = getCostSpentSince(costAtStart);
    if (costAfterApply >= MAX_EXPERIMENT_COST && filesChanged.length > 0) {
      console.log(`[Experiment] Cost cap hit after apply ($${costAfterApply.toFixed(3)}) — rolling back and aborting`);
      restoreBackups(backups);
      const exp: Experiment = {
        id: expId,
        timestamp: new Date().toISOString(),
        hypothesis: proposal.hypothesis,
        strategy: proposal.strategy,
        filesTarget: proposal.filesTarget,
        filesChanged,
        metricsBefore,
        metricsAfter: null,
        comparison: null,
        status: "discarded",
        cost: costAfterApply,
        error: `Per-experiment cost cap ($${MAX_EXPERIMENT_COST}) exceeded — change rolled back`,
        backups,
      };
      logExperiment(exp);
      return exp;
    }

    if (filesChanged.length === 0) {
      const exp: Experiment = {
        id: expId,
        timestamp: new Date().toISOString(),
        hypothesis: proposal.hypothesis,
        strategy: proposal.strategy,
        filesTarget: proposal.filesTarget,
        filesChanged: [],
        metricsBefore,
        metricsAfter: null,
        comparison: null,
        status: "skipped",
        cost: costAfterApply,
        error: "No files were changed",
        backups: {},
      };
      logExperiment(exp);
      return exp;
    }

    await new Promise((r) => setTimeout(r, 3000));

    console.log("[Experiment] Collecting post-change metrics...");
    const metricsAfter = await collectMetrics();
    const comparison = compareMetrics(metricsBefore, metricsAfter);

    console.log(`[Experiment] After score: ${metricsAfter.score}/100 (${comparison.reason}), simplicity penalty: ${comparison.simplicityPenalty}`);

    let status: Experiment["status"];
    if (comparison.improved) {
      status = "kept";
      console.log("[Experiment] KEPT — metrics improved");
      appendToSection("Build Patterns", `- Experiment kept: ${proposal.hypothesis} (${comparison.reason})`);
    } else {
      status = "discarded";
      const reason = comparison.simplicityPenalty > 0
        ? `metrics did not improve (simplicity penalty: ${comparison.simplicityPenalty})`
        : "metrics did not improve";
      console.log(`[Experiment] DISCARDING — ${reason}, rolling back`);
      restoreBackups(backups);
      appendToSection("Mistakes", `- Experiment discarded: ${proposal.hypothesis} (${comparison.reason})`);
    }

    const finalCost = getCostSpentSince(costAtStart);

    const exp: Experiment = {
      id: expId,
      timestamp: new Date().toISOString(),
      hypothesis: proposal.hypothesis,
      strategy: proposal.strategy,
      filesTarget: proposal.filesTarget,
      filesChanged,
      metricsBefore,
      metricsAfter,
      comparison,
      status,
      cost: finalCost,
      backups,
    };

    logExperiment(exp);
    saveMetrics(metricsAfter);

    return exp;
  } catch (e: any) {
    const finalCost = getCostSpentSince(costAtStart);
    const exp: Experiment = {
      id: expId,
      timestamp: new Date().toISOString(),
      hypothesis: "Experiment crashed",
      strategy: "unknown",
      filesTarget: [],
      filesChanged: [],
      metricsBefore: { ...EMPTY_METRICS, timestamp: new Date().toISOString() },
      metricsAfter: null,
      comparison: null,
      status: "crashed",
      cost: finalCost,
      error: e.name === "BudgetExceeded" ? "Global budget exceeded" : e.message,
      backups: {},
    };
    logExperiment(exp);
    return exp;
  } finally {
    experimentRunning = false;
  }
}

export function isExperimentRunning(): boolean {
  return experimentRunning;
}
