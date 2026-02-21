import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const SKILLS_DIR = path.join(DATA_DIR, "skills");
const SKILLS_REGISTRY = path.join(DATA_DIR, "skills-registry.json");
const QUEUE_DIR = path.join(DATA_DIR, "queue", "pending");

export interface SkillPackage {
  name: string;
  version: string;
  author: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  guidance: string;
  specs: SkillSpec[];
}

export interface SkillSpec {
  filePath: string;
  description: string;
  action: "create" | "change" | "verify";
  successCriteria: string[];
  testCommand?: string;
  relatedFiles?: string[];
}

export interface InstalledSkill {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  guidanceFile: string;
  specsQueued: number;
  vetResult: VetResult | null;
  status: "pending-review" | "vetting" | "approved" | "installed" | "rejected" | "failed";
  rawContent: string;
  installedAt?: string;
  createdAt: string;
}

export interface VetResult {
  safe: boolean;
  riskScore: number;
  summary: string;
  concerns: string[];
  recommendations: string[];
  reviewedAt: string;
  model: string;
}

function loadRegistry(): InstalledSkill[] {
  try {
    if (!fs.existsSync(SKILLS_REGISTRY)) return [];
    return JSON.parse(fs.readFileSync(SKILLS_REGISTRY, "utf-8")).skills || [];
  } catch {
    return [];
  }
}

function saveRegistry(skills: InstalledSkill[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    SKILLS_REGISTRY,
    JSON.stringify({ skills, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

export function parseSkillPackage(content: string): SkillPackage | null {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    if (content.trim().startsWith("{")) {
      return JSON.parse(content.trim());
    }

    const name = content.match(/^#\s+(.+)$/m)?.[1] || "Unknown Skill";
    const version = content.match(/version:\s*(.+)$/m)?.[1]?.trim() || "1.0.0";
    const author = content.match(/author:\s*(.+)$/m)?.[1]?.trim() || "unknown";
    const description = content.match(/description:\s*(.+)$/m)?.[1]?.trim() || content.match(/^##\s*Overview\n([\s\S]*?)(?=\n##)/m)?.[1]?.trim() || "";
    const riskLevel = (content.match(/risk:\s*(.+)$/m)?.[1]?.trim() as any) || "medium";
    const keywords = content.match(/keywords:\s*(.+)$/m)?.[1]?.trim() || "";

    const specBlocks = content.match(/```spec\s*([\s\S]*?)```/g) || [];
    const specs: SkillSpec[] = [];
    for (const block of specBlocks) {
      try {
        const specJson = block.replace(/```spec\s*/, "").replace(/```$/, "").trim();
        specs.push(JSON.parse(specJson));
      } catch {}
    }

    let guidance = content;
    for (const block of specBlocks) {
      guidance = guidance.replace(block, "");
    }
    if (!guidance.includes("keywords:") && keywords) {
      guidance = `keywords: ${keywords}\n\n${guidance}`;
    }

    return {
      name,
      version,
      author,
      description,
      riskLevel,
      guidance: guidance.trim(),
      specs,
    };
  } catch {
    return null;
  }
}

export async function vetSkill(skill: SkillPackage): Promise<VetResult> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

  if (!apiKey || !baseURL) {
    return {
      safe: false,
      riskScore: 10,
      summary: "Cannot vet: Anthropic API not configured",
      concerns: ["AI vetting unavailable — manual review required"],
      recommendations: ["Review the skill content manually before installing"],
      reviewedAt: new Date().toISOString(),
      model: "none",
    };
  }

  const client = new Anthropic({
    apiKey,
    baseURL,
  });

  const prompt = `You are a security reviewer for an autonomous AI agent called Sneebly. A user wants to install a "skill" that contains guidance rules and executable build specs.

Your job is to analyze this skill for:
1. **Security risks** — Does it try to access sensitive files, env vars, secrets, or external services maliciously?
2. **Malicious instructions** — Does it try to delete data, exfiltrate information, or modify critical system files?
3. **Logic errors** — Are the specs well-formed? Do they target reasonable files? Are success criteria sensible?
4. **Scope creep** — Does the skill do more than its stated purpose?
5. **Compatibility** — Will these specs work with a Drizzle ORM + Express + React project using shared/schema.ts?

Here is the skill package:

Name: ${skill.name}
Version: ${skill.version}
Author: ${skill.author}
Description: ${skill.description}
Risk Level (self-reported): ${skill.riskLevel}

GUIDANCE CONTENT:
${skill.guidance}

EXECUTABLE SPECS (${skill.specs.length} total):
${skill.specs.map((s, i) => `
Spec ${i + 1}:
  File: ${s.filePath}
  Action: ${s.action}
  Description: ${s.description}
  Success Criteria: ${s.successCriteria.join("; ")}
  Test Command: ${s.testCommand || "none"}
  Related Files: ${(s.relatedFiles || []).join(", ") || "none"}
`).join("\n")}

Respond in this exact JSON format:
{
  "safe": true/false,
  "riskScore": 0-10 (0=safe, 10=dangerous),
  "summary": "One-line verdict",
  "concerns": ["list of specific concerns, empty if none"],
  "recommendations": ["list of recommendations"]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        safe: false,
        riskScore: 5,
        summary: "Could not parse AI review response",
        concerns: ["AI returned non-JSON response — manual review recommended"],
        recommendations: ["Review the skill content manually"],
        reviewedAt: new Date().toISOString(),
        model: "claude-haiku-4-5",
      };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      safe: !!result.safe,
      riskScore: Math.min(10, Math.max(0, result.riskScore || 0)),
      summary: result.summary || "Review complete",
      concerns: Array.isArray(result.concerns) ? result.concerns : [],
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
      reviewedAt: new Date().toISOString(),
      model: "claude-haiku-4-5",
    };
  } catch (err: any) {
    return {
      safe: false,
      riskScore: 8,
      summary: `Vetting failed: ${err.message || "Unknown error"}`,
      concerns: ["AI vetting call failed — do not install without manual review"],
      recommendations: ["Check API configuration and try again, or review manually"],
      reviewedAt: new Date().toISOString(),
      model: "claude-haiku-4-5",
    };
  }
}

export async function submitSkill(rawContent: string): Promise<InstalledSkill> {
  const parsed = parseSkillPackage(rawContent);
  if (!parsed) {
    throw new Error("Could not parse skill content. Use JSON format or markdown with ```spec blocks.");
  }

  const registry = loadRegistry();

  const skill: InstalledSkill = {
    id: `skill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: parsed.name,
    version: parsed.version,
    author: parsed.author,
    description: parsed.description,
    riskLevel: parsed.riskLevel,
    guidanceFile: "",
    specsQueued: parsed.specs.length,
    vetResult: null,
    status: "vetting",
    rawContent,
    createdAt: new Date().toISOString(),
  };

  registry.unshift(skill);
  saveRegistry(registry);

  vetSkill(parsed).then((result) => {
    const reg = loadRegistry();
    const s = reg.find((r) => r.id === skill.id);
    if (s) {
      s.vetResult = result;
      s.status = result.safe ? "approved" : "pending-review";
      saveRegistry(reg);
    }
  }).catch(() => {
    const reg = loadRegistry();
    const s = reg.find((r) => r.id === skill.id);
    if (s) {
      s.status = "pending-review";
      saveRegistry(reg);
    }
  });

  return skill;
}

export function installSkill(skillId: string): InstalledSkill | null {
  const registry = loadRegistry();
  const skill = registry.find((s) => s.id === skillId);
  if (!skill) return null;

  const parsed = parseSkillPackage(skill.rawContent);
  if (!parsed) {
    skill.status = "failed";
    saveRegistry(registry);
    return skill;
  }

  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const guidanceFileName = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".md";
  const guidancePath = path.join(SKILLS_DIR, guidanceFileName);
  fs.writeFileSync(guidancePath, parsed.guidance, "utf-8");
  skill.guidanceFile = guidanceFileName;

  if (parsed.specs.length > 0) {
    if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });

    for (let i = 0; i < parsed.specs.length; i++) {
      const spec = parsed.specs[i];
      const specId = `skill-${skill.id}-step${i + 1}`;
      const specData = {
        id: specId,
        filePath: spec.filePath,
        description: spec.description,
        action: spec.action,
        successCriteria: spec.successCriteria,
        testCommand: spec.testCommand || "",
        relatedFiles: spec.relatedFiles || [],
        source: "skill-install",
        skillName: parsed.name,
        skillVersion: parsed.version,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(QUEUE_DIR, `${specId}.json`),
        JSON.stringify(specData, null, 2),
        "utf-8"
      );
    }
  }

  skill.status = "installed";
  skill.specsQueued = parsed.specs.length;
  skill.installedAt = new Date().toISOString();
  saveRegistry(registry);

  return skill;
}

export function rejectSkill(skillId: string): InstalledSkill | null {
  const registry = loadRegistry();
  const skill = registry.find((s) => s.id === skillId);
  if (!skill) return null;
  skill.status = "rejected";
  saveRegistry(registry);
  return skill;
}

export function getSkills(statusFilter?: string): InstalledSkill[] {
  const registry = loadRegistry();
  if (statusFilter) {
    return registry.filter((s) => s.status === statusFilter);
  }
  return registry;
}

export function getSkill(skillId: string): InstalledSkill | null {
  return loadRegistry().find((s) => s.id === skillId) || null;
}

export function getSkillStats(): { total: number; installed: number; pending: number; rejected: number } {
  const registry = loadRegistry();
  return {
    total: registry.length,
    installed: registry.filter((s) => s.status === "installed").length,
    pending: registry.filter((s) => s.status === "pending-review" || s.status === "vetting" || s.status === "approved").length,
    rejected: registry.filter((s) => s.status === "rejected").length,
  };
}
