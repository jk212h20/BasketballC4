# Basketball Connect 4 - Progress

## What Works
- [x] Project scaffolding (package.json, Express + Socket.io server)
- [x] Socket.io multiplayer (lobby matchmaking, room creation, turn management)
- [x] Canvas rendering (board, pieces, basketball, bumpers, aiming UI)
- [x] Physics engine (gravity, bumper collisions, wall bounces, column dividers, settle detection)
- [x] Variance system (50% accurate, 50% wild via Gaussian perturbation)
- [x] Game logic (Connect 4 win detection H/V/diagonal, draw detection, turn alternation)
- [x] Arcade graphics (particle effects, ball trail, bumper flash, piece glow, win pulse animation)
- [x] Touch support for mobile
- [x] Deployment (Dockerfile, Railway, GitHub repo)
- [x] Railway domain: https://basketballc4-production.up.railway.app

## What's Left (Prioritized)
- [ ] Connect GitHub repo to Railway for auto-deploy on push (manual step in Railway dashboard)
- [ ] Test multiplayer with 2 browser tabs/windows
- [ ] Mobile responsive adjustments (canvas sizing)
- [ ] Sound effects (bounce, score, win) — if user wants them
- [ ] Spectator mode / share link
- [ ] Rematch without going back to lobby

## Known Issues
- Ball physics could sometimes bounce for a very long time before settling (safety timeout handles this)
- Column full bounce-back is simplistic — ball may bounce to another column that's also full

## API/Routes Summary
| Route | Purpose |
|-------|---------|
| `GET /` | Serves index.html (lobby + game) |
| Socket `join-game` | Enter matchmaking queue |
| Socket `shoot` | Report final column after physics |
| Socket `play-again` | Reset board for new game |