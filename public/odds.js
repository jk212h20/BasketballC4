// Basketball Connect 4 — Odds Calculation Module
// Shared between turn-based and simultaneous modes

const COLS = 7;
const FOCUS_STANDARD_S = 3;
const FOCUS_MAX_S = 5;

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

function getUniformOdds() {
  const odds = new Array(COLS).fill(14);
  odds[3] = 16;
  odds[0] = 15;
  // [15, 14, 14, 16, 14, 14, 14] = 101... fix:
  // Actually let's do [15, 14, 14, 15, 14, 14, 14] = 100
  odds[3] = 15;
  return odds;
}

function getGuaranteedOdds(targetCol) {
  const odds = new Array(COLS).fill(0);
  odds[targetCol] = 100;
  return odds;
}

function calculateFocusedOdds(targetCol, cellOffset, ft) {
  ft = Math.max(0, Math.min(FOCUS_MAX_S, ft));
  const uniform = getUniformOdds();
  const standard = calculateOdds(targetCol, cellOffset);
  const guaranteed = getGuaranteedOdds(targetCol);
  let raw;
  if (ft <= FOCUS_STANDARD_S) {
    const t = ft / FOCUS_STANDARD_S;
    raw = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) raw[c] = uniform[c] * (1 - t) + standard[c] * t;
  } else {
    const t = (ft - FOCUS_STANDARD_S) / (FOCUS_MAX_S - FOCUS_STANDARD_S);
    raw = new Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) raw[c] = standard[c] * (1 - t) + guaranteed[c] * t;
  }
  return roundOddsTo100(raw);
}

function redistributeFullColumns(odds, board, ROWS) {
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
