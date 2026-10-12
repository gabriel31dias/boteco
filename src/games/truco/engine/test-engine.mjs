// Auto-verificação das regras: node src/engine/test-engine.mjs
import assert from 'node:assert';
import { newDeck, manilhaRank, strength, RANKS, cardName } from './deck.js';
import { Match, Phase, handResult, nextValue, timeDe } from './match.js';

const C = (rank, suit) => ({ r: RANKS.indexOf(rank), s: ['ouros', 'espadas', 'copas', 'paus'].indexOf(suit) });

// 1. Baralho e manilha
{
  assert.equal(newDeck().length, 40, 'baralho tem 40 cartas');
  assert.equal(manilhaRank(C('7', 'ouros')), RANKS.indexOf('Q'), 'vira 7 → manilha Q');
  assert.equal(manilhaRank(C('3', 'paus')), RANKS.indexOf('4'), 'vira 3 → manilha 4 (circular)');
}

// 2. Força: manilha > qualquer comum, e naipes ouros<espadas<copas<paus
{
  const m = manilhaRank(C('7', 'ouros'));          // manilhas são as damas
  assert.ok(strength(C('Q', 'ouros'), m) > strength(C('3', 'paus'), m), 'manilha bate o 3');
  const ord = ['ouros', 'espadas', 'copas', 'paus'].map((s) => strength(C('Q', s), m));
  assert.deepEqual(ord, [...ord].sort((a, b) => a - b), 'zap (paus) é a mais forte');
}

// 3. Resultado da mão com empates
{
  assert.equal(handResult([0, 0]), 0, 'duas rodadas ganhas vence');
  assert.equal(handResult([-1, 1]), 1, 'empate na 1ª → vence quem ganhar a 2ª');
  assert.equal(handResult([-1, -1, 0]), 0, 'empate 1ª e 2ª → vence a 3ª');
  assert.equal(handResult([0, -1]), 0, 'empate na 2ª → vence quem fez a 1ª');
  assert.equal(handResult([1, 0, -1]), 1, 'empate na 3ª → vence quem fez a 1ª');
  assert.equal(handResult([-1, -1, -1]), 'draw', 'três empates: ninguém pontua');
  assert.equal(handResult([0]), null, 'uma rodada não decide');
}

// 4. Escada de aumentos
{
  assert.deepEqual([1, 3, 6, 9].map(nextValue), [3, 6, 9, 12], 'escada 1-3-6-9-12');
  assert.equal(nextValue(12), null, 'doze não retruca');
}

// 5. Correr dá ao pedinte o valor ANTERIOR ao pedido
{
  const m = new Match();
  m.startHand();
  m.raise(m.turn);
  const asker = m.pending.by;
  m.respond(1 - asker, 'run');
  assert.equal(m.scores[asker], 1, 'correu do truco: pedinte leva 1');
}

// 6. Retruco aceito vale o novo valor; correr do seis dá 3
{
  const m = new Match();
  m.startHand();
  const a = m.turn;
  m.raise(a);                       // truco (3)
  m.respond(1 - a, 'raise');        // seis (aceita 3 e pede 6)
  assert.equal(m.value, 3, 'retrucar aceita o valor anterior');
  m.respond(a, 'run');
  assert.equal(m.scores[1 - a], 3, 'quem correu do seis entrega 3');
}

// 7. Não se pede aumento duas vezes seguidas
{
  const m = new Match();
  m.startHand();
  const a = m.turn;
  m.raise(a);
  m.respond(1 - a, 'accept');
  assert.equal(m.canRaise(a), false, 'quem pediu não pede de novo');
  assert.ok(m.canRaise(1 - a) || m.turn !== 1 - a, 'o outro pode retrucar na vez dele');
}

// 8. Mão de onze: aceitar vale 3 e trava aumentos; correr dá 1 ao adversário
{
  const m = new Match();
  m.scores = [11, 5];
  m.startHand();
  assert.equal(m.phase, Phase.ONZE, 'mão de onze pede decisão');
  m.onze(0, true);
  assert.equal(m.value, 3, 'mão de onze aceita vale 3');
  assert.equal(m.canRaise(m.turn), false, 'sem aumentos na mão de onze');

  const m2 = new Match();
  m2.scores = [4, 11];
  m2.startHand();
  m2.onze(1, false);
  assert.equal(m2.scores[0], 5, 'correr da mão de onze dá 1 ao adversário');
}

// 9. Mão de ferro (11×11): vale 1, sem pedidos
{
  const m = new Match();
  m.scores = [11, 11];
  m.startHand();
  assert.equal(m.phase, Phase.PLAY, 'mão de ferro é jogada direto');
  assert.equal(m.value, 1, 'mão de ferro vale 1');
  assert.equal(m.canRaise(m.turn), false, 'mão de ferro não aceita truco');
}

// 10. Partida completa: alguém chega a 12 e o jogo acaba
{
  const m = new Match();
  let guard = 0;
  while (m.winner === null && guard++ < 500) {
    let ev = m.startHand();
    if (m.phase === Phase.ONZE) ev = m.onze(m.onzeSeat, true);
    while (m.phase === Phase.PLAY) m.playCard(m.turn, 0);
  }
  assert.ok(m.winner !== null, 'a partida termina');
  assert.ok(m.scores[m.winner] >= 12, `vencedor com ${m.scores[m.winner]} pontos`);
  assert.ok(guard < 500, 'sem loop infinito');
}

// 11. Quem vence a vaza começa a próxima
{
  const m = new Match();
  m.startHand();
  const first = m.turn;
  m.playCard(first, 0);
  m.playCard(1 - first, 0);
  const r = m.results[0];
  if (r >= 0) assert.equal(m.turn, r, 'vencedor da vaza sai na próxima');
  else assert.equal(m.turn, m.roundStarter, 'empate mantém quem começou');
}

// 12. Duplas: 4 mãos, vez girando, placar por time
{
  const m = new Match({ jogadores: 4 });
  m.startHand();
  const todas = m.hands.flat().map(cardName);
  assert.equal(m.hands.length, 4, 'quatro mãos');
  assert.equal(new Set(todas).size, 12, 'doze cartas diferentes');
  const vez = [];
  for (let i = 0; i < 4; i++) { vez.push(m.turn); m.playCard(m.turn, 0); }
  assert.deepEqual(vez, [0, 1, 2, 3], 'a vez gira pelos quatro');
  assert.equal(m.results.length, 1, 'a vaza fecha com quatro cartas');
  assert.equal(m.scores.length, 2, 'placar é por time');
}

// 13. Duplas: empate de parceiros ganha, empate de adversários canga
{
  const m = new Match({ jogadores: 4 });
  m.startHand();
  m.manilhaR = RANKS.indexOf('4');
  m.hands = [[C('3', 'ouros')], [C('5', 'ouros')], [C('3', 'copas')], [C('6', 'ouros')]];
  for (let i = 0; i < 4; i++) m.playCard(m.turn, 0);
  assert.equal(m.results[0], 0, 'dois 3 do mesmo time: a vaza é do time');

  const m2 = new Match({ jogadores: 4 });
  m2.startHand();
  m2.manilhaR = RANKS.indexOf('4');
  m2.hands = [[C('3', 'ouros')], [C('3', 'copas')], [C('5', 'ouros')], [C('6', 'ouros')]];
  for (let i = 0; i < 4; i++) m2.playCard(m2.turn, 0);
  assert.equal(m2.results[0], -1, '3 contra 3 de times diferentes: cangou');
}

// 14. Duplas: responde o adversário seguinte, e o parceiro não repete o pedido
{
  const m = new Match({ jogadores: 4 });
  m.startHand();
  m.raise(0);
  assert.equal(m.respond(2, 'accept').length, 0, 'o parceiro não responde o próprio pedido');
  assert.equal(m.respondente(), 1, 'responde quem está depois de quem pediu');
  m.respond(1, 'accept');
  m.playCard(0, 0);
  m.playCard(1, 0);
  assert.equal(m.canRaise(2), false, 'o parceiro de quem pediu não pede de novo');
}

// 15. Duplas: mão de onze é decidida por alguém da dupla com 11
{
  const m = new Match({ jogadores: 4, starter: 1 });
  m.scores = [11, 3];
  m.startHand();
  assert.equal(timeDe(m.onzeSeat), 0, 'decide alguém do time com 11');
  assert.equal(m.onze(1, true).length, 0, 'o adversário não decide');
  m.onze(m.onzeSeat, false);
  assert.equal(m.scores[1], 4, 'correr dá 1 ao outro time');
}

// 16. Duplas: partida completa
{
  const m = new Match({ jogadores: 4 });
  let guard = 0;
  while (m.winner === null && guard++ < 500) {
    m.startHand();
    if (m.phase === Phase.ONZE) m.onze(m.onzeSeat, true);
    while (m.phase === Phase.PLAY) m.playCard(m.turn, 0);
  }
  assert.ok(m.winner === 0 || m.winner === 1, 'vence um time');
  assert.ok(m.scores[m.winner] >= 12);
}

console.log('✔ truco: 16/16 verificações passaram');
