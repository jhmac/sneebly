import fs from "fs";
import path from "path";
import { getSafePaths } from "./identity";
import { getCompletionPercent } from "./progress-tracker";
import { extractJson, callClaude } from "./utils";

const PLAN_FILE = path.join(process.cwd(), ".sneebly", "current-plan.json");
const GOALS_FILE = path.join(process.cwd(), "GOALS.md");

export interface PlanStep {
  id: string;
  action: "create" | "modify" | "append";
  filePath: string;
  description: string;
  dependsOn: string[];
  status: "pending" | "in_progress" | "done" | "failed";
}

export interface Plan {
  id: string;
  goal: string;
  phase: string;
  steps: PlanStep[];
  createdAt: string;
  status: "active" | "completed" | "failed" | "cancelled";
}

function readGoals(): string {
  try {
    return fs.readFileSync(GOALS_FILE, "utf-8");
  } catch {
    return "";
  }
}

function readFile(filePath: string, maxLines = 150): string {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) return `[Does not exist]`;
    const lines = fs.readFileSync(resolved, "utf-8").split("\n");
    return lines.slice(0, maxLines).join("\n") + (lines.length > maxLines ? "\n...[truncated]" : "");
  } catch {
    return `[Cannot read]`;
  }
}

export function loadCurrentPlan(): Plan | null {
  try {
    if (fs.existsSync(PLAN_FILE)) {
      return JSON.parse(fs.readFileSync(PLAN_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

export function savePlan(plan: Plan): void {
  const dir = path.dirname(PLAN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2), "utf-8");
}

export async function generatePlan(failureContext?: string): Promise<Plan> {
  const goals = readGoals();
  const schema = readFile("shared/schema.ts", 200);

  const goalsExcerpt = goals.length > 6000 ? goals.slice(0, 6000) + "\n...[truncated]" : goals;

  const safeTargets = getSafePaths().join(", ");

  let memoryContext = "";
  try {
    const { getMemoryForPrompt } = require("./memory-manager");
    const memory = getMemoryForPrompt(["Conventions", "Fix Patterns", "Mistakes"]);
    if (memory) memoryContext = `\n## Learned Conventions & Patterns\n${memory}\n`;
  } catch {}

  let blockerContext = "";
  try {
    const { getActiveBlockerCount } = require("./spec-monitor");
    const count = getActiveBlockerCount();
    if (count > 0) blockerContext = `\n## Active Blockers: ${count}\n`;
  } catch {}

  let completionContext = "";
  try {
    const pct = getCompletionPercent();
    if (pct > 0) completionContext = `\n## Current Completion: ${pct}%\n`;
  } catch {}

  const failureSection = failureContext
    ? `\n## Recent Failures (DO NOT repeat these mistakes)\n${failureContext}\n`
    : "";

  let journalContext = "";
  try {
    const { getRecentJournalEntries } = require("./autonomy-loop");
    const entries = getRecentJournalEntries(3);
    if (entries.length > 0) {
      journalContext = `\n## Recent Cycle History\n${entries.map((e: any) => `- Cycle ${e.cycle}: ${e.result}${e.stepDescription ? ` (${e.stepDescription})` : ""}${e.error ? ` — ${e.error}` : ""}`).join("\n")}\n`;
    }
  } catch {}

  const prompt = `Analyze what's been built and plan what to build next.

## GOALS.md
${goalsExcerpt}

## Current Schema (shared/schema.ts, first 200 lines)
${schema}
${memoryContext}${blockerContext}${completionContext}${journalContext}${failureSection}
Pick the single highest-priority missing feature. Break it into concrete steps (max 6).
Only target files in safe paths: ${safeTargets}

Respond in JSON:
{
  "goal": "What we're building",
  "phase": "Which phase",
  "steps": [
    { "id": "step-1", "action": "create|modify|append", "filePath": "path", "description": "What to do", "dependsOn": [] }
  ]
}`;

  const result = await callClaude(prompt, {
    model: "claude-opus-4-6",
    maxTokens: 8192,
    temperature: 0.3,
    effort: "high",
    agent: "planner-opus",
    task: "plan-generation",
    feature: "autonomy-plan",
  });

  const planData = extractJson(result.text);
  if (!planData) throw new Error("Planner did not return valid JSON");

  const plan: Plan = {
    id: `plan-${Date.now()}`,
    goal: planData.goal || "Unknown goal",
    phase: planData.phase || "Unknown phase",
    steps: (planData.steps || []).map((s: any) => ({ ...s, status: "pending" as const })),
    createdAt: new Date().toISOString(),
    status: "active",
  };

  savePlan(plan);
  console.log(`[Planner/Opus] Created plan: ${plan.goal} (${plan.steps.length} steps)`);
  return plan;
}

export function getNextStep(): PlanStep | null {
  const plan = loadCurrentPlan();
  if (!plan || plan.status !== "active") return null;
  return plan.steps.find(s => s.status === "pending") || null;
}

export function markStepDone(stepId: string): void {
  const plan = loadCurrentPlan();
  if (!plan) return;
  const step = plan.steps.find(s => s.id === stepId);
  if (step) step.status = "done";
  if (plan.steps.every(s => s.status === "done")) {
    plan.status = "completed";
    console.log(`[Planner] Plan completed: ${plan.goal}`);
  }
  savePlan(plan);
}

export function markStepFailed(stepId: string): void {
  const plan = loadCurrentPlan();
  if (!plan) return;
  const step = plan.steps.find(s => s.id === stepId);
  if (step) step.status = "failed";
  plan.status = "failed";
  savePlan(plan);
  console.log(`[Planner] Plan failed at step ${stepId}`);
}

export function markStepInProgress(stepId: string): void {
  const plan = loadCurrentPlan();
  if (!plan) return;
  const step = plan.steps.find(s => s.id === stepId);
  if (step) step.status = "in_progress";
  savePlan(plan);
}

export function cancelPlan(): void {
  const plan = loadCurrentPlan();
  if (!plan) return;
  plan.status = "cancelled";
  savePlan(plan);
}
