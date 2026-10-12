// node src/games/galinhas/test-regras.mjs
import assert from 'node:assert/strict';
import * as R from './regras.js';

const T0 = 1_000_000;
const T = T0 + R.CONTAGEM;
function rodar(p, de, ate) {
  const ev = [];
  for (let t = de; t <= ate; t += R.TICK_MS) { R.passo(p, t); ev.push(...p.eventos); }
  return ev;
}
const jogando = (n = 2, cores) => { const p = R.novaPartida(T0, n, cores); R.passo(p, T); p.caixaEm = Infinity; p.ratos.forEach((r) => { r.protegidoAte = 0; }); return p; };

// --- nascimento e itens em cima de algo
{
  const p = R.novaPartida(T0, 4, ['vermelho', 'vermelho']);
  assert.equal(p.cores[0], 'vermelho');
  assert.equal(new Set(p.cores).size, 4);
  const emCima = (x, y) => y === R.CHAO || R.PLATAFORMAS.some(([a, b, top]) => top === y && x > a && x < b);
  for (const [x, y] of [...R.NASCER, ...R.POUSOS]) assert.ok(emCima(x, y), `em cima de algo (${x},${y})`);
  for (const it of R.ITENS) assert.ok(emCima(it.x, it.y), `item ${it.id}`);
  assert.equal(p.ratos[0].arma, 'porrete', 'cada uma sai com a sua arma');
  for (const [x, y] of R.NASCER) {
    assert.ok(R.ITENS.every((it) => it.y !== y || Math.abs(it.x - x) > R.PEGAR + 40), `nascer (${x},${y}) não pega item de graça`);
    assert.ok(R.BARRIS.every(([bx, by]) => by !== y || Math.abs(bx - x) > 60), `nascer (${x},${y}) longe de barril`);
  }
}
console.log('✔ nascimento, itens e arma inicial');

// --- golpe: só quem está na frente; corte sangra; o terceiro seguido é o golpe final
{
  const p = jogando(3, ['branco', 'preto', 'amarelo']);
  const [a, b, c] = p.ratos;
  Object.assign(a, { x: 400, y: 345 }); Object.assign(b, { x: 460, y: 345, vida: 999 }); Object.assign(c, { x: 330, y: 345 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = rodar(p, T, T + 1200);
  const golpes = ev.filter((e) => e.tipo === 'golpe');
  assert.deepEqual(golpes.slice(0, 3).map((g) => g.combo), [1, 2, 3], 'combo 1, 2, 3');
  const acertos = ev.filter((e) => e.tipo === 'acerto' && e.alvo === 1 && e.jeito === 'corte');
  assert.equal(acertos[0].dano, R.ARMAS.cutelo.dano);
  assert.ok(acertos.some((e) => e.final && e.dano === Math.round(R.ARMAS.cutelo.dano * R.FINAL)), 'golpe final mais forte');
  assert.ok(ev.some((e) => e.tipo === 'acerto' && e.alvo === 1 && e.jeito === 'sangue'), 'corte deixa sangrando');
  assert.equal(c.vida, R.GALINHAS.amarelo.vida, 'a de trás escapou');
}
console.log('✔ golpe, combo, golpe final e sangramento');

// --- abate: corte decepa, pancada esmaga; sangrando até morrer, o abate é de quem cortou
{
  const p = jogando(2, ['branco', 'vermelho']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 400, y: 345 }); Object.assign(b, { x: 450, y: 345, vida: 5 });
  R.entrada(p, 1, { ang: Math.PI, fogo: true });
  let ev = rodar(p, T, T + 100);
  assert.equal(ev.find((e) => e.tipo === 'abate')?.jeito, undefined, 'ainda vivo');
  R.entrada(p, 1, { fogo: false });
  b.vida = 5;
  // a corta b: depois sangra até morrer
  Object.assign(a, { prontoEm: 0, ang: 0 });
  a.vida = 999;
  b.vida = R.ARMAS.cutelo.dano + 2;
  R.entrada(p, 0, { ang: 0, fogo: true });
  ev = rodar(p, T + 133, T + 166);
  R.entrada(p, 0, { fogo: false });
  ev.push(...rodar(p, T + 200, T + 2500));
  const morte = ev.find((e) => e.tipo === 'abate' && e.alvo === 1);
  assert.ok(morte, 'morreu sangrando');
  assert.equal(morte.de, 0, 'abate de quem cortou');
}
console.log('✔ sangrar até morrer conta pra quem cortou');

// --- investida bica quem atravessa; planar segura a queda
{
  const p = jogando(2, ['amarelo', 'preto']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 300, y: R.CHAO }); Object.assign(b, { x: 420, y: R.CHAO });
  R.entrada(p, 0, { mx: 1, dash: true, ang: 0 });
  const ev = rodar(p, T, T + 300);
  assert.ok(ev.some((e) => e.tipo === 'dash'));
  assert.ok(ev.some((e) => e.tipo === 'acerto' && e.alvo === 1 && e.jeito === 'bicada'), 'bicou');
  Object.assign(a, { x: 1000, y: 100, vy: 0, chao: false, dash: 0 });
  for (let k = 0; k < 30; k++) R.mover(p, 0, { mx: 0, asa: true }, 0.033);
  assert.ok(a.vy <= R.PLANAR, 'planando');
}
console.log('✔ investida e planar');

// --- ovo-bomba estoura; caixa de arma troca a arma; espinho fura
{
  const p = jogando(2, ['branco', 'vermelho']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 300, y: R.CHAO }); Object.assign(b, { x: 650, y: R.CHAO });   // o ovo vai em arco: cai lá pelos 670
  R.entrada(p, 0, { ang: -0.2, ovo: true });
  let ev = rodar(p, T, T + 1500);
  assert.ok(ev.some((e) => e.tipo === 'explosao' && e.ovo), 'ovo estourou');
  assert.ok(b.vida < R.GALINHAS.vermelho.vida, 'machucou');
  p.caixas.push({ id: 99, x: 200, y: R.CHAO, arma: 'marreta', pousaEm: 0 });
  Object.assign(a, { x: 200, y: R.CHAO, vivo: true });
  ev = rodar(p, T + 1533, T + 1600);
  assert.equal(a.arma, 'marreta', 'pegou a marreta');
  Object.assign(b, { x: 740, y: R.CHAO, vy: 0, vivo: true, vida: 100, protegidoAte: 0 });
  ev = rodar(p, T + 1633, T + 1700);
  assert.ok(ev.some((e) => e.tipo === 'acerto' && e.alvo === 1 && e.jeito === 'espinho'), 'espinho furou');
  assert.ok(b.vy < 0, 'pulou de dor');
}
console.log('✔ ovo-bomba, caixa de arma e espinho');

// --- caixa cai do céu sozinha
{
  const p = jogando();
  p.caixaEm = T + 100;
  const ev = rodar(p, T + 33, T + 200);
  assert.ok(ev.some((e) => e.tipo === 'caixa'));
  assert.equal(p.caixas.length, 1);
}
console.log('✔ caixa de arma do céu');

// --- clique rápido não se perde: um comando de golpe seguido de um sem, no mesmo passo
{
  const p = jogando(2, ['branco', 'preto']);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 400, y: R.CHAO }); Object.assign(b, { x: 450, y: R.CHAO, vida: 999 });
  R.entrada(p, 0, { cmds: [{ s: 1, dt: 33, ang: 0, fogo: true }, { s: 2, dt: 33, ang: 0, fogo: false }] });
  p.credito[0] = 200;   // os dois comandos rodam no mesmo passo
  const ev = rodar(p, T + 100, T + 133);
  assert.ok(ev.some((e) => e.tipo === 'golpe' && e.de === 0), 'o clique valeu');
}
console.log('✔ clique rápido não se perde');

// --- arco da morte: cai, quem pega atira flecha por 10s, a flecha mata com um acerto; depois volta a golpear
{
  const p = jogando(2, ['branco', 'vermelho']);
  const [a, b] = p.ratos;
  p.arcoEm = T + 50;
  let ev = rodar(p, T, T + 100);
  const c = p.caixas.find((x) => x.arma === 'arco');
  assert.ok(c && ev.some((e) => e.tipo === 'caixa' && e.arma === 'arco'), 'o arco caiu');
  p.arcoEm = T + 60;
  rodar(p, T + 133, T + 200);
  assert.equal(p.caixas.filter((x) => x.arma === 'arco').length, 1, 'um arco por vez');
  c.pousaEm = 0;
  Object.assign(a, { x: c.x, y: c.y });
  ev = rodar(p, T + 233, T + 266);
  assert.ok(a.arcoAte > T + 266 + 9000, 'pegou o arco por 10s');
  assert.equal(a.arma, 'cutelo', 'a arma branca fica guardada');
  Object.assign(a, { x: 200, y: R.CHAO, prontoEm: 0 }); Object.assign(b, { x: 450, y: R.CHAO, vida: R.GALINHAS.vermelho.vida });   // antes do barril (540)
  R.entrada(p, 0, { ang: Math.atan2(-10, 250), fogo: true });
  ev = rodar(p, T + 300, T + 1000);
  R.entrada(p, 0, { fogo: false });
  assert.ok(ev.some((e) => e.tipo === 'flecha' && e.de === 0), 'atirou flecha');
  assert.ok(!ev.some((e) => e.tipo === 'golpe' && e.de === 0), 'com o arco não golpeia');
  const morte = ev.find((e) => e.tipo === 'abate' && e.alvo === 1);
  assert.equal(morte?.jeito, 'flecha', 'uma flecha matou a galinha de vida cheia');
  a.arcoAte = 0; a.prontoEm = 0;
  R.entrada(p, 0, { ang: 0, fogo: true });
  ev = rodar(p, T + 1033, T + 1100);
  assert.ok(ev.some((e) => e.tipo === 'golpe' && e.de === 0), 'acabou o arco: volta a golpear');
}
console.log('✔ arco da morte');
console.log('galinhas: regras ok');
