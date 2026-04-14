# Active Context — Basketball Connect 4

## Current State (2026-04-14)
Game is functional with lobby, turn-based mode, and simultaneous mode. Server running on port 3000.

## Architecture
```
public/
  index.html      — Lobby (mode select) + game screen + canvas
  style.css       — Styling for lobby, header, game message
  odds.js         — Odds calculation (center, edge, focused, redistribute)
  draw.js         — All canvas rendering (board, pieces, ball, charts, cooldown UI)
  game.js         — Main logic: socket events, input, animation, game loop
server/
  index.js        — Express + Socket.io server, game rooms, shot resolution
```

## Key Design Decisions
- **Two game modes**: Turn-based (classic) and Simultaneous (real-time with cooldowns)
- **Client split into 3 files**: odds.js → draw.js → game.js (loaded in order, share globals)
- **Odds system**: Target col 50%, adjacent 15% each, remaining 5% each. Edge columns: target 50%, single neighbor 30%, rest 4%
- **Simultaneous mode**: 1s cooldown between shots, focus timer (0-5s) adjusts accuracy (uniform → standard → guaranteed)
- **Graphics modes**: Press G to toggle — mode 1 (arc) and mode 2 (rim bounce)
- **Multiple ball animations**: `ballAnims[]` array supports concurrent shots in simultaneous mode

## What's NOT Built
- Deploy to Railway (no Dockerfile configured for production yet)
- AI opponent / single player
- Sound effects
- Mobile responsiveness improvements

## Recent Changes
- 2026-04-14: Split monolithic game.js into odds.js + draw.js + game.js
- 2026-04-14: Added simultaneous mode with cooldowns, focus timer, opponent aim display
- 2026-04-14: Server updated with mode selection, per-player cooldowns, focus-based odds
- 2026-04-14: Lobby now has two mode buttons (turn-based / simultaneous)
