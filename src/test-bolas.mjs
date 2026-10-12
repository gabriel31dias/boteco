// Auto-verificação do giro das bolas: a bola que rola pra +x leva o topo pra +x
// (senão ela "patina pra trás" na tela), e a matriz continua ortonormal.
import assert from 'node:assert/strict';
import { BallBody } from './physics/BallPhysics.js';
import { Vector3 } from './physics/vec3.js';
import { girar, orientacaoInicial } from './bolas.js';

const b = new BallBody(0, 0, 0);
b.velocity.set(1, 0, 0);
b.angularVelocity.set(0, 0, -1 / b.radius);            // rolamento puro nesta convenção…
assert.ok(b.contactVelocity(new Vector3()).length() < 1e-9, '…o ponto de contato fica parado');

const M = orientacaoInicial();
assert.equal(Math.round(M[3]), 1, 'o número começa virado pro alto (+y do mundo)');
for (let i = 0; i < 10; i++) girar(M, b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z, 0.002);
assert.ok(M[0] > 0.1, 'o número foi pra +x junto com a bola');
assert.ok(M[3] < 1 && M[3] > 0.5, 'e desceu um pouco do topo');

for (let i = 0; i < 5000; i++) girar(M, 3.1, -7.7, 12.3, 0.016);
for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) {
  const dot = M[a] * M[c] + M[3 + a] * M[3 + c] + M[6 + a] * M[6 + c];
  assert.ok(Math.abs(dot - (a === c ? 1 : 0)) < 1e-9, 'colunas seguem ortonormais');
}
assert.equal(girar(M, 0, 0, 0, 0.016), false, 'parada não pede redesenho');
console.log('✔ bolas: rolam no sentido certo e a orientação não deforma');
