// Auto-verificação dos helpers da mesa de cacheta: node src/games/cacheta/test-ui.mjs
import assert from 'node:assert/strict';
import { lugarDe, ordenar } from './ui.js';

{
  for (let n = 2; n <= 6; n++) {
    for (let eu = 0; eu < n; eu++) {
      assert.deepEqual(lugarDe(eu, eu, n), { x: 9, y: 86 }, 'eu sempre embaixo à esquerda');
      const lugares = Array.from({ length: n }, (_, s) => JSON.stringify(lugarDe(s, eu, n)));
      assert.equal(new Set(lugares).size, n, `${n} lugares diferentes`);
    }
  }
  assert.ok(lugarDe(1, 0, 4).x < 50, 'o próximo (à esquerda) aparece à esquerda da tela');
  console.log('✔ lugares da mesa');
}

{
  const mao = ['Kd0', '9s0', '3h0', 'As0', '9c1', '3s0'];
  assert.deepEqual(ordenar(mao, '8c0'), ['As0', '3s0', '3h0', 'Kd0', '9s0', '9c1'], 'por naipe, curingas (9 pretos) no fim');
  assert.deepEqual(ordenar(mao, '8c0', 'valor'), ['As0', '3s0', '3h0', 'Kd0', '9s0', '9c1']);
  assert.deepEqual(ordenar(['9s0', '9h0'], '8h0'), ['9s0', '9h0'], 'vira vermelha: 9♥ é o curinga');
  console.log('✔ ordenar a mão');
}
