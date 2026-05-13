import Phaser from "phaser";
import { CATS, WEAPONS } from "./config";

type HazardOrientation = "up" | "down" | "left" | "right";

const OUTLINE = 0x111827;

const PLATFORM_PALETTES: Record<string, { base: number; dark: number; top: number; detail: number }> = {
  rooftop: { base: 0x39445c, dark: 0x151d2e, top: 0x7bdff2, detail: 0xffd166 },
  greenhouse: { base: 0x286152, dark: 0x102d28, top: 0x8ef0b4, detail: 0xff7f50 },
  subway: { base: 0x343847, dark: 0x151823, top: 0xf6c453, detail: 0x5de0e6 },
  arcade: { base: 0x47335f, dark: 0x1e1430, top: 0xff5f7e, detail: 0x5de0e6 },
  bakery: { base: 0x65405a, dark: 0x2b1726, top: 0xffc857, detail: 0xff8fab },
  dojo: { base: 0x57415b, dark: 0x211727, top: 0xf8b195, detail: 0xffd166 },
  lab: { base: 0x285669, dark: 0x102833, top: 0x5de0e6, detail: 0xff4d6d },
  harbor: { base: 0x2f5966, dark: 0x102932, top: 0x78c6a3, detail: 0xf4d35e },
};

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

    graphics.fillStyle(OUTLINE, 1);
    graphics.fillRect(16, 6, 24, 24);
    graphics.fillRect(20, 28, 18, 24);
    graphics.fillRect(12, 25, 10, 10);
    graphics.fillRect(36, 25, 10, 10);
    graphics.fillRect(18, 50, 10, 6);
    graphics.fillRect(32, 50, 10, 6);
    graphics.fillRect(39, 34, 13, 7);

    graphics.fillStyle(cat.ear, 1);
    graphics.fillRect(17, 2, 8, 9);
    graphics.fillRect(33, 2, 8, 9);

    graphics.fillStyle(cat.body, 1);
    graphics.fillRect(18, 9, 20, 18);
    graphics.fillRect(22, 28, 14, 21);
    graphics.fillRect(14, 27, 7, 7);
    graphics.fillRect(37, 27, 7, 7);
    graphics.fillRect(20, 49, 8, 5);
    graphics.fillRect(32, 49, 8, 5);
    graphics.fillRect(40, 35, 10, 4);

    graphics.fillStyle(cat.accent, 1);
    graphics.fillRect(23, 24, 10, 6);
    graphics.fillRect(25, 34, 8, 12);
    if (cat.id === "striped") {
      graphics.fillRect(20, 11, 4, 12);
      graphics.fillRect(27, 9, 3, 10);
      graphics.fillRect(34, 11, 4, 12);
      graphics.fillRect(19, 35, 4, 10);
      graphics.fillRect(35, 35, 4, 10);
    }

    graphics.fillStyle(0xf8fafc, 1);
    graphics.fillRect(22, 16, 5, 5);
    graphics.fillRect(31, 16, 5, 5);
    graphics.fillStyle(0x050816, 1);
    graphics.fillRect(24, 17, 2, 3);
    graphics.fillRect(33, 17, 2, 3);
    graphics.fillRect(28, 23, 3, 2);
    graphics.fillRect(25, 27, 2, 2);
    graphics.fillRect(32, 27, 2, 2);

    graphics.generateTexture(`cat-${cat.id}`, 56, 60);
    graphics.destroy();

    const paw = scene.make.graphics({ x: 0, y: 0 }, false);
    paw.fillStyle(OUTLINE, 1);
    paw.fillRect(10, 15, 19, 14);
    paw.fillRect(5, 10, 8, 8);
    paw.fillRect(15, 6, 8, 8);
    paw.fillRect(25, 10, 8, 8);
    paw.fillStyle(cat.body, 1);
    paw.fillRect(12, 17, 15, 10);
    paw.fillRect(7, 12, 5, 5);
    paw.fillRect(17, 8, 5, 5);
    paw.fillRect(27, 12, 5, 5);
    paw.fillStyle(0xf8fafc, 1);
    paw.fillTriangle(31, 8, 42, 2, 35, 13);
    paw.fillTriangle(33, 17, 45, 15, 36, 24);
    paw.fillTriangle(30, 27, 40, 32, 34, 21);
    paw.generateTexture(`paw-${cat.id}`, 46, 34);
    paw.destroy();
  }
}

function createWeaponTextures(scene: Phaser.Scene): void {
  for (const weapon of Object.values(WEAPONS)) {
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(OUTLINE, 1);

    if (weapon.id === "pistol") {
      graphics.fillRect(6, 17, 32, 13);
      graphics.fillRect(19, 28, 11, 11);
      graphics.fillStyle(0x62d2ff, 1);
      graphics.fillRect(8, 15, 24, 10);
      graphics.fillStyle(0x2374d7, 1);
      graphics.fillRect(20, 26, 8, 11);
      graphics.fillStyle(0xffd166, 1);
      graphics.fillRect(32, 17, 9, 4);
      graphics.fillRect(11, 18, 6, 2);
    } else if (weapon.id === "fishbat") {
      graphics.fillRect(4, 18, 35, 12);
      graphics.fillRect(0, 20, 8, 8);
      graphics.fillStyle(0x78c6a3, 1);
      graphics.fillRect(7, 19, 27, 10);
      graphics.fillRect(2, 21, 8, 6);
      graphics.fillStyle(0xe8f7ef, 1);
      graphics.fillRect(24, 20, 7, 4);
      graphics.fillStyle(0x10231d, 1);
      graphics.fillRect(34, 21, 3, 3);
      graphics.fillStyle(0x315f52, 1);
      graphics.fillRect(11, 23, 22, 2);
    } else if (weapon.id === "sardine") {
      graphics.fillRect(4, 18, 31, 11);
      graphics.fillRect(0, 20, 8, 7);
      graphics.fillStyle(0xb8d8e8, 1);
      graphics.fillRect(7, 19, 24, 9);
      graphics.fillRect(2, 21, 8, 5);
      graphics.fillStyle(0x2a6f97, 1);
      graphics.fillRect(32, 20, 3, 3);
      graphics.fillStyle(0xf8fafc, 1);
      graphics.fillRect(14, 21, 13, 2);
    } else if (weapon.id === "spray") {
      graphics.fillRect(12, 11, 20, 29);
      graphics.fillRect(17, 7, 11, 6);
      graphics.fillStyle(0xffc857, 1);
      graphics.fillRect(14, 15, 16, 23);
      graphics.fillStyle(0x2f80ed, 1);
      graphics.fillRect(17, 8, 10, 5);
      graphics.fillStyle(0x5de0e6, 1);
      graphics.fillRect(33, 11, 4, 4);
      graphics.fillRect(38, 7, 6, 2);
      graphics.fillRect(38, 15, 7, 2);
      graphics.fillRect(37, 21, 5, 2);
    } else if (weapon.id === "bell") {
      graphics.fillRect(13, 15, 22, 22);
      graphics.fillRect(18, 10, 12, 7);
      graphics.fillStyle(0xf4d35e, 1);
      graphics.fillRect(15, 17, 18, 17);
      graphics.fillStyle(0xd89c00, 1);
      graphics.fillRect(19, 11, 10, 5);
      graphics.fillStyle(0x302311, 1);
      graphics.fillRect(22, 34, 5, 4);
      graphics.fillStyle(0xff7f50, 1);
      graphics.fillRect(30, 10, 9, 3);
      graphics.fillRect(37, 5, 3, 6);
    } else if (weapon.id === "yarn") {
      graphics.fillRect(10, 10, 27, 27);
      graphics.fillStyle(0xe76f9d, 1);
      graphics.fillRect(12, 12, 23, 23);
      graphics.fillStyle(0xffc2d6, 1);
      graphics.fillRect(13, 20, 21, 3);
      graphics.fillRect(16, 13, 3, 22);
      graphics.fillRect(24, 13, 3, 22);
      graphics.fillRect(12, 28, 22, 3);
    } else if (weapon.id === "bomb") {
      graphics.fillRect(11, 13, 26, 27);
      graphics.fillRect(20, 6, 7, 9);
      graphics.fillStyle(0x243b53, 1);
      graphics.fillRect(13, 15, 22, 22);
      graphics.fillStyle(0xf4d35e, 1);
      graphics.fillRect(21, 7, 5, 8);
      graphics.fillStyle(0xff7f50, 1);
      graphics.fillRect(27, 5, 9, 3);
      graphics.fillRect(35, 1, 3, 6);
    } else {
      graphics.fillStyle(0xf7f7ff, 1);
      graphics.fillRect(10, 25, 26, 4);
      graphics.fillRect(16, 19, 24, 4);
      graphics.fillRect(22, 31, 22, 4);
    }

    graphics.generateTexture(`weapon-${weapon.id}`, 46, 46);
    graphics.destroy();
  }
}

function createPickupTextures(scene: Phaser.Scene): void {
  const speed = scene.make.graphics({ x: 0, y: 0 }, false);
  speed.fillStyle(OUTLINE, 1);
  speed.fillRect(0, 0, 84, 14);
  speed.fillStyle(0x40f99b, 1);
  speed.fillRect(3, 3, 78, 8);
  speed.fillStyle(0x0b1f24, 1);
  speed.fillTriangle(25, 2, 43, 7, 25, 12);
  speed.fillTriangle(43, 2, 61, 7, 43, 12);
  speed.generateTexture("booster-speed", 84, 14);
  speed.destroy();

  const jump = scene.make.graphics({ x: 0, y: 0 }, false);
  jump.fillStyle(OUTLINE, 1);
  jump.fillRect(0, 0, 84, 14);
  jump.fillStyle(0xffd166, 1);
  jump.fillRect(3, 3, 78, 8);
  jump.fillStyle(0x1f2937, 1);
  jump.fillTriangle(42, 2, 55, 12, 29, 12);
  jump.generateTexture("booster-jump", 84, 14);
  jump.destroy();
}

function createArenaTextures(scene: Phaser.Scene): void {
  for (const [theme, palette] of Object.entries(PLATFORM_PALETTES)) {
    const platform = scene.make.graphics({ x: 0, y: 0 }, false);
    platform.fillStyle(palette.dark, 1);
    platform.fillRect(0, 0, 160, 24);
    platform.fillStyle(palette.base, 1);
    platform.fillRect(0, 3, 160, 18);
    platform.fillStyle(palette.top, 1);
    platform.fillRect(0, 0, 160, 4);
    platform.fillStyle(palette.detail, 0.85);
    for (let x = 8; x < 160; x += 28) {
      platform.fillRect(x, 8, 12, 3);
      platform.fillRect(x + 13, 15, 8, 3);
    }
    platform.generateTexture(`platform-${theme}`, 160, 24);
    platform.destroy();
  }

  createHazardTextures(scene);
  createProjectileTextures(scene);
}

function createHazardTextures(scene: Phaser.Scene): void {
  for (const orientation of ["up", "down", "left", "right"] as HazardOrientation[]) {
    createSpikeTexture(scene, orientation);
    createLaserTexture(scene, orientation);
    createSteamTexture(scene, orientation);
  }
}

function createSpikeTexture(scene: Phaser.Scene, orientation: HazardOrientation): void {
  const vertical = orientation === "left" || orientation === "right";
  const width = vertical ? 24 : 120;
  const height = vertical ? 120 : 24;
  const hazard = scene.make.graphics({ x: 0, y: 0 }, false);
  hazard.fillStyle(OUTLINE, 1);
  hazard.fillRect(0, 0, width, height);
  hazard.fillStyle(0xff4d6d, 1);

  if (orientation === "up") {
    for (let x = 2; x < width; x += 18) {
      hazard.fillTriangle(x, height - 2, x + 8, 2, x + 16, height - 2);
    }
  } else if (orientation === "down") {
    for (let x = 2; x < width; x += 18) {
      hazard.fillTriangle(x, 2, x + 8, height - 2, x + 16, 2);
    }
  } else if (orientation === "right") {
    for (let y = 2; y < height; y += 18) {
      hazard.fillTriangle(2, y, width - 2, y + 8, 2, y + 16);
    }
  } else {
    for (let y = 2; y < height; y += 18) {
      hazard.fillTriangle(width - 2, y, 2, y + 8, width - 2, y + 16);
    }
  }

  hazard.generateTexture(`hazard-spikes-${orientation}`, width, height);
  hazard.destroy();
}

function createLaserTexture(scene: Phaser.Scene, orientation: HazardOrientation): void {
  const vertical = orientation === "left" || orientation === "right";
  const width = vertical ? 18 : 120;
  const height = vertical ? 120 : 18;
  const hazard = scene.make.graphics({ x: 0, y: 0 }, false);
  hazard.fillStyle(OUTLINE, 1);
  hazard.fillRect(0, 0, width, height);
  hazard.fillStyle(0x641827, 1);
  hazard.fillRect(vertical ? 4 : 0, vertical ? 0 : 4, vertical ? 10 : width, vertical ? height : 10);
  hazard.fillStyle(0xff4d6d, 1);
  hazard.fillRect(vertical ? 7 : 0, vertical ? 0 : 7, vertical ? 4 : width, vertical ? height : 4);
  hazard.fillStyle(0xffd166, 1);
  for (let offset = 8; offset < (vertical ? height : width); offset += 32) {
    hazard.fillRect(vertical ? 2 : offset, vertical ? offset : 2, vertical ? 14 : 10, vertical ? 10 : 14);
  }
  hazard.generateTexture(`hazard-laser-${orientation}`, width, height);
  hazard.destroy();
}

function createSteamTexture(scene: Phaser.Scene, orientation: HazardOrientation): void {
  const vertical = orientation === "left" || orientation === "right";
  const width = vertical ? 18 : 120;
  const height = vertical ? 120 : 18;
  const hazard = scene.make.graphics({ x: 0, y: 0 }, false);
  hazard.fillStyle(OUTLINE, 1);
  hazard.fillRect(0, 0, width, height);
  hazard.fillStyle(0x6ee7f9, 1);

  for (let offset = 2; offset < (vertical ? height : width); offset += 18) {
    if (vertical) {
      const x = orientation === "right" ? 8 : 2;
      hazard.fillRect(x, offset, 8, 10);
      hazard.fillRect(x + (orientation === "right" ? 5 : -1), offset + 5, 5, 13);
    } else {
      const y = orientation === "down" ? 8 : 2;
      hazard.fillRect(offset, y, 10, 8);
      hazard.fillRect(offset + 5, y + (orientation === "down" ? 5 : -1), 13, 5);
    }
  }

  hazard.generateTexture(`hazard-steam-${orientation}`, width, height);
  hazard.destroy();
}

function createProjectileTextures(scene: Phaser.Scene): void {
  const projectile = scene.make.graphics({ x: 0, y: 0 }, false);
  projectile.fillStyle(OUTLINE, 1);
  projectile.fillRect(2, 2, 12, 12);
  projectile.fillStyle(0x7bdff2, 1);
  projectile.fillRect(4, 4, 8, 8);
  projectile.generateTexture("projectile-water", 16, 16);
  projectile.destroy();
}
