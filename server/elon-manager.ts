import { spawn, execFile, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { callClaude, extractJson } from "./utils";
import { triggerAutoFixer } from "./auto-fixer";

const SNEEBLY_DIR = path.join(process.cwd(), ".sneebly");
const ELON_MONITOR_FILE = path.join(SNEEBLY_DIR, "elon-monitor.json");
const NEEDS_ATTENTION_FILE = path.join(process.cwd(), "NEEDS-ATTENTION.md");
const PERSISTENT_ERRORS_FILE = path.join(SNEEBLY_DIR, "persistent-errors.json");
const PERSISTENT_ERROR_THRESHOLD = 3;

const ELON_BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

interface ElonState {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  cycles: number;
  lastConstraint: string | null;
  specsGenerated: number;
  output: string[];
  errors: string[];
}

export interface ElonMonitorFinding {
  type: "typescript_error" | "health_check" | "slow_endpoint" | "needs_attention" | "info";
  severity: "error" | "warning" | "info";
  message: string;
  detail?: string;
}

export interface SlowEndpointResult {
  endpoint: string;
  durationMs: number;
  slow: boolean;
  error: boolean;
}

export interface ElonMonitorResult {
  runAt: string;
  monitorCycles: number;
  findings: ElonMonitorFinding[];
  diagnosis: string;
  selfHealTriggered: boolean;
  tscErrors: string;
  healthOk: boolean;
  needsAttentionItems: number;
  slowEndpoints?: SlowEndpointResult[];
}

const MAX_OUTPUT_LINES = 200;

let elonProcess: ChildProcess | null = null;
const state: ElonState = {
  running: false,
  pid: null,
  startedAt: null,
  cycles: 0,
  lastConstraint: null,
  specsGenerated: 0,
  output: [],
  errors: [],
};

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let monitorCycles = 0;
let isMonitorRunning = false;

function ensureDir(): void {
  if (!fs.existsSync(SNEEBLY_DIR)) fs.mkdirSync(SNEEBLY_DIR, { recursive: true });
}

function appendOutput(line: string) {
  state.output.push(line);
  if (state.output.length > MAX_OUTPUT_LINES) {
    state.output = state.output.slice(-MAX_OUTPUT_LINES);
  }

  const cycleMatch = line.match(/Cycle (\d+):/);
  if (cycleMatch) state.cycles = parseInt(cycleMatch[1]);

  const constraintMatch = line.match(/Constraint — (.+)/);
  if (constraintMatch) state.lastConstraint = constraintMatch[1];

  const specMatch = line.match(/Build cycle generated (\d+) specs/);
  if (specMatch) state.specsGenerated += parseInt(specMatch[1]);
}

export function startElon(options?: { maxCycles?: number; budget?: number }): { started: boolean; error?: string } {
  if (elonProcess && state.running) {
    return { started: false, error: "ELON is already running" };
  }

  const scriptPath = path.join(process.cwd(), "scripts", "run-elon.sh");
  if (!fs.existsSync(scriptPath)) {
    return { started: false, error: "ELON script not found" };
  }

  state.output = [];
  state.errors = [];
  state.cycles = 0;
  state.lastConstraint = null;
  state.specsGenerated = 0;

  const args: string[] = [];
  if (options?.maxCycles) args.push("--max-cycles", String(options.maxCycles));
  if (options?.budget) args.push("--budget", String(options.budget));

  try {
    elonProcess = spawn("bash", [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    state.running = true;
    state.pid = elonProcess.pid || null;
    state.startedAt = new Date().toISOString();

    elonProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(l => l.trim());
      lines.forEach(appendOutput);
    });

    elonProcess.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(l => l.trim());
      lines.forEach(l => {
        state.errors.push(l);
        if (state.errors.length > 50) state.errors = state.errors.slice(-50);
      });
    });

    elonProcess.on("close", (code) => {
      state.running = false;
      state.pid = null;
      appendOutput(`[ELON] Process exited with code ${code}`);
      elonProcess = null;
    });

    elonProcess.on("error", (err) => {
      state.running = false;
      state.pid = null;
      state.errors.push(`[ELON] Process error: ${err.message}`);
      elonProcess = null;
    });

    console.log(`[ELON Manager] Started ELON (pid: ${state.pid})`);
    return { started: true };
  } catch (err: any) {
    return { started: false, error: err.message };
  }
}

export function stopElon(): { stopped: boolean } {
  if (!elonProcess || !state.running) {
    state.running = false;
    return { stopped: true };
  }

  try {
    elonProcess.kill("SIGTERM");
    setTimeout(() => {
      if (elonProcess && state.running) {
        try { elonProcess.kill("SIGKILL"); } catch {}
      }
    }, 5000);
  } catch {}

  state.running = false;
  state.pid = null;
  appendOutput("[ELON] Stopped by user");
  return { stopped: true };
}

export function getElonState(): ElonState {
  if (state.pid && state.running) {
    try {
      process.kill(state.pid, 0);
    } catch {
      state.running = false;
      state.pid = null;
    }
  }
  return { ...state };
}

export function getElonOutput(last = 50): string[] {
  return state.output.slice(-last);
}

function runTsc(): Promise<string> {
  return new Promise((resolve) => {
    execFile("npx", ["tsc", "--noEmit", "--pretty", "false"], { cwd: process.cwd(), timeout: 45000, maxBuffer: 1024 * 1024 }, (_error: Error | null, stdout: string, stderr: string) => {
      const output = ((stdout || "") + (stderr || "")).trim();
      if (!output) {
        resolve("");
      } else {
        const lines = output.split("\n").slice(0, 20).join("\n");
        resolve(lines);
      }
    });
  });
}

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("curl", ["-sf", `${ELON_BASE_URL}/api/health`], { timeout: 10000 }, (_error: Error | null, stdout: string) => {
      if (!stdout) {
        resolve(false);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed.status === "healthy" || parsed.status === "ok" || parsed.success === true);
      } catch {
        resolve(stdout.includes("healthy") || stdout.includes("ok") || stdout.includes("success"));
      }
    });
  });
}

const SLOW_ENDPOINT_THRESHOLD_MS = 3000;
const ENDPOINTS_TO_PROBE = ["/api/health", "/api/projects"];

function probeEndpoint(endpoint: string): Promise<SlowEndpointResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    execFile(
      "curl",
      ["-sf", "-o", "/dev/null", "-w", "%{http_code}", `${ELON_BASE_URL}${endpoint}`],
      { timeout: SLOW_ENDPOINT_THRESHOLD_MS + 2000 },
      (_error: Error | null) => {
        const durationMs = Date.now() - start;
        resolve({
          endpoint,
          durationMs,
          slow: durationMs > SLOW_ENDPOINT_THRESHOLD_MS,
          error: !!_error,
        });
      }
    );
  });
}

async function checkSlowEndpoints(): Promise<SlowEndpointResult[]> {
  const results = await Promise.all(ENDPOINTS_TO_PROBE.map(probeEndpoint));
  return results;
}

interface PersistentErrorEntry {
  key: string;
  detail: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  escalated: boolean;
}

function loadPersistentErrors(): Record<string, PersistentErrorEntry> {
  try {
    if (!fs.existsSync(PERSISTENT_ERRORS_FILE)) return {};
    return JSON.parse(fs.readFileSync(PERSISTENT_ERRORS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function savePersistentErrors(data: Record<string, PersistentErrorEntry>): void {
  ensureDir();
  fs.writeFileSync(PERSISTENT_ERRORS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function makePersistentErrorKey(line: string): string {
  return line.replace(/\(\d+,\d+\):/g, "(:)").replace(/\s+/g, " ").trim().slice(0, 120);
}

const SAFE_NPM_PACKAGE_NAME = /^(@[a-z0-9-_]+\/)?[a-z0-9][a-z0-9\-_.]*$/i;

function validateNpmPackageName(pkg: string): boolean {
  if (!pkg || pkg.length > 214) return false;
  if (!SAFE_NPM_PACKAGE_NAME.test(pkg)) return false;
  const BLOCKED_NAMES = [".", "..", "__proto__", "constructor", "prototype"];
  if (BLOCKED_NAMES.includes(pkg.toLowerCase())) return false;
  return true;
}

async function runTscAndCountErrors(): Promise<number> {
  return new Promise<number>((resolve) => {
    execFile("npx", ["tsc", "--noEmit", "--pretty", "false"], {
      cwd: process.cwd(),
      timeout: 60000,
    }, (_error, stdout, stderr) => {
      const combined = `${stdout}\n${stderr}`;
      const count = (combined.match(/error TS\d+/g) || []).length;
      resolve(count);
    });
  });
}

async function detectAndInstallMissingPackages(tscErrors: string): Promise<void> {
  if (!tscErrors) return;

  const modulePattern = /Cannot find module '([^']+)'/g;
  const missing: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = modulePattern.exec(tscErrors)) !== null) {
    const moduleName = match[1];
    if (!moduleName.startsWith(".") && !moduleName.startsWith("/") && !moduleName.startsWith("@/")) {
      const packageName = moduleName.startsWith("@")
        ? moduleName.split("/").slice(0, 2).join("/")
        : moduleName.split("/")[0];
      if (!missing.includes(packageName)) missing.push(packageName);
    }
  }

  if (missing.length === 0) return;

  let packageJson: any = {};
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"));
  } catch {}

  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
  };

  for (const pkg of missing) {
    if (allDeps[pkg]) continue;

    if (!validateNpmPackageName(pkg)) {
      console.log(`[ELON Monitor] Skipping unsafe package name: "${pkg}" — failed validation`);
      continue;
    }

    const errorsBefore = (tscErrors.match(/error TS\d+/g) || []).length;
    console.log(`[ELON Monitor] Missing package detected: ${pkg} — auto-installing...`);

    const installed = await new Promise<boolean>((resolve) => {
      execFile("npm", ["install", "--ignore-scripts", pkg], {
        cwd: process.cwd(),
        timeout: 60000,
      }, (error, _stdout, stderr) => {
        if (error) {
          console.log(`[ELON Monitor] Auto-install failed for ${pkg}: ${stderr?.slice(0, 200)}`);
          resolve(false);
        } else {
          console.log(`[ELON Monitor] Auto-installed ${pkg} successfully — re-running TSC to verify...`);
          resolve(true);
        }
      });
    });

    if (installed) {
      const errorsAfter = await runTscAndCountErrors();
      const fixed = errorsAfter < errorsBefore;
      const note = fixed
        ? `TSC errors reduced from ${errorsBefore} → ${errorsAfter} after install.`
        : `TSC errors unchanged (${errorsAfter}) after install — package may not be the root cause.`;
      console.log(`[ELON Monitor] Post-install TSC check: ${note}`);
      const header = fs.existsSync(NEEDS_ATTENTION_FILE) ? "" : "# NEEDS ATTENTION\n\n---\n\n";
      fs.appendFileSync(
        NEEDS_ATTENTION_FILE,
        `${header}## Auto-installed missing package: ${pkg} (${new Date().toISOString()})\nTSC reported "Cannot find module '${pkg}'" — package installed automatically.\n${note}\n\n`
      );
    }
  }
}

function buildTscContext(tscErrors: string, errorKey: string): string {
  if (!tscErrors) return "";
  const lines = tscErrors.split("\n");
  const keyNormalized = errorKey.replace(/\(:\)/g, "").slice(0, 60).toLowerCase();
  const matchIdx = lines.findIndex(l => l.toLowerCase().includes(keyNormalized.slice(0, 40)));
  if (matchIdx < 0) return tscErrors.split("\n").filter(l => l.includes("error TS")).slice(0, 10).join("\n");
  const start = Math.max(0, matchIdx - 3);
  const end = Math.min(lines.length, matchIdx + 4);
  return lines.slice(start, end).join("\n");
}

async function trackPersistentErrors(tscErrors: string): Promise<void> {
  const existing = loadPersistentErrors();
  const now = new Date().toISOString();

  if (!tscErrors) {
    const cleared = Object.values(existing).filter(e => e.count > 0);
    if (cleared.length > 0) {
      console.log(`[ELON Monitor] TSC clean — clearing ${cleared.length} persistent error(s)`);
    }
    savePersistentErrors({});
    return;
  }

  const currentLines = tscErrors.split("\n").filter(l => l.includes("error TS"));
  const updatedErrors: Record<string, PersistentErrorEntry> = {};

  for (const line of currentLines) {
    const key = makePersistentErrorKey(line);
    const prev = existing[key];
    updatedErrors[key] = {
      key,
      detail: line.trim(),
      count: (prev?.count || 0) + 1,
      firstSeen: prev?.firstSeen || now,
      lastSeen: now,
      escalated: prev?.escalated || false,
    };
  }

  for (const [key, entry] of Object.entries(updatedErrors)) {
    if (entry.count >= PERSISTENT_ERROR_THRESHOLD && !entry.escalated) {
      console.log(`[ELON Monitor] Persistent TSC error (${entry.count} cycles) — escalating to auto-fixer: ${entry.detail.slice(0, 120)}`);

      const fileMatch = entry.detail.match(/^([\w\/\\.]+)\((\d+),(\d+)\)/);
      const filePath = fileMatch ? fileMatch[1] : "unknown";
      const lineNum = fileMatch ? fileMatch[2] : "?";

      const blockerId = `persistent-tsc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const blockersFile = path.join(SNEEBLY_DIR, "blockers.json");
      let blockers: any = { blockers: [] };
      try {
        if (fs.existsSync(blockersFile)) blockers = JSON.parse(fs.readFileSync(blockersFile, "utf-8"));
      } catch {}

      const tscContext = buildTscContext(tscErrors, key);
      blockers.blockers.push({
        id: blockerId,
        specId: `persistent-tsc-${key.slice(0, 40)}`,
        specFile: "",
        targetFile: filePath,
        description: `Persistent TypeScript error (${entry.count} monitor cycles): ${entry.detail}`,
        reason: `This TypeScript error has persisted for ${entry.count} consecutive ELON monitor cycles without being fixed.\n\nFile: ${filePath}, Line: ${lineNum}\n\nFull TSC context:\n${tscContext}`,
        attempts: 0,
        userInstructions: [],
        suggestedSkill: null,
        createdAt: now,
        status: "active",
      });
      fs.writeFileSync(blockersFile, JSON.stringify(blockers, null, 2), "utf-8");

      updatedErrors[key].escalated = true;
      console.log(`[ELON Monitor] Created auto-fixer blocker ${blockerId} for persistent error in ${filePath}`);

      triggerAutoFixer().catch(err => {
        console.log(`[ELON Monitor] Auto-fixer trigger error: ${err.message}`);
      });
    }
  }

  savePersistentErrors(updatedErrors);
}

function readNeedsAttention(): { items: number; content: string } {
  try {
    if (!fs.existsSync(NEEDS_ATTENTION_FILE)) return { items: 0, content: "" };
    const content = fs.readFileSync(NEEDS_ATTENTION_FILE, "utf-8");
    const items = (content.match(/^## /gm) || []).length;
    return { items, content: content.slice(0, 3000) };
  } catch {
    return { items: 0, content: "" };
  }
}

function saveMonitorResult(result: ElonMonitorResult): void {
  ensureDir();
  fs.writeFileSync(ELON_MONITOR_FILE, JSON.stringify(result, null, 2), "utf-8");
}

export function loadMonitorResult(): ElonMonitorResult | null {
  try {
    if (!fs.existsSync(ELON_MONITOR_FILE)) return null;
    return JSON.parse(fs.readFileSync(ELON_MONITOR_FILE, "utf-8"));
  } catch {
    return null;
  }
}

async function runMonitorCycle(): Promise<void> {
  if (isMonitorRunning) return;
  isMonitorRunning = true;
  monitorCycles++;

  console.log(`[ELON Monitor] Running continuous monitor cycle ${monitorCycles}...`);

  try {
    const { shouldStopForBudget } = await import("./expense-tracker");
    if (shouldStopForBudget().stop) {
      console.log("[ELON Monitor] Budget exceeded — skipping monitor cycle");
      isMonitorRunning = false;
      return;
    }

    const [initialTscErrors, healthOk, needsAttentionData, slowEndpoints] = await Promise.all([
      runTsc(),
      checkHealth(),
      Promise.resolve(readNeedsAttention()),
      checkSlowEndpoints(),
    ]);

    await detectAndInstallMissingPackages(initialTscErrors);

    // Re-run TSC after auto-install so persistent-error tracking reflects
    // the post-recovery state, not stale pre-install errors.
    const tscErrors = initialTscErrors ? await runTsc() : "";

    await trackPersistentErrors(tscErrors);

    const findings: ElonMonitorFinding[] = [];

    if (tscErrors) {
      findings.push({
        type: "typescript_error",
        severity: "error",
        message: "TypeScript compilation errors detected",
        detail: tscErrors.slice(0, 500),
      });
    }

    if (!healthOk) {
      findings.push({
        type: "health_check",
        severity: "error",
        message: "Health check endpoint is not responding correctly",
      });
    }

    if (needsAttentionData.items > 0) {
      findings.push({
        type: "needs_attention",
        severity: "warning",
        message: `${needsAttentionData.items} item(s) in NEEDS-ATTENTION.md require attention`,
        detail: needsAttentionData.content.slice(0, 300),
      });
    }

    const slowOnes = slowEndpoints.filter(ep => ep.slow && !ep.error);
    if (slowOnes.length > 0) {
      const detail = slowOnes.map(ep => `${ep.endpoint}: ${ep.durationMs}ms`).join(", ");
      findings.push({
        type: "slow_endpoint",
        severity: "warning",
        message: `${slowOnes.length} endpoint(s) exceeded ${SLOW_ENDPOINT_THRESHOLD_MS}ms response time`,
        detail,
      });
    }

    const failedProbes = slowEndpoints.filter(ep => ep.error);
    if (failedProbes.length > 0) {
      const detail = failedProbes.map(ep => ep.endpoint).join(", ");
      findings.push({
        type: "slow_endpoint",
        severity: "error",
        message: `${failedProbes.length} endpoint(s) failed to respond`,
        detail,
      });
    }

    if (findings.length === 0) {
      findings.push({
        type: "info",
        severity: "info",
        message: "All checks passed — no issues detected",
      });
    }

    let diagnosis = "System healthy.";
    let selfHealTriggered = false;

    {
      const findingsSummary = findings.map(f => `[${f.type}/${f.severity}] ${f.message}${f.detail ? ": " + f.detail.slice(0, 200) : ""}`).join("\n");
      const hasErrors = findings.some(f => f.severity === "error");
      const hasWarnings = findings.some(f => f.severity === "warning");

      try {
        const prompt = `You are ELON, the autonomous quality monitor for this TypeScript web app. You run every 10 minutes to proactively detect and diagnose issues.

## Current findings from scan cycle ${monitorCycles}:
${findingsSummary}

Diagnose all findings (errors, warnings, and informational) and determine if any can be self-healed automatically. Consider:
- TypeScript errors: can the auto-fixer resolve them?
- Health check failures: transient or structural?
- Slow endpoints: is this a query/memory leak/blocking call issue?
- NEEDS-ATTENTION items: are they actionable without human input?

Respond in JSON:
{
  "diagnosis": "Concise explanation of all findings and their likely cause",
  "canSelfHeal": true/false,
  "selfHealAction": "trigger_auto_fixer | none",
  "severity": "critical | high | medium | low | ok"
}`;

        const result = await callClaude(prompt, {
          model: "claude-opus-4-6",
          maxTokens: 1024,
          temperature: 0.2,
          agent: "elon-monitor",
          task: "monitor-diagnosis",
          feature: "elon-monitor",
        });

        const parsed = extractJson(result.text);
        if (parsed) {
          diagnosis = parsed.diagnosis || diagnosis;
          if (hasErrors && parsed.canSelfHeal && parsed.selfHealAction === "trigger_auto_fixer") {
            console.log("[ELON Monitor] Self-healing: triggering auto-fixer...");
            selfHealTriggered = true;
            triggerAutoFixer().catch(err => {
              console.log(`[ELON Monitor] Auto-fixer error: ${err.message}`);
            });
          }
        }
      } catch (err: any) {
        diagnosis = `Monitor cycle ${monitorCycles} diagnosis failed: ${err.message}`;
        if (hasErrors || hasWarnings) {
          console.log(`[ELON Monitor] Diagnosis error: ${err.message}`);
        }
      }
    }

    const monitorResult: ElonMonitorResult = {
      runAt: new Date().toISOString(),
      monitorCycles,
      findings,
      diagnosis,
      selfHealTriggered,
      tscErrors,
      healthOk,
      needsAttentionItems: needsAttentionData.items,
      slowEndpoints,
    };

    saveMonitorResult(monitorResult);
    const slowCount = slowOnes.length;
    console.log(`[ELON Monitor] Cycle ${monitorCycles} complete — ${findings.length} finding(s), health: ${healthOk ? "ok" : "FAILED"}, tsc: ${tscErrors ? "ERRORS" : "clean"}, slow endpoints: ${slowCount}`);
  } catch (err: any) {
    console.log(`[ELON Monitor] Cycle ${monitorCycles} error: ${err.message}`);
  } finally {
    isMonitorRunning = false;
  }
}

const MONITOR_INTERVAL_MS = 10 * 60 * 1000;

export function startElonMonitor(): void {
  if (monitorInterval) return;

  const persisted = loadMonitorResult();
  if (persisted && typeof persisted.monitorCycles === "number" && persisted.monitorCycles > monitorCycles) {
    monitorCycles = persisted.monitorCycles;
    console.log(`[ELON Monitor] Restored cycle count from persisted file: ${monitorCycles}`);
  }

  console.log(`[ELON Monitor] Starting continuous monitor (every ${MONITOR_INTERVAL_MS / 60000} minutes)`);

  setTimeout(() => {
    runMonitorCycle().catch(err => console.log(`[ELON Monitor] Initial run error: ${err.message}`));
  }, 60000);

  monitorInterval = setInterval(() => {
    runMonitorCycle().catch(err => console.log(`[ELON Monitor] Interval error: ${err.message}`));
  }, MONITOR_INTERVAL_MS);
}

export function stopElonMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[ELON Monitor] Stopped");
  }
}

export function getElonMonitorCycles(): number {
  return monitorCycles;
}
