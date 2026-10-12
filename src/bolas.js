/**
 * Bola que rola de verdade: cada bola guarda a orientação 3D (matriz 3x3) e
 * gira com a velocidade angular que a física já calcula — rolamento, efeito
 * de topo/fundo e efeito lateral saem juntos, de graça.
 *
 * O desenho é feito pixel a pixel num canvas: para cada ponto visível da
 * esfera, a normal vai pro referencial da bola e ali se decide a cor (faixa,
 * disco do número, glifo). A luz é fixa na tela. Só redesenha quem girou.
 * ponytail: CPU em vez de shader — ~8k pixels por bola, 16 bolas, sobra frame.
 * Se um dia pesar, o mesmo cálculo vira um fragment shader sem mudar a ideia.
 */

// Cores das bolas 1..15 tiradas da folha de sprites (tom aceso; a luz escurece).
export const CORES = [
  '#ffb319', '#0b3fd0', '#e3161b', '#6c1ca0', '#ff6408',
  '#078a3c', '#951616', '#141414', '#ffb319', '#0b3fd0',
  '#e3161b', '#6c1ca0', '#ff6408', '#078a3c', '#951616',
];

export const TAM = 128;                 // lado do canvas (px)
const PAD = 1.1;                        // 10% de borda transparente, como o render espera
const RAIO = TAM / 2 / PAD;

const DISCO = 0.87;                     // cos do raio angular do disco branco do número (~30°)
const SEN_DISCO = Math.sqrt(1 - DISCO * DISCO);
const ANEL = 0.855;                     // borda fininha do disco
const FAIXA = 0.56;                     // listradas: |y local| abaixo disso é a cor
const PINTA = 0.992;                    // pintas vermelhas da branca
const G = 96;                           // glifo do número (px)

/** Matriz identidade girada pra deixar o número de frente pra câmera. */
export function orientacaoInicial() {
  // colunas = eixos locais no mundo: X local (o número) aponta pro alto (y do mundo)
  return [0, 0, 1,
          1, 0, 0,
          0, 1, 0];
}

/** Gira M (linhas, local→mundo) por ω·dt (rad/s, mundo) e reortonormaliza. */
export function girar(M, wx, wy, wz, dt) {
  const w = Math.hypot(wx, wy, wz);
  const a = w * dt;
  if (a < 1e-7) return false;
  const x = wx / w, y = wy / w, z = wz / w;
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const R = [
    t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
  const N = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    N[i * 3 + j] = R[i * 3] * M[j] + R[i * 3 + 1] * M[3 + j] + R[i * 3 + 2] * M[6 + j];
  }
  // Gram-Schmidt nas colunas: sem isso o erro acumula e a bola "deforma"
  const col = (k) => [N[k], N[3 + k], N[6 + k]];
  let c0 = col(0), c1 = col(1);
  const n0 = Math.hypot(...c0); c0 = c0.map((v) => v / n0);
  const d = c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2];
  c1 = c1.map((v, i) => v - d * c0[i]);
  const n1 = Math.hypot(...c1); c1 = c1.map((v) => v / n1);
  const c2 = [c0[1] * c1[2] - c0[2] * c1[1], c0[2] * c1[0] - c0[0] * c1[2], c0[0] * c1[1] - c0[1] * c1[0]];
  for (let i = 0; i < 3; i++) { M[i * 3] = c0[i]; M[i * 3 + 1] = c1[i]; M[i * 3 + 2] = c2[i]; }
  return true;
}

// Transições suaves (antisserrilhado) nas bordas de disco, filete e faixa.
const BORDA = 1.4 / RAIO;
const liso = (d) => Math.min(1, Math.max(0, d / BORDA + 0.5));
const mix = (a, b, t) => a + (b - a) * t;

/** Leitura bilinear do glifo (0..1). */
function amostra(gl, fx, fy) {
  const x0 = Math.max(0, Math.min(G - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(G - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  const i = y0 * G + x0;
  const a = gl[i] + (gl[i + 1] - gl[i]) * tx;
  const b = gl[i + G] + (gl[i + G + 1] - gl[i + G]) * tx;
  return (a + (b - a) * ty) / 255;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Alfa do número desenhado uma vez num canvas pequeno. */
function glifo(n) {
  const c = document.createElement('canvas');
  c.width = c.height = G;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (n > 9) g.letterSpacing = `${-G * 0.04}px`;
  g.font = `900 ${Math.round(G * (n > 9 ? 0.58 : 0.7))}px system-ui, "Segoe UI", Roboto, sans-serif`;
  g.fillText(String(n), G / 2, G / 2 + G * 0.04);
  const d = g.getImageData(0, 0, G, G).data;
  const a = new Uint8Array(G * G);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

/**
 * Luz por pixel (difusa + especular + oclusão na borda), que não depende da
 * orientação da bola — só de onde a luz está na TELA. `giro` é a rotação do
 * container do mundo (em pé a mesa gira 90°) pra luz continuar vindo do alto.
 */
export function mapaDeLuz(giro = 0) {
  const n = TAM * TAM;
  const nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n);
  const luz = new Float32Array(n), brilho = new Float32Array(n), alfa = new Float32Array(n);
  // luz vinda de cima-esquerda da tela e de frente; levada pro referencial do mundo
  let lx = -0.42, lz = -0.55;
  const cg = Math.cos(-giro), sg = Math.sin(-giro);
  [lx, lz] = [lx * cg - lz * sg, lx * sg + lz * cg];
  const ly = 0.36, ln = Math.hypot(lx, ly, lz);
  const L = [lx / ln, ly / ln, lz / ln];
  const H = [L[0], L[1] + 1, L[2]]; const hn = Math.hypot(...H);
  for (let py = 0; py < TAM; py++) for (let px = 0; px < TAM; px++) {
    const i = py * TAM + px;
    const sx = (px + 0.5 - TAM / 2) / RAIO, sz = (py + 0.5 - TAM / 2) / RAIO;
    const r2 = sx * sx + sz * sz;
    const r = Math.sqrt(r2);
    alfa[i] = Math.min(1, Math.max(0, (1 - r) * RAIO + 0.5));   // borda antisserrilhada
    if (alfa[i] <= 0) continue;
    const h = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));
    // a tela gira junto com o mundo: a normal do pixel vive no referencial do mundo
    nx[i] = sx * Math.cos(giro) + sz * Math.sin(giro);
    nz[i] = -sx * Math.sin(giro) + sz * Math.cos(giro);
    ny[i] = h;
    const dif = Math.max(0, nx[i] * L[0] + ny[i] * L[1] + nz[i] * L[2]);
    const oclusao = 0.55 + 0.45 * Math.pow(h, 0.6);
    luz[i] = (0.34 + 0.8 * dif) * oclusao;
    const esp = Math.max(0, (nx[i] * H[0] + ny[i] * H[1] + nz[i] * H[2]) / hn);
    brilho[i] = Math.pow(esp, 70) * 1.1 + Math.pow(esp, 12) * 0.12;
  }
  return { nx, ny, nz, luz, brilho, alfa, giro };
}

export class Bola {
  constructor(n) {
    this.n = n;
    this.M = orientacaoInicial();
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = TAM;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(TAM, TAM);
    this.cor = n === 0 ? [246, 243, 234] : hex(CORES[n - 1]);
    this.listrada = n > 8;
    this.glifo = n > 0 ? glifo(n) : null;
  }

  desenhar(mapa) {
    const { nx, ny, nz, luz, brilho, alfa } = mapa;
    const M = this.M, d = this.img.data, gl = this.glifo;
    const [cr, cg, cb] = this.cor;
    for (let i = 0; i < TAM * TAM; i++) {
      const o = i * 4;
      if (alfa[i] <= 0) { d[o + 3] = 0; continue; }
      // normal do mundo → referencial da bola (Mᵀ·n)
      const x = M[0] * nx[i] + M[3] * ny[i] + M[6] * nz[i];
      const y = M[1] * nx[i] + M[4] * ny[i] + M[7] * nz[i];
      const z = M[2] * nx[i] + M[5] * ny[i] + M[8] * nz[i];
      let r, g, b;
      if (this.n === 0) {
        // branca: seis pintas vermelhas nos eixos
        const t = liso(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) - PINTA);
        r = mix(cr, 205, t); g = mix(cg, 30, t); b = mix(cb, 38, t);
      } else {
        const ax = Math.abs(x);
        // fundo: cor, ou tampa branca da listrada
        const tf = this.listrada ? liso(Math.abs(y) - FAIXA) : 0;
        r = mix(cr, 246, tf); g = mix(cg, 244, tf); b = mix(cb, 238, tf);
        const ta = liso(ax - ANEL);                          // filete na borda do disco
        r = mix(r, 200, ta); g = mix(g, 200, ta); b = mix(b, 200, ta);
        const td = liso(ax - DISCO);
        if (td > 0) {
          // disco branco com o número; o glifo é amostrado no plano tangente
          const s = x > 0 ? 1 : -1;
          const gi = amostra(gl, (s * z / SEN_DISCO + 1) * 0.5 * G - 0.5, (y / SEN_DISCO + 1) * 0.5 * G - 0.5);
          const k = 250 - gi * 236;
          r = mix(r, k, td); g = mix(g, k, td); b = mix(b, k, td);
        }
      }
      const l = luz[i], e = brilho[i] * 255;
      d[o] = Math.min(255, r * l + e);
      d[o + 1] = Math.min(255, g * l + e);
      d[o + 2] = Math.min(255, b * l + e);
      d[o + 3] = alfa[i] * 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
