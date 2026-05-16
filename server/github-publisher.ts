/**
 * GitHub Publisher — pushes committed changes via the GitHub REST API.
 *
 * Auth strategy (in priority order):
 *   1. GITHUB_TOKEN env var — works anywhere (local, CI, Docker, etc.)
 *   2. Replit connector proxy (@replit/connectors-sdk) — works inside Replit
 *      when no GITHUB_TOKEN is set.
 *
 * Push strategy:
 *   1. git add -A + git commit locally
 *   2. GitHub API: get remote HEAD → create blobs → create tree → create commit → patch ref
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const ROOT = process.cwd();
const GITHUB_OWNER = "jhmac";
const GITHUB_REPO = "sneebly";
const GITHUB_BRANCH = "main";
const GITHUB_API = "https://api.github.com";

export interface PublishResult {
  success: boolean;
  committed: boolean;
  pushed: boolean;
  commitHash?: string;
  commitMessage?: string;
  error?: string;
}

function run(cmd: string, opts?: { timeout?: number }): string {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: opts?.timeout ?? 15000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function hasUncommittedChanges(): boolean {
  try {
    // git add -A must be called first; then status --porcelain shows staged changes
    const status = run("git status --porcelain");
    return status.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers — two backends: GITHUB_TOKEN (direct) or Replit proxy
// ---------------------------------------------------------------------------

async function githubApiFetch(
  endpoint: string,
  method: string = "GET",
  body?: object,
  token?: string
): Promise<any> {
  const url = `${GITHUB_API}${endpoint}`;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status >= 400) {
    throw new Error(`GitHub API ${method} ${endpoint} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function githubApiProxy(
  endpoint: string,
  method: string = "GET",
  body?: object
): Promise<any> {
  // Dynamic import — only available inside Replit. Outside Replit, set GITHUB_TOKEN instead.
  let ReplitConnectors: any;
  try {
    ({ ReplitConnectors } = await import("@replit/connectors-sdk"));
  } catch {
    throw new Error(
      "GitHub push requires GITHUB_TOKEN env var when running outside Replit. " +
      "Set GITHUB_TOKEN to a Personal Access Token with 'repo' scope."
    );
  }
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy("github", endpoint, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (res.status >= 400) {
    throw new Error(`GitHub proxy ${method} ${endpoint} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function githubApi(
  endpoint: string,
  method: string = "GET",
  body?: object
): Promise<any> {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return githubApiFetch(endpoint, method, body, token);
  }
  // Fall back to Replit connector proxy
  return githubApiProxy(endpoint, method, body);
}

// ---------------------------------------------------------------------------
// Core push logic
// ---------------------------------------------------------------------------

function getChangedFiles(): string[] {
  try {
    const output = run(
      `git show --name-only --format="" HEAD`
    );
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function fileToBase64(relPath: string): string {
  const fullPath = path.resolve(ROOT, relPath);
  return fs.readFileSync(fullPath).toString("base64");
}

async function pushViaApi(
  commitMessage: string,
  changedFiles: string[]
): Promise<{ commitHash: string }> {
  const base = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

  // 1. Remote HEAD SHA
  const refData = await githubApi(`${base}/git/refs/heads/${GITHUB_BRANCH}`);
  const baseSha: string = refData.object?.sha;
  if (!baseSha) throw new Error("Could not get remote HEAD SHA");

  // 2. Base commit's tree SHA
  const baseCommit = await githubApi(`${base}/git/commits/${baseSha}`);
  const baseTree: string = baseCommit.tree?.sha;
  if (!baseTree) throw new Error("Could not get base tree SHA");

  // 3. Create blobs for changed files
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
  for (const relPath of changedFiles) {
    const fullPath = path.resolve(ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
      treeItems.push({ path: relPath, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await githubApi(`${base}/git/blobs`, "POST", {
      content: fileToBase64(relPath),
      encoding: "base64",
    });
    treeItems.push({ path: relPath, mode: "100644", type: "blob", sha: blob.sha });
  }

  if (treeItems.length === 0) throw new Error("No changed files to push");

  // 4. Create tree
  const tree = await githubApi(`${base}/git/trees`, "POST", {
    base_tree: baseTree,
    tree: treeItems,
  });

  // 5. Create commit
  const commit = await githubApi(`${base}/git/commits`, "POST", {
    message: commitMessage,
    tree: tree.sha,
    parents: [baseSha],
  });

  // 6. Update branch ref
  await githubApi(`${base}/git/refs/heads/${GITHUB_BRANCH}`, "PATCH", {
    sha: commit.sha,
    force: false,
  });

  return { commitHash: commit.sha.slice(0, 7) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Commit locally and push to GitHub via the REST API.
 * Non-fatal — failures are logged but do not stop the autonomy loop.
 */
export async function publishToGitHub(options: {
  featureId: string;
  featureTitle: string;
  filesModified: string[];
  cost: number;
  hypothesisChosen?: string;
}): Promise<PublishResult> {
  const result: PublishResult = {
    success: false,
    committed: false,
    pushed: false,
  };

  try {
    run("git add -A");

    if (!hasUncommittedChanges()) {
      console.log("[GitPublisher] Nothing new to commit — skipping");
      result.success = true;
      return result;
    }

    const filesSummary = options.filesModified.length > 0
      ? options.filesModified.slice(0, 5).join(", ") +
        (options.filesModified.length > 5 ? ` (+${options.filesModified.length - 5} more)` : "")
      : "no files tracked";
    const hypothesisNote = options.hypothesisChosen && options.hypothesisChosen !== "none"
      ? ` [hypothesis: ${options.hypothesisChosen}]`
      : "";

    const commitMessage =
      `feat(sneebly): ${options.featureTitle}${hypothesisNote}\n\n` +
      `Feature: ${options.featureId}\n` +
      `Files: ${filesSummary}\n` +
      `Build cost: $${options.cost.toFixed(4)}\n` +
      `Built autonomously by Sneebly`;

    result.commitMessage = commitMessage;

    run(`git commit -m ${JSON.stringify(commitMessage)}`);
    result.committed = true;
    result.commitHash = run("git rev-parse --short HEAD");
    console.log(`[GitPublisher] Committed locally: ${options.featureTitle} (${result.commitHash})`);

    const changedFiles = getChangedFiles();
    if (changedFiles.length === 0) changedFiles.push(...options.filesModified);

    const authMode = process.env.GITHUB_TOKEN ? "GITHUB_TOKEN" : "Replit connector";
    console.log(`[GitPublisher] Pushing via ${authMode}...`);

    const pushResult = await pushViaApi(commitMessage, changedFiles);
    result.commitHash = pushResult.commitHash;
    result.pushed = true;
    result.success = true;

    console.log(`[GitPublisher] Pushed (${result.commitHash}) via ${authMode}: ${options.featureTitle}`);
  } catch (err: any) {
    result.error = err.message?.slice(0, 300) ?? String(err);
    console.log(`[GitPublisher] Push failed (non-fatal): ${result.error}`);
  }

  // Append to publish log
  try {
    const logFile = path.join(ROOT, ".sneebly", "github-publish-log.json");
    const existing: any[] = fs.existsSync(logFile)
      ? JSON.parse(fs.readFileSync(logFile, "utf-8"))
      : [];
    existing.push({
      timestamp: new Date().toISOString(),
      featureId: options.featureId,
      featureTitle: options.featureTitle,
      ...result,
    });
    if (existing.length > 50) existing.splice(0, existing.length - 50);
    fs.writeFileSync(logFile, JSON.stringify(existing, null, 2), "utf-8");
  } catch {}

  return result;
}

export function getPublishLog(): Array<{
  timestamp: string;
  featureId: string;
  featureTitle: string;
  success: boolean;
  pushed: boolean;
  commitHash?: string;
  error?: string;
}> {
  try {
    const logFile = path.join(ROOT, ".sneebly", "github-publish-log.json");
    if (fs.existsSync(logFile)) {
      return JSON.parse(fs.readFileSync(logFile, "utf-8"));
    }
  } catch {}
  return [];
}
