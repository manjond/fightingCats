import type * as Party from "partykit/server";
import { getMapById, MAPS, WEAPONS, WORLD } from "../src/game/config";
import type { MapConfig, PlatformConfig, PlayerSetup, RoomSnapshot, WeaponId } from "../src/game/types";
import type { ClientRealtimeMessage, RealtimeActorState, RealtimeInput, RealtimePickupState, RealtimeSnapshot } from "../src/game/realtimeTypes";

type Rect = PlatformConfig;

interface ServerActor extends RealtimeActorState {
  setup: PlayerSetup;
  width: number;
  height: number;
  jumpsUsed: number;
  jumpHeld: boolean;
  blockedDown: boolean;
  lastAttackAt: number;
  speedBoostUntil: number;
}

interface ServerPickup extends RealtimePickupState {
  respawnAt: number;
}

const TICK_RATE = 30;
const SNAPSHOT_RATE = 20;
const DELTA = 1 / TICK_RATE;
const GRAVITY = WORLD.gravity * 1.12;
const MAX_VY = 960;
const MAX_VX = 590;
const GROUND_ACCELERATION = 5600;
const AIR_ACCELERATION = 3900;
const GROUND_DECELERATION = 5200;
const AIR_DECELERATION = 2800;
const INPUT_IDLE: RealtimeInput = { left: false, right: false, jump: false, attack: false, throwWeapon: false, seq: 0 };

export default class ArenaServer implements Party.Server {
  private roomSnapshot: RoomSnapshot | null = null;
  private players: PlayerSetup[] = [];
  private mapOrder: string[] = [];
  private roundIndex = 0;
  private scores: Record<string, number> = {};
  private actors = new Map<string, ServerActor>();
  private inputs = new Map<string, RealtimeInput>();
  private pickups: ServerPickup[] = [];
  private platforms: Rect[] = [];
  private phase: RealtimeSnapshot["phase"] = "playing";
  private ranking: PlayerSetup[] = [];
  private tickCount = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private roundTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  onMessage(rawMessage: string, sender: Party.Connection): void {
    const message = this.parseMessage(rawMessage);
    if (!message) {
      return;
    }

    if (message.type === "init") {
      this.initialize(message.room);
      sender.setState({ playerId: message.playerId });
      this.sendSnapshot(sender);
      return;
    }

    const playerId = (sender.state as { playerId?: string } | null)?.playerId;
    if (playerId) {
      this.inputs.set(playerId, message.input);
    }
  }

  onClose(connection: Party.Connection): void {
    const playerId = (connection.state as { playerId?: string } | null)?.playerId;
    if (playerId) {
      this.inputs.delete(playerId);
    }
  }

  private parseMessage(rawMessage: string): ClientRealtimeMessage | null {
    try {
      return JSON.parse(rawMessage) as ClientRealtimeMessage;
    } catch {
      return null;
    }
  }

  private initialize(room: RoomSnapshot): void {
    if (this.roomSnapshot) {
      return;
    }

    this.roomSnapshot = room;
    this.players = room.match?.players.length ? room.match.players : room.players;
    this.mapOrder = room.settings.mapIds.slice(0, room.settings.rounds);
    this.scores = Object.fromEntries(this.players.map((player) => [player.id, 0]));
    this.startRound(0);
    this.tickTimer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  private startRound(index: number): void {
    this.roundIndex = index;
    this.phase = "playing";
    this.ranking = [];
    this.actors.clear();
    this.pickups = [];

    const map = getMapById(this.mapOrder[this.roundIndex] ?? MAPS[0].id);
    this.platforms = map.platforms;
    this.spawnActors(map);
    this.spawnPickups(map);
  }

  private spawnActors(map: MapConfig): void {
    const spawns = this.shuffle([...map.spawns], this.seedFromRoom() + this.roundIndex);
    this.players.slice(0, WORLD.maxPlayers).forEach((player, index) => {
      const spawn = spawns[index % spawns.length];
      this.actors.set(player.id, {
        setup: player,
        id: player.id,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        facing: 1,
        health: WORLD.maxHealth,
        alive: true,
        weapon: this.roomSnapshot?.settings.startingWeapon ?? "scratch",
        weaponUses: this.getWeaponUses(this.roomSnapshot?.settings.startingWeapon ?? "scratch"),
        width: 23,
        height: 39,
        jumpsUsed: 0,
        jumpHeld: false,
        blockedDown: false,
        lastAttackAt: 0,
        speedBoostUntil: 0,
      });
    });
  }

  private spawnPickups(map: MapConfig): void {
    const weapons = Object.keys(WEAPONS).filter((weapon) => weapon !== "scratch") as WeaponId[];
    this.pickups = map.weaponSpawns.map((spawn, index) => ({
      id: `${index}-${this.roundIndex}`,
      x: spawn.x,
      y: spawn.y,
      weapon: weapons[index % weapons.length],
      respawnAt: 0,
    }));
  }

  private tick(): void {
    if (!this.roomSnapshot || this.phase !== "playing") {
      return;
    }

    const now = Date.now();
    const alive = [...this.actors.values()].filter((actor) => actor.alive);
    for (const actor of alive) {
      const input = actor.setup.bot ? this.getBotInput(actor) : (this.inputs.get(actor.id) ?? INPUT_IDLE);
      this.updateActor(actor, input, now);
    }

    for (const actor of alive) {
      this.integrate(actor);
    }

    this.resolvePlayerCollisions();

    for (const actor of alive) {
      this.checkPickups(actor, now);
    }

    this.tickCount += 1;
    if (this.tickCount % Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE)) === 0) {
      this.broadcastSnapshot();
    }

    if (this.actors.size > 1 && [...this.actors.values()].filter((actor) => actor.alive).length <= 1) {
      this.finishRound();
    }
  }

  private updateActor(actor: ServerActor, input: RealtimeInput, now: number): void {
    const speed = WORLD.playerSpeed * (actor.speedBoostUntil > now ? 1.45 : 1);
    const acceleration = actor.blockedDown ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const deceleration = actor.blockedDown ? GROUND_DECELERATION : AIR_DECELERATION;
    const jumpPressed = input.jump && !actor.jumpHeld;

    if (actor.blockedDown) {
      actor.jumpsUsed = 0;
    }

    if (input.left === input.right) {
      actor.vx = this.moveToward(actor.vx, 0, deceleration * DELTA);
    } else if (input.left) {
      actor.vx = this.moveToward(actor.vx, -speed, acceleration * DELTA);
      actor.facing = -1;
    } else {
      actor.vx = this.moveToward(actor.vx, speed, acceleration * DELTA);
      actor.facing = 1;
    }

    actor.vx = this.clamp(actor.vx, -speed, speed);
    if (jumpPressed && actor.jumpsUsed < 2) {
      actor.vy = actor.jumpsUsed === 0 ? WORLD.jumpVelocity : WORLD.airJumpVelocity;
      actor.jumpsUsed += 1;
    }
    actor.jumpHeld = input.jump;

    if (input.attack || (input.throwWeapon && actor.weapon !== "scratch")) {
      this.tryAttack(actor, now);
    }
  }

  private integrate(actor: ServerActor): void {
    const previousX = actor.x;
    const previousY = actor.y;
    actor.vy = Math.min(MAX_VY, actor.vy + GRAVITY * DELTA);
    actor.vx = this.clamp(actor.vx, -MAX_VX, MAX_VX);

    actor.x += actor.vx * DELTA;
    this.resolveHorizontal(actor, previousX);
    actor.y += actor.vy * DELTA;
    actor.blockedDown = false;
    this.resolveVertical(actor, previousY);
  }

  private tryAttack(actor: ServerActor, now: number): void {
    const weapon = WEAPONS[actor.weapon];
    if (now - actor.lastAttackAt < weapon.cooldownMs) {
      return;
    }
    actor.lastAttackAt = now;

    const targets = [...this.actors.values()].filter((candidate) => candidate.alive && candidate.id !== actor.id);
    const target = targets
      .filter((candidate) => Math.sign(candidate.x - actor.x || actor.facing) === actor.facing)
      .sort((a, b) => Math.abs(a.x - actor.x) - Math.abs(b.x - actor.x))[0];
    if (!target) {
      this.consumeWeaponUse(actor);
      return;
    }

    const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
    const verticalAllowance = weapon.kind === "melee" ? 58 : 120;
    if (distance <= weapon.range && Math.abs(target.y - actor.y) <= verticalAllowance) {
      if (weapon.kind === "explosive") {
        this.explode(target.x, target.y, actor.id, actor.weapon);
      } else {
        this.damageActor(target, weapon.damage, actor.facing * weapon.knockback, -220);
      }
    }
    this.consumeWeaponUse(actor);
  }

  private explode(x: number, y: number, ownerId: string, weaponId: WeaponId): void {
    const weapon = WEAPONS[weaponId];
    const radius = weapon.radius ?? 80;
    for (const actor of this.actors.values()) {
      if (!actor.alive || actor.id === ownerId) {
        continue;
      }
      if (Math.hypot(actor.x - x, actor.y - y) <= radius) {
        this.damageActor(actor, weapon.damage, actor.x >= x ? weapon.knockback : -weapon.knockback, -260);
      }
    }
  }

  private damageActor(actor: ServerActor, amount: number, knockbackX: number, knockbackY: number): void {
    actor.health = Math.max(0, actor.health - amount);
    actor.vx = knockbackX;
    actor.vy = knockbackY;
    if (actor.health <= 0) {
      actor.alive = false;
    }
  }

  private checkPickups(actor: ServerActor, now: number): void {
    for (const pickup of this.pickups) {
      if (pickup.respawnAt > now) {
        continue;
      }
      if (Math.hypot(actor.x - pickup.x, actor.y - pickup.y) <= 44) {
        actor.weapon = pickup.weapon;
        actor.weaponUses = this.getWeaponUses(pickup.weapon);
        pickup.respawnAt = now + 9000;
      }
    }
  }

  private finishRound(): void {
    this.phase = "round-end";
    const actors = [...this.actors.values()];
    this.ranking = [
      ...actors.filter((actor) => actor.alive),
      ...actors.filter((actor) => !actor.alive).sort((a, b) => b.health - a.health),
    ].map((actor) => actor.setup);
    this.ranking.forEach((player, index) => {
      this.scores[player.id] = (this.scores[player.id] ?? 0) + Math.max(1, WORLD.maxPlayers - index);
    });
    this.broadcastSnapshot();

    this.roundTimer = setTimeout(() => {
      if (this.roundIndex + 1 >= this.mapOrder.length) {
        this.phase = "match-end";
        this.broadcastSnapshot();
        this.stop();
        return;
      }
      this.startRound(this.roundIndex + 1);
      this.broadcastSnapshot();
    }, 2400);
  }

  private stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  private getBotInput(actor: ServerActor): RealtimeInput {
    const target = [...this.actors.values()]
      .filter((candidate) => candidate.alive && candidate.id !== actor.id)
      .sort((a, b) => Math.hypot(actor.x - a.x, actor.y - a.y) - Math.hypot(actor.x - b.x, actor.y - b.y))[0];
    if (!target) {
      return INPUT_IDLE;
    }
    const dx = target.x - actor.x;
    return {
      left: dx < -38,
      right: dx > 38,
      jump: actor.blockedDown && (Math.abs(dx) > 180 || target.y + 30 < actor.y),
      attack: Math.hypot(actor.x - target.x, actor.y - target.y) < 92,
      throwWeapon: Math.abs(dx) < WEAPONS[actor.weapon].range,
      seq: 0,
    };
  }

  private broadcastSnapshot(): void {
    this.room.broadcast(JSON.stringify(this.createSnapshot()));
  }

  private sendSnapshot(connection: Party.Connection): void {
    if (this.roomSnapshot) {
      connection.send(JSON.stringify(this.createSnapshot()));
    }
  }

  private createSnapshot(): RealtimeSnapshot {
    const mapId = this.mapOrder[this.roundIndex] ?? MAPS[0].id;
    return {
      type: "snapshot",
      tick: this.tickCount,
      roundIndex: this.roundIndex,
      mapId,
      phase: this.phase,
      scores: this.scores,
      actors: [...this.actors.values()].map(({ id, x, y, vx, vy, facing, health, alive, weapon, weaponUses }) => ({
        id,
        x,
        y,
        vx,
        vy,
        facing,
        health,
        alive,
        weapon,
        weaponUses,
      })),
      pickups: this.pickups.filter((pickup) => pickup.respawnAt <= Date.now()).map(({ id, x, y, weapon }) => ({ id, x, y, weapon })),
      ranking: this.ranking,
    };
  }

  private consumeWeaponUse(actor: ServerActor): void {
    if (actor.weaponUses === null) {
      return;
    }
    actor.weaponUses -= 1;
    if (actor.weaponUses <= 0) {
      actor.weapon = "scratch";
      actor.weaponUses = null;
    }
  }

  private getWeaponUses(weapon: WeaponId): number | null {
    return WEAPONS[weapon].uses ?? null;
  }

  private resolveHorizontal(actor: ServerActor, previousX: number): void {
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

  private resolveVertical(actor: ServerActor, previousY: number): void {
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
    const aliveActors = [...this.actors.values()].filter((actor) => actor.alive);
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
        const direction = dx >= 0 ? 1 : -1;
        const push = overlapX / 2 + 0.2;
        first.x -= direction * push;
        second.x += direction * push;
      }
    }
  }

  private actorRect(actor: ServerActor): Rect {
    return { x: actor.x, y: actor.y, width: actor.width, height: actor.height };
  }

  private overlap(a: Rect, b: Rect): boolean {
    return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
  }

  private moveToward(value: number, target: number, maxDelta: number): number {
    if (Math.abs(target - value) <= maxDelta) {
      return target;
    }
    return value + Math.sign(target - value) * maxDelta;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private seedFromRoom(): number {
    return [...this.room.id].reduce((seed, char) => seed + char.charCodeAt(0), 0);
  }

  private shuffle<T>(items: T[], seed: number): T[] {
    let value = seed || 1;
    const random = (): number => {
      value = (value * 1664525 + 1013904223) % 4294967296;
      return value / 4294967296;
    };
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
  }
}
