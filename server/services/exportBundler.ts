import * as zlib from "zlib";
import { db } from "../db";
import {
  characters,
  spriteSheets,
  animations,
  environments,
  tilesets,
  environmentProps,
  stories,
  quests,
  projects,
} from "../../shared/schema";
import { eq } from "drizzle-orm";

// ── Minimal ZIP builder using Node built-ins ───────────────────────────────────
// We avoid external deps (jszip/archiver) by building a ZIP manually.
// ZIP format: local file headers + data + central directory + end record.

interface ZipEntry {
  path: string;
  data: Buffer;
}

function buildZipBuffer(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, "utf-8");
    const data = entry.data;

    // Local file header (30 bytes + path + data)
    const local = Buffer.alloc(30 + pathBuf.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);            // version needed to extract (2.0)
    local.writeUInt16LE(0, 6);             // general purpose bit flag
    local.writeUInt16LE(0, 8);             // compression method (0 = stored)
    local.writeUInt16LE(0, 10);            // last mod file time
    local.writeUInt16LE(0, 12);            // last mod file date
    // CRC-32
    const crc = crc32(data);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);  // compressed size
    local.writeUInt32LE(data.length, 22);  // uncompressed size
    local.writeUInt16LE(pathBuf.length, 26); // file name length
    local.writeUInt16LE(0, 28);            // extra field length
    pathBuf.copy(local, 30);
    data.copy(local, 30 + pathBuf.length);

    localHeaders.push(local);

    // Central directory header (46 bytes + path)
    const central = Buffer.alloc(46 + pathBuf.length);
    central.writeUInt32LE(0x02014b50, 0);  // central directory header signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed to extract
    central.writeUInt16LE(0, 8);            // general purpose bit flag
    central.writeUInt16LE(0, 10);           // compression method
    central.writeUInt16LE(0, 12);           // last mod file time
    central.writeUInt16LE(0, 14);           // last mod file date
    central.writeUInt32LE(crc, 16);         // CRC-32
    central.writeUInt32LE(data.length, 20); // compressed size
    central.writeUInt32LE(data.length, 24); // uncompressed size
    central.writeUInt16LE(pathBuf.length, 28); // file name length
    central.writeUInt16LE(0, 30);           // extra field length
    central.writeUInt16LE(0, 32);           // file comment length
    central.writeUInt16LE(0, 34);           // disk number start
    central.writeUInt16LE(0, 36);           // internal file attributes
    central.writeUInt32LE(0, 38);           // external file attributes
    central.writeUInt32LE(offset, 42);      // relative offset of local header
    pathBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length;
  }

  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuf.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // end of central dir signature
  eocd.writeUInt16LE(0, 4);                // number of this disk
  eocd.writeUInt16LE(0, 6);                // disk where central dir starts
  eocd.writeUInt16LE(entries.length, 8);   // number of central dir records on this disk
  eocd.writeUInt16LE(entries.length, 10);  // total number of central dir records
  eocd.writeUInt32LE(centralDirSize, 12);  // size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20);               // comment length

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

// Simple CRC-32 implementation
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Simple zip builder class to match the API used below
class SimpleZip {
  private entries: ZipEntry[] = [];

  file(path: string, content: string): void {
    this.entries.push({ path, data: Buffer.from(content, "utf-8") });
  }

  generateAsync(): Buffer {
    return buildZipBuffer(this.entries);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExportOptions {
  includeGdd?: boolean;
}

interface ExportResult {
  buffer: Buffer;
  metadata: {
    projectId: string;
    projectName: string;
    spriteSheetCount: number;
    animationCount: number;
    environmentCount: number;
    tilesetCount: number;
    characterCount: number;
    storyCount: number;
    questCount: number;
    includesGdd: boolean;
    generatedAt: string;
  };
}

interface PhaserAnimConfig {
  key: string;
  spriteSheetKey: string;
  frameRate: number;
  repeat: number;
  frameStart: number;
  frameEnd: number;
}

interface AtlasEntry {
  key: string;
  fileUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  animationState: string;
  characterId: string;
}

interface AssetManifest {
  spriteSheets: AtlasEntry[];
  animations: PhaserAnimConfig[];
  tilesets: { key: string; fileUrl: string; tileWidth: number; tileHeight: number; tileCount: number }[];
  environments: { key: string; name: string; props: { key: string; spriteUrl: string | null; position: any }[] }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "unnamed";
}

function buildAtlasEntries(sheets: any[]): AtlasEntry[] {
  return sheets.map((s) => ({
    key: sanitizeKey(s.animationState ?? s.id),
    fileUrl: s.fileUrl,
    frameWidth: s.frameWidth,
    frameHeight: s.frameHeight,
    frameCount: s.frameCount,
    animationState: s.animationState,
    characterId: s.characterId,
  }));
}

function buildAnimConfigs(animRows: any[], atlasEntries: AtlasEntry[]): PhaserAnimConfig[] {
  return animRows.map((a) => {
    const atlasKey = a.atlasKey ? sanitizeKey(a.atlasKey) : sanitizeKey(a.name);
    return {
      key: sanitizeKey(a.animationKey ?? a.name),
      spriteSheetKey: atlasKey,
      frameRate: a.fps ?? 12,
      repeat: a.loop ? -1 : 0,
      frameStart: 0,
      frameEnd: Math.max(0, (a.frameCount ?? 8) - 1),
    };
  });
}

// ── Template Generators ────────────────────────────────────────────────────────

function generateMainTs(projectName: string): string {
  return `import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  title: ${JSON.stringify(projectName)},
  width: 800,
  height: 600,
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

export default new Phaser.Game(config);
`;
}

function generateBootSceneTs(manifest: AssetManifest): string {
  const preloadLines: string[] = [];

  for (const entry of manifest.spriteSheets) {
    preloadLines.push(
      `    this.load.spritesheet("${entry.key}", "assets/sprites/${entry.key}.png", { frameWidth: ${entry.frameWidth}, frameHeight: ${entry.frameHeight} });`
    );
  }

  for (const ts of manifest.tilesets) {
    preloadLines.push(
      `    this.load.image("${ts.key}", "assets/tilesets/${ts.key}.png");`
    );
  }

  for (const env of manifest.environments) {
    for (const prop of env.props) {
      if (prop.spriteUrl) {
        preloadLines.push(
          `    this.load.image("${prop.key}", "assets/props/${prop.key}.png");`
        );
      }
    }
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
    console.log("BootScene: All assets loaded.");
    this.scene.start("GameScene");
  }
}
`;
}

function generateGameSceneTs(manifest: AssetManifest): string {
  const createAnimLines: string[] = [];

  for (const anim of manifest.animations) {
    createAnimLines.push(
      `    this.anims.create({
      key: "${anim.key}",
      frames: this.anims.generateFrameNumbers("${anim.spriteSheetKey}", { start: ${anim.frameStart}, end: ${anim.frameEnd} }),
      frameRate: ${anim.frameRate},
      repeat: ${anim.repeat},
    });`
    );
  }

  return `import Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // Register animations
${createAnimLines.join("\n\n")}

    // TODO: Place your game objects, tilemaps, and characters here.
    // All sprite sheets and tilesets are already loaded by BootScene.
    console.log("GameScene created — animations registered, ready to build.");
  }

  update(time: number, delta: number): void {
    // TODO: Game loop logic
  }
}
`;
}

function generatePackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: sanitizeKey(projectName) + "-phaser",
      version: "1.0.0",
      private: true,
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
      },
      dependencies: {
        phaser: "^3.80.0",
      },
      devDependencies: {
        typescript: "^5.4.0",
        vite: "^5.2.0",
      },
    },
    null,
    2
  );
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "./dist",
        rootDir: "./src",
      },
      include: ["src"],
    },
    null,
    2
  );
}

function generateIndexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName}</title>
  <style>body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; }</style>
</head>
<body>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;
}

function generateReadme(projectName: string, manifest: AssetManifest): string {
  const lines: string[] = [
    `# ${projectName} — Phaser 3 Export`,
    "",
    "Auto-generated by Sneebly.",
    "",
    "## Quick Start",
    "",
    "```bash",
    "npm install",
    "npm run dev",
    "```",
    "",
    "## Project Structure",
    "",
    "```",
    "src/",
    "  main.ts            — Phaser game config & entry point",
    "  scenes/",
    "    BootScene.ts     — Asset loading",
    "    GameScene.ts     — Main game scene with animations",
    "assets/",
    "  sprites/           — Sprite sheet PNGs",
    "  tilesets/          — Tileset PNGs",
    "  props/             — Environment prop PNGs",
    "config/",
    "  AssetManifest.json — Full asset manifest",
    "```",
    "",
    "## Assets Summary",
    "",
    `- **Sprite Sheets:** ${manifest.spriteSheets.length}`,
    `- **Animations:** ${manifest.animations.length}`,
    `- **Tilesets:** ${manifest.tilesets.length}`,
    `- **Environments:** ${manifest.environments.length}`,
    "",
    "## Notes",
    "",
    "- Place your actual PNG assets in the corresponding `assets/` subdirectories.",
    "- The `config/AssetManifest.json` contains all metadata for programmatic use.",
    "- All generated TypeScript targets Phaser 3.60+.",
  ];
  return lines.join("\n");
}

function generateGdd(
  projectRow: any,
  storyRows: any[],
  characterRows: any[],
  questRows: any[]
): string {
  const lines: string[] = [
    `# Game Design Document: ${projectRow.name}`,
    "",
  ];

  if (projectRow.description) {
    lines.push("## Overview", "", projectRow.description, "");
  }

  if (projectRow.gameType) {
    lines.push(`**Genre / Type:** ${projectRow.gameType}`, "");
  }
  if (projectRow.pov) {
    lines.push(`**Perspective:** ${projectRow.pov}`, "");
  }
  if (projectRow.movementStyle) {
    lines.push(`**Movement Style:** ${projectRow.movementStyle}`, "");
  }

  // Research Bible
  const rb = projectRow.researchBible as Record<string, any> | null;
  if (rb) {
    lines.push("## Research Bible", "");
    if (rb.genre) lines.push(`**Genre:** ${rb.genre}`);
    if (rb.subGenre) lines.push(`**Sub-Genre:** ${rb.subGenre}`);
    if (rb.themes?.length) lines.push(`**Themes:** ${rb.themes.join(", ")}`);
    if (rb.targetAudience) lines.push(`**Target Audience:** ${rb.targetAudience}`);
    lines.push("");

    if (rb.artDirection) {
      lines.push("### Art Direction", "");
      if (rb.artDirection.style) lines.push(`- **Style:** ${rb.artDirection.style}`);
      if (rb.artDirection.mood) lines.push(`- **Mood:** ${rb.artDirection.mood}`);
      if (rb.artDirection.colorPalette?.length) lines.push(`- **Palette:** ${rb.artDirection.colorPalette.join(", ")}`);
      lines.push("");
    }

    if (rb.mechanics) {
      lines.push("### Mechanics", "");
      if (rb.mechanics.core?.length) lines.push(`- **Core:** ${rb.mechanics.core.join(", ")}`);
      if (rb.mechanics.secondary?.length) lines.push(`- **Secondary:** ${rb.mechanics.secondary.join(", ")}`);
      lines.push("");
    }

    if (rb.narrativeFramework) {
      lines.push("### Narrative Framework", "");
      if (rb.narrativeFramework.tone) lines.push(`- **Tone:** ${rb.narrativeFramework.tone}`);
      if (rb.narrativeFramework.perspective) lines.push(`- **Perspective:** ${rb.narrativeFramework.perspective}`);
      if (rb.narrativeFramework.worldBuilding) lines.push(`- **World Building:** ${rb.narrativeFramework.worldBuilding}`);
      lines.push("");
    }
  }

  // Stories
  if (storyRows.length > 0) {
    lines.push("## Stories", "");
    for (const story of storyRows) {
      lines.push(`### ${story.title}`, "");
      if (story.summary) lines.push(story.summary, "");
    }
  }

  // Characters
  if (characterRows.length > 0) {
    lines.push("## Characters", "");
    for (const char of characterRows) {
      lines.push(`### ${char.name} (${char.role})`, "");
      if (char.backstory) lines.push(`**Backstory:** ${char.backstory}`, "");
      if (char.personalityProfile) lines.push(`**Personality:** ${char.personalityProfile}`, "");
      if (char.physicalDescription) lines.push(`**Physical:** ${char.physicalDescription}`, "");
      if (char.designNotes) lines.push(`**Design Notes:** ${char.designNotes}`, "");
      lines.push("");
    }
  }

  // Quests
  if (questRows.length > 0) {
    lines.push("## Quests", "");
    for (const quest of questRows) {
      lines.push(`### ${quest.title} (${quest.questType})`, "");
      if (quest.description) lines.push(quest.description, "");
      if (quest.objectives) {
        lines.push("**Objectives:**", "");
        const objs = Array.isArray(quest.objectives) ? quest.objectives : [quest.objectives];
        for (const obj of objs) {
          lines.push(`- ${typeof obj === "string" ? obj : JSON.stringify(obj)}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("", "---", `*Generated by Sneebly on ${new Date().toISOString()}*`);
  return lines.join("\n");
}

// ── Main Export ────────────────────────────────────────────────────────────────

export async function bundleProjectExport(
  projectId: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const { includeGdd = true } = options;

  // Query all project assets in parallel
  const [
    projectRows,
    characterRows,
    sheetRows,
    animRows,
    envRows,
    tilesetRows,
    propRows,
    storyRows,
    questRows,
  ] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, projectId)),
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(spriteSheets).where(eq(spriteSheets.projectId, projectId)),
    db.select().from(animations).where(eq(animations.projectId, projectId)),
    db.select().from(environments).where(eq(environments.projectId, projectId)),
    db.select().from(tilesets).where(eq(tilesets.projectId, projectId)),
    db.select().from(environmentProps).where(eq(environmentProps.projectId, projectId)),
    db.select().from(stories).where(eq(stories.projectId, projectId)),
    db.select().from(quests).where(eq(quests.projectId, projectId)),
  ]);

  const projectRow = projectRows[0];
  if (!projectRow) {
    throw new Error(`Project ${projectId} not found`);
  }

  const projectName = projectRow.name || `Project ${projectId}`;

  // Build derived data
  const atlasEntries = buildAtlasEntries(sheetRows);
  const animConfigs = buildAnimConfigs(animRows, atlasEntries);

  // Build environment data with props
  const envManifest = envRows.map((env) => {
    const envProps = propRows
      .filter((p) => p.environmentId === env.id)
      .map((p) => ({
        key: sanitizeKey(p.name),
        spriteUrl: p.spriteUrl,
        position: p.position,
      }));
    return {
      key: sanitizeKey(env.name),
      name: env.name,
      props: envProps,
    };
  });

  const tilesetManifest = tilesetRows.map((ts) => ({
    key: sanitizeKey(ts.name),
    fileUrl: ts.fileUrl,
    tileWidth: ts.tileWidth,
    tileHeight: ts.tileHeight,
    tileCount: ts.tileCount,
  }));

  const manifest: AssetManifest = {
    spriteSheets: atlasEntries,
    animations: animConfigs,
    tilesets: tilesetManifest,
    environments: envManifest,
  };

  // Assemble ZIP using built-in approach
  const zip = new SimpleZip();

  // /src/main.ts
  zip.file("src/main.ts", generateMainTs(projectName));

  // /src/scenes/BootScene.ts
  zip.file("src/scenes/BootScene.ts", generateBootSceneTs(manifest));

  // /src/scenes/GameScene.ts
  zip.file("src/scenes/GameScene.ts", generateGameSceneTs(manifest));

  // /config/AssetManifest.json
  zip.file("config/AssetManifest.json", JSON.stringify(manifest, null, 2));

  // /config/characters.json
  zip.file("config/characters.json", JSON.stringify(characterRows, null, 2));

  // /config/environments.json
  zip.file("config/environments.json", JSON.stringify(envRows, null, 2));

  // /config/stories.json
  zip.file("config/stories.json", JSON.stringify(storyRows, null, 2));

  // /config/quests.json
  zip.file("config/quests.json", JSON.stringify(questRows, null, 2));

  // /assets/sprites/README.md
  const spriteReadmeLines = [
    "# Sprites",
    "",
    "Place your sprite sheet PNGs here. Expected files:",
    "",
  ];
  for (const entry of atlasEntries) {
    spriteReadmeLines.push(`- \`${entry.key}.png\` — ${entry.frameWidth}x${entry.frameHeight}, ${entry.frameCount} frames (${entry.animationState})`);
  }
  zip.file("assets/sprites/README.md", spriteReadmeLines.join("\n"));

  // /assets/tilesets/README.md
  const tilesetReadmeLines = [
    "# Tilesets",
    "",
    "Place your tileset PNGs here. Expected files:",
    "",
  ];
  for (const ts of tilesetManifest) {
    tilesetReadmeLines.push(`- \`${ts.key}.png\` — ${ts.tileWidth}x${ts.tileHeight}, ${ts.tileCount} tiles`);
  }
  zip.file("assets/tilesets/README.md", tilesetReadmeLines.join("\n"));

  // /assets/props/README.md
  zip.file("assets/props/README.md", "# Props\n\nPlace environment prop PNGs here.\n");

  // Root config files
  zip.file("package.json", generatePackageJson(projectName));
  zip.file("tsconfig.json", generateTsConfig());
  zip.file("index.html", generateIndexHtml(projectName));
  zip.file("README.md", generateReadme(projectName, manifest));

  // Optional GDD
  if (includeGdd) {
    zip.file("docs/GDD.md", generateGdd(projectRow, storyRows, characterRows, questRows));
  }

  // Generate zip buffer synchronously (no external deps)
  const buffer = zip.generateAsync();

  const generatedAt = new Date().toISOString();

  return {
    buffer,
    metadata: {
      projectId,
      projectName,
      spriteSheetCount: sheetRows.length,
      animationCount: animRows.length,
      environmentCount: envRows.length,
      tilesetCount: tilesetRows.length,
      characterCount: characterRows.length,
      storyCount: storyRows.length,
      questCount: questRows.length,
      includesGdd: includeGdd,
      generatedAt,
    },
  };
}
