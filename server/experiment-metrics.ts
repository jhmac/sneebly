import fs from "fs";
import path from "path";
import { exec } from "child_process";
import http from "http";

const SERVER_URL = "http://localhost:5000";
const CWD = process.cwd();

export interface MetricsSnapshot {
  timestamp: string;
  tscErrorCount: number;
  tscErrors: string[];
  serverHealthy: boolean;
  apiLatencies: Record<string, number>;
  avgApiLatencyMs: number;
  serverLoc: number;
  clientLoc: number;
  serverFileCount: number;
  clientFileCount: number;
  todoCount: number;
  fixmeCount: number;
  bundleSizeEstimateKb: number;
  complexityIndicator: number;
  score: number;
}

function walkTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const walk = (d: string) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) files.push(full);
      }
    };
    walk(dir);
  } catch {}
  return files;
}

function countTodo(dirs: string[]): { todos: number; fixmes: number } {
  let todos = 0;
  let fixmes = 0;
  for (const dir of dirs) {
    for (const file of walkTsFiles(dir)) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        todos += (content.match(/\bTODO\b/g) || []).length;
        fixmes += (content.match(/\bFIXME\b/g) || []).length;
      } catch {}
    }
  }
  return { todos, fixmes };
}

function countLoc(dir: string): { loc: number; files: number } {
  let loc = 0;
  let files = 0;
  for (const file of walkTsFiles(dir)) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      loc += content.split("\n").length;
      files++;
    } catch {}
  }
  return { loc, files };
}

function estimateBundleSizeKb(clientDir: string): number {
  let totalBytes = 0;
  for (const file of walkTsFiles(clientDir)) {
    try {
      totalBytes += fs.statSync(file).size;
    } catch {}
  }
  return Math.round(totalBytes / 1024);
}

function measureComplexity(dirs: string[]): number {
  let complexity = 0;
  for (const dir of dirs) {
    for (const file of walkTsFiles(dir)) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const stripped = line.trim();
          if (
            stripped.startsWith("if ") ||
            stripped.startsWith("else if ") ||
            stripped.startsWith("} else {") ||
            stripped.startsWith("while ") ||
            stripped.startsWith("for ") ||
            stripped.startsWith("switch ") ||
            stripped.startsWith("case ") ||
            stripped.startsWith("catch ") ||
            stripped.includes("? ") && stripped.includes(": ")
          ) {
            complexity++;
          }
        }
      } catch {}
    }
  }
  return complexity;
}

function runTsc(): Promise<{ count: number; errors: string[] }> {
  return new Promise((resolve) => {
    exec(
      "npx tsc --noEmit --pretty false",
      { cwd: CWD, timeout: 60000, maxBuffer: 2 * 1024 * 1024 },
      (_err, stdout, stderr) => {
        const output = ((stdout || "") + (stderr || "")).trim();
        if (!output) {
          resolve({ count: 0, errors: [] });
          return;
        }
        const lines = output.split("\n").filter((l) => l.includes(" error TS"));
        resolve({ count: lines.length, errors: lines.slice(0, 20) });
      }
    );
  });
}

function httpGet(urlPath: string, timeoutMs = 3000): Promise<{ status: number; ms: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: 0, ms: timeoutMs }), timeoutMs);
    http
      .get(`${SERVER_URL}${urlPath}`, (res) => {
        clearTimeout(timer);
        res.resume();
        resolve({ status: res.statusCode || 0, ms: Date.now() - start });
      })
      .on("error", () => {
        clearTimeout(timer);
        resolve({ status: 0, ms: Date.now() - start });
      });
  });
}

export async function collectMetrics(): Promise<MetricsSnapshot> {
  const [tscResult, healthResult] = await Promise.all([
    runTsc(),
    httpGet("/health"),
  ]);

  const apiPaths = ["/health", "/api/projects", "/api/users/me"];
  const latencyResults = await Promise.all(apiPaths.map((p) => httpGet(p)));
  const apiLatencies: Record<string, number> = {};
  for (let i = 0; i < apiPaths.length; i++) {
    apiLatencies[apiPaths[i]] = latencyResults[i].ms;
  }
  const avgApiLatencyMs = Math.round(
    Object.values(apiLatencies).reduce((a, b) => a + b, 0) / Math.max(Object.keys(apiLatencies).length, 1)
  );

  const serverDir = path.join(CWD, "server");
  const clientDir = path.join(CWD, "client", "src");
  const serverLoc = countLoc(serverDir);
  const clientLoc = countLoc(clientDir);

  const todoCounts = countTodo([serverDir, clientDir]);
  const bundleSizeEstimateKb = estimateBundleSizeKb(clientDir);
  const complexityIndicator = measureComplexity([serverDir]);

  const snapshot: MetricsSnapshot = {
    timestamp: new Date().toISOString(),
    tscErrorCount: tscResult.count,
    tscErrors: tscResult.errors,
    serverHealthy: healthResult.status === 200,
    apiLatencies,
    avgApiLatencyMs,
    serverLoc: serverLoc.loc,
    clientLoc: clientLoc.loc,
    serverFileCount: serverLoc.files,
    clientFileCount: clientLoc.files,
    todoCount: todoCounts.todos,
    fixmeCount: todoCounts.fixmes,
    bundleSizeEstimateKb,
    complexityIndicator,
    score: 0,
  };

  snapshot.score = computeScore(snapshot);
  return snapshot;
}

export function computeScore(m: MetricsSnapshot): number {
  let score = 100;

  score -= Math.min(m.tscErrorCount * 2, 30);

  if (!m.serverHealthy) score -= 20;

  if (m.avgApiLatencyMs > 300) score -= 5;
  if (m.avgApiLatencyMs > 600) score -= 5;
  if (m.avgApiLatencyMs > 1000) score -= 10;

  score -= Math.min((m.todoCount + m.fixmeCount) * 0.5, 10);

  const complexityPer1k = m.serverLoc > 0 ? (m.complexityIndicator / m.serverLoc) * 1000 : 0;
  if (complexityPer1k > 150) score -= 5;
  if (complexityPer1k > 200) score -= 5;

  return Math.max(0, Math.round(score));
}

const COMPLEXITY_INCREASE_PENALTY_PER_UNIT = 0.02;
const LOC_INCREASE_ACCEPTABLE = 30;

export function compareMetrics(
  before: MetricsSnapshot,
  after: MetricsSnapshot
): {
  improved: boolean;
  delta: Record<string, number>;
  reason: string;
  simplicityPenalty: number;
} {
  const delta: Record<string, number> = {
    score: after.score - before.score,
    tscErrors: after.tscErrorCount - before.tscErrorCount,
    todoCount: after.todoCount - before.todoCount,
    fixmeCount: after.fixmeCount - before.fixmeCount,
    serverLoc: after.serverLoc - before.serverLoc,
    clientLoc: after.clientLoc - before.clientLoc,
    avgLatencyMs: after.avgApiLatencyMs - before.avgApiLatencyMs,
    bundleSizeKb: after.bundleSizeEstimateKb - before.bundleSizeEstimateKb,
    complexity: after.complexityIndicator - before.complexityIndicator,
  };

  const locIncrease = Math.max(0, delta.serverLoc + delta.clientLoc);
  const complexityIncrease = Math.max(0, delta.complexity);
  const simplicityPenalty =
    (locIncrease > LOC_INCREASE_ACCEPTABLE ? (locIncrease - LOC_INCREASE_ACCEPTABLE) * 0.01 : 0) +
    complexityIncrease * COMPLEXITY_INCREASE_PENALTY_PER_UNIT;

  const adjustedScoreDelta = delta.score - simplicityPenalty;
  delta.adjustedScore = Math.round(adjustedScoreDelta * 10) / 10;

  const improved =
    adjustedScoreDelta > 0 ||
    (adjustedScoreDelta === 0 && delta.tscErrors < 0);

  const reasons: string[] = [];
  if (delta.score > 0) reasons.push(`score +${delta.score}`);
  if (delta.score < 0) reasons.push(`score ${delta.score}`);
  if (delta.tscErrors < 0) reasons.push(`TSC errors ${delta.tscErrors}`);
  if (delta.tscErrors > 0) reasons.push(`TSC errors +${delta.tscErrors} (REGRESSION)`);
  if (delta.todoCount < 0) reasons.push(`TODOs ${delta.todoCount}`);
  if (delta.avgLatencyMs > 50) reasons.push(`latency +${delta.avgLatencyMs}ms`);
  if (delta.avgLatencyMs < -50) reasons.push(`latency ${delta.avgLatencyMs}ms`);
  if (simplicityPenalty > 0.5)
    reasons.push(`simplicity penalty -${simplicityPenalty.toFixed(1)} (added ${locIncrease} LOC, +${complexityIncrease} branches)`);

  return {
    improved,
    delta,
    reason: reasons.join(", ") || "no measurable change",
    simplicityPenalty: Math.round(simplicityPenalty * 10) / 10,
  };
}

const METRICS_FILE = path.join(CWD, ".sneebly", "last-metrics.json");

export function saveMetrics(snapshot: MetricsSnapshot): void {
  try {
    const dir = path.dirname(METRICS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(METRICS_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch {}
}

export function loadLastMetrics(): MetricsSnapshot | null {
  try {
    if (fs.existsSync(METRICS_FILE)) {
      return JSON.parse(fs.readFileSync(METRICS_FILE, "utf-8"));
    }
  } catch {}
  return null;
}
