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
const waitingPlayers = [];

// Connect 4 constants
const ROWS = 6;
const COLS = 7;

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

// Odds calculation with position-based interpolation
// centerOdds: odds when clicking dead center of a cell
// edgeOdds: odds when clicking the boundary between two cells
// cellOffset (0.0 = left edge of cell, 0.5 = center, 1.0 = right edge)
// The offset interpolates between center odds and edge odds.

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
  // side: 'left' (toward col-1) or 'right' (toward col+1)
  // At the edge, the two columns share prominence: 30/30 with 14 for next-adjacent
  const odds = new Array(COLS).fill(0);
  const neighborCol = side === 'left' ? targetCol - 1 : targetCol + 1;

  if (neighborCol < 0 || neighborCol >= COLS) {
    // At the board edge — no neighbor, use center odds
    return getCenterOdds(targetCol);
  }

  // Both the target and neighbor get 30%
  odds[targetCol] = 30;
  odds[neighborCol] = 30;

  // Next-adjacent columns get 14%
  const adj1 = side === 'left' ? targetCol + 1 : targetCol - 1;
  const adj2 = side === 'left' ? neighborCol - 1 : neighborCol + 1;
  if (adj1 >= 0 && adj1 < COLS) odds[adj1] = 14;
  if (adj2 >= 0 && adj2 < COLS && odds[adj2] === 0) odds[adj2] = 14;

  // Remaining columns split the rest to total 100
  let assigned = 0;
  let unassignedCount = 0;
  for (let c = 0; c < COLS; c++) {
    assigned += odds[c];
    if (odds[c] === 0) unassignedCount++;
  }
  const remaining = 100 - assigned;
  if (unassignedCount > 0) {
    const each = Math.floor(remaining / unassignedCount);
    let leftover = remaining - each * unassignedCount;
    for (let c = 0; c < COLS; c++) {
      if (odds[c] === 0) {
        odds[c] = each + (leftover > 0 ? 1 : 0);
        if (leftover > 0) leftover--;
      }
    }
  }
  return odds;
}

function calculateOdds(targetCol, cellOffset) {
  // cellOffset: 0.0 = left edge, 0.5 = center, 1.0 = right edge
  // Clamp to [0, 1]
  cellOffset = Math.max(0, Math.min(1, cellOffset));

  const center = getCenterOdds(targetCol);

  // How far from center? 0 at center, 1 at edge
  let edgeness, side;
  if (cellOffset <= 0.5) {
    edgeness = (0.5 - cellOffset) / 0.5; // 0 at center, 1 at left edge
    side = 'left';
  } else {
    edgeness = (cellOffset - 0.5) / 0.5; // 0 at center, 1 at right edge
    side = 'right';
  }

  if (edgeness < 0.01) return center; // Dead center, no interpolation needed

  const edge = getEdgeOdds(targetCol, side);

  // Interpolate
  const raw = new Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    raw[c] = center[c] * (1 - edgeness) + edge[c] * edgeness;
  }

  // Round to integers that sum to 100
  return roundOddsTo100(raw);
}

function roundOddsTo100(raw) {
  const floored = raw.map(v => Math.floor(v));
  let sum = floored.reduce((a, b) => a + b, 0);
  const remainders = raw.map((v, i) => ({ i, r: v - floored[i] }));
  remainders.sort((a, b) => b.r - a.r);
  let deficit = 100 - sum;
  for (let k = 0; k < deficit; k++) {
    floored[remainders[k].i]++;
  }
  return floored;
}

// Full-column redistribution: spread full column's odds to nearest available neighbors
function redistributeFullColumns(odds, board) {
  const available = new Array(COLS).fill(false);
  for (let c = 0; c < COLS; c++) {
    available[c] = getLowestRow(board, c) !== -1;
  }

  // If all available, no redistribution needed
  if (available.every(a => a)) return odds;

  // If none available, board is full
  if (!available.some(a => a)) return null;

  const result = odds.slice();

  // For each full column, distribute its probability to nearest available columns on each side
  for (let c = 0; c < COLS; c++) {
    if (available[c] || result[c] === 0) continue;

    const prob = result[c];
    result[c] = 0;

    // Find nearest available column on the left
    let leftCol = -1;
    for (let l = c - 1; l >= 0; l--) {
      if (available[l]) { leftCol = l; break; }
    }

    // Find nearest available column on the right
    let rightCol = -1;
    for (let r = c + 1; r < COLS; r++) {
      if (available[r]) { rightCol = r; break; }
    }

    if (leftCol >= 0 && rightCol >= 0) {
      // Split evenly between nearest available on each side
      const half = Math.floor(prob / 2);
      result[leftCol] += half;
      result[rightCol] += prob - half;
    } else if (leftCol >= 0) {
      result[leftCol] += prob;
    } else if (rightCol >= 0) {
      result[rightCol] += prob;
    }
  }

  return result;
}

function rollColumn(targetCol, cellOffset, board) {
  let odds = calculateOdds(targetCol, cellOffset);

  // Redistribute full columns to neighbors
  odds = redistributeFullColumns(odds, board);
  if (!odds) return -1; // Board completely full

  // Roll
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (let c = 0; c < COLS; c++) {
    cumulative += odds[c];
    if (roll < cumulative) return c;
  }

  // Fallback
  for (let c = 0; c < COLS; c++) {
    if (getLowestRow(board, c) !== -1) return c;
  }
  return -1;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join-game', () => {
    if (waitingPlayers.length > 0) {
      const otherSocket = waitingPlayers.pop();
      const roomId = generateRoomId();
      
      const game = {
        id: roomId,
        players: [otherSocket.id, socket.id],
        board: createBoard(),
        currentPlayer: 1,
        status: 'playing',
        winner: null,
        winningCells: null,
        shotsTaken: 0
      };
      games[roomId] = game;

      otherSocket.join(roomId);
      socket.join(roomId);

      otherSocket.emit('game-start', { 
        roomId, 
        playerNumber: 1, 
        opponent: socket.id 
      });
      socket.emit('game-start', { 
        roomId, 
        playerNumber: 2, 
        opponent: otherSocket.id 
      });

      io.to(roomId).emit('game-state', {
        board: game.board,
        currentPlayer: game.currentPlayer,
        status: game.status
      });

      console.log(`Game started: ${roomId}`);
    } else {
      waitingPlayers.push(socket);
      socket.emit('waiting');
    }
  });

  socket.on('shoot', (data) => {
    const game = Object.values(games).find(g => g.players.includes(socket.id));
    if (!game || game.status !== 'playing') return;

    const playerIndex = game.players.indexOf(socket.id);
    const playerNumber = playerIndex + 1;
    
    if (playerNumber !== game.currentPlayer) return;

    const { targetColumn, cellOffset } = data;
    
    if (targetColumn < 0 || targetColumn >= COLS) return;

    // Roll the actual column based on odds + position within cell
    const offset = typeof cellOffset === 'number' ? Math.max(0, Math.min(1, cellOffset)) : 0.5;
    const actualColumn = rollColumn(targetColumn, offset, game.board);
    if (actualColumn === -1) return; // Board full somehow

    const row = getLowestRow(game.board, actualColumn);
    if (row === -1) return; // Shouldn't happen after rollColumn

    game.board[row][actualColumn] = playerNumber;
    game.shotsTaken++;

    // Check win
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

    // Broadcast the shot result — both clients animate the same arc
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

    io.to(game.id).emit('game-state', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      status: game.status
    });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove from waiting list
    const waitIndex = waitingPlayers.indexOf(socket);
    if (waitIndex !== -1) waitingPlayers.splice(waitIndex, 1);

    // Notify opponent
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
