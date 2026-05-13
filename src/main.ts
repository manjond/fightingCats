import "./styles.css";
import { CATS, MAPS, STARTING_WEAPONS, WEAPONS, WORLD } from "./game/config";
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
import type { CatId, MapConfig, MatchResult, PlatformConfig, RoomSettings, RoomSnapshot, RuntimeControls, WeaponId } from "./game/types";

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
      <section class="lobby home-card">
        <div class="brand home-brand">
          <img class="home-thumb" src="/images/fighting-cats-icon-192.png" alt="" />
          <div>
            <h1>Fighting Cats</h1>
          </div>
        </div>

        <div class="home-copy">
          <h2>Entra, crea sala y pelea en arenas de plataformas.</h2>
          <p>Un combate rapido y caotico entre gatos con mucho caracter: salta entre tejados, recoge armas absurdas, esquiva trampas y demuestra quien manda en la arena.</p>
        </div>

        <div class="player-panel compact">
          <label>
            Tu nombre
            <input id="player-name" maxlength="16" value="${escapeHtml(localPlayer.name)}" />
          </label>
        </div>

        <div class="actions home-actions">
          <button class="primary" id="quick-play">Quick play</button>
          <button id="create-room">Crear sala</button>
          <button id="show-join">Unirse a sala</button>
        </div>

        <form id="join-form" class="join-form hidden">
          <label>
            Codigo de sala
            <input id="room-code" maxlength="5" placeholder="AB12C" autocomplete="off" />
          </label>
          <button class="primary" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  `;

  bindPlayerControls();
  document.querySelector("#quick-play")?.addEventListener("click", () => {
    syncLocalPlayer();
    activeRoom = quickPlay(localPlayer);
    syncLocalPlayerFromRoom(activeRoom);
    renderRoom(activeRoom);
  });
  document.querySelector("#create-room")?.addEventListener("click", () => renderCreateRoom());
  document.querySelector("#show-join")?.addEventListener("click", () => {
    document.querySelector("#join-form")?.classList.toggle("hidden");
    document.querySelector<HTMLInputElement>("#room-code")?.focus();
  });
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
    syncLocalPlayerFromRoom(activeRoom);
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
                <label class="map-option">
                  <input type="checkbox" name="maps" value="${map.id}" ${settings.mapIds.includes(map.id) ? "checked" : ""} />
                  ${renderMapPreview(map)}
                  <span>${map.name}</span>
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
    syncLocalPlayerFromRoom(activeRoom);
    renderRoom(activeRoom);
  });
}

function renderRoom(room: RoomSnapshot): void {
  syncLocalPlayerFromRoom(room);
  const occupiedCats = new Map(room.players.filter((player) => player.id !== localPlayer.id).map((player) => [player.cat, player.name]));

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
            <div class="section-title">
              <p class="eyebrow">Jugadores</p>
              <h2>${room.players.length}/${room.settings.maxPlayers}</h2>
            </div>
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

          <div class="room-side">
            <div class="cat-selection">
              <div class="section-title">
                <p class="eyebrow">Tu gato</p>
                <h2>Elige luchador</h2>
              </div>
              <div class="cat-grid room-cat-grid" aria-label="Selector de gato en sala">
                ${CATS.map((cat) => {
                  const owner = occupiedCats.get(cat.id);
                  const selected = localPlayer.cat === cat.id;
                  return `
                    <button class="cat-chip ${selected ? "selected" : ""} ${owner ? "taken" : ""}" data-room-cat="${cat.id}" ${owner ? "disabled" : ""}>
                      <span class="cat-dot" style="background:#${cat.body.toString(16).padStart(6, "0")}"></span>
                      <span>${cat.name}</span>
                      <small>${owner ? `Ocupado por ${escapeHtml(owner)}` : selected ? "Tu gato" : "Libre"}</small>
                    </button>
                  `;
                }).join("")}
              </div>
            </div>

            <div class="room-summary">
              <p><strong>Modo</strong> ${room.settings.mode}</p>
              <p><strong>Rondas</strong> ${room.settings.rounds}</p>
              <p><strong>Arma inicial</strong> ${WEAPONS[room.settings.startingWeapon].name}</p>
              <p><strong>Mapas</strong> ${room.settings.mapIds.map((id) => MAPS.find((map) => map.id === id)?.name).join(", ")}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#back-home")?.addEventListener("click", renderHome);
  document.querySelectorAll<HTMLButtonElement>("[data-room-cat]").forEach((button) => {
    button.addEventListener("click", () => {
      localPlayer = { ...localPlayer, cat: button.dataset.roomCat as CatId };
      activeRoom = roomWithUpdatedHost(room, localPlayer);
      renderRoom(activeRoom);
    });
  });
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
          <button data-control="left">&lt;</button>
          <button data-control="right">&gt;</button>
        </div>
        <div class="pad">
          <button data-control="jump">^</button>
          <button data-control="attack">A</button>
          <button data-control="throwWeapon">B</button>
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

function syncLocalPlayerFromRoom(room: RoomSnapshot): void {
  const roomPlayer = room.players.find((player) => player.id === localPlayer.id);
  if (roomPlayer) {
    localPlayer = roomPlayer;
  }
}

function updateCustomFields(): void {
  const custom = readSelect("mode") === "custom";
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#rounds, #starting-weapon, .map-picker input").forEach((field) => {
    field.disabled = !custom;
  });
}

function renderMapPreview(map: MapConfig): string {
  return `
    <span class="map-preview map-theme-${map.theme}" aria-hidden="true">
      ${map.platforms.map((platform) => `<i class="preview-platform" style="${previewStyle(platform)}"></i>`).join("")}
      ${map.hazards.map((hazard) => `<i class="preview-hazard" style="${previewStyle(hazard)}"></i>`).join("")}
      ${map.boosters.map((booster) => `<i class="preview-booster ${booster.kind}" style="${previewStyle(booster)}"></i>`).join("")}
    </span>
  `;
}

function previewStyle(item: PlatformConfig): string {
  const left = ((item.x - item.width / 2) / WORLD.width) * 100;
  const top = ((item.y - item.height / 2) / WORLD.height) * 100;
  const width = (item.width / WORLD.width) * 100;
  const height = Math.max((item.height / WORLD.height) * 100, 2.4);
  return `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%;`;
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
