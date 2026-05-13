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

export async function createRoom(host: PlayerSetup, settings: RoomSettings): Promise<RoomSnapshot> {
  const remoteRoom = await callRoomsApi<RoomSnapshot>("create", { player: host, settings });
  if (remoteRoom) {
    saveRoom(remoteRoom);
    return remoteRoom;
  }

  const assignedHost = withAvailableCat(host, []);
  const room: RoomSnapshot = {
    code: makeCode(),
    hostId: assignedHost.id,
    players: [assignedHost],
    settings: normalizeSettings(settings),
    createdAt: Date.now(),
  };

  saveRoom(room);
  return room;
}

export async function quickPlay(player: PlayerSetup): Promise<RoomSnapshot> {
  const remoteRoom = await callRoomsApi<RoomSnapshot>("quick", { player });
  if (remoteRoom) {
    saveRoom(remoteRoom);
    return remoteRoom;
  }

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

  const assignedPlayer = withAvailableCat(player, available.players);
  const joined = {
    ...available,
    players: [...available.players.filter((candidate) => candidate.id !== assignedPlayer.id), assignedPlayer],
  };
  saveRoom(joined);
  return joined;
}

export async function joinRoom(code: string, player: PlayerSetup): Promise<RoomSnapshot | null> {
  const remoteRoom = await callRoomsApi<RoomSnapshot>("join", { code, player });
  if (remoteRoom) {
    saveRoom(remoteRoom);
    return remoteRoom;
  }

  const normalizedCode = code.trim().toUpperCase();
  const room = loadRooms().find((candidate) => candidate.code === normalizedCode);
  if (!room || room.players.length >= room.settings.maxPlayers) {
    return null;
  }

  const assignedPlayer = withAvailableCat(player, room.players);
  const joined = {
    ...room,
    players: [...room.players.filter((candidate) => candidate.id !== assignedPlayer.id), assignedPlayer],
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

export async function getRoom(code: string): Promise<RoomSnapshot | null> {
  const remoteRoom = await fetchRoom(code);
  if (remoteRoom) {
    saveRoom(remoteRoom);
    return remoteRoom;
  }

  return loadRooms().find((candidate) => candidate.code === code.trim().toUpperCase()) ?? null;
}

export async function roomWithUpdatedHost(room: RoomSnapshot, player: PlayerSetup): Promise<RoomSnapshot> {
  const remoteRoom = await callRoomsApi<RoomSnapshot>("update-player", { code: room.code, player });
  if (remoteRoom) {
    saveRoom(remoteRoom);
    return remoteRoom;
  }

  const otherPlayers = room.players.filter((candidate) => candidate.id !== player.id);
  const assignedPlayer = withAvailableCat(player, otherPlayers);
  const players = room.players.map((candidate) => (candidate.id === assignedPlayer.id ? assignedPlayer : candidate));
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

function withAvailableCat(player: PlayerSetup, existingPlayers: PlayerSetup[]): PlayerSetup {
  const usedCats = new Set(existingPlayers.filter((candidate) => candidate.id !== player.id).map((candidate) => candidate.cat));
  if (!usedCats.has(player.cat)) {
    return player;
  }

  return {
    ...player,
    cat: CATS.find((cat) => !usedCats.has(cat.id))?.id ?? player.cat,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function callRoomsApi<T>(action: string, payload: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchRoom(code: string): Promise<RoomSnapshot | null> {
  try {
    const response = await fetch(`/api/rooms?code=${encodeURIComponent(code.trim().toUpperCase())}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RoomSnapshot;
  } catch {
    return null;
  }
}
