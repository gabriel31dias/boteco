// node src/games/psicopatas/test-regras.mjs
import assert from 'node:assert/strict';
import * as R from './regras.js';

const T0 = 1_000_000;
const T = T0 + R.CONTAGEM;
function rodar(p, de, ate) {
  const ev = [];
  for (let t = de; t <= ate; t += R.TICK_MS) { R.passo(p, t); ev.push(...p.eventos); }
  return ev;
}
const jogando = (n = 2, cores) => { const p = R.novaPartida(T0, n, cores); R.passo(p, T); return p; };
const sem = (p) => p.ratos.forEach((r) => { r.protegidoAte = 0; });

// --- cores e nascimento em cima de alguma coisa
{
  const p = R.novaPartida(T0, 4, ['amarelo', 'amarelo']);
  assert.equal(p.cores[0], 'amarelo');
  assert.equal(new Set(p.cores).size, 4);
  for (const [x, y] of R.NASCER) assert.ok(R.PLATAFORMAS.some(([a, b, top]) => top === y && x > a && x < b), `nasce em plataforma (${x},${y})`);
  for (const it of R.ITENS) assert.ok(R.PLATAFORMAS.some(([a, b, top]) => top === it.y && it.x > a && it.x < b) || R.CAIXAS.some(([a, top, b]) => top === it.y && it.x > a && it.x < b), `item em cima de algo (${it.id})`);
}
console.log('✔ cores, nascimento e itens');

// --- cai na passarela; S atravessa e cai na água: derrete, e o abate é de quem bateu por último
{
  const p = jogando(2, ['azul', 'vermelho']);
  sem(p);
  const [a, b] = p.ratos;
  Object.assign(a, { x: 500, y: 450, vy: 0, chao: false });
  rodar(p, T, T + 800);
  assert.equal(a.y, 609, 'pousou na passarela de baixo');
  Object.assign(b, { x: 700, y: 609 });
  a.ultimoDe = 1; a.ultimoEm = T + 700;
  R.entrada(p, 0, { mx: 0, desce: true });
  const ev = rodar(p, T + 833, T + 1600);
  const morte = ev.find((e) => e.tipo === 'abate' && e.alvo === 0);
  assert.ok(morte?.acido, 'derreteu na água');
  assert.equal(morte.de, 1, 'abate de quem bateu antes');
  assert.equal(p.abates[1], 1);
}
console.log('✔ passarela, água tóxica e culpa');

// --- Q troca pra arma branca: corre mais, golpe só pega quem está na frente
{
  const p = jogando(3, ['vermelho', 'azul', 'verde']);
  sem(p);
  const [g, m, b] = p.ratos;
  Object.assign(g, { x: 500, y: 331 }); Object.assign(m, { x: 560, y: 331 }); Object.assign(b, { x: 430, y: 331 });
  R.mover(p, 0, { mx: 0, troca: true }, 0.033);
  assert.equal(g.branca, true, 'trocou');
  const x0 = g.x;
  R.mover(p, 0, { mx: 1 }, 0.1);
  assert.ok(Math.abs(g.x - x0 - R.RATOS.vermelho.vel * R.BRANCA_VEL * 0.1) < 0.01, 'de arma branca corre mais');
  Object.assign(g, { x: 500 });
  R.entrada(p, 0, { mx: 0, ang: 0, fogo: true });
  const ev = rodar(p, T + 200, T + 260);
  assert.ok(ev.some((e) => e.tipo === 'golpe' && e.acertou), 'golpeou');
  assert.equal(m.vida, R.RATOS.azul.vida - R.RATOS.vermelho.b.dano, 'frigideira pegou o da frente');
  assert.equal(b.vida, R.RATOS.verde.vida, 'o de trás escapou');
  assert.ok(ev.some((e) => e.tipo === 'acerto' && e.branca), 'acerto marcado como arma branca');
  assert.equal(p.balas.length, 0, 'arma branca não atira');
  R.mover(p, 0, { mx: 0, troca: true }, 0.033);
  assert.equal(g.branca, false, 'Q de novo volta pra arma de fogo');
}
console.log('✔ arma branca');

// --- headshot mata na hora; cascata de ácido queima
{
  const p = jogando(2, ['amarelo', 'vermelho']);
  sem(p);
  const [s, g] = p.ratos;
  Object.assign(s, { x: 300, y: 331 }); Object.assign(g, { x: 700, y: 331 });
  const yCabeca = 331 - R.RATOS.vermelho.h + 8, yBoca = 331 - R.RATOS.amarelo.h * 0.5;
  R.entrada(p, 0, { ang: Math.atan2(yCabeca - yBoca, 400), fogo: true });
  const ev = rodar(p, T, T + 500);
  const morte = ev.find((e) => e.tipo === 'abate' && e.alvo === 1);
  assert.ok(morte?.cabeca, 'headshot de sniper mata com um');
  assert.equal(ev.filter((e) => e.tipo === 'acerto' && e.alvo === 1).length, 1);
  R.entrada(p, 0, { fogo: false });
  const v = s.vida;
  Object.assign(s, { x: 1076, y: 375, vy: 0 });
  const ev2 = rodar(p, T + 533, T + 1300);
  assert.ok(ev2.some((e) => e.tipo === 'queima' && e.alvo === 0), 'queimou na cascata');
  assert.ok(s.vida < v);
}
console.log('✔ headshot e ácido');
console.log('psicopatas: regras ok');
