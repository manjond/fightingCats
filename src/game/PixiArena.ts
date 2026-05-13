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
const DRAG_X = 1650;
const MAX_VX = 620;
const MAX_VY = 960;

const THEME_PALETTES: Record<MapConfig["theme"], { base: number; shadow: number; grid: number; accent: number; platform: number; top: number }> = {
  rooftop: { base: 0x101827, shadow: 0x07101f, grid: 0x5de0e6, accent: 0xffd166, platform: 0x39445c, top: 0x7bdff2 },
  greenhouse: { base: 0x0e241f, shadow: 0x07150f, grid: 0x40f99b, accent: 0xff7f50, platform: 0x286152, top: 0x8ef0b4 },
  subway: { base: 0x151821, shadow: 0x090b11, grid: 0xf6c453, accent: 0x5de0e6, platform: 0x343847, top: 0xf6c453 },
  arcade: { base: 0x191126, shadow: 0x080612, grid: 0xff5f7e, accent: 0x5de0e6, platform: 0x47335f, top: 0xff5f7e },
  bakery: { base: 0x241522, shadow: 0x100812, grid: 0xffc857, accent: 0xff8fab, platform: 0x65405a, top: 0xffc857 },
  dojo: { base: 0x211827, shadow: 0x0f0a14, grid: 0xf8b195, accent: 0xffd166, platform: 0x57415b, top: 0xf8b195 },
  lab: { base: 0x0e222a, shadow: 0x061118, grid: 0x5de0e6, accent: 0xff4d6d, platform: 0x285669, top: 0x5de0e6 },
  harbor: { base: 0x102a32, shadow: 0x06161c, grid: 0x78c6a3, accent: 0xf4d35e, platform: 0x2f5966, top: 0x78c6a3 },
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

    for (const actor of this.actors) {
      if (!actor.alive) {
        continue;
      }

      if (actor.setup.bot) {
        this.updateBot(actor, now, delta);
      } else {
        this.updateLocalActor(actor, now, delta);
      }

      this.integrateActor(actor, delta);
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
    background.rect(0, 0, WORLD.width, WORLD.height).fill(palette.base);
    this.world.addChild(background);

    for (let y = 58; y < WORLD.height; y += 96) {
      const line = new Graphics();
      line.rect(0, y, WORLD.width, 2).fill({ color: palette.grid, alpha: 0.18 });
      this.world.addChild(line);
    }

    for (let index = 0; index < 12; index += 1) {
      const x = index * 118 + 36;
      const height = 72 + ((index * 43) % 168);
      const block = new Graphics();
      block.rect(x - 31, WORLD.height - 46 - height, 62, height).fill({ color: palette.shadow, alpha: 0.58 });
      block.rect(x - 10, WORLD.height - 58 - height, 32, 7).fill({ color: palette.accent, alpha: 0.62 });
      block.rect(x - 20, WORLD.height - 70 - height / 2, 5, height - 20).fill({ color: palette.grid, alpha: 0.28 });
      this.world.addChild(block);
    }

    if (map.theme === "arcade") {
      for (let x = 95; x < WORLD.width; x += 155) {
        const sign = new Graphics();
        sign.rect(x - 24, 90, 48, 38).fill({ color: 0xff5f7e, alpha: 0.24 });
        sign.rect(x - 5, 108, 26, 8).fill({ color: 0x5de0e6, alpha: 0.42 });
        this.world.addChild(sign);
      }
    }
  }

  private drawPlatforms(map: MapConfig): void {
    const palette = THEME_PALETTES[map.theme];
    for (const platform of map.platforms) {
      const g = new Graphics();
      g.rect(platform.x - platform.width / 2, platform.y - platform.height / 2, platform.width, platform.height).fill(OUTLINE);
      g.rect(platform.x - platform.width / 2, platform.y - platform.height / 2, platform.width, 4).fill(palette.top);
      g.rect(platform.x - platform.width / 2, platform.y - platform.height / 2 + 4, platform.width, platform.height - 6).fill(palette.platform);
      for (let x = platform.x - platform.width / 2 + 10; x < platform.x + platform.width / 2; x += 34) {
        g.rect(x, platform.y - 2, 14, 3).fill({ color: palette.accent, alpha: 0.8 });
      }
      this.world.addChild(g);
    }
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
      width: 28,
      height: 44,
      health: WORLD.maxHealth,
      alive: true,
      weapon: this.match.room.settings.startingWeapon,
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

    if (actor.blockedDown) {
      actor.jumpsUsed = 0;
    }

    if (left === right) {
      actor.vx = this.moveToward(actor.vx, 0, DRAG_X * delta);
    } else if (left) {
      actor.vx -= speed * 9.4 * delta;
      actor.facing = -1;
    } else {
      actor.vx += speed * 9.4 * delta;
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
    actor.vy = Math.min(MAX_VY, actor.vy + WORLD.gravity * delta);
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

  private tryAttack(actor: Actor, weaponId: WeaponId, now: number): void {
    const weapon = WEAPONS[weaponId];
    if (now - actor.lastAttackAt < weapon.cooldownMs) {
      return;
    }

    actor.lastAttackAt = now;
    this.playWeaponAnimation(actor, weaponId, now);
    if (weapon.kind === "melee") {
      this.performMelee(actor, weaponId);
      return;
    }

    this.fireProjectile(actor, weaponId, now);
  }

  private performMelee(actor: Actor, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const originX = actor.x + actor.facing * 32;
    const slash = new Graphics();
    slash.arc(originX, actor.y, weapon.range * 0.46, -0.95, 0.95).stroke({ width: 8, color: weaponId === "fishbat" ? 0x78c6a3 : 0xf7f7ff, alpha: 0.55 });
    slash.scale.x = actor.facing;
    this.world.addChild(slash);
    this.fadeAndDestroy(slash, 170, 1.8);

    for (const target of this.actors) {
      if (target === actor || !target.alive) {
        continue;
      }
      const inFront = actor.facing === 1 ? target.x >= actor.x : target.x <= actor.x;
      if (inFront && this.distance(originX, actor.y, target.x, target.y) <= weapon.range) {
        this.damageActor(target, weapon.damage, actor.facing * weapon.knockback, -150);
      }
    }
  }

  private fireProjectile(actor: Actor, weaponId: WeaponId, now: number): void {
    const weapon = WEAPONS[weaponId];
    const projectileView = this.drawWeapon(actor.setup.cat, weaponId);
    projectileView.x = actor.x + actor.facing * 34;
    projectileView.y = actor.y - 4;
    projectileView.scale.set(weapon.kind === "explosive" ? 0.78 : weaponId === "spray" ? 0.48 : 0.62);
    this.world.addChild(projectileView);

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
      actor.weapon = "scratch";
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

    actor.weapon = pickup.weapon;
    this.replaceWeaponView(actor, actor.weapon);
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
    const localWeapon = getWeaponName(language, this.localActor.weapon);
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
    actor.catView.scale.x = actor.facing;
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

    g.rect(-21, 5, 8, 16).fill(OUTLINE);
    g.rect(-25, 0, 9, 9).fill(OUTLINE);
    g.rect(-17, -2, 27, 31).fill(OUTLINE);
    g.rect(-17, 23, 13, 8).fill(OUTLINE);
    g.rect(0, 23, 17, 8).fill(OUTLINE);
    g.rect(-16, -27, 31, 25).fill(OUTLINE);
    g.rect(9, -18, 14, 13).fill(OUTLINE);
    g.poly([-14, -25, -8, -38, -2, -25]).fill(OUTLINE);
    g.poly([4, -25, 12, -37, 16, -23]).fill(OUTLINE);
    g.rect(-24, -2, 10, 11).fill(OUTLINE);
    g.rect(8, 0, 15, 11).fill(OUTLINE);

    g.rect(-19, 6, 5, 13).fill(cat.body);
    g.rect(-23, 2, 7, 6).fill(cat.body);
    g.rect(-14, 0, 21, 26).fill(cat.body);
    g.rect(-14, 23, 11, 5).fill(cat.body);
    g.rect(2, 23, 13, 5).fill(cat.body);
    g.rect(-13, -24, 26, 20).fill(cat.body);
    g.rect(9, -16, 11, 9).fill(cat.accent);
    g.poly([-12, -25, -8, -35, -4, -25]).fill(cat.ear);
    g.poly([6, -25, 11, -34, 14, -23]).fill(cat.ear);
    g.rect(-21, 0, 7, 7).fill(cat.body);
    g.rect(10, 2, 11, 7).fill(cat.body);
    g.rect(-6, 5, 9, 16).fill(cat.accent);
    g.rect(-14, 18, 21, 7).fill(shadow);

    if (cat.id === "striped") {
      g.rect(-9, -22, 3, 14).fill(cat.accent);
      g.rect(-2, -24, 3, 13).fill(cat.accent);
      g.rect(6, -22, 3, 14).fill(cat.accent);
      g.rect(-13, 3, 4, 14).fill(cat.accent);
      g.rect(4, 2, 4, 14).fill(cat.accent);
    }

    g.rect(-7, -17, 6, 7).fill(0xf8fafc);
    g.rect(5, -17, 6, 7).fill(0xf8fafc);
    g.rect(-4, -15, 2, 4).fill(0x050816);
    g.rect(8, -15, 2, 4).fill(0x050816);
    g.rect(14, -12, 4, 3).fill(0x050816);
    g.rect(10, -7, 3, 2).fill(0x050816);
    g.rect(16, -7, 3, 2).fill(0x050816);
    g.rect(-13, 25, 11, 3).fill(shadow);
    g.rect(3, 25, 13, 3).fill(shadow);
    view.addChild(g);
    return view;
  }

  private drawWeapon(catId: CatId, weapon: WeaponId): Container {
    const view = new Container();
    const g = new Graphics();
    const cat = CATS.find((candidate) => candidate.id === catId) ?? CATS[0];

    if (weapon === "scratch") {
      g.rect(-12, -7, 20, 15).fill(OUTLINE);
      g.rect(-9, -4, 15, 10).fill(cat.body);
      g.poly([8, -11, 20, -16, 13, -4]).fill(0xf8fafc);
      g.poly([11, -1, 24, -2, 14, 8]).fill(0xf8fafc);
      g.poly([7, 11, 18, 16, 12, 4]).fill(0xf8fafc);
    } else if (weapon === "pistol") {
      g.rect(-16, -6, 32, 13).fill(OUTLINE);
      g.rect(-4, 6, 11, 11).fill(OUTLINE);
      g.rect(-14, -8, 24, 10).fill(0x62d2ff);
      g.rect(-3, 4, 8, 11).fill(0x2374d7);
      g.rect(10, -6, 10, 4).fill(0xffd166);
    } else if (weapon === "fishbat") {
      g.rect(-18, -6, 36, 12).fill(OUTLINE);
      g.rect(-22, -4, 8, 8).fill(OUTLINE);
      g.rect(-15, -5, 28, 10).fill(0x78c6a3);
      g.rect(-20, -3, 8, 6).fill(0x78c6a3);
      g.rect(4, -4, 7, 4).fill(0xe8f7ef);
      g.rect(14, -3, 3, 3).fill(0x10231d);
    } else if (weapon === "sardine") {
      g.rect(-16, -5, 31, 11).fill(OUTLINE);
      g.rect(-22, -3, 8, 7).fill(OUTLINE);
      g.rect(-13, -4, 24, 9).fill(0xb8d8e8);
      g.rect(-20, -2, 8, 5).fill(0xb8d8e8);
      g.rect(12, -3, 3, 3).fill(0x2a6f97);
    } else if (weapon === "spray") {
      g.rect(-9, -14, 20, 29).fill(OUTLINE);
      g.rect(-4, -18, 11, 6).fill(OUTLINE);
      g.rect(-7, -10, 16, 23).fill(0xffc857);
      g.rect(-4, -17, 10, 5).fill(0x2f80ed);
      g.rect(12, -13, 4, 4).fill(0x5de0e6);
      g.rect(17, -17, 7, 2).fill(0x5de0e6);
      g.rect(17, -9, 7, 2).fill(0x5de0e6);
    } else if (weapon === "bell") {
      g.rect(-11, -10, 22, 22).fill(OUTLINE);
      g.rect(-6, -15, 12, 7).fill(OUTLINE);
      g.rect(-9, -8, 18, 17).fill(0xf4d35e);
      g.rect(-5, -14, 10, 5).fill(0xd89c00);
      g.rect(-2, 9, 5, 4).fill(0x302311);
      g.rect(8, -15, 10, 3).fill(0xff7f50);
    } else if (weapon === "yarn") {
      g.rect(-14, -14, 27, 27).fill(OUTLINE);
      g.rect(-12, -12, 23, 23).fill(0xe76f9d);
      g.rect(-11, -4, 21, 3).fill(0xffc2d6);
      g.rect(-8, -11, 3, 22).fill(0xffc2d6);
      g.rect(1, -11, 3, 22).fill(0xffc2d6);
    } else {
      g.rect(-13, -12, 26, 27).fill(OUTLINE);
      g.rect(-4, -19, 7, 9).fill(OUTLINE);
      g.rect(-11, -10, 22, 22).fill(0x243b53);
      g.rect(-3, -18, 5, 8).fill(0xf4d35e);
      g.rect(3, -20, 10, 3).fill(0xff7f50);
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
