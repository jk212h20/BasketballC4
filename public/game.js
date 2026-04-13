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

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Player colors
const P1_COLOR = '#ff4444';
const P1_GLOW = 'rgba(255, 68, 68, 0.6)';
const P2_COLOR = '#44aaff';
const P2_GLOW = 'rgba(68, 170, 255, 0.6)';
const BALL_COLOR = '#ff8c00';

// Game state
let playerNumber = 0;
let board = [];
let currentPlayer = 1;
let gameStatus = 'waiting';
let isMyTurn = false;
let canShoot = false;

// Aiming state
let isAiming = false;
let aimStart = null;
let aimEnd = null;
let launchAngle = 0;
let launchPower = 0;

// Ball physics state
let ball = null;
let ballTrail = [];
let ballSettled = false;
let ballTargetCol = -1;

// Bumpers (pinball-style obstacles)
let bumpers = [];

// Particles
let particles = [];

// Bumper hit effects
let bumperFlashes = [];

// Win animation
let winCells = null;
let winPulse = 0;

// Shooting position
const SHOOT_X = CANVAS_WIDTH / 2;
const SHOOT_Y = CANVAS_HEIGHT - 30;

// Initialize bumpers
function initBumpers() {
  bumpers = [];
  const bumperAreaTop = 30;
  const bumperAreaBottom = BOARD_Y - 30;
  const bumperAreaLeft = 70;
  const bumperAreaRight = CANVAS_WIDTH - 70;
  
  // Row 1 - top
  bumpers.push({ x: 160, y: 70, r: 22, hits: 0 });
  bumpers.push({ x: 310, y: 55, r: 25, hits: 0 });
  bumpers.push({ x: 460, y: 70, r: 22, hits: 0 });
  
  // Row 2
  bumpers.push({ x: 100, y: 140, r: 20, hits: 0 });
  bumpers.push({ x: 240, y: 130, r: 24, hits: 0 });
  bumpers.push({ x: 390, y: 140, r: 24, hits: 0 });
  bumpers.push({ x: 530, y: 130, r: 20, hits: 0 });
  
  // Row 3
  bumpers.push({ x: 160, y: 210, r: 22, hits: 0 });
  bumpers.push({ x: 310, y: 220, r: 26, hits: 0 });
  bumpers.push({ x: 460, y: 210, r: 22, hits: 0 });
}

initBumpers();

// Gaussian random
function gaussRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
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

// Bumper flash effects
function addBumperFlash(bumper) {
  bumperFlashes.push({ x: bumper.x, y: bumper.y, r: bumper.r, life: 1.0 });
  bumper.hits++;
}

function updateBumperFlashes() {
  for (let i = bumperFlashes.length - 1; i >= 0; i--) {
    bumperFlashes[i].life -= 0.04;
    if (bumperFlashes[i].life <= 0) bumperFlashes.splice(i, 1);
  }
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
  ball = null;
  initBumpers();
});

socket.on('game-state', (data) => {
  board = data.board;
  currentPlayer = data.currentPlayer;
  gameStatus = data.status;
  isMyTurn = (currentPlayer === playerNumber);
  canShoot = isMyTurn && gameStatus === 'playing';
  ball = null;
  updateTurnDisplay();
});

socket.on('shot-result', (data) => {
  board = data.board;
  currentPlayer = data.currentPlayer;
  gameStatus = data.status;
  isMyTurn = (currentPlayer === playerNumber);
  
  if (data.status === 'won') {
    winCells = data.winningCells;
    winPulse = 0;
    const isWinner = data.winner === playerNumber;
    setTimeout(() => {
      messageText.textContent = isWinner ? 'YOU WIN!' : 'YOU LOSE!';
      gameMessage.style.display = 'block';
      playAgainBtn.style.display = 'inline-block';
      spawnParticles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, isWinner ? '#ffcc00' : '#ff4444', 50, 6);
    }, 800);
  } else if (data.status === 'draw') {
    setTimeout(() => {
      messageText.textContent = 'DRAW!';
      gameMessage.style.display = 'block';
      playAgainBtn.style.display = 'inline-block';
    }, 800);
  } else {
    canShoot = isMyTurn;
  }
  
  updateTurnDisplay();
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
    turnDisplay.textContent = 'YOUR TURN';
    turnDisplay.style.color = playerNumber === 1 ? P1_COLOR : P2_COLOR;
  } else {
    turnDisplay.textContent = 'OPPONENT';
    turnDisplay.style.color = '#888';
  }
  player1Info.classList.toggle('active', currentPlayer === 1);
  player2Info.classList.toggle('active', currentPlayer === 2);
}

// Input handling
canvas.addEventListener('mousedown', (e) => {
  if (!canShoot || ball) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  isAiming = true;
  aimStart = { x: SHOOT_X, y: SHOOT_Y };
  aimEnd = { x, y };
});

canvas.addEventListener('mousemove', (e) => {
  if (!isAiming) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  aimEnd = { x, y };
});

canvas.addEventListener('mouseup', (e) => {
  if (!isAiming) return;
  isAiming = false;
  
  const dx = aimStart.x - aimEnd.x;
  const dy = aimStart.y - aimEnd.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 20) return; // Too small, ignore
  
  // Launch direction is opposite of drag (slingshot style)
  let angle = Math.atan2(-dy, -dx);
  let power = Math.min(dist / 15, 18);
  
  // Apply variance: ~50% chance of significant deviation
  const variance = Math.random();
  let angleOffset, powerOffset;
  
  if (variance < 0.5) {
    // Accurate shot - small perturbation
    angleOffset = gaussRandom() * 0.03;
    powerOffset = gaussRandom() * 0.3;
  } else {
    // Wild shot - significant perturbation
    angleOffset = gaussRandom() * 0.18;
    powerOffset = gaussRandom() * 2.0;
  }
  
  angle += angleOffset;
  power = Math.max(5, Math.min(18, power + powerOffset));
  
  launchAngle = angle;
  launchPower = power;
  
  // Create ball
  ball = {
    x: SHOOT_X,
    y: SHOOT_Y,
    vx: Math.cos(angle) * power,
    vy: Math.sin(angle) * power,
    rotation: 0,
    settled: false,
    settleTimer: 0,
    targetCol: -1
  };
  ballTrail = [];
  canShoot = false;
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
  canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
  canvas.dispatchEvent(mouseEvent);
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  const mouseEvent = new MouseEvent('mouseup', {});
  canvas.dispatchEvent(mouseEvent);
});

// Physics simulation
function updateBall() {
  if (!ball || ball.settled) return;
  
  const GRAVITY = 0.25;
  const DAMPING = 0.98;
  const WALL_BOUNCE = 0.7;
  const BUMPER_BOUNCE = 1.3;
  
  // Apply gravity
  ball.vy += GRAVITY;
  
  // Apply slight damping
  ball.vx *= DAMPING;
  ball.vy *= DAMPING;
  
  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;
  
  // Rotate based on velocity
  ball.rotation += ball.vx * 0.05;
  
  // Wall collisions
  if (ball.x - BALL_RADIUS < 0) {
    ball.x = BALL_RADIUS;
    ball.vx = Math.abs(ball.vx) * WALL_BOUNCE;
    spawnParticles(ball.x, ball.y, '#ff8844', 5, 2);
  }
  if (ball.x + BALL_RADIUS > CANVAS_WIDTH) {
    ball.x = CANVAS_WIDTH - BALL_RADIUS;
    ball.vx = -Math.abs(ball.vx) * WALL_BOUNCE;
    spawnParticles(ball.x, ball.y, '#ff8844', 5, 2);
  }
  if (ball.y - BALL_RADIUS < 0) {
    ball.y = BALL_RADIUS;
    ball.vy = Math.abs(ball.vy) * WALL_BOUNCE;
    spawnParticles(ball.x, ball.y, '#ff8844', 5, 2);
  }
  
  // Bumper collisions
  for (const bumper of bumpers) {
    const dx = ball.x - bumper.x;
    const dy = ball.y - bumper.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = BALL_RADIUS + bumper.r;
    
    if (dist < minDist && dist > 0) {
      // Push ball out
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = bumper.x + nx * minDist;
      ball.y = bumper.y + ny * minDist;
      
      // Reflect velocity
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx = (ball.vx - 2 * dot * nx) * BUMPER_BOUNCE;
      ball.vy = (ball.vy - 2 * dot * ny) * BUMPER_BOUNCE;
      
      // Cap speed
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > 20) {
        ball.vx = (ball.vx / speed) * 20;
        ball.vy = (ball.vy / speed) * 20;
      }
      
      addBumperFlash(bumper);
      spawnParticles(bumper.x + nx * bumper.r, bumper.y + ny * bumper.r, '#ffcc00', 8, 3);
    }
  }
  
  // Board top collision
  if (ball.y + BALL_RADIUS > BOARD_Y && ball.y - BALL_RADIUS < BOARD_Y + BOARD_HEIGHT) {
    if (ball.x > BOARD_X && ball.x < BOARD_X + BOARD_WIDTH) {
      // Check if ball is in a column gap or hitting a divider
      const col = Math.floor((ball.x - BOARD_X) / CELL_SIZE);
      const colCenter = BOARD_X + col * CELL_SIZE + CELL_SIZE / 2;
      const dividerX = BOARD_X + col * CELL_SIZE;
      
      // Check divider collision (left edge of each column)
      for (let c = 0; c <= COLS; c++) {
        const divX = BOARD_X + c * CELL_SIZE;
        const divWidth = 6;
        if (ball.x + BALL_RADIUS > divX - divWidth/2 && ball.x - BALL_RADIUS < divX + divWidth/2) {
          if (ball.y + BALL_RADIUS > BOARD_Y && ball.y < BOARD_Y + 30) {
            // Hit the top of a divider
            if (Math.abs(ball.x - divX) < BALL_RADIUS + divWidth/2) {
              if (ball.x < divX) {
                ball.vx -= 1.5;
              } else {
                ball.vx += 1.5;
              }
              ball.vy = Math.abs(ball.vy) * 0.5;
              spawnParticles(divX, BOARD_Y, '#aaaaff', 5, 2);
            }
          }
        }
      }
      
      // Check if ball has settled into a column
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (ball.y > BOARD_Y - BALL_RADIUS && speed < 4) {
        ball.settleTimer++;
        if (ball.settleTimer > 15) {
          // Determine which column the ball is in
          const finalCol = Math.floor((ball.x - BOARD_X) / CELL_SIZE);
          const clampedCol = Math.max(0, Math.min(COLS - 1, finalCol));
          
          // Check if column is full
          let colFull = true;
          for (let r = 0; r < ROWS; r++) {
            if (board[r][clampedCol] === 0) { colFull = false; break; }
          }
          
          if (!colFull) {
            ball.settled = true;
            ball.targetCol = clampedCol;
            ball.x = BOARD_X + clampedCol * CELL_SIZE + CELL_SIZE / 2;
            ball.y = BOARD_Y - BALL_RADIUS;
            
            // Animate ball dropping into column
            animateBallDrop(clampedCol);
          } else {
            // Column full, bounce ball out
            ball.vy = -Math.abs(ball.vy) * 0.8;
            ball.vx += (Math.random() - 0.5) * 4;
            ball.settleTimer = 0;
          }
        }
      } else {
        ball.settleTimer = 0;
      }
    }
  }
  
  // Ball trail
  ballTrail.push({ x: ball.x, y: ball.y, life: 1.0 });
  if (ballTrail.length > 20) ballTrail.shift();
  for (const t of ballTrail) t.life -= 0.05;
  
  // Safety: if ball goes off screen or has been around too long
  if (ball.y > CANVAS_HEIGHT + 50 || ball.y < -100) {
    // Force settle in nearest column
    const col = Math.max(0, Math.min(COLS - 1, Math.floor((ball.x - BOARD_X) / CELL_SIZE)));
    ball.settled = true;
    ball.targetCol = col;
    animateBallDrop(col);
  }
}

function animateBallDrop(col) {
  // Find the row the piece lands in
  let targetRow = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) { targetRow = r; break; }
  }
  
  if (targetRow === -1) {
    // Column full - shouldn't happen but handle it
    ball = null;
    canShoot = isMyTurn;
    return;
  }
  
  // Animate the drop visually then send to server
  const targetY = BOARD_Y + targetRow * CELL_SIZE + CELL_SIZE / 2;
  const startX = ball.x;
  const startY = ball.y;
  let dropProgress = 0;
  
  function dropStep() {
    dropProgress += 0.06;
    if (dropProgress >= 1) {
      // Send shot to server
      socket.emit('shoot', { column: col });
      spawnParticles(
        BOARD_X + col * CELL_SIZE + CELL_SIZE / 2,
        BOARD_Y + targetRow * CELL_SIZE + CELL_SIZE / 2,
        playerNumber === 1 ? P1_COLOR : P2_COLOR,
        15, 4
      );
      ball = null;
      return;
    }
    
    // Ease-out bounce
    const t = dropProgress;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    ball.x = startX + (BOARD_X + col * CELL_SIZE + CELL_SIZE / 2 - startX) * ease;
    ball.y = startY + (targetY - startY) * ease;
    
    requestAnimationFrame(dropStep);
  }
  
  dropStep();
}

// Drawing functions
function drawBackground() {
  // Dark gradient background
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

function drawBumpers() {
  for (const bumper of bumpers) {
    // Glow
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r + 8, 0, Math.PI * 2);
    const glowAlpha = 0.2 + bumper.hits * 0.05;
    ctx.fillStyle = `rgba(150, 130, 255, ${Math.min(glowAlpha, 0.5)})`;
    ctx.fill();
    
    // Main body
    const grad = ctx.createRadialGradient(bumper.x - 4, bumper.y - 4, 2, bumper.x, bumper.y, bumper.r);
    grad.addColorStop(0, '#ccaaff');
    grad.addColorStop(0.5, '#8866dd');
    grad.addColorStop(1, '#5533aa');
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Highlight
    ctx.beginPath();
    ctx.arc(bumper.x - bumper.r * 0.3, bumper.y - bumper.r * 0.3, bumper.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();
  }
  
  // Draw bumper flashes
  for (const flash of bumperFlashes) {
    ctx.beginPath();
    ctx.arc(flash.x, flash.y, flash.r + 15 * (1 - flash.life), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 220, 100, ${flash.life * 0.6})`;
    ctx.fill();
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
  
  // Column dividers (top edges that deflect ball)
  for (let c = 0; c <= COLS; c++) {
    const x = BOARD_X + c * CELL_SIZE;
    ctx.fillStyle = '#4466bb';
    ctx.fillRect(x - 3, BOARD_Y, 6, 25);
    
    // Small triangular guide at top
    ctx.beginPath();
    ctx.moveTo(x - 8, BOARD_Y);
    ctx.lineTo(x, BOARD_Y + 12);
    ctx.lineTo(x + 8, BOARD_Y);
    ctx.fillStyle = '#5577cc';
    ctx.fill();
  }
  
  // Draw cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = BOARD_Y + r * CELL_SIZE + CELL_SIZE / 2;
      
      // Cell hole (empty)
      ctx.beginPath();
      ctx.arc(cx, cy, PIECE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#060d1f';
      ctx.fill();
      ctx.strokeStyle = '#1a2a55';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw pieces
      if (board[r] && board[r][c] === 1) {
        drawPiece(cx, cy, P1_COLOR, P1_GLOW, r, c);
      } else if (board[r] && board[r][c] === 2) {
        drawPiece(cx, cy, P2_COLOR, P2_GLOW, r, c);
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

function drawPiece(cx, cy, color, glow, r, c) {
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

function drawBall() {
  if (!ball) return;
  
  // Trail
  for (let i = 0; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    if (t.life <= 0) continue;
    ctx.beginPath();
    ctx.arc(t.x, t.y, BALL_RADIUS * t.life * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 140, 0, ${t.life * 0.3})`;
    ctx.fill();
  }
  
  // Ball glow
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS + 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
  ctx.fill();
  
  // Ball body
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.rotation);
  
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
  
  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(-BALL_RADIUS, 0);
  ctx.lineTo(BALL_RADIUS, 0);
  ctx.stroke();
  
  // Vertical line
  ctx.beginPath();
  ctx.moveTo(0, -BALL_RADIUS);
  ctx.lineTo(0, BALL_RADIUS);
  ctx.stroke();
  
  // Curved lines
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

function drawAimLine() {
  if (!isAiming || !aimStart || !aimEnd) return;
  
  const dx = aimStart.x - aimEnd.x;
  const dy = aimStart.y - aimEnd.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 10) return;
  
  const angle = Math.atan2(-dy, -dx);
  const power = Math.min(dist / 15, 18);
  
  // Draw slingshot line
  ctx.strokeStyle = 'rgba(255, 200, 100, 0.6)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(SHOOT_X, SHOOT_Y);
  ctx.lineTo(SHOOT_X + Math.cos(angle) * power * 8, SHOOT_Y + Math.sin(angle) * power * 8);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw power indicator
  const powerPct = power / 18;
  const barX = 15;
  const barY = CANVAS_HEIGHT - 120;
  const barH = 80;
  const barW = 12;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(barX, barY, barW, barH);
  
  const powerColor = powerPct < 0.5 ? '#44ff44' : powerPct < 0.8 ? '#ffcc00' : '#ff4444';
  ctx.fillStyle = powerColor;
  ctx.fillRect(barX, barY + barH * (1 - powerPct), barW, barH * powerPct);
  
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  
  // Power text
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PWR', barX + barW/2, barY + barH + 14);
}

function drawShootPosition() {
  if (!canShoot || ball) return;
  
  // Basketball at shoot position
  ctx.save();
  ctx.translate(SHOOT_X, SHOOT_Y);
  
  const pulse = Math.sin(Date.now() * 0.005) * 0.1 + 1;
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
  
  // "Drag to aim" hint
  if (!isAiming) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG TO AIM', SHOOT_X, SHOOT_Y + 35);
  }
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

// Column labels
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
  drawBumpers();
  drawBoard();
  drawColumnLabels();
  
  if (ball && !ball.settled) {
    updateBall();
  }
  
  drawBall();
  drawShootPosition();
  drawAimLine();
  
  updateParticles();
  drawParticles();
  updateBumperFlashes();
  
  requestAnimationFrame(gameLoop);
}

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
  ball = null;
  initBumpers();
});

// Start game loop
gameLoop();