// Auto-verificação das regras da Batalha Naval.
process.env.NAVAL_ANIMA = '0';
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

// frota sorteada sempre válida; inválidas recusadas
for (let k = 0; k < 200; k++) assert.ok(R.validarFrota(R.frotaAleatoria()), 'sorteada válida');
const certa = [{ id: 'porta', x: 0, y: 0, horiz: true }, { id: 'encouracado', x: 0, y: 2, horiz: true }, { id: 'cruzador', x: 0, y: 4, horiz: true },
  { id: 'submarino', x: 0, y: 6, horiz: true }, { id: 'contra1', x: 0, y: 8, horiz: true }, { id: 'contra2', x: 9, y: 0, horiz: false }];
assert.ok(R.validarFrota(certa));
assert.equal(R.validarFrota(certa.slice(1)), null, 'falta navio');
assert.equal(R.validarFrota(certa.map((n) => (n.id === 'porta' ? { ...n, x: 6 } : n))), null, 'saiu do mar');
assert.equal(R.validarFrota(certa.map((n) => (n.id === 'contra2' ? { ...n, x: 0, y: 0 } : n))), null, 'um em cima do outro');
assert.equal(R.validarFrota('lixo'), null);

let t = 1_000_000;
const nova = () => { const p = R.novaPartida(t); return p; };
const pronto = (p) => { R.agir(p, 0, { tipo: 'frota', navios: certa, pronto: true }, t); return R.agir(p, 1, { tipo: 'frota', navios: certa, pronto: true }, t); };

// posicionar: só começa com os dois prontos; não muda mais depois de pronto
{
  const p = nova();
  assert.equal(R.agir(p, 0, { tipo: 'tiro', casa: 0 }, t), null, 'sem tiro na hora de posicionar');
  assert.deepEqual(R.agir(p, 0, { tipo: 'frota', navios: certa, pronto: true }, t), { tipo: 'frota', assento: 0, pronto: true });
  assert.equal(R.agir(p, 0, { tipo: 'frota', navios: certa }, t), null, 'pronto não mexe mais');
  const r = R.agir(p, 1, { tipo: 'frota', navios: certa, pronto: true }, t);
  assert.equal(r.tipo, 'batalha');
  assert.equal(p.fase, 'batalha');
}

// água passa a vez; acerto atira de novo; afundou revela o navio; a frota toda afundada ganha
{
  const p = nova();
  pronto(p);
  const a = p.vez, b = 1 - a;
  assert.equal(R.agir(p, b, { tipo: 'tiro', casa: 99 }, (t += 10)), null, 'não é a vez dele');
  let r = R.agir(p, a, { tipo: 'tiro', casa: 99 }, (t += 10));   // J10: água
  assert.equal(r.res, 'agua');
  assert.equal(p.vez, b);
  // o estado manda uma letra por casa: o tiro em J10 aparece na casa 99 (sem casas vazias encolhendo o texto)
  assert.equal(R.estadoPara(p, a).dei.length, 100);
  assert.equal(R.estadoPara(p, a).dei[99], 'a');
  assert.equal(R.estadoPara(p, b).levei[99], 'a');
  assert.equal(R.agir(p, b, { tipo: 'tiro', casa: 0 }, (t += 10)).res, 'acerto');   // A1: porta-aviões
  assert.equal(p.vez, b, 'acertou, atira de novo');
  assert.equal(R.agir(p, b, { tipo: 'tiro', casa: 0 }, (t += 10)), null, 'casa repetida');
  for (const c of [1, 2, 3]) R.agir(p, b, { tipo: 'tiro', casa: c }, (t += 10));
  r = R.agir(p, b, { tipo: 'tiro', casa: 4 }, (t += 10));
  assert.equal(r.res, 'afundou');
  assert.equal(r.navio.id, 'porta');
  const visto = R.estadoPara(p, b);
  assert.deepEqual(visto.afundados.map((n) => n.id), ['porta'], 'só o afundado aparece');
  assert.equal(visto.dei.slice(0, 5), 'xxxxx');
  assert.equal(R.estadoPara(p, a).levei.slice(0, 5), 'xxxxx');
  for (const n of certa) for (const c of R.casasDe(n)) if (!p.tiros[a][c]) R.agir(p, b, { tipo: 'tiro', casa: c }, (t += 10));
  assert.deepEqual(p.fim, { vencedor: b, motivo: 'frota' });
  assert.equal(R.estadoPara(p, b).afundados.length, R.FROTA.length, 'no fim abre tudo');
}

// relógio: posicionar acaba com a sorteada; na batalha sai tiro aleatório; 3 seguidos perde
{
  const p = nova();
  assert.equal(R.estourou(p, t).tipo, 'batalha');
  const v = p.vez;
  const r = R.estourou(p, (t += 10));
  assert.equal(r.tipo, 'tiro');
  assert.equal(r.auto, true);
  let fim = null;
  for (let k = 0; k < 10 && !p.fim; k++) fim = R.estourou(p, (t += 10));
  assert.ok(p.fim, 'quem não joga perde');
  assert.equal(p.fim.motivo === 'ausente' || p.fim.motivo === 'frota', true);
  void v; void fim;
}

// a frota do outro não vaza
{
  const p = nova();
  const e = R.estadoPara(p, 0);
  assert.equal(JSON.stringify(e).includes(JSON.stringify(p.frotas[1])), false);
  assert.deepEqual(e.afundados, []);
  assert.deepEqual(e.minhaFrota, p.frotas[0]);
}
console.log('✔ naval: regras');
