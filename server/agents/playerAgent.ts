import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import {
  ResearchBibleSchema,
  GameConceptInputSchema,
  type ResearchBible,
} from "@shared/schema";

// ─── Retry Utility ────────────────────────────────────────

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  factor: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  factor: 2,
};

/**
 * Retry wrapper with exponential backoff + jitter.
 * Retries up to `maxRetries` times. On each retry the delay is
 * `baseDelayMs * factor^attempt` plus a random jitter of 0–500 ms.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === opts.maxRetries) break;
      const delay =
        opts.baseDelayMs * Math.pow(opts.factor, attempt) +
        Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ─── Anthropic Client ─────────────────────────────────────

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Cannot run player agent.",
    );
  }
  return new Anthropic({ apiKey });
}

// ─── Prompt Construction ──────────────────────────────────

function buildResearchPrompt(
  gameType: string,
  description: string,
  gameContext: string,
): string {
  return `You are a senior game design researcher. Analyze the following game concept and produce a comprehensive research bible as a JSON object.

Game Type: ${gameType}
Description: ${description}
Additional Context: ${gameContext}

Return ONLY a valid JSON object (no markdown fences, no commentary) with the following structure:
{
  "genre": "primary genre string",
  "subGenre": "sub-genre string",
  "themes": ["theme1", "theme2"],
  "targetAudience": "description of target audience",
  "artDirection": {
    "style": "art style description",
    "colorPalette": ["#hex1", "#hex2"],
    "references": ["reference1", "reference2"],
    "mood": "mood description"
  },
  "mechanics": {
    "core": ["mechanic1", "mechanic2"],
    "secondary": ["mechanic1"],
    "inspirations": ["game or system that inspired these"]
  },
  "narrativeFramework": {
    "tone": "narrative tone",
    "perspective": "narrative perspective",
    "worldBuilding": "world building approach",
    "storyStructure": "story structure type"
  },
  "technicalConstraints": {
    "engine": "Phaser 3",
    "platform": "Web Browser",
    "resolution": "recommended resolution",
    "performanceBudget": "performance notes"
  },
  "competitiveAnalysis": [
    {
      "title": "Comparable Game Title",
      "relevance": "why it's relevant",
      "takeaways": ["lesson1", "lesson2"]
    }
  ]
}

Be specific and actionable. Base your analysis on real games and established design patterns. Include at least 3 comparable titles in the competitive analysis.`;
}

// ─── Core Agent Function ──────────────────────────────────

/**
 * Runs the Player Agent for a given project.
 *
 * 1. Reads the project from DB.
 * 2. Validates the game concept text (sanitization + prompt injection rejection).
 * 3. Calls Anthropic Claude to generate a research bible.
 * 4. Validates the AI response against ResearchBibleSchema.
 * 5. Writes the validated research_bible to the project.
 * 6. Logs an agent_run record.
 *
 * All errors are caught, logged to agent_runs with status='failed', and re-thrown.
 */
export async function runPlayerAgent(
  projectId: string,
): Promise<ResearchBible> {
  const startTime = Date.now();
  let agentRunId: string | undefined;

  try {
    // ── 1. Read project from DB ─────────────────────────
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Create an in-progress agent_run record
    const agentRun = await storage.createAgentRun({
      projectId,
      agentType: "player_agent",
      status: "running",
      startedAt: new Date(),
      inputContext: {
        gameType: project.gameType,
        description: project.description,
        hasGameContext: !!project.gameContext,
      },
    });
    agentRunId = agentRun.id;

    // ── 2. Validate game concept text ───────────────────
    // Combine available text fields into a single concept string
    const rawConcept = [
      project.description || "",
      project.gameContext || "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!rawConcept) {
      throw new Error(
        "Project has no description or game_context to analyze. Please add a game concept first.",
      );
    }

    // Sanitize and reject prompt injection attempts
    const validatedConcept = GameConceptInputSchema.parse(rawConcept);

    // ── 3. Construct the prompt ─────────────────────────
    const gameType = project.gameType || "platformer";
    const description = project.description || "";
    const gameContext = project.gameContext || "";

    // Re-validate individual fields too (they go into the prompt)
    if (description) GameConceptInputSchema.parse(description);
    if (gameContext) GameConceptInputSchema.parse(gameContext);

    const prompt = buildResearchPrompt(gameType, description, gameContext);

    // ── 4. Call Anthropic Claude with retry ─────────────
    const client = getAnthropicClient();

    const aiResponse = await withRetry(async () => {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract text content from the response
      const textBlock = message.content.find(
        (block) => block.type === "text",
      );
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in AI response");
      }
      return textBlock.text;
    });

    // ── 5. Parse and validate the AI response ───────────
    let parsedJson: unknown;
    try {
      // Strip markdown code fences if the model wrapped the JSON
      let cleaned = aiResponse.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\s*\n?/, "")
          .replace(/\n?```\s*$/, "");
      }
      parsedJson = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(
        `Failed to parse AI response as JSON: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`,
      );
    }

    // Add metadata before validation
    const withMeta = {
      ...(parsedJson as Record<string, unknown>),
      generatedAt: new Date().toISOString(),
      version: 1,
    };

    const researchBible = ResearchBibleSchema.parse(withMeta);

    // ── 6. Write research_bible to the project ──────────
    await storage.updateProject(projectId, {
      researchBible: researchBible as Record<string, unknown>,
    } as any);

    // ── 7. Log successful agent_run ─────────────────────
    const durationMs = Date.now() - startTime;
    await storage.updateAgentRun(agentRunId, {
      status: "completed",
      completedAt: new Date(),
      durationMs,
      outputResult: {
        genre: researchBible.genre,
        subGenre: researchBible.subGenre,
        themesCount: researchBible.themes?.length ?? 0,
        competitorsCount: researchBible.competitiveAnalysis?.length ?? 0,
        version: researchBible.version,
      },
    });

    console.log(
      `[PlayerAgent] Completed for project ${projectId} in ${durationMs}ms. Genre: ${researchBible.genre}`,
    );

    return researchBible;
  } catch (error) {
    // ── Log failure to agent_runs ────────────────────────
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error(
      `[PlayerAgent] Failed for project ${projectId}: ${errorMessage}`,
    );

    if (agentRunId) {
      try {
        await storage.updateAgentRun(agentRunId, {
          status: "failed",
          completedAt: new Date(),
          durationMs,
          errorMessage,
        });
      } catch (logErr) {
        // Don't let logging failure mask the original error
        console.error(
          "[PlayerAgent] Failed to log agent_run failure:",
          logErr,
        );
      }
    } else {
      // Agent run was never created — create a failed record
      try {
        await storage.createAgentRun({
          projectId,
          agentType: "player_agent",
          status: "failed",
          startedAt: new Date(startTime),
          completedAt: new Date(),
          durationMs,
          errorMessage,
        });
      } catch (logErr) {
        console.error(
          "[PlayerAgent] Failed to create failed agent_run record:",
          logErr,
        );
      }
    }

    // Re-throw so callers can handle it
    throw error;
  }
}
