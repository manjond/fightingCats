import PartySocket from "partysocket";
import type { ClientRealtimeMessage, RealtimeInput, RealtimeSnapshot, ServerRealtimeMessage } from "./realtimeTypes";
import type { RoomSnapshot } from "./types";

export interface ArenaRealtimeClient {
  sendInput(input: RealtimeInput): void;
  close(): void;
}

export function createArenaRealtimeClient(
  room: RoomSnapshot,
  playerId: string,
  onSnapshot: (snapshot: RealtimeSnapshot) => void,
  onStatus?: (status: "open" | "closed" | "error") => void,
): ArenaRealtimeClient | null {
  const host = import.meta.env.VITE_PARTYKIT_HOST as string | undefined;
  if (!host || !room.match?.players.length) {
    return null;
  }

  const socket = new PartySocket({
    host,
    room: room.code.toLowerCase(),
    id: playerId,
  });

  const send = (message: ClientRealtimeMessage): void => {
    socket.send(JSON.stringify(message));
  };

  socket.addEventListener("open", () => {
    onStatus?.("open");
    send({ type: "init", room, playerId });
  });

  socket.addEventListener("close", () => onStatus?.("closed"));
  socket.addEventListener("error", () => onStatus?.("error"));
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as ServerRealtimeMessage;
      if (message.type === "snapshot") {
        onSnapshot(message);
      } else {
        console.warn("[realtime]", message.message);
      }
    } catch (error) {
      console.warn("[realtime] Invalid message", error);
    }
  });

  return {
    sendInput(input) {
      send({ type: "input", input });
    },
    close() {
      socket.close();
    },
  };
}
