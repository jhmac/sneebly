import fs from "fs";
import path from "path";
import { callClaude, extractJson } from "./utils";
import { spawnTeam, planTeamWork, runTeamToCompletion, dissolveTeam, getTeam, listTeams, AgentTeamState, TeamRole } from "./agent-team";
import { createSnapshot, rollbackToSnapshot } from "./rollback";
import * as comms from "./team-comms";
import { shouldStopForBudget, generateExpenseReport, getBudgetConfig } from "./expense-tracker";
import { logCost, getCostSummary } from "./cost-tracker";

const STATE_FILE = path.join(process.cwd(), ".sneebly", "orchestrator-state.json");

export interface WorkTrack {
  id: string;
  name: string;
  description: string;
  role: TeamRole;
  priority: number;
  files: string[];
  dependencies: string[];
  teamId?: string;
  status: "queued" | "active" | "completed" | "failed" | "blocked";
}

export interface OrchestratorState {
  status: "idle" | "analyzing" | "orchestrating" | "paused";
  tracks: WorkTrack[];
  activeTeamIds: string[];
  completedTeamIds: string[];
  failedTeamIds: string[];
  totalCost: number;
  cycleCount: number;
  lastCycleAt: string;
  lastAnalysis: string;
  maxParallelTeams: number;
  startedAt?: string;
  pausedReason?: string;
}

function loadState(): OrchestratorState {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {}
  return {
    status: "idle",
    tracks: [],
    activeTeamIds: [],
    completedTeamIds: [],
    failedTeamIds: [],
    totalCost: 0,
    cycleCount: 0,
    lastCycleAt: "",
    lastAnalysis: "",
    maxParallelTeams: 3,
  };
}

function saveState(state: OrchestratorState): void {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let orchestratorState = loadState();

function readProjectFile(filePath: string, maxChars: number = 5000): string {
  try {
    const full = path.join(process.cwd(), filePath);
    if (!fs.existsSync(full)) return "";
    return fs.readFileSync(full, "utf-8").slice(0, maxChars);
  } catch { return ""; }
}

export async function analyzeAndCreateTracks(): Promise<WorkTrack[]> {
  orchestratorState.status = "analyzing";
  saveState(orchestratorState);

  const goals = readProjectFile("GOALS.md", 8000);
  const progress = readProjectFile(".sneebly/progress.json", 3000);
  const schema = readProjectFile("shared/schema.ts", 5000);
  const needsAttention = readProjectFile("NEEDS-ATTENTION.md", 3000);
  const currentPlan = readProjectFile(".sneebly/current-plan.json", 3000);

  const existingFiles = listExistingFiles();
  const activeTeams = listTeams({ status: "executing" });
  const activeWork = activeTeams.map(t => `- ${t.name}: ${t.goal} (${t.status})`).join("\n");

  const prompt = `You are the CTO of an autonomous AI engineering team. Analyze the project state and create parallel work tracks.

PROJECT GOALS:
${goals || "No GOALS.md found"}

CURRENT PROGRESS:
${progress || "No progress data"}

NEEDS ATTENTION:
${needsAttention || "Nothing flagged"}

CURRENT PLAN STATUS:
${currentPlan || "No active plan"}

DATABASE SCHEMA (existing):
${schema.slice(0, 3000)}

EXISTING FILES:
${existingFiles.slice(0, 2000)}

CURRENTLY ACTIVE TEAMS:
${activeWork || "No active teams"}

Analyze what work remains and create parallel work tracks. Each track should:
1. Be independent enough to run in parallel (different files)
2. Have a clear, focused goal
3. Be ordered by priority (1 = highest)
4. Specify which files it will touch
5. List dependencies on other tracks

Return JSON:
{
  "analysis": "Brief analysis of what's remaining",
  "tracks": [
    {
      "id": "track-1",
      "name": "Short name",
      "description": "What this track will build",
      "role": "frontend" | "backend" | "schema" | "ai-pipeline" | "devops" | "self-improve" | "general",
      "priority": 1,
      "files": ["path/to/file1.ts", "path/to/file2.ts"],
      "dependencies": ["track-id-this-depends-on"]
    }
  ]
}

Rules:
- Max 5 tracks per analysis
- Don't duplicate work that active teams are already doing
- Frontend work depends on backend APIs being ready
- Schema changes should be highest priority
- Focus on what will have the most impact`;

  try {
    const result = await callClaude(prompt, {
      model: "claude-opus-4-6",
      agent: "orchestrator-cto",
      task: "analyze-tracks",
      feature: "orchestrator",
      maxTokens: 4096,
    });

    orchestratorState.totalCost += result.cost;
    const parsed = extractJson(result.text);

    if (parsed && parsed.tracks) {
      orchestratorState.tracks = parsed.tracks.map((t: any) => ({
        id: t.id || `track-${Date.now().toString(36)}`,
        name: t.name,
        description: t.description,
        role: t.role || "general",
        priority: t.priority || 5,
        files: t.files || [],
        dependencies: t.dependencies || [],
        status: "queued" as const,
      }));
      orchestratorState.lastAnalysis = parsed.analysis || "";
    }

    orchestratorState.status = "orchestrating";
    saveState(orchestratorState);

    console.log(`[orchestrator] Analysis complete: ${orchestratorState.tracks.length} tracks identified`);
    return orchestratorState.tracks;

  } catch (e: any) {
    orchestratorState.status = "paused";
    orchestratorState.pausedReason = e.message;
    saveState(orchestratorState);
    throw e;
  }
}

export async function spawnNextTeams(): Promise<AgentTeamState[]> {
  const activeCount = orchestratorState.activeTeamIds.length;
  const slotsAvailable = orchestratorState.maxParallelTeams - activeCount;
  if (slotsAvailable <= 0) return [];

  const readyTracks = orchestratorState.tracks
    .filter(t => t.status === "queued")
    .filter(t => {
      return t.dependencies.every(dep => {
        const depTrack = orchestratorState.tracks.find(d => d.id === dep);
        return depTrack && depTrack.status === "completed";
      });
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, slotsAvailable);

  const spawned: AgentTeamState[] = [];

  for (const track of readyTracks) {
    const budgetCheck = shouldStopForBudget();
    if (budgetCheck.stop) {
      orchestratorState.pausedReason = budgetCheck.message;
      break;
    }

    const team = spawnTeam({
      name: track.name,
      role: track.role,
      goal: track.description,
      priority: track.priority,
      files: track.files,
    });

    track.teamId = team.id;
    track.status = "active";
    orchestratorState.activeTeamIds.push(team.id);
    spawned.push(team);
  }

  saveState(orchestratorState);
  return spawned;
}

export async function runOrchestrationCycle(): Promise<{
  teamsSpawned: number;
  teamsCompleted: number;
  teamsFailed: number;
  totalCost: number;
  message: string;
}> {
  const budgetCheck = shouldStopForBudget();
  if (budgetCheck.stop) {
    return { teamsSpawned: 0, teamsCompleted: 0, teamsFailed: 0, totalCost: 0, message: budgetCheck.message };
  }

  orchestratorState.cycleCount++;
  orchestratorState.lastCycleAt = new Date().toISOString();

  if (orchestratorState.tracks.length === 0 || orchestratorState.tracks.every(t => t.status === "completed" || t.status === "failed")) {
    await analyzeAndCreateTracks();
  }

  const spawned = await spawnNextTeams();

  let completed = 0;
  let failed = 0;
  let cycleCost = 0;

  for (const teamId of [...orchestratorState.activeTeamIds]) {
    const team = getTeam(teamId);
    if (!team) continue;

    if (team.status === "completed" || team.status === "dissolved") {
      orchestratorState.activeTeamIds = orchestratorState.activeTeamIds.filter(id => id !== teamId);
      orchestratorState.completedTeamIds.push(teamId);
      const track = orchestratorState.tracks.find(t => t.teamId === teamId);
      if (track) track.status = "completed";
      completed++;
      continue;
    }

    if (team.status === "failed") {
      orchestratorState.activeTeamIds = orchestratorState.activeTeamIds.filter(id => id !== teamId);
      orchestratorState.failedTeamIds.push(teamId);
      const track = orchestratorState.tracks.find(t => t.teamId === teamId);
      if (track) track.status = "failed";
      failed++;
      continue;
    }

    try {
      const result = await runTeamToCompletion(teamId);
      cycleCost += result.totalCost;

      if (result.status === "completed") {
        orchestratorState.activeTeamIds = orchestratorState.activeTeamIds.filter(id => id !== teamId);
        orchestratorState.completedTeamIds.push(teamId);
        const track = orchestratorState.tracks.find(t => t.teamId === teamId);
        if (track) track.status = "completed";
        completed++;
      } else if (result.status === "failed") {
        orchestratorState.activeTeamIds = orchestratorState.activeTeamIds.filter(id => id !== teamId);
        orchestratorState.failedTeamIds.push(teamId);
        const track = orchestratorState.tracks.find(t => t.teamId === teamId);
        if (track) track.status = "failed";
        failed++;
      }
    } catch (e: any) {
      console.error(`[orchestrator] Team ${teamId} error:`, e.message);
      failed++;
    }
  }

  orchestratorState.totalCost += cycleCost;
  saveState(orchestratorState);

  const allDone = orchestratorState.tracks.every(t => t.status === "completed" || t.status === "failed");
  const message = allDone
    ? `All tracks complete. ${orchestratorState.completedTeamIds.length} succeeded, ${orchestratorState.failedTeamIds.length} failed.`
    : `Cycle ${orchestratorState.cycleCount}: ${spawned.length} spawned, ${completed} completed, ${failed} failed. ${orchestratorState.activeTeamIds.length} active.`;

  return { teamsSpawned: spawned.length, teamsCompleted: completed, teamsFailed: failed, totalCost: cycleCost, message };
}

export async function startOrchestration(): Promise<string> {
  if (orchestratorState.status === "orchestrating") {
    return "Orchestrator is already running";
  }

  createSnapshot("Pre-orchestration", { autoCreated: true });

  orchestratorState.status = "orchestrating";
  orchestratorState.startedAt = new Date().toISOString();
  orchestratorState.pausedReason = undefined;
  saveState(orchestratorState);

  console.log("[orchestrator] Starting orchestration...");

  try {
    const result = await runOrchestrationCycle();
    return result.message;
  } catch (e: any) {
    orchestratorState.status = "paused";
    orchestratorState.pausedReason = e.message;
    saveState(orchestratorState);
    return `Orchestration failed: ${e.message}`;
  }
}

export function pauseOrchestration(reason: string = "User paused"): string {
  orchestratorState.status = "paused";
  orchestratorState.pausedReason = reason;
  saveState(orchestratorState);
  return "Orchestration paused";
}

export function resumeOrchestration(): string {
  if (orchestratorState.status !== "paused") return "Not paused";
  orchestratorState.status = "orchestrating";
  orchestratorState.pausedReason = undefined;
  saveState(orchestratorState);
  return "Orchestration resumed";
}

export function getOrchestratorState(): OrchestratorState {
  return { ...orchestratorState };
}

export function getOrchestratorSummary(): string {
  const state = orchestratorState;
  const lines: string[] = [];

  lines.push(`**🧠 Orchestrator Status: ${state.status}**`);
  if (state.pausedReason) lines.push(`Paused: ${state.pausedReason}`);

  lines.push(`Cycle: ${state.cycleCount} | Total cost: $${state.totalCost.toFixed(4)}`);
  lines.push(`Teams: ${state.activeTeamIds.length} active, ${state.completedTeamIds.length} completed, ${state.failedTeamIds.length} failed`);

  if (state.lastAnalysis) {
    lines.push(`\nLast analysis: ${state.lastAnalysis.slice(0, 200)}`);
  }

  if (state.tracks.length > 0) {
    lines.push(`\n**Work Tracks:**`);
    for (const t of state.tracks) {
      const icon = t.status === "completed" ? "✅" : t.status === "active" ? "🔨" : t.status === "failed" ? "❌" : "⏳";
      lines.push(`${icon} ${t.name} (${t.role}, P${t.priority}) — ${t.status}`);
    }
  }

  return lines.join("\n");
}

export async function swarmProblem(problem: string, context: Record<string, any>): Promise<{ solutions: string[]; bestSolution: string; cost: number }> {
  createSnapshot(`Pre-swarm: ${problem.slice(0, 50)}`, { autoCreated: true });

  const approaches = [
    "Take a direct, straightforward approach. Fix the immediate issue.",
    "Take a creative approach. Rethink the problem from scratch.",
    "Take a minimal approach. What's the smallest change that solves this?",
  ];

  const solutions: string[] = [];
  let totalCost = 0;

  for (const approach of approaches) {
    try {
      const result = await callClaude(
        `Problem: ${problem}\n\nContext: ${JSON.stringify(context)}\n\nApproach: ${approach}\n\nProvide a concrete solution with exact code changes.`,
        {
          model: "claude-sonnet-4-5",
          agent: "swarm-worker",
          task: "swarm-solve",
          feature: "swarm",
          maxTokens: 4096,
        }
      );
      solutions.push(result.text);
      totalCost += result.cost;
    } catch {}
  }

  let bestSolution = solutions[0] || "No solutions found";
  if (solutions.length > 1) {
    try {
      const judgeResult = await callClaude(
        `You are judging ${solutions.length} solutions to this problem: ${problem}\n\n${solutions.map((s, i) => `SOLUTION ${i + 1}:\n${s}`).join("\n\n---\n\n")}\n\nWhich solution is best and why? Return the full text of the winning solution.`,
        {
          model: "claude-opus-4-6",
          agent: "swarm-judge",
          task: "swarm-judge",
          feature: "swarm",
          maxTokens: 4096,
        }
      );
      bestSolution = judgeResult.text;
      totalCost += judgeResult.cost;
    } catch {}
  }

  return { solutions, bestSolution, cost: totalCost };
}

function listExistingFiles(): string {
  const files: string[] = [];
  const dirs = ["client/src", "server", "shared"];

  for (const dir of dirs) {
    try {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      walkDir(fullDir, files, process.cwd());
    } catch {}
  }

  return files.join("\n");
}

function walkDir(dir: string, result: string[], root: string, depth: number = 0): void {
  if (depth > 4) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        walkDir(full, result, root, depth + 1);
      } else if (/\.(ts|tsx|js|json|css)$/.test(entry.name)) {
        result.push(rel);
      }
    }
  } catch {}
}
