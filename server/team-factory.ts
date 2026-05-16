import { storage } from "./storage";
import { callClaude, extractJson, checkBudgetOrThrow } from "./utils";
import { generateFeaturePlan, type Plan } from "./planner-agent";
import { executeStep } from "./builder-agent";
import { quickHealthCheck } from "./verify-agent";
import { shouldStopForBudget } from "./expense-tracker";
import type { AgentTeam, AgentTeamMember } from "@shared/schema";

export interface AgentRole {
  name: string;
  description: string;
}

const activeTeamLocks = new Set<string>();

/**
 * Use Claude to generate an appropriate roster of agent roles for a build goal.
 */
async function generateRoster(goal: string): Promise<AgentRole[]> {
  const prompt = `You are a senior engineering team lead. A user wants to build the following feature:

"${goal}"

Generate a focused team of Claude-powered AI agents (3-5 roles) to tackle this build goal.
Each agent should have a clear, focused responsibility. Common roles include:
- Planner: Breaks down the work and coordinates the team
- API Builder: Implements backend routes and data models
- Frontend Builder: Implements UI components and pages
- QA Agent: Tests and validates the work
- Integration Agent: Wires together different parts of the system

Only generate roles that are actually needed for this specific goal. Keep the team lean.

Respond in JSON:
{
  "roles": [
    { "name": "Planner", "description": "Breaks down the build goal and coordinates the team work order" },
    { "name": "API Builder", "description": "Implements backend routes, storage, and data models" }
  ]
}`;

  const result = await callClaude(prompt, {
    model: "claude-sonnet-4-5",
    maxTokens: 2048,
    temperature: 0.3,
    agent: "team-factory-roster",
    task: "generate-roster",
    feature: "agent-team-factory",
  });

  const parsed = extractJson(result.text);
  if (!parsed?.roles || !Array.isArray(parsed.roles)) {
    throw new Error("Claude did not return a valid role roster");
  }

  return parsed.roles as AgentRole[];
}

/**
 * Execute a single agent member's work using the Planner→Builder→Verify pattern.
 * Each agent generates a feature plan for their sub-task and executes it step by step.
 */
async function executeAgentRole(
  team: AgentTeam,
  member: AgentTeamMember,
  priorOutputs: Array<{ role: string; summary: string }>
): Promise<string> {
  const priorContext = priorOutputs.length > 0
    ? `Prior agents have completed:\n${priorOutputs.map(p => `- ${p.role}: ${p.summary}`).join("\n")}`
    : "";

  const agentGoal = `[${member.roleName}] ${member.roleDescription || member.roleName} — for the feature: "${team.goal}"${priorContext ? `\n\n${priorContext}` : ""}`;

  const logLines: string[] = [];
  const log = (msg: string) => {
    logLines.push(msg);
    console.log(`[TeamFactory/${member.roleName}] ${msg}`);
  };

  log(`Starting work on: "${agentGoal.slice(0, 100)}"`);

  let plan: Plan;
  try {
    checkBudgetOrThrow();
    plan = await generateFeaturePlan(
      `${member.roleName}: ${team.goal}`,
      agentGoal,
      {}
    );
    log(`Generated ${plan.steps.length}-step plan: ${plan.goal}`);
  } catch (err: any) {
    const msg = `Plan generation failed: ${err.message}`;
    log(msg);
    return logLines.join("\n");
  }

  let stepsCompleted = 0;
  let stepsFailed = 0;

  for (const step of plan.steps) {
    const disbandCheck = await storage.getAgentTeam(team.id);
    if (!disbandCheck || disbandCheck.status === "disbanded" || disbandCheck.status === "failed") {
      log("Team was disbanded — stopping early");
      break;
    }

    const budgetCheck = shouldStopForBudget();
    if (budgetCheck.stop) {
      log(`Budget limit reached — stopping: ${budgetCheck.message}`);
      break;
    }

    log(`Executing step: ${step.description.slice(0, 80)}`);
    try {
      const buildResult = await executeStep(step);
      if (buildResult.success) {
        stepsCompleted++;
        log(`Step complete: modified ${buildResult.filesModified.length} file(s)`);
      } else {
        stepsFailed++;
        log(`Step failed: ${buildResult.error || "unknown error"}`);
      }
    } catch (err: any) {
      stepsFailed++;
      log(`Step error: ${err.message}`);
    }
  }

  log(`Done — ${stepsCompleted}/${plan.steps.length} steps completed, ${stepsFailed} failed`);

  try {
    const healthy = await quickHealthCheck();
    log(`Server health after build: ${healthy ? "OK" : "DEGRADED"}`);
  } catch {
    log("Health check skipped");
  }

  return logLines.join("\n");
}

/**
 * Run end-of-team validation after all members complete.
 */
async function validateTeamOutput(
  team: AgentTeam,
  members: AgentTeamMember[]
): Promise<{ passed: boolean; summary: string; issues: string[] }> {
  const completedMembers = members.filter(m => m.status === "done");
  const failedMembers = members.filter(m => m.status === "failed");

  const memberSummaries = completedMembers
    .map(m => `### ${m.roleName}\n${(m.outputLog || "").slice(0, 500)}`)
    .join("\n\n");

  if (completedMembers.length === 0) {
    return {
      passed: false,
      summary: "No agents completed their work",
      issues: failedMembers.map(m => `${m.roleName} failed: ${m.errorMessage || "unknown error"}`),
    };
  }

  try {
    const prompt = `You are a QA validator reviewing the output of a Claude agent team.

## Build Goal
${team.goal}

## Agent Outputs
${memberSummaries}

## Validation Task
Assess whether the agent team's combined output adequately addresses the build goal.
Consider:
1. Did all required roles complete meaningful work?
2. Are there gaps or missing pieces?
3. Do the outputs form a coherent whole?
4. Are there obvious errors or contradictions?

Respond in JSON:
{
  "passed": true/false,
  "summary": "Brief overall assessment (1-2 sentences)",
  "issues": ["list of specific issues if any, empty array if none"]
}`;

    const result = await callClaude(prompt, {
      model: "claude-sonnet-4-5",
      maxTokens: 2048,
      temperature: 0.2,
      agent: "team-validator",
      task: "validate-team-output",
      feature: "agent-team-factory",
    });

    const parsed = extractJson(result.text);
    if (parsed && typeof parsed.passed === "boolean") {
      return {
        passed: parsed.passed,
        summary: parsed.summary || "Validation complete",
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    }
  } catch (err: any) {
    console.error(`[TeamFactory] Validation error: ${err.message}`);
  }

  return {
    passed: failedMembers.length === 0,
    summary: failedMembers.length > 0
      ? `${failedMembers.length} agent(s) failed to complete their work`
      : `${completedMembers.length} agent(s) completed their work`,
    issues: failedMembers.map(m => `${m.roleName} failed: ${m.errorMessage || "unknown error"}`),
  };
}

/**
 * Release any locks and clean up resources held by a team.
 * Called on both normal completion and forced disband.
 */
export function releaseTeamResources(teamId: string): void {
  if (activeTeamLocks.has(teamId)) {
    activeTeamLocks.delete(teamId);
    console.log(`[TeamFactory] Released lock for team ${teamId}`);
  }
}

/**
 * Disband a team with full cleanup — marks as disbanded and releases resources.
 */
export async function disbandTeamWithCleanup(teamId: string): Promise<AgentTeam | undefined> {
  releaseTeamResources(teamId);
  const team = await storage.disbandAgentTeam(teamId);
  console.log(`[TeamFactory] Team ${teamId} manually disbanded and cleaned up`);
  return team;
}

/**
 * Launch a new agent team for the given build goal.
 * This runs asynchronously — call it without await in route handlers.
 */
export async function launchAgentTeam(teamId: string): Promise<void> {
  if (activeTeamLocks.has(teamId)) {
    console.warn(`[TeamFactory] Team ${teamId} already running — skipping duplicate launch`);
    return;
  }

  activeTeamLocks.add(teamId);

  let team = await storage.getAgentTeam(teamId);
  if (!team) {
    activeTeamLocks.delete(teamId);
    console.error(`[TeamFactory] Team ${teamId} not found`);
    return;
  }

  console.log(`[TeamFactory] Launching team ${teamId} for goal: "${team.goal}"`);

  try {
    await storage.updateAgentTeam(teamId, { status: "assembling" });

    checkBudgetOrThrow();

    const roles = await generateRoster(team.goal);
    console.log(`[TeamFactory] Generated ${roles.length} roles for team ${teamId}`);

    await storage.updateAgentTeam(teamId, {
      status: "running",
      roles,
    });

    for (const role of roles) {
      await storage.createAgentTeamMember({
        teamId,
        roleName: role.name,
        roleDescription: role.description,
        modelUsed: "claude-sonnet-4-5",
        status: "pending",
      });
    }

    team = (await storage.getAgentTeam(teamId))!;

    const members = await storage.getAgentTeamMembers(teamId);
    const priorOutputs: Array<{ role: string; summary: string }> = [];

    for (const member of members) {
      const currentTeam = await storage.getAgentTeam(teamId);
      if (!currentTeam || currentTeam.status === "disbanded" || currentTeam.status === "failed") {
        console.log(`[TeamFactory] Team ${teamId} was manually disbanded — stopping execution`);
        releaseTeamResources(teamId);
        return;
      }

      const budgetCheck = shouldStopForBudget();
      if (budgetCheck.stop) {
        console.log(`[TeamFactory] Team ${teamId} stopped: ${budgetCheck.message}`);
        await storage.updateAgentTeam(teamId, { status: "failed" });
        releaseTeamResources(teamId);
        return;
      }

      await storage.updateAgentTeamMember(member.id, {
        status: "running",
        startedAt: new Date(),
      });

      console.log(`[TeamFactory] Agent "${member.roleName}" starting work on team ${teamId}`);

      try {
        const output = await executeAgentRole(team!, member, priorOutputs);

        await storage.updateAgentTeamMember(member.id, {
          status: "done",
          outputLog: output,
          completedAt: new Date(),
        });

        const firstLine = output.split("\n").find(l => l.trim().length > 0) || output.slice(0, 100);
        priorOutputs.push({ role: member.roleName, summary: firstLine });
        console.log(`[TeamFactory] Agent "${member.roleName}" completed on team ${teamId}`);
      } catch (err: any) {
        console.error(`[TeamFactory] Agent "${member.roleName}" failed on team ${teamId}: ${err.message}`);
        await storage.updateAgentTeamMember(member.id, {
          status: "failed",
          errorMessage: err.message,
          completedAt: new Date(),
        });
      }
    }

    const finalTeam = await storage.getAgentTeam(teamId);
    if (!finalTeam || finalTeam.status === "disbanded") {
      console.log(`[TeamFactory] Team ${teamId} was manually disbanded — skipping validation`);
      releaseTeamResources(teamId);
      return;
    }

    await storage.updateAgentTeam(teamId, { status: "validating" });

    const finalMembers = await storage.getAgentTeamMembers(teamId);
    const validation = await validateTeamOutput(team!, finalMembers);

    await storage.disbandAgentTeam(teamId);
    await storage.updateAgentTeam(teamId, {
      validationResult: validation,
    });

    releaseTeamResources(teamId);
    console.log(`[TeamFactory] Team ${teamId} disbanded. Validation: ${validation.passed ? "PASSED" : "FAILED"} — ${validation.summary}`);
  } catch (err: any) {
    console.error(`[TeamFactory] Fatal error for team ${teamId}: ${err.message}`);
    try {
      await storage.updateAgentTeam(teamId, { status: "failed" });
    } catch {}
    releaseTeamResources(teamId);
  }
}

/**
 * Create a new agent team record and kick off the async execution.
 */
export async function createAndLaunchTeam(goal: string, userId: string): Promise<AgentTeam> {
  checkBudgetOrThrow();

  const team = await storage.createAgentTeam({
    userId,
    goal,
    status: "assembling",
    roles: [],
  });

  launchAgentTeam(team.id).catch((err) => {
    console.error(`[TeamFactory] Unhandled error in launchAgentTeam(${team.id}): ${err.message}`);
  });

  return team;
}
