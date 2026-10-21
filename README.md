# MarLivo 🎃🏸

A cosy, private, online multiplayer card game for friends, based on our house rules of *Screw*: memory,
matching (also with combinations that add up), J/Q/10 powers and penalty cards. English and French.

**Play:** https://heisenberg0066.github.io/marlivo/ (installable as an app: Share → *Add to Home Screen* on iPhone)

- **Practice vs 1–3 bots** works now, fully offline on your device.
- **Online rooms** need the free Cloudflare server: see [SETUP-CLOUDFLARE.md](SETUP-CLOUDFLARE.md).
- Rules: in the app, *How to play*.

## What's inside
| Path | What |
|---|---|
| `packages/engine` | Pure, deterministic rules engine (reducer + per-player view projection). No timers anywhere. |
| `packages/bots` | Rule-based bots (easy / normal / hard) that only see their own seat's view. |
| `packages/room` | Transport-agnostic room host: join/reconnect with seat tokens, password, rate limits, bots, chat, test ops. Shared by the server and the offline practice mode. |
| `apps/server` | Cloudflare Worker + one Durable Object per room (WebSocket hibernation, SQLite storage). |
| `apps/client` | Vite + React PWA. The back-room 2D table renderer (`src/render`) is separate from game logic so 3D characters can replace it later. |
| `scripts` | Server integration test, soak test, headless browser end-to-end test, icon renderer. |

## Develop
```bash
pnpm install
pnpm test            # engine rules + leak tests + property test
pnpm typecheck
pnpm dev             # client on http://localhost:5173/marlivo/
pnpm soak 10000      # 10k bot-vs-bot matches with invariant checks
# server (Node 22+): cp apps/server/.dev.vars.example apps/server/.dev.vars && pnpm server:dev
pnpm test:server     # multi-client WebSocket test against the local Worker
node scripts/e2e-solo.mjs phone en   # plays a full solo match through the UI (needs `vite preview`)
```
Test room tools (reveal all, presets, forced deck/dice, step mode, inspector, latency, drop, autoplay ×100,
replay export) are available in local practice via *Test room* and online only with the owner key.

## Screenshots

A few picks are in [`docs/screenshots/selected/`](docs/screenshots/selected/) (phone 390×844 and laptop 1366×768, English and French). The full set of PNGs is made by `node scripts/e2e-solo.mjs <phone|laptop> <en|fr>`. It is kept out of git because of its size.
