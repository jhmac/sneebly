/**
 * Export Generator
 * 
 * Takes a projectId, queries all related assets, and produces a .zip buffer containing:
 * 1. A Phaser 3 scene file (TypeScript) with preload/create methods
 * 2. An asset manifest JSON listing all sprite sheets and tilesets
 * 3. A game config snippet with sensible defaults
 *
 * Does NOT touch auth/payment. Returns a Buffer + filename.
 */

import archiver from "archiver";
import { storage } from "./storage";
import type {
  Project,
  Character,
  SpriteSheet,
  Animation,
  Environment,
  Tileset,
  EnvironmentProp,
} from "@shared/schema";

// ─── Types ────────────────────────────────────────────────

export interface ExportResult {
  buffer: Buffer;
  filename: string;
}

interface AssetManifestEntry {
  key: string;
  type: "spritesheet" | "tileset" | "image";
  url: string;
  frameConfig?: {
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
  };
  atlasJsonUrl?: string | null;
}

interface AssetManifest {
  projectId: string;
  projectName: string;
  generatedAt: string;
  assets: AssetManifestEntry[];
}

interface AnimationDef {
  key: string;
  atlasKey: string;
  prefix: string;
  start: number;
  end: number;
  frameRate: number;
  repeat: number;
}

// ─── Helpers ──────────────────────────────────────────────

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^\d/, "_$&")
    .toLowerCase();
}

function buildSpriteSheetKey(character: Character, sheet: SpriteSheet): string {
  return sanitize(`${character.name}_${sheet.animationState}`);
}

function buildTilesetKey(env: Environment, tileset: Tileset): string {
  return sanitize(`${env.name}_${tileset.name}`);
}

function buildPropKey(env: Environment, prop: EnvironmentProp): string {
  return sanitize(`${env.name}_${prop.name}`);
}

// ─── Asset Manifest Builder ───────────────────────────────

function buildAssetManifest(
  project: Project,
  characters: Character[],
  spriteSheets: SpriteSheet[],
  environments: Environment[],
  tilesets: Tileset[],
  props: EnvironmentProp[]
): AssetManifest {
  const assets: AssetManifestEntry[] = [];

  // Sprite sheets grouped by character
  for (const sheet of spriteSheets) {
    const character = characters.find((c) => c.id === sheet.characterId);
    if (!character) continue;

    const key = buildSpriteSheetKey(character, sheet);

    if (sheet.atlasJsonUrl) {
      // Atlas-based sprite sheet — loaded as atlas, not spritesheet
      assets.push({
        key,
        type: "spritesheet",
        url: sheet.fileUrl,
        atlasJsonUrl: sheet.atlasJsonUrl,
        frameConfig: {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          frameCount: sheet.frameCount,
        },
      });
    } else {
      assets.push({
        key,
        type: "spritesheet",
        url: sheet.fileUrl,
        frameConfig: {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          frameCount: sheet.frameCount,
        },
      });
    }
  }

  // Tilesets grouped by environment
  for (const tileset of tilesets) {
    const env = environments.find((e) => e.id === tileset.environmentId);
    if (!env) continue;

    assets.push({
      key: buildTilesetKey(env, tileset),
      type: "tileset",
      url: tileset.fileUrl,
      frameConfig: {
        frameWidth: tileset.tileWidth,
        frameHeight: tileset.tileHeight,
        frameCount: tileset.tileCount,
      },
    });
  }

  // Environment props
  for (const prop of props) {
    if (!prop.spriteUrl) continue;
    const env = environments.find((e) => e.id === prop.environmentId);
    if (!env) continue;

    assets.push({
      key: buildPropKey(env, prop),
      type: "image",
      url: prop.spriteUrl,
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    assets,
  };
}

// ─── Animation Definitions Builder ────────────────────────

function buildAnimationDefs(
  animations: Animation[],
  characters: Character[],
  spriteSheets: SpriteSheet[]
): AnimationDef[] {
  const defs: AnimationDef[] = [];

  for (const anim of animations) {
    // Determine the atlas key — prefer the animation's own atlasKey,
    // otherwise try to find a matching sprite sheet
    let atlasKey = anim.atlasKey || "";
    const prefix = anim.prefix || `${sanitize(anim.name)}_`;
    const frameCount = anim.frameCount ?? 8;
    const fps = anim.fps ?? 12;
    const loop = anim.loop ?? true;

    // If no explicit atlasKey, try to derive from character + animation state
    if (!atlasKey && anim.characterName) {
      const matchingSheet = spriteSheets.find((s) => {
        const char = characters.find((c) => c.id === s.characterId);
        return char && sanitize(char.name) === sanitize(anim.characterName || "");
      });
      if (matchingSheet) {
        const char = characters.find((c) => c.id === matchingSheet.characterId);
        if (char) {
          atlasKey = buildSpriteSheetKey(char, matchingSheet);
        }
      }
    }

    if (!atlasKey) {
      atlasKey = sanitize(anim.characterName || "player");
    }

    const animKey = anim.animationKey || sanitize(anim.name);

    defs.push({
      key: animKey,
      atlasKey,
      prefix,
      start: 0,
      end: Math.max(0, frameCount - 1),
      frameRate: fps,
      repeat: loop ? -1 : 0,
    });
  }

  return defs;
}

// ─── Phaser Scene Generator ───────────────────────────────

function generatePhaserScene(
  project: Project,
  manifest: AssetManifest,
  animDefs: AnimationDef[]
): string {
  const sceneName = sanitize(project.name) + "_scene";
  const className =
    project.name
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/^\d/, "_$&") + "Scene";

  const preloadLines: string[] = [];
  const createAnimLines: string[] = [];

  // Preload assets
  for (const asset of manifest.assets) {
    if (asset.type === "spritesheet" && asset.atlasJsonUrl) {
      preloadLines.push(
        `    this.load.atlas('${asset.key}', '${asset.url}', '${asset.atlasJsonUrl}');`
      );
    } else if (asset.type === "spritesheet" && asset.frameConfig) {
      preloadLines.push(
        `    this.load.spritesheet('${asset.key}', '${asset.url}', {` +
          ` frameWidth: ${asset.frameConfig.frameWidth},` +
          ` frameHeight: ${asset.frameConfig.frameHeight}` +
          ` });`
      );
    } else if (asset.type === "tileset" && asset.frameConfig) {
      preloadLines.push(
        `    this.load.spritesheet('${asset.key}', '${asset.url}', {` +
          ` frameWidth: ${asset.frameConfig.frameWidth},` +
          ` frameHeight: ${asset.frameConfig.frameHeight}` +
          ` });`
      );
    } else if (asset.type === "image") {
      preloadLines.push(
        `    this.load.image('${asset.key}', '${asset.url}');`
      );
    }
  }

  // Create animations
  for (const anim of animDefs) {
    createAnimLines.push(
      `    this.anims.create({\n` +
        `      key: '${anim.key}',\n` +
        `      frames: this.anims.generateFrameNames('${anim.atlasKey}', {\n` +
        `        prefix: '${anim.prefix}',\n` +
        `        start: ${anim.start},\n` +
        `        end: ${anim.end},\n` +
        `      }),\n` +
        `      frameRate: ${anim.frameRate},\n` +
        `      repeat: ${anim.repeat},\n` +
        `    });`
    );
  }

  return `/**
 * ${className}
 * Auto-generated Phaser 3 scene for project: ${project.name}
 * Generated at: ${new Date().toISOString()}
 *
 * This scene preloads all sprite sheets, tilesets, and props,
 * then defines all animations in the create() method.
 */

export class ${className} extends Phaser.Scene {
  constructor() {
    super({ key: '${sceneName}' });
  }

  preload(): void {
${preloadLines.length > 0 ? preloadLines.join('\n') : '    // No assets to preload'}
  }

  create(): void {
    // ── Define Animations ──────────────────────────────
${createAnimLines.length > 0 ? createAnimLines.join('\n\n') : '    // No animations defined yet'}

    // ── Your game logic goes here ─────────────────────
    // Example: create a sprite and play an animation
    // const player = this.add.sprite(400, 300, 'player_idle');
    // player.play('player_idle');
  }

  update(time: number, delta: number): void {
    // Game loop logic goes here
  }
}
`;
}

// ─── Game Config Generator ───────────────────────────────

function generateGameConfig(project: Project, sceneName: string): string {
  const className =
    project.name
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/^\d/, "_$&") + "Scene";

  return `/**
 * Phaser 3 Game Configuration
 * Auto-generated for project: ${project.name}
 * Generated at: ${new Date().toISOString()}
 *
 * Import your scene and pass it to the config below.
 */

import { ${className} } from './scene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 300 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [${className}],
};

// To start the game:
// import Phaser from 'phaser';
// const game = new Phaser.Game(gameConfig);
`;
}

// ─── ZIP Bundler ──────────────────────────────────────────

function createZipBuffer(
  files: Array<{ name: string; content: string }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", (err: Error) => reject(err));

    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }

    archive.finalize();
  });
}

// ─── Main Export Function ─────────────────────────────────

export async function generateProjectExport(
  projectId: string
): Promise<ExportResult> {
  // 1. Fetch the project
  const project = await storage.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // 2. Fetch all related assets in parallel
  const [characters, allAnimations, environments] = await Promise.all([
    storage.getCharacters(projectId),
    storage.getAnimations(projectId),
    storage.getEnvironments(projectId),
  ]);

  // Fetch sprite sheets for each character
  const spriteSheetArrays = await Promise.all(
    characters.map((c) => storage.getSpriteSheets(c.id))
  );
  const allSpriteSheets = spriteSheetArrays.flat();

  // Fetch tilesets and props for each environment
  const tilesetArrays = await Promise.all(
    environments.map((e) => storage.getTilesets(e.id))
  );
  const allTilesets = tilesetArrays.flat();

  const propArrays = await Promise.all(
    environments.map((e) => storage.getEnvironmentProps(e.id))
  );
  const allProps = propArrays.flat();

  // 3. Build the asset manifest
  const manifest = buildAssetManifest(
    project,
    characters,
    allSpriteSheets,
    environments,
    allTilesets,
    allProps
  );

  // 4. Build animation definitions
  const animDefs = buildAnimationDefs(
    allAnimations,
    characters,
    allSpriteSheets
  );

  // 5. Generate files
  const sceneName = sanitize(project.name) + "_scene";
  const sceneContent = generatePhaserScene(project, manifest, animDefs);
  const configContent = generateGameConfig(project, sceneName);
  const manifestContent = JSON.stringify(manifest, null, 2);

  // 6. Bundle into a zip
  const files = [
    { name: "src/scene.ts", content: sceneContent },
    { name: "src/config.ts", content: configContent },
    { name: "assets/manifest.json", content: manifestContent },
    {
      name: "README.md",
      content: generateReadme(project, manifest, animDefs),
    },
  ];

  const buffer = await createZipBuffer(files);
  const filename = `${sanitize(project.name)}_phaser_export.zip`;

  return { buffer, filename };
}

// ─── README Generator ─────────────────────────────────────

function generateReadme(
  project: Project,
  manifest: AssetManifest,
  animDefs: AnimationDef[]
): string {
  const assetCount = manifest.assets.length;
  const animCount = animDefs.length;
  const spriteCount = manifest.assets.filter(
    (a) => a.type === "spritesheet"
  ).length;
  const tilesetCount = manifest.assets.filter(
    (a) => a.type === "tileset"
  ).length;
  const propCount = manifest.assets.filter((a) => a.type === "image").length;

  return `# ${project.name} — Phaser 3 Export

Generated at: ${new Date().toISOString()}

## Contents

- \`src/scene.ts\` — Main Phaser scene with preload and animation setup
- \`src/config.ts\` — Game configuration with arcade physics and resize scaling
- \`assets/manifest.json\` — Complete asset manifest

## Stats

- **${assetCount}** total assets
  - ${spriteCount} sprite sheets
  - ${tilesetCount} tilesets
  - ${propCount} props/images
- **${animCount}** animations defined

## Quick Start

\`\`\`bash
npm install phaser
\`\`\`

\`\`\`typescript
import Phaser from 'phaser';
import { gameConfig } from './src/config';

const game = new Phaser.Game(gameConfig);
\`\`\`

## Notes

- Asset URLs in the manifest point to your hosted files. Update them if you move assets locally.
- The scene uses \`generateFrameNames\` for atlas-based animations. If your sprite sheets are grid-based without an atlas JSON, switch to \`generateFrameNumbers\` instead.
- Physics defaults to Arcade with gravity \`{ x: 0, y: 300 }\`. Adjust in \`config.ts\` for your game type.
`;
}
