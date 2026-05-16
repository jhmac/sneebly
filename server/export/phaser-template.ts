/**
 * Phaser template generator — produces source files for a minimal Phaser 3
 * game that loads the exported sprite sheets and plays generated animations.
 */

interface TemplateAsset {
  key: string;
  path: string;
  type: "sprite" | "tileset" | "atlas";
}

export interface PhaserTemplateOptions {
  projectId: number | string;
  sprites: any[];
  animations: any[];
  tilesets: any[];
  environments: any[];
  characters: any[];
  assets: TemplateAsset[];
}

export interface TemplateFile {
  filename: string;
  content: string;
}

export function generatePhaserTemplate(options: PhaserTemplateOptions): TemplateFile[] {
  const { projectId, assets, animations } = options;

  const preloadLines = assets.map((a) => {
    if (a.type === "atlas") {
      return `    this.load.atlas('${a.key}', '${a.path}', '${a.path.replace(/\.\w+$/, ".json")}');`;
    }
    if (a.type === "tileset") {
      return `    this.load.image('${a.key}', '${a.path}');`;
    }
    return `    this.load.spritesheet('${a.key}', '${a.path}', { frameWidth: 64, frameHeight: 64 });`;
  }).join("\n");

  const animCreateLines = animations.map((anim: any) => {
    const key = anim.key ?? anim.name?.toLowerCase().replace(/\s+/g, "_") ?? "idle";
    const spriteKey = anim.spriteKey ?? assets[0]?.key ?? "player";
    const frameCount = anim.frames ?? anim.frameCount ?? 4;
    const fps = anim.fps ?? anim.frameRate ?? 12;
    return `    this.anims.create({ key: '${key}', frames: this.anims.generateFrameNumbers('${spriteKey}', { start: 0, end: ${frameCount - 1} }), frameRate: ${fps}, repeat: -1 });`;
  }).join("\n");

  const mainScene = `import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Sprite;

  constructor() { super({ key: 'GameScene' }); }

  preload(): void {
${preloadLines}
  }

  create(): void {
${animCreateLines}
    // Place first sprite at center
    const firstKey = ${JSON.stringify(assets[0]?.key ?? "")};
    if (firstKey) {
      this.player = this.add.sprite(400, 300, firstKey);
      this.player.play(${JSON.stringify(animations[0]?.key ?? animations[0]?.name ?? "")});
    }
  }
}
`;

  const config = `import Phaser from 'phaser';
import { GameScene } from './GameScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  scene: [GameScene],
};

new Phaser.Game(gameConfig);
`;

  const packageJson = JSON.stringify({
    name: `phaser-game-${projectId}`,
    version: "1.0.0",
    scripts: { dev: "vite", build: "vite build" },
    dependencies: { phaser: "^3.88.0" },
    devDependencies: { vite: "^5.0.0", typescript: "^5.0.0" },
  }, null, 2);

  return [
    { filename: "GameScene.ts", content: mainScene },
    { filename: "main.ts", content: config },
    { filename: "package.json", content: packageJson },
  ];
}
