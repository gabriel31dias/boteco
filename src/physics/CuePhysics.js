import { Vector3 } from './vec3.js';
import { BALL, SHOT } from '../config.js';

const UP = new Vector3(0, 1, 0);
const _right = new Vector3();
const _impulse = new Vector3();
const _contact = new Vector3();
const _torque = new Vector3();

/**
 * Converte os parâmetros da tacada (direção, força, ponto de impacto e
 * elevação) em velocidade linear + angular da bola branca.
 * ω = (r × J) / I, com r = ponto de contato do taco na superfície da esfera.
 */
export function applyCueStrike(ball, { direction, power, spinX = 0, spinY = 0, elevation = 0 }) {
  const R = BALL.radius;
  const m = BALL.mass;

  // Limita o ponto de impacto ao disco seguro (fora dele haveria "miscue")
  let ax = spinX, ay = spinY;
  const mag = Math.hypot(ax, ay);
  const max = SHOT.maxSpinOffset;
  if (mag > max) { ax = (ax / mag) * max; ay = (ay / mag) * max; }

  const speed = Math.max(SHOT.minPower, Math.min(1, power)) * SHOT.maxSpeed;

  const d = _impulse.copy(direction).setY(0).normalize();
  _right.copy(d).cross(UP).normalize();

  // Squirt: o efeito lateral desvia levemente a saída da branca
  const squirt = -ax * 0.035;
  d.addScaledVector(_right, squirt).normalize();

  const depth = Math.sqrt(Math.max(0.05, 1 - ax * ax - ay * ay));
  _contact.set(0, 0, 0)
    .addScaledVector(d, -R * depth)
    .addScaledVector(_right, R * ax)
    .addScaledVector(UP, R * ay);

  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);
  const J = new Vector3()
    .addScaledVector(d, m * speed * cosE)
    .addScaledVector(UP, -m * speed * sinE);

  ball.velocity.set(J.x * ball.invMass, 0, J.z * ball.invMass);

  _torque.copy(_contact).cross(J).multiplyScalar(ball.invInertia);
  ball.angularVelocity.copy(_torque);

  return speed;
}

/** Velocidade resultante (m/s) para exibir/derivar áudio sem aplicar a tacada. */
export function powerToSpeed(power) {
  return Math.max(SHOT.minPower, Math.min(1, power)) * SHOT.maxSpeed;
}
