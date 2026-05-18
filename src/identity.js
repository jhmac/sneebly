// Identity & configuration parser for Sneebly projects.
//
// Reads 6 canonical .md files from the project root:
//   - SOUL.md        — Sneebly's universal character (system prompt)
//   - IDENTITY.md    — per-project agent name/tagline (system prompt)
//   - AGENTS.md      — safe paths, never-modify, coding standards
//   - TOOLS.md       — allowed shell commands
//   - HEARTBEAT.md   — cadence + rate limits
//   - USER.md        — info about the human user (raw, not parsed)
//
// 60-second cache on both identity and config.
//
// v3 changes from v2.0:
//   - getBudgetLimits() reinterpreted: { max, warning } are now REQUESTS-PER-HEARTBEAT
//     not dollar amounts. Claude Max is flat-rate, so we track throughput instead.
//     Defaults: max=200 req/heartbeat, warning=150 req/heartbeat.
//   - costLimitPerModel: Opus DEFAULT TRUE on v3 (was opt-in on v2.0).
//     AGENTS.md can still override with "use cheaper models" preference if desired.
//   - Same 60-second cache, same parse logic, same exports.
//
// Ported from src/identity.ts on 2026-05-17.

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function readIdentityFile(filename) {
  try {
    const filePath = path.join(ROOT, filename);
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    // Silent failure — missing identity files are non-fatal
  }
  return "";
}

function parseListSection(content, sectionName) {
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

function parseNumberValue(content, key, fallback) {
  const regex = new RegExp(`${key}[:\\s]+\\$?([\\d.]+)`, "i");
  const match = content.match(regex);
  return match ? parseFloat(match[1]) : fallback;
}

let cachedIdentity = null;
let cachedConfig = null;
let identityLoadTime = 0;
let configLoadTime = 0;
const CACHE_TTL_MS = 60000;

function loadIdentity() {
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
    name: (nameMatch && nameMatch[1] && nameMatch[1].trim()) || "Sneebly",
    tagline: (taglineMatch && taglineMatch[1] && taglineMatch[1].trim()) || "Your app's autonomous co-pilot",
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

function loadConfig() {
  const now = Date.now();
  if (cachedConfig && now - configLoadTime < CACHE_TTL_MS) return cachedConfig;

  const id = loadIdentity();

  const safePaths = parseListSection(id.agents, "Safe to Auto-Modify");
  const neverModify = parseListSection(id.agents, "NEVER Auto-Modify");
  const codingStandards = parseListSection(id.agents, "Coding Standards");
  const allowedCommands = parseListSection(id.tools, "Allowed Shell Commands");

  // v3: request-per-heartbeat limits, not dollar amounts.
  // HEARTBEAT.md keys "Max requests per heartbeat" / "Request warning threshold"
  // fall back to v2.0 keys "Max API spend per heartbeat" / "Budget warning threshold"
  // for backwards compatibility during transition.
  let maxRequestsPerCycle = parseNumberValue(id.heartbeat, "Max requests per heartbeat", -1);
  if (maxRequestsPerCycle === -1) {
    // Fall back: old key with old default repurposed (very loose throughput cap)
    maxRequestsPerCycle = parseNumberValue(id.heartbeat, "Max API spend per heartbeat", 200);
  }
  let warningThreshold = parseNumberValue(id.heartbeat, "Request warning threshold", -1);
  if (warningThreshold === -1) {
    warningThreshold = parseNumberValue(id.heartbeat, "Budget warning threshold", 150);
  }

  // v3: Opus 4.7 is default-on for Claude Max users.
  // AGENTS.md can still opt out with "use cheaper models when possible" preference.
  const agentsLower = id.agents.toLowerCase();
  const prefersCheaper = agentsLower.includes("use cheaper models when possible") ||
                         agentsLower.includes("opus only if explicitly configured");

  cachedConfig = {
    safePaths,
    neverModify,
    codingStandards,
    allowedCommands,
    maxBudgetPerCycle: maxRequestsPerCycle,
    budgetWarningThreshold: warningThreshold,
    costLimitPerModel: {
      haiku: true,
      sonnet: true,
      opus: !prefersCheaper, // default TRUE on v3, opt-out via AGENTS.md
    },
  };

  configLoadTime = now;
  return cachedConfig;
}

function buildSystemPrompt() {
  const id = loadIdentity();

  const coreSection = id.soul
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  const identitySection = id.identity
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  return `${coreSection}\n\n${identitySection}`.trim();
}

function getSafePaths() {
  return loadConfig().safePaths;
}

function getNeverModifyPaths() {
  return loadConfig().neverModify;
}

function getAllowedCommands() {
  return loadConfig().allowedCommands;
}

function getBudgetLimits() {
  // v3: returns request-rate limits, not dollar amounts.
  // Field names kept for API compatibility with callers.
  const config = loadConfig();
  return { max: config.maxBudgetPerCycle, warning: config.budgetWarningThreshold };
}

function invalidateCache() {
  cachedIdentity = null;
  cachedConfig = null;
  identityLoadTime = 0;
  configLoadTime = 0;
}

module.exports = {
  loadIdentity,
  loadConfig,
  buildSystemPrompt,
  getSafePaths,
  getNeverModifyPaths,
  getAllowedCommands,
  getBudgetLimits,
  invalidateCache,
};
