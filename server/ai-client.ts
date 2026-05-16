/**
 * AI API Client — thin wrapper around the Gemini REST API.
 *
 * Exports:
 *   callAI(prompt, options?)  — makes the HTTP call, returns raw text response.
 *   buildSafePrompt(template, variables) — interpolates variables after Zod sanitization.
 *
 * No retry logic here — that lives in the pipeline runner.
 */

import { GameConceptInputSchema } from "@shared/schema";

export interface CallAIOptions {
  maxTokens?: number;
  temperature?: number;
}

/**
 * Calls the Gemini API with the given prompt and returns the raw text response.
 *
 * Reads GEMINI_API_KEY from process.env. Throws if the key is missing or the
 * API returns a non-OK status.
 */
export async function callAI(
  prompt: string,
  options?: CallAIOptions
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Cannot call AI API without credentials."
    );
  }

  const maxTokens = options?.maxTokens ?? 2048;
  const temperature = options?.temperature ?? 0.7;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `Gemini API error ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  // Extract text from the Gemini response structure:
  // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error(
      "Gemini API returned an unexpected response structure — no text found in candidates[0].content.parts[0].text"
    );
  }

  return text;
}

/**
 * Builds a prompt string by interpolating variables into a template.
 *
 * Every variable value is run through GameConceptInputSchema.parse() for
 * sanitization (strips control chars, enforces max length, rejects prompt
 * injection patterns). If any variable fails validation, this throws a
 * descriptive ZodError.
 *
 * Template placeholders use the format: {{variableName}}
 *
 * @example
 *   buildSafePrompt(
 *     "Design a {{genre}} game about {{concept}}",
 *     { genre: "platformer", concept: "a cat exploring ruins" }
 *   );
 *   // => "Design a platformer game about a cat exploring ruins"
 */
export function buildSafePrompt(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  for (const [key, rawValue] of Object.entries(variables)) {
    // Sanitize + validate each variable through the shared Zod schema.
    // Throws ZodError with a descriptive message if validation fails
    // (e.g. prompt injection detected, too long, etc.).
    const sanitized = GameConceptInputSchema.parse(rawValue);

    // Replace all occurrences of {{key}} in the template
    result = result.replaceAll(`{{${key}}}`, sanitized);
  }

  return result;
}
