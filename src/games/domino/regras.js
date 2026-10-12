/**
 * Regras do dominó Double-Six. Camada 100% lógica: nenhuma referência a Phaser,
 * DOM ou renderização. O estado daqui é a única fonte de verdade do jogo — e no
 * multiplayer ele vive no SERVIDOR, porque a mão de cada um é escondida: um
 * cliente com o estado inteiro leria as peças do adversário.
 *
 * Assentos vão de 0 a n-1, como no resto da plataforma (o original usava
 * 'player'/'cpu', que só fazia sentido contra a máquina). De 2 a 4 jogadores:
 * individual (cada um por si) ou em duplas (0 e 2 contra 1 e 3). Placar e
 * vencedor são por TIME — no individual o time é o próprio assento.
 */

export const ACTIONS = {
  ELIMINATE: 'ELIMINATE',
  START_ROUND: 'START_ROUND',
  PLAY_PIECE: 'PLAY_PIECE',
  DRAW_PIECE: 'DRAW_PIECE',
  PASS_TURN: 'PASS_TURN',
  END_ROUND: 'END_ROUND',
};

const soma = (xs) => xs.reduce((s, x) => s + x, 0);

/** PRNG determinístico — deixa partidas reproduzíveis no teste. */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDeck() {
  const deck = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      deck.push({ id: `${a}-${b}`, a, b, double: a === b, pips: a + b });
    }
  }
  return deck;
}

export const pipsOf = (hand) => hand.reduce((s, p) => s + p.pips, 0);

export class DominoGame {
  constructor({ rng, target = 100, jogadores = 2, duplas = false } = {}) {
    this.rng = rng || mulberry32((Math.random() * 0xffffffff) >>> 0);
    this.target = target;
    this.n = jogadores;
    this.duplas = duplas && jogadores === 4;
    this.scores = Array(this.duplas ? 2 : this.n).fill(0);
    this.round = 0;
    this.actions = [];
    this.hands = Array.from({ length: this.n }, () => []);
    this.boneyard = [];
    this.chain = [];
    this.ends = null;
    this.turn = 0;
    this.phase = 'idle';
    this.result = null;
    /** valores em que cada assento já passou — informação pública da mesa. */
    this.voids = Array.from({ length: this.n }, () => new Set());
    /** Individual: quem saiu da mesa fica fora até o fim da partida. */
    this.ativos = Array(this.n).fill(true);
  }

  /** Time do assento: nas duplas é a paridade; no individual, ele mesmo. */
  timeDe(seat) { return this.duplas ? seat % 2 : seat; }

  /** Próximo assento na vez, pulando quem saiu. */
  proximo(seat) {
    for (let k = 1; k <= this.n; k++) {
      const s = (seat + k) % this.n;
      if (this.ativos[s]) return s;
    }
    return seat;
  }

  get nAtivos() { return this.ativos.filter(Boolean).length; }

  /**
   * Tira um jogador da partida (saiu ou estourou o prazo). As peças dele ficam
   * fora do jogo até o fim da rodada; ninguém marca os pontos delas. Sobrou um
   * só, ele ganha. Só no individual: nas duplas quem sai entrega o time.
   */
  eliminar(seat) {
    if (this.duplas || !this.ativos[seat] || this.phase === 'matchOver') return null;
    this.ativos[seat] = false;
    const action = this.push({ type: ACTIONS.ELIMINATE, seat });
    if (this.nAtivos === 1) {
      const sobrou = this.ativos.indexOf(true);
      this.phase = 'matchOver';
      this.result = { reason: 'abandono', winner: sobrou, points: 0, pips: this.hands.map(pipsOf),
        hands: this.hands.map((h) => [...h]), scores: [...this.scores], matchWinner: sobrou };
      return action;
    }
    if (this.phase !== 'playing') return action;
    // A mesa encolheu: se todos os que restam já passaram, fechou.
    if (this.passStreak >= this.nAtivos) this.endRound('blocked');
    else if (this.turn === seat) this.turn = this.proximo(seat);
    return action;
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  startRound() {
    const deck = this.shuffle(makeDeck());
    this.round++;
    // 7 pra cada um que está na mesa; o resto é monte (com 4 não sobra nada).
    let k = 0;
    this.hands = this.ativos.map((ativo) => (ativo ? deck.slice(7 * k, 7 * ++k) : []));
    this.boneyard = deck.slice(7 * k);
    this.chain = [];
    this.ends = null;
    this.result = null;
    this.passStreak = 0;
    this.phase = 'playing';
    this.voids = Array.from({ length: this.n }, () => new Set());
    this.turn = this.pickStarter();
    return this.push({ type: ACTIONS.START_ROUND, round: this.round, starter: this.turn });
  }

  /** Maior carroça abre; sem carroça, a peça mais pesada. */
  pickStarter() {
    let best = null;
    for (let seat = 0; seat < this.n; seat++) {
      if (!this.ativos[seat]) continue;
      for (const p of this.hands[seat]) {
        const rank = (p.double ? 100 : 0) + p.pips;
        if (!best || rank > best.rank) best = { seat, rank };
      }
    }
    return best.seat;
  }

  push(action) {
    this.actions.push(action);
    return action;
  }

  /**
   * Devolve a peça já orientada para o lado pedido, ou null se não encaixa.
   * `a` sempre olha para a esquerda da corrente e `b` para a direita.
   */
  orient(piece, side) {
    const { a, b } = piece;
    const mk = (x, y) => ({ id: piece.id, a: x, b: y, double: piece.double, pips: piece.pips });
    if (this.chain.length === 0) return mk(a, b);
    if (side === 'left') {
      if (b === this.ends.left) return mk(a, b);
      if (a === this.ends.left) return mk(b, a);
      return null;
    }
    if (a === this.ends.right) return mk(a, b);
    if (b === this.ends.right) return mk(b, a);
    return null;
  }

  validMoves(seat) {
    const sides = this.chain.length === 0 ? ['right'] : ['left', 'right'];
    const moves = [];
    for (const piece of this.hands[seat]) {
      for (const side of sides) {
        if (this.orient(piece, side)) moves.push({ id: piece.id, side, piece });
      }
    }
    return moves;
  }

  canPlay(seat) {
    return this.validMoves(seat).length > 0;
  }

  /** Regra clássica (draw game): sem jogada, compra enquanto houver monte. */
  mustDraw(seat) {
    return !this.canPlay(seat) && this.boneyard.length > 0;
  }

  play(seat, id, side) {
    if (this.phase !== 'playing') throw new Error('round not active');
    if (this.turn !== seat) throw new Error('not your turn');
    const hand = this.hands[seat];
    const i = hand.findIndex((p) => p.id === id);
    if (i < 0) throw new Error('piece not in hand');
    const entry = this.orient(hand[i], side);
    if (!entry) throw new Error('invalid move');

    hand.splice(i, 1);
    const at = this.chain.length === 0 ? 'first' : side;
    if (at === 'left') this.chain.unshift(entry);
    else this.chain.push(entry);
    this.ends = { left: this.chain[0].a, right: this.chain[this.chain.length - 1].b };
    this.passStreak = 0;

    const action = this.push({ type: ACTIONS.PLAY_PIECE, seat, id, side: at, entry, ends: { ...this.ends } });
    if (hand.length === 0) this.endRound('out', seat);
    else this.turn = this.proximo(seat);
    return action;
  }

  drawPiece(seat) {
    if (this.phase !== 'playing') throw new Error('round not active');
    if (this.turn !== seat) throw new Error('not your turn');
    if (this.boneyard.length === 0) throw new Error('boneyard empty');
    const piece = this.boneyard.pop();
    this.hands[seat].push(piece);
    return this.push({ type: ACTIONS.DRAW_PIECE, seat, id: piece.id, piece, left: this.boneyard.length });
  }

  passTurn(seat) {
    if (this.phase !== 'playing') throw new Error('round not active');
    if (this.turn !== seat) throw new Error('not your turn');
    if (this.canPlay(seat)) throw new Error('has a valid move');
    if (this.boneyard.length > 0) throw new Error('must draw first');
    if (this.ends) {
      this.voids[seat].add(this.ends.left);
      this.voids[seat].add(this.ends.right);
    }
    this.passStreak++;
    const action = this.push({ type: ACTIONS.PASS_TURN, seat });
    // Fecha quando a mesa inteira (quem ainda está nela) passou em seguida.
    if (this.passStreak >= this.nAtivos) this.endRound('blocked');
    else this.turn = this.proximo(seat);
    return action;
  }

  /**
   * Fim de rodada. `winner` é um TIME (no individual, o assento). Quem bate
   * marca a soma do que sobrou na mão de todos os adversários; fechou, leva o
   * time com menos pontos na mão — igualou no mínimo, ninguém pontua.
   */
  endRound(reason, winnerSeat = null) {
    const pips = this.hands.map(pipsOf);
    const nTimes = this.scores.length;
    // Quem saiu não entra na conta: nem marca, nem as peças dele valem ponto.
    const noJogo = (t) => this.ativos.some((a, s) => a && this.timeDe(s) === t);
    const pipsTime = Array.from({ length: nTimes }, (_, t) =>
      soma(pips.filter((_, s) => this.timeDe(s) === t && this.ativos[s])));
    let winner = winnerSeat === null ? null : this.timeDe(winnerSeat);
    if (reason === 'blocked') {
      const vivos = pipsTime.flatMap((x, t) => (noJogo(t) ? [x] : []));
      const min = Math.min(...vivos);
      const donos = pipsTime.flatMap((x, t) => (noJogo(t) && x === min ? [t] : []));
      winner = donos.length === 1 ? donos[0] : null;
    }
    const points = winner === null ? 0 : soma(pipsTime.filter((_, t) => t !== winner && noJogo(t)));
    if (winner !== null) this.scores[winner] += points;

    this.result = {
      reason,
      winner,
      points,
      pips,
      hands: this.hands.map((h) => [...h]),
      scores: [...this.scores],
    };
    // Só quem está na mesa pode vencer: quem saiu na frente não leva nada.
    const max = Math.max(...this.scores.filter((_, t) => noJogo(t)));
    const over = max >= this.target;
    this.phase = over ? 'matchOver' : 'roundOver';
    if (over) {
      // Só quem marcou nesta rodada pode ter cruzado; empate no topo fica null.
      const lideres = this.scores.flatMap((x, t) => (noJogo(t) && x === max ? [t] : []));
      this.result.matchWinner = lideres.length === 1 ? lideres[0] : null;
    }
    return this.push({ type: ACTIONS.END_ROUND, ...this.result });
  }
}
