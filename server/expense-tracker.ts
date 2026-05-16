import fs from "fs";
import path from "path";
import { getCostSummary, CostEntry } from "./cost-tracker";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const BUDGET_CONFIG_FILE = path.join(DATA_DIR, "budget-config.json");

export interface BudgetConfig {
  limit: number;
  mode: "notify" | "stop";
  notifiedAt: number[];
  updatedAt: string;
  updatedBy: string;
}

export interface TeamExpense {
  teamId: string;
  teamName: string;
  totalCost: number;
  callCount: number;
  avgCostPerCall: number;
  models: Record<string, { count: number; cost: number }>;
  startedAt: string;
  lastActivity: string;
}

export interface FeatureExpense {
  feature: string;
  totalCost: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  models: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface ExpenseReport {
  totalSpent: number;
  budget: BudgetConfig;
  budgetUsedPercent: number;
  budgetRemaining: number;
  isOverBudget: boolean;
  spentToday: number;
  spentThisHour: number;
  spent24h: number;
  burnRate: { perHour: number; perDay: number };
  projectedTotal: number;
  projectedDaysRemaining: number;
  byFeature: FeatureExpense[];
  byTeam: TeamExpense[];
  byModel: Array<{ model: string; count: number; cost: number; percent: number }>;
  byAgent: Array<{ agent: string; count: number; cost: number; percent: number }>;
  timeline: Array<{ date: string; cost: number; calls: number }>;
  topExpenses: CostEntry[];
}

function loadBudgetConfig(): BudgetConfig {
  try {
    if (fs.existsSync(BUDGET_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(BUDGET_CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return {
    limit: 100,
    mode: "notify",
    notifiedAt: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  };
}

function saveBudgetConfig(config: BudgetConfig): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  config.updatedAt = new Date().toISOString();
  fs.writeFileSync(BUDGET_CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getBudgetConfig(): BudgetConfig {
  return loadBudgetConfig();
}

export function setBudget(limit: number, mode: "notify" | "stop", updatedBy: string = "user"): BudgetConfig {
  const config = loadBudgetConfig();
  config.limit = limit;
  config.mode = mode;
  config.updatedBy = updatedBy;
  config.notifiedAt = [];
  saveBudgetConfig(config);
  return config;
}

export function shouldStopForBudget(): { stop: boolean; notify: boolean; message: string } {
  const config = loadBudgetConfig();
  const summary = getCostSummary();
  const spent = summary.totalAllTime;
  const pct = (spent / config.limit) * 100;

  if (spent >= config.limit) {
    if (config.mode === "stop") {
      return { stop: true, notify: true, message: `Budget limit reached ($${spent.toFixed(2)} / $${config.limit.toFixed(2)}). Stopping work.` };
    }

    const thresholds = [100, 125, 150, 200, 300];
    const needsNotify = thresholds.some(t => pct >= t && !config.notifiedAt.includes(t));
    if (needsNotify) {
      const threshold = thresholds.find(t => pct >= t && !config.notifiedAt.includes(t))!;
      config.notifiedAt.push(threshold);
      saveBudgetConfig(config);
      return { stop: false, notify: true, message: `Budget ${pct.toFixed(0)}% used ($${spent.toFixed(2)} / $${config.limit.toFixed(2)}). Continuing in notify-only mode.` };
    }

    return { stop: false, notify: false, message: `Over budget but continuing ($${spent.toFixed(2)} / $${config.limit.toFixed(2)})` };
  }

  const warningThresholds = [50, 75, 90];
  const needsWarning = warningThresholds.some(t => pct >= t && !config.notifiedAt.includes(t));
  if (needsWarning) {
    const threshold = warningThresholds.find(t => pct >= t && !config.notifiedAt.includes(t))!;
    config.notifiedAt.push(threshold);
    saveBudgetConfig(config);
    return { stop: false, notify: true, message: `Budget ${pct.toFixed(0)}% used ($${spent.toFixed(2)} / $${config.limit.toFixed(2)})` };
  }

  return { stop: false, notify: false, message: `$${spent.toFixed(2)} / $${config.limit.toFixed(2)} (${pct.toFixed(0)}%)` };
}

export function generateExpenseReport(): ExpenseReport {
  const summary = getCostSummary();
  const config = loadBudgetConfig();

  const totalSpent = summary.totalAllTime;
  const budgetUsedPercent = (totalSpent / config.limit) * 100;
  const budgetRemaining = Math.max(0, config.limit - totalSpent);

  const entries = summary.recentEntries;
  const allEntries = entries;

  const dateMap = new Map<string, { cost: number; calls: number }>();
  for (const e of allEntries) {
    const date = e.timestamp.split("T")[0];
    const d = dateMap.get(date) || { cost: 0, calls: 0 };
    d.cost += e.cost;
    d.calls++;
    dateMap.set(date, d);
  }
  const timeline = Array.from(dateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hoursOfData = Math.max(1, allEntries.length > 0
    ? (Date.now() - new Date(allEntries[allEntries.length - 1]?.timestamp || Date.now()).getTime()) / 3600000
    : 1);
  const burnPerHour = summary.totalThisHour || (totalSpent / Math.max(1, hoursOfData));
  const burnPerDay = burnPerHour * 24;
  const projectedDaysRemaining = burnPerDay > 0 ? budgetRemaining / burnPerDay : Infinity;

  const completionPct = 93;
  const remainingPct = 100 - completionPct;
  const costPerPercent = totalSpent / Math.max(1, completionPct);
  const projectedTotal = costPerPercent * 100;

  const byFeatureMap = new Map<string, FeatureExpense>();
  for (const [feature, data] of Object.entries(summary.byFeature)) {
    byFeatureMap.set(feature, {
      feature,
      totalCost: data.cost,
      callCount: data.count,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      models: {},
      firstSeen: "",
      lastSeen: "",
    });
  }

  const byFeature = Array.from(byFeatureMap.values())
    .sort((a, b) => b.totalCost - a.totalCost);

  const byTeamMap = new Map<string, TeamExpense>();
  for (const e of allEntries) {
    const teamMatch = e.agent?.match(/team-(.+)/);
    if (teamMatch) {
      const teamId = teamMatch[1];
      const existing = byTeamMap.get(teamId) || {
        teamId,
        teamName: teamId,
        totalCost: 0,
        callCount: 0,
        avgCostPerCall: 0,
        models: {},
        startedAt: e.timestamp,
        lastActivity: e.timestamp,
      };
      existing.totalCost += e.cost;
      existing.callCount++;
      existing.avgCostPerCall = existing.totalCost / existing.callCount;
      if (!existing.models[e.model]) existing.models[e.model] = { count: 0, cost: 0 };
      existing.models[e.model].count++;
      existing.models[e.model].cost += e.cost;
      if (e.timestamp > existing.lastActivity) existing.lastActivity = e.timestamp;
      byTeamMap.set(teamId, existing);
    }
  }
  const byTeam = Array.from(byTeamMap.values()).sort((a, b) => b.totalCost - a.totalCost);

  const byModel = Object.entries(summary.byModel)
    .map(([model, data]) => ({
      model,
      count: data.count,
      cost: data.cost,
      percent: totalSpent > 0 ? (data.cost / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  const byAgent = Object.entries(summary.byAgent)
    .map(([agent, data]) => ({
      agent,
      count: data.count,
      cost: data.cost,
      percent: totalSpent > 0 ? (data.cost / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  const topExpenses = [...allEntries].sort((a, b) => b.cost - a.cost).slice(0, 10);

  return {
    totalSpent,
    budget: config,
    budgetUsedPercent,
    budgetRemaining,
    isOverBudget: totalSpent >= config.limit,
    spentToday: summary.totalToday,
    spentThisHour: summary.totalThisHour,
    spent24h: summary.last24h,
    burnRate: { perHour: burnPerHour, perDay: burnPerDay },
    projectedTotal,
    projectedDaysRemaining: projectedDaysRemaining === Infinity ? -1 : projectedDaysRemaining,
    byFeature,
    byTeam,
    byModel,
    byAgent,
    timeline,
    topExpenses,
  };
}

export function formatExpenseForChat(): string {
  const report = generateExpenseReport();
  const lines: string[] = [];

  lines.push(`**💰 Expense Report**`);
  lines.push(`Total spent: **$${report.totalSpent.toFixed(2)}** / $${report.budget.limit.toFixed(2)} (${report.budgetUsedPercent.toFixed(1)}%)`);
  lines.push(`Mode: ${report.budget.mode === "notify" ? "Notify only (keeps working)" : "Stop on limit"}`);
  lines.push(`Remaining: $${report.budgetRemaining.toFixed(2)}`);
  lines.push(``);

  lines.push(`**Burn Rate**`);
  lines.push(`Per hour: $${report.burnRate.perHour.toFixed(4)} | Per day: $${report.burnRate.perDay.toFixed(2)}`);
  if (report.projectedDaysRemaining > 0) {
    lines.push(`Projected days remaining: ${report.projectedDaysRemaining.toFixed(1)}`);
  }
  lines.push(`Projected total (to 100%): $${report.projectedTotal.toFixed(2)}`);
  lines.push(``);

  if (report.byFeature.length > 0) {
    lines.push(`**Cost by Feature**`);
    for (const f of report.byFeature.slice(0, 8)) {
      const pct = report.totalSpent > 0 ? ((f.totalCost / report.totalSpent) * 100).toFixed(1) : "0";
      lines.push(`- ${f.feature}: $${f.totalCost.toFixed(4)} (${pct}%, ${f.callCount} calls)`);
    }
    lines.push(``);
  }

  if (report.byModel.length > 0) {
    lines.push(`**Cost by Model**`);
    for (const m of report.byModel) {
      lines.push(`- ${m.model}: $${m.cost.toFixed(4)} (${m.percent.toFixed(1)}%, ${m.count} calls)`);
    }
    lines.push(``);
  }

  if (report.byTeam.length > 0) {
    lines.push(`**Cost by Team**`);
    for (const t of report.byTeam) {
      lines.push(`- ${t.teamName}: $${t.totalCost.toFixed(4)} (${t.callCount} calls, avg $${t.avgCostPerCall.toFixed(4)}/call)`);
    }
  }

  return lines.join("\n");
}
