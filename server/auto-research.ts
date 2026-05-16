import fs from "fs";
import path from "path";
import { callClaude, extractJson } from "./utils";
import { recordFeatureSuccess, getKnowledgeData } from "./knowledge-base";
import { getCostSummary } from "./cost-tracker";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const RESEARCH_LOG_FILE = path.join(DATA_DIR, "research-log.json");
const RESEARCH_INTERVAL = 5; // run after every N completed features

export interface ResearchCycle {
  id: string;
  timestamp: string;
  trigger: string;
  completedFeaturesAtTrigger: number;
  conventionsGenerated: number;
  conventions: Array<{ title: string; approach: string; tags: string[] }>;
  costAtTrigger: number;
  avgCostPerFeatureAtTrigger: number;
  durationMs: number;
  error?: string;
}

interface ResearchLog {
  cycles: ResearchCycle[];
  totalConventionsGenerated: number;
  lastRun: string;
}

function loadResearchLog(): ResearchLog {
  try {
    if (fs.existsSync(RESEARCH_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(RESEARCH_LOG_FILE, "utf-8"));
    }
  } catch {}
  return { cycles: [], totalConventionsGenerated: 0, lastRun: "" };
}

function saveResearchLog(log: ResearchLog): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RESEARCH_LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
}

export function shouldRunResearch(completedFeatureCount: number): boolean {
  if (completedFeatureCount === 0) return false;
  if (completedFeatureCount % RESEARCH_INTERVAL !== 0) return false;
  // Don't re-run if we already ran at this exact count
  const log = loadResearchLog();
  if (log.cycles.length === 0) return true;
  const last = log.cycles[log.cycles.length - 1];
  return last.completedFeaturesAtTrigger !== completedFeatureCount;
}

export async function runResearchCycle(
  completedFeatureCount: number,
  trigger = "auto"
): Promise<ResearchCycle> {
  const start = Date.now();
  const cycleId = `research-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  console.log(`[AutoResearch] Running research cycle #${cycleId} (trigger: ${trigger}, features: ${completedFeatureCount})`);

  const costSummary = getCostSummary();
  const totalCost = costSummary.totalAllTime;
  const avgCostPerFeature = completedFeatureCount > 0
    ? Number((totalCost / completedFeatureCount).toFixed(4))
    : 0;

  const kbData = getKnowledgeData();
  const successfulFeatures = kbData.recentEntries
    .filter(e => e.entryType === "feature")
    .slice(0, 10);
  const existingConventions = kbData.recentEntries
    .filter(e => e.entryType === "convention")
    .slice(0, 5);
  const qualityTrend = kbData.qualityTrend.slice(-5);

  const prompt = `You are analyzing a running autonomous AI coding agent (Sneebly) that builds software features from a roadmap.

## Performance Data
- Total features completed: ${completedFeatureCount}
- Total cost so far: $${totalCost.toFixed(4)}
- Average cost per feature: $${avgCostPerFeature.toFixed(4)}

## Recent Quality Trend (last ${qualityTrend.length} cycles)
${qualityTrend.length > 0
  ? qualityTrend.map(c =>
      `- ${new Date(c.timestamp).toLocaleTimeString()}: TSC errors=${c.tscErrors}, test pass=${c.testPassRate}%, build success=${c.buildSuccessRate}%`
    ).join("\n")
  : "No quality data yet."}

## What Has Worked (recent successful feature patterns)
${successfulFeatures.length > 0
  ? successfulFeatures.map(e =>
      `- "${e.title}": ${e.approach.slice(0, 200)} [qualityDelta: ${e.qualityDelta >= 0 ? "+" : ""}${e.qualityDelta}]`
    ).join("\n")
  : "No feature records yet."}

## Existing Conventions Already Recorded
${existingConventions.length > 0
  ? existingConventions.map(e => `- "${e.title}": ${e.approach.slice(0, 150)}`).join("\n")
  : "None yet."}

## Your Task
Analyze this data and generate 3–5 NEW coding conventions that this agent should follow on future builds to:
1. Reduce token cost per feature
2. Reduce TypeScript errors introduced
3. Improve first-attempt build success rate

Focus on concrete, actionable coding conventions — not vague platitudes. Each convention should be something the planner can inject into a prompt and the builder can directly follow.

Respond with ONLY a JSON object in this exact shape:
{
  "conventions": [
    {
      "title": "short convention name (max 60 chars)",
      "approach": "concrete description of what to do (max 300 chars)",
      "tags": ["tag1", "tag2"]
    }
  ]
}

Do NOT include conventions that already exist in the list above. Generate genuinely new insights.`;

  const cycle: ResearchCycle = {
    id: cycleId,
    timestamp: new Date().toISOString(),
    trigger,
    completedFeaturesAtTrigger: completedFeatureCount,
    conventionsGenerated: 0,
    conventions: [],
    costAtTrigger: totalCost,
    avgCostPerFeatureAtTrigger: avgCostPerFeature,
    durationMs: 0,
  };

  try {
    const response = await callClaude(prompt, {
      model: "claude-haiku-4-5",
      maxTokens: 2048,
      effort: "low",
      agent: "auto-research",
      task: "convention-synthesis",
    });

    const parsed = extractJson(response.text);
    if (!parsed || !Array.isArray(parsed.conventions)) {
      throw new Error("Claude did not return valid conventions JSON");
    }

    const validConventions: Array<{ title: string; approach: string; tags: string[] }> = [];
    for (const c of parsed.conventions) {
      if (typeof c.title === "string" && typeof c.approach === "string") {
        const conv = {
          title: String(c.title).slice(0, 60),
          approach: String(c.approach).slice(0, 300),
          tags: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 5) : [],
        };
        validConventions.push(conv);
        recordFeatureSuccess(
          `convention-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          conv.title,
          conv.approach,
          [],
          0,
          "convention"
        );
      }
    }

    cycle.conventions = validConventions;
    cycle.conventionsGenerated = validConventions.length;
    console.log(`[AutoResearch] Synthesized ${validConventions.length} new conventions`);
  } catch (err: any) {
    cycle.error = err.message;
    console.log(`[AutoResearch] Research cycle failed (non-fatal): ${err.message}`);
  }

  cycle.durationMs = Date.now() - start;

  const log = loadResearchLog();
  log.cycles.push(cycle);
  if (log.cycles.length > 20) log.cycles = log.cycles.slice(-20);
  log.totalConventionsGenerated += cycle.conventionsGenerated;
  log.lastRun = cycle.timestamp;
  saveResearchLog(log);

  return cycle;
}

export function getResearchData(): {
  totalCycles: number;
  totalConventionsGenerated: number;
  lastRun: string;
  recentCycles: ResearchCycle[];
  costTrend: Array<{ timestamp: string; avgCostPerFeature: number; featuresCompleted: number }>;
} {
  const log = loadResearchLog();
  const recentCycles = log.cycles.slice(-5).reverse();

  const costTrend = log.cycles.map(c => ({
    timestamp: c.timestamp,
    avgCostPerFeature: c.avgCostPerFeatureAtTrigger,
    featuresCompleted: c.completedFeaturesAtTrigger,
  }));

  return {
    totalCycles: log.cycles.length,
    totalConventionsGenerated: log.totalConventionsGenerated,
    lastRun: log.lastRun,
    recentCycles,
    costTrend,
  };
}
