// Auto-verificação do rack semeado. Fora do rack.js porque o bundler não
// tem como saber que este bloco nunca roda no navegador.
import assert from 'node:assert/strict';
import { mulberry32, rackOrder } from './rack.js';
import { GameState } from './GameState.js';
import { TurnManager } from './TurnManager.js';
const of = (seed) => rackOrder(mulberry32(seed));

assert.deepEqual(of(12345), of(12345), 'mesma semente = mesmo triângulo');
assert.notDeepEqual(of(1), of(2), 'sementes diferentes embaralham');

for (const seed of [0, 1, 7, 99999, 0xffffffff]) {
  const r = of(seed);
  assert.deepEqual([...r].sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1),
    'as 15 bolas, sem repetir');
  assert.equal(r[4], 8, '8 no centro');
  assert.ok((r[10] < 8) !== (r[14] < 8), 'cantos traseiros de grupos opostos');
}

const rand = mulberry32(42);
const vals = Array.from({ length: 1000 }, rand);
assert.ok(Math.min(...vals) >= 0 && Math.max(...vals) < 1, 'mulberry32 fica em [0,1)');

// Falta por tempo: mesma consequência de qualquer outra falta.
{
  const state = new GameState();
  state.reset();
  state.current = 0;
  const turns = new TurnManager(state);
  const r = turns.timeout();
  assert.equal(r.foul, true, 'tempo esgotado é falta');
  assert.equal(state.current, 1, 'a vez passa pro adversário');
  assert.equal(state.ballInHand, true, 'e ele joga com bola na mão');
  assert.equal(state.players[0].stats.fouls, 1, 'a falta entra na ficha de quem demorou');
  assert.equal(r.gameOver, false, 'a primeira é só falta');

  // segunda seguida do mesmo jogador entrega a partida
  state.current = 0;
  const r2 = turns.timeout();
  assert.equal(r2.gameOver, true, 'duas seguidas acabam a partida');
  assert.equal(r2.winner, 1, 'quem estava esperando vence');

  // tacar no meio zera a contagem: a segunda falta volta a ser só falta
  const outro = new GameState();
  outro.reset();
  const t2 = new TurnManager(outro);
  outro.current = 0;
  t2.timeout();
  outro.current = 0;
  t2.begin(false);                    // tacada legal: acerta uma bola e vai na tabela
  Object.assign(t2.shot, { firstContact: 1, pocketed: [1], railAfterContact: true });
  t2.resolve();
  outro.current = 0;
  assert.equal(t2.timeout().gameOver, false, 'tacar no meio zera a contagem');
}

console.log('rack + relógio: 5 casos ok');
