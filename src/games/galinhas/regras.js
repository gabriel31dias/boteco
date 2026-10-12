/**
 * Galinhas Psicopatas: briga de plataforma, de lado, 2 a 4 galinhas no
 * celeiro, todo mundo contra todo mundo — só corpo a corpo. Mesmo esquema de
 * Ratos Psicopatas (games/psicopatas/regras.js): o servidor simula a 30
 * passos/s e decide tudo; o cliente manda comandos e prevê a própria galinha
 * com `mover`.
 *
 * Galinha não atira: bate. Cada arma tem tempo, dano, alcance e tipo (corte
 * sangra e decepa no abate; pancada esmaga e o cérebro voa; perfura espeta
 * longe). O terceiro golpe seguido é o golpe final (mais forte). Fora isso:
 * investida (dash com bicada), planar segurando o pulo, ovo-bomba
 * arremessado e caixas de arma que caem do céu. Espinhos no chão do meio.
 *
 * De vez em quando cai o ARCO: quem pegar passa 10s atirando flechas que
 * matam na hora (o clique atira em vez de golpear). Um arco por vez no mapa.
 *
 * Mundo de 1280×720, y pra baixo. (x, y) da galinha é o meio da base.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
export const CHAO = 628;
export const GRAVIDADE = 1900;
export const QUEDA_MAX = 950;
export const PLANAR = 170;                // segurando o pulo, cai no máximo nisso
export const PULO = 720;
export const PULO_DUPLO = 640;
export const ATRAVESSAR = 0.25;
export const TICK_MS = 33;
export const ABATES_VITORIA = 10;
export const TEMPO_PARTIDA = Number(globalThis.process?.env?.GALINHAS_TEMPO) || 150_000;
export const CONTAGEM = Number(globalThis.process?.env?.GALINHAS_CONTAGEM ?? 3000);
export const RENASCER = Number(globalThis.process?.env?.GALINHAS_RENASCER ?? 2200);
export const PROTECAO = 1500;
export const COMBO_MS = 450;              // golpe até isso depois do tempo da arma conta como seguido
export const FINAL = 1.6;                 // terceiro golpe seguido: dano e empurrão × isso
export const PRENDE = 0.3;                // golpes 1 e 2 empurram pouco: o alvo fica no alcance do combo
export const SANGRA = { ms: 2000, cada: 400, dano: 3 };   // corte deixa sangrando
export const DASH = { vel: 900, dura: 0.18, recarga: 1.4, dano: 12, empurra: 420 };
export const OVO = { recarga: 3500, vel: 640, vida: 2.5, raio: 100, dano: 45, empurra: 520 };
export const BARRIL = { w: 34, h: 44, volta: 15_000, raio: 120, dano: 60 };
export const ESPINHO = { cada: 300, dano: 9, pulo: 560 };
export const CAIXA = { cada: 9000, max: 2, queda: 700 };
/** Arco da morte: cai a cada `cada` ms (se ninguém estiver com ele), dura `dura`; a flecha mata com um acerto. */
export const ARCO = { cada: Number(globalThis.process?.env?.GALINHAS_ARCO ?? 25_000), dura: 10_000, cd: 450, vel: 1150, vida: 1.2, gravidade: 260 };

/**
 * As 4 galinhas. A "cor" é o id do lobby. `arma` é a de saída (a das caixas
 * troca); quem renasce volta com a sua.
 */
export const GALINHAS = {
  branco: { nome: 'Branquela', vida: 110, vel: 270, w: 40, h: 66, arma: 'cutelo' },
  preto: { nome: 'Pretinha', vida: 120, vel: 255, w: 42, h: 66, arma: 'facao' },
  amarelo: { nome: 'Pintada', vida: 100, vel: 285, w: 38, h: 64, arma: 'forcado' },
  vermelho: { nome: 'Ruiva', vida: 140, vel: 235, w: 46, h: 68, arma: 'porrete' },
};
export const CORES = Object.keys(GALINHAS);
export const MAX_JOGADORES = 4;

/** tipo: corte (sangra, decepa), pancada (esmaga, cérebro), perfura (alcance). cd em ms, alcance à frente. */
export const ARMAS = {
  cutelo: { nome: 'Cutelo', tipo: 'corte', cd: 330, dano: 24, alcance: 62, empurra: 260 },
  facao: { nome: 'Facão', tipo: 'corte', cd: 300, dano: 22, alcance: 72, empurra: 220 },
  machete: { nome: 'Machete', tipo: 'corte', cd: 340, dano: 26, alcance: 76, empurra: 240 },
  foice: { nome: 'Foice', tipo: 'corte', cd: 380, dano: 28, alcance: 82, empurra: 260 },
  faca: { nome: 'Faca', tipo: 'corte', cd: 200, dano: 15, alcance: 52, empurra: 140 },
  adaga: { nome: 'Adaga', tipo: 'corte', cd: 180, dano: 13, alcance: 50, empurra: 120 },
  machadinha: { nome: 'Machadinha', tipo: 'corte', cd: 340, dano: 25, alcance: 60, empurra: 260 },
  machado: { nome: 'Machado', tipo: 'corte', cd: 600, dano: 46, alcance: 74, empurra: 420 },
  porrete: { nome: 'Porrete de prego', tipo: 'pancada', cd: 480, dano: 34, alcance: 66, empurra: 520 },
  clava: { nome: 'Clava', tipo: 'pancada', cd: 520, dano: 38, alcance: 70, empurra: 560 },
  frigideira: { nome: 'Frigideira', tipo: 'pancada', cd: 450, dano: 30, alcance: 60, empurra: 720 },
  ossada: { nome: 'Martelo de osso', tipo: 'pancada', cd: 560, dano: 42, alcance: 64, empurra: 620 },
  marreta: { nome: 'Marreta', tipo: 'pancada', cd: 760, dano: 60, alcance: 72, empurra: 900 },
  osso: { nome: 'Osso', tipo: 'pancada', cd: 300, dano: 18, alcance: 58, empurra: 300 },
  forcado: { nome: 'Forcado', tipo: 'perfura', cd: 420, dano: 26, alcance: 104, empurra: 320 },
};
export const NOMES_ARMAS = Object.keys(ARMAS);

// ------------------------------------------------------------------ mapa
// Medido na "Arena da Fazenda ao Pôr do Sol" (1672×941) × 0,7656 → mundo.

/** Plataforma: segura só por cima (S atravessa). O chão segura sempre. [x0, x1, topo] */
export const PLATAFORMAS = [
  [0, 295, 316],          // sótão do celeiro da esquerda
  [280, 655, 345],        // andaime do meio
  [935, 1205, 322],       // sótão da direita
  [1105, 1280, 405],      // prateleira da direita
  [790, 1148, 490],       // tablado da direita (o do barril)
  [255, 487, 520],        // caixotes do meio
  [0, 180, 482],          // caixotes da esquerda
  [612, 698, 578],        // caixotinhos no chão
  [787, 880, 570],
];
/** Barril de fogo: estoura com golpe (ou ovo) e machuca quem estiver perto. Volta depois. */
export const BARRIS = [[540, CHAO], [40, 316]];
/** Espinhos no chão: quem pisa se fura e pula. [x0, x1] */
export const ESPINHOS = [[700, 780]];
export const ITENS = [
  { id: 'o0', tipo: 'ovo', x: 370, y: 520, volta: 12_000, cura: 35 },
  { id: 'o1', tipo: 'ovo', x: 1180, y: 405, volta: 12_000, cura: 35 },
  { id: 'o2', tipo: 'ovo', x: 610, y: 345, volta: 14_000, cura: 35 },
  { id: 'g0', tipo: 'gema', x: 60, y: 482, volta: 25_000, cura: 999 },
  { id: 'g1', tipo: 'gema', x: 1175, y: 322, volta: 25_000, cura: 999 },
];
export const NASCER = [[140, 316], [1060, 322], [450, 345], [960, 490]];
/** Onde as caixas de arma podem cair (em cima de algo). */
export const POUSOS = [[200, 316], [560, 345], [1020, 322], [880, 490], [370, 520], [300, CHAO], [1000, CHAO], [100, CHAO], [1190, 405]];
export const PEGAR = 30;

export const plataformasEntre = (_seed, yCima, yBaixo) => PLATAFORMAS.filter(([, , top]) => top >= yCima && top <= yBaixo);

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

function novaGalinha(cor, [x, y]) {
  const ang = x < LARGURA / 2 ? 0 : Math.PI;
  return { x, y, vx: 0, vy: 0, kx: 0, chao: true, pulos: 0, atravessa: 0, dash: 0, dashCd: 0,
    vida: GALINHAS[cor].vida, vivo: true, renasceEm: 0, protegidoAte: 0, arma: GALINHAS[cor].arma,
    ultimoDe: null, ultimoEm: 0, sangra: null, espinhoEm: 0, ovoEm: 0, combo: 0, golpeEm: 0, dashBateu: [], arcoAte: 0,
    dir: x < LARGURA / 2 ? 1 : -1, ang, movendo: false, prontoEm: 0,
    entrada: { mx: 0, pulo: false, asa: false, desce: false, ang, fogo: false } };
}

export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidas = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  return {
    cores: escolhidas, ratos: escolhidas.map((c, i) => novaGalinha(c, NASCER[i])),
    abates: vazio(n, 0), mortes: vazio(n, 0), dano: vazio(n, 0), fora: vazio(n, false),
    barris: BARRIS.map(() => 0), seed: 0, pegos: {}, queijos: vazio(n, 0),
    ovos: [], idOvo: 0, caixas: [], idCaixa: 0, caixaEm: agora + CONTAGEM + CAIXA.cada / 2,
    arcoEm: agora + CONTAGEM + ARCO.cada, flechas: [], idFlecha: 0,
    seq: 0, eventos: [],
    fase: 'contagem', faseAte: agora + CONTAGEM, fimEm: null, fim: null, ultimo: agora,
    fila: vazio(n, () => []), ack: vazio(n, 0), credito: vazio(n, 0),
  };
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });
const num = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : 0);

// ---------------------------------------------------------------- entrada

export const CMD_MS_MAX = 50;
export const FILA_MAX = 40;
const CREDITO_MAX = 250;

function limpa(c = {}, antes) {
  return { mx: num(c.mx, -1, 1), pulo: c.pulo === true, asa: c.asa === true, desce: c.desce === true,
    ang: Number.isFinite(Number(c.ang)) ? Number(c.ang) : antes.ang, fogo: c.fogo === true,
    dash: c.dash === true, ovo: c.ovo === true };
}

/** Comandos numerados `{ cmds: [...] }` (previsão + ack) ou `{ mx, ... }` direto (testes e bots). */
export function entrada(p, i, acao = {}) {
  const r = p.ratos?.[i];
  if (!r || p.fim || p.fora[i]) return null;
  if (!Array.isArray(acao.cmds)) { r.entrada = limpa(acao, r.entrada); return { ok: true }; }
  const fila = p.fila[i];
  let ultimo = fila.length ? fila[fila.length - 1].s : p.ack[i];
  for (const c of acao.cmds.slice(0, FILA_MAX)) {
    const s = Number(c?.s);
    if (!Number.isInteger(s) || s <= ultimo) continue;
    if (fila.length >= FILA_MAX) break;
    fila.push({ s, dt: num(c.dt, 0, CMD_MS_MAX), ...limpa(c, r.entrada) });
    ultimo = s;
  }
  return { ok: true };
}

// ---------------------------------------------------------------- física

const corpo = (p, i) => GALINHAS[p.cores[i]];
const sobre = (ax0, ax1, bx0, bx1) => ax0 < bx1 && ax1 > bx0;

function solidos(p) {
  const s = [];
  for (const [k, [x, y]] of BARRIS.entries()) if (!p.barris[k]) s.push([x - BARRIL.w / 2, y - BARRIL.h, x + BARRIL.w / 2, y]);
  return s;
}

/**
 * Anda `dt` segundos com o comando `c`. Roda igual no servidor e na previsão.
 * Investida: por DASH.dura segundos vai reto pro lado que olha, sem gravidade.
 * Planar: caindo com o pulo seguro, a queda trava em PLANAR.
 */
export function mover(p, i, c, dt) {
  const r = p.ratos[i];
  const k = corpo(p, i);
  const meio = k.w / 2;
  if (c.desce) r.atravessa = ATRAVESSAR;
  else r.atravessa = Math.max(0, r.atravessa - dt);
  r.dashCd = Math.max(0, r.dashCd - dt);
  if (c.dash && r.dashCd <= 0) {
    r.dash = DASH.dura; r.dashCd = DASH.recarga; r.dashBateu = [];
    if (c.mx) r.dir = c.mx > 0 ? 1 : -1;
    else r.dir = Math.cos(c.ang ?? r.ang) >= 0 ? 1 : -1;
  }
  if (c.pulo) {
    if (r.chao) { r.vy = -PULO; r.chao = false; r.pulos = 1; }
    else if (r.pulos < 2) { r.vy = -PULO_DUPLO; r.pulos = 2; }
  }
  r.kx *= Math.max(0, 1 - 6 * dt);
  if (Math.abs(r.kx) < 5) r.kx = 0;
  const box = solidos(p);
  const vx = r.dash > 0 ? r.dir * DASH.vel : c.mx * k.vel + r.kx;
  let nx = r.x + vx * dt;
  nx = Math.min(LARGURA - meio, Math.max(meio, nx));
  for (const [x0, y0, x1, y1] of box) {
    if (sobre(nx - meio, nx + meio, x0, x1) && sobre(r.y - k.h, r.y, y0, y1)) {
      nx = r.x < (x0 + x1) / 2 ? x0 - meio : x1 + meio;
      r.kx = 0;
    }
  }
  r.x = nx;
  const antes = r.y;
  if (r.dash > 0) { r.dash = Math.max(0, r.dash - dt); r.vy = Math.min(r.vy, 0) * 0.5; }
  else r.vy = Math.min(c.asa && r.vy > 0 ? PLANAR : QUEDA_MAX, r.vy + GRAVIDADE * dt);
  let ny = r.y + r.vy * dt;
  r.chao = false;
  if (ny >= CHAO) { ny = CHAO; r.vy = 0; r.chao = true; }
  if (r.vy >= 0 && !r.atravessa) {
    for (const [x0, x1, top] of PLATAFORMAS) {
      if (antes <= top + 0.01 && ny >= top && sobre(r.x - meio, r.x + meio, x0, x1)) { ny = top; r.vy = 0; r.chao = true; }
    }
  }
  for (const [x0, y0, x1, y1] of box) {
    if (!sobre(r.x - meio, r.x + meio, x0, x1) || !sobre(ny - k.h, ny, y0, y1)) continue;
    if (antes <= y0 + 0.01) { ny = y0; r.vy = 0; r.chao = true; }
    else if (antes - k.h >= y1 - 0.01) { ny = y1 + k.h; r.vy = Math.max(0, r.vy); }
  }
  if (ny < 30) { ny = 30; r.vy = Math.max(0, r.vy); }
  r.y = ny;
  if (r.chao) r.pulos = 0;
  r.movendo = c.mx !== 0;
  if (c.mx && r.dash <= 0) r.dir = c.mx > 0 ? 1 : -1;
}

// ---------------------------------------------------------------- combate

function caixaDe(p, i) {
  const r = p.ratos[i], k = corpo(p, i);
  return [r.x - k.w / 2, r.y - k.h, r.x + k.w / 2, r.y];
}

function morrer(p, alvo, de, agora, extra) {
  const r = p.ratos[alvo];
  r.vivo = false;
  r.sangra = null;
  r.renasceEm = agora + RENASCER;
  p.mortes[alvo]++;
  if (de != null && de !== alvo) p.abates[de]++;
  evento(p, { tipo: 'abate', alvo, de: de ?? null, x: r.x, y: r.y - 30, ...extra });
  if (de != null && de !== alvo && p.abates[de] >= ABATES_VITORIA) {
    p.fim = { vencedor: de, motivo: 'abates' };
    p.fase = 'fim';
  }
}

/** `jeito`: corte, pancada, perfura, bicada, explosao, espinho, sangue — decide como morre. */
function danificar(p, alvo, dano, de, x, y, empurra, agora, jeito, extra = {}) {
  const r = p.ratos[alvo];
  if (!r.vivo || agora < r.protegidoAte || p.fase !== 'jogo') return;
  const real = Math.min(Math.round(dano), r.vida);
  r.vida -= real;
  r.kx += empurra;
  if (empurra) r.vy = Math.min(r.vy, -Math.min(300, Math.abs(empurra) * 0.6));
  if (de != null && de !== alvo) {
    p.dano[de] += real; r.ultimoDe = de; r.ultimoEm = agora;
    if (jeito === 'corte') r.sangra = { de, ate: agora + SANGRA.ms, prox: agora + SANGRA.cada };
  }
  evento(p, { tipo: 'acerto', alvo, de, dano: real, x, y, jeito, ...extra });
  if (r.vida <= 0) {
    // morreu sangrando, no espinho ou de bicada: o abate é de quem bateu por último
    const autor = de ?? (agora - r.ultimoEm < 5000 ? r.ultimoDe : null);
    morrer(p, alvo, autor, agora, { jeito, dir: Math.sign(empurra) || -r.dir, ...extra });
  }
}

function estourar(p, x, y, raio, dano, de, agora, ovo = false) {
  evento(p, { tipo: 'explosao', x, y, ovo });
  for (const i of p.ratos.keys()) {
    const r = p.ratos[i];
    if (!r.vivo) continue;
    const d = Math.hypot(r.x - x, r.y - corpo(p, i).h / 2 - y);
    if (d < raio) {
      const lado = r.x >= x ? 1 : -1;
      danificar(p, i, dano * (1 - d / raio * 0.6), de, r.x, r.y - 30, lado * (ovo ? OVO.empurra : 560), agora, 'explosao');
      if (r.vivo) r.vy = -560;
    }
  }
  for (const [k, [bx, by]] of BARRIS.entries()) {
    if (!p.barris[k] && Math.hypot(bx - x, by - BARRIL.h / 2 - y) < raio * 1.2) explodirBarril(p, k, de, agora);
  }
}

function explodirBarril(p, k, de, agora) {
  if (p.barris[k]) return;
  p.barris[k] = agora + BARRIL.volta;
  const [x, y] = BARRIS[k];
  estourar(p, x, y - BARRIL.h / 2, BARRIL.raio, BARRIL.dano, de, agora);
}

/**
 * Golpe: pega todo mundo na frente, até o alcance da arma, da cabeça aos pés
 * (e um pouco acima, pra quem pula por cima). Golpes seguidos contam combo:
 * o terceiro é o golpe final.
 */
function golpear(p, i, agora) {
  const r = p.ratos[i], k = corpo(p, i), a = ARMAS[r.arma];
  r.combo = agora - r.golpeEm < a.cd + COMBO_MS ? (r.combo % 3) + 1 : 1;
  r.golpeEm = agora;
  const final = r.combo === 3;
  r.prontoEm = agora + a.cd * (final ? 1.35 : 1);
  const lado = Math.cos(r.ang) >= 0 ? 1 : -1;
  r.dir = lado;
  const alc = a.alcance * (final ? 1.15 : 1);
  const gx0 = lado > 0 ? r.x : r.x - k.w / 2 - alc, gx1 = lado > 0 ? r.x + k.w / 2 + alc : r.x;
  const gy0 = r.y - k.h - 26, gy1 = r.y + 10;
  let acertou = false;
  for (const [j, o] of p.ratos.entries()) {
    if (j === i || !o.vivo) continue;
    const [x0, y0, x1, y1] = caixaDe(p, j);
    if (!sobre(gx0, gx1, x0, x1) || !sobre(gy0, gy1, y0, y1)) continue;
    acertou = true;
    danificar(p, j, a.dano * (final ? FINAL : 1), i, o.x, o.y - corpo(p, j).h * 0.55, lado * a.empurra * (final ? FINAL : PRENDE), agora, a.tipo,
      { arma: r.arma, ...(final ? { final: true } : {}) });
  }
  for (const [kk, [bx, by]] of BARRIS.entries()) {
    if (!p.barris[kk] && sobre(gx0, gx1, bx - BARRIL.w / 2, bx + BARRIL.w / 2) && sobre(gy0, gy1, by - BARRIL.h, by)) explodirBarril(p, kk, i, agora);
  }
  evento(p, { tipo: 'golpe', de: i, x: r.x + lado * (k.w / 2 + alc / 2), y: r.y - k.h * 0.5, lado, combo: r.combo, arma: r.arma, acertou });
}

function arremessar(p, i, agora) {
  const r = p.ratos[i], k = corpo(p, i);
  if (agora < r.ovoEm) return;
  r.ovoEm = agora + OVO.recarga;
  const a = r.ang;
  p.ovos.push({ id: ++p.idOvo, dono: i, x: r.x + Math.cos(a) * 20, y: r.y - k.h * 0.6, vx: Math.cos(a) * OVO.vel, vy: Math.sin(a) * OVO.vel - 220, vida: OVO.vida });
  evento(p, { tipo: 'ovo', i });
}

/** Com o arco: o clique solta uma flecha pra onde mira. */
function flechar(p, i, agora) {
  const r = p.ratos[i], k = corpo(p, i);
  r.prontoEm = agora + ARCO.cd;
  r.dir = Math.cos(r.ang) >= 0 ? 1 : -1;
  const ox = r.x + Math.cos(r.ang) * (k.w / 2 + 14), oy = r.y - k.h * 0.5 + Math.sin(r.ang) * 14;
  p.flechas.push({ id: ++p.idFlecha, dono: i, x: ox, y: oy, vx: Math.cos(r.ang) * ARCO.vel, vy: Math.sin(r.ang) * ARCO.vel, vida: ARCO.vida });
  evento(p, { tipo: 'flecha', de: i, x: ox, y: oy, ang: r.ang });
}

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  const r = p.ratos[i];
  if (r.vivo) { r.vivo = false; evento(p, { tipo: 'abate', alvo: i, de: null, x: r.x, y: r.y - 30, saiu: true, dir: 1 }); }
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  if (ativos.length === 1) { p.fim = { vencedor: ativos[0], motivo: 'wo' }; p.fase = 'fim'; }
  return { tipo: 'saiu', assento: i };
}

const lideres = (valores, candidatos) => {
  const max = Math.max(...candidatos.map((i) => valores[i]));
  return candidatos.filter((i) => valores[i] === max);
};

function ondeNascer(p, i) {
  let melhor = NASCER[i % NASCER.length], dist = -1;
  for (const pt of NASCER) {
    const d = Math.min(...p.ratos.map((o, j) => (j !== i && o.vivo ? Math.hypot(o.x - pt[0], o.y - pt[1]) : 9999)));
    if (d > dist) { dist = d; melhor = pt; }
  }
  return melhor;
}

// ------------------------------------------------------------------ passo

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  if (p.fim) return p;
  const dt = Math.min(0.05, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;

  if (p.fase === 'contagem') {
    for (const i of p.ratos.keys()) {   // comandos chegam e são confirmados, mas ninguém sai do lugar
      const f = p.fila[i];
      if (f.length) { p.ack[i] = f[f.length - 1].s; p.ratos[i].entrada = { ...f[f.length - 1], mx: 0, pulo: false, dash: false, ovo: false }; f.length = 0; }
      p.credito[i] = 0;
    }
    if (agora < p.faseAte) return p;
    p.fase = 'jogo';
    p.fimEm = agora + TEMPO_PARTIDA;
    evento(p, { tipo: 'fogo' });
  }

  for (const k of p.barris.keys()) if (p.barris[k] && agora >= p.barris[k]) { p.barris[k] = 0; evento(p, { tipo: 'volta', barril: k }); }
  for (const id in p.pegos) if (agora >= p.pegos[id]) delete p.pegos[id];

  // caixa de arma caindo do céu
  if (agora >= p.caixaEm) {
    p.caixaEm = agora + CAIXA.cada;
    if (p.caixas.length < CAIXA.max) {
      const livres = POUSOS.filter(([x, y]) => !p.caixas.some((c) => c.x === x && c.y === y));
      const [x, y] = livres[Math.floor(Math.random() * livres.length)];
      const arma = NOMES_ARMAS[Math.floor(Math.random() * NOMES_ARMAS.length)];
      p.caixas.push({ id: ++p.idCaixa, x, y, arma, pousaEm: agora + CAIXA.queda });
      evento(p, { tipo: 'caixa', x, y, arma });
    }
  }
  // o arco: um por vez (nem no mapa, nem na mão de alguém)
  if (agora >= p.arcoEm) {
    p.arcoEm = agora + ARCO.cada;
    if (!p.caixas.some((c) => c.arma === 'arco') && !p.ratos.some((r) => agora < r.arcoAte)) {
      const livres = POUSOS.filter(([x, y]) => !p.caixas.some((c) => c.x === x && c.y === y));
      const [x, y] = livres[Math.floor(Math.random() * livres.length)];
      p.caixas.push({ id: ++p.idCaixa, x, y, arma: 'arco', pousaEm: agora + CAIXA.queda });
      evento(p, { tipo: 'caixa', x, y, arma: 'arco' });
    }
  }

  for (const [i, r] of p.ratos.entries()) {
    if (p.fora[i]) continue;
    if (!r.vivo) {
      p.fila[i].forEach((c) => { p.ack[i] = c.s; r.entrada = c; });
      p.fila[i].length = 0;
      p.credito[i] = 0;
      if (agora >= r.renasceEm) {
        const [x, y] = ondeNascer(p, i);
        Object.assign(r, novaGalinha(p.cores[i], [x, y]), { protegidoAte: agora + PROTECAO, prontoEm: agora + 400 });
        evento(p, { tipo: 'renasce', i, x, y });
      }
      continue;
    }
    const fila = p.fila[i];
    let ovo = false, fogo = false;   // clique rápido: vale se algum comando do passo atacou
    if (fila.length || p.ack[i]) {
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        r.entrada = c;
        const estavaNoChao = r.chao, dashAntes = r.dash;
        mover(p, i, c, c.dt / 1000);
        if (c.pulo) evento(p, { tipo: 'pulo', i, x: r.x, y: r.y, duplo: !estavaNoChao });
        if (r.dash > dashAntes) evento(p, { tipo: 'dash', i, x: r.x, y: r.y, dir: r.dir });
        ovo ||= c.ovo;
        fogo ||= c.fogo;
      }
    } else {
      const c = r.entrada, dashAntes = r.dash;
      mover(p, i, c, dt);
      if (r.dash > dashAntes) evento(p, { tipo: 'dash', i, x: r.x, y: r.y, dir: r.dir });
      ovo = c.ovo;
      fogo = c.fogo;
      r.entrada = { ...c, pulo: false, dash: false, ovo: false };
    }
    r.ang = r.entrada.ang;
    if (ovo) arremessar(p, i, agora);
    if (fogo && agora >= r.prontoEm) (agora < r.arcoAte ? flechar : golpear)(p, i, agora);
    if (p.fim) break;
    // investida: bicada em quem ela atravessar (uma vez cada)
    if (r.dash > 0) {
      const [x0, y0, x1, y1] = caixaDe(p, i);
      for (const [j, o] of p.ratos.entries()) {
        if (j === i || !o.vivo || r.dashBateu.includes(j)) continue;
        const [a0, b0, a1, b1] = caixaDe(p, j);
        if (sobre(x0 - 10, x1 + 10, a0, a1) && sobre(y0, y1, b0, b1)) {
          r.dashBateu.push(j);
          danificar(p, j, DASH.dano, i, o.x, o.y - 40, r.dir * DASH.empurra, agora, 'bicada');
        }
      }
    }
    // sangrando: perde um pouco a cada tanto
    if (r.vivo && r.sangra) {
      if (agora >= r.sangra.ate) r.sangra = null;
      else if (agora >= r.sangra.prox) {
        r.sangra.prox += SANGRA.cada;
        danificar(p, i, SANGRA.dano, r.sangra.de, r.x, r.y - 40, 0, agora, 'sangue', { sangrando: true });
      }
    }
    // espinhos: pisou, furou e pulou de dor
    if (r.vivo && r.y >= CHAO - 0.5 && agora >= r.espinhoEm && agora >= r.protegidoAte && ESPINHOS.some(([a, b]) => r.x > a && r.x < b)) {
      r.espinhoEm = agora + ESPINHO.cada;
      r.vy = -ESPINHO.pulo; r.chao = false; r.pulos = 1;
      danificar(p, i, ESPINHO.dano, null, r.x, r.y - 10, 0, agora, 'espinho');
    }
  }

  // ovos-bomba: voam em arco e estouram no que encostarem
  const vivos = [];
  for (const o of p.ovos) {
    o.vida -= dt;
    const antes = o.y;
    o.vy += 1400 * dt; o.x += o.vx * dt; o.y += o.vy * dt;
    let bum = o.vida <= 0 || o.x < 0 || o.x > LARGURA || o.y >= CHAO;
    if (!bum && o.vy > 0) bum = PLATAFORMAS.some(([x0, x1, top]) => o.x > x0 && o.x < x1 && antes <= top && o.y >= top);
    if (!bum) bum = p.ratos.some((r, j) => j !== o.dono && r.vivo && agora >= r.protegidoAte && (() => { const [x0, y0, x1, y1] = caixaDe(p, j); return o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1; })());
    if (!bum) bum = BARRIS.some(([bx, by], k) => !p.barris[k] && Math.abs(o.x - bx) < BARRIL.w / 2 && o.y > by - BARRIL.h && o.y < by);
    if (bum) estourar(p, o.x, Math.min(o.y, CHAO) - 6, OVO.raio, OVO.dano, o.dono, agora, true);
    else vivos.push(o);
    if (p.fim) break;
  }
  p.ovos = p.fim ? [] : vivos;

  // flechas: voam quase reto (caem um pouquinho) e matam o primeiro que acertarem
  const voando = [];
  for (const f of p.flechas) {
    f.vida -= dt;
    const passos = Math.max(1, Math.ceil((Math.hypot(f.vx, f.vy) * dt) / 12));
    let parou = f.vida <= 0;
    for (let s = 0; s < passos && !parou && !p.fim; s++) {
      f.vy += (ARCO.gravidade * dt) / passos;
      f.x += (f.vx * dt) / passos; f.y += (f.vy * dt) / passos;
      if (f.x < 0 || f.x > LARGURA || f.y < 0 || f.y >= CHAO) { if (f.y >= CHAO) evento(p, { tipo: 'cravou', x: f.x, y: CHAO, ang: Math.atan2(f.vy, f.vx) }); parou = true; break; }
      for (const [j, o] of p.ratos.entries()) {
        if (j === f.dono || !o.vivo || agora < o.protegidoAte) continue;
        const [x0, y0, x1, y1] = caixaDe(p, j);
        if (f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1) {
          danificar(p, j, o.vida, f.dono, f.x, f.y, Math.sign(f.vx) * 380, agora, 'flecha', { ang: Math.atan2(f.vy, f.vx) });
          parou = true; break;
        }
      }
      if (!parou) for (const [k, [bx, by]] of BARRIS.entries()) {
        if (!p.barris[k] && Math.abs(f.x - bx) < BARRIL.w / 2 && f.y > by - BARRIL.h && f.y < by) { explodirBarril(p, k, f.dono, agora); parou = true; break; }
      }
    }
    if (!parou) voando.push(f);
  }
  p.flechas = p.fim ? [] : voando;

  // itens e caixas: quem encostar leva
  for (const [i, r] of p.ratos.entries()) {
    if (!r.vivo || p.fora[i]) continue;
    const [x0, y0, x1, y1] = caixaDe(p, i);
    for (const it of ITENS) {
      if (p.pegos[it.id]) continue;
      if (!sobre(x0, x1, it.x - PEGAR, it.x + PEGAR) || !sobre(y0, y1, it.y - 45, it.y + 4)) continue;
      r.vida = Math.min(corpo(p, i).vida, r.vida + it.cura);
      r.sangra = null;
      p.queijos[i]++;
      p.pegos[it.id] = agora + it.volta;
      evento(p, { tipo: 'pega', i, item: it.tipo, x: it.x, y: it.y - 15 });
    }
    for (const c of [...p.caixas]) {
      if (agora < c.pousaEm || !sobre(x0, x1, c.x - PEGAR, c.x + PEGAR) || !sobre(y0, y1, c.y - 45, c.y + 4)) continue;
      p.caixas.splice(p.caixas.indexOf(c), 1);
      if (c.arma === 'arco') { r.arcoAte = agora + ARCO.dura; r.prontoEm = Math.min(r.prontoEm, agora); }
      else { r.arma = c.arma; r.combo = 0; }
      evento(p, { tipo: 'arma', i, arma: c.arma, x: c.x, y: c.y - 20 });
    }
  }

  if (!p.fim && agora >= p.fimEm) {
    const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const porAbate = lideres(p.abates, ativos);
    const porOvo = lideres(p.queijos, porAbate);
    const porDano = lideres(p.dano, porOvo);
    p.fim = porAbate.length === 1 ? { vencedor: porAbate[0], motivo: 'tempo' }
      : porOvo.length === 1 ? { vencedor: porOvo[0], motivo: 'queijo' }
      : porDano.length === 1 ? { vencedor: porDano[0], motivo: 'dano' }
      : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
  }
  return p;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, faseAte: p.faseAte, fimEm: p.fimEm, fim: p.fim,
  cores: p.cores, fora: p.fora, abates: p.abates, mortes: p.mortes,
  // [x, y, ang, vida, vivo, movendo, ack, vy, kx, chao, pulos, atravessa, protegido, dir, arma, dash, dashCd, sangrando, ovoPronto, arcoMs]
  r: p.ratos.map((r, i) => [r1(r.x), r1(r.y), Math.round(r.ang * 100) / 100, r.vida, r.vivo ? 1 : 0, r.movendo ? 1 : 0, p.ack[i],
    r1(r.vy), r1(r.kx), r.chao ? 1 : 0, r.pulos, r3(r.atravessa), agora < r.protegidoAte ? 1 : 0, r.dir, r.arma,
    r3(r.dash), r3(r.dashCd), r.sangra ? 1 : 0, agora >= r.ovoEm ? 1 : 0, Math.max(0, r.arcoAte - agora)]),
  // [id, x, y, dono]
  ov: p.ovos.map((o) => [o.id, Math.round(o.x), Math.round(o.y), o.dono]),
  // [id, x, y, arma, pousada]
  cx: p.caixas.map((c) => [c.id, c.x, c.y, c.arma, agora >= c.pousaEm ? 1 : 0]),
  // [id, x, y, ang, dono]
  fl: p.flechas.map((f) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(Math.atan2(f.vy, f.vx) * 100) / 100, f.dono]),
  barris: p.barris.map((v) => (v ? 1 : 0)),
  seed: p.seed, queijos: p.queijos,
  pegos: Object.keys(p.pegos),
  ev: p.eventos,
});
