// Basketball Connect 4 — Drawing/Rendering Module
// All canvas drawing functions. Uses globals from game.js and odds.js.

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

function drawBackground() {
  const grad = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 50, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
  grad.addColorStop(0, '#1a1a4e');
  grad.addColorStop(1, '#0a0a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.strokeStyle = 'rgba(100, 100, 200, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CANVAS_WIDTH; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
  }
  for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
  }
}

function drawPiece(cx, cy, color, glow) {
  ctx.beginPath(); ctx.arc(cx, cy, PIECE_RADIUS + 4, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
  const grad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, PIECE_RADIUS);
  grad.addColorStop(0, lightenColor(color, 40)); grad.addColorStop(0.7, color); grad.addColorStop(1, darkenColor(color, 30));
  ctx.beginPath(); ctx.arc(cx, cy, PIECE_RADIUS, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.arc(cx - PIECE_RADIUS * 0.25, cy - PIECE_RADIUS * 0.25, PIECE_RADIUS * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, PIECE_RADIUS * 0.65, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 2; ctx.stroke();
}

function drawBall(x, y, rotation) {
  ctx.beginPath(); ctx.arc(x, y, BALL_RADIUS + 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 140, 0, 0.3)'; ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation || 0);
  const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, BALL_RADIUS);
  grad.addColorStop(0, '#ffaa44'); grad.addColorStop(0.5, '#ff8c00'); grad.addColorStop(1, '#cc5500');
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = '#883300'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-BALL_RADIUS, 0); ctx.lineTo(BALL_RADIUS, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -BALL_RADIUS); ctx.lineTo(0, BALL_RADIUS); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS * 0.7, -Math.PI * 0.4, Math.PI * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS * 0.7, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.3, BALL_RADIUS * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fill();
  ctx.restore();
}

function drawBoard() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(BOARD_X + 5, BOARD_Y + 5, BOARD_WIDTH, BOARD_HEIGHT);
  const boardGrad = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X, BOARD_Y + BOARD_HEIGHT);
  boardGrad.addColorStop(0, '#1a3366'); boardGrad.addColorStop(1, '#0d1b3e');
  ctx.fillStyle = boardGrad;
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
  ctx.strokeStyle = '#3355aa'; ctx.lineWidth = 3; ctx.stroke();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = BOARD_Y + r * CELL_SIZE + CELL_SIZE / 2;
      ctx.beginPath(); ctx.arc(cx, cy, PIECE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#060d1f'; ctx.fill();
      ctx.strokeStyle = '#1a2a55'; ctx.lineWidth = 2; ctx.stroke();
      if (board[r] && board[r][c] === 1) drawPiece(cx, cy, P1_COLOR, P1_GLOW);
      else if (board[r] && board[r][c] === 2) drawPiece(cx, cy, P2_COLOR, P2_GLOW);
    }
  }

  if (winCells) {
    winPulse += 0.08;
    const pulse = Math.sin(winPulse) * 0.3 + 0.7;
    for (const [r, c] of winCells) {
      const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = BOARD_Y + r * CELL_SIZE + CELL_SIZE / 2;
      ctx.beginPath(); ctx.arc(cx, cy, PIECE_RADIUS + 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 50, ${pulse * 0.5})`; ctx.fill();
    }
  }
}

function drawColumnSelectors() {
  const ballAnimActive = (gameMode === 'turnBased') ? (ballAnims.length > 0) : false;
  for (let c = 0; c < COLS; c++) {
    const cx = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
    const cy = SELECTOR_Y;
    let colFull = true;
    for (let r = 0; r < ROWS; r++) { if (board[r] && board[r][c] === 0) { colFull = false; break; } }
    if (colFull) {
      ctx.fillStyle = 'rgba(255, 50, 50, 0.3)'; ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', cx, cy);
      if (!((hoveredCol === c) && canShoot && !ballAnimActive)) continue;
    }
    const isHovered = (hoveredCol === c) && canShoot && !ballAnimActive;
    const playerColor = playerNumber === 1 ? P1_COLOR : P2_COLOR;
    if (isHovered) {
      ctx.fillStyle = `rgba(${playerNumber === 1 ? '255,68,68' : '68,170,255'}, 0.08)`;
      ctx.fillRect(BOARD_X + c * CELL_SIZE, SELECTOR_Y - 15, CELL_SIZE, BOARD_HEIGHT + (BOARD_Y - SELECTOR_Y) + 15);
    }
    if (isHovered) {
      ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${playerNumber === 1 ? '255,68,68' : '68,170,255'}, 0.25)`; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.strokeStyle = playerColor; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = playerColor; ctx.beginPath();
      ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 8, cy + 8); ctx.lineTo(cx, cy + 18);
      ctx.closePath(); ctx.fill();
    } else if (canShoot && !ballAnimActive) {
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(150, 150, 255, 0.25)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 150, 255, 0.3)'; ctx.fill();
    }
  }
}

function drawProbabilityChart() {
  const ballAnimActive = (gameMode === 'turnBased') ? (ballAnims.length > 0) : false;
  if (!canShoot || ballAnimActive || hoveredCol === -1) return;
  let odds;
  if (gameMode === 'simultaneous') {
    odds = calculateFocusedOdds(hoveredCol, hoveredCellOffset, focusTime);
  } else {
    odds = calculateOdds(hoveredCol, hoveredCellOffset);
  }
  odds = redistributeFullColumns(odds, board, ROWS);
  const maxOdd = Math.max(...odds, 50);
  const playerColor = playerNumber === 1 ? P1_COLOR : P2_COLOR;
  const chartBottom = CHART_Y + CHART_HEIGHT;
  for (let c = 0; c < COLS; c++) {
    const barX = BOARD_X + c * CELL_SIZE + BAR_GAP;
    const barHeight = (odds[c] / maxOdd) * CHART_HEIGHT;
    const barY = chartBottom - barHeight;
    let colFull = true;
    for (let r = 0; r < ROWS; r++) { if (board[r] && board[r][c] === 0) { colFull = false; break; } }
    let barColor, barAlpha;
    if (c === hoveredCol) { barColor = playerColor; barAlpha = 0.85; }
    else if (odds[c] >= 15) { barColor = '#ff8c00'; barAlpha = 0.7; }
    else { barColor = '#6677aa'; barAlpha = 0.5; }
    if (colFull) barAlpha *= 0.3;
    ctx.globalAlpha = barAlpha;
    const radius = Math.min(4, BAR_WIDTH / 2);
    ctx.beginPath();
    ctx.moveTo(barX + radius, barY); ctx.lineTo(barX + BAR_WIDTH - radius, barY);
    ctx.quadraticCurveTo(barX + BAR_WIDTH, barY, barX + BAR_WIDTH, barY + radius);
    ctx.lineTo(barX + BAR_WIDTH, chartBottom); ctx.lineTo(barX, chartBottom);
    ctx.lineTo(barX, barY + radius); ctx.quadraticCurveTo(barX, barY, barX + radius, barY);
    ctx.closePath(); ctx.fillStyle = barColor; ctx.fill();
    ctx.globalAlpha = colFull ? 0.2 : 0.9;
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(odds[c] + '%', barX + BAR_WIDTH / 2, barY - 3);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(BOARD_X, chartBottom); ctx.lineTo(BOARD_X + BOARD_WIDTH, chartBottom); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.font = '10px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('PROBABILITY', CANVAS_WIDTH / 2, CHART_Y - 14);
}

function drawColumnLabels() {
  ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(100, 150, 255, 0.4)';
  for (let c = 0; c < COLS; c++) {
    const x = BOARD_X + c * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillText((c + 1).toString(), x, BOARD_Y + BOARD_HEIGHT + 25);
  }
}

function drawShootPosition() {
  const ballAnimActive = (gameMode === 'turnBased') ? (ballAnims.length > 0) : false;
  if (!canShoot || ballAnimActive) return;
  ctx.save(); ctx.translate(SHOOT_X, SHOOT_Y);
  const pulse = Math.sin(Date.now() * 0.005) * 0.08 + 1;
  ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS + 10, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 140, 0, ${0.15 + Math.sin(Date.now() * 0.003) * 0.1})`; ctx.fill();
  const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, BALL_RADIUS);
  grad.addColorStop(0, '#ffaa44'); grad.addColorStop(0.5, '#ff8c00'); grad.addColorStop(1, '#cc5500');
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = '#883300'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-BALL_RADIUS, 0); ctx.lineTo(BALL_RADIUS, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -BALL_RADIUS); ctx.lineTo(0, BALL_RADIUS); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS * 0.7, -Math.PI * 0.4, Math.PI * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, BALL_RADIUS * 0.7, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.3, BALL_RADIUS * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('SELECT A COLUMN ↑', SHOOT_X, SHOOT_Y + 28);
}

function drawCooldownUI() {
  if (gameMode !== 'simultaneous' || gameStatus !== 'playing') return;
  const now = Date.now();
  if (now < cooldownEnd) {
    const total = 1000;
    const remaining = cooldownEnd - now;
    const progress = 1 - remaining / total;
    ctx.beginPath(); ctx.arc(SHOOT_X, SHOOT_Y, BALL_RADIUS + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(255, 50, 50, 0.7)'; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.fillText('COOLDOWN', SHOOT_X, SHOOT_Y + BALL_RADIUS + 30);
  } else if (focusTime > 0) {
    const ft = Math.min(focusTime, FOCUS_MAX_S);
    const progress = ft / FOCUS_MAX_S;
    const brightness = 0.3 + progress * 0.7;
    ctx.beginPath(); ctx.arc(SHOOT_X, SHOOT_Y, BALL_RADIUS + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = `rgba(50, 255, 100, ${brightness})`; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = `rgba(50, 255, 100, ${brightness})`; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.fillText(`FOCUS: ${ft.toFixed(1)}s`, SHOOT_X, SHOOT_Y + BALL_RADIUS + 30);
  }
}

function drawOpponentAim() {
  if (gameMode !== 'simultaneous' || !opponentAim) return;
  const oppColor = playerNumber === 1 ? P2_COLOR : P1_COLOR;
  const col = opponentAim.targetColumn;
  if (col < 0 || col >= COLS) return;
  const cx = BOARD_X + col * CELL_SIZE + CELL_SIZE / 2;
  const cy = SELECTOR_Y;
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.strokeStyle = oppColor; ctx.lineWidth = 2; ctx.stroke();
  if (opponentAim.focusTime > 0) {
    const ft = Math.min(opponentAim.focusTime, FOCUS_MAX_S);
    const progress = ft / FOCUS_MAX_S;
    ctx.beginPath(); ctx.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = oppColor; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBallAnimation() {
  for (const anim of ballAnims) {
    // Draw trail
    if (anim.trail) {
      for (let i = 0; i < anim.trail.length; i++) {
        const t = anim.trail[i];
        if (t.life <= 0) continue;
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_RADIUS * t.life * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 140, 0, ${t.life * 0.25})`; ctx.fill();
      }
    }
    if (anim.currentX !== undefined) {
      drawBall(anim.currentX, anim.currentY, anim.rotation);
    }
  }
}
