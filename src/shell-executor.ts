import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { isPathSafe } from "./path-safety";
import { getSafePaths, getNeverModifyPaths } from "./identity";

const LOG_FILE = path.join(process.cwd(), ".sneebly", "shell-log.jsonl");

const ALLOWED_PREFIXES = [
  "npx drizzle-kit push",
  "npx drizzle-kit generate",
  "npx drizzle-kit migrate",
  "npx drizzle-kit studio",
  "npx drizzle-kit check",
  "npx tsc --noEmit",
  "npx tsc --version",
  "npx tsc -p",
  "tsc --noEmit",
  "tsc --version",
  "npm run ",
  "npm test",
  "npm ls",
  "npm install ",
  "npm uninstall ",
  "npx eslint",
  "npx prettier",
  "cat ",
  "ls ",
  "head ",
  "tail ",
  "wc ",
  "grep ",
  "find ",
  "echo ",
  "pwd",
  "which ",
  "mkdir ",
  "cp ",
  "mv ",
  "touch ",
  "diff ",
  "sort ",
  "uniq ",
  "sed ",
  "awk ",
  "git status",
  "git diff",
  "git log ",
  "git show ",
];

const BLOCKED_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+-r\s+\//i,
  /rm\s+--no-preserve-root/i,
  /rm\s+-rf\s+\//i,
  /git\s+push\s+.*--force/i,
  /git\s+push\s+-f/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-fd/i,
  /DROP\s+(TABLE|DATABASE|SCHEMA)/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*;?\s*$/i,
  /curl\s+.*\|\s*(bash|sh)/i,
  /wget\s+.*\|\s*(bash|sh)/i,
  /sudo\s+/i,
  /chmod\s+777/i,
  /pkill/i,
  /kill\s+-9/i,
  /shutdown/i,
  /reboot/i,
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\//i,
  /npm\s+publish/i,
  /npx\s+.*--yes\s+.*install/i,
  /npm\s+install\s+-g\s/i,
  /npm\s+install\s+--global/i,
  /&&/,
  /\|\s*(bash|sh|node|python)/i,
  /;\s*(rm|curl|wget|node)\s/i,
];

export interface ShellResult {
  command: string;
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
  blocked?: boolean;
}

const SAFE_NPM_SCRIPTS = [
  "build", "check", "lint", "dev", "start", "test",
  "typecheck", "format", "db:push", "db:generate", "db:migrate",
  "db:studio", "db:check", "preview", "clean",
];

const FILE_MUTATING_PREFIXES = ["mkdir ", "cp ", "mv ", "touch "];

function extractPathArgs(command: string): string[] {
  const parts = command.trim().split(/\s+/).slice(1);
  return parts.filter(p => !p.startsWith("-") && p.includes("/"));
}

function checkPathSafety(command: string): { safe: boolean; reason?: string } {
  const isMutating = FILE_MUTATING_PREFIXES.some(p => command.trim().startsWith(p));
  if (!isMutating) return { safe: true };

  const pathArgs = extractPathArgs(command);
  if (pathArgs.length === 0) return { safe: true };

  const safePaths = getSafePaths();
  const neverModify = getNeverModifyPaths();

  for (const arg of pathArgs) {
    if (!isPathSafe(arg, safePaths, neverModify)) {
      return { safe: false, reason: `Path "${arg}" is not in safe paths or is protected` };
    }
  }
  return { safe: true };
}

function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  const trimmed = command.trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: `Blocked by safety pattern: ${pattern.source}` };
    }
  }

  const matchesAllowlist = ALLOWED_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  if (!matchesAllowlist) {
    return { allowed: false, reason: `Command "${trimmed.slice(0, 40)}..." not in allowlist. Allowed prefixes: ${ALLOWED_PREFIXES.slice(0, 8).join(", ")}...` };
  }

  if (trimmed.startsWith("npm run ")) {
    const scriptName = trimmed.replace("npm run ", "").split(" ")[0];
    if (!SAFE_NPM_SCRIPTS.includes(scriptName)) {
      return { allowed: false, reason: `npm script "${scriptName}" not in safe script list. Allowed: ${SAFE_NPM_SCRIPTS.join(", ")}` };
    }
  }

  const pathCheck = checkPathSafety(trimmed);
  if (!pathCheck.safe) {
    return { allowed: false, reason: `Shell path safety: ${pathCheck.reason}` };
  }

  return { allowed: true };
}

function logCommand(result: ShellResult): void {
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const entry = {
      timestamp: new Date().toISOString(),
      command: result.command,
      success: result.success,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      blocked: result.blocked || false,
      error: result.error || null,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
      stdoutPreview: result.stdout.slice(0, 500),
      stderrPreview: result.stderr.slice(0, 500),
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch {}
}

export async function runShellCommand(
  command: string,
  options: {
    timeoutMs?: number;
    cwd?: string;
    maxOutputBytes?: number;
  } = {}
): Promise<ShellResult> {
  const {
    timeoutMs = 30000,
    cwd = process.cwd(),
    maxOutputBytes = 100000,
  } = options;

  const check = isCommandAllowed(command);
  if (!check.allowed) {
    const result: ShellResult = {
      command,
      success: false,
      exitCode: null,
      stdout: "",
      stderr: check.reason || "Command not allowed",
      durationMs: 0,
      error: check.reason,
      blocked: true,
    };
    logCommand(result);
    console.log(`[Shell] BLOCKED: ${command} — ${check.reason}`);
    return result;
  }

  console.log(`[Shell] Executing: ${command}`);
  const startTime = Date.now();

  return new Promise<ShellResult>((resolve) => {
    const child = exec(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: maxOutputBytes,
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      const result: ShellResult = {
        command,
        success: !error,
        exitCode: error?.code !== undefined ? (typeof error.code === "number" ? error.code : 1) : 0,
        stdout: stdout || "",
        stderr: stderr || "",
        durationMs,
        error: error?.message,
      };

      logCommand(result);

      if (result.success) {
        console.log(`[Shell] OK (${durationMs}ms): ${command}`);
      } else {
        console.log(`[Shell] FAILED (${durationMs}ms, exit ${result.exitCode}): ${command}`);
        if (result.stderr) {
          console.log(`[Shell] stderr: ${result.stderr.slice(0, 200)}`);
        }
      }

      resolve(result);
    });
  });
}

export function addAllowedPrefix(prefix: string): void {
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    ALLOWED_PREFIXES.push(prefix);
    console.log(`[Shell] Added allowed prefix: ${prefix}`);
  }
}

export function getShellLog(limit: number = 20): any[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n");
    return lines.slice(-limit).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
