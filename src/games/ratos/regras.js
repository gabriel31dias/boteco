/**
 * Ratos em Guerra: tiro de plataforma, de lado, 2 a 4 ratos, todo mundo contra
 * todo mundo. O servidor simula a 30 passos/s e decide acerto, dano e placar;
 * o cliente manda comandos (andar, pular, descer, mirar, atirar) e prevê o
 * próprio rato com a mesma função `mover` daqui.
 *
 * Mundo de 1280×720, y pra baixo. Rato é um retângulo pelos pés: (x, y) é o
 * meio da base. Plataforma de madeira é "de um lado só": dá pra subir por
 * baixo, e segurando pra baixo atravessa. Caixa e chão seguram de todo lado.
 *
 * O mapa sobe sem fim: acima do térreo as plataformas são geradas pela
 * semente da partida (ver `fileira`), com queijos e kits pelo caminho.
 *
 * Partida: 2min30, quem fizer 10 abates primeiro leva. Acabou o tempo, mais
 * abates; empatou (ou ninguém matou), mais queijo; depois mais dano; empatou
 * em tudo, devolve as entradas.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
export const CHAO = 652;
export const GRAVIDADE = 1900;
export const QUEDA_MAX = 950;
export const PULO = 800;            // simples sobe ~168: passa folgado uma fileira (118)
export const PULO_DUPLO = 700;      // com o duplo, ~297
export const ATRAVESSAR = 0.25;           // s ignorando plataforma depois de "descer"
export const TICK_MS = 33;
export const ABATES_VITORIA = 10;
export const TEMPO_PARTIDA = Number(globalThis.process?.env?.RATOS_TEMPO) || 150_000;
export const CONTAGEM = Number(globalThis.process?.env?.RATOS_CONTAGEM ?? 3000);
export const RENASCER = Number(globalThis.process?.env?.RATOS_RENASCER ?? 2200);
export const PROTECAO = 1500;             // ms invencível depois de renascer
export const RAIO_EXPLOSAO = 110;
export const DANO_EXPLOSAO = 60;
/** Cabeça: o terço de cima do corpo. Bala ali mata na hora (headshot), qualquer arma. */
export const CABECA = 0.32;
/**
 * Bomba (mina): o rato planta no chão. Arma depois de `arma` ms; outro rato
 * que pisar em cima detona (quem plantou passa por cima à vontade). Tiro e
 * explosão de barril também detonam. Some sozinha depois de `dura`.
 */
export const BOMBA = { max: 2, recarga: 3000, arma: 800, dura: 25_000, raio: 95, dano: 55, toque: 22 };

/**
 * Os 4 ratos. A "cor" é o id que o lobby escolhe. Cada um tem a sua arma:
 *  cd = ms entre tiros, bala = velocidade, dano, vida da bala (s), espalha
 *  (rad), balas por tiro, empurrão em quem leva.
 */
export const RATOS = {
  azul: { nome: 'Zé Boné', arma: 'Fuzil', vida: 100, vel: 270, w: 34, h: 62,
    cd: 140, bala: 980, dano: 12, vidaBala: 1.1, espalha: 0.04, balas: 1, empurra: 120 },
  vermelho: { nome: 'Bolota', arma: 'Escopeta', vida: 150, vel: 215, w: 50, h: 66,
    cd: 700, bala: 880, dano: 11, vidaBala: 0.34, espalha: 0.2, balas: 6, empurra: 260 },
  verde: { nome: 'Sargento', arma: 'Sniper', vida: 90, vel: 255, w: 34, h: 62,
    cd: 950, bala: 1900, dano: 55, vidaBala: 0.9, espalha: 0, balas: 1, empurra: 380 },
  roxo: { nome: 'Punk', arma: 'Metralhadora', vida: 110, vel: 245, w: 38, h: 62,
    cd: 70, bala: 900, dano: 5, vidaBala: 0.9, espalha: 0.1, balas: 1, empurra: 45 },
};
export const CORES = Object.keys(RATOS);
export const MAX_JOGADORES = 4;

// ------------------------------------------------------------------ mapa

/** Plataforma de madeira: segura só por cima. [x0, x1, y do topo] */
export const PLATAFORMAS = [
  [70, 350, 478], [930, 1210, 478],
  [470, 810, 372],
  [130, 390, 262], [890, 1150, 262],
  [545, 735, 160],
];
/** Caixa: segura de todo lado. [x0, y0, x1, y1] */
export const CAIXAS = [
  [380, 592, 440, 652], [840, 592, 900, 652],
  [0, 560, 52, 652], [1228, 560, 1280, 652],
];
/** Barril vermelho: estoura com tiro e machuca quem estiver perto. Volta depois de um tempo. */
export const BARRIS = [[640, CHAO], [92, 478], [1188, 478]];   // nas pontas: longe de quem nasce nas plataformas
export const BARRIL = { w: 30, h: 40, volta: 15_000 };
/** Itens do térreo: queijo vale ponto e cura um pouco, kit cura tudo. Sempre dá pra pegar. */
export const ITENS = [
  { id: 'b0', tipo: 'queijo', x: 640, y: 372, volta: 12_000, cura: 35 },
  { id: 'b1', tipo: 'kit', x: 640, y: 160, volta: 25_000, cura: 999 },
  { id: 'b2', tipo: 'queijo', x: 260, y: 262, volta: 14_000, cura: 35 },
  { id: 'b3', tipo: 'queijo', x: 1020, y: 262, volta: 14_000, cura: 35 },
];
export const NASCER = [[150, 478], [1130, 478], [260, 262], [1020, 262]];
export const PEGAR = 30;   // meia largura da área de pegar item

// ------------------------------------------------------------ mapa subindo

/**
 * Acima do térreo (topo em y=160) o mapa é gerado sem fim, fileira por
 * fileira, a partir de `p.seed`: o servidor e cada cliente calculam a mesma
 * coisa, nada disso vai pela rede. Fileira j (1, 2, …) fica em y = 160 − j·ALTURA_FILEIRA
 * — dá pra subir com um pulo simples (alcança ~168; o duplo, ~297). Ímpar: uma de cada lado;
 * par: uma no meio e uma num lado. Tem queijo em quase metade, kit de vez em quando.
 */
export const ALTURA_FILEIRA = 118;
const TOPO_TERREO = 160;

function sorteador(seed) {   // mulberry32: rápido e igual em todo lugar
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FILEIRAS = new Map();   // `${seed}:${j}` -> { plataformas, itens }
export function fileira(seed, j) {
  const chave = `${seed}:${j}`;
  if (FILEIRAS.has(chave)) return FILEIRAS.get(chave);
  const r = sorteador((seed ^ Math.imul(j, 0x9E3779B1)) >>> 0);
  const y = TOPO_TERREO - j * ALTURA_FILEIRA;
  const larg = () => 170 + Math.floor(r() * 110);
  const plat = [];
  const esq = () => { const x0 = 30 + Math.floor(r() * 260), w = larg(); plat.push([x0, Math.min(600, x0 + w), y]); };
  const dir = () => { const x1 = 1250 - Math.floor(r() * 260), w = larg(); plat.push([Math.max(680, x1 - w), x1, y]); };
  if (j % 2) { esq(); dir(); } else {
    const w = 150 + Math.floor(r() * 90), c = 560 + Math.floor(r() * 160);
    plat.push([c - w / 2, c + w / 2, y]);
    (r() < 0.5 ? esq : dir)();
  }
  const itens = [];
  plat.forEach(([x0, x1], n) => {
    const sorte = r();
    if (j % 6 === 0 && n === 0 && sorte < 0.7) itens.push({ id: `${j}:${n}`, tipo: 'kit', x: Math.round((x0 + x1) / 2), y, volta: 30_000, cura: 999 });
    else if (sorte < 0.45) itens.push({ id: `${j}:${n}`, tipo: 'queijo', x: Math.round(x0 + 30 + r() * (x1 - x0 - 60)), y, volta: 20_000, cura: 35 });
  });
  const f = { plataformas: plat, itens };
  FILEIRAS.set(chave, f);
  if (FILEIRAS.size > 4000) FILEIRAS.delete(FILEIRAS.keys().next().value);
  return f;
}

/** Fileiras geradas que têm topo entre yCima e yBaixo (y cresce pra baixo). */
function fileirasEntre(yCima, yBaixo) {
  const j0 = Math.max(1, Math.ceil((TOPO_TERREO - yBaixo) / ALTURA_FILEIRA));
  const j1 = Math.floor((TOPO_TERREO - yCima) / ALTURA_FILEIRA);
  const js = [];
  for (let j = j0; j <= j1; j++) js.push(j);
  return js;
}

/** Plataformas (térreo + geradas) com topo entre yCima e yBaixo. */
export function plataformasEntre(seed, yCima, yBaixo) {
  const out = PLATAFORMAS.filter(([, , top]) => top >= yCima && top <= yBaixo);
  for (const j of fileirasEntre(yCima, yBaixo)) out.push(...fileira(seed, j).plataformas);
  return out;
}

/** Itens (térreo + gerados) com y entre yCima e yBaixo. */
export function itensEntre(seed, yCima, yBaixo) {
  const out = ITENS.filter((it) => it.y >= yCima && it.y <= yBaixo);
  for (const j of fileirasEntre(yCima, yBaixo)) out.push(...fileira(seed, j).itens);
  return out;
}

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

function novoRato(cor, [x, y]) {
  const r = RATOS[cor];
  return { x, y, vx: 0, vy: 0, kx: 0, chao: true, pulos: 0, atravessa: 0,
    vida: r.vida, vivo: true, renasceEm: 0, protegidoAte: 0,
    dir: x < LARGURA / 2 ? 1 : -1, ang: x < LARGURA / 2 ? 0 : Math.PI, movendo: false, prontoEm: 0,
    entrada: { mx: 0, pulo: false, desce: false, ang: x < LARGURA / 2 ? 0 : Math.PI, fogo: false } };
}

export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidas = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  const p = {
    cores: escolhidas, ratos: escolhidas.map((c, i) => novoRato(c, NASCER[i])),
    abates: vazio(n, 0), mortes: vazio(n, 0), dano: vazio(n, 0), fora: vazio(n, false),
    barris: BARRIS.map(() => 0),       // 0 = inteiro; senão, ms em que volta
    seed: Math.floor(Math.random() * 2 ** 31),   // o mapa que sobe sai daqui
    pegos: {},                         // id do item -> ms em que volta
    queijos: vazio(n, 0),              // desempate: abates iguais, mais queijo leva
    balas: [], idBala: 0, seq: 0, eventos: [],
    bombas: [], idBomba: 0,             // { id, dono, x, y, armaEm, someEm }
    fase: 'contagem', faseAte: agora + CONTAGEM, fimEm: null, fim: null, ultimo: agora,
    fila: vazio(n, () => []), ack: vazio(n, 0), credito: vazio(n, 0),
  };
  return p;
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });
const num = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : 0);

// ---------------------------------------------------------------- entrada

export const CMD_MS_MAX = 50;
export const FILA_MAX = 40;
const CREDITO_MAX = 250;

function limpa(c = {}, antes) {
  return { mx: num(c.mx, -1, 1), pulo: c.pulo === true, desce: c.desce === true,
    ang: Number.isFinite(Number(c.ang)) ? Number(c.ang) : antes.ang, fogo: c.fogo === true, bomba: c.bomba === true };
}

/**
 * Comandos numerados `{ cmds: [{ s, mx, pulo, desce, dt, ang, fogo }] }` (o
 * cliente prevê com eles e o servidor confirma em `ack`), ou `{ mx, ... }`
 * direto, que vale até a próxima mensagem (testes e bots).
 */
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

/** Caixas + barris inteiros: o que segura o rato de todo lado. */
function solidos(p) {
  const s = CAIXAS.slice();
  for (const [k, [x, y]] of BARRIS.entries()) if (!p.barris[k]) s.push([x - BARRIL.w / 2, y - BARRIL.h, x + BARRIL.w / 2, y]);
  return s;
}

/**
 * Anda `dt` segundos com o comando `c` (mx, pulo, desce). A mesma função roda
 * no servidor e na previsão do cliente. Eixo x primeiro (empurra contra as
 * caixas), depois y (gravidade, plataformas por cima, caixas dos dois lados).
 */
export function mover(p, i, c, dt) {
  const r = p.ratos[i];
  const k = corpo(p, i);
  const meio = k.w / 2;
  if (c.desce) r.atravessa = ATRAVESSAR;
  else r.atravessa = Math.max(0, r.atravessa - dt);
  if (c.pulo) {
    if (r.chao) { r.vy = -PULO; r.chao = false; r.pulos = 1; }
    else if (r.pulos < 2) { r.vy = -PULO_DUPLO; r.pulos = 2; }
  }
  // x: andar + empurrão (que vai sumindo)
  r.kx *= Math.max(0, 1 - 6 * dt);
  if (Math.abs(r.kx) < 5) r.kx = 0;
  const box = solidos(p);
  let nx = r.x + (c.mx * k.vel + r.kx) * dt;
  nx = Math.min(LARGURA - meio, Math.max(meio, nx));
  for (const [x0, y0, x1, y1] of box) {
    if (sobre(nx - meio, nx + meio, x0, x1) && sobre(r.y - k.h, r.y, y0, y1)) {
      nx = r.x < (x0 + x1) / 2 ? x0 - meio : x1 + meio;
      r.kx = 0;
    }
  }
  r.x = nx;
  // y
  const antes = r.y;
  r.vy = Math.min(QUEDA_MAX, r.vy + GRAVIDADE * dt);
  let ny = r.y + r.vy * dt;
  r.chao = false;
  if (ny >= CHAO) { ny = CHAO; r.vy = 0; r.chao = true; }
  if (r.vy >= 0 && !r.atravessa) {
    for (const [x0, x1, top] of plataformasEntre(p.seed, antes - 1, ny + 1)) {
      if (antes <= top + 0.01 && ny >= top && sobre(r.x - meio, r.x + meio, x0, x1)) { ny = top; r.vy = 0; r.chao = true; }
    }
  }
  for (const [x0, y0, x1, y1] of box) {
    if (!sobre(r.x - meio, r.x + meio, x0, x1) || !sobre(ny - k.h, ny, y0, y1)) continue;
    if (antes <= y0 + 0.01) { ny = y0; r.vy = 0; r.chao = true; }          // caiu em cima
    else if (antes - k.h >= y1 - 0.01) { ny = y1 + k.h; r.vy = Math.max(0, r.vy); }   // bateu a cabeça
  }
  r.y = ny;
  if (r.chao) r.pulos = 0;
  r.movendo = c.mx !== 0;
  if (c.mx) r.dir = c.mx > 0 ? 1 : -1;
}

// ---------------------------------------------------------------- combate

/** Caixa do rato (pra bala e explosão): x0, y0, x1, y1. */
function caixaDe(p, i) {
  const r = p.ratos[i], k = corpo(p, i);
  return [r.x - k.w / 2, r.y - k.h, r.x + k.w / 2, r.y];
}

function danificar(p, alvo, dano, de, x, y, empurra = 0, agora = p.ultimo, cabeca = false) {
  const r = p.ratos[alvo];
  if (!r.vivo || agora < r.protegidoAte || p.fase !== 'jogo') return;
  const real = cabeca ? r.vida : Math.min(dano, r.vida);
  r.vida -= real;
  r.kx += empurra;
  r.vy = Math.min(r.vy, empurra ? -Math.min(260, Math.abs(empurra) * 0.6) : r.vy);
  if (de != null && de !== alvo) p.dano[de] += real;
  evento(p, { tipo: 'acerto', alvo, de, dano: real, x, y, ...(cabeca ? { cabeca: true } : {}) });
  if (r.vida <= 0) {
    r.vivo = false;
    r.renasceEm = agora + RENASCER;
    p.mortes[alvo]++;
    if (de != null && de !== alvo) p.abates[de]++;
    evento(p, { tipo: 'abate', alvo, de: de ?? null, x: r.x, y: r.y - 30, dir: Math.sign(empurra) || -r.dir, ...(cabeca ? { cabeca: true } : {}) });
    if (de != null && de !== alvo && p.abates[de] >= ABATES_VITORIA) {
      p.fim = { vencedor: de, motivo: 'abates' };
      p.fase = 'fim';
    }
  }
}

/**
 * Explosão em (x, y): machuca e lança quem estiver no raio, e detona barris e
 * bombas por perto (reação em cadeia, numa fila — sem recursão).
 */
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
        danificar(p, i, Math.round(dano * (1 - d / raio * 0.7)), autor, r.x, r.y - 30, lado * 520, agora);
        if (r.vivo) r.vy = -560;   // voa
      }
    }
    for (const [o, [ox, oy]] of BARRIS.entries()) {
      if (!p.barris[o] && Math.hypot(ox - x, oy - BARRIL.h / 2 - y) < raio * 1.3) fila.push({ barril: o });
    }
    for (const bm of p.bombas) if (Math.hypot(bm.x - x, bm.y - y) < raio) fila.push({ bomba: bm });
  }
}

const explodir = (p, k, de, agora) => estourar(p, [{ barril: k }], de, agora);

/** Planta uma bomba nos pés: no chão, com recarga, no máximo BOMBA.max por rato. */
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
  const ox = r.x + lado * (k.w / 2 + 18), oy = r.y - k.h * 0.52;
  for (let n = 0; n < k.balas; n++) {
    // espalha previsível: a escopeta abre em leque, a metralhadora treme
    const desvio = k.balas > 1 ? (n / (k.balas - 1) - 0.5) * 2 * k.espalha : (((p.idBala * 7919) % 100) / 100 - 0.5) * 2 * k.espalha;
    const a = r.ang + desvio;
    p.balas.push({ id: ++p.idBala, x: ox, y: oy, vx: Math.cos(a) * k.bala, vy: Math.sin(a) * k.bala, dono: i, vida: k.vidaBala, dano: k.dano, empurra: lado * k.empurra });
  }
  evento(p, { tipo: 'tiro', de: i, x: ox, y: oy, ang: r.ang });
}

/** Saiu no meio: some da partida (a entrada fica no pote). Sobrou um, ele leva. */
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

/**
 * Onde renascer: perto da altura de quem está vivo (morrer não te joga lá
 * pra baixo enquanto os outros pegam queijo no alto), no ponto mais longe deles.
 */
function ondeNascer(p, i) {
  const vivos = p.ratos.filter((o, j) => j !== i && o.vivo && !p.fora[j]);
  let pontos = NASCER;
  if (vivos.length) {
    const alvo = vivos.reduce((s, o) => s + o.y, 0) / vivos.length;
    if (alvo < TOPO_TERREO) {
      const perto = plataformasEntre(p.seed, alvo - 260, alvo + 260).filter(([, , top]) => top < TOPO_TERREO + 1);
      if (perto.length) pontos = perto.map(([x0, x1, top]) => [Math.round((x0 + x1) / 2), top]);
    }
  }
  let melhor = pontos[i % pontos.length], dist = -1;
  for (const pt of pontos) {
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
      if (f.length) { p.ack[i] = f[f.length - 1].s; p.ratos[i].entrada = { ...f[f.length - 1], mx: 0, pulo: false }; f.length = 0; }
      p.credito[i] = 0;
    }
    if (agora < p.faseAte) return p;
    p.fase = 'jogo';
    p.fimEm = agora + TEMPO_PARTIDA;
    evento(p, { tipo: 'fogo' });
  }

  // barris e itens que voltam
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
    // comandos: cada um gasta o próprio dt do crédito, que só cresce com o tempo real
    const fila = p.fila[i];
    if (fila.length || p.ack[i]) {
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        r.entrada = c;
        const estavaNoChao = r.chao;
        if (c.bomba) plantar(p, i, agora);   // antes de andar: fica onde o rato estava
        mover(p, i, c, c.dt / 1000);
        if (c.pulo) evento(p, { tipo: 'pulo', i, x: r.x, y: r.y, duplo: !estavaNoChao });
      }
    } else {
      const c = r.entrada;
      if (c.bomba) plantar(p, i, agora);
      mover(p, i, c, dt);
      r.entrada = { ...c, pulo: false, bomba: false };
    }
    r.ang = r.entrada.ang;
    if (r.entrada.fogo && agora >= r.prontoEm) atirar(p, i, agora);
  }

  // bombas: vencida some; armada detona quando outro rato pisa
  p.bombas = p.bombas.filter((b) => agora < b.someEm);
  for (const b of [...p.bombas]) {
    if (agora < b.armaEm || !p.bombas.includes(b)) continue;
    const pisou = p.ratos.some((r, i) => i !== b.dono && r.vivo && agora >= r.protegidoAte
      && Math.abs(r.x - b.x) < corpo(p, i).w / 2 + BOMBA.toque && r.y >= b.y - 40 && r.y <= b.y + 6);
    if (pisou) estourar(p, [{ bomba: b }], b.dono, agora);
  }

  // itens: quem encostar leva — sempre (queijo vale ponto mesmo de vida cheia)
  for (const [i, r] of p.ratos.entries()) {
    if (!r.vivo || p.fora[i]) continue;
    const [x0, y0, x1, y1] = caixaDe(p, i);
    for (const it of itensEntre(p.seed, y0 - 10, y1 + 45)) {
      if (p.pegos[it.id]) continue;
      if (!sobre(x0, x1, it.x - PEGAR, it.x + PEGAR) || !sobre(y0, y1, it.y - 45, it.y + 4)) continue;
      const max = corpo(p, i).vida;
      r.vida = Math.min(max, r.vida + it.cura);
      if (it.tipo === 'queijo') p.queijos[i]++;
      p.pegos[it.id] = agora + it.volta;
      evento(p, { tipo: 'pega', i, item: it.tipo, x: it.x, y: it.y - 15 });
    }
  }

  // balas: em pedaços de até 12 unidades (a sniper atravessaria o rato)
  const vivas = [];
  for (const b of p.balas) {
    b.vida -= dt;
    const vel = Math.hypot(b.vx, b.vy);
    const passos = Math.max(1, Math.ceil((vel * dt) / 12));
    let morreu = b.vida <= 0;
    for (let s = 0; s < passos && !morreu && !p.fim; s++) {
      b.x += (b.vx * dt) / passos;
      b.y += (b.vy * dt) / passos;
      if (b.x < 0 || b.x > LARGURA || b.y > CHAO) {   // pra cima não tem teto: o mapa sobe
        if (b.y > CHAO) evento(p, { tipo: 'impacto', x: b.x, y: CHAO });
        morreu = true; break;
      }
      for (const [i, r] of p.ratos.entries()) {
        if (i === b.dono || !r.vivo || agora < r.protegidoAte) continue;
        const [x0, y0, x1, y1] = caixaDe(p, i);
        if (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) {
          const cabeca = b.y <= y0 + (y1 - y0) * CABECA;
          danificar(p, i, b.dano, b.dono, b.x, b.y, b.empurra, agora, cabeca);
          morreu = true; break;
        }
      }
      if (morreu) break;
      for (const [k, [bx, by]] of BARRIS.entries()) {
        if (!p.barris[k] && Math.abs(b.x - bx) < BARRIL.w / 2 && b.y > by - BARRIL.h && b.y < by) {
          explodir(p, k, b.dono, agora); morreu = true; break;
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
    const porQueijo = lideres(p.queijos, porAbate);   // ninguém matou (ou empatou): mais queijo leva
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
  // [x, y, ang, vida, vivo, movendo, ack, vy, kx, chao, pulos, atravessa, protegido, dir]
  r: p.ratos.map((r, i) => [r1(r.x), r1(r.y), Math.round(r.ang * 100) / 100, r.vida, r.vivo ? 1 : 0, r.movendo ? 1 : 0, p.ack[i],
    r1(r.vy), r1(r.kx), r.chao ? 1 : 0, r.pulos, Math.round(r.atravessa * 1000) / 1000, agora < r.protegidoAte ? 1 : 0, r.dir]),
  b: p.balas.map((b) => [b.id, Math.round(b.x), Math.round(b.y), Math.round(Math.atan2(b.vy, b.vx) * 100) / 100, b.dono]),
  // [id, x, y, dono, armada]
  bm: p.bombas.map((b) => [b.id, b.x, b.y, b.dono, agora >= b.armaEm ? 1 : 0]),
  barris: p.barris.map((v) => (v ? 1 : 0)),
  seed: p.seed, queijos: p.queijos,
  pegos: Object.keys(p.pegos),
  ev: p.eventos,
});
