import Phaser from "phaser";
import { WORLD } from "./config";
import { GameScene } from "./GameScene";
import type { MatchConfig, RuntimeControls } from "./types";

let activeGame: Phaser.Game | null = null;

export function mountGame(parent: HTMLElement, match: MatchConfig, controls: RuntimeControls): Phaser.Game {
  activeGame?.destroy(true);
  parent.innerHTML = "";

  activeGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD.width,
    height: WORLD.height,
    backgroundColor: "#111827",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: WORLD.gravity },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WORLD.width,
      height: WORLD.height,
    },
    scene: [],
  });

  activeGame.scene.add("GameScene", GameScene, true, { match, controls });
  return activeGame;
}

export function destroyGame(): void {
  activeGame?.destroy(true);
  activeGame = null;
}
