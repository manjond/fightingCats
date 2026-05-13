import Phaser from "phaser";
import { CATS, WEAPONS } from "./config";

export function createGeneratedTextures(scene: Phaser.Scene): void {
  createCatTextures(scene);
  createWeaponTextures(scene);
  createPickupTextures(scene);
  createArenaTextures(scene);
}

function createCatTextures(scene: Phaser.Scene): void {
  for (const cat of CATS) {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.clear();
    graphics.fillStyle(cat.ear, 1);
    graphics.fillTriangle(9, 15, 16, 3, 21, 17);
    graphics.fillTriangle(31, 17, 37, 3, 46, 15);
    graphics.fillStyle(cat.body, 1);
    graphics.fillRoundedRect(10, 15, 34, 30, 12);
    graphics.fillEllipse(43, 34, 13, 17);
    graphics.fillStyle(cat.accent, 1);
    graphics.fillEllipse(27, 32, 15, 13);
    if (cat.id === "striped") {
      graphics.lineStyle(2, cat.accent, 1);
      graphics.lineBetween(18, 17, 15, 28);
      graphics.lineBetween(28, 15, 28, 26);
      graphics.lineBetween(38, 17, 41, 29);
    }
    graphics.fillCircle(23, 25, 3.2);
    graphics.fillCircle(34, 25, 3.2);
    graphics.fillStyle(0x111111, 1);
    graphics.fillCircle(23, 25, 1.4);
    graphics.fillCircle(34, 25, 1.4);
    graphics.fillStyle(cat.accent, 1);
    graphics.fillEllipse(28, 30, 5, 4);
    graphics.lineStyle(2, cat.accent, 1);
    graphics.beginPath();
    graphics.arc(12, 37, 11, Phaser.Math.DegToRad(74), Phaser.Math.DegToRad(222), true);
    graphics.strokePath();
    graphics.lineStyle(2, cat.body, 1);
    graphics.lineBetween(18, 44, 16, 50);
    graphics.lineBetween(36, 44, 38, 50);
    graphics.generateTexture(`cat-${cat.id}`, 52, 52);
    graphics.destroy();
  }
}

function createWeaponTextures(scene: Phaser.Scene): void {
  for (const weapon of Object.values(WEAPONS)) {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    if (weapon.id === "pistol") {
      graphics.fillStyle(0x58c7ff, 1);
      graphics.fillRoundedRect(5, 12, 26, 10, 4);
      graphics.fillStyle(0x2f80ed, 1);
      graphics.fillRoundedRect(20, 20, 9, 17, 3);
      graphics.fillStyle(0xffd166, 1);
      graphics.fillCircle(33, 16, 4);
    } else if (weapon.id === "fishbat") {
      graphics.fillStyle(0x78c6a3, 1);
      graphics.fillEllipse(23, 23, 34, 13);
      graphics.fillTriangle(7, 23, 0, 14, 0, 32);
      graphics.fillStyle(0xe8f7ef, 1);
      graphics.fillEllipse(28, 20, 8, 5);
      graphics.fillStyle(0x10231d, 1);
      graphics.fillCircle(36, 21, 2);
      graphics.lineStyle(3, 0x315f52, 1);
      graphics.lineBetween(13, 23, 38, 23);
    } else if (weapon.id === "sardine") {
      graphics.fillStyle(0xb8d8e8, 1);
      graphics.fillEllipse(22, 23, 30, 10);
      graphics.fillTriangle(6, 23, 0, 16, 0, 30);
      graphics.fillStyle(0x2a6f97, 1);
      graphics.fillCircle(34, 21, 2);
      graphics.lineStyle(2, 0xf8fafc, 1);
      graphics.lineBetween(13, 19, 27, 27);
    } else if (weapon.id === "spray") {
      graphics.fillStyle(0xffc857, 1);
      graphics.fillRoundedRect(13, 14, 18, 26, 5);
      graphics.fillStyle(0x2f80ed, 1);
      graphics.fillRect(16, 9, 12, 7);
      graphics.fillStyle(0x5de0e6, 1);
      graphics.fillCircle(34, 14, 3);
      graphics.lineStyle(2, 0x5de0e6, 0.8);
      graphics.lineBetween(35, 14, 43, 10);
      graphics.lineBetween(35, 17, 43, 20);
    } else if (weapon.id === "bell") {
      graphics.fillStyle(0xf4d35e, 1);
      graphics.fillCircle(23, 25, 13);
      graphics.fillStyle(0xd89c00, 1);
      graphics.fillRect(17, 12, 12, 6);
      graphics.fillStyle(0x302311, 1);
      graphics.fillCircle(23, 33, 3);
      graphics.lineStyle(2, 0xff7f50, 1);
      graphics.lineBetween(29, 13, 38, 5);
    } else if (weapon.id === "yarn") {
      graphics.lineStyle(4, 0xe76f9d, 1);
      graphics.strokeCircle(22, 22, 14);
      graphics.lineStyle(3, 0xffc2d6, 1);
      graphics.beginPath();
      graphics.moveTo(9, 22);
      graphics.lineTo(35, 16);
      graphics.moveTo(11, 28);
      graphics.lineTo(34, 31);
      graphics.strokePath();
    } else if (weapon.id === "bomb") {
      graphics.fillStyle(0x243b53, 1);
      graphics.fillCircle(22, 24, 14);
      graphics.fillStyle(0xf4d35e, 1);
      graphics.fillRect(20, 6, 5, 8);
      graphics.lineStyle(2, 0xff7f50, 1);
      graphics.lineBetween(24, 8, 33, 2);
    } else {
      graphics.lineStyle(4, 0xf7f7ff, 1);
      graphics.lineBetween(9, 28, 32, 12);
      graphics.lineBetween(16, 31, 38, 16);
      graphics.lineBetween(23, 34, 43, 22);
    }
    graphics.generateTexture(`weapon-${weapon.id}`, 46, 46);
    graphics.destroy();
  }
}

function createPickupTextures(scene: Phaser.Scene): void {
  const speed = scene.make.graphics({ x: 0, y: 0 }, false);
  speed.fillStyle(0x40f99b, 1);
  speed.fillRoundedRect(0, 0, 84, 14, 7);
  speed.fillStyle(0x0b1f24, 1);
  speed.fillTriangle(25, 2, 43, 7, 25, 12);
  speed.fillTriangle(43, 2, 61, 7, 43, 12);
  speed.generateTexture("booster-speed", 84, 14);
  speed.destroy();

  const jump = scene.make.graphics({ x: 0, y: 0 }, false);
  jump.fillStyle(0xffd166, 1);
  jump.fillRoundedRect(0, 0, 84, 14, 7);
  jump.fillStyle(0x1f2937, 1);
  jump.fillTriangle(42, 2, 55, 12, 29, 12);
  jump.generateTexture("booster-jump", 84, 14);
  jump.destroy();
}

function createArenaTextures(scene: Phaser.Scene): void {
  const platform = scene.make.graphics({ x: 0, y: 0 }, false);
  platform.fillStyle(0x2f394d, 1);
  platform.fillRoundedRect(0, 0, 160, 24, 6);
  platform.fillStyle(0x5de0e6, 0.4);
  platform.fillRect(8, 3, 144, 3);
  platform.generateTexture("platform", 160, 24);
  platform.destroy();

  const hazard = scene.make.graphics({ x: 0, y: 0 }, false);
  hazard.fillStyle(0xff4d6d, 1);
  for (let x = 0; x < 120; x += 18) {
    hazard.fillTriangle(x, 20, x + 9, 0, x + 18, 20);
  }
  hazard.generateTexture("hazard", 120, 20);
  hazard.destroy();

  const projectile = scene.make.graphics({ x: 0, y: 0 }, false);
  projectile.fillStyle(0x7bdff2, 1);
  projectile.fillCircle(8, 8, 8);
  projectile.generateTexture("projectile-water", 16, 16);
  projectile.destroy();
}
