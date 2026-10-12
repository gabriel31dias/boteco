import Phaser from 'phaser';
// Shared drawing helpers. Every visual asset in the game is generated here at runtime.

export const FONT = '"Outfit", "Segoe UI", system-ui, sans-serif';
export const css = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');

function radialTexture(scene, key, size, stops) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, a] of stops) g.addColorStop(p, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}

function noiseTexture(scene, key, size) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 190 + Math.random() * 65;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 46;
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
}

// White so it can be tinted; the depth is all in the alpha steps.
function coinTexture(scene, key, size) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(r, r, r * 0.94, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.beginPath(); ctx.arc(r, r, r * 0.84, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.ellipse(r * 0.70, r * 0.64, r * 0.16, r * 0.30, -0.6, 0, Math.PI * 2); ctx.fill();
  canvas.refresh();
}

/** Idempotent — safe to call from every scene's create(). */
export function ensureTextures(scene) {
  radialTexture(scene, 'dot', 64, [[0, 1], [0.28, 0.62], [1, 0]]);
  radialTexture(scene, 'blob', 256, [[0, 0.95], [0.42, 0.34], [1, 0]]);
  noiseTexture(scene, 'noise', 128);
  coinTexture(scene, 'coin', 48);
}

/** Vertical gradient, one texture per theme so switching never rebuilds. */
export function gradientTexture(scene, key, stops) {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, 8, 512);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [p, hex] of stops) g.addColorStop(p, css(hex));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 512);
  canvas.refresh();
  return key;
}

/**
 * Fake bloom: the same stroke three times, widest and faintest first.
 * Works identically on Canvas and WebGL and costs no render target.
 */
export function glowStroke(g, draw, color, width, alpha = 1) {
  // Keep the halo narrow: a stroke wider than the shape's own radius folds back
  // over itself and reads as a dark, moire-ish blob instead of a glow.
  g.lineStyle(width * 2.2, color, alpha * 0.08); draw(g);
  g.lineStyle(width * 1.5, color, alpha * 0.18); draw(g);
  g.lineStyle(width, color, alpha); draw(g);
}

/** Round line caps — Phaser's Graphics has none, so we stamp a glowing dot. */
export function glowDot(g, x, y, r, color, alpha = 1) {
  g.fillStyle(color, alpha * 0.09); g.fillCircle(x, y, r * 3);
  g.fillStyle(color, alpha * 0.18); g.fillCircle(x, y, r * 1.7);
  g.fillStyle(color, alpha); g.fillCircle(x, y, r);
}

// Phaser sizes a Text's canvas to the glyph bounds, so shadow blur and letter
// spacing get clipped. Padding buys them room; textWidth() reads through it.
function applyPad(t) {
  const p = Math.ceil((t.glowBlur || 0) * 0.9 + Math.abs(t.spacingPx || 0) + 3);
  t.setPadding(p, p, p, p);
}

export const textWidth = (t) => t.width - t.padding.left - t.padding.right;

export function text(scene, x, y, str, size, color, weight = 500, spacing = 0) {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${Math.round(size)}px`,
    fontStyle: String(weight),
    color: css(color),
  }).setOrigin(0.5);
  t.spacingPx = spacing;
  t.glowBlur = 0;
  if (spacing && t.setLetterSpacing) t.setLetterSpacing(spacing);
  applyPad(t);
  return t;
}

/** Canvas shadow blur = a real, cheap glow for text. */
export function glowText(t, color, blur = 16) {
  t.glowBlur = blur;
  t.setShadow(0, 0, css(color), blur, false, true);
  applyPad(t);
  return t;
}

export function setEmitterTint(emitter, color) {
  if (emitter.setParticleTint) emitter.setParticleTint(color);
  else emitter.particleTint = color;
}

/**
 * Menu / HUD button. Geometry is owned by the caller via setGeom(w, h) so a
 * scene's layout() can re-fit every button on resize.
 * Returns a Container with .setGeom(), .setValue(), .repaint(pal).
 */
export function makeButton(scene, opts) {
  const { label, value = null, primary = false, onClick } = opts;
  let w = 100, h = 40, pal = null, hovered = false, pressed = false;

  const bg = scene.add.graphics();
  const labelText = text(scene, 0, 0, label, 20, 0xffffff, primary ? 700 : 500, primary ? 5 : 2);
  const valueText = value === null ? null : text(scene, 0, 0, value, 18, 0xffffff, 700, 1);
  if (!primary && valueText) {
    labelText.setOrigin(0, 0.5);
    valueText.setOrigin(1, 0.5);
  }

  const c = scene.add.container(0, 0, valueText ? [bg, labelText, valueText] : [bg, labelText]);
  // ponytail: a sibling Zone does the hit testing — Phaser 3.80 does not hit-test
  // a top-level Container with a custom hit area. The container stays purely visual.
  const hit = scene.add.zone(0, 0, 100, 40).setInteractive({ useHandCursor: true });

  function paint() {
    if (!pal) return;
    const lift = hovered ? 1 : 0;
    const r = h / 2;
    bg.clear();
    bg.fillStyle(0x000000, 0.30);
    bg.fillRoundedRect(-w / 2, -h / 2 + h * 0.11, w, h, r);
    bg.fillStyle(primary ? pal.accent : pal.panel, primary ? 0.15 + lift * 0.10 : 0.32 + lift * 0.16);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    const rimA = (primary ? 0.55 : 0.26) + lift * 0.25;
    bg.lineStyle(Math.max(1, h * 0.11), pal.accent, rimA * 0.13);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(Math.max(1, h * 0.03), pal.accent, rimA);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    labelText.setColor(css(primary ? pal.text : pal.dim));
    glowText(labelText, pal.accent, primary ? 24 : 0);
    if (valueText) { valueText.setColor(css(pal.accent)); glowText(valueText, pal.accent, 12); }
  }

  const move = c.setPosition.bind(c);
  c.setPosition = (x, y) => { move(x, y); hit.setPosition(x, y); return c; };

  c.setGeom = (nw, nh) => {
    w = nw; h = nh;
    c.setSize(w, h);
    hit.setSize(w, h);
    hit.input.hitArea.setTo(0, 0, w, h);
    const pad = h * 0.44;
    labelText.setFontSize(Math.round(primary ? h * 0.40 : h * 0.30));
    labelText.setPosition(valueText ? -w / 2 + pad : 0, 0);
    if (valueText) {
      valueText.setFontSize(Math.round(h * 0.29));
      valueText.setPosition(w / 2 - pad, 0);
    }
    paint();
    return c;
  };
  c.setValue = (v) => { valueText?.setText(v); return c; };
  c.setLabel = (v) => { labelText.setText(v); return c; };
  c.repaint = (p) => { pal = p; paint(); return c; };
  c.setEnabled = (on) => {
    if (on) hit.setInteractive(); else hit.disableInteractive();
    c.setAlpha(on ? 1 : 0.4);
    return c;
  };

  const scaleTo = (s, ms, ease) => scene.tweens.add({ targets: c, scale: s, duration: ms, ease });

  hit.on('pointerover', (p) => {
    if (p.wasTouch) return;
    hovered = true; paint();
    scaleTo(1.04, 180, 'Sine.easeOut');
    scene.events.emit('sfx', 'hover');
  });
  hit.on('pointerout', () => {
    hovered = false; pressed = false; paint();
    scaleTo(1, 220, 'Sine.easeOut');
  });
  hit.on('pointerdown', () => {
    pressed = true;
    scaleTo(0.96, 90, 'Sine.easeOut');
    scene.events.emit('sfx', 'button');
  });
  hit.on('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    scaleTo(hovered ? 1.04 : 1, 260, 'Back.easeOut');
    onClick?.();
  });

  return c;
}
