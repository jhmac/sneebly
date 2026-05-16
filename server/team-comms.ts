import fs from "fs";
import path from "path";

const COMMS_DIR = path.join(process.cwd(), ".sneebly", "team-comms");
const MAX_MESSAGES = 500;

export type MessageType =
  | "discovery"
  | "dependency-request"
  | "dependency-fulfilled"
  | "escalation"
  | "completion"
  | "file-lock"
  | "file-unlock"
  | "status-update"
  | "swarm-request"
  | "knowledge-share"
  | "error-report";

export interface TeamMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string | "all" | "orchestrator";
  timestamp: string;
  payload: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface FileOwnership {
  filePath: string;
  ownedBy: string;
  lockedAt: string;
  reason: string;
}

interface CommsState {
  messages: TeamMessage[];
  fileOwnership: Record<string, FileOwnership>;
  lastUpdated: string;
}

function ensureDir(): void {
  if (!fs.existsSync(COMMS_DIR)) fs.mkdirSync(COMMS_DIR, { recursive: true });
}

function statePath(): string {
  return path.join(COMMS_DIR, "state.json");
}

function loadState(): CommsState {
  try {
    if (fs.existsSync(statePath())) {
      return JSON.parse(fs.readFileSync(statePath(), "utf-8"));
    }
  } catch {}
  return { messages: [], fileOwnership: {}, lastUpdated: new Date().toISOString() };
}

function saveState(state: CommsState): void {
  ensureDir();
  state.lastUpdated = new Date().toISOString();
  if (state.messages.length > MAX_MESSAGES) {
    state.messages = state.messages.slice(-MAX_MESSAGES);
  }
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

const listeners: Map<string, Array<(msg: TeamMessage) => void>> = new Map();

export function send(type: MessageType, from: string, to: string, payload: Record<string, any>): TeamMessage {
  const state = loadState();
  const msg: TeamMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type,
    from,
    to,
    timestamp: new Date().toISOString(),
    payload,
    acknowledged: false,
  };
  state.messages.push(msg);
  saveState(state);

  const targetListeners = listeners.get(to) || [];
  const allListeners = listeners.get("all") || [];
  [...targetListeners, ...allListeners].forEach(fn => {
    try { fn(msg); } catch {}
  });

  console.log(`[comms] ${from} → ${to}: ${type} | ${JSON.stringify(payload).slice(0, 100)}`);
  return msg;
}

export function subscribe(teamId: string, callback: (msg: TeamMessage) => void): () => void {
  if (!listeners.has(teamId)) listeners.set(teamId, []);
  listeners.get(teamId)!.push(callback);
  return () => {
    const list = listeners.get(teamId) || [];
    const idx = list.indexOf(callback);
    if (idx >= 0) list.splice(idx, 1);
  };
}

export function acknowledge(messageId: string, byTeam: string): boolean {
  const state = loadState();
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg) return false;
  msg.acknowledged = true;
  msg.acknowledgedBy = byTeam;
  msg.acknowledgedAt = new Date().toISOString();
  saveState(state);
  return true;
}

export function getMessages(opts?: { to?: string; from?: string; type?: MessageType; unacknowledgedOnly?: boolean; limit?: number }): TeamMessage[] {
  const state = loadState();
  let msgs = state.messages;

  if (opts?.to) msgs = msgs.filter(m => m.to === opts.to || m.to === "all");
  if (opts?.from) msgs = msgs.filter(m => m.from === opts.from);
  if (opts?.type) msgs = msgs.filter(m => m.type === opts.type);
  if (opts?.unacknowledgedOnly) msgs = msgs.filter(m => !m.acknowledged);

  msgs = msgs.reverse();
  if (opts?.limit) msgs = msgs.slice(0, opts.limit);
  return msgs;
}

export function claimFile(filePath: string, teamId: string, reason: string): { success: boolean; message: string } {
  const state = loadState();
  const existing = state.fileOwnership[filePath];
  if (existing && existing.ownedBy !== teamId) {
    return { success: false, message: `File ${filePath} is owned by team ${existing.ownedBy}: ${existing.reason}` };
  }
  state.fileOwnership[filePath] = {
    filePath,
    ownedBy: teamId,
    lockedAt: new Date().toISOString(),
    reason,
  };
  saveState(state);

  send("file-lock", teamId, "all", { filePath, reason });
  return { success: true, message: `File ${filePath} claimed by ${teamId}` };
}

export function releaseFile(filePath: string, teamId: string): boolean {
  const state = loadState();
  const existing = state.fileOwnership[filePath];
  if (!existing || existing.ownedBy !== teamId) return false;
  delete state.fileOwnership[filePath];
  saveState(state);

  send("file-unlock", teamId, "all", { filePath });
  return true;
}

export function releaseAllFiles(teamId: string): number {
  const state = loadState();
  let released = 0;
  for (const [filePath, ownership] of Object.entries(state.fileOwnership)) {
    if (ownership.ownedBy === teamId) {
      delete state.fileOwnership[filePath];
      released++;
    }
  }
  if (released > 0) saveState(state);
  return released;
}

export function getFileOwner(filePath: string): FileOwnership | null {
  const state = loadState();
  return state.fileOwnership[filePath] || null;
}

export function getAllFileOwnership(): Record<string, FileOwnership> {
  return loadState().fileOwnership;
}

export function canModifyFile(filePath: string, teamId: string): boolean {
  const owner = getFileOwner(filePath);
  return !owner || owner.ownedBy === teamId;
}

export function broadcastDiscovery(from: string, discovery: string, context?: Record<string, any>): TeamMessage {
  return send("discovery", from, "all", { discovery, ...context });
}

export function requestDependency(from: string, to: string, what: string, context?: Record<string, any>): TeamMessage {
  return send("dependency-request", from, to, { what, ...context });
}

export function fulfillDependency(from: string, to: string, what: string, result?: Record<string, any>): TeamMessage {
  return send("dependency-fulfilled", from, to, { what, ...result });
}

export function escalate(from: string, issue: string, context?: Record<string, any>): TeamMessage {
  return send("escalation", from, "orchestrator", { issue, ...context });
}

export function reportCompletion(from: string, summary: string, filesModified: string[]): TeamMessage {
  return send("completion", from, "orchestrator", { summary, filesModified });
}

export function getCommsStats(): {
  totalMessages: number;
  unacknowledged: number;
  filesOwned: number;
  recentActivity: TeamMessage[];
  byType: Record<string, number>;
} {
  const state = loadState();
  const byType: Record<string, number> = {};
  let unacknowledged = 0;

  for (const m of state.messages) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    if (!m.acknowledged) unacknowledged++;
  }

  return {
    totalMessages: state.messages.length,
    unacknowledged,
    filesOwned: Object.keys(state.fileOwnership).length,
    recentActivity: state.messages.slice(-10).reverse(),
    byType,
  };
}
