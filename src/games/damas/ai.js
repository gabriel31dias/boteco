// Minimax negamax com poda alpha-beta, aprofundamento iterativo e extensao de capturas.
// Pontuacao sempre do ponto de vista do jogador +1; negamax multiplica por st.turn.

const MAN = 100, KING = 285, WIN = 30000;

export const LEVELS = {
  easy:   { label: 'FACIL',   depth: 2, budget: 120, blunder: 0.34, jitter: 55 },
  normal: { label: 'NORMAL', depth: 5, budget: 320, blunder: 0.07, jitter: 14 },
  hard:   { label: 'DIFICIL',   depth: 16, budget: 950, blunder: 0,   jitter: 0 },
};

function evaluate(rules, st) {
  const N = rules.N, b = st.b, last = N - 1, mid = (N - 1) / 2;
  let s = 0, men = 0, mat = 0;
  for (let sq = 0; sq < b.length; sq++) {
    const p = b[sq];
    if (p === 0) continue;
    const color = p > 0 ? 1 : -1, king = p === 2 || p === -2;
    const r = (sq / N) | 0, c = sq % N;
    mat += color * (king ? KING : MAN);
    if (king) {
      // damas valem mais perto do centro, onde controlam mais diagonais
      s += color * (mid - Math.abs(c - mid)) * 3;
      s += color * (mid - Math.abs(r - mid)) * 2;
    } else {
      men++;
      const adv = color === 1 ? last - r : r;      // linhas avancadas
      s += color * adv * adv * 0.55;               // avanco acelera perto da promocao
      if ((color === 1 && r === last) || (color === -1 && r === 0)) s += color * 9; // guarda de fundo
    }
    if (c === 0 || c === last) s += color * 7;     // bordas sao inatacaveis
    else s += color * (mid - Math.abs(c - mid)) * 1.4;
  }
  s += mat;
  // com vantagem material, trocar pecas e bom
  if (mat !== 0) s += Math.sign(mat) * (24 - men) * 1.6;
  return s;
}

function order(moves) {
  if (moves.length < 2) return moves;
  return moves.sort((a, b) =>
    (b.captures.length - a.captures.length) || ((b.promote ? 1 : 0) - (a.promote ? 1 : 0)));
}

function negamax(rules, st, depth, ply, alpha, beta, ctx) {
  if ((++ctx.nodes & 1023) === 0 && ctx.now() > ctx.deadline) { ctx.stop = true; }
  const moves = rules.moves(st);
  if (moves.length === 0) return -WIN + ply;                 // quem joga esta afogado: perde
  // extensao: nunca avalia no meio de uma sequencia tatica
  const forced = moves.length === 1 || moves[0].captures.length > 0;
  if (depth <= 0 && (!forced || ply >= ctx.maxPly)) return st.turn * evaluate(rules, st);
  if (ctx.stop) return st.turn * evaluate(rules, st);

  order(moves);
  let best = -Infinity;
  for (const m of moves) {
    const u = rules.do(st, m);
    const v = -negamax(rules, st, depth - (forced ? 0 : 1), ply + 1, -beta, -alpha, ctx);
    rules.undo(st, m, u);
    if (v > best) { best = v; if (ply === 0) ctx.best = m; }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    if (ctx.stop) break;
  }
  return best;
}

export function chooseMove(rules, st, level = 'normal', now = () => Date.now()) {
  const L = LEVELS[level] || LEVELS.normal;
  const moves = order(rules.moves(st));
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const ctx = { nodes: 0, best: moves[0], stop: false, maxPly: 24, now, deadline: now() + L.budget };

  // aprofundamento iterativo: guarda o resultado da ultima profundidade completa
  let chosen = ctx.best;
  for (let d = 1; d <= L.depth; d++) {
    ctx.best = null;
    const alpha = -Infinity;
    negamax(rules, st, d, 0, alpha, Infinity, ctx);
    if (ctx.stop) { if (ctx.best && d <= 2) chosen = ctx.best; break; }
    if (ctx.best) chosen = ctx.best;
    if (now() > ctx.deadline) break;
  }

  // erro humano: as vezes escolhe entre os lances quase-bons em vez do melhor
  if (L.blunder > 0 && Math.random() < L.blunder) {
    const scored = moves.map((m) => {
      const u = rules.do(st, m);
      const v = -negamax(rules, st, 0, 1, -Infinity, Infinity, ctx);
      rules.undo(st, m, u);
      return { m, v };
    }).sort((a, b) => b.v - a.v);
    const pool = scored.filter((s) => s.v >= scored[0].v - L.jitter * 4);
    return pool[(Math.random() * pool.length) | 0].m;
  }
  return chosen || moves[0];
}
