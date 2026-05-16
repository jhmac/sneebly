import Anthropic from "@anthropic-ai/sdk";
import client from "./anthropic-client";
import { logCost, getCostSummary } from "./cost-tracker";
import { buildSystemPrompt, getBudgetLimits } from "./identity";
import { shouldStopForBudget } from "./expense-tracker";
import { pushLiveOutput } from "./live-output";

export function checkBudgetOrThrow(): void {
  const check = shouldStopForBudget();
  if (check.stop) {
    const err = new Error('BUDGET_EXCEEDED');
    err.name = 'BudgetExceeded';
    throw err;
  }
  if (check.notify) {
    console.log(`[budget] ${check.message}`);
  }
}

export function extractJson(text: string): any | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}

export interface ClaudeCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  effort?: "low" | "medium" | "high" | "max";
  systemPrompt?: string;
  agent: string;
  task: string;
  feature?: string;
  context?: string;
  routerReason?: string;
}

const THINKING_BUDGETS: Record<string, number> = {
  low: 0,
  medium: 0,
  high: 8000,
  max: 16000,
};

export async function callClaude(
  prompt: string,
  options: ClaudeCallOptions
): Promise<{ text: string; inputTokens: number; outputTokens: number; cost: number }> {
  const model = options.model || "claude-sonnet-4-5";
  const systemText = options.systemPrompt || buildSystemPrompt();
  const effort = options.effort || "medium";

  checkBudgetOrThrow();

  const useThinking = (effort === "high" || effort === "max") && model.includes("opus-4-6");
  const thinkingBudget = THINKING_BUDGETS[effort] || 0;

  // max_tokens must be strictly greater than thinking.budget_tokens per Anthropic API rules
  const safeMaxTokens = useThinking
    ? Math.max(options.maxTokens || 0, thinkingBudget + 4096)
    : (options.maxTokens || 8192);

  const requestParams: any = {
    model,
    max_tokens: safeMaxTokens,
    system: [{
      type: "text" as const,
      text: systemText,
      cache_control: { type: "ephemeral" as const },
    }],
    messages: [{ role: "user", content: prompt }],
  };

  if (useThinking) {
    requestParams.thinking = { type: "enabled", budget_tokens: thinkingBudget };
  } else {
    requestParams.temperature = options.temperature ?? 0.3;
  }

  if (useThinking) {
    console.log(`[Claude] Ultrathink enabled — thinking budget: ${thinkingBudget} tokens`);
  }

  const response = await client.messages.create(requestParams);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");

  const thinkingText = response.content
    .filter((b: any) => b.type === "thinking")
    .map((b: any) => b.thinking || "")
    .join("");

  if (thinkingText && process.env.DEBUG_THINKING) {
    console.log(`[Claude/Thinking] ${thinkingText.slice(0, 500)}...`);
  }

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const cacheReadTokens = (response.usage as any)?.cache_read_input_tokens || 0;
  const cacheWriteTokens = (response.usage as any)?.cache_creation_input_tokens || 0;

  const costEntry = logCost({
    agent: options.agent,
    model,
    cost: 0,
    action: options.task,
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheReadTokens || undefined,
    cacheWriteTokens: cacheWriteTokens || undefined,
    task: options.task,
    feature: options.feature || "general",
    context: options.context,
    routerReason: options.routerReason,
  });

  pushLiveOutput({
    timestamp: new Date().toISOString(),
    agent: options.agent,
    task: options.task,
    model,
    text,
    inputTokens,
    outputTokens,
    cost: costEntry.cost,
  });

  return { text, inputTokens, outputTokens, cost: costEntry.cost };
}
