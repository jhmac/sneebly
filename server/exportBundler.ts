/**
 * Phaser 3 Bundle Generator
 *
 * Takes a project's full asset graph (animations, characters, environments,
 * tilesets, props) and produces an export-ready map of {filename: content}
 * that constitutes a runnable Phaser 3 project.
 */

// ── Type definitions for inputs ──────────────────────────────────────────────

export interface ProjectData {
  id: number;
  name: string;
  description?: string | null;
  story?: string | null;
  width: number;
  height: number;
}

export interface AnimationData {
  id: number;
  name: string;
  key?: string | null;
  frameCount: number;
  frameRate: number;
  loop: boolean;
  spriteSheetUrl?: string | null;
  frameWidth: number;
  frameHeight: number;
  characterId?: number | null;
}

export interface CharacterData {
  id: number;
  name: string;
  description?: string | null;
  spriteSheetUrl?: string | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  x?: number | null;
  y?: number | null;
}

export interface EnvironmentData {
  id: number;
  name: string;
  description?: string | null;
  width: number;
  height: number;
  layers?: EnvironmentLayerData[];
}

export interface EnvironmentLayerData {
  id: number;
  name: string;
  depth: number;
  imageUrl?: string | null;
  scrollFactorX?: number | null;
  scrollFactorY?: number | null;
}

export interface TilesetData {
  id: number;
  name: string;
  imageUrl?: string | null;
  tileWidth: number;
  tileHeight: number;
  columns?: number | null;
  rows?: number | null;
}

export interface PropData {
  id: number;
  name: string;
  imageUrl?: string | null;
  x?: number | null;
  y?: number | null;
  depth?: number | null;
}

// ── Output type ──────────────────────────────────────────────────────────────

export interface BundleOutput {
  [filename: string]: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

// ── Main generator ───────────────────────────────────────────────────────────

export function generatePhaserBundle(
  project: ProjectData,
  animations: AnimationData[],
  characters: CharacterData[],
  environments: EnvironmentData[],
  tilesets: TilesetData[],
  props: PropData[] = []
): BundleOutput {
  const bundle: BundleOutput = {};

  bundle["src/main.ts"] = generateMainTs(project);
  bundle["src/scenes/BootScene.ts"] = generateBootScene(
    animations,
    characters,
    environments,
    tilesets,
    props
  );
  bundle["src/scenes/GameScene.ts"] = generateGameScene(
    animations,
    characters,
    environments,
    props
  );
  bundle["src/config/animations.json"] = generateAnimationsJson(animations);
  bundle["src/config/assets.json"] = generateAssetsJson(
    animations,
    characters,
    environments,
    tilesets,
    props
  );
  bundle["package.json"] = generatePackageJson(project);
  bundle["README.md"] = generateReadme(project);

  // Optional GDD — only if there's meaningful content
  const hasStory = project.story && project.story.trim().length > 0;
  const hasDescription =
    project.description && project.description.trim().length > 0;
  if (hasStory || hasDescription || characters.length > 0 || environments.length > 0) {
    bundle["docs/GDD.md"] = generateGDD(
      project,
      characters,
      environments
    );
  }

  return bundle;
}

// ── File generators ──────────────────────────────────────────────────────────

function generateMainTs(project: ProjectData): string {
  return `import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: ${project.width},
  height: ${project.height},
  title: ${JSON.stringify(project.name)},
  parent: "game-container",
  backgroundColor: "#000000",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, GameScene],
};

const game = new Phaser.Game(config);

export default game;
`;
}

function generateBootScene(
  animations: AnimationData[],
  characters: CharacterData[],
  environments: EnvironmentData[],
  tilesets: TilesetData[],
  props: PropData[]
): string {
  const preloadLines: string[] = [];

  // Sprite sheets from animations
  for (const anim of animations) {
    if (!anim.spriteSheetUrl) continue;
    const key = anim.key || sanitizeKey(anim.name);
    preloadLines.push(
      `    this.load.spritesheet(${JSON.stringify(key)}, ${JSON.stringify(anim.spriteSheetUrl)}, {` +
        ` frameWidth: ${anim.frameWidth}, frameHeight: ${anim.frameHeight} });`
    );
  }

  // Character sprite sheets (if not already covered by animations)
  const animSpriteUrls = new Set(animations.map((a) => a.spriteSheetUrl).filter(Boolean));
  for (const char of characters) {
    if (!char.spriteSheetUrl || animSpriteUrls.has(char.spriteSheetUrl)) continue;
    const key = sanitizeKey(char.name);
    const fw = char.frameWidth || 32;
    const fh = char.frameHeight || 32;
    preloadLines.push(
      `    this.load.spritesheet(${JSON.stringify(key)}, ${JSON.stringify(char.spriteSheetUrl)}, {` +
        ` frameWidth: ${fw}, frameHeight: ${fh} });`
    );
  }

  // Environment layers as images
  for (const env of environments) {
    if (!env.layers) continue;
    for (const layer of env.layers) {
      if (!layer.imageUrl) continue;
      const key = `${sanitizeKey(env.name)}_${sanitizeKey(layer.name)}`;
      preloadLines.push(
        `    this.load.image(${JSON.stringify(key)}, ${JSON.stringify(layer.imageUrl)});`
      );
    }
  }

  // Tilesets
  for (const tileset of tilesets) {
    if (!tileset.imageUrl) continue;
    const key = sanitizeKey(tileset.name);
    preloadLines.push(
      `    this.load.image(${JSON.stringify(key)}, ${JSON.stringify(tileset.imageUrl)});`
    );
  }

  // Props
  for (const prop of props) {
    if (!prop.imageUrl) continue;
    const key = sanitizeKey(prop.name);
    preloadLines.push(
      `    this.load.image(${JSON.stringify(key)}, ${JSON.stringify(prop.imageUrl)});`
    );
  }

  return `import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
${preloadLines.join("\n")}
  }

  create(): void {
    this.scene.start("GameScene");
  }
}
`;
}

function generateGameScene(
  animations: AnimationData[],
  characters: CharacterData[],
  environments: EnvironmentData[],
  props: PropData[]
): string {
  // Build animation creation lines
  const animCreateLines: string[] = [];
  for (const anim of animations) {
    const key = anim.key || sanitizeKey(anim.name);
    const spriteKey = key; // sprite sheet key matches anim key in BootScene
    animCreateLines.push(
      `    this.anims.create({\n` +
        `      key: ${JSON.stringify(key)},\n` +
        `      frames: this.anims.generateFrameNumbers(${JSON.stringify(spriteKey)}, {\n` +
        `        start: 0,\n` +
        `        end: ${Math.max(0, anim.frameCount - 1)},\n` +
        `      }),\n` +
        `      frameRate: ${anim.frameRate},\n` +
        `      repeat: ${anim.loop ? -1 : 0},\n` +
        `    });`
    );
  }

  // Build environment layer placement lines
  const envLines: string[] = [];
  for (const env of environments) {
    if (!env.layers) continue;
    const sortedLayers = [...env.layers].sort((a, b) => a.depth - b.depth);
    envLines.push(`    // Environment: ${env.name}`);
    for (const layer of sortedLayers) {
      if (!layer.imageUrl) continue;
      const key = `${sanitizeKey(env.name)}_${sanitizeKey(layer.name)}`;
      const sfx = layer.scrollFactorX ?? 1;
      const sfy = layer.scrollFactorY ?? 1;
      envLines.push(
        `    this.add.image(0, 0, ${JSON.stringify(key)})\n` +
          `      .setOrigin(0, 0)\n` +
          `      .setDepth(${layer.depth})\n` +
          `      .setScrollFactor(${sfx}, ${sfy});`
      );
    }
  }

  // Build character spawn lines
  const charLines: string[] = [];
  for (const char of characters) {
    const key = sanitizeKey(char.name);
    const x = char.x ?? 100;
    const y = char.y ?? 100;

    // Find the first animation belonging to this character
    const charAnim = animations.find((a) => a.characterId === char.id);
    const animKey = charAnim
      ? charAnim.key || sanitizeKey(charAnim.name)
      : null;

    // Determine the sprite sheet key — prefer animation key, fall back to character key
    const spriteKey = animKey || key;

    charLines.push(`    // Character: ${char.name}`);
    charLines.push(
      `    const ${sanitizeKey(char.name)}Sprite = this.add.sprite(${x}, ${y}, ${JSON.stringify(spriteKey)});`
    );
    if (animKey) {
      charLines.push(
        `    ${sanitizeKey(char.name)}Sprite.play(${JSON.stringify(animKey)});`
      );
    }
  }

  // Build prop placement lines
  const propLines: string[] = [];
  for (const prop of props) {
    if (!prop.imageUrl) continue;
    const key = sanitizeKey(prop.name);
    const x = prop.x ?? 0;
    const y = prop.y ?? 0;
    const depth = prop.depth ?? 0;
    propLines.push(
      `    this.add.image(${x}, ${y}, ${JSON.stringify(key)})\n` +
        `      .setDepth(${depth});`
    );
  }

  return `import Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // ── Animations ──
${animCreateLines.length > 0 ? animCreateLines.join("\n\n") : "    // No animations defined"}

    // ── Environment Layers ──
${envLines.length > 0 ? envLines.join("\n") : "    // No environment layers defined"}

    // ── Props ──
${propLines.length > 0 ? propLines.join("\n\n") : "    // No props defined"}

    // ── Characters ──
${charLines.length > 0 ? charLines.join("\n") : "    // No characters defined"}
  }

  update(time: number, delta: number): void {
    // Game loop logic goes here
  }
}
`;
}

function generateAnimationsJson(animations: AnimationData[]): string {
  const defs = animations.map((anim) => ({
    key: anim.key || sanitizeKey(anim.name),
    spriteSheetKey: anim.key || sanitizeKey(anim.name),
    frameStart: 0,
    frameEnd: Math.max(0, anim.frameCount - 1),
    frameRate: anim.frameRate,
    loop: anim.loop,
    frameWidth: anim.frameWidth,
    frameHeight: anim.frameHeight,
  }));

  return JSON.stringify({ animations: defs }, null, 2) + "\n";
}

function generateAssetsJson(
  animations: AnimationData[],
  characters: CharacterData[],
  environments: EnvironmentData[],
  tilesets: TilesetData[],
  props: PropData[]
): string {
  const manifest: {
    spritesheets: { key: string; path: string; frameWidth: number; frameHeight: number }[];
    images: { key: string; path: string }[];
  } = {
    spritesheets: [],
    images: [],
  };

  // Sprite sheets from animations
  const seenSpriteUrls = new Set<string>();
  for (const anim of animations) {
    if (!anim.spriteSheetUrl) continue;
    if (seenSpriteUrls.has(anim.spriteSheetUrl)) continue;
    seenSpriteUrls.add(anim.spriteSheetUrl);
    manifest.spritesheets.push({
      key: anim.key || sanitizeKey(anim.name),
      path: anim.spriteSheetUrl,
      frameWidth: anim.frameWidth,
      frameHeight: anim.frameHeight,
    });
  }

  // Character sprite sheets not covered by animations
  for (const char of characters) {
    if (!char.spriteSheetUrl || seenSpriteUrls.has(char.spriteSheetUrl)) continue;
    seenSpriteUrls.add(char.spriteSheetUrl);
    manifest.spritesheets.push({
      key: sanitizeKey(char.name),
      path: char.spriteSheetUrl,
      frameWidth: char.frameWidth || 32,
      frameHeight: char.frameHeight || 32,
    });
  }

  // Environment layers
  for (const env of environments) {
    if (!env.layers) continue;
    for (const layer of env.layers) {
      if (!layer.imageUrl) continue;
      manifest.images.push({
        key: `${sanitizeKey(env.name)}_${sanitizeKey(layer.name)}`,
        path: layer.imageUrl,
      });
    }
  }

  // Tilesets
  for (const tileset of tilesets) {
    if (!tileset.imageUrl) continue;
    manifest.images.push({
      key: sanitizeKey(tileset.name),
      path: tileset.imageUrl,
    });
  }

  // Props
  for (const prop of props) {
    if (!prop.imageUrl) continue;
    manifest.images.push({
      key: sanitizeKey(prop.name),
      path: prop.imageUrl,
    });
  }

  return JSON.stringify(manifest, null, 2) + "\n";
}

function generatePackageJson(project: ProjectData): string {
  const pkg = {
    name: sanitizeKey(project.name) || "phaser-game",
    version: "1.0.0",
    description: project.description || `Phaser 3 game: ${project.name}`,
    main: "src/main.ts",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      phaser: "^3.80.1",
    },
    devDependencies: {
      typescript: "^5.4.0",
      vite: "^5.2.0",
    },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateReadme(project: ProjectData): string {
  return `# ${project.name}

${project.description || "A Phaser 3 game project."}

## Setup

\`\`\`bash
npm install
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

Open your browser to the URL shown in the terminal (usually http://localhost:5173).

## Production Build

\`\`\`bash
npm run build
\`\`\`

The built files will be in the \`dist/\` directory.

## Project Info

- **Resolution:** ${project.width} × ${project.height}
- **Engine:** Phaser 3 (AUTO renderer)
- **Language:** TypeScript
- **Bundler:** Vite
`;
}

function generateGDD(
  project: ProjectData,
  characters: CharacterData[],
  environments: EnvironmentData[]
): string {
  const sections: string[] = [];

  sections.push(`# ${project.name} — Game Design Document`);
  sections.push("");

  if (project.description) {
    sections.push(`## Overview`);
    sections.push("");
    sections.push(project.description);
    sections.push("");
  }

  if (project.story) {
    sections.push(`## Story`);
    sections.push("");
    sections.push(project.story);
    sections.push("");
  }

  sections.push(`## Technical Specs`);
  sections.push("");
  sections.push(`- **Resolution:** ${project.width} × ${project.height}`);
  sections.push(`- **Engine:** Phaser 3`);
  sections.push(`- **Renderer:** AUTO (WebGL with Canvas fallback)`);
  sections.push("");

  if (characters.length > 0) {
    sections.push(`## Characters`);
    sections.push("");
    for (const char of characters) {
      sections.push(`### ${char.name}`);
      sections.push("");
      if (char.description) {
        sections.push(char.description);
        sections.push("");
      }
      if (char.frameWidth && char.frameHeight) {
        sections.push(
          `- **Sprite size:** ${char.frameWidth} × ${char.frameHeight}`
        );
      }
      if (char.x != null && char.y != null) {
        sections.push(`- **Spawn position:** (${char.x}, ${char.y})`);
      }
      sections.push("");
    }
  }

  if (environments.length > 0) {
    sections.push(`## Environments`);
    sections.push("");
    for (const env of environments) {
      sections.push(`### ${env.name}`);
      sections.push("");
      if (env.description) {
        sections.push(env.description);
        sections.push("");
      }
      sections.push(`- **Dimensions:** ${env.width} × ${env.height}`);
      if (env.layers && env.layers.length > 0) {
        sections.push(
          `- **Layers:** ${env.layers
            .sort((a, b) => a.depth - b.depth)
            .map((l) => l.name)
            .join(", ")}`
        );
      }
      sections.push("");
    }
  }

  return sections.join("\n");
}
