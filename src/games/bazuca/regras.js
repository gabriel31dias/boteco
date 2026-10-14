/**
 * Bazuca x Helicópteros: 2 a 5 soldados no chão, cada um com uma bazuca, contra
 * os mesmos helicópteros. Quem derrubar mais até o tempo acabar leva; empate devolve.
 *
 * Tudo voa por fórmula (helicóptero, foguete, míssil): o servidor sorteia os
 * parâmetros e manda pra todos; o cliente só desenha. O foguete sai do instante
 * em que o jogador VIU a cena (`t`, até COMPENSA ms atrás), então rede lenta não
 * perde helicóptero. O primeiro foguete que pega leva (o bege aguenta 2).
 *
 * Os helicópteros revidam: soltam míssil onde o soldado ESTÁ; quem ainda estiver
 * lá quando cair MORRE: perde uma das VIDAS e volta depois de ATORDOA ms (sem atirar
 * nem andar). Na 3ª morte está eliminado (os abates continuam valendo); todo mundo
 * eliminado acaba antes do tempo. O soldado anda pro lado (`andar`) pra fugir, e
 * foguete derruba míssil no ar.
 * Mundo de 1280×720, y pra baixo.
 */

export const LARGURA = 1280;
export const ALTURA = 720;
export const CHAO = 640;                 // pé do soldado
export const TICK_MS = 50;
export const TEMPO = Number(globalThis.process?.env?.BAZUCA_TEMPO) || 90_000;
export const CONTAGEM = Number(globalThis.process?.env?.BAZUCA_CONTAGEM ?? 3500);
export const COMPENSA = 300;
export const CADENCIA = 650;             // recarga da bazuca
export const FOGUETE = { vel: 980, vida: 1600, raio: 14 };
export const ATORDOA = 1700;
export const VIDAS = 3;
export const PROTEGE = 1200;            // depois de voltar, um tempinho sem levar outro
export const RITMO = 7000;               // em média um míssil por soldado vivo a cada RITMO ms
export const ESTOURO = 70;               // raio do míssil no chão
export const ANDA = 270;                 // px/s andando
export const BEIRA = 50;                 // não sai da tela
export const MAX_JOGADORES = 5;
export const CORES = ['azul', 'vermelho', 'amarelo', 'roxo', 'verde'];

export const TIPOS = {
  verde: { vida: 1, vel: 175, rx: 78, ry: 32, peso: 62 },
  bege: { vida: 2, vel: 125, rx: 84, ry: 34, peso: 38 },
};
const SORTEIO = Object.entries(TIPOS).flatMap(([t, d]) => Array(d.peso).fill(t));

/** Onde o soldado i nasce (o pé) com n jogadores. */
export const soldado = (n, i) => ({ x: Math.round((LARGURA * (i + 1)) / (n + 1)), y: CHAO });
/** Boca da bazuca do soldado em `sx` (de onde sai o foguete) e a direção pra um alvo; só pra cima. */
export function mira(sx, x, y) {
  const ox = sx, oy = CHAO - 78;
  let a = Math.atan2(y - oy, x - ox);
  if (a > -0.12 && a <= Math.PI / 2) a = -0.12;
  else if (a > Math.PI / 2 || a < -Math.PI + 0.12) a = -Math.PI + 0.12;
  return { ox, oy, a, vx: Math.cos(a) * FOGUETE.vel, vy: Math.sin(a) * FOGUETE.vel };
}

/** Onde o helicóptero está no instante t (ms). */
export function posHeli(h, t) {
  const s = (t - h.t0) / 1000;
  return { x: h.x0 + h.dir * h.v * s, y: h.y0 + h.amp * Math.sin(s * h.freq + h.fase) };
}
export function posFoguete(f, t) {
  const s = (t - f.t0) / 1000;
  return { x: f.x0 + f.vx * s, y: f.y0 + f.vy * s };
}
export function posMissil(m, t) {
  const k = Math.min(1, Math.max(0, (t - m.t0) / m.dur));
  return { x: m.x0 + (m.tx - m.x0) * k, y: m.y0 + (CHAO - 30 - m.y0) * k * k };   // mergulha acelerando
}
const voando = (h, t) => t >= h.t0 && h.morto == null && (() => { const { x } = posHeli(h, t); return x > -220 && x < LARGURA + 220; })();

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => v);

export function novaPartida(agora = Date.now(), n = 2, cores = [], rnd = Math.random) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const livres = CORES.filter((c) => !cores.includes(c));
  const usadas = new Set();
  const cs = Array.from({ length: n }, (_, i) => {
    const c = CORES.includes(cores[i]) && !usadas.has(cores[i]) ? cores[i] : livres.find((l) => !usadas.has(l)) ?? CORES.find((l) => !usadas.has(l));
    usadas.add(c);
    return c;
  });
  return {
    n, rnd, cores: cs, fase: 'contagem', largada: agora + CONTAGEM, fimEm: agora + CONTAGEM + TEMPO,
    x: Array.from({ length: n }, (_, i) => soldado(n, i).x), anda: vazio(n, 0),
    abates: vazio(n, 0), tiros: vazio(n, 0), acertos: vazio(n, 0), fora: vazio(n, false), prontoEm: vazio(n, 0), atordoado: vazio(n, 0), vidas: vazio(n, VIDAS),
    combo: Array.from({ length: n }, () => ({ k: 0, t: 0 })),
    helis: [], foguetes: [], misseis: [], id: 0, seq: 0, proxNasce: 0, eventos: [], pendentes: [], fim: null,
  };
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });
const sorte = (p, a, b) => a + p.rnd() * (b - a);

function nascer(p, agora) {
  const tipo = SORTEIO[Math.floor(p.rnd() * SORTEIO.length)];
  const d = TIPOS[tipo];
  const dir = p.rnd() < 0.5 ? 1 : -1;
  const pressa = 1 + Math.min(0.35, (agora - p.largada) / TEMPO * 0.35);   // vão ficando mais rápidos
  p.helis.push({
    id: ++p.id, tipo, t0: agora, dir, v: Math.round(d.vel * sorte(p, 0.85, 1.2) * pressa), x0: dir > 0 ? -200 : LARGURA + 200,
    y0: Math.round(sorte(p, 110, 390)), amp: Math.round(sorte(p, 10, 50)), freq: Math.round(sorte(p, 0.8, 2) * 100) / 100,
    fase: Math.round(p.rnd() * 628) / 100, vida: d.vida, morto: null, de: null, proxTiro: agora + sorte(p, 2500, 4500),
  });
}

// ---------------------------------------------------------------- tiro

/** `{ x, y, t, seq }`: atira na direção de (x, y); t = instante que o jogador viu. `{ andar: -1|0|1 }`: anda. */
export function agir(p, i, acao = {}, agora = Date.now()) {
  if (p.fim || i == null || i < 0 || i >= p.n || p.fora[i] || !acao || typeof acao !== 'object') return null;
  if ('andar' in acao) {
    if (![-1, 0, 1].includes(acao.andar)) return null;
    p.anda[i] = acao.andar;
    return { ok: true };
  }
  const x = Number(acao.x), y = Number(acao.y), t = Number(acao.t);
  if (p.fase !== 'jogo' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (agora < p.prontoEm[i] || agora < p.atordoado[i] || !p.vidas[i]) return null;
  p.prontoEm[i] = agora + CADENCIA;
  p.tiros[i]++;
  const t0 = Number.isFinite(t) ? Math.min(agora, Math.max(agora - COMPENSA, p.largada, t)) : agora;
  const m = mira(p.x[i], x, y);
  const f = {
    id: ++p.id, de: i, t0: Math.round(t0), seq: Number.isInteger(acao.seq) ? acao.seq : 0,
    x0: Math.round(m.ox + Math.cos(m.a) * 50), y0: Math.round(m.oy + Math.sin(m.a) * 50), vx: Math.round(m.vx), vy: Math.round(m.vy), chk: t0,
  };
  p.foguetes.push(f);
  p.pendentes.push({ tipo: 'tiro', de: i, foguete: f.id, seq: f.seq });
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

// ------------------------------------------------------------------ passo

/** Varre o caminho de cada foguete (de 8 em 8 ms) atrás de helicóptero ou míssil; o choque mais cedo vale. */
function colisoes(p, agora) {
  const batidas = [];
  for (const f of p.foguetes) {
    const ate = Math.min(agora, f.t0 + FOGUETE.vida);
    for (let t = f.chk; t <= ate; t += 8) {
      const q = posFoguete(f, t);
      const h = p.helis.find((h) => voando(h, t) && (() => { const c = posHeli(h, t), d = TIPOS[h.tipo]; return ((q.x - c.x) / (d.rx + FOGUETE.raio)) ** 2 + ((q.y - c.y) / (d.ry + FOGUETE.raio)) ** 2 < 1; })());
      const m = !h && p.misseis.find((m) => t >= m.t0 && t < m.t0 + m.dur && (() => { const c = posMissil(m, t); return Math.hypot(q.x - c.x, q.y - c.y) < 34; })());
      if (h || m) { batidas.push({ t, f, h, m, x: Math.round(q.x), y: Math.round(q.y) }); break; }
    }
    f.chk = ate;
  }
  batidas.sort((a, b) => a.t - b.t);
  for (const b of batidas) {
    const { f, h, m } = b;
    if (f.fim) continue;
    if (h) {
      if (h.morto != null) continue;   // já caiu com outro foguete: esse passa
      f.fim = true;
      p.acertos[f.de]++;
      if (--h.vida > 0) { evento(p, { tipo: 'dano', de: f.de, heli: h.id, foguete: f.id, t: Math.round(b.t), x: b.x, y: b.y }); continue; }
      h.morto = b.t; h.de = f.de;
      p.abates[f.de]++;
      const c = p.combo[f.de];
      c.k = agora - c.t < 2500 ? c.k + 1 : 1; c.t = agora;
      const pos = posHeli(h, b.t);
      evento(p, { tipo: 'abate', de: f.de, heli: h.id, foguete: f.id, t: Math.round(b.t), heliTipo: h.tipo, x: Math.round(pos.x), y: Math.round(pos.y), dir: h.dir, combo: c.k });
    } else if (m && !m.fim) {
      f.fim = true; m.fim = true;
      evento(p, { tipo: 'intercepta', de: f.de, missil: m.id, foguete: f.id, t: Math.round(b.t), x: b.x, y: b.y });
    }
  }
  p.foguetes = p.foguetes.filter((f) => !f.fim && agora < f.t0 + FOGUETE.vida && (() => { const q = posFoguete(f, agora); return q.y > -100 && q.x > -100 && q.x < LARGURA + 100; })());
}

function revidar(p, agora) {
  const alvos = p.fora.flatMap((f, j) => (f || !p.vidas[j] ? [] : [j]));
  for (const h of p.helis) {
    if (!alvos.length || !voando(h, agora) || agora < h.proxTiro || agora < (p.proxMissil ?? 0)) continue;
    const c = posHeli(h, agora);
    if (c.x < 60 || c.x > LARGURA - 60) continue;
    h.proxTiro = agora + sorte(p, 4500, 8000);
    p.proxMissil = agora + (RITMO / alvos.length) * sorte(p, 0.6, 1.4);
    const alvo = alvos[Math.floor(p.rnd() * alvos.length)];
    const m = { id: ++p.id, heli: h.id, t0: agora, x0: Math.round(c.x), y0: Math.round(c.y + 30), tx: Math.round(Math.min(LARGURA - BEIRA, Math.max(BEIRA, p.x[alvo] + sorte(p, -30, 30)))), dur: Math.round(sorte(p, 1500, 1900)), alvo };
    p.misseis.push(m);
    evento(p, { tipo: 'missil', missil: m.id, heli: h.id, alvo });
  }
  for (const m of p.misseis) {
    if (m.fim || agora < m.t0 + m.dur) continue;
    m.fim = true;
    const pegos = [];
    for (let i = 0; i < p.n; i++) {
      if (p.fora[i] || !p.vidas[i] || Math.abs(p.x[i] - m.tx) >= ESTOURO || agora <= p.atordoado[i] + PROTEGE) continue;
      p.vidas[i]--; p.atordoado[i] = agora + ATORDOA; p.anda[i] = 0;
      pegos.push(i);
    }
    evento(p, { tipo: 'boom', missil: m.id, t: m.t0 + m.dur, x: m.tx, pegos, vidas: pegos.map((i) => p.vidas[i]) });
  }
  p.misseis = p.misseis.filter((m) => !m.fim);
}

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  for (const e of p.pendentes) evento(p, e);
  p.pendentes = [];
  if (p.fim) return p;
  if (p.fase === 'contagem') {
    if (agora < p.largada) return p;
    p.fase = 'jogo';
    p.proxNasce = agora + 300;
    p.ultimo = agora;
    evento(p, { tipo: 'largada' });
  }
  const passado = (agora - p.largada) / TEMPO;
  const quer = Math.round(2 + p.n * 0.5 + passado * 4);   // 3 no começo, até ~8 no fim
  if (agora >= p.proxNasce && agora < p.fimEm - 3000 && p.helis.filter((h) => h.morto == null).length < quer) {
    nascer(p, agora);
    p.proxNasce = agora + sorte(p, 500, 1400);
  }
  const dt = Math.min(0.2, (agora - (p.ultimo ?? agora)) / 1000);
  p.ultimo = agora;
  for (let i = 0; i < p.n; i++) if (p.anda[i] && !p.fora[i] && p.vidas[i] && agora >= p.atordoado[i]) p.x[i] = Math.min(LARGURA - BEIRA, Math.max(BEIRA, p.x[i] + p.anda[i] * ANDA * dt));
  colisoes(p, agora);
  revidar(p, agora);
  for (const h of p.helis) if (h.morto == null && !h.fugiu && agora > h.t0 + 500 && !voando(h, agora)) { h.fugiu = true; evento(p, { tipo: 'fugiu', heli: h.id }); }
  p.helis = p.helis.filter((h) => (h.morto != null ? agora - h.morto < 2500 : !h.fugiu));

  const todosMortos = p.fora.every((f, j) => f || !p.vidas[j]);
  if (agora >= p.fimEm || todosMortos) {
    const vivos = p.fora.flatMap((f, j) => (f ? [] : [j]));
    const max = Math.max(...vivos.map((j) => p.abates[j]));
    const lideres = vivos.filter((j) => p.abates[j] === max);
    p.fim = lideres.length === 1 ? { vencedor: lideres[0], motivo: 'abates' } : { vencedor: null, motivo: 'empate' };
    if (todosMortos && agora < p.fimEm) p.fim.todosMortos = true;
    p.fase = 'fim';
    evento(p, { tipo: 'fim' });
  }
  return p;
}

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, n: p.n, cores: p.cores, fase: p.fase, largada: p.largada, fimEm: p.fimEm, fim: p.fim, fora: p.fora,
  x: p.x.map(Math.round), anda: p.anda,
  abates: p.abates, tiros: p.tiros, acertos: p.acertos, prontoEm: p.prontoEm, atordoado: p.atordoado, vidas: p.vidas,
  // [id, tipo, t0, x0, y0, dir, v, amp, freq, fase, morto, vida]
  h: p.helis.map((h) => [h.id, h.tipo, h.t0, h.x0, h.y0, h.dir, h.v, h.amp, h.freq, h.fase, h.morto, h.vida]),
  // [id, de, t0, x0, y0, vx, vy, seq]
  f: p.foguetes.map((f) => [f.id, f.de, f.t0, f.x0, f.y0, f.vx, f.vy, f.seq]),
  // [id, t0, x0, y0, tx, dur]
  m: p.misseis.map((m) => [m.id, m.t0, m.x0, m.y0, m.tx, m.dur]),
  ev: p.eventos,
});
