import { strength } from './deck.js';

const MAX = 13;                                  // zap
const norm = (c, m) => strength(c, m) / MAX;

/**
 * Bot heurístico: avalia só as próprias cartas e o que já é público.
 * Nunca lê a mão do humano. A agressividade é sorteada por partida, então ele
 * blefa às vezes e não fica previsível.
 */
export class Bot {
  constructor(seat = 1, rng = Math.random) {
    this.seat = seat;
    this.rng = rng;
    this.aggression = 0.3 + rng() * 0.5;
  }

  /** Força média da mão restante, 0..1 (manilha puxa muito pra cima). */
  power(match) {
    const cards = match.hands[this.seat];
    if (!cards.length) return 0;
    const vals = cards.map((c) => norm(c, match.manilhaR));
    const best = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return best * 0.6 + avg * 0.4;
  }

  /** Índice da carta a jogar. */
  chooseCard(match) {
    const cards = match.hands[this.seat];
    const m = match.manilhaR;
    const idx = cards.map((c, i) => ({ i, v: strength(c, m) })).sort((a, b) => a.v - b.v);
    const opp = match.played[1 - this.seat];

    if (opp) {
      const need = strength(opp, m);
      const win = idx.find((c) => c.v > need);
      if (!win) return idx[0].i;                       // não dá: descarta a pior
      // empatar de propósito na 1ª rodada é bom (garante vantagem no empate)
      const tie = idx.find((c) => c.v === need);
      if (tie && match.results.length === 0 && this.rng() < 0.5) return tie.i;
      return win.i;                                    // a mínima que vence
    }

    // saindo: guarda a mais forte se já tem duas boas
    const strong = idx.filter((c) => c.v >= 10).length;
    if (match.results.length === 0 && strong >= 2) return idx[idx.length - 2].i;
    return idx[idx.length - 1].i;
  }

  /** Pedir truco/seis/nove/doze? */
  wantsRaise(match) {
    if (!match.canRaise(this.seat)) return false;
    const p = this.power(match);
    const won = match.results.filter((r) => r === this.seat).length;
    const lost = match.results.filter((r) => r >= 0 && r !== this.seat).length;
    if (lost > won && p < 0.75) return false;
    const base = p > 0.7 ? 0.55 : p > 0.55 ? 0.3 : 0.04;   // 4% de blefe puro
    return this.rng() < base * (0.6 + this.aggression) * (won > lost ? 1.6 : 1);
  }

  /** Resposta a um pedido: 'accept' | 'run' | 'raise' */
  respond(match) {
    const p = this.power(match);
    const stake = match.pending.to;
    const risk = stake / 12;                        // quanto maior a aposta, mais exigente
    if (p < 0.30 + risk * 0.35) return 'run';
    if (p > 0.82 && this.rng() < this.aggression && stake < 12) return 'raise';
    return 'accept';
  }

  /** Mão de onze: joga ou entrega 1 ponto? */
  onzeAccept(match) {
    return this.power(match) > 0.52;
  }
}
