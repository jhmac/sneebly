import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import client from "./anthropic-client";
import { logCost } from "./cost-tracker";
import { buildSystemPrompt } from "./identity";
import { checkBudgetOrThrow } from "./utils";

const SESSIONS_DIR = path.join(process.cwd(), ".sneebly", "sessions");

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  purpose: string;
  messages: Message[];
  systemPrompt: string;
  createdAt: string;
  lastUsed: string;
  totalTokens: number;
  totalCost: number;
}

const activeSessions = new Map<string, Session>();

function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function saveSession(session: Session): void {
  ensureSessionsDir();
  fs.writeFileSync(path.join(SESSIONS_DIR, `${session.id}.json`), JSON.stringify(session, null, 2), "utf-8");
}

function loadSession(id: string): Session | null {
  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return null;
}

export function createSession(purpose: string, systemPromptOverride?: string): Session {
  const session: Session = {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    purpose,
    messages: [],
    systemPrompt: systemPromptOverride || buildSystemPrompt(),
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    totalTokens: 0,
    totalCost: 0,
  };
  activeSessions.set(session.id, session);
  saveSession(session);
  return session;
}

export async function chat(
  sessionId: string,
  userMessage: string,
  options?: { maxTokens?: number; temperature?: number; model?: string }
): Promise<{ response: string; session: Session }> {
  let session = activeSessions.get(sessionId) || loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.messages.push({ role: "user", content: userMessage });

  const maxCtx = 20;
  const messagesForApi = session.messages.length > maxCtx ? session.messages.slice(-maxCtx) : session.messages;
  const modelId = options?.model || "claude-sonnet-4-5";

  try {
    checkBudgetOrThrow();

    const response = await client.messages.create({
      model: modelId,
      max_tokens: options?.maxTokens || 8192,
      temperature: options?.temperature ?? 0.3,
      system: [{
        type: "text" as const,
        text: session.systemPrompt,
        cache_control: { type: "ephemeral" as const },
      }],
      messages: messagesForApi.map(m => ({ role: m.role, content: m.content })),
    } as any);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    const inputTokens = (response.usage as any)?.input_tokens || 0;
    const outputTokens = (response.usage as any)?.output_tokens || 0;
    const cacheReadTokens = (response.usage as any)?.cache_read_input_tokens || 0;
    const cacheWriteTokens = (response.usage as any)?.cache_creation_input_tokens || 0;

    session.messages.push({ role: "assistant", content: text });
    session.lastUsed = new Date().toISOString();
    session.totalTokens += inputTokens + outputTokens;

    const costEntry = logCost({
      agent: "claude-session",
      model: modelId,
      cost: 0,
      action: "chat",
      context: `session: ${session.purpose}`,
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheReadTokens || undefined,
      cacheWriteTokens: cacheWriteTokens || undefined,
      task: session.purpose,
      feature: session.purpose.startsWith("build-") ? "autonomy-build" : "general",
    });

    session.totalCost = (session.totalCost || 0) + costEntry.cost;
    activeSessions.set(sessionId, session);
    saveSession(session);

    return { response: text, session };
  } catch (error: any) {
    session.messages.pop();
    session.lastUsed = new Date().toISOString();
    activeSessions.set(sessionId, session);
    saveSession(session);
    throw error;
  }
}

export async function oneShot(
  prompt: string,
  options?: { systemPrompt?: string; maxTokens?: number; temperature?: number; task?: string; feature?: string; model?: string; effort?: "low" | "medium" | "high" | "max" }
): Promise<string> {
  const systemText = options?.systemPrompt || buildSystemPrompt();
  const modelId = options?.model || "claude-sonnet-4-5";

  checkBudgetOrThrow();

  const response = await client.messages.create({
    model: modelId,
    max_tokens: options?.maxTokens || 8192,
    temperature: options?.temperature ?? 0.3,
    system: [{
      type: "text" as const,
      text: systemText,
      cache_control: { type: "ephemeral" as const },
    }],
    messages: [{ role: "user", content: prompt }],
  } as any);

  const inputTokens = (response.usage as any)?.input_tokens || 0;
  const outputTokens = (response.usage as any)?.output_tokens || 0;
  const cacheReadTokens = (response.usage as any)?.cache_read_input_tokens || 0;
  const cacheWriteTokens = (response.usage as any)?.cache_creation_input_tokens || 0;

  logCost({
    agent: "claude-oneshot",
    model: modelId,
    cost: 0,
    action: "oneshot",
    context: options?.task || "oneshot-call",
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheReadTokens || undefined,
    cacheWriteTokens: cacheWriteTokens || undefined,
    task: options?.task || "oneshot",
    feature: options?.feature || "general",
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
}

export function getSession(sessionId: string): Session | null {
  return activeSessions.get(sessionId) || loadSession(sessionId);
}

export function listSessions(): { id: string; purpose: string; messageCount: number; lastUsed: string; totalCost: number }[] {
  ensureSessionsDir();
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const session = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
        return {
          id: session.id,
          purpose: session.purpose,
          messageCount: session.messages?.length || 0,
          lastUsed: session.lastUsed,
          totalCost: session.totalCost || 0,
        };
      })
      .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  } catch {
    return [];
  }
}

export function endSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}
