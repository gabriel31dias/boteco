// Auto-verificação das regras da Última Carta.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

// baralho de 108
{
  const b = R.baralho();
  assert.equal(b.length, 108);
  assert.equal(b.filter((c) => c.v === '0').length, 4);
  assert.equal(b.filter((c) => c.v === '+4').length, 4);
  assert.equal(new Set(b.map((c) => c.id)).size, 108);
}

let semente = 7;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const conta = (p) => p.maos.reduce((s, m) => s + m.length, 0) + p.monte.length + p.descarte.length;

// regras pontuais
{
  const p = R.novaPartida(3, 0, rnd);
  assert.ok(/^\d$/.test(p.descarte[0].v), 'começa com número');
  p.maos.forEach((m) => assert.equal(m.length, 7));
  const v = p.vez, outro = (v + 1) % 3;
  assert.equal(R.agir(p, outro, { tipo: 'comprar' }), null, 'fora da vez');
  // carta que não serve é recusada
  const topo = p.descarte.at(-1);
  p.maos[v].push({ id: 900, c: topo.c === 'r' ? 'g' : 'r', v: topo.v === '9' ? '8' : '9' });
  if (!R.podeJogar(p.maos[v].at(-1), topo, p.cor)) assert.equal(R.agir(p, v, { tipo: 'jogar', id: 900 }), null, 'não serve');
  p.maos[v].pop();
  // coringa sem cor recusado; com cor, muda a cor
  p.maos[v].push({ id: 901, c: 'w', v: 'w' });
  assert.equal(R.agir(p, v, { tipo: 'jogar', id: 901 }), null);
  const r = R.agir(p, v, { tipo: 'jogar', id: 901, cor: 'b' });
  assert.equal(r.tipo, 'jogou');
  assert.equal(p.cor, 'b');
  assert.equal(p.vez, (v + 1) % 3);
}
// +4: o próximo compra 4 e perde a vez; inverte com 2 = pula
{
  const p = R.novaPartida(3, 0, rnd);
  p.sentido = 1;
  const v = p.vez, alvo = (v + 1) % 3;
  const antes = p.maos[alvo].length;
  p.maos[v].push({ id: 902, c: 'w', v: '+4' });
  const r = R.agir(p, v, { tipo: 'jogar', id: 902, cor: 'g' });
  assert.equal(r.alvo, alvo);
  assert.equal(p.maos[alvo].length, antes + 4);
  assert.equal(p.vez, (v + 2) % 3, 'o alvo perdeu a vez');
  const q = R.novaPartida(2, 0, rnd);
  const w = q.vez;
  q.maos[w].push({ id: 903, c: q.cor, v: 'r' });
  R.agir(q, w, { tipo: 'jogar', id: 903 });
  assert.equal(q.vez, w, 'com 2, inverter joga de novo');
}
// esqueceu de gritar: denúncia faz comprar 2; gritou: não pode denunciar
{
  const p = R.novaPartida(2, 0, rnd);
  const v = p.vez, o = 1 - v;
  p.maos[v] = [{ id: 950, c: p.cor, v: '5' }, { id: 951, c: p.cor, v: '6' }];
  R.agir(p, v, { tipo: 'jogar', id: 950 });
  assert.equal(p.esqueceu, v);
  assert.equal(R.agir(p, v, { tipo: 'denunciar' }), null, 'não denuncia a si mesmo');
  const d = R.agir(p, o, { tipo: 'denunciar' });
  assert.equal(d.alvo, v);
  assert.equal(p.maos[v].length, 3);
  const q = R.novaPartida(2, 0, rnd);
  const w = q.vez;
  q.maos[w] = [{ id: 960, c: q.cor, v: '5' }, { id: 961, c: q.cor, v: '6' }];
  assert.equal(R.agir(q, w, { tipo: 'jogar', id: 960, ultima: true }).ultima, true);
  assert.equal(R.agir(q, 1 - w, { tipo: 'denunciar' }), null, 'gritou: nada a denunciar');
}
// comprar: a comprada pode ser jogada (só ela) ou passa
{
  const p = R.novaPartida(2, 0, rnd);
  const v = p.vez;
  p.monte.push({ id: 970, c: p.cor, v: '3' });
  const r = R.agir(p, v, { tipo: 'comprar' });
  assert.equal(r.podeJogar, true);
  assert.equal(R.agir(p, v, { tipo: 'comprar' }), null, 'uma compra por vez');
  assert.equal(R.estadoPara(p, v).comprada, 970);
  assert.equal(R.agir(p, v, { tipo: 'passar' }).tipo, 'passou');
}
// relógio e eliminação; a mão do outro não vaza
{
  const p = R.novaPartida(3, 0, rnd);
  const v = p.vez;
  for (let k = 0; k < R.ESTOUROS - 1; k++) { p.vez = v; R.estourou(p, 0); }
  p.vez = v;
  const r = R.estourou(p, 0);
  assert.equal(r.ausente, true);
  assert.equal(p.fora[v], true);
  assert.equal(conta(p), 108, 'as cartas dele voltam pro monte');
  const e = R.estadoPara(p, (v + 1) % 3);
  assert.equal(e.maos, null);
  assert.equal(JSON.stringify(e).includes(JSON.stringify(p.maos[(v + 2) % 3][0])), false, 'carta do outro não aparece');
  R.eliminar(p, (v + 1) % 3);
  assert.equal(p.fim.motivo, 'wo');
}

// 3000 partidas de robôs (2 a 4): nenhuma carta some, tudo termina, nenhuma jogada inválida passa
{
  let rodadas = 0, jogadas = 0;
  for (let k = 0; k < 3000; k++) {
    const n = 2 + (k % 3);
    const p = R.novaPartida(n, 0, rnd);
    for (let passo = 0; passo < 3000 && !p.fim; passo++) {
      const i = p.vez, e = R.estadoPara(p, i);
      if (rnd() < 0.05) { const o = (i + 1) % n; R.agir(p, o, { tipo: 'denunciar' }); }
      if (rnd() < 0.002) { R.estourou(p, 0); continue; }
      if (e.jogaveis.length) {
        const id = e.jogaveis[Math.floor(rnd() * e.jogaveis.length)];
        const c = e.mao.find((x) => x.id === id);
        const r = R.agir(p, i, { tipo: 'jogar', id, cor: c.c === 'w' ? R.CORES[Math.floor(rnd() * 4)] : undefined, ultima: rnd() < 0.7 });
        assert.ok(r, 'jogável aceita');
        jogadas++;
      } else if (e.comprada != null) R.agir(p, i, { tipo: 'passar' });
      else R.agir(p, i, { tipo: 'comprar' });
      // uma inválida de vez em quando: recusada sem mexer em nada
      const e2 = p.fim ? null : R.estadoPara(p, p.vez);
      const fora = e2?.mao.find((c) => !e2.jogaveis.includes(c.id));
      if (fora) assert.equal(R.agir(p, p.vez, { tipo: 'jogar', id: fora.id, cor: 'r' }), null);
      assert.equal(conta(p), 108, 'o total de cartas não muda');
    }
    assert.ok(p.fim, `partida ${k} terminou`);
    rodadas++;
  }
  console.log(`  ${rodadas} partidas simuladas, ${jogadas} jogadas`);
}
console.log('✔ última carta: regras');
