import fs from "fs";
import path from "path";
import { addHumanTestAlert } from "./sneebly-hooks";
import { detectNeed } from "./needs-detector";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const BLOCKED_DIR = path.join(DATA_DIR, "blocked");
const SKILLS_DIR = path.join(DATA_DIR, "skills");

interface BlockerAlert {
  id: string;
  specId: string;
  specFile: string;
  targetFile: string;
  description: string;
  reason: string;
  attempts: number;
  userInstructions: string[];
  suggestedSkill: string | null;
  createdAt: string;
  status: "active" | "resolved" | "dismissed";
}

const BLOCKERS_FILE = path.join(DATA_DIR, "blockers.json");

function loadBlockers(): BlockerAlert[] {
  try {
    if (!fs.existsSync(BLOCKERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(BLOCKERS_FILE, "utf-8")).blockers || [];
  } catch {
    return [];
  }
}

function saveBlockers(blockers: BlockerAlert[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    BLOCKERS_FILE,
    JSON.stringify(
      { blockers, lastUpdated: new Date().toISOString() },
      null,
      2
    ),
    "utf-8"
  );
}

interface SkillMatch {
  name: string;
  relevance: number;
  instructions: string[];
}

function findRelevantSkill(spec: any, reason: string): SkillMatch | null {
  if (!fs.existsSync(SKILLS_DIR)) return null;

  const skillFiles = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"));

  const specStr = JSON.stringify(spec).toLowerCase() + " " + reason.toLowerCase();

  let bestMatch: SkillMatch | null = null;
  let bestScore = 0;

  for (const file of skillFiles) {
    const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");

    const keywordsMatch = content.match(/^keywords:\s*(.+)$/m);
    const keywords = keywordsMatch
      ? keywordsMatch[1].split(",").map((k) => k.trim().toLowerCase())
      : [];

    let score = 0;
    for (const kw of keywords) {
      if (specStr.includes(kw)) score += 2;
    }

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : file.replace(".md", "");

    if (score > bestScore) {
      bestScore = score;

      const instructionsMatch = content.match(
        /## User Instructions\n([\s\S]*?)(?=\n## |$)/
      );
      const instructions = instructionsMatch
        ? instructionsMatch[1]
            .split("\n")
            .filter((l) => l.trim().startsWith("- ") || l.trim().match(/^\d+\./))
            .map((l) => l.trim().replace(/^[-\d.]+\s*/, ""))
        : [];

      bestMatch = { name: title, relevance: score, instructions };
    }
  }

  return bestMatch && bestScore >= 2 ? bestMatch : null;
}

function analyzeFailurePattern(
  spec: any,
  reason: string,
  failureHistory: any[]
): {
  category: string;
  userInstructions: string[];
  suggestedSkill: string | null;
} {
  const reasonLower = reason.toLowerCase();
  const specStr = JSON.stringify(spec).toLowerCase();

  const skill = findRelevantSkill(spec, reason);

  if (
    specStr.includes("migration") ||
    specStr.includes("drizzle") ||
    reasonLower.includes("migration")
  ) {
    return {
      category: "database-migration",
      userInstructions: skill?.instructions.length
        ? skill.instructions
        : [
            "Sneebly tried to create a database migration file directly, but migrations must be auto-generated",
            "Open the Replit Agent chat and ask: 'Add a users table to shared/schema.ts with these fields: id, clerk_id, email, name, avatar_url, role, is_active, created_at, updated_at'",
            "After the schema is updated, ask: 'Run npm run db:push to apply the database changes'",
            "Once complete, go to the Command Center and mark this blocker as resolved",
          ],
      suggestedSkill: skill?.name || "drizzle-migrations",
    };
  }

  if (
    specStr.includes("schema") ||
    specStr.includes("pgTable") ||
    specStr.includes("database")
  ) {
    return {
      category: "database-schema",
      userInstructions: skill?.instructions.length
        ? skill.instructions
        : [
            "Sneebly needs a database table created but can't run the database tools itself",
            "Open the Replit Agent chat and ask it to modify shared/schema.ts to add the required table",
            "Then ask the agent to run 'npm run db:push' to apply the changes",
            "Once the table exists, mark this blocker as resolved and Sneebly can continue",
          ],
      suggestedSkill: skill?.name || "drizzle-schema",
    };
  }

  if (
    reasonLower.includes("permission") ||
    reasonLower.includes("blocked") ||
    specStr.includes("blockedcategory")
  ) {
    return {
      category: "permissions",
      userInstructions: [
        "This spec was blocked by Sneebly's safety system (file permissions or category restrictions)",
        "Check the Command Center auto-approval settings to see if this category needs to be enabled",
        "If the category is already enabled, the specific file path may be protected — review the spec details below",
      ],
      suggestedSkill: null,
    };
  }

  if (
    reasonLower.includes("syntax") ||
    reasonLower.includes("parse") ||
    reasonLower.includes("import")
  ) {
    return {
      category: "code-syntax",
      userInstructions: [
        "Sneebly's code changes kept causing syntax errors or import issues",
        `The target file is: ${spec.filePath || "unknown"}`,
        "Open the Replit Agent chat and describe what you want changed in that file",
        "The agent can make the change more reliably since it has full IDE access",
      ],
      suggestedSkill: null,
    };
  }

  if (
    reasonLower.includes("test") ||
    reasonLower.includes("grep") ||
    reasonLower.includes("criteria")
  ) {
    const testCmd = spec.testCommand || "unknown";
    return {
      category: "test-failure",
      userInstructions: [
        "Sneebly made changes but they didn't pass the verification check",
        `Test command that keeps failing: ${testCmd}`,
        `Target file: ${spec.filePath || "unknown"}`,
        "The spec may be misconfigured — it might be targeting the wrong file or using incorrect test criteria",
        "You can ask Replit Agent to implement the feature described in this spec directly",
      ],
      suggestedSkill: null,
    };
  }

  return {
    category: "unknown",
    userInstructions: [
      `Sneebly got stuck trying to: ${spec.description || spec.constraint || "complete a task"}`,
      `Target file: ${spec.filePath || "unknown"}`,
      `Failure reason: ${reason}`,
      "You can ask Replit Agent to implement this feature directly",
      "Once done, mark this blocker as resolved in the Command Center",
    ],
    suggestedSkill: skill?.name || null,
  };
}

function normalizeBlockerKey(spec: any, reason: string): string {
  const specStr = (JSON.stringify(spec) + " " + reason).toLowerCase();
  const targetFile = (spec.filePath || "unknown").toLowerCase();

  const tableMatch = specStr.match(/(?:table|pgTable|model)\s*[:('"]\s*(\w+)/i);
  const tableName = tableMatch ? tableMatch[1].toLowerCase() : null;

  if (tableName) return `table:${tableName}`;

  if (specStr.includes("migration") || specStr.includes("drizzle-kit") || specStr.includes("db:push"))
    return `migration:${targetFile}`;

  if (specStr.includes("schema") && targetFile.includes("schema"))
    return `schema:${targetFile}`;

  return `file:${targetFile}:${(spec.description || "").slice(0, 60).toLowerCase().replace(/\s+/g, "-")}`;
}

export function onSpecBlocked(
  loopResult: any,
  spec: any
): BlockerAlert | null {
  const blockers = loadBlockers();

  const existing = blockers.find(
    (b) => b.specId === (spec.id || "") && b.status === "active"
  );
  if (existing) {
    existing.attempts = (existing.attempts || 0) + (loopResult.iterations || 0);
    saveBlockers(blockers);
    return existing;
  }

  const dedupKey = normalizeBlockerKey(spec, loopResult.reason || "unknown");
  const duplicate = blockers.find(
    (b) => b.status === "active" && normalizeBlockerKey(
      { filePath: b.targetFile, description: b.description, id: b.specId },
      b.reason
    ) === dedupKey
  );
  if (duplicate) {
    duplicate.attempts = (duplicate.attempts || 0) + (loopResult.iterations || 0);
    duplicate.description = duplicate.description.length > (spec.description || "").length
      ? duplicate.description
      : (spec.description || spec.constraint || duplicate.description);
    saveBlockers(blockers);
    return duplicate;
  }

  const analysis = analyzeFailurePattern(
    spec,
    loopResult.reason || "unknown",
    loopResult.failureHistory || []
  );

  const blocker: BlockerAlert = {
    id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    specId: spec.id || `unknown-${Date.now()}`,
    specFile: loopResult.specPath || "unknown",
    targetFile: spec.filePath || "unknown",
    description:
      spec.description || spec.constraint || "Unknown spec objective",
    reason: loopResult.reason || "unknown",
    attempts: loopResult.iterations || 0,
    userInstructions: analysis.userInstructions,
    suggestedSkill: analysis.suggestedSkill,
    createdAt: new Date().toISOString(),
    status: "active",
  };

  const targetFile = (spec.filePath || "").toLowerCase();
  const isWrongPath = targetFile.includes("/types/") ||
    targetFile.includes("/models/") ||
    targetFile.includes("/interfaces/") ||
    targetFile.match(/drizzle\/.*migration/i) !== null ||
    targetFile.match(/drizzle\/\d/i) !== null ||
    targetFile.match(/db\/migrations/i) !== null ||
    targetFile.match(/migrations\/\d/i) !== null ||
    (targetFile.endsWith(".sql") && (targetFile.includes("drizzle") || targetFile.includes("migration"))) ||
    targetFile === "server/db.ts" ||
    targetFile === "server/index.ts" ||
    (targetFile.includes("schema-") && !targetFile.endsWith("schema.ts"));

  if (isWrongPath) {
    try {
      const schemaContent = fs.readFileSync(path.join(process.cwd(), "shared", "schema.ts"), "utf-8").toLowerCase();
      const specStr = JSON.stringify(spec).toLowerCase();
      const descLower = (spec.description || spec.constraint || "").toLowerCase();

      const tableNames: string[] = [];
      const patterns = [
        /(?:table|schema|type|model|pgTable)\s*[:('"]\s*(\w+)/gi,
        /(?:create|add|insert)\s+(?:a\s+)?(\w+)\s+table/gi,
        /(\w+)\s+table/gi,
      ];
      for (const pattern of patterns) {
        let m;
        while ((m = pattern.exec(descLower + " " + specStr)) !== null) {
          if (m[1] && m[1].length >= 3 && !["the", "new", "sql", "run", "for", "and", "this"].includes(m[1])) {
            tableNames.push(m[1]);
          }
        }
      }
      if (spec.tableName) tableNames.push(spec.tableName.toLowerCase());

      const fileName = path.basename(targetFile, path.extname(targetFile)).replace(/^(\d+_)?(create_|add_|update_)?/, "");
      if (fileName.length >= 3) tableNames.push(fileName);

      const workExists = tableNames.some(name =>
        schemaContent.includes(`"${name}"`) ||
        schemaContent.includes(`export const ${name}`)
      );

      if (workExists || analysis.category === "database-migration") {
        blocker.status = "resolved";
        blockers.unshift(blocker);
        if (blockers.length > 50) blockers.length = 50;
        saveBlockers(blockers);
        console.log(`[SpecMonitor] Auto-resolved wrong-path blocker: ${spec.filePath} (wrong path convention, work exists in shared/schema.ts)`);
        return blocker;
      }
    } catch {}
  }

  blockers.unshift(blocker);
  if (blockers.length > 50) blockers.length = 50;
  saveBlockers(blockers);

  if (!isWrongPath) {
    addHumanTestAlert({
      feature: `BLOCKED: ${spec.filePath || spec.id || "Unknown"}`,
      description: `Sneebly stopped after ${blocker.attempts} failed attempts. ${analysis.userInstructions[0]}`,
      severity: "critical",
      category: analysis.category,
      specId: spec.id,
    });
  }

  detectNeed(spec, loopResult.reason || "unknown", loopResult.specPath || "unknown");

  return blocker;
}

export function getBlockers(
  statusFilter?: string
): BlockerAlert[] {
  const blockers = loadBlockers();
  if (statusFilter) {
    return blockers.filter((b) => b.status === statusFilter);
  }
  return blockers;
}

export function updateBlocker(
  id: string,
  update: Partial<Pick<BlockerAlert, "status">>
): BlockerAlert | null {
  const blockers = loadBlockers();
  const blocker = blockers.find((b) => b.id === id);
  if (!blocker) return null;

  if (update.status) blocker.status = update.status;
  saveBlockers(blockers);
  return blocker;
}

export function getActiveBlockerCount(): number {
  return loadBlockers().filter((b) => b.status === "active").length;
}
