import { newDeck, shuffle, manilhaRank, strength } from './deck.js';

export const Phase = {
  ONZE: 'onze',        // dupla com 11 decide se joga a mão
  PLAY: 'play',        // aguardando carta
  RESPOND: 'respond',  // aguardando resposta a um pedido de aumento
  HAND_END: 'handEnd',
  GAME_END: 'gameEnd',
};

const LADDER = { 1: 3, 3: 6, 6: 9, 9: 12 };
export const nextValue = (v) => LADDER[v] || null;

/**
 * Resultado da mão a partir das rodadas já decididas (0, 1 ou -1 = empate).
 * @returns 0 | 1 | 'draw' | null (indefinido, continua jogando)
 */
export function handResult(r) {
  const wins = [0, 0];
  for (const x of r) if (x >= 0) wins[x]++;
  if (wins[0] === 2) return 0;
  if (wins[1] === 2) return 1;
  if (r.length === 0) return null;

  if (r[0] === -1) {
    // empate na primeira: vence quem ganhar PRIMEIRO uma das outras
    for (let i = 1; i < r.length; i++) if (r[i] >= 0) return r[i];
    return r.length === 3 ? 'draw' : null;
  }
  if (r.length >= 2 && r[1] === -1) return r[0];   // empate na segunda → vence a primeira
  if (r.length === 3 && r[2] === -1) return r[0];  // empate na terceira → idem
  return null;
}

/** Time do assento: 0/2 contra 1/3. No 1×1 o time é o próprio assento. */
export const timeDe = (assento) => assento % 2;

/**
 * Partida de truco paulista até 12 pontos, 1×1 ou em duplas (2×2).
 * Placar, vazas, pedidos e vencedor são por TIME; vez e cartas são por assento.
 * Cada método devolve a lista de eventos para a UI animar.
 */
export class Match {
  constructor({ target = 12, rng = Math.random, starter = 0, jogadores = 2 } = {}) {
    this.target = target;
    this.rng = rng;
    this.n = jogadores;
    this.scores = [0, 0];
    this.starter = starter;      // quem joga a primeira carta da mão
    this.phase = Phase.HAND_END;
    this.winner = null;
  }

  startHand() {
    const deck = shuffle(newDeck(), this.rng);
    this.vira = deck.pop();
    this.manilhaR = manilhaRank(this.vira);
    this.hands = Array.from({ length: this.n }, () => deck.splice(0, 3));
    this.played = Array(this.n).fill(null);
    this.results = [];
    this.value = 1;
    this.lastRaiser = null;
    this.pending = null;
    this.noRaise = false;
    this.turn = this.starter;
    this.roundStarter = this.starter;

    const ev = [];
    const at11 = [this.scores[0] === this.target - 1, this.scores[1] === this.target - 1];
    if (at11[0] && at11[1]) {
      this.noRaise = true;                       // mão de ferro: vale 1, sem pedidos
      this.phase = Phase.PLAY;
      ev.push({ t: 'deal', special: 'ferro' });
    } else if (at11[0] || at11[1]) {
      this.onzeFor = at11[0] ? 0 : 1;          // o time
      // Quem decide pela dupla é o primeiro dela a jogar na mão.
      this.onzeSeat = timeDe(this.starter) === this.onzeFor ? this.starter : this.proximo(this.starter);
      this.phase = Phase.ONZE;
      ev.push({ t: 'deal', special: 'onze' });
      ev.push({ t: 'onze', player: this.onzeSeat });
    } else {
      this.phase = Phase.PLAY;
      ev.push({ t: 'deal', special: null });
    }
    return ev;
  }

  /** Decisão da mão de onze: jogar (vale 3, sem aumentos) ou correr (adversário +1). */
  onze(player, accept) {
    if (this.phase !== Phase.ONZE || player !== this.onzeSeat) return [];
    if (accept) {
      this.value = 3;
      this.noRaise = true;
      this.phase = Phase.PLAY;
      return [{ t: 'onzeAccept', player }];
    }
    const ev = [{ t: 'onzeRun', player }];
    return ev.concat(this.endHand(1 - timeDe(player), 1));
  }

  proximo(assento) { return (assento + 1) % this.n; }

  /**
   * Quem responde a um pedido: o adversário seguinte a quem pediu.
   * ponytail: no 2×2 de mesa qualquer um da dupla responde; aqui é um só, que é
   * quem o relógio consegue cobrar.
   */
  respondente() { return this.pending ? this.proximo(this.pending.by) : null; }

  canRaise(player) {
    return this.phase === Phase.PLAY && this.turn === player && !this.noRaise
      && this.lastRaiser !== timeDe(player) && nextValue(this.value) !== null;
  }

  raise(player) {
    if (!this.canRaise(player)) return [];
    this.pending = { by: player, to: nextValue(this.value) };
    this.phase = Phase.RESPOND;
    return [{ t: 'raise', player, to: this.pending.to }];
  }

  /** @param action 'accept' | 'run' | 'raise' */
  respond(player, action) {
    if (this.phase !== Phase.RESPOND || player !== this.respondente()) return [];
    const asker = this.pending.by;

    if (action === 'run') {
      const ev = [{ t: 'run', player }];
      return ev.concat(this.endHand(timeDe(asker), this.value));   // vale o valor ANTERIOR ao pedido
    }
    if (action === 'raise' && nextValue(this.pending.to)) {
      this.value = this.pending.to;                        // retrucar já aceita o anterior
      this.lastRaiser = timeDe(player);
      this.pending = { by: player, to: nextValue(this.value) };
      return [{ t: 'raise', player, to: this.pending.to }];
    }
    this.value = this.pending.to;
    this.lastRaiser = timeDe(asker);
    this.pending = null;
    this.phase = Phase.PLAY;
    return [{ t: 'accept', player, value: this.value }];
  }

  playCard(player, index) {
    if (this.phase !== Phase.PLAY || this.turn !== player) return [];
    const card = this.hands[player][index];
    if (!card) return [];
    this.hands[player].splice(index, 1);
    this.played[player] = card;
    const ev = [{ t: 'play', player, card }];

    if (this.played.every(Boolean)) {
      // Vence a vaza a carta mais forte. Empate só "canga" entre times
      // diferentes: dois parceiros com a mesma força ganham pro time.
      const forca = this.played.map((c) => strength(c, this.manilhaR));
      const max = Math.max(...forca);
      const topo = forca.flatMap((f, i) => (f === max ? [i] : []));
      const times = new Set(topo.map(timeDe));
      const winner = times.size > 1 ? -1 : timeDe(topo[0]);
      this.results.push(winner);
      ev.push({ t: 'round', winner, seat: winner < 0 ? -1 : topo[0], cards: [...this.played], n: this.results.length });
      this.played = Array(this.n).fill(null);
      // a próxima vaza começa por quem venceu; no empate, por quem começou
      if (winner >= 0) this.roundStarter = topo[0];
      this.turn = this.roundStarter;

      const res = handResult(this.results);
      if (res !== null) {
        return ev.concat(res === 'draw'
          ? this.endHand(null, 0)
          : this.endHand(res, this.value));
      }
    } else {
      this.turn = this.proximo(player);
    }
    return ev;
  }

  endHand(winner, points) {
    if (winner !== null) this.scores[winner] += points;
    this.phase = Phase.HAND_END;
    this.pending = null;
    const ev = [{ t: 'handEnd', winner, points, scores: [...this.scores] }];
    if (winner !== null && this.scores[winner] >= this.target) {
      this.winner = winner;
      this.phase = Phase.GAME_END;
      ev.push({ t: 'gameEnd', winner });
    } else {
      this.starter = this.proximo(this.starter);    // a saída gira pela mesa
    }
    return ev;
  }
}
