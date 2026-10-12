import { Vector3 } from './vec3.js';
import { BALL, PHYSICS, POCKET, TABLE } from '../config.js';
import { BallBody } from './BallPhysics.js';

const _n = new Vector3();
const _rel = new Vector3();
const _s1 = new Vector3();
const _s2 = new Vector3();
const _t = new Vector3();
const _r = new Vector3();
const _j = new Vector3();
const _closest = new Vector3();
const _u = new Vector3();

function closestPointOnSegment(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.set(ax + dx * t, 0, az + dz * t);
  return out;
}

/**
 * Mundo físico dedicado a bilhar: integrador de passo fixo com sub-passos
 * adaptativos (independente de FPS), colisões esfera-esfera com transferência
 * de efeito, tabelas modeladas como cápsulas e caçapas circulares.
 */
export class PhysicsWorld {
  constructor() {
    this.balls = [];
    this.accumulator = 0;
    this.listeners = { ballBall: [], cushion: [], pocket: [] };

    const hw = TABLE.playWidth / 2;
    const hd = TABLE.playDepth / 2;
    const jaw = POCKET.jawRadius;
    const cm = POCKET.cornerMouth;
    const sm = POCKET.sideMouth;

    this.bounds = { hw, hd };

    // Cápsulas de borracha: a linha central fica deslocada `jaw` para fora,
    // de modo que a superfície da cápsula coincida com a linha de jogo.
    this.cushions = [];
    for (const sz of [-1, 1]) {
      const z = sz * (hd + jaw);
      this.cushions.push({ ax: -hw + cm + jaw, az: z, bx: -sm - jaw, bz: z, r: jaw });
      this.cushions.push({ ax: sm + jaw, az: z, bx: hw - cm - jaw, bz: z, r: jaw });
    }
    for (const sx of [-1, 1]) {
      const x = sx * (hw + jaw);
      this.cushions.push({ ax: x, az: -hd + cm + jaw, bx: x, bz: hd - cm - jaw, r: jaw });
    }

    this.pockets = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.pockets.push({
          center: new Vector3(sx * (hw + POCKET.cornerOffset), 0, sz * (hd + POCKET.cornerOffset)),
          radius: POCKET.cornerRadius, corner: true,
        });
      }
    }
    for (const sz of [-1, 1]) {
      this.pockets.push({
        center: new Vector3(0, 0, sz * (hd + POCKET.sideOffset)),
        radius: POCKET.sideRadius, corner: false,
      });
    }
  }

  on(event, fn) { this.listeners[event].push(fn); return this; }
  emit(event, ...args) { for (const fn of this.listeners[event]) fn(...args); }

  addBall(id, x, z) {
    const b = new BallBody(id, x, z);
    this.balls.push(b);
    return b;
  }

  anyMoving() {
    for (const b of this.balls) if (b.isMoving()) return true;
    return false;
  }

  stopAll() {
    for (const b of this.balls) b.stop();
  }

  /** Avanço temporal com acumulador de passo fixo → física independente de FPS. */
  step(dt) {
    this.accumulator += Math.min(dt, 0.1); // evita espiral após um freeze
    const h = PHYSICS.fixedStep;
    let guard = 0;
    while (this.accumulator >= h && guard++ < 40) {
      this.accumulator -= h;
      this.substep(h);
    }
  }

  substep(h) {
    // Sub-passos adaptativos: nenhuma bola pode andar mais que ~1/3 do raio
    let vmax = 0;
    for (const b of this.balls) {
      if (b.active && !b.pocketed) vmax = Math.max(vmax, b.speed);
    }
    const n = Math.max(1, Math.min(PHYSICS.maxSubSteps,
      Math.ceil((vmax * h) / (BALL.radius * 0.33))));
    const dt = h / n;
    for (let i = 0; i < n; i++) {
      for (const b of this.balls) b.integrate(dt);
      this.solveCushions();
      this.solveBallCollisions();
      this.checkPockets();
    }
    this.updateFalling(h);
  }

  solveBallCollisions() {
    const balls = this.balls;
    const d = BALL.radius * 2;
    const d2 = d * d;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active || a.pocketed) continue;
      for (let k = i + 1; k < balls.length; k++) {
        const b = balls[k];
        if (!b.active || b.pocketed) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 >= d2 || dist2 < 1e-12) continue;

        const dist = Math.sqrt(dist2);
        _n.set(dx / dist, 0, dz / dist);

        // Correção posicional simétrica (elimina sobreposição / atravessamento)
        const overlap = d - dist;
        a.position.x -= _n.x * overlap * 0.5;
        a.position.z -= _n.z * overlap * 0.5;
        b.position.x += _n.x * overlap * 0.5;
        b.position.z += _n.z * overlap * 0.5;

        _rel.copy(b.velocity).sub(a.velocity);
        const vn = _rel.dot(_n);
        if (vn >= 0) continue; // já se afastando

        const invSum = a.invMass + b.invMass;
        const jn = -(1 + BALL.restitution) * vn / invSum;
        a.velocity.addScaledVector(_n, -jn * a.invMass);
        b.velocity.addScaledVector(_n, jn * b.invMass);

        this.applyTangentialFriction(a, b, jn);
        this.emit('ballBall', a, b, Math.abs(vn));
      }
    }
  }

  /** Atrito de contato entre bolas: gera "throw" e transfere efeito. */
  applyTangentialFriction(a, b, jn) {
    const R = BALL.radius;
    _r.copy(_n).multiplyScalar(R);
    _s1.copy(a.angularVelocity).cross(_r).add(a.velocity);
    _r.copy(_n).multiplyScalar(-R);
    _s2.copy(b.angularVelocity).cross(_r).add(b.velocity);

    _t.copy(_s2).sub(_s1);
    _t.addScaledVector(_n, -_t.dot(_n));
    const tLen = _t.length();
    if (tLen < 1e-4) return;
    _t.divideScalar(tLen);

    const denom = a.invMass + b.invMass + R * R * (a.invInertia + b.invInertia);
    const jt = Math.min(PHYSICS.ballFriction * Math.abs(jn), tLen / denom);

    _j.copy(_t).multiplyScalar(-jt);
    b.velocity.addScaledVector(_j, b.invMass);
    a.velocity.addScaledVector(_j, -a.invMass);

    _r.copy(_n).multiplyScalar(-R).cross(_j).multiplyScalar(b.invInertia);
    b.angularVelocity.add(_r);
    _r.copy(_n).multiplyScalar(R).cross(_j).multiplyScalar(-a.invInertia);
    a.angularVelocity.add(_r);
  }

  solveCushions() {
    const R = BALL.radius;
    for (const ball of this.balls) {
      if (!ball.active || ball.pocketed) continue;
      for (const c of this.cushions) {
        closestPointOnSegment(ball.position.x, ball.position.z, c.ax, c.az, c.bx, c.bz, _closest);
        const dx = ball.position.x - _closest.x;
        const dz = ball.position.z - _closest.z;
        const dist2 = dx * dx + dz * dz;
        const minDist = R + c.r;
        if (dist2 >= minDist * minDist || dist2 < 1e-12) continue;

        const dist = Math.sqrt(dist2);
        _n.set(dx / dist, 0, dz / dist);
        ball.position.x += _n.x * (minDist - dist);
        ball.position.z += _n.z * (minDist - dist);

        const vn = ball.velocity.dot(_n);
        if (vn >= 0) continue;

        const jn = -(1 + BALL.cushionRestitution) * vn * ball.mass;
        ball.velocity.addScaledVector(_n, jn * ball.invMass);

        // Atrito tangencial: o efeito lateral altera o ângulo de saída
        _r.copy(_n).multiplyScalar(-R);
        _u.copy(ball.angularVelocity).cross(_r).add(ball.velocity);
        _u.addScaledVector(_n, -_u.dot(_n));
        const uLen = _u.length();
        if (uLen > 1e-4) {
          _u.divideScalar(uLen);
          const denom = ball.invMass + R * R * ball.invInertia;
          const jt = Math.min(PHYSICS.cushionFriction * jn, uLen / denom);
          _j.copy(_u).multiplyScalar(-jt);
          ball.velocity.addScaledVector(_j, ball.invMass);
          _r.cross(_j).multiplyScalar(ball.invInertia);
          ball.angularVelocity.add(_r);
        }
        this.emit('cushion', ball, Math.abs(vn));
      }
    }
  }

  checkPockets() {
    for (const ball of this.balls) {
      if (!ball.active || ball.pocketed) continue;
      for (let i = 0; i < this.pockets.length; i++) {
        const p = this.pockets[i];
        const dx = ball.position.x - p.center.x;
        const dz = ball.position.z - p.center.z;
        if (dx * dx + dz * dz > p.radius * p.radius) continue;
        ball.pocketed = true;
        ball.falling = true;
        ball.pocketIndex = i;
        ball.fallVelocityY = -0.2;
        ball.velocity.multiplyScalar(0.35);
        this.emit('pocket', ball, i);
        break;
      }
    }
  }

  updateFalling(dt) {
    for (const ball of this.balls) {
      if (!ball.falling) continue;
      const p = this.pockets[ball.pocketIndex];
      ball.integrateFall(dt, p.center);
      if (ball.position.y < -POCKET.depth) {
        ball.falling = false;
        ball.active = false;
        ball.stop();
      }
    }
  }

  /**
   * Primeira bola atingida por um raio a partir de `origin` na direção `dir`
   * (mira). Retorna o ponto fantasma (posição da branca no impacto).
   */
  raycastBall(origin, dir, ignore) {
    const R2 = BALL.radius * 2;
    let best = null;
    for (const b of this.balls) {
      if (b === ignore || !b.active || b.pocketed) continue;
      const ox = b.position.x - origin.x;
      const oz = b.position.z - origin.z;
      const proj = ox * dir.x + oz * dir.z;
      if (proj <= 0) continue;
      const perp2 = ox * ox + oz * oz - proj * proj;
      if (perp2 > R2 * R2) continue;
      const t = proj - Math.sqrt(Math.max(0, R2 * R2 - perp2));
      if (t < 0) continue;
      if (!best || t < best.distance) best = { ball: b, distance: t };
    }
    return best;
  }

  /** Primeiro ponto de contato do raio com as tabelas. */
  raycastCushion(origin, dir) {
    const R = BALL.radius;
    let best = null;
    for (const c of this.cushions) {
      const rr = R + c.r;
      // interseção raio-cápsula 2D resolvida por amostragem do segmento
      const hit = raySegmentCapsule(origin.x, origin.z, dir.x, dir.z, c, rr);
      if (hit && (!best || hit.t < best.t)) {
        best = { t: hit.t, point: new Vector3(origin.x + dir.x * hit.t, R, origin.z + dir.z * hit.t), normal: hit.normal };
      }
    }
    return best;
  }
}

function raySegmentCapsule(ox, oz, dx, dz, c, rr) {
  // Plano infinito da tabela + verificação de que o contato cai dentro do segmento
  const sx = c.bx - c.ax, sz = c.bz - c.az;
  const slen = Math.hypot(sx, sz) || 1;
  const nx = -sz / slen, nz = sx / slen;
  const denom = dx * nx + dz * nz;
  if (Math.abs(denom) < 1e-6) return null;
  for (const sign of [1, -1]) {
    const px = c.ax + nx * rr * sign, pz = c.az + nz * rr * sign;
    const t = ((px - ox) * nx + (pz - oz) * nz) / denom;
    if (t <= 1e-4) continue;
    const hx = ox + dx * t, hz = oz + dz * t;
    const proj = ((hx - c.ax) * sx + (hz - c.az) * sz) / (slen * slen);
    if (proj < 0 || proj > 1) continue;
    return { t, normal: new Vector3(nx * sign, 0, nz * sign) };
  }
  return null;
}
