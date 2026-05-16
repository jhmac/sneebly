import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const MAX_OUTPUT = 8000;
const TIMEOUT_MS = 30000;

// Commands that are never allowed
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\b/,
  /\brmdir\b/,
  /\bdropdb\b/,
  /\bdrop\s+table\b/i,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  /\bkill\s+-9\b/,
  />\s*\/etc\//,
  /\bpasswd\b/,
];

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
}

export async function runCommand(command: string): Promise<ExecResult> {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return {
        stdout: "",
        stderr: `Blocked: command matched safety pattern "${pattern}"`,
        exitCode: 1,
        truncated: false,
      };
    }
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: TIMEOUT_MS,
      cwd: process.cwd(),
      env: { ...process.env },
    });

    const combinedOutput = stdout + (stderr ? "\nSTDERR:\n" + stderr : "");
    const truncated = combinedOutput.length > MAX_OUTPUT;
    return {
      stdout: stdout.slice(0, MAX_OUTPUT),
      stderr: stderr.slice(0, 2000),
      exitCode: 0,
      truncated,
    };
  } catch (err: any) {
    const stdout = (err.stdout || "").slice(0, MAX_OUTPUT);
    const stderr = (err.stderr || err.message || "Unknown error").slice(0, 2000);
    const truncated = (err.stdout || "").length > MAX_OUTPUT;
    return {
      stdout,
      stderr,
      exitCode: err.code ?? 1,
      truncated,
    };
  }
}

export function formatExecResult(result: ExecResult): string {
  const lines: string[] = [];
  if (result.stdout) lines.push(result.stdout.trimEnd());
  if (result.stderr) lines.push("--- stderr ---\n" + result.stderr.trimEnd());
  if (result.truncated) lines.push("[output truncated]");
  if (!lines.length) lines.push("(no output)");
  lines.push(`[exit code: ${result.exitCode}]`);
  return lines.join("\n");
}
