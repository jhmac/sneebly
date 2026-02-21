import Anthropic from "@anthropic-ai/sdk";
import client from "./anthropic-client";
import { logCost, getCostSummary } from "./cost-tracker";
import { buildSystemPrompt, getBudgetLimits } from "./identity";

export function checkBudgetOrThrow(): void {
  const budget = getBudgetLimits();
  const summary = getCostSummary();
  if (budget && summary.totalAllTime >= budget.max) {
    const err = new Error('BUDGET_EXCEEDED');
    err.name = 'BudgetExceeded';
    throw err;
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
}

export async function callClaude(
  prompt: string,
  options: ClaudeCallOptions
): Promise<{ text: string; inputTokens: number; outputTokens: number; cost: number }> {
  const model = options.model || "claude-sonnet-4-5";
  const systemText = options.systemPrompt || buildSystemPrompt();

  checkBudgetOrThrow();

  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens || 8192,
    temperature: options.temperature ?? 0.3,
    system: [{
      type: "text" as const,
      text: systemText,
      cache_control: { type: "ephemeral" as const },
    }],
    messages: [{ role: "user", content: prompt }],
  } as any);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");

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
  });

  return { text, inputTokens, outputTokens, cost: costEntry.cost };
}
