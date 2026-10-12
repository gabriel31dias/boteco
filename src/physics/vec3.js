/**
 * Vetor 3D mínimo com a API do three.js usada pela física.
 * ponytail: substitui a dependência `three` num jogo 2D — 15 métodos bastam.
 */
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }

  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setY(y) { this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y || 0; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }

  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }

  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) {
    const { x, y, z } = this;
    this.x = y * v.z - z * v.y;
    this.y = z * v.x - x * v.z;
    this.z = x * v.y - y * v.x;
    return this;
  }

  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize() {
    const l = this.length();
    return l > 0 ? this.divideScalar(l) : this.set(0, 0, 0);
  }
}
