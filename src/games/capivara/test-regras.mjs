// node src/games/capivara/test-regras.mjs
import assert from 'node:assert/strict';
import * as R from './regras.js';

const T0 = 1_000_000;
function rodar(p, de, ate) {
  const ev = [];
  for (let t = de; t <= ate; t += R.TICK_MS) { R.passo(p, t); ev.push(...p.eventos); }
  return ev;
}
const jogando = (n = 2, cores) => { const p = R.novaPartida(T0, n, cores); R.passo(p, T0 + R.CONTAGEM); return p; };
const T = T0 + R.CONTAGEM;

// --- mapa: todo ponto de nascer e toda fruta alcançável a pé a partir do primeiro
{
  const p = R.novaPartida(T0, 2); p.capis = [];
  const vis = new Set(['300,340']), fila = [[300, 340]];
  while (fila.length) {
    const [x, y] = fila.pop();
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (vis.has(k) || !R.livre(p, nx, ny, 0)) continue;
      vis.add(k); fila.push([nx, ny]);
    }
  }
  const alc = (x, y) => [...vis].some((k) => { const [a, b] = k.split(',').map(Number); return Math.abs(a - x) <= 4 && Math.abs(b - y) <= 4; });
  for (const [x, y] of R.NASCER) assert.ok(alc(x, y), `nascer (${x},${y}) alcançável`);
  for (const it of R.ITENS) assert.ok(alc(it.x, it.y), `${it.tipo} alcançável`);
}
console.log('✔ mapa conectado');

// --- cores: a pedida, repetida vai pra primeira livre
{
  const p = R.novaPartida(T0, 4, ['rosa', 'rosa']);
  assert.equal(p.cores[0], 'rosa');
  assert.equal(new Set(p.cores).size, 4);
}
console.log('✔ cores');

// --- andar, água e parede seguram
{
  const p = jogando();
  const r = p.capis[0];
  const x0 = r.x;
  for (let k = 0; k < 20; k++) R.mover(p, 0, { mx: 1, my: 0 }, 0.033);
  assert.ok(r.x > x0 + 50, 'anda');
  Object.assign(r, { x: 300, y: 400 });
  for (let k = 0; k < 300; k++) R.mover(p, 0, { mx: -1, my: 0 }, 0.033);
  assert.ok(r.x > 70, `a água da praia segura (${r.x})`);
  Object.assign(r, { x: 680, y: 500 });
  for (let k = 0; k < 100; k++) R.mover(p, 0, { mx: 1, my: 0 }, 0.033);
  assert.ok(r.x < 724, `o rio segura fora da ponte (${r.x})`);
  Object.assign(r, { x: 680, y: 336 });
  for (let k = 0; k < 100; k++) R.mover(p, 0, { mx: 1, my: 0 }, 0.033);
  assert.ok(r.x > 820, `pela ponte atravessa (${r.x})`);
}
console.log('✔ andar e colisão');

// --- tiro d'água acerta e empurra; protegido não leva
{
  const p = jogando(2, ['azul', 'vermelho']);
  const [a, b] = p.capis;
  Object.assign(a, { x: 170, y: 380 }); Object.assign(b, { x: 320, y: 380, protegidoAte: 0 });
  assert.ok(R.livre(p, 170, 380, 0) && R.livre(p, 320, 380, 1), 'linha de tiro em chão');
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = rodar(p, T, T + 500);
  const ac = ev.filter((e) => e.tipo === 'acerto' && e.alvo === 1);
  assert.ok(ac.length >= 3, `metralha d'água (${ac.length})`);
  assert.equal(b.vida, R.CAPIVARAS.vermelho.vida - ac.reduce((s, e) => s + e.dano, 0));
  b.protegidoAte = T + 99_999;
  const v = b.vida;
  rodar(p, T + 533, T + 900);
  assert.equal(b.vida, v, 'protegido não leva');
}
console.log("✔ pistola d'água");

// --- coco explode em área no fim do voo
{
  const p = jogando(2, ['verde', 'rosa']);
  const [a, b] = p.capis;
  Object.assign(a, { x: 170, y: 380 }); Object.assign(b, { x: 360, y: 385, protegidoAte: 0 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = rodar(p, T, T + 1000);
  assert.ok(ev.some((e) => e.tipo === 'explosao'), 'explodiu');
  assert.ok(b.vida < R.CAPIVARAS.rosa.vida, 'pegou quem estava perto');
}
console.log('✔ coco-granada');

// --- melancia: leque de 5
{
  const p = jogando(2, ['rosa', 'azul']);
  Object.assign(p.capis[0], { x: 170, y: 380 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  R.passo(p, T + 33);
  assert.equal(p.balas.length, 5);
}
console.log('✔ melancia');

// --- abate, renascer longe e protegido
{
  const p = jogando(2, ['vermelho', 'azul']);
  const [a, b] = p.capis;
  Object.assign(a, { x: 170, y: 380 }); Object.assign(b, { x: 250, y: 380, protegidoAte: 0, vida: 5 });
  R.entrada(p, 0, { ang: 0, fogo: true });
  const ev = rodar(p, T, T + 400);
  assert.ok(ev.some((e) => e.tipo === 'abate' && e.alvo === 1 && e.de === 0));
  assert.equal(p.abates[0], 1);
  R.entrada(p, 0, { fogo: false });
  const ev2 = rodar(p, T + 433, T + 433 + R.RENASCER + 100);
  assert.ok(ev2.some((e) => e.tipo === 'renasce' && e.i === 1));
  assert.ok(b.vivo && b.vida === R.CAPIVARAS.azul.vida && b.protegidoAte > p.ultimo);
}
console.log('✔ abate e renascer');

// --- fruta cura; pega sempre, até de vida cheia
{
  const p = jogando();
  const it = R.ITENS[0], r = p.capis[0];
  Object.assign(r, { x: it.x + 30, y: it.y });     // nem precisa estar em cima
  r.vida = 30;
  const ev = rodar(p, T + 66, T + 133);
  assert.ok(ev.some((e) => e.tipo === 'pega'));
  assert.equal(r.vida, 30 + it.cura);
  r.vida = R.CAPIVARAS[p.cores[0]].vida;
  const it2 = R.ITENS[2];
  Object.assign(r, { x: it2.x, y: it2.y });
  rodar(p, T + 166, T + 232);
  assert.ok(p.pegos[it2.id] > 0, 'vida cheia também pega');
}
// --- quina: andando rente a uma caixa, a capivara contorna em vez de enganchar
{
  const p = jogando();
  const r = p.capis[0];
  // pés raspando o topo das caixas (303..419, 260..304): de frente, enganchava na quina
  Object.assign(r, { x: 250, y: 253 });
  assert.ok(R.livre(p, r.x, r.y, 0), 'começa em chão');
  const x0 = r.x;
  for (let k = 0; k < 40; k++) R.mover(p, 0, { mx: 1, my: 0 }, 0.033);
  assert.ok(r.x > 440, `passou rente à caixa (${x0.toFixed(0)} -> ${r.x.toFixed(0)})`);
}
console.log('✔ frutas e quinas');

// --- fim por abates, tempo e dano; W.O.
{
  const p = jogando(3);
  p.abates = [2, 2, 0]; p.dano = [10, 90, 0];
  R.passo(p, p.fimEm + 1);
  assert.deepEqual(p.fim, { vencedor: 1, motivo: 'dano' });
  const q = jogando(3);
  R.eliminar(q, 1); assert.equal(q.fim, null);
  R.eliminar(q, 2); assert.deepEqual(q.fim, { vencedor: 0, motivo: 'wo' });
}
console.log('✔ fim e W.O.');

// --- comandos: previsão = servidor, teto de velocidade
{
  const p = jogando();
  const cmds = Array.from({ length: 12 }, (_, k) => ({ s: k + 1, mx: 0.8, my: 0.6, dt: 33, ang: 0 }));   // já normalizado, como o cliente manda
  const sombra = { ...p, capis: p.capis.map((r) => ({ ...r })) };
  for (const c of cmds) R.mover(sombra, 0, c, c.dt / 1000);
  R.entrada(p, 0, { cmds });
  rodar(p, T, T + 500);
  assert.equal(p.ack[0], 12);
  assert.ok(Math.abs(p.capis[0].x - sombra.capis[0].x) < 1e-9 && Math.abs(p.capis[0].y - sombra.capis[0].y) < 1e-9, 'previsão = servidor');
  const q = jogando();
  const x0 = q.capis[0].x;
  R.entrada(q, 0, { cmds: Array.from({ length: 60 }, (_, k) => ({ s: k + 1, mx: 1, dt: 999 })) });
  rodar(q, T, T + 100);
  assert.ok(q.capis[0].x - x0 <= R.CAPIVARAS[q.cores[0]].vel * 0.16 + 1, 'teto de velocidade');
}
console.log('✔ comandos');
// --- super bomba: aparece, pega, lança e arrasa; quem morre com ela deixa cair
{
  const p = jogando(3, ['azul', 'vermelho', 'verde']);
  const [a, b, c] = p.capis;
  Object.assign(a, { x: 200, y: 380 }); Object.assign(b, { x: 1336, y: 360 }); Object.assign(c, { x: 1306, y: 720 });
  let ev = rodar(p, T, T + R.SUPER.primeira + 100);
  assert.ok(ev.some((e) => e.tipo === 'super') && p.super, 'apareceu');
  const [sx, sy] = p.super;
  Object.assign(a, { x: sx, y: sy });
  ev = rodar(p, T + R.SUPER.primeira + 133, T + R.SUPER.primeira + 200);
  assert.ok(ev.some((e) => e.tipo === 'pega' && e.item === 'superbomba' && e.i === 0), 'pegou');
  assert.equal(a.super, true); assert.equal(p.super, null);
  assert.equal(R.estadoPara(p, 0).c[0][10], 1, 'vai no estado');
  // lança em quem está a 200px: os dois de perto morrem (vida cheia)
  const t0 = T + R.SUPER.primeira + 300;
  Object.assign(a, { x: 170, y: 380 }); Object.assign(b, { x: 370, y: 380, protegidoAte: 0 }); Object.assign(c, { x: 330, y: 470, protegidoAte: 0 });
  R.entrada(p, 0, { cmds: [{ s: 1, mx: 0, my: 0, dt: 33, ang: 0, bomba: true }] });
  ev = rodar(p, t0, t0 + 1200);
  assert.ok(ev.some((e) => e.tipo === 'explosao' && e.super), 'explodiu forte');
  assert.ok(!b.vivo && !c.vivo, 'arrasou os dois');
  assert.equal(p.abates[0], 2);
  assert.equal(a.super, false, 'era uma vez só');
  assert.ok(p.superEm > t0, 'a próxima está marcada');
}
{
  // morreu segurando: cai no chão
  const p = jogando(2, ['azul', 'vermelho']);
  const [a, b] = p.capis;
  a.super = true;
  Object.assign(a, { x: 250, y: 380, vida: 1, protegidoAte: 0 }); Object.assign(b, { x: 170, y: 380 });
  R.entrada(p, 1, { ang: 0, fogo: true });
  rodar(p, T, T + 300);
  assert.ok(!a.vivo && p.super && Math.abs(p.super[0] - 250) < 30, 'caiu onde morreu');
}
console.log('✔ super bomba');
assert.ok(JSON.stringify(R.estadoPara(jogando(4), 0, 1)).length < 3500, 'pacote pequeno');
console.log('capivara: regras ok');
