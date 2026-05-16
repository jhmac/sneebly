/**
 * Player Agent Prompt Templates
 *
 * Pure data templates for the four research phases of the Player Agent.
 * Each function takes pre-sanitized inputs (validated through GameConceptInputSchema)
 * and returns a structured prompt string with explicit JSON output format instructions
 * matching ResearchBibleSchema fields.
 *
 * SECURITY: These prompts are pure templates. All user-supplied content MUST be
 * sanitized through Zod (GameConceptInputSchema) before being passed here.
 * No raw user content is ever interpolated directly.
 */

// ─── Phase 1: Genre Detection ─────────────────────────────

/**
 * Builds a prompt that asks the AI to identify the primary genre, sub-genre,
 * themes, and target audience from a sanitized game concept.
 *
 * @param concept - Pre-sanitized game concept string (already passed through GameConceptInputSchema)
 * @returns Structured prompt string with JSON output format instructions
 */
export function buildGenreDetectionPrompt(concept: string): string {
  return `You are a game design research analyst. Analyze the following game concept and identify its genre classification.

GAME CONCEPT:
"""
${concept}
"""

Analyze this concept and respond with ONLY a valid JSON object matching this exact structure:

{
  "genre": "<primary genre, e.g. 'Platformer', 'RPG', 'Roguelike', 'Puzzle', 'Action-Adventure'>",
  "subGenre": "<sub-genre, e.g. 'Metroidvania', 'Tactical RPG', 'Bullet Hell', 'Match-3'>",
  "themes": ["<theme 1>", "<theme 2>", "<theme 3>"],
  "targetAudience": "<target audience description, e.g. 'Casual mobile gamers aged 18-35 who enjoy puzzle mechanics'>"
}

Rules:
- "genre" must be a single, well-known game genre.
- "subGenre" must be a recognized sub-classification within that genre.
- "themes" must be an array of 2-5 thematic elements (e.g. "exploration", "survival", "friendship", "cosmic horror").
- "targetAudience" must be a concise description of the ideal player demographic.
- Respond with ONLY the JSON object. No markdown, no explanation, no code fences.`;
}

// ─── Phase 2: Genre Research ──────────────────────────────

/**
 * Builds a prompt that deep-dives into genre conventions, art direction norms,
 * typical mechanics, and narrative frameworks for the detected genre.
 *
 * @param concept - Pre-sanitized game concept string
 * @param genre - Detected primary genre from Phase 1
 * @returns Structured prompt string with JSON output format instructions
 */
export function buildGenreResearchPrompt(concept: string, genre: string): string {
  return `You are a game design research analyst specializing in the "${genre}" genre. Conduct a deep research analysis for the following game concept.

GAME CONCEPT:
"""
${concept}
"""

DETECTED GENRE: ${genre}

Research this genre thoroughly and respond with ONLY a valid JSON object matching this exact structure:

{
  "artDirection": {
    "style": "<recommended art style, e.g. 'pixel-art 16-bit', 'hand-drawn watercolor', 'low-poly 3D'>",
    "colorPalette": ["<hex color 1>", "<hex color 2>", "<hex color 3>", "<hex color 4>", "<hex color 5>"],
    "references": ["<visual reference 1>", "<visual reference 2>", "<visual reference 3>"],
    "mood": "<overall visual mood, e.g. 'whimsical and vibrant', 'dark and atmospheric'>"
  },
  "mechanics": {
    "core": ["<core mechanic 1>", "<core mechanic 2>", "<core mechanic 3>"],
    "secondary": ["<secondary mechanic 1>", "<secondary mechanic 2>"],
    "inspirations": ["<mechanic inspiration from existing game 1>", "<mechanic inspiration 2>"]
  },
  "narrativeFramework": {
    "tone": "<narrative tone, e.g. 'lighthearted with moments of tension', 'grim and foreboding'>",
    "perspective": "<narrative perspective, e.g. 'third-person omniscient', 'first-person unreliable narrator'>",
    "worldBuilding": "<world-building approach, e.g. 'environmental storytelling with scattered lore items'>",
    "storyStructure": "<story structure, e.g. 'three-act linear', 'branching with multiple endings', 'emergent narrative'>"
  }
}

Rules:
- "artDirection.style" should be specific and actionable for an artist.
- "artDirection.colorPalette" must contain exactly 5 hex color codes (with # prefix) that define the game's visual identity.
- "artDirection.references" should name specific games, films, or art movements as visual references.
- "mechanics.core" should list 2-4 mechanics that define the moment-to-moment gameplay.
- "mechanics.secondary" should list 1-3 supporting mechanics.
- "mechanics.inspirations" should reference specific games that execute similar mechanics well.
- "narrativeFramework" fields should be concise but specific enough to guide a writer.
- Respond with ONLY the JSON object. No markdown, no explanation, no code fences.`;
}

// ─── Phase 3: Comparable Titles ───────────────────────────

/**
 * Builds a prompt that identifies 3-5 comparable titles with relevance scores
 * and key takeaways for each.
 *
 * @param concept - Pre-sanitized game concept string
 * @param genre - Detected primary genre from Phase 1
 * @returns Structured prompt string with JSON output format instructions
 */
export function buildComparableTitlesPrompt(concept: string, genre: string): string {
  return `You are a game industry analyst. Identify comparable titles for the following game concept.

GAME CONCEPT:
"""
${concept}
"""

GENRE: ${genre}

Identify 3-5 existing games that are most comparable to this concept. For each, explain why it's relevant and what lessons can be drawn from it.

Respond with ONLY a valid JSON object matching this exact structure:

{
  "competitiveAnalysis": [
    {
      "title": "<game title>",
      "relevance": "<high|medium|low> — <one-sentence explanation of why this title is comparable>",
      "takeaways": [
        "<specific lesson or insight 1>",
        "<specific lesson or insight 2>",
        "<specific lesson or insight 3>"
      ]
    }
  ]
}

Rules:
- Include between 3 and 5 comparable titles, ordered by relevance (most relevant first).
- "title" must be the actual name of a released or well-known game.
- "relevance" must start with "high", "medium", or "low" followed by a dash and a brief explanation.
- "takeaways" must contain 2-4 specific, actionable insights per title (not generic praise).
- Focus on what the concept can LEARN from each title — both successes and mistakes.
- Respond with ONLY the JSON object. No markdown, no explanation, no code fences.`;
}

// ─── Phase 4: Best Practices ──────────────────────────────

/**
 * Builds a prompt that extracts technical constraints, design best practices,
 * and pitfalls to avoid based on the concept, genre, and comparable titles.
 *
 * @param concept - Pre-sanitized game concept string
 * @param genre - Detected primary genre from Phase 1
 * @param comparables - Array of comparable title names from Phase 3
 * @returns Structured prompt string with JSON output format instructions
 */
export function buildBestPracticesPrompt(
  concept: string,
  genre: string,
  comparables: string[],
): string {
  const comparablesList = comparables.map((t) => `- ${t}`).join("\n");

  return `You are a senior game design consultant. Based on the following game concept, its genre, and comparable titles, extract technical constraints, design best practices, and pitfalls to avoid.

GAME CONCEPT:
"""
${concept}
"""

GENRE: ${genre}

COMPARABLE TITLES:
${comparablesList}

Provide a comprehensive best-practices analysis. Respond with ONLY a valid JSON object matching this exact structure:

{
  "technicalConstraints": {
    "engine": "<recommended engine or framework, e.g. 'Phaser 3', 'Unity 2D', 'Godot 4'>",
    "platform": "<target platform, e.g. 'Web (HTML5)', 'Mobile (iOS/Android)', 'PC/Console'>",
    "resolution": "<target resolution, e.g. '1920x1080', '800x600 pixel-art scaled', '360x640 portrait'>",
    "performanceBudget": "<performance constraints, e.g. 'Target 60fps, max 512MB RAM, <50MB initial download'>"
  },
  "bestPractices": [
    "<specific, actionable best practice 1>",
    "<specific, actionable best practice 2>",
    "<specific, actionable best practice 3>",
    "<specific, actionable best practice 4>",
    "<specific, actionable best practice 5>"
  ],
  "pitfallsToAvoid": [
    "<specific pitfall 1 — what to avoid and why>",
    "<specific pitfall 2 — what to avoid and why>",
    "<specific pitfall 3 — what to avoid and why>"
  ]
}

Rules:
- "technicalConstraints" should be realistic recommendations based on the concept's scope and genre.
- "bestPractices" must contain 5-8 specific, actionable recommendations drawn from lessons learned in the comparable titles.
- "pitfallsToAvoid" must contain 3-5 specific anti-patterns or common mistakes in this genre, with brief explanations of why they're harmful.
- Every recommendation should be concrete enough for a developer to act on immediately.
- Respond with ONLY the JSON object. No markdown, no explanation, no code fences.`;
}
