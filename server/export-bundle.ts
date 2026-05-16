import { storage } from "./storage.js";

export interface ExportBundleOptions {
  projectId: string;
  includeGdd: boolean;
}

export interface PhaserAnimationConfig {
  key: string;
  atlasKey: string | null;
  prefix: string | null;
  frameRate: number | null;
  repeat: number;
  frames: number | null;
}

export interface PhaserCharacterConfig {
  name: string;
  role: string;
  animations: PhaserAnimationConfig[];
  spriteSheets: {
    animationState: string;
    fileUrl: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    frameRate: number | null;
    loop: boolean | null;
  }[];
}

export interface PhaserEnvironmentConfig {
  name: string;
  zoneType: string | null;
  description: string | null;
  mood: string | null;
  tilesets: {
    name: string;
    fileUrl: string;
    tileWidth: number;
    tileHeight: number;
    tileCount: number;
  }[];
  props: {
    name: string;
    propType: string;
    spriteUrl: string | null;
    position: unknown;
    phaserMetadata: unknown;
  }[];
}

export interface ExportBundle {
  exportVersion: string;
  projectName: string;
  projectDescription: string | null;
  gameType: string | null;
  pov: string | null;
  movementStyle: string | null;
  characters: PhaserCharacterConfig[];
  environments: PhaserEnvironmentConfig[];
  animations: PhaserAnimationConfig[];
  gdd?: {
    stories: {
      title: string;
      summary: string | null;
      acts: unknown;
      chapters: unknown;
    }[];
    quests: {
      title: string;
      questType: string;
      description: string | null;
      objectives: unknown;
      rewards: unknown;
    }[];
  };
  phaserConfig: {
    type: string;
    physics: {
      default: string;
      arcade: { gravity: { y: number }; debug: boolean };
    };
    scale: {
      mode: string;
      autoCenter: string;
    };
  };
}

export async function buildExportBundle(options: ExportBundleOptions): Promise<ExportBundle> {
  const { projectId, includeGdd } = options;

  const project = await storage.getProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Fetch all project data in parallel
  const [allCharacters, allAnimations, allEnvironments, allSpriteSheets] = await Promise.all([
    storage.getCharacters(projectId),
    storage.getAnimations(projectId),
    storage.getEnvironments(projectId),
    storage.getSpriteSheets(projectId),
  ]);

  // Build character configs with their sprite sheets
  const characterConfigs: PhaserCharacterConfig[] = await Promise.all(
    allCharacters.map(async (char) => {
      const charSheets = allSpriteSheets.filter((s) => s.characterId === char.id);
      const charAnims = allAnimations.filter(
        (a) => a.characterName === char.name || (char.role === "player" && a.characterName === "player")
      );

      return {
        name: char.name,
        role: char.role,
        animations: charAnims.map((a) => ({
          key: a.animationKey || `${a.characterName}_${a.name}`,
          atlasKey: a.atlasKey,
          prefix: a.prefix,
          frameRate: a.fps,
          repeat: a.loop ? -1 : 0,
          frames: a.frameCount,
        })),
        spriteSheets: charSheets.map((s) => ({
          animationState: s.animationState,
          fileUrl: s.fileUrl,
          frameWidth: s.frameWidth,
          frameHeight: s.frameHeight,
          frameCount: s.frameCount,
          frameRate: s.frameRate,
          loop: s.loop,
        })),
      };
    })
  );

  // Build environment configs with tilesets and props
  const environmentConfigs: PhaserEnvironmentConfig[] = await Promise.all(
    allEnvironments.map(async (env) => {
      const [envTilesets, envProps] = await Promise.all([
        storage.getTilesets(env.id),
        storage.getEnvironmentProps(env.id),
      ]);

      return {
        name: env.name,
        zoneType: env.zoneType,
        description: env.description,
        mood: env.mood,
        tilesets: envTilesets.map((t) => ({
          name: t.name,
          fileUrl: t.fileUrl,
          tileWidth: t.tileWidth,
          tileHeight: t.tileHeight,
          tileCount: t.tileCount,
        })),
        props: envProps.map((p) => ({
          name: p.name,
          propType: p.propType,
          spriteUrl: p.spriteUrl,
          position: p.position,
          phaserMetadata: p.phaserMetadata,
        })),
      };
    })
  );

  // Build flat animation list
  const animationConfigs: PhaserAnimationConfig[] = allAnimations.map((a) => ({
    key: a.animationKey || `${a.characterName}_${a.name}`,
    atlasKey: a.atlasKey,
    prefix: a.prefix,
    frameRate: a.fps,
    repeat: a.loop ? -1 : 0,
    frames: a.frameCount,
  }));

  const bundle: ExportBundle = {
    exportVersion: "1.0.0",
    projectName: project.name,
    projectDescription: project.description,
    gameType: project.gameType,
    pov: project.pov,
    movementStyle: project.movementStyle,
    characters: characterConfigs,
    environments: environmentConfigs,
    animations: animationConfigs,
    phaserConfig: {
      type: "Phaser.AUTO",
      physics: {
        default: "arcade",
        arcade: { gravity: { y: 300 }, debug: false },
      },
      scale: {
        mode: "Phaser.Scale.FIT",
        autoCenter: "Phaser.Scale.CENTER_BOTH",
      },
    },
  };

  // Optionally include GDD (stories + quests)
  if (includeGdd) {
    const [stories, quests] = await Promise.all([
      storage.getStories(projectId),
      storage.getQuests(projectId),
    ]);

    bundle.gdd = {
      stories: stories.map((s) => ({
        title: s.title,
        summary: s.summary,
        acts: s.acts,
        chapters: s.chapters,
      })),
      quests: quests.map((q) => ({
        title: q.title,
        questType: q.questType,
        description: q.description,
        objectives: q.objectives,
        rewards: q.rewards,
      })),
    };
  }

  return bundle;
}
