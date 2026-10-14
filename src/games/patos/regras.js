/**
 * Caçada de Patos: 2 a 4 caçadores atirando nos mesmos patos, tempo real,
 * 4 rodadas. Quem fizer mais pontos leva; empate devolve a entrada.
 *
 * Os patos voam por fórmula (`posicao`): o servidor sorteia os parâmetros
 * quando cada um nasce e manda pra todos; o cliente só desenha. Por isso o
 * tiro pode ser conferido no instante em que o jogador VIU a cena (`t`, com
 * no máximo COMPENSA ms de atraso): quem tem rede lenta não fica em desvantagem.
 * O primeiro tiro que chega leva o pato. Um tiro que pega dois é DOBRADINHA (+1 cada).
 *
 * Munição: 5 cartuchos; acabou, recarrega sozinho (RECARGA ms) ou na hora
 * (`recarregar`). Mundo de 1280×766 (o cenário), y pra baixo.
 */

export const LARGURA = 1280;
export const ALTURA = 766;
export const TICK_MS = 100;
export const RODADAS = 4;
export const TEMPO_RODADA = Number(globalThis.process?.env?.PATOS_RODADA) || 25_000;
export const INTERVALO = Number(globalThis.process?.env?.PATOS_INTERVALO ?? 3500);
export const CONTAGEM = Number(globalThis.process?.env?.PATOS_CONTAGEM ?? 3000);
export const MUNICAO = 5;
export const RECARGA = 1100;
export const CADENCIA = 230;
export const COMPENSA = 400;
export const FOLGA = 14;                  // tolerância do dedo (px do mundo)
export const MAX_JOGADORES = 4;

export const TIPOS = {
  verde: { pontos: 1, vel: 210, raio: 44, peso: 45 },
  marrom: { pontos: 1, vel: 235, raio: 44, peso: 33 },
  branco: { pontos: 2, vel: 150, raio: 48, peso: 14 },
  colorido: { pontos: 5, vel: 390, raio: 38, peso: 8 },
};
const SORTEIO = Object.entries(TIPOS).flatMap(([t, d]) => Array(d.peso).fill(t));

/** Onde o pato está no instante t (ms). */
export function posicao(d, t) {
  const s = (t - d.t0) / 1000;
  return { x: d.x0 + d.dir * d.v * s, y: d.y0 + d.amp * Math.sin(s * d.freq + d.fase) + d.sobe * s };
}
const noAr = (d, t) => t >= d.t0 && (d.morto == null || t < d.morto) && (() => { const { x } = posicao(d, t); return x > -140 && x < LARGURA + 140; })();

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

export function novaPartida(agora = Date.now(), n = 2, rnd = Math.random) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  return {
    n, rnd, rodada: 0, fase: 'contagem', faseAte: agora + CONTAGEM, fimRodada: 0,
    pontos: vazio(n, 0), abates: vazio(n, 0), tiros: vazio(n, 0), fora: vazio(n, false),
    municao: vazio(n, MUNICAO), recarregaAte: vazio(n, 0), prontoEm: vazio(n, 0),
    patos: [], agenda: [], idPato: 0, seq: 0, eventos: [], pendentes: [], fim: null, ultimo: agora,
  };
}

function abrirRodada(p, agora) {
  p.rodada++;
  p.fase = 'jogo';
  p.fimRodada = agora + TEMPO_RODADA;
  const q = 10 + p.rodada * 3;
  const util = TEMPO_RODADA - 4000;    // os últimos 4s ninguém nasce (dá tempo de cruzar)
  p.agenda = Array.from({ length: q }, () => agora + 400 + p.rnd() * util).sort((a, b) => a - b);
  // de vez em quando sai um bando (2–3 juntos)
  for (let k = 0; k < p.rodada; k++) { const t = agora + 1500 + p.rnd() * (util - 1500); p.agenda.push(t, t + 380, t + 760); }
  p.agenda.sort((a, b) => a - b);
  p.municao.fill(MUNICAO); p.recarregaAte.fill(0);
  evento(p, { tipo: 'rodada', rodada: p.rodada });
}

function nascer(p, t) {
  const tipo = SORTEIO[Math.floor(p.rnd() * SORTEIO.length)];
  const d = TIPOS[tipo];
  const dir = p.rnd() < 0.5 ? 1 : -1;
  p.patos.push({
    id: ++p.idPato, tipo, t0: Math.round(t), dir, v: Math.round(d.vel * (0.85 + p.rnd() * 0.35) * (1 + (p.rodada - 1) * 0.08)),
    x0: dir > 0 ? -110 : LARGURA + 110, y0: Math.round(70 + p.rnd() * 300), amp: Math.round(15 + p.rnd() * 55),
    freq: Math.round((1.5 + p.rnd() * 2.2) * 100) / 100, fase: Math.round(p.rnd() * 628) / 100, sobe: Math.round((p.rnd() - 0.55) * 30),
    morto: null, de: null,
  });
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });

// ---------------------------------------------------------------- tiro

/** `{ x, y, t }` atira (t = instante que o jogador viu); `{ recarregar: true }` recarrega. */
export function agir(p, i, acao = {}, agora = Date.now()) {
  if (p.fim || p.fora[i] || i == null || i < 0 || i >= p.n || !acao || typeof acao !== 'object') return null;
  if (acao.recarregar === true) {
    if (p.municao[i] >= MUNICAO || agora < p.recarregaAte[i]) return null;
    p.municao[i] = 0; p.recarregaAte[i] = agora + RECARGA;
    p.pendentes.push({ tipo: 'recarga', de: i });
    return { ok: true };
  }
  const x = Number(acao.x), y = Number(acao.y), t = Number(acao.t);
  if (p.fase !== 'jogo' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (agora < p.prontoEm[i] || agora < p.recarregaAte[i] || p.municao[i] <= 0) return null;
  p.prontoEm[i] = agora + CADENCIA;
  p.municao[i]--;
  p.tiros[i]++;
  if (!p.municao[i]) { p.recarregaAte[i] = agora + RECARGA; }
  const tt = Number.isFinite(t) ? Math.min(agora, Math.max(agora - COMPENSA, t)) : agora;
  const pegos = p.patos.filter((d) => {
    if (!noAr(d, tt)) return false;
    const q = posicao(d, tt);
    if (q.x < 0 || q.x > LARGURA) return false;   // fora da tela não dá pra acertar
    return Math.hypot(q.x - x, q.y - y) < TIPOS[d.tipo].raio + FOLGA;
  });
  const dobra = pegos.length > 1;
  for (const d of pegos) {
    const q = posicao(d, tt);
    const pts = TIPOS[d.tipo].pontos + (dobra ? 1 : 0);
    d.morto = tt; d.de = i;
    p.pontos[i] += pts; p.abates[i]++;
    p.pendentes.push({ tipo: 'abate', de: i, pato: d.id, patoTipo: d.tipo, x: Math.round(q.x), y: Math.round(q.y), dir: d.dir, pontos: pts, dobra });
  }
  p.pendentes.push({ tipo: 'tiro', de: i, x: Math.round(x), y: Math.round(y), acertou: pegos.length, recarrega: !p.municao[i] });
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

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  for (const e of p.pendentes) evento(p, e);
  p.pendentes = [];
  if (p.fim) return p;
  p.ultimo = agora;
  for (let i = 0; i < p.n; i++) if (p.recarregaAte[i] && agora >= p.recarregaAte[i]) { p.recarregaAte[i] = 0; p.municao[i] = MUNICAO; }

  if (p.fase === 'contagem' || p.fase === 'intervalo') {
    if (agora >= p.faseAte) abrirRodada(p, agora);
    return p;
  }
  while (p.agenda.length && p.agenda[0] <= agora) nascer(p, p.agenda.shift());
  // fugiu: atravessou a tela vivo
  for (const d of p.patos) if (d.morto == null && !d.fugiu && agora > d.t0 + 500 && !noAr(d, agora)) { d.fugiu = true; evento(p, { tipo: 'fugiu', pato: d.id }); }
  p.patos = p.patos.filter((d) => (d.morto != null ? agora - d.morto < 2500 : !d.fugiu));

  if (agora >= p.fimRodada) {
    p.patos = [];
    evento(p, { tipo: 'fimRodada', rodada: p.rodada });
    if (p.rodada >= RODADAS) {
      const vivos = p.fora.flatMap((f, j) => (f ? [] : [j]));
      const max = Math.max(...vivos.map((j) => p.pontos[j]));
      const lideres = vivos.filter((j) => p.pontos[j] === max);
      p.fim = lideres.length === 1 ? { vencedor: lideres[0], motivo: 'pontos' } : { vencedor: null, motivo: 'empate' };
      p.fase = 'fim';
    } else { p.fase = 'intervalo'; p.faseAte = agora + INTERVALO; }
  }
  return p;
}

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, n: p.n, fase: p.fase, rodada: p.rodada, faseAte: p.faseAte, fimRodada: p.fimRodada, fim: p.fim, fora: p.fora,
  pontos: p.pontos, abates: p.abates, tiros: p.tiros, municao: p.municao, recarregaAte: p.recarregaAte,
  // [id, tipo, t0, x0, y0, dir, v, amp, freq, fase, sobe, morto]
  d: p.patos.map((d) => [d.id, d.tipo, d.t0, d.x0, d.y0, d.dir, d.v, d.amp, d.freq, d.fase, d.sobe, d.morto]),
  ev: p.eventos,
});
