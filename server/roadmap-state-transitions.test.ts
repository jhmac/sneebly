import fs from "fs";
import path from "path";
import {
  loadRoadmap,
  saveRoadmap,
  getNextFeatures,
  markFeatureDone,
  markFeatureInProgress,
  resetFeatureStatus,
  type RoadmapFeature,
  type Roadmap,
} from "./roadmap-orchestrator";

const SNEEBLY_DIR = path.join(process.cwd(), ".sneebly");
const ROADMAP_FILE = path.join(SNEEBLY_DIR, "roadmap.json");
const ROADMAP_META = path.join(SNEEBLY_DIR, "roadmap-meta.json");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`${GREEN}PASS${RESET} ${testName}`);
    passed++;
  } else {
    console.error(`${RED}FAIL${RESET} ${testName}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function makeFeature(id: string, deps: string[] = []): RoadmapFeature {
  return {
    id,
    title: `Feature ${id}`,
    description: `Description of ${id}`,
    dependencies: deps,
    status: "pending",
  };
}

function makeRoadmap(features: RoadmapFeature[]): Roadmap {
  return {
    generatedAt: new Date().toISOString(),
    goalsHash: "test-hash-" + Date.now(),
    features,
  };
}

let originalRoadmap: string | null = null;
let originalMeta: string | null = null;

function backup() {
  originalRoadmap = fs.existsSync(ROADMAP_FILE) ? fs.readFileSync(ROADMAP_FILE, "utf-8") : null;
  originalMeta = fs.existsSync(ROADMAP_META) ? fs.readFileSync(ROADMAP_META, "utf-8") : null;
}

function restore() {
  if (originalRoadmap !== null) {
    fs.writeFileSync(ROADMAP_FILE, originalRoadmap, "utf-8");
  } else if (fs.existsSync(ROADMAP_FILE)) {
    fs.unlinkSync(ROADMAP_FILE);
  }
  if (originalMeta !== null) {
    fs.writeFileSync(ROADMAP_META, originalMeta, "utf-8");
  }
}

async function runTests() {
  console.log(`${YELLOW}Running roadmap state transition tests (against actual exported functions)...${RESET}\n`);

  if (!fs.existsSync(SNEEBLY_DIR)) {
    fs.mkdirSync(SNEEBLY_DIR, { recursive: true });
  }

  backup();

  try {
    {
      const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
      saveRoadmap(makeRoadmap(features));
      const ready = getNextFeatures();
      assert(
        ready.length === 3 && ready[0].id === "f1" && ready[1].id === "f2" && ready[2].id === "f3",
        "getNextFeatures: returns all independent features (cap applied at dispatch site)",
        `got ${JSON.stringify(ready.map(f => f.id))}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2", ["f1"]), makeFeature("f3", ["f1"])];
      saveRoadmap(makeRoadmap(features));
      const ready = getNextFeatures();
      assert(
        ready.length === 1 && ready[0].id === "f1",
        "getNextFeatures: dependency blocking — only root is ready",
        `got ${JSON.stringify(ready.map(f => f.id))}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2", ["f1"]), makeFeature("f3", ["f1"])];
      saveRoadmap(makeRoadmap(features));
      await markFeatureDone("f1");
      const roadmapAfter = loadRoadmap()!;
      assert(
        roadmapAfter.features.find(f => f.id === "f1")?.status === "done",
        "markFeatureDone: persists done status to roadmap file",
      );
      const ready = getNextFeatures();
      assert(
        ready.length === 2 && ready.some(f => f.id === "f2") && ready.some(f => f.id === "f3"),
        "getNextFeatures: dependency unlocking — completing f1 unlocks f2 and f3",
        `got ${JSON.stringify(ready.map(f => f.id))}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2")];
      saveRoadmap(makeRoadmap(features));
      await markFeatureInProgress("f1");
      const roadmapAfter = loadRoadmap()!;
      assert(
        roadmapAfter.features.find(f => f.id === "f1")?.status === "in_progress",
        "markFeatureInProgress: persists in_progress status to roadmap file",
      );
      const ready = getNextFeatures();
      assert(
        ready.length === 1 && ready[0].id === "f2",
        "getNextFeatures: excludes in_progress features",
        `got ${JSON.stringify(ready.map(f => f.id))}`
      );
    }

    {
      const features = [makeFeature("f1")];
      saveRoadmap(makeRoadmap(features));
      await markFeatureInProgress("f1");
      await resetFeatureStatus("f1");
      const roadmapAfter = loadRoadmap()!;
      const f = roadmapAfter.features.find(f => f.id === "f1")!;
      assert(
        f.status === "pending",
        "resetFeatureStatus: in_progress → pending",
        `got ${f.status}`
      );
    }

    {
      const features = [makeFeature("f1")];
      saveRoadmap(makeRoadmap(features));
      await markFeatureDone("f1");
      await resetFeatureStatus("f1");
      const roadmapAfter = loadRoadmap()!;
      const f = roadmapAfter.features.find(f => f.id === "f1")!;
      assert(
        f.status === "done",
        "resetFeatureStatus: does not reset done (only resets in_progress)",
        `got ${f.status}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
      saveRoadmap(makeRoadmap(features));
      await markFeatureDone("f1");
      await markFeatureDone("f2");
      await markFeatureDone("f3");
      const ready = getNextFeatures();
      const roadmapAfter = loadRoadmap()!;
      const allDone = roadmapAfter.features.every(f => f.status === "done");
      assert(
        allDone && ready.length === 0,
        "Roadmap complete: all done → no ready features",
        `allDone=${allDone}, ready=${ready.length}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2", ["f1"])];
      saveRoadmap(makeRoadmap(features));
      await markFeatureInProgress("f1");
      const ready = getNextFeatures();
      const roadmapAfter = loadRoadmap()!;
      const allDone = roadmapAfter.features.every(f => f.status === "done");
      assert(
        !allDone && ready.length === 0,
        "Roadmap-waiting: in_progress + dep-blocked → no ready, not complete",
        `allDone=${allDone}, ready=${ready.length}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2", ["f1"]), makeFeature("f3", ["f2"])];
      saveRoadmap(makeRoadmap(features));
      await markFeatureDone("f1");
      await markFeatureDone("f2");
      const ready = getNextFeatures();
      assert(
        ready.length === 1 && ready[0].id === "f3",
        "Transitive dependency chain: f3 only ready after f1→f2 both done",
        `got ${JSON.stringify(ready.map(f => f.id))}`
      );
    }

    {
      const features = [makeFeature("f1"), makeFeature("f2")];
      saveRoadmap(makeRoadmap(features));
      await Promise.all([markFeatureDone("f1"), markFeatureDone("f2")]);
      const roadmapAfter = loadRoadmap()!;
      assert(
        roadmapAfter.features.every(f => f.status === "done"),
        "Concurrent markFeatureDone: both features persist done (no lost updates)",
        `statuses: ${JSON.stringify(roadmapAfter.features.map(f => ({ id: f.id, status: f.status })))}`
      );
    }

  } finally {
    restore();
  }

  const totalCount = passed + failed;
  console.log(`\n${totalCount} tests: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ""}${failed} failed${RESET}`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
