import { Match, Phase, nextValue, timeDe } from '../../src/games/truco/engine/match.js';
import { strength } from '../../src/games/truco/engine/deck.js';

/**
 * Árbitro do truco paulista. A engine veio inteira do projeto original — ela já
 * usa assentos 0/1 e já devolve lista de eventos, que é o que o cliente precisa
 * pra animar. Aqui em cima entram três coisas: sigilo (a mão é o jogo), relógio
 * e a conversão de ação do socket em chamada de regra.
 *
 * O relógio é o ponto diferente dos outros jogos: nem sempre cobra quem joga.
 * Num pedido de truco quem está no relógio é QUEM RESPONDE.
 */
export const ALVO = 12;                    // mão de onze e mão de ferro só existem com 12
export const TEMPO_JOGADA = Number(process.env.TRUCO_TEMPO) || 20_000;
export const TEMPO_RESPOSTA = Number(process.env.TRUCO_RESPOSTA) || 15_000;
export const PAUSA_MAO = Number(process.env.TRUCO_PAUSA ?? 3000);

/** `jogadores` vem da sala: 2 no truco, 4 no truco em duplas. */
export function novaPartida(jogadores = 2) {
  const m = new Match({ target: ALVO, jogadores });
  const p = { m, desde: Date.now(), fim: null, eventos: m.startHand() };
  return p;
}

/** Quem o relógio está cobrando agora, e por quanto tempo. */
function cobrado(p) {
  const m = p.m;
  if (m.phase === Phase.RESPOND) return { assento: m.respondente(), tempo: TEMPO_RESPOSTA };
  if (m.phase === Phase.ONZE) return { assento: m.onzeSeat, tempo: TEMPO_RESPOSTA };
  if (m.phase === Phase.PLAY) return { assento: m.turn, tempo: TEMPO_JOGADA };
  return null;
}

export const restante = (p) => {
  const c = cobrado(p);
  if (!c) return TEMPO_JOGADA;
  return Math.max(0, p.desde + c.tempo - Date.now());
};

/**
 * Só a mão de quem pede. A dos outros nunca sai daqui enquanto a mão corre —
 * com uma exceção da regra: na mão de onze a dupla com 11 vê as cartas do
 * parceiro pra decidir se joga.
 */
export const estadoPara = (p, assento) => {
  const m = p.m;
  const c = cobrado(p);
  const parceiro = m.n === 4 ? (assento + 2) % 4 : null;
  const veParceiro = parceiro !== null && m.phase === Phase.ONZE && timeDe(assento) === m.onzeFor;
  return {
    assento,
    time: timeDe(assento),
    jogadores: m.n,
    mao: m.hands?.[assento] ?? [],
    naMaoDoOutro: m.hands?.[(assento + 1) % m.n]?.length ?? 0,
    naMao: m.hands?.map((h) => h.length) ?? [],
    maoDoParceiro: veParceiro ? m.hands[parceiro] : null,
    vira: m.vira,
    manilha: m.manilhaR,
    mesa: m.played,                    // cartas já baixadas: públicas
    vazas: m.results,
    valor: m.value,
    placar: m.scores,
    alvo: m.target,
    vez: m.turn,
    fase: m.phase,
    pedido: m.pending && { de: m.pending.by, para: m.pending.to },
    onzeDe: m.phase === Phase.ONZE ? m.onzeSeat : null,
    semAumento: m.noRaise,
    podeAumentar: m.canRaise(assento),
    proximoValor: nextValue(m.value),
    relogioDe: c?.assento ?? null,
    prazo: p.desde + (c?.tempo ?? TEMPO_JOGADA),
    eventos: p.eventos,
    fim: p.fim,
  };
};

const reinicia = (p) => { p.desde = Date.now(); };

/** Fim de mão: se ninguém cruzou o alvo, abre a próxima depois da animação. */
function depoisDosEventos(p, ev) {
  p.eventos = ev;
  if (p.m.phase === Phase.GAME_END) {
    p.fim = { vencedor: p.m.winner, motivo: 'pontos' };
    return;
  }
  if (p.m.phase === Phase.HAND_END) {
    p.eventos = ev.concat(p.m.startHand());
    p.desde = Date.now() + PAUSA_MAO;    // o cliente ainda está animando a mão anterior
    return;
  }
  reinicia(p);
}

/**
 * Uma ação de um assento. Inválida (fora da vez, índice errado, aumento quando
 * não pode) devolve null e nada muda — a engine já recusa sozinha, devolvendo
 * lista de eventos vazia.
 */
export function agir(p, assento, { tipo, indice, acao, aceita } = {}) {
  if (p.fim) return null;
  const m = p.m;
  let ev = [];
  if (tipo === 'jogar') ev = m.playCard(assento, Number(indice));
  else if (tipo === 'aumentar') ev = m.raise(assento);
  else if (tipo === 'responder') ev = m.respond(assento, acao);
  else if (tipo === 'onze') ev = m.onze(assento, !!aceita);
  else return null;

  if (!ev.length) return null;
  depoisDosEventos(p, ev);
  return { tipo, eventos: ev };
}

/**
 * Estourou o relógio. A automação é sempre a opção mais barata pra quem sumiu:
 * corre no pedido (paga o valor anterior, não o pedido) e joga a carta mais
 * fraca na vez de jogar — nunca aceita um truco no lugar do jogador.
 */
export function estourou(p) {
  const c = cobrado(p);
  if (!c || p.fim) return null;
  const m = p.m;
  const assento = c.assento;

  if (m.phase === Phase.RESPOND) return agir(p, assento, { tipo: 'responder', acao: 'run' });
  if (m.phase === Phase.ONZE) return agir(p, assento, { tipo: 'onze', aceita: false });

  const mao = m.hands[assento];
  if (!mao?.length) return null;
  let pior = 0;
  for (let i = 1; i < mao.length; i++) {
    if (strength(mao[i], m.manilhaR) < strength(mao[pior], m.manilhaR)) pior = i;
  }
  const r = agir(p, assento, { tipo: 'jogar', indice: pior });
  return r && { ...r, automatica: assento };
}
