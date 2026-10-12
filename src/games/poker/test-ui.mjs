// node src/games/poker/test-ui.mjs
import assert from 'node:assert/strict';
import { fichasDe, lugarDe, presets, rotulo } from './ui.js';

for (let n = 2; n <= 6; n++) {
  for (let eu = 0; eu < n; eu++) {
    assert.deepEqual(lugarDe(eu, eu, n), { x: 50, y: 82 }, 'eu sempre embaixo no centro');
    const lugares = Array.from({ length: n }, (_, s) => JSON.stringify(lugarDe(s, eu, n)));
    assert.equal(new Set(lugares).size, n, `${n} lugares distintos`);
  }
}
assert.ok(lugarDe(1, 0, 6).x < 50, 'o próximo (à esquerda) aparece à esquerda da tela');

const cores = fichasDe(1385);
assert.ok(cores.length <= 10);
assert.deepEqual(fichasDe(0), []);
assert.equal(fichasDe(1000)[0], 'dourada');

const L = { check: false, call: 40, minRaise: 80, maxRaise: 900 };
const ps = presets(L, 120, 0);
assert.equal(ps[0].valor, 80, 'primeiro é o mínimo');
assert.equal(ps.at(-1).rotulo, 'All-in');
assert.ok(ps.every((p) => p.valor >= 80 && p.valor <= 900), 'dentro dos limites');
assert.equal(new Set(ps.map((p) => p.valor)).size, ps.length, 'sem repetição');

assert.equal(rotulo({ acao: 'raise', valor: 120 }), 'AUMENTOU 120');
assert.equal(rotulo({ acao: 'allin' }), 'ALL-IN!');
console.log('✔ ui do pôquer');
