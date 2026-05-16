import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readIdentityFile(filename: string): string {
  try {
    const filePath = path.join(ROOT, filename);
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
  } catch {}
  return "";
}

function parseListSection(content: string, sectionName: string): string[] {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`## ${escaped}[^\\n]*[\\s\\S]*?(?=\\n## |$)`, "i");
  const match = content.match(regex);
  if (!match) return [];
  return match[0]
    .split("\n")
    .filter(line => line.trim().startsWith("- "))
    .map(line => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function parseNumberValue(content: string, key: string, fallback: number): number {
  const regex = new RegExp(`${key}[:\\s]+\\$?([\\d.]+)`, "i");
  const match = content.match(regex);
  return match ? parseFloat(match[1]) : fallback;
}

export interface SneeblyIdentity {
  name: string;
  tagline: string;
  soul: string;
  agents: string;
  tools: string;
  heartbeat: string;
  user: string;
  identity: string;
}

export interface SneeblyConfig {
  safePaths: string[];
  neverModify: string[];
  codingStandards: string[];
  allowedCommands: string[];
  maxBudgetPerCycle: number;
  budgetWarningThreshold: number;
  costLimitPerModel: { haiku: boolean; sonnet: boolean; opus: boolean };
}

let cachedIdentity: SneeblyIdentity | null = null;
let cachedConfig: SneeblyConfig | null = null;
let identityLoadTime = 0;
let configLoadTime = 0;
const CACHE_TTL_MS = 60000;

export function loadIdentity(): SneeblyIdentity {
  const now = Date.now();
  if (cachedIdentity && now - identityLoadTime < CACHE_TTL_MS) return cachedIdentity;

  const soul = readIdentityFile("SOUL.md");
  const agents = readIdentityFile("AGENTS.md");
  const identity = readIdentityFile("IDENTITY.md");
  const tools = readIdentityFile("TOOLS.md");
  const heartbeat = readIdentityFile("HEARTBEAT.md");
  const user = readIdentityFile("USER.md");

  const nameMatch = identity.match(/## Name\s*\n(.+)/);
  const taglineMatch = identity.match(/## Tagline\s*\n(.+)/);

  cachedIdentity = {
    name: nameMatch?.[1]?.trim() || "Sneebly",
    tagline: taglineMatch?.[1]?.trim() || "Your app's autonomous co-pilot",
    soul,
    agents,
    tools,
    heartbeat,
    user,
    identity,
  };

  identityLoadTime = now;
  return cachedIdentity;
}

export function loadConfig(): SneeblyConfig {
  const now = Date.now();
  if (cachedConfig && now - configLoadTime < CACHE_TTL_MS) return cachedConfig;

  const id = loadIdentity();

  const safePaths = parseListSection(id.agents, "Safe to Auto-Modify");
  const neverModify = parseListSection(id.agents, "NEVER Auto-Modify");
  const codingStandards = parseListSection(id.agents, "Coding Standards");
  const allowedCommands = parseListSection(id.tools, "Allowed Shell Commands");
  const maxBudgetPerCycle = parseNumberValue(id.heartbeat, "Max API spend per heartbeat", 1.50);
  const budgetWarningThreshold = parseNumberValue(id.heartbeat, "Budget warning threshold", 1.00);

  const costSection = id.agents.toLowerCase();
  cachedConfig = {
    safePaths,
    neverModify,
    codingStandards,
    allowedCommands,
    maxBudgetPerCycle,
    budgetWarningThreshold,
    costLimitPerModel: {
      haiku: true,
      sonnet: true,
      opus: costSection.includes("opus only if explicitly configured") ? false : true,
    },
  };

  configLoadTime = now;
  return cachedConfig;
}

export function buildSystemPrompt(): string {
  const id = loadIdentity();

  const coreSection = id.soul
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  const identitySection = id.identity
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  return `${coreSection}\n\n${identitySection}`.trim();
}

export function getSafePaths(): string[] {
  return loadConfig().safePaths;
}

export function getNeverModifyPaths(): string[] {
  return loadConfig().neverModify;
}

export function getAllowedCommands(): string[] {
  return loadConfig().allowedCommands;
}

export function getBudgetLimits(): { max: number; warning: number } {
  const config = loadConfig();
  return { max: config.maxBudgetPerCycle, warning: config.budgetWarningThreshold };
}

export function invalidateCache(): void {
  cachedIdentity = null;
  cachedConfig = null;
  identityLoadTime = 0;
  configLoadTime = 0;
}
