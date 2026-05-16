import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".sneebly");
const LIVE_FILE = path.join(DATA_DIR, "live-output.jsonl");
const MAX_ENTRIES = 50;

export interface LiveEntry {
  id: string;
  timestamp: string;
  agent: string;
  task: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// In-memory ring buffer — fast for polling
const ring: LiveEntry[] = [];

export function pushLiveOutput(entry: Omit<LiveEntry, "id">): void {
  const full: LiveEntry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...entry };
  ring.push(full);
  if (ring.length > MAX_ENTRIES) ring.shift();

  // Also append to disk so the command center can diff on "after"
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LIVE_FILE, JSON.stringify(full) + "\n", "utf-8");
  } catch {}
}

export function getLiveOutput(after?: string, limit = 20): LiveEntry[] {
  if (!after) return ring.slice(-limit);
  const idx = ring.findIndex(e => e.id === after);
  if (idx === -1) return ring.slice(-limit);
  return ring.slice(idx + 1).slice(-limit);
}

export function getLatestEntry(): LiveEntry | null {
  return ring.length > 0 ? ring[ring.length - 1] : null;
}
