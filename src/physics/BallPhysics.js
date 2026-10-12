import { Vector3 } from './vec3.js';
import { BALL, PHYSICS } from '../config.js';

const _u = new Vector3();
const _uHat = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _contact = new Vector3();
const _rest = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Corpo rígido esférico restrito ao plano do pano.
 * Modelo clássico de bilhar: fase de escorregamento (sliding) com atrito de
 * Coulomb no ponto de contato, seguida de fase de rolamento puro com
 * resistência de rolamento. O efeito vertical (english) decai à parte.
 */
export class BallBody {
  constructor(id, x, z) {
    this.id = id;
    this.radius = BALL.radius;
    this.mass = BALL.mass;
    this.invMass = 1 / BALL.mass;
    // Momento de inércia de uma esfera maciça: I = 2/5 m R²
    this.inertia = 0.4 * BALL.mass * BALL.radius * BALL.radius;
    this.invInertia = 1 / this.inertia;

    this.position = new Vector3(x, BALL.radius, z);
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();

    this.pocketed = false;
    this.falling = false;
    this.active = true;
    this.pocketIndex = -1;
    this.fallVelocityY = 0;
  }

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  /** Em repouso = sem velocidade, sem efeito e sem escorregamento pendente
   *  (uma bola com backspin tem v≈0 mas ainda vai voltar). */
  atRest() {
    if (this.speed > PHYSICS.sleepSpeed) return false;
    if (Math.abs(this.angularVelocity.y) > PHYSICS.sleepSpin) return false;
    return this.contactVelocity(_rest).length() < PHYSICS.sleepSpeed * 3;
  }

  isMoving() {
    if (!this.active || this.pocketed) return this.falling;
    return !this.atRest();
  }

  reset(x, z) {
    this.position.set(x, BALL.radius, z);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.pocketed = false;
    this.falling = false;
    this.active = true;
    this.pocketIndex = -1;
    this.fallVelocityY = 0;
  }

  stop() {
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  /** Velocidade do ponto de contato com o pano (base da esfera). */
  contactVelocity(out) {
    _contact.set(0, -this.radius, 0);
    out.copy(this.angularVelocity).cross(_contact).add(this.velocity);
    out.y = 0;
    return out;
  }

  integrate(dt) {
    if (!this.active || this.pocketed) return;
    const g = PHYSICS.gravity;
    const R = this.radius;

    this.contactVelocity(_u);
    const uLen = _u.length();

    if (uLen > 1e-3) {
      // --- Escorregamento: atrito de Coulomb no ponto de contato ---
      _uHat.copy(_u).divideScalar(uLen);
      // du/dt = -(7/2)·μ·g·û  →  o passo é limitado a uLen/3.5 para que a
      // velocidade de contato chegue a zero sem oscilar (rolamento estável).
      const dv = Math.min(PHYSICS.slideFriction * g * dt, uLen / 3.5);
      this.velocity.addScaledVector(_uHat, -dv);

      // Impulso J = -m·dv·û aplicado em r = (0,-R,0)  =>  Δω = (r × J)/I
      _tmp2.set(0, -R, 0).cross(_uHat).multiplyScalar(-(this.mass * dv) * this.invInertia);
      this.angularVelocity.add(_tmp2);

      // ponytail: swerve simplificado — o efeito lateral curva a trajetória
      // enquanto a bola escorrega (o patch de contato desvia o atrito).
      if (Math.abs(this.angularVelocity.y) > 0.2) {
        _tmp.copy(UP).cross(_uHat).multiplyScalar(this.angularVelocity.y * 0.0016 * g * dt);
        this.velocity.add(_tmp);
      }
    } else {
      // --- Rolamento puro: impõe o vínculo ω = (ŷ × v)/R e freia devagar ---
      const s = this.speed;
      if (s > 1e-5) {
        const dv = Math.min(PHYSICS.rollFriction * g * dt, s);
        const k = (s - dv) / s;
        this.velocity.x *= k;
        this.velocity.z *= k;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
      this.angularVelocity.x = this.velocity.z / R;
      this.angularVelocity.z = -this.velocity.x / R;
    }

    // Decaimento do efeito vertical
    const spinDecel = (2.5 * PHYSICS.spinFriction * g) / R;
    const wy = this.angularVelocity.y;
    const dw = Math.min(Math.abs(wy), spinDecel * dt);
    this.angularVelocity.y = wy - Math.sign(wy) * dw;

    // Limite de velocidade (estabilidade)
    const sp = this.speed;
    if (sp > PHYSICS.maxSpeed) {
      const k = PHYSICS.maxSpeed / sp;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y = R;

    if (this.atRest()) this.stop();
  }

  /** Queda dentro da caçapa (apenas visual, sem interações). */
  integrateFall(dt, pocketCenter) {
    this.fallVelocityY -= PHYSICS.gravity * dt;
    this.position.y += this.fallVelocityY * dt;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    // atrai suavemente para o centro da caçapa
    this.position.x += (pocketCenter.x - this.position.x) * Math.min(1, dt * 6);
    this.position.z += (pocketCenter.z - this.position.z) * Math.min(1, dt * 6);
    this.velocity.multiplyScalar(1 - Math.min(1, dt * 3));
  }
}
