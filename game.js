'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (centro vacío)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const startRecordsList = document.getElementById('start-records');
const startStatsEl = document.getElementById('start-stats');
const startResetBtn = document.getElementById('start-reset-btn');
const recordsSection = document.getElementById('records-section');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const saveBtn = document.getElementById('save-btn');
const overRecordsList = document.getElementById('over-records');
const overStatsEl = document.getElementById('over-stats');
const overResetBtn = document.getElementById('over-reset-btn');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';
let highlightColor = 'rgba(255,255,255,0.12)';

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* sin persistencia */ }
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  highlightColor = style.getPropertyValue('--block-highlight').trim();
  // El botón muestra el tema al que se cambiará
  themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
  // Repintar sin reanudar el juego (también en pausa / game over)
  if (current && next) { draw(); drawNext(); }
}

function loadTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
  setTheme(saved === 'light' ? 'light' : 'dark');
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0; // combo actual (locks seguidos que limpian líneas) y máximo de la partida

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
let records = { entries: [], bestCombo: 0, maxLines: 0 };
let pendingEntry = null; // entrada de la partida actual aún sin guardar
let savedEntry = null;   // entrada guardada de la partida actual (para resaltarla)

function loadRecords() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch (e) { /* ignorar */ }
  records = { entries: [], bestCombo: 0, maxLines: 0 };
  if (data && typeof data === 'object') {
    if (Array.isArray(data.entries)) {
      records.entries = data.entries
        .filter(en => en && Number.isFinite(en.score))
        .slice(0, MAX_RECORDS);
    }
    records.bestCombo = Number(data.bestCombo) || 0;
    records.maxLines = Number(data.maxLines) || 0;
  }
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* sin persistencia */ }
}

function qualifiesForTop(sc) {
  if (sc <= 0) return false;
  return records.entries.length < MAX_RECORDS || sc > records.entries[records.entries.length - 1].score;
}

function renderRecords(listEl, highlight, extra) {
  const rows = records.entries.slice();
  if (extra) rows.push(extra);
  rows.sort((a, b) => b.score - a.score); // sort estable: a igualdad, las existentes primero
  listEl.textContent = '';
  const shown = rows.slice(0, MAX_RECORDS);
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin records todavía';
    listEl.appendChild(li);
    return;
  }
  shown.forEach(en => {
    const li = document.createElement('li');
    if (en === highlight) li.classList.add('highlight');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'rec-name';
    nameSpan.textContent = en.name || '---';
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'rec-score';
    scoreSpan.textContent = Number(en.score).toLocaleString();
    li.append(nameSpan, scoreSpan);
    listEl.appendChild(li);
  });
}

function recordsStatsText() {
  return `Mejor combo: ${records.bestCombo} · Líneas máx.: ${records.maxLines}`;
}

function renderStartScreen() {
  renderRecords(startRecordsList, null, null);
  startStatsEl.textContent = recordsStatsText();
}

function resetRecords() {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  records = { entries: [], bestCombo: 0, maxLines: 0 };
  saveRecords();
  pendingEntry = null;
  savedEntry = null;
  nameForm.classList.add('hidden');
  renderStartScreen();
  renderRecords(overRecordsList, null, null);
  overStatsEl.textContent = recordsStatsText();
}

function saveEntry() {
  if (!pendingEntry) return;
  pendingEntry.name = nameInput.value.trim().slice(0, 12) || 'Anónimo';
  records.entries.push(pendingEntry);
  records.entries.sort((a, b) => b.score - a.score);
  records.entries = records.entries.slice(0, MAX_RECORDS);
  saveRecords();
  savedEntry = pendingEntry;
  pendingEntry = null;
  nameForm.classList.add('hidden');
  renderRecords(overRecordsList, savedEntry, null);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  // Records: actualizar máximos globales y mostrar la tabla
  loadRecords();
  if (maxCombo > records.bestCombo) records.bestCombo = maxCombo;
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords();
  savedEntry = null;
  pendingEntry = null;
  if (qualifiesForTop(score)) {
    pendingEntry = { name: '', score, lines, combo: maxCombo, date: new Date().toISOString() };
    nameForm.classList.remove('hidden');
    nameInput.value = '';
  } else {
    nameForm.classList.add('hidden');
  }
  renderRecords(overRecordsList, pendingEntry, pendingEntry);
  overStatsEl.textContent = recordsStatsText();
  recordsSection.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (pendingEntry) nameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    recordsSection.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  pendingEntry = null;
  savedEntry = null;
  startScreen.classList.add('hidden');
  recordsSection.classList.add('hidden');
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // No jugar mientras se escribe en un campo de texto (p. ej. el nombre del record)
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // evita que Space reactive el botón en lugar del hard drop
});

playBtn.addEventListener('click', () => { init(); playBtn.blur(); });
saveBtn.addEventListener('click', () => { saveEntry(); saveBtn.blur(); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveEntry(); });
startResetBtn.addEventListener('click', () => { resetRecords(); startResetBtn.blur(); });
overResetBtn.addEventListener('click', () => { resetRecords(); overResetBtn.blur(); });

// El juego arranca desde la pantalla de inicio (botón Jugar)
loadRecords();
renderStartScreen();
loadTheme();
