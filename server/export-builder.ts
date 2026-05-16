import { storage } from "./storage";
import * as zlib from "zlib";
import type {
  Project,
  Animation,
  Character,
  SpriteSheet,
  Environment,
  Tileset,
  EnvironmentProp,
  Story,
  Quest,
} from "@shared/schema";

// ─── Types ────────────────────────────────────────────────

interface ProjectData {
  project: Project;
  characters: Character[];
  spriteSheets: SpriteSheet[];
  animations: Animation[];
  environments: Environment[];
  tilesets: Tileset[];
  environmentProps: EnvironmentProp[];
  stories: Story[];
  quests: Quest[];
}

interface AssetManifestEntry {
  key: string;
  type: "spritesheet" | "tileset";
  url: string;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  tileWidth?: number;
  tileHeight?: number;
  tileCount?: number;
}

interface AtlasFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface AtlasJson {
  frames: AtlasFrame[];
  meta: {
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
  };
}

interface ZipEntry {
  path: string;
  data: Buffer;
}

// ─── Minimal ZIP Builder (no external deps) ──────────────
// Implements the ZIP format spec (PKZIP APPNOTE) for DEFLATE-compressed entries.
// This avoids needing the 'archiver' npm package entirely.

function buildZipBuffer(entries: ZipEntry[]): Buffer {
  const centralDirectory: Buffer[] = [];
  const fileEntries: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuf = Buffer.from(entry.path, "utf-8");
    const uncompressedData = entry.data;
    const compressedData = zlib.deflateRawSync(uncompressedData);
    const crc = crc32(uncompressedData);

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);  // Local file header signature
    localHeader.writeUInt16LE(20, 4);           // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6);            // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);            // Compression method: DEFLATE
    localHeader.writeUInt16LE(0, 10);           // Last mod file time
    localHeader.writeUInt16LE(0, 12);           // Last mod file date
    localHeader.writeUInt32LE(crc, 14);         // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18);   // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26);      // File name length
    localHeader.writeUInt16LE(0, 28);           // Extra field length

    const localEntry = Buffer.concat([localHeader, fileNameBuf, compressedData]);
    fileEntries.push(localEntry);

    // Central directory header
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);  // Central directory file header signature
    cdHeader.writeUInt16LE(20, 4);           // Version made by
    cdHeader.writeUInt16LE(20, 6);           // Version needed to extract
    cdHeader.writeUInt16LE(0, 8);            // General purpose bit flag
    cdHeader.writeUInt16LE(8, 10);           // Compression method: DEFLATE
    cdHeader.writeUInt16LE(0, 12);           // Last mod file time
    cdHeader.writeUInt16LE(0, 14);           // Last mod file date
    cdHeader.writeUInt32LE(crc, 16);         // CRC-32
    cdHeader.writeUInt32LE(compressedData.length, 20);   // Compressed size
    cdHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    cdHeader.writeUInt16LE(fileNameBuf.length, 28);      // File name length
    cdHeader.writeUInt16LE(0, 30);           // Extra field length
    cdHeader.writeUInt16LE(0, 32);           // File comment length
    cdHeader.writeUInt16LE(0, 34);           // Disk number start
    cdHeader.writeUInt16LE(0, 36);           // Internal file attributes
    cdHeader.writeUInt32LE(0, 38);           // External file attributes
    cdHeader.writeUInt32LE(offset, 42);      // Relative offset of local header

    centralDirectory.push(Buffer.concat([cdHeader, fileNameBuf]));

    offset += localEntry.length;
  }

  const cdBuffer = Buffer.concat(centralDirectory);
  const cdOffset = offset;
  const cdSize = cdBuffer.length;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);  // End of central directory signature
  eocd.writeUInt16LE(0, 4);            // Number of this disk
  eocd.writeUInt16LE(0, 6);            // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8);  // Number of central directory records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(cdSize, 12);      // Size of central directory
  eocd.writeUInt32LE(cdOffset, 16);    // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);           // Comment length

  return Buffer.concat([...fileEntries, cdBuffer, eocd]);
}

// CRC-32 implementation (IEEE / ISO 3309)
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table: number[] = (() => {
  const table: number[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c >>> 0;
  }
  return table;
})();

// ─── Data Fetching ────────────────────────────────────────

async function fetchProjectData(projectId: string): Promise<ProjectData> {
  const project = await storage.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const [characters, spriteSheets, animations, environments, stories, quests] =
    await Promise.all([
      storage.getCharacters(projectId),
      storage.getSpriteSheets(projectId),
      storage.getAnimations(projectId),
      storage.getEnvironments(projectId),
      storage.getStories(projectId),
      storage.getQuests(projectId),
    ]);

  // Fetch tilesets and props for each environment
  const tilesetsNested = await Promise.all(
    environments.map((env) => storage.getTilesets(env.id))
  );
  const propsNested = await Promise.all(
    environments.map((env) => storage.getEnvironmentProps(env.id))
  );

  const allTilesets = tilesetsNested.flat();
  const allProps = propsNested.flat();

  return {
    project,
    characters,
    spriteSheets,
    animations,
    environments,
    tilesets: allTilesets,
    environmentProps: allProps,
    stories,
    quests,
  };
}

// ─── Atlas JSON Generation ────────────────────────────────

function generateAtlasJson(sheet: SpriteSheet): AtlasJson {
  const frames: AtlasFrame[] = [];
  const cols = Math.max(1, Math.floor(1024 / sheet.frameWidth));

  for (let i = 0; i < sheet.frameCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    frames.push({
      filename: `${sheet.animationState}_${String(i).padStart(4, "0")}`,
      frame: {
        x: col * sheet.frameWidth,
        y: row * sheet.frameHeight,
        w: sheet.frameWidth,
        h: sheet.frameHeight,
      },
      rotated: false,
      trimmed: false,
      spriteSourceSize: {
        x: 0,
        y: 0,
        w: sheet.frameWidth,
        h: sheet.frameHeight,
      },
      sourceSize: {
        w: sheet.frameWidth,
        h: sheet.frameHeight,
      },
    });
  }

  const totalCols = Math.min(sheet.frameCount, cols);
  const totalRows = Math.ceil(sheet.frameCount / cols);

  return {
    frames,
    meta: {
      image: extractFilename(sheet.fileUrl),
      format: "RGBA8888",
      size: {
        w: totalCols * sheet.frameWidth,
        h: totalRows * sheet.frameHeight,
      },
      scale: "1",
    },
  };
}

function extractFilename(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1] || "sprite.png";
}

// ─── Asset Manifest Generation ────────────────────────────

function generateAssetManifest(
  spriteSheets: SpriteSheet[],
  tilesets: Tileset[]
): AssetManifestEntry[] {
  const entries: AssetManifestEntry[] = [];

  for (const sheet of spriteSheets) {
    const key = sanitizeKey(`${sheet.animationState}_${sheet.id.slice(0, 8)}`);
    entries.push({
      key,
      type: "spritesheet",
      url: sheet.fileUrl,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      frameCount: sheet.frameCount,
    });
  }

  for (const tileset of tilesets) {
    const key = sanitizeKey(`tileset_${tileset.name}_${tileset.id.slice(0, 8)}`);
    entries.push({
      key,
      type: "tileset",
      url: tileset.fileUrl,
      tileWidth: tileset.tileWidth,
      tileHeight: tileset.tileHeight,
      tileCount: tileset.tileCount,
    });
  }

  return entries;
}

function sanitizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Phaser Scene Generation ──────────────────────────────

function generatePhaserScene(data: ProjectData): string {
  const { project, spriteSheets, animations, environments, tilesets } = data;
  const sceneName = sanitizeClassName(project.name || "GameScene");

  const preloadLines = generatePreloadLines(spriteSheets, tilesets);
  const createAnimLines = generateCreateAnimationLines(animations, spriteSheets);
  const envSetupLines = generateEnvironmentSetup(environments);

  return `// Auto-generated Phaser 3 Scene for "${project.name}"
// Generated by Sneebly Export Builder
// Game Type: ${project.gameType || "unknown"}
// POV: ${project.pov || "Side-Scrolling"}

import Phaser from "phaser";

export class ${sceneName} extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: "${sceneName}" });
  }

  preload(): void {
${preloadLines}
  }

  create(): void {
    // Keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();

${envSetupLines}

    // Create animations
${createAnimLines}

    // Create player sprite
    this.player = this.add.sprite(400, 300, "player");
    this.player.setOrigin(0.5, 1);
  }

  update(_time: number, _delta: number): void {
    // Basic movement stub
    const speed = 160;

    if (this.cursors.left.isDown) {
      this.player.setFlipX(true);
      this.player.x -= speed * (_delta / 1000);
    } else if (this.cursors.right.isDown) {
      this.player.setFlipX(false);
      this.player.x += speed * (_delta / 1000);
    }

    if (this.cursors.up.isDown) {
      this.player.y -= speed * (_delta / 1000);
    } else if (this.cursors.down.isDown) {
      this.player.y += speed * (_delta / 1000);
    }
  }
}
`;
}

function generatePreloadLines(
  sheets: SpriteSheet[],
  tileSets: Tileset[]
): string {
  const lines: string[] = [];

  for (const sheet of sheets) {
    const key = sanitizeKey(`${sheet.animationState}_${sheet.id.slice(0, 8)}`);
    const atlasJsonFile = `assets/atlases/${key}.json`;
    const imageFile = `assets/spritesheets/${extractFilename(sheet.fileUrl)}`;
    lines.push(
      `    // ${sheet.animationState} sprite sheet (${sheet.frameCount} frames, ${sheet.frameWidth}x${sheet.frameHeight})`
    );
    lines.push(
      `    this.load.atlas("${key}", "${imageFile}", "${atlasJsonFile}");`
    );
  }

  for (const tileset of tileSets) {
    const key = sanitizeKey(`tileset_${tileset.name}_${tileset.id.slice(0, 8)}`);
    const imageFile = `assets/tilesets/${extractFilename(tileset.fileUrl)}`;
    lines.push(
      `    // Tileset: ${tileset.name} (${tileset.tileWidth}x${tileset.tileHeight}, ${tileset.tileCount} tiles)`
    );
    lines.push(`    this.load.image("${key}", "${imageFile}");`);
  }

  if (lines.length === 0) {
    lines.push("    // No assets configured yet — add sprite sheets and tilesets in Sneebly");
  }

  return lines.join("\n");
}

function generateCreateAnimationLines(
  anims: Animation[],
  sheets: SpriteSheet[]
): string {
  if (anims.length === 0) {
    return "    // No animations configured yet";
  }

  const lines: string[] = [];

  for (const anim of anims) {
    const atlasKey =
      anim.atlasKey ||
      findAtlasKeyForAnimation(anim, sheets) ||
      "player";
    const animKey = anim.animationKey || sanitizeKey(anim.name);
    const prefix = anim.prefix || `${animKey}_`;
    const fps = anim.fps ?? 12;
    const frameCount = anim.frameCount ?? 8;
    const loop = anim.loop ?? true;

    lines.push(`    // ${anim.name} (${anim.priority || "CORE"})`);
    lines.push(`    this.anims.create({`);
    lines.push(`      key: "${animKey}",`);
    lines.push(
      `      frames: this.anims.generateFrameNames("${atlasKey}", {`
    );
    lines.push(`        prefix: "${prefix}",`);
    lines.push(`        start: 0,`);
    lines.push(`        end: ${Math.max(0, frameCount - 1)},`);
    lines.push(`        zeroPad: 4,`);
    lines.push(`      }),`);
    lines.push(`      frameRate: ${fps},`);
    lines.push(`      repeat: ${loop ? -1 : 0},`);
    lines.push(`    });`);
    lines.push("");
  }

  return lines.join("\n");
}

function findAtlasKeyForAnimation(
  anim: Animation,
  sheets: SpriteSheet[]
): string | null {
  const charName = anim.characterName || "";
  const match = sheets.find(
    (s) =>
      s.animationState.toLowerCase() === anim.name.toLowerCase() ||
      (charName && s.animationState.toLowerCase().includes(charName.toLowerCase()))
  );
  if (match) {
    return sanitizeKey(`${match.animationState}_${match.id.slice(0, 8)}`);
  }
  return null;
}

function generateEnvironmentSetup(envs: Environment[]): string {
  if (envs.length === 0) {
    return "    // No environments configured yet";
  }

  const lines: string[] = [];
  lines.push("    // Environment setup");

  for (const env of envs) {
    lines.push(`    // Zone: ${env.name} (${env.zoneType || "generic"})`);
    if (env.mood) {
      lines.push(`    // Mood: ${env.mood}`);
    }
    if (env.lightingDirection) {
      lines.push(`    // Lighting: ${env.lightingDirection}`);
    }
  }

  return lines.join("\n");
}

function sanitizeClassName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  if (/^[0-9]/.test(cleaned)) {
    return `Scene${cleaned}`;
  }
  return cleaned || "GameScene";
}

// ─── GDD Generation ───────────────────────────────────────

function generateGdd(data: ProjectData): string {
  const { project, characters, stories, quests, environments } = data;

  const lines: string[] = [];
  lines.push(`# ${project.name} — Game Design Document`);
  lines.push("");
  lines.push(`> Auto-generated by Sneebly`);
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push("");
  if (project.description) {
    lines.push(project.description);
    lines.push("");
  }
  lines.push(`- **Game Type:** ${project.gameType || "Not specified"}`);
  lines.push(`- **POV:** ${project.pov || "Side-Scrolling"}`);
  lines.push(
    `- **Movement Style:** ${project.movementStyle || "Fluid & Bouncy"}`
  );
  if (project.gameContext) {
    lines.push(`- **Context:** ${project.gameContext}`);
  }
  lines.push("");

  // Characters
  if (characters.length > 0) {
    lines.push("## Characters");
    lines.push("");
    for (const char of characters) {
      lines.push(`### ${char.name}`);
      lines.push("");
      lines.push(`- **Role:** ${char.role}`);
      if (char.backstory) {
        lines.push(`- **Backstory:** ${char.backstory}`);
      }
      if (char.personalityProfile) {
        lines.push(`- **Personality:** ${char.personalityProfile}`);
      }
      if (char.physicalDescription) {
        lines.push(`- **Physical Description:** ${char.physicalDescription}`);
      }
      if (char.designNotes) {
        lines.push(`- **Design Notes:** ${char.designNotes}`);
      }
      lines.push("");
    }
  }

  // Stories
  if (stories.length > 0) {
    lines.push("## Story");
    lines.push("");
    for (const story of stories) {
      lines.push(`### ${story.title}`);
      lines.push("");
      if (story.summary) {
        lines.push(story.summary);
        lines.push("");
      }
      lines.push(`- **Status:** ${story.status}`);
      lines.push("");
    }
  }

  // Quests
  if (quests.length > 0) {
    lines.push("## Quests");
    lines.push("");
    for (const quest of quests) {
      lines.push(`### ${quest.title}`);
      lines.push("");
      lines.push(`- **Type:** ${quest.questType}`);
      if (quest.description) {
        lines.push(`- **Description:** ${quest.description}`);
      }
      if (quest.narrativeHooks) {
        lines.push(`- **Narrative Hooks:** ${quest.narrativeHooks}`);
      }
      lines.push(`- **Status:** ${quest.status}`);
      lines.push("");
    }
  }

  // Environments
  if (environments.length > 0) {
    lines.push("## Environments");
    lines.push("");
    for (const env of environments) {
      lines.push(`### ${env.name}`);
      lines.push("");
      if (env.zoneType) {
        lines.push(`- **Zone Type:** ${env.zoneType}`);
      }
      if (env.description) {
        lines.push(`- **Description:** ${env.description}`);
      }
      if (env.mood) {
        lines.push(`- **Mood:** ${env.mood}`);
      }
      if (env.lightingDirection) {
        lines.push(`- **Lighting:** ${env.lightingDirection}`);
      }
      lines.push(`- **Status:** ${env.status}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("*This document was auto-generated by Sneebly. Edit your project in the app to update it.*");

  return lines.join("\n");
}

// ─── Main Export Function ─────────────────────────────────

export interface ExportOptions {
  includeGdd?: boolean;
  includeAtlases?: boolean;
  includeScene?: boolean;
  includeManifest?: boolean;
}

export async function buildPhaserBundle(
  projectId: string,
  options: ExportOptions = {}
): Promise<Buffer> {
  const {
    includeGdd = true,
    includeAtlases = true,
    includeScene = true,
    includeManifest = true,
  } = options;

  // 1. Fetch all project data
  const data = await fetchProjectData(projectId);

  const zipEntries: ZipEntry[] = [];

  // 2. Generate Phaser scene file
  if (includeScene) {
    const sceneCode = generatePhaserScene(data);
    zipEntries.push({
      path: "src/scenes/GameScene.ts",
      data: Buffer.from(sceneCode, "utf-8"),
    });
  }

  // 3. Generate asset manifest
  if (includeManifest) {
    const manifest = generateAssetManifest(data.spriteSheets, data.tilesets);
    zipEntries.push({
      path: "assets/asset-manifest.json",
      data: Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"),
    });
  }

  // 4. Generate atlas JSON configs for each sprite sheet
  if (includeAtlases) {
    for (const sheet of data.spriteSheets) {
      const key = sanitizeKey(
        `${sheet.animationState}_${sheet.id.slice(0, 8)}`
      );
      const atlasJson = generateAtlasJson(sheet);
      zipEntries.push({
        path: `assets/atlases/${key}.json`,
        data: Buffer.from(JSON.stringify(atlasJson, null, 2), "utf-8"),
      });
    }
  }

  // 5. Optionally generate GDD
  if (includeGdd) {
    const gddContent = generateGdd(data);
    zipEntries.push({
      path: "docs/GDD.md",
      data: Buffer.from(gddContent, "utf-8"),
    });
  }

  // 6. Add a README
  const readmeContent = generateReadme(data.project);
  zipEntries.push({
    path: "README.md",
    data: Buffer.from(readmeContent, "utf-8"),
  });

  // 7. Build ZIP buffer and return
  const zipBuffer = buildZipBuffer(zipEntries);
  return zipBuffer;
}

function generateReadme(project: Project): string {
  return `# ${project.name} — Phaser 3 Export

Exported by [Sneebly](https://sneebly.com)

## Contents

- \`src/scenes/GameScene.ts\` — Auto-generated Phaser 3 scene with preload, create, and update methods
- \`assets/asset-manifest.json\` — List of all sprite sheets and tilesets with dimensions
- \`assets/atlases/*.json\` — Atlas JSON configs for each sprite sheet
- \`docs/GDD.md\` — Game Design Document (if included)

## Getting Started

1. Create a new Phaser 3 project (or use an existing one)
2. Copy the \`src/\` and \`assets/\` directories into your project
3. Import \`GameScene\` in your Phaser config
4. Download your sprite sheet PNGs from Sneebly and place them in \`assets/spritesheets/\`
5. Run your game!

## Game Info

- **Type:** ${project.gameType || "Not specified"}
- **POV:** ${project.pov || "Side-Scrolling"}
- **Movement:** ${project.movementStyle || "Fluid & Bouncy"}

---

*Generated on ${new Date().toISOString().split("T")[0]}*
`;
}
