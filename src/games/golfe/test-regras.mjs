// Auto-verificação das regras do Mini-golfe.
process.env.GOLFE_INTERVALO = '0';
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

// tees e copas na grama, longe da tabela
for (const [k, b] of R.BURACOS.entries()) {
  for (const [x, y] of [b.tee, b.copa]) for (const [dx, dy] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) assert.equal(R.tipo(x + dx, y + dy), 'g', `buraco ${k + 1}: (${x + dx}, ${y + dy}) não é grama`);
}

// os 4 lugares de saída de cada buraco (espalhados no tee) também caem na grama
{
  for (let b = 0; b < R.BURACOS.length; b++) {
    const p = R.novaPartida(0, 4);
    if (b) { p.fase = 'intervalo'; p.buraco = b - 1; R.estourou(p, 1); }
    for (const j of p.jogadores) assert.equal(R.tipo(j.x, j.y), 'g', `buraco ${b + 1}: saída (${j.x}, ${j.y})`);
  }
}

// força que para exatamente na copa: busca binária; essa entra, bem mais forte passa
{
  const b = R.BURACOS[2];
  const ang = Math.atan2(b.copa[1] - b.tee[1], b.copa[0] - b.tee[0]);
  let lo = 0.02, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; const r = R.tacar(...b.tee, ang, m, b.copa); if (r.entrou || Math.hypot(r.x - b.tee[0], r.y - b.tee[1]) > Math.hypot(b.copa[0] - b.tee[0], b.copa[1] - b.tee[1])) hi = m; else lo = m; }
  const certa = R.tacar(...b.tee, ang, hi + 0.01, b.copa);
  assert.equal(certa.entrou, true, 'na medida entra');
  assert.ok(certa.eventos.some((e) => e[1] === 'buraco'));
  const forte = R.tacar(...b.tee, ang, 1, b.copa);
  assert.equal(forte.eventos.find((e) => e[1] === 'beirada' || e[1] === 'buraco')?.[1], 'beirada', 'forte demais passa raspando (pode voltar depois da tabela)');
}

// mil tacadas aleatórias: a bola nunca para fora do campo
{
  let rnd = 1;
  const r01 = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 1000; k++) {
    const b = R.BURACOS[k % 3];
    const r = R.tacar(...b.tee, r01() * Math.PI * 2, r01(), b.copa);
    assert.notEqual(R.tipo(r.x, r.y), '#', `parou na tabela (${r.x}, ${r.y})`);
    assert.ok(r.caminho.length >= 4 && r.caminho.length % 2 === 0);
  }
}

// a areia segura: a mesma tacada anda bem menos saindo do bunker do que da grama
{
  const anda = (r) => { let d = 0; for (let k = 2; k < r.caminho.length; k += 2) d += Math.hypot(r.caminho[k] - r.caminho[k - 2], r.caminho[k + 1] - r.caminho[k - 1]); return d; };
  assert.equal(R.tipo(400, 582), 'a', 'o bunker da esquerda');
  const naAreia = anda(R.tacar(400, 582, -Math.PI / 2, 0.3, [0, 0]));
  const naGrama = anda(R.tacar(560, 560, -Math.PI / 2, 0.3, [0, 0]));
  assert.ok(naAreia < naGrama * 0.6, `areia segura (${Math.round(naAreia)} x ${Math.round(naGrama)})`);
}

// partida: tacada recusada antes da hora / lixo; buraco fecha quando todos entram; relógio dá +2; fim pelo total
{
  let t = 1_000_000;
  const p = R.novaPartida(t, 2);
  assert.equal(R.agir(p, 0, { ang: 0, forca: 0.5 }, t), null, 'ainda andando até o tee');
  assert.equal(R.agir(p, 0, { ang: 'x', forca: 0.5 }, (t += 1000)), null);
  const r = R.agir(p, 0, { ang: 0, forca: 0.4 }, t);
  assert.equal(r.tipo, 'tacada');
  assert.equal(R.agir(p, 0, { ang: 0, forca: 0.4 }, t + 10), null, 'espera a bola parar');
  // os dois "entram" (força bruta: põe dentro), buraco fecha
  p.jogadores.forEach((j) => { j.dentro = false; });
  p.jogadores[1].golpes = 3; p.jogadores[1].dentro = true;
  const b = R.BURACOS[0];
  Object.assign(p.jogadores[0], { x: b.copa[0] - 30, y: b.copa[1], livreEm: 0 });
  const ent = R.agir(p, 0, { ang: 0, forca: 0.05 }, (t += 5000));
  assert.equal(ent.entrou, true, 'putt curtinho entra');
  assert.equal(ent.fechou, true);
  assert.equal(p.fase, 'intervalo');
  assert.deepEqual(p.jogadores.map((j) => j.cartao), [[2], [3]]);
  R.estourou(p, (t += 10));
  assert.equal(p.buraco, 1);
  assert.equal(p.fase, 'jogo');
  R.estourou(p, (t += 10));                    // relógio do buraco 2: ninguém tacou, +2
  assert.deepEqual(p.jogadores.map((j) => j.cartao[1]), [2, 2]);
  R.estourou(p, (t += 10));
  p.jogadores[1].golpes = 5;
  R.estourou(p, (t += 10));                    // buraco 3 fecha no relógio: 0+2 x 5+2
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'tacadas' });
  assert.equal(R.agir(p, 0, { ang: 0, forca: 0.5 }, t), null, 'acabou');
}

// W.O. e estado
{
  const p = R.novaPartida(0, 3);
  R.eliminar(p, 2);
  assert.equal(p.fim, null);
  R.eliminar(p, 1);
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
  assert.ok(JSON.stringify(R.estadoPara(R.novaPartida(0, 4), 0)).length < 1500);
}
console.log('✔ golfe: regras');
