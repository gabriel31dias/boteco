// node src/games/buraco/test-ui.mjs
import assert from 'node:assert/strict';
import { lugarDe, ordenar } from './ui.js';

for (const n of [2, 4]) {
  for (let eu = 0; eu < n; eu++) {
    assert.equal(lugarDe(eu, eu, n).y > 80, true, 'eu embaixo');
    assert.equal(new Set(Array.from({ length: n }, (_, s) => JSON.stringify(lugarDe(s, eu, n)))).size, n);
  }
}
assert.equal(lugarDe(2, 0, 4).y < 20, true, 'parceiro em frente');
assert.ok(lugarDe(1, 0, 4).x < 50, 'o próximo (à esquerda) aparece à esquerda');

assert.deepEqual(ordenar(['Kh0', '2s0', '3s1', 'Ah0', '9c0', 'As0']), ['As0', '3s1', 'Ah0', 'Kh0', '9c0', '2s0'],
  'por naipe (♠ ♥ ♣ ♦), valor crescente, curingas no fim');
assert.deepEqual(ordenar(['Kh0', '3s1', 'Kd1'], 'valor'), ['3s1', 'Kh0', 'Kd1'], 'modo valor agrupa iguais');
assert.deepEqual(ordenar(['2c0', 'Jh0', 'Js0', 'Kd0'], 'valor'), ['Js0', 'Jh0', 'Kd0', '2c0'], 'modo valor: curinga no fim, não junto do J');
console.log('✔ ui do buraco');
