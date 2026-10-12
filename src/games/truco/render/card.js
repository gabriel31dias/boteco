import { Texture } from 'pixi.js';
import { RANKS, SUIT_CHAR } from '../engine/deck.js';

export const CARD_W = 132;
export const CARD_H = 190;
const PAD = 18;                                   // folga para a sombra assada na textura
export const FULL_W = CARD_W + PAD * 2;
export const FULL_H = CARD_H + PAD * 2;
const TEX = 2;                                    // supersampling da textura

const cache = new Map();
const RED = '#c8102e';
const BLACK = '#16212e';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Desenha `fn` com sombra projetada (assada na textura, sem sprite extra). */
function shadowed(g, fn) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.55)';
  g.shadowBlur = 14 * TEX;
  g.shadowOffsetY = 7 * TEX;
  fn();
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Frente da carta no estilo da arte do truco: papel creme envelhecido, número
 * grande no canto e o naipe enorme no meio. `manilha` acende uma moldura dourada.
 */
export function cardTexture(card, manilha = false) {
  const key = `${card.r}:${card.s}:${manilha ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);

  const w = CARD_W * TEX, h = CARD_H * TEX, r = 12 * TEX, o = PAD * TEX;
  const c = canvas(FULL_W * TEX, FULL_H * TEX);
  const g = c.getContext('2d');
  g.translate(o, o);
  const red = card.s === 0 || card.s === 2;
  const color = red ? RED : BLACK;

  const papel = g.createLinearGradient(0, 0, w * 0.4, h);
  papel.addColorStop(0, '#fbf5e6');
  papel.addColorStop(0.55, '#f1e6cc');
  papel.addColorStop(1, '#e3d2ad');
  shadowed(g, () => { roundRect(g, 0, 0, w, h, r); g.fillStyle = papel; g.fill(); });

  g.save();
  roundRect(g, 0, 0, w, h, r);
  g.clip();
  // manchas de papel velho nas bordas
  const borda = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  borda.addColorStop(0, 'rgba(120,80,30,0)');
  borda.addColorStop(1, 'rgba(120,80,30,.28)');
  g.fillStyle = borda;
  g.fillRect(0, 0, w, h);
  if (manilha) {
    const glow = g.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, 'rgba(255,205,80,.35)');
    glow.addColorStop(1, 'rgba(255,170,40,.12)');
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
  }
  g.restore();

  roundRect(g, 1.5 * TEX, 1.5 * TEX, w - 3 * TEX, h - 3 * TEX, r - 1.5 * TEX);
  g.lineWidth = manilha ? 5 * TEX : 1.5 * TEX;
  g.strokeStyle = manilha ? '#f0b429' : 'rgba(90,60,25,.35)';
  g.stroke();

  const rank = RANKS[card.r];
  const suit = SUIT_CHAR[card.s];
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const serif = 'Georgia, "Times New Roman", serif';
  g.font = `700 ${40 * TEX}px ${serif}`;
  g.fillText(rank, 25 * TEX, 30 * TEX);
  g.font = `${28 * TEX}px system-ui, "Segoe UI Symbol", sans-serif`;
  g.fillText(suit, 25 * TEX, 62 * TEX);

  g.font = `${92 * TEX}px system-ui, "Segoe UI Symbol", sans-serif`;
  g.fillText(suit, w * 0.58, h * 0.62);

  const tex = Texture.from(c);
  cache.set(key, tex);
  return tex;
}
