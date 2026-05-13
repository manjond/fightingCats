# Fighting Cats

Prototype web game for embedding in `coopverse.io`: fast 2D platform fighting with generated cat sprites, arena maps, weapons, pickups and mobile controls.

## Current Vertical Slice

- Vite + TypeScript + Phaser 3.
- Lobby with quick play, room code join and public/private room creation.
- Standard mode: 5-map match.
- Custom mode: map selection, round count and starting weapon.
- 8 maps, each with 8 separated player spawns.
- Weapons: scratch, water pistol, yarn ball and bomb can.
- Hazards, speed boosters, jump pads and weapon spawns.
- Up to 8 players. The current browser-only prototype fills empty slots with bots so combat can be tested immediately.
- Touch controls are enabled automatically on coarse pointer devices.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Architecture

The game is intentionally split so we can replace the prototype networking layer later without rewriting the combat loop:

- `src/main.ts`: UI shell, lobby, room settings, mobile buttons and game mount/unmount.
- `src/game/config.ts`: maps, cats, weapons and global tuning.
- `src/game/rooms.ts`: room creation/join/quick-play adapter. Today it uses `localStorage`; the next backend adapter should keep the same room snapshot shape.
- `src/game/GameScene.ts`: Phaser scene, physics, combat, bots, scoring and round flow.
- `src/game/sprites.ts`: generated bitmap textures for cats, weapons, pickups and arena pieces.
- `src/game/types.ts`: shared contracts between UI, room adapter and game scene.

## Multiplayer Direction

Vercel serverless functions are not a good fit for authoritative real-time WebSockets by themselves. Best next step is one of:

- Ably or PartyKit for room messaging and low-latency presence.
- Supabase for auth/profile/persistence plus a realtime adapter if latency feels acceptable.
- Dedicated Node/WebSocket service if we want authoritative anti-cheat later.

The likely path: keep Phaser client prediction simple, use a room service for presence/input replication, and make the host authoritative for early alpha. If the game grows competitive, move to a dedicated authoritative service.

## Vercel Deployment

The repository includes `vercel.json`, so Vercel should detect the exact build settings:

- Framework preset: `Vite`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Node: `>=20.19.0`

Dashboard steps:

1. Open Vercel dashboard.
2. Select **Add New > Project**.
3. Import `manjond/fightingCats`.
4. Keep the root directory as `./`.
5. Confirm the settings above if Vercel asks.
6. Deploy.
7. After deploy, copy the production URL.
8. Use the production URL as the iframe/embed target in Coopverse.

For embedding, the clean target is to host this as a standalone Vercel app and place it inside Coopverse with an iframe or route-level integration, depending on the Coopverse stack.
