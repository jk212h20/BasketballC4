# Basketball Connect 4 - Active Context

## Current State
Fully functional 2-player online basketball connect 4 game. Deployed to Railway.

## Recent Changes (2026-04-14)
- **Major gameplay overhaul:** Replaced slingshot aiming + bumper physics with column selection + odds-based system
  - Players now click a column to select their target (no more drag-to-aim)
  - Server rolls odds to determine actual landing column
  - Ball animates with smooth arcs — always goes to top of canvas before falling
  - Three animation types: direct (clean arc), adjacent (drift at top), wild (wobble + wide drift)
- Removed: bumpers, physics simulation, slingshot drag, Gaussian perturbation, wall bounces
- Added: column selector UI, server-side odds calculation, arc animations, auto-join support

## Previous (2026-04-13)
- Built entire game from scratch: server + client
- Created GitHub repo: https://github.com/jk212h20/BasketballC4
- Deployed to Railway: https://basketballc4-production.up.railway.app
- Railway project ID: `0df5b857-bc8b-4b6d-979a-4671061a6745`
- Railway service ID: `d5125fc9-b3f4-4568-b6e3-9e6120594a7f`

## Architecture
- `server/index.js` — Express + Socket.io, room-based matchmaking, game state, win detection, **odds calculation**
- `public/game.js` — Canvas rendering, column selection UI, arc animations, particle effects
- `public/index.html` — Lobby + game screen
- `public/style.css` — Arcade neon styling

## Key Design Decisions
- **Server-authoritative odds:** Client sends `targetColumn`, server rolls actual landing column and broadcasts result
- **Odds system:**
  - Non-edge: 50% target, 15% each adjacent, 5% each remaining → `[5, 15, 50, 15, 5, 5, 5]`
  - Edge (col 0 or 6): 50% target, 30% adjacent, 4% each remaining → `[50, 30, 4, 4, 4, 4, 4]`
  - Full columns excluded, odds redistributed proportionally
- **Animation types:** direct (distance 0), adjacent (distance 1), wild (distance 2+) — each has distinct arc path
- No database needed — all game state in-memory via Socket.io rooms

## Port
- Local: 3000 (default)
- Production: Railway-assigned PORT env var
