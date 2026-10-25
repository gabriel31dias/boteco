// node src/games/castelos/test-regras.mjs — regras de Castelos em Guerra.
import assert from 'node:assert/strict';
import * as R from './regras.js';

let rs = 1;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
/** Robô de teste: varre ângulo/força simulando o mesmo voo e escolhe o que cai mais perto do herói rival. */
export function mirar(p, i) {
  const foe = p.castelos[1 - i], alvo = foe.herois.find((h) => h.vida > 0);
  const t = R.centroHeroi(foe, alvo);
  let best = { e: Infinity, a: 30, f: .7 };
  for (let a = -6; a <= 70; a += 2) for (let f = .3; f <= 1.0001; f += .025) {
    const b = R.lancar(p, i, a, f)[0];
    let r = null;
    for (let k = 0; k < 700 && !r; k++) r = R.avancar(p, b, 1 / 60);
    if (!r || r.oque === 'fora') continue;
    const e = Math.hypot(r.x - t.x, r.y - t.y);
    if (e < best.e) best = { e, a, f };
  }
  return best;
}
const correr = (p, agora, ms) => { const fim = agora + ms; for (; agora < fim && !p.fim; agora += 50) R.passo(p, agora); return agora; };

// largada: contagem, depois vez do 0 com prazo
let p = R.novaPartida(0, 2, [], rnd);
let t = correr(p, 0, R.CONTAGEM + 100);
assert.equal(p.fase, 'mira'); assert.equal(p.vez, 0);

// justo: relevo espelhado, heróis espelhados, castelos com a mesma inclinação (oposta)
assert.ok(Math.abs(R.chao(p.t, 100) - R.chao(p.t, R.MUNDO - 100)) < 1e-6);
assert.deepEqual(p.castelos[0].herois.map((h) => [h.y, h.vida]), p.castelos[1].herois.map((h) => [h.y, h.vida]));
assert.deepEqual(p.castelos[0].herois.map((h) => h.x), p.castelos[1].herois.map((h) => -h.x));
assert.ok(Math.abs(p.castelos[0].ang + p.castelos[1].ang) < 1e-9);

// fora da vez / lixo não atira
assert.equal(R.agir(p, 1, { fogo: { a: 30, f: .7 } }), null);
assert.equal(R.agir(p, 0, { fogo: { a: 'x', f: .7 } }), null);
assert.equal(R.agir(p, 0, {}), null);

// herói rival escondido no estado até abrir buraco
let e = R.estadoPara(p, 0, t);
assert.ok(e.castelos[1].h.every((h) => h[3] === null), 'rival escondido');
assert.ok(e.castelos[0].h.every((h) => h[3] !== null), 'o meu aparece');

// tiro mirado abre buraco no rival, passa pelo próprio castelo, troca a vez
const m = mirar(p, 0);
assert.ok(R.agir(p, 0, { fogo: m }));
t = correr(p, t, 6000);
assert.ok(p.castelos[1].buracos.length > 0, 'furou o rival');
assert.equal(p.castelos[0].buracos.length, 0, 'não furou o próprio');
assert.equal(p.vez, 1);
assert.equal(p.fase, 'mira');

// quem não atira passa a vez; 3 seguidas perde
p = R.novaPartida(0, 2, [], rnd);
t = correr(p, 0, R.CONTAGEM + 100);
for (let k = 0; k < 6 && !p.fim; k++) {
  if (p.vez === 1) { R.agir(p, 1, { fogo: { a: 80, f: .2 } }); t = correr(p, t, 4000); }
  else t = correr(p, t, R.TEMPO_VEZ + 100);
}
assert.deepEqual(p.fim, { vencedor: 1, motivo: 'ausente' });

// W.O.
p = R.novaPartida(0, 2, [], rnd);
assert.deepEqual(R.eliminar(p, 0), { tipo: 'saiu', assento: 0 });
assert.deepEqual(p.fim, { vencedor: 1, motivo: 'wo' });

// partida inteira com dois robôs termina com vencedor por heróis ou por vida
p = R.novaPartida(0, 2, [], rnd);
t = correr(p, 0, R.CONTAGEM + 100);
let tiros = 0;
while (!p.fim && tiros < 2 * R.RODADAS + 2) {
  const i = p.vez;
  R.agir(p, i, { fogo: mirar(p, i) }); tiros++;
  t = correr(p, t, 9000);
}
assert.ok(p.fim, 'acabou');
assert.ok(['herois', 'vida', 'empate'].includes(p.fim.motivo), p.fim.motivo);
console.log(`✔ partida de robôs: ${tiros} tiros, ${JSON.stringify(p.fim)}`);

// Cavador cava antes de explodir
p = R.novaPartida(0, 2, [], rnd);
t = correr(p, 0, R.CONTAGEM + 100);
p.castelos[0].prox = R.TIME.indexOf('cavador');
const ev = [];
R.agir(p, 0, { fogo: mirar(p, 0) });
for (let k = 0; k < 200 && p.fase === 'voo'; k++) { R.passo(p, t += 50); ev.push(...p.eventos); }
const tipos = ev.map((x) => x.tipo);
assert.ok(tipos.includes('cava') && tipos.indexOf('cava') < tipos.indexOf('boom'), tipos.join());

console.log('castelos: regras ok');
