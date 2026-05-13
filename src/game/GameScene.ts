import Phaser from "phaser";
import { getMapById, MAPS, WEAPONS, WORLD } from "./config";
import { createGeneratedTextures } from "./sprites";
import type { MapConfig, MatchConfig, MatchResult, PlayerSetup, RuntimeControls, WeaponId } from "./types";
import { getMapName, getStoredLanguage, getText, getWeaponName } from "../i18n";

interface Actor {
  setup: PlayerSetup;
  sprite: Phaser.Physics.Arcade.Sprite;
  nameTag: Phaser.GameObjects.Text;
  healthBar: Phaser.GameObjects.Rectangle;
  healthBack: Phaser.GameObjects.Rectangle;
  weaponSprite: Phaser.GameObjects.Image;
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
}

interface ProjectileData {
  ownerId: string;
  weapon: WeaponId;
  bornAt: number;
}

const MAP_BACKGROUNDS: Record<MapConfig["theme"], number> = {
  rooftop: 0x18243a,
  greenhouse: 0x12352e,
  subway: 0x1e2330,
  arcade: 0x201739,
  bakery: 0x3a2431,
  dojo: 0x2e2438,
  lab: 0x162c36,
  harbor: 0x183140,
};

export class GameScene extends Phaser.Scene {
  private match!: MatchConfig;
  private controls!: RuntimeControls;
  private roundIndex = 0;
  private scores: Record<string, number> = {};
  private actors: Actor[] = [];
  private localActor!: Actor;
  private eliminated: Actor[] = [];
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private hazards!: Phaser.Physics.Arcade.StaticGroup;
  private boosters!: Phaser.Physics.Arcade.StaticGroup;
  private weaponPickups!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private mapOrder: string[] = [];
  private roundFinished = false;

  constructor() {
    super("GameScene");
  }

  init(data: { match: MatchConfig; controls: RuntimeControls }): void {
    this.match = data.match;
    this.controls = data.controls;
    this.roundIndex = 0;
    this.scores = Object.fromEntries(this.match.room.players.map((player) => [player.id, 0]));
    this.mapOrder = this.match.room.settings.mapIds.slice(0, this.match.room.settings.rounds);
  }

  preload(): void {
    createGeneratedTextures(this);
  }

  create(): void {
    this.cursors = this.input.keyboard?.createCursorKeys() ?? ({} as Phaser.Types.Input.Keyboard.CursorKeys);
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,J,K,SPACE,SHIFT") as Record<string, Phaser.Input.Keyboard.Key>;
    this.startRound();
  }

  update(time: number, delta: number): void {
    if (this.roundFinished) {
      return;
    }

    for (const actor of this.actors) {
      if (!actor.alive) {
        continue;
      }

      if (actor.setup.bot) {
        this.updateBot(actor, time);
      } else {
        this.updateLocalActor(actor, time);
      }

      this.updateActorUi(actor);
    }

    this.cleanupProjectiles(time);
    this.checkRoundState();
    this.updateHud();
  }

  private startRound(): void {
    this.roundFinished = false;
    this.eliminated = [];
    this.actors = [];
    this.children.removeAll();
    this.physics.world.colliders.destroy();

    const map = getMapById(this.mapOrder[this.roundIndex] ?? MAPS[0].id);
    this.cameras.main.setBackgroundColor(MAP_BACKGROUNDS[map.theme]);
    this.addBackdrop(map);

    this.platforms = this.physics.add.staticGroup();
    this.hazards = this.physics.add.staticGroup();
    this.boosters = this.physics.add.staticGroup();
    this.weaponPickups = this.physics.add.staticGroup();
    this.projectiles = this.physics.add.group({ allowGravity: false });

    for (const platform of map.platforms) {
      const tile = this.platforms.create(platform.x, platform.y, "platform");
      tile.setDisplaySize(platform.width, platform.height).refreshBody();
    }

    for (const hazard of map.hazards) {
      const tile = this.hazards.create(hazard.x, hazard.y, "hazard");
      tile.setDisplaySize(hazard.width, hazard.height).refreshBody();
      tile.setData("damage", hazard.damage);
    }

    for (const booster of map.boosters) {
      const tile = this.boosters.create(booster.x, booster.y, `booster-${booster.kind}`);
      tile.setDisplaySize(booster.width, booster.height).refreshBody();
      tile.setData("kind", booster.kind);
    }

    this.spawnWeapons(map);
    this.spawnActors(map);

    this.physics.add.collider(
      this.actors.map((actor) => actor.sprite),
      this.platforms,
    );
    this.physics.add.collider(this.projectiles, this.platforms, (projectile) => this.onProjectileHitWall(projectile as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(
      this.actors.map((actor) => actor.sprite),
      this.weaponPickups,
      (sprite, pickup) => this.onPickupWeapon(sprite as Phaser.Physics.Arcade.Sprite, pickup as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(
      this.actors.map((actor) => actor.sprite),
      this.boosters,
      (sprite, booster) => this.onBooster(sprite as Phaser.Physics.Arcade.Sprite, booster as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(
      this.actors.map((actor) => actor.sprite),
      this.hazards,
      (sprite, hazard) => this.onHazard(sprite as Phaser.Physics.Arcade.Sprite, hazard as Phaser.Physics.Arcade.Image),
    );
    this.physics.add.overlap(this.projectiles, this.actors.map((actor) => actor.sprite), (projectile, sprite) =>
      this.onProjectileHitActor(projectile as Phaser.Physics.Arcade.Sprite, sprite as Phaser.Physics.Arcade.Sprite),
    );

    this.hud = this.add.text(18, 16, "", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "18px",
      color: "#f8fafc",
      backgroundColor: "rgba(7, 12, 22, 0.42)",
      padding: { x: 12, y: 9 },
    });
    this.hud.setScrollFactor(0);

    this.banner = this.add
      .text(WORLD.width / 2, 88, `${getMapName(getStoredLanguage(), map.id)}`, {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "32px",
        color: "#ffffff",
        align: "center",
        stroke: "#0b1020",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.time.delayedCall(1500, () => this.banner.setText(""));
    this.updateHud();
  }

  private spawnActors(map: MapConfig): void {
    const shuffledSpawns = Phaser.Utils.Array.Shuffle([...map.spawns]);

    this.match.room.players.slice(0, WORLD.maxPlayers).forEach((player, index) => {
      const spawn = shuffledSpawns[index % shuffledSpawns.length];
      this.addSpawnMarker(spawn.x, spawn.y);
      const sprite = this.physics.add.sprite(spawn.x, spawn.y, `cat-${player.cat}`);
      sprite.setCollideWorldBounds(true);
      sprite.setBounce(0.05, 0);
      sprite.setDragX(1650);
      sprite.setMaxVelocity(620, 960);
      sprite.body?.setSize(28, 44).setOffset(13, 10);
      sprite.setData("playerId", player.id);

      const nameTag = this.add
        .text(spawn.x, spawn.y - 52, player.name, {
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: "13px",
          color: player.bot ? "#cbd5e1" : "#ffffff",
          stroke: "#0b1020",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const healthBack = this.add.rectangle(spawn.x, spawn.y - 35, 46, 6, 0x111827, 0.85);
      const healthBar = this.add.rectangle(spawn.x, spawn.y - 35, 44, 4, 0x40f99b, 1);
      const weaponSprite = this.add.image(spawn.x + 24, spawn.y - 6, this.getEquippedWeaponTexture(player.cat, this.match.room.settings.startingWeapon));
      weaponSprite.setDisplaySize(34, 28);
      weaponSprite.setDepth(4);

      const actor: Actor = {
        setup: player,
        sprite,
        nameTag,
        healthBar,
        healthBack,
        weaponSprite,
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
      };

      this.actors.push(actor);
      if (player.id === this.match.localPlayerId) {
        this.localActor = actor;
      }
    });
  }

  private addSpawnMarker(x: number, y: number): void {
    const ring = this.add.ellipse(x, y + 24, 54, 14, 0x5de0e6, 0.18);
    ring.setStrokeStyle(2, 0x5de0e6, 0.78);
    const glow = this.add.triangle(x, y + 8, -18, 18, 18, 18, 0, -18, 0x5de0e6, 0.12);
    this.tweens.add({ targets: [ring, glow], alpha: { from: 0.24, to: 0.58 }, duration: 850, yoyo: true, repeat: -1 });
  }

  private spawnWeapons(map: MapConfig): void {
    const spawnableWeapons = Object.keys(WEAPONS).filter((weapon) => weapon !== "scratch") as WeaponId[];
    map.weaponSpawns.forEach((spawn, index) => {
      const weapon = spawnableWeapons[index % spawnableWeapons.length];
      this.addWeaponSpawnMarker(spawn.x, spawn.y);
      this.createWeaponPickup(spawn.x, spawn.y, weapon);
    });
  }

  private addWeaponSpawnMarker(x: number, y: number): void {
    const pad = this.add.rectangle(x, y + 20, 44, 8, 0xffd166, 0.18);
    pad.setStrokeStyle(1, 0xffd166, 0.72);
    pad.setDepth(1);

    const beam = this.add.triangle(x, y + 4, -12, 16, 12, 16, 0, -18, 0xffd166, 0.11);
    beam.setDepth(1);

    const pins = [-16, 16].map((offset) => {
      const pin = this.add.rectangle(x + offset, y + 14, 4, 14, 0xfff2b2, 0.58);
      pin.setDepth(1);
      return pin;
    });

    this.tweens.add({
      targets: [pad, beam, ...pins],
      alpha: { from: 0.22, to: 0.66 },
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private createWeaponPickup(x: number, y: number, weapon: WeaponId): void {
    const pickup = this.weaponPickups.create(x, y, `weapon-${weapon}`);
    pickup.setData("weapon", weapon);
    pickup.setDisplaySize(36, 36).refreshBody();
    pickup.setDepth(5);
    this.tweens.add({
      targets: pickup,
      angle: { from: -6, to: 6 },
      y: y - 5,
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private updateLocalActor(actor: Actor, time: number): void {
    const left = this.controls.left || this.cursors.left?.isDown || this.keys.A?.isDown;
    const right = this.controls.right || this.cursors.right?.isDown || this.keys.D?.isDown;
    const jump = this.controls.jump || this.cursors.up?.isDown || this.keys.W?.isDown || this.keys.SPACE?.isDown;
    const attack = this.controls.attack || this.keys.J?.isDown;
    const throwWeapon = this.controls.throwWeapon || this.keys.K?.isDown || this.keys.SHIFT?.isDown;

    this.moveActor(actor, left, right, jump);

    if (attack) {
      this.tryAttack(actor, actor.weapon === "scratch" ? "scratch" : actor.weapon, time);
    }

    if (throwWeapon && actor.weapon !== "scratch" && WEAPONS[actor.weapon].kind !== "melee") {
      this.tryAttack(actor, actor.weapon, time);
    }
  }

  private updateBot(actor: Actor, time: number): void {
    const target = this.findNearestEnemy(actor);
    if (!target) {
      return;
    }

    const distance = target.sprite.x - actor.sprite.x;
    const left = distance < -36;
    const right = distance > 36;
    const body = actor.sprite.body as Phaser.Physics.Arcade.Body;
    const shouldJump = body.blocked.down && (Math.abs(distance) > 180 || target.sprite.y + 30 < actor.sprite.y);

    this.moveActor(actor, left, right, shouldJump);

    const closeEnough = Phaser.Math.Distance.Between(actor.sprite.x, actor.sprite.y, target.sprite.x, target.sprite.y) < 76;
    const weapon = WEAPONS[actor.weapon];
    const hasLineWeapon = weapon.kind !== "melee" && Math.abs(distance) < weapon.range;

    if (closeEnough || hasLineWeapon) {
      this.tryAttack(actor, actor.weapon, time);
    }
  }

  private moveActor(actor: Actor, left: boolean, right: boolean, jump: boolean): void {
    const body = actor.sprite.body as Phaser.Physics.Arcade.Body;
    const speed = WORLD.playerSpeed * (actor.speedBoostUntil > this.time.now ? 1.45 : 1);
    const jumpPressed = jump && !actor.jumpHeld;

    if (body.blocked.down) {
      actor.jumpsUsed = 0;
    }

    if (left === right) {
      actor.sprite.setAccelerationX(0);
    } else if (left) {
      actor.sprite.setAccelerationX(-speed * 9.4);
      actor.facing = -1;
      actor.sprite.setFlipX(true);
    } else if (right) {
      actor.sprite.setAccelerationX(speed * 9.4);
      actor.facing = 1;
      actor.sprite.setFlipX(false);
    }

    if (body.velocity.x > speed) {
      actor.sprite.setVelocityX(speed);
    } else if (body.velocity.x < -speed) {
      actor.sprite.setVelocityX(-speed);
    }

    if (jumpPressed && actor.jumpsUsed < 2) {
      actor.sprite.setVelocityY(actor.jumpsUsed === 0 ? WORLD.jumpVelocity : WORLD.airJumpVelocity);
      actor.jumpsUsed += 1;
      const puff = this.add.circle(actor.sprite.x, actor.sprite.y + 20, 14, 0xffffff, 0.18);
      this.tweens.add({ targets: puff, alpha: 0, scale: 1.8, duration: 180, onComplete: () => puff.destroy() });
    }

    actor.jumpHeld = jump;
  }

  private tryAttack(actor: Actor, weaponId: WeaponId, time: number): void {
    const weapon = WEAPONS[weaponId];
    if (time - actor.lastAttackAt < weapon.cooldownMs) {
      return;
    }

    actor.lastAttackAt = time;
    this.playWeaponAnimation(actor, weaponId);
    if (weapon.kind === "melee") {
      this.performMelee(actor, weaponId);
      return;
    }

    this.fireProjectile(actor, weaponId);
  }

  private performMelee(actor: Actor, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const originX = actor.sprite.x + actor.facing * 32;
    const radius = weapon.range * 0.46;
    const slashColor = weaponId === "fishbat" ? 0x78c6a3 : 0xf7f7ff;
    const slash = this.add.arc(originX, actor.sprite.y, radius, -55, 55, false, slashColor, 0.28);
    slash.setScale(actor.facing, 1);
    if (weaponId === "fishbat") {
      const fish = this.add.image(actor.sprite.x + actor.facing * 34, actor.sprite.y - 8, "weapon-fishbat");
      fish.setFlipX(actor.facing === -1);
      fish.setAngle(actor.facing * -24);
      this.tweens.add({ targets: fish, alpha: 0, angle: actor.facing * 48, duration: 190, onComplete: () => fish.destroy() });
    }
    this.tweens.add({ targets: slash, alpha: 0, scale: 1.8, duration: 170, onComplete: () => slash.destroy() });

    for (const target of this.actors) {
      if (target === actor || !target.alive) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(originX, actor.sprite.y, target.sprite.x, target.sprite.y);
      const inFront = actor.facing === 1 ? target.sprite.x >= actor.sprite.x : target.sprite.x <= actor.sprite.x;
      if (distance <= weapon.range && inFront) {
        this.damageActor(target, weapon.damage, actor.facing * weapon.knockback, -150);
      }
    }
  }

  private fireProjectile(actor: Actor, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const key = weaponId === "pistol" ? "projectile-water" : `weapon-${weaponId}`;
    const projectile = this.projectiles.create(actor.sprite.x + actor.facing * 34, actor.sprite.y - 4, key);
    projectile.setData("payload", {
      ownerId: actor.setup.id,
      weapon: weaponId,
      bornAt: this.time.now,
    } satisfies ProjectileData);
    const projectileSize = weapon.kind === "explosive" ? 28 : weaponId === "spray" ? 16 : 24;
    projectile.setDisplaySize(projectileSize, projectileSize);
    projectile.setVelocity((weapon.projectileSpeed ?? 500) * actor.facing, weapon.kind === "explosive" ? -120 : 0);
    projectile.setAngularVelocity(actor.facing * 360);

    if (weapon.kind === "explosive") {
      projectile.body.allowGravity = true;
      actor.weapon = "scratch";
      this.updateEquippedWeapon(actor);
    }
  }

  private onPickupWeapon(sprite: Phaser.Physics.Arcade.Sprite, pickup: Phaser.Physics.Arcade.Image): void {
    const actor = this.findActorBySprite(sprite);
    const weapon = pickup.getData("weapon") as WeaponId;
    if (!actor || !weapon || !actor.alive) {
      return;
    }

    actor.weapon = weapon;
    this.updateEquippedWeapon(actor);
    const x = pickup.x;
    const y = pickup.y;
    pickup.destroy();
    this.time.delayedCall(6500, () => this.createWeaponPickup(x, y, weapon));
  }

  private onBooster(sprite: Phaser.Physics.Arcade.Sprite, booster: Phaser.Physics.Arcade.Image): void {
    const actor = this.findActorBySprite(sprite);
    if (!actor || !actor.alive) {
      return;
    }

    const kind = booster.getData("kind") as string;
    if (kind === "speed") {
      actor.speedBoostUntil = this.time.now + 1700;
    } else {
      actor.sprite.setVelocityY(WORLD.jumpVelocity * 1.25);
    }
  }

  private onHazard(sprite: Phaser.Physics.Arcade.Sprite, hazard: Phaser.Physics.Arcade.Image): void {
    const actor = this.findActorBySprite(sprite);
    if (!actor || !actor.alive || this.time.now - actor.lastHazardAt < 700) {
      return;
    }

    actor.lastHazardAt = this.time.now;
    const damage = Number(hazard.getData("damage") ?? 12);
    this.damageActor(actor, damage, actor.sprite.x < WORLD.width / 2 ? -220 : 220, -220);
  }

  private onProjectileHitWall(projectile: Phaser.Physics.Arcade.Sprite): void {
    const payload = projectile.getData("payload") as ProjectileData | undefined;
    if (payload && WEAPONS[payload.weapon].kind === "explosive") {
      this.explode(projectile.x, projectile.y, payload.ownerId, payload.weapon);
    }
    projectile.destroy();
  }

  private onProjectileHitActor(
    projectile: Phaser.Physics.Arcade.Sprite,
    sprite: Phaser.Physics.Arcade.Sprite,
  ): void {
    const payload = projectile.getData("payload") as ProjectileData | undefined;
    const target = this.findActorBySprite(sprite);
    if (!payload || !target || payload.ownerId === target.setup.id || !target.alive) {
      return;
    }

    if (WEAPONS[payload.weapon].kind === "explosive") {
      this.explode(projectile.x, projectile.y, payload.ownerId, payload.weapon);
    } else {
      const weapon = WEAPONS[payload.weapon];
      const direction = (projectile.body?.velocity.x ?? 1) >= 0 ? 1 : -1;
      this.damageActor(target, weapon.damage, direction * weapon.knockback, -130);
    }

    projectile.destroy();
  }

  private explode(x: number, y: number, ownerId: string, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const blast = this.add.circle(x, y, weapon.radius ?? 80, 0xffd166, 0.33);
    this.tweens.add({ targets: blast, alpha: 0, scale: 1.6, duration: 260, onComplete: () => blast.destroy() });

    for (const actor of this.actors) {
      if (!actor.alive || actor.setup.id === ownerId) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, actor.sprite.x, actor.sprite.y);
      if (distance <= (weapon.radius ?? 80)) {
        const direction = actor.sprite.x >= x ? 1 : -1;
        this.damageActor(actor, weapon.damage, direction * weapon.knockback, -260);
      }
    }
  }

  private damageActor(actor: Actor, amount: number, knockbackX: number, knockbackY: number): void {
    actor.health = Math.max(0, actor.health - amount);
    actor.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => actor.sprite.clearTint());
    actor.sprite.setVelocity(knockbackX, knockbackY);
    this.updateActorUi(actor);

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
    actor.sprite.disableBody(true, true);
    actor.nameTag.setVisible(false);
    actor.healthBack.setVisible(false);
    actor.healthBar.setVisible(false);
    actor.weaponSprite.setVisible(false);
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
    this.banner.setText(`${winner.name} ${getText(getStoredLanguage(), "winsRound")}`);

    this.time.delayedCall(2400, () => {
      this.roundIndex += 1;
      if (this.roundIndex >= this.mapOrder.length) {
        window.dispatchEvent(new CustomEvent("fc:match-end", { detail: result }));
        return;
      }
      this.startRound();
    });
  }

  private updateActorUi(actor: Actor): void {
    const now = this.time.now;
    const activeAnimation = now < actor.weaponAnimationUntil;
    const visualWeapon = activeAnimation ? actor.weaponAnimationId : actor.weapon;
    const animationProgress = activeAnimation
      ? Phaser.Math.Clamp(
          (now - actor.weaponAnimationStartedAt) / Math.max(1, actor.weaponAnimationUntil - actor.weaponAnimationStartedAt),
          0,
          1,
        )
      : 0;
    const weapon = WEAPONS[visualWeapon];
    const pulse = activeAnimation ? Math.sin(animationProgress * Math.PI) : 0;
    const swing = Phaser.Math.Easing.Cubic.Out(animationProgress);

    let xOffset = actor.facing * 25;
    let yOffset = -4;
    let angle = actor.facing * (visualWeapon === "scratch" ? -18 : 14);
    let width = visualWeapon === "scratch" ? 34 : 32;
    let height = visualWeapon === "scratch" ? 26 : 32;

    if (activeAnimation && weapon.kind === "melee") {
      xOffset = actor.facing * (visualWeapon === "fishbat" ? 19 + pulse * 25 : 22 + pulse * 12);
      yOffset = -6 - pulse * 9;
      angle = actor.facing * Phaser.Math.Linear(-62, 72, swing);
      width += pulse * (visualWeapon === "fishbat" ? 11 : 7);
      height += pulse * (visualWeapon === "fishbat" ? 7 : 5);
    } else if (activeAnimation) {
      xOffset = actor.facing * (25 - pulse * 10);
      yOffset = -5 - pulse * 5;
      angle = actor.facing * (visualWeapon === "bomb" || visualWeapon === "bell" ? Phaser.Math.Linear(-32, 44, swing) : 14 - pulse * 24);
      width += pulse * 4;
      height += pulse * 4;
    }

    actor.nameTag.setPosition(actor.sprite.x, actor.sprite.y - 52);
    actor.healthBack.setPosition(actor.sprite.x, actor.sprite.y - 35);
    actor.healthBar.setPosition(actor.sprite.x - (44 - 44 * (actor.health / WORLD.maxHealth)) / 2, actor.sprite.y - 35);
    actor.healthBar.width = 44 * (actor.health / WORLD.maxHealth);
    actor.healthBar.fillColor = actor.health > 45 ? 0x40f99b : 0xffd166;
    actor.weaponSprite.setTexture(this.getEquippedWeaponTexture(actor.setup.cat, visualWeapon));
    actor.weaponSprite.setDisplaySize(width, height);
    actor.weaponSprite.setPosition(actor.sprite.x + xOffset, actor.sprite.y + yOffset);
    actor.weaponSprite.setFlipX(actor.facing === -1);
    actor.weaponSprite.setAngle(angle);
  }

  private updateEquippedWeapon(actor: Actor): void {
    actor.weaponSprite.setTexture(this.getEquippedWeaponTexture(actor.setup.cat, actor.weapon));
  }

  private playWeaponAnimation(actor: Actor, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    actor.weaponAnimationId = weaponId;
    actor.weaponAnimationStartedAt = this.time.now;
    actor.weaponAnimationUntil = this.time.now + (weapon.kind === "melee" ? 210 : 170);
  }

  private getEquippedWeaponTexture(catId: string, weapon: WeaponId): string {
    return weapon === "scratch" ? `paw-${catId}` : `weapon-${weapon}`;
  }

  private updateHud(): void {
    const language = getStoredLanguage();
    const mapName = getMapName(language, getMapById(this.mapOrder[this.roundIndex]).id);
    const localWeapon = getWeaponName(language, this.localActor.weapon);
    const alive = this.actors.filter((actor) => actor.alive).length;
    const ranking = Object.entries(this.scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([playerId, points]) => `${this.match.room.players.find((player) => player.id === playerId)?.name}: ${points}`)
      .join("  ");
    this.hud.setText(
      `${getText(language, "round")} ${this.roundIndex + 1}/${this.mapOrder.length} · ${mapName}\n${getText(language, "alive")}: ${alive} · ${getText(language, "weapon")}: ${localWeapon}\n${ranking}`,
    );
  }

  private cleanupProjectiles(time: number): void {
    this.projectiles.children.each((child) => {
      const projectile = child as Phaser.Physics.Arcade.Sprite;
      const payload = projectile.getData("payload") as ProjectileData | undefined;
      if (!payload) {
        return true;
      }
      const weapon = WEAPONS[payload.weapon];
      const maxAge = weapon.kind === "explosive" ? 1550 : (weapon.range / (weapon.projectileSpeed ?? 500)) * 1000;
      if (time - payload.bornAt > maxAge) {
        if (weapon.kind === "explosive") {
          this.explode(projectile.x, projectile.y, payload.ownerId, payload.weapon);
        }
        projectile.destroy();
      }
      return true;
    });
  }

  private findNearestEnemy(actor: Actor): Actor | null {
    const enemies = this.actors.filter((candidate) => candidate !== actor && candidate.alive);
    return (
      enemies.sort(
        (a, b) =>
          Phaser.Math.Distance.Squared(actor.sprite.x, actor.sprite.y, a.sprite.x, a.sprite.y) -
          Phaser.Math.Distance.Squared(actor.sprite.x, actor.sprite.y, b.sprite.x, b.sprite.y),
      )[0] ?? null
    );
  }

  private findActorBySprite(sprite: Phaser.Physics.Arcade.Sprite): Actor | undefined {
    const id = sprite.getData("playerId") as string | undefined;
    return this.actors.find((actor) => actor.setup.id === id);
  }

  private addBackdrop(map: MapConfig): void {
    const accent = map.theme === "greenhouse" ? 0x40f99b : map.theme === "arcade" ? 0xff5f7e : 0x5de0e6;
    for (let index = 0; index < 12; index += 1) {
      const x = index * 124 + 40;
      const height = 70 + ((index * 47) % 160);
      this.add.rectangle(x, WORLD.height - 48 - height / 2, 72, height, 0x0b1020, 0.22);
      this.add.rectangle(x + 12, WORLD.height - 68 - height, 34, 5, accent, 0.25);
    }
  }
}
