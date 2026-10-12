// Regras puras do jogo da velha. Sem Phaser e sem DOM de propósito: este mesmo
// arquivo é importado pelo cliente e pelo árbitro do servidor, então a regra é
// uma só — não existe versão do servidor discordando da do cliente.

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const BLUNDER = { easy: 0.6, normal: 0.2, hard: 0 };

/** @returns null while the game is live, else { player: 'X'|'O'|null, line: number[]|null } */
export function result(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a], line };
    }
  }
  return board.every(Boolean) ? { player: null, line: null } : null;
}

export const emptyCells = (board) => board.reduce((a, v, i) => (v ? a : (a.push(i), a)), []);

const other = (p) => (p === 'X' ? 'O' : 'X');

// ponytail: 9 cells, ~550k nodes worst case, no memo needed. Depth-preferred so it
// wins as fast as possible and loses as slowly as possible.
function minimax(board, me, turn, depth) {
  const r = result(board);
  if (r) {
    if (r.player === null) return 0;
    return r.player === me ? 10 - depth : depth - 10;
  }
  let best = turn === me ? -Infinity : Infinity;
  for (const i of emptyCells(board)) {
    board[i] = turn;
    const v = minimax(board, me, other(turn), depth + 1);
    board[i] = null;
    best = turn === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

/** Best move for `me`, ties broken randomly so perfect play still feels varied. */
export function bestMove(board, me, rng = Math.random) {
  const cells = emptyCells(board);
  if (!cells.length) return -1;
  let best = -Infinity;
  let tied = [];
  for (const i of cells) {
    board[i] = me;
    const v = minimax(board, me, other(me), 1);
    board[i] = null;
    if (v > best) { best = v; tied = [i]; }
    else if (v === best) tied.push(i);
  }
  return tied[Math.floor(rng() * tied.length)];
}

/** Difficulty = how often the CPU throws away the optimal move. */
export function pickMove(board, me, difficulty, rng = Math.random) {
  const cells = emptyCells(board);
  if (!cells.length) return -1;
  const blunder = BLUNDER[difficulty] ?? 0;
  if (rng() < blunder) return cells[Math.floor(rng() * cells.length)];
  return bestMove(board, me, rng);
}
