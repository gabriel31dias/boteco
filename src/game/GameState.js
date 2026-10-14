import { DEFAULT_SETTINGS, STORAGE_KEY } from '../config.js';

export const State = Object.freeze({
  MENU: 'menu',
  SETUP: 'setup',
  INTRO: 'intro',
  AIMING: 'aiming',
  BALL_IN_HAND: 'ballInHand',
  REMOTE: 'remote',        // vez do adversário, online: input desligado
  SHOOTING: 'shooting',
  RESOLVING: 'resolving',
  PAUSED: 'paused',
  VICTORY: 'victory',
});

export const Group = Object.freeze({ NONE: null, SOLIDS: 'lisas', STRIPES: 'listradas' });

export function groupOf(number) {
  if (number === 0 || number === 8) return null;
  return number < 8 ? Group.SOLIDS : Group.STRIPES;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* modo privado */ }
}

const emptyStats = () => ({ shots: 0, potted: 0, fouls: 0 });

/** Estado da partida: jogadores, grupos, bolas encaçapadas e estatísticas. */
export class GameState {
  constructor() {
    this.settings = loadSettings();
    this.reset();
  }

  reset(players) {
    this.players = players || this.players || [
      { name: 'Jogador 1', color: '#2fd18c', cue: 0, avatar: 0 },
      { name: 'Jogador 2', color: '#4aa3ff', cue: 1, avatar: 1 },
    ];
    this.players.forEach((p) => { p.group = Group.NONE; p.stats = emptyStats(); });
    this.current = 0;
    this.open = true;
    this.breakDone = false;
    this.pocketed = [];          // números na ordem em que caíram
    this.ballInHand = false;
    this.pontos = [0, 0];        // snooker e sinuca brasileira
    this.fase = 'vermelha';      // snooker: o que vale na próxima tacada
    this.winner = null;
    this.loseReason = null;
    this.startedAt = performance.now();
    this.phase = State.MENU;
  }

  get player() { return this.players[this.current]; }
  get opponent() { return this.players[1 - this.current]; }

  switchPlayer() { this.current = 1 - this.current; }

  pocketedOf(playerIndex) {
    const g = this.players[playerIndex].group;
    if (!g) return [];
    return this.pocketed.filter((n) => groupOf(n) === g);
  }

  remainingOf(playerIndex) {
    const g = this.players[playerIndex].group;
    if (!g) return 7;
    return 7 - this.pocketedOf(playerIndex).length;
  }

  hasClearedGroup(playerIndex) {
    return this.players[playerIndex].group !== Group.NONE && this.remainingOf(playerIndex) === 0;
  }

  durationSeconds() {
    return Math.round((performance.now() - this.startedAt) / 1000);
  }

  accuracy(playerIndex) {
    const s = this.players[playerIndex].stats;
    if (!s.shots) return 0;
    return Math.round((s.potted / s.shots) * 100);
  }
}
