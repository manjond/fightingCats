import { CATS, STANDARD_MAP_IDS, WORLD } from "./config";
import type { PlayerSetup, RoomSettings, RoomSnapshot, WeaponId } from "./types";

const ROOM_KEY = "fighting-cats.rooms";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const BOT_NAMES = ["Miso", "Pixel", "Nube", "Taco", "Bowie", "Lua", "Kiro"];

export const defaultSettings: RoomSettings = {
  visibility: "public",
  mode: "standard",
  maxPlayers: 4,
  mapIds: STANDARD_MAP_IDS,
  rounds: 5,
  startingWeapon: "scratch",
};

export function createLocalPlayer(name = "Player 1"): PlayerSetup {
  return {
    id: crypto.randomUUID(),
    name,
    cat: "orange",
    bot: false,
  };
}

export function createRoom(host: PlayerSetup, settings: RoomSettings): RoomSnapshot {
  const room: RoomSnapshot = {
    code: makeCode(),
    hostId: host.id,
    players: [host],
    settings: normalizeSettings(settings),
    createdAt: Date.now(),
  };

  saveRoom(room);
  return room;
}

export function quickPlay(player: PlayerSetup): RoomSnapshot {
  const rooms = loadRooms();
  const available = rooms.find(
    (room) =>
      room.settings.visibility === "public" &&
      room.players.length < room.settings.maxPlayers &&
      Date.now() - room.createdAt < 1000 * 60 * 60,
  );

  if (!available) {
    return createRoom(player, defaultSettings);
  }

  const joined = {
    ...available,
    players: [...available.players.filter((candidate) => candidate.id !== player.id), player],
  };
  saveRoom(joined);
  return joined;
}

export function joinRoom(code: string, player: PlayerSetup): RoomSnapshot | null {
  const normalizedCode = code.trim().toUpperCase();
  const room = loadRooms().find((candidate) => candidate.code === normalizedCode);
  if (!room || room.players.length >= room.settings.maxPlayers) {
    return null;
  }

  const joined = {
    ...room,
    players: [...room.players.filter((candidate) => candidate.id !== player.id), player],
  };
  saveRoom(joined);
  return joined;
}

export function fillWithBots(room: RoomSnapshot): RoomSnapshot {
  const targetPlayers = Math.min(room.settings.maxPlayers, WORLD.maxPlayers);
  const usedCats = new Set(room.players.map((player) => player.cat));
  const bots: PlayerSetup[] = [];

  for (let index = room.players.length; index < targetPlayers; index += 1) {
    const cat = CATS.find((candidate) => !usedCats.has(candidate.id)) ?? CATS[index % CATS.length];
    usedCats.add(cat.id);
    bots.push({
      id: `bot-${index}-${room.code}`,
      name: BOT_NAMES[(index - 1) % BOT_NAMES.length],
      cat: cat.id,
      bot: true,
    });
  }

  return {
    ...room,
    players: [...room.players, ...bots],
  };
}

export function roomWithUpdatedHost(room: RoomSnapshot, player: PlayerSetup): RoomSnapshot {
  const players = room.players.map((candidate) => (candidate.id === player.id ? player : candidate));
  const updated = { ...room, players };
  saveRoom(updated);
  return updated;
}

export function normalizeSettings(settings: RoomSettings): RoomSettings {
  const mapIds = settings.mode === "standard" ? STANDARD_MAP_IDS : settings.mapIds;
  const rounds = settings.mode === "standard" ? 5 : clamp(settings.rounds, 1, mapIds.length || 1);

  return {
    visibility: settings.visibility,
    mode: settings.mode,
    maxPlayers: clamp(settings.maxPlayers, 2, WORLD.maxPlayers),
    mapIds: mapIds.length > 0 ? mapIds : STANDARD_MAP_IDS,
    rounds,
    startingWeapon: settings.startingWeapon as WeaponId,
  };
}

function loadRooms(): RoomSnapshot[] {
  const raw = localStorage.getItem(ROOM_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as RoomSnapshot[];
  } catch {
    localStorage.removeItem(ROOM_KEY);
    return [];
  }
}

function saveRoom(room: RoomSnapshot): void {
  const activeRooms = loadRooms()
    .filter((candidate) => Date.now() - candidate.createdAt < 1000 * 60 * 60 * 3)
    .filter((candidate) => candidate.code !== room.code);
  localStorage.setItem(ROOM_KEY, JSON.stringify([room, ...activeRooms].slice(0, 12)));
}

function makeCode(): string {
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return code;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
