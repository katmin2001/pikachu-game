'use strict';

/* ==================== Cấu hình ==================== */
const SPRITE = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

// Danh sách Pokemon gen 1 dùng làm hình ô (id theo PokeAPI)
const POKE_IDS = [1, 3, 4, 6, 7, 9, 12, 15, 18, 19, 21, 23, 25, 27, 29, 32, 35, 37, 39, 41, 43, 46, 48, 50, 52, 54, 56, 58, 60, 63, 65, 66, 68, 69, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 90, 92, 94, 95, 96, 98, 100, 102, 104, 106, 108, 109, 111, 113, 115, 116, 118, 120, 122, 123, 124, 125, 126, 127, 128, 129, 131, 132, 133, 135, 137, 138, 140, 142, 143, 144, 145, 146, 147, 149, 150, 151];

const LEVELS = [
  { rows: 6,  cols: 8,  types: 12, time: 180 },
  { rows: 8,  cols: 10, types: 16, time: 240 },
  { rows: 10, cols: 12, types: 20, time: 300 },
  { rows: 12, cols: 12, types: 24, time: 340 },
  { rows: 12, cols: 14, types: 28, time: 380 },
];
function getConfig(level) {
  if (level <= LEVELS.length) return LEVELS[level - 1];
  return { rows: 14, cols: 14, types: 30, time: 420 };
}

const DIFFS = {
  easy:   { label: 'Dễ',    mult: 1.3  },
  normal: { label: 'Thường', mult: 1.0  },
  hard:   { label: 'Khó',   mult: 0.75 },
};
const MODES = {
  timed: { label: 'Tính giờ' },
  relax: { label: 'Thư giãn' },
};

const HINTS_PER_LEVEL = 3;
const SCORE_PER_PAIR = 100;
const COMBO_WINDOW = 4000;  // ms: ăn cặp tiếp theo trong 4s để giữ combo
const COMBO_MAX = 8;        // nhân tối đa x8

/* ==================== Trạng thái ==================== */
let grid = [];      // lưới có viền số 0, grid[y][x], x: 0..cols+1, y: 0..rows+1
let rows = 0, cols = 0;
let score = 0, level = 1, best = 0;
let difficulty = 'normal';
let mode = 'timed';
let selDifficulty = 'normal', selMode = 'timed'; // lựa chọn trên màn hình bắt đầu
let timeLeft = 0, timeMax = 1;
let hints = HINTS_PER_LEVEL;
let remaining = 0;
let selected = null;  // {x, y} theo tọa độ có viền
let lock = false, paused = false, muted = false, musicOn = true;
let tickId = null;
let combo = 0, lastMatchAt = 0;
let cellEls = [];

/* ==================== Lưu tiến trình (localStorage) ==================== */
const SAVE_KEY = 'pikachu_save_v1';
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || null;
  } catch (e) { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* bỏ qua */ }
}
// Lưu điểm + màn hiện tại (gọi khi điểm/màn thay đổi)
function saveProgress() {
  best = Math.max(best, score);
  writeSave({ score, level, difficulty, mode, best });
}
// Xóa tiến trình khi thua (giữ lại kỷ lục)
function clearProgress() {
  writeSave({ score: 0, level: 1, difficulty, mode, best });
}

/* ==================== Thuật toán (thuần, không phụ thuộc DOM) ==================== */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Đường thẳng giữa a và b có trống không (không tính 2 đầu)
function clearLine(g, a, b) {
  if (a.x === b.x && a.y === b.y) return true;
  if (a.x === b.x) {
    const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    for (let y = y1 + 1; y < y2; y++) if (g[y][a.x] !== 0) return false;
    return true;
  }
  if (a.y === b.y) {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    for (let x = x1 + 1; x < x2; x++) if (g[a.y][x] !== 0) return false;
    return true;
  }
  return false;
}

// Trả về mảng điểm vẽ đường nối nếu nối được (tối đa gấp khúc 2 lần), ngược lại null
function canConnect(g, p1, p2) {
  const H = g.length, W = g[0].length;
  if (p1.x === p2.x && p1.y === p2.y) return null;
  if (g[p1.y][p1.x] !== g[p2.y][p2.x]) return null;
  const empty = (p) => g[p.y][p.x] === 0;
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const cornerOk = (c) => same(c, p1) || same(c, p2) || empty(c);

  if (clearLine(g, p1, p2)) return [p1, p2];

  const c1 = { x: p1.x, y: p2.y };
  const c2 = { x: p2.x, y: p1.y };
  if (cornerOk(c1) && clearLine(g, p1, c1) && clearLine(g, c1, p2)) return [p1, c1, p2];
  if (cornerOk(c2) && clearLine(g, p1, c2) && clearLine(g, c2, p2)) return [p1, c2, p2];

  for (let y = 0; y < H; y++) {
    const a = { x: p1.x, y }, b = { x: p2.x, y };
    if (!same(a, p1) && !empty(a)) continue;
    if (!same(b, p2) && !empty(b)) continue;
    if (clearLine(g, p1, a) && clearLine(g, a, b) && clearLine(g, b, p2)) return [p1, a, b, p2];
  }
  for (let x = 0; x < W; x++) {
    const a = { x, y: p1.y }, b = { x, y: p2.y };
    if (!same(a, p1) && !empty(a)) continue;
    if (!same(b, p2) && !empty(b)) continue;
    if (clearLine(g, p1, a) && clearLine(g, a, b) && clearLine(g, b, p2)) return [p1, a, b, p2];
  }
  return null;
}

function forEachTile(g, fn) {
  for (let y = 1; y < g.length - 1; y++)
    for (let x = 1; x < g[0].length - 1; x++)
      if (g[y][x] !== 0) fn(x, y, g[y][x]);
}

function hasAnyMove(g) {
  const tiles = [];
  forEachTile(g, (x, y, v) => tiles.push({ x, y, v }));
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i].v !== tiles[j].v) continue;
      if (canConnect(g, tiles[i], tiles[j])) return true;
    }
  }
  return false;
}

function findHint(g) {
  const tiles = [];
  forEachTile(g, (x, y, v) => tiles.push({ x, y, v }));
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i].v !== tiles[j].v) continue;
      if (canConnect(g, tiles[i], tiles[j])) return [tiles[i], tiles[j]];
    }
  }
  return null;
}

function shuffleInterior(g) {
  const vals = [];
  forEachTile(g, (x, y, v) => vals.push(v));
  shuffle(vals);
  let k = 0;
  forEachTile(g, (x, y) => { g[y][x] = vals[k++]; });
}

// Tạo lưới mới, đảm bảo luôn có ít nhất 1 nước đi lúc bắt đầu
function buildGrid(cfg) {
  const r = cfg.rows, c = cfg.cols, types = cfg.types;
  const pairs = (r * c) / 2;
  const ids = shuffle(POKE_IDS.slice()).slice(0, types);
  const vals = [];
  for (let i = 0; i < pairs; i++) {
    const id = ids[i % types];
    vals.push(id, id);
  }
  shuffle(vals);
  const g = Array.from({ length: r + 2 }, () => Array(c + 2).fill(0));
  let k = 0;
  for (let y = 1; y <= r; y++)
    for (let x = 1; x <= c; x++)
      g[y][x] = vals[k++];
  let guard = 0;
  while (!hasAnyMove(g) && guard++ < 200) shuffleInterior(g);
  return g;
}

/* ==================== Âm thanh (Web Audio, không cần file) ==================== */
let audioCtx = null;
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* bỏ qua nếu trình duyệt chặn */ }
}
function beep(freq, dur, type, when) {
  if (!audioCtx || muted) return;
  try {
    const t = audioCtx.currentTime + (when || 0);
    const o = audioCtx.createOscillator();
    const gn = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    gn.gain.setValueAtTime(0.12, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (e) { /* bỏ qua */ }
}
const sfxSelect = () => beep(440, 0.06);
const sfxError = () => beep(150, 0.18, 'square');
const sfxMatch = () => { beep(660, 0.1); beep(880, 0.14, 'sine', 0.09); };
const sfxCombo = () => { beep(990, 0.1, 'triangle', 0.16); beep(1320, 0.14, 'triangle', 0.24); };
const sfxWin = () => { beep(523, 0.12); beep(659, 0.12, 'sine', 0.12); beep(784, 0.2, 'sine', 0.24); };
const sfxLose = () => { beep(330, 0.2, 'sawtooth'); beep(220, 0.3, 'sawtooth', 0.18); };

/* ---------- Nhạc nền chiptune vui nhộn ---------- */
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Giai điệu chính: 64 nốt móc đơn (0 = nghỉ), giọng Đô trưởng vui nhộn
const MELODY = [
  72, 76, 79, 76, 81, 79, 76, 74,
  72, 76, 79, 81, 79, 76, 74, 0,
  72, 76, 79, 76, 81, 86, 81, 79,
  76, 79, 74, 76, 72, 0, 76, 0,
  72, 76, 79, 76, 81, 79, 76, 74,
  72, 76, 79, 81, 83, 81, 79, 76,
  77, 81, 79, 77, 76, 74, 76, 0,
  72, 0, 76, 0, 72, 0, 67, 0,
];
// Bass: nốt gốc mỗi ô nhịp (C - F - G - C ...)
const BASSLINE = [36, 41, 43, 36, 36, 41, 43, 36];
const Music = {
  timer: null, step: 0, nextTime: 0,
  start() {
    if (this.timer || !musicOn || muted || !audioCtx) return;
    this.step = 0;
    this.nextTime = audioCtx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 120);
  },
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },
  schedule() {
    if (!audioCtx || muted) return;
    const STEP_DUR = 60 / 132 / 2; // móc đơn ở 132 BPM
    while (this.nextTime < audioCtx.currentTime + 0.35) {
      this.playStep(this.step, this.nextTime, STEP_DUR);
      this.nextTime += STEP_DUR;
      this.step = (this.step + 1) % MELODY.length;
    }
  },
  playStep(s, t, dur) {
    const lead = MELODY[s];
    if (lead > 0) this.tone(NOTE(lead), t, dur * 0.92, 'triangle', 0.045);
    if (s % 2 === 0) {
      const bar = Math.floor(s / 8) % BASSLINE.length;
      this.tone(NOTE(BASSLINE[bar]), t, dur * 1.8, 'sine', 0.055);
    }
  },
  tone(freq, t, dur, type, vol) {
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch (e) { /* bỏ qua */ }
  },
};

/* ==================== Giao diện ==================== */
function $(id) { return document.getElementById(id); }

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

function fitTiles() {
  const wrap = $('boardWrap');
  const maxW = Math.min(wrap.clientWidth || 800, 880);
  const tile = Math.max(30, Math.floor((maxW - (cols - 1) * 5 - 24) / cols));
  document.documentElement.style.setProperty('--tile', tile + 'px');
}

function render() {
  const board = $('board');
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${cols}, var(--tile))`;
  cellEls = Array.from({ length: rows + 2 }, () => Array(cols + 2).fill(null));
  let n = 0;
  for (let y = 1; y <= rows; y++) {
    for (let x = 1; x <= cols; x++) {
      const btn = document.createElement('button');
      btn.className = 'tile';
      btn.dataset.x = x;
      btn.dataset.y = y;
      btn.setAttribute('aria-label', 'ô game');
      btn.style.animationDelay = Math.min(n * 6, 600) + 'ms';
      n++;
      const img = document.createElement('img');
      img.src = SPRITE(grid[y][x]);
      img.alt = '';
      img.draggable = false;
      btn.appendChild(img);
      board.appendChild(btn);
      cellEls[y][x] = btn;
    }
  }
  fitTiles();
}

function updateHud() {
  best = Math.max(best, score);
  $('diff').textContent = DIFFS[difficulty].label;
  $('level').textContent = level;
  $('score').textContent = score;
  $('best').textContent = best;
  $('hintCount').textContent = hints;
  $('hintBtn').disabled = hints <= 0;
  const timed = mode === 'timed';
  $('timerWrap').style.display = timed ? '' : 'none';
  $('relaxBadge').style.display = timed ? 'none' : '';
  if (timed) {
    $('timeText').textContent = Math.ceil(timeLeft) + 's';
    $('timerBar').style.width = Math.max(0, (timeLeft / timeMax) * 100) + '%';
    $('timerWrap').classList.toggle('danger', timeLeft / timeMax < 0.2 && timeLeft > 0);
  }
  const cb = $('comboStat');
  if (combo >= 2) {
    cb.classList.remove('hidden');
    $('comboMult').textContent = Math.min(combo, COMBO_MAX);
  } else {
    cb.classList.add('hidden');
  }
}

function showOverlay(title, text, btnLabel, onClick) {
  $('ovTitle').textContent = title;
  $('ovText').textContent = text;
  $('diffBtns').classList.add('hidden');
  $('modeBtns').classList.add('hidden');
  $('startBtn').style.display = 'none';
  document.querySelector('#startBtn').parentElement.style.display = 'none';
  $('continueBtn').classList.add('hidden');
  document.querySelectorAll('.opt-label').forEach((el) => { el.style.display = 'none'; });
  const btn = $('ovBtn');
  btn.classList.remove('hidden');
  btn.textContent = btnLabel;
  btn.onclick = () => { ensureAudio(); onClick(); };
  $('overlay').classList.remove('hidden');
}

function showStart() {
  const s = loadSave();
  best = (s && s.best) || 0;
  $('ovTitle').textContent = '⚡ Game Pikachu';
  let text = 'Nối 2 ô giống nhau bằng đường gấp khúc tối đa 2 lần để ăn điểm. Ăn liên tiếp để kích combo nhân điểm!';
  if (best > 0) text += ` Kỷ lục của bạn: ${best} điểm.`;
  $('ovText').textContent = text;
  $('ovBtn').classList.add('hidden');
  $('diffBtns').classList.remove('hidden');
  $('modeBtns').classList.remove('hidden');
  $('startBtn').style.display = '';
  document.querySelector('#startBtn').parentElement.style.display = '';
  document.querySelectorAll('.opt-label').forEach((el) => { el.style.display = ''; });
  // đồng bộ lựa chọn đã lưu
  selDifficulty = (s && s.difficulty) || 'normal';
  selMode = (s && s.mode) || 'timed';
  document.querySelectorAll('#diffBtns .diff').forEach((x) => x.classList.toggle('sel', x.dataset.diff === selDifficulty));
  document.querySelectorAll('#modeBtns .mode').forEach((x) => x.classList.toggle('sel', x.dataset.mode === selMode));
  const cb = $('continueBtn');
  if (s && (s.score > 0 || s.level > 1)) {
    const dLabel = DIFFS[s.difficulty] ? DIFFS[s.difficulty].label : 'Thường';
    const mLabel = MODES[s.mode] ? MODES[s.mode].label : 'Tính giờ';
    cb.textContent = `▶ Tiếp tục: Màn ${s.level} • ${s.score} điểm (${dLabel}, ${mLabel})`;
    cb.classList.remove('hidden');
    cb.onclick = () => {
      ensureAudio();
      difficulty = s.difficulty || 'normal';
      mode = s.mode || 'timed';
      score = s.score || 0;
      level = s.level || 1;
      sfxSelect();
      startLevel();
    };
  } else {
    cb.classList.add('hidden');
  }
  updateHud();
  $('overlay').classList.remove('hidden');
}

function hideOverlay() { $('overlay').classList.add('hidden'); }

function cellCenter(x, y) {
  const board = $('board');
  const r = board.getBoundingClientRect();
  return { x: (x - 1 + 0.5) * (r.width / cols), y: (y - 1 + 0.5) * (r.height / rows) };
}

function drawPath(path) {
  const svg = $('lines');
  const board = $('board');
  const r = board.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
  svg.innerHTML = '';
  const pts = path.map((p) => {
    const c = cellCenter(p.x, p.y);
    return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
  }).join(' ');
  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pl.setAttribute('points', pts);
  pl.setAttribute('class', 'link-line');
  svg.appendChild(pl);
  setTimeout(() => { svg.innerHTML = ''; }, 340);
}

// Hiệu ứng tia lửa khi ăn cặp
function spawnBurst(p1, p2) {
  const wrap = $('boardWrap');
  const board = $('board');
  const br = board.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const offX = br.left - wr.left, offY = br.top - wr.top;
  [p1, p2].forEach((p) => {
    const cx = offX + (p.x - 0.5) * (br.width / cols);
    const cy = offY + (p.y - 0.5) * (br.height / rows);
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.className = 'particle';
      const ang = Math.random() * Math.PI * 2;
      const dist = 26 + Math.random() * 38;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      wrap.appendChild(s);
      setTimeout(() => s.remove(), 650);
    }
  });
}

// Chữ điểm bay lên khi ăn cặp
function floatScore(p1, p2, text) {
  const wrap = $('boardWrap');
  const board = $('board');
  const br = board.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const mx = (br.left - wr.left) + ((p1.x + p2.x) / 2 - 0.5) * (br.width / cols);
  const my = (br.top - wr.top) + ((p1.y + p2.y) / 2 - 0.5) * (br.height / rows);
  const s = document.createElement('span');
  s.className = 'score-pop';
  s.textContent = text;
  s.style.left = mx + 'px';
  s.style.top = my + 'px';
  wrap.appendChild(s);
  setTimeout(() => s.remove(), 950);
}

function flash(btn) {
  btn.classList.remove('shake');
  void btn.offsetWidth; // restart animation
  btn.classList.add('shake');
  setTimeout(() => btn.classList.remove('shake'), 260);
}

/* ==================== Luật chơi ==================== */
function onTileClick(e) {
  const btn = e.target.closest('.tile');
  if (!btn || lock || paused) return;
  const x = +btn.dataset.x, y = +btn.dataset.y;
  if (grid[y][x] === 0) return;
  ensureAudio();

  if (!selected) {
    selected = { x, y };
    btn.classList.add('selected');
    sfxSelect();
    return;
  }
  if (selected.x === x && selected.y === y) {
    btn.classList.remove('selected');
    selected = null;
    return;
  }

  const p1 = selected, p2 = { x, y };
  cellEls[p1.y][p1.x].classList.remove('selected');
  selected = null;

  if (grid[p1.y][p1.x] !== grid[p2.y][p2.x]) { sfxError(); flash(btn); return; }
  const path = canConnect(grid, p1, p2);
  if (!path) { sfxError(); flash(btn); return; }

  // Tính combo: ăn cặp tiếp theo trong COMBO_WINDOW thì tăng chuỗi
  const now = Date.now();
  combo = (now - lastMatchAt <= COMBO_WINDOW) ? combo + 1 : 1;
  lastMatchAt = now;
  const mult = Math.min(combo, COMBO_MAX);
  const gained = SCORE_PER_PAIR * mult;

  lock = true;
  drawPath(path);
  spawnBurst(p1, p2);
  sfxMatch();
  if (mult >= 3) sfxCombo();
  setTimeout(() => {
    grid[p1.y][p1.x] = 0;
    grid[p2.y][p2.x] = 0;
    cellEls[p1.y][p1.x].classList.add('gone');
    cellEls[p2.y][p2.x].classList.add('gone');
    remaining -= 2;
    score += gained;
    floatScore(p1, p2, '+' + gained + (mult > 1 ? '  x' + mult : ''));
    updateHud();
    const cb = $('comboStat');
    if (mult >= 2) { cb.classList.remove('pop'); void cb.offsetWidth; cb.classList.add('pop'); }
    saveProgress();
    lock = false;
    if (remaining === 0) {
      levelComplete();
    } else if (!hasAnyMove(grid)) {
      toast('Hết nước đi! Tự động xáo bài…');
      setTimeout(autoShuffle, 700);
    }
  }, 260);
}

// Tự động xáo các ô còn lại khi hết nước đi (luôn đảm bảo có nước đi mới)
function autoShuffle() {
  let guard = 0;
  do { shuffleInterior(grid); guard++; } while (!hasAnyMove(grid) && guard < 200);
  for (let y = 1; y <= rows; y++) {
    for (let x = 1; x <= cols; x++) {
      const btn = cellEls[y][x];
      if (!btn) continue;
      btn.classList.remove('gone', 'hint', 'selected');
      btn.querySelector('img').src = SPRITE(grid[y][x]);
    }
  }
  selected = null;
  combo = 0;
  updateHud();
  toast('Đã xáo bài, chơi tiếp nhé!');
}

function useHint() {
  if (hints <= 0 || lock || paused) return;
  ensureAudio();
  const pair = findHint(grid);
  if (!pair) { autoShuffle(); return; }
  hints--;
  updateHud();
  sfxSelect();
  const [a, b] = pair;
  const ea = cellEls[a.y][a.x], eb = cellEls[b.y][b.x];
  ea.classList.add('hint');
  eb.classList.add('hint');
  setTimeout(() => { ea.classList.remove('hint'); eb.classList.remove('hint'); }, 1600);
}

function togglePause() {
  if (lock) return;
  if (!$('overlay').classList.contains('hidden')) return; // đang ở màn hình khác
  ensureAudio();
  paused = true;
  stopTick();
  if (audioCtx) { try { audioCtx.suspend(); } catch (e) {} }
  sfxSelect();
  showOverlay(
    '⏸ Tạm dừng',
    `Màn ${level} • ${DIFFS[difficulty].label} • ${MODES[mode].label} • ${score} điểm • Còn ${remaining} ô`,
    '▶ Tiếp tục chơi',
    () => {
      paused = false;
      hideOverlay();
      startTick();
      if (audioCtx) { try { audioCtx.resume(); } catch (e) {} }
    }
  );
}

function toggleMute() {
  ensureAudio();
  muted = !muted;
  $('soundBtn').textContent = muted ? '🔇' : '🔊';
  if (!muted) sfxSelect();
}

function toggleMusic() {
  ensureAudio();
  musicOn = !musicOn;
  $('musicBtn').classList.toggle('off', !musicOn);
  if (musicOn) { Music.start(); sfxSelect(); }
  else Music.stop();
}

/* ==================== Vòng đời game ==================== */
function gameTick() {
  if (mode === 'timed') {
    timeLeft -= 0.2;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHud();
      gameOver();
      return;
    }
  }
  // Combo hết hạn sau COMBO_WINDOW không ăn cặp nào
  if (combo > 0 && Date.now() - lastMatchAt > COMBO_WINDOW) combo = 0;
  updateHud();
}
function startTick() {
  stopTick();
  tickId = setInterval(gameTick, 200);
}
function stopTick() {
  if (tickId) { clearInterval(tickId); tickId = null; }
}

function startLevel() {
  ensureAudio();
  const cfg = getConfig(level);
  rows = cfg.rows; cols = cfg.cols;
  grid = buildGrid(cfg);
  remaining = rows * cols;
  hints = HINTS_PER_LEVEL;
  combo = 0;
  lastMatchAt = 0;
  timeMax = Math.round(cfg.time * DIFFS[difficulty].mult);
  timeLeft = timeMax;
  selected = null;
  lock = false;
  paused = false;
  render();
  updateHud();
  saveProgress();
  hideOverlay();
  startTick();
  Music.start();
}

function levelComplete() {
  stopTick();
  Music.stop();
  sfxWin();
  const bonus = mode === 'timed' ? Math.ceil(timeLeft) * 5 : 100;
  score += bonus;
  updateHud();
  saveProgress();
  showOverlay(
    '🎉 Qua màn ' + level + '!',
    (mode === 'timed'
      ? `Thưởng thời gian còn lại: +${bonus} điểm. `
      : `Thưởng hoàn thành màn: +${bonus} điểm. `) + `Tổng điểm: ${score}.`,
    'Chơi màn tiếp theo',
    () => { level++; startLevel(); }
  );
}

function gameOver() {
  stopTick();
  Music.stop();
  lock = true;
  sfxLose();
  best = Math.max(best, score);
  clearProgress(); // thua thì xóa tiến trình, giữ kỷ lục
  updateHud();
  showOverlay(
    '⏰ Hết giờ!',
    `Bạn đạt ${score} điểm ở màn ${level} (độ khó ${DIFFS[difficulty].label}). Thử lại nhé!`,
    'Chơi lại từ đầu',
    () => { score = 0; level = 1; startLevel(); }
  );
}

function init() {
  $('board').addEventListener('click', onTileClick);
  $('hintBtn').addEventListener('click', useHint);
  $('pauseBtn').addEventListener('click', togglePause);
  $('soundBtn').addEventListener('click', toggleMute);
  $('musicBtn').addEventListener('click', toggleMusic);
  $('restartBtn').addEventListener('click', () => { ensureAudio(); startLevel(); });
  document.querySelectorAll('#diffBtns .diff').forEach((b) => {
    b.addEventListener('click', () => {
      ensureAudio();
      sfxSelect();
      selDifficulty = b.dataset.diff;
      document.querySelectorAll('#diffBtns .diff').forEach((x) => x.classList.toggle('sel', x === b));
    });
  });
  document.querySelectorAll('#modeBtns .mode').forEach((b) => {
    b.addEventListener('click', () => {
      ensureAudio();
      sfxSelect();
      selMode = b.dataset.mode;
      document.querySelectorAll('#modeBtns .mode').forEach((x) => x.classList.toggle('sel', x === b));
    });
  });
  $('startBtn').addEventListener('click', () => {
    ensureAudio();
    difficulty = selDifficulty;
    mode = selMode;
    score = 0;
    level = 1;
    sfxSelect();
    startLevel();
  });
  window.addEventListener('resize', fitTiles);
  if (!musicOn) $('musicBtn').classList.add('off');
  showStart();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
