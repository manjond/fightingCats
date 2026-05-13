import { Application, Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { CATS, getMapById, MAPS, WEAPONS, WORLD } from "./config";
import type { CatId, HazardConfig, MapConfig, MatchConfig, MatchResult, PlatformConfig, PlayerSetup, RuntimeControls, WeaponId } from "./types";
import { getMapName, getStoredLanguage, getText, getWeaponName } from "../i18n";

type Rect = PlatformConfig;
type Actor = {
  setup: PlayerSetup;
  view: Container;
  catView: Container;
  weaponView: Container;
  weaponViewId: WeaponId;
  nameTag: Text;
  healthBack: Graphics;
  healthBar: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  health: number;
  alive: boolean;
  weapon: WeaponId;
  weaponUses: number | null;
  weaponAnimationId: WeaponId;
  weaponAnimationStartedAt: number;
  weaponAnimationUntil: number;
  lastAttackAt: number;
  lastHazardAt: number;
  facing: 1 | -1;
  speedBoostUntil: number;
  jumpsUsed: number;
  jumpHeld: boolean;
  blockedDown: boolean;
};

type Pickup = {
  x: number;
  y: number;
  weapon: WeaponId;
  view: Container;
  bornAt: number;
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponId;
  ownerId: string;
  bornAt: number;
  view: Container;
};

const OUTLINE = 0x0b1020;
const GROUND_ACCELERATION = 5600;
const AIR_ACCELERATION = 3900;
const GROUND_DECELERATION = 5200;
const AIR_DECELERATION = 2800;
const ARENA_GRAVITY = WORLD.gravity * 1.12;
const MAX_VX = 590;
const MAX_VY = 960;

const THEME_PALETTES: Record<MapConfig["theme"], { sky: number; far: number; mid: number; accent: number; platform: number; top: number; trim: number }> = {
  rooftop: { sky: 0x17233b, far: 0x0a1020, mid: 0x243047, accent: 0xffd166, platform: 0x566173, top: 0xb6c2d6, trim: 0x2a3345 },
  greenhouse: { sky: 0x163528, far: 0x0b1c16, mid: 0x2f6f55, accent: 0xff7f50, platform: 0x3d8b65, top: 0xb7f3c4, trim: 0x194936 },
  subway: { sky: 0x11141d, far: 0x07080d, mid: 0x272a34, accent: 0xf6c453, platform: 0x424651, top: 0xf0c86a, trim: 0x1a1d25 },
  arcade: { sky: 0x1a1028, far: 0x080510, mid: 0x3d2455, accent: 0xff5f7e, platform: 0x4b315d, top: 0x5de0e6, trim: 0x251433 },
  bakery: { sky: 0x2c1722, far: 0x140811, mid: 0x6c3d45, accent: 0xffc857, platform: 0xb76e4f, top: 0xffdf9e, trim: 0x6b342b },
  dojo: { sky: 0x241820, far: 0x100a0f, mid: 0x5d3942, accent: 0xffd166, platform: 0x8b5e34, top: 0xf8b195, trim: 0x3b211c },
  lab: { sky: 0x0d222a, far: 0x061118, mid: 0x1f5664, accent: 0xff4d6d, platform: 0x2e6978, top: 0x5de0e6, trim: 0x14343f },
  harbor: { sky: 0x12313a, far: 0x06161c, mid: 0x2f5966, accent: 0xf4d35e, platform: 0x7d6846, top: 0xc0a15b, trim: 0x3b2f21 },
};

export class PixiArena {
  private app = new Application();
  private world = new Container();
  private match: MatchConfig;
  private controls: RuntimeControls;
  private roundIndex = 0;
  private scores: Record<string, number> = {};
  private mapOrder: string[] = [];
  private platforms: Rect[] = [];
  private hazards: HazardConfig[] = [];
  private boosters: (Rect & { kind: "speed" | "jump" })[] = [];
  private actors: Actor[] = [];
  private eliminated: Actor[] = [];
  private pickups: Pickup[] = [];
  private projectiles: Projectile[] = [];
  private localActor!: Actor;
  private hud = new Text({ text: "", style: new TextStyle({ fontFamily: "monospace", fontSize: 18, fill: 0xf8fafc }) });
  private banner = new Text({ text: "", style: new TextStyle({ fontFamily: "monospace", fontSize: 32, fill: 0xffffff, stroke: { color: OUTLINE, width: 5 } }) });
  private keys = new Set<string>();
  private timers: number[] = [];
  private roundFinished = false;
  private destroyed = false;
  private initialized = false;
  private hitStopUntil = 0;
  private lastTime = performance.now();

  constructor(
    private parent: HTMLElement,
    match: MatchConfig,
    controls: RuntimeControls,
  ) {
    this.match = match;
    this.controls = controls;
    this.scores = Object.fromEntries(this.match.room.players.map((player) => [player.id, 0]));
    this.mapOrder = this.match.room.settings.mapIds.slice(0, this.match.room.settings.rounds);
  }

  async start(): Promise<void> {
    await this.app.init({
      width: this.parent.clientWidth || window.innerWidth,
      height: this.parent.clientHeight || window.innerHeight,
      background: 0x050816,
      antialias: false,
      autoDensity: false,
      resolution: 1,
    });
    this.initialized = true;

    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }

    this.app.canvas.className = "pixi-game-canvas";
    this.parent.append(this.app.canvas);
    this.app.stage.addChild(this.world);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.bindKeyboard();
    this.startRound();
    this.app.ticker.add(this.tick);
  }

  destroy(): void {
    this.destroyed = true;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.resize);
    this.app.ticker.remove(this.tick);
    if (this.initialized) {
      this.app.destroy(true);
    }
  }

  private resize = (): void => {
    const width = this.parent.clientWidth || window.innerWidth;
    const height = this.parent.clientHeight || window.innerHeight;
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / WORLD.width, height / WORLD.height);
    this.world.scale.set(scale);
    this.world.position.set(Math.round((width - WORLD.width * scale) / 2), Math.round((height - WORLD.height * scale) / 2));
  };

  private bindKeyboard(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private tick = (_ticker: Ticker): void => {
    const now = performance.now();
    if (now < this.hitStopUntil) {
      this.lastTime = now;
      return;
    }

    const delta = Math.min(0.033, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(now, delta);
  };

  private startRound(): void {
    this.roundFinished = false;
    this.eliminated = [];
    this.actors = [];
    this.pickups = [];
    this.projectiles = [];
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    this.world.removeChildren();

    const map = getMapById(this.mapOrder[this.roundIndex] ?? MAPS[0].id);
    this.platforms = map.platforms;
    this.hazards = map.hazards;
    this.boosters = map.boosters;

    this.drawBackdrop(map);
    this.drawPlatforms(map);
    this.drawHazards(map);
    this.drawBoosters(map);
    this.spawnWeapons(map);
    this.spawnActors(map);
    this.createHud(map);
  }

  private update(now: number, delta: number): void {
    if (this.roundFinished) {
      return;
    }

    const aliveActors = this.actors.filter((actor) => actor.alive);

    for (const actor of aliveActors) {
      if (actor.setup.bot) {
        this.updateBot(actor, now, delta);
      } else {
        this.updateLocalActor(actor, now, delta);
      }
    }

    for (const actor of aliveActors) {
      this.integrateActor(actor, delta);
    }

    this.resolvePlayerCollisions();

    for (const actor of aliveActors) {
      this.checkActorPickups(actor, now);
      this.checkActorBoosters(actor);
      this.checkActorHazards(actor, now);
      this.updateActorView(actor, now);
    }

    this.updatePickups(now);
    this.updateProjectiles(now, delta);
    this.checkRoundState();
    this.updateHud();
  }

  private drawBackdrop(map: MapConfig): void {
    const palette = THEME_PALETTES[map.theme];
    const background = new Graphics();
    background.rect(0, 0, WORLD.width, WORLD.height).fill(palette.sky);
    this.world.addChild(background);

    if (map.theme === "rooftop") {
      this.drawRooftopBackdrop(palette);
    } else if (map.theme === "greenhouse") {
      this.drawGreenhouseBackdrop(palette);
    } else if (map.theme === "subway") {
      this.drawSubwayBackdrop(palette);
    } else if (map.theme === "arcade") {
      this.drawArcadeBackdrop(palette);
    } else if (map.theme === "bakery") {
      this.drawBakeryBackdrop(palette);
    } else if (map.theme === "dojo") {
      this.drawDojoBackdrop(palette);
    } else if (map.theme === "lab") {
      this.drawLabBackdrop(palette);
    } else {
      this.drawHarborBackdrop(palette);
    }
  }

  private drawPlatforms(map: MapConfig): void {
    const palette = THEME_PALETTES[map.theme];
    for (const platform of map.platforms) {
      const g = new Graphics();
      g.rect(platform.x - platform.width / 2, platform.y - platform.height / 2, platform.width, platform.height).fill(OUTLINE);
      g.rect(platform.x - platform.width / 2 + 2, platform.y - platform.height / 2 + 2, platform.width - 4, Math.max(4, platform.height - 4)).fill(palette.platform);
      g.rect(platform.x - platform.width / 2 + 2, platform.y - platform.height / 2 + 2, platform.width - 4, 5).fill(palette.top);
      g.rect(platform.x - platform.width / 2 + 2, platform.y + platform.height / 2 - 6, platform.width - 4, 4).fill(palette.trim);

      const detailY = platform.y - platform.height / 2 + Math.max(9, platform.height * 0.45);
      for (let x = platform.x - platform.width / 2 + 12; x < platform.x + platform.width / 2 - 10; x += map.theme === "harbor" || map.theme === "dojo" ? 42 : 34) {
        if (map.theme === "rooftop" || map.theme === "subway" || map.theme === "lab") {
          g.rect(x, detailY, 16, 3).fill({ color: palette.accent, alpha: 0.8 });
        } else if (map.theme === "harbor" || map.theme === "dojo" || map.theme === "bakery") {
          g.rect(x, platform.y - platform.height / 2 + 4, 4, platform.height - 8).fill({ color: palette.trim, alpha: 0.72 });
        } else {
          g.rect(x, detailY - 4, 10, 10).fill({ color: palette.accent, alpha: 0.36 });
        }
      }
      this.world.addChild(g);
    }
  }

  private drawRooftopBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 510, WORLD.width, 210).fill(0x0c1322);
    for (let x = -20; x < WORLD.width; x += 94) {
      const height = 130 + ((x + 220) % 170);
      g.rect(x, 510 - height, 74, height).fill(palette.far);
      g.rect(x + 10, 510 - height + 18, 12, 8).fill({ color: palette.accent, alpha: 0.55 });
      g.rect(x + 38, 510 - height + 44, 12, 8).fill({ color: 0x5de0e6, alpha: 0.38 });
      g.rect(x + 28, 510 - height - 20, 16, 20).fill(palette.far);
      g.rect(x + 26, 510 - height - 24, 20, 4).fill(palette.accent);
    }
    g.rect(0, 595, WORLD.width, 24).fill(0x1d2638);
    for (let x = 30; x < WORLD.width; x += 110) {
      g.rect(x, 560, 44, 34).fill(0x2b3548);
      g.rect(x + 8, 548, 28, 12).fill(0x566173);
      g.rect(x + 54, 548, 12, 47).fill(0x111827);
      g.rect(x + 51, 542, 18, 8).fill(0xb6c2d6);
    }
    this.world.addChild(g);
  }

  private drawGreenhouseBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(80, 80, 1120, 500).fill({ color: 0xb7f3c4, alpha: 0.13 });
    for (let x = 80; x <= 1200; x += 80) {
      g.rect(x, 80, 5, 500).fill(0x2f6f55);
    }
    for (let y = 110; y <= 570; y += 70) {
      g.rect(80, y, 1120, 5).fill(0x2f6f55);
    }
    g.poly([80, 80, 640, 20, 1200, 80]).fill({ color: 0xb7f3c4, alpha: 0.11 });
    g.poly([80, 80, 640, 20, 1200, 80]).stroke({ width: 6, color: 0x3d8b65, alpha: 0.8 });
    for (let x = 105; x < WORLD.width; x += 155) {
      g.rect(x, 484, 38, 80).fill(0x194936);
      g.rect(x - 22, 460, 82, 26).fill(0x40f99b);
      g.rect(x - 8, 426, 54, 36).fill(0x2f6f55);
      g.rect(x + 14, 392, 26, 36).fill(0x8ef0b4);
    }
    g.rect(0, 585, WORLD.width, 38).fill(0x102d28);
    this.world.addChild(g);
  }

  private drawSubwayBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 94, WORLD.width, 460).fill(0x0b0d14);
    g.rect(70, 150, 1140, 320).fill(0x1d202a);
    for (let x = 120; x < WORLD.width; x += 190) {
      g.rect(x, 186, 112, 84).fill(0x11141d);
      g.rect(x + 10, 196, 92, 64).fill(0x28303d);
      g.rect(x + 20, 220, 72, 8).fill({ color: palette.accent, alpha: 0.65 });
    }
    g.rect(0, 520, WORLD.width, 36).fill(0x07080d);
    g.rect(0, 548, WORLD.width, 8).fill(palette.accent);
    for (let x = 20; x < WORLD.width; x += 62) {
      g.rect(x, 555, 40, 8).fill(0x424651);
    }
    this.world.addChild(g);
  }

  private drawArcadeBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 74, WORLD.width, 500).fill(0x12091f);
    for (let x = 70; x < WORLD.width; x += 142) {
      g.rect(x, 312, 88, 210).fill(0x080510);
      g.rect(x + 8, 322, 72, 58).fill(0x5de0e6);
      g.rect(x + 18, 396, 18, 18).fill(palette.accent);
      g.rect(x + 48, 396, 18, 18).fill(0xffd166);
      g.rect(x + 12, 440, 64, 12).fill(0x3d2455);
      g.rect(x + 22, 468, 42, 54).fill(0x251433);
    }
    for (let x = 44; x < WORLD.width; x += 96) {
      g.rect(x, 118, 52, 26).fill(palette.accent);
      g.rect(x + 8, 126, 36, 6).fill(0x5de0e6);
    }
    this.world.addChild(g);
  }

  private drawBakeryBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 90, WORLD.width, 500).fill(0x3b2029);
    for (let x = 70; x < WORLD.width; x += 185) {
      g.rect(x, 350, 120, 190).fill(0x6c3d45);
      g.rect(x + 12, 365, 96, 28).fill(0xffdf9e);
      g.rect(x + 22, 410, 26, 26).fill(0xffc857);
      g.rect(x + 62, 410, 26, 26).fill(0xd68a4a);
      g.rect(x + 30, 470, 62, 70).fill(0x2c1722);
    }
    for (let x = 120; x < WORLD.width; x += 260) {
      g.rect(x, 160, 92, 62).fill(0x140811);
      g.rect(x + 10, 172, 72, 38).fill(0xffc857);
    }
    g.rect(0, 560, WORLD.width, 34).fill(0x6b342b);
    this.world.addChild(g);
  }

  private drawDojoBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 80, WORLD.width, 500).fill(0x2c1c21);
    for (let x = 85; x < WORLD.width; x += 155) {
      g.rect(x, 100, 18, 460).fill(0x3b211c);
      g.rect(x + 28, 108, 82, 210).fill(0x5d3942);
      g.rect(x + 36, 118, 66, 12).fill(palette.accent);
      g.rect(x + 36, 300, 66, 12).fill(palette.accent);
    }
    g.rect(0, 560, WORLD.width, 50).fill(0x3b211c);
    for (let x = 0; x < WORLD.width; x += 72) {
      g.rect(x, 560, 34, 50).fill(0x8b5e34);
    }
    this.world.addChild(g);
  }

  private drawLabBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 88, WORLD.width, 500).fill(0x102833);
    for (let x = 72; x < WORLD.width; x += 165) {
      g.rect(x, 142, 88, 160).fill(0x061118);
      g.rect(x + 10, 154, 68, 120).fill(0x1f5664);
      g.rect(x + 22, 172, 44, 62).fill({ color: 0x5de0e6, alpha: 0.55 });
      g.rect(x + 14, 288, 60, 8).fill(palette.accent);
    }
    for (let x = 30; x < WORLD.width; x += 120) {
      g.rect(x, 430, 70, 88).fill(0x14343f);
      g.rect(x + 10, 440, 50, 12).fill(0xff4d6d);
      g.rect(x + 16, 470, 38, 32).fill(0x5de0e6);
    }
    g.rect(0, 560, WORLD.width, 34).fill(0x061118);
    this.world.addChild(g);
  }

  private drawHarborBackdrop(palette: (typeof THEME_PALETTES)[MapConfig["theme"]]): void {
    const g = new Graphics();
    g.rect(0, 410, WORLD.width, 180).fill(0x1f6270);
    for (let x = -40; x < WORLD.width; x += 150) {
      g.rect(x, 440 + ((x / 10) % 18), 90, 8).fill({ color: 0x78c6a3, alpha: 0.45 });
      g.rect(x + 36, 484, 70, 8).fill({ color: 0xc0a15b, alpha: 0.34 });
    }
    for (let x = 90; x < WORLD.width; x += 240) {
      g.rect(x, 300, 92, 74).fill(0x7d6846);
      g.poly([x - 8, 300, x + 46, 256, x + 100, 300]).fill(0xf4d35e);
      g.rect(x + 26, 324, 22, 50).fill(0x3b2f21);
      g.rect(x + 58, 322, 18, 20).fill(0x78c6a3);
      g.rect(x + 118, 245, 12, 190).fill(0x3b2f21);
      g.rect(x + 102, 258, 44, 18).fill(0xf4d35e);
    }
    g.rect(0, 570, WORLD.width, 44).fill(0x3b2f21);
    this.world.addChild(g);
  }

  private drawHazards(map: MapConfig): void {
    for (const hazard of map.hazards) {
      const g = new Graphics();
      const x = hazard.x - hazard.width / 2;
      const y = hazard.y - hazard.height / 2;
      g.rect(x, y, hazard.width, hazard.height).fill(OUTLINE);

      if (hazard.kind === "spikes") {
        this.drawSpikes(g, hazard);
      } else if (hazard.kind === "laser") {
        g.rect(x + 2, y + 2, hazard.width - 4, hazard.height - 4).fill(0x641827);
        g.rect(x + 5, y + 5, Math.max(3, hazard.width - 10), Math.max(3, hazard.height - 10)).fill(0xff4d6d);
      } else {
        g.rect(x + 3, y + 3, hazard.width - 6, hazard.height - 6).fill(0x6ee7f9);
        for (let offset = 5; offset < (hazard.height > hazard.width ? hazard.height : hazard.width); offset += 18) {
          if (hazard.height > hazard.width) {
            g.rect(hazard.x - 4, y + offset, 8, 10).fill(0xcffafe);
          } else {
            g.rect(x + offset, hazard.y - 4, 10, 8).fill(0xcffafe);
          }
        }
      }
      this.world.addChild(g);
    }
  }

  private drawSpikes(g: Graphics, hazard: HazardConfig): void {
    const orientation = this.getHazardOrientation(hazard);
    const left = hazard.x - hazard.width / 2;
    const right = hazard.x + hazard.width / 2;
    const top = hazard.y - hazard.height / 2;
    const bottom = hazard.y + hazard.height / 2;
    g.poly(
      orientation === "down"
        ? [left, top, right, top, hazard.x, bottom]
        : orientation === "left"
          ? [right, top, right, bottom, left, hazard.y]
          : orientation === "right"
            ? [left, top, right, hazard.y, left, bottom]
            : [left, bottom, hazard.x, top, right, bottom],
    ).fill(0xff4d6d);
  }

  private drawBoosters(map: MapConfig): void {
    for (const booster of map.boosters) {
      const g = new Graphics();
      const color = booster.kind === "speed" ? 0x40f99b : 0xffd166;
      g.rect(booster.x - booster.width / 2, booster.y - booster.height / 2, booster.width, booster.height).fill(OUTLINE);
      g.rect(booster.x - booster.width / 2 + 3, booster.y - booster.height / 2 + 3, booster.width - 6, booster.height - 6).fill(color);
      if (booster.kind === "speed") {
        g.poly([booster.x - 18, booster.y - 5, booster.x, booster.y, booster.x - 18, booster.y + 5]).fill(0x0b1f24);
        g.poly([booster.x + 1, booster.y - 5, booster.x + 19, booster.y, booster.x + 1, booster.y + 5]).fill(0x0b1f24);
      } else {
        g.poly([booster.x, booster.y - 6, booster.x + 14, booster.y + 6, booster.x - 14, booster.y + 6]).fill(0x1f2937);
      }
      this.world.addChild(g);
    }
  }

  private spawnWeapons(map: MapConfig): void {
    const spawnableWeapons = Object.keys(WEAPONS).filter((weapon) => weapon !== "scratch") as WeaponId[];
    map.weaponSpawns.forEach((spawn, index) => {
      const weapon = spawnableWeapons[index % spawnableWeapons.length];
      this.addWeaponSpawnMarker(spawn.x, spawn.y);
      this.createWeaponPickup(spawn.x, spawn.y, weapon);
    });
  }

  private spawnActors(map: MapConfig): void {
    const shuffledSpawns = this.shuffle([...map.spawns]);
    this.match.room.players.slice(0, WORLD.maxPlayers).forEach((player, index) => {
      const spawn = shuffledSpawns[index % shuffledSpawns.length];
      this.addSpawnMarker(spawn.x, spawn.y);
      const actor = this.createActor(player, spawn.x, spawn.y);
      this.actors.push(actor);
      this.world.addChild(actor.view);
      if (player.id === this.match.localPlayerId) {
        this.localActor = actor;
      }
    });
  }

  private createActor(player: PlayerSetup, x: number, y: number): Actor {
    const view = new Container();
    const catView = this.drawCat(player.cat);
    const weaponView = this.drawWeapon(player.cat, this.match.room.settings.startingWeapon);
    const nameTag = new Text({
      text: player.name,
      style: new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: player.bot ? 0xcbd5e1 : 0xffffff, stroke: { color: OUTLINE, width: 3 } }),
    });
    nameTag.anchor.set(0.5);
    const healthBack = new Graphics();
    const healthBar = new Graphics();

    view.addChild(catView, weaponView, nameTag, healthBack, healthBar);
    const actor: Actor = {
      setup: player,
      view,
      catView,
      weaponView,
      weaponViewId: this.match.room.settings.startingWeapon,
      nameTag,
      healthBack,
      healthBar,
      x,
      y,
      vx: 0,
      vy: 0,
      width: 23,
      height: 39,
      health: WORLD.maxHealth,
      alive: true,
      weapon: this.match.room.settings.startingWeapon,
      weaponUses: this.getWeaponUses(this.match.room.settings.startingWeapon),
      weaponAnimationId: this.match.room.settings.startingWeapon,
      weaponAnimationStartedAt: 0,
      weaponAnimationUntil: 0,
      lastAttackAt: 0,
      lastHazardAt: 0,
      facing: 1,
      speedBoostUntil: 0,
      jumpsUsed: 0,
      jumpHeld: false,
      blockedDown: false,
    };
    this.updateActorView(actor, performance.now());
    return actor;
  }

  private updateLocalActor(actor: Actor, now: number, delta: number): void {
    const left = this.controls.left || this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const right = this.controls.right || this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const jump = this.controls.jump || this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.keys.has("Space");
    const attack = this.controls.attack || this.keys.has("KeyJ");
    const throwWeapon = this.controls.throwWeapon || this.keys.has("KeyK") || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");

    this.moveActor(actor, left, right, jump, delta, now);

    if (attack) {
      this.tryAttack(actor, actor.weapon === "scratch" ? "scratch" : actor.weapon, now);
    }

    if (throwWeapon && actor.weapon !== "scratch" && WEAPONS[actor.weapon].kind !== "melee") {
      this.tryAttack(actor, actor.weapon, now);
    }
  }

  private updateBot(actor: Actor, now: number, delta: number): void {
    const target = this.findNearestEnemy(actor);
    if (!target) {
      return;
    }

    const distance = target.x - actor.x;
    const left = distance < -36;
    const right = distance > 36;
    const shouldJump = actor.blockedDown && (Math.abs(distance) > 180 || target.y + 30 < actor.y);
    this.moveActor(actor, left, right, shouldJump, delta, now);

    const closeEnough = this.distance(actor.x, actor.y, target.x, target.y) < 76;
    const weapon = WEAPONS[actor.weapon];
    const hasLineWeapon = weapon.kind !== "melee" && Math.abs(distance) < weapon.range;
    if (closeEnough || hasLineWeapon) {
      this.tryAttack(actor, actor.weapon, now);
    }
  }

  private moveActor(actor: Actor, left: boolean, right: boolean, jump: boolean, delta: number, now: number): void {
    const speed = WORLD.playerSpeed * (actor.speedBoostUntil > now ? 1.45 : 1);
    const jumpPressed = jump && !actor.jumpHeld;
    const acceleration = actor.blockedDown ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const deceleration = actor.blockedDown ? GROUND_DECELERATION : AIR_DECELERATION;

    if (actor.blockedDown) {
      actor.jumpsUsed = 0;
    }

    if (left === right) {
      actor.vx = this.moveToward(actor.vx, 0, deceleration * delta);
    } else if (left) {
      actor.vx = this.moveToward(actor.vx, -speed, acceleration * delta);
      actor.facing = -1;
    } else {
      actor.vx = this.moveToward(actor.vx, speed, acceleration * delta);
      actor.facing = 1;
    }

    actor.vx = this.clamp(actor.vx, -speed, speed);

    if (jumpPressed && actor.jumpsUsed < 2) {
      actor.vy = actor.jumpsUsed === 0 ? WORLD.jumpVelocity : WORLD.airJumpVelocity;
      actor.jumpsUsed += 1;
      this.addPuff(actor.x, actor.y + 20);
    }

    actor.jumpHeld = jump;
  }

  private integrateActor(actor: Actor, delta: number): void {
    const previousX = actor.x;
    const previousY = actor.y;
    actor.vy = Math.min(MAX_VY, actor.vy + ARENA_GRAVITY * delta);
    actor.vx = this.clamp(actor.vx, -MAX_VX, MAX_VX);

    actor.x += actor.vx * delta;
    this.resolveHorizontal(actor, previousX);

    actor.y += actor.vy * delta;
    actor.blockedDown = false;
    this.resolveVertical(actor, previousY);
  }

  private resolveHorizontal(actor: Actor, previousX: number): void {
    for (const platform of this.platforms) {
      if (!this.overlap(this.actorRect(actor), platform)) {
        continue;
      }

      if (previousX < actor.x) {
        actor.x = platform.x - platform.width / 2 - actor.width / 2;
      } else if (previousX > actor.x) {
        actor.x = platform.x + platform.width / 2 + actor.width / 2;
      }
      actor.vx = 0;
    }
  }

  private resolveVertical(actor: Actor, previousY: number): void {
    for (const platform of this.platforms) {
      if (!this.overlap(this.actorRect(actor), platform)) {
        continue;
      }

      const previousBottom = previousY + actor.height / 2;
      const previousTop = previousY - actor.height / 2;
      const platformTop = platform.y - platform.height / 2;
      const platformBottom = platform.y + platform.height / 2;

      if (previousBottom <= platformTop && actor.vy >= 0) {
        actor.y = platformTop - actor.height / 2;
        actor.vy = 0;
        actor.blockedDown = true;
      } else if (previousTop >= platformBottom && actor.vy < 0) {
        actor.y = platformBottom + actor.height / 2;
        actor.vy = 0;
      }
    }
  }

  private resolvePlayerCollisions(): void {
    const aliveActors = this.actors.filter((actor) => actor.alive);
    for (let index = 0; index < aliveActors.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < aliveActors.length; otherIndex += 1) {
        const first = aliveActors[index];
        const second = aliveActors[otherIndex];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const overlapX = (first.width + second.width) / 2 - Math.abs(dx);
        const overlapY = (first.height + second.height) / 2 - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        if (overlapX <= overlapY || overlapY > 16) {
          const direction = dx >= 0 ? 1 : -1;
          const push = overlapX / 2 + 0.2;
          first.x -= direction * push;
          second.x += direction * push;
          const averageVelocity = (first.vx + second.vx) * 0.5;
          first.vx = averageVelocity - direction * 36;
          second.vx = averageVelocity + direction * 36;
        } else {
          const direction = dy >= 0 ? 1 : -1;
          const push = overlapY / 2 + 0.2;
          first.y -= direction * push;
          second.y += direction * push;
          if (direction > 0) {
            first.blockedDown = true;
            first.vy = Math.min(0, first.vy);
            second.vy = Math.max(90, second.vy);
          } else {
            second.blockedDown = true;
            second.vy = Math.min(0, second.vy);
            first.vy = Math.max(90, first.vy);
          }
        }
      }
    }
  }

  private tryAttack(actor: Actor, weaponId: WeaponId, now: number): void {
    const weapon = WEAPONS[weaponId];
    if (actor.weaponUses !== null && actor.weaponUses <= 0) {
      this.equipWeapon(actor, "scratch");
      return;
    }

    if (now - actor.lastAttackAt < weapon.cooldownMs) {
      return;
    }

    actor.lastAttackAt = now;
    this.playWeaponAnimation(actor, weaponId, now);
    if (weapon.kind === "melee") {
      this.performMelee(actor, weaponId);
      this.consumeWeaponUse(actor);
      return;
    }

    this.fireProjectile(actor, weaponId, now);
    this.consumeWeaponUse(actor);
  }

  private performMelee(actor: Actor, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const hitboxWidth = weaponId === "scratch" ? 42 : weaponId === "feedbag" ? 62 : weapon.range;
    const hitboxHeight = weaponId === "feedbag" ? 50 : weaponId === "fishbat" ? 42 : 34;
    const hitbox = {
      x: actor.x + actor.facing * (actor.width / 2 + hitboxWidth / 2 - 2),
      y: actor.y - 4,
      width: hitboxWidth,
      height: hitboxHeight,
    };
    let hit = false;

    this.addMeleeHitSpark(actor, weaponId);
    actor.vx -= actor.facing * (weaponId === "feedbag" ? 140 : weaponId === "fishbat" ? 92 : 54);

    for (const target of this.actors) {
      if (target === actor || !target.alive) {
        continue;
      }
      const inFront = actor.facing === 1 ? target.x >= actor.x : target.x <= actor.x;
      if (inFront && this.overlap(hitbox, this.actorRect(target))) {
        hit = true;
        this.damageActor(target, weapon.damage, actor.facing * weapon.knockback, weaponId === "feedbag" ? -190 : -150);
      }
    }

    if (hit) {
      this.triggerHitStop(52);
    }
  }

  private fireProjectile(actor: Actor, weaponId: WeaponId, now: number): void {
    const weapon = WEAPONS[weaponId];
    const projectileView = this.drawWeapon(actor.setup.cat, weaponId);
    projectileView.x = actor.x + actor.facing * 34;
    projectileView.y = actor.y - 4;
    projectileView.scale.set(weapon.kind === "explosive" ? 0.78 : weaponId === "spray" ? 0.48 : 0.62);
    this.world.addChild(projectileView);
    actor.vx -= actor.facing * (weapon.kind === "explosive" ? 115 : weaponId === "pistol" ? 72 : 44);

    this.projectiles.push({
      x: projectileView.x,
      y: projectileView.y,
      vx: (weapon.projectileSpeed ?? 500) * actor.facing,
      vy: weapon.kind === "explosive" ? -120 : 0,
      weapon: weaponId,
      ownerId: actor.setup.id,
      bornAt: now,
      view: projectileView,
    });

    if (weapon.kind === "explosive") {
      actor.weaponUses = 0;
    }
  }

  private updateProjectiles(now: number, delta: number): void {
    for (const projectile of [...this.projectiles]) {
      const weapon = WEAPONS[projectile.weapon];
      projectile.vy += weapon.kind === "explosive" ? WORLD.gravity * delta : 0;
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.view.x = projectile.x;
      projectile.view.y = projectile.y;
      projectile.view.rotation += projectile.vx >= 0 ? delta * 7 : delta * -7;

      const projectileRect = { x: projectile.x, y: projectile.y, width: 22, height: 22 };
      if (this.platforms.some((platform) => this.overlap(projectileRect, platform))) {
        if (weapon.kind === "explosive") {
          this.explode(projectile.x, projectile.y, projectile.ownerId, projectile.weapon);
        }
        this.removeProjectile(projectile);
        continue;
      }

      const target = this.actors.find((actor) => actor.alive && actor.setup.id !== projectile.ownerId && this.overlap(projectileRect, this.actorRect(actor)));
      if (target) {
        if (weapon.kind === "explosive") {
          this.explode(projectile.x, projectile.y, projectile.ownerId, projectile.weapon);
        } else {
          const direction = projectile.vx >= 0 ? 1 : -1;
          this.damageActor(target, weapon.damage, direction * weapon.knockback, -130);
        }
        this.removeProjectile(projectile);
        continue;
      }

      const maxAge = weapon.kind === "explosive" ? 1550 : (weapon.range / (weapon.projectileSpeed ?? 500)) * 1000;
      if (now - projectile.bornAt > maxAge) {
        if (weapon.kind === "explosive") {
          this.explode(projectile.x, projectile.y, projectile.ownerId, projectile.weapon);
        }
        this.removeProjectile(projectile);
      }
    }
  }

  private checkActorPickups(actor: Actor, now: number): void {
    const pickup = this.pickups.find((candidate) => this.overlap(this.actorRect(actor), { x: candidate.x, y: candidate.y, width: 38, height: 38 }));
    if (!pickup) {
      return;
    }

    this.equipWeapon(actor, pickup.weapon);
    this.removePickup(pickup);
    this.setTimer(() => this.createWeaponPickup(pickup.x, pickup.y, pickup.weapon), 6500);
    this.playWeaponAnimation(actor, actor.weapon, now);
  }

  private checkActorBoosters(actor: Actor): void {
    const booster = this.boosters.find((candidate) => this.overlap(this.actorRect(actor), candidate));
    if (!booster) {
      return;
    }

    if (booster.kind === "speed") {
      actor.speedBoostUntil = performance.now() + 1700;
    } else {
      actor.vy = WORLD.jumpVelocity * 1.25;
    }
  }

  private checkActorHazards(actor: Actor, now: number): void {
    if (now - actor.lastHazardAt < 700) {
      return;
    }

    const hazard = this.hazards.find((candidate) => this.overlap(this.actorRect(actor), candidate));
    if (!hazard) {
      return;
    }

    actor.lastHazardAt = now;
    this.damageActor(actor, hazard.damage, actor.x < WORLD.width / 2 ? -220 : 220, -220);
  }

  private damageActor(actor: Actor, amount: number, knockbackX: number, knockbackY: number): void {
    actor.health = Math.max(0, actor.health - amount);
    this.triggerHitStop(amount >= 30 ? 48 : 34);
    actor.catView.tint = 0xffd1d1;
    this.setTimer(() => {
      actor.catView.tint = 0xffffff;
    }, 70);
    actor.vx = knockbackX;
    actor.vy = knockbackY;

    if (actor.health <= 0) {
      this.eliminateActor(actor);
    }
  }

  private eliminateActor(actor: Actor): void {
    if (!actor.alive) {
      return;
    }

    actor.alive = false;
    this.eliminated.push(actor);
    actor.view.visible = false;
  }

  private explode(x: number, y: number, ownerId: string, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const radius = weapon.radius ?? 80;
    const blast = new Graphics();
    blast.circle(x, y, radius).fill({ color: 0xffd166, alpha: 0.33 });
    this.world.addChild(blast);
    this.fadeAndDestroy(blast, 260, 1.6);

    for (const actor of this.actors) {
      if (!actor.alive || actor.setup.id === ownerId) {
        continue;
      }

      if (this.distance(x, y, actor.x, actor.y) <= radius) {
        const direction = actor.x >= x ? 1 : -1;
        this.damageActor(actor, weapon.damage, direction * weapon.knockback, -260);
      }
    }
  }

  private checkRoundState(): void {
    const alive = this.actors.filter((actor) => actor.alive);
    if (alive.length <= 1) {
      this.finishRound();
    }
  }

  private finishRound(): void {
    if (this.roundFinished) {
      return;
    }

    this.roundFinished = true;
    const alive = this.actors.filter((actor) => actor.alive);
    const ranking = [...alive, ...this.eliminated.slice().reverse()].map((actor) => actor.setup);
    ranking.forEach((player, index) => {
      this.scores[player.id] = (this.scores[player.id] ?? 0) + Math.max(1, WORLD.maxPlayers - index);
    });

    const result: MatchResult = {
      ranking,
      points: { ...this.scores },
      mapName: getMapName(getStoredLanguage(), getMapById(this.mapOrder[this.roundIndex]).id),
    };
    window.dispatchEvent(new CustomEvent("fc:round-end", { detail: result }));

    const winner = ranking[0];
    this.banner.text = `${winner.name} ${getText(getStoredLanguage(), "winsRound")}`;

    this.setTimer(() => {
      this.roundIndex += 1;
      if (this.roundIndex >= this.mapOrder.length) {
        window.dispatchEvent(new CustomEvent("fc:match-end", { detail: result }));
        return;
      }
      this.startRound();
    }, 2400);
  }

  private createHud(map: MapConfig): void {
    this.hud = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 18, fill: 0xf8fafc }),
    });
    this.hud.x = 18;
    this.hud.y = 16;

    const hudBack = new Graphics();
    hudBack.roundRect(10, 10, 430, 74, 0).fill({ color: 0x070c16, alpha: 0.58 });
    this.world.addChild(hudBack, this.hud);

    this.banner = new Text({
      text: getMapName(getStoredLanguage(), map.id),
      style: new TextStyle({ fontFamily: "monospace", fontSize: 32, fill: 0xffffff, stroke: { color: OUTLINE, width: 5 } }),
    });
    this.banner.anchor.set(0.5);
    this.banner.x = WORLD.width / 2;
    this.banner.y = 88;
    this.world.addChild(this.banner);
    this.setTimer(() => {
      this.banner.text = "";
    }, 1500);
    this.updateHud();
  }

  private updateHud(): void {
    if (!this.localActor) {
      return;
    }

    const language = getStoredLanguage();
    const mapName = getMapName(language, getMapById(this.mapOrder[this.roundIndex]).id);
    const localWeapon = this.getWeaponLabel(language, this.localActor);
    const alive = this.actors.filter((actor) => actor.alive).length;
    const ranking = Object.entries(this.scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([playerId, points]) => `${this.match.room.players.find((player) => player.id === playerId)?.name}: ${points}`)
      .join("  ");
    this.hud.text = `${getText(language, "round")} ${this.roundIndex + 1}/${this.mapOrder.length} - ${mapName}\n${getText(language, "alive")}: ${alive} - ${getText(language, "weapon")}: ${localWeapon}\n${ranking}`;
  }

  private updateActorView(actor: Actor, now: number): void {
    const activeAnimation = now < actor.weaponAnimationUntil;
    const visualWeapon = activeAnimation ? actor.weaponAnimationId : actor.weapon;
    const animationProgress = activeAnimation ? this.clamp((now - actor.weaponAnimationStartedAt) / Math.max(1, actor.weaponAnimationUntil - actor.weaponAnimationStartedAt), 0, 1) : 0;
    const weapon = WEAPONS[visualWeapon];
    const pulse = activeAnimation ? Math.sin(animationProgress * Math.PI) : 0;
    const swing = this.easeOutCubic(animationProgress);

    let xOffset = actor.facing * 25;
    let yOffset = -4;
    let angle = actor.facing * (visualWeapon === "scratch" ? -0.32 : 0.24);
    let scale = visualWeapon === "scratch" ? 0.82 : 0.75;

    if (activeAnimation && weapon.kind === "melee") {
      xOffset = actor.facing * (visualWeapon === "fishbat" ? 19 + pulse * 25 : 22 + pulse * 12);
      yOffset = -6 - pulse * 9;
      angle = actor.facing * this.lerp(-1.08, 1.25, swing);
      scale += pulse * (visualWeapon === "fishbat" ? 0.25 : 0.16);
    } else if (activeAnimation) {
      xOffset = actor.facing * (25 - pulse * 10);
      yOffset = -5 - pulse * 5;
      angle = actor.facing * (visualWeapon === "bomb" || visualWeapon === "bell" ? this.lerp(-0.56, 0.77, swing) : 0.24 - pulse * 0.42);
      scale += pulse * 0.1;
    }

    actor.view.x = actor.x;
    actor.view.y = actor.y;
    actor.catView.scale.set(actor.facing * 1.02, 1.02);
    actor.weaponView.x = xOffset;
    actor.weaponView.y = yOffset;
    actor.weaponView.rotation = angle;
    actor.weaponView.scale.set(scale * actor.facing, scale);
    actor.nameTag.x = 0;
    actor.nameTag.y = -52;

    actor.healthBack.clear().rect(-23, -38, 46, 6).fill({ color: 0x111827, alpha: 0.85 });
    actor.healthBar.clear().rect(-22, -37, 44 * (actor.health / WORLD.maxHealth), 4).fill(actor.health > 45 ? 0x40f99b : 0xffd166);

    if (visualWeapon !== actor.weaponViewId) {
      this.replaceWeaponView(actor, visualWeapon);
    }
  }

  private replaceWeaponView(actor: Actor, weapon: WeaponId): void {
    actor.view.removeChild(actor.weaponView);
    actor.weaponView.destroy({ children: true });
    actor.weaponView = this.drawWeapon(actor.setup.cat, weapon);
    actor.weaponViewId = weapon;
    actor.view.addChildAt(actor.weaponView, 1);
  }

  private equipWeapon(actor: Actor, weapon: WeaponId): void {
    actor.weapon = weapon;
    actor.weaponUses = this.getWeaponUses(weapon);
    this.replaceWeaponView(actor, weapon);
  }

  private consumeWeaponUse(actor: Actor): void {
    if (actor.weaponUses === null) {
      return;
    }

    actor.weaponUses -= 1;
    if (actor.weaponUses <= 0) {
      this.equipWeapon(actor, "scratch");
    }
  }

  private getWeaponUses(weapon: WeaponId): number | null {
    return WEAPONS[weapon].uses ?? null;
  }

  private getWeaponLabel(language: ReturnType<typeof getStoredLanguage>, actor: Actor): string {
    const name = getWeaponName(language, actor.weapon);
    return actor.weaponUses === null ? name : `${name} x${Math.max(0, actor.weaponUses)}`;
  }

  private createWeaponPickup(x: number, y: number, weapon: WeaponId): void {
    if (this.destroyed || this.roundFinished) {
      return;
    }

    const view = this.drawWeapon("orange", weapon);
    view.x = x;
    view.y = y;
    view.scale.set(0.72);
    this.world.addChild(view);
    this.pickups.push({ x, y, weapon, view, bornAt: performance.now() });
  }

  private updatePickups(now: number): void {
    for (const pickup of this.pickups) {
      const bob = Math.sin((now - pickup.bornAt) / 150) * 4;
      pickup.view.y = pickup.y + bob;
      pickup.view.rotation = Math.sin((now - pickup.bornAt) / 180) * 0.12;
    }
  }

  private removePickup(pickup: Pickup): void {
    this.pickups = this.pickups.filter((candidate) => candidate !== pickup);
    pickup.view.destroy({ children: true });
  }

  private removeProjectile(projectile: Projectile): void {
    this.projectiles = this.projectiles.filter((candidate) => candidate !== projectile);
    projectile.view.destroy({ children: true });
  }

  private playWeaponAnimation(actor: Actor, weaponId: WeaponId, now: number): void {
    const weapon = WEAPONS[weaponId];
    actor.weaponAnimationId = weaponId;
    actor.weaponAnimationStartedAt = now;
    actor.weaponAnimationUntil = now + (weapon.kind === "melee" ? 210 : 170);
  }

  private addSpawnMarker(x: number, y: number): void {
    const marker = new Graphics();
    marker.ellipse(x, y + 24, 28, 7).stroke({ width: 2, color: 0x5de0e6, alpha: 0.8 });
    marker.poly([x - 18, y + 26, x + 18, y + 26, x, y - 12]).fill({ color: 0x5de0e6, alpha: 0.14 });
    this.world.addChild(marker);
  }

  private addWeaponSpawnMarker(x: number, y: number): void {
    const marker = new Graphics();
    marker.rect(x - 22, y + 16, 44, 8).fill({ color: 0xffd166, alpha: 0.24 }).stroke({ width: 1, color: 0xffd166, alpha: 0.8 });
    marker.poly([x - 12, y + 20, x + 12, y + 20, x, y - 14]).fill({ color: 0xffd166, alpha: 0.12 });
    marker.rect(x - 18, y + 8, 4, 14).fill({ color: 0xfff2b2, alpha: 0.6 });
    marker.rect(x + 14, y + 8, 4, 14).fill({ color: 0xfff2b2, alpha: 0.6 });
    this.world.addChild(marker);
  }

  private addPuff(x: number, y: number): void {
    const puff = new Graphics();
    puff.circle(x, y, 14).fill({ color: 0xffffff, alpha: 0.18 });
    this.world.addChild(puff);
    this.fadeAndDestroy(puff, 180, 1.8);
  }

  private addMeleeHitSpark(actor: Actor, weaponId: WeaponId): void {
    const spark = new Container();
    const g = new Graphics();
    const color = weaponId === "fishbat" ? 0x9ee6c1 : weaponId === "feedbag" ? 0xffdf9e : 0xf8fafc;
    spark.x = actor.x + actor.facing * (weaponId === "fishbat" ? 48 : weaponId === "feedbag" ? 42 : 34);
    spark.y = actor.y - 8;
    spark.scale.x = actor.facing;

    g.rect(-2, -12, 5, 24).fill({ color, alpha: 0.92 });
    g.rect(8, -6, 18, 5).fill({ color, alpha: 0.78 });
    g.rect(8, 4, 13, 4).fill({ color, alpha: 0.62 });
    g.rect(-10, -3, 7, 6).fill({ color: 0xffd166, alpha: 0.82 });
    spark.addChild(g);
    this.world.addChild(spark);
    this.fadeAndDestroy(spark, 120, 1.25);
  }

  private triggerHitStop(durationMs: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + durationMs);
  }

  private fadeAndDestroy(item: Container, duration: number, scaleTarget: number): void {
    const bornAt = performance.now();
    const tick = (): void => {
      const progress = this.clamp((performance.now() - bornAt) / duration, 0, 1);
      item.alpha = 1 - progress;
      item.scale.set(1 + (scaleTarget - 1) * progress);
      if (progress >= 1) {
        this.app.ticker.remove(tick);
        item.destroy({ children: true });
      }
    };
    this.app.ticker.add(tick);
  }

  private drawCat(catId: CatId): Container {
    const cat = CATS.find((candidate) => candidate.id === catId) ?? CATS[0];
    const view = new Container();
    const g = new Graphics();
    const shadow = this.darken(cat.body, 0.28);

    g.rect(15, 1, 9, 15).fill(OUTLINE);
    g.rect(20, 13, 7, 16).fill(OUTLINE);
    g.rect(-16, -1, 29, 31).fill(OUTLINE);
    g.rect(-19, 24, 16, 8).fill(OUTLINE);
    g.rect(0, 24, 17, 8).fill(OUTLINE);
    g.rect(-18, -30, 36, 29).fill(OUTLINE);
    g.poly([-17, -28, -10, -42, -3, -28]).fill(OUTLINE);
    g.poly([3, -28, 11, -42, 18, -28]).fill(OUTLINE);
    g.rect(-25, 1, 12, 11).fill(OUTLINE);
    g.rect(10, 1, 12, 11).fill(OUTLINE);
    g.rect(-18, -14, 36, 12).fill(OUTLINE);

    g.rect(17, 3, 6, 12).fill(cat.body);
    g.rect(20, 13, 4, 13).fill(cat.body);
    g.rect(-13, 1, 23, 26).fill(cat.body);
    g.rect(-16, 24, 13, 5).fill(cat.body);
    g.rect(2, 24, 13, 5).fill(cat.body);
    g.rect(-15, -27, 30, 23).fill(cat.body);
    g.poly([-14, -28, -10, -38, -6, -28]).fill(cat.ear);
    g.poly([6, -28, 11, -38, 15, -28]).fill(cat.ear);
    g.rect(-22, 3, 8, 7).fill(cat.body);
    g.rect(11, 3, 8, 7).fill(cat.body);
    g.rect(-8, 6, 14, 19).fill(cat.accent);
    g.rect(-11, 19, 20, 8).fill(shadow);
    g.rect(-9, -14, 18, 11).fill(cat.accent);

    if (cat.id === "striped") {
      g.rect(-11, -24, 3, 13).fill(cat.accent);
      g.rect(-2, -26, 3, 12).fill(cat.accent);
      g.rect(8, -24, 3, 13).fill(cat.accent);
      g.rect(-12, 4, 4, 13).fill(cat.accent);
      g.rect(6, 4, 4, 13).fill(cat.accent);
    }

    g.rect(-9, -19, 7, 8).fill(0xf8fafc);
    g.rect(3, -19, 7, 8).fill(0xf8fafc);
    g.rect(-6, -17, 2, 4).fill(0x050816);
    g.rect(6, -17, 2, 4).fill(0x050816);
    g.rect(-2, -10, 4, 3).fill(0x050816);
    g.rect(-7, -7, 3, 2).fill(0x050816);
    g.rect(5, -7, 3, 2).fill(0x050816);
    g.rect(-20, -11, 10, 2).fill(0xf8fafc);
    g.rect(-20, -6, 10, 2).fill(0xf8fafc);
    g.rect(10, -11, 10, 2).fill(0xf8fafc);
    g.rect(10, -6, 10, 2).fill(0xf8fafc);
    g.rect(-15, 26, 12, 3).fill(shadow);
    g.rect(2, 26, 14, 3).fill(shadow);
    view.addChild(g);
    return view;
  }

  private drawWeapon(catId: CatId, weapon: WeaponId): Container {
    const view = new Container();
    const g = new Graphics();
    const cat = CATS.find((candidate) => candidate.id === catId) ?? CATS[0];

    if (weapon === "scratch") {
      g.rect(-14, -9, 22, 18).fill(OUTLINE);
      g.rect(-10, -5, 15, 11).fill(cat.body);
      g.rect(-13, -13, 6, 6).fill(cat.body);
      g.rect(-5, -16, 6, 6).fill(cat.body);
      g.rect(3, -13, 6, 6).fill(cat.body);
      g.poly([7, -12, 20, -17, 13, -4]).fill(0xf8fafc);
      g.poly([10, -1, 24, -2, 14, 8]).fill(0xf8fafc);
      g.poly([6, 11, 18, 16, 12, 4]).fill(0xf8fafc);
    } else if (weapon === "feedbag") {
      g.rect(-17, -14, 34, 29).fill(OUTLINE);
      g.rect(-14, -11, 28, 24).fill(0xb76e4f);
      g.rect(-10, -15, 20, 8).fill(0xffdf9e);
      g.rect(-8, -4, 16, 5).fill(0xffd166);
      g.rect(-7, 5, 14, 3).fill(0x6b342b);
      g.rect(9, -10, 5, 20).fill(0x8b4a35);
      g.rect(-14, 10, 28, 5).fill(0x6b342b);
    } else if (weapon === "pistol") {
      g.rect(-18, -8, 34, 14).fill(OUTLINE);
      g.rect(-5, 5, 12, 13).fill(OUTLINE);
      g.rect(-15, -10, 25, 10).fill(0x62d2ff);
      g.rect(-11, -6, 12, 3).fill(0xbdefff);
      g.rect(-3, 4, 8, 12).fill(0x2374d7);
      g.rect(10, -8, 13, 5).fill(0xffd166);
      g.rect(18, -4, 7, 3).fill(0xbdefff);
    } else if (weapon === "fishbat") {
      g.rect(-22, -7, 40, 14).fill(OUTLINE);
      g.poly([-25, 0, -16, -9, -16, 9]).fill(OUTLINE);
      g.rect(-18, -5, 31, 10).fill(0x78c6a3);
      g.poly([-23, 0, -17, -6, -17, 6]).fill(0x78c6a3);
      g.rect(2, -4, 8, 4).fill(0xe8f7ef);
      g.rect(-9, 3, 17, 2).fill(0x315f52);
      g.rect(14, -3, 3, 3).fill(0x10231d);
    } else if (weapon === "sardine") {
      g.rect(-17, -6, 32, 12).fill(OUTLINE);
      g.poly([-24, 0, -15, -8, -15, 8]).fill(OUTLINE);
      g.rect(-13, -4, 24, 9).fill(0xb8d8e8);
      g.poly([-21, 0, -14, -5, -14, 5]).fill(0xb8d8e8);
      g.rect(-4, -3, 13, 2).fill(0xf8fafc);
      g.rect(12, -3, 3, 3).fill(0x2a6f97);
    } else if (weapon === "spray") {
      g.rect(-10, -15, 21, 31).fill(OUTLINE);
      g.rect(-5, -20, 12, 7).fill(OUTLINE);
      g.rect(-7, -11, 16, 24).fill(0xffc857);
      g.rect(-4, -18, 10, 5).fill(0x2f80ed);
      g.rect(-4, -2, 10, 3).fill(0xffffff);
      g.rect(12, -14, 5, 5).fill(0x5de0e6);
      g.rect(18, -19, 8, 2).fill(0x5de0e6);
      g.rect(18, -10, 8, 2).fill(0x5de0e6);
      g.rect(18, -1, 6, 2).fill(0x5de0e6);
    } else if (weapon === "bell") {
      g.rect(-12, -11, 24, 24).fill(OUTLINE);
      g.rect(-6, -15, 12, 7).fill(OUTLINE);
      g.rect(-9, -8, 18, 18).fill(0xf4d35e);
      g.rect(-5, -14, 10, 5).fill(0xd89c00);
      g.rect(-6, -3, 12, 3).fill(0xffe8a3);
      g.rect(-2, 10, 5, 4).fill(0x302311);
      g.rect(8, -16, 12, 3).fill(0xff7f50);
    } else if (weapon === "yarn") {
      g.rect(-15, -15, 30, 30).fill(OUTLINE);
      g.rect(-12, -12, 24, 24).fill(0xe76f9d);
      g.rect(-12, -4, 24, 3).fill(0xffc2d6);
      g.rect(-8, -12, 3, 24).fill(0xffc2d6);
      g.rect(2, -12, 3, 24).fill(0xffc2d6);
      g.rect(-10, 6, 19, 3).fill(0x9d3b6d);
    } else if (weapon === "kibble") {
      g.rect(-13, -11, 26, 24).fill(OUTLINE);
      g.rect(-4, -18, 7, 9).fill(OUTLINE);
      g.rect(-10, -8, 20, 18).fill(0xc46b3a);
      g.rect(-5, -4, 8, 5).fill(0xffb86b);
      g.rect(3, 5, 5, 3).fill(0x7c351f);
      g.rect(-3, -17, 5, 8).fill(0xf4d35e);
      g.rect(3, -20, 12, 3).fill(0xff7f50);
      g.rect(14, -23, 4, 4).fill(0xffd166);
    } else {
      g.rect(-14, -13, 28, 28).fill(OUTLINE);
      g.rect(-4, -19, 7, 9).fill(OUTLINE);
      g.rect(-11, -10, 22, 22).fill(0x243b53);
      g.rect(-6, -7, 7, 5).fill(0x5a718a);
      g.rect(-3, -18, 5, 8).fill(0xf4d35e);
      g.rect(3, -20, 12, 3).fill(0xff7f50);
      g.rect(14, -23, 4, 4).fill(0xffd166);
    }

    view.addChild(g);
    return view;
  }

  private getHazardOrientation(hazard: HazardConfig): "up" | "down" | "left" | "right" {
    if (hazard.height > hazard.width) {
      return hazard.x < WORLD.width / 2 ? "right" : "left";
    }
    return hazard.y < 80 ? "down" : "up";
  }

  private actorRect(actor: Actor): Rect {
    return { x: actor.x, y: actor.y, width: actor.width, height: actor.height };
  }

  private overlap(a: Rect, b: Rect): boolean {
    return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
  }

  private findNearestEnemy(actor: Actor): Actor | null {
    return (
      this.actors
        .filter((candidate) => candidate !== actor && candidate.alive)
        .sort((a, b) => this.distance(actor.x, actor.y, a.x, a.y) - this.distance(actor.x, actor.y, b.x, b.y))[0] ?? null
    );
  }

  private setTimer(callback: () => void, delay: number): void {
    const timer = window.setTimeout(callback, delay);
    this.timers.push(timer);
  }

  private shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }

  private distance(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(ax - bx, ay - by);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private moveToward(value: number, target: number, maxDelta: number): number {
    if (Math.abs(target - value) <= maxDelta) {
      return target;
    }
    return value + Math.sign(target - value) * maxDelta;
  }

  private lerp(from: number, to: number, amount: number): number {
    return from + (to - from) * amount;
  }

  private easeOutCubic(value: number): number {
    return 1 - Math.pow(1 - value, 3);
  }

  private darken(color: number, amount: number): number {
    const red = Math.max(0, Math.round(((color >> 16) & 255) * (1 - amount)));
    const green = Math.max(0, Math.round(((color >> 8) & 255) * (1 - amount)));
    const blue = Math.max(0, Math.round((color & 255) * (1 - amount)));
    return (red << 16) + (green << 8) + blue;
  }
}
