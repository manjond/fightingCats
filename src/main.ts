import "./styles.css";
import { CATS, MAPS, STARTING_WEAPONS, WORLD } from "./game/config";
import { destroyGame, mountGame } from "./game/createGame";
import {
  createLocalPlayer,
  createRoom,
  defaultSettings,
  fillWithBots,
  getRoom,
  joinRoom,
  normalizeSettings,
  quickPlay,
  roomWithUpdatedHost,
} from "./game/rooms";
import type { CatId, MapConfig, MatchResult, PlatformConfig, RoomSettings, RoomSnapshot, RuntimeControls, WeaponId } from "./game/types";
import {
  getCatName,
  getMapName,
  getStoredLanguage,
  getText,
  getWeaponName,
  LANGUAGES,
  LANGUAGE_KEY,
  type Language,
} from "./i18n";

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

let language = getStoredLanguage();
document.documentElement.lang = language;
let localPlayer = createLocalPlayer();
let activeRoom: RoomSnapshot | null = null;
let latestResult: MatchResult | null = null;
let roomPollId: number | null = null;

renderHome();

function renderHome(): void {
  clearRoomPolling();
  destroyGame();
  appRoot.innerHTML = `
    <main class="shell">
      <section class="lobby home-card">
        <div class="brand home-brand">
          <img class="home-thumb" src="/images/fighting-cats-icon-192.png" alt="" />
          <div>
            <h1>Fighting Cats</h1>
          </div>
          ${renderLanguageSwitch()}
        </div>

        <div class="home-copy">
          <h2>${t("homeTagline")}</h2>
          <p>${t("homeDescription")}</p>
        </div>

        <div class="player-panel compact">
          <label>
            ${t("yourName")}
            <input id="player-name" maxlength="16" value="${escapeHtml(localPlayer.name)}" />
          </label>
        </div>

        <div class="actions home-actions">
          <button class="primary" id="quick-play">${t("quickPlay")}</button>
          <button id="create-room">${t("createRoom")}</button>
          <button id="show-join">${t("joinRoom")}</button>
        </div>

        <form id="join-form" class="join-form hidden">
          <label>
            ${t("roomCode")}
            <input id="room-code" maxlength="5" placeholder="AB12C" autocomplete="off" />
          </label>
          <button class="primary" type="submit">${t("enter")}</button>
        </form>
      </section>
    </main>
  `;

  bindPlayerControls();
  bindLanguageSwitch(renderHome);
  document.querySelector("#quick-play")?.addEventListener("click", async () => {
    syncLocalPlayer();
    activeRoom = await quickPlay(localPlayer);
    syncLocalPlayerFromRoom(activeRoom);
    renderRoom(activeRoom);
  });
  document.querySelector("#create-room")?.addEventListener("click", () => renderCreateRoom());
  document.querySelector("#show-join")?.addEventListener("click", () => {
    document.querySelector("#join-form")?.classList.toggle("hidden");
    document.querySelector<HTMLInputElement>("#room-code")?.focus();
  });
  document.querySelector("#join-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncLocalPlayer();
    const code = document.querySelector<HTMLInputElement>("#room-code")?.value ?? "";
    const room = await joinRoom(code, localPlayer);
    if (!room) {
      showToast(t("roomNotFound"));
      return;
    }
    activeRoom = room;
    syncLocalPlayerFromRoom(activeRoom);
    renderRoom(activeRoom);
  });
}

function renderCreateRoom(): void {
  clearRoomPolling();
  const settings = { ...defaultSettings };
  appRoot.innerHTML = `
    <main class="shell">
      <section class="lobby wide">
        <div class="topline">
          <button class="ghost" id="back-home">${t("back")}</button>
          <h1>${t("createRoom")}</h1>
          ${renderLanguageSwitch()}
        </div>

        <form id="room-form" class="settings-grid">
          <label>
            ${t("visibility")}
            <select id="visibility">
              <option value="public">${t("public")}</option>
              <option value="private">${t("private")}</option>
            </select>
          </label>
          <label>
            ${t("type")}
            <select id="mode">
              <option value="standard">${t("standardMode")}</option>
              <option value="custom">${t("customMode")}</option>
            </select>
          </label>
          <label>
            ${t("players")}
            <input id="max-players" type="number" min="2" max="8" value="${settings.maxPlayers}" />
          </label>
          <label>
            ${t("rounds")}
            <input id="rounds" type="number" min="1" max="8" value="${settings.rounds}" />
          </label>
          <label>
            ${t("startingWeapon")}
            <select id="starting-weapon">
              ${STARTING_WEAPONS.map((weapon) => `<option value="${weapon}">${weaponName(weapon)}</option>`).join("")}
            </select>
          </label>

          <fieldset class="map-picker">
            <legend>${t("customMaps")}</legend>
            ${MAPS.map(
              (map) => `
                <label class="map-option">
                  <input type="checkbox" name="maps" value="${map.id}" ${settings.mapIds.includes(map.id) ? "checked" : ""} />
                  ${renderMapPreview(map)}
                  <span>${mapName(map.id)}</span>
                </label>
              `,
            ).join("")}
          </fieldset>

          ${renderControlsSummary()}

          <button class="primary span" type="submit">${t("createRoom")}</button>
        </form>
      </section>
    </main>
  `;

  document.querySelector("#back-home")?.addEventListener("click", renderHome);
  bindLanguageSwitch(renderCreateRoom);
  document.querySelector("#mode")?.addEventListener("change", updateCustomFields);
  updateCustomFields();

  document.querySelector("#room-form")?.addEventListener("submit", async (event) => {
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

    activeRoom = await createRoom(localPlayer, nextSettings);
    syncLocalPlayerFromRoom(activeRoom);
    renderRoom(activeRoom);
  });
}

function renderRoom(room: RoomSnapshot): void {
  clearRoomPolling();
  syncLocalPlayerFromRoom(room);
  const occupiedCats = new Map(room.players.filter((player) => player.id !== localPlayer.id).map((player) => [player.cat, player.name]));

  appRoot.innerHTML = `
    <main class="shell">
      <section class="lobby wide">
        <div class="room-header">
          <button class="ghost" id="back-home">${t("leave")}</button>
          <div>
            <p class="eyebrow">${room.settings.visibility === "public" ? t("publicRoom") : t("privateRoom")}</p>
            <h1>${room.code}</h1>
          </div>
          <button class="primary" id="start-match">${t("play")}</button>
          ${renderLanguageSwitch()}
        </div>

        <div class="room-layout">
          <div class="roster">
            <div class="section-title">
              <p class="eyebrow">${t("players")}</p>
              <h2>${room.players.length}/${room.settings.maxPlayers}</h2>
            </div>
            ${room.players
              .map(
                (player) => `
                  <div class="player-card">
                    <span class="cat-dot" style="background:#${CATS.find((cat) => cat.id === player.cat)?.body.toString(16).padStart(6, "0") ?? "f28c28"}"></span>
                    <strong>${escapeHtml(player.name)}</strong>
                    <span>${player.bot ? "Bot" : t("player")}</span>
                  </div>
                `,
              )
              .join("")}
            <div class="player-card muted">${room.settings.maxPlayers - room.players.length} ${t("freeSlots")}</div>
          </div>

          <div class="room-side">
            <div class="cat-selection">
              <div class="section-title">
                <p class="eyebrow">${t("yourCat")}</p>
                <h2>${t("chooseFighter")}</h2>
              </div>
              ${renderCatPreview(occupiedCats)}
            </div>

            <div class="room-summary">
              <p><strong>${t("mode")}</strong> ${room.settings.mode === "standard" ? t("standardMode") : t("customMode")}</p>
              <p><strong>${t("rounds")}</strong> ${room.settings.rounds}</p>
              <p><strong>${t("startingWeapon")}</strong> ${weaponName(room.settings.startingWeapon)}</p>
              <p><strong>${t("maps")}</strong> ${room.settings.mapIds.map((id) => mapName(id)).join(", ")}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#back-home")?.addEventListener("click", renderHome);
  bindLanguageSwitch(() => renderRoom(room));
  document.querySelectorAll<HTMLButtonElement>("[data-cat-step]").forEach((button) => {
    button.addEventListener("click", async () => {
      localPlayer = { ...localPlayer, cat: nextAvailableCat(Number(button.dataset.catStep), occupiedCats) };
      activeRoom = await roomWithUpdatedHost(room, localPlayer);
      renderRoom(activeRoom);
    });
  });
  document.querySelector("#start-match")?.addEventListener("click", async () => {
    const updatedRoom = await roomWithUpdatedHost(room, localPlayer);
    const readyRoom = fillWithBots(updatedRoom);
    activeRoom = readyRoom;
    renderGame(readyRoom);
  });
  startRoomPolling(room.code);
}

function renderGame(room: RoomSnapshot): void {
  clearRoomPolling();
  latestResult = null;
  appRoot.innerHTML = `
    <main class="game-shell">
      <div id="game-root" class="game-root"></div>
      <div class="game-topbar">
        <button id="leave-game">${t("leave")}</button>
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
          <h1>${t("result")}</h1>
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
          <button class="primary" id="play-again">${t("playAgain")}</button>
          <button id="home">${t("menu")}</button>
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

function startRoomPolling(code: string): void {
  roomPollId = window.setInterval(async () => {
    const latestRoom = await getRoom(code);
    if (!latestRoom || activeRoom?.code !== code) {
      return;
    }

    if (JSON.stringify(latestRoom.players) !== JSON.stringify(activeRoom.players)) {
      activeRoom = latestRoom;
      renderRoom(latestRoom);
    }
  }, 1800);
}

function clearRoomPolling(): void {
  if (roomPollId !== null) {
    window.clearInterval(roomPollId);
    roomPollId = null;
  }
}

function updateCustomFields(): void {
  const custom = readSelect("mode") === "custom";
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("#rounds, #starting-weapon, .map-picker input").forEach((field) => {
    field.disabled = !custom;
  });
}

function renderLanguageSwitch(): string {
  return `
    <div class="language-switch" aria-label="Language">
      ${(Object.keys(LANGUAGES) as Language[])
        .map(
          (candidate) => `
            <button class="${language === candidate ? "selected" : ""}" data-language="${candidate}" type="button">
              ${LANGUAGES[candidate]}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function bindLanguageSwitch(onChange: () => void): void {
  document.querySelectorAll<HTMLButtonElement>("[data-language]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextLanguage = button.dataset.language as Language;
      language = nextLanguage;
      document.documentElement.lang = language;
      localStorage.setItem(LANGUAGE_KEY, nextLanguage);
      onChange();
    });
  });
}

function renderControlsSummary(): string {
  const controls = [
    { keys: ["A", "D", "<", ">"], action: t("controlsMove") },
    { keys: ["W", "Space", "^"], action: t("controlsJump") },
    { keys: ["J", "A"], action: t("controlsAttack") },
    { keys: ["K", "Shift", "B"], action: t("controlsThrow") },
  ];

  return `
    <section class="controls-summary span">
      <div class="section-title">
        <p class="eyebrow">${t("controlsTitle")}</p>
        <span>${t("controlsMobile")}</span>
      </div>
      <div class="controls-grid">
        ${controls
          .map(
            (control) => `
              <div class="control-row">
                <span class="key-group">${control.keys.map((key) => `<kbd>${key}</kbd>`).join("")}</span>
                <span>${control.action}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCatPreview(occupiedCats: Map<CatId, string>): string {
  const cat = CATS.find((candidate) => candidate.id === localPlayer.cat) ?? CATS[0];
  const body = `#${cat.body.toString(16).padStart(6, "0")}`;
  const accent = `#${cat.accent.toString(16).padStart(6, "0")}`;
  const ear = `#${cat.ear.toString(16).padStart(6, "0")}`;
  const takenCount = occupiedCats.size;

  return `
    <div class="cat-preview-card">
      <button class="cat-nav" type="button" data-cat-step="-1" aria-label="Previous cat">&lt;</button>
      <div class="cat-preview">
        <div class="css-cat upright ${cat.id === "striped" ? "striped" : ""}" style="--cat-body:${body};--cat-accent:${accent};--cat-ear:${ear};">
          <span class="tail"></span>
          <span class="body"></span>
          <span class="head"></span>
          <span class="ear left"></span>
          <span class="ear right"></span>
          <span class="eye left"></span>
          <span class="eye right"></span>
          <span class="muzzle"></span>
          <span class="leg left"></span>
          <span class="leg right"></span>
        </div>
        <strong>${catName(cat.id)}</strong>
        <span>${t("selectedCat")} · ${CATS.length - takenCount}/${CATS.length} ${t("free")}</span>
      </div>
      <button class="cat-nav" type="button" data-cat-step="1" aria-label="Next cat">&gt;</button>
    </div>
  `;
}

function nextAvailableCat(step: number, occupiedCats: Map<CatId, string>): CatId {
  const currentIndex = Math.max(
    0,
    CATS.findIndex((cat) => cat.id === localPlayer.cat),
  );

  for (let offset = 1; offset <= CATS.length; offset += 1) {
    const index = (currentIndex + step * offset + CATS.length) % CATS.length;
    const cat = CATS[index];
    if (!occupiedCats.has(cat.id)) {
      return cat.id;
    }
  }

  return localPlayer.cat;
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

function t(key: Parameters<typeof getText>[1]): string {
  return getText(language, key);
}

function catName(id: CatId): string {
  return getCatName(language, id);
}

function weaponName(id: WeaponId): string {
  return getWeaponName(language, id);
}

function mapName(id: string): string {
  return getMapName(language, id);
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
