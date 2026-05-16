import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const SNAPSHOTS_DIR = path.join(process.cwd(), ".sneebly", "snapshots");
const MAX_SNAPSHOTS = 50;

export interface Snapshot {
  id: string;
  timestamp: string;
  label: string;
  teamId?: string;
  filesModified: string[];
  commitHash: string;
  parentHash: string;
  autoCreated: boolean;
}

export interface SnapshotRegistry {
  snapshots: Snapshot[];
  lastUpdated: string;
}

function ensureDir(): void {
  if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

function registryPath(): string {
  return path.join(SNAPSHOTS_DIR, "registry.json");
}

function loadRegistry(): SnapshotRegistry {
  try {
    if (fs.existsSync(registryPath())) {
      return JSON.parse(fs.readFileSync(registryPath(), "utf-8"));
    }
  } catch {}
  return { snapshots: [], lastUpdated: new Date().toISOString() };
}

function saveRegistry(reg: SnapshotRegistry): void {
  ensureDir();
  reg.lastUpdated = new Date().toISOString();
  fs.writeFileSync(registryPath(), JSON.stringify(reg, null, 2));
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: process.cwd(), encoding: "utf-8", timeout: 15000 }).trim();
  } catch (e: any) {
    return e.stdout?.toString()?.trim() || "";
  }
}

function getCurrentCommit(): string {
  return git("rev-parse HEAD");
}

function getModifiedFiles(): string[] {
  const diff = git("diff --name-only HEAD");
  const staged = git("diff --cached --name-only");
  const untracked = git("ls-files --others --exclude-standard");
  const all = [...diff.split("\n"), ...staged.split("\n"), ...untracked.split("\n")]
    .map(f => f.trim())
    .filter(Boolean);
  return [...new Set(all)];
}

export function createSnapshot(label: string, opts?: { teamId?: string; autoCreated?: boolean }): Snapshot {
  ensureDir();
  const reg = loadRegistry();

  const modified = getModifiedFiles();

  try {
    git("add -A");
    git(`commit --allow-empty -m "snapshot: ${label.replace(/"/g, '\\"')}"`);
  } catch {}

  const commitHash = getCurrentCommit();
  const parentHash = git("rev-parse HEAD~1") || commitHash;

  const snapshot: Snapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    label,
    teamId: opts?.teamId,
    filesModified: modified,
    commitHash,
    parentHash,
    autoCreated: opts?.autoCreated ?? true,
  };

  reg.snapshots.push(snapshot);
  if (reg.snapshots.length > MAX_SNAPSHOTS) {
    reg.snapshots = reg.snapshots.slice(-MAX_SNAPSHOTS);
  }
  saveRegistry(reg);

  console.log(`[rollback] Snapshot created: "${label}" (${snapshot.id})`);
  return snapshot;
}

export function listSnapshots(limit?: number): Snapshot[] {
  const reg = loadRegistry();
  const snaps = reg.snapshots.slice().reverse();
  return limit ? snaps.slice(0, limit) : snaps;
}

export function getSnapshot(snapshotId: string): Snapshot | null {
  const reg = loadRegistry();
  return reg.snapshots.find(s => s.id === snapshotId) || null;
}

export function rollbackToSnapshot(snapshotId: string): { success: boolean; message: string; restoredFiles: string[] } {
  const reg = loadRegistry();
  const snapshot = reg.snapshots.find(s => s.id === snapshotId);

  if (!snapshot) {
    return { success: false, message: `Snapshot not found: ${snapshotId}`, restoredFiles: [] };
  }

  try {
    git("add -A");
    try {
      git(`commit --allow-empty -m "pre-rollback checkpoint"`);
    } catch {}

    const currentFiles = getModifiedFiles();

    git(`checkout ${snapshot.commitHash} -- .`);
    git("add -A");
    git(`commit --allow-empty -m "rollback to: ${snapshot.label.replace(/"/g, '\\"')}"`);

    const restoredFiles = snapshot.filesModified.length > 0 ? snapshot.filesModified : currentFiles;

    const rollbackSnap: Snapshot = {
      id: `snap-${Date.now()}-rollback`,
      timestamp: new Date().toISOString(),
      label: `Rollback to: ${snapshot.label}`,
      filesModified: restoredFiles,
      commitHash: getCurrentCommit(),
      parentHash: snapshot.commitHash,
      autoCreated: true,
    };
    reg.snapshots.push(rollbackSnap);
    saveRegistry(reg);

    console.log(`[rollback] Rolled back to "${snapshot.label}" (${snapshot.id})`);
    return {
      success: true,
      message: `Successfully rolled back to "${snapshot.label}" from ${new Date(snapshot.timestamp).toLocaleString()}`,
      restoredFiles,
    };
  } catch (e: any) {
    return {
      success: false,
      message: `Rollback failed: ${e.message}`,
      restoredFiles: [],
    };
  }
}

export function rollbackLastN(n: number = 1): { success: boolean; message: string; restoredFiles: string[] } {
  const reg = loadRegistry();
  if (reg.snapshots.length < n + 1) {
    return { success: false, message: `Not enough snapshots to roll back ${n} steps`, restoredFiles: [] };
  }

  const targetIndex = reg.snapshots.length - 1 - n;
  const target = reg.snapshots[targetIndex];
  return rollbackToSnapshot(target.id);
}

export function diffSinceSnapshot(snapshotId: string): { files: string[]; summary: string } {
  const snapshot = getSnapshot(snapshotId);
  if (!snapshot) return { files: [], summary: "Snapshot not found" };

  const diff = git(`diff --stat ${snapshot.commitHash} HEAD`);
  const files = git(`diff --name-only ${snapshot.commitHash} HEAD`)
    .split("\n")
    .filter(Boolean);

  return { files, summary: diff || "No changes" };
}

export function getSnapshotsByTeam(teamId: string): Snapshot[] {
  const reg = loadRegistry();
  return reg.snapshots.filter(s => s.teamId === teamId).reverse();
}

export function formatSnapshotForChat(snap: Snapshot): string {
  const age = timeAgo(new Date(snap.timestamp).getTime());
  const files = snap.filesModified.length > 0
    ? snap.filesModified.slice(0, 5).join(", ") + (snap.filesModified.length > 5 ? ` +${snap.filesModified.length - 5} more` : "")
    : "no files tracked";
  return `**${snap.label}** (${age})\n  ID: \`${snap.id}\`\n  Files: ${files}${snap.teamId ? `\n  Team: ${snap.teamId}` : ""}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
