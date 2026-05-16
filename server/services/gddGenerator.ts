/**
 * GDD Generator Service
 * 
 * Pure data transformation — takes project data from the DB
 * and formats it into a structured Markdown Game Design Document.
 * No AI calls, no side effects, just string building.
 */

interface ProjectData {
  name: string;
  genre?: string;
  concept?: string;
  description?: string;
  style_guide?: string;
  color_palettes?: string[];
}

interface StoryData {
  summary?: string;
  acts?: Array<{
    title: string;
    description: string;
    order?: number;
  }>;
  lore?: Array<{
    title: string;
    content: string;
  }>;
}

interface CharacterData {
  name: string;
  role?: string;
  backstory?: string;
  personality?: string;
  description?: string;
}

interface EnvironmentData {
  name: string;
  zone_type?: string;
  mood?: string;
  description?: string;
}

interface QuestData {
  title: string;
  type?: string;
  objectives?: string[];
  rewards?: string[];
  description?: string;
}

interface GDDInput {
  project: ProjectData;
  stories?: StoryData;
  characters?: CharacterData[];
  environments?: EnvironmentData[];
  quests?: QuestData[];
}

/**
 * Generates a complete Game Design Document in Markdown format.
 */
export function generateGDD(input: GDDInput): string {
  const sections: string[] = [];

  sections.push(buildHeader(input.project));
  sections.push(buildOverview(input.project));

  if (input.stories) {
    sections.push(buildStory(input.stories));
  }

  if (input.characters && input.characters.length > 0) {
    sections.push(buildCharacters(input.characters));
  }

  if (input.environments && input.environments.length > 0) {
    sections.push(buildEnvironments(input.environments));
  }

  if (input.quests && input.quests.length > 0) {
    sections.push(buildQuests(input.quests));
  }

  sections.push(buildArtDirection(input.project));
  sections.push(buildFooter());

  return sections.filter(Boolean).join('\n\n---\n\n');
}

function buildHeader(project: ProjectData): string {
  const timestamp = new Date().toISOString().split('T')[0];
  return [
    `# ${project.name} — Game Design Document`,
    '',
    `> Generated on ${timestamp}`,
  ].join('\n');
}

function buildOverview(project: ProjectData): string {
  const lines: string[] = [
    '## 1. Overview',
    '',
    `**Project Name:** ${project.name}`,
  ];

  if (project.genre) {
    lines.push(`**Genre:** ${project.genre}`);
  }

  if (project.concept) {
    lines.push('');
    lines.push('### Concept');
    lines.push('');
    lines.push(project.concept);
  }

  if (project.description) {
    lines.push('');
    lines.push('### Description');
    lines.push('');
    lines.push(project.description);
  }

  return lines.join('\n');
}

function buildStory(stories: StoryData): string {
  const lines: string[] = [
    '## 2. Story',
  ];

  if (stories.summary) {
    lines.push('');
    lines.push('### Summary');
    lines.push('');
    lines.push(stories.summary);
  }

  if (stories.acts && stories.acts.length > 0) {
    lines.push('');
    lines.push('### Acts');

    const sorted = [...stories.acts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const act of sorted) {
      lines.push('');
      lines.push(`#### ${act.title}`);
      lines.push('');
      lines.push(act.description);
    }
  }

  if (stories.lore && stories.lore.length > 0) {
    lines.push('');
    lines.push('### Lore');

    for (const entry of stories.lore) {
      lines.push('');
      lines.push(`#### ${entry.title}`);
      lines.push('');
      lines.push(entry.content);
    }
  }

  return lines.join('\n');
}

function buildCharacters(characters: CharacterData[]): string {
  const lines: string[] = [
    '## 3. Characters',
  ];

  for (const char of characters) {
    lines.push('');
    lines.push(`### ${char.name}`);
    lines.push('');

    if (char.role) {
      lines.push(`**Role:** ${char.role}`);
    }

    if (char.personality) {
      lines.push(`**Personality:** ${char.personality}`);
    }

    if (char.backstory) {
      lines.push('');
      lines.push('**Backstory:**');
      lines.push('');
      lines.push(char.backstory);
    }

    if (char.description) {
      lines.push('');
      lines.push(char.description);
    }
  }

  return lines.join('\n');
}

function buildEnvironments(environments: EnvironmentData[]): string {
  const lines: string[] = [
    '## 4. Environments',
  ];

  for (const env of environments) {
    lines.push('');
    lines.push(`### ${env.name}`);
    lines.push('');

    if (env.zone_type) {
      lines.push(`**Zone Type:** ${env.zone_type}`);
    }

    if (env.mood) {
      lines.push(`**Mood:** ${env.mood}`);
    }

    if (env.description) {
      lines.push('');
      lines.push(env.description);
    }
  }

  return lines.join('\n');
}

function buildQuests(quests: QuestData[]): string {
  const lines: string[] = [
    '## 5. Quests',
  ];

  for (const quest of quests) {
    lines.push('');
    lines.push(`### ${quest.title}`);
    lines.push('');

    if (quest.type) {
      lines.push(`**Type:** ${quest.type}`);
    }

    if (quest.description) {
      lines.push('');
      lines.push(quest.description);
    }

    if (quest.objectives && quest.objectives.length > 0) {
      lines.push('');
      lines.push('**Objectives:**');
      lines.push('');
      for (const obj of quest.objectives) {
        lines.push(`- ${obj}`);
      }
    }

    if (quest.rewards && quest.rewards.length > 0) {
      lines.push('');
      lines.push('**Rewards:**');
      lines.push('');
      for (const reward of quest.rewards) {
        lines.push(`- ${reward}`);
      }
    }
  }

  return lines.join('\n');
}

function buildArtDirection(project: ProjectData): string {
  const lines: string[] = [
    '## 6. Art Direction',
  ];

  if (project.style_guide) {
    lines.push('');
    lines.push('### Style Guide');
    lines.push('');
    lines.push(project.style_guide);
  }

  if (project.color_palettes && project.color_palettes.length > 0) {
    lines.push('');
    lines.push('### Color Palettes');
    lines.push('');
    for (const palette of project.color_palettes) {
      lines.push(`- ${palette}`);
    }
  }

  // If neither field is populated, still include the section as a placeholder
  if (!project.style_guide && (!project.color_palettes || project.color_palettes.length === 0)) {
    lines.push('');
    lines.push('*No art direction defined yet.*');
  }

  return lines.join('\n');
}

function buildFooter(): string {
  return [
    '*This document was auto-generated from project data. Edit the source records to update.*',
  ].join('\n');
}
