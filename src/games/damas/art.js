// Geracao procedural de todas as texturas. Nenhum asset binario no projeto.
// Tudo e desenhado uma vez em canvas offscreen e vira textura de GPU.

// --- ruido -------------------------------------------------------------
function hash2(x, y, s) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1274126177;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, s, oct = 5) {
  let a = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { a += vnoise(x * f, y * f, s + i * 71) * amp; f *= 2; amp *= 0.5; }
  return a;
}

// --- util ---------------------------------------------------------------
export function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function css(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function hexShade(hex, t) {
  const c = mix(rgb(hex), t > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(t));
  return '#' + c.map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}
export function shade(hex, t) {
  const c = rgb(hex);
  const target = t > 0 ? [255, 255, 255] : [0, 0, 0];
  return css(mix(c, target, Math.abs(t)));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- materiais ----------------------------------------------------------
// Gera uma laje do material. Usada como fonte para recortar cada casa.
function slab(spec, kind, size, seed) {
  const c = cv(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const base = rgb(spec[0]), hi = rgb(spec[1]), lo = rgb(spec[2]);
  const vein = rgb(kind === 'wood' ? spec[1] : spec[3] || spec[1]);
  const S = size / 64;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / S, v = y / S;
      let col;
      if (kind === 'marble') {
        const w = fbm(u * 0.55, v * 0.55, seed, 5);
        const t = Math.abs(Math.sin((u * 0.14 + v * 0.05 + w * 3.4) * Math.PI));
        const veinAmt = Math.pow(1 - t, 9);
        const mottle = fbm(u * 1.9, v * 1.9, seed + 300, 4);
        col = mix(base, mottle > 0.5 ? hi : lo, Math.abs(mottle - 0.5) * 1.3);
        col = mix(col, vein, veinAmt * 0.75);
        const grit = hash2(x, y, seed) - 0.5;
        col = [col[0] + grit * 9, col[1] + grit * 9, col[2] + grit * 9];
      } else if (kind === 'wood') {
        const warp = fbm(u * 0.35, v * 0.9, seed, 4) * 5.5;
        const ring = Math.sin((v * 0.9 + warp) * 2.4);
        const t = 0.5 + 0.5 * ring;
        col = mix(lo, hi, Math.pow(t, 1.6));
        col = mix(col, base, 0.42);
        const fiber = vnoise(u * 26, v * 0.9, seed + 90) - 0.5;   // fibra fina no sentido do veio
        col = [col[0] + fiber * 15, col[1] + fiber * 12, col[2] + fiber * 8];
        const grit = hash2(x, y, seed + 5) - 0.5;
        col = [col[0] + grit * 7, col[1] + grit * 7, col[2] + grit * 7];
      } else { // stone / pedra polida
        const m = fbm(u * 1.15, v * 1.15, seed, 6);
        col = mix(lo, hi, m);
        col = mix(col, base, 0.5);
        const spec2 = Math.pow(fbm(u * 5.5, v * 5.5, seed + 40, 3), 4);
        col = mix(col, [255, 255, 255], spec2 * 0.16);
        const grit = hash2(x, y, seed + 9) - 0.5;
        col = [col[0] + grit * 6, col[1] + grit * 6, col[2] + grit * 6];
      }
      const i = (y * size + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Gradiente metalico anisotropico para a moldura.
function metalGrad(ctx, x0, y0, x1, y1, f) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0.00, f.b);
  g.addColorStop(0.12, f.a);
  g.addColorStop(0.26, f.c);
  g.addColorStop(0.34, f.a);
  g.addColorStop(0.52, f.b);
  g.addColorStop(0.68, f.a);
  g.addColorStop(0.80, f.c);
  g.addColorStop(0.90, f.a);
  g.addColorStop(1.00, f.b);
  return g;
}

// --- tabuleiro (plano, antes da perspectiva) -----------------------------
export const FRAME_FRAC = 0.052;

export function boardFlat(theme, N, PX) {
  const c = cv(PX, PX), ctx = c.getContext('2d');
  const fw = PX * FRAME_FRAC, inner = PX - fw * 2, cell = inner / N;
  const B = theme.board, F = theme.frame;

  // moldura
  ctx.fillStyle = metalGrad(ctx, 0, 0, PX, PX, F);
  roundRect(ctx, 0, 0, PX, PX, fw * 0.55); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 240; i++) {           // escovado do metal
    const yy = Math.random() * PX;
    ctx.strokeStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.03})`;
    ctx.lineWidth = 0.6 + Math.random();
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(PX, yy + (Math.random() - 0.5) * 6); ctx.stroke();
  }
  ctx.restore();
  // chanfro externo
  ctx.lineWidth = Math.max(2, PX * 0.004);
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  roundRect(ctx, 1.5, 1.5, PX - 3, PX - 3, fw * 0.55); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 4, 4, PX - 8, PX - 8, fw * 0.5); ctx.stroke();
  // filete de embutido
  ctx.strokeStyle = F.inlay; ctx.lineWidth = Math.max(1.5, PX * 0.0035);
  ctx.strokeRect(fw * 0.42, fw * 0.42, PX - fw * 0.84, PX - fw * 0.84);

  // casas
  const light = slab(B.light.concat([B.vein]), B.mat, 320, 11);
  const dark = slab(B.dark.concat([B.veinDark]), B.mat, 320, 47);
  for (let r = 0; r < N; r++) {
    for (let cc = 0; cc < N; cc++) {
      const x = fw + cc * cell, y = fw + r * cell;
      const src = ((r + cc) & 1) ? dark : light;
      const ox = ((r * 7 + cc * 13) % 5) * 24, oy = ((r * 11 + cc * 5) % 5) * 24;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, cell + 0.6, cell + 0.6); ctx.clip();
      ctx.drawImage(src, ox, oy, 200, 200, x, y, cell + 0.6, cell + 0.6);
      // bisel da casa: topo claro, base escura
      const bg = ctx.createLinearGradient(x, y, x, y + cell);
      bg.addColorStop(0, 'rgba(255,255,255,0.10)');
      bg.addColorStop(0.32, 'rgba(255,255,255,0.015)');
      bg.addColorStop(1, 'rgba(0,0,0,0.20)');
      ctx.fillStyle = bg; ctx.fillRect(x, y, cell, cell);
      ctx.restore();
      // oclusao nas juntas
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

  // imperfeicoes: micro-riscos e pequenos pontos
  ctx.save(); ctx.beginPath(); ctx.rect(fw, fw, inner, inner); ctx.clip();
  for (let i = 0; i < 90; i++) {
    const x = fw + Math.random() * inner, y = fw + Math.random() * inner;
    const len = 6 + Math.random() * 46, ang = Math.random() * Math.PI;
    ctx.strokeStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.035})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.09})`;
    ctx.beginPath();
    ctx.arc(fw + Math.random() * inner, fw + Math.random() * inner, 0.6 + Math.random() * 1.6, 0, 7);
    ctx.fill();
  }
  // varredura especular vinda da lateral iluminada
  const sp = ctx.createLinearGradient(fw, fw, fw + inner * 1.1, fw + inner * 0.7);
  sp.addColorStop(0, 'rgba(255,240,215,0.11)');
  sp.addColorStop(0.42, 'rgba(255,240,215,0.03)');
  sp.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sp; ctx.fillRect(fw, fw, inner, inner);
  // sombra interna projetada pela moldura
  const edge = cell * 0.55;
  const sides = [
    [fw, fw, inner, edge, 0, 1], [fw, fw + inner - edge, inner, edge, 0, -1],
    [fw, fw, edge, inner, 1, 0], [fw + inner - edge, fw, edge, inner, -1, 0],
  ];
  for (const [x, y, w, h, dx, dy] of sides) {
    const g2 = ctx.createLinearGradient(
      dx ? (dx > 0 ? x : x + w) : x, dy ? (dy > 0 ? y : y + h) : y,
      dx ? (dx > 0 ? x + w : x) : x, dy ? (dy > 0 ? y + h : y) : y);
    g2.addColorStop(0, 'rgba(0,0,0,0.42)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  return c;
}

// --- perspectiva --------------------------------------------------------
// Medidas nas artes de referência (topo da moldura / base, altura / base).
// Deitado a câmera é mais baixa: a mesa fica larga e achatada, logo acima dela.
export const PERSP_PE = { q: 0.27, topScale: 0.786, vs: 0.676 };
export const PERSP_DEITADO = { q: 0.38, topScale: 0.724, vs: 0.44 };
export const PERSP = { ...PERSP_PE };        // a vigente; a cena troca ao girar a tela

// Mapeia v do tabuleiro [0..1] para t na tela [0..1].
export function toScreenV(v) { return v / (1 + PERSP.q * (1 - v)); }
export function widthAt(t) { return PERSP.topScale + (1 - PERSP.topScale) * t; }

export function warp(src, destW) {
  const destH = Math.round(destW * PERSP.vs);
  const c = cv(destW, destH), ctx = c.getContext('2d');
  const sw = src.width, sh = src.height, q = PERSP.q;
  for (let y = 0; y < destH; y++) {
    const t = y / (destH - 1);
    const sv = t * (1 + q) / (1 + q * t);
    const w = destW * widthAt(t);
    ctx.drawImage(src, 0, sv * (sh - 1), sw, 1.2, (destW - w) / 2, y, w, 1.15);
  }
  return c;
}

// --- pecas --------------------------------------------------------------
// Cilindro visto do mesmo angulo do tabuleiro. PY = achatamento da elipse.
const PY = 0.56;

export function pieceCanvas(theme, side, king, S) {
  const P = side === 1 ? theme.player : theme.cpu;
  // pecas escuras precisam de mais luz especular, senao viram discos chapados
  const lum = (h) => { const c = rgb(h); return (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255; };
  const dark = lum(P.body) < 0.35;
  const K = dark ? 1 : 0;
  const c = cv(S, S * 0.92), ctx = c.getContext('2d');
  const cx = S / 2, rx = S * 0.395, ry = rx * PY;
  const th = rx * (king ? 0.46 : 0.28);
  const botY = S * 0.60, topY = botY - th;

  // corpo (parede lateral + tampa) como silhueta unica
  ctx.beginPath();
  ctx.ellipse(cx, botY, rx, ry, 0, 0, Math.PI * 2);
  ctx.rect(cx - rx, topY, rx * 2, th);
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  const wall = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  wall.addColorStop(0.00, shade(P.edge, -0.55 + K * 0.25));
  wall.addColorStop(0.10, shade(P.edge, -0.18 + K * 0.30));
  wall.addColorStop(0.26, shade(P.body, 0.12 + K * 0.42));
  wall.addColorStop(0.48, shade(P.edge, K * 0.10));
  wall.addColorStop(0.74, shade(P.edge, -0.34 + K * 0.14));
  wall.addColorStop(0.92, shade(P.rim, -0.25 + K * 0.25));
  wall.addColorStop(1.00, shade(P.edge, -0.62 + K * 0.22));
  ctx.fillStyle = wall; ctx.fill();

  // escurecimento vertical da parede (contato com o tabuleiro)
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - rx, topY, rx * 2, th + ry); ctx.clip();
  const vg = ctx.createLinearGradient(0, topY, 0, botY + ry);
  vg.addColorStop(0, 'rgba(255,255,255,0.06)');
  vg.addColorStop(0.55, 'rgba(0,0,0,0.10)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(cx - rx, topY, rx * 2, th + ry);
  ctx.restore();

  // tampa
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
  const top = ctx.createRadialGradient(cx - rx * 0.34, topY - ry * 0.42, rx * 0.04, cx, topY, rx * 1.28);
  top.addColorStop(0, shade(P.top, 0.20 + K * 0.42));
  top.addColorStop(0.45, shade(P.top, K * 0.16));
  top.addColorStop(0.82, shade(P.body, K * 0.04));
  top.addColorStop(1, shade(P.edge, -0.22 + K * 0.08));
  ctx.fillStyle = top; ctx.fillRect(cx - rx, topY - ry, rx * 2, ry * 2);

  // micro textura do material
  ctx.globalCompositeOperation = 'overlay';
  const tex = slab([P.body, P.top, P.edge, P.rim], theme.board.mat, 128, side === 1 ? 3 : 17);
  ctx.globalAlpha = 0.16;
  ctx.drawImage(tex, cx - rx, topY - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  const ring = (f, color, w, dy = 0, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.ellipse(cx, topY + dy, rx * f, ry * f, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  // serrilha na borda da tampa
  const notches = 56;
  for (let i = 0; i < notches; i++) {
    const a = (i / notches) * Math.PI * 2;
    const x0 = cx + Math.cos(a) * rx * 0.885, y0 = topY + Math.sin(a) * ry * 0.885;
    const x1 = cx + Math.cos(a) * rx * 0.985, y1 = topY + Math.sin(a) * ry * 0.985;
    const lit = Math.cos(a + 2.5) * 0.5 + 0.5;                 // luz vindo da esquerda-cima
    ctx.strokeStyle = i % 2 ? shade(P.groove, -0.1) : shade(P.rim, -0.15 + K * 0.25);
    ctx.globalAlpha = 0.18 + lit * (0.42 + K * 0.30);
    ctx.lineWidth = Math.max(1, S * 0.006);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // sulcos concentricos
  ring(0.995, shade(P.edge, -0.35 + K * 0.55), Math.max(1, S * 0.008), 0, 0.85);
  ring(0.86, P.groove, Math.max(1, S * 0.009), 0, 0.6);
  ring(0.855, shade(P.rim, -0.12), Math.max(1, S * 0.005), -S * 0.005, 0.45);
  ring(0.62, P.groove, Math.max(1, S * 0.007), 0, 0.42);

  // disco central rebaixado
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, topY, rx * 0.60, ry * 0.60, 0, 0, Math.PI * 2); ctx.clip();
  const inner = ctx.createRadialGradient(cx - rx * 0.2, topY - ry * 0.25, 1, cx, topY, rx * 0.7);
  inner.addColorStop(0, shade(P.body, 0.10));
  inner.addColorStop(1, shade(P.body, -0.20));
  ctx.fillStyle = inner; ctx.fillRect(cx - rx, topY - ry, rx * 2, ry * 2);
  ctx.restore();
  ring(0.60, shade(P.rim, -0.05), Math.max(1, S * 0.004), -S * 0.004, 0.35);

  if (king) {
    // segunda camada + coroa gravada
    ring(0.42, P.accent, Math.max(1.5, S * 0.012), 0, 0.9);
    ctx.save();
    ctx.translate(cx, topY);
    ctx.scale(1, PY);
    const cr = rx * 0.30;
    const crown = new Path2D();
    const pts = 5;
    crown.moveTo(-cr, cr * 0.55);
    for (let i = 0; i <= pts; i++) {
      const t = i / pts, x = -cr + t * cr * 2;
      crown.lineTo(x, cr * 0.55 - (i % 2 === 0 ? cr * 1.05 : cr * 0.35));
    }
    crown.lineTo(cr, cr * 0.55);
    crown.closePath();
    ctx.translate(0, cr * 0.1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.translate(0, 2); ctx.fill(crown); ctx.translate(0, -2);
    const cg = ctx.createLinearGradient(-cr, -cr, cr, cr);
    cg.addColorStop(0, shade(P.crown, 0.35));
    cg.addColorStop(0.45, P.crown);
    cg.addColorStop(0.7, shade(P.crown, -0.35));
    cg.addColorStop(1, shade(P.crown, 0.15));
    ctx.fillStyle = cg; ctx.fill(crown);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke(crown);
    ctx.restore();
  }

  // rim light no lado oposto a luz
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = P.rim; ctx.globalAlpha = 0.30 + K * 0.34;
  ctx.lineWidth = Math.max(1.2, S * 0.009) * (1 + K * 0.5);
  ctx.beginPath(); ctx.ellipse(cx, topY, rx * 0.97, ry * 0.97, 0, 0.35, 2.5); ctx.stroke();
  // especular principal
  ctx.globalAlpha = 1;
  const sg = ctx.createRadialGradient(cx - rx * 0.36, topY - ry * 0.40, 1, cx - rx * 0.36, topY - ry * 0.40, rx * 0.52);
  sg.addColorStop(0, `rgba(255,252,244,${0.42 + K * 0.22})`);
  sg.addColorStop(0.5, `rgba(255,250,238,${0.10 + K * 0.14})`);
  sg.addColorStop(1, 'rgba(255,250,238,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.ellipse(cx - rx * 0.34, topY - ry * 0.36, rx * 0.50, ry * 0.62, -0.4, 0, 7); ctx.fill();
  ctx.restore();

  return c;
}

// Sombra ampla e difusa que assenta o tabuleiro sobre a mesa.
export function contactCanvas(S) {
  const c = cv(S, S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.80)');
  g.addColorStop(0.42, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.68, 'rgba(0,0,0,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return c;
}

export function shadowCanvas(S) {
  const w = S * 1.5, h = S * 1.5 * PY * 1.15;
  const c = cv(w, h), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.42, 'rgba(0,0,0,0.40)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.13)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  return c;
}

let _grain = null;
function grain(size = 128) {
  if (_grain) return _grain;
  const c = cv(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 110 + (Math.random() - 0.5) * 90;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return (_grain = c);
}

// --- cenario ------------------------------------------------------------
export function bgCanvas(theme, W, H) {
  // Renderiza pequeno e deixa a GPU esticar: o fundo e desfocado por definicao.
  // Blur em resolucao cheia custa segundos; aqui custa milissegundos.
  const k = 480 / W;
  W = Math.round(W * k); H = Math.round(H * k);
  const c = cv(W, H), ctx = c.getContext('2d');
  const E = theme.env;
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, E.top); g.addColorStop(1, E.bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // luz quente lateral
  const lg = ctx.createRadialGradient(W * 0.14, H * 0.16, 4, W * 0.14, H * 0.16, W * 1.15);
  lg.addColorStop(0, css(rgb(E.glow), E.glowAlpha));
  lg.addColorStop(0.35, css(rgb(E.glow), E.glowAlpha * 0.30));
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);

  const horizon = H * 0.30;
  // parede ao fundo
  const wg = ctx.createLinearGradient(0, 0, 0, horizon + 20);
  wg.addColorStop(0, css(rgb(E.top), 0.95));
  wg.addColorStop(1, css(rgb(E.bottom), 0.15));
  ctx.fillStyle = wg; ctx.fillRect(0, 0, W, horizon + 20);

  // bokeh: objetos decorativos fora de foco
  const glowC = rgb(E.glow);
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * W, y = Math.random() * horizon * 1.4;
    const r = W * (0.03 + Math.random() * 0.10);
    const bg = ctx.createRadialGradient(x, y, 1, x, y, r);
    const a = 0.05 + Math.random() * 0.10;
    bg.addColorStop(0, css(glowC, a));
    bg.addColorStop(0.55, css(glowC, a * 0.30));
    bg.addColorStop(1, css(glowC, 0));
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // silhuetas de objetos sobre a mesa, ja suavizadas pelo gradiente
  for (let i = 0; i < 3; i++) {
    const x = [W * 0.09, W * 0.90, W * 0.73][i];
    const hh = H * (0.06 + Math.random() * 0.07), ww = hh * (0.38 + Math.random() * 0.35);
    const sg = ctx.createLinearGradient(x - ww / 2, 0, x + ww / 2, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0.10)');
    sg.addColorStop(0.25, 'rgba(0,0,0,0.44)');
    sg.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = sg;
    roundRect(ctx, x - ww / 2, horizon - hh, ww, hh + 8, ww * 0.32); ctx.fill();
    ctx.fillStyle = css(glowC, 0.09);
    roundRect(ctx, x - ww / 2, horizon - hh, ww * 0.26, hh, ww * 0.32); ctx.fill();
  }

  // mesa: madeira em perspectiva, escurecendo para as bordas
  const tg = ctx.createLinearGradient(0, horizon - H * 0.05, 0, H);
  tg.addColorStop(0, css(rgb(E.bottom), 0));
  tg.addColorStop(0.06, css(rgb(hexShade(E.table, -0.25)), 0.75));
  tg.addColorStop(0.16, hexShade(E.table, 0.08));
  tg.addColorStop(0.30, E.table);
  tg.addColorStop(1, hexShade(E.table, -0.58));
  ctx.fillStyle = tg; ctx.fillRect(0, horizon - H * 0.05, W, H - horizon + H * 0.05);
  const wood = slab([E.table, hexShade(E.table, 0.34), hexShade(E.table, -0.45), hexShade(E.glow, -0.30)], 'wood', 160, 77);
  ctx.save(); ctx.globalAlpha = 0.34;
  ctx.drawImage(wood, 0, horizon, W, H - horizon);
  ctx.restore();
  // brilho do verniz refletindo a luz
  const vg = ctx.createLinearGradient(0, horizon, W * 0.7, H);
  vg.addColorStop(0, css(glowC, 0.16));
  vg.addColorStop(0.4, css(glowC, 0.04));
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg; ctx.fillRect(0, horizon, W, H - horizon);
  // linha do horizonte
  const hh2 = Math.max(6, H * 0.03);
  const hg = ctx.createLinearGradient(0, horizon - hh2, 0, horizon + hh2);
  hg.addColorStop(0, 'rgba(0,0,0,0)');
  hg.addColorStop(0.45, css(glowC, 0.07));
  hg.addColorStop(0.55, 'rgba(0,0,0,0.18)');
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, horizon - hh2, W, hh2 * 2);

  // grao de filme
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.10;
  const gr = grain();
  for (let y = 0; y < H; y += gr.height) for (let x = 0; x < W; x += gr.width) ctx.drawImage(gr, x, y);
  ctx.restore();
  return c;
}

export function vignetteCanvas(W, H) {
  const c = cv(W, H), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.22, W / 2, H * 0.5, Math.max(W, H) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  return c;
}

export function dotCanvas(S, hex) {
  const c = cv(S, S), ctx = c.getContext('2d');
  const col = rgb(hex);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, css(col, 1));
  g.addColorStop(0.35, css(col, 0.55));
  g.addColorStop(1, css(col, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return c;
}

// Raio de luz suave que "respira" sobre a cena. Renderizado pequeno e desfocado
// para nao deixar aresta dura visivel sobre o fundo.
export function beamCanvas(W, H, hex) {
  const k = 0.3, w = Math.round(W * k), h = Math.round(H * k);
  const c = cv(w, h), ctx = c.getContext('2d');
  const col = rgb(hex);
  ctx.save();
  if ('filter' in ctx) ctx.filter = `blur(${Math.round(w * 0.14)}px)`;
  const g = ctx.createLinearGradient(0, 0, w * 0.95, h);
  g.addColorStop(0, css(col, 0.30));
  g.addColorStop(0.45, css(col, 0.09));
  g.addColorStop(1, css(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, -h * 0.1); ctx.lineTo(w * 0.52, -h * 0.1);
  ctx.lineTo(w * 1.02, h * 1.1); ctx.lineTo(w * 0.22, h * 1.1);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  return c;
}

// Moeda de ouro vista de frente, com relevo de borda e brilho especular.
export function coinCanvas(S) {
  const c = cv(S, S), ctx = c.getContext('2d'), r = S / 2 - S * 0.04;
  const g = ctx.createRadialGradient(S * 0.36, S * 0.32, r * 0.1, S / 2, S / 2, r);
  g.addColorStop(0, '#fff6d0'); g.addColorStop(0.45, '#f0c33c');
  g.addColorStop(0.82, '#c98a17'); g.addColorStop(1, '#8a5a08');
  ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, 7); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = S * 0.05; ctx.strokeStyle = '#7a4d05'; ctx.stroke();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, r * 0.72, 0, 7);
  ctx.lineWidth = S * 0.03; ctx.strokeStyle = 'rgba(255,246,208,0.55)'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(S * 0.38, S * 0.3, r * 0.3, r * 0.16, -0.7, 0, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  return c;
}
