// Auto-verificação das regras da Corrida de Jegues.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');

let t = 1_000_000;
const passo = (p) => R.passo(p, (t += R.TICK_MS));
const largar = (n = 2, cores = []) => { const p = R.novaPartida(t, n, cores, R.sorteador(7)); while (p.fase === 'contagem') passo(p); return p; };
const proximo = (p, j) => p.pista.obst.find((o) => o.id > j.passou);
/** Robô: pula quando o obstáculo está a `antes` px; chicoteia a cada `cada` passos sem passar do fôlego. */
function robo(p, i, { antes = 70, cada = 4, limite = 0.6 } = {}, k = 0) {
  const j = p.jegues[i], o = proximo(p, j);
  if (o && o.x - (j.x + R.CORPO[1]) < antes && o.x - (j.x + R.CORPO[1]) > 0) R.agir(p, i, { pular: true });
  if (cada && k % cada === 0 && j.cansaco / R.JEGUES[p.cores[i]].folego < limite) R.agir(p, i, { chicote: true });
}

// cores: a escolhida vale; repetida ou inválida vira uma livre
{
  const p = R.novaPartida(t, 3, ['jerimum', 'jerimum', 'xx']);
  assert.equal(p.cores[0], 'jerimum');
  assert.equal(new Set(p.cores).size, 3);
  assert.ok(p.cores.every((c) => R.CORES.includes(c)));
}
// pista: obstáculos em ordem, espaçados, antes da chegada
{
  const { obst } = R.gerarPista(R.sorteador(3));
  assert.ok(obst.length > 8, `obstáculos: ${obst.length}`);
  for (let k = 1; k < obst.length; k++) assert.ok(obst[k].x - obst[k - 1].x > 500);
  assert.ok(obst.at(-1).x < R.PISTA - 500);
}
// contagem: ninguém anda nem chicoteia antes da largada
{
  const p = R.novaPartida(t, 2, [], R.sorteador(1));
  R.agir(p, 0, { chicote: true });
  passo(p);
  assert.equal(p.jegues[0].x, 0);
  while (p.fase === 'contagem') passo(p);
  assert.ok(p.eventos.some((e) => e.tipo === 'largada'));
}
// sem pular: bate e cai; com pulo na hora: passa
{
  const p = largar();
  const o = p.pista.obst[0];
  let caiu = false;
  for (let k = 0; k < 400 && !caiu; k++) { passo(p); caiu = p.eventos.some((e) => e.tipo === 'tombo' && e.i === 1); }
  assert.ok(caiu, 'quem não pula cai');
  assert.ok(Math.abs(p.jegues[1].x - o.x) < 120, 'caiu no obstáculo');
  assert.ok(p.jegues[0].passou >= 0 || p.jegues[0].tombos > 0);
}
{
  const p = largar();
  for (let k = 0; k < 300; k++) { robo(p, 0, { cada: 0 }); passo(p); }
  assert.equal(p.jegues[0].tombos, 0, 'pulando na hora não cai');
  assert.ok(p.jegues[0].passou >= 1);
}
// perdão: pulo que chega logo depois da batida ainda salva; muito depois, não
{
  const p = largar();
  while (!p.jegues[0].bateu) passo(p);
  passo(p);
  R.agir(p, 0, { pular: true });
  passo(p);
  assert.equal(p.jegues[0].bateu, null);
  assert.ok(p.jegues[0].y > 0, 'pulou');
  for (let k = 0; k < 40; k++) passo(p);
  assert.equal(p.jegues[0].tombos, 0, 'perdoado');
  assert.equal(p.jegues[1].tombos, 1, 'o outro, que não pulou, caiu');
}
// chicote acelera; chicote demais empaca
{
  const p = largar();
  const v0 = p.jegues[0].vel;
  R.agir(p, 0, { chicote: true }); passo(p);
  assert.ok(p.jegues[0].vel > v0 + 30);
  let empacou = false;
  for (let k = 0; k < 40 && !empacou; k++) { R.agir(p, 0, { chicote: true }); passo(p); passo(p); passo(p); empacou = p.eventos.some((e) => e.tipo === 'empacou') || p.jegues[0].empaca > t; }
  assert.ok(empacou, 'empacou');
  assert.equal(p.jegues[0].vel, 0);
  const x = p.jegues[0].x;
  for (let k = 0; k < 10; k++) passo(p);
  assert.equal(p.jegues[0].x, x, 'empacado não anda');
}
// chicote rápido demais (auto-clicker) não conta
{
  const p = largar();
  for (let k = 0; k < 5; k++) R.agir(p, 0, { chicote: true });
  passo(p);
  assert.equal(p.jegues[0].chicotadas, 1);
}
// corrida inteira: o robô bom ganha do que pula atrasado e do que nunca chicoteia
{
  const p = largar(3, ['pepano', 'jerimum', 'relampago']);
  let k = 0, puns = 0, cenouras = 0;
  while (!p.fim && k++ < 30 * 130) {
    robo(p, 0, { antes: 70, cada: 3, limite: 0.65 }, k);
    robo(p, 1, { antes: 10, cada: 6 }, k);
    robo(p, 2, { antes: 70, cada: 0 }, k);
    passo(p);
    puns += p.eventos.filter((e) => e.tipo === 'pum').length;
    cenouras += p.eventos.filter((e) => e.tipo === 'cenoura').length;
  }
  assert.ok(p.fim, 'terminou');
  assert.equal(p.fim.motivo, 'chegada');
  assert.equal(p.fim.vencedor, 0, `o melhor ganha (x: ${p.jegues.map((j) => Math.round(j.x))})`);
  assert.deepEqual(p.chegada.slice(0, 1), [0]);
  assert.ok(puns > 0, 'teve pum');
  const seg = (t - p.largada) / 1000;
  assert.ok(seg > 18 && seg < 50, `duração razoável: ${seg.toFixed(1)}s`);
  console.log(`  corrida simulada: ${seg.toFixed(1)}s, tombos ${p.jegues.map((j) => j.tombos)}, puns ${puns}, cenouras ${cenouras}`);
}
// estado: pista vai na contagem e de tempos em tempos
{
  const p = R.novaPartida(t, 2, [], R.sorteador(2));
  assert.ok(R.estadoPara(p, 0, t).pista);
  while (p.fase === 'contagem') passo(p);
  let com = 0;
  for (let k = 0; k < 60; k++) { passo(p); if (R.estadoPara(p, 0, t).pista) com++; }
  assert.ok(com >= 1 && com <= 3, `pista ${com}x em 2s`);
}
// W.O. e lixo
{
  const p = largar(3);
  assert.equal(R.agir(p, 0, 'lixo'), null);
  assert.equal(R.agir(p, 9, { pular: true }), null);
  R.eliminar(p, 1); assert.equal(p.fim, null);
  R.eliminar(p, 2); assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
}
console.log('✔ jegues: regras');
