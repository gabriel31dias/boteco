/**
 * Corrida de Jegues: 2 a 4 jegues, cada um na sua raia, a mesma pista cheia
 * de obstáculos pra todos. Quem cruzar a chegada primeiro leva a entrada.
 * O servidor simula a 30 passos/s e decide tudo; o cliente só manda
 * `{ pular: true }` e `{ chicote: true }` e desenha.
 *
 *  - O jegue corre sozinho em VEL; cada chicotada empurra a velocidade pra
 *    cima, mas cansa: passou do fôlego, o jegue EMPACA (para emburrado).
 *  - Bateu num obstáculo no chão: TOMBO (para, rola na poeira, fica tonto).
 *    O tombo só vale PERDAO ms depois do contato: pulo que chegou atrasado
 *    pela rede nesse meio tempo ainda salva (ninguém perde por ping).
 *  - Cenoura na pista (no chão ou no alto): TURBO.
 *  - De vez em quando o jegue solta um PUM e ganha um empurrãozinho.
 *
 * Distâncias em px do mundo; x = quanto o jegue andou, y = altura do pulo (0 = chão).
 */

export const TICK_MS = 33;
export const PISTA = Number(globalThis.process?.env?.JEGUES_PISTA) || 15_000;
export const CONTAGEM = Number(globalThis.process?.env?.JEGUES_CONTAGEM ?? 4000);
export const TEMPO_MAX = 120_000;
export const MAX_JOGADORES = 4;
export const GRAVIDADE = 2500;
export const PERDAO = 160;
export const TOMBO = 1300;
export const EMPACA = 1500;
export const TURBO = 1600;
export const CHICOTE_MS = 90;          // chicotada mais rápida que isso não conta (auto-clicker)
export const CORPO = [-22, 28];        // o que bate, do x do jegue pra trás e pra frente (menor que o desenho: pulo justo dá)

/** Os 5 jegues: a "cor" é o id do lobby. Cada um troca um pouco de uma coisa por outra. */
export const JEGUES = {
  pepano: { nome: 'Pé de Pano', vel: 330, max: 690, pulo: 1010, folego: 7, levanta: 1 },
  costelinha: { nome: 'Costelinha', vel: 320, max: 680, pulo: 1000, folego: 7, levanta: 0.7 },
  misere: { nome: 'Miserê', vel: 325, max: 670, pulo: 1080, folego: 7, levanta: 1 },
  relampago: { nome: 'Relâmpago', vel: 340, max: 740, pulo: 990, folego: 5.5, levanta: 1 },
  jerimum: { nome: 'Jerimum', vel: 315, max: 660, pulo: 990, folego: 9, levanta: 1 },
};
export const CORES = Object.keys(JEGUES);

/** Obstáculos: largura e altura (pra passar, o jegue tem que estar acima de h). */
export const OBSTACULOS = {
  feno: { w: 60, h: 44 },
  pedras: { w: 70, h: 32 },
  caveira: { w: 44, h: 36 },
  cerca: { w: 100, h: 60 },
  cacto: { w: 40, h: 90 },
  caixotes: { w: 56, h: 54 },
  carroca: { w: 120, h: 66 },
};
const TIPOS = Object.keys(OBSTACULOS);

// ------------------------------------------------------------------ pista

/** Gerador pequeno com semente: a pista sai igual pra quem tiver a semente (testes). */
export function sorteador(semente) {
  let s = semente >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

export function gerarPista(rnd, comprimento = PISTA) {
  const obst = [], cenouras = [];
  let x = 900;
  while (x < comprimento - 600) {
    const tipo = TIPOS[Math.floor(rnd() * TIPOS.length)];
    obst.push({ id: obst.length, tipo, x: Math.round(x) });
    // às vezes uma cenoura no alto logo depois (pega no pulo) ou no chão entre dois obstáculos
    const vao = 620 + rnd() * 520 - Math.min(200, x / comprimento * 200);
    if (rnd() < 0.35) cenouras.push({ id: cenouras.length, x: Math.round(x + OBSTACULOS[tipo].w / 2), y: 150 });
    else if (rnd() < 0.3) cenouras.push({ id: cenouras.length, x: Math.round(x + vao / 2), y: 0 });
    x += OBSTACULOS[tipo].w + vao;
  }
  return { obst, cenouras };
}

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

export function novaPartida(agora = Date.now(), n = 2, cores = [], rnd = Math.random) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidos = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  return {
    n, rnd, cores: escolhidos, fase: 'contagem', largada: agora + CONTAGEM, ultimo: agora,
    pista: gerarPista(rnd),
    jegues: escolhidos.map((c) => novoJegue(c, rnd)),
    fora: vazio(n, false), entradas: vazio(n, () => []), chegada: [], seq: 0, eventos: [], fim: null,
  };
}

const novoJegue = (cor, rnd) => ({
  x: 0, y: 0, vy: 0, vel: 0, cansaco: 0, tombo: 0, empaca: 0, turbo: 0, bateu: null,
  passou: -1, comidas: [], pum: 4000 + rnd() * 6000, chicoteEm: 0, chicotadas: 0, tombos: 0,
  vmax: JEGUES[cor].max,
});

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });

// --------------------------------------------------------------- comandos

/** `{ pular: true }` e/ou `{ chicote: true }`. Guarda pra aplicar no próximo passo. */
export function agir(p, i, acao = {}) {
  if (p.fim || p.fora[i] || i == null || i < 0 || i >= p.n || !acao || typeof acao !== 'object') return null;
  const fila = p.entradas[i];
  if (fila.length >= 6) return null;
  if (acao.pular === true) fila.push('pular');
  if (acao.chicote === true) fila.push('chicote');
  return { ok: true };
}

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  evento(p, { tipo: 'saiu', i });
  const vivos = p.fora.flatMap((f, j) => (f ? [] : [j]));
  if (vivos.length === 1) { p.fim = { vencedor: vivos[0], motivo: 'wo' }; p.fase = 'fim'; }
  return { tipo: 'saiu', assento: i };
}

function comando(p, i, c, agora) {
  const j = p.jegues[i], d = JEGUES[p.cores[i]];
  if (c === 'pular') {
    // pulo que chega dentro do perdão desfaz a batida: passa por cima como se tivesse pulado na hora
    if (j.bateu && agora - j.bateu.em <= PERDAO) { j.passou = Math.max(j.passou, j.bateu.id); j.bateu = null; }
    if (j.y > 0 || j.tombo > agora || j.empaca > agora) return;
    j.vy = d.pulo;
    j.y = 0.01;
    evento(p, { tipo: 'pulo', i });
  } else if (c === 'chicote') {
    if (j.tombo > agora || j.empaca > agora || agora - j.chicoteEm < CHICOTE_MS) return;
    j.chicoteEm = agora;
    j.chicotadas++;
    j.vel = Math.min(j.vmax, j.vel + 55);
    if (j.turbo > agora) return;           // no turbo não cansa
    j.cansaco += 1;
    if (j.cansaco >= d.folego) {
      j.empaca = agora + EMPACA; j.vel = 0; j.cansaco = 0;
      evento(p, { tipo: 'empacou', i });
    }
  }
}

// ------------------------------------------------------------------ passo

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  if (p.fim) return p;
  p.tick = (p.tick ?? 0) + 1;
  const dt = Math.min(0.1, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;
  if (p.fase === 'contagem') {
    for (const f of p.entradas) f.length = 0;
    if (agora >= p.largada) { p.fase = 'corrida'; evento(p, { tipo: 'largada' }); for (const [i, j] of p.jegues.entries()) j.vel = JEGUES[p.cores[i]].vel; }
    return p;
  }
  const cruzaram = [];
  for (let i = 0; i < p.n; i++) {
    const j = p.jegues[i], d = JEGUES[p.cores[i]];
    if (p.fora[i]) { p.entradas[i].length = 0; continue; }
    for (const c of p.entradas[i]) comando(p, i, c, agora);
    p.entradas[i].length = 0;

    // batida pendente: passou o perdão sem pulo, cai
    if (j.bateu && agora - j.bateu.em > PERDAO) {
      j.passou = Math.max(j.passou, j.bateu.id);
      j.bateu = null;
      j.tombo = agora + TOMBO * d.levanta; j.vel = 0; j.vy = 0; j.y = 0; j.cansaco = 0; j.tombos++;
      evento(p, { tipo: 'tombo', i, x: Math.round(j.x) });
    }
    const parado = j.tombo > agora || j.empaca > agora;
    if (!parado) {
      if (j.vel === 0) j.vel = d.vel * 0.5;      // levantou: arranca
      const alvo = j.turbo > agora ? j.vmax * 1.12 : d.vel;
      j.vel += (alvo - j.vel) * Math.min(1, dt * (j.turbo > agora ? 4 : 0.7));
      j.cansaco = Math.max(0, j.cansaco - dt * 1.5);
      // pum: empurrãozinho de vez em quando
      j.pum -= dt * 1000;
      if (j.pum <= 0) {
        j.pum = 5000 + p.rnd() * 8000;
        j.vel = Math.min(j.vmax * 1.12, j.vel + 140);
        evento(p, { tipo: 'pum', i, forte: p.rnd() < 0.25 });
      }
    }
    const antes = j.x;
    j.x += j.vel * dt;
    if (j.y > 0) {
      j.vy -= GRAVIDADE * dt;
      j.y += j.vy * dt;
      if (j.y <= 0) { j.y = 0; j.vy = 0; evento(p, { tipo: 'pousou', i }); }
    }
    // obstáculos: no chão (abaixo da altura dele) e encostando = batida (vira tombo depois do perdão)
    if (!j.bateu && !parado) {
      for (const o of p.pista.obst) {
        if (o.id <= j.passou) continue;
        if (o.x > j.x + CORPO[1]) break;
        const w = OBSTACULOS[o.tipo];
        if (j.x + CORPO[0] > o.x + w.w) { j.passou = o.id; evento(p, { tipo: 'passou', i, o: o.id }); continue; }
        if (j.y < w.h) { j.bateu = { id: o.id, em: agora }; j.x = Math.min(j.x, o.x - CORPO[1] + 6); break; }
      }
    }
    // cenouras
    for (const c of p.pista.cenouras) {
      if (j.comidas.includes(c.id) || Math.abs(c.x - (j.x + 20)) > 50) continue;
      if (Math.abs(j.y + 50 - c.y) > 80) continue;
      j.comidas.push(c.id);
      j.turbo = agora + TURBO; j.cansaco = 0;
      evento(p, { tipo: 'cenoura', i, c: c.id });
    }
    if (antes < PISTA && j.x >= PISTA) cruzaram.push({ i, quando: dt - (j.x - PISTA) / Math.max(1, j.vel) });
  }
  if (cruzaram.length) {
    cruzaram.sort((a, b) => a.quando - b.quando);
    for (const c of cruzaram) { p.chegada.push(c.i); evento(p, { tipo: 'chegou', i: c.i, lugar: p.chegada.length }); }
    const empate = cruzaram.length > 1 && Math.abs(cruzaram[0].quando - cruzaram[1].quando) < 1e-6;
    p.fim = empate ? { vencedor: null, motivo: 'empate' } : { vencedor: cruzaram[0].i, motivo: 'chegada' };
    p.fase = 'fim';
  } else if (agora - p.largada > TEMPO_MAX) {
    const vivos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const max = Math.max(...vivos.map((j) => p.jegues[j].x));
    const lideres = vivos.filter((j) => p.jegues[j].x === max);
    p.fim = lideres.length === 1 ? { vencedor: lideres[0], motivo: 'tempo' } : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
  }
  return p;
}

/**
 * Informação perfeita: todo mundo vê o mesmo. Jegue = [x, y, vel, cansaço/fôlego, tombo?, empacado?, turbo?].
 * A pista (e as cenouras comidas) não muda: vai na contagem e depois 1 vez por segundo (quem reconecta pega).
 */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, n: p.n, fase: p.fase, largada: p.largada, fim: p.fim, fora: p.fora, cores: p.cores, chegada: p.chegada,
  comprimento: PISTA,
  ...(p.fase !== 'corrida' || (p.tick ?? 0) % 30 === 1 ? { pista: p.pista, comidas: p.jegues.map((j) => j.comidas) } : {}),
  j: p.jegues.map((j, i) => [Math.round(j.x * 10) / 10, Math.round(j.y * 10) / 10, Math.round(j.vel),
    Math.round(j.cansaco / JEGUES[p.cores[i]].folego * 100) / 100, j.tombo > agora ? 1 : 0, j.empaca > agora ? 1 : 0, j.turbo > agora ? 1 : 0]),
  ev: p.eventos,
});
