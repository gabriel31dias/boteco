// The mascot: a little X-shaped guy, drawn at runtime like everything else here.
// One tween drives a phase 0..1 and the whole pose is a function of it, so the
// dance lives in draw() instead of in a pile of tweens per limb.
import { glowDot } from './fx.js';

const TAU = Math.PI * 2;

export function makeMascot(scene, pal) {
  const shadow = scene.add.graphics();
  const g = scene.add.graphics();
  const c = scene.add.container(0, 0, [shadow, g]);
  const m = { c, g, shadow, s: 20, pal, t: 0, mood: 'dance' };

  m.repaint = () => draw(m);
  m.setSize = (s) => { m.s = s; m.repaint(); return m; };
  m.setPalette = (p) => { m.pal = p; m.repaint(); return m; };
  m.setMood = (mood) => { m.mood = mood; m.repaint(); return m; };

  m.beat = scene.tweens.add({
    targets: m, t: 1, duration: 1500, repeat: -1, ease: 'Linear',
    onUpdate: m.repaint,
  });
  m.repaint();
  return m;
}

// limb tips, clockwise from top-left: two arms then two legs
const LIMBS = [
  [-2.36, 'arm'], [-0.79, 'arm'],
  [2.36, 'leg'], [0.79, 'leg'],
];

function draw(m) {
  const { g, shadow, s, pal } = m;
  const sad = m.mood === 'sad';
  const cheer = m.mood === 'cheer';
  const ph = m.t * TAU;

  // |sin| gives two hops per cycle; tilt swaps sign between them
  const hop = sad ? 0 : Math.abs(Math.sin(ph)) ** 0.7;
  const tilt = sad ? 0 : Math.sin(ph) * 0.16;
  const lift = hop * s * (cheer ? 0.44 : 0.26);
  const squash = sad ? -0.06 : (hop - 0.5) * 0.18;

  g.setPosition(0, -lift).setRotation(tilt).setScale(1 - squash, 1 + squash);

  // shadow shrinks as he leaves the ground — the only cue that says "airborne"
  shadow.clear();
  const sh = 1 - hop * 0.35;
  shadow.fillStyle(0x000000, 0.26 * sh);
  shadow.fillEllipse(0, s * 0.94, s * 1.5 * sh, s * 0.34 * sh);

  g.clear();
  const w = Math.max(2, s * 0.20);

  LIMBS.forEach(([base, kind], i) => {
    let a = base;
    if (!sad) {
      const swing = Math.sin(ph + (i % 2 ? Math.PI : 0)) * (kind === 'arm' ? 0.38 : 0.16);
      a += kind === 'arm' && cheer ? swing * 0.4 + 0.5 * (i ? -1 : 1) : swing;
    } else if (kind === 'arm') {
      a += (i ? -0.55 : 0.55);   // arms droop to his sides
    }
    const len = s * (kind === 'arm' ? 1.06 : 0.96);
    const x = Math.cos(a) * len;
    const y = Math.sin(a) * len;
    g.lineStyle(w * 2.0, pal.x, 0.10); g.lineBetween(0, 0, x, y);
    g.lineStyle(w, pal.x, 1); g.lineBetween(0, 0, x, y);
    glowDot(g, x, y, w * 0.5, pal.x, 1);
  });

  // face plate, so the X reads as a body and not just a symbol
  g.fillStyle(pal.panel, 0.98); g.fillCircle(0, 0, s * 0.44);
  g.lineStyle(Math.max(1, s * 0.05), pal.x, 0.75); g.strokeCircle(0, 0, s * 0.44);

  const blink = !sad && m.t % 0.5 > 0.47;   // a flick of the eyelids twice a cycle
  const ex = s * 0.20;
  const ey = -s * 0.07;
  const er = s * 0.10;
  if (blink) {
    g.lineStyle(Math.max(1, s * 0.06), pal.text, 0.9);
    g.lineBetween(-ex - er, ey, -ex + er, ey);
    g.lineBetween(ex - er, ey, ex + er, ey);
  } else {
    g.fillStyle(pal.text, 0.95);
    g.fillCircle(-ex, ey, er);
    g.fillCircle(ex, ey, er);
    // pupils track the sway, which is what sells it as looking around
    const px = sad ? 0 : Math.sin(ph) * er * 0.35;
    g.fillStyle(pal.panel, 1);
    g.fillCircle(-ex + px, ey + er * 0.15, er * 0.45);
    g.fillCircle(ex + px, ey + er * 0.15, er * 0.45);
  }

  // mouth: a smile that flips over when he is sad
  const mw = s * 0.20;
  const my = s * 0.20;
  g.lineStyle(Math.max(1, s * 0.07), pal.text, 0.9);
  g.beginPath();
  if (sad) g.arc(0, my + mw * 0.8, mw, -Math.PI * 0.85, -Math.PI * 0.15);
  else g.arc(0, my - mw * 0.3, mw * (cheer ? 1.25 : 1), Math.PI * 0.15, Math.PI * 0.85);
  g.strokePath();
}
