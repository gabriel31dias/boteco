// Motor de regras de damas. Puro: sem Phaser, sem DOM. Roda no browser e no node
// — e no multiplayer roda no SERVIDOR, que é quem arbitra. O cliente usa o mesmo
// arquivo só pra desenhar e resolver o toque.
// Codificacao: 0 vazio, +1 peao jogador, +2 dama jogador, -1 peao CPU, -2 dama CPU.
// Jogador (+1) avanca para linhas menores (topo). CPU (-1) avanca para baixo.

export const VARIANTS = {
  brazilian: {
    id: 'brazilian', label: 'Brasileiras', size: 8, rows: 3,
    flyingKings: true, captureBackwards: true,
    mandatory: true, maximal: true, maximalQuality: false,
    promoteMidJump: false, stopOnPromote: false, drawPlies: 40,
  },
  international: {
    id: 'international', label: 'Internacional', size: 10, rows: 4,
    flyingKings: true, captureBackwards: true,
    mandatory: true, maximal: true, maximalQuality: false,
    promoteMidJump: false, stopOnPromote: false, drawPlies: 50,
  },
  american: {
    id: 'american', label: 'Americanas', size: 8, rows: 3,
    flyingKings: false, captureBackwards: false,
    mandatory: true, maximal: false, maximalQuality: false,
    promoteMidJump: false, stopOnPromote: true, drawPlies: 40,
  },
};

const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export class Rules {
  constructor(cfg = VARIANTS.brazilian) {
    this.cfg = cfg;
    this.N = cfg.size;
  }

  playable(r, c) { return ((r + c) & 1) === 1; }

  initial() {
    const N = this.N, b = new Int8Array(N * N);
    for (let r = 0; r < this.cfg.rows; r++)
      for (let c = 0; c < N; c++) if (this.playable(r, c)) b[r * N + c] = -1;
    for (let r = N - this.cfg.rows; r < N; r++)
      for (let c = 0; c < N; c++) if (this.playable(r, c)) b[r * N + c] = 1;
    return { b, turn: 1, half: 0 };
  }

  count(st) {
    let p = 0, c = 0, pk = 0, ck = 0;
    for (let i = 0; i < st.b.length; i++) {
      const v = st.b[i];
      if (v > 0) { p++; if (v === 2) pk++; }
      else if (v < 0) { c++; if (v === -2) ck++; }
    }
    return { p, c, pk, ck };
  }

  // --- geracao de lances -------------------------------------------------
  moves(st) {
    const N = this.N, b = st.b, cfg = this.cfg, side = st.turn;
    const caps = [];
    for (let sq = 0; sq < b.length; sq++) {
      const p = b[sq];
      if (p === 0 || Math.sign(p) !== side) continue;
      this._captureSeqs(b, sq, p, caps);
    }
    if (caps.length && cfg.mandatory) return this._finish(b, caps, side, true);
    if (caps.length && !cfg.mandatory) {
      const quiet = this._quietAll(b, side);
      return this._finish(b, caps.concat(quiet), side, false);
    }
    return this._finish(b, this._quietAll(b, side), side, false);
  }

  _quietAll(b, side) {
    const out = [];
    for (let sq = 0; sq < b.length; sq++) {
      const p = b[sq];
      if (p === 0 || Math.sign(p) !== side) continue;
      this._quiet(b, sq, p, out);
    }
    return out;
  }

  _finish(b, raw, side, isCapture) {
    const cfg = this.cfg, N = this.N;
    let list = raw;
    if (isCapture && cfg.maximal && list.length > 1) {
      const w = (m) => cfg.maximalQuality
        ? m.captures.reduce((a, sq) => a + (Math.abs(b[sq]) === 2 ? 1.6 : 1), 0)
        : m.captures.length;
      let best = -1;
      for (const m of list) best = Math.max(best, w(m));
      list = list.filter((m) => w(m) >= best - 1e-9);
    }
    // deduplica caminhos equivalentes (mesmo destino + mesmo conjunto capturado)
    const seen = new Set(), out = [];
    const promoRow = side === 1 ? 0 : N - 1;
    for (const m of list) {
      const from = m.path[0], to = m.path[m.path.length - 1];
      const key = from + ':' + to + ':' + m.captures.slice().sort((a, x) => a - x).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        from, to, path: m.path, captures: m.captures,
        promote: Math.abs(b[from]) === 1 && ((to / N) | 0) === promoRow,
      });
    }
    return out;
  }

  _quiet(b, from, piece, out) {
    const N = this.N, cfg = this.cfg;
    const r = (from / N) | 0, c = from % N;
    const king = Math.abs(piece) === 2, color = Math.sign(piece);
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== -color) continue;
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 0) {
        out.push({ path: [from, rr * N + cc], captures: [] });
        if (!(king && cfg.flyingKings)) break;
        rr += dr; cc += dc;
      }
    }
  }

  _captureSeqs(b, from, piece, out) {
    b[from] = 0;
    this._dfs(b, from, Math.abs(piece) === 2, Math.sign(piece), [], [from], out);
    b[from] = piece;
  }

  // Pecas capturadas permanecem no tabuleiro como obstaculos ate o fim do lance.
  _dfs(b, sq, king, color, captured, path, out) {
    const N = this.N, cfg = this.cfg;
    const r = (sq / N) | 0, c = sq % N;
    const promoRow = color === 1 ? 0 : N - 1;
    let extended = false;
    for (const [dr, dc] of DIRS) {
      if (!king && !cfg.captureBackwards && dr !== -color) continue;
      if (king && cfg.flyingKings) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 0) { rr += dr; cc += dc; }
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const vsq = rr * N + cc;
        if (b[vsq] * color > 0 || captured.indexOf(vsq) >= 0) continue;
        let lr = rr + dr, lc = cc + dc;
        while (lr >= 0 && lr < N && lc >= 0 && lc < N && b[lr * N + lc] === 0) {
          extended = true;
          captured.push(vsq); path.push(lr * N + lc);
          this._dfs(b, lr * N + lc, king, color, captured, path, out);
          captured.pop(); path.pop();
          lr += dr; lc += dc;
        }
      } else {
        const jr = r + dr * 2, jc = c + dc * 2;
        if (jr < 0 || jr >= N || jc < 0 || jc >= N) continue;
        const vsq = (r + dr) * N + (c + dc), jsq = jr * N + jc;
        if (b[vsq] === 0 || b[vsq] * color > 0 || captured.indexOf(vsq) >= 0 || b[jsq] !== 0) continue;
        extended = true;
        captured.push(vsq); path.push(jsq);
        // regra inglesa: peao que alcanca a linha de promocao encerra o lance
        if (cfg.stopOnPromote && !king && jr === promoRow) out.push({ path: path.slice(), captures: captured.slice() });
        else this._dfs(b, jsq, king, color, captured, path, out);
        captured.pop(); path.pop();
      }
    }
    if (!extended && captured.length) out.push({ path: path.slice(), captures: captured.slice() });
  }

  // --- aplicar / desfazer ------------------------------------------------
  do(st, mv) {
    const b = st.b, piece = b[mv.from];
    const u = { piece, caps: [], half: st.half };
    b[mv.from] = 0;
    for (const sq of mv.captures) { u.caps.push(sq, b[sq]); b[sq] = 0; }
    b[mv.to] = mv.promote ? 2 * Math.sign(piece) : piece;
    st.turn = -st.turn;
    st.half = (mv.captures.length || Math.abs(piece) === 1) ? 0 : st.half + 1;
    return u;
  }

  undo(st, mv, u) {
    const b = st.b;
    b[mv.to] = 0;
    for (let i = u.caps.length - 2; i >= 0; i -= 2) b[u.caps[i]] = u.caps[i + 1];
    b[mv.from] = u.piece;
    st.turn = -st.turn;
    st.half = u.half;
  }

  clone(st) { return { b: Int8Array.from(st.b), turn: st.turn, half: st.half }; }

  // winner: 1 jogador, -1 CPU, 0 empate, null jogo continua.
  outcome(st, moves) {
    const ms = moves || this.moves(st);
    if (ms.length === 0) return -st.turn;
    if (st.half >= this.cfg.drawPlies) return 0;
    return null;
  }
}
