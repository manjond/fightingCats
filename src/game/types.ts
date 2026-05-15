export type CatId =
  | "orange"
  | "black"
  | "brown"
  | "persian"
  | "calico"
  | "gray"
  | "siamese"
  | "tuxedo"
  | "striped"
  | "white"
  | "blue"
  | "gold";

export type WeaponId = "scratch" | "pistol" | "yarn" | "bomb" | "fishbat" | "sardine" | "spray" | "bell" | "kibble" | "feedbag";

export type HazardId = "spikes" | "laser" | "steam";

export interface Point {
  x: number;
  y: number;
}

export interface PlatformConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HazardConfig extends PlatformConfig {
  kind: HazardId;
  damage: number;
}

export interface BoosterConfig extends PlatformConfig {
  kind: "speed" | "jump";
}

export interface MapConfig {
  id: string;
  name: string;
  theme: "rooftop" | "greenhouse" | "subway" | "arcade" | "bakery" | "dojo" | "lab" | "harbor";
  platforms: PlatformConfig[];
  hazards: HazardConfig[];
  boosters: BoosterConfig[];
  spawns: Point[];
  weaponSpawns: Point[];
}

export interface CatConfig {
  id: CatId;
  name: string;
  body: number;
  accent: number;
  ear: number;
}

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  kind: "melee" | "projectile" | "explosive";
  damage: number;
  cooldownMs: number;
  range: number;
  projectileSpeed?: number;
  radius?: number;
  knockback: number;
  uses?: number;
}

export interface PlayerSetup {
  id: string;
  name: string;
  cat: CatId;
  bot: boolean;
}

export interface RoomSettings {
  visibility: "public" | "private";
  mode: "standard" | "custom";
  maxPlayers: number;
  botCount: number;
  mapIds: string[];
  rounds: number;
  startingWeapon: WeaponId;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  players: PlayerSetup[];
  settings: RoomSettings;
  createdAt: number;
  match?: {
    status: "playing";
    startedAt: number;
    players: PlayerSetup[];
  };
}

export interface MatchResult {
  ranking: PlayerSetup[];
  points: Record<string, number>;
  mapName: string;
}

export interface MatchConfig {
  room: RoomSnapshot;
  localPlayerId: string;
}

export interface RuntimeControls {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
  throwWeapon: boolean;
}
