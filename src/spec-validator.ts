import fs from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), ".sneebly", "skills");

interface SkillRule {
  name: string;
  neverPatterns: RegExp[];
  redirects: { from: RegExp; to: string; reason: string }[];
}

let cachedRules: SkillRule[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000;

function loadSkillRules(): SkillRule[] {
  const now = Date.now();
  if (cachedRules && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRules;
  }
  if (!fs.existsSync(SKILLS_DIR)) return [];

  const rules: SkillRule[] = [];
  const skillFiles = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));

  for (const file of skillFiles) {
    const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1] : file.replace(".md", "");

    const neverPatterns: RegExp[] = [];
    const redirects: { from: RegExp; to: string; reason: string }[] = [];

    const neverMatches = content.match(/NEVER\s+(.+)/gi) || [];
    for (const m of neverMatches) {
      const lower = m.toLowerCase();
      if (lower.includes("migration") && lower.includes("sql")) {
        neverPatterns.push(/drizzle\/migrations\/.*\.sql$/i);
        neverPatterns.push(/migrations\/\d+.*\.sql$/i);
      }
      if (lower.includes("split") || (lower.includes("model") && lower.includes("file"))) {
        neverPatterns.push(/shared\/models\/\w+\.ts$/i);
      }
    }

    if (content.includes("shared/schema.ts") && content.includes("single")) {
      redirects.push({
        from: /shared\/models\/\w+\.ts$/i,
        to: "shared/schema.ts",
        reason: "Project uses single shared/schema.ts (not split model files)",
      });
    }

    if (neverPatterns.length > 0 || redirects.length > 0) {
      rules.push({ name, neverPatterns, redirects });
    }
  }

  cachedRules = rules;
  cacheTimestamp = now;
  return rules;
}

export interface ValidationResult {
  valid: boolean;
  action: "allow" | "reject" | "redirect";
  reason?: string;
  correctedSpec?: any;
  violatedSkill?: string;
}

function isMigrationFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    /drizzle\/.*\.sql$/i.test(lower) ||
    /migrations\/.*\.sql$/i.test(lower) ||
    /drizzle\/\d/i.test(lower) ||
    /db\/migrations/i.test(lower) ||
    (lower.endsWith(".sql") && (lower.includes("drizzle") || lower.includes("migration")))
  );
}

function isSplitTypeFile(filePath: string): boolean {
  return /shared\/(types|models|interfaces)\/\w+\.ts$/i.test(filePath);
}

export function validateSpec(spec: any): ValidationResult {
  const rules = loadSkillRules();
  const filePath = spec.filePath || "";

  if (isMigrationFile(filePath)) {
    const corrected = {
      ...spec,
      filePath: "shared/schema.ts",
      action: "modify",
      description: `${spec.description || "Add schema changes"} (auto-corrected from migration file ${filePath}). After modifying schema, run: npx drizzle-kit push`,
      testCommand: "npx drizzle-kit push && echo 'Schema push successful'",
      shellCommands: [{ command: "npx drizzle-kit push", description: "Sync schema to database", required: true }],
      _autoCorrected: true,
      _originalFilePath: filePath,
      _correctionReason: "Migration SQL files must be auto-generated via drizzle-kit, not created manually. Redirected to shared/schema.ts.",
    };
    return {
      valid: false,
      action: "redirect",
      reason: `Migration file "${filePath}" cannot be created directly — redirected to shared/schema.ts + drizzle-kit push`,
      correctedSpec: corrected,
      violatedSkill: "drizzle-migrations",
    };
  }

  if (isSplitTypeFile(filePath)) {
    const corrected = {
      ...spec,
      filePath: "shared/schema.ts",
      action: "modify",
      description: `${spec.description || "Add types"} (auto-corrected from split type file ${filePath}). Types should be inferred from Drizzle schema using $inferSelect/$inferInsert.`,
      _autoCorrected: true,
      _originalFilePath: filePath,
      _correctionReason: "Project uses single shared/schema.ts — not split type files. Types are inferred from Drizzle schema.",
    };
    return {
      valid: false,
      action: "redirect",
      reason: `Split type file "${filePath}" not allowed — redirected to shared/schema.ts`,
      correctedSpec: corrected,
      violatedSkill: "single-schema",
    };
  }

  for (const rule of rules) {
    for (const pattern of rule.neverPatterns) {
      if (pattern.test(filePath)) {
        for (const redirect of rule.redirects) {
          if (redirect.from.test(filePath)) {
            const corrected = { ...spec, filePath: redirect.to };
            if (corrected.testCommand) {
              corrected.testCommand = corrected.testCommand.replace(
                new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
                redirect.to
              );
            }
            return {
              valid: false,
              action: "redirect",
              reason: redirect.reason,
              correctedSpec: corrected,
              violatedSkill: rule.name,
            };
          }
        }

        return {
          valid: false,
          action: "reject",
          reason: `Spec targets "${filePath}" which violates skill "${rule.name}". This file should not be created or modified directly.`,
          violatedSkill: rule.name,
        };
      }
    }

    for (const redirect of rule.redirects) {
      if (redirect.from.test(filePath)) {
        const corrected = { ...spec, filePath: redirect.to };
        if (corrected.testCommand) {
          corrected.testCommand = corrected.testCommand.replace(
            new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
            redirect.to
          );
        }
        return {
          valid: false,
          action: "redirect",
          reason: redirect.reason,
          correctedSpec: corrected,
          violatedSkill: rule.name,
        };
      }
    }
  }

  return { valid: true, action: "allow" };
}

export function setupSpecWatcher(): void {
  const queueDirs = [
    path.join(process.cwd(), ".sneebly", "queue", "pending"),
    path.join(process.cwd(), ".sneebly", "queue", "approved"),
  ];

  for (const dir of queueDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      fs.watch(dir, (eventType, filename) => {
        if (!filename || !filename.endsWith(".json")) return;
        const specPath = path.join(dir, filename);

        setTimeout(() => {
          if (!fs.existsSync(specPath)) return;
          try {
            const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
            const result = validateSpec(spec);

            if (result.action === "reject") {
              console.log(`[SpecValidator] Rejected spec ${filename}: ${result.reason}`);
              const rejectedDir = path.join(process.cwd(), ".sneebly", "rejected");
              if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });

              const rejectedSpec = {
                ...spec,
                _rejectedReason: result.reason,
                _violatedSkill: result.violatedSkill,
                _rejectedAt: new Date().toISOString(),
              };
              fs.writeFileSync(
                path.join(rejectedDir, filename),
                JSON.stringify(rejectedSpec, null, 2)
              );
              fs.unlinkSync(specPath);
            } else if (result.action === "redirect" && result.correctedSpec) {
              console.log(`[SpecValidator] Auto-corrected spec ${filename}: ${result.reason}`);
              const corrected = {
                ...result.correctedSpec,
                _autoCorrected: true,
                _originalFilePath: spec.filePath,
                _correctionReason: result.reason,
              };
              fs.writeFileSync(specPath, JSON.stringify(corrected, null, 2));
            }
          } catch {}
        }, 500);
      });
      console.log(`[SpecValidator] Watching ${dir} for spec validation`);
    } catch {}
  }
}
