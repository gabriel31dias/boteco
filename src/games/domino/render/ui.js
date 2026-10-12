import Phaser from 'phaser';
import { theme } from './theme.js';
import { audio } from '../audio/audio.js';

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  draw(tex.getContext(), Math.ceil(w), Math.ceil(h));
  tex.refresh();
  return key;
}

export function buttonTexture(scene, key, w, h, primary) {
  return canvasTex(scene, key, w, h, (ctx) => {
    const r = h / 2;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (primary) {
      g.addColorStop(0, '#F0D68C'); g.addColorStop(0.5, theme.goldCss); g.addColorStop(1, '#9C7A2E');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    }
    ctx.fillStyle = g;
    rr(ctx, 1, 1, w - 2, h - 2, r);
    ctx.fill();
    ctx.lineWidth = primary ? 1.5 : 1.2;
    ctx.strokeStyle = primary ? 'rgba(255,240,200,0.85)' : 'rgba(212,175,87,0.55)';
    rr(ctx, 1, 1, w - 2, h - 2, r);
    ctx.stroke();
    if (primary) {
      const s = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      s.addColorStop(0, 'rgba(255,255,255,0.55)');
      s.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = s;
      rr(ctx, 4, 3, w - 8, h * 0.5, r);
      ctx.fill();
    }
  });
}

export function panelTexture(scene, key, w, h) {
  return canvasTex(scene, key, w, h, (ctx) => {
    const r = Math.min(28, h * 0.12);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(20,44,35,0.97)');
    g.addColorStop(1, 'rgba(6,18,14,0.98)');
    ctx.fillStyle = g;
    rr(ctx, 8, 8, w - 16, h - 16, r); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(212,175,87,0.55)'; ctx.lineWidth = 1.5;
    rr(ctx, 8, 8, w - 16, h - 16, r); ctx.stroke();
    ctx.strokeStyle = 'rgba(212,175,87,0.16)'; ctx.lineWidth = 1;
    rr(ctx, 14, 14, w - 28, h - 28, r - 5); ctx.stroke();
  });
}

let btnId = 0;
/** Botão com alvo de toque generoso (mín. 48px) e feedback de escala. */
export function makeButton(scene, x, y, w, h, label, onClick, opt = {}) {
  const key = `btn-${btnId++}-${Math.round(w)}x${Math.round(h)}-${opt.primary ? 'p' : 's'}`;
  buttonTexture(scene, key, w, h, opt.primary);
  const c = scene.add.container(x, y);
  const bg = scene.add.image(0, 0, key);
  const txt = scene.add.text(0, 0, label, {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSize: `${opt.fontSize || Math.round(h * 0.36)}px`,
    fontStyle: '700',
    color: opt.primary ? '#231603' : theme.text,
  }).setOrigin(0.5);
  txt.setLetterSpacing?.(2);
  c.add([bg, txt]);
  c.setSize(w, Math.max(h, 48));
  c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -Math.max(h, 48) / 2, w, Math.max(h, 48)), Phaser.Geom.Rectangle.Contains);
  c.label = txt;
  c.bg = bg;
  c.on('pointerdown', () => scene.tweens.add({ targets: c, scale: 0.955, duration: 70 }));
  c.on('pointerup', () => {
    scene.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.out' });
    audio.unlock(); audio.play('ui');
    onClick?.();
  });
  c.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 160 }));
  return c;
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';

export function caps(scene, x, y, text, size, color, alpha = 1) {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT, fontSize: `${size}px`, fontStyle: '600', color: color || theme.text,
  }).setOrigin(0.5).setAlpha(alpha);
  t.setLetterSpacing?.(Math.max(1, size * 0.12));
  return t;
}
