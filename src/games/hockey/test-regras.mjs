// Auto-verificação das regras do Air Hockey Neon.
const assert = (await import('node:assert/strict')).default;
const R = await import('./regras.js');
const { LARGURA: W, ALTURA: H } = R;

let t = 1_000_000;
const anda = (p, ms) => { for (let k = 0; k < ms / R.TICK_MS; k++) R.passo(p, (t += R.TICK_MS)); };
const nova = () => { const p = R.novaPartida(t); anda(p, R.CONTAGEM + 100); return p; };

// começa: contagem, depois o disco parado do lado de quem saca
{
  const p = nova();
  assert.equal(p.fase, 'jogo');
  assert.equal(Math.hypot(p.disco.vx, p.disco.vy), 0);
  assert.ok(p.lado === 0 ? p.disco.y > H / 2 : p.disco.y < H / 2);
}
// taco fica na metade dele e não teleporta
{
  const p = nova();
  R.agir(p, 0, { x: 9999, y: 0 });
  assert.equal(p.tacos[0].alvo.y, H / 2 + R.R_TACO, 'não passa do meio');
  assert.equal(p.tacos[0].alvo.x, W - R.R_TACO);
  const antes = { ...p.tacos[0] };
  R.passo(p, (t += R.TICK_MS));
  assert.ok(Math.hypot(p.tacos[0].x - antes.x, p.tacos[0].y - antes.y) <= R.V_TACO * R.TICK_MS / 1000 + 1, 'velocidade limitada');
  assert.equal(R.agir(p, 1, 'lixo'), null);
  assert.equal(R.agir(p, 1, { x: 'a', y: 1 }), null);
}
// tacada: taco em movimento manda o disco pro outro lado; batida vira evento
{
  const p = nova();
  p.disco = { x: W / 2, y: H * 0.6, vx: 0, vy: 0 };
  p.tacos[0].x = W / 2; p.tacos[0].y = H - 60; p.tacos[0].alvo = { x: W / 2, y: H - 60 };
  R.agir(p, 0, { x: W / 2, y: H / 2 });
  let viu = false, vy = 0;
  for (let k = 0; k < 10; k++) { R.passo(p, (t += R.TICK_MS)); viu ||= p.eventos.some((e) => e.tipo === 'batida' && e.de === 0); vy = Math.min(vy, p.disco.vy); }
  assert.ok(viu, 'anunciou a batida');
  assert.ok(vy < -1500, `disco subiu forte (${vy})`);
}
// gol: disco entra na boca de cima -> ponto do 0, pausa e saque de quem sofreu
{
  const p = nova();
  p.tacos[1].x = 40; p.tacos[1].alvo = { x: 40, y: 40 }; p.tacos[1].y = 40;
  p.disco = { x: W / 2, y: 100, vx: 0, vy: -1500 };
  anda(p, 300);
  assert.deepEqual(p.placar, [1, 0]);
  assert.equal(p.fase, 'gol');
  anda(p, R.PAUSA_GOL + 100);
  assert.equal(p.fase, 'jogo');
  assert.ok(p.disco.y < H / 2, 'quem sofreu saca');
}
// fora da boca do gol é parede: quica
{
  const p = nova();
  p.disco = { x: 30, y: 100, vx: 0, vy: -1500 };
  anda(p, 300);
  assert.deepEqual(p.placar, [0, 0]);
  assert.ok(p.disco.vy > 0, 'quicou');
}
// disco nunca sai da mesa (fora do gol), mesmo com tacos doidos
{
  const p = nova();
  for (let k = 0; k < 3000 && !p.fim; k++) {
    for (const i of [0, 1]) if (Math.random() < 0.3) R.agir(p, i, { x: Math.random() * W, y: Math.random() * H });
    R.passo(p, (t += R.TICK_MS));
    const d = p.disco;
    assert.ok(d.x >= R.R_DISCO - 0.01 && d.x <= W - R.R_DISCO + 0.01, `x fora: ${d.x}`);
    if (d.y < 0 || d.y > H) assert.ok(Math.abs(d.x - W / 2) < R.GOL / 2, `fora da mesa em ${d.x},${d.y}`);
  }
}
// 7 segundos parado numa metade: vai pro outro sacar
{
  const p = nova();
  p.disco = { x: 60, y: H - 60, vx: 0, vy: 0 }; p.lado = 0; p.ladoDesde = t;
  p.tacos[0].alvo = { x: W - 60, y: H - 60 };
  anda(p, R.PRESO + 200);
  assert.ok(p.disco.y < H / 2, 'foi pro outro lado');
}
// tempo: quem tem mais vence; empatado é gol de ouro
{
  const p = nova();
  p.placar = [2, 2];
  p.fimEm = t;
  anda(p, 100);
  assert.equal(p.ouro, true);
  assert.equal(p.fim, null);
  p.tacos[1].x = 40; p.tacos[1].y = 40; p.tacos[1].alvo = { x: 40, y: 40 };
  p.disco = { x: W / 2, y: 100, vx: 0, vy: -1500 };
  anda(p, 300);
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'ouro' });
  const q = nova(); q.placar = [1, 3]; q.fimEm = t; anda(q, 100);
  assert.deepEqual(q.fim, { vencedor: 1, motivo: 'tempo' });
}
// 7 gols acaba; robôs que perseguem o disco terminam uma partida
{
  const p = R.novaPartida(t);
  let passos = 0;
  while (!p.fim && passos++ < 40_000) {
    t += R.TICK_MS; R.passo(p, t);
    for (const i of [0, 1]) {
      const d = p.disco, gy = i === 0 ? H : 0;
      // atrás do disco, mirando no gol do outro; o 0 é mais rápido no reflexo
      if (Math.random() < [0.6, 0.35][i]) R.agir(p, i, { x: d.x + (Math.random() - 0.5) * 20, y: d.y + (gy > d.y ? 30 : -30) });
    }
  }
  assert.ok(p.fim, 'terminou');
  console.log(`  partida simulada: ${p.placar} (${p.fim.motivo}), batidas ${p.batidas}`);
}
// W.O.
{
  const p = nova();
  R.eliminar(p, 1);
  assert.deepEqual(p.fim, { vencedor: 0, motivo: 'wo' });
}
console.log('✔ hockey: regras');
