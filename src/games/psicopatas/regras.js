/**
 * Ratos Psicopatas: tiro de plataforma, de lado, 2 a 4 ratos no esgoto
 * tóxico, todo mundo contra todo mundo. Mesmo esquema de Ratos em Guerra
 * (games/ratos/regras.js): o servidor simula a 30 passos/s e decide tudo;
 * o cliente manda comandos e prevê o próprio rato com `mover`.
 *
 * O que muda: o mapa é a tela do esgoto (fixa, sem subir), embaixo é água
 * tóxica (caiu, derreteu) e as cascatas verdes queimam. Cada rato tem uma arma
 * de fogo e uma arma branca: `troca` (tecla Q) alterna. Arma branca corta
 * quem estiver na frente, faz o rato correr mais e abate com ela dá gore extra.
 *
 * Mundo de 1280×720, y pra baixo. (x, y) do rato é o meio da base.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
export const AGUA = 684;                  // passou daqui, derreteu
export const CHAO = AGUA;                 // pras contas do cliente (sangue, cápsula)
export const GRAVIDADE = 1900;
export const QUEDA_MAX = 950;
export const PULO = 720;
export const PULO_DUPLO = 620;
export const ATRAVESSAR = 0.25;
export const TICK_MS = 33;
export const ABATES_VITORIA = 10;
export const TEMPO_PARTIDA = Number(globalThis.process?.env?.PSICO_TEMPO) || 150_000;
export const CONTAGEM = Number(globalThis.process?.env?.PSICO_CONTAGEM ?? 3000);
export const RENASCER = Number(globalThis.process?.env?.PSICO_RENASCER ?? 2200);
export const PROTECAO = 1500;
export const RAIO_EXPLOSAO = 120;
export const DANO_EXPLOSAO = 65;
export const CABECA = 0.32;               // terço de cima da caixa: headshot
export const HEADSHOT = 3;                // headshot vale o triplo (a sniper mata com um)
export const CULPA_MS = 5000;             // caiu na água até 5s depois de levar dano: o abate é de quem bateu
export const ACIDO_DPS = 30;              // cascata verde
export const BRANCA_VEL = 1.18;           // de arma branca o rato corre mais
export const BOMBA = { max: 2, recarga: 3000, arma: 800, dura: 25_000, raio: 95, dano: 55, toque: 22 };

/**
 * Os 4 ratos. A "cor" é o id do lobby. Arma de fogo: cd (ms), bala (vel),
 * dano, vidaBala (s), espalha (rad), balas por tiro, empurra. Arma branca
 * (`b`): cd, dano, alcance (à frente), empurra.
 */
export const RATOS = {
  azul: { nome: 'Magrelo', bicho: 'magrelo', arma: 'Fuzil AK', vida: 100, vel: 275, w: 38, h: 72,
    cd: 130, bala: 1000, dano: 11, vidaBala: 1.1, espalha: 0.05, balas: 1, empurra: 110, sprite: 'ak',
    b: { nome: 'Porrete', sprite: 'porrete', cd: 420, dano: 42, alcance: 66, empurra: 420 } },
  vermelho: { nome: 'Gordo', bicho: 'gordo', arma: 'Escopeta', vida: 160, vel: 210, w: 60, h: 78,
    cd: 720, bala: 880, dano: 11, vidaBala: 0.36, espalha: 0.2, balas: 6, empurra: 260, sprite: 'escopeta',
    b: { nome: 'Frigideira', sprite: 'frigideira', cd: 560, dano: 55, alcance: 74, empurra: 700 } },
  verde: { nome: 'Bandana', bicho: 'bandana', arma: 'Metralhadora', vida: 110, vel: 250, w: 42, h: 74,
    cd: 75, bala: 920, dano: 5, vidaBala: 0.9, espalha: 0.11, balas: 1, empurra: 45, sprite: 'smg',
    b: { nome: 'Faca', sprite: 'faca', cd: 240, dano: 30, alcance: 56, empurra: 160 } },
  amarelo: { nome: 'Óculos', bicho: 'oculos', arma: 'Sniper', vida: 90, vel: 258, w: 38, h: 72,
    cd: 950, bala: 1900, dano: 55, vidaBala: 0.9, espalha: 0, balas: 1, empurra: 380, sprite: 'sniper',
    b: { nome: 'Motosserra', sprite: 'motosserra', cd: 110, dano: 12, alcance: 62, empurra: 60 } },
};
export const CORES = Object.keys(RATOS);
export const MAX_JOGADORES = 4;

// ------------------------------------------------------------------ mapa
// Medido no "Sewer Tóxico" (1672×941) × 0,7656 → mundo.

/** Passarela/plataforma: segura só por cima (S atravessa). [x0, x1, topo] */
export const PLATAFORMAS = [
  [0, 425, 413],          // passarela de cima, à esquerda (onde fica o kit)
  [198, 851, 331],        // viga de madeira do meio
  [831, 1148, 375],       // plataforma da direita
  [0, 942, 609],          // passarela de baixo, em cima da água
  [938, 1114, 655],       // degrau da pizza
  [1068, 1280, 545],      // mureta de tijolo da direita
];
/** Caixote: segura de todo lado. [x0, y0, x1, y1] */
export const CAIXAS = [
  [0, 540, 233, 609],
  [961, 547, 1064, 655],
  [978, 304, 1064, 375],
];
/** Cascatas de ácido: quem encosta queima. [x0, y0, x1, y1] */
export const ACIDO = [
  [337, 528, 383, 612],
  [1050, 222, 1102, 375],
];
/** Barril: estoura com tiro (ou golpe) e machuca quem estiver perto. Volta depois. */
export const BARRIS = [[290, 609], [380, 413], [1110, 545]];   // longe dos barris pintados no fundo
export const BARRIL = { w: 30, h: 40, volta: 15_000 };
export const ITENS = [
  { id: 'k0', tipo: 'kit', x: 200, y: 413, volta: 25_000, cura: 999 },
  { id: 'k1', tipo: 'kit', x: 1235, y: 545, volta: 25_000, cura: 999 },
  { id: 'q0', tipo: 'queijo', x: 525, y: 331, volta: 12_000, cura: 35 },
  { id: 'q1', tipo: 'queijo', x: 1020, y: 304, volta: 14_000, cura: 35 },
  { id: 'q2', tipo: 'queijo', x: 560, y: 609, volta: 14_000, cura: 35 },
];
export const NASCER = [[130, 413], [1170, 545], [300, 331], [880, 375]];
export const PEGAR = 30;

/** Compatível com o cliente de Ratos em Guerra: aqui o mapa é fixo. */
export const plataformasEntre = (_seed, yCima, yBaixo) => PLATAFORMAS.filter(([, , top]) => top >= yCima && top <= yBaixo);
export const itensEntre = (_seed, yCima, yBaixo) => ITENS.filter((it) => it.y >= yCima && it.y <= yBaixo);

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

function novoRato(cor, [x, y]) {
  const r = RATOS[cor];
  const ang = x < LARGURA / 2 ? 0 : Math.PI;
  return { x, y, vx: 0, vy: 0, kx: 0, chao: true, pulos: 0, atravessa: 0,
    vida: r.vida, vivo: true, renasceEm: 0, protegidoAte: 0, branca: false,
    ultimoDe: null, ultimoEm: 0, acidoEm: 0,
    dir: x < LARGURA / 2 ? 1 : -1, ang, movendo: false, prontoEm: 0,
    entrada: { mx: 0, pulo: false, desce: false, ang, fogo: false } };
}

export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidas = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  return {
    cores: escolhidas, ratos: escolhidas.map((c, i) => novoRato(c, NASCER[i])),
    abates: vazio(n, 0), mortes: vazio(n, 0), dano: vazio(n, 0), fora: vazio(n, false),
    barris: BARRIS.map(() => 0), seed: 0, pegos: {}, queijos: vazio(n, 0),
    balas: [], idBala: 0, seq: 0, eventos: [], bombas: [], idBomba: 0,
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
  return { mx: num(c.mx, -1, 1), pulo: c.pulo === true, desce: c.desce === true,
    ang: Number.isFinite(Number(c.ang)) ? Number(c.ang) : antes.ang, fogo: c.fogo === true,
    bomba: c.bomba === true, troca: c.troca === true };
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

const corpo = (p, i) => RATOS[p.cores[i]];
const sobre = (ax0, ax1, bx0, bx1) => ax0 < bx1 && ax1 > bx0;

function solidos(p) {
  const s = CAIXAS.slice();
  for (const [k, [x, y]] of BARRIS.entries()) if (!p.barris[k]) s.push([x - BARRIL.w / 2, y - BARRIL.h, x + BARRIL.w / 2, y]);
  return s;
}

/** Anda `dt` segundos com o comando `c`. Roda igual no servidor e na previsão. */
export function mover(p, i, c, dt) {
  const r = p.ratos[i];
  const k = corpo(p, i);
  const meio = k.w / 2;
  if (c.troca) r.branca = !r.branca;
  if (c.desce) r.atravessa = ATRAVESSAR;
  else r.atravessa = Math.max(0, r.atravessa - dt);
  if (c.pulo) {
    if (r.chao) { r.vy = -PULO; r.chao = false; r.pulos = 1; }
    else if (r.pulos < 2) { r.vy = -PULO_DUPLO; r.pulos = 2; }
  }
  r.kx *= Math.max(0, 1 - 6 * dt);
  if (Math.abs(r.kx) < 5) r.kx = 0;
  const box = solidos(p);
  const vel = k.vel * (r.branca ? BRANCA_VEL : 1);
  let nx = r.x + (c.mx * vel + r.kx) * dt;
  nx = Math.min(LARGURA - meio, Math.max(meio, nx));
  for (const [x0, y0, x1, y1] of box) {
    if (sobre(nx - meio, nx + meio, x0, x1) && sobre(r.y - k.h, r.y, y0, y1)) {
      nx = r.x < (x0 + x1) / 2 ? x0 - meio : x1 + meio;
      r.kx = 0;
    }
  }
  r.x = nx;
  const antes = r.y;
  r.vy = Math.min(QUEDA_MAX, r.vy + GRAVIDADE * dt);
  let ny = r.y + r.vy * dt;
  r.chao = false;
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
  if (ny < 40) { ny = 40; r.vy = Math.max(0, r.vy); }   // teto do esgoto
  r.y = Math.min(ny, AGUA + 80);
  if (r.chao) r.pulos = 0;
  r.movendo = c.mx !== 0;
  if (c.mx) r.dir = c.mx > 0 ? 1 : -1;
}

// ---------------------------------------------------------------- combate

function caixaDe(p, i) {
  const r = p.ratos[i], k = corpo(p, i);
  return [r.x - k.w / 2, r.y - k.h, r.x + k.w / 2, r.y];
}

function morrer(p, alvo, de, agora, extra) {
  const r = p.ratos[alvo];
  r.vivo = false;
  r.renasceEm = agora + RENASCER;
  p.mortes[alvo]++;
  if (de != null && de !== alvo) p.abates[de]++;
  evento(p, { tipo: 'abate', alvo, de: de ?? null, x: r.x, y: r.y - 30, ...extra });
  if (de != null && de !== alvo && p.abates[de] >= ABATES_VITORIA) {
    p.fim = { vencedor: de, motivo: 'abates' };
    p.fase = 'fim';
  }
}

function danificar(p, alvo, dano, de, x, y, empurra = 0, agora = p.ultimo, extra = {}) {
  const r = p.ratos[alvo];
  if (!r.vivo || agora < r.protegidoAte || p.fase !== 'jogo') return;
  const real = Math.min(extra.cabeca ? dano * HEADSHOT : dano, r.vida);
  r.vida -= real;
  r.kx += empurra;
  if (empurra) r.vy = Math.min(r.vy, -Math.min(260, Math.abs(empurra) * 0.6));
  if (de != null && de !== alvo) { p.dano[de] += real; r.ultimoDe = de; r.ultimoEm = agora; }
  evento(p, { tipo: 'acerto', alvo, de, dano: real, x, y, ...extra });
  if (r.vida <= 0) morrer(p, alvo, de, agora, { dir: Math.sign(empurra) || -r.dir, ...extra });
}

function estourar(p, fila, de, agora) {
  while (fila.length) {
    const ex = fila.shift();
    let x, y, raio, dano;
    if (ex.barril != null) {
      if (p.barris[ex.barril]) continue;
      [x, y] = BARRIS[ex.barril];
      y -= BARRIL.h / 2;
      p.barris[ex.barril] = agora + BARRIL.volta;
      raio = RAIO_EXPLOSAO; dano = DANO_EXPLOSAO;
      evento(p, { tipo: 'explosao', x, y });
    } else {
      const k = p.bombas.indexOf(ex.bomba);
      if (k < 0) continue;
      p.bombas.splice(k, 1);
      ({ x, y } = ex.bomba);
      y -= 12;
      raio = BOMBA.raio; dano = BOMBA.dano;
      evento(p, { tipo: 'explosao', x, y, bomba: true, de: ex.bomba.dono });
    }
    const autor = ex.bomba ? ex.bomba.dono : de;
    for (const i of p.ratos.keys()) {
      const r = p.ratos[i];
      if (!r.vivo) continue;
      const d = Math.hypot(r.x - x, r.y - corpo(p, i).h / 2 - y);
      if (d < raio) {
        const lado = r.x >= x ? 1 : -1;
        danificar(p, i, Math.round(dano * (1 - d / raio * 0.7)), autor, r.x, r.y - 30, lado * 520, agora, { explodiu: true });
        if (r.vivo) r.vy = -560;
      }
    }
    for (const [o, [ox, oy]] of BARRIS.entries()) {
      if (!p.barris[o] && Math.hypot(ox - x, oy - BARRIL.h / 2 - y) < raio * 1.3) fila.push({ barril: o });
    }
    for (const bm of p.bombas) if (Math.hypot(bm.x - x, bm.y - y) < raio) fila.push({ bomba: bm });
  }
}

function plantar(p, i, agora) {
  const r = p.ratos[i];
  if (!r.vivo || !r.chao || agora < (r.bombaEm ?? 0)) return;
  if (p.bombas.filter((b) => b.dono === i).length >= BOMBA.max) return;
  r.bombaEm = agora + BOMBA.recarga;
  const b = { id: ++p.idBomba, dono: i, x: Math.round(r.x), y: Math.round(r.y), armaEm: agora + BOMBA.arma, someEm: agora + BOMBA.dura };
  p.bombas.push(b);
  evento(p, { tipo: 'bomba', i, x: b.x, y: b.y });
}

function atirar(p, i, agora) {
  const r = p.ratos[i], k = corpo(p, i);
  r.prontoEm = agora + k.cd;
  const lado = Math.cos(r.ang) >= 0 ? 1 : -1;
  r.dir = lado;
  const ox = r.x + Math.cos(r.ang) * (k.w / 2 + 26), oy = r.y - k.h * 0.5 + Math.sin(r.ang) * 26;
  for (let n = 0; n < k.balas; n++) {
    const desvio = k.balas > 1 ? (n / (k.balas - 1) - 0.5) * 2 * k.espalha : (((p.idBala * 7919) % 100) / 100 - 0.5) * 2 * k.espalha;
    const a = r.ang + desvio;
    p.balas.push({ id: ++p.idBala, x: ox, y: oy, vx: Math.cos(a) * k.bala, vy: Math.sin(a) * k.bala, dono: i, vida: k.vidaBala, dano: k.dano, empurra: lado * k.empurra });
  }
  evento(p, { tipo: 'tiro', de: i, x: ox, y: oy, ang: r.ang });
}

/** Golpe de arma branca: pega todo mundo na frente, até `alcance`, da cabeça aos pés. */
function golpear(p, i, agora) {
  const r = p.ratos[i], k = corpo(p, i), b = k.b;
  r.prontoEm = agora + b.cd;
  const lado = Math.cos(r.ang) >= 0 ? 1 : -1;
  r.dir = lado;
  const gx0 = lado > 0 ? r.x : r.x - k.w / 2 - b.alcance, gx1 = lado > 0 ? r.x + k.w / 2 + b.alcance : r.x;
  const gy0 = r.y - k.h - 16, gy1 = r.y + 8;
  let acertou = false;
  for (const [j, o] of p.ratos.entries()) {
    if (j === i || !o.vivo) continue;
    const [x0, y0, x1, y1] = caixaDe(p, j);
    if (!sobre(gx0, gx1, x0, x1) || !sobre(gy0, gy1, y0, y1)) continue;
    acertou = true;
    danificar(p, j, b.dano, i, o.x, o.y - corpo(p, j).h * 0.55, lado * b.empurra, agora, { branca: true });
  }
  for (const [kk, [bx, by]] of BARRIS.entries()) {
    if (!p.barris[kk] && sobre(gx0, gx1, bx - BARRIL.w / 2, bx + BARRIL.w / 2) && sobre(gy0, gy1, by - BARRIL.h, by)) estourar(p, [{ barril: kk }], i, agora);
  }
  evento(p, { tipo: 'golpe', de: i, x: r.x + lado * (k.w / 2 + b.alcance / 2), y: r.y - k.h * 0.5, lado, acertou });
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

/** Renasce no ponto mais longe de quem está vivo. */
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
    for (const i of p.ratos.keys()) {
      const f = p.fila[i];
      if (f.length) { p.ack[i] = f[f.length - 1].s; p.ratos[i].entrada = { ...f[f.length - 1], mx: 0, pulo: false, troca: false }; f.length = 0; }
      p.credito[i] = 0;
    }
    if (agora < p.faseAte) return p;
    p.fase = 'jogo';
    p.fimEm = agora + TEMPO_PARTIDA;
    evento(p, { tipo: 'fogo' });
  }

  for (const k of p.barris.keys()) if (p.barris[k] && agora >= p.barris[k]) { p.barris[k] = 0; evento(p, { tipo: 'volta', barril: k }); }
  for (const id in p.pegos) if (agora >= p.pegos[id]) delete p.pegos[id];

  for (const [i, r] of p.ratos.entries()) {
    if (p.fora[i]) continue;
    if (!r.vivo) {
      p.fila[i].forEach((c) => { p.ack[i] = c.s; r.entrada = c; });
      p.fila[i].length = 0;
      p.credito[i] = 0;
      if (agora >= r.renasceEm) {
        const [x, y] = ondeNascer(p, i);
        Object.assign(r, novoRato(p.cores[i], [x, y]), { protegidoAte: agora + PROTECAO, prontoEm: agora + 400 });
        evento(p, { tipo: 'renasce', i, x, y });
      }
      continue;
    }
    const brancaAntes = r.branca;
    const fila = p.fila[i];
    let fogo = false;   // clique rápido: vale se algum comando do passo atacou
    if (fila.length || p.ack[i]) {
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        r.entrada = c;
        const estavaNoChao = r.chao;
        if (c.bomba) plantar(p, i, agora);
        mover(p, i, c, c.dt / 1000);
        if (c.pulo) evento(p, { tipo: 'pulo', i, x: r.x, y: r.y, duplo: !estavaNoChao });
        fogo ||= c.fogo;
      }
    } else {
      const c = r.entrada;
      fogo = c.fogo;
      if (c.bomba) plantar(p, i, agora);
      mover(p, i, c, dt);
      r.entrada = { ...c, pulo: false, bomba: false, troca: false };
    }
    if (r.branca !== brancaAntes) { r.prontoEm = Math.max(r.prontoEm, agora + 150); evento(p, { tipo: 'troca', i, branca: r.branca }); }
    r.ang = r.entrada.ang;
    if (fogo && agora >= r.prontoEm) (r.branca ? golpear : atirar)(p, i, agora);
    if (p.fim) break;
    // água tóxica: derrete. Se alguém bateu nele há pouco, o abate é dele.
    if (r.vivo && r.y >= AGUA) {
      r.vida = 0;
      const de = r.ultimoDe != null && agora - r.ultimoEm < CULPA_MS ? r.ultimoDe : null;
      morrer(p, i, de, agora, { acido: true, dir: 0 });
      continue;
    }
    // cascata de ácido: queima aos pouquinhos (o dono do último dano leva o abate)
    if (r.vivo && agora >= r.protegidoAte) {
      const [x0, y0, x1, y1] = caixaDe(p, i);
      if (ACIDO.some(([a0, b0, a1, b1]) => sobre(x0, x1, a0, a1) && sobre(y0, y1, b0, b1)) && agora >= r.acidoEm) {
        r.acidoEm = agora + 250;
        const de = r.ultimoDe != null && agora - r.ultimoEm < CULPA_MS ? r.ultimoDe : null;
        const real = Math.min(r.vida, Math.round(ACIDO_DPS / 4));
        r.vida -= real;
        evento(p, { tipo: 'queima', alvo: i, x: r.x, y: r.y - 30, dano: real });
        if (r.vida <= 0) morrer(p, i, de, agora, { acido: true, dir: 0 });
      }
    }
  }

  p.bombas = p.bombas.filter((b) => agora < b.someEm);
  for (const b of [...p.bombas]) {
    if (agora < b.armaEm || !p.bombas.includes(b)) continue;
    const pisou = p.ratos.some((r, i) => i !== b.dono && r.vivo && agora >= r.protegidoAte
      && Math.abs(r.x - b.x) < corpo(p, i).w / 2 + BOMBA.toque && r.y >= b.y - 40 && r.y <= b.y + 6);
    if (pisou) estourar(p, [{ bomba: b }], b.dono, agora);
  }

  for (const [i, r] of p.ratos.entries()) {
    if (!r.vivo || p.fora[i]) continue;
    const [x0, y0, x1, y1] = caixaDe(p, i);
    for (const it of ITENS) {
      if (p.pegos[it.id]) continue;
      if (!sobre(x0, x1, it.x - PEGAR, it.x + PEGAR) || !sobre(y0, y1, it.y - 45, it.y + 4)) continue;
      r.vida = Math.min(corpo(p, i).vida, r.vida + it.cura);
      if (it.tipo === 'queijo') p.queijos[i]++;
      p.pegos[it.id] = agora + it.volta;
      evento(p, { tipo: 'pega', i, item: it.tipo, x: it.x, y: it.y - 15 });
    }
  }

  // balas em pedaços de até 12 unidades (a sniper atravessaria o rato)
  const vivas = [];
  for (const b of p.balas) {
    b.vida -= dt;
    const vel = Math.hypot(b.vx, b.vy);
    const passos = Math.max(1, Math.ceil((vel * dt) / 12));
    let morreu = b.vida <= 0;
    for (let s = 0; s < passos && !morreu && !p.fim; s++) {
      b.x += (b.vx * dt) / passos;
      b.y += (b.vy * dt) / passos;
      if (b.x < 0 || b.x > LARGURA || b.y < 0 || b.y > AGUA) {
        if (b.y > AGUA) evento(p, { tipo: 'respingo', x: b.x, y: AGUA });
        morreu = true; break;
      }
      for (const [i, r] of p.ratos.entries()) {
        if (i === b.dono || !r.vivo || agora < r.protegidoAte) continue;
        const [x0, y0, x1, y1] = caixaDe(p, i);
        if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) {
          const cabeca = b.y <= y0 + (y1 - y0) * CABECA;
          danificar(p, i, b.dano, b.dono, b.x, b.y, b.empurra, agora, cabeca ? { cabeca: true } : {});
          morreu = true; break;
        }
      }
      if (morreu) break;
      for (const [k, [bx, by]] of BARRIS.entries()) {
        if (!p.barris[k] && Math.abs(b.x - bx) < BARRIL.w / 2 && b.y > by - BARRIL.h && b.y < by) {
          estourar(p, [{ barril: k }], b.dono, agora); morreu = true; break;
        }
      }
      if (morreu) break;
      const bomba = p.bombas.find((bm) => Math.abs(b.x - bm.x) < 14 && b.y > bm.y - 28 && b.y < bm.y + 2);
      if (bomba) { estourar(p, [{ bomba }], b.dono, agora); morreu = true; break; }
      for (const [x0, y0, x1, y1] of CAIXAS) {
        if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) { evento(p, { tipo: 'impacto', x: b.x, y: b.y }); morreu = true; break; }
      }
    }
    if (!morreu) vivas.push(b);
  }
  p.balas = p.fim ? [] : vivas;

  if (!p.fim && agora >= p.fimEm) {
    const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const porAbate = lideres(p.abates, ativos);
    const porQueijo = lideres(p.queijos, porAbate);
    const porDano = lideres(p.dano, porQueijo);
    p.fim = porAbate.length === 1 ? { vencedor: porAbate[0], motivo: 'tempo' }
      : porQueijo.length === 1 ? { vencedor: porQueijo[0], motivo: 'queijo' }
      : porDano.length === 1 ? { vencedor: porDano[0], motivo: 'dano' }
      : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
  }
  return p;
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, faseAte: p.faseAte, fimEm: p.fimEm, fim: p.fim,
  cores: p.cores, fora: p.fora, abates: p.abates, mortes: p.mortes,
  // [x, y, ang, vida, vivo, movendo, ack, vy, kx, chao, pulos, atravessa, protegido, dir, branca]
  r: p.ratos.map((r, i) => [r1(r.x), r1(r.y), Math.round(r.ang * 100) / 100, r.vida, r.vivo ? 1 : 0, r.movendo ? 1 : 0, p.ack[i],
    r1(r.vy), r1(r.kx), r.chao ? 1 : 0, r.pulos, Math.round(r.atravessa * 1000) / 1000, agora < r.protegidoAte ? 1 : 0, r.dir, r.branca ? 1 : 0]),
  b: p.balas.map((b) => [b.id, Math.round(b.x), Math.round(b.y), Math.round(Math.atan2(b.vy, b.vx) * 100) / 100, b.dono]),
  bm: p.bombas.map((b) => [b.id, b.x, b.y, b.dono, agora >= b.armaEm ? 1 : 0]),
  barris: p.barris.map((v) => (v ? 1 : 0)),
  seed: p.seed, queijos: p.queijos,
  pegos: Object.keys(p.pegos),
  ev: p.eventos,
});
