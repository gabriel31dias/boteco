/**
 * Capivara Pistola: arena tropical vista de cima, 2 a 4 capivaras, todo mundo
 * contra todo mundo. O servidor simula a 30 passos/s e decide acerto, dano e
 * placar; o cliente manda comandos (andar, mirar, atirar) e prevê a própria
 * capivara com a mesma função `mover`.
 *
 * Mundo de 1536×1024 montado com os sprites (MAPA abaixo): praia de areia
 * cercada de água, um rio no meio com duas pontes. Cada objeto tem a pegada
 * no chão (retângulo nos pés) — segura capivara e bala. Água segura a
 * capivara e a bala passa. Posições no chão: x, y = os pés.
 *
 * Partida: 2min30, quem fizer 10 abates leva. Acabou o tempo, mais abates;
 * empatou, mais dano; empatou de novo, devolve as entradas.
 */

export const LARGURA = 1536;
export const ALTURA = 1024;
export const RAIO = 26;                   // capivara: corpo (leva tiro, encosta nas outras)
export const PES = 14;                    // pés: o que bate nas coisas
export const TICK_MS = 33;
export const ABATES_VITORIA = 10;
export const TEMPO_PARTIDA = Number(globalThis.process?.env?.CAPIVARA_TEMPO) || 150_000;
export const CONTAGEM = Number(globalThis.process?.env?.CAPIVARA_CONTAGEM ?? 3000);
export const RENASCER = Number(globalThis.process?.env?.CAPIVARA_RENASCER ?? 2200);
export const PROTECAO = 1500;
export const MAX_JOGADORES = 4;

/**
 * As 4 capivaras. `cor` é o id que o lobby escolhe. Arma: cd = ms entre
 * tiros, bala = velocidade, dano, vida (s), espalha (rad), balas por tiro,
 * empurra, raio da bala; `granada` explode em área no fim do voo.
 */
export const CAPIVARAS = {
  vermelho: { nome: 'Bandana', arma: 'Frigideira', vida: 120, vel: 205,
    cd: 650, bala: 640, dano: 34, vidaBala: 0.62, espalha: 0, balas: 1, empurra: 420, raioBala: 16 },
  azul: { nome: 'Surfista', arma: "Pistola d'água", vida: 100, vel: 225,
    cd: 90, bala: 900, dano: 7, vidaBala: 0.45, espalha: 0.07, balas: 1, empurra: 60, raioBala: 7 },
  verde: { nome: 'Sargento', arma: 'Coco-granada', vida: 110, vel: 210,
    cd: 1100, bala: 560, dano: 0, vidaBala: 0.75, espalha: 0, balas: 1, empurra: 0, raioBala: 12, granada: true },
  rosa: { nome: 'Bailarina', arma: 'Melancia', vida: 110, vel: 215,
    cd: 700, bala: 760, dano: 10, vidaBala: 0.38, espalha: 0.22, balas: 5, empurra: 140, raioBala: 9 },
};
export const CORES = Object.keys(CAPIVARAS);
export const GRANADA = { raio: 115, dano: 62 };
/**
 * Super bomba: aparece de tempos em tempos (uma por vez) num dos LUGARES_SUPER.
 * Quem passar por cima guarda e usa uma vez (comando `bomba`): é lançada na
 * mira e explode ao bater ou no fim do voo, num raio enorme. Quem morre com
 * ela na mão deixa cair ali.
 */
export const SUPER = { raio: 260, dano: 190, vel: 620, vida: 0.9, primeira: 15_000, intervalo: [20_000, 35_000] };
export const LUGARES_SUPER = [[768, 686], [768, 336], [470, 540], [1066, 540], [300, 560], [1236, 560]];

// ------------------------------------------------------------------ mapa

/** Praia: retângulo arredondado. Fora dele é água. */
export const PRAIA = { x0: 70, y0: 96, x1: 1466, y1: 944, raio: 90 };
/** Rio do meio (água) e as pontes que o atravessam (chão). */
export const RIO = { x0: 724, x1: 812 };
export const PONTES = [[300, 372], [650, 722]];   // y0..y1 de cada ponte

/**
 * Tipos de objeto: largura desenhada (w) e a pegada no chão (pw × ph, nos pés).
 * `solido: false` = enfeite (não bloqueia).
 */
export const TIPOS = {
  caixa: { w: 62, pw: 54, ph: 40 },
  'caixa-alta': { w: 84, pw: 76, ph: 52 },
  barril: { w: 48, pw: 40, ph: 30 },
  pedra: { w: 92, pw: 82, ph: 40 },
  'pedra-bloco': { w: 54, pw: 50, ph: 34 },
  muro: { w: 120, pw: 116, ph: 30 },
  moita: { w: 68, pw: 60, ph: 34 },
  'moita-2': { w: 68, pw: 60, ph: 34 },
  'arbusto-alto': { w: 58, pw: 50, ph: 32 },
  pneu: { w: 56, pw: 48, ph: 28 },
  cabana: { w: 150, pw: 136, ph: 52 },
  palmeira: { w: 92, pw: 26, ph: 16 },
  'palmeira-2': { w: 110, pw: 30, ph: 16 },
  'guarda-sol': { w: 100, solido: false },
  moitinha: { w: 64, solido: false },
  'bandeira-v': { w: 46, solido: false },
  'bandeira-a': { w: 46, solido: false },
};

// Metade esquerda; a direita é o espelho (justo pros dois lados).
const METADE = [
  ['cabana', 190, 200], ['bandeira-v', 300, 190], ['palmeira', 110, 900], ['palmeira-2', 640, 170],
  ['caixa', 330, 300], ['caixa', 392, 300], ['barril', 560, 250],
  ['moita', 430, 470], ['pedra', 210, 500], ['moita-2', 610, 430],
  ['caixa-alta', 560, 600], ['muro', 330, 650], ['guarda-sol', 430, 640], ['moitinha', 150, 640],
  ['pneu', 190, 800], ['barril', 450, 830], ['caixa', 620, 860], ['arbusto-alto', 290, 900],
  ['pedra-bloco', 660, 740], ['moitinha', 520, 930],
];
const espelho = { 'bandeira-v': 'bandeira-a' };
export const MAPA = [
  ...METADE.map(([tipo, x, y]) => ({ tipo, x, y })),
  ...METADE.map(([tipo, x, y]) => ({ tipo: espelho[tipo] ?? tipo, x: LARGURA - x, y, virar: true })),
].map((o) => ({ ...o, ...TIPOS[o.tipo], solido: TIPOS[o.tipo].solido !== false }));
const SOLIDOS = MAPA.filter((o) => o.solido).map((o) => [o.x - o.pw / 2, o.y - o.ph, o.x + o.pw / 2, o.y + 4]);

/** É água aqui? (fora da praia, ou no rio fora das pontes) */
export function agua(x, y) {
  const { x0, y0, x1, y1, raio } = PRAIA;
  if (x < x0 || x > x1 || y < y0 || y > y1) return true;
  const cx = Math.min(Math.max(x, x0 + raio), x1 - raio), cy = Math.min(Math.max(y, y0 + raio), y1 - raio);
  if (Math.hypot(x - cx, y - cy) > raio) return true;
  if (x > RIO.x0 && x < RIO.x1) return !PONTES.some(([a, b]) => y > a && y < b);
  return false;
}
const dentroSolido = (x, y) => SOLIDOS.some(([a, b, c, d]) => x > a && x < c && y > b && y < d);

/** Onde cada assento nasce: um canto de cada lado. */
export const NASCER = [[200, 360], [1336, 360], [230, 720], [1306, 720]];

/** Frutas: curam. A galinha de borracha (na ponte de cima) enche a vida. */
export const ITENS = [
  { id: 'i0', tipo: 'banana', x: 470, y: 360, volta: 12_000, cura: 30 },
  { id: 'i1', tipo: 'peixe', x: 1066, y: 360, volta: 12_000, cura: 30 },
  { id: 'i2', tipo: 'melancia', x: 470, y: 740, volta: 14_000, cura: 40 },
  { id: 'i3', tipo: 'melancia', x: 1066, y: 740, volta: 14_000, cura: 40 },
  { id: 'i4', tipo: 'galinha', x: 768, y: 350, volta: 30_000, cura: 999 },
];

/** A capivara cabe aqui? (8 pontos em volta dos pés + o centro, fora da água e dos objetos) */
export function livre(p, x, y, quem) {
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2, r = k === 8 ? 0 : PES;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.6;
    if (agua(px, py) || dentroSolido(px, py)) return false;
  }
  return !p.capis.some((o, j) => j !== quem && o.vivo && Math.hypot(o.x - x, o.y - y) < RAIO * 1.6);
}
const bloqueiaBala = (x, y) => dentroSolido(x, y) || x < 0 || y < 0 || x > LARGURA || y > ALTURA;

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

function novaCapi(cor, [x, y]) {
  const k = CAPIVARAS[cor];
  const ang = x < LARGURA / 2 ? 0 : Math.PI;
  return { x, y, kx: 0, ky: 0, vida: k.vida, vivo: true, renasceEm: 0, protegidoAte: 0, prontoEm: 0,
    ang, movendo: false, entrada: { mx: 0, my: 0, ang, fogo: false } };
}

export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidas = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  return {
    cores: escolhidas, capis: escolhidas.map((c, i) => novaCapi(c, NASCER[i])),
    abates: vazio(n, 0), mortes: vazio(n, 0), dano: vazio(n, 0), fora: vazio(n, false),
    pegos: {}, balas: [], idBala: 0, seq: 0, eventos: [],
    super: null, superEm: null,        // super bomba no chão [x, y] e quando aparece a próxima
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
  let x = num(c.mx, -1, 1), y = num(c.my, -1, 1);
  const n = Math.hypot(x, y);
  if (n > 1) { x /= n; y /= n; }
  return { mx: x, my: y, ang: Number.isFinite(Number(c.ang)) ? Number(c.ang) : antes.ang, fogo: c.fogo === true, bomba: c.bomba === true };
}

/**
 * `{ cmds: [{ s, mx, my, dt, ang, fogo }] }`: comandos numerados (o cliente
 * prevê, o servidor confirma em `ack`); ou `{ mx, my, ang, fogo }` direto, que
 * vale até a próxima mensagem (testes e bots).
 */
export function entrada(p, i, acao = {}) {
  const r = p.capis?.[i];
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

/**
 * Anda `dt` segundos, eixo por eixo (encostou, desliza pela parede), com o
 * empurrão por cima. Roda igual no servidor e na previsão do cliente.
 */
export function mover(p, i, c, dt) {
  const r = p.capis[i];
  const vel = CAPIVARAS[p.cores[i]].vel;
  const f = Math.max(0, 1 - 7 * dt);
  r.kx *= f; r.ky *= f;
  if (Math.abs(r.kx) < 4) r.kx = 0;
  if (Math.abs(r.ky) < 4) r.ky = 0;
  const dx = (c.mx * vel + r.kx) * dt, dy = (c.my * vel + r.ky) * dt;
  // Bateu num eixo: tenta contornar a quina deslizando um pouco pro lado
  // (até 10px) — senão a capivara engancha na ponta de uma caixa.
  const passo = (x, y, ex, ey) => {
    if (livre(p, x + ex, y + ey, i)) return [x + ex, y + ey];
    if (!ex && !ey) return null;
    const px = ey ? 1 : 0, py = ex ? 1 : 0;   // perpendicular ao movimento
    for (const d of [3, -3, 6, -6, 10, -10]) {
      if (livre(p, x + px * d, y + py * d, i) && livre(p, x + ex + px * d, y + ey + py * d, i)) {
        const lim = Math.min(Math.abs(d), Math.hypot(ex, ey));
        return [x + ex + px * Math.sign(d) * lim, y + ey + py * Math.sign(d) * lim];
      }
    }
    return null;
  };
  const ax = passo(r.x, r.y, dx, 0);
  if (ax) [r.x, r.y] = ax; else r.kx = 0;
  const ay = passo(r.x, r.y, 0, dy);
  if (ay) [r.x, r.y] = ay; else r.ky = 0;
  r.movendo = c.mx !== 0 || c.my !== 0;
}

// ---------------------------------------------------------------- combate

function danificar(p, alvo, dano, de, x, y, ex = 0, ey = 0, agora = p.ultimo) {
  const r = p.capis[alvo];
  if (!r.vivo || agora < r.protegidoAte || p.fase !== 'jogo') return;
  const real = Math.min(dano, r.vida);
  r.vida -= real;
  r.kx += ex; r.ky += ey;
  if (de != null && de !== alvo) p.dano[de] += real;
  evento(p, { tipo: 'acerto', alvo, de, dano: real, x, y });
  if (r.vida <= 0) {
    r.vivo = false;
    if (r.super) {   // deixa cair a super bomba onde morreu
      r.super = false;
      p.super = [Math.round(r.x), Math.round(r.y)];
      evento(p, { tipo: 'super', x: r.x, y: r.y, caiu: true });
    }
    r.renasceEm = agora + RENASCER;
    p.mortes[alvo]++;
    if (de != null && de !== alvo) p.abates[de]++;
    evento(p, { tipo: 'abate', alvo, de: de ?? null, x: r.x, y: r.y, dx: Math.sign(ex) || 1 });
    if (de != null && de !== alvo && p.abates[de] >= ABATES_VITORIA) { p.fim = { vencedor: de, motivo: 'abates' }; p.fase = 'fim'; }
  }
}

function explodir(p, x, y, de, agora, forte = false) {
  const { raio, dano } = forte ? SUPER : GRANADA;
  if (forte) p.superEm = agora + SUPER.intervalo[0] + Math.random() * (SUPER.intervalo[1] - SUPER.intervalo[0]);
  evento(p, { tipo: 'explosao', x, y, ...(forte ? { super: true } : {}) });
  for (const [i, r] of p.capis.entries()) {
    if (!r.vivo) continue;
    const d = Math.hypot(r.x - x, r.y - y);
    if (d < raio) {
      const a = Math.atan2(r.y - y, r.x - x);
      const forca = forte ? 900 : 520;
      danificar(p, i, Math.round(dano * (1 - (d / raio) * (forte ? 0.4 : 0.6))), de, r.x, r.y, Math.cos(a) * forca, Math.sin(a) * forca, agora);
    }
  }
}

function lancarSuper(p, i, agora) {
  const r = p.capis[i];
  r.super = false;
  const ox = r.x + Math.cos(r.ang) * (RAIO + 22), oy = r.y + Math.sin(r.ang) * (RAIO + 22);
  p.balas.push({ id: ++p.idBala, x: ox, y: oy, vx: Math.cos(r.ang) * SUPER.vel, vy: Math.sin(r.ang) * SUPER.vel, dono: i,
    vida: SUPER.vida, dano: 0, empurra: 0, raio: 18, granada: true, super: true });
  evento(p, { tipo: 'lanca', de: i, x: ox, y: oy });
  void agora;
}

function atirar(p, i, agora) {
  const r = p.capis[i], k = CAPIVARAS[p.cores[i]];
  r.prontoEm = agora + k.cd;
  const ox = r.x + Math.cos(r.ang) * (RAIO + 22), oy = r.y + Math.sin(r.ang) * (RAIO + 22);   // no chão (desenhada mais alto)
  for (let n = 0; n < k.balas; n++) {
    const desvio = k.balas > 1 ? (n / (k.balas - 1) - 0.5) * 2 * k.espalha : (((p.idBala * 7919) % 100) / 100 - 0.5) * 2 * k.espalha;
    const a = r.ang + desvio;
    p.balas.push({ id: ++p.idBala, x: ox, y: oy, vx: Math.cos(a) * k.bala, vy: Math.sin(a) * k.bala, dono: i, vida: k.vidaBala,
      dano: k.dano, empurra: k.empurra, raio: k.raioBala, granada: !!k.granada });
  }
  evento(p, { tipo: 'tiro', de: i, x: ox, y: oy, ang: r.ang });
}

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  const r = p.capis[i];
  if (r.vivo) { r.vivo = false; evento(p, { tipo: 'abate', alvo: i, de: null, x: r.x, y: r.y, saiu: true, dx: 1 }); }
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  if (ativos.length === 1) { p.fim = { vencedor: ativos[0], motivo: 'wo' }; p.fase = 'fim'; }
  return { tipo: 'saiu', assento: i };
}

const lideres = (v, cand) => { const m = Math.max(...cand.map((i) => v[i])); return cand.filter((i) => v[i] === m); };

function ondeNascer(p, i) {
  let melhor = NASCER[i % NASCER.length], dist = -1;
  for (const pt of NASCER) {
    const d = Math.min(...p.capis.map((o, j) => (j !== i && o.vivo ? Math.hypot(o.x - pt[0], o.y - pt[1]) : 9999)));
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
    for (const i of p.capis.keys()) {
      const f = p.fila[i];
      if (f.length) { p.ack[i] = f[f.length - 1].s; p.capis[i].entrada = { ...f[f.length - 1], mx: 0, my: 0 }; f.length = 0; }
      p.credito[i] = 0;
    }
    if (agora < p.faseAte) return p;
    p.fase = 'jogo';
    p.fimEm = agora + TEMPO_PARTIDA;
    p.superEm = agora + SUPER.primeira;
    evento(p, { tipo: 'fogo' });
  }
  for (const id in p.pegos) if (agora >= p.pegos[id]) delete p.pegos[id];

  for (const [i, r] of p.capis.entries()) {
    if (p.fora[i]) continue;
    if (!r.vivo) {
      for (const c of p.fila[i]) { p.ack[i] = c.s; r.entrada = c; }
      p.fila[i].length = 0;
      p.credito[i] = 0;
      if (agora >= r.renasceEm) {
        const [x, y] = ondeNascer(p, i);
        Object.assign(r, novaCapi(p.cores[i], [x, y]), { protegidoAte: agora + PROTECAO, prontoEm: agora + 400 });
        evento(p, { tipo: 'renasce', i, x, y });
      }
      continue;
    }
    const fila = p.fila[i];
    if (fila.length || p.ack[i]) {
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      let andou = false;
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        r.entrada = c;
        mover(p, i, c, c.dt / 1000);
        if (c.bomba && r.super) lancarSuper(p, i, agora);
        andou ||= r.movendo;
      }
      r.movendo = andou;
    } else {
      mover(p, i, r.entrada, dt);
      if (r.entrada.bomba && r.super) lancarSuper(p, i, agora);
      r.entrada = { ...r.entrada, bomba: false };
    }
    r.ang = r.entrada.ang;
    if (r.entrada.fogo && agora >= r.prontoEm) atirar(p, i, agora);
  }

  // super bomba: aparece no lugar mais longe de todo mundo; quem encostar guarda
  const alguemTem = p.capis.some((r) => r.super) || p.balas.some((b) => b.super);
  if (!p.super && !alguemTem && p.superEm && agora >= p.superEm) {
    let melhor = LUGARES_SUPER[0], dist = -1;
    for (const pt of LUGARES_SUPER) {
      const d = Math.min(...p.capis.map((o) => (o.vivo ? Math.hypot(o.x - pt[0], o.y - pt[1]) : 9999)));
      if (d + Math.random() * 120 > dist) { dist = d; melhor = pt; }
    }
    p.super = [...melhor];
    p.superEm = null;
    evento(p, { tipo: 'super', x: melhor[0], y: melhor[1] });
  }
  if (p.super) {
    for (const [i, r] of p.capis.entries()) {
      if (!r.vivo || r.super || Math.hypot(r.x - p.super[0], r.y - p.super[1]) > RAIO + 34) continue;
      r.super = true;
      evento(p, { tipo: 'pega', i, item: 'superbomba', x: p.super[0], y: p.super[1] });
      p.super = null;
      break;
    }
  }

  // frutas: quem encostar leva, sempre (cura até o máximo)
  for (const it of ITENS) {
    if (p.pegos[it.id]) continue;
    for (const [i, r] of p.capis.entries()) {
      const max = CAPIVARAS[p.cores[i]].vida;
      if (!r.vivo || Math.hypot(r.x - it.x, r.y - it.y) > RAIO + 30) continue;
      r.vida = Math.min(max, r.vida + it.cura);
      p.pegos[it.id] = agora + it.volta;
      evento(p, { tipo: 'pega', i, item: it.tipo, x: it.x, y: it.y });
      break;
    }
  }

  // balas em pedaços de até 12 (a d'água é rápida); coco explode no fim ou batendo
  const vivas = [];
  for (const b of p.balas) {
    b.vida -= dt;
    const passos = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 12));
    let morreu = false;
    for (let s = 0; s < passos && !morreu && !p.fim; s++) {
      b.x += (b.vx * dt) / passos;
      b.y += (b.vy * dt) / passos;
      if (bloqueiaBala(b.x, b.y)) {
        morreu = true;
        if (b.granada) explodir(p, b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.dono, agora, b.super);
        else evento(p, { tipo: 'impacto', x: b.x, y: b.y, de: b.dono });
        break;
      }
      for (const [i, r] of p.capis.entries()) {
        if (i === b.dono || !r.vivo || agora < r.protegidoAte) continue;
        if (Math.abs(r.x - b.x) > RAIO + 6 + b.raio || Math.abs(r.y - b.y) > 24 + b.raio) continue;   // corpo, medido no chão
        morreu = true;
        if (b.granada) explodir(p, b.x, b.y, b.dono, agora, b.super);
        else {
          const a = Math.atan2(b.vy, b.vx);
          danificar(p, i, b.dano, b.dono, b.x, b.y, Math.cos(a) * b.empurra, Math.sin(a) * b.empurra, agora);
        }
        break;
      }
    }
    if (!morreu && b.vida <= 0) {
      morreu = true;
      if (b.granada) explodir(p, b.x, b.y, b.dono, agora, b.super);
    }
    if (b.granada && !morreu) { b.vx *= 1 - 1.2 * dt; b.vy *= 1 - 1.2 * dt; }   // coco perde força no ar
    if (!morreu) vivas.push(b);
  }
  p.balas = p.fim ? [] : vivas;

  if (!p.fim && agora >= p.fimEm) {
    const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const pa = lideres(p.abates, ativos), pd = lideres(p.dano, pa);
    p.fim = pa.length === 1 ? { vencedor: pa[0], motivo: 'tempo' } : pd.length === 1 ? { vencedor: pd[0], motivo: 'dano' } : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
  }
  return p;
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, faseAte: p.faseAte, fimEm: p.fimEm, fim: p.fim,
  cores: p.cores, fora: p.fora, abates: p.abates, mortes: p.mortes,
  // [x, y, ang, vida, vivo, movendo, ack, kx, ky, protegido, tem super bomba]
  c: p.capis.map((r, i) => [r1(r.x), r1(r.y), Math.round(r.ang * 100) / 100, r.vida, r.vivo ? 1 : 0, r.movendo ? 1 : 0, p.ack[i],
    r1(r.kx), r1(r.ky), agora < r.protegidoAte ? 1 : 0, r.super ? 1 : 0]),
  b: p.balas.map((b) => [b.id, Math.round(b.x), Math.round(b.y), Math.round(Math.atan2(b.vy, b.vx) * 100) / 100, b.dono]),
  pegos: Object.keys(p.pegos),
  sb: p.super,
  bs: p.balas.filter((b) => b.super).map((b) => b.id),
  ev: p.eventos,
});
