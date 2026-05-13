import { CATS, STANDARD_MAP_IDS, WORLD } from "../src/game/config";
import type { PlayerSetup, RoomSettings, RoomSnapshot, WeaponId } from "../src/game/types";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_SECONDS = 60 * 60 * 3;
const INDEX_KEY = "fighting-cats:rooms";

const defaultSettings: RoomSettings = {
  visibility: "public",
  mode: "standard",
  maxPlayers: 4,
  mapIds: STANDARD_MAP_IDS,
  rounds: 5,
  startingWeapon: "scratch",
};

const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

type RedisResult<T = unknown> = { result?: T; error?: string };

export default async function handler(req: any, res: any): Promise<void> {
  if (!hasRedisConfig()) {
    res.status(503).json({ error: "Redis REST is not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const code = String(req.query.code ?? "").toUpperCase();
      const room = await getRoom(code);
      res.status(room ? 200 : 404).json(room ?? { error: "Room not found" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const action = String(body?.action ?? "");

    if (action === "create") {
      const room = await createRoom(body.player, body.settings ?? defaultSettings);
      res.status(200).json(room);
      return;
    }

    if (action === "join") {
      const room = await joinRoom(String(body.code ?? ""), body.player);
      res.status(room ? 200 : 404).json(room ?? { error: "Room not found or full" });
      return;
    }

    if (action === "quick") {
      const room = await quickPlay(body.player);
      res.status(200).json(room);
      return;
    }

    if (action === "update-player") {
      const room = await updatePlayer(String(body.code ?? ""), body.player);
      res.status(room ? 200 : 404).json(room ?? { error: "Room not found" });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("[rooms-api]", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected rooms API error" });
  }
}

async function createRoom(host: PlayerSetup, settings: RoomSettings): Promise<RoomSnapshot> {
  const assignedHost = withAvailableCat(host, []);
  const code = await makeUniqueCode();
  const room: RoomSnapshot = {
    code,
    hostId: assignedHost.id,
    players: [assignedHost],
    settings: normalizeSettings(settings),
    createdAt: Date.now(),
  };
  await saveRoom(room);
  return room;
}

async function quickPlay(player: PlayerSetup): Promise<RoomSnapshot> {
  const rooms = await loadIndexedRooms();
  const available = rooms.find(
    (room) =>
      room.settings.visibility === "public" &&
      room.players.length < room.settings.maxPlayers &&
      Date.now() - room.createdAt < ROOM_TTL_SECONDS * 1000,
  );

  if (!available) {
    return createRoom(player, defaultSettings);
  }

  return joinRoom(available.code, player).then((room) => room ?? createRoom(player, defaultSettings));
}

async function joinRoom(code: string, player: PlayerSetup): Promise<RoomSnapshot | null> {
  const room = await getRoom(code);
  if (!room) {
    return null;
  }

  const alreadyInRoom = room.players.some((candidate) => candidate.id === player.id);
  if (!alreadyInRoom && room.players.length >= room.settings.maxPlayers) {
    return null;
  }

  const assignedPlayer = withAvailableCat(player, room.players);
  const joined = {
    ...room,
    players: [...room.players.filter((candidate) => candidate.id !== assignedPlayer.id), assignedPlayer],
  };
  await saveRoom(joined);
  return joined;
}

async function updatePlayer(code: string, player: PlayerSetup): Promise<RoomSnapshot | null> {
  const room = await getRoom(code);
  if (!room) {
    return null;
  }

  const otherPlayers = room.players.filter((candidate) => candidate.id !== player.id);
  const assignedPlayer = withAvailableCat(player, otherPlayers);
  const players = room.players.some((candidate) => candidate.id === assignedPlayer.id)
    ? room.players.map((candidate) => (candidate.id === assignedPlayer.id ? assignedPlayer : candidate))
    : [...room.players, assignedPlayer];
  const updated = { ...room, players };
  await saveRoom(updated);
  return updated;
}

async function getRoom(code: string): Promise<RoomSnapshot | null> {
  if (!code) {
    return null;
  }

  const value = await redisCommand<string | RoomSnapshot | null>("GET", roomKey(code.toUpperCase()));
  if (!value) {
    return null;
  }

  return typeof value === "string" ? (JSON.parse(value) as RoomSnapshot) : value;
}

async function saveRoom(room: RoomSnapshot): Promise<void> {
  await redisPipeline([
    ["SET", roomKey(room.code), JSON.stringify(room), "EX", ROOM_TTL_SECONDS],
    ["SADD", INDEX_KEY, room.code],
    ["EXPIRE", INDEX_KEY, ROOM_TTL_SECONDS],
  ]);
}

async function loadIndexedRooms(): Promise<RoomSnapshot[]> {
  const codes = (await redisCommand<string[]>("SMEMBERS", INDEX_KEY)) ?? [];
  const rooms = await Promise.all(codes.map((code) => getRoom(code)));
  return rooms.filter((room): room is RoomSnapshot => Boolean(room));
}

async function makeUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode();
    if (!(await getRoom(code))) {
      return code;
    }
  }
  return makeCode();
}

function makeCode(): string {
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return code;
}

function roomKey(code: string): string {
  return `fighting-cats:room:${code.toUpperCase()}`;
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

function normalizeSettings(settings: RoomSettings): RoomSettings {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasRedisConfig(): boolean {
  return Boolean(redisRestUrl?.startsWith("https://") && redisRestToken);
}

async function redisCommand<T>(...command: Array<string | number>): Promise<T> {
  const [response] = await redisPipeline([command]);
  return response.result as T;
}

async function redisPipeline(commands: Array<Array<string | number>>): Promise<Array<RedisResult>> {
  const url = redisRestUrl!;
  const token = redisRestToken!;
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    throw new Error(`Redis REST ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as Array<RedisResult>;
  const failed = payload.find((item) => item.error);
  if (failed?.error) {
    throw new Error(failed.error);
  }

  return payload;
}
