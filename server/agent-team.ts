import fs from "fs";
import path from "path";
import { callClaude, extractJson, ClaudeCallOptions } from "./utils";
import { createSnapshot } from "./rollback";
import * as comms from "./team-comms";
import { shouldStopForBudget } from "./expense-tracker";
import { logCost } from "./cost-tracker";

const TEAMS_DIR = path.join(process.cwd(), ".sneebly", "teams");

export type TeamRole = "frontend" | "backend" | "schema" | "ai-pipeline" | "devops" | "self-improve" | "general";
export type TeamStatus = "spawning" | "planning" | "executing" | "reviewing" | "completed" | "failed" | "dissolved";
export type WorkerStatus = "idle" | "working" | "blocked" | "done" | "failed";

export interface TeamStep {
  id: string;
  description: string;
  filePath: string;
  action: "create" | "modify" | "delete" | "shell";
  status: "pending" | "in-progress" | "done" | "failed" | "skipped";
  dependsOn: string[];
  result?: string;
  error?: string;
  cost: number;
  attempts: number;
}

export interface TeamJournalEntry {
  timestamp: string;
  event: string;
  details?: string;
  cost?: number;
  filesModified?: string[];
}

export interface AgentTeamState {
  id: string;
  name: string;
  role: TeamRole;
  goal: string;
  status: TeamStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  snapshotId?: string;
  ownedFiles: string[];
  steps: TeamStep[];
  currentStepIndex: number;
  journal: TeamJournalEntry[];
  totalCost: number;
  filesModified: string[];
  successCount: number;
  failCount: number;
  maxRetries: number;
  parentTeamId?: string;
  dependencies: string[];
  context: Record<string, any>;
}

function ensureDir(): void {
  if (!fs.existsSync(TEAMS_DIR)) fs.mkdirSync(TEAMS_DIR, { recursive: true });
}

function teamPath(teamId: string): string {
  return path.join(TEAMS_DIR, `${teamId}.json`);
}

function saveTeam(team: AgentTeamState): void {
  ensureDir();
  team.updatedAt = new Date().toISOString();
  fs.writeFileSync(teamPath(team.id), JSON.stringify(team, null, 2));
}

function loadTeam(teamId: string): AgentTeamState | null {
  try {
    const p = teamPath(teamId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return null;
}

const activeTeams = new Map<string, AgentTeamState>();

export function spawnTeam(opts: {
  name: string;
  role: TeamRole;
  goal: string;
  priority?: number;
  files?: string[];
  dependencies?: string[];
  parentTeamId?: string;
  context?: Record<string, any>;
}): AgentTeamState {
  const id = `team-${opts.role}-${Date.now().toString(36)}`;
  const snapshot = createSnapshot(`Pre-team: ${opts.name}`, { teamId: id, autoCreated: true });

  const team: AgentTeamState = {
    id,
    name: opts.name,
    role: opts.role,
    goal: opts.goal,
    status: "spawning",
    priority: opts.priority || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    snapshotId: snapshot.id,
    ownedFiles: [],
    steps: [],
    currentStepIndex: 0,
    journal: [],
    totalCost: 0,
    filesModified: [],
    successCount: 0,
    failCount: 0,
    maxRetries: 3,
    parentTeamId: opts.parentTeamId,
    dependencies: opts.dependencies || [],
    context: opts.context || {},
  };

  for (const file of (opts.files || [])) {
    const claim = comms.claimFile(file, id, `Owned by team: ${opts.name}`);
    if (claim.success) team.ownedFiles.push(file);
  }

  team.journal.push({ timestamp: new Date().toISOString(), event: "Team spawned", details: opts.goal });

  activeTeams.set(id, team);
  saveTeam(team);

  comms.send("status-update", id, "orchestrator", {
    status: "spawning",
    name: opts.name,
    goal: opts.goal,
  });

  console.log(`[team] Spawned "${opts.name}" (${id}) role=${opts.role}`);
  return team;
}

export async function planTeamWork(teamId: string): Promise<TeamStep[]> {
  const team = getTeam(teamId);
  if (!team) throw new Error(`Team not found: ${teamId}`);

  team.status = "planning";
  team.journal.push({ timestamp: new Date().toISOString(), event: "Planning started" });
  saveTeam(team);

  const roleContext = getRoleContext(team.role);

  const filesContext = team.ownedFiles.map(f => {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), f), "utf-8");
      return `=== ${f} ===\n${content.slice(0, 3000)}`;
    } catch { return ""; }
  }).filter(Boolean).join("\n\n");

  const prompt = `You are a team lead planning work for the "${team.name}" team.

ROLE: ${team.role}
GOAL: ${team.goal}
${roleContext}

CURRENT FILES OWNED BY THIS TEAM:
${filesContext || "No files assigned yet — you may need to create new files or request ownership."}

ADDITIONAL CONTEXT:
${JSON.stringify(team.context, null, 2)}

Break this goal into concrete implementation steps. Each step should modify or create ONE file.
Return a JSON array of steps:
[
  {
    "id": "step-1",
    "description": "What this step does",
    "filePath": "path/to/file.ts",
    "action": "create" | "modify" | "delete" | "shell",
    "dependsOn": []
  }
]

Rules:
- Keep steps small and focused (one file per step)
- Order steps by dependency (schema before routes, routes before UI)
- Max 8 steps per plan
- Use real file paths from the project`;

  try {
    const result = await callClaude(prompt, {
      model: "claude-opus-4-6",
      agent: `team-${team.id}`,
      task: "team-planning",
      feature: `team-${team.role}`,
      maxTokens: 4096,
    });

    team.totalCost += result.cost;
    const parsed = extractJson(result.text);

    if (Array.isArray(parsed)) {
      team.steps = parsed.map((s: any) => ({
        id: s.id || `step-${Math.random().toString(36).substring(2, 6)}`,
        description: s.description || "No description",
        filePath: s.filePath || "",
        action: s.action || "modify",
        status: "pending" as const,
        dependsOn: s.dependsOn || [],
        cost: 0,
        attempts: 0,
      }));
    } else if (parsed && parsed.steps) {
      team.steps = parsed.steps.map((s: any) => ({
        id: s.id || `step-${Math.random().toString(36).substring(2, 6)}`,
        description: s.description || "No description",
        filePath: s.filePath || "",
        action: s.action || "modify",
        status: "pending" as const,
        dependsOn: s.dependsOn || [],
        cost: 0,
        attempts: 0,
      }));
    }

    for (const step of team.steps) {
      if (step.filePath && !team.ownedFiles.includes(step.filePath)) {
        const claim = comms.claimFile(step.filePath, team.id, `Step: ${step.description}`);
        if (claim.success) team.ownedFiles.push(step.filePath);
      }
    }

    team.journal.push({
      timestamp: new Date().toISOString(),
      event: "Planning complete",
      details: `${team.steps.length} steps planned`,
      cost: result.cost,
    });

    team.status = "executing";
    saveTeam(team);

    return team.steps;
  } catch (e: any) {
    team.status = "failed";
    team.journal.push({ timestamp: new Date().toISOString(), event: "Planning failed", details: e.message });
    saveTeam(team);
    throw e;
  }
}

export async function executeNextStep(teamId: string): Promise<{ done: boolean; step?: TeamStep; error?: string }> {
  const team = getTeam(teamId);
  if (!team) return { done: true, error: "Team not found" };

  const budgetCheck = shouldStopForBudget();
  if (budgetCheck.stop) {
    team.status = "failed";
    team.journal.push({ timestamp: new Date().toISOString(), event: "Budget exceeded", details: budgetCheck.message });
    saveTeam(team);
    return { done: true, error: budgetCheck.message };
  }

  const nextStep = team.steps.find(s => {
    if (s.status !== "pending") return false;
    return s.dependsOn.every(dep => {
      const depStep = team.steps.find(d => d.id === dep);
      return depStep && (depStep.status === "done" || depStep.status === "skipped");
    });
  });

  if (!nextStep) {
    const allDone = team.steps.every(s => s.status === "done" || s.status === "skipped" || s.status === "failed");
    if (allDone) {
      team.status = "completed";
      team.journal.push({ timestamp: new Date().toISOString(), event: "All steps complete" });
      comms.reportCompletion(team.id, `Team "${team.name}" completed: ${team.successCount}/${team.steps.length} steps succeeded`, team.filesModified);
      saveTeam(team);
    }
    return { done: true };
  }

  nextStep.status = "in-progress";
  nextStep.attempts++;
  saveTeam(team);

  try {
    let existingContent = "";
    if (nextStep.action !== "create") {
      try {
        existingContent = fs.readFileSync(path.join(process.cwd(), nextStep.filePath), "utf-8");
      } catch {}
    }

    const relatedFiles = team.ownedFiles
      .filter(f => f !== nextStep.filePath)
      .map(f => {
        try { return `=== ${f} ===\n${fs.readFileSync(path.join(process.cwd(), f), "utf-8").slice(0, 2000)}`; }
        catch { return ""; }
      }).filter(Boolean).join("\n\n");

    const prompt = `You are implementing step "${nextStep.id}" for team "${team.name}".

GOAL: ${team.goal}
STEP: ${nextStep.description}
FILE: ${nextStep.filePath}
ACTION: ${nextStep.action}

${existingContent ? `CURRENT FILE CONTENT:\n\`\`\`\n${existingContent.slice(0, 6000)}\n\`\`\`` : "This is a new file."}

${relatedFiles ? `RELATED FILES (for context):\n${relatedFiles}` : ""}

${nextStep.attempts > 1 ? `PREVIOUS ATTEMPT FAILED: ${nextStep.error}\nTake a different approach this time.` : ""}

Return the complete file content. If this is a "modify" action, return the ENTIRE updated file, not just the changes.
If this is a "shell" action, return only the shell command to run.
Do not wrap in markdown code blocks.`;

    const result = await callClaude(prompt, {
      model: nextStep.attempts > 1 ? "claude-opus-4-6" : "claude-sonnet-4-5",
      agent: `team-${team.id}`,
      task: `step-${nextStep.id}`,
      feature: `team-${team.role}`,
      maxTokens: 8192,
    });

    nextStep.cost += result.cost;
    team.totalCost += result.cost;

    if (nextStep.action === "shell") {
      const cmd = result.text.trim().split("\n")[0];
      try {
        const { execSync } = require("child_process");
        execSync(cmd, { cwd: process.cwd(), timeout: 30000 });
        nextStep.result = `Shell: ${cmd}`;
      } catch (e: any) {
        nextStep.result = `Shell failed: ${e.message}`;
      }
    } else if (nextStep.action === "delete") {
      try {
        fs.unlinkSync(path.join(process.cwd(), nextStep.filePath));
        nextStep.result = "File deleted";
      } catch {}
    } else {
      let content = result.text;
      const codeBlockMatch = content.match(/```(?:typescript|ts|tsx|javascript|js|json)?\n([\s\S]*?)```/);
      if (codeBlockMatch) content = codeBlockMatch[1];

      const dir = path.dirname(path.join(process.cwd(), nextStep.filePath));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(process.cwd(), nextStep.filePath), content);
      nextStep.result = `File ${nextStep.action === "create" ? "created" : "updated"}`;
    }

    nextStep.status = "done";
    team.successCount++;
    if (!team.filesModified.includes(nextStep.filePath)) {
      team.filesModified.push(nextStep.filePath);
    }

    team.journal.push({
      timestamp: new Date().toISOString(),
      event: `Step ${nextStep.id} completed`,
      details: nextStep.description,
      cost: nextStep.cost,
      filesModified: [nextStep.filePath],
    });

    saveTeam(team);
    return { done: false, step: nextStep };

  } catch (e: any) {
    nextStep.error = e.message;
    if (nextStep.attempts >= team.maxRetries) {
      nextStep.status = "failed";
      team.failCount++;
      team.journal.push({
        timestamp: new Date().toISOString(),
        event: `Step ${nextStep.id} failed (${nextStep.attempts} attempts)`,
        details: e.message,
      });

      comms.escalate(team.id, `Step "${nextStep.description}" failed after ${nextStep.attempts} attempts: ${e.message}`, {
        stepId: nextStep.id,
        filePath: nextStep.filePath,
      });
    } else {
      nextStep.status = "pending";
      team.journal.push({
        timestamp: new Date().toISOString(),
        event: `Step ${nextStep.id} attempt ${nextStep.attempts} failed, will retry`,
        details: e.message,
      });
    }

    saveTeam(team);
    return { done: false, step: nextStep, error: e.message };
  }
}

export async function runTeamToCompletion(teamId: string): Promise<AgentTeamState> {
  const team = getTeam(teamId);
  if (!team) throw new Error(`Team not found: ${teamId}`);

  if (team.steps.length === 0) {
    await planTeamWork(teamId);
  }

  let maxIterations = 30;
  while (maxIterations-- > 0) {
    const result = await executeNextStep(teamId);
    if (result.done) break;

    const budgetCheck = shouldStopForBudget();
    if (budgetCheck.notify) {
      comms.send("status-update", teamId, "orchestrator", { budgetWarning: budgetCheck.message });
    }
  }

  const final = getTeam(teamId)!;
  comms.releaseAllFiles(teamId);
  return final;
}

export function dissolveTeam(teamId: string): boolean {
  const team = getTeam(teamId);
  if (!team) return false;

  team.status = "dissolved";
  team.journal.push({ timestamp: new Date().toISOString(), event: "Team dissolved" });
  comms.releaseAllFiles(teamId);
  saveTeam(team);
  activeTeams.delete(teamId);
  return true;
}

export function getTeam(teamId: string): AgentTeamState | null {
  return activeTeams.get(teamId) || loadTeam(teamId);
}

export function listTeams(opts?: { status?: TeamStatus; role?: TeamRole }): AgentTeamState[] {
  ensureDir();
  try {
    const files = fs.readdirSync(TEAMS_DIR).filter(f => f.startsWith("team-") && f.endsWith(".json"));
    let teams = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(TEAMS_DIR, f), "utf-8")) as AgentTeamState; }
      catch { return null; }
    }).filter(Boolean) as AgentTeamState[];

    if (opts?.status) teams = teams.filter(t => t.status === opts.status);
    if (opts?.role) teams = teams.filter(t => t.role === opts.role);

    return teams.sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}

export function getTeamSummary(teamId: string): string {
  const team = getTeam(teamId);
  if (!team) return "Team not found";

  const stepsComplete = team.steps.filter(s => s.status === "done").length;
  const stepsFailed = team.steps.filter(s => s.status === "failed").length;

  return `**${team.name}** (${team.role})\n` +
    `Status: ${team.status} | Steps: ${stepsComplete}/${team.steps.length} done, ${stepsFailed} failed\n` +
    `Cost: $${team.totalCost.toFixed(4)} | Files: ${team.filesModified.join(", ") || "none yet"}`;
}

function getRoleContext(role: TeamRole): string {
  const contexts: Record<TeamRole, string> = {
    frontend: `You specialize in React 18, TypeScript, Tailwind CSS, shadcn/ui, Wouter routing, and TanStack Query. Follow the project's dark-mode-first design with Framer Motion animations.`,
    backend: `You specialize in Express 5, TypeScript, and RESTful API design. All routes require Clerk auth. Use the IStorage interface pattern from server/storage.ts.`,
    schema: `You specialize in Drizzle ORM schema design, migrations, and Zod validation. All schemas live in shared/schema.ts. Use createInsertSchema from drizzle-zod.`,
    "ai-pipeline": `You specialize in AI agent orchestration, Claude API integration, and prompt engineering. Use the callClaude helper from server/utils.ts.`,
    devops: `You specialize in build configuration, deployment, testing, and infrastructure. Be careful with package.json and config files.`,
    "self-improve": `You specialize in improving the Sneebly agent system itself. You can modify agent code in server/ but NEVER touch package.json, node_modules, or .replit. Always create a rollback snapshot before changes.`,
    general: `You are a full-stack developer who can work on any part of the codebase.`,
  };
  return contexts[role] || contexts.general;
}
