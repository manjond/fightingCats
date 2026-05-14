# Fighting Cats

Web game for embedding in `coopverse.io`: fast 2D platform fighting with generated cat sprites, arena maps, weapons, pickups, mobile controls and realtime rooms.

## Current Vertical Slice

- Vite + TypeScript + PixiJS.
- Lobby with quick play, room code join and public/private room creation.
- Standard mode: 5-map match.
- Custom mode: map selection, round count and starting weapon.
- 8 maps, each with 8 separated player spawns.
- Weapons: scratch, fish bat, food bag, water pistol, sardine, spray, yarn ball, bomb can, explosive kibble and bell bomb.
- Hazards, speed boosters, jump pads and weapon spawns.
- Up to 8 players. Empty slots are filled with bots so combat can be tested immediately.
- Touch controls are enabled automatically on coarse pointer devices.
- Optional PartyKit realtime mode runs live combat through an authoritative WebSocket room.

## Commands

```bash
npm install
npm run dev
npm run dev:realtime
npm run build
npm run preview
npm run deploy:realtime
```

## Architecture

The game is intentionally split so we can replace the prototype networking layer later without rewriting the combat loop:

- `src/main.ts`: UI shell, lobby, room settings, mobile buttons and game mount/unmount.
- `src/game/config.ts`: maps, cats, weapons and global tuning.
- `src/game/rooms.ts`: room creation/join/quick-play adapter using `/api/rooms` and Upstash Redis in production.
- `src/game/PixiArena.ts`: Pixi renderer, local fallback simulation, combat visuals, bots, scoring and round flow.
- `src/game/realtimeClient.ts`: browser WebSocket adapter for PartyKit.
- `party/arena.ts`: authoritative realtime room server for live movement, combat, pickups and snapshots.
- `src/game/types.ts`: shared contracts between UI, room adapter and game scene.

## Multiplayer

Room creation/join now uses `/api/rooms` with Upstash Redis when deployed. Without Redis env vars, the client falls back to local browser rooms for development only.

Required Vercel env vars, usually created automatically by the Upstash Redis Marketplace integration. The API accepts either naming style:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Live combat uses PartyKit when `VITE_PARTYKIT_HOST` is set in Vercel. Vercel keeps hosting the web app and Redis-backed lobby; PartyKit hosts the WebSocket gameplay rooms.

Why PartyKit:

- Vercel Functions do not work as persistent WebSocket game servers.
- Ably and Supabase Realtime are excellent pub/sub tools, but the game would still need client-authoritative simulation or a separate authoritative worker.
- Colyseus is a strong game-server framework, but it needs a Node server host such as Railway/Fly/Render/Colyseus Cloud.
- PartyKit maps cleanly to this game: one room code becomes one stateful WebSocket room, with server-side simulation and snapshots.

Realtime setup:

1. Log in to PartyKit locally: `npx partykit login`.
2. Deploy the realtime server: `npm run deploy:realtime`.
3. Copy the deployed host, usually like `fighting-cats-realtime.<your-user>.partykit.dev`.
4. In Vercel, add env var `VITE_PARTYKIT_HOST` with that host, without `https://` or `wss://`.
5. Redeploy the Vercel app.

Local realtime testing:

1. Terminal A: `npm run dev:realtime`.
2. Terminal B: `npm run dev`.
3. In `.env.local`, set `VITE_PARTYKIT_HOST=localhost:1999`.
4. Open two browser windows, join the same room, and press play.

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
