import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const KB_FILE = path.join(DATA_DIR, "knowledge-base.json");
const QUALITY_FILE = path.join(DATA_DIR, "quality-history.json");

export interface KnowledgeEntry {
  id: string;
  featureId: string;
  title: string;
  approach: string;
  filesModified: string[];
  qualityDelta: number;
  timestamp: string;
  tags: string[];
  entryType: "feature" | "convention" | "fix-pattern";
}

export interface QualityCycle {
  timestamp: string;
  tscErrors: number;
  testPassRate: number;
  buildSuccessRate: number;
}

interface KnowledgeBase {
  entries: KnowledgeEntry[];
  version: number;
}

interface QualityHistory {
  cycles: QualityCycle[];
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadKnowledgeBase(): KnowledgeBase {
  try {
    if (fs.existsSync(KB_FILE)) {
      return JSON.parse(fs.readFileSync(KB_FILE, "utf-8"));
    }
  } catch {}
  return { entries: [], version: 1 };
}

function saveKnowledgeBase(kb: KnowledgeBase): void {
  ensureDir();
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2), "utf-8");
}

function loadQualityHistory(): QualityHistory {
  try {
    if (fs.existsSync(QUALITY_FILE)) {
      return JSON.parse(fs.readFileSync(QUALITY_FILE, "utf-8"));
    }
  } catch {}
  return { cycles: [] };
}

function saveQualityHistory(history: QualityHistory): void {
  ensureDir();
  fs.writeFileSync(QUALITY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/[\s\-_\/\\,;:.(){}[\]<>!@#$%^&*+=|~`?'"]+/)
      .filter(w => w.length > 3)
  );
}

function overlapScore(queryTokens: Set<string>, entryTokens: Set<string>): number {
  let overlap = 0;
  queryTokens.forEach(token => {
    if (entryTokens.has(token)) overlap++;
  });
  return overlap / Math.max(1, Math.min(queryTokens.size, entryTokens.size));
}

function extractTags(title: string, approach: string, filesModified: string[]): string[] {
  const tags = new Set<string>();
  const combined = (title + " " + approach).toLowerCase();

  const keywordsToTag: Record<string, string[]> = {
    schema: ["schema", "table", "database", "drizzle", "pgtable", "migration"],
    storage: ["storage", "crud", "istorage", "databasestorage"],
    routes: ["route", "api", "endpoint", "express", "requireauth"],
    frontend: ["react", "component", "page", "tsx", "client", "ui", "view"],
    agent: ["agent", "pipeline", "orchestrat", "planner", "builder"],
    character: ["character", "sprite", "animation"],
    story: ["story", "architect", "narrative"],
    environment: ["environment", "tileset", "world", "prop"],
    export: ["export", "download", "zip"],
    auth: ["auth", "clerk", "user", "session"],
  };

  for (const [tag, keywords] of Object.entries(keywordsToTag)) {
    if (keywords.some(kw => combined.includes(kw))) {
      tags.add(tag);
    }
  }

  for (const file of filesModified) {
    if (file.includes("schema")) tags.add("schema");
    if (file.includes("storage")) tags.add("storage");
    if (file.includes("routes")) tags.add("routes");
    if (file.startsWith("client/")) tags.add("frontend");
    if (file.includes("agent")) tags.add("agent");
  }

  return Array.from(tags);
}

export function recordFeatureSuccess(
  featureId: string,
  title: string,
  approach: string,
  filesModified: string[],
  qualityDelta: number,
  entryType: "feature" | "convention" | "fix-pattern" = "feature"
): void {
  try {
    const kb = loadKnowledgeBase();

    if (entryType === "feature") {
      const existing = kb.entries.find(e => e.featureId === featureId && e.entryType === "feature");
      if (existing) {
        existing.approach = approach;
        existing.filesModified = filesModified;
        existing.qualityDelta = qualityDelta;
        existing.timestamp = new Date().toISOString();
        saveKnowledgeBase(kb);
        return;
      }
    } else {
      if (kb.entries.some(e => e.approach === approach && e.entryType === entryType)) {
        return;
      }
    }

    const tags = extractTags(title, approach, filesModified);

    const entry: KnowledgeEntry = {
      id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      featureId,
      title,
      approach,
      filesModified,
      qualityDelta,
      timestamp: new Date().toISOString(),
      tags,
      entryType,
    };

    kb.entries.push(entry);

    if (kb.entries.length > 200) {
      kb.entries = kb.entries.slice(-200);
    }

    saveKnowledgeBase(kb);
    console.log(`[KnowledgeBase] Recorded ${entryType}: "${title.slice(0, 60)}" (delta: ${qualityDelta >= 0 ? "+" : ""}${qualityDelta})`);
  } catch (err: any) {
    console.log(`[KnowledgeBase] Record failed (non-fatal): ${err.message}`);
  }
}

export function getRelevantKnowledge(featureTitle: string, limit = 5): KnowledgeEntry[] {
  try {
    const kb = loadKnowledgeBase();
    if (kb.entries.length === 0) return [];

    const queryTokens = tokenize(featureTitle);

    const scored = kb.entries.map(entry => {
      const entryTokens = tokenize(entry.title + " " + entry.approach + " " + entry.tags.join(" "));
      const score = overlapScore(queryTokens, entryTokens);
      return { entry, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime()
      )
      .slice(0, limit)
      .map(s => s.entry);
  } catch {
    return [];
  }
}

export function updateQualityHistory(metrics: {
  tscErrors: number;
  testPassRate: number;
  buildSuccessRate: number;
}): void {
  try {
    const history = loadQualityHistory();

    history.cycles.push({
      timestamp: new Date().toISOString(),
      tscErrors: metrics.tscErrors,
      testPassRate: metrics.testPassRate,
      buildSuccessRate: metrics.buildSuccessRate,
    });

    if (history.cycles.length > 50) {
      history.cycles = history.cycles.slice(-50);
    }

    saveQualityHistory(history);
  } catch (err: any) {
    console.log(`[KnowledgeBase] updateQualityHistory failed (non-fatal): ${err.message}`);
  }
}

export function getKnowledgeData(): {
  totalEntries: number;
  recentEntries: KnowledgeEntry[];
  qualityTrend: QualityCycle[];
} {
  const kb = loadKnowledgeBase();
  const history = loadQualityHistory();

  return {
    totalEntries: kb.entries.length,
    recentEntries: [...kb.entries].reverse().slice(0, 10),
    qualityTrend: history.cycles.slice(-10),
  };
}
