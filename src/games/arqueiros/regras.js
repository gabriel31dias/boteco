/**
 * Arqueiros do Céu: duelo de arco, de lado, 2 a 4 arqueiros em ilhas
 * flutuantes, todo mundo contra todo mundo. Mesmo esquema de Ratos
 * Psicopatas (games/psicopatas/regras.js): o servidor simula a 30 passos/s e
 * decide tudo; o cliente manda comandos numerados e prevê o próprio
 * arqueiro com `mover`.
 *
 * O arco: segurando `puxa` a corda estica (carga 0→1 em PUXAR s); soltou,
 * a flecha sai mais rápida, mais reta e mais forte quanto mais puxou. A
 * flecha cai com a gravidade, crava em quem acertar (na cabeça: dano × 2),
 * nas coberturas e no chão. Puxando, anda devagar.
 *
 * Coberturas (paliçada, caixa, barril, alvo) seguram flecha e gente.
 * Agachado (no chão) o arqueiro fica baixo e cabe atrás delas. Deitado fica
 * rente ao chão: some atrás de qualquer uma, só rasteja, puxa a corda mais
 * devagar e a cabeça é a ponta da frente do corpo.
 * Aljavas no mapa: fogo (3 flechas que explodem) e gelo (3 que deixam lento).
 * Sem levar dano por um tempo, a vida volta aos poucos.
 * Embaixo é o abismo: caiu, morreu (o abate é de quem acertou por último).
 *
 * Mundo de 1280×720, y pra baixo. (x, y) do arqueiro é o meio da base.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
export const ABISMO = 800;
export const GRAVIDADE = 1900;
export const QUEDA_MAX = 950;
export const PULO = 720;
export const PULO_DUPLO = 620;
export const TICK_MS = 33;
export const ABATES_VITORIA = 10;
export const TEMPO_PARTIDA = Number(globalThis.process?.env?.ARQ_TEMPO) || 150_000;
export const CONTAGEM = Number(globalThis.process?.env?.ARQ_CONTAGEM ?? 3000);
export const RENASCER = Number(globalThis.process?.env?.ARQ_RENASCER ?? 2200);
export const PROTECAO = 1500;
export const CULPA_MS = 5000;
export const VIDA = 100;
export const VEL = 260;
export const W = 34;
export const H = 74;
export const AGACHADO = 0.6;              // altura agachado / em pé
export const DEITADO = { h: 0.3, meia: 32, rasteja: 0.15, puxa: 0.7 };   // altura / em pé, meia largura (pras flechas), velocidade e corda
export const CABECA = 0.28;               // fatia de cima da caixa: headshot
export const HEADSHOT = 2;
export const REGEN = { espera: 4000, por: 10 };   // sem dano por `espera` ms: +`por` de vida por segundo

/** O arco: tempo pra puxar inteiro, carga mínima pra sair, e a flecha conforme a carga. */
// `vida` é só trava de segurança: a flecha some quando crava, sai pelos lados ou cai no abismo.
// Pra cima ela passa do topo da tela e volta caindo (cheia, leva uns 4s pra descer).
export const ARCO = { puxar: 0.8, min: 0.12, cd: 260, lento: 0.5,
  vel: [620, 1500], dano: [16, 58], empurra: [60, 240], gravidade: 760, vida: 12 };
export const FOGO = { raio: 95, dano: 48, empurra: 520 };
export const GELO = { ms: 2500, lento: 0.45 };
export const ESPECIAL = 3;                // flechas por aljava

export const CORES = ['azul', 'vermelho', 'verde', 'roxo'];
export const MAX_JOGADORES = 4;

// ------------------------------------------------------------------ mapa
// As ilhas estão desenhadas no fundo nesses lugares (scripts/preparar-arqueiros.py).

/** Ilha: segura por cima (de baixo atravessa). Flecha crava na grama. [x0, x1, topo] */
export const PLATAFORMAS = [
  [54, 346, 470], [934, 1226, 470], [507, 773, 560],
  [317, 523, 300], [757, 963, 300], [554, 726, 170],
];
/** Cobertura: segura gente e flecha de todo lado. [x0, y0, x1, y1, sprite] */
export const COBERTURAS = [
  [306, 410, 342, 470, 'palicada'], [250, 426, 290, 470, 'caixas'],
  [938, 410, 974, 470, 'palicada'], [990, 426, 1030, 470, 'caixas'],
  [574, 516, 606, 560, 'barril'], [674, 516, 706, 560, 'barril'],
  [452, 258, 488, 300, 'caixa'], [792, 258, 828, 300, 'caixa'],
  [624, 110, 656, 170, 'alvo'],
];
export const ITENS = [
  { id: 'f0', tipo: 'fogo', x: 690, y: 170, volta: 20_000 },
  { id: 'g0', tipo: 'gelo', x: 640, y: 560, volta: 18_000 },
];
export const NASCER = [[150, 470], [1130, 470], [400, 300], [880, 300]];
export const PEGAR = 28;

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));
const lerp = (a, b, t) => a + (b - a) * t;

function novoArqueiro([x, y]) {
  const ang = x < LARGURA / 2 ? 0 : Math.PI;
  return { x, y, vx: 0, vy: 0, kx: 0, chao: true, pulos: 0, agachado: false, deitado: false,
    vida: VIDA, vivo: true, renasceEm: 0, protegidoAte: 0,
    ultimoDe: null, ultimoEm: 0, danoEm: 0, geladoAte: 0, carga: 0, especial: null, nEspecial: 0,
    dir: x < LARGURA / 2 ? 1 : -1, ang, movendo: false, prontoEm: 0,
    entrada: { mx: 0, pulo: false, agacha: false, deita: false, ang, puxa: false } };
}

export function novaPartida(agora = Date.now(), n = 2, cores = []) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const escolhidas = vazio(n, null).map((_, i) => (CORES.includes(cores[i]) && cores.indexOf(cores[i]) === i ? cores[i] : livres.shift()));
  return {
    cores: escolhidas, arqueiros: escolhidas.map((_, i) => novoArqueiro(NASCER[i])),
    abates: vazio(n, 0), mortes: vazio(n, 0), dano: vazio(n, 0), cabecas: vazio(n, 0), fora: vazio(n, false),
    pegos: {}, flechas: [], idFlecha: 0, seq: 0, eventos: [],
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
  return { mx: num(c.mx, -1, 1), pulo: c.pulo === true, agacha: c.agacha === true, deita: c.deita === true,
    ang: Number.isFinite(Number(c.ang)) ? Number(c.ang) : antes.ang, puxa: c.puxa === true };
}

/** Comandos numerados `{ cmds: [...] }` (previsão + ack) ou `{ mx, ... }` direto (testes e bots). */
export function entrada(p, i, acao = {}) {
  const r = p.arqueiros?.[i];
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

const sobre = (ax0, ax1, bx0, bx1) => ax0 < bx1 && ax1 > bx0;
export const altura = (r) => (r.deitado ? H * DEITADO.h : r.agachado ? H * AGACHADO : H);

/**
 * Anda `dt` segundos com o comando `c`. Roda igual no servidor e na previsão
 * (`agora` só pesa no gelo; a previsão passa o mesmo do último estado).
 */
export function mover(p, i, c, dt, agora = p.ultimo) {
  const r = p.arqueiros[i];
  const meio = W / 2;
  if (c.pulo && !r.agachado && !r.deitado) {
    if (r.chao) { r.vy = -PULO; r.chao = false; r.pulos = 1; }
    else if (r.pulos < 2) { r.vy = -PULO_DUPLO; r.pulos = 2; }
  }
  r.deitado = c.deita && r.chao;
  r.agachado = !r.deitado && c.agacha && r.chao;
  r.kx *= Math.max(0, 1 - 6 * dt);
  if (Math.abs(r.kx) < 5) r.kx = 0;
  const vel = VEL * (c.puxa ? ARCO.lento : 1) * (r.deitado ? DEITADO.rasteja : r.agachado ? 0.35 : 1) * (agora < r.geladoAte ? GELO.lento : 1);
  const h = altura(r);
  let nx = r.x + (c.mx * vel + r.kx) * dt;
  nx = Math.min(LARGURA - meio, Math.max(meio, nx));
  for (const [x0, y0, x1, y1] of COBERTURAS) {
    if (sobre(nx - meio, nx + meio, x0, x1) && sobre(r.y - h, r.y, y0, y1)) {
      nx = r.x < (x0 + x1) / 2 ? x0 - meio : x1 + meio;
      r.kx = 0;
    }
  }
  r.x = nx;
  const antes = r.y;
  r.vy = Math.min(QUEDA_MAX, r.vy + GRAVIDADE * dt);
  let ny = r.y + r.vy * dt;
  r.chao = false;
  if (r.vy >= 0) {
    for (const [x0, x1, top] of PLATAFORMAS) {
      if (antes <= top + 0.01 && ny >= top && sobre(r.x - meio, r.x + meio, x0, x1)) { ny = top; r.vy = 0; r.chao = true; }
    }
  }
  for (const [x0, y0, x1, y1] of COBERTURAS) {
    if (!sobre(r.x - meio, r.x + meio, x0, x1) || !sobre(ny - h, ny, y0, y1)) continue;
    if (antes <= y0 + 0.01) { ny = y0; r.vy = 0; r.chao = true; }
    else if (antes - h >= y1 - 0.01) { ny = y1 + h; r.vy = Math.max(0, r.vy); }
  }
  if (ny < 30) { ny = 30; r.vy = Math.max(0, r.vy); }
  r.y = Math.min(ny, ABISMO + 40);
  if (r.chao) r.pulos = 0;
  else { r.agachado = false; r.deitado = false; }
  r.movendo = c.mx !== 0;
  if (c.puxa) r.dir = Math.cos(c.ang) >= 0 ? 1 : -1;
  else if (c.mx) r.dir = c.mx > 0 ? 1 : -1;
}

// ---------------------------------------------------------------- combate

/** Onde a flecha pega. Deitado o corpo é comprido no chão. */
export function caixaDe(r) {
  const meia = r.deitado ? DEITADO.meia : W / 2;
  return [r.x - meia, r.y - altura(r), r.x + meia, r.y];
}

/** A flecha em (x, y) dentro da caixa pegou a cabeça? Em pé é a fatia de cima; deitado, a ponta da frente. */
export function naCabeca(r, x, y) {
  const [x0, y0, x1, y1] = caixaDe(r);
  if (!r.deitado) return y <= y0 + (y1 - y0) * CABECA;
  const ponta = (x1 - x0) * 0.3;
  return r.dir > 0 ? x >= x1 - ponta : x <= x0 + ponta;
}

/** De onde a flecha sai: à frente do peito, na direção da mira. */
export const bocaDoArco = (r) => [r.x + Math.cos(r.ang) * 26, r.y - altura(r) * 0.62 + Math.sin(r.ang) * 26];

function morrer(p, alvo, de, agora, extra) {
  const r = p.arqueiros[alvo];
  r.vivo = false;
  r.carga = 0;
  r.renasceEm = agora + RENASCER;
  p.mortes[alvo]++;
  if (de != null && de !== alvo) p.abates[de]++;
  evento(p, { tipo: 'abate', alvo, de: de ?? null, x: Math.round(r.x), y: Math.round(r.y), dir: r.dir, ...extra });
  if (de != null && de !== alvo && p.abates[de] >= ABATES_VITORIA) {
    p.fim = { vencedor: de, motivo: 'abates' };
    p.fase = 'fim';
  }
}

function danificar(p, alvo, dano, de, x, y, empurra, agora, extra = {}) {
  const r = p.arqueiros[alvo];
  if (!r.vivo || agora < r.protegidoAte || p.fase !== 'jogo') return;
  const real = Math.round(Math.min(dano, r.vida));
  r.vida -= real;
  r.danoEm = agora;
  r.kx += empurra;
  if (Math.abs(empurra) > 200) r.vy = Math.min(r.vy, -Math.min(420, Math.abs(empurra) * 0.6));
  if (de != null && de !== alvo) { p.dano[de] += real; r.ultimoDe = de; r.ultimoEm = agora; }
  evento(p, { tipo: 'acerto', alvo, de, dano: real, x: Math.round(x), y: Math.round(y), ...extra });
  if (r.vida <= 0) morrer(p, alvo, de, agora, extra);
}

function explodir(p, x, y, de, agora) {
  evento(p, { tipo: 'explosao', x: Math.round(x), y: Math.round(y), de });
  for (const [j, o] of p.arqueiros.entries()) {
    if (!o.vivo) continue;
    const d = Math.hypot(o.x - x, o.y - altura(o) / 2 - y);
    if (d < FOGO.raio) {
      const lado = o.x >= x ? 1 : -1;
      danificar(p, j, FOGO.dano * (1 - (d / FOGO.raio) * 0.6), de, o.x, o.y - altura(o) / 2, lado * FOGO.empurra, agora, { fogo: true });
    }
  }
}

/** Solta a flecha com a carga atual. */
function atirar(p, i, agora) {
  const r = p.arqueiros[i];
  const k = Math.min(1, r.carga);
  r.carga = 0;
  r.prontoEm = agora + ARCO.cd;
  r.dir = Math.cos(r.ang) >= 0 ? 1 : -1;
  const [ox, oy] = bocaDoArco(r);
  const vel = lerp(ARCO.vel[0], ARCO.vel[1], k);
  let tipo = 'n';
  if (r.especial && r.nEspecial > 0) {
    tipo = r.especial;
    if (--r.nEspecial <= 0) r.especial = null;
  }
  p.flechas.push({ id: ++p.idFlecha, x: ox, y: oy, vx: Math.cos(r.ang) * vel, vy: Math.sin(r.ang) * vel, dono: i, tipo,
    vida: ARCO.vida, dano: lerp(ARCO.dano[0], ARCO.dano[1], k), empurra: lerp(ARCO.empurra[0], ARCO.empurra[1], k), carga: k });
  evento(p, { tipo: 'tiro', de: i, x: Math.round(ox), y: Math.round(oy), ang: r.ang, carga: Math.round(k * 100) / 100, flecha: tipo });
}

/** O arco por comando: puxando, carrega; largou com carga, atira. */
function arco(p, i, c, dt, agora) {
  const r = p.arqueiros[i];
  if (c.puxa) {
    if (agora >= r.prontoEm || r.carga > 0) r.carga = Math.min(1.25, r.carga + (dt / ARCO.puxar) * (r.deitado ? DEITADO.puxa : 1));
  } else if (r.carga > 0) {
    if (r.carga >= ARCO.min && p.fase === 'jogo') atirar(p, i, agora);
    r.carga = 0;
  }
}

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  const r = p.arqueiros[i];
  if (r.vivo) { r.vivo = false; evento(p, { tipo: 'abate', alvo: i, de: null, x: Math.round(r.x), y: Math.round(r.y), saiu: true, dir: 1 }); }
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
    const d = Math.min(...p.arqueiros.map((o, j) => (j !== i && o.vivo ? Math.hypot(o.x - pt[0], o.y - pt[1]) : 9999)));
    if (d > dist) { dist = d; melhor = pt; }
  }
  return melhor;
}

/** A flecha bateu em algo sólido? (cobertura ou a grama de uma ilha) */
function bateu(x, y) {
  for (const [x0, y0, x1, y1, nome] of COBERTURAS) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return nome;
  for (const [x0, x1, top] of PLATAFORMAS) if (x >= x0 && x <= x1 && y >= top && y <= top + 46) return 'chao';
  return null;
}

// ------------------------------------------------------------------ passo

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  if (p.fim) return p;
  const dt = Math.min(0.05, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;

  if (p.fase === 'contagem') {
    for (const i of p.arqueiros.keys()) {   // comandos são confirmados, mas ninguém sai do lugar
      const f = p.fila[i];
      if (f.length) { p.ack[i] = f[f.length - 1].s; p.arqueiros[i].entrada = { ...f[f.length - 1], mx: 0, pulo: false, puxa: false }; f.length = 0; }
      p.arqueiros[i].ang = p.arqueiros[i].entrada.ang;
      p.credito[i] = 0;
    }
    if (agora < p.faseAte) return p;
    p.fase = 'jogo';
    p.fimEm = agora + TEMPO_PARTIDA;
    evento(p, { tipo: 'fogo' });
  }

  for (const id in p.pegos) if (agora >= p.pegos[id]) delete p.pegos[id];

  for (const [i, r] of p.arqueiros.entries()) {
    if (p.fora[i]) continue;
    if (!r.vivo) {
      p.fila[i].forEach((c) => { p.ack[i] = c.s; r.entrada = c; });
      p.fila[i].length = 0;
      p.credito[i] = 0;
      if (agora >= r.renasceEm) {
        const pt = ondeNascer(p, i);
        Object.assign(r, novoArqueiro(pt), { protegidoAte: agora + PROTECAO, prontoEm: agora + 400 });
        evento(p, { tipo: 'renasce', i, x: pt[0], y: pt[1] });
      }
      continue;
    }
    const fila = p.fila[i];
    if (fila.length || p.ack[i]) {
      p.credito[i] = Math.min(CREDITO_MAX, p.credito[i] + dt * 1000);
      while (fila.length && fila[0].dt <= p.credito[i]) {
        const c = fila.shift();
        p.credito[i] -= c.dt;
        p.ack[i] = c.s;
        r.entrada = c;
        r.ang = c.ang;
        const estavaNoChao = r.chao;
        mover(p, i, c, c.dt / 1000, agora);
        if (c.pulo && !r.agachado && !r.deitado) evento(p, { tipo: 'pulo', i, x: Math.round(r.x), y: Math.round(r.y), duplo: !estavaNoChao });
        arco(p, i, c, c.dt / 1000, agora);
      }
    } else {
      const c = r.entrada;
      r.ang = c.ang;
      mover(p, i, c, dt, agora);
      arco(p, i, c, dt, agora);
      r.entrada = { ...c, pulo: false };
    }
    if (p.fim) break;
    if (r.vivo && agora - r.danoEm > REGEN.espera && r.vida < VIDA) r.vida = Math.min(VIDA, r.vida + REGEN.por * dt);
    // abismo: caiu, morreu. Se alguém acertou há pouco, o abate é dele.
    if (r.vivo && r.y >= ABISMO) {
      r.vida = 0;
      const de = r.ultimoDe != null && agora - r.ultimoEm < CULPA_MS ? r.ultimoDe : null;
      morrer(p, i, de, agora, { caiu: true });
    }
  }

  // aljavas
  for (const [i, r] of p.arqueiros.entries()) {
    if (!r.vivo || p.fora[i]) continue;
    const [x0, y0, x1, y1] = caixaDe(r);
    for (const it of ITENS) {
      if (p.pegos[it.id]) continue;
      if (!sobre(x0, x1, it.x - PEGAR, it.x + PEGAR) || !sobre(y0, y1, it.y - 45, it.y + 4)) continue;
      r.especial = it.tipo;
      r.nEspecial = ESPECIAL;
      p.pegos[it.id] = agora + it.volta;
      evento(p, { tipo: 'pega', i, item: it.tipo, x: it.x, y: it.y - 20 });
    }
  }

  // flechas em pedaços de até 10 unidades (a flecha cheia atravessaria o arqueiro)
  const voando = [];
  for (const f of p.flechas) {
    f.vida -= dt;
    let parou = f.vida <= 0;
    const passos = Math.max(1, Math.ceil((Math.hypot(f.vx, f.vy) * dt) / 10));
    for (let s = 0; s < passos && !parou && !p.fim; s++) {
      const sdt = dt / passos;
      f.vy += ARCO.gravidade * sdt;
      f.x += f.vx * sdt;
      f.y += f.vy * sdt;
      const ang = Math.atan2(f.vy, f.vx);
      if (f.x < -40 || f.x > LARGURA + 40 || f.y > ABISMO) { parou = true; break; }
      for (const [j, o] of p.arqueiros.entries()) {
        if (j === f.dono || !o.vivo || agora < o.protegidoAte) continue;
        const [x0, y0, x1, y1] = caixaDe(o);
        if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
        const cabeca = naCabeca(o, f.x, f.y);
        // onde cravou, relativo ao pé do arqueiro (o cliente desenha a flecha presa nele)
        const extra = { ang: Math.round(ang * 100) / 100, dx: Math.round(f.x - o.x), dy: Math.round(f.y - o.y), flecha: f.tipo, ...(cabeca ? { cabeca: true } : {}) };
        if (f.tipo === 'g') o.geladoAte = agora + GELO.ms;
        danificar(p, j, f.dano * (cabeca ? HEADSHOT : 1), f.dono, f.x, f.y, Math.sign(f.vx) * f.empurra, agora, extra);
        if (cabeca && !o.vivo) p.cabecas[f.dono]++;
        if (f.tipo === 'f') explodir(p, f.x, f.y, f.dono, agora);
        parou = true; break;
      }
      if (parou) break;
      const onde = bateu(f.x, f.y);
      if (onde) {
        evento(p, { tipo: 'cravou', x: Math.round(f.x), y: Math.round(f.y), ang: Math.round(ang * 100) / 100, onde, flecha: f.tipo, de: f.dono });
        if (f.tipo === 'f') explodir(p, f.x, f.y, f.dono, agora);
        parou = true;
      }
    }
    if (!parou) voando.push(f);
  }
  p.flechas = p.fim ? [] : voando;

  if (!p.fim && agora >= p.fimEm) {
    const ativos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const porAbate = lideres(p.abates, ativos);
    const porDano = lideres(p.dano, porAbate);
    p.fim = porAbate.length === 1 ? { vencedor: porAbate[0], motivo: 'tempo' }
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
  cores: p.cores, fora: p.fora, abates: p.abates, mortes: p.mortes, cabecas: p.cabecas,
  // [x, y, ang, vida, vivo, movendo, ack, vy, kx, chao, pulos, agachado, protegido, dir, carga, especial, nEspecial, gelado, deitado]
  r: p.arqueiros.map((r, i) => [r1(r.x), r1(r.y), Math.round(r.ang * 100) / 100, Math.ceil(r.vida), r.vivo ? 1 : 0, r.movendo ? 1 : 0, p.ack[i],
    r1(r.vy), r1(r.kx), r.chao ? 1 : 0, r.pulos, r.agachado ? 1 : 0, agora < r.protegidoAte ? 1 : 0, r.dir,
    Math.round(Math.min(1, r.carga) * 100) / 100, r.especial, r.nEspecial, agora < r.geladoAte ? 1 : 0, r.deitado ? 1 : 0]),
  // [id, x, y, ang, dono, tipo]
  f: p.flechas.map((f) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(Math.atan2(f.vy, f.vx) * 100) / 100, f.dono, f.tipo]),
  pegos: Object.keys(p.pegos),
  ev: p.eventos,
});
