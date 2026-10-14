// Auto-verificação das regras de Bazuca x Helicópteros.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

const semente = (s) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
let t = 1_000_000;
const passo = (p, ms = R.TICK_MS) => R.passo(p, (t += ms));
const largar = (n = 2, rnd = semente(5)) => { const p = R.novaPartida(t, n, [], rnd); while (p.fase === 'contagem') passo(p); return p; };
/** Helicóptero parado no ar (pra testar mira e dano sem sorte). */
const parado = (p, tipo, x, y) => { const h = { id: ++p.id, tipo, t0: t, dir: 1, v: 0, x0: x, y0: y, amp: 0, freq: 1, fase: 0, vida: R.TIPOS[tipo].vida, morto: null, de: null, proxTiro: Infinity }; p.helis.push(h); return h; };
/** Atira em (x, y) e espera o foguete chegar. */
const atira = (p, i, x, y, extra = {}) => { const r = R.agir(p, i, { x, y, t, ...extra }, t); for (let k = 0; k < 30; k++) passo(p); return r; };
const calmo = (p) => { p.proxNasce = Infinity; p.helis = []; };

// cores: a escolhida vale; repetida ou inválida vira uma livre
{
  const p = R.novaPartida(t, 5, ['roxo', 'roxo', 'xx']);
  assert.equal(p.cores[0], 'roxo');
  assert.equal(new Set(p.cores).size, 5);
}
// mira: só pra cima
{
  assert.ok(R.mira(R.soldado(2, 0).x, 400, 100).a < 0);
  assert.ok(R.mira(R.soldado(2, 0).x, 1000, 900).a < 0 && R.mira(R.soldado(2, 0).x, 1000, 900).vx > 0, 'pra baixo à direita vira quase horizontal');
  assert.ok(R.mira(R.soldado(2, 0).x, -500, 900).a < 0 && R.mira(R.soldado(2, 0).x, -500, 900).vx < 0);
}
// contagem: não atira antes
{
  const p = R.novaPartida(t, 2, [], semente(1));
  assert.equal(R.agir(p, 0, { x: 300, y: 100 }, t), null);
  while (p.fase === 'contagem') passo(p);
  assert.ok(p.eventos.some((e) => e.tipo === 'largada'));
}
// acerto: verde cai com 1; bege aguenta 2; cadência; foguete que erra some
{
  const p = largar(); calmo(p);
  const s = R.soldado(2, 0);
  const v = parado(p, 'verde', s.x + 150, 250);
  atira(p, 0, v.x0, v.y0);
  assert.equal(v.morto != null, true, 'verde caiu');
  assert.equal(p.abates[0], 1);
  const b = parado(p, 'bege', s.x - 100, 220);
  atira(p, 0, b.x0, b.y0);
  assert.equal(b.morto, null, 'bege aguenta o 1º');
  assert.equal(b.vida, 1);
  atira(p, 0, b.x0, b.y0);
  assert.ok(b.morto != null && b.de === 0);
  assert.equal(p.abates[0], 2);
  R.agir(p, 1, { x: 640, y: 0 }, t);
  assert.equal(R.agir(p, 1, { x: 640, y: 0 }, t), null, 'cadência');
  for (let k = 0; k < 40; k++) passo(p);
  assert.equal(p.foguetes.length, 0, 'foguete que erra some');
}
// dois no mesmo helicóptero: só o primeiro leva
{
  const p = largar(); calmo(p);
  const h = parado(p, 'verde', 640, 200);
  R.agir(p, 0, { x: 640, y: 200, t }, t);
  R.agir(p, 1, { x: 640, y: 200, t }, t);
  for (let k = 0; k < 30; k++) passo(p);
  assert.equal(p.abates[0] + p.abates[1], 1);
  assert.equal(p.abates[h.de], 1);
}
// compensação: o foguete sai de quando o jogador viu (helicóptero que já passou ainda cai)
{
  const p = largar(); calmo(p);
  const h = parado(p, 'verde', 300, 200);
  h.v = 600; h.t0 = t;   // voa rápido pra direita
  passo(p, 250);
  const visto = t - 250;
  const ali = R.posHeli(h, visto + 400);   // mira na frente (o foguete leva ~0,4s)
  R.agir(p, 0, { x: ali.x, y: ali.y, t: visto }, t);
  for (let k = 0; k < 30; k++) passo(p);
  assert.ok(h.morto != null, 'pegou onde o jogador viu');
  const p2 = largar(); calmo(p2);
  const h2 = parado(p2, 'verde', 300, 200);
  h2.v = 600; h2.t0 = t;
  passo(p2, 900);
  const ali2 = R.posHeli(h2, t - 900 + 400);
  R.agir(p2, 0, { x: ali2.x, y: ali2.y, t: t - 900 }, t);
  for (let k = 0; k < 30; k++) passo(p2);
  assert.equal(h2.morto, null, 'atraso demais não vale');
}
// míssil: atordoa quem está embaixo; foguete derruba míssil
{
  const p = largar(3); calmo(p);
  const h = parado(p, 'bege', R.soldado(3, 1).x, 200);
  h.proxTiro = t; p.proxMissil = 0;
  p.rnd = () => 0.5;   // alvo do meio, sem desvio
  passo(p);
  assert.equal(p.misseis.length, 1);
  for (let k = 0; k < 50; k++) passo(p);
  assert.ok(p.atordoado[1] > t, 'atordoou');
  assert.equal(R.agir(p, 1, { x: 600, y: 100 }, t), null, 'atordoado não atira');
  assert.ok(p.atordoado[0] < t, 'o do lado não');
  h.proxTiro = t; p.proxMissil = 0; h.vida = 9;
  passo(p);
  const m = p.misseis[0];
  const alvo = R.posMissil(m, t + 350);
  R.agir(p, 0, { x: alvo.x, y: alvo.y, t }, t);
  let corta = false;
  for (let k = 0; k < 40; k++) { passo(p); corta ||= p.eventos.some((e) => e.tipo === 'intercepta'); }
  assert.ok(corta, 'foguete derrubou o míssil');
}
// andar: vai pro lado, para, não sai da tela; atordoado não anda; fugir do míssil salva
{
  const p = largar(2); calmo(p);
  const x0 = p.x[0];
  R.agir(p, 0, { andar: 1 }, t);
  for (let k = 0; k < 20; k++) passo(p);
  assert.ok(Math.abs(p.x[0] - (x0 + R.ANDA)) < 20, `andou ~1s: ${p.x[0] - x0}`);
  R.agir(p, 0, { andar: 0 }, t);
  const x1 = p.x[0]; passo(p); passo(p);
  assert.equal(p.x[0], x1, 'parou');
  R.agir(p, 0, { andar: -1 }, t);
  for (let k = 0; k < 200; k++) passo(p);
  assert.equal(p.x[0], R.BEIRA, 'parou na beira');
  assert.equal(R.agir(p, 0, { andar: 7 }, t), null);
  // o míssil mira onde ele está; quem sai de baixo escapa, quem fica toma
  R.agir(p, 0, { andar: 0 }, t);
  const h = parado(p, 'bege', 640, 200); h.proxTiro = t; p.proxMissil = 0;
  p.rnd = () => 0.5;
  passo(p);
  const m = p.misseis[0];
  assert.equal(m.alvo, 1);
  assert.ok(Math.abs(m.tx - p.x[1]) < 2);
  R.agir(p, 1, { andar: 1 }, t);
  for (let k = 0; k < 50; k++) passo(p);
  assert.ok(p.atordoado[1] < t, 'fugiu do míssil');
  R.agir(p, 1, { andar: 0 }, t);
  for (let k = 0; k < 30; k++) passo(p);
  h.proxTiro = t; p.proxMissil = 0; passo(p);
  for (let k = 0; k < 50; k++) passo(p);
  assert.ok(p.atordoado[1] > t, 'ficou parado e tomou');
  const xa = p.x[1];
  R.agir(p, 1, { andar: -1 }, t); passo(p); passo(p);
  assert.equal(p.x[1], xa, 'atordoado não anda');
}
// 3 vidas: cada míssil que pega tira uma; na 3ª está fora (não atira nem anda, abates ficam);
// todo mundo eliminado acaba antes do tempo
{
  const p = largar(2); calmo(p);
  p.abates[0] = 4;
  const h = parado(p, 'bege', 640, 200); h.vida = 99;
  p.rnd = () => 0.1;   // alvo 0
  for (let morte = 1; morte <= 3; morte++) {
    h.proxTiro = t; p.proxMissil = 0; passo(p);
    for (let k = 0; k < 70; k++) passo(p);   // cai, volta e passa a proteção
    assert.equal(p.vidas[0], 3 - morte, `morte ${morte}`);
  }
  assert.equal(R.agir(p, 0, { x: 600, y: 100 }, t + 5000), null, 'eliminado não atira');
  const x = p.x[0]; R.agir(p, 0, { andar: 1 }, t); for (let k = 0; k < 10; k++) passo(p);
  assert.equal(p.x[0], x, 'eliminado não anda');
  p.vidas[1] = 1;
  h.proxTiro = t; p.proxMissil = 0; passo(p);
  assert.ok(p.misseis.length && p.misseis.every((m) => m.alvo === 1), 'helicóptero só mira em quem está vivo');
  assert.equal(p.fim, null);
  for (let k = 0; k < 50 && !p.fim; k++) passo(p);
  assert.ok(p.fim?.todosMortos, 'todo mundo eliminado: acabou');
  assert.equal(p.fim.vencedor, 0, 'quem derrubou mais ainda ganha');
}
// proteção: logo depois de voltar não leva outro; ritmo: com 2 vivos, ~1 míssil a cada 3,5s
{
  const p = largar(2); calmo(p);
  p.atordoado[0] = t - 100;   // acabou de voltar
  const m = { id: 999, heli: 0, t0: t - 2000, x0: p.x[0], y0: 200, tx: p.x[0], dur: 1000, alvo: 0 };
  p.misseis.push(m); passo(p);
  assert.equal(p.vidas[0], 3, 'protegido');
  const q = R.novaPartida(t, 2, [], semente(4));
  let tt = t, misseis = 0;
  while (!q.fim) { tt += 50; R.passo(q, tt); misseis += q.eventos.filter((e) => e.tipo === 'missil').length; if (tt - q.largada > 30000) break; }
  assert.ok(misseis >= 4 && misseis <= 14, `mísseis em 30s com 2 vivos: ${misseis}`);
}
// partida inteira: robô que mira bem ganha; helicópteros nascem, revidam e fogem
{
  const p = largar(3, semente(9));
  let ms = 0, abates = 0, misseis = 0;
  while (!p.fim && ms++ < 3000) {
    for (const i of [0, 1]) {
      const h = p.helis.find((h) => h.morto == null && (() => { const c = R.posHeli(h, t); return c.x > 0 && c.x < R.LARGURA; })());
      if (h) { const c = R.posHeli(h, t + (i === 0 ? 300 : 0)); R.agir(p, i, { x: c.x, y: c.y, t }, t); }   // o 1 não mira na frente
    }
    passo(p);
    abates += p.eventos.filter((e) => e.tipo === 'abate').length;
    misseis += p.eventos.filter((e) => e.tipo === 'missil').length;
  }
  assert.ok(p.fim, 'acabou');
  assert.equal(p.fim.motivo, 'abates');
  assert.equal(p.abates[p.fim.vencedor], Math.max(...p.abates), `quem derrubou mais ganha (${p.abates})`);
  assert.ok(p.abates[0] > 0 && p.abates[1] > 0);
  assert.equal(p.abates[2], 0);
  assert.ok(misseis >= 2, `helicóptero revida (${misseis})`);
  console.log(`  partida simulada: abates ${p.abates}, tiros ${p.tiros}, mísseis ${misseis}`);
}
// empate e W.O.
{
  const p = largar(); calmo(p);
  t = p.fimEm; passo(p);
  assert.deepEqual(p.fim, { vencedor: null, motivo: 'empate' });
  const q = largar(3);
  assert.equal(R.agir(q, 0, 'lixo'), null);
  R.eliminar(q, 1); assert.equal(q.fim, null);
  R.eliminar(q, 2); assert.deepEqual(q.fim, { vencedor: 0, motivo: 'wo' });
}
// estado
{
  const p = largar(); passo(p, 2000);
  const e = R.estadoPara(p, 1, t);
  assert.equal(e.assento, 1);
  assert.ok(Array.isArray(e.h) && Array.isArray(e.f) && Array.isArray(e.m));
}
console.log('✔ bazuca: regras');
