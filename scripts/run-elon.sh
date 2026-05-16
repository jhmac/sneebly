#!/bin/bash
# Use Sneebly's own API key if available, fall back to Replit integration
if [ -n "$SNEEBLY_ANTHROPIC_API_KEY" ]; then
  export ANTHROPIC_API_KEY="${SNEEBLY_ANTHROPIC_API_KEY}"
  export ANTHROPIC_BASE_URL="https://api.anthropic.com"
else
  export ANTHROPIC_API_KEY="${AI_INTEGRATIONS_ANTHROPIC_API_KEY}"
  export ANTHROPIC_BASE_URL="${AI_INTEGRATIONS_ANTHROPIC_BASE_URL}"
fi

# Pre-flight: write ground-truth snapshot to .sneebly/elon-context.json
# so ELON's analysis prompt receives verified DB and file facts
node --input-type=module <<'EOF'
import fs from "fs";
import path from "path";
import pg from "pg";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const GROUND_TRUTH_FILE = path.join(DATA_DIR, "ground-truth.json");
const ELON_CONTEXT_FILE = path.join(DATA_DIR, "elon-context.json");

// Read cached ground truth if available (server may have written it)
let gt = null;
try {
  if (fs.existsSync(GROUND_TRUTH_FILE)) {
    gt = JSON.parse(fs.readFileSync(GROUND_TRUTH_FILE, "utf-8"));
  }
} catch {}

if (gt) {
  // Compose a concise context block for ELON's prompt
  const ctx = {
    generatedAt: new Date().toISOString(),
    source: "ground-truth.json (server-written snapshot)",
    dbTables: gt.dbTables || [],
    schemaTableNames: gt.schemaTableNames || [],
    keyFiles: gt.keyFiles || {},
    blockedConstraints: (gt.blockedConstraints || []).map(c => ({
      description: c.description,
      failCount: c.failCount,
    })),
    resolvedConstraints: (gt.resolvedConstraints || []).map(c => ({
      description: c.description,
      evidence: c.evidence,
    })),
    recentSpecOutcomes: gt.recentSpecOutcomes || [],
    summary: [
      `DB tables that EXIST in PostgreSQL: ${(gt.dbTables || []).join(", ") || "none"}`,
      `Tables defined in shared/schema.ts: ${(gt.schemaTableNames || []).join(", ") || "none"}`,
      `Blocked constraints: ${(gt.blockedConstraints || []).length}`,
      `Resolved constraints (already done — DO NOT redo): ${(gt.resolvedConstraints || []).length}`,
    ].join("\n"),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ELON_CONTEXT_FILE, JSON.stringify(ctx, null, 2), "utf-8");
  console.log("[ELON pre-flight] Ground truth written to .sneebly/elon-context.json");
  console.log(`  DB tables (${ctx.dbTables.length}): ${ctx.dbTables.slice(0, 5).join(", ")}${ctx.dbTables.length > 5 ? "..." : ""}`);
  console.log(`  Schema tables (${ctx.schemaTableNames.length}): ${ctx.schemaTableNames.slice(0, 5).join(", ")}${ctx.schemaTableNames.length > 5 ? "..." : ""}`);
  console.log(`  Blocked constraints: ${ctx.blockedConstraints.length}, Resolved: ${ctx.resolvedConstraints.length}`);
} else {
  // Fall back: query DB directly and write a minimal context
  console.log("[ELON pre-flight] No cached ground truth found — querying DB directly...");
  try {
    const { Pool } = pg;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    await pool.end();
    const dbTables = result.rows.map(r => r.table_name);

    let schemaTableNames = [];
    try {
      const schemaContent = fs.readFileSync(path.join(process.cwd(), "shared/schema.ts"), "utf-8");
      const re = /pgTable\s*\(\s*["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(schemaContent)) !== null) {
        schemaTableNames.push(m[1]);
      }
    } catch {}

    // Load blocked/resolved constraints from disk even without cached ground truth
    let blockedConstraints = [];
    let resolvedConstraints = [];
    try {
      const blockedFile = path.join(DATA_DIR, "blocked-constraints.json");
      if (fs.existsSync(blockedFile)) {
        blockedConstraints = JSON.parse(fs.readFileSync(blockedFile, "utf-8"))
          .map(c => ({ description: c.description, failCount: c.failCount }));
      }
    } catch {}
    try {
      const resolvedFile = path.join(DATA_DIR, "resolved-constraints.json");
      if (fs.existsSync(resolvedFile)) {
        resolvedConstraints = JSON.parse(fs.readFileSync(resolvedFile, "utf-8"))
          .map(c => ({ description: c.description, evidence: c.evidence }));
      }
    } catch {}

    const ctx = {
      generatedAt: new Date().toISOString(),
      source: "direct DB query (no cached ground truth)",
      dbTables,
      schemaTableNames,
      blockedConstraints,
      resolvedConstraints,
      summary: [
        `DB tables that EXIST in PostgreSQL: ${dbTables.join(", ") || "none"}`,
        `Tables defined in shared/schema.ts: ${schemaTableNames.join(", ") || "none"}`,
        `Blocked constraints: ${blockedConstraints.length}`,
        `Resolved constraints (already done — DO NOT redo): ${resolvedConstraints.length}`,
      ].join("\n"),
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ELON_CONTEXT_FILE, JSON.stringify(ctx, null, 2), "utf-8");
    console.log(`[ELON pre-flight] Direct DB snapshot written — ${dbTables.length} tables found`);
  } catch (err) {
    console.log(`[ELON pre-flight] Pre-flight failed: ${err.message} — continuing without context`);
  }
}
EOF

node --input-type=module <<'RESOLVE_EOF'
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const BLOCKED_FILE = path.join(DATA_DIR, "blocked-constraints.json");
const RESOLVED_FILE = path.join(DATA_DIR, "resolved-constraints.json");
const CONTEXT_FILE = path.join(DATA_DIR, "elon-context.json");

try {
  let blocked = [];
  try { blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE, "utf-8")); } catch {}
  if (!Array.isArray(blocked)) blocked = [];

  let ctx = {};
  try { ctx = JSON.parse(fs.readFileSync(CONTEXT_FILE, "utf-8")); } catch {}
  const dbTables = (ctx.dbTables || []).map(t => t.toLowerCase().replace(/_/g, ""));
  const schemaTables = (ctx.schemaTableNames || []).map(t => t.toLowerCase().replace(/_/g, ""));

  let resolved = [];
  try { resolved = JSON.parse(fs.readFileSync(RESOLVED_FILE, "utf-8")); } catch {}
  if (!Array.isArray(resolved)) resolved = [];

  const stillBlocked = [];
  let autoResolved = 0;

  for (const bc of blocked) {
    const desc = (bc.description || "").toLowerCase();
    const tableMatch = desc.match(/(?:missing|create|add)\s+(\w+)\s+table/);
    let phantomResolved = false;
    let evidence = "";

    if (tableMatch) {
      const tableName = tableMatch[1].replace(/_/g, "");
      if (dbTables.includes(tableName) || schemaTables.includes(tableName)) {
        phantomResolved = true;
        evidence = "Table '" + tableMatch[1] + "' exists in DB and/or schema — phantom constraint";
      }
    }

    if (phantomResolved) {
      const norm = desc.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      resolved.push({
        description: bc.description,
        normalised: norm,
        evidence,
        resolvedAt: new Date().toISOString(),
      });
      autoResolved++;
      console.log("[ELON pre-flight] Auto-resolved phantom constraint: " + bc.description);
    } else {
      stillBlocked.push(bc);
    }
  }

  if (autoResolved > 0) {
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(stillBlocked, null, 2), "utf-8");
    fs.writeFileSync(RESOLVED_FILE, JSON.stringify(resolved, null, 2), "utf-8");
    console.log("[ELON pre-flight] Auto-resolved " + autoResolved + " phantom constraint(s)");

    if (ctx.blockedConstraints) {
      ctx.blockedConstraints = stillBlocked.map(c => ({
        description: c.description,
        failCount: c.failCount,
      }));
      ctx.resolvedConstraints = resolved.map(c => ({
        description: c.description,
        evidence: c.evidence,
      }));
      ctx.summary = [
        "DB tables that EXIST in PostgreSQL: " + (ctx.dbTables || []).join(", "),
        "Tables defined in shared/schema.ts: " + (ctx.schemaTableNames || []).join(", "),
        "Blocked constraints: " + stillBlocked.length,
        "Resolved constraints (already done — DO NOT redo): " + resolved.length,
      ].join("\n");
      fs.writeFileSync(CONTEXT_FILE, JSON.stringify(ctx, null, 2), "utf-8");
    }
  }
  const resolvedDescriptions = resolved.map(r => (r.normalised || r.description || "").toLowerCase());
  const FLAG_FILE = path.join(DATA_DIR, "elon-skip-reason.txt");

  if (stillBlocked.length === 0 && resolvedDescriptions.length > 0) {
    console.log("[ELON pre-flight] All known constraints are resolved — skipping ELON build mode");
    console.log("[ELON pre-flight] Resolved constraints: " + resolvedDescriptions.length);
    console.log("[ELON pre-flight] ELON build mode would hallucinate phantom constraints — exiting early");
    console.log("[ELON pre-flight] Quality monitoring handled by ELON Monitor (10min cycle in server process)");
    fs.writeFileSync(FLAG_FILE, "SKIP", "utf-8");
  }
} catch (err) {
  console.log("[ELON pre-flight] Constraint resolution step failed (non-fatal): " + err.message);
}
RESOLVE_EOF

# Check if pre-flight flagged ELON to skip (all constraints resolved)
SKIP_FILE=".sneebly/elon-skip-reason.txt"
if [ -f "$SKIP_FILE" ] && grep -q "SKIP" "$SKIP_FILE"; then
  echo "[ELON] All constraints resolved — ELON build mode skipped"
  echo "[ELON] Quality monitoring handled by ELON Monitor (10min cycle in server process)"
  rm -f "$SKIP_FILE"
  exit 0
fi

exec npx sneebly-elon "$@"
