# Next Steps

## Technical

- Replace `localStorage` rooms with a real room adapter.
- Add deterministic seed per match so maps, spawns and weapon timers are reproducible across clients.
- Add a lightweight state sync model: player input, position snapshots, health, weapon pickups and round state.
- Add asset/code splitting if the embedded load budget becomes strict.
- Add Playwright smoke tests once the UI flow stabilizes.

## Game Design

- Tune weapon cooldowns and knockback after playtests.
- Add shield/parry as a defensive option so close combat has more mind games.
- Add throwable fish as a short stun utility.
- Add a sudden-death overtime hazard after 90 seconds to prevent stalled rounds.
- Add cat-specific cosmetic trails without gameplay advantage.

## Product

- Decide whether rooms need login or anonymous guest names.
- Decide whether private room codes should expire after inactivity.
- Define how Coopverse passes user identity into the embedded game.
