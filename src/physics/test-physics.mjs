// Auto-verificação da física: node src/physics/test-physics.mjs
import assert from 'node:assert';
import { Vector3 } from './vec3.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { applyCueStrike } from './CuePhysics.js';
import { BALL, TABLE } from '../config.js';

const D = BALL.radius * 2;
const run = (w, seconds, dt = 1 / 60) => { for (let i = 0; i < seconds / dt; i++) w.step(dt); };

// 1. Bola desacelera e para pelo atrito do pano
{
  const w = new PhysicsWorld();
  const b = w.addBall('cue', -1, 0);
  b.velocity.set(2, 0, 0);
  run(w, 20);
  assert.ok(!w.anyMoving(), 'bola deveria parar pelo atrito');
}

// 2. Colisão frontal: transferência de momento (branca quase para)
{
  const w = new PhysicsWorld();
  const a = w.addBall('cue', -0.5, 0);
  const b = w.addBall('1', 0, 0);
  a.velocity.set(3, 0, 0);
  for (let i = 0; i < 60; i++) w.step(1 / 240);
  assert.ok(b.velocity.x > 2.2, `objeto deveria receber a energia (${b.velocity.x.toFixed(2)})`);
  assert.ok(Math.abs(a.velocity.x) < 0.6, `branca deveria quase parar (${a.velocity.x.toFixed(2)})`);
}

// 3. Nenhuma sobreposição após um break forte (sem atravessar bolas)
{
  const w = new PhysicsWorld();
  const cue = w.addBall('cue', -0.635, 0);
  let n = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      w.addBall(`b${n++}`, 0.635 + row * D * 0.867, (i - row / 2) * D * 1.001);
    }
  }
  applyCueStrike(cue, { direction: new Vector3(1, 0, 0.02), power: 1, spinX: 0, spinY: 0 });
  for (let s = 0; s < 60 * 15; s++) {
    w.step(1 / 60);
    for (let i = 0; i < w.balls.length; i++) {
      for (let k = i + 1; k < w.balls.length; k++) {
        const x = w.balls[i], y = w.balls[k];
        if (!x.active || !y.active || x.pocketed || y.pocketed) continue;
        const dist = Math.hypot(x.position.x - y.position.x, x.position.z - y.position.z);
        assert.ok(dist > D - 1e-3, `bolas se atravessaram (d=${dist.toFixed(5)})`);
      }
    }
  }
  assert.ok(!w.anyMoving(), 'tudo deveria parar após o break');
}

// 4. Nenhuma bola escapa da área de jogo
{
  const w = new PhysicsWorld();
  const hw = TABLE.playWidth / 2 + 0.1, hd = TABLE.playDepth / 2 + 0.1;
  for (let i = 0; i < 12; i++) {
    const b = w.addBall(`b${i}`, (i % 4) * 0.2 - 0.3, Math.floor(i / 4) * 0.2 - 0.2);
    b.velocity.set(Math.cos(i) * 9, 0, Math.sin(i * 1.7) * 9);
  }
  for (let s = 0; s < 60 * 20; s++) {
    w.step(1 / 60);
    for (const b of w.balls) {
      if (b.pocketed) continue;
      assert.ok(Math.abs(b.position.x) < hw && Math.abs(b.position.z) < hd,
        `bola escapou: ${b.position.x.toFixed(3)},${b.position.z.toFixed(3)}`);
    }
  }
}

// 5. Backspin faz a branca voltar; topspin faz seguir
{
  const mk = (spinY) => {
    const w = new PhysicsWorld();
    const cue = w.addBall('cue', -0.6, 0);
    w.addBall('1', 0, 0);
    applyCueStrike(cue, { direction: new Vector3(1, 0, 0), power: 0.45, spinY });
    run(w, 0.42); // antes de a bola objeto voltar da tabela
    return cue.position.x; // contato ocorre em x ≈ -2R
  };
  const draw = mk(-0.55), center = mk(0), follow = mk(0.55);
  assert.ok(draw < -0.09, `backspin deveria puxar a branca para trás (${draw.toFixed(3)})`);
  assert.ok(follow > center && center > draw, `ordem draw<center<follow (${draw.toFixed(2)}/${center.toFixed(2)}/${follow.toFixed(2)})`);
  assert.ok(follow - draw > 0.15, 'topspin e backspin devem diferir claramente');
}

// 6. Independência de FPS: 30fps e 240fps convergem
{
  const sim = (dt) => {
    const w = new PhysicsWorld();
    const cue = w.addBall('cue', -0.8, 0.1);
    w.addBall('1', 0.1, 0.0);
    applyCueStrike(cue, { direction: new Vector3(1, 0, -0.1), power: 0.7 });
    for (let i = 0; i < 10 / dt; i++) w.step(dt);
    return w.balls.map(b => `${b.position.x.toFixed(2)},${b.position.z.toFixed(2)}`).join('|');
  };
  assert.strictEqual(sim(1 / 30), sim(1 / 240), 'resultado deve independer do FPS');
}

// 7. Caçapa engole bola direcionada ao canto
{
  const w = new PhysicsWorld();
  const b = w.addBall('1', 0.9, 0.4);
  const dir = new Vector3(TABLE.playWidth / 2 - 0.9, 0, TABLE.playDepth / 2 - 0.4).normalize();
  b.velocity.copy(dir).multiplyScalar(2.2);
  run(w, 6);
  assert.ok(b.pocketed, 'bola deveria entrar na caçapa de canto');
}

// 8. Nada escapa da mesa: não existe parede, só borracha. Uma bola que passa a
// boca da caçapa e não é capturada sumiria pra sempre — o raio de captura tem
// que cobrir todo caminho que atravessa o vão.
{
  const hw = TABLE.playWidth / 2, hd = TABLE.playDepth / 2;
  const alvos = [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd], [0, hd], [0, -hd]];
  for (const [px, pz] of alvos) {
    for (let a = -0.5; a <= 0.5001; a += 0.05) {
      for (const v of [1.5, 4, 8, 12]) {
        const w = new PhysicsWorld();
        const fx = px * 0.35, fz = pz * 0.35;
        const ang = Math.atan2(pz - fz, px - fx) + a;
        const b = w.addBall('1', fx, fz);
        b.velocity.set(Math.cos(ang) * v, 0, Math.sin(ang) * v);
        for (let i = 0; i < 240 * 12 && !b.pocketed; i++) w.step(1 / 240);
        assert.ok(b.pocketed || (Math.abs(b.position.x) < hw + 0.12 && Math.abs(b.position.z) < hd + 0.12),
          `bola fugiu da mesa mirando ${px},${pz} (desvio ${a.toFixed(2)}, ${v} m/s)`);
      }
    }
  }
}

console.log('✔ física: 8/8 verificações passaram');
