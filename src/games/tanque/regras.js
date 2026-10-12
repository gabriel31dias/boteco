/**
 * Batalha de tanques, 1×1, em tempo real. O servidor roda esta simulação (30
 * passos por segundo) e é o único que decide acerto, dano e vencedor; o
 * cliente só manda o que o jogador quer (mover, mirar, atirar) e desenha.
 *
 * Mundo de 1280×720 unidades, origem no canto de cima à esquerda. Obstáculo é
 * retângulo pelo centro (x, y) e tamanho (w, h); tanque é círculo.
 *
 * Partida: melhor de 3. Rodada acaba quando um tanque explode ou o relógio
 * zera (aí leva quem tem mais vida). Depois de 3 rodadas sem ninguém com 2,
 * decide o dano total causado; empatou nisso também, devolve as entradas.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
// O fundo (assets/tanque/fundo.webp) tem faixa escura em cima (placar) e embaixo:
// a arena jogável fica entre elas.
export const TOPO = 82;
export const BASE = 640;
export const RAIO_TANQUE = 22;
export const VIDA = 100;
export const VEL_TANQUE = 150;          // unidades/s
export const VEL_BALA = 620;
export const RAIO_BALA = 6;
export const VIDA_BALA = 1.5;           // s no ar antes de sumir
export const DANO_BALA = 20;
export const RECARGA = 500;             // ms entre tiros
export const RAIO_EXPLOSAO = 100;
export const DANO_EXPLOSAO = 45;        // no centro; cai até 0 na borda do raio
export const RODADAS = 3;
export const TEMPO_RODADA = Number(globalThis.process?.env?.TANQUE_RODADA) || 60_000;
export const CONTAGEM = Number(globalThis.process?.env?.TANQUE_CONTAGEM ?? 3000);
export const PAUSA_FIM_RODADA = Number(globalThis.process?.env?.TANQUE_PAUSA ?? 2500);
export const TICK_MS = 33;

/** De onde cada assento nasce: esquerda, direita, ponte de cima, ponte de baixo. */
export const NASCER = [
  { x: 330, y: 290, ang: 0 }, { x: 950, y: 345, ang: Math.PI },
  { x: 640, y: 168, ang: Math.PI / 2 }, { x: 640, y: 527, ang: -Math.PI / 2 },
];
export const MAX_JOGADORES = NASCER.length;
/** Cores do atlas. Cada um escolhe a sua no lobby; o servidor garante que não repete. */
export const CORES = ['azul', 'vermelho', 'verde', 'amarelo'];

// O que já vem desenhado no fundo e não quebra: [x0, y0, x1, y1] medidos na
// arte. Segura tanque e bala. Arbusto não entra: o tanque passa por cima.
const FIXOS = [
  [60, 100, 145, 220], [150, 125, 195, 245], [250, 80, 295, 130], [392, 82, 436, 132], [436, 80, 470, 125],
  [483, 120, 573, 200], [705, 102, 795, 165], [795, 80, 860, 105],
  [0, 250, 62, 462], [70, 270, 175, 355], [215, 342, 275, 430], [278, 370, 335, 430], [145, 402, 200, 430],
  [507, 300, 555, 440], [563, 300, 705, 405], [713, 300, 760, 440], [415, 462, 500, 550],
  [60, 500, 145, 585], [150, 470, 195, 575], [0, 490, 40, 580], [290, 550, 335, 610], [420, 515, 465, 600],
  [340, 590, 465, 640], [465, 555, 510, 640], [480, 500, 575, 570],
  [705, 500, 795, 565], [795, 505, 860, 580], [765, 555, 810, 620], [815, 590, 935, 640], [908, 430, 962, 565],
  [975, 108, 1015, 150], [1075, 125, 1120, 250], [1138, 112, 1265, 220], [1110, 270, 1205, 380],
  [1225, 265, 1280, 450], [1115, 410, 1205, 440], [1075, 470, 1120, 575], [1138, 500, 1265, 605],
];
// Água: segura o tanque, a bala passa por cima. As pontes de madeira são chão.
const AGUA = [[573, 80, 720, 120], [573, 215, 720, 252], [573, 570, 720, 640]];

// O que quebra é sprite desenhado por cima do fundo, em areia limpa.
export const TIPOS = {
  caixa: { w: 46, h: 42, vida: 2 },
  barril: { w: 32, h: 40, vida: 1, explode: true },
};
const QUEBRAM = [
  ['caixa', 380, 190], ['caixa', 428, 190], ['caixa', 900, 250], ['caixa', 948, 250],
  ['barril', 1000, 380], ['barril', 330, 470], ['barril', 850, 180],
];

const ret = ([x0, y0, x1, y1], extra) => ({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, ...extra });
export const MAPA = [
  ...QUEBRAM.map(([tipo, x, y]) => ({ tipo, x, y, ...TIPOS[tipo] })),
  ...FIXOS.map((r) => ret(r, { tipo: 'fixo', fixo: true })),
  ...AGUA.map((r) => ret(r, { tipo: 'agua', fixo: true, agua: true })),
];

/** Enfeite por cima de tudo (vazio: as árvores já estão no fundo). */
export const DECORACAO = [];

// ------------------------------------------------------------------ estado

const novoTanque = (assento) => ({
  ...NASCER[assento], vida: VIDA, vivo: true, movendo: false,
  entrada: { mx: 0, my: 0, ang: NASCER[assento].ang, fogo: false },
  prontoEm: 0,
});

function novaRodada(p, agora) {
  // quem saiu da partida (eliminado por W.O.) não volta nas rodadas seguintes
  p.tanques = p.cores.map((_, i) => ({ ...novoTanque(i), vivo: !p.fora[i] }));
  p.obstaculos = MAPA.map((o) => o.vida ?? null);   // vida de cada um (null = não quebra)
  p.balas = [];
  p.fase = 'contagem';
  p.faseAte = agora + CONTAGEM;
  p.rodadaAte = null;
  p.vencedorRodada = null;
}

/** `n` tanques (2 a 4), cada um com a cor escolhida (ou a do assento). Cada um por si. */
export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const vazio = (v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));
  const p = {
    rodada: 1, placar: vazio(0), dano: vazio(0), fora: vazio(false),
    cores: Array.from({ length: n }, (_, i) => (CORES.includes(cores[i]) ? cores[i] : CORES[i])),
    fim: null, ultimo: agora, seq: 0, idBala: 0, eventos: [],
    // Comandos de movimento de cada assento (ver `entrada`), o último já aplicado
    // e quanto tempo de movimento cada um ainda pode gastar.
    fila: vazio(() => []), ack: vazio(0), credito: vazio(0),
  };
  novaRodada(p, agora);
  return p;
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });

// ---------------------------------------------------------------- entrada

const num = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : 0);

export const CMD_MS_MAX = 50;      // um comando move no máximo isso
export const FILA_MAX = 40;        // comandos esperando por assento
const CREDITO_MAX = 250;           // ms de movimento acumulável (atraso de rede)

function limpa({ mx, my, ang, fogo } = {}, antes) {
  let x = num(mx, -1, 1), y = num(my, -1, 1);
  const n = Math.hypot(x, y);
  if (n > 1) { x /= n; y /= n; }
  return { mx: x, my: y, ang: Number.isFinite(Number(ang)) ? Number(ang) : antes.ang, fogo: fogo === true };
}

/**
 * O que o jogador quer. Duas formas:
 *  - `{ cmds: [{ s, mx, my, dt, ang, fogo }] }`: comandos numerados ("anda
 *    assim por dt ms"). O cliente move o próprio tanque na hora (previsão) e o
 *    servidor aplica os mesmos comandos com a mesma regra (`mover`), devolvendo
 *    em `ack` o último que aplicou. O cliente reaplica os que faltam por cima da
 *    posição oficial: sem esperar a rede pra ver o tanque andar.
 *  - `{ mx, my, ang, fogo }`: o que vale até a próxima mensagem (bots e testes).
 * Lixo vira parado; vetor maior que 1 é normalizado.
 */
export function entrada(p, assento, acao = {}) {
  const t = p.tanques?.[assento];
  if (!t || p.fim) return null;
  if (!Array.isArray(acao.cmds)) { t.entrada = limpa(acao, t.entrada); return { ok: true }; }
  const fila = p.fila[assento];
  let ultimo = fila.length ? fila[fila.length - 1].s : p.ack[assento];
  for (const c of acao.cmds.slice(0, FILA_MAX)) {
    const s = Number(c?.s);
    if (!Number.isInteger(s) || s <= ultimo) continue;      // repetido ou fora de ordem
    if (fila.length >= FILA_MAX) break;                     // cliente mandando demais: o resto cai
    fila.push({ s, dt: num(c.dt, 0, CMD_MS_MAX), ...limpa(c, t.entrada) });
    ultimo = s;
  }
  return { ok: true };
}

/** Fora do jogo (contagem, fim de rodada): os comandos contam como recebidos, mas não movem. */
function drenar(p) {
  for (const i of p.tanques.keys()) {
    const fila = p.fila[i];
    if (fila.length) {
      const c = fila[fila.length - 1];
      p.ack[i] = c.s;
      p.tanques[i].entrada = { ...c, mx: 0, my: 0 };
      fila.length = 0;
    }
    p.credito[i] = 0;
  }
}

// ------------------------------------------------------------- colisões

/** Círculo (x, y, r) encosta no retângulo do obstáculo? */
function tocaRet(x, y, r, o) {
  const dx = Math.max(Math.abs(x - o.x) - o.w / 2, 0);
  const dy = Math.max(Math.abs(y - o.y) - o.h / 2, 0);
  return dx * dx + dy * dy < r * r;
}

const solido = (p, i) => MAPA[i].vida == null || p.obstaculos[i] > 0;

/**
 * Move o tanque `i` por `dt` segundos na direção (mx, my), eixo por eixo:
 * encostou na parede, desliza por ela em vez de travar. A mesma função roda no
 * servidor e na previsão do cliente — por isso a previsão bate.
 */
export function mover(p, i, mx, my, dt) {
  const t = p.tanques[i];
  const nx = t.x + mx * VEL_TANQUE * dt, ny = t.y + my * VEL_TANQUE * dt;
  if (livre(p, nx, t.y, i)) t.x = nx;
  if (livre(p, t.x, ny, i)) t.y = ny;
}

export function livre(p, x, y, quem) {
  if (x < RAIO_TANQUE || x > LARGURA - RAIO_TANQUE || y < TOPO + RAIO_TANQUE || y > BASE - RAIO_TANQUE) return false;
  for (let i = 0; i < MAPA.length; i++) if (solido(p, i) && tocaRet(x, y, RAIO_TANQUE, MAPA[i])) return false;
  return !p.tanques.some((o, j) => j !== quem && o.vivo && Math.hypot(o.x - x, o.y - y) < RAIO_TANQUE * 2);
}

// ------------------------------------------------------------------ passo

function danificar(p, alvo, dano, de, x, y) {
  const t = p.tanques[alvo];
  if (!t.vivo || p.fase !== 'jogo') return;
  const real = Math.min(dano, t.vida);
  t.vida -= real;
  if (de != null && de !== alvo) p.dano[de] += real;
  evento(p, { tipo: 'acerto', alvo, dano: real, x, y });
  if (t.vida <= 0) {
    t.vivo = false;
    evento(p, { tipo: 'abate', alvo, de, x: t.x, y: t.y });
    conferirRodada(p);
  }
}

/** Sobrou um (ou ninguém, se uma explosão levou os últimos): a rodada acaba. */
function conferirRodada(p) {
  const vivos = p.tanques.flatMap((t, i) => (t.vivo ? [i] : []));
  if (vivos.length <= 1) terminarRodada(p, vivos[0] ?? null);
}

/** Índices com o maior valor, entre os `candidatos`. */
const lideres = (valores, candidatos) => {
  const max = Math.max(...candidatos.map((i) => valores[i]));
  return candidatos.filter((i) => valores[i] === max);
};

/**
 * Jogador saiu no meio: o tanque explode e ele não volta nas próximas rodadas
 * (a entrada dele fica no pote). Sobrou um só na partida: esse leva.
 */
export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  const t = p.tanques[i];
  if (t.vivo) {
    t.vivo = false;
    evento(p, { tipo: 'abate', alvo: i, x: t.x, y: t.y, saiu: true });
    if (p.fase === 'jogo') conferirRodada(p);
  }
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  if (ativos.length === 1) { p.fim = { vencedor: ativos[0], motivo: 'wo' }; p.fase = 'fim'; }
  return { tipo: 'saiu', assento: i };
}

/** Barril estourou: dano em área, e quebra/estoura o que estiver perto. */
function explodir(p, i, de) {
  const fila = [i];
  while (fila.length) {
    const j = fila.shift();
    const b = MAPA[j];
    evento(p, { tipo: 'explosao', x: b.x, y: b.y });
    for (const [a, t] of p.tanques.entries()) {
      const d = Math.hypot(t.x - b.x, t.y - b.y) - RAIO_TANQUE;
      if (d < RAIO_EXPLOSAO) danificar(p, a, Math.round(DANO_EXPLOSAO * (1 - Math.max(0, d) / RAIO_EXPLOSAO)), de, t.x, t.y);
    }
    for (let k = 0; k < MAPA.length; k++) {
      if (!(p.obstaculos[k] > 0) || Math.hypot(MAPA[k].x - b.x, MAPA[k].y - b.y) > RAIO_EXPLOSAO * 0.9) continue;
      p.obstaculos[k] = MAPA[k].explode ? 0 : p.obstaculos[k] - 1;
      if (MAPA[k].explode) fila.push(k);
      else evento(p, { tipo: 'caixa', i: k, vida: p.obstaculos[k], x: MAPA[k].x, y: MAPA[k].y });
    }
  }
}

function terminarRodada(p, vencedor, agora = p.ultimo) {
  if (p.fase !== 'jogo') return;
  p.fase = 'fim-rodada';
  p.faseAte = agora + PAUSA_FIM_RODADA;
  p.vencedorRodada = vencedor;
  p.balas = [];
  evento(p, { tipo: 'rodada', vencedor });
}

function fecharRodada(p, agora) {
  if (p.vencedorRodada != null) p.placar[p.vencedorRodada]++;
  const alvo = Math.ceil((RODADAS + 1) / 2);
  const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  const campeao = ativos.find((i) => p.placar[i] >= alvo);
  if (campeao != null) {
    p.fim = { vencedor: campeao, motivo: 'placar' };
  } else if (p.rodada >= RODADAS) {
    // Acabaram as rodadas: mais rodadas ganhas; empatou, quem causou mais dano.
    const porPlacar = lideres(p.placar, ativos);
    const porDano = lideres(p.dano, porPlacar);
    if (porPlacar.length === 1) p.fim = { vencedor: porPlacar[0], motivo: 'placar' };
    else if (porDano.length === 1) p.fim = { vencedor: porDano[0], motivo: 'dano' };
    else p.fim = { vencedor: null, motivo: 'empate' };
  }
  if (p.fim) { p.fase = 'fim'; return; }
  p.rodada++;
  novaRodada(p, agora);
}

/**
 * Avança a simulação até `agora`. Os eventos (tiro, acerto, explosão...) do
 * passo ficam em `p.eventos` até o próximo passo, pro servidor transmitir.
 */
export function passo(p, agora = Date.now()) {
  p.eventos = [];
  if (p.fim) return p;
  const dt = Math.min(0.05, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;

  if (p.fase === 'contagem') {
    if (agora < p.faseAte) { drenar(p); return p; }
    p.fase = 'jogo';
    p.rodadaAte = agora + TEMPO_RODADA;
    evento(p, { tipo: 'fogo' });
  }
  if (p.fase === 'fim-rodada') {
    drenar(p);
    if (agora >= p.faseAte) fecharRodada(p, agora);
    return p;
  }

  for (const [i, t] of p.tanques.entries()) {
    const fila = p.fila[i];
    if (fila.length || p.ack[i]) {
      // Por comando: cada um gasta o próprio dt do crédito, e o crédito só
      // cresce com o tempo real — mandar comando a mais não deixa ninguém
      // mais rápido, só fica na fila (e cai se passar de FILA_MAX).
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      let andou = false;
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        t.entrada = c;
        if (t.vivo && (c.mx || c.my)) { mover(p, i, c.mx, c.my, c.dt / 1000); andou = true; }
      }
      t.movendo = andou;
    } else if (t.vivo) {
      t.movendo = t.entrada.mx !== 0 || t.entrada.my !== 0;
      mover(p, i, t.entrada.mx, t.entrada.my, dt);
    }
    if (!t.vivo) continue;
    const { ang, fogo } = t.entrada;
    t.ang = ang;
    if (fogo && agora >= t.prontoEm) {
      t.prontoEm = agora + RECARGA;
      const bx = t.x + Math.cos(ang) * (RAIO_TANQUE + 12), by = t.y + Math.sin(ang) * (RAIO_TANQUE + 12);
      p.balas.push({ id: ++p.idBala, x: bx, y: by, vx: Math.cos(ang) * VEL_BALA, vy: Math.sin(ang) * VEL_BALA, dono: i, vida: VIDA_BALA });
      evento(p, { tipo: 'tiro', de: i, x: bx, y: by, ang });
    }
  }

  // Bala anda em pedaços de no máximo 10 unidades: rápida demais atravessaria o barril.
  const vivas = [];
  for (const b of p.balas) {
    b.vida -= dt;
    const passos = Math.max(1, Math.ceil((VEL_BALA * dt) / 10));
    let morreu = b.vida <= 0;
    for (let s = 0; s < passos && !morreu && p.fase === 'jogo'; s++) {
      b.x += (b.vx * dt) / passos;
      b.y += (b.vy * dt) / passos;
      if (b.x < 0 || b.x > LARGURA || b.y < TOPO || b.y > BASE) {
        evento(p, { tipo: 'impacto', x: Math.min(LARGURA, Math.max(0, b.x)), y: Math.min(BASE, Math.max(TOPO, b.y)) });
        morreu = true; break;
      }
      const alvo = p.tanques.findIndex((t, j) => j !== b.dono && t.vivo && Math.hypot(t.x - b.x, t.y - b.y) < RAIO_TANQUE + RAIO_BALA);
      if (alvo >= 0) {
        danificar(p, alvo, DANO_BALA, b.dono, b.x, b.y);
        morreu = true; break;
      }
      for (let i = 0; i < MAPA.length; i++) {
        if (MAPA[i].agua || !solido(p, i) || !tocaRet(b.x, b.y, RAIO_BALA, MAPA[i])) continue;
        morreu = true;
        if (MAPA[i].vida == null) evento(p, { tipo: 'impacto', x: b.x, y: b.y });
        else if (MAPA[i].explode) { p.obstaculos[i] = 0; explodir(p, i, b.dono); }
        else {
          p.obstaculos[i]--;
          evento(p, { tipo: 'caixa', i, vida: p.obstaculos[i], x: MAPA[i].x, y: MAPA[i].y });
        }
        break;
      }
    }
    if (!morreu && p.fase === 'jogo') vivas.push(b);
  }
  if (p.fase === 'jogo') p.balas = vivas;

  // Relógio zerou: entre os vivos, leva quem tem mais vida; empatou, ninguém pontua.
  if (p.fase === 'jogo' && agora >= p.rodadaAte) {
    const vivos = p.tanques.flatMap((t, i) => (t.vivo ? [i] : []));
    const l = lideres(p.tanques.map((t) => t.vida), vivos);
    terminarRodada(p, l.length === 1 ? l[0] : null, agora);
  }
  return p;
}

/** Informação perfeita: todo mundo vê o mesmo. Números arredondados = pacote menor. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora,
  fase: p.fase, faseAte: p.faseAte, rodadaAte: p.rodadaAte,
  rodada: p.rodada, placar: p.placar, vencedorRodada: p.vencedorRodada, fim: p.fim,
  cores: p.cores, fora: p.fora,
  // posição com 1 casa: a previsão do cliente parte daqui, arredondar pra inteiro dá tranco
  t: p.tanques.map((t, i) => [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10, Math.round(t.ang * 100) / 100, t.vida, t.vivo ? 1 : 0, t.movendo ? 1 : 0, p.ack[i]]),
  b: p.balas.map((b) => [b.id, Math.round(b.x), Math.round(b.y), Math.round(Math.atan2(b.vy, b.vx) * 100) / 100, b.dono]),
  o: p.obstaculos,
  ev: p.eventos,
});
