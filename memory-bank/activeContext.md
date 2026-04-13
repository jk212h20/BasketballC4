# Basketball Connect 4 - Active Context

## Current State
Fully functional 2-player online basketball connect 4 game. First deploy pushed to Railway.

## Recent Changes (2026-04-13)
- Built entire game from scratch: server + client
- Created GitHub repo: https://github.com/jk212h20/BasketballC4
- Deployed to Railway: https://basketballc4-production.up.railway.app
- Railway project ID: `0df5b857-bc8b-4b6d-979a-4671061a6745`
- Railway service ID: `d5125fc9-b3f4-4568-b6e3-9e6120594a7f`

## Architecture
- `server/index.js` — Express + Socket.io, room-based matchmaking, game state, win detection
- `public/game.js` — Canvas rendering, physics engine, input handling, particles
- `public/index.html` — Lobby + game screen
- `public/style.css` — Arcade neon styling

## Key Design Decisions
- Client-authoritative physics: each client simulates ball physics locally, then reports final column to server
- No database needed — all game state in-memory via Socket.io rooms
- ~50% variance on shots via Gaussian perturbation (small offset = accurate, large = wild)
- Slingshot-style aiming (drag opposite direction)

## TODO: GitHub Auto-Deploy
- Need to connect GitHub repo to Railway service for auto-deploy on push
- Do this in Railway dashboard: Project > Service > Settings > Connect GitHub Repo

## Port
- Local: 3000 (default)
- Production: Railway-assigned PORT env var