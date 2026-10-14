// Auto-verificação das regras da Caçada de Patos.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

let t = 1_000_000;
const anda = (p, ms) => { for (let k = 0; k < ms / 100; k++) R.passo(p, (t += 100)); };
const nova = (n = 2) => { const p = R.novaPartida(t, n); anda(p, R.CONTAGEM + 100); return p; };
const pato = (p, extra = {}) => { const d = { id: ++p.idPato, tipo: 'verde', t0: t, dir: 1, v: 200, x0: 300, y0: 200, amp: 0, freq: 1, fase: 0, sobe: 0, morto: null, de: null, ...extra }; p.patos.push(d); return d; };

// acertar mata, conta ponto, gasta munição; errar só gasta
{
  const p = nova();
  assert.equal(p.fase, 'jogo');
  p.patos = []; p.agenda = [];
  const d = pato(p);
  const q = R.posicao(d, t);
  assert.ok(R.agir(p, 0, { x: q.x + 10, y: q.y - 5, t }, t));
  assert.equal(d.de, 0);
  assert.equal(p.pontos[0], 1);
  assert.equal(p.municao[0], R.MUNICAO - 1);
  R.passo(p, (t += 100));
  assert.ok(p.eventos.some((e) => e.tipo === 'abate' && e.pato === d.id));
  R.agir(p, 1, { x: q.x, y: q.y, t }, t);
  assert.equal(p.pontos[1], 0, 'pato morto não morre de novo');
}
// primeiro que chega leva; cadência; dobradinha
{
  const p = nova();
  p.patos = []; p.agenda = [];
  const a = pato(p), b = pato(p, { x0: 320 });
  const q = R.posicao(a, t);
  R.agir(p, 1, { x: q.x + 10, y: q.y, t }, t);
  assert.equal(p.pontos[1], 4, 'dois de uma vez: 1+1 cada');
  assert.equal(R.agir(p, 1, { x: 0, y: 0, t }, t + 10), null, 'cadência');
  const c = pato(p, { x0: 900 });
  const qc = R.posicao(c, t + 300);
  R.agir(p, 0, { x: qc.x, y: qc.y, t: t + 300 }, t + 300);
  R.agir(p, 1, { x: qc.x, y: qc.y, t: t + 300 }, t + 310);
  assert.equal(c.de, 0, 'quem chegou primeiro');
  void b;
}
// compensação de atraso: atira onde o pato ESTAVA há 300ms e acerta; há 900ms não
{
  const p = nova();
  p.patos = []; p.agenda = [];
  const d = pato(p, { v: 400 });
  const antes = R.posicao(d, t);
  t += 300;
  R.agir(p, 0, { x: antes.x, y: antes.y, t: t - 300 }, t);
  assert.equal(d.de, 0, 'compensou 300ms');
  const e = pato(p, { v: 400 });
  const longe = R.posicao(e, t);
  t += 900;
  R.agir(p, 1, { x: longe.x, y: longe.y, t: t - 900 }, t);
  assert.equal(e.de, null, 'não volta 900ms no tempo');
}
// munição: acaba e recarrega sozinho; recarga manual
{
  const p = nova();
  p.patos = []; p.agenda = [];
  for (let k = 0; k < R.MUNICAO; k++) { R.agir(p, 0, { x: 5, y: 5, t }, t); t += R.CADENCIA + 1; }
  assert.equal(p.municao[0], 0);
  assert.equal(R.agir(p, 0, { x: 5, y: 5, t }, t), null, 'sem bala');
  anda(p, R.RECARGA + 200);
  assert.equal(p.municao[0], R.MUNICAO);
  R.agir(p, 1, { x: 5, y: 5, t }, t);
  assert.ok(R.agir(p, 1, { recarregar: true }, t));
}
// partida inteira com robôs que miram: termina, os pontos batem com os abates, o melhor atirador ganha
{
  const p = R.novaPartida(t, 3);
  let passos = 0;
  while (!p.fim && passos++ < 200_000 / 100 * 4) {
    t += 100; R.passo(p, t);
    for (let i = 0; i < 3; i++) {
      const vivo = p.patos.find((d) => d.morto == null);
      if (!vivo || Math.random() > [0.5, 0.25, 0.08][i]) continue;
      const q = R.posicao(vivo, t - 100);
      R.agir(p, i, { x: q.x + (Math.random() - 0.5) * 30, y: q.y + (Math.random() - 0.5) * 30, t: t - 100 }, t);
    }
  }
  assert.ok(p.fim, 'terminou');
  assert.equal(p.rodada, R.RODADAS);
  assert.ok(p.pontos[0] > p.pontos[2], `quem atira mais ganha mais (${p.pontos})`);
  console.log(`  partida simulada: pontos ${p.pontos}, abates ${p.abates}, tiros ${p.tiros}`);
}
// W.O. e lixo
{
  const p = nova(3);
  assert.equal(R.agir(p, 0, 'lixo', t), null);
  assert.equal(R.agir(p, 0, { x: 'a', y: 2 }, t), null);
  R.eliminar(p, 1); assert.equal(p.fim, null);
  R.eliminar(p, 2); assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
}
console.log('✔ patos: regras');
