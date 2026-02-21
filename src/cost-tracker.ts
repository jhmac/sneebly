import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const COST_LEDGER_FILE = path.join(DATA_DIR, "cost-ledger.json");

const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  "claude-sonnet-4-5": { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0, cacheRead: 0.10, cacheWrite: 1.25 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0, cacheRead: 0.10, cacheWrite: 1.25 },
  "claude-opus-4-5": { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5.0, output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  "sonnet": { input: 3.0, output: 15.0 },
  "haiku": { input: 1.0, output: 5.0 },
  "opus": { input: 5.0, output: 25.0 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens?: number,
  cacheWriteTokens?: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["sonnet"];
  let cost = 0;
  const nonCachedInput = Math.max(0, inputTokens - (cacheReadTokens || 0));
  cost += (nonCachedInput / 1_000_000) * pricing.input;
  cost += (outputTokens / 1_000_000) * pricing.output;
  if (cacheReadTokens && pricing.cacheRead) {
    cost += (cacheReadTokens / 1_000_000) * pricing.cacheRead;
  }
  if (cacheWriteTokens && pricing.cacheWrite) {
    cost += (cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  }
  return cost;
}

export interface CostEntry {
  id: string;
  timestamp: string;
  agent: string;
  model: string;
  cost: number;
  action: string;
  context?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  task?: string;
  feature?: string;
}

export interface CostSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  totalCost: number;
  entries: number;
  label: string;
}

export interface CostLedger {
  entries: CostEntry[];
  sessions: CostSession[];
  totalAllTime: number;
  totalToday: number;
  lastUpdated: string;
  prunedCostTotal?: number;
}

function loadLedger(): CostLedger {
  try {
    if (fs.existsSync(COST_LEDGER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COST_LEDGER_FILE, "utf-8"));
      return data;
    }
  } catch {}
  return {
    entries: [],
    sessions: [],
    totalAllTime: 0,
    totalToday: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function saveLedger(ledger: CostLedger): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ledger.lastUpdated = new Date().toISOString();
  fs.writeFileSync(COST_LEDGER_FILE, JSON.stringify(ledger, null, 2), "utf-8");
}

export function logCost(entry: Omit<CostEntry, "id" | "timestamp">): CostEntry {
  const ledger = loadLedger();

  let cost = entry.cost;
  const hasTokenData = (entry.inputTokens != null && entry.inputTokens > 0) ||
    (entry.outputTokens != null && entry.outputTokens > 0) ||
    (entry.cacheReadTokens != null && entry.cacheReadTokens > 0) ||
    (entry.cacheWriteTokens != null && entry.cacheWriteTokens > 0);
  if (hasTokenData) {
    cost = calculateCost(
      entry.model,
      entry.inputTokens || 0,
      entry.outputTokens || 0,
      entry.cacheReadTokens,
      entry.cacheWriteTokens
    );
  }

  const newEntry: CostEntry = {
    ...entry,
    cost,
    id: `cost-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  ledger.entries.push(newEntry);
  if (ledger.entries.length > 2000) {
    const pruned = ledger.entries.slice(0, ledger.entries.length - 1500);
    const prunedCost = pruned.reduce((sum, e) => sum + e.cost, 0);
    ledger.entries = ledger.entries.slice(-1500);
    if (!ledger.prunedCostTotal) ledger.prunedCostTotal = 0;
    ledger.prunedCostTotal += prunedCost;
  }
  ledger.totalAllTime += cost;
  recalcToday(ledger);
  saveLedger(ledger);
  return newEntry;
}

function recalcToday(ledger: CostLedger): void {
  const today = new Date().toISOString().split("T")[0];
  ledger.totalToday = ledger.entries
    .filter((e) => e.timestamp.startsWith(today))
    .reduce((sum, e) => sum + e.cost, 0);
}

export function startSession(label: string): CostSession {
  const ledger = loadLedger();
  const session: CostSession = {
    id: `session-${Date.now()}`,
    startedAt: new Date().toISOString(),
    totalCost: 0,
    entries: 0,
    label,
  };
  ledger.sessions.push(session);
  if (ledger.sessions.length > 100) {
    ledger.sessions = ledger.sessions.slice(-80);
  }
  saveLedger(ledger);
  return session;
}

export function endSession(sessionId: string): CostSession | null {
  const ledger = loadLedger();
  const session = ledger.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  session.endedAt = new Date().toISOString();
  const sessionEntries = ledger.entries.filter(
    (e) =>
      e.timestamp >= session.startedAt &&
      (!session.endedAt || e.timestamp <= session.endedAt)
  );
  session.totalCost = sessionEntries.reduce((sum, e) => sum + e.cost, 0);
  session.entries = sessionEntries.length;
  saveLedger(ledger);
  return session;
}

export function getCostSummary(): {
  totalAllTime: number;
  totalToday: number;
  totalThisHour: number;
  recentEntries: CostEntry[];
  entriesCount: number;
  byModel: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }>;
  byAgent: Record<string, { count: number; cost: number }>;
  byTask: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }>;
  byFeature: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }>;
  activeSessions: CostSession[];
  last24h: number;
} {
  const ledger = loadLedger();
  recalcToday(ledger);

  const now = Date.now();
  const hourAgo = new Date(now - 3600000).toISOString();
  const dayAgo = new Date(now - 86400000).toISOString();

  const totalThisHour = ledger.entries
    .filter((e) => e.timestamp >= hourAgo)
    .reduce((sum, e) => sum + e.cost, 0);

  const last24h = ledger.entries
    .filter((e) => e.timestamp >= dayAgo)
    .reduce((sum, e) => sum + e.cost, 0);

  const byModel: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }> = {};
  const byAgent: Record<string, { count: number; cost: number }> = {};
  const byTask: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }> = {};
  const byFeature: Record<string, { count: number; cost: number; inputTokens: number; outputTokens: number }> = {};

  for (const e of ledger.entries) {
    if (!byModel[e.model]) byModel[e.model] = { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
    byModel[e.model].count++;
    byModel[e.model].cost += e.cost;
    byModel[e.model].inputTokens += e.inputTokens || 0;
    byModel[e.model].outputTokens += e.outputTokens || 0;

    if (!byAgent[e.agent]) byAgent[e.agent] = { count: 0, cost: 0 };
    byAgent[e.agent].count++;
    byAgent[e.agent].cost += e.cost;

    const taskKey = e.task || e.action || "unknown";
    if (!byTask[taskKey]) byTask[taskKey] = { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
    byTask[taskKey].count++;
    byTask[taskKey].cost += e.cost;
    byTask[taskKey].inputTokens += e.inputTokens || 0;
    byTask[taskKey].outputTokens += e.outputTokens || 0;

    const featureKey = e.feature || "general";
    if (!byFeature[featureKey]) byFeature[featureKey] = { count: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
    byFeature[featureKey].count++;
    byFeature[featureKey].cost += e.cost;
    byFeature[featureKey].inputTokens += e.inputTokens || 0;
    byFeature[featureKey].outputTokens += e.outputTokens || 0;
  }

  const activeSessions = ledger.sessions.filter((s) => !s.endedAt);

  return {
    totalAllTime: ledger.totalAllTime,
    totalToday: ledger.totalToday,
    totalThisHour,
    recentEntries: ledger.entries.slice(-50).reverse(),
    entriesCount: ledger.entries.length,
    byModel,
    byAgent,
    byTask,
    byFeature,
    activeSessions,
    last24h,
  };
}

export function syncFromSneeblyLogs(): number {
  const ledger = loadLedger();
  const existingIds = new Set(ledger.entries.map((e) => e.id));

  const dailyDir = path.join(DATA_DIR, "daily");
  let totalImported = 0;

  const logFiles: string[] = [];
  if (fs.existsSync(dailyDir)) {
    const files = fs.readdirSync(dailyDir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      logFiles.push(path.join(dailyDir, f));
    }
  }
  const oldLogPath = path.join(DATA_DIR, "daily-log.md");
  if (fs.existsSync(oldLogPath)) logFiles.push(oldLogPath);

  for (const logPath of logFiles) {
    const content = fs.readFileSync(logPath, "utf-8");
    const costRegex =
      /- \[([^\]]+)\]\s+(\S+)\s+\((\w+)\):\s+(\S+)\s+.*?\$(\d+\.?\d*)/g;

    let match;
    while ((match = costRegex.exec(content)) !== null) {
      const [, timestamp, agent, model, action, costStr] = match;
      const syncId = `sync-${timestamp}-${agent}-${model}`;
      if (existingIds.has(syncId)) continue;

      const cost = parseFloat(costStr);
      if (isNaN(cost) || cost === 0) continue;

      let isoTimestamp: string;
      try {
        isoTimestamp = new Date(timestamp).toISOString();
      } catch {
        isoTimestamp = new Date().toISOString();
      }

      ledger.entries.push({
        id: syncId,
        timestamp: isoTimestamp,
        agent,
        model,
        cost,
        action,
        context: "synced from daily log (estimated)",
        task: action,
        feature: "legacy-estimate",
      });
      existingIds.add(syncId);
      ledger.totalAllTime += cost;
      totalImported++;
    }
  }

  if (totalImported > 0) {
    recalcToday(ledger);
    saveLedger(ledger);
  }

  return totalImported;
}

export function recalculateAllCosts(): { updated: number; oldTotal: number; newTotal: number } {
  const ledger = loadLedger();
  const oldTotal = ledger.totalAllTime;
  let updated = 0;

  for (const entry of ledger.entries) {
    const hasTokens = (entry.inputTokens != null && entry.inputTokens > 0) ||
      (entry.outputTokens != null && entry.outputTokens > 0) ||
      (entry.cacheReadTokens != null && entry.cacheReadTokens > 0) ||
      (entry.cacheWriteTokens != null && entry.cacheWriteTokens > 0);
    if (hasTokens) {
      const realCost = calculateCost(
        entry.model,
        entry.inputTokens || 0,
        entry.outputTokens || 0,
        entry.cacheReadTokens,
        entry.cacheWriteTokens
      );
      if (Math.abs(realCost - entry.cost) > 0.0001) {
        entry.cost = realCost;
        updated++;
      }
    }
  }

  ledger.totalAllTime = (ledger.prunedCostTotal || 0) + ledger.entries.reduce((sum, e) => sum + e.cost, 0);
  recalcToday(ledger);
  saveLedger(ledger);

  return { updated, oldTotal, newTotal: ledger.totalAllTime };
}

export function getRecentCosts(limit: number = 20): CostEntry[] {
  const ledger = loadLedger();
  return ledger.entries.slice(-limit).reverse();
}
