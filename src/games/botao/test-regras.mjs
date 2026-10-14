// Auto-verificação das regras do Futebol de Botão.
process.env.BOTAO_FESTA = '0';
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// formação: ninguém encavalado, cada um no seu campo, quem não sai fora do círculo
for (const saida of [0, 1]) {
  const pos = R.formacao(saida);
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    assert.ok(dist(pos[i], pos[j]) > (j === 10 ? R.R_BOTAO + R.R_BOLA : 2 * R.R_BOTAO), `saída ${saida}: ${i} e ${j} encostados`);
  }
  for (let i = 0; i < 10; i++) {
    const time = i < 5 ? 0 : 1;
    assert.ok(time === 0 ? pos[i][1] > R.COMP / 2 : pos[i][1] < R.COMP / 2, `botão ${i} no campo errado`);
    if (time !== saida) assert.ok(dist(pos[i], pos[10]) > 135 + R.R_BOTAO, `botão ${i} dentro do círculo`);
  }
}

// a saída: o botão colado na bola chuta pra frente, a bola anda e conta o toque
{
  const pos = R.formacao(0);
  const r = R.chutar(pos, 3, -Math.PI / 2, 0.6);
  assert.ok(r.tocou[0]);
  assert.ok(r.pos[10][1] < pos[10][1] - 100, 'a bola foi pra frente');
  assert.ok(r.eventos.some((e) => e[1] === 'bola'));
  assert.ok(r.quadros.length > 10 && r.quadros[0].length === 22);
}

// gol: bola na frente do gol de cima, botão atrás, chute no meio
{
  const pos = R.formacao(0);
  pos[10] = [400, 150]; pos[3] = [400, 230]; pos[5] = [100, 60];   // o goleiro deles fora
  const r = R.chutar(pos, 3, -Math.PI / 2, 0.7);
  assert.equal(r.gol, 0);
  assert.ok(r.eventos.some((e) => e[1] === 'gol'));
  assert.ok(r.pos[10][1] < 0 && r.pos[10][1] > -R.GOL.fundo, 'a bola parou na rede');
  // na trave: ricocheteia e não entra
  pos[10] = [R.GOL.x0 - 6, 150]; pos[3] = [R.GOL.x0 - 6, 230];
  const t = R.chutar(pos, 3, -Math.PI / 2, 0.7);
  assert.equal(t.gol, null);
  assert.ok(t.eventos.some((e) => e[1] === 'trave'));
}

// 400 chutes aleatórios: nada sai da mesa, nada fica encavalado, nada fica rolando
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let pos = R.formacao(0);
  for (let k = 0; k < 400; k++) {
    const r = R.chutar(pos, Math.floor(rnd() * 10), rnd() * 7, rnd());
    pos = r.gol !== null ? R.formacao(1 - r.gol) : r.pos;
    for (const [i, [x, y]] of r.pos.entries()) {
      const raio = i === 10 ? R.R_BOLA : R.R_BOTAO;
      assert.ok(x >= R.PAREDE.x0 + raio - 1 && x <= R.PAREDE.x1 - raio + 1, `chute ${k}: ${i} saiu pelo lado (${x})`);
      assert.ok(y >= -R.GOL.fundo - 1 && y <= R.COMP + R.GOL.fundo + 1, `chute ${k}: ${i} saiu pelo fundo (${y})`);
      if (i < 10) assert.ok(y >= R.PAREDE.y0 + raio - 1 && y <= R.PAREDE.y1 - raio + 1, `chute ${k}: botão ${i} entrou no gol`);
    }
    for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) {
      assert.ok(dist(r.pos[i], r.pos[j]) > (j === 10 ? R.R_BOTAO + R.R_BOLA : 2 * R.R_BOTAO) - 3, `chute ${k}: ${i} e ${j} encavalados`);
    }
    assert.ok(R.duracao(r.quadros) < 9500, 'parou');
  }
}

// a vez: fora da vez recusa; tocou na bola joga de novo (3 toques); não tocou passa
{
  const p = R.novaPartida(0, () => 0.1);   // FLA sai
  assert.equal(p.vez, 0);
  assert.equal(R.agir(p, 1, { b: 3, ang: 0, forca: 0.5 }, 2000), null, 'fora da vez');
  assert.equal(R.agir(p, 0, { b: 3, ang: -Math.PI / 2, forca: 0.5 }, 100), null, 'antes do apito da saída');
  assert.equal(R.agir(p, 0, { b: 9, ang: 0, forca: 0.5 }, 2000), null, 'botão do outro');
  let agora = 2000;
  const r = R.agir(p, 0, { b: 3, ang: -Math.PI / 2, forca: 0.3 }, agora);
  assert.ok(r && !r.passou && p.vez === 0 && p.toques === 2, 'tocou: joga de novo');
  assert.equal(R.agir(p, 0, { b: 3, ang: 0, forca: 0.5 }, agora + 10), null, 'ainda animando');
  agora = p.livre;
  const s = R.agir(p, 0, { b: 0, ang: Math.PI / 2, forca: 0.1 }, agora);   // o goleiro pra trás: não toca
  assert.ok(s.passou && p.vez === 1 && p.toques === R.TOQUES, 'não tocou: passa');
}

// gol conta, quem levou sai, 3 gols acaba
{
  const p = R.novaPartida(0, () => 0.1);
  let agora = 2000;
  for (let g = 1; g <= 3; g++) {
    p.vez = 0; p.toques = 3;
    p.pos[10] = [400, 150]; p.pos[3] = [400, 230]; p.pos[5] = [100, 60];
    const r = R.agir(p, 0, { b: 3, ang: -Math.PI / 2, forca: 0.7 }, agora);
    assert.equal(r.gol, 0);
    assert.deepEqual(p.placar, [g, 0]);
    agora = p.livre;
    if (g < 3) { assert.equal(p.vez, 1, 'quem levou dá a saída'); assert.deepEqual(p.pos, R.formacao(1)); }
  }
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'gols' });
}

// relógio da vez: passa; 3 seguidos perde
{
  const p = R.novaPartida(0, () => 0.9);   // VAS sai
  assert.equal(p.vez, 1);
  assert.equal(R.restante(p, 0), 1500 + R.TEMPO_VEZ);
  assert.equal(R.estourou(p, 30_000).tipo, 'tempo');
  assert.equal(p.vez, 0);
  for (const t of [60_000, 90_000, 120_000]) R.estourou(p, t);
  assert.equal(p.fim, null, "cada um estourou 2");
  assert.equal(R.estourou(p, 150_000).tipo, "ausente");
  assert.ok(p.fim && p.fim.motivo === 'ausente');
}

// fim do tempo: na frente leva; empatado é gol de ouro e o próximo gol acaba
{
  const p = R.novaPartida(0, () => 0.1);
  p.placar = [1, 0];
  assert.deepEqual(R.estourou(p, p.fimEm), { tipo: 'apito' });
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'tempo' });
  const q = R.novaPartida(0, () => 0.1);
  q.desde = q.fimEm - 1000;
  assert.equal(R.estourou(q, q.fimEm).tipo, 'ouro');
  assert.ok(q.ouro && !q.fim);
  assert.ok(R.restante(q, q.fimEm) > 0, 'segue sem apito');
  q.vez = 1; q.pos[10] = [400, 980]; q.pos[8] = [400, 900]; q.pos[0] = [100, 1070];
  const r = R.agir(q, 1, { b: 3, ang: Math.PI / 2, forca: 0.7 }, q.fimEm + 10);
  assert.equal(r.gol, 1);
  assert.deepEqual(q.fim, { vencedor: 1, motivo: 'ouro' });
}

console.log('botao: regras ok');
