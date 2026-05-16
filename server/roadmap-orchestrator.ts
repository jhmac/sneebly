import fs from "fs";
import path from "path";
import crypto from "crypto";
import { callClaude, extractJson } from "./utils";

const SNEEBLY_DIR = path.join(process.cwd(), ".sneebly");
const ROADMAP_FILE = path.join(SNEEBLY_DIR, "roadmap.json");
const ROADMAP_META_FILE = path.join(SNEEBLY_DIR, "roadmap-meta.json");
const GOALS_FILE = path.join(process.cwd(), "GOALS.md");

export interface RoadmapFeature {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  status: "pending" | "in_progress" | "done";
  phase?: string;
  priority?: number;
  complexity?: "low" | "medium" | "high";
  acceptanceTestPath?: string;
  /** How many times this feature has been dispatched for building without succeeding */
  attemptCount?: number;
  /** ISO timestamp of first attempt */
  firstAttemptedAt?: string;
  /** ISO timestamp of most recent attempt */
  lastAttemptedAt?: string;
  lastTestResult?: {
    passed: boolean;
    output: string;
    exitCode: number;
    durationMs: number;
    testedAt: string;
  };
}

export interface Roadmap {
  generatedAt: string;
  goalsHash: string;
  features: RoadmapFeature[];
}

interface RoadmapMeta {
  goalsHash: string;
  generatedAt: string;
}

function ensureDir(): void {
  if (!fs.existsSync(SNEEBLY_DIR)) fs.mkdirSync(SNEEBLY_DIR, { recursive: true });
}

function hashGoals(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readGoals(): string {
  try {
    if (!fs.existsSync(GOALS_FILE)) return "";
    return fs.readFileSync(GOALS_FILE, "utf-8");
  } catch {
    return "";
  }
}

export function loadRoadmap(): Roadmap | null {
  try {
    if (!fs.existsSync(ROADMAP_FILE)) return null;
    return JSON.parse(fs.readFileSync(ROADMAP_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function saveRoadmap(roadmap: Roadmap): void {
  ensureDir();
  fs.writeFileSync(ROADMAP_FILE, JSON.stringify(roadmap, null, 2), "utf-8");

  const meta: RoadmapMeta = {
    goalsHash: roadmap.goalsHash,
    generatedAt: roadmap.generatedAt,
  };
  fs.writeFileSync(ROADMAP_META_FILE, JSON.stringify(meta, null, 2), "utf-8");
}

function loadMeta(): RoadmapMeta | null {
  try {
    if (!fs.existsSync(ROADMAP_META_FILE)) return null;
    return JSON.parse(fs.readFileSync(ROADMAP_META_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function getNextFeatures(): RoadmapFeature[] {
  const roadmap = loadRoadmap();
  if (!roadmap) return [];

  const ready: RoadmapFeature[] = [];

  for (const feature of roadmap.features) {
    if (feature.status !== "pending") continue;

    const depsAllDone = feature.dependencies.every(depId => {
      const dep = roadmap.features.find(f => f.id === depId);
      return dep?.status === "done";
    });

    if (depsAllDone) {
      ready.push(feature);
    }
  }

  return ready;
}

let roadmapMutex: Promise<void> = Promise.resolve();

function withRoadmapLock(fn: () => void): Promise<void> {
  const next = roadmapMutex.then(fn);
  roadmapMutex = next.catch(() => {});
  return next;
}

export async function markFeatureDone(id: string): Promise<void> {
  return withRoadmapLock(() => {
    const roadmap = loadRoadmap();
    if (!roadmap) return;

    const feature = roadmap.features.find(f => f.id === id);
    if (feature) {
      feature.status = "done";
      saveRoadmap(roadmap);
      console.log(`[Roadmap] Feature marked done: ${id} — ${feature.title}`);
    }
  });
}

export async function markFeatureInProgress(id: string): Promise<void> {
  return withRoadmapLock(() => {
    const roadmap = loadRoadmap();
    if (!roadmap) return;

    const feature = roadmap.features.find(f => f.id === id);
    if (feature) {
      feature.status = "in_progress";
      feature.attemptCount = (feature.attemptCount ?? 0) + 1;
      feature.lastAttemptedAt = new Date().toISOString();
      if (!feature.firstAttemptedAt) feature.firstAttemptedAt = feature.lastAttemptedAt;
      saveRoadmap(roadmap);
    }
  });
}

export async function resetFeatureStatus(id: string): Promise<void> {
  return withRoadmapLock(() => {
    const roadmap = loadRoadmap();
    if (!roadmap) return;

    const feature = roadmap.features.find(f => f.id === id);
    if (feature && feature.status === "in_progress") {
      feature.status = "pending";
      saveRoadmap(roadmap);
    }
  });
}

export async function markFeaturePending(id: string): Promise<void> {
  return withRoadmapLock(() => {
    const roadmap = loadRoadmap();
    if (!roadmap) return;

    const feature = roadmap.features.find(f => f.id === id);
    if (feature && feature.status !== "pending") {
      console.log(`[Roadmap] ${id}: ${feature.status} → pending (acceptance test failed)`);
      feature.status = "pending";
      saveRoadmap(roadmap);
    }
  });
}

export async function setFeatureTestPath(id: string, testPath: string): Promise<void> {
  return withRoadmapLock(() => {
    const roadmap = loadRoadmap();
    if (!roadmap) return;
    const feature = roadmap.features.find(f => f.id === id);
    if (feature) {
      feature.acceptanceTestPath = testPath;
      saveRoadmap(roadmap);
    }
  });
}

export async function setFeatureTestResult(
  id: string,
  result: { passed: boolean; output: string; exitCode: number; durationMs: number }
): Promise<void> {
  return withRoadmapLock(() => {
    const roadmap = loadRoadmap();
    if (!roadmap) return;
    const feature = roadmap.features.find(f => f.id === id);
    if (feature) {
      feature.lastTestResult = { ...result, testedAt: new Date().toISOString() };
      saveRoadmap(roadmap);
    }
  });
}

export function needsRegeneration(): boolean {
  const goals = readGoals();
  if (!goals) return false;

  const currentHash = hashGoals(goals);
  const meta = loadMeta();

  if (!meta) return true;
  if (!fs.existsSync(ROADMAP_FILE)) return true;

  return meta.goalsHash !== currentHash;
}

export async function generateRoadmap(): Promise<Roadmap> {
  const goals = readGoals();
  if (!goals) {
    const empty: Roadmap = {
      generatedAt: new Date().toISOString(),
      goalsHash: "",
      features: [],
    };
    saveRoadmap(empty);
    return empty;
  }

  const prompt = `You are a senior software architect. Read the following GOALS.md specification and extract every distinct feature that needs to be built. For each feature, identify its dependencies on other features so they can be built in the correct order.

## GOALS.md
${goals}

Analyze the spec and produce a complete ordered feature roadmap. Each feature should be:
- A coherent piece of functionality (not too small like "add a button", not too large like "build the whole app")
- Tagged with the IDs of any other features it depends on
- Given a clear, actionable title and description

Return a JSON array of features in dependency-order (features with no dependencies first, then features that depend on them):

{
  "features": [
    {
      "id": "feature-001",
      "title": "Short descriptive title",
      "description": "What this feature implements and why",
      "dependencies": [],
      "phase": "Phase 1",
      "priority": 1
    },
    {
      "id": "feature-002",
      "title": "Another feature",
      "description": "Description of this feature",
      "dependencies": ["feature-001"],
      "phase": "Phase 1",
      "priority": 2
    }
  ]
}

Rules:
- Use sequential IDs: feature-001, feature-002, feature-003, etc.
- Only list features that are explicitly described or strongly implied in GOALS.md
- Dependencies must reference valid IDs in this same array
- Order features so no feature appears before its dependencies
- Aim for 8-20 features total — meaningful chunks, not micro-steps
- Do not include Sneebly/agent infrastructure features — only app features`;

  console.log("[Roadmap] Generating roadmap from GOALS.md...");

  const result = await callClaude(prompt, {
    model: "claude-opus-4-6",
    maxTokens: 8192,
    temperature: 0.2,
    agent: "roadmap-orchestrator",
    task: "roadmap-generation",
    feature: "roadmap",
  });

  const parsed = extractJson(result.text);
  if (!parsed || !Array.isArray(parsed.features)) {
    throw new Error("Roadmap orchestrator did not return valid JSON with features array");
  }

  const goalsHash = hashGoals(goals);

  interface RawFeature {
    id?: string;
    title?: string;
    description?: string;
    dependencies?: unknown[];
    phase?: string;
    priority?: number;
  }

  const rawRoadmap: Roadmap = {
    generatedAt: new Date().toISOString(),
    goalsHash,
    features: (parsed.features as RawFeature[]).map((f) => ({
      id: typeof f.id === "string" && f.id ? f.id : `feature-${Date.now()}`,
      title: typeof f.title === "string" && f.title ? f.title : "Untitled Feature",
      description: typeof f.description === "string" ? f.description : "",
      dependencies: Array.isArray(f.dependencies)
        ? (f.dependencies as unknown[]).filter((d): d is string => typeof d === "string")
        : [],
      status: "pending" as const,
      phase: typeof f.phase === "string" ? f.phase : undefined,
      priority: typeof f.priority === "number" ? f.priority : undefined,
    })),
  };

  const roadmap = validateAndRepairRoadmap(rawRoadmap);

  saveRoadmap(roadmap);
  console.log(`[Roadmap] Generated ${roadmap.features.length} features and saved to roadmap.json`);
  return roadmap;
}

function validateAndRepairRoadmap(roadmap: Roadmap): Roadmap {
  const seenIds = new Set<string>();
  const features: RoadmapFeature[] = [];

  for (const feature of roadmap.features) {
    if (!feature.id || seenIds.has(feature.id)) {
      const newId = `feature-${Date.now()}-${features.length + 1}`;
      console.log(`[Roadmap] Duplicate/missing ID repaired: "${feature.id}" → "${newId}"`);
      features.push({ ...feature, id: newId });
      seenIds.add(newId);
    } else {
      seenIds.add(feature.id);
      features.push(feature);
    }
  }

  const validIds = new Set(features.map(f => f.id));
  const repaired = features.map(f => ({
    ...f,
    dependencies: f.dependencies.filter(dep => {
      if (!validIds.has(dep)) {
        console.log(`[Roadmap] Pruned invalid dependency "${dep}" from feature "${f.id}"`);
        return false;
      }
      return true;
    }),
  }));

  const hasCycle = detectCycle(repaired);
  if (hasCycle) {
    console.log("[Roadmap] Cycle detected in dependency graph — clearing all dependencies as fallback");
    return { ...roadmap, features: repaired.map(f => ({ ...f, dependencies: [] })) };
  }

  return { ...roadmap, features: repaired };
}

function detectCycle(features: RoadmapFeature[]): boolean {
  const depMap = new Map<string, string[]>();
  for (const f of features) depMap.set(f.id, f.dependencies);

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(id: string): boolean {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    for (const dep of depMap.get(id) || []) {
      if (dfs(dep)) return true;
    }
    stack.delete(id);
    return false;
  }

  for (const f of features) {
    if (dfs(f.id)) return true;
  }
  return false;
}

export async function ensureAllFeatureTestPaths(roadmap: Roadmap): Promise<void> {
  const { getTestPath } = await import("./acceptance-test-generator");
  let changed = false;
  for (const feature of roadmap.features) {
    if (!feature.acceptanceTestPath) {
      feature.acceptanceTestPath = getTestPath(feature.id);
      changed = true;
    }
  }
  if (changed) {
    saveRoadmap(roadmap);
    const count = roadmap.features.filter(f => f.acceptanceTestPath).length;
    console.log(`[Roadmap] acceptanceTestPath registered for ${count}/${roadmap.features.length} features`);
  }
}

export async function triggerRetroactiveAcceptanceTests(features: RoadmapFeature[]): Promise<void> {
  const doneFeatures = features.filter(f => f.status === "done");
  if (doneFeatures.length === 0) return;

  const { generateAcceptanceTest, testExists, getTestPath } = await import("./acceptance-test-generator");
  const { runAcceptanceTest } = await import("./feature-validator");
  const NEEDS_ATTENTION_FILE = path.join(process.cwd(), "NEEDS-ATTENTION.md");
  let failures = 0;

  console.log(`[Roadmap/RetroTest] Generating + running tests for ${doneFeatures.length} done features...`);

  for (const feature of doneFeatures) {
    try {
      let testPath: string;
      if (testExists(feature.id)) {
        // Script already exists on disk — reuse it, do NOT regenerate (would overwrite patches)
        testPath = getTestPath(feature.id);
        console.log(`[Roadmap/RetroTest] Using existing script for ${feature.id}`);
      } else {
        // No script on disk yet — generate a fresh one via Claude
        testPath = await generateAcceptanceTest(feature.id, feature.title, feature.description);
      }
      await setFeatureTestPath(feature.id, testPath);

      const validationResult = await runAcceptanceTest(feature.id);
      await setFeatureTestResult(feature.id, {
        passed: validationResult.passed,
        output: validationResult.output,
        exitCode: validationResult.exitCode,
        durationMs: validationResult.durationMs,
      });
      if (!validationResult.passed && !validationResult.skipped) {
        failures++;
        console.log(`[Roadmap/RetroTest] FAIL: ${feature.id} — ${validationResult.output.slice(0, 150)}`);
        await markFeaturePending(feature.id);
        try {
          const timestamp = new Date().toISOString();
          const header = fs.existsSync(NEEDS_ATTENTION_FILE) ? "" : "# NEEDS ATTENTION\n\n---\n\n";
          const entry = `## Retroactive Test FAILED — ${feature.id} (${timestamp})\n- **Feature**: ${feature.title}\n- **Reset to**: pending\n- **Exit code**: ${validationResult.exitCode}\n- **Output**: \`\`\`\n${validationResult.output.slice(0, 600)}\n\`\`\`\n\n`;
          fs.appendFileSync(NEEDS_ATTENTION_FILE, header + entry, "utf-8");
        } catch {}
      } else if (validationResult.skipped) {
        console.log(`[Roadmap/RetroTest] SKIP (no script yet): ${feature.id}`);
      } else {
        console.log(`[Roadmap/RetroTest] PASS: ${feature.id}`);
      }
    } catch (err: unknown) {
      console.log(`[Roadmap/RetroTest] Error for ${feature.id}: ${(err as Error).message}`);
    }
  }

  console.log(`[Roadmap/RetroTest] Done — ${failures} failures among ${doneFeatures.length} done features`);
}

export async function initRoadmap(): Promise<Roadmap> {
  if (!needsRegeneration()) {
    const existing = loadRoadmap();
    if (existing) {
      console.log(`[Roadmap] Loaded existing roadmap (${existing.features.length} features)`);
      await ensureAllFeatureTestPaths(existing);
      return existing;
    }
  }

  console.log("[Roadmap] Regenerating roadmap (GOALS.md changed or first run)...");
  const roadmap = await generateRoadmap();
  await ensureAllFeatureTestPaths(roadmap);
  return roadmap;
}

interface ReconciliationCheck {
  schemaTable?: string;
  storageMethods?: string[];
  routePatterns?: string[];
  pageFiles?: string[];
}

const FEATURE_CHECKS: Record<string, ReconciliationCheck> = {
  "feature-001": {
    schemaTable: "users",
    storageMethods: ["getUser", "createUser"],
  },
  "feature-002": {
    schemaTable: "users",
    storageMethods: ["getUser", "createUser", "updateUser"],
    routePatterns: ["/api/users/me", "/api/users"],
  },
  "feature-003": {
    schemaTable: "stories",
    storageMethods: ["getStories", "createStory", "updateStory", "deleteStory"],
    routePatterns: ["/stories"],
  },
  "feature-004": {
    schemaTable: "characters",
    storageMethods: ["getCharacters", "createCharacter", "updateCharacter", "deleteCharacter"],
    routePatterns: ["/characters"],
  },
  "feature-005": {
    schemaTable: "environments",
    storageMethods: ["getEnvironments", "createEnvironment", "getTilesets", "createTileset", "getEnvironmentProps", "createEnvironmentProp"],
    routePatterns: ["/environments", "/tilesets", "/props"],
  },
  "feature-006": {
    schemaTable: "quests",
    storageMethods: ["getQuests", "createQuest", "updateQuest", "deleteQuest"],
    routePatterns: ["/quests"],
  },
  "feature-007": {
    schemaTable: "uploads",
    storageMethods: ["getUploads", "createUpload", "deleteUpload"],
    routePatterns: ["/uploads"],
  },
  "feature-008": {
    schemaTable: "sprite_sheets",
    storageMethods: ["getSpriteSheets", "createSpriteSheet", "getAnimations", "createAnimation"],
    routePatterns: ["/sprite-sheets", "/animations"],
  },
  "feature-009": {
    schemaTable: "agent_runs",
    storageMethods: ["getAgentRuns", "createAgentRun"],
    routePatterns: ["/agents"],
  },
  "feature-014": {
    pageFiles: ["ProjectDashboard", "ProjectDetail"],
    routePatterns: ["/api/projects"],
  },
  "feature-015": {
    pageFiles: ["Editor"],
    storageMethods: ["getStories", "getUploads"],
    routePatterns: ["/stories", "/uploads"],
  },
  "feature-017": {
    pageFiles: ["Editor"],
    storageMethods: ["getCharacters", "getAnimations"],
    routePatterns: ["/characters", "/animations"],
  },
  "feature-018": {
    storageMethods: ["getEnvironments", "createEnvironment", "getTilesets"],
    routePatterns: ["/environments"],
  },
  "feature-019": {
    pageFiles: ["Editor"],
    storageMethods: ["getEnvironments", "getEnvironmentProps"],
    routePatterns: ["/environments"],
  },
  "feature-020": {
    schemaTable: "exports",
    storageMethods: ["getExports", "createExport"],
    routePatterns: ["/exports"],
  },
  "feature-021": {
    routePatterns: ["/duplicate"],
    storageMethods: ["getProject"],
  },
};

export async function reconcileWithReality(): Promise<{ marked: string[]; remaining: string[] }> {
  const roadmap = loadRoadmap();
  if (!roadmap) return { marked: [], remaining: [] };

  const marked: string[] = [];
  const remaining: string[] = [];

  let schemaContent = "";
  let storageContent = "";
  let routesContent = "";
  try { schemaContent = fs.readFileSync(path.join(process.cwd(), "shared/schema.ts"), "utf-8"); } catch {}
  try { storageContent = fs.readFileSync(path.join(process.cwd(), "server/storage.ts"), "utf-8"); } catch {}
  try { routesContent = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf-8"); } catch {}

  const pagesDir = path.join(process.cwd(), "client/src/pages");
  let pageFiles: string[] = [];
  try { pageFiles = fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir) : []; } catch {}

  for (const feature of roadmap.features) {
    if (feature.status === "done") continue;

    const checks = FEATURE_CHECKS[feature.id];
    if (!checks) {
      const titleLower = feature.title.toLowerCase();
      const desc = feature.description.toLowerCase();

      let evidence = 0;
      let needed = 0;

      if (titleLower.includes("schema") || titleLower.includes("database")) {
        needed++;
        const schemaTables = ["users", "projects", "stories", "characters", "sprite_sheets",
          "animations", "environments", "tilesets", "environment_props", "quests",
          "uploads", "exports", "agent_runs"];
        const found = schemaTables.filter(t => schemaContent.includes(`"${t}"`));
        if (found.length >= schemaTables.length * 0.8) evidence++;
      }

      if (titleLower.includes("ui") || titleLower.includes("page") || titleLower.includes("dashboard") || titleLower.includes("gallery") || titleLower.includes("editor")) {
        needed++;
        if (titleLower.includes("dashboard") && pageFiles.some(f => f.toLowerCase().includes("dashboard"))) evidence++;
        else if (titleLower.includes("workspace") && pageFiles.some(f => f.toLowerCase().includes("project"))) evidence++;
        else if (pageFiles.length >= 5) evidence++;
      }

      if (titleLower.includes("crud") || titleLower.includes("api") || titleLower.includes("endpoint")) {
        needed += 2;
        const keywords = feature.title.split(/\s+/).filter(w => w.length > 3).map(w => w.toLowerCase());
        const routeMatches = keywords.filter(kw => routesContent.toLowerCase().includes(kw));
        if (routeMatches.length >= 2) evidence++;
        const storageMatches = keywords.filter(kw => storageContent.toLowerCase().includes(kw));
        if (storageMatches.length >= 2) evidence++;
      }

      if (needed > 0 && evidence >= needed) {
        feature.status = "done";
        marked.push(`${feature.id}: ${feature.title}`);
        console.log(`[Roadmap Reconcile] Feature done (heuristic): ${feature.id} — ${feature.title}`);
      } else {
        remaining.push(`${feature.id}: ${feature.title}`);
      }
      continue;
    }

    let pass = true;

    if (checks.schemaTable) {
      if (!schemaContent.includes(`"${checks.schemaTable}"`)) pass = false;
    }

    if (checks.storageMethods) {
      for (const method of checks.storageMethods) {
        if (!storageContent.includes(method)) { pass = false; break; }
      }
    }

    if (checks.routePatterns) {
      for (const pattern of checks.routePatterns) {
        if (!routesContent.includes(pattern)) { pass = false; break; }
      }
    }

    if (checks.pageFiles) {
      for (const pf of checks.pageFiles) {
        if (!pageFiles.some(f => f.toLowerCase().includes(pf.toLowerCase()))) { pass = false; break; }
      }
    }

    if (pass) {
      feature.status = "done";
      marked.push(`${feature.id}: ${feature.title}`);
      console.log(`[Roadmap Reconcile] Feature done: ${feature.id} — ${feature.title}`);
    } else {
      remaining.push(`${feature.id}: ${feature.title}`);
    }
  }

  if (marked.length > 0) {
    saveRoadmap(roadmap);
    console.log(`[Roadmap Reconcile] Marked ${marked.length} features as done, ${remaining.length} remaining`);
  } else {
    console.log(`[Roadmap Reconcile] No new features to reconcile — ${remaining.length} still pending`);
  }

  return { marked, remaining };
}

export async function reconcileBlockedConstraints(): Promise<number> {
  const BLOCKED_FILE = path.join(SNEEBLY_DIR, "blocked-constraints.json");
  const RESOLVED_FILE = path.join(SNEEBLY_DIR, "resolved-constraints.json");

  let blocked: Array<{ description: string; failCount: number; blockedAt: string; specIds?: string[] }> = [];
  try {
    if (fs.existsSync(BLOCKED_FILE)) {
      blocked = JSON.parse(fs.readFileSync(BLOCKED_FILE, "utf-8"));
      if (!Array.isArray(blocked)) blocked = blocked && (blocked as any).constraints ? (blocked as any).constraints : [];
    }
  } catch { blocked = []; }

  let resolved: Array<{ description: string; normalised: string; evidence: string; resolvedAt: string }> = [];
  try {
    if (fs.existsSync(RESOLVED_FILE)) {
      resolved = JSON.parse(fs.readFileSync(RESOLVED_FILE, "utf-8"));
      if (!Array.isArray(resolved)) resolved = [];
    }
  } catch { resolved = []; }

  let schemaContent = "";
  try { schemaContent = fs.readFileSync(path.join(process.cwd(), "shared/schema.ts"), "utf-8"); } catch {}

  const schemaTables: string[] = [];
  const re = /pgTable\s*\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schemaContent)) !== null) schemaTables.push(m[1]);

  let autoResolved = 0;
  const stillBlocked: typeof blocked = [];

  for (const bc of blocked) {
    const desc = bc.description.toLowerCase();
    let isResolved = false;
    let evidence = "";

    const tableMatch = desc.match(/(?:missing|create|add)\s+(\w+)\s+table/);
    if (tableMatch) {
      const tableName = tableMatch[1].replace(/_/g, "");
      const found = schemaTables.find(t => t.replace(/_/g, "") === tableName);
      if (found) {
        isResolved = true;
        evidence = `Table "${found}" exists in shared/schema.ts — constraint was a false positive`;
      }
    }

    const fileMatch = desc.match(/(?:missing|create|add)\s+([a-z0-9\/.\-_]+\.[a-z]+)/);
    if (!isResolved && fileMatch) {
      const filePath = fileMatch[1];
      if (fs.existsSync(path.join(process.cwd(), filePath))) {
        isResolved = true;
        evidence = `File "${filePath}" exists — constraint was a false positive`;
      }
    }

    if (isResolved) {
      const norm = bc.description.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const alreadyResolved = resolved.some(r => (r.normalised || "").includes(norm) || norm.includes(r.normalised || ""));
      if (!alreadyResolved) {
        resolved.push({
          description: bc.description,
          normalised: norm,
          evidence,
          resolvedAt: new Date().toISOString(),
        });
      }
      autoResolved++;
      console.log(`[Roadmap Reconcile] Auto-resolved blocked constraint: "${bc.description.slice(0, 80)}" — ${evidence}`);
    } else {
      stillBlocked.push(bc);
    }
  }

  if (autoResolved > 0) {
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify(stillBlocked, null, 2), "utf-8");
    fs.writeFileSync(RESOLVED_FILE, JSON.stringify(resolved, null, 2), "utf-8");
    console.log(`[Roadmap Reconcile] Auto-resolved ${autoResolved} phantom constraints, ${stillBlocked.length} genuinely blocked`);
  }

  return autoResolved;
}
