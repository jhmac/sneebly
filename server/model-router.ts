export interface ModelTask {
  action?: string;
  fileCount?: number;
  isRetry?: boolean;
  touchesSchema?: boolean;
  touchesAuth?: boolean;
  touchesPayments?: boolean;
  priorFailureCount?: number;
  description?: string;
  filePath?: string;
  isEscalation?: boolean;
}

export interface ModelSelection {
  model: string;
  effort: "low" | "medium" | "high" | "max";
  thinkingTokens?: number;
  reason: string;
}

const SCHEMA_KEYWORDS = [
  "schema", "migration", "drizzle", "pgtable", "column", "table",
  "database", "db", "storage", "istorage", "databasestorage",
];

const AUTH_KEYWORDS = [
  "auth", "clerk", "session", "token", "jwt", "login", "logout",
  "permission", "role", "credential",
];

const PAYMENT_KEYWORDS = [
  "payment", "stripe", "billing", "invoice", "subscription", "charge",
];

const COMPLEX_KEYWORDS = [
  "rollback", "refactor", "migrate", "cascade", "transaction",
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

export function selectModel(task: ModelTask): ModelSelection {
  const failures = task.priorFailureCount ?? 0;
  const fileCount = task.fileCount ?? 1;
  const desc = (task.description ?? "").toLowerCase();
  const fp = (task.filePath ?? "").toLowerCase();
  const combined = `${desc} ${fp}`;

  const touchesSchema = task.touchesSchema || containsAny(combined, SCHEMA_KEYWORDS);
  const touchesAuth = task.touchesAuth || containsAny(combined, AUTH_KEYWORDS);
  const touchesPayments = task.touchesPayments || containsAny(combined, PAYMENT_KEYWORDS);
  const isRollbackOrComplex = containsAny(combined, COMPLEX_KEYWORDS);

  if (task.isEscalation || failures >= 2) {
    return {
      model: "claude-opus-4-6",
      effort: "max",
      thinkingTokens: 16000,
      reason: `Opus max (ultrathink 16k): escalation after ${failures} failures`,
    };
  }

  if (task.isRetry || failures === 1) {
    return {
      model: "claude-opus-4-6",
      effort: "high",
      thinkingTokens: 8000,
      reason: `Opus high (thinking 8k): retry attempt (${failures} prior failure${failures !== 1 ? "s" : ""})`,
    };
  }

  if (fileCount > 1) {
    return {
      model: "claude-opus-4-6",
      effort: "high",
      thinkingTokens: 8000,
      reason: `Opus high: multi-file change (${fileCount} files)`,
    };
  }

  if (touchesSchema || touchesAuth || touchesPayments || isRollbackOrComplex) {
    const reason = touchesSchema ? "schema/storage/db" :
                   touchesAuth ? "auth/clerk" :
                   touchesPayments ? "payments/stripe" : "rollback/refactor/migrate";
    return {
      model: "claude-opus-4-6",
      effort: "medium",
      reason: `Opus medium: touches ${reason}`,
    };
  }

  return {
    model: "claude-sonnet-4-6",
    effort: "medium",
    reason: `Sonnet: simple single-file ${task.action ?? "modify"}, no sensitive domains`,
  };
}

export function taskFromSpec(spec: any, priorFailureCount = 0): ModelTask {
  const filePath: string = spec.filePath || "";
  const description: string = spec.description || spec.constraint || "";
  const action: string = spec.action || "modify";

  const touchesSchema =
    filePath.toLowerCase().includes("schema") ||
    filePath.toLowerCase().includes("storage") ||
    containsAny(description.toLowerCase(), SCHEMA_KEYWORDS);

  const touchesAuth = containsAny(description.toLowerCase(), AUTH_KEYWORDS) ||
                      containsAny(filePath.toLowerCase(), AUTH_KEYWORDS);
  const touchesPayments = containsAny(description.toLowerCase(), PAYMENT_KEYWORDS) ||
                          containsAny(filePath.toLowerCase(), PAYMENT_KEYWORDS);

  return {
    action,
    fileCount: 1,
    isRetry: priorFailureCount > 0,
    touchesSchema,
    touchesAuth,
    touchesPayments,
    priorFailureCount,
    description,
    filePath,
  };
}

export function logRouterDecision(selection: ModelSelection, context?: string): void {
  if (process.env.DEBUG_ROUTER) {
    console.log(`[ModelRouter] ${selection.model} @ ${selection.effort}${context ? ` | ${context}` : ""} — ${selection.reason}`);
  }
}
