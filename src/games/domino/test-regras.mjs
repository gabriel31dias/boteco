// Auto-verificação das regras do dominó: node src/games/domino/test-regras.mjs
import assert from 'node:assert/strict';
import { DominoGame, mulberry32 } from './regras.js';

const P = (a, b) => ({ id: `${a}-${b}`, a, b, double: a === b, pips: a + b });

/** Joga até acabar: primeira jogada válida, compra quando precisa, passa. */
function jogarAteOFim(j) {
  for (let guarda = 0; guarda < 5000; guarda++) {
    if (j.phase === 'matchOver') return;
    if (j.phase === 'roundOver') j.startRound();
    const s = j.turn;
    const mv = j.validMoves(s)[0];
    if (mv) j.play(s, mv.id, mv.side);
    else if (j.boneyard.length) j.drawPiece(s);
    else j.passTurn(s);
  }
  throw new Error('partida não terminou');
}

// 1. Distribuição: 7 pra cada, o resto é monte
for (const [n, monte] of [[2, 14], [3, 7], [4, 0]]) {
  const j = new DominoGame({ rng: mulberry32(n), jogadores: n });
  j.startRound();
  assert.equal(j.hands.length, n);
  assert.ok(j.hands.every((h) => h.length === 7), `${n} jogadores: 7 peças cada`);
  assert.equal(j.boneyard.length, monte, `${n} jogadores: ${monte} no monte`);
  assert.equal(new Set(j.hands.flat().concat(j.boneyard).map((p) => p.id)).size, 28, 'as 28 peças, sem repetir');
  assert.equal(j.scores.length, n, 'placar individual: um por jogador');
}
assert.equal(new DominoGame({ jogadores: 4, duplas: true }).scores.length, 2, 'duplas: placar por time');
console.log('✔ distribuição: 2, 3 e 4 jogadores');

// 2. A vez gira pela mesa
{
  const j = new DominoGame({ rng: mulberry32(7), jogadores: 3 });
  j.startRound();
  j.hands = [[P(6, 6), P(0, 1)], [P(6, 5), P(0, 2)], [P(5, 4), P(0, 3)]];
  j.turn = 0;
  j.play(0, '6-6', 'right');
  assert.equal(j.turn, 1, 'depois do 0 vem o 1');
  j.play(1, '6-5', 'right');
  assert.equal(j.turn, 2, 'depois do 1 vem o 2');
  j.play(2, '5-4', 'right');
  assert.equal(j.turn, 0, 'e volta pro 0');
  console.log('✔ vez gira pelos três');
}

// 3. Individual: quem bate marca a soma de TODOS os adversários
{
  const j = new DominoGame({ rng: mulberry32(1), jogadores: 3, target: 500 });
  j.startRound();
  j.chain = [P(3, 3)]; j.ends = { left: 3, right: 3 };
  j.hands = [[P(3, 4)], [P(6, 6), P(5, 5)], [P(1, 2)]];   // 22 + 3 nas outras mãos
  j.turn = 0;
  j.play(0, '3-4', 'right');
  assert.equal(j.phase, 'roundOver');
  assert.equal(j.result.winner, 0);
  assert.equal(j.result.points, 25, 'soma das duas mãos adversárias');
  assert.deepEqual(j.scores, [25, 0, 0]);
  console.log('✔ bater soma a mão de todos os adversários');
}

// 4. Fechou: leva quem tem menos; empate no mínimo, ninguém pontua
{
  const fechar = (maos) => {
    const j = new DominoGame({ rng: mulberry32(2), jogadores: maos.length, target: 500 });
    j.startRound();
    j.chain = [P(6, 6)]; j.ends = { left: 6, right: 6 };
    j.hands = maos; j.boneyard = [];
    j.turn = 0;
    for (let i = 0; i < maos.length; i++) j.passTurn(j.turn);
    return j;
  };
  const j = fechar([[P(0, 1)], [P(2, 3)], [P(4, 5)]]);
  assert.equal(j.result.reason, 'blocked', 'fecha quando os três passam');
  assert.equal(j.result.winner, 0, 'menos pontos na mão');
  assert.equal(j.result.points, 5 + 9);
  const e = fechar([[P(0, 1)], [P(1, 0)], [P(4, 5)]]);
  assert.equal(e.result.winner, null, 'dois empatados no mínimo: ninguém');
  assert.deepEqual(e.scores, [0, 0, 0]);
  console.log('✔ jogo fechado: menor mão leva, empate no mínimo zera');
}

// 5. Duplas: pontos do time, parceiro não conta como adversário
{
  const j = new DominoGame({ rng: mulberry32(3), jogadores: 4, duplas: true, target: 500 });
  j.startRound();
  j.chain = [P(2, 2)]; j.ends = { left: 2, right: 2 };
  j.hands = [[P(2, 0)], [P(6, 6)], [P(5, 5)], [P(1, 1)]];
  j.turn = 0;
  j.play(0, '2-0', 'right');
  assert.equal(j.result.winner, 0, 'o time 0 (assentos 0 e 2) bateu');
  assert.equal(j.result.points, 12 + 2, 'só as mãos dos adversários (1 e 3)');
  assert.deepEqual(j.scores, [14, 0]);
  console.log('✔ duplas: o time leva a mão dos dois adversários');
}

// 6. Partidas completas até o alvo, em todas as mesas
for (const [n, duplas] of [[2, false], [3, false], [4, false], [4, true]]) {
  const j = new DominoGame({ rng: mulberry32(n * 10 + duplas), jogadores: n, duplas, target: 50 });
  j.startRound();
  jogarAteOFim(j);
  const w = j.result.matchWinner;
  assert.ok(w === null || j.scores[w] >= 50, `${n}${duplas ? ' duplas' : ''}: vencedor cruzou o alvo`);
  assert.equal(j.hands.flat().length + j.chain.length + j.boneyard.length, 28, 'nenhuma peça some');
}
console.log('✔ partidas completas: 2, 3, 4 e duplas');

// 7. Individual: quem sai fica fora e a partida segue com os outros
{
  const j = new DominoGame({ rng: mulberry32(9), jogadores: 3, target: 500 });
  j.startRound();
  j.chain = [P(6, 6)]; j.ends = { left: 6, right: 6 };
  j.hands = [[P(0, 1)], [P(6, 2), P(5, 5)], [P(2, 3)]];
  j.boneyard = [];
  j.turn = 1;
  j.eliminar(1);                                    // saiu na vez dele
  assert.equal(j.turn, 2, 'a vez pula quem saiu');
  j.passTurn(2);
  assert.equal(j.turn, 0, 'e não volta pra ele');
  j.passTurn(0);
  assert.equal(j.result.reason, 'blocked', 'fecha com os dois que restaram passando');
  assert.equal(j.result.winner, 0, 'menor mão entre quem ficou (a dele não conta)');
  assert.equal(j.result.points, 5, 'só a mão de quem ficou vale ponto');

  j.startRound();
  assert.equal(j.hands[1].length, 0, 'na rodada seguinte ele não recebe peça');
  assert.ok(j.hands[0].length === 7 && j.hands[2].length === 7, 'os outros recebem 7');
  assert.equal(j.boneyard.length, 14, 'e o monte é o de uma mesa de 2');

  const l = new DominoGame({ rng: mulberry32(4), jogadores: 3, target: 50 });
  l.startRound();
  l.scores = [40, 49, 10];
  l.eliminar(1);                                    // o líder sai
  l.chain = [P(3, 3)]; l.ends = { left: 3, right: 3 };
  l.hands = [[P(3, 1)], [P(6, 6)], [P(6, 5), P(5, 4)]];
  l.turn = 0;
  l.play(0, '3-1', 'right');
  assert.equal(l.result.points, 20, 'a mão de quem saiu não entra nos pontos');
  assert.equal(l.result.matchWinner, 0, 'quem saiu na frente não vence');

  const u = new DominoGame({ rng: mulberry32(5), jogadores: 3 });
  u.startRound();
  u.eliminar(0);
  u.eliminar(2);
  assert.equal(u.phase, 'matchOver');
  assert.equal(u.result.matchWinner, 1, 'sobrou um: ele ganha');
  assert.equal(new DominoGame({ jogadores: 4, duplas: true }).eliminar(0), null, 'nas duplas não elimina (é W.O.)');
  console.log('✔ eliminação: a vez pula, a mão sai da conta, o último ganha');
}

console.log('✔ dominó: 7/7 verificações passaram');
