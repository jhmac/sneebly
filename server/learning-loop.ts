import fs from "fs";
import path from "path";
import { addFixPattern, addMistake, addConvention, readMemorySection } from "./memory-manager";
import { oneShot } from "./claude-session";
import { extractJson } from "./utils";

const FIX_LOG_FILE = path.join(process.cwd(), ".sneebly", "auto-fixer-log.jsonl");
const LEARNING_STATE_FILE = path.join(process.cwd(), ".sneebly", "learning-state.json");

interface FixEntry {
  blockerId: string;
  specId: string;
  success: boolean;
  action: string;
  diagnosis: string;
  filesModified: string[];
  timestamp: string;
  error?: string;
}

interface LearningState {
  lastProcessedLine: number;
  patternsExtracted: number;
  lastRun: string | null;
}

function loadLearningState(): LearningState {
  try {
    if (fs.existsSync(LEARNING_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(LEARNING_STATE_FILE, "utf-8"));
    }
  } catch {}
  return { lastProcessedLine: 0, patternsExtracted: 0, lastRun: null };
}

function saveLearningState(state: LearningState): void {
  fs.writeFileSync(LEARNING_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function loadNewFixEntries(since: number): FixEntry[] {
  try {
    if (!fs.existsSync(FIX_LOG_FILE)) return [];
    const lines = fs.readFileSync(FIX_LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
    return lines.slice(since).map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

function extractLocalPatterns(entries: FixEntry[]): void {
  const wrongPathEntries = entries.filter(e =>
    e.diagnosis.includes("wrong path") || e.diagnosis.includes("wrong pattern")
  );
  if (wrongPathEntries.length >= 2) {
    addFixPattern(
      `Recurring wrong-path specs detected (${wrongPathEntries.length} instances) — auto-resolver handles these by checking shared/schema.ts`
    );
  }

  const alreadyDoneEntries = entries.filter(e =>
    e.diagnosis.includes("ALREADY EXISTS") || e.diagnosis.includes("already exists") || e.diagnosis.includes("ALREADY COMPLETE")
  );
  if (alreadyDoneEntries.length >= 2) {
    addMistake(
      `Specs tried to create things that already exist (${alreadyDoneEntries.length} times) — ELON planner needs better state awareness`
    );
  }

  const failedEntries = entries.filter(e => e.action === "failed");
  for (const entry of failedEntries) {
    if (entry.error && entry.error.includes("rate_limit")) {
      addFixPattern("Claude API rate limiting seen — auto-fixer should back off and retry with exponential delay");
    }
    if (entry.diagnosis.includes("Replace target not found")) {
      addFixPattern("Auto-fixer replace operations fail when file content drifts — prefer append or create-with-full-content over partial replace");
    }
  }
}

export async function runLearningCycle(): Promise<{
  newEntries: number;
  patternsFound: number;
  usedClaude: boolean;
}> {
  const state = loadLearningState();
  const newEntries = loadNewFixEntries(state.lastProcessedLine);

  if (newEntries.length === 0) {
    return { newEntries: 0, patternsFound: 0, usedClaude: false };
  }

  extractLocalPatterns(newEntries);

  let patternsFromClaude = 0;
  let usedClaude = false;

  if (newEntries.length >= 5) {
    try {
      const existingPatterns = readMemorySection("Fix Patterns");
      const existingMistakes = readMemorySection("Mistakes");

      const prompt = `Analyze these auto-fixer results and extract NEW patterns or lessons (don't repeat what's already known).

## Already Known Patterns
${existingPatterns}

## Already Known Mistakes
${existingMistakes}

## New Fix Log Entries
${JSON.stringify(newEntries, null, 2)}

Find patterns in these results. What's working? What keeps failing? What conventions should be added?

Respond in JSON:
{
  "newFixPatterns": ["pattern 1", "pattern 2"],
  "newMistakes": ["mistake 1"],
  "newConventions": ["convention 1"],
  "summary": "Brief summary of what was learned"
}

Only include GENUINELY NEW insights not already in the known patterns/mistakes above. Return empty arrays if nothing new.`;

      const response = await oneShot(prompt, { maxTokens: 2048, task: "learning-analysis", feature: "learning-loop", effort: "low" });
      const learned = extractJson(response);

      if (learned) {
        usedClaude = true;

        for (const p of (learned.newFixPatterns || [])) {
          addFixPattern(p);
          patternsFromClaude++;
        }
        for (const m of (learned.newMistakes || [])) {
          addMistake(m);
          patternsFromClaude++;
        }
        for (const c of (learned.newConventions || [])) {
          addConvention(c);
          patternsFromClaude++;
        }
      }
    } catch (error) {
      console.error("[Learning] Claude analysis failed:", error);
    }
  }

  const totalLines = (() => {
    try {
      return fs.readFileSync(FIX_LOG_FILE, "utf-8").trim().split("\n").filter(Boolean).length;
    } catch { return state.lastProcessedLine + newEntries.length; }
  })();

  state.lastProcessedLine = totalLines;
  state.patternsExtracted += patternsFromClaude;
  state.lastRun = new Date().toISOString();
  saveLearningState(state);

  return { newEntries: newEntries.length, patternsFound: patternsFromClaude, usedClaude };
}

export function getLearningState(): LearningState {
  return loadLearningState();
}
