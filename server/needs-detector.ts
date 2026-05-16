import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const NEEDS_FILE = path.join(DATA_DIR, "needs.json");
const SKILLS_DIR = path.join(DATA_DIR, "skills");

export type NeedType =
  | "database-table"
  | "database-push"
  | "package-install"
  | "secret-setup"
  | "file-creation"
  | "schema-change"
  | "api-route"
  | "platform-action"
  | "unknown";

export interface SneeblyNeed {
  id: string;
  type: NeedType;
  title: string;
  description: string;
  replitPrompt: string;
  context: string;
  sourceSpec: string;
  sourceFile: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "fulfilled" | "dismissed";
  createdAt: string;
  fulfilledAt?: string;
}

interface NeedPattern {
  type: NeedType;
  keywords: RegExp;
  priority: "critical" | "high" | "medium" | "low";
  detect: (spec: any, reason: string) => DetectedNeed | null;
}

interface DetectedNeed {
  title: string;
  description: string;
  context: string;
}

function loadNeeds(): SneeblyNeed[] {
  try {
    if (!fs.existsSync(NEEDS_FILE)) return [];
    return JSON.parse(fs.readFileSync(NEEDS_FILE, "utf-8")).needs || [];
  } catch {
    return [];
  }
}

function saveNeeds(needs: SneeblyNeed[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    NEEDS_FILE,
    JSON.stringify({ needs, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
  writeNeedsAttention(needs);
}

function writeNeedsAttention(needs: SneeblyNeed[]): void {
  const activeNeeds = needs.filter(n => n.status === 'pending');
  const filePath = 'NEEDS-ATTENTION.md';

  if (activeNeeds.length === 0) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }

  const lines = [
    '# Sneebly Needs Your Help',
    '',
    `_Last updated: ${new Date().toISOString()}_`,
    '',
  ];

  for (const need of activeNeeds) {
    lines.push(`## ${need.type}`);
    lines.push(`- ${need.description}`);
    if (need.replitPrompt) lines.push(`- **Replit prompt:** ${need.replitPrompt}`);
    lines.push('');
  }

  fs.writeFileSync(filePath, lines.join('\n'));
}

function getProjectConventions(): string {
  const convPath = path.join(SKILLS_DIR, "project-conventions.md");
  if (!fs.existsSync(convPath)) return "";
  try {
    return fs.readFileSync(convPath, "utf-8");
  } catch {
    return "";
  }
}

function extractTableDetails(spec: any, reason: string): { tableName: string; fields: string[] } {
  const specStr = JSON.stringify(spec) + " " + reason;

  const tableMatch = specStr.match(/(?:table|pgTable|model)\s*[:('"]\s*(\w+)/i);
  const tableName = tableMatch ? tableMatch[1] : "new_table";

  const fieldMatches = specStr.match(/(?:column|field|property)\s*[:('"]\s*(\w+)/gi) || [];
  const fields = fieldMatches
    .map((m) => m.replace(/^(?:column|field|property)\s*[:('"]\s*/i, "").trim())
    .filter(Boolean);

  if (fields.length === 0) {
    const commonFields = specStr.match(/\b(id|name|email|title|description|status|type|url|avatar|bio|role|content|slug|userId|createdAt|updatedAt)\b/gi);
    if (commonFields) {
      const unique = Array.from(new Set(commonFields.map((f) => f.toLowerCase())));
      fields.push(...unique);
    }
  }

  return { tableName, fields };
}

function extractPackageNames(spec: any, reason: string): string[] {
  const specStr = JSON.stringify(spec) + " " + reason;
  const npmMatches = specStr.match(/(?:npm install|require|import)\s+['"]?([a-z@][\w\-/.]*)/gi) || [];
  const packages = npmMatches
    .map((m) => m.replace(/^(?:npm install|require|import)\s+['"]?/i, "").trim())
    .filter((p) => !p.startsWith(".") && !p.startsWith("@/"));
  return Array.from(new Set(packages));
}

function extractSecretNames(spec: any, reason: string): string[] {
  const specStr = JSON.stringify(spec) + " " + reason;
  const envMatches = specStr.match(/(?:process\.env\.|env\.|API_KEY|SECRET|TOKEN)\w*/gi) || [];
  return Array.from(new Set(envMatches.map((m) => m.replace(/^process\.env\./, "").replace(/^env\./, ""))));
}

const NEED_PATTERNS: NeedPattern[] = [
  {
    type: "database-table",
    keywords: /pgTable|create.*table|add.*table|schema.*table|new.*model|shared\/models/i,
    priority: "critical",
    detect(spec, reason) {
      const { tableName, fields } = extractTableDetails(spec, reason);
      return {
        title: `Create "${tableName}" database table`,
        description: `Sneebly needs a new database table "${tableName}" to continue building this feature.`,
        context: fields.length > 0 ? `Detected fields: ${fields.join(", ")}` : "Check the spec description for required fields.",
      };
    },
  },
  {
    type: "schema-change",
    keywords: /alter.*table|add.*column|modify.*schema|change.*field|shared\/schema/i,
    priority: "high",
    detect(spec, reason) {
      const target = spec.filePath || "shared/schema.ts";
      return {
        title: `Modify database schema`,
        description: `Sneebly needs changes to the database schema in ${target}.`,
        context: spec.description || spec.constraint || reason,
      };
    },
  },
  {
    type: "database-push",
    keywords: /db:push|drizzle-kit push|apply.*schema|migrate.*database/i,
    priority: "high",
    detect(_spec, _reason) {
      return {
        title: "Push database schema changes",
        description: "Schema has been updated but changes haven't been applied to the database yet.",
        context: "Run the Drizzle push command to sync the database with the schema.",
      };
    },
  },
  {
    type: "package-install",
    keywords: /npm install|require.*module|cannot find module|module not found|package.*missing/i,
    priority: "high",
    detect(spec, reason) {
      const packages = extractPackageNames(spec, reason);
      return {
        title: packages.length > 0 ? `Install packages: ${packages.join(", ")}` : "Install missing npm packages",
        description: "Sneebly's code changes need npm packages that aren't installed yet.",
        context: packages.length > 0 ? `Required packages: ${packages.join(", ")}` : reason,
      };
    },
  },
  {
    type: "secret-setup",
    keywords: /API_KEY|SECRET|TOKEN|env.*variable|process\.env|credentials|oauth|stripe|twilio/i,
    priority: "critical",
    detect(spec, reason) {
      const secrets = extractSecretNames(spec, reason);
      return {
        title: secrets.length > 0 ? `Set up secrets: ${secrets.join(", ")}` : "Configure API keys/secrets",
        description: "Sneebly needs API keys or secrets configured in the Replit environment.",
        context: secrets.length > 0 ? `Required secrets: ${secrets.join(", ")}` : reason,
      };
    },
  },
  {
    type: "file-creation",
    keywords: /shared\/models\/|create.*file|new.*file|mkdir|directory.*missing/i,
    priority: "medium",
    detect(spec, _reason) {
      const targetFile = spec.filePath || "unknown";
      return {
        title: `Create file: ${targetFile}`,
        description: `Sneebly tried to create or modify a file but was blocked.`,
        context: `Target: ${targetFile}. This may need to be created following project conventions.`,
      };
    },
  },
  {
    type: "api-route",
    keywords: /add.*route|new.*endpoint|api.*route|express.*router/i,
    priority: "medium",
    detect(spec, _reason) {
      return {
        title: "Add API routes",
        description: "Sneebly needs new API endpoints added to the server.",
        context: spec.description || spec.constraint || "New routes needed in server/routes.ts",
      };
    },
  },
];

function generateReplitPrompt(need: DetectedNeed, type: NeedType, spec: any, reason: string): string {
  const conventions = getProjectConventions();
  const useSingleSchema = conventions.includes("single") && conventions.includes("schema.ts");

  switch (type) {
    case "database-table": {
      const { tableName, fields } = extractTableDetails(spec, reason);
      const fieldList = fields.length > 0
        ? fields.map((f) => {
            if (f === "id") return "id (UUID, primary key, auto-generated)";
            if (f === "userid" || f === "userId") return "userId (text, references Clerk user ID)";
            if (f.includes("created") || f.includes("At")) return `${f} (timestamp, default now)`;
            if (f.includes("email")) return `${f} (text)`;
            if (f.includes("url") || f.includes("image") || f.includes("avatar")) return `${f} (text, nullable)`;
            if (f.includes("active") || f.includes("enabled")) return `${f} (boolean, default true)`;
            return `${f} (text)`;
          }).join(", ")
        : "id (UUID), plus whatever fields the feature needs";

      let prompt = `Add a "${tableName}" table to shared/schema.ts with these columns: ${fieldList}.`;
      if (useSingleSchema) {
        prompt += ` Important: add it to the existing shared/schema.ts file (do NOT create separate model files).`;
      }
      prompt += ` Also create the insert schema using createInsertSchema from drizzle-zod, and export the types. Then add CRUD methods to the IStorage interface and DatabaseStorage class in server/storage.ts. Finally, run npm run db:push to apply the changes.`;
      return prompt;
    }

    case "schema-change": {
      let prompt = `Modify the database schema in shared/schema.ts: ${spec.description || spec.constraint || reason}.`;
      prompt += ` After making the changes, run npm run db:push to apply them to the database.`;
      return prompt;
    }

    case "database-push": {
      return `Run npm run db:push to apply the latest schema changes from shared/schema.ts to the PostgreSQL database. If there are errors, fix them in shared/schema.ts first.`;
    }

    case "package-install": {
      const packages = extractPackageNames(spec, reason);
      if (packages.length > 0) {
        return `Install these npm packages: ${packages.join(", ")}. Run: npm install ${packages.join(" ")}`;
      }
      return `Install the missing npm packages that the project needs. Check the error messages for which packages are missing and install them.`;
    }

    case "secret-setup": {
      const secrets = extractSecretNames(spec, reason);
      if (secrets.length > 0) {
        return `Set up these environment secrets in Replit: ${secrets.join(", ")}. Go to the Secrets tab in Replit and add each key with its value. These are needed for ${spec.description || "the feature to work"}.`;
      }
      return `Set up the required API keys and secrets in the Replit Secrets tab. Check the feature description for which services need credentials.`;
    }

    case "file-creation": {
      const target = spec.filePath || "unknown";
      if (target.includes("shared/models/")) {
        const tableName = path.basename(target, ".ts");
        return `Sneebly tried to create ${target}, but this project uses a single shared/schema.ts file instead of split model files. Please add the "${tableName}" table definition to shared/schema.ts instead. Include the pgTable definition, insert schema, and types. Then add CRUD methods to server/storage.ts and run npm run db:push.`;
      }
      return `Create the file ${target} with the functionality described: ${spec.description || spec.constraint || reason}. Follow the existing project conventions.`;
    }

    case "api-route": {
      let prompt = `Add new API routes to server/routes.ts for: ${spec.description || spec.constraint || reason}.`;
      prompt += ` Follow the existing pattern: routes under /api/ prefix, require Clerk auth with requireAuth(), use getAuth(req) for userId, validate with Zod schemas, and use the storage interface for database operations.`;
      return prompt;
    }

    default: {
      return `Sneebly needs help with: ${spec.description || spec.constraint || reason}. The target file is: ${spec.filePath || "unknown"}. Please implement this following the project's existing conventions.`;
    }
  }
}

function normalizeNeedKey(spec: any, reason: string): string {
  const specStr = (JSON.stringify(spec) + " " + reason).toLowerCase();
  const tableMatch = specStr.match(/(?:table|pgTable|model)\s*[:('"]\s*(\w+)/i);
  if (tableMatch) return `table:${tableMatch[1].toLowerCase()}`;
  const targetFile = (spec.filePath || "unknown").toLowerCase();
  if (specStr.includes("migration") || specStr.includes("db:push")) return `migration:${targetFile}`;
  if (specStr.includes("schema")) return `schema:${targetFile}`;
  return `file:${targetFile}`;
}

export function detectNeed(spec: any, reason: string, sourceFile: string): SneeblyNeed | null {
  const specStr = (JSON.stringify(spec) + " " + reason).toLowerCase();

  const needs = loadNeeds();
  const existingPending = needs.find(
    (n) => n.sourceSpec === (spec.id || "") && n.status === "pending"
  );
  if (existingPending) return existingPending;

  const dedupKey = normalizeNeedKey(spec, reason);
  const duplicate = needs.find(
    (n) => n.status === "pending" && normalizeNeedKey(
      { filePath: n.sourceFile, description: n.description, id: n.sourceSpec },
      n.description
    ) === dedupKey
  );
  if (duplicate) return duplicate;

  let matchedPattern: NeedPattern | null = null;
  for (const pattern of NEED_PATTERNS) {
    if (pattern.keywords.test(specStr)) {
      matchedPattern = pattern;
      break;
    }
  }

  if (!matchedPattern) {
    matchedPattern = {
      type: "unknown",
      keywords: /./,
      priority: "medium",
      detect(spec, reason) {
        return {
          title: spec.description || spec.constraint || "Help needed",
          description: reason || "Sneebly got stuck and needs assistance.",
          context: `Target: ${spec.filePath || "unknown"}`,
        };
      },
    };
  }

  const detected = matchedPattern.detect(spec, reason);
  if (!detected) return null;

  const replitPrompt = generateReplitPrompt(detected, matchedPattern.type, spec, reason);

  const need: SneeblyNeed = {
    id: `need-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type: matchedPattern.type,
    title: detected.title,
    description: detected.description,
    replitPrompt,
    context: detected.context,
    sourceSpec: spec.id || `unknown-${Date.now()}`,
    sourceFile,
    priority: matchedPattern.priority,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  needs.unshift(need);
  if (needs.length > 100) needs.length = 100;
  saveNeeds(needs);

  return need;
}

export function getNeeds(statusFilter?: string): SneeblyNeed[] {
  const needs = loadNeeds();
  if (statusFilter) {
    return needs.filter((n) => n.status === statusFilter);
  }
  return needs;
}

export function updateNeed(
  id: string,
  update: Partial<Pick<SneeblyNeed, "status">>
): SneeblyNeed | null {
  const needs = loadNeeds();
  const need = needs.find((n) => n.id === id);
  if (!need) return null;

  if (update.status) {
    need.status = update.status;
    if (update.status === "fulfilled") {
      need.fulfilledAt = new Date().toISOString();
    }
  }
  saveNeeds(needs);
  return need;
}

export function getPendingNeedCount(): number {
  return loadNeeds().filter((n) => n.status === "pending").length;
}
