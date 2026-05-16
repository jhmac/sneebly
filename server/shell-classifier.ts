import type { ShellResult } from "./shell-executor";
import { isCommandAllowed } from "./shell-executor";
import { callClaude, extractJson } from "./utils";

export type ShellSignal = "success" | "empty-result" | "safety-blocked" | "real-failure";

export interface ClassifiedResult {
  signal: ShellSignal;
  message: string;
}

// grep exits 1 when no lines match — that is not a build failure
const GREP_NO_MATCH_PREFIX = "grep ";
const SAFE_REDIRECT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\s+2>\/dev\/null/g, replacement: "" },
  { pattern: /\s+2>&1/g, replacement: "" },
  { pattern: /\s+>\s*\/dev\/null\s+2>&1/g, replacement: "" },
  { pattern: /\s+1>\/dev\/null/g, replacement: "" },
];

export function classifyShellResult(
  command: string,
  result: ShellResult
): ClassifiedResult {
  if (result.blocked) {
    return { signal: "safety-blocked", message: result.error || result.stderr };
  }

  if ((result.exitCode ?? 0) === 0) {
    return { signal: "success", message: "Command succeeded" };
  }

  const isGrepCommand = command.trim().startsWith(GREP_NO_MATCH_PREFIX);

  if (isGrepCommand && result.exitCode === 1 && !result.stderr.trim()) {
    return {
      signal: "empty-result",
      message: "grep returned no matches (exit 1 with no stderr) — not a build failure",
    };
  }

  return {
    signal: "real-failure",
    message: result.stderr || result.stdout || `Exit code ${result.exitCode}`,
  };
}

export interface RewrittenCommand {
  rewritten: string;
  strategy: string;
  canRetry: boolean;
}

export function sanitizeBlockedCommand(
  command: string,
  blockedReason: string
): RewrittenCommand {
  let rewritten = command;

  for (const { pattern, replacement } of SAFE_REDIRECT_PATTERNS) {
    rewritten = rewritten.replace(pattern, replacement);
  }

  if (rewritten !== command) {
    return {
      rewritten: rewritten.trim(),
      strategy: "stripped-safe-redirects",
      canRetry: true,
    };
  }

  if (blockedReason.includes("&&")) {
    const parts = command.split("&&").map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return {
        rewritten: parts[0],
        strategy: `split-on-&&: run first part only (${parts.length} parts total)`,
        canRetry: true,
      };
    }
  }

  return {
    rewritten: "",
    strategy: "no-deterministic-rewrite",
    canRetry: false,
  };
}

export async function rewriteBlockedCommandWithAI(
  command: string,
  blockedReason: string
): Promise<RewrittenCommand> {
  const deterministic = sanitizeBlockedCommand(command, blockedReason);
  if (deterministic.canRetry) return deterministic;

  const prompt = `A shell command was blocked by the Sneebly safety filter. Rewrite it into a safe equivalent that achieves the same goal.

## Blocked Command
\`\`\`
${command}
\`\`\`

## Blocked Reason
${blockedReason}

## Rules for the rewritten command
- Must NOT use: rm -rf, sudo, chmod 777, kill -9, /dev/ redirects, &&, pipe to bash/sh/node/python, npm publish, npm install -g
- Must NOT restart the server (no: npm run dev, npm run start, npm start)
- Must NOT use npm scripts not in this list: build, check, lint, test, typecheck, format, db:push, db:generate, db:migrate, db:studio, db:check, preview, clean
- Must be a single command (no chaining)
- Preferred alternatives: cat/grep/find/head/tail for reading, npx tsc --noEmit for type-checking
- If the original intent cannot be achieved safely, set canRewrite to false

Respond in JSON:
{
  "canRewrite": true/false,
  "rewritten": "the safe replacement command, or empty string if canRewrite is false",
  "reasoning": "why this rewrite is safe and equivalent"
}`;

  try {
    const result = await callClaude(prompt, {
      model: "claude-sonnet-4-5",
      maxTokens: 512,
      temperature: 0.1,
      agent: "command-rewriter",
      task: "rewrite-blocked-command",
      feature: "shell-safety",
    });

    const parsed = extractJson(result.text);
    if (!parsed || typeof parsed.canRewrite !== "boolean") {
      return { rewritten: "", strategy: "ai-parse-failed", canRetry: false };
    }

    if (!parsed.canRewrite || !parsed.rewritten) {
      return { rewritten: "", strategy: "ai-determined-unrewritable", canRetry: false };
    }

    const rewrittenCheck = isCommandAllowed(parsed.rewritten);
    if (!rewrittenCheck.allowed) {
      console.log(`[ShellClassifier] AI rewrite was itself blocked (${rewrittenCheck.reason}) — rejecting: ${parsed.rewritten}`);
      return { rewritten: "", strategy: "ai-rewrite-still-blocked", canRetry: false };
    }

    console.log(`[ShellClassifier] AI rewrote blocked command: "${parsed.rewritten}" (${parsed.reasoning?.slice(0, 80)})`);
    return {
      rewritten: parsed.rewritten,
      strategy: `ai-sonnet-rewrite: ${parsed.reasoning?.slice(0, 80) || ""}`,
      canRetry: true,
    };
  } catch (err: any) {
    console.log(`[ShellClassifier] AI rewrite call failed: ${err.message}`);
    return { rewritten: "", strategy: "ai-call-failed", canRetry: false };
  }
}

export interface PreflightIssue {
  command: string;
  reason: string;
  canRewrite: boolean;
  rewritten?: string;
  strategy?: string;
}

export function preflightCommands(
  commands: Array<{ command: string; description?: string; required?: boolean }>
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  for (const cmd of commands) {
    const result = isCommandAllowed(cmd.command);
    if (!result.allowed) {
      const sanitized = sanitizeBlockedCommand(cmd.command, result.reason || "");
      issues.push({
        command: cmd.command,
        reason: result.reason || "Command not allowed",
        canRewrite: sanitized.canRetry,
        rewritten: sanitized.canRetry ? sanitized.rewritten : undefined,
        strategy: sanitized.strategy,
      });
    }
  }

  return issues;
}
