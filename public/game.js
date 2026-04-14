// Basketball Connect 4 — Main Game Logic
// Depends on odds.js (loaded first) and draw.js (loaded second)

const socket = io();

// DOM elements
const lobby = document.getElementById('lobby');
const gameScreen = document.getElementById('game-screen');
const joinTurnBasedBtn = document.getElementById('join-turnbased-btn');
const joinSimultaneousBtn = document.getElementById('join-simultaneous-btn');
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
// COLS already defined in odds.js
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
let graphicsMode = 2;

// Game state
let playerNumber = 0;
let board = [];
let currentPlayer = 1;
let gameStatus = 'waiting';
let isMyTurn = false;
let canShoot = false;
let gameMode = 'turnBased'; // 'turnBased' or 'simultaneous'

// Column selection state
let hoveredCol = -1;
let hoveredCellOffset = 0.5;
let selectedCol = -1;

// Ball animation state — array for multiple simultaneous animations
let ballAnims = [];

// Particles
let particles = [];

// Win animation
let winCells = null;
let winPulse = 0;

// Shooting position
const SHOOT_X = CANVAS_WIDTH / 2;
const SHOOT_Y = CANVAS_HEIGHT - 30;

// Animation peak
const PEAK_Y = 35;

// Chart layout
const CHART_Y = 60;
const CHART_HEIGHT = 120;
const BAR_WIDTH = 50;
const BAR_GAP = (CELL_SIZE - BAR_WIDTH) / 2;

// Simultaneous mode state
let cooldownEnd = 0;
let readyTime = 0;
let focusTime = 0;
const COOLDOWN_MS = 1000;

// Opponent aiming
let opponentAim = null;
let lastAimEmit = 0;

// Phase durations in ms — time-based animation ensures completion regardless of frame rate
const PHASE_MS = {
  gfx2: { arc: 800, bounce: 500, drop: 350 },
  gfx1: { arcDirect: 700, arcAdjacent: 850, arcWild: 1000, drop: 350 }
};

// Particle system
function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * speed + speed * 0.3;
    particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
      life: 1.0, decay: 0.015 + Math.random() * 0.025, color, size: 2 + Math.random() * 4 });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Easing helpers
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeIn(t) { return t * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function parabolicY(startY, peakY, endY, t) {
  const oneMinusT = 1 - t;
  return oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * peakY + t * t * endY;
}

// Socket events
function disableLobbyButtons() {
  joinTurnBasedBtn.disabled = true; joinTurnBasedBtn.style.opacity = 0.5;
  joinSimultaneousBtn.disabled = true; joinSimultaneousBtn.style.opacity = 0.5;
}

socket.on('waiting', (data) => {
  const mode = data && data.mode ? data.mode : 'turnBased';
  lobbyStatus.textContent = `Waiting for ${mode === 'simultaneous' ? 'simultaneous' : 'turn-based'} opponent...`;
  disableLobbyButtons();
});

socket.on('game-start', (data) => {
  playerNumber = data.playerNumber;
  gameMode = data.mode || 'turnBased';
  lobby.style.display = 'none';
  gameScreen.style.display = 'flex';
  gameMessage.style.display = 'none';
  canShoot = false;
  ballAnims = [];
  winCells = null;
  cooldownEnd = 0;
  readyTime = Date.now();
  focusTime = 0;
  opponentAim = null;
});

socket.on('game-state', (data) => {
  board = data.board;
  currentPlayer = data.currentPlayer;
  gameStatus = data.status;
  if (data.mode) gameMode = data.mode;
  isMyTurn = (currentPlayer === playerNumber);
  if (gameMode === 'turnBased') {
    canShoot = isMyTurn && gameStatus === 'playing' && ballAnims.length === 0;
  } else {
    canShoot = gameStatus === 'playing' && Date.now() >= cooldownEnd;
  }
  // Don't clear in-flight animations — they carry correct pending board state
  updateTurnDisplay();
});

socket.on('shot-result', (data) => {
  const { targetColumn, actualColumn, row, player } = data;
  const pendingBoard = data.board;
  const pendingCurrentPlayer = data.currentPlayer;
  const pendingStatus = data.status;
  const pendingWinner = data.winner;
  const pendingWinCells = data.winningCells;

  // Simultaneous mode: update cooldown for shooting player
  if (gameMode === 'simultaneous' && data.cooldownEnd && player === playerNumber) {
    cooldownEnd = data.cooldownEnd;
    readyTime = data.cooldownEnd;
  }

  const distance = Math.abs(actualColumn - targetColumn);
  let animType = 'direct';
  if (distance === 1) animType = 'adjacent';
  else if (distance >= 2) animType = 'wild';

  const startX = SHOOT_X;
  const startY = SHOOT_Y;
  const endX = BOARD_X + actualColumn * CELL_SIZE + CELL_SIZE / 2;
  const targetX = BOARD_X + targetColumn * CELL_SIZE + CELL_SIZE / 2;

  let peakX;
  if (animType === 'direct') peakX = endX;
  else if (animType === 'adjacent') peakX = targetX;
  else peakX = (startX + targetX) / 2;

  // In turn-based, block shooting during animation
  if (gameMode === 'turnBased') canShoot = false;

  const now = Date.now();
  let anim;
  if (graphicsMode === 2) {
    const actualCenterX = BOARD_X + actualColumn * CELL_SIZE + CELL_SIZE / 2;
    const rimSide = (startX < actualCenterX) ? -1 : 1;
    let rimX;
    if (rimSide === -1) rimX = BOARD_X + actualColumn * CELL_SIZE + PIECE_RADIUS * 0.3;
    else rimX = BOARD_X + (actualColumn + 1) * CELL_SIZE - PIECE_RADIUS * 0.3;
    const rimY = BOARD_Y + CELL_SIZE / 2 - PIECE_RADIUS - BALL_RADIUS;
    const approachX = rimX + rimSide * 5;

    anim = {
      phase: 'arc', graphicsMode: 2, animType,
      phaseStart: now,
      startX, startY, peakX: (startX + approachX) / 2, peakY: PEAK_Y,
      rimX, rimY, approachX, endX: actualCenterX,
      bounceEndY: BOARD_Y - BALL_RADIUS * 1.5,
      dropStartY: BOARD_Y - BALL_RADIUS,
      dropEndY: BOARD_Y + row * CELL_SIZE + CELL_SIZE / 2,
      rimSide, targetColumn, actualColumn, row, player,
      rotation: 0, bounceSpeed: 0.85, trail: [],
      pendingBoard, pendingCurrentPlayer, pendingStatus, pendingWinner, pendingWinCells
    };
  } else {
    anim = {
      phase: 'arc', graphicsMode: 1, animType,
      phaseStart: now,
      startX, startY, peakX, peakY: PEAK_Y, endX,
      dropStartY: BOARD_Y - BALL_RADIUS,
      dropEndY: BOARD_Y + row * CELL_SIZE + CELL_SIZE / 2,
      targetColumn, actualColumn, row, player,
      rotation: 0, trail: [],
      pendingBoard, pendingCurrentPlayer, pendingStatus, pendingWinner, pendingWinCells
    };
  }
  ballAnims.push(anim);
});

socket.on('shot-rejected', (data) => {
  console.log('Shot rejected:', data.reason);
});

socket.on('opponent-aim', (data) => {
  opponentAim = { targetColumn: data.targetColumn, cellOffset: data.cellOffset, focusTime: data.focusTime };
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
    player1Info.classList.remove('active'); player2Info.classList.remove('active');
    return;
  }
  if (gameMode === 'simultaneous') {
    turnDisplay.textContent = '⚡ SIMULTANEOUS — SHOOT ANYTIME';
    turnDisplay.style.color = playerNumber === 1 ? P1_COLOR : P2_COLOR;
  } else {
    if (isMyTurn) {
      turnDisplay.textContent = 'YOUR TURN — SELECT A COLUMN';
      turnDisplay.style.color = playerNumber === 1 ? P1_COLOR : P2_COLOR;
    } else {
      turnDisplay.textContent = "OPPONENT'S TURN";
      turnDisplay.style.color = '#888';
    }
  }
  player1Info.classList.toggle('active', currentPlayer === 1);
  player2Info.classList.toggle('active', currentPlayer === 2);
}

// Input handling
function getColFromX(canvasX) {
  const relX = canvasX - BOARD_X;
  if (relX < 0 || relX >= BOARD_WIDTH) return -1;
  return Math.floor(relX / CELL_SIZE);
}

canvas.addEventListener('mousemove', (e) => {
  const ballAnimActive = (gameMode === 'turnBased') ? (ballAnims.length > 0) : false;
  if (!canShoot || ballAnimActive) { hoveredCol = -1; return; }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (y >= CHART_Y - 10 && y <= BOARD_Y + BOARD_HEIGHT) {
    hoveredCol = getColFromX(x);
    if (hoveredCol >= 0) {
      const cellLeft = BOARD_X + hoveredCol * CELL_SIZE;
      hoveredCellOffset = Math.max(0, Math.min(1, (x - cellLeft) / CELL_SIZE));
    }
  } else {
    hoveredCol = -1;
  }
  if (gameMode === 'simultaneous' && hoveredCol >= 0) {
    const now = Date.now();
    if (now - lastAimEmit > 100) {
      lastAimEmit = now;
      socket.emit('aim-update', { targetColumn: hoveredCol, cellOffset: hoveredCellOffset, focusTime });
    }
  }
});

canvas.addEventListener('mouseleave', () => { hoveredCol = -1; });

canvas.addEventListener('click', (e) => {
  const ballAnimActive = (gameMode === 'turnBased') ? (ballAnims.length > 0) : false;
  if (!canShoot || ballAnimActive) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const col = getColFromX(x);
  if (col === -1) return;
  const cellLeft = BOARD_X + col * CELL_SIZE;
  const offset = Math.max(0, Math.min(1, (x - cellLeft) / CELL_SIZE));
  selectedCol = col;
  if (gameMode === 'turnBased') canShoot = false;
  socket.emit('shoot', { targetColumn: col, cellOffset: offset });
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
  const col = getColFromX(x);
  if (col !== -1) {
    hoveredCol = col;
    const cellLeft = BOARD_X + col * CELL_SIZE;
    hoveredCellOffset = Math.max(0, Math.min(1, (x - cellLeft) / CELL_SIZE));
  }
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const ballAnimActive = (gameMode === 'turnBased') ? (ballAnims.length > 0) : false;
  if (!canShoot || ballAnimActive || hoveredCol === -1) return;
  const col = hoveredCol;
  selectedCol = col;
  if (gameMode === 'turnBased') canShoot = false;
  socket.emit('shoot', { targetColumn: col, cellOffset: hoveredCellOffset });
  hoveredCol = -1;
});

// Finalize animation — apply board state and clean up
function finalizeAnimation(anim) {
  board = anim.pendingBoard;
  currentPlayer = anim.pendingCurrentPlayer;
  gameStatus = anim.pendingStatus;
  isMyTurn = (currentPlayer === playerNumber);
  spawnParticles(anim.endX, anim.dropEndY, anim.player === 1 ? P1_COLOR : P2_COLOR, 20, 4);
  if (anim.pendingStatus === 'won') {
    winCells = anim.pendingWinCells; winPulse = 0;
    const isWinner = anim.pendingWinner === playerNumber;
    setTimeout(() => {
      messageText.textContent = isWinner ? 'YOU WIN!' : 'YOU LOSE!';
      gameMessage.style.display = 'block'; playAgainBtn.style.display = 'inline-block';
      spawnParticles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, isWinner ? '#ffcc00' : '#ff4444', 50, 6);
    }, 400);
  } else if (anim.pendingStatus === 'draw') {
    setTimeout(() => {
      messageText.textContent = 'DRAW!';
      gameMessage.style.display = 'block'; playAgainBtn.style.display = 'inline-block';
    }, 400);
  } else {
    if (gameMode === 'turnBased') canShoot = isMyTurn && ballAnims.length === 0;
  }
  updateTurnDisplay();
  const idx = ballAnims.indexOf(anim);
  if (idx !== -1) ballAnims.splice(idx, 1);
}

// Arc position for graphics mode 1
function getArcPosition(anim, t) {
  if (anim.animType === 'direct') {
    return { x: lerp(anim.startX, anim.endX, t), y: parabolicY(anim.startY, anim.peakY, anim.dropStartY, t) };
  } else if (anim.animType === 'adjacent') {
    let x, y;
    if (t < 0.6) { const lt = t / 0.6; x = lerp(anim.startX, anim.peakX, easeOut(lt)); y = lerp(anim.startY, anim.peakY, easeOut(lt)); }
    else { const lt = (t - 0.6) / 0.4; x = lerp(anim.peakX, anim.endX, easeInOut(lt)); y = lerp(anim.peakY, anim.dropStartY, easeIn(lt)); }
    return { x, y };
  } else {
    let x, y;
    if (t < 0.4) { const lt = t / 0.4; x = lerp(anim.startX, anim.peakX, easeOut(lt)); y = lerp(anim.startY, anim.peakY, easeOut(lt)); }
    else if (t < 0.7) { const lt = (t - 0.4) / 0.3; x = lerp(anim.peakX, anim.endX, easeInOut(lt)); const wobble = Math.sin(lt * Math.PI * 2) * 15; y = anim.peakY + wobble + lt * 30; }
    else { const lt = (t - 0.7) / 0.3; x = anim.endX; y = lerp(anim.peakY + 30, anim.dropStartY, easeIn(lt)); }
    return { x, y };
  }
}

// Helper: advance to next phase with timestamp
function nextPhase(anim, phaseName, now) {
  anim.phase = phaseName;
  anim.phaseStart = now;
}

// Update all ball animations — time-based so they always complete
function updateBallAnimations() {
  const now = Date.now();
  for (let i = ballAnims.length - 1; i >= 0; i--) {
    const anim = ballAnims[i];
    const elapsed = now - anim.phaseStart;

    if (anim.graphicsMode === 2) {
      // --- Graphics Mode 2: arc → rim bounce → drop ---
      if (anim.phase === 'arc') {
        const duration = PHASE_MS.gfx2.arc;
        const t = Math.min(1, elapsed / duration);
        anim.currentX = lerp(anim.startX, anim.rimX, t);
        anim.currentY = parabolicY(anim.startY, anim.peakY, anim.rimY, t);
        anim.rotation += 0.1;
        anim.trail.push({ x: anim.currentX, y: anim.currentY, life: 1.0 });
        if (anim.trail.length > 25) anim.trail.shift();
        for (const tr of anim.trail) tr.life -= 0.04;
        if (t >= 1) {
          spawnParticles(anim.rimX, anim.rimY, '#ffcc00', 12, 3);
          nextPhase(anim, 'bounce', now);
        }
      } else if (anim.phase === 'bounce') {
        const duration = PHASE_MS.gfx2.bounce;
        const t = Math.min(1, elapsed / duration);
        const bounceApex = anim.rimY - (anim.rimY - anim.peakY) * 0.85;
        anim.currentX = lerp(anim.rimX, anim.endX, easeInOut(t));
        anim.currentY = parabolicY(anim.rimY, bounceApex, anim.dropStartY, t);
        anim.rotation -= 0.12;
        anim.trail.push({ x: anim.currentX, y: anim.currentY, life: 1.0 });
        if (anim.trail.length > 25) anim.trail.shift();
        for (const tr of anim.trail) tr.life -= 0.06;
        if (t >= 1) {
          spawnParticles(anim.endX, BOARD_Y - 10, '#ffcc00', 6, 1.5);
          nextPhase(anim, 'drop', now);
        }
      } else if (anim.phase === 'drop') {
        const duration = PHASE_MS.gfx2.drop;
        const t = Math.min(1, elapsed / duration);
        anim.currentX = anim.endX;
        anim.currentY = anim.dropStartY + (anim.dropEndY - anim.dropStartY) * (t * t);
        anim.rotation += 0.06;
        if (t >= 1) { finalizeAnimation(anim); continue; }
      }

    } else {
      // --- Graphics Mode 1: arc → drop ---
      if (anim.phase === 'arc') {
        let duration;
        if (anim.animType === 'direct') duration = PHASE_MS.gfx1.arcDirect;
        else if (anim.animType === 'adjacent') duration = PHASE_MS.gfx1.arcAdjacent;
        else duration = PHASE_MS.gfx1.arcWild;
        const t = Math.min(1, elapsed / duration);
        const ballPos = getArcPosition(anim, t);
        anim.currentX = ballPos.x; anim.currentY = ballPos.y;
        anim.rotation += 0.08;
        anim.trail.push({ x: ballPos.x, y: ballPos.y, life: 1.0 });
        if (anim.trail.length > 25) anim.trail.shift();
        for (const tr of anim.trail) tr.life -= 0.04;
        if (t >= 1) {
          spawnParticles(anim.endX, BOARD_Y - 10, '#ffcc00', 8, 2);
          nextPhase(anim, 'drop', now);
        }
      } else if (anim.phase === 'drop') {
        const duration = PHASE_MS.gfx1.drop;
        const t = Math.min(1, elapsed / duration);
        anim.currentX = anim.endX;
        anim.currentY = anim.dropStartY + (anim.dropEndY - anim.dropStartY) * (t * t);
        anim.rotation += 0.06;
        if (t >= 1) { finalizeAnimation(anim); continue; }
      }
    }
  }
}

// Update focus time for simultaneous mode
function updateSimultaneousState() {
  if (gameMode !== 'simultaneous' || gameStatus !== 'playing') return;
  const now = Date.now();
  if (now >= cooldownEnd) {
    focusTime = Math.min(FOCUS_MAX_S, Math.max(0, (now - readyTime) / 1000));
    canShoot = true;
  } else {
    focusTime = 0;
    canShoot = false;
  }
}

// Main game loop
function gameLoop() {
  updateSimultaneousState();
  drawBackground();
  drawProbabilityChart();
  drawColumnSelectors();
  drawOpponentAim();
  drawBoard();
  drawColumnLabels();
  updateBallAnimations();
  drawBallAnimation();
  drawShootPosition();
  drawCooldownUI();
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

// Lobby button handlers
joinTurnBasedBtn.addEventListener('click', () => {
  socket.emit('join-game', { mode: 'turnBased' });
  lobbyStatus.textContent = 'Searching for turn-based opponent...';
  disableLobbyButtons();
});

joinSimultaneousBtn.addEventListener('click', () => {
  socket.emit('join-game', { mode: 'simultaneous' });
  lobbyStatus.textContent = 'Searching for simultaneous opponent...';
  disableLobbyButtons();
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play-again');
  gameMessage.style.display = 'none';
  winCells = null;
  ballAnims = [];
});

// Start game loop
gameLoop();
