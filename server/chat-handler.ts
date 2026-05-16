import client from "./anthropic-client";
import { logCost, calculateCost } from "./cost-tracker";
import { checkBudgetOrThrow } from "./utils";
import { runCommand, formatExecResult } from "./exec-tool";
import fs from "fs";
import path from "path";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  cost?: number;
}

interface ChatChannel {
  id: string;
  messages: ChatMessage[];
}

const MAX_HISTORY = 80;
const MAX_CONTEXT_MESSAGES = 20;
const HISTORY_DIR = path.join(process.cwd(), ".sneebly", "chat-history");

const channels: Record<string, ChatChannel> = {
  sneebly: { id: "sneebly", messages: [] },
  app: { id: "app", messages: [] },
};

function ensureDir() {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function saveChannel(channelId: string) {
  ensureDir();
  const ch = channels[channelId];
  if (!ch) return;
  try {
    fs.writeFileSync(
      path.join(HISTORY_DIR, channelId + ".json"),
      JSON.stringify(ch.messages, null, 2)
    );
  } catch (e) {
    console.error("Failed to save chat history for", channelId, e);
  }
}

function loadChannel(channelId: string) {
  ensureDir();
  const file = path.join(HISTORY_DIR, channelId + ".json");
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (Array.isArray(data)) {
        channels[channelId] = { id: channelId, messages: data };
      }
    } catch {}
  }
}

loadChannel("sneebly");
loadChannel("app");

function readFileSafe(filePath: string, maxLines = 80): string {
  try {
    const full = path.join(process.cwd(), filePath);
    if (!fs.existsSync(full)) return "";
    const content = fs.readFileSync(full, "utf-8");
    return content.split("\n").slice(0, maxLines).join("\n");
  } catch {
    return "";
  }
}

function getSneeblyContext(): string {
  const parts: string[] = [
    `You are a senior AI engineer embedded in the Sneebly autonomous agent system. You have a bash tool that lets you run ANY shell command directly. You are fully autonomous — you must NEVER ask the user to run a command for you. If something needs to be done, do it yourself with the bash tool.

SNEEBLY ARCHITECTURE:
- Autonomy Loop: Plan -> Build -> Verify -> Review cycle (server/autonomy-loop.ts)
- Planner Agent: Uses Opus for reasoning/planning (server/planner-agent.ts)
- Builder Agent: 2-step Opus pattern, medium -> high effort retry (server/builder-agent.ts)
- Verification Agent: Tests changes, checks health (server/verify-agent.ts)
- Cost Tracker: Real token-based pricing (server/cost-tracker.ts)
- Session Journal: Tracks cycle history (.sneebly/session-journal.json)
- Server runs at: http://localhost:5000

MANDATORY RULES — NEVER BREAK THESE:
1. NEVER tell the user to run a command. You have a bash tool — use it. Run curl, cat, grep, npx, node — whatever is needed.
2. NEVER say "I cannot execute this" or "you must run this". You CAN run it. Just call the bash tool.
3. NEVER ask the user to share file contents. Read files yourself with: cat server/some-file.ts | head -80
4. When the autonomy loop is stopped or paused, START IT YOURSELF: curl -s -X POST http://localhost:5000/api/sneebly-cc/autonomy/start
5. When something needs checking, CHECK IT. When something needs fixing, FIX IT. When something needs starting, START IT.
6. Only ask the user a question when you genuinely need a human decision (design preference, budget approval, feature choice).

HOW TO TAKE ACTION (do these yourself, do not ask the user):

Start autonomy loop:
  curl -s -X POST http://localhost:5000/api/sneebly-cc/autonomy/start

Stop autonomy loop:
  curl -s -X POST http://localhost:5000/api/sneebly-cc/autonomy/stop

Check autonomy status:
  curl -s http://localhost:5000/api/sneebly-cc/autonomy/state

Check TypeScript errors:
  npx tsc --noEmit 2>&1 | head -30

Check expenses:
  curl -s http://localhost:5000/api/sneebly-cc/expenses/summary

Set budget:
  curl -s -X POST http://localhost:5000/api/sneebly-cc/budget -H 'Content-Type: application/json' -d '{"limit":60,"mode":"stop"}'

Read a file:
  cat server/autonomy-loop.ts | head -60

Check server health:
  curl -s http://localhost:5000/api/health

Spawn agent team:
  curl -s -X POST http://localhost:5000/api/sneebly-cc/teams -H 'Content-Type: application/json' -d '{"name":"fix-team","role":"backend","goal":"Fix the routes.ts errors","files":["server/routes.ts"]}'

Roll back:
  curl -s -X POST http://localhost:5000/api/sneebly-cc/rollback-last -H 'Content-Type: application/json' -d '{"steps":1}'

Show snapshots:
  curl -s http://localhost:5000/api/sneebly-cc/snapshots

You have data in context below, but ALWAYS verify live state with bash commands before acting on it.`
  ];

  const contextFiles: Array<[string, string, number]> = [
    ["GOALS.md", "GOALS.md (excerpt)", 60],
    [".sneebly/progress.json", "Progress", 60],
    [".sneebly/current-plan.json", "Current Plan", 60],
    [".sneebly/session-journal.json", "Session Journal", 40],
    [".sneebly/blockers.json", "Blockers", 40],
    ["server/autonomy-loop.ts", "autonomy-loop.ts (top)", 60],
    ["server/planner-agent.ts", "planner-agent.ts (top)", 60],
    ["server/builder-agent.ts", "builder-agent.ts (top)", 60],
  ];

  for (const [file, label, lines] of contextFiles) {
    const content = readFileSafe(file, lines);
    if (content) {
      parts.push("=== " + label + " ===\n" + content);
    }
  }

  try {
    const { listTeams } = require("./agent-team");
    const teams = listTeams();
    if (teams.length > 0) {
      parts.push("=== Active Teams ===\n" + teams.map((t: any) => `${t.name} [${t.status}]: ${t.goal} (${t.steps.filter((s: any) => s.status === "done").length}/${t.steps.length} steps, $${t.totalCost.toFixed(2)})`).join("\n"));
    }
  } catch {}

  try {
    const { formatExpenseForChat } = require("./expense-tracker");
    parts.push("=== Expense Summary ===\n" + formatExpenseForChat());
  } catch {}

  try {
    const { listSnapshots } = require("./rollback");
    const snaps = listSnapshots(5);
    if (snaps.length > 0) {
      parts.push("=== Recent Snapshots ===\n" + snaps.map((s: any) => `${s.id}: ${s.label} (${s.timestamp})`).join("\n"));
    }
  } catch {}

  return parts.join("\n\n");
}

function getAppContext(): string {
  const parts: string[] = [
    `You are a senior full-stack engineer embedded in the AnimAItion.tools project. You have a bash tool that lets you run ANY shell command directly. You are fully autonomous — NEVER ask the user to run a command, read a file, or check something manually. Do it yourself.

TECH STACK:
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Wouter routing + TanStack Query
- Backend: Express 5 + TypeScript + Drizzle ORM + PostgreSQL
- Auth: Clerk OAuth
- UI: Dark mode, Framer Motion animations
- Server: http://localhost:5000

MANDATORY RULES — NEVER BREAK THESE:
1. NEVER tell the user to run a command. Use the bash tool. Run curl, cat, grep, npx — whatever is needed.
2. NEVER say "I cannot execute this" or "you must run this". You CAN run anything. Just call bash.
3. NEVER ask the user to share file contents. Read them yourself: cat server/routes.ts | head -80
4. When you find a bug, FIX IT. Edit the file with the bash tool (sed, node -e, or echo with redirection).
5. When you need live data (errors, DB state, API responses), FETCH IT with curl or query commands.
6. Only ask the user when you need a genuine human decision (design preference, feature scope, business logic).

HOW TO TAKE ACTION (run these yourself):

Check TypeScript errors:
  npx tsc --noEmit 2>&1 | grep "error TS" | head -20

Check server health:
  curl -s http://localhost:5000/api/health

Check DB tables:
  curl -s http://localhost:5000/api/sneebly/elon-status | node -e "const d=[];process.stdin.on('data',x=>d.push(x));process.stdin.on('end',()=>{const j=JSON.parse(Buffer.concat(d));console.log(j.dbTables)})"

Read a file:
  cat shared/schema.ts | head -100

Check recent errors:
  cat .sneebly/error-log.jsonl 2>/dev/null | tail -10

Run the autonomy loop:
  curl -s -X POST http://localhost:5000/api/sneebly-cc/autonomy/start

Check API endpoint:
  curl -s http://localhost:5000/api/projects

Always verify your understanding with bash before making changes. Check, then fix, then verify.`
  ];

  const contextFiles: Array<[string, string, number]> = [
    ["GOALS.md", "GOALS.md (current goals and progress)", 80],
    [".sneebly/current-plan.json", "Current Build Plan", 60],
    [".sneebly/progress.json", "Progress Tracker", 40],
    ["shared/schema.ts", "shared/schema.ts (excerpt)", 100],
    ["client/src/App.tsx", "App.tsx", 40],
    ["server/routes.ts", "server/routes.ts (excerpt)", 80],
    ["NEEDS-ATTENTION.md", "NEEDS-ATTENTION.md", 40],
    [".sneebly/last-verification.json", "Last Verification", 30],
    [".sneebly/error-log.jsonl", "Recent Errors", 30],
    [".sneebly/session-journal.json", "Session Journal (recent activity)", 30],
  ];

  for (const [file, label, lines] of contextFiles) {
    const content = readFileSafe(file, lines);
    if (content) {
      parts.push("=== " + label + " ===\n" + content);
    }
  }

  return parts.join("\n\n");
}

function ensureAlternatingRoles(messages: Array<{ role: string; content: string }>) {
  const cleaned: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role) {
      cleaned[cleaned.length - 1].content += "\n\n" + msg.content;
    } else {
      cleaned.push({ ...msg });
    }
  }
  if (cleaned.length > 0 && cleaned[0].role !== "user") {
    cleaned.shift();
  }
  return cleaned;
}

const BASH_TOOL = {
  name: "bash",
  description:
    "Run a shell command in the project root (/home/runner/workspace). " +
    "Use this to read files, check TypeScript errors, query the API, inspect logs, " +
    "or run any diagnostic command. stdout + stderr are returned. " +
    "Avoid destructive commands (rm -rf, drop table, etc). " +
    "Examples: `npx tsc --noEmit 2>&1 | head -30`, `curl -s http://localhost:5000/api/sneebly-cc/experiments/summary`, " +
    "`cat .sneebly/session-journal.json | tail -20`, `ls server/`",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
    },
    required: ["command"],
  },
};

function accumulateCost(usage: any, model: string): number {
  const inp = usage?.input_tokens || 0;
  const out = usage?.output_tokens || 0;
  const cr = usage?.cache_read_input_tokens || 0;
  const cw = usage?.cache_creation_input_tokens || 0;
  return calculateCost(model, inp, out, cr, cw);
}

export async function sendMessage(
  channelId: string,
  userMessage: string
): Promise<{ reply: string; cost: number }> {
  const ch = channels[channelId];
  if (!ch) throw new Error("Invalid channel: " + channelId);

  const userMsg: ChatMessage = {
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  ch.messages.push(userMsg);

  const systemPrompt =
    channelId === "sneebly" ? getSneeblyContext() : getAppContext();

  const model = "claude-sonnet-4-5";
  let totalCost = 0;
  let finalText = "";

  // Build the initial messages array from history
  const rawMessages = ch.messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const loopMessages: any[] = ensureAlternatingRoles(rawMessages);

  try {
    checkBudgetOrThrow();

    // Agentic tool loop — keeps running until Claude stops calling tools
    let iterations = 0;
    const MAX_TOOL_ITERS = 8;

    while (iterations < MAX_TOOL_ITERS) {
      iterations++;
      checkBudgetOrThrow();

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        temperature: 0.3,
        system: [
          {
            type: "text" as const,
            text: systemPrompt,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        tools: [BASH_TOOL as any],
        messages: loopMessages,
      } as any);

      totalCost += accumulateCost((response as any).usage, model);

      // Collect text from this turn
      const textBlocks = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text);
      if (textBlocks.length) {
        finalText = textBlocks.join("");
      }

      // If no tool calls, we're done
      const toolUseBlocks = response.content.filter(
        (b: any) => b.type === "tool_use"
      );
      if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
        break;
      }

      // Add assistant's response (with tool_use blocks) to loop messages
      loopMessages.push({ role: "assistant", content: response.content });

      // Execute each tool call and build tool_result blocks
      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        const cmd = (block as any).input?.command || "";
        console.log(`[chat-tool] Running: ${cmd}`);
        const result = await runCommand(cmd);
        const output = formatExecResult(result);
        console.log(`[chat-tool] Output (${output.length} chars)`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: (block as any).id,
          content: output,
        });
      }

      // Feed results back
      loopMessages.push({ role: "user", content: toolResults });
    }

    if (!finalText) finalText = "Done — no text response.";

    logCost({
      agent: "user-chat-" + channelId,
      model,
      cost: totalCost,
      action: "chat-message",
      context: userMessage.slice(0, 100),
      inputTokens: 0,
      outputTokens: 0,
      task: "user-chat",
      feature: channelId === "sneebly" ? "sneebly-dev" : "app-corrections",
    });
  } catch (err: any) {
    ch.messages.pop();
    saveChannel(channelId);
    throw err;
  }

  ch.messages.push({
    role: "assistant",
    content: finalText,
    timestamp: new Date().toISOString(),
    cost: totalCost,
  });

  if (ch.messages.length > MAX_HISTORY) {
    ch.messages = ch.messages.slice(-MAX_HISTORY);
  }
  saveChannel(channelId);

  return { reply: finalText, cost: totalCost };
}

export function getMessages(channelId: string): ChatMessage[] {
  return channels[channelId]?.messages || [];
}

export function clearMessages(channelId: string): void {
  if (channels[channelId]) {
    channels[channelId].messages = [];
    saveChannel(channelId);
  }
}

// ─── Streaming version ────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; command: string; iteration: number }
  | { type: "tool_result"; exitCode: number; preview: string; truncated: boolean }
  | { type: "reply"; text: string }
  | { type: "done"; cost: number; snapshotId: string | null }
  | { type: "error"; message: string };

// Detect if a shell command writes to the filesystem
function commandWritesFiles(cmd: string): boolean {
  return /\bsed\s+-i\b|>\s*\w|tee\s+|echo\s+.*>|\bnode\s+-e\b|\bcat\s+>/.test(cmd) ||
    /\bfs\b|\bwriteFile\b|\bmkdir\b/.test(cmd);
}

interface ImageAttachment {
  data: string;       // base64 encoded
  mediaType: string;  // e.g. "image/png"
}

export async function sendMessageStream(
  channelId: string,
  userMessage: string,
  onEvent: (evt: StreamEvent) => void,
  images?: ImageAttachment[]
): Promise<void> {
  const ch = channels[channelId];
  if (!ch) {
    onEvent({ type: "error", message: "Invalid channel: " + channelId });
    return;
  }

  const hasImages = images && images.length > 0;
  const storedContent = hasImages
    ? (userMessage ? `[image] ${userMessage}` : "[image]")
    : userMessage;

  const userMsg: ChatMessage = {
    role: "user",
    content: storedContent,
    timestamp: new Date().toISOString(),
  };
  ch.messages.push(userMsg);

  const systemPrompt =
    channelId === "sneebly" ? getSneeblyContext() : getAppContext();

  const model = "claude-sonnet-4-5";
  let totalCost = 0;
  let finalText = "";
  let snapshotId: string | null = null;

  // Build loop messages — inject vision content for the latest user turn if images present
  const rawMessages = ch.messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const loopMessages: any[] = ensureAlternatingRoles(rawMessages);

  // Replace the last user message with vision content if images were attached
  if (hasImages && loopMessages.length > 0) {
    const lastIdx = loopMessages.length - 1;
    if (loopMessages[lastIdx].role === "user") {
      const contentBlocks: any[] = images!.map((img) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType as any,
          data: img.data,
        },
      }));
      if (userMessage) {
        contentBlocks.push({ type: "text", text: userMessage });
      }
      loopMessages[lastIdx] = { role: "user", content: contentBlocks };
    }
  }

  try {
    checkBudgetOrThrow();
    onEvent({ type: "thinking", text: "Reading context..." });

    let iterations = 0;
    const MAX_TOOL_ITERS = 8;

    while (iterations < MAX_TOOL_ITERS) {
      iterations++;
      checkBudgetOrThrow();

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        temperature: 0.3,
        system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
        tools: [BASH_TOOL as any],
        messages: loopMessages,
      } as any);

      totalCost += accumulateCost((response as any).usage, model);

      const textBlocks = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text);
      if (textBlocks.length) finalText = textBlocks.join("");

      const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");
      if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") break;

      loopMessages.push({ role: "assistant", content: response.content });

      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        const cmd = (block as any).input?.command || "";

        // Create snapshot before first file-modifying command
        if (!snapshotId && commandWritesFiles(cmd)) {
          try {
            const { createSnapshot } = require("./rollback");
            const snap = createSnapshot(`chat-${channelId}-${Date.now()}`, { autoCreated: true });
            snapshotId = snap.id;
          } catch { /* rollback not available */ }
        }

        onEvent({ type: "tool_call", command: cmd, iteration: iterations });

        const result = await runCommand(cmd);
        const preview = (result.stdout || result.stderr).slice(0, 300).trim();

        onEvent({ type: "tool_result", exitCode: result.exitCode, preview, truncated: result.truncated });

        toolResults.push({
          type: "tool_result",
          tool_use_id: (block as any).id,
          content: formatExecResult(result),
        });
      }

      loopMessages.push({ role: "user", content: toolResults });
      onEvent({ type: "thinking", text: "Processing results..." });
    }

    if (!finalText) finalText = "Done.";

    logCost({
      agent: "user-chat-" + channelId,
      model,
      cost: totalCost,
      action: "chat-message-stream",
      context: userMessage.slice(0, 100),
      inputTokens: 0,
      outputTokens: 0,
      task: "user-chat",
      feature: channelId === "sneebly" ? "sneebly-dev" : "app-corrections",
    });

    ch.messages.push({ role: "assistant", content: finalText, timestamp: new Date().toISOString(), cost: totalCost });
    if (ch.messages.length > MAX_HISTORY) ch.messages = ch.messages.slice(-MAX_HISTORY);
    saveChannel(channelId);

    onEvent({ type: "reply", text: finalText });
    onEvent({ type: "done", cost: totalCost, snapshotId });
  } catch (err: any) {
    ch.messages.pop();
    saveChannel(channelId);
    onEvent({ type: "error", message: err?.message || "Unknown error" });
  }
}
