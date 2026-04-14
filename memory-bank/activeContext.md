# Active Context — Basketball C4

## Current State (2026-04-14)

### What Was Just Built
- **Position-based odds**: Mouse X position within a cell affects probability distribution. Center = 50/15/15/5, edge = 30/30/14/4. Smooth interpolation via `calculateOdds(targetCol, cellOffset)`.
- **Full-column redistribution**: Can aim at full columns — their probability splits to nearest available neighbors on each side.
- **Probability bar chart**: Appears above the board on hover, shows real-time odds with color-coding (player color / orange / blue). Updates as mouse moves within a cell.
- **Graphics Option 2 (Rim Bounce)**: Default animation. Ball arcs up, hits the rim between holes, bounces with 85% speed, settles into correct column, drops in. Three phases: arc → bounce → drop.
- **Graphics Option 1 (Original Arc)**: Preserved. Direct/adjacent/wild animation styles based on distance from target.
- Press **G** key to toggle between animation modes.

### Architecture
| File | Purpose |
|------|---------|
| `server/index.js` | Express + Socket.io server, odds calculation, game state |
| `public/game.js` | Canvas game engine, animations, bar chart, input handling |
| `public/index.html` | HTML shell with lobby + game screen |
| `public/style.css` | Styling |

### Key Implementation Details
- Odds calculated on both server (authoritative) and client (display) — must stay in sync
- `getCenterOdds()` + `getEdgeOdds()` + interpolation via `calculateOdds(col, offset)`
- `redistributeFullColumns()` spreads full column probability to nearest available neighbors
- `roundOddsTo100()` ensures integer odds summing to exactly 100 (largest remainder method)
- Animation system: `ballAnim` object with phases, `graphicsMode` field determines behavior
- Server sends `cellOffset` with shoot event for position-based odds

### Deployment
- **Railway**: Project `0df5b857-bc8b-4b6d-979a-4671061a6745`, Service `d5125fc9-b3f4-4568-b6e3-9e6120594a7f`
- **URL**: https://basketballc4-production.up.railway.app
- **GitHub**: https://github.com/jk212h20/BasketballC4.git

### What's NOT Built Yet
- No single-player / AI mode
- No lobby system / room codes
- No sound effects
- No mobile-optimized layout
- No persistent scores / accounts
