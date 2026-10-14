/**
 * Cobras do Templo: 2 a 4 cobras no piso do templo, tempo real. O servidor
 * simula a 30 passos/s e decide tudo; o cliente manda pra onde quer ir
 * (`ang`) e se está no turbo, e desenha.
 *
 * Fruta faz crescer. Bateu a cabeça no corpo de outra cobra, na parede ou
 * numa pedra: morre, vira bolinhas (quem passar come) e renasce pequena.
 * Cabeça com cabeça: a menor morre (iguais, as duas). No próprio corpo pode.
 * Turbo corre mais mas gasta gomo (o gomo vira bolinha atrás).
 * Acabou o tempo: ganha a maior cobra viva; empatou, quem comeu mais.
 *
 * O corpo é o rastro da cabeça amostrado a cada SEG px (`amostrar`): o
 * cliente monta o mesmo rastro com as cabeças que recebe, então só a cabeça
 * viaja na rede.
 *
 * Mundo de 720×1280 (o templo em pé), y pra baixo.
 */

export const LARGURA = 720;
export const ALTURA = 1280;
export const TICK_MS = 33;
export const TEMPO_PARTIDA = Number(globalThis.process?.env?.COBRAS_TEMPO) || 120_000;
export const CONTAGEM = Number(globalThis.process?.env?.COBRAS_CONTAGEM ?? 3000);
export const RENASCER = Number(globalThis.process?.env?.COBRAS_RENASCER ?? 2500);
export const PROTECAO = 2000;
export const SEG = 11;              // px entre gomos
export const INICIO = 10;           // gomos ao nascer (cabeça conta)
export const VEL = 165;
export const TURBO = { vel: 290, gasta: 250, min: 12 };   // gasta 1 gomo a cada `gasta` ms; abaixo de `min` não liga
export const GIRO = 5.2;            // rad/s
export const COMER = 24;            // alcance da boca além do raio
export const FRUTAS_MAX = 16;
export const BOLINHAS_MAX = 180;
export const MAX_JOGADORES = 4;

/** Raio do gomo: cobra grande engorda um pouco. */
export const raio = (len) => 12 + Math.min(9, Math.max(0, len - INICIO) * 0.07);

/** Piso jogável e as pedras (ladrilhos do templo, ver scripts/preparar-cobras.py). */
const LADRILHO = 74.2;
export const CAMPO = { x0: 65, y0: 208, x1: 65 + LADRILHO * 8, y1: 208 + LADRILHO * 12 };
export const PEDRAS = [[5, 0], [1, 3], [7, 3], [0, 8], [4, 10]].map(([c, l]) => [
  CAMPO.x0 + c * LADRILHO + 6, CAMPO.y0 + l * LADRILHO + 6, CAMPO.x0 + (c + 1) * LADRILHO - 6, CAMPO.y0 + (l + 1) * LADRILHO - 6]);

/** As cores do lobby (linhas da folha). */
export const CORES = ['verde', 'vermelho', 'azul', 'amarelo', 'rosa', 'roxo', 'preto', 'arcoiris'];

/** Fruta: quanto cresce e quanto pesa no sorteio. */
export const FRUTAS = {
  maca: { cresce: 2, peso: 40 },
  morango: { cresce: 2, peso: 25 },
  banana: { cresce: 2, peso: 20 },
  uva: { cresce: 3, peso: 12 },
  melancia: { cresce: 5, peso: 5 },
  moeda: { cresce: 8, peso: 2 },
};
const SORTEIO = Object.entries(FRUTAS).flatMap(([t, f]) => Array(f.peso).fill(t));

/** Nascer: perto dos cantos, de frente pro meio. */
export const NASCER = [[160, 330], [560, 340], [170, 1000], [560, 980], [360, 560], [360, 760], [250, 660], [470, 660]];

// ------------------------------------------------------------------ rastro

/** Rastro reto atrás da cabeça (nascimento). */
export function rastroInicial(x, y, ang, len) {
  const r = [];
  for (let k = 0; k <= len + 1; k++) r.push([x - Math.cos(ang) * SEG * k, y - Math.sin(ang) * SEG * k]);
  return r;
}

/** `n` pontos a cada SEG px ao longo do rastro (cabeça primeiro). Faltou rastro: empilha no fim. */
export function amostrar(rastro, n, seg = SEG) {
  const out = [rastro[0]];
  let falta = seg;
  for (let i = 1; i < rastro.length && out.length < n; i++) {
    let [ax, ay] = rastro[i - 1];
    const [bx, by] = rastro[i];
    let d = Math.hypot(bx - ax, by - ay);
    while (d >= falta && out.length < n) {
      const t = falta / d;
      ax += (bx - ax) * t; ay += (by - ay) * t;
      out.push([ax, ay]);
      d -= falta; falta = seg;
    }
    falta -= d;
  }
  while (out.length < n) out.push(out[out.length - 1]);
  return out;
}

/** Corta o rastro no comprimento que o corpo usa (mais uma folga). */
export function aparar(rastro, len) {
  let tot = 0;
  for (let i = 1; i < rastro.length; i++) {
    tot += Math.hypot(rastro[i][0] - rastro[i - 1][0], rastro[i][1] - rastro[i - 1][1]);
    if (tot > (len + 1) * SEG) { rastro.length = i + 1; return; }
  }
}

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));
const centroAng = (x, y) => Math.atan2((CAMPO.y0 + CAMPO.y1) / 2 - y, (CAMPO.x0 + CAMPO.x1) / 2 - x);

function novaCobra([x, y], agora) {
  const ang = centroAng(x, y);
  return { x, y, ang, alvo: ang, len: INICIO, vivo: true, renasceEm: 0, protegidoAte: agora + PROTECAO,
    turbo: false, querTurbo: false, gastoEm: 0, rastro: rastroInicial(x, y, ang, INICIO) };
}

export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidas = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  const p = {
    cores: escolhidas, cobras: escolhidas.map((_, i) => novaCobra(NASCER[i], agora + CONTAGEM)),
    comeu: vazio(n, 0), abates: vazio(n, 0), mortes: vazio(n, 0), maior: vazio(n, INICIO), fora: vazio(n, false),
    frutas: [], idFruta: 0, frMudou: true, tick: 0,
    seq: 0, eventos: [],
    fase: 'contagem', faseAte: agora + CONTAGEM, fimEm: null, fim: null, ultimo: agora,
  };
  while (p.frutas.length < FRUTAS_MAX) novaFruta(p);
  return p;
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });

function livre(p, x, y, folga) {
  if (x < CAMPO.x0 + folga || x > CAMPO.x1 - folga || y < CAMPO.y0 + folga || y > CAMPO.y1 - folga) return false;
  return !PEDRAS.some(([x0, y0, x1, y1]) => x > x0 - folga && x < x1 + folga && y > y0 - folga && y < y1 + folga);
}

function novaFruta(p, tipo = SORTEIO[Math.floor(Math.random() * SORTEIO.length)]) {
  for (let t = 0; t < 30; t++) {
    const x = CAMPO.x0 + Math.random() * (CAMPO.x1 - CAMPO.x0);
    const y = CAMPO.y0 + Math.random() * (CAMPO.y1 - CAMPO.y0);
    if (!livre(p, x, y, 22)) continue;
    if (p.cobras.some((c) => c.vivo && Math.hypot(c.x - x, c.y - y) < 70)) continue;
    p.frutas.push({ id: ++p.idFruta, x: Math.round(x), y: Math.round(y), tipo, cresce: FRUTAS[tipo].cresce });
    p.frMudou = true;
    return;
  }
}

/** Bolinha do corpo (morte ou turbo): cresce 1, na cor de quem soltou. */
function bolinha(p, x, y, dono) {
  const fx = Math.min(CAMPO.x1 - 8, Math.max(CAMPO.x0 + 8, x)), fy = Math.min(CAMPO.y1 - 8, Math.max(CAMPO.y0 + 8, y));
  p.frutas.push({ id: ++p.idFruta, x: Math.round(fx), y: Math.round(fy), tipo: 'bola', cresce: 1, dono });
  p.frMudou = true;
}

// ---------------------------------------------------------------- entrada

/** `{ ang, turbo }`: pra onde a cabeça vira e se quer correr. Lixo é ignorado. */
export function entrada(p, i, acao = {}) {
  const c = p.cobras?.[i];
  if (!c || p.fim || p.fora[i]) return null;
  const ang = Number(acao.ang);
  if (Number.isFinite(ang)) c.alvo = ang;
  c.querTurbo = acao.turbo === true;
  return { ok: true };
}

// ---------------------------------------------------------------- morte

function morrer(p, i, de, causa, agora) {
  const c = p.cobras[i];
  if (!c.vivo) return;
  const corpo = amostrar(c.rastro, c.len);
  for (let k = 0; k < corpo.length; k += 2) {
    const [x, y] = corpo[k];
    bolinha(p, x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14, i);
  }
  while (p.frutas.filter((f) => f.tipo === 'bola').length > BOLINHAS_MAX) p.frutas.splice(p.frutas.findIndex((f) => f.tipo === 'bola'), 1);
  c.vivo = false;
  c.turbo = false;
  c.renasceEm = agora + RENASCER;
  p.mortes[i]++;
  if (de != null) p.abates[de]++;
  evento(p, { tipo: 'abate', alvo: i, de, causa, x: Math.round(c.x), y: Math.round(c.y), len: c.len });
}

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  morrer(p, i, null, 'saiu', Date.now());
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  if (ativos.length === 1) { p.fim = { vencedor: ativos[0], motivo: 'wo' }; p.fase = 'fim'; }
  return { tipo: 'saiu', assento: i };
}

function ondeNascer(p, i) {
  let melhor = NASCER[i % NASCER.length], dist = -1;
  for (const pt of NASCER) {
    let d = 9999;
    for (const [j, o] of p.cobras.entries()) {
      if (j === i || !o.vivo) continue;
      for (const [x, y] of amostrar(o.rastro, o.len)) d = Math.min(d, Math.hypot(x - pt[0], y - pt[1]));
    }
    if (d > dist) { dist = d; melhor = pt; }
  }
  return melhor;
}

const lideres = (valores, candidatos) => {
  const max = Math.max(...candidatos.map((i) => valores[i]));
  return candidatos.filter((i) => valores[i] === max);
};

/** Tamanho que vale no placar: cobra morta (esperando renascer) não tem tamanho. */
export const tamanho = (c) => (c.vivo ? c.len : 0);

// ------------------------------------------------------------------ passo

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  p.frMudou = false;
  p.tick++;
  if (p.fim) return p;
  const dt = Math.min(0.05, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;

  if (p.fase === 'contagem') {
    if (agora < p.faseAte) return p;
    p.fase = 'jogo';
    p.fimEm = agora + TEMPO_PARTIDA;
    evento(p, { tipo: 'fogo' });
  }

  // renascer
  for (const [i, c] of p.cobras.entries()) {
    if (c.vivo || p.fora[i] || agora < c.renasceEm) continue;
    Object.assign(c, novaCobra(ondeNascer(p, i), agora));
    evento(p, { tipo: 'renasce', i, x: c.x, y: c.y });
  }

  // andar
  for (const [i, c] of p.cobras.entries()) {
    if (!c.vivo) continue;
    const giro = Math.atan2(Math.sin(c.alvo - c.ang), Math.cos(c.alvo - c.ang));
    c.ang += Math.max(-GIRO * dt, Math.min(GIRO * dt, giro));
    c.ang = Math.atan2(Math.sin(c.ang), Math.cos(c.ang));
    c.turbo = c.querTurbo && c.len > TURBO.min;
    if (c.turbo && agora >= c.gastoEm) {
      c.gastoEm = agora + TURBO.gasta;
      const [tx, ty] = amostrar(c.rastro, c.len)[c.len - 1];
      c.len--;
      bolinha(p, tx, ty, i);
    }
    const v = c.turbo ? TURBO.vel : VEL;
    c.x += Math.cos(c.ang) * v * dt;
    c.y += Math.sin(c.ang) * v * dt;
    c.rastro.unshift([c.x, c.y]);
    aparar(c.rastro, c.len);
  }

  // batidas: decide todas antes de matar (cabeça com cabeça pode matar as duas)
  const mortes = [];
  const corpos = p.cobras.map((c) => (c.vivo ? amostrar(c.rastro, c.len) : null));
  for (const [i, c] of p.cobras.entries()) {
    if (!c.vivo || agora < c.protegidoAte) continue;
    const ri = raio(c.len);
    if (!livre(p, c.x, c.y, ri * 0.6)) {
      const naParede = c.x < CAMPO.x0 + ri || c.x > CAMPO.x1 - ri || c.y < CAMPO.y0 + ri || c.y > CAMPO.y1 - ri;
      mortes.push([i, null, naParede ? 'parede' : 'pedra']);
      continue;
    }
    for (const [j, o] of p.cobras.entries()) {
      if (j === i || !o.vivo || agora < o.protegidoAte) continue;
      const rj = raio(o.len);
      if (Math.hypot(o.x - c.x, o.y - c.y) < ri + rj) {
        if (c.len <= o.len) { mortes.push([i, j, 'cabeca']); break; }
        continue;
      }
      if (corpos[j].some(([x, y], k) => k > 0 && Math.hypot(x - c.x, y - c.y) < ri * 0.8 + rj * 0.8)) { mortes.push([i, j, 'corpo']); break; }
    }
  }
  for (const [i, de, causa] of mortes) morrer(p, i, de, causa, agora);

  // comer
  for (const [i, c] of p.cobras.entries()) {
    if (!c.vivo) continue;
    const alcance = raio(c.len) + COMER;
    for (let k = p.frutas.length - 1; k >= 0; k--) {
      const f = p.frutas[k];
      if (Math.hypot(f.x - c.x, f.y - c.y) > alcance) continue;
      p.frutas.splice(k, 1);
      p.frMudou = true;
      c.len += f.cresce;
      p.comeu[i] += f.cresce;
      p.maior[i] = Math.max(p.maior[i], c.len);
      evento(p, { tipo: 'come', i, f: f.id, t: f.tipo, v: f.cresce, x: f.x, y: f.y, dono: f.dono ?? -1 });
    }
  }
  while (p.frutas.filter((f) => f.tipo !== 'bola').length < FRUTAS_MAX) novaFruta(p);

  if (agora >= p.fimEm) {
    const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const porTam = lideres(p.cobras.map(tamanho), ativos);
    const porFruta = lideres(p.comeu, porTam);
    p.fim = porTam.length === 1 ? { vencedor: porTam[0], motivo: 'tamanho' }
      : porFruta.length === 1 ? { vencedor: porFruta[0], motivo: 'frutas' }
      : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
  }
  return p;
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Informação perfeita: todo mundo vê o mesmo. As frutas só vão quando mudam (e a cada ~1/3 s, pra quem chegou agora). */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, faseAte: p.faseAte, fimEm: p.fimEm, fim: p.fim,
  cores: p.cores, fora: p.fora, comeu: p.comeu, abates: p.abates, mortes: p.mortes,
  // [x, y, ang, len, vivo, turbo, protegido]
  c: p.cobras.map((c) => [r1(c.x), r1(c.y), Math.round(c.ang * 100) / 100, c.len, c.vivo ? 1 : 0, c.turbo ? 1 : 0, agora < c.protegidoAte ? 1 : 0]),
  // [id, x, y, tipo, dono]
  ...(p.fase === 'contagem' || p.frMudou || p.tick % 10 === 0 ? { fr: p.frutas.map((f) => [f.id, f.x, f.y, f.tipo, f.dono ?? -1]) } : {}),
  ev: p.eventos,
});
