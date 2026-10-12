import { Rules, VARIANTS } from '../../src/games/damas/rules.js';

/**
 * Árbitro de damas brasileiras. Informação perfeita: os dois veem o tabuleiro
 * inteiro, então o sigilo que dominó e truco exigiram não se aplica aqui.
 *
 * O que muda em relação aos outros: um lance NÃO é "de onde pra onde". Com dama
 * voadora e captura múltipla existem caminhos diferentes com a mesma origem e o
 * mesmo destino, capturando peças diferentes. Por isso o servidor manda a lista
 * de lances legais e o cliente responde com o ÍNDICE — sem ambiguidade, e sem
 * como inventar lance que não está na lista.
 */
export const VARIANTE = VARIANTS.brazilian;
// Prazo largo de propósito: estourar não joga por ninguém, entrega a partida.
export const TEMPO_JOGADA = Number(process.env.DAMAS_TEMPO) || 60_000;

/** Assento 0 joga com as peças +1; assento 1 com as -1. */
export const ladoDe = (assento) => (assento === 0 ? 1 : -1);
export const assentoDe = (lado) => (lado === 1 ? 0 : 1);

export function novaPartida() {
  const rules = new Rules(VARIANTE);
  const st = rules.initial();
  return { rules, st, desde: Date.now(), fim: null, ultimo: null };
}

export const restante = (p) => Math.max(0, p.desde + TEMPO_JOGADA - Date.now());

const lancesDe = (p) => p.rules.moves(p.st);

/**
 * Int8Array vira objeto no JSON.stringify — o tabuleiro precisa sair como
 * array de verdade, senão o cliente recebe `{"0":1,"1":0,...}`.
 */
export const estadoPara = (p, assento) => {
  const daVez = assentoDe(p.st.turn) === assento;
  const lances = daVez && !p.fim ? lancesDe(p) : [];
  return {
    assento,
    tabuleiro: Array.from(p.st.b),
    lado: ladoDe(assento),
    vez: assentoDe(p.st.turn),
    tamanho: p.rules.N,
    pecas: p.rules.count(p.st),
    // Só quem está na vez recebe os lances: o outro não tem o que fazer com eles.
    lances: lances.map((m, i) => ({ i, from: m.from, to: m.to, path: m.path, captures: m.captures, promote: !!m.promote })),
    ultimo: p.ultimo,
    empateEm: p.rules.cfg.drawPlies - p.st.half,   // lances sem captura que faltam pro empate
    prazo: p.desde + TEMPO_JOGADA,
    fim: p.fim,
  };
};

/** Traduz o veredito do motor (1 / -1 / 0 / null) em fim de partida. */
function verificarFim(p) {
  const r = p.rules.outcome(p.st);
  if (r === null) return false;
  p.fim = r === 0
    ? { vencedor: null, motivo: 'empate' }         // 40 lances sem captura: estorna
    : { vencedor: assentoDe(r), motivo: 'lances' };
  return true;
}

/** Aplica um lance pelo índice. Fora da vez ou índice inválido não muda nada. */
export function agir(p, assento, { indice } = {}) {
  if (p.fim || assentoDe(p.st.turn) !== assento) return null;
  const lances = lancesDe(p);
  const mv = lances[Number(indice)];
  if (!mv) return null;

  p.rules.do(p.st, mv);
  p.ultimo = { assento, from: mv.from, to: mv.to, path: mv.path, captures: mv.captures, promote: !!mv.promote };
  p.desde = Date.now();
  verificarFim(p);
  return { tipo: 'lance', lance: p.ultimo };
}

/**
 * Estourou o relógio: quem estava na vez perde por W.O. Jogar por ele (antes
 * a IA fazia o lance) deixava um jogador ausente seguir na partida — e em
 * damas um lance ruim decide o jogo do mesmo jeito. O prazo é largo, e a tela
 * avisa os dois nos últimos segundos.
 */
export function estourou(p) {
  if (p.fim) return null;
  const ausente = assentoDe(p.st.turn);
  p.fim = { vencedor: 1 - ausente, motivo: 'tempo' };
  return { tipo: 'tempo', ausente };
}
