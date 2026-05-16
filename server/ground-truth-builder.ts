import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const GROUND_TRUTH_FILE = path.join(DATA_DIR, "ground-truth.json");
const BLOCKED_CONSTRAINTS_FILE = path.join(DATA_DIR, "blocked-constraints.json");

const CRITICAL_FILES = [
  "shared/schema.ts",
  "server/storage.ts",
  "server/routes.ts",
  "server/index.ts",
  "server/db.ts",
  "server/utils.ts",
  "server/planner-agent.ts",
  "server/builder-agent.ts",
  "server/autonomy-loop.ts",
  "server/spec-executor.ts",
  "server/spec-validator.ts",
  "server/expense-tracker.ts",
  "server/cost-tracker.ts",
  "server/elon-manager.ts",
  "scripts/run-elon.sh",
  "GOALS.md",
  ".sneebly/blocked-constraints.json",
  ".sneebly/resolved-constraints.json",
  "client/src/App.tsx",
  "drizzle.config.ts",
];

export interface GroundTruth {
  lastUpdated: string;
  dbTables: string[];
  dbTableColumns: Record<string, string[]>;
  schemaTableNames: string[];
  keyFiles: Record<string, { exists: boolean; lines: number }>;
  blockedConstraints: Array<{ description: string; failCount: number; blockedAt: string }>;
  resolvedConstraints: Array<{ description: string; evidence: string; resolvedAt: string }>;
  recentSpecOutcomes: Array<{ id: string; status: "passed" | "failed" | "rejected"; constraint?: string; reason?: string }>;
}

let cachedGroundTruth: GroundTruth | null = null;

export async function buildGroundTruth(): Promise<GroundTruth> {
  const now = new Date().toISOString();

  const dbTables: string[] = [];
  const dbTableColumns: Record<string, string[]> = {};

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tablesResult = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    for (const row of tablesResult.rows) {
      dbTables.push(row.table_name);
    }
    if (dbTables.length > 0) {
      const colsResult = await pool.query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
      );
      for (const row of colsResult.rows) {
        if (!dbTableColumns[row.table_name]) dbTableColumns[row.table_name] = [];
        dbTableColumns[row.table_name].push(`${row.column_name} (${row.data_type})`);
      }
    }
  } catch (err: any) {
    console.log(`[GroundTruth] DB query failed: ${err.message}`);
  } finally {
    await pool.end().catch(() => {});
  }

  const schemaTableNames: string[] = [];
  try {
    const schemaPath = path.resolve(process.cwd(), "shared/schema.ts");
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, "utf-8");
      const re = /pgTable\s*\(\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        schemaTableNames.push(m[1]);
      }
    }
  } catch {}

  const keyFiles: Record<string, { exists: boolean; lines: number }> = {};
  for (const relPath of CRITICAL_FILES) {
    try {
      const fullPath = path.resolve(process.cwd(), relPath);
      const exists = fs.existsSync(fullPath);
      let lines = 0;
      if (exists) {
        const content = fs.readFileSync(fullPath, "utf-8");
        lines = content.split("\n").length;
      }
      keyFiles[relPath] = { exists, lines };
    } catch {
      keyFiles[relPath] = { exists: false, lines: 0 };
    }
  }

  let blockedConstraints: GroundTruth["blockedConstraints"] = [];
  try {
    if (fs.existsSync(BLOCKED_CONSTRAINTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(BLOCKED_CONSTRAINTS_FILE, "utf-8"));
      blockedConstraints = Array.isArray(raw) ? raw.map((c: any) => ({
        description: c.description || "",
        failCount: c.failCount || 0,
        blockedAt: c.blockedAt || "",
      })) : [];
    }
  } catch {}

  let resolvedConstraints: GroundTruth["resolvedConstraints"] = [];
  try {
    const resolvedPath = path.join(DATA_DIR, "resolved-constraints.json");
    if (fs.existsSync(resolvedPath)) {
      const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
      resolvedConstraints = Array.isArray(raw) ? raw : [];
    }
  } catch {}

  const recentSpecOutcomes: GroundTruth["recentSpecOutcomes"] = [];
  try {
    const archiveDirMap: Array<{ dir: string; status: "passed" | "failed" | "rejected" }> = [
      { dir: path.join(DATA_DIR, "archive", "done"),   status: "passed"   },
      { dir: path.join(DATA_DIR, "archive", "failed"), status: "failed"   },
      { dir: path.join(DATA_DIR, "blocked"),           status: "failed"   },
      { dir: path.join(DATA_DIR, "rejected"),          status: "rejected" },
    ];
    const outcomes: Array<{ id: string; status: "passed" | "failed" | "rejected"; constraint?: string; reason?: string; mtime: number }> = [];
    for (const { dir, status } of archiveDirMap) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        try {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          const spec = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          outcomes.push({
            id: spec.id || file,
            status,
            constraint: spec.constraint || spec.elonConstraint || "",
            reason: spec.skipReason || spec.rejectedReason || "",
            mtime: stat.mtimeMs,
          });
        } catch {}
      }
    }
    outcomes.sort((a, b) => b.mtime - a.mtime);
    recentSpecOutcomes.push(...outcomes.slice(0, 10).map(o => ({
      id: o.id,
      status: o.status,
      constraint: o.constraint,
      reason: o.reason,
    })));
  } catch {}

  const gt: GroundTruth = {
    lastUpdated: now,
    dbTables,
    dbTableColumns,
    schemaTableNames,
    keyFiles,
    blockedConstraints,
    resolvedConstraints,
    recentSpecOutcomes,
  };

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(GROUND_TRUTH_FILE, JSON.stringify(gt, null, 2));
  } catch (err: any) {
    console.log(`[GroundTruth] Failed to write file: ${err.message}`);
  }

  cachedGroundTruth = gt;
  return gt;
}

export function getGroundTruth(): GroundTruth | null {
  if (cachedGroundTruth) return cachedGroundTruth;
  try {
    if (fs.existsSync(GROUND_TRUTH_FILE)) {
      cachedGroundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_FILE, "utf-8"));
      return cachedGroundTruth;
    }
  } catch {}
  return null;
}

export function getGroundTruthSummary(): string {
  const gt = getGroundTruth();
  if (!gt) return "(ground truth not yet available)";
  const lines: string[] = [
    `**Last updated:** ${gt.lastUpdated}`,
    `**DB tables (${gt.dbTables.length}):** ${gt.dbTables.join(", ") || "none"}`,
    `**Schema tables (${gt.schemaTableNames.length}):** ${gt.schemaTableNames.join(", ") || "none"}`,
    `**Blocked constraints (${gt.blockedConstraints.length}):**`,
    ...gt.blockedConstraints.map(c => `  - "${c.description}" (${c.failCount} failures)`),
    `**Resolved constraints (${gt.resolvedConstraints.length}):**`,
    ...gt.resolvedConstraints.map(c => `  - "${c.description}": ${c.evidence}`),
  ];
  return lines.join("\n");
}

export function startGroundTruthRefresh(intervalMs = 5 * 60 * 1000): void {
  buildGroundTruth()
    .then(() => console.log("[GroundTruth] Initial snapshot built"))
    .catch(err => console.log(`[GroundTruth] Initial build failed: ${err.message}`));

  setInterval(() => {
    buildGroundTruth()
      .then(() => console.log("[GroundTruth] Snapshot refreshed"))
      .catch(err => console.log(`[GroundTruth] Refresh failed: ${err.message}`));
  }, intervalMs);
}
