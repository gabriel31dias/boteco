import { randomInt } from 'node:crypto';
import { Mao } from '../../src/games/poker/mesa.js';
import { avaliar } from '../../src/games/poker/regras.js';

/**
 * Árbitro do pôquer: Sit & Go de Texas Hold'em. Todos pagam a entrada, cada
 * um recebe FICHAS, e quem ficar com todas leva o pote em dinheiro — encaixa
 * no settleMatch de um vencedor só, sem mexer na economia.
 *
 * A mão em si é a Mao (regras puras). Aqui entram o que é de torneio: blinds
 * que sobem com o tempo, relógio, botão andando, eliminação e sigilo.
 */
export const FICHAS = 1500;
export const NIVEIS = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
  [200, 400], [300, 600], [400, 800], [600, 1200], [1000, 2000]];
export const TEMPO_NIVEL = Number(process.env.POKER_NIVEL) || 180_000;
export const TEMPO_JOGADA = Number(process.env.POKER_TEMPO) || 20_000;
export const PAUSA_MAO = Number(process.env.POKER_PAUSA ?? 4000);   // showdown na tela antes da próxima
export const AUSENCIAS_MAX = 3;

/** Embaralho com dinheiro em jogo: crypto, não Math.random (estado do xorshift dá pra deduzir). */
const rngSeguro = () => randomInt(0, 2 ** 32) / 2 ** 32;

const nivelDe = (p) => Math.min(NIVEIS.length - 1, Math.floor((Date.now() - p.inicio) / TEMPO_NIVEL));

export function novaPartida(jogadores = 2) {
  const p = {
    n: jogadores, fichas: Array(jogadores).fill(FICHAS), botao: Math.floor(Math.random() * jogadores),
    inicio: Date.now(), maoNum: 0, mao: null, desde: Date.now(), vez: null, fim: null,
    ausencias: Array(jogadores).fill(0), saiu: Array(jogadores).fill(false), colocacao: [],
  };
  novaMao(p, true);
  return p;
}

/** Botão anda pro próximo com fichas (moving button: mais simples que o dead button da TDA). */
function novaMao(p, primeira = false) {
  if (!primeira) {
    for (let i = 1; i <= p.n; i++) { const x = (p.botao + i) % p.n; if (p.fichas[x] > 0) { p.botao = x; break; } }
  }
  const [sb, bb] = NIVEIS[nivelDe(p)];
  p.mao = new Mao({ fichas: p.fichas, botao: p.botao, sb, bb, rng: rngSeguro });
  p.maoNum++;
  p.desde = Date.now();
  depois(p, null);
}

/** Depois de qualquer mudança: fecha a mão, elimina quem zerou e vê se acabou. */
function depois(p, r) {
  const m = p.mao;
  if (m.fase === 'fim') {
    p.fichas = m.pilha.map((f, s) => (p.saiu[s] ? 0 : f));
    for (let s = 0; s < p.n; s++) if (!p.fichas[s] && !p.colocacao.includes(s)) p.colocacao.push(s);
    const restam = p.fichas.flatMap((f, s) => (f > 0 ? [s] : []));
    if (restam.length === 1 && !p.fim) {
      // 'tempo' só quando a eliminação foi por ausência: um check automático que fecha a mão decisiva é 'fichas'.
      const motivo = r?.ausencia ? 'tempo' : r?.tipo === 'saiu' ? 'abandono' : 'fichas';
      p.fim = { vencedor: restam[0], motivo };
    }
    if (r) r = { ...r, mao: m.resultado };
  }
  p.vez = m.fase === 'fim' ? null : m.vez;
  return r;
}

export const restante = (p) => Math.max(0, p.desde + (p.mao.fase === 'fim' ? PAUSA_MAO : TEMPO_JOGADA) - Date.now());

export function agir(p, assento, { tipo, valor } = {}) {
  if (p.fim || p.mao.fase === 'fim') return null;
  let ev;
  try { ev = p.mao.agir(assento, { tipo, valor }); } catch { return null; }   // regra recusou: nada muda
  p.ausencias[assento] = 0;
  p.desde = Date.now();
  return depois(p, { tipo: 'acao', assento, acao: ev.tipo, valor: ev.valor });
}

/** O relógio venceu: fim da pausa abre a próxima mão; senão, quem está na vez. */
export function estourou(p) {
  if (p.fim) return null;
  if (p.mao.fase === 'fim') { novaMao(p); return { tipo: 'novaMao' }; }
  const s = p.mao.vez;
  if (++p.ausencias[s] >= AUSENCIAS_MAX) return eliminar(p, s, 'tempo');
  const ev = p.mao.agir(s, { tipo: p.mao.acoesLegais(s).check ? 'check' : 'fold' });
  p.desde = Date.now();
  return depois(p, { tipo: 'tempo', assento: s, acao: ev.tipo });
}

/**
 * Saiu (ou sumiu): larga a mão e, quando ela fechar, fica sem fichas. O que
 * já pôs no pote fica lá. Sobrou um com fichas: ele leva.
 */
export function eliminar(p, assento, motivo = 'abandono') {
  if (p.fim || p.saiu[assento]) return null;
  p.saiu[assento] = true;
  const antes = p.mao.vez;
  p.mao.abandonar(assento);
  // A mão segue sem ele: as fichas que sobraram atrás da linha somem agora (o
  // que ele pôs no pote fica). Se a mão fechou no abandonar, depois() zera.
  if (p.mao.fase !== 'fim') {
    p.mao.pilha[assento] = 0;
    if (!p.colocacao.includes(assento)) p.colocacao.push(assento);
  }
  if (p.mao.vez !== antes) p.desde = Date.now();
  const tipo = motivo === 'tempo' ? 'tempo' : 'saiu';
  return depois(p, { tipo, assento, ausencia: motivo === 'tempo' });
}

/** Só o que este assento pode ver. Cartas dos outros: só no showdown. */
export const estadoPara = (p, assento) => {
  const m = p.mao;
  const fim = m.fase === 'fim';
  const nivel = nivelDe(p);
  const minhas = m.cartas[assento];
  return {
    assento, jogadores: p.n, maoNum: p.maoNum, fase: m.fase,
    fichas: m.pilha, apostas: m.aposta, investido: m.investido,
    pote: m.investido.reduce((a, b) => a + b, 0),
    potes: fim ? m.resultado.potes : m.potes(),
    board: m.board, minhas,
    minhaMao: minhas && m.board.length >= 3 ? avaliar([...minhas, ...m.board]).nome : null,
    cartas: fim ? m.resultado.mostradas : null,
    maos: fim ? m.resultado.maos : null,
    ganhos: fim ? m.resultado.ganhos : null,
    ativos: m.ativo, foldou: m.foldou, saiu: p.saiu,
    botao: m.botao, posSb: m.posSb, posBb: m.posBb, sb: m.sb, bb: m.bb,
    nivel: nivel + 1, proximoNivel: NIVEIS[nivel + 1] ?? null, proximoNivelEm: p.inicio + (nivel + 1) * TEMPO_NIVEL,
    vez: p.vez, legais: m.acoesLegais(assento),
    prazo: p.desde + (fim ? PAUSA_MAO : TEMPO_JOGADA), tempo: TEMPO_JOGADA,
    colocacao: p.colocacao, fim: p.fim,
  };
};

/** Assentos já eliminados: o index libera essas contas pra outra partida antes do torneio acabar. */
export const fora = (p) => p.colocacao;
