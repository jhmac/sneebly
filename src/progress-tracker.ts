import fs from "fs";
import path from "path";
import { updateSection } from "./memory-manager";

const GOALS_FILE = path.join(process.cwd(), "GOALS.md");
const PROGRESS_FILE = path.join(process.cwd(), ".sneebly", "progress.json");

interface GoalItem {
  category: string;
  name: string;
  status: "done" | "partial" | "missing";
  evidence: string;
}

interface ProgressReport {
  timestamp: string;
  totalGoals: number;
  completed: number;
  partial: number;
  missing: number;
  completionPercent: number;
  items: GoalItem[];
  nextPriorities: string[];
}

function readGoals(): string {
  try {
    return fs.readFileSync(GOALS_FILE, "utf-8");
  } catch {
    return "";
  }
}

function extractDataModels(goals: string): string[] {
  const models: string[] = [];
  const regex = /####\s+(\w+)/g;
  let match;
  while ((match = regex.exec(goals)) !== null) {
    if (match.index < goals.indexOf("### API Endpoints")) {
      models.push(match[1]);
    }
  }
  return models;
}

function extractApiEndpoints(goals: string): { method: string; path: string; name: string }[] {
  const endpoints: { method: string; path: string; name: string }[] = [];
  const regex = /\*\*(\w+)\s+(\/api\/[^\s*]+)\*\*\s*—\s*(.+)/g;
  let match;
  while ((match = regex.exec(goals)) !== null) {
    endpoints.push({ method: match[1], path: match[2], name: match[3].trim() });
  }
  return endpoints;
}

function checkSchemaForTable(tableName: string): boolean {
  try {
    const schema = fs.readFileSync(path.join(process.cwd(), "shared", "schema.ts"), "utf-8");
    const camelName = tableName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return schema.includes(`"${tableName}"`) || schema.includes(`"${camelName}"`) ||
      schema.includes(`export const ${camelName}`) || schema.includes(`export const ${tableName}`);
  } catch {
    return false;
  }
}

function checkStorageForTable(tableName: string): boolean {
  try {
    const storage = fs.readFileSync(path.join(process.cwd(), "server", "storage.ts"), "utf-8");
    const camelName = tableName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return storage.includes(camelName) || storage.includes(tableName);
  } catch {
    return false;
  }
}

function checkRoutesForEndpoint(apiPath: string): boolean {
  try {
    const routes = fs.readFileSync(path.join(process.cwd(), "server", "routes.ts"), "utf-8");

    const escapedPath = apiPath
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:(\w+)/g, ":\\w+");
    const exactRouteRegex = new RegExp(`["'\`]${escapedPath}["'\`]`);
    if (exactRouteRegex.test(routes)) return true;

    const normalizedPath = apiPath.replace(/:(\w+)/g, ":$1");
    if (routes.includes(`"${normalizedPath}"`) || routes.includes(`'${normalizedPath}'`)) return true;

    const segments = apiPath.split("/").filter(s => s && !s.startsWith(":") && s !== "api");
    const resourceSegment = segments[segments.length - 1] || segments[0] || "";
    if (resourceSegment.length >= 3) {
      const routeRegex = new RegExp(
        `app\\.(get|post|put|patch|delete)\\s*\\(\\s*["'\`][^"'\`]*${resourceSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i"
      );
      return routeRegex.test(routes);
    }
    return false;
  } catch {
    return false;
  }
}

function checkClientPageExists(pageName: string): boolean {
  const pagesDir = path.join(process.cwd(), "client", "src", "pages");
  try {
    if (!fs.existsSync(pagesDir)) return false;
    const files = fs.readdirSync(pagesDir, { recursive: true }) as string[];
    const lower = pageName.toLowerCase();
    return files.some(f => String(f).toLowerCase().includes(lower));
  } catch {
    return false;
  }
}

export function generateProgressReport(): ProgressReport {
  const goals = readGoals();
  const items: GoalItem[] = [];

  const models = extractDataModels(goals);
  for (const model of models) {
    const inSchema = checkSchemaForTable(model);
    const inStorage = checkStorageForTable(model);

    items.push({
      category: "Data Model",
      name: model,
      status: inSchema && inStorage ? "done" : inSchema ? "partial" : "missing",
      evidence: inSchema && inStorage
        ? "Schema + Storage CRUD exists"
        : inSchema
        ? "Schema exists but storage methods missing"
        : "Not found in schema",
    });
  }

  const endpoints = extractApiEndpoints(goals);
  for (const ep of endpoints) {
    const exists = checkRoutesForEndpoint(ep.path);
    items.push({
      category: "API Endpoint",
      name: `${ep.method} ${ep.path}`,
      status: exists ? "done" : "missing",
      evidence: exists ? "Route handler found" : "Not found in routes.ts",
    });
  }

  const uiPages = ["Dashboard", "ProjectDetail", "CharacterEditor", "SpritePreview", "EnvironmentEditor"];
  for (const page of uiPages) {
    const exists = checkClientPageExists(page);
    items.push({
      category: "UI Page",
      name: page,
      status: exists ? "done" : "missing",
      evidence: exists ? "Page component exists" : "Not found in client/src/pages/",
    });
  }

  const completed = items.filter(i => i.status === "done").length;
  const partial = items.filter(i => i.status === "partial").length;
  const missing = items.filter(i => i.status === "missing").length;

  const missingItems = items.filter(i => i.status === "missing");
  const nextPriorities: string[] = [];

  const missingModels = missingItems.filter(i => i.category === "Data Model");
  if (missingModels.length > 0) {
    nextPriorities.push(`Add schema for: ${missingModels.map(m => m.name).join(", ")}`);
  }

  const missingEndpoints = missingItems.filter(i => i.category === "API Endpoint");
  if (missingEndpoints.length > 0) {
    nextPriorities.push(`Add API routes: ${missingEndpoints.slice(0, 5).map(e => e.name).join(", ")}${missingEndpoints.length > 5 ? ` (+${missingEndpoints.length - 5} more)` : ""}`);
  }

  const missingPages = missingItems.filter(i => i.category === "UI Page");
  if (missingPages.length > 0) {
    nextPriorities.push(`Build UI pages: ${missingPages.map(p => p.name).join(", ")}`);
  }

  const report: ProgressReport = {
    timestamp: new Date().toISOString(),
    totalGoals: items.length,
    completed,
    partial,
    missing,
    completionPercent: Math.round((completed / Math.max(items.length, 1)) * 100),
    items,
    nextPriorities,
  };

  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(report, null, 2), "utf-8");

  const stateLines = [
    `### Progress Report (${report.timestamp.split("T")[0]})`,
    `- Completion: ${report.completionPercent}% (${completed}/${items.length} goals)`,
    `- Done: ${completed}, Partial: ${partial}, Missing: ${missing}`,
    ...nextPriorities.map(p => `- Next: ${p}`),
  ];
  updateSection("Project State", stateLines.join("\n"));

  return report;
}

export function getLastProgress(): ProgressReport | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

export function getCompletionPercent(): number {
  const report = getLastProgress();
  return report?.completionPercent || 0;
}

export function getNextPriorities(): string[] {
  const report = getLastProgress();
  return report?.nextPriorities || [];
}

export async function markGoalComplete(goalText: string): Promise<void> {
  const goalsPath = path.join(process.cwd(), 'GOALS.md');
  if (!fs.existsSync(goalsPath)) return;

  let content = fs.readFileSync(goalsPath, 'utf-8');

  const escaped = goalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(- \\[ \\] .*${escaped.slice(0, 40)})`, 'i');
  const match = content.match(pattern);

  if (match) {
    content = content.replace(match[0], match[0].replace('- [ ]', '- [x]'));
    const tmp = goalsPath + '.tmp';
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, goalsPath);
    console.log(`[sneebly] Marked goal complete: ${goalText.slice(0, 50)}...`);
  }
}
