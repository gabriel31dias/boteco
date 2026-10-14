/**
 * Zombie Rush: 2 a 4 soldados de palitinho, plataforma de lado, contra as MESMAS
 * hordas de zumbi. Ninguém atira em ninguém: quem fizer mais pontos em 90s leva
 * (empate devolve). Mesmo esquema de Ratos Psicopatas (games/psicopatas/regras.js):
 * o servidor simula a 30 passos/s e decide tudo (zumbis, dano, pontos); o cliente
 * manda comandos numerados e prevê o próprio soldado com `mover`.
 *
 * Zumbis: comum (10), corredor/cachorro (20), saltador/capacete (30), explosivo/
 * gordo (40, explode quando morre ou encosta), gigante (100, chefe dos 80s).
 * Ondas por tempo (ONDAS). Combo: abates seguidos (até COMBO_MS um do outro)
 * multiplicam os pontos (x2 a partir de 5, x3 a partir de 10).
 * Armas caem em caixotes pelo mapa; acabou a munição, volta pra pistola.
 * Morreu: renasce em RENASCER ms (perde o combo, não os pontos).
 *
 * Mundo de 1280×720, y pra baixo. (x, y) de cada corpo é o meio da base.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
export const CHAO = 660;
export const GRAVIDADE = 1900;
export const QUEDA_MAX = 950;
export const PULO = 760;
export const PULO_DUPLO = 640;
export const ATRAVESSAR = 0.25;
export const TICK_MS = 33;
export const TEMPO = Number(globalThis.process?.env?.ZUMBIS_TEMPO) || 90_000;
export const CONTAGEM = Number(globalThis.process?.env?.ZUMBIS_CONTAGEM ?? 3500);
export const RENASCER = 2500;
export const PROTECAO = 1500;
export const COMBO_MS = 3000;
export const MAX_JOGADORES = 4;
export const CORES = ['azul', 'vermelho', 'amarelo', 'verde'];
export const SOLDADO = { vida: 100, vel: 290, w: 36, h: 78 };

/** Armas: cd (ms), bala (vel), dano, vidaBala (s), espalha (rad), balas por tiro, munição (null = infinita), raio (explode), fura (atravessa). */
export const ARMAS = {
  pistola: { cd: 260, bala: 1150, dano: 14, vidaBala: 0.7, espalha: 0.03, balas: 1, municao: null, empurra: 60 },
  metralhadora: { cd: 85, bala: 1250, dano: 9, vidaBala: 0.75, espalha: 0.08, balas: 1, municao: 100, empurra: 40 },
  escopeta: { cd: 650, bala: 1000, dano: 13, vidaBala: 0.34, espalha: 0.26, balas: 7, municao: 16, empurra: 160 },
  bazuca: { cd: 900, bala: 720, dano: 60, vidaBala: 1.6, espalha: 0, balas: 1, municao: 6, raio: 140, dano_raio: 90, empurra: 300 },
  lanca: { cd: 55, bala: 560, dano: 5, vidaBala: 0.38, espalha: 0.2, balas: 1, municao: 140, fura: true, empurra: 15 },
};
export const NOMES_ARMAS = { pistola: 'Pistola', metralhadora: 'Metralhadora', escopeta: 'Escopeta', bazuca: 'Bazuca', lanca: 'Lança-chamas' };

/** Zumbis: vida, vel, dano (mordida), pontos, caixa w×h, pulo (salta), cd do ataque. */
export const ZUMBIS = {
  comum: { vida: 30, vel: 62, dano: 12, pontos: 10, w: 36, h: 82, cd: 900 },
  corredor: { vida: 22, vel: 235, dano: 9, pontos: 20, w: 70, h: 46, cd: 700, pulo: 560 },
  saltador: { vida: 42, vel: 100, dano: 12, pontos: 30, w: 38, h: 90, cd: 900, pulo: 860 },
  explosivo: { vida: 55, vel: 72, dano: 0, pontos: 40, w: 58, h: 96, cd: 0 },
  gigante: { vida: 450, vel: 48, dano: 38, pontos: 100, w: 110, h: 200, cd: 1300 },
};
export const EXPLOSIVO = { raio: 120, dano: 32 };
export const BARRIL = { w: 34, h: 46, volta: 14_000, raio: 135, dano: 80 };

// ------------------------------------------------------------------ mapa
/** Plataformas: seguram só por cima (↓ atravessa); a de baixo é o chão. [x0, x1, topo] */
export const PLATAFORMAS = [
  [0, LARGURA, CHAO],
  [70, 400, 520], [880, 1210, 520],
  [450, 830, 380],
  [110, 370, 240], [910, 1170, 240],
];
export const BARRIS = [[250, 520], [1030, 520], [560, 380], [700, CHAO]];
/** Onde caem caixotes de arma e kits. */
export const PONTOS_ITEM = [[230, 520], [1050, 520], [640, 380], [240, 240], [1040, 240], [400, CHAO], [880, CHAO]];
/** Onde o zumbi brota (sai do chão). [x, y] */
export const BROTA = [[40, CHAO], [1240, CHAO], [180, CHAO], [1100, CHAO], [110, 520], [1170, 520], [480, 380], [800, 380], [150, 240], [1130, 240]];
export const NASCER = [[300, CHAO], [980, CHAO], [520, 380], [760, 380]];
export const PEGAR = 34;

/** Ondas: a partir de `de` segundos — intervalo entre zumbis (ms), máximo vivos (base + por jogador), pesos dos tipos. */
export const ONDAS = [
  { de: 0, nome: null, cada: 1500, max: [6, 1.5], pesos: { comum: 1 } },
  { de: 20, nome: 'CORREDORES!', cada: 1200, max: [8, 2], pesos: { comum: 6, corredor: 4 } },
  { de: 40, nome: 'SALTADORES E EXPLOSIVOS!', cada: 1050, max: [9, 2.5], pesos: { comum: 4, corredor: 2.5, saltador: 2.5, explosivo: 1.5 } },
  { de: 60, nome: 'A HORDA CRESCEU!', cada: 750, max: [11, 3], pesos: { comum: 4, corredor: 3, saltador: 3, explosivo: 2 } },
  { de: 80, nome: 'O GIGANTE CHEGOU!', cada: 650, max: [12, 3], pesos: { comum: 4, corredor: 3, saltador: 3, explosivo: 2 }, chefe: true },
];
export const onda = (seg) => ONDAS.filter((o) => seg >= o.de).at(-1);

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

function novoSoldado([x, y]) {
  return { x, y, vx: 0, vy: 0, kx: 0, chao: true, pulos: 0, atravessa: 0, vida: SOLDADO.vida, vivo: true, renasceEm: 0, protegidoAte: 0,
    dir: x < LARGURA / 2 ? 1 : -1, ang: x < LARGURA / 2 ? 0 : Math.PI, movendo: false, prontoEm: 0, arma: 'pistola', municao: null,
    entrada: { mx: 0, pulo: false, desce: false, ang: 0, fogo: false } };
}

/** Sorteio determinístico (testes) ou Math.random. */
export function sorteador(semente) {
  let s = semente >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function novaPartida(agora = Date.now(), n = 2, cores = [], rnd = Math.random) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const usadas = new Set();
  const cs = Array.from({ length: n }, (_, i) => {
    const c = CORES.includes(cores[i]) && !usadas.has(cores[i]) ? cores[i] : livres.find((l) => !usadas.has(l));
    usadas.add(c);
    return c;
  });
  return {
    n, rnd, cores: cs, soldados: Array.from({ length: n }, (_, i) => novoSoldado(NASCER[i])),
    pontos: vazio(n, 0), abates: vazio(n, 0), mortes: vazio(n, 0), combo: vazio(n, 0), comboEm: vazio(n, 0), melhorCombo: vazio(n, 0),
    fora: vazio(n, false), zumbis: [], balas: [], itens: [], barris: BARRIS.map(() => 0),
    id: 0, seq: 0, eventos: [], fase: 'contagem', largada: agora + CONTAGEM, fimEm: agora + CONTAGEM + TEMPO, fim: null, ultimo: agora,
    proxZumbi: 0, proxItem: 0, onda: 0, chefe: false, lider: null,
    fila: vazio(n, () => []), ack: vazio(n, 0), credito: vazio(n, 0),
  };
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });
const num = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : 0);
const sobre = (ax0, ax1, bx0, bx1) => ax0 < bx1 && ax1 > bx0;
const sorte = (p, a, b) => a + p.rnd() * (b - a);

// ---------------------------------------------------------------- entrada

export const CMD_MS_MAX = 50;
export const FILA_MAX = 40;
const CREDITO_MAX = 250;

function limpa(c = {}, antes) {
  return { mx: num(c.mx, -1, 1), pulo: c.pulo === true, desce: c.desce === true,
    ang: Number.isFinite(Number(c.ang)) ? Number(c.ang) : antes.ang, fogo: c.fogo === true };
}

/** Comandos numerados `{ cmds: [...] }` (previsão + ack) ou `{ mx, ... }` direto (testes e bots). */
export function entrada(p, i, acao = {}) {
  const s = p.soldados?.[i];
  if (!s || p.fim || p.fora[i] || !acao || typeof acao !== 'object') return null;
  if (!Array.isArray(acao.cmds)) { s.entrada = limpa(acao, s.entrada); return { ok: true }; }
  const fila = p.fila[i];
  let ultimo = fila.length ? fila[fila.length - 1].s : p.ack[i];
  for (const c of acao.cmds.slice(0, FILA_MAX)) {
    const sq = Number(c?.s);
    if (!Number.isInteger(sq) || sq <= ultimo) continue;
    if (fila.length >= FILA_MAX) break;
    fila.push({ s: sq, dt: num(c.dt, 0, CMD_MS_MAX), ...limpa(c, s.entrada) });
    ultimo = sq;
  }
  return { ok: true };
}

// ---------------------------------------------------------------- física

/** Gravidade e plataformas (só por cima) pra qualquer corpo de meia-largura `meio`. */
function cair(b, meio, dt) {
  const antes = b.y;
  b.vy = Math.min(QUEDA_MAX, b.vy + GRAVIDADE * dt);
  let ny = b.y + b.vy * dt;
  b.chao = false;
  if (b.vy >= 0) {
    for (const [x0, x1, top] of PLATAFORMAS) {
      if (top !== CHAO && b.atravessa) continue;   // o chão não deixa atravessar
      if (antes <= top + 0.01 && ny >= top && sobre(b.x - meio, b.x + meio, x0, x1)) { ny = top; b.vy = 0; b.chao = true; }
    }
  }
  if (ny < -200) { ny = -200; b.vy = Math.max(0, b.vy); }
  b.y = Math.min(ny, CHAO);
  if (b.y >= CHAO) { b.chao = true; b.vy = 0; }
}

/** Anda `dt` segundos com o comando `c`. Roda igual no servidor e na previsão do cliente. */
export function mover(p, i, c, dt) {
  const s = p.soldados[i];
  const meio = SOLDADO.w / 2;
  if (c.desce) s.atravessa = ATRAVESSAR;
  else s.atravessa = Math.max(0, s.atravessa - dt);
  if (c.pulo) {
    if (s.chao) { s.vy = -PULO; s.chao = false; s.pulos = 1; }
    else if (s.pulos < 2) { s.vy = -PULO_DUPLO; s.pulos = 2; }
  }
  s.kx *= Math.max(0, 1 - 6 * dt);
  if (Math.abs(s.kx) < 5) s.kx = 0;
  s.x = Math.min(LARGURA - meio, Math.max(meio, s.x + (c.mx * SOLDADO.vel + s.kx) * dt));
  cair(s, meio, dt);
  if (s.chao) s.pulos = 0;
  s.movendo = c.mx !== 0;
  if (c.mx) s.dir = c.mx > 0 ? 1 : -1;
}

// ---------------------------------------------------------------- zumbis

function sorteiaTipo(p, pesos) {
  const tot = Object.values(pesos).reduce((a, b) => a + b, 0);
  let r = p.rnd() * tot;
  for (const [t, w] of Object.entries(pesos)) if ((r -= w) <= 0) return t;
  return 'comum';
}

function brotar(p, tipo, agora, onde) {
  const vivos = p.soldados.filter((s, i) => s.vivo && !p.fora[i]);
  // brota longe de todo mundo (não nasce em cima de ninguém)
  const longe = BROTA.filter(([x, y]) => vivos.every((s) => Math.hypot(s.x - x, s.y - y) > 220));
  const [x, y] = onde ?? (longe.length ? longe : BROTA)[Math.floor(p.rnd() * (longe.length || BROTA.length))];
  const z = ZUMBIS[tipo];
  const vida = tipo === 'gigante' ? z.vida + 300 * p.n : z.vida;
  const zb = { id: ++p.id, tipo, x, y, vy: 0, kx: 0, chao: true, atravessa: 0, vida, max: vida, dir: x < LARGURA / 2 ? 1 : -1,
    vel: Math.round(z.vel * sorte(p, 0.85, 1.2)), surgeAte: agora + (tipo === 'gigante' ? 1200 : 650), bateEm: 0, puloEm: agora + sorte(p, 500, 1500),
    ultimoDe: null, morto: null, alvo: null };
  p.zumbis.push(zb);
  evento(p, { tipo: 'brota', z: zb.id, zt: tipo, x, y });
  return zb;
}

const caixaZ = (z) => { const k = ZUMBIS[z.tipo]; return [z.x - k.w / 2, z.y - k.h, z.x + k.w / 2, z.y]; };
const caixaS = (s) => [s.x - SOLDADO.w / 2, s.y - SOLDADO.h, s.x + SOLDADO.w / 2, s.y];

function ferirSoldado(p, i, dano, empurra, agora, x) {
  const s = p.soldados[i];
  if (!s.vivo || agora < s.protegidoAte || p.fase !== 'jogo') return;
  s.vida = Math.max(0, s.vida - dano);
  s.kx += empurra;
  s.vy = Math.min(s.vy, -260);
  evento(p, { tipo: 'ferido', i, dano, x: Math.round(x ?? s.x), y: Math.round(s.y - 50) });
  if (s.vida <= 0) {
    s.vivo = false;
    s.renasceEm = agora + RENASCER;
    p.mortes[i]++;
    if (p.combo[i] >= 5) evento(p, { tipo: 'perdeuCombo', i, combo: p.combo[i] });
    p.combo[i] = 0;
    evento(p, { tipo: 'morreu', i, x: Math.round(s.x), y: Math.round(s.y), dir: Math.sign(empurra) || 1 });
  }
}

/** Zumbi morreu: pontos (com multiplicador do combo) pra quem deu o último tiro. */
function matarZumbi(p, z, de, agora, extra = {}) {
  if (z.morto != null) return;
  z.morto = agora;
  z.vida = 0;
  const k = ZUMBIS[z.tipo];
  let pts = 0, mult = 1, combo = 0;
  if (de != null) {
    combo = p.combo[de] = agora - p.comboEm[de] <= COMBO_MS ? p.combo[de] + 1 : 1;
    p.comboEm[de] = agora;
    p.melhorCombo[de] = Math.max(p.melhorCombo[de], combo);
    mult = combo >= 10 ? 3 : combo >= 5 ? 2 : 1;
    pts = k.pontos * mult;
    p.pontos[de] += pts;
    p.abates[de]++;
  }
  evento(p, { tipo: 'zumbiMorreu', z: z.id, zt: z.tipo, de, pts, mult, combo, x: Math.round(z.x), y: Math.round(z.y - k.h / 2), dir: z.dir, ...extra });
  if (de != null && (combo === 5 || combo === 10 || (combo > 10 && combo % 5 === 0))) evento(p, { tipo: 'combo', i: de, combo });
  if (z.tipo === 'explosivo') estourar(p, z.x, z.y - k.h / 2, EXPLOSIVO.raio, EXPLOSIVO.dano, de, agora, { gordo: true });
}

function ferirZumbi(p, z, dano, de, agora, empurra = 0, extra = {}) {
  if (z.morto != null || agora < z.surgeAte - 300) return false;
  z.vida -= dano;
  z.kx += empurra * (z.tipo === 'gigante' ? 0.15 : 1);
  z.ultimoDe = de;
  if (z.vida <= 0) matarZumbi(p, z, de, agora, extra);
  else evento(p, { tipo: 'acerto', z: z.id, de, dano, x: Math.round(z.x), y: Math.round(z.y - ZUMBIS[z.tipo].h * 0.6), ...extra });
  return true;
}

/** Explosão: machuca zumbis (pontos pra `de`), soldados só se `fereGente`, e estoura barris em cadeia. */
function estourar(p, x, y, raio, dano, de, agora, extra = {}) {
  evento(p, { tipo: 'explosao', x: Math.round(x), y: Math.round(y), raio, ...extra });
  for (const z of p.zumbis) {
    if (z.morto != null) continue;
    const k = ZUMBIS[z.tipo];
    const d = Math.hypot(z.x - x, z.y - k.h / 2 - y);
    if (d < raio + k.w / 2) { ferirZumbi(p, z, Math.round(dano * (1 - (d / (raio + k.w / 2)) * 0.6)), de, agora, Math.sign(z.x - x || 1) * 420, { explodiu: true }); if (z.morto == null) z.vy = -380; }
  }
  if (extra.gordo) {
    for (const [i, s] of p.soldados.entries()) {
      if (s.vivo && Math.hypot(s.x - x, s.y - SOLDADO.h / 2 - y) < raio) ferirSoldado(p, i, EXPLOSIVO.dano, Math.sign(s.x - x || 1) * 520, agora, x);
    }
  }
  for (const [k, [bx, by]] of BARRIS.entries()) {
    if (!p.barris[k] && Math.hypot(bx - x, by - BARRIL.h / 2 - y) < raio * 1.1) {
      p.barris[k] = agora + BARRIL.volta;
      estourar(p, bx, by - BARRIL.h / 2, BARRIL.raio, BARRIL.dano, de, agora, { barril: k });
    }
  }
}

function pensarZumbi(p, z, agora, dt) {
  const k = ZUMBIS[z.tipo];
  if (agora < z.surgeAte) return;   // ainda saindo do chão
  // alvo: o soldado vivo mais perto (pesa mais a diferença de altura)
  let alvo = null, melhor = Infinity;
  for (const [i, s] of p.soldados.entries()) {
    if (!s.vivo || p.fora[i]) continue;
    const d = Math.abs(s.x - z.x) + Math.abs(s.y - z.y) * 1.6;
    if (d < melhor) { melhor = d; alvo = s; }
  }
  let mx = 0;
  if (alvo) {
    const dx = alvo.x - z.x, dy = alvo.y - z.y;
    if (Math.abs(dx) > 12) mx = Math.sign(dx);
    // embaixo dele: desce da plataforma; em cima: quem pula pula
    if (dy > 70 && z.chao && z.y < CHAO && p.rnd() < 0.02) z.atravessa = ATRAVESSAR;
    if (k.pulo && z.chao && agora >= z.puloEm && (dy < -60 || (Math.abs(dx) < 220 && p.rnd() < 0.25))) {
      z.vy = -k.pulo; z.chao = false; z.puloEm = agora + sorte(p, 1100, 2200);
      evento(p, { tipo: 'pulo', z: z.id, x: Math.round(z.x), y: Math.round(z.y) });
    }
  } else if (p.rnd() < 0.01) z.dir = -z.dir;
  if (mx) z.dir = mx;
  z.atravessa = Math.max(0, z.atravessa - dt);
  z.kx *= Math.max(0, 1 - 5 * dt);
  const meio = k.w / 2;
  z.x = Math.min(LARGURA + 40, Math.max(-40, z.x + (mx * z.vel + z.kx) * dt));
  z.movendo = mx !== 0;
  cair(z, meio, dt);
  // mordida / encostou
  const [x0, y0, x1, y1] = caixaZ(z);
  for (const [i, s] of p.soldados.entries()) {
    if (!s.vivo || p.fora[i] || agora < s.protegidoAte) continue;
    const [a0, b0, a1, b1] = caixaS(s);
    if (!sobre(x0 + 6, x1 - 6, a0, a1) || !sobre(y0, y1, b0, b1)) continue;
    if (z.tipo === 'explosivo') { matarZumbi(p, z, null, agora, { encostou: true }); return; }
    if (agora < z.bateEm) continue;
    z.bateEm = agora + k.cd;
    evento(p, { tipo: 'mordida', z: z.id, zt: z.tipo, i, x: Math.round(z.x), y: Math.round(z.y) });
    ferirSoldado(p, i, k.dano, Math.sign(s.x - z.x || 1) * (z.tipo === 'gigante' ? 700 : 300), agora, z.x);
  }
}

// ---------------------------------------------------------------- tiro

function atirar(p, i, agora) {
  const s = p.soldados[i], a = ARMAS[s.arma];
  s.prontoEm = agora + a.cd;
  const lado = Math.cos(s.ang) >= 0 ? 1 : -1;
  s.dir = lado;
  const ox = s.x + Math.cos(s.ang) * 34, oy = s.y - SOLDADO.h * 0.55 + Math.sin(s.ang) * 18;
  for (let n = 0; n < a.balas; n++) {
    const desvio = a.balas > 1 ? (n / (a.balas - 1) - 0.5) * 2 * a.espalha : (p.rnd() - 0.5) * 2 * a.espalha;
    const ang = s.ang + desvio;
    const v = a.bala * (s.arma === 'lanca' ? sorte(p, 0.8, 1.15) : 1);
    p.balas.push({ id: ++p.id, x: ox, y: oy, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, dono: i, vida: a.vidaBala, arma: s.arma, pegou: a.fura ? new Set() : null });
  }
  evento(p, { tipo: 'tiro', de: i, arma: s.arma, x: Math.round(ox), y: Math.round(oy), ang: Math.round(s.ang * 100) / 100 });
  if (a.municao != null && --s.municao <= 0) {
    s.arma = 'pistola'; s.municao = null; s.prontoEm = agora + 300;
    evento(p, { tipo: 'semMunicao', i });
  }
}

function moverBalas(p, agora, dt) {
  const vivas = [];
  for (const b of p.balas) {
    b.vida -= dt;
    const a = ARMAS[b.arma];
    const passos = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 14));
    let fim = b.vida <= 0;
    if (fim && b.arma === 'bazuca') estourar(p, b.x, b.y, a.raio, a.dano_raio, b.dono, agora, { foguete: true });
    for (let k = 0; k < passos && !fim; k++) {
      b.x += (b.vx * dt) / passos;
      b.y += (b.vy * dt) / passos;
      if (b.arma === 'lanca') b.vy -= 300 * dt / passos;   // chama sobe
      if (b.x < -40 || b.x > LARGURA + 40 || b.y < -60) { fim = true; break; }
      if (b.y >= CHAO) {
        if (b.arma === 'bazuca') estourar(p, b.x, CHAO - 10, a.raio, a.dano_raio, b.dono, agora, { foguete: true });
        else evento(p, { tipo: 'impacto', x: Math.round(b.x), y: CHAO, chao: true });
        fim = true; break;
      }
      for (const z of p.zumbis) {
        if (z.morto != null || agora < z.surgeAte - 300 || (b.pegou && b.pegou.has(z.id))) continue;
        const [x0, y0, x1, y1] = caixaZ(z);
        if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
        if (b.arma === 'bazuca') { estourar(p, b.x, b.y, a.raio, a.dano_raio, b.dono, agora, { foguete: true }); ferirZumbi(p, z, a.dano, b.dono, agora, Math.sign(b.vx) * a.empurra); fim = true; break; }
        const cabeca = b.arma !== 'lanca' && b.y < y0 + (y1 - y0) * 0.25 && z.tipo !== 'corredor';
        ferirZumbi(p, z, a.dano * (cabeca ? 2 : 1), b.dono, agora, Math.sign(b.vx) * a.empurra, cabeca ? { cabeca: true } : b.arma === 'lanca' ? { fogo: true } : {});
        if (b.pegou) { b.pegou.add(z.id); continue; }
        fim = true; break;
      }
      if (fim) break;
      for (const [kb, [bx, by]] of BARRIS.entries()) {
        if (!p.barris[kb] && Math.abs(b.x - bx) < BARRIL.w / 2 && b.y > by - BARRIL.h && b.y < by) {
          p.barris[kb] = agora + BARRIL.volta;
          estourar(p, bx, by - BARRIL.h / 2, BARRIL.raio, BARRIL.dano, b.dono, agora, { barril: kb });
          fim = true; break;
        }
      }
    }
    if (!fim) vivas.push(b);
  }
  p.balas = vivas;
}

// ---------------------------------------------------------------- itens

const ARMAS_CAIXA = ['metralhadora', 'escopeta', 'bazuca', 'lanca', 'metralhadora', 'escopeta'];

function largarItem(p, agora) {
  const livres = PONTOS_ITEM.filter(([x, y]) => !p.itens.some((it) => it.x === x && it.y === y));
  if (!livres.length) return;
  const [x, y] = livres[Math.floor(p.rnd() * livres.length)];
  const kit = p.rnd() < 0.25;
  const it = { id: ++p.id, tipo: kit ? 'kit' : 'arma', arma: kit ? null : ARMAS_CAIXA[Math.floor(p.rnd() * ARMAS_CAIXA.length)], x, y, some: agora + 20_000 };
  p.itens.push(it);
  evento(p, { tipo: 'item', item: it.id, x, y, arma: it.arma });
}

function pegarItens(p, agora) {
  for (const [i, s] of p.soldados.entries()) {
    if (!s.vivo || p.fora[i]) continue;
    const [x0, y0, x1, y1] = caixaS(s);
    for (const it of p.itens) {
      if (it.pego || !sobre(x0, x1, it.x - PEGAR, it.x + PEGAR) || !sobre(y0, y1, it.y - 40, it.y + 4)) continue;
      if (it.tipo === 'kit') {
        if (s.vida >= SOLDADO.vida) continue;
        s.vida = Math.min(SOLDADO.vida, s.vida + 60);
      } else { s.arma = it.arma; s.municao = ARMAS[it.arma].municao; s.prontoEm = Math.min(s.prontoEm, agora + 150); }
      it.pego = true;
      evento(p, { tipo: 'pegou', i, item: it.tipo, arma: it.arma, x: it.x, y: it.y });
    }
  }
  p.itens = p.itens.filter((it) => !it.pego && agora < it.some);
}

// ---------------------------------------------------------------- partida

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  p.soldados[i].vivo = false;
  evento(p, { tipo: 'saiu', i });
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  if (ativos.length === 1) { p.fim = { vencedor: ativos[0], motivo: 'wo' }; p.fase = 'fim'; }
  return { tipo: 'saiu', assento: i };
}

function ondeNascer(p, i) {
  let melhor = NASCER[i % NASCER.length], dist = -1;
  for (const pt of NASCER) {
    const d = Math.min(9999, ...p.zumbis.filter((z) => z.morto == null).map((z) => Math.hypot(z.x - pt[0], z.y - pt[1])));
    if (d > dist) { dist = d; melhor = pt; }
  }
  return melhor;
}

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  if (p.fim) return p;
  const dt = Math.min(0.05, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;

  if (p.fase === 'contagem') {
    for (const i of p.soldados.keys()) {
      const f = p.fila[i];
      if (f.length) { p.ack[i] = f[f.length - 1].s; p.soldados[i].entrada = { ...f[f.length - 1], mx: 0, pulo: false }; f.length = 0; }
      p.credito[i] = 0;
    }
    if (agora < p.largada) return p;
    p.fase = 'jogo';
    p.proxZumbi = agora + 400;
    p.proxItem = agora + 4000;
    evento(p, { tipo: 'largada' });
  }

  for (const k of p.barris.keys()) if (p.barris[k] && agora >= p.barris[k]) { p.barris[k] = 0; evento(p, { tipo: 'barrilVolta', barril: k }); }

  // soldados: comandos da fila (com crédito de tempo, igual Psicopatas)
  for (const [i, s] of p.soldados.entries()) {
    if (p.fora[i]) continue;
    if (!s.vivo) {
      p.fila[i].forEach((c) => { p.ack[i] = c.s; s.entrada = c; });
      p.fila[i].length = 0;
      p.credito[i] = 0;
      if (agora >= s.renasceEm) {
        const pt = ondeNascer(p, i);
        Object.assign(s, novoSoldado(pt), { protegidoAte: agora + PROTECAO, prontoEm: agora + 300 });
        evento(p, { tipo: 'renasce', i, x: pt[0], y: pt[1] });
      }
      continue;
    }
    const fila = p.fila[i];
    let fogo = false;
    if (fila.length || p.ack[i]) {
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        s.entrada = c;
        const noChao = s.chao;
        mover(p, i, c, c.dt / 1000);
        if (c.pulo) evento(p, { tipo: 'pulou', i, x: Math.round(s.x), y: Math.round(s.y), duplo: !noChao });
        fogo ||= c.fogo;
      }
    } else {
      const c = s.entrada;
      fogo = c.fogo;
      mover(p, i, c, dt);
      s.entrada = { ...c, pulo: false };
    }
    s.ang = s.entrada.ang;
    if (fogo && agora >= s.prontoEm) atirar(p, i, agora);
  }

  // ondas: zumbi novo de tempos em tempos, até o máximo da onda
  const seg = (agora - p.largada) / 1000;
  const o = onda(seg);
  const nOnda = ONDAS.indexOf(o);
  if (nOnda !== p.onda) { p.onda = nOnda; if (o.nome) evento(p, { tipo: 'onda', n: nOnda, nome: o.nome }); }
  if (o.chefe && !p.chefe) { p.chefe = true; brotar(p, 'gigante', agora, [p.rnd() < 0.5 ? 80 : LARGURA - 80, CHAO]); evento(p, { tipo: 'chefe' }); }
  const vivos = p.zumbis.filter((z) => z.morto == null).length;
  if (agora >= p.proxZumbi && agora < p.fimEm - 1500 && vivos < Math.min(24, Math.round(o.max[0] + o.max[1] * p.n))) {
    brotar(p, sorteiaTipo(p, o.pesos), agora);
    p.proxZumbi = agora + o.cada * sorte(p, 0.7, 1.3) * (4 / (p.n + 2));
  }
  if (agora >= p.proxItem) { largarItem(p, agora); p.proxItem = agora + sorte(p, 6000, 10_000); }

  for (const z of p.zumbis) if (z.morto == null) pensarZumbi(p, z, agora, dt);
  moverBalas(p, agora, dt);
  pegarItens(p, agora);
  p.zumbis = p.zumbis.filter((z) => z.morto == null || agora - z.morto < 1500);

  // quem passou na frente
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  const top = Math.max(...ativos.map((j) => p.pontos[j]));
  const lideres = ativos.filter((j) => p.pontos[j] === top);
  if (top > 0 && lideres.length === 1 && lideres[0] !== p.lider) {
    if (p.lider != null) evento(p, { tipo: 'lider', i: lideres[0], antes: p.lider });
    p.lider = lideres[0];
  }

  if (agora >= p.fimEm) {
    p.fim = lideres.length === 1 ? { vencedor: lideres[0], motivo: 'pontos' } : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
    p.balas = [];
    evento(p, { tipo: 'fim' });
  }
  return p;
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, n: p.n, fase: p.fase, largada: p.largada, fimEm: p.fimEm, fim: p.fim, cores: p.cores, fora: p.fora,
  pontos: p.pontos, abates: p.abates, mortes: p.mortes, combo: p.soldados.map((_, i) => (agora - p.comboEm[i] <= COMBO_MS ? p.combo[i] : 0)),
  onda: p.onda,
  // [x, y, ang, vida, vivo, movendo, ack, vy, kx, chao, pulos, atravessa, protegido, dir, arma, municao]
  s: p.soldados.map((s, i) => [r1(s.x), r1(s.y), Math.round(s.ang * 100) / 100, s.vida, s.vivo ? 1 : 0, s.movendo ? 1 : 0, p.ack[i],
    r1(s.vy), r1(s.kx), s.chao ? 1 : 0, s.pulos, Math.round(s.atravessa * 1000) / 1000, agora < s.protegidoAte ? 1 : 0, s.dir, s.arma, s.municao]),
  // [id, tipo, x, y, vida (0–1), dir, movendo, surgindo, morto, chao]
  z: p.zumbis.map((z) => [z.id, z.tipo, Math.round(z.x), Math.round(z.y), Math.round((Math.max(0, z.vida) / z.max) * 100) / 100, z.dir,
    z.movendo ? 1 : 0, agora < z.surgeAte ? 1 : 0, z.morto != null ? 1 : 0, z.chao ? 1 : 0]),
  // [id, x, y, ang, dono, arma]
  b: p.balas.map((b) => [b.id, Math.round(b.x), Math.round(b.y), Math.round(Math.atan2(b.vy, b.vx) * 100) / 100, b.dono, b.arma]),
  it: p.itens.map((it) => [it.id, it.tipo, it.arma, it.x, it.y]),
  barris: p.barris.map((v) => (v ? 1 : 0)),
  ev: p.eventos,
});
