import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const PROJECT_ROOT = process.cwd();
const HUMAN_TESTING_FILE = path.join(DATA_DIR, "human-testing.json");

const TRACKED_MD_FILES = [
  "GOALS.md",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "SPEC_ROADMAP.md",
];

const CHANGELOG_HEADER = "## Sneebly Change Log";
const CHANGELOG_SEPARATOR = "---";

interface ChangelogEntry {
  date: string;
  specId: string;
  summary: string;
  category: string;
}

export function stampMarkdownChangelog(
  filePath: string,
  specId: string,
  summary: string,
  category: string = "general"
): boolean {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(PROJECT_ROOT, filePath);

  if (!fs.existsSync(fullPath)) return false;

  const content = fs.readFileSync(fullPath, "utf-8");

  if (content.includes(`[${specId}]`)) return false;

  const date = new Date().toISOString().split("T")[0];
  const timestamp = new Date().toISOString().replace("T", " ").split(".")[0];
  const entry = `- **[${specId}]** (${timestamp}) — ${summary} [${category}]`;

  if (content.includes(CHANGELOG_HEADER)) {
    const headerIndex = content.indexOf(CHANGELOG_HEADER);
    const afterHeader = headerIndex + CHANGELOG_HEADER.length;
    const updated =
      content.slice(0, afterHeader) +
      "\n" +
      entry +
      content.slice(afterHeader);
    fs.writeFileSync(fullPath, updated, "utf-8");
  } else {
    const changelogBlock = `\n\n${CHANGELOG_SEPARATOR}\n\n${CHANGELOG_HEADER}\n${entry}\n`;
    fs.writeFileSync(fullPath, content + changelogBlock, "utf-8");
  }

  return true;
}

export function detectMdFilesInSpec(spec: any): string[] {
  const files: string[] = [];
  const specStr = JSON.stringify(spec).toLowerCase();

  for (const mdFile of TRACKED_MD_FILES) {
    if (specStr.includes(mdFile.toLowerCase())) {
      files.push(mdFile);
    }
  }

  if (spec.files && Array.isArray(spec.files)) {
    for (const file of spec.files) {
      const fileName =
        typeof file === "string" ? file : file.path || file.file || "";
      if (fileName.endsWith(".md") && !files.includes(path.basename(fileName))) {
        files.push(fileName);
      }
    }
  }

  return files;
}

export function onSpecApproved(specId: string, spec: any): void {
  const mdFiles = detectMdFilesInSpec(spec);
  const summary =
    spec.description ||
    spec.constraint ||
    spec.title ||
    "ELON-approved change";
  const category = spec.category || spec.type || "build";

  for (const mdFile of mdFiles) {
    stampMarkdownChangelog(mdFile, specId, summary, category);
  }
}

export interface HumanTestAlert {
  id: string;
  feature: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  specId?: string;
  createdAt: string;
  status: "pending" | "verified" | "failed" | "dismissed";
  verifiedAt?: string;
  notes?: string;
}

function loadHumanTestingAlerts(): HumanTestAlert[] {
  try {
    if (!fs.existsSync(HUMAN_TESTING_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(HUMAN_TESTING_FILE, "utf-8"));
    return data.alerts || [];
  } catch {
    return [];
  }
}

function saveHumanTestingAlerts(alerts: HumanTestAlert[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    HUMAN_TESTING_FILE,
    JSON.stringify({ alerts, lastUpdated: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

export function addHumanTestAlert(
  alert: Omit<HumanTestAlert, "id" | "createdAt" | "status">
): HumanTestAlert {
  const alerts = loadHumanTestingAlerts();

  const normalizedFeature = alert.feature.toLowerCase().replace(/\s+/g, " ").trim();
  const duplicate = alerts.find(a => {
    if (a.status !== "pending") return false;
    const existingFeature = a.feature.toLowerCase().replace(/\s+/g, " ").trim();
    return existingFeature === normalizedFeature && a.category === alert.category;
  });
  if (duplicate) return duplicate;

  const newAlert: HumanTestAlert = {
    ...alert,
    id: `hta-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  alerts.unshift(newAlert);
  if (alerts.length > 100) alerts.length = 100;
  saveHumanTestingAlerts(alerts);
  return newAlert;
}

export function getHumanTestAlerts(
  statusFilter?: string
): HumanTestAlert[] {
  const alerts = loadHumanTestingAlerts();
  if (statusFilter) {
    return alerts.filter((a) => a.status === statusFilter);
  }
  return alerts;
}

export function updateHumanTestAlert(
  id: string,
  update: Partial<Pick<HumanTestAlert, "status" | "notes">>
): HumanTestAlert | null {
  const alerts = loadHumanTestingAlerts();
  const alert = alerts.find((a) => a.id === id);
  if (!alert) return null;

  if (update.status) {
    alert.status = update.status;
    if (update.status === "verified" || update.status === "failed") {
      alert.verifiedAt = new Date().toISOString();
    }
  }
  if (update.notes !== undefined) alert.notes = update.notes;

  saveHumanTestingAlerts(alerts);
  return alert;
}

export function getChangelogForFile(filePath: string): ChangelogEntry[] {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(PROJECT_ROOT, filePath);

  if (!fs.existsSync(fullPath)) return [];

  const content = fs.readFileSync(fullPath, "utf-8");
  const entries: ChangelogEntry[] = [];

  const entryRegex =
    /- \*\*\[([^\]]+)\]\*\* \(([^)]+)\) — (.+?) \[([^\]]+)\]/g;
  let match;
  while ((match = entryRegex.exec(content)) !== null) {
    entries.push({
      specId: match[1],
      date: match[2],
      summary: match[3],
      category: match[4],
    });
  }

  return entries;
}
