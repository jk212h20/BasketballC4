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

    // The client sends the final column the ball landed in after physics simulation
    const { column } = data;
    
    if (column < 0 || column >= COLS) return;
    
    const row = getLowestRow(game.board, column);
    if (row === -1) return; // Column full

    game.board[row][column] = playerNumber;
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

    // Broadcast the shot result (all clients animate the same physics)
    io.to(game.id).emit('shot-result', {
      column,
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