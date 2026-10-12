import Phaser from 'phaser';
// Themes + persisted settings + score. Single source of truth for colour.

export const THEMES = {
  neon: {
    label: 'NEON',
    bg: [[0, 0x101838], [0.45, 0x0a0e22], [1, 0x04050d]],
    blobs: [0x3061ff, 0x9b2bff, 0x00c8ff],
    blobAlpha: 0.34,
    halo: 0x3f6bff, haloAlpha: 0.30,
    panel: 0x0c1230, panelAlpha: 0.46,
    stroke: 0x8fa8ff, strokeAlpha: 0.22,
    grid: 0x86a6ff,
    x: 0x51e5ff, o: 0xffab52,
    text: 0xecf1ff, dim: 0x7f8db5, accent: 0x7f9dff,
    particle: 0xa9c7ff,
  },
  luxury: {
    label: 'LUXO',
    bg: [[0, 0x1a1408], [0.45, 0x0e0b05], [1, 0x050402]],
    blobs: [0xd9a52d, 0x7a5a12, 0xffe6a3],
    blobAlpha: 0.22,
    halo: 0xc99422, haloAlpha: 0.26,
    panel: 0x140f07, panelAlpha: 0.55,
    stroke: 0xe8c977, strokeAlpha: 0.26,
    grid: 0xe8c977,
    x: 0xf8ebc4, o: 0xdb8534,
    text: 0xf7efdc, dim: 0x9b8964, accent: 0xe8c977,
    particle: 0xf3dda4,
  },
  ice: {
    label: 'GELO',
    bg: [[0, 0x1d3f60], [0.45, 0x102841], [1, 0x061019]],
    blobs: [0x8fe0ff, 0xd6f2ff, 0x4a92cf],
    blobAlpha: 0.30,
    halo: 0x8fd8ff, haloAlpha: 0.28,
    panel: 0x0d2137, panelAlpha: 0.42,
    stroke: 0xd6f2ff, strokeAlpha: 0.28,
    grid: 0xd2eeff,
    x: 0xf2fdff, o: 0x9b86ff,
    text: 0xf2fbff, dim: 0x84a4bd, accent: 0xa5e4ff,
    particle: 0xdcf4ff,
  },
  sunset: {
    label: 'PÔR DO SOL',
    bg: [[0, 0x3a1a4a], [0.45, 0x30162f], [1, 0x140a16]],
    blobs: [0xff7a4d, 0xff3d78, 0xffc36b],
    blobAlpha: 0.28,
    halo: 0xff6b4a, haloAlpha: 0.26,
    panel: 0x211026, panelAlpha: 0.46,
    stroke: 0xffb489, strokeAlpha: 0.26,
    grid: 0xffc9a6,
    x: 0x74e6ff, o: 0xff7a59,
    text: 0xfff1e8, dim: 0xa88a92, accent: 0xffab7d,
    particle: 0xffd0ad,
  },
};

export const DIFFICULTIES = ['easy', 'normal', 'hard'];

const KEY = 'ttt.deluxe.v1';
const DEFAULTS = {
  theme: 'neon',
  difficulty: 'normal',
  sound: true,
  bestOf3: false,
  score: { player: 0, cpu: 0, draw: 0 },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...DEFAULTS, ...raw, score: { ...DEFAULTS.score, ...(raw.score || {}) } };
    if (!THEMES[s.theme]) s.theme = DEFAULTS.theme;
    if (!DIFFICULTIES.includes(s.difficulty)) s.difficulty = DEFAULTS.difficulty;
    return s;
  } catch {
    return { ...DEFAULTS, score: { ...DEFAULTS.score } };
  }
}

export const settings = load();
export const bus = new Phaser.Events.EventEmitter();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

export const palette = () => THEMES[settings.theme];

export function cycleTheme() {
  const keys = Object.keys(THEMES);
  settings.theme = keys[(keys.indexOf(settings.theme) + 1) % keys.length];
  save();
  bus.emit('theme');
  return settings.theme;
}

export function cycleDifficulty() {
  settings.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(settings.difficulty) + 1) % DIFFICULTIES.length];
  save();
  return settings.difficulty;
}

export function setSoundEnabled(on) {
  settings.sound = on;
  save();
  bus.emit('sound', on);
}

export function toggleBestOf3() {
  settings.bestOf3 = !settings.bestOf3;
  save();
  return settings.bestOf3;
}

export function addScore(kind) {
  settings.score[kind] += 1;
  save();
}

export function resetScore() {
  settings.score = { player: 0, cpu: 0, draw: 0 };
  save();
}
