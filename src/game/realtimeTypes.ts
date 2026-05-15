import type { PlayerSetup, RoomSnapshot, WeaponId } from "./types";

export interface RealtimeInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
  throwWeapon: boolean;
  aimX: number;
  aimY: number;
  seq: number;
}

export interface RealtimeActorState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  alive: boolean;
  weapon: WeaponId;
  weaponUses: number | null;
}

export interface RealtimePickupState {
  id: string;
  x: number;
  y: number;
  weapon: WeaponId;
}

export interface RealtimeSnapshot {
  type: "snapshot";
  tick: number;
  roundIndex: number;
  mapId: string;
  phase: "playing" | "round-end" | "match-end";
  scores: Record<string, number>;
  actors: RealtimeActorState[];
  pickups: RealtimePickupState[];
  ranking: PlayerSetup[];
}

export type ClientRealtimeMessage =
  | {
      type: "init";
      room: RoomSnapshot;
      playerId: string;
    }
  | {
      type: "input";
      input: RealtimeInput;
    };

export type ServerRealtimeMessage =
  | RealtimeSnapshot
  | {
      type: "error";
      message: string;
    };
