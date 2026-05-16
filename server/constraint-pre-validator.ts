import fs from "fs";
import path from "path";
import { callClaude } from "./utils";
import { getGroundTruth, type GroundTruth } from "./ground-truth-builder";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const RESOLVED_CONSTRAINTS_FILE = path.join(DATA_DIR, "resolved-constraints.json");

export interface ResolvedConstraint {
  description: string;
  normalised: string;
  evidence: string;
  resolvedAt: string;
  specId?: string;
}

export interface PreValidationResult {
  resolved: boolean;
  evidence: string;
  method: "ground-truth-match" | "sonnet-check" | "not-resolved";
}

function normaliseConstraint(desc: string): string {
  return desc.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function loadResolved(): ResolvedConstraint[] {
  try {
    if (fs.existsSync(RESOLVED_CONSTRAINTS_FILE)) {
      return JSON.parse(fs.readFileSync(RESOLVED_CONSTRAINTS_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function saveResolved(list: ResolvedConstraint[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RESOLVED_CONSTRAINTS_FILE, JSON.stringify(list, null, 2));
  } catch {}
}

export function isConstraintResolved(constraintDesc: string): { resolved: boolean; evidence: string } {
  const norm = normaliseConstraint(constraintDesc);
  if (!norm) return { resolved: false, evidence: "" };

  const resolved = loadResolved();
  for (const r of resolved) {
    const rNorm = r.normalised || normaliseConstraint(r.description);
    if (
      rNorm === norm ||
      norm.includes(rNorm) ||
      rNorm.includes(norm) ||
      levenshteinSimilarity(rNorm, norm) > 0.8
    ) {
      return { resolved: true, evidence: r.evidence };
    }
  }
  return { resolved: false, evidence: "" };
}

function levenshteinSimilarity(a: string, b: string): number {
  const aW = a.split(" ");
  const bW = b.split(" ");
  const common = aW.filter(w => bW.includes(w)).length;
  return (2 * common) / (aW.length + bW.length);
}

function groundTruthFastCheck(constraint: string, gt: GroundTruth): { resolved: boolean; evidence: string } {
  const norm = normaliseConstraint(constraint);

  const TABLE_PATTERNS = [
    /(?:missing|create|add)\s+(\w+)\s+table/i,
    /(\w+)\s+table\s+(?:schema|missing|not\s+exist|absent)/i,
    /drizzle\s+schema\s+for\s+(\w+)\s+table/i,
    /(\w+)\s+table\s+schema\s+(?:in|from)/i,
  ];

  for (const pat of TABLE_PATTERNS) {
    const m = constraint.match(pat);
    if (m) {
      const tableName = m[1].toLowerCase().replace(/_/g, "").trim();
      const dbMatch = gt.dbTables.find(t => t.toLowerCase().replace(/_/g, "") === tableName);
      const schemaMatch = gt.schemaTableNames.find(t => t.toLowerCase().replace(/_/g, "") === tableName);

      if (dbMatch && schemaMatch) {
        return {
          resolved: true,
          evidence: `Table "${dbMatch}" exists in PostgreSQL (DB) and in shared/schema.ts — constraint is already satisfied`,
        };
      }
      if (dbMatch) {
        return {
          resolved: true,
          evidence: `Table "${dbMatch}" exists in PostgreSQL — it has been created. Drizzle schema may need a push, but the constraint is functionally resolved`,
        };
      }
    }
  }

  const FILE_PATTERNS = [
    /(?:missing|create|add)\s+([a-z0-9\/.\-_]+\.[a-z]+)/i,
    /([a-z0-9\/.\-_]+\.[a-z]+)\s+(?:not\s+exist|missing|absent)/i,
  ];

  for (const pat of FILE_PATTERNS) {
    const m = constraint.match(pat);
    if (m) {
      const relPath = m[1];
      const fileInfo = gt.keyFiles[relPath];
      if (fileInfo?.exists && fileInfo.lines > 5) {
        return {
          resolved: true,
          evidence: `File "${relPath}" already exists (${fileInfo.lines} lines) — constraint is already satisfied`,
        };
      }
    }
  }

  return { resolved: false, evidence: "" };
}

export async function validateConstraint(
  spec: any,
  options: { useSonnet?: boolean } = { useSonnet: true }
): Promise<PreValidationResult> {
  const constraint: string = spec.constraint || spec.elonConstraint || spec.description || "";
  if (!constraint) return { resolved: false, evidence: "", method: "not-resolved" };

  const alreadyResolved = isConstraintResolved(constraint);
  if (alreadyResolved.resolved) {
    return { resolved: true, evidence: alreadyResolved.evidence, method: "ground-truth-match" };
  }

  const gt = getGroundTruth();
  if (gt) {
    const fastCheck = groundTruthFastCheck(constraint, gt);
    if (fastCheck.resolved) {
      markConstraintResolved(constraint, fastCheck.evidence, spec.id);
      return { resolved: true, evidence: fastCheck.evidence, method: "ground-truth-match" };
    }
  }

  if (!options.useSonnet || !gt) {
    return { resolved: false, evidence: "", method: "not-resolved" };
  }

  try {
    // Hard caps to keep prompt under ~1500 tokens (Sonnet context is cheap but small prompts = faster + cheaper)
    const constraintTrunc = constraint.slice(0, 300);
    const dbTablesStr = gt.dbTables.slice(0, 30).join(", ") || "none";
    const schemaTablesStr = gt.schemaTableNames.slice(0, 30).join(", ") || "none";
    const keyFilesStr = Object.entries(gt.keyFiles)
      .filter(([, v]) => v.exists)
      .slice(0, 15)
      .map(([k, v]) => `  - ${k}: ${v.lines} lines`)
      .join("\n");
    const blockedStr = (gt.blockedConstraints || [])
      .slice(0, 5)
      .map(c => `  - "${(c.description || "").slice(0, 80)}"`)
      .join("\n") || "none";
    const resolvedStr = (gt.resolvedConstraints || [])
      .slice(0, 5)
      .map(c => `  - "${(c.description || "").slice(0, 80)}": ${(c.evidence || "").slice(0, 120)}`)
      .join("\n") || "none";

    const prompt = `You are a codebase fact-checker. A spec says there is a problem, but verified ground truth data may show it's already solved.

## Spec Constraint (what ELON thinks is missing/broken)
"${constraintTrunc}"

## Verified Ground Truth (what ACTUALLY exists right now)
**PostgreSQL tables in the database:** ${dbTablesStr}
**Tables defined in shared/schema.ts:** ${schemaTablesStr}
**Key files existence:**
${keyFilesStr}

**Already blocked constraints (repeated failures):**
${blockedStr}

**Already resolved constraints:**
${resolvedStr}

## Question
Is the constraint ALREADY RESOLVED based on the ground truth above? A constraint is resolved if the thing it claims is missing actually exists in the database or codebase.

Respond ONLY with valid JSON:
{"resolved": true/false, "evidence": "one sentence explaining why it is or isn't already satisfied"}`;

    const result = await callClaude(prompt, {
      model: "claude-sonnet-4-6",
      maxTokens: 256,
      effort: "low",
      agent: "constraint-pre-validator",
      task: "validate-constraint",
      feature: "constraint-validation",
      context: constraint.slice(0, 80),
    });

    const parsed = (() => {
      try { return JSON.parse(result.text.trim()); } catch {}
      const m = result.text.match(/\{[^}]+\}/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      return null;
    })();

    if (parsed?.resolved === true && parsed.evidence) {
      markConstraintResolved(constraint, parsed.evidence, spec.id);
      return { resolved: true, evidence: parsed.evidence, method: "sonnet-check" };
    }
  } catch (err: any) {
    console.log(`[ConstraintValidator] Sonnet check failed: ${err.message}`);
  }

  return { resolved: false, evidence: "", method: "not-resolved" };
}

export function markConstraintResolved(description: string, evidence: string, specId?: string): void {
  const list = loadResolved();
  const norm = normaliseConstraint(description);

  const existing = list.find(r => {
    const rNorm = r.normalised || normaliseConstraint(r.description || "");
    return rNorm === norm || norm.includes(rNorm) || rNorm.includes(norm) || levenshteinSimilarity(rNorm, norm) > 0.8;
  });
  if (!existing) {
    list.push({ description, normalised: norm, evidence, resolvedAt: new Date().toISOString(), specId });
    saveResolved(list);
    console.log(`[ConstraintValidator] Marked as RESOLVED: "${description.slice(0, 100)}"`);
    console.log(`[ConstraintValidator] Evidence: ${evidence}`);
  }
}

export function getResolvedConstraints(): ResolvedConstraint[] {
  return loadResolved();
}
