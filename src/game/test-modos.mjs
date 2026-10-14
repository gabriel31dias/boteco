// Auto-verificação das variantes da mesa (bola 8, 9, 10, sinuca brasileira e
// snooker): regras pontuais e partidas inteiras simuladas com a física de
// verdade (um robô mira pela bola fantasma na caçapa mais fácil).
const assert = (await import('node:assert/strict')).default;
const { MODOS, modoDe, recolocar } = await import('./modos.js');
const { GameState } = await import('./GameState.js');
const { TurnManager } = await import('./TurnManager.js');
const { PhysicsWorld } = await import('../physics/PhysicsWorld.js');
const { applyCueStrike } = await import('../physics/CuePhysics.js');
const { mulberry32 } = await import('./rack.js');
const { BALL, TABLE } = await import('../config.js');

const estado = (modo) => { const s = new GameState(); s.reset(); return s; };
const tiro = (x) => ({ firstContact: null, pocketed: [], cueScratched: false, railAfterContact: true, isBreak: false, ...x });

// ---------------------------------------------------------- regras pontuais
{
  const m = MODOS.sinuca9, s = estado();
  assert.equal(m.avaliar(tiro({ firstContact: 3 }), s).foul, true, '9: tocou fora da menor');
  assert.equal(m.avaliar(tiro({ firstContact: 1, pocketed: [9] }), s).gameOver, true, '9: combinação na 9 vale');
  const f = m.avaliar(tiro({ firstContact: 2, pocketed: [9] }), s);
  assert.equal(f.foul, true); assert.deepEqual(f.respot, [9], '9 na falta volta');
  assert.equal(m.avaliar(tiro({ firstContact: 1, pocketed: [4] }), s).continueTurn, true);
}
{
  const m = MODOS.sinuca10, s = estado();
  const r = m.avaliar(tiro({ firstContact: 1, pocketed: [10] }), s);
  assert.equal(r.gameOver, false, '10 antes da hora não ganha'); assert.deepEqual(r.respot, [10]); assert.equal(r.continueTurn, true);
  s.pocketed = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(m.avaliar(tiro({ firstContact: 10, pocketed: [10] }), s).gameOver, true, '10 por último ganha');
}
{
  const m = MODOS.sinucabr, s = estado();
  let r = m.avaliar(tiro({ firstContact: 1, pocketed: [1] }), s);
  assert.deepEqual(r.pontos, [1, 0]); assert.equal(r.continueTurn, true);
  r = m.avaliar(tiro({ firstContact: 3 }), s);
  assert.equal(r.foul, true); assert.deepEqual(r.pontos, [0, 4], 'falta: mínimo 4');
  s.pocketed = [1, 2, 3, 4, 5, 6];
  s.pontos = [10, 20];
  r = m.avaliar(tiro({ firstContact: 7, pocketed: [7] }), s);
  assert.equal(r.gameOver, true); assert.equal(r.winner, 1, '17 x 20: o outro ganha');
}
{
  const m = MODOS.snooker, s = estado();
  let r = m.avaliar(tiro({ firstContact: 11, pocketed: [11] }), s);
  assert.deepEqual(r.pontos, [1, 0]); assert.equal(r.fase, 'cor');
  s.pocketed = [11]; s.fase = 'cor';
  r = m.avaliar(tiro({ firstContact: 7, pocketed: [7] }), s);
  assert.deepEqual(r.pontos, [7, 0]); assert.deepEqual(r.respot, [7], 'cor volta enquanto há vermelha'); assert.equal(r.fase, 'vermelha');
  s.fase = 'vermelha';
  r = m.avaliar(tiro({ firstContact: 7 }), s);
  assert.equal(r.foul, true); assert.equal(r.pontos[1], 7, 'falta na preta: 7');
  s.pocketed = [11, 12, 13, 14, 15, 16]; s.fase = 'vermelha';
  r = m.avaliar(tiro({ firstContact: 3, pocketed: [3] }), s);
  assert.equal(r.foul, true, 'limpeza: começa pela amarela');
}

// ------------------------------------------------- partidas com a física real
const R = BALL.radius;
function montar(modo, seed) {
  const world = new PhysicsWorld(), s = new GameState(); s.reset();
  const turns = new TurnManager(s, modo);
  const cue = world.addBall(0, 0, 0); cue.number = 0;
  for (const [i, n] of modo.bolas.entries()) { const b = world.addBall(i + 1, 0, 0); b.number = n; }
  const { branca, bolas } = modo.rack(mulberry32(seed));
  cue.reset(branca.x, branca.z);
  for (const { n, x, z } of bolas) world.balls.find((b) => b.number === n).reset(x, z);
  world.on('ballBall', (a, b, v) => turns.onBallBall(a, b, v));
  world.on('cushion', (b) => turns.onCushion(b));
  world.on('pocket', (b) => turns.onPocket(b));
  return { world, s, turns, cue };
}

/** Quais bolas o robô tenta (a "da vez" de cada modo). */
function alvos(modo, s, world) {
  const mesa = world.balls.filter((b) => b.number && b.active && !b.pocketed).map((b) => b.number);
  if (modo.id === 'sinuca') {
    const g = s.players[s.current].group;
    const meus = g ? mesa.filter((n) => (g === 'lisas' ? n < 8 : n > 8)) : mesa.filter((n) => n !== 8);
    return meus.length ? meus : [8];
  }
  if (modo.id === 'sinuca9' || modo.id === 'sinuca10' || modo.id === 'sinucabr') return [Math.min(...mesa)];
  const alvo = modo.alvo(s, mesa);
  return alvo === 'vermelha' ? mesa.filter((n) => n >= 11) : alvo === 'cor' ? mesa.filter((n) => n < 11) : [alvo];
}

function mira(world, cue, numeros, rnd) {
  let melhor = null;
  for (const n of numeros) {
    const b = world.balls.find((x) => x.number === n);
    for (const p of world.pockets) {
      const dx = p.center.x - b.position.x, dz = p.center.z - b.position.z, d = Math.hypot(dx, dz);
      const gx = b.position.x - (dx / d) * 2 * R, gz = b.position.z - (dz / d) * 2 * R;
      const ax = gx - cue.position.x, az = gz - cue.position.z;
      const corte = Math.acos(Math.max(-1, Math.min(1, (ax * dx + az * dz) / (Math.hypot(ax, az) * d))));
      if (corte > 1.2) continue;
      const custo = corte * 2 + d + Math.hypot(ax, az) * 0.5;
      if (!melhor || custo < melhor.custo) melhor = { custo, ang: Math.atan2(ax, az) };
    }
  }
  if (!melhor) { const b = world.balls.find((x) => x.number === numeros[0]); melhor = { ang: Math.atan2(b.position.x - cue.position.x, b.position.z - cue.position.z) }; }
  return melhor.ang + (rnd() - 0.5) * 0.03;
}

function colocarBranca(world, cue, x0) {
  let x = x0, z = 0;
  for (let k = 0; k < 60 && world.balls.some((o) => o !== cue && o.active && !o.pocketed && Math.hypot(o.position.x - x, o.position.z - z) < R * 2.1); k++) { z = ((k % 7) - 3) * R * 2.2; x = x0 + Math.floor(k / 7) * R * 2.2; }
  cue.reset(x, z);
}

function partida(modo, seed) {
  const { world, s, turns, cue } = montar(modo, seed);
  const rnd = mulberry32(seed + 99);
  let tacadas = 0;
  turns.begin(true);
  while (tacadas < 500) {
    const ang = mira(world, cue, alvos(modo, s, world), rnd);
    applyCueStrike(cue, { direction: { x: Math.sin(ang), y: 0, z: Math.cos(ang) }, power: tacadas === 0 ? 0.95 : 0.3 + rnd() * 0.45, spinX: 0, spinY: 0, elevation: 0 });
    tacadas++;
    for (let t = 0; t < 40 && (t < 0.1 || world.anyMoving()); t += 1 / 120) world.step(1 / 120);
    world.stopAll();
    const r = turns.resolve();
    if (r.shot.cueScratched) colocarBranca(world, cue, -TABLE.playWidth / 4);
    if (r.respot?.length) recolocar(world, modo, r.respot);
    // coerência: o que as regras acham encaçapado é o que está fora da mesa
    for (const b of world.balls) if (b.number) assert.equal(s.pocketed.includes(b.number), !b.active || b.pocketed, `${modo.id} #${seed}: bola ${b.number} (lista ${s.pocketed})`);
    // nenhuma bola em cima da outra depois de recolocar
    const vivas = world.balls.filter((b) => b.active && !b.pocketed);
    for (let i = 0; i < vivas.length; i++) for (let j = i + 1; j < vivas.length; j++) assert.ok(Math.hypot(vivas[i].position.x - vivas[j].position.x, vivas[i].position.z - vivas[j].position.z) > R * 1.9, `${modo.id}: bolas sobrepostas`);
    if (r.gameOver) return { fim: true, tacadas, vencedor: r.winner, pontos: [...s.pontos] };
    if (s.ballInHand && !r.shot.cueScratched) colocarBranca(world, cue, -TABLE.playWidth / 4);
    turns.begin(false);
  }
  return { fim: false, tacadas };
}

for (const modo of Object.values(MODOS)) {
  const N = 40;
  let acabou = 0, tacadas = 0;
  const vit = [0, 0];
  for (let k = 0; k < N; k++) {
    const r = partida(modo, 1000 + k);
    if (r.fim) { acabou++; tacadas += r.tacadas; vit[r.vencedor]++; assert.ok(r.vencedor === 0 || r.vencedor === 1, 'sempre tem vencedor (o servidor paga por consenso)'); }
  }
  console.log(`  ${modo.nome.padEnd(17)} ${acabou}/${N} partidas até o fim · média ${Math.round(tacadas / Math.max(1, acabou))} tacadas · vitórias ${vit}`);
  assert.ok(acabou >= N * 0.8, `${modo.nome}: poucas partidas terminaram (${acabou}/${N})`);
}
assert.equal(modoDe('xyz').id, 'sinuca');
console.log('✔ sinuca: modos');
