const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Game state
const games = {};
const waitingPlayers = { turnBased: [], simultaneous: [] };

// Connect 4 constants
const ROWS = 6;
const COLS = 7;

// Simultaneous mode constants
const COOLDOWN_MS = 1000; // 1 second cooldown between shots
const FOCUS_STANDARD_S = 3; // seconds to reach standard odds
const FOCUS_MAX_S = 5; // seconds to reach guaranteed

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function checkWin(board, player) {
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (board[r][c] === player && board[r][c+1] === player && 
          board[r][c+2] === player && board[r][c+3] === player) {
        return [[r,c],[r,c+1],[r,c+2],[r,c+3]];
      }
    }
  }
  // Vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === player && board[r+1][c] === player && 
          board[r+2][c] === player && board[r+3][c] === player) {
        return [[r,c],[r+1,c],[r+2,c],[r+3,c]];
      }
    }
  }
  // Diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (board[r][c] === player && board[r+1][c+1] === player && 
          board[r+2][c+2] === player && board[r+3][c+3] === player) {
        return [[r,c],[r+1,c+1],[r+2,c+2],[r+3,c+3]];
      }
    }
  }
  // Diagonal down-left
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      if (board[r][c] === player && board[r+1][c-1] === player && 
          board[r+2][c-2] === player && board[r+3][c-3] === player) {
        return [[r,c],[r+1,c-1],[r+2,c-2],[r+3,c-3]];
      }
    }
  }
  return null;
}

function isBoardFull(board) {
  return board[0].every(cell => cell !== 0);
}

function getLowestRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) return r;
  }
  return -1;
}

// --- Odds calculation ---

function getCenterOdds(targetCol) {
  const odds = new Array(COLS).fill(0);
  const isEdge = (targetCol === 0 || targetCol === COLS - 1);
  if (isEdge) {
    odds[targetCol] = 50;
    if (targetCol === 0) {
      odds[1] = 30;
      for (let c = 2; c < COLS; c++) odds[c] = 4;
    } else {
      odds[COLS - 2] = 30;
      for (let c = 0; c < COLS - 2; c++) odds[c] = 4;
    }
  } else {
    odds[targetCol] = 50;
    odds[targetCol - 1] = 15;
    odds[targetCol + 1] = 15;
    for (let c = 0; c < COLS; c++) {
      if (odds[c] === 0) odds[c] = 5;
    }
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

function getStandardOdds(targetCol, cellOffset) {
  cellOffset = Math.max(0, Math.min(1, cellOffset));
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

function getUniformOdds() {
  // 100 / 7 ≈ 14.28 — round to integers summing to 100
  const odds = new Array(COLS).fill(14);
  // 14 * 7 = 98, need 2 more
  odds[3] = 16; // center gets the extras
  odds[0] = 15;
  return odds;
}

function getGuaranteedOdds(targetCol) {
  const odds = new Array(COLS).fill(0);
  odds[targetCol] = 100;
  return odds;
}

// Focus-based odds: interpolates uniform → standard → guaranteed over 0-5 seconds
function calculateFocusedOdds(targetCol, cellOffset, focusTime) {
  focusTime = Math.max(0, Math.min(FOCUS_MAX_S, focusTime));
  
  const uniform = getUniformOdds();
  const standard = getStandardOdds(targetCol, cellOffset);
  const guaranteed = getGuaranteedOdds(targetCol);
  
  let raw;
  if (focusTime <= FOCUS_STANDARD_S) {
    // Phase 1: uniform → standard (0 to 3 seconds)
    const t = focusTime / FOCUS_STANDARD_S;
    raw = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) raw[c] = uniform[c] * (1 - t) + standard[c] * t;
  } else {
    // Phase 2: standard → guaranteed (3 to 5 seconds)
    const t = (focusTime - FOCUS_STANDARD_S) / (FOCUS_MAX_S - FOCUS_STANDARD_S);
    raw = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) raw[c] = standard[c] * (1 - t) + guaranteed[c] * t;
  }
  
  return roundOddsTo100(raw);
}

// Turn-based mode still uses the standard calculation
function calculateOdds(targetCol, cellOffset) {
  return getStandardOdds(targetCol, cellOffset);
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

function redistributeFullColumns(odds, board) {
  const available = new Array(COLS).fill(false);
  for (let c = 0; c < COLS; c++) available[c] = getLowestRow(board, c) !== -1;
  if (available.every(a => a)) return odds;
  if (!available.some(a => a)) return null;
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

function rollColumn(odds, board) {
  const finalOdds = redistributeFullColumns(odds, board);
  if (!finalOdds) return -1;
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (let c = 0; c < COLS; c++) {
    cumulative += finalOdds[c];
    if (roll < cumulative) return c;
  }
  for (let c = 0; c < COLS; c++) { if (getLowestRow(board, c) !== -1) return c; }
  return -1;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // --- Join game with mode selection ---
  socket.on('join-game', (data) => {
    const mode = (data && data.mode === 'simultaneous') ? 'simultaneous' : 'turnBased';
    const queue = waitingPlayers[mode];

    if (queue.length > 0) {
      const otherSocket = queue.pop();
      const roomId = generateRoomId();
      
      const game = {
        id: roomId,
        mode,
        players: [otherSocket.id, socket.id],
        board: createBoard(),
        currentPlayer: 1, // only used in turnBased
        status: 'playing',
        winner: null,
        winningCells: null,
        shotsTaken: 0,
        // Simultaneous mode: per-player state
        cooldowns: { 1: 0, 2: 0 }, // timestamp when cooldown expires (0 = ready)
        readyTimes: { 1: 0, 2: 0 }, // timestamp when cooldown ended (for focus calc)
      };
      games[roomId] = game;

      otherSocket.join(roomId);
      socket.join(roomId);

      otherSocket.emit('game-start', { 
        roomId, 
        playerNumber: 1, 
        opponent: socket.id,
        mode
      });
      socket.emit('game-start', { 
        roomId, 
        playerNumber: 2, 
        opponent: otherSocket.id,
        mode
      });

      io.to(roomId).emit('game-state', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        status: game.status,
        mode
      });

      console.log(`Game started (${mode}): ${roomId}`);
    } else {
      queue.push(socket);
      socket.emit('waiting', { mode });
    }
  });

  // --- Opponent aiming (simultaneous mode) ---
  socket.on('aim-update', (data) => {
    const game = Object.values(games).find(g => g.players.includes(socket.id));
    if (!game || game.status !== 'playing' || game.mode !== 'simultaneous') return;
    
    const playerIndex = game.players.indexOf(socket.id);
    // Forward aim info to opponent only
    socket.to(game.id).emit('opponent-aim', {
      player: playerIndex + 1,
      targetColumn: data.targetColumn,
      cellOffset: data.cellOffset,
      focusTime: data.focusTime
    });
  });

  // --- Shoot ---
  socket.on('shoot', (data) => {
    const game = Object.values(games).find(g => g.players.includes(socket.id));
    if (!game || game.status !== 'playing') return;

    const playerIndex = game.players.indexOf(socket.id);
    const playerNumber = playerIndex + 1;

    const { targetColumn, cellOffset } = data;
    if (targetColumn < 0 || targetColumn >= COLS) return;
    const offset = typeof cellOffset === 'number' ? Math.max(0, Math.min(1, cellOffset)) : 0.5;

    if (game.mode === 'turnBased') {
      // --- Turn-based mode (unchanged logic) ---
      if (playerNumber !== game.currentPlayer) return;

      const odds = calculateOdds(targetColumn, offset);
      const actualColumn = rollColumn(odds, game.board);
      if (actualColumn === -1) return;

      const row = getLowestRow(game.board, actualColumn);
      if (row === -1) return;

      game.board[row][actualColumn] = playerNumber;
      game.shotsTaken++;

      const winCells = checkWin(game.board, playerNumber);
      if (winCells) {
        game.status = 'won';
        game.winner = playerNumber;
        game.winningCells = winCells;
      } else if (isBoardFull(game.board)) {
        game.status = 'draw';
      } else {
        game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
      }

      io.to(game.id).emit('shot-result', {
        targetColumn,
        actualColumn,
        row,
        player: playerNumber,
        board: game.board,
        currentPlayer: game.currentPlayer,
        status: game.status,
        winner: game.winner,
        winningCells: game.winningCells
      });

    } else {
      // --- Simultaneous mode ---
      const now = Date.now();

      // Check cooldown
      if (now < game.cooldowns[playerNumber]) {
        socket.emit('shot-rejected', { reason: 'cooldown', remainingMs: game.cooldowns[playerNumber] - now });
        return;
      }

      // Calculate focus time (server-authoritative)
      const readyTime = game.readyTimes[playerNumber] || now;
      const focusTime = Math.max(0, (now - readyTime) / 1000); // in seconds

      const odds = calculateFocusedOdds(targetColumn, offset, focusTime);
      const actualColumn = rollColumn(odds, game.board);
      if (actualColumn === -1) return;

      const row = getLowestRow(game.board, actualColumn);
      if (row === -1) return;

      game.board[row][actualColumn] = playerNumber;
      game.shotsTaken++;

      // Set cooldown for this player
      game.cooldowns[playerNumber] = now + COOLDOWN_MS;
      game.readyTimes[playerNumber] = now + COOLDOWN_MS; // ready time = when cooldown ends

      // Check for win
      const winCells = checkWin(game.board, playerNumber);
      if (winCells) {
        game.status = 'won';
        game.winner = playerNumber;
        game.winningCells = winCells;
      } else if (isBoardFull(game.board)) {
        game.status = 'draw';
      }

      // Broadcast to both players
      io.to(game.id).emit('shot-result', {
        targetColumn,
        actualColumn,
        row,
        player: playerNumber,
        board: game.board,
        currentPlayer: game.currentPlayer, // not used in simultaneous but kept for compat
        status: game.status,
        winner: game.winner,
        winningCells: game.winningCells,
        // Simultaneous-specific: tell this player their new cooldown
        cooldownEnd: game.cooldowns[playerNumber],
        focusTime: focusTime
      });
    }
  });

  socket.on('play-again', () => {
    const game = Object.values(games).find(g => g.players.includes(socket.id));
    if (!game) return;

    game.board = createBoard();
    game.currentPlayer = 1;
    game.status = 'playing';
    game.winner = null;
    game.winningCells = null;
    game.shotsTaken = 0;
    const now = Date.now();
    game.cooldowns = { 1: 0, 2: 0 };
    game.readyTimes = { 1: now, 2: now };

    io.to(game.id).emit('game-state', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      status: game.status,
      mode: game.mode
    });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove from both waiting lists
    for (const mode of ['turnBased', 'simultaneous']) {
      const idx = waitingPlayers[mode].indexOf(socket);
      if (idx !== -1) waitingPlayers[mode].splice(idx, 1);
    }

    const game = Object.values(games).find(g => g.players.includes(socket.id));
    if (game) {
      game.status = 'disconnected';
      socket.to(game.id).emit('opponent-disconnected');
      delete games[game.id];
    }
  });
});

server.listen(PORT, () => {
  console.log(`🏀 Basketball C4 running on port ${PORT}`);
});
