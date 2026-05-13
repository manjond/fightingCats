import { PixiArena } from "./PixiArena";
import type { MatchConfig, RuntimeControls } from "./types";

let activeGame: PixiArena | null = null;

export function mountGame(parent: HTMLElement, match: MatchConfig, controls: RuntimeControls): PixiArena {
  activeGame?.destroy();
  parent.innerHTML = "";

  activeGame = new PixiArena(parent, match, controls);
  void activeGame.start();
  return activeGame;
}

export function destroyGame(): void {
  activeGame?.destroy();
  activeGame = null;
}
