/**
 * Phaser 3 Bundle Generator
 *
 * Generates a complete Phaser 3 project as an in-memory file map.
 * Pure ESM — no require(), no fs reads, no dynamic imports.
 */

import type {
  Project,
  Animation,
  Character,
  Environment,
  Tileset,
  EnvironmentProp,
} from "../shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitise a string into a safe JS/TS identifier */
function toIdentifier(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[0-9]/, "_$&")
    .replace(/_+/g, "_");
}

/** PascalCase helper */
function toPascal(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/** Build a deterministic asset key from character + animation state */
function spriteKey(characterName: string, animState: string): string {
  return `${toIdentifier(characterName)}_${toIdentifier(animState)}`;
}

/** Build a tileset asset key */
function tilesetKey(tileset: Tileset): string {
  return `tileset_${toIdentifier(tileset.name)}`;
}

/** Build a prop asset key */
function propKey(prop: EnvironmentProp): string {
  return `prop_${toIdentifier(prop.name)}_${prop.id.slice(0, 6)}`;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generatePhaserBundle(
  project: Project,
  animations: Animation[],
  characters: Character[],
  environments: Environment[],
  tilesets: Tileset[],
  props: EnvironmentProp[],
): Record<string, string> {
  const files: Record<string, string> = {};

  // ---- Derived data -------------------------------------------------------

  const projectName = project.name || "phaser-game";
  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Group animations by character name
  const animsByCharacter = new Map<string, Animation[]>();
  for (const anim of animations) {
    const charName = anim.characterName ?? "player";
    if (!animsByCharacter.has(charName)) {
      animsByCharacter.set(charName, []);
    }
    animsByCharacter.get(charName)!.push(anim);
  }

  // Map character id → character for quick lookup
  const charById = new Map<string, Character>();
  for (const c of characters) {
    charById.set(c.id, c);
  }

  // Map environment id → environment
  const envById = new Map<string, Environment>();
  for (const e of environments) {
    envById.set(e.id, e);
  }

  // Group tilesets by environment
  const tilesetsByEnv = new Map<string, Tileset[]>();
  for (const ts of tilesets) {
    if (!tilesetsByEnv.has(ts.environmentId)) {
      tilesetsByEnv.set(ts.environmentId, []);
    }
    tilesetsByEnv.get(ts.environmentId)!.push(ts);
  }

  // Group props by environment
  const propsByEnv = new Map<string, EnvironmentProp[]>();
  for (const p of props) {
    if (!propsByEnv.has(p.environmentId)) {
      propsByEnv.set(p.environmentId, []);
    }
    propsByEnv.get(p.environmentId)!.push(p);
  }

  // ---- 1. src/main.ts -----------------------------------------------------

  files["src/main.ts"] = `import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "game-container",
  backgroundColor: "#1a1a2e",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 300 },
      debug: false,
    },
  },
  scene: [BootScene, GameScene],
};

const game = new Phaser.Game(config);

export default game;
`;

  // ---- 2. src/scenes/BootScene.ts -----------------------------------------

  const preloadLines: string[] = [];

  // Sprite sheets per character animation
  for (const [charName, charAnims] of Array.from(animsByCharacter)) {
    for (const anim of charAnims) {
      const key = spriteKey(charName, anim.name);
      const fw = 64; // sensible default; real frame dims come from spriteSheets table
      const fh = 64;
      const fc = anim.frameCount ?? 8;
      preloadLines.push(
        `    this.load.spritesheet("${key}", "assets/sprites/${key}.png", { frameWidth: ${fw}, frameHeight: ${fh} }); // ${fc} frames`,
      );
    }
  }

  // Tilesets
  for (const ts of tilesets) {
    const key = tilesetKey(ts);
    preloadLines.push(
      `    this.load.image("${key}", "assets/tilesets/${key}.png"); // ${ts.tileWidth}x${ts.tileHeight}, ${ts.tileCount} tiles`,
    );
  }

  // Props
  for (const p of props) {
    const key = propKey(p);
    if (p.spriteUrl) {
      preloadLines.push(
        `    this.load.image("${key}", "assets/props/${key}.png");`,
      );
    }
  }

  files["src/scenes/BootScene.ts"] = `import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
${preloadLines.length > 0 ? preloadLines.join("\n") : "    // No assets to preload yet"}
  }

  create(): void {
    this.scene.start("GameScene");
  }
}
`;

  // ---- 3. src/scenes/GameScene.ts ------------------------------------------

  const animCreateLines: string[] = [];
  const spawnLines: string[] = [];
  const envLines: string[] = [];

  // Animation creation
  for (const [charName, charAnims] of Array.from(animsByCharacter)) {
    animCreateLines.push(`    // --- ${charName} animations ---`);
    for (const anim of charAnims) {
      const key = spriteKey(charName, anim.name);
      const animKey = anim.animationKey ?? key;
      const fps = anim.fps ?? 12;
      const fc = anim.frameCount ?? 8;
      const loop = anim.loop !== false;
      animCreateLines.push(
        `    this.anims.create({
      key: "${animKey}",
      frames: this.anims.generateFrameNumbers("${key}", { start: 0, end: ${fc - 1} }),
      frameRate: ${fps},
      repeat: ${loop ? -1 : 0},
    });`,
      );
    }
  }

  // Spawn characters
  let spawnX = 100;
  const uniqueChars = new Set<string>();
  for (const [charName, charAnims] of Array.from(animsByCharacter)) {
    if (uniqueChars.has(charName)) continue;
    uniqueChars.add(charName);
    const firstAnim = charAnims[0];
    const firstKey = spriteKey(charName, firstAnim.name);
    const firstAnimKey = firstAnim.animationKey ?? firstKey;
    const varName = toIdentifier(charName);
    spawnLines.push(
      `    const ${varName} = this.physics.add.sprite(${spawnX}, 450, "${firstKey}");
    ${varName}.play("${firstAnimKey}");
    ${varName}.setCollideWorldBounds(true);`,
    );
    spawnX += 120;
  }

  // Environment layers & props
  for (const env of environments) {
    const envTilesets = tilesetsByEnv.get(env.id) ?? [];
    const envProps = propsByEnv.get(env.id) ?? [];
    envLines.push(`    // --- Environment: ${env.name} ---`);
    for (const ts of envTilesets) {
      const key = tilesetKey(ts);
      envLines.push(
        `    this.add.image(400, 300, "${key}").setDepth(-1); // tileset: ${ts.name}`,
      );
    }
    for (const p of envProps) {
      const key = propKey(p);
      const pos = (p.position as { x?: number; y?: number } | null) ?? {};
      const px = pos.x ?? 400;
      const py = pos.y ?? 300;
      envLines.push(
        `    this.add.image(${px}, ${py}, "${key}"); // prop: ${p.name} (${p.propType})`,
      );
    }
  }

  files["src/scenes/GameScene.ts"] = `import Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    // World bounds
    this.physics.world.setBounds(0, 0, 800, 600);

    // Ground
    const ground = this.add.rectangle(400, 580, 800, 40, 0x444444);
    this.physics.add.existing(ground, true);

${envLines.length > 0 ? envLines.join("\n") + "\n" : ""}
${animCreateLines.length > 0 ? animCreateLines.join("\n") + "\n" : ""}
${spawnLines.length > 0 ? spawnLines.join("\n") + "\n" : "    // No characters to spawn yet\n"}
    // Collide characters with ground
    this.physics.add.collider(
      this.physics.world.bodies.getArray().map((b: any) => b.gameObject),
      ground,
    );
  }

  update(): void {
    // Game loop logic goes here
  }
}
`;

  // ---- 4. src/config/animations.json --------------------------------------

  const animDefs = animations.map((anim) => ({
    id: anim.id,
    characterName: anim.characterName ?? "player",
    name: anim.name,
    animationKey: anim.animationKey ?? spriteKey(anim.characterName ?? "player", anim.name),
    fps: anim.fps ?? 12,
    frameCount: anim.frameCount ?? 8,
    loop: anim.loop !== false,
    priority: anim.priority ?? "CORE",
    prefix: anim.prefix ?? null,
    atlasKey: anim.atlasKey ?? null,
    sortOrder: anim.sortOrder ?? 0,
  }));

  files["src/config/animations.json"] = JSON.stringify(animDefs, null, 2) + "\n";

  // ---- 5. src/config/assets.json ------------------------------------------

  const assetManifest: Record<string, unknown> = {
    spriteSheets: [] as unknown[],
    tilesets: [] as unknown[],
    props: [] as unknown[],
  };

  for (const [charName, charAnims] of Array.from(animsByCharacter)) {
    for (const anim of charAnims) {
      const key = spriteKey(charName, anim.name);
      (assetManifest.spriteSheets as unknown[]).push({
        key,
        path: `assets/sprites/${key}.png`,
        frameWidth: 64,
        frameHeight: 64,
        frameCount: anim.frameCount ?? 8,
        characterName: charName,
        animationState: anim.name,
      });
    }
  }

  for (const ts of tilesets) {
    const key = tilesetKey(ts);
    (assetManifest.tilesets as unknown[]).push({
      key,
      path: `assets/tilesets/${key}.png`,
      tileWidth: ts.tileWidth,
      tileHeight: ts.tileHeight,
      tileCount: ts.tileCount,
      name: ts.name,
      environmentId: ts.environmentId,
    });
  }

  for (const p of props) {
    const key = propKey(p);
    (assetManifest.props as unknown[]).push({
      key,
      path: p.spriteUrl ? `assets/props/${key}.png` : null,
      name: p.name,
      propType: p.propType,
      environmentId: p.environmentId,
      position: p.position ?? null,
    });
  }

  files["src/config/assets.json"] = JSON.stringify(assetManifest, null, 2) + "\n";

  // ---- 6. package.json ----------------------------------------------------

  const pkg = {
    name: safeName,
    version: "0.1.0",
    description: project.description ?? `Phaser 3 game — ${projectName}`,
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
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

  files["package.json"] = JSON.stringify(pkg, null, 2) + "\n";

  // ---- 7. README.md -------------------------------------------------------

  const charList = characters.length > 0
    ? characters.map((c) => `- **${c.name}** — ${c.role}`).join("\n")
    : "- _(no characters defined yet)_";

  const envList = environments.length > 0
    ? environments.map((e) => `- **${e.name}** — ${e.zoneType ?? "zone"}`).join("\n")
    : "- _(no environments defined yet)_";

  files["README.md"] = `# ${projectName}

${project.description ?? "A Phaser 3 game generated by Sneebly."}

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build for Production

\`\`\`bash
npm run build
\`\`\`

Output goes to \`dist/\`.

## Project Info

| Field | Value |
|-------|-------|
| Game Type | ${project.gameType ?? "N/A"} |
| POV | ${project.pov ?? "Side-Scrolling"} |
| Movement | ${project.movementStyle ?? "Fluid & Bouncy"} |
| Animations | ${animations.length} |
| Characters | ${characters.length} |
| Environments | ${environments.length} |
| Tilesets | ${tilesets.length} |
| Props | ${props.length} |

### Characters
${charList}

### Environments
${envList}

## Asset Placement

Copy your sprite sheets into \`assets/sprites/\`, tilesets into \`assets/tilesets/\`, and props into \`assets/props/\`. File names must match the keys in \`src/config/assets.json\`.

---

_Generated by Sneebly_
`;

  // ---- 8. docs/GDD.md (optional — always include if we have data) ----------

  const characterSections = characters.map((c) => {
    const lines = [`### ${c.name}\n`];
    lines.push(`- **Role:** ${c.role}`);
    if (c.backstory) lines.push(`- **Backstory:** ${c.backstory}`);
    if (c.personalityProfile) lines.push(`- **Personality:** ${c.personalityProfile}`);
    if (c.physicalDescription) lines.push(`- **Physical Description:** ${c.physicalDescription}`);
    if (c.designNotes) lines.push(`- **Design Notes:** ${c.designNotes}`);
    if (c.animationStates && c.animationStates.length > 0) {
      lines.push(`- **Animation States:** ${c.animationStates.join(", ")}`);
    }
    return lines.join("\n");
  });

  const environmentSections = environments.map((e) => {
    const lines = [`### ${e.name}\n`];
    if (e.zoneType) lines.push(`- **Zone Type:** ${e.zoneType}`);
    if (e.description) lines.push(`- **Description:** ${e.description}`);
    if (e.mood) lines.push(`- **Mood:** ${e.mood}`);
    if (e.lightingDirection) lines.push(`- **Lighting:** ${e.lightingDirection}`);
    const envTs = tilesetsByEnv.get(e.id) ?? [];
    if (envTs.length > 0) {
      lines.push(`- **Tilesets:** ${envTs.map((t) => t.name).join(", ")}`);
    }
    const envPs = propsByEnv.get(e.id) ?? [];
    if (envPs.length > 0) {
      lines.push(`- **Props:** ${envPs.map((p) => `${p.name} (${p.propType})`).join(", ")}`);
    }
    return lines.join("\n");
  });

  const animSections = Array.from(animsByCharacter.entries()).map(([charName, anims]: [string, Animation[]]) => {
    const rows = anims.map(
      (a) =>
        `| ${a.name} | ${a.animationKey ?? "—"} | ${a.frameCount ?? 8} | ${a.fps ?? 12} | ${a.loop !== false ? "Yes" : "No"} | ${a.priority ?? "CORE"} |`,
    );
    return `### ${charName}\n\n| Name | Key | Frames | FPS | Loop | Priority |\n|------|-----|--------|-----|------|----------|\n${rows.join("\n")}`;
  });

  files["docs/GDD.md"] = `# Game Design Document — ${projectName}

## Overview

${project.description ?? "_(No description provided.)_"}

| Field | Value |
|-------|-------|
| Game Type | ${project.gameType ?? "N/A"} |
| POV | ${project.pov ?? "Side-Scrolling"} |
| Movement Style | ${project.movementStyle ?? "Fluid & Bouncy"} |
| Game Context | ${project.gameContext ?? "N/A"} |

## Characters

${characterSections.length > 0 ? characterSections.join("\n\n") : "_(No characters defined yet.)_"}

## Environments

${environmentSections.length > 0 ? environmentSections.join("\n\n") : "_(No environments defined yet.)_"}

## Animations

${animSections.length > 0 ? animSections.join("\n\n") : "_(No animations defined yet.)_"}

## Asset Summary

- **Sprite Sheets:** ${animations.length}
- **Tilesets:** ${tilesets.length}
- **Props:** ${props.length}

---

_Generated by Sneebly_
`;

  return files;
}
