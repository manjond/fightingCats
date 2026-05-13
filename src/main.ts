import "./styles.css";
import { CATS, MAPS, STARTING_WEAPONS, WEAPONS } from "./game/config";
import { destroyGame, mountGame } from "./game/createGame";
import {
  createLocalPlayer,
  createRoom,
  defaultSettings,
  fillWithBots,
  joinRoom,
  normalizeSettings,
  quickPlay,
  roomWithUpdatedHost,
} from "./game/rooms";
import type { MatchResult, PlayerSetup, RoomSettings, RoomSnapshot, RuntimeControls, WeaponId } from "./game/types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing app root");
}

const appRoot = app;

const controls: RuntimeControls = {
  left: false,
  right: false,
  jump: false,
  attack: false,
  throwWeapon: false,
};

let localPlayer = createLocalPlayer();
let activeRoom: RoomSnapshot | null = null;
let latestResult: MatchResult | null = null;

renderHome();

function renderHome(): void {
  destroyGame();
  appRoot.innerHTML = `
    <main class="shell">
      <section class="lobby">
        <div class="brand">
          <span class="mark">FC</span>
          <div>
            <h1>Fighting Cats</h1>
            <p>Prototype embed para Coopverse</p>
          </div>
        </div>

        <div class="player-panel">
          <label>
            Nombre
            <input id="player-name" maxlength="16" value="${escapeHtml(localPlayer.name)}" />
          </label>
          <div class="cat-grid" aria-label="Selector de gato">
            ${CATS.map(
              (cat) => `
                <button class="cat-chip ${localPlayer.cat === cat.id ? "selected" : ""}" data-cat="${cat.id}">
                  <span class="cat-dot" style="background:#${cat.body.toString(16).padStart(6, "0")}"></span>
                  ${cat.name}
                </button>
              `,
            ).join("")}
          </div>
        </div>

        <div class="actions">
          <button class="primary" id="quick-play">Quick play</button>
          <button id="create-room">Crear sala</button>
          <form id="join-form" class="join-form">
            <input id="room-code" maxlength="5" placeholder="Codigo" />
            <button type="submit">Entrar</button>
          </form>
        </div>

        <div class="note">
          El multijugador real queda preparado por adaptador. En esta primera version las salas viven en navegador y se rellenan con bots para poder probar combate, mapas y puntuacion ya.
        </div>
      </section>
    </main>
  `;

  bindPlayerControls();
  document.querySelector("#quick-play")?.addEventListener("click", () => {
    syncLocalPlayer();
    activeRoom = quickPlay(localPlayer);
    renderRoom(activeRoom);
  });
  document.querySelector("#create-room")?.addEventListener("click", () => renderCreateRoom());
  document.querySelector("#join-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    syncLocalPlayer();
    const code = document.querySelector<HTMLInputElement>("#room-code")?.value ?? "";
    const room = joinRoom(code, localPlayer);
    if (!room) {
      showToast("Sala no encontrada o llena");
      return;
    }
    activeRoom = room;
    renderRoom(activeRoom);
  });
}

function renderCreateRoom(): void {
  const settings = { ...defaultSettings };
  appRoot.innerHTML = `
    <main class="shell">
      <section class="lobby wide">
        <div class="topline">
          <button class="ghost" id="back-home">Volver</button>
          <h1>Crear sala</h1>
        </div>

        <form id="room-form" class="settings-grid">
          <label>
            Visibilidad
            <select id="visibility">
              <option value="public">Publica</option>
              <option value="private">Privada</option>
            </select>
          </label>
          <label>
            Tipo
            <select id="mode">
              <option value="standard">Standard: 5 mapas</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Jugadores
            <input id="max-players" type="number" min="2" max="8" value="${settings.maxPlayers}" />
          </label>
          <label>
            Rondas
            <input id="rounds" type="number" min="1" max="8" value="${settings.rounds}" />
          </label>
          <label>
            Arma inicial
            <select id="starting-weapon">
              ${STARTING_WEAPONS.map((weapon) => `<option value="${weapon}">${WEAPONS[weapon].name}</option>`).join("")}
            </select>
          </label>

          <fieldset class="map-picker">
            <legend>Mapas custom</legend>
            ${MAPS.map(
              (map) => `
                <label class="check-row">
                  <input type="checkbox" name="maps" value="${map.id}" ${settings.mapIds.includes(map.id) ? "checked" : ""} />
                  ${map.name}
                </label>
              `,
            ).join("")}
          </fieldset>

          <button class="primary span" type="submit">Crear sala</button>
        </form>
      </section>
    </main>
  `;

  document.querySelector("#back-home")?.addEventListener("click", renderHome);
  document.querySelector("#mode")?.addEventListener("change", updateCustomFields);
  updateCustomFields();

  document.querySelector("#room-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    syncLocalPlayer();
    const selectedMaps = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="maps"]:checked')).map((input) => input.value);
    const nextSettings = normalizeSettings({
      visibility: readSelect("visibility") as RoomSettings["visibility"],
      mode: readSelect("mode") as RoomSettings["mode"],
      maxPlayers: Number(readInput("max-players")),
      rounds: Number(readInput("rounds")),
      mapIds: selectedMaps,
      startingWeapon: readSelect("starting-weapon") as WeaponId,
    });

    activeRoom = createRoom(localPlayer, nextSettings);
    renderRoom(activeRoom);
  });
}

function renderRoom(room: RoomSnapshot): void {
  appRoot.innerHTML = `
    <main class="shell">
      <section class="lobby wide">
        <div class="room-header">
          <button class="ghost" id="back-home">Salir</button>
          <div>
            <p class="eyebrow">${room.settings.visibility === "public" ? "Sala publica" : "Sala privada"}</p>
            <h1>${room.code}</h1>
          </div>
          <button class="primary" id="start-match">Jugar</button>
        </div>

        <div class="room-layout">
          <div class="roster">
            ${room.players
              .map(
                (player) => `
                  <div class="player-card">
                    <span class="cat-dot" style="background:#${CATS.find((cat) => cat.id === player.cat)?.body.toString(16).padStart(6, "0") ?? "f28c28"}"></span>
                    <strong>${escapeHtml(player.name)}</strong>
                    <span>${player.bot ? "Bot" : "Player"}</span>
                  </div>
                `,
              )
              .join("")}
            <div class="player-card muted">${room.settings.maxPlayers - room.players.length} slots libres</div>
          </div>

          <div class="room-summary">
            <p><strong>Modo</strong> ${room.settings.mode}</p>
            <p><strong>Rondas</strong> ${room.settings.rounds}</p>
            <p><strong>Arma inicial</strong> ${WEAPONS[room.settings.startingWeapon].name}</p>
            <p><strong>Mapas</strong> ${room.settings.mapIds.map((id) => MAPS.find((map) => map.id === id)?.name).join(", ")}</p>
          </div>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#back-home")?.addEventListener("click", renderHome);
  document.querySelector("#start-match")?.addEventListener("click", () => {
    const readyRoom = fillWithBots(roomWithUpdatedHost(room, localPlayer));
    activeRoom = readyRoom;
    renderGame(readyRoom);
  });
}

function renderGame(room: RoomSnapshot): void {
  latestResult = null;
  appRoot.innerHTML = `
    <main class="game-shell">
      <div id="game-root" class="game-root"></div>
      <div class="game-topbar">
        <button id="leave-game">Salir</button>
        <div id="round-feed"></div>
      </div>
      <div class="mobile-controls" aria-hidden="true">
        <div class="pad">
          <button data-control="left">←</button>
          <button data-control="right">→</button>
        </div>
        <div class="pad">
          <button data-control="jump">↑</button>
          <button data-control="attack">✦</button>
          <button data-control="throwWeapon">●</button>
        </div>
      </div>
    </main>
  `;

  const root = document.querySelector<HTMLDivElement>("#game-root");
  if (!root) {
    throw new Error("Missing game root");
  }

  mountGame(root, { room, localPlayerId: localPlayer.id }, controls);
  bindMobileControls();
  document.querySelector("#leave-game")?.addEventListener("click", renderHome);
}

window.addEventListener("fc:round-end", (event) => {
  const result = (event as CustomEvent<MatchResult>).detail;
  latestResult = result;
  const feed = document.querySelector("#round-feed");
  if (feed) {
    feed.textContent = `${result.mapName}: ${result.ranking.map((player, index) => `${index + 1}. ${player.name}`).join(" · ")}`;
  }
});

window.addEventListener("fc:match-end", () => {
  if (!latestResult || !activeRoom) {
    return;
  }

  const sortedPlayers = [...activeRoom.players].sort((a, b) => (latestResult?.points[b.id] ?? 0) - (latestResult?.points[a.id] ?? 0));
  setTimeout(() => {
    destroyGame();
    appRoot.innerHTML = `
      <main class="shell">
        <section class="lobby">
          <h1>Resultado</h1>
          <div class="score-list">
            ${sortedPlayers
              .map(
                (player, index) => `
                  <div class="score-row">
                    <span>${index + 1}</span>
                    <strong>${escapeHtml(player.name)}</strong>
                    <b>${latestResult?.points[player.id] ?? 0}</b>
                  </div>
                `,
              )
              .join("")}
          </div>
          <button class="primary" id="play-again">Otra partida</button>
          <button id="home">Menu</button>
        </section>
      </main>
    `;
    document.querySelector("#play-again")?.addEventListener("click", () => renderGame(fillWithBots(activeRoom!)));
    document.querySelector("#home")?.addEventListener("click", renderHome);
  }, 900);
});

function bindPlayerControls(): void {
  document.querySelector<HTMLInputElement>("#player-name")?.addEventListener("input", syncLocalPlayer);
  document.querySelectorAll<HTMLButtonElement>("[data-cat]").forEach((button) => {
    button.addEventListener("click", () => {
      localPlayer = { ...localPlayer, cat: button.dataset.cat as PlayerSetup["cat"] };
      renderHome();
    });
  });
}

function bindMobileControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-control]").forEach((button) => {
    const key = button.dataset.control as keyof RuntimeControls;
    const setValue = (value: boolean) => {
      controls[key] = value;
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setValue(true);
    });
    button.addEventListener("pointerup", () => setValue(false));
    button.addEventListener("pointercancel", () => setValue(false));
    button.addEventListener("pointerleave", () => setValue(false));
  });
}

function syncLocalPlayer(): void {
  const name = document.querySelector<HTMLInputElement>("#player-name")?.value.trim();
  localPlayer = {
    ...localPlayer,
    name: name || "Player 1",
  };
}

function updateCustomFields(): void {
  const custom = readSelect("mode") === "custom";
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#rounds, #starting-weapon, .map-picker input").forEach((field) => {
    field.disabled = !custom;
  });
}

function readInput(id: string): string {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
}

function readSelect(id: string): string {
  return document.querySelector<HTMLSelectElement>(`#${id}`)?.value ?? "";
}

function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2200);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}
