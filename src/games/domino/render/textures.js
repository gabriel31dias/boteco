/**
 * Gera TODA a arte do jogo em canvas, no boot. Nenhum asset binário:
 * as peças, os versos, as sombras e a mesa saem daqui já no tema atual.
 */

export const TILE_L = 240;   // lado comprido da peça (px de textura)
export const TILE_W = 120;   // lado curto
const R = 18;                // raio dos cantos
export const SHADOW_PAD = 44;

const mk = (scene, key, w, h) => {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  return { tex, ctx: tex.getContext() };
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/** Ruído em tile 128px, reaproveitado como pattern (barato). */
function noiseCanvas(alpha = 0.06, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 255 * alpha;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- peças

function drawBody(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, t.top);
  g.addColorStop(0.42, t.mid);
  g.addColorStop(1, t.bot);
  ctx.fillStyle = g;
  rr(ctx, 0.5, 0.5, w - 1, h - 1, R);
  ctx.fill();

  // bisel: luz em cima, sombra embaixo — dá espessura sem sair do 2D
  ctx.save();
  rr(ctx, 0.5, 0.5, w - 1, h - 1, R);
  ctx.clip();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  rr(ctx, 2, 2.5, w - 4, h - 4, R - 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,70,40,0.30)';
  rr(ctx, 2, 0.5, w - 4, h - 4, R - 1);
  ctx.stroke();
  // oclusão de ambiente nas quinas
  const vg = ctx.createLinearGradient(0, h * 0.55, 0, h);
  vg.addColorStop(0, 'rgba(120,95,55,0)');
  vg.addColorStop(1, 'rgba(120,95,55,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // contorno
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = t.edge;
  ctx.globalAlpha = 0.55;
  rr(ctx, 0.75, 0.75, w - 1.5, h - 1.5, R);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGroove(ctx, w, h, t, vertical) {
  ctx.save();
  rr(ctx, 0.5, 0.5, w - 1, h - 1, R);
  ctx.clip();
  const inset = 14;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(120,100,65,0.35)';
  ctx.beginPath();
  if (vertical) { ctx.moveTo(inset, h / 2); ctx.lineTo(w - inset, h / 2); }
  else { ctx.moveTo(w / 2, inset); ctx.lineTo(w / 2, h - inset); }
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  if (vertical) { ctx.moveTo(inset, h / 2 + 1.8); ctx.lineTo(w - inset, h / 2 + 1.8); }
  else { ctx.moveTo(w / 2 + 1.8, inset); ctx.lineTo(w / 2 + 1.8, h - inset); }
  ctx.stroke();
  ctx.restore();
}

function drawIvoryGrain(ctx, w, h, noise) {
  ctx.save();
  rr(ctx, 0.5, 0.5, w - 1, h - 1, R);
  ctx.clip();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(noise, 0, 0, w, h);
  ctx.globalAlpha = 1;
  // brilho especular bem discreto no topo
  const s = ctx.createLinearGradient(0, 0, w * 0.6, h);
  s.addColorStop(0, 'rgba(255,255,255,0.35)');
  s.addColorStop(0.35, 'rgba(255,255,255,0.04)');
  s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function tileTexture(scene, key, w, h, t, noise) {
  const { tex, ctx } = mk(scene, key, w, h);
  drawBody(ctx, w, h, t);
  drawIvoryGrain(ctx, w, h, noise);
  drawGroove(ctx, w, h, t, h > w);
  tex.refresh();
}

const PIPS = {
  0: [],
  1: [[0, 0]],
  2: [[-30, -30], [30, 30]],
  3: [[-30, -30], [0, 0], [30, 30]],
  4: [[-30, -30], [30, -30], [-30, 30], [30, 30]],
  5: [[-30, -30], [30, -30], [0, 0], [-30, 30], [30, 30]],
  6: [[-30, -32], [30, -32], [-30, 0], [30, 0], [-30, 32], [30, 32]],
};

function pipTexture(scene, n, t) {
  const S = TILE_W;
  const { tex, ctx } = mk(scene, `pip-${n}`, S, S);
  const r = 11;
  for (const [px, py] of PIPS[n]) {
    const x = S / 2 + px, y = S / 2 + py;
    // furo: sombra interna projetada para baixo-direita
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(x, y + 1.4, r + 0.6, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.15, x, y, r);
    g.addColorStop(0, t.pip[0]);
    g.addColorStop(1, t.pip[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.38, r * 0.30, 0, 7); ctx.fill();
  }
  tex.refresh();
}

function backTexture(scene, key, w, h, t) {
  const { tex, ctx } = mk(scene, key, w, h);
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, t.back[0]);
  g.addColorStop(1, t.back[1]);
  ctx.fillStyle = g;
  rr(ctx, 0.5, 0.5, w - 1, h - 1, R);
  ctx.fill();

  ctx.save();
  rr(ctx, 0.5, 0.5, w - 1, h - 1, R);
  ctx.clip();
  // trama geométrica dourada
  ctx.strokeStyle = t.backGold;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1.2;
  for (let i = -h; i < w + h; i += 13) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const s = ctx.createLinearGradient(0, 0, w * 0.5, h);
  s.addColorStop(0, 'rgba(255,255,255,0.16)');
  s.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // moldura + losango central
  ctx.strokeStyle = t.backGold;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2;
  rr(ctx, 9, 9, w - 18, h - 18, R - 7);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 4);
  const d = Math.min(w, h) * 0.17;
  ctx.strokeRect(-d / 2, -d / 2, d, d);
  ctx.fillStyle = t.backGold;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-d / 4, -d / 4, d / 2, d / 2);
  tex.refresh();
}

function shadowTexture(scene, key, w, h) {
  const pad = SHADOW_PAD;
  const { tex, ctx } = mk(scene, key, w + pad * 2, h + pad * 2);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = w + pad * 2;
  ctx.fillStyle = '#000';
  rr(ctx, pad - (w + pad * 2), pad, w, h, R);
  ctx.fill();
  ctx.restore();
  tex.refresh();
}

// ---------------------------------------------------------------- mesa

/** Fundo completo (madeira + feltro + vinheta) no tamanho exato da tela. */
export function buildTable(scene, key, w, h, t) {
  const { tex, ctx } = mk(scene, key, w, h);
  const frame = Math.max(14, Math.min(w, h) * 0.055);

  // madeira polida
  const wood = ctx.createLinearGradient(0, 0, w * 0.3, h);
  wood.addColorStop(0, t.woodStops[0]);
  wood.addColorStop(0.5, t.woodStops[1]);
  wood.addColorStop(1, t.woodStops[2]);
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let i = 0; i < h; i += 5) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.bezierCurveTo(w * 0.3, i + Math.sin(i * 0.11) * 5, w * 0.7, i - Math.sin(i * 0.07) * 6, w, i + Math.cos(i * 0.09) * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const sheen = ctx.createLinearGradient(0, 0, w, h * 0.6);
  sheen.addColorStop(0, 'rgba(255,225,180,0.16)');
  sheen.addColorStop(0.45, 'rgba(255,225,180,0.02)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  // feltro
  const fr = Math.min(w, h) * 0.06;
  ctx.save();
  rr(ctx, frame, frame, w - frame * 2, h - frame * 2, fr);
  ctx.clip();
  const felt = ctx.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.05, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  felt.addColorStop(0, t.felt[0]);
  felt.addColorStop(0.55, t.felt[1]);
  felt.addColorStop(1, t.felt[2]);
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, w, h);
  const nz = ctx.createPattern(noiseCanvas(t.feltNoise), 'repeat');
  ctx.fillStyle = nz;
  ctx.fillRect(0, 0, w, h);
  // sombra do aro sobre o pano
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 26;
  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  rr(ctx, frame - 9, frame - 9, w - (frame - 9) * 2, h - (frame - 9) * 2, fr + 8);
  ctx.stroke();
  ctx.restore();

  // filete dourado
  ctx.strokeStyle = t.goldCss;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  rr(ctx, frame - 3, frame - 3, w - (frame - 3) * 2, h - (frame - 3) * 2, fr + 3);
  ctx.stroke();
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  rr(ctx, frame - 7, frame - 7, w - (frame - 7) * 2, h - (frame - 7) * 2, fr + 6);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // vinheta cinematográfica
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return { frame };
}

/** Disco luminoso reutilizado em brilhos, partículas e destaques. */
function glowTexture(scene) {
  const S = 128;
  const { tex, ctx } = mk(scene, 'glow', S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.refresh();
}

export function buildPieceTextures(scene, t) {
  const noise = noiseCanvas(0.035);
  tileTexture(scene, 'tile-h', TILE_L, TILE_W, t.tile, noise);
  tileTexture(scene, 'tile-v', TILE_W, TILE_L, t.tile, noise);
  backTexture(scene, 'back-h', TILE_L, TILE_W, t);
  backTexture(scene, 'back-v', TILE_W, TILE_L, t);
  shadowTexture(scene, 'shadow-h', TILE_L, TILE_W);
  shadowTexture(scene, 'shadow-v', TILE_W, TILE_L);
  for (let n = 0; n <= 6; n++) pipTexture(scene, n, t);
  glowTexture(scene);
}
