/**
 * Tween mínimo alimentado pelo ticker do Pixi. ponytail: 8 tipos de animação
 * não pagam os 30 KB do GSAP.
 */
const active = [];

export const Ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  elastic: (t) => (t === 0 || t === 1 ? t
    : 2 ** (-9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

const SETTERS = {
  x: (o, v) => (o.x = v),
  y: (o, v) => (o.y = v),
  rotation: (o, v) => (o.rotation = v),
  alpha: (o, v) => (o.alpha = v),
  scale: (o, v) => o.scale.set(v),
  scaleX: (o, v) => (o.scale.x = v),
  scaleY: (o, v) => (o.scale.y = v),
};
const GETTERS = {
  x: (o) => o.x, y: (o) => o.y, rotation: (o) => o.rotation, alpha: (o) => o.alpha,
  scale: (o) => o.scale.x, scaleX: (o) => o.scale.x, scaleY: (o) => o.scale.y,
};

/** Anima propriedades até `props`. Devolve Promise resolvida no fim. */
export function to(target, props, dur = 0.3, ease = Ease.out, opts = {}) {
  return new Promise((resolve) => {
    active.push({
      target, dur, ease, t: -(opts.delay || 0), resolve, onUpdate: opts.onUpdate,
      keys: Object.keys(props).map((k) => ({ k, from: GETTERS[k](target), to: props[k] })),
    });
  });
}

export const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

export function update(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const a = active[i];
    a.t += dt;
    if (a.t < 0) continue;
    const p = Math.min(1, a.t / a.dur);
    const e = a.ease(p);
    for (const k of a.keys) SETTERS[k.k](a.target, k.from + (k.to - k.from) * e);
    a.onUpdate?.(p);
    if (p >= 1) { active.splice(i, 1); a.resolve(); }
  }
}

/** Cancela tudo (troca de mão / reinício). */
export function clear() {
  while (active.length) active.pop().resolve();
}
