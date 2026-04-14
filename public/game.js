// Basketball Connect 4 - Client Game Engine
const socket = io();

// DOM elements
const lobby = document.getElementById('lobby');
const gameScreen = document.getElementById('game-screen');
const joinBtn = document.getElementById('join-btn');
const lobbyStatus = document.getElementById('lobby-status');
const turnDisplay = document.getElementById('turn-display');
const player1Info = document.getElementById('player1-info');
const player2Info = document.getElementById('player2-info');
const gameMessage = document.getElementById('game-message');
const messageText = document.getElementById('message-text');
const playAgainBtn = document.getElementById('play-again-btn');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const ROWS = 6;
const COLS = 7;
const CELL_SIZE = 80;
const PIECE_RADIUS = 32;
const BALL_RADIUS = 18;

// Layout
const BOARD_X = 50;
const BOARD_Y = 280;
const BOARD_WIDTH = COLS * CELL_SIZE;
const BOARD_HEIGHT = ROWS * CELL_SIZE;
const CANVAS_WIDTH = BOARD_WIDTH + 100;
const CANVAS_HEIGHT = BOARD_Y + BOARD_HEIGHT + 40;

// Column selector area
const SELECTOR_Y = BOARD_Y - 50;
const SELECTOR_HEIGHT = 40;

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Player colors
const P1_COLOR = '#ff4444';
const P1_GLOW = 'rgba(255, 68, 68, 0.6)';
const P2_COLOR = '#44aaff';
const P2_GLOW = 'rgba(68, 170, 255, 0.6)';
const BALL_COLOR = '#ff8c00';

// Graphics mode: 1 = original arc, 2 = rim bounce
let graphicsMode = 2; // Default to rim bounce

// Game state
let playerNumber = 0;
let board = [];
let currentPlayer = 1;
let gameStatus = 'waiting';
let isMyTurn = false;
let canShoot = false;

// Column selection state
let hoveredCol = -1;
let hoveredCellOffset = 0.5; // 0.0=left edge, 0.5=center, 1.0=right edge
let selectedCol = -1;

// Ball animation state
let ballAnim = null; // { phase, progress, startX, startY, peakX, peakY, endX, endY, ... }
let ballTrail = [];

// Particles
let particles = [];

// Win animation
let winCells = null;
let winPulse = 0;

// Shooting position (bottom center)
const SHOOT_X = CANVAS_WIDTH / 2;
const SHOOT_Y = CANVAS_HEIGHT - 30;

// Animation peak (top of canvas)
const PEAK_Y = 35;

// Probability bar chart layout
const CHART_Y = 60;       // Top of chart area
const CHART_HEIGHT = 120;  // Max bar height
const BAR_WIDTH = 50;      // Width of each bar
const BAR_GAP = (CELL_SIZE - BAR_WIDTH) / 2; // Center bars in columns

// Client-side odds calculation (mirrors server for display)
function getCenterOdds(targetCol) {
  const odds = new Array(COLS).fill(0);
  const isEdge = (targetCol === 0 || targetCol === COLS - 1);
  if (isEdge) {
    odds[targetCol] = 50;
    if (targetCol === 0) { odds[1] = 30; for (let c = 2; c < COLS; c++) odds[c] = 4; }
    else { odds[COLS - 2] = 30; for (let c = 0; c < COLS - 2; c++) odds[c] = 4; }
  } else {
    odds[targetCol] = 50; odds[targetCol - 1] = 15; odds[targetCol + 1] = 15;
    for (let c = 0; c < COLS; c++) { if (odds[c] === 0) odds[c] = 5; }
  }
  return odds;
}

function getEdgeOdds(targetCol, side) {
  const odds = new Array(COLS).fill(0);
  const neighborCol = side === 'left' ? targetCol - 1 : targetCol + 1;
  if (neighborCol < 0 || neighborCol >= COLS) return getCenterOdds(targetCol);
  odds[targetCol] = 30; odds[neighborCol] = 30;
  const adj1 = side === 'left' ? targetCol + 1 : targetCol - 1;
  const adj2 = side === 'left' ? neighborCol - 1 : neighborCol + 1;
  if (adj1 >= 0 && adj1 < COLS) odds[adj1] = 14;
  if (adj2 >= 0 && adj2 < COLS && odds[adj2] === 0) odds[adj2] = 14;
  let assigned = 0, unassignedCount = 0;
  for (let c = 0; c < COLS; c++) { assigned += odds[c]; if (odds[c] === 0) unassignedCount++; }
  const remaining = 100 - assigned;
  if (unassignedCount > 0) {
    const each = Math.floor(remaining / unassignedCount);
    let leftover = remaining - each * unassignedCount;
    for (let c = 0; c < COLS; c++) {
      if (odds[c] === 0) { odds[c] = each + (leftover > 0 ? 1 : 0); if (leftover > 0) leftover--; }
    }
  }
  return odds;
}

function roundOddsTo100(raw) {
  const floored = raw.map(v => Math.floor(v));
  let sum = floored.reduce((a, b) => a + b, 0);
  const remainders = raw.map((v, i) => ({ i, r: v - floored[i] }));
  remainders.sort((a, b) => b.r - a.r);
  let deficit = 100 - sum;
  for (let k = 0; k < deficit; k++) floored[remainders[k].i]++;
  return floored;
}

function calculateOdds(targetCol, cellOffset) {
  cellOffset = Math.max(0, Math.min(1, cellOffset || 0.5));
  const center = getCenterOdds(targetCol);
  let edgeness, side;
  if (cellOffset <= 0.5) { edgeness = (0.5 - cellOffset) / 0.5; side = 'left'; }
  else { edgeness = (cellOffset - 0.5) / 0.5; side = 'right'; }
  if (edgeness < 0.01) return center;
  const edge = getEdgeOdds(targetCol, side);
  const raw = new Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) raw[c] = center[c] * (1 - edgeness) + edge[c] * edgeness;
  return roundOddsTo100(raw);
}

function redistributeFullColumns(odds) {
  const available = new Array(COLS).fill(true);
  for (let c = 0; c < COLS; c++) {
    let full = true;
    for (let r = 0; r < ROWS; r++) { if (board[r] && board[r][c] === 0) { full = false; break; } }
    available[c] = !full;
  }
  if (available.every(a => a)) return odds;
  const result = odds.slice();
  for (let c = 0; c < COLS; c++) {
    if (available[c] || result[c] === 0) continue;
    const prob = result[c]; result[c] = 0;
    let leftCol = -1, rightCol = -1;
    for (let l = c - 1; l >= 0; l--) { if (available[l]) { leftCol = l; break; } }
    for (let r = c + 1; r < COLS; r++) { if (available[r]) { rightCol = r; break; } }
    if (leftCol >= 0 && rightCol >= 0) { const h = Math.floor(prob/2); result[leftCol] += h; result[rightCol] += prob - h; }
    else if (leftCol >= 0) result[leftCol] += prob;
    else if (rightCol >= 0) result[rightCol] += prob;
  }
  return result;
}

// Particle system
function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * speed + speed * 0.3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1.0,
      decay: 0.015 + Math.random() * 0.025,
      color,
      size: 2 + Math.random() * 4
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Socket events
socket.on('waiting', () => {
  lobbyStatus.textContent = 'Waiting for opponent...';
  joinBtn.disabled = true;
  joinBtn.style.opacity = 0.5;
});

socket.on('game-start', (data) => {
  playerNumber = data.playerNumber;
  lobby.style.display = 'none';
  gameScreen.style.display = 'flex';
  gameMessage.style.display = 'none';
  canShoot = false;
  ballAnim = null;
  winCells = null;
});

socket.on('game-state', (data) => {
  board = data.board;
  currentPlayer = data.currentPlayer;
  gameStatus = data.status;
  isMyTurn = (currentPlayer === playerNumber);
  canShoot = isMyTurn && gameStatus === 'playing';
  ballAnim = null;
  updateTurnDisplay();
});

socket.on('shot-result', (data) => {
  const { targetColumn, actualColumn, row, player } = data;

  // Don't update board yet — we'll update after animation
  const pendingBoard = data.board;
  const pendingCurrentPlayer = data.currentPlayer;
  const pendingStatus = data.status;
  const pendingWinner = data.winner;
  const pendingWinCells = data.winningCells;

  // Determine animation type based on distance from target
  const distance = Math.abs(actualColumn - targetColumn);
  let animType = 'direct'; // 50% — hit target
  if (distance === 1) animType = 'adjacent'; // 15% — one off
  else if (distance >= 2) animType = 'wild'; // 5% — far off

  // Calculate animation waypoints
  const startX = SHOOT_X;
  const startY = SHOOT_Y;
  const endX = BOARD_X + actualColumn * CELL_SIZE + CELL_SIZE / 2;
  const targetX = BOARD_X + targetColumn * CELL_SIZE + CELL_SIZE / 2;

  // Ball always arcs to the top of the canvas first
  const peakY = PEAK_Y;

  // For direct shots, peak is right above the target column
  // For adjacent, peak is above target then drifts
  // For wild, peak arcs wider with a wobble
  let peakX;
  if (animType === 'direct') {
    peakX = endX;
  } else if (animType === 'adjacent') {
    // Peak above target, then drift to actual
    peakX = targetX;
  } else {
    // Wild: peak is between start and target, then swings wide
    peakX = (startX + targetX) / 2;
  }

  // Start the animation
  canShoot = false;

  if (graphicsMode === 2) {
    // --- Graphics Option 2: Rim Bounce ---
    // Ball arcs to just above the board, slightly off-center.
    // It hits the rim (area between holes), bounces, then settles into the correct column.
    
    // The "rim" is the edge between the actualColumn and an adjacent column
    // Pick a rim position: the edge of the actual column closest to where the ball came from
    const actualCenterX = BOARD_X + actualColumn * CELL_SIZE + CELL_SIZE / 2;
    const rimSide = (startX < actualCenterX) ? -1 : 1; // which side the ball approaches from
    // Rim X is the edge between actualColumn and actualColumn+rimSide (or board edge)
    let rimX;
    if (rimSide === -1) {
      rimX = BOARD_X + actualColumn * CELL_SIZE + PIECE_RADIUS * 0.3; // just inside left rim
    } else {
      rimX = BOARD_X + (actualColumn + 1) * CELL_SIZE - PIECE_RADIUS * 0.3; // just inside right rim
    }
    const rimY = BOARD_Y + CELL_SIZE / 2 - PIECE_RADIUS - BALL_RADIUS; // just above the first row hole

    // Arc aims slightly off — toward the rim, not dead center
    const approachX = rimX + rimSide * 5; // slightly beyond the rim
    
    ballAnim = {
      phase: 'arc', // 'arc' -> 'bounce' -> 'drop'
      graphicsMode: 2,
      animType,
      progress: 0,
      startX, startY,
      // Arc aims at a point above the rim
      peakX: (startX + approachX) / 2,
      peakY: PEAK_Y,
      // Pre-bounce target: the rim
      rimX, rimY,
      approachX,
      // Post-bounce target: center of actual column, just above board
      endX: actualCenterX,
      bounceEndY: BOARD_Y - BALL_RADIUS * 1.5,
      dropStartY: BOARD_Y - BALL_RADIUS,
      dropEndY: BOARD_Y + row * CELL_SIZE + CELL_SIZE / 2,
      rimSide,
      targetColumn,
      actualColumn,
      row,
      player,
      rotation: 0,
      bounceSpeed: 0.85, // slightly reduced speed after bounce
      pendingBoard,
      pendingCurrentPlayer,
      pendingStatus,
      pendingWinner,
      pendingWinCells
    };
  } else {
    // --- Graphics Option 1: Original arc ---
    ballAnim = {
      phase: 'arc', // 'arc' -> 'drop'
      graphicsMode: 1,
      animType,
      progress: 0,
      startX, startY,
      peakX, peakY,
      endX,
      dropStartY: BOARD_Y - BALL_RADIUS,
      dropEndY: BOARD_Y + row * CELL_SIZE + CELL_SIZE / 2,
      targetColumn,
      actualColumn,
      row,
      player,
      rotation: 0,
      pendingBoard,
      pendingCurrentPlayer,
      pendingStatus,
      pendingWinner,
      pendingWinCells
    };
  }
  ballTrail = [];
});

socket.on('opponent-disconnected', () => {
  messageText.textContent = 'OPPONENT LEFT';
  gameMessage.style.display = 'block';
  playAgainBtn.style.display = 'none';
  canShoot = false;
  gameStatus = 'disconnected';
});

function updateTurnDisplay() {
  if (gameStatus !== 'playing') {
    turnDisplay.textContent = gameStatus === 'won' ? 'GAME OVER' : gameStatus.toUpperCase();
    player1Info.classList.remove('active');
    player2Info.classList.remove('active');
    return;
  }
  if (isMyTurn) {
    turnDisplay.textContent = 'YOUR TURN — SELECT A COLUMN';
    turnDisplay.style.color = playerNumber === 1 ? P1_COLOR : P2_COLOR;
  } else {
    turnDisplay.textContent = 'OPPONENT\'S TURN';
    turnDisplay.style.color = '#888';
  }
  player1Info.classList.toggle('active', currentPlayer === 1);
  player2Info.classList.toggle('active', currentPlayer === 2);
}

// Input handling — column selection
function getColFromX(canvasX) {
  const relX = canvasX - BOARD_X;
  if (relX < 0 || relX >= BOARD_WIDTH) return -1;
  return Math.floor(relX / CELL_SIZE);
}

canvas.addEventListener('mousemove', (e) => {
  if (!canShoot || ballAnim) { hoveredCol = -1; return; }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  // Accept hover over chart, board or selector area
  if (y >= CHART_Y - 10 && y <= BOARD_Y + BOARD_HEIGHT) {
    hoveredCol = getColFromX(x);
    // Track position within the cell (0.0=left edge, 0.5=center, 1.0=right edge)
    if (hoveredCol >= 0) {
      const cellLeft = BOARD_X + hoveredCol * CELL_SIZE;
      hoveredCellOffset = (x - cellLeft) / CELL_SIZE;
      hoveredCellOffset = Math.max(0, Math.min(1, hoveredCellOffset));
    }
  } else {
    hoveredCol = -1;
  }
});

canvas.addEventListener('mouseleave', () => {
  hoveredCol = -1;
});

canvas.addEventListener('click', (e) => {
  if (!canShoot || ballAnim) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  const col = getColFromX(x);
  if (col === -1) return;

  // Calculate cell offset for position-based odds
  const cellLeft = BOARD_X + col * CELL_SIZE;
  const offset = Math.max(0, Math.min(1, (x - cellLeft) / CELL_SIZE));

  // Allow clicking any column — full columns get redistributed by server
  selectedCol = col;
  canShoot = false;
  socket.emit('shoot', { targetColumn: col, cellOffset: offset });
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
  const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
  
  const col = getColFromX(x);
  if (col !== -1) {
    hoveredCol = col;
    const cellLeft = BOARD_X + col * CELL_SIZE;
    hoveredCellOffset = Math.max(0, Math.min(1, (x - cellLeft) / CELL_SIZE));
  }
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!canShoot || ballAnim || hoveredCol === -1) return;
  
  const col = hoveredCol;
  // Allow clicking any column — full columns get redistributed by server
  selectedCol = col;
  canShoot = false;
  socket.emit('shoot', { targetColumn: col, cellOffset: hoveredCellOffset });
  hoveredCol = -1;
});

// Finalize animation — apply pending game state
function finalizeAnimation(anim) {
  board = anim.pendingBoard;
  currentPlayer = anim.pendingCurrentPlayer;
  gameStatus = anim.pendingStatus;
  isMyTurn = (currentPlayer === playerNumber);

  spawnParticles(anim.endX, anim.dropEndY, anim.player === 1 ? P1_COLOR : P2_COLOR, 20, 4);

  if (anim.pendingStatus === 'won') {
    winCells = anim.pendingWinCells;
    winPulse = 0;
    const isWinner = anim.pendingWinner === playerNumber;
    setTimeout(() => {
      messageText.textContent = isWinner ? 'YOU WIN!' : 'YOU LOSE!';
      gameMessage.style.display = 'block';
      playAgainBtn.style.display = 'inline-block';
      spawnParticles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, isWinner ? '#ffcc00' : '#ff4444', 50, 6);
    }, 400);
  } else if (anim.pendingStatus === 'draw') {
    setTimeout(() => {
      messageText.textContent = 'DRAW!';
      gameMessage.style.display = 'block';
      playAgainBtn.style.display = 'inline-block';
    }, 400);
  } else {
    canShoot = isMyTurn;
  }
  updateTurnDisplay();
  ballAnim = null;
  ballTrail = [];
}

// Ball animation update — supports both graphics modes
function updateBallAnimation() {
  if (!ballAnim) return;
  const anim = ballAnim;

  if (anim.graphicsMode === 2) {
    // --- Graphics Mode 2: Rim Bounce ---
    if (anim.phase === 'arc') {
      // Arc from shoot position up to the rim area
      let speed = 0.016;
      anim.progress += speed;
      if (anim.progress >= 1) {
        anim.progress = 1;
        anim.phase = 'bounce';
        anim.progress = 0;
        // Rim hit particles
        spawnParticles(anim.rimX, anim.rimY, '#ffcc00', 12, 3);
      }
      const t = anim.progress;
      // Parabolic arc from start to rim, peaking at PEAK_Y
      anim.currentX = lerp(anim.startX, anim.rimX, t);
      anim.currentY = parabolicY(anim.startY, anim.peakY, anim.rimY, t);
      anim.rotation += 0.1;

      ballTrail.push({ x: anim.currentX, y: anim.currentY, life: 1.0 });
      if (ballTrail.length > 25) ballTrail.shift();
      for (const tr of ballTrail) tr.life -= 0.04;

    } else if (anim.phase === 'bounce') {
      // Short bounce arc from rim to above the actual column
      const speed = 0.03 * anim.bounceSpeed;
      anim.progress += speed;
      if (anim.progress >= 1) {
        anim.progress = 1;
        anim.phase = 'drop';
        anim.progress = 0;
        spawnParticles(anim.endX, BOARD_Y - 10, '#ffcc00', 6, 1.5);
      }
      const t = anim.progress;
      // Small arc from rim to above the actual column
      // Bounce pops up slightly then settles above the hole
      const bounceHeight = anim.rimY - 30; // pop up 30px above rim
      anim.currentX = lerp(anim.rimX, anim.endX, easeInOut(t));
      anim.currentY = parabolicY(anim.rimY, bounceHeight, anim.dropStartY, t);
      anim.rotation -= 0.12; // reverse spin on bounce

      ballTrail.push({ x: anim.currentX, y: anim.currentY, life: 1.0 });
      if (ballTrail.length > 25) ballTrail.shift();
      for (const tr of ballTrail) tr.life -= 0.06;

    } else if (anim.phase === 'drop') {
      anim.progress += 0.04;
      if (anim.progress >= 1) { anim.progress = 1; finalizeAnimation(anim); return; }
      const t = anim.progress;
      anim.currentX = anim.endX;
      anim.currentY = anim.dropStartY + (anim.dropEndY - anim.dropStartY) * (t * t);
      anim.rotation += 0.06;
    }

  } else {
    // --- Graphics Mode 1: Original Arc ---
    if (anim.phase === 'arc') {
      let speed;
      if (anim.animType === 'direct') speed = 0.018;
      else if (anim.animType === 'adjacent') speed = 0.015;
      else speed = 0.012;

      anim.progress += speed;
      if (anim.progress >= 1) {
        anim.progress = 1;
        anim.phase = 'drop';
        anim.progress = 0;
        spawnParticles(anim.endX, BOARD_Y - 10, '#ffcc00', 8, 2);
      }
      const t = anim.progress;
      const ballPos = getArcPosition(anim, t);
      anim.currentX = ballPos.x;
      anim.currentY = ballPos.y;
      anim.rotation += 0.08;

      ballTrail.push({ x: ballPos.x, y: ballPos.y, life: 1.0 });
      if (ballTrail.length > 25) ballTrail.shift();
      for (const tr of ballTrail) tr.life -= 0.04;

    } else if (anim.phase === 'drop') {
      anim.progress += 0.04;
      if (anim.progress >= 1) { anim.progress = 1; finalizeAnimation(anim); return; }
      const t = anim.progress;
      anim.currentX = anim.endX;
      anim.currentY = anim.dropStartY + (anim.dropEndY - anim.dropStartY) * (t * t);
      anim.rotation += 0.06;
    }
  }
}

// Get position along the arc path based on animation type
function getArcPosition(anim, t) {
  if (anim.animType === 'direct') {
    // Clean parabolic arc: start → peak above target → target column top
    const x = lerp(anim.startX, anim.endX, t);
    // Parabolic Y: rises to peak then comes back down
    const y = parabolicY(anim.startY, anim.peakY, anim.dropStartY, t);
    return { x, y };

  } else if (anim.animType === 'adjacent') {
    // Arc up toward target column, then drift sideways near the top
    let x, y;
    if (t < 0.6) {
      // Rising phase: head toward target column
      const localT = t / 0.6;
      x = lerp(anim.startX, anim.peakX, easeOut(localT));
      y = lerp(anim.startY, anim.peakY, easeOut(localT));
    } else {
      // Drifting phase: move from target col area to actual col while descending
      const localT = (t - 0.6) / 0.4;
      x = lerp(anim.peakX, anim.endX, easeInOut(localT));
      y = lerp(anim.peakY, anim.dropStartY, easeIn(localT));
    }
    return { x, y };

  } else {
    // Wild: arc up to center-ish, wobble across, then come down far away
    let x, y;
    if (t < 0.4) {
      // Rising phase
      const localT = t / 0.4;
      x = lerp(anim.startX, anim.peakX, easeOut(localT));
      y = lerp(anim.startY, anim.peakY, easeOut(localT));
    } else if (t < 0.7) {
      // Wobble/drift at the top
      const localT = (t - 0.4) / 0.3;
      x = lerp(anim.peakX, anim.endX, easeInOut(localT));
      // Stay near the top with slight bounce
      const wobble = Math.sin(localT * Math.PI * 2) * 15;
      y = anim.peakY + wobble + localT * 30;
    } else {
      // Descend to column
      const localT = (t - 0.7) / 0.3;
      x = lerp(anim.endX, anim.endX, localT); // already at target X
      y = lerp(anim.peakY + 30, anim.dropStartY, easeIn(localT));
    }
    return { x, y };
  }
}

// Easing helpers
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeIn(t) { return t * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function parabolicY(startY, peakY, endY, t) {
  // Quadratic bezier through start, peak, end
  const oneMinusT = 1 - t;
  return oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * peakY + t * t * endY;
}

// Drawing functions
function drawBackground() {
  const grad = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 50, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
  grad.addColorStop(0, '#1a1a4e');
  grad.addColorStop(1, '#0a0a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(100, 100, 200, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CANVAS_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
}

function drawColumnSelectors() {
  for (let c = 0; c < COLS; c++) {
    const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
    const cy = SELECTOR_Y;

    // Check if column is full
    let colFull = true;
    for (let r = 0; r < ROWS; r++) {
      if (board[r] && board[r][c] === 0) { colFull = false; break; }
    }

    if (colFull) {
      // Draw X mark for full columns but still allow hovering for probability display
      ctx.fillStyle = 'rgba(255, 50, 50, 0.3)';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✕', cx, cy);
      // Don't skip — still draw hover effects (dimmed) so user can see redistribution
      if (!((hoveredCol === c) && canShoot && !ballAnim)) continue;
    }

    const isHovered = (hoveredCol === c) && canShoot && !ballAnim;
    const playerColor = playerNumber === 1 ? P1_COLOR : P2_COLOR;

    // Column highlight strip (subtle when not hovered)
    if (isHovered) {
      // Bright highlight strip from selector to board
      ctx.fillStyle = `rgba(${playerNumber === 1 ? '255,68,68' : '68,170,255'}, 0.08)`;
      ctx.fillRect(BOARD_X + c * CELL_SIZE, SELECTOR_Y - 15, CELL_SIZE, BOARD_HEIGHT + (BOARD_Y - SELECTOR_Y) + 15);
    }

    // Hoop/target indicator
    if (isHovered) {
      // Glowing ring
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${playerNumber === 1 ? '255,68,68' : '68,170,255'}, 0.25)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.strokeStyle = playerColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Down arrow
      ctx.fillStyle = playerColor;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + 8);
      ctx.lineTo(cx + 8, cy + 8);
      ctx.lineTo(cx, cy + 18);
      ctx.closePath();
      ctx.fill();
    } else if (canShoot && !ballAnim) {
      // Subtle indicator
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(150, 150, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Small dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 150, 255, 0.3)';
      ctx.fill();
    }
  }
}

function drawBoard() {
  // Board shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(BOARD_X + 5, BOARD_Y + 5, BOARD_WIDTH, BOARD_HEIGHT);

  // Board body
  const boardGrad = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X, BOARD_Y + BOARD_HEIGHT);
  boardGrad.addColorStop(0, '#1a3366');
  boardGrad.addColorStop(1, '#0d1b3e');
  ctx.fillStyle = boardGrad;

  // Rounded rect for board
  const br = 12;
  ctx.beginPath();
  ctx.moveTo(BOARD_X + br, BOARD_Y);
  ctx.lineTo(BOARD_X + BOARD_WIDTH - br, BOARD_Y);
  ctx.quadraticCurveTo(BOARD_X + BOARD_WIDTH, BOARD_Y, BOARD_X + BOARD_WIDTH, BOARD_Y + br);
  ctx.lineTo(BOARD_X + BOARD_WIDTH, BOARD_Y + BOARD_HEIGHT - br);
  ctx.quadraticCurveTo(BOARD_X + BOARD_WIDTH, BOARD_Y + BOARD_HEIGHT, BOARD_X + BOARD_WIDTH - br, BOARD_Y + BOARD_HEIGHT);
  ctx.lineTo(BOARD_X + br, BOARD_Y + BOARD_HEIGHT);
  ctx.quadraticCurveTo(BOARD_X, BOARD_Y + BOARD_HEIGHT, BOARD_X, BOARD_Y + BOARD_HEIGHT - br);
  ctx.lineTo(BOARD_X, BOARD_Y + br);
  ctx.quadraticCurveTo(BOARD_X, BOARD_Y, BOARD_X + br, BOARD_Y);
  ctx.fill();

  // Board border
  ctx.strokeStyle = '#3355aa';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = BOARD_Y + r * CELL_SIZE + CELL_SIZE / 2;

      // Cell hole
      ctx.beginPath();
      ctx.arc(cx, cy, PIECE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#060d1f';
      ctx.fill();
      ctx.strokeStyle = '#1a2a55';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw pieces
      if (board[r] && board[r][c] === 1) {
        drawPiece(cx, cy, P1_COLOR, P1_GLOW);
      } else if (board[r] && board[r][c] === 2) {
        drawPiece(cx, cy, P2_COLOR, P2_GLOW);
      }
    }
  }

  // Win highlighting
  if (winCells) {
    winPulse += 0.08;
    const pulse = Math.sin(winPulse) * 0.3 + 0.7;
    for (const [r, c] of winCells) {
      const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = BOARD_Y + r * CELL_SIZE + CELL_SIZE / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, PIECE_RADIUS + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 50, ${pulse * 0.5})`;
      ctx.fill();
    }
  }
}

function drawPiece(cx, cy, color, glow) {
  // Glow
  ctx.beginPath();
  ctx.arc(cx, cy, PIECE_RADIUS + 4, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Piece body
  const grad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, PIECE_RADIUS);
  grad.addColorStop(0, lightenColor(color, 40));
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, darkenColor(color, 30));
  ctx.beginPath();
  ctx.arc(cx, cy, PIECE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(cx - PIECE_RADIUS * 0.25, cy - PIECE_RADIUS * 0.25, PIECE_RADIUS * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, PIECE_RADIUS * 0.65, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawBall(x, y, rotation) {
  // Ball glow
  ctx.beginPath();
  ctx.arc(x, y, BALL_RADIUS + 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
  ctx.fill();

  // Ball body
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation || 0);

  const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, BALL_RADIUS);
  grad.addColorStop(0, '#ffaa44');
  grad.addColorStop(0.5, '#ff8c00');
  grad.addColorStop(1, '#cc5500');
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Basketball lines
  ctx.strokeStyle = '#883300';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-BALL_RADIUS, 0);
  ctx.lineTo(BALL_RADIUS, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -BALL_RADIUS);
  ctx.lineTo(0, BALL_RADIUS);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS * 0.7, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS * 0.7, Math.PI * 0.6, Math.PI * 1.4);
  ctx.stroke();

  // Highlight
  ctx.beginPath();
  ctx.arc(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.3, BALL_RADIUS * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();

  ctx.restore();
}

function drawBallAnimation() {
  if (!ballAnim) return;

  // Draw trail
  for (let i = 0; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    if (t.life <= 0) continue;
    ctx.beginPath();
    ctx.arc(t.x, t.y, BALL_RADIUS * t.life * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 140, 0, ${t.life * 0.25})`;
    ctx.fill();
  }

  // Draw the ball at current position
  if (ballAnim.currentX !== undefined) {
    drawBall(ballAnim.currentX, ballAnim.currentY, ballAnim.rotation);
  }
}

function drawShootPosition() {
  if (!canShoot || ballAnim) return;

  // Basketball at shoot position (pulsing ready state)
  ctx.save();
  ctx.translate(SHOOT_X, SHOOT_Y);

  const pulse = Math.sin(Date.now() * 0.005) * 0.08 + 1;
  ctx.scale(pulse, pulse);

  // Glow
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS + 10, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 140, 0, ${0.15 + Math.sin(Date.now() * 0.003) * 0.1})`;
  ctx.fill();

  // Ball
  const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, BALL_RADIUS);
  grad.addColorStop(0, '#ffaa44');
  grad.addColorStop(0.5, '#ff8c00');
  grad.addColorStop(1, '#cc5500');
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Basketball lines
  ctx.strokeStyle = '#883300';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-BALL_RADIUS, 0);
  ctx.lineTo(BALL_RADIUS, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -BALL_RADIUS);
  ctx.lineTo(0, BALL_RADIUS);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS * 0.7, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS * 0.7, Math.PI * 0.6, Math.PI * 1.4);
  ctx.stroke();

  // Highlight
  ctx.beginPath();
  ctx.arc(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.3, BALL_RADIUS * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fill();

  ctx.restore();

  // Hint text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SELECT A COLUMN ↑', SHOOT_X, SHOOT_Y + 28);
}

// Color helpers
function lightenColor(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

function darkenColor(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}

function drawProbabilityChart() {
  // Only show when it's the player's turn and they're hovering a column
  if (!canShoot || ballAnim || hoveredCol === -1) return;

  // Calculate position-based odds, then apply full-column redistribution
  let odds = calculateOdds(hoveredCol, hoveredCellOffset);
  odds = redistributeFullColumns(odds);
  const maxOdd = Math.max(...odds, 50); // normalize bars to highest value (at least 50)
  const playerColor = playerNumber === 1 ? P1_COLOR : P2_COLOR;
  const chartBottom = CHART_Y + CHART_HEIGHT;

  // Draw each bar
  for (let c = 0; c < COLS; c++) {
    const barX = BOARD_X + c * CELL_SIZE + BAR_GAP;
    const barHeight = (odds[c] / maxOdd) * CHART_HEIGHT;
    const barY = chartBottom - barHeight;

    // Check if column is full
    let colFull = true;
    for (let r = 0; r < ROWS; r++) {
      if (board[r] && board[r][c] === 0) { colFull = false; break; }
    }

    // Bar color based on probability tier
    let barColor, barAlpha;
    if (c === hoveredCol) {
      barColor = playerColor;
      barAlpha = 0.85;
    } else if (odds[c] >= 15) {
      barColor = '#ff8c00'; // adjacent — orange
      barAlpha = 0.7;
    } else {
      barColor = '#6677aa'; // wild — muted blue
      barAlpha = 0.5;
    }

    if (colFull) barAlpha *= 0.3; // dim full columns

    ctx.globalAlpha = barAlpha;

    // Bar with rounded top
    const radius = Math.min(4, BAR_WIDTH / 2);
    ctx.beginPath();
    ctx.moveTo(barX + radius, barY);
    ctx.lineTo(barX + BAR_WIDTH - radius, barY);
    ctx.quadraticCurveTo(barX + BAR_WIDTH, barY, barX + BAR_WIDTH, barY + radius);
    ctx.lineTo(barX + BAR_WIDTH, chartBottom);
    ctx.lineTo(barX, chartBottom);
    ctx.lineTo(barX, barY + radius);
    ctx.quadraticCurveTo(barX, barY, barX + radius, barY);
    ctx.closePath();
    ctx.fillStyle = barColor;
    ctx.fill();

    // Percentage label above bar
    ctx.globalAlpha = colFull ? 0.2 : 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(odds[c] + '%', barX + BAR_WIDTH / 2, barY - 3);
  }

  ctx.globalAlpha = 1;

  // Baseline
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(BOARD_X, chartBottom);
  ctx.lineTo(BOARD_X + BOARD_WIDTH, chartBottom);
  ctx.stroke();

  // "PROBABILITY" label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('PROBABILITY', CANVAS_WIDTH / 2, CHART_Y - 14);
}

function drawColumnLabels() {
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(100, 150, 255, 0.4)';
  for (let c = 0; c < COLS; c++) {
    const x = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillText((c + 1).toString(), x, BOARD_Y + BOARD_HEIGHT + 25);
  }
}

// Main game loop
function gameLoop() {
  drawBackground();
  drawProbabilityChart();
  drawColumnSelectors();
  drawBoard();
  drawColumnLabels();

  updateBallAnimation();
  drawBallAnimation();
  drawShootPosition();

  updateParticles();
  drawParticles();

  requestAnimationFrame(gameLoop);
}

// Keyboard toggle for graphics mode
document.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    graphicsMode = graphicsMode === 1 ? 2 : 1;
    console.log(`Graphics mode: ${graphicsMode === 1 ? 'Original Arc' : 'Rim Bounce'}`);
  }
});

// Button handlers
joinBtn.addEventListener('click', () => {
  socket.emit('join-game');
  lobbyStatus.textContent = 'Searching for opponent...';
  joinBtn.disabled = true;
  joinBtn.style.opacity = 0.5;
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play-again');
  gameMessage.style.display = 'none';
  winCells = null;
  ballAnim = null;
});

// Auto-join if URL has ?autoJoin=1
if (new URLSearchParams(window.location.search).has('autoJoin')) {
  socket.emit('join-game');
  lobbyStatus.textContent = 'Auto-joining...';
  joinBtn.disabled = true;
  joinBtn.style.opacity = 0.5;
}

// Start game loop
gameLoop();
