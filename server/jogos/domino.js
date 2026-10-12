import { DominoGame, mulberry32 } from '../../src/games/domino/regras.js';

/**
 * Árbitro do dominó. Aqui o servidor não é só juiz por conveniência: a mão de
 * cada jogador é escondida, então o estado NÃO pode viver no cliente. Cada
 * assento recebe a própria mão e só a contagem da mão do outro.
 *
 * A partida vai até ALVO pontos (não os 100 clássicos: valendo dinheiro, uma
 * partida de 10 rodadas cansa antes de pagar).
 */
export const ALVO = 50;
// Prazo largo de propósito: estourar não joga por ninguém, entrega a partida.
export const TEMPO_JOGADA = Number(process.env.DOMINO_TEMPO) || 60_000;
export const PAUSA_RODADA = Number(process.env.DOMINO_PAUSA ?? 3000);

/** De 2 a 4 na mesa; `duplas` só com 4 (0 e 2 contra 1 e 3). */
export const novaPartida = (jogadores = 2, duplas = false) => {
  const jogo = new DominoGame({
    rng: mulberry32((Math.random() * 0xffffffff) >>> 0), target: ALVO, jogadores, duplas,
  });
  jogo.startRound();
  return { jogo, desde: Date.now(), fim: null, ultima: null };
};

/**
 * O que cada assento pode ver. Mão dos outros e monte viram números — as
 * peças em si nunca saem daqui enquanto a rodada corre.
 */
export const estadoPara = (p, assento) => {
  const j = p.jogo;
  const revelar = j.phase !== 'playing';        // fim de rodada mostra as mãos
  return {
    assento,
    jogadores: j.n,
    duplas: j.duplas,
    time: j.timeDe(assento),
    mao: j.hands[assento],
    naMao: j.hands.map((h) => h.length),
    ativos: j.ativos,                  // individual: quem saiu fica false
    maos: revelar ? j.hands : null,
    corrente: j.chain,
    pontas: j.ends,
    monte: j.boneyard.length,
    vez: j.turn,
    rodada: j.round,
    placar: j.scores,
    alvo: j.target,
    fase: j.phase,
    podeJogar: j.turn === assento ? j.validMoves(assento) .map((m) => ({ id: m.id, side: m.side })) : [],
    precisaComprar: j.turn === assento && j.mustDraw(assento),
    prazo: p.desde + TEMPO_JOGADA,
    resultado: j.result,
    fim: p.fim,
  };
};

export const restante = (p) => Math.max(0, p.desde + TEMPO_JOGADA - Date.now());

const reiniciaRelogio = (p) => { p.desde = Date.now(); };

/** Fecha a partida quando alguém cruza o alvo. */
function verificarFim(p) {
  const j = p.jogo;
  if (j.phase !== 'matchOver') return false;
  p.fim = { vencedor: j.result.matchWinner, motivo: 'pontos' };
  return true;
}

/** Abre a próxima rodada depois da pausa de animação do cliente. */
function proximaRodada(p) {
  p.jogo.startRound();
  p.desde = Date.now() + PAUSA_RODADA;
}

/**
 * Uma ação de um assento: jogar peça, comprar do monte ou passar.
 * Devolve null quando a ação é inválida — jogada fora da vez, peça que não é
 * da mão ou encaixe errado não mudam nada.
 */
export function agir(p, assento, { tipo, id, side } = {}) {
  const j = p.jogo;
  if (p.fim || j.phase !== 'playing' || j.turn !== assento) return null;
  try {
    if (tipo === 'jogar') j.play(assento, id, side);
    else if (tipo === 'comprar') j.drawPiece(assento);
    else if (tipo === 'passar') j.passTurn(assento);
    else return null;
  } catch {
    return null;                       // regra recusou: o estado fica intacto
  }
  reiniciaRelogio(p);

  if (j.phase === 'playing') return { tipo };
  const rodada = { tipo: 'rodada', resultado: j.result };
  if (!verificarFim(p)) proximaRodada(p);
  return rodada;
}

/**
 * Estourou o relógio: quem estava na vez perde a PARTIDA por W.O. Antes o
 * servidor jogava pelo ausente, e um jogador que sumiu seguia na mesa até o
 * fim. O prazo é largo, e a tela avisa os dois nos últimos segundos.
 */
export function estourou(p) {
  const j = p.jogo;
  if (p.fim || j.phase !== 'playing') return null;
  const ausente = j.turn;
  if (!j.duplas) return eliminar(p, ausente, 'tempo');
  p.fim = { vencedor: vencedorWO(p, ausente), motivo: 'tempo' };
  return { tipo: 'tempo', ausente };
}

/**
 * Individual: quem sai (ou estoura o prazo) é eliminado e a partida segue com
 * os outros — dar o pote a quem lidera naquela hora era injusto com o segundo
 * e deixava dois amigos combinarem: o de trás sai, o da frente leva. A entrada
 * de quem saiu fica no pote. Sobrou um, ele ganha.
 */
export function eliminar(p, assento, motivo = 'abandono') {
  const j = p.jogo;
  if (p.fim || !j.eliminar(assento)) return null;
  if (j.phase === 'matchOver') {
    // Sobrou um: fim por abandono ou por tempo. Senão a saída fechou a rodada e alguém cruzou os pontos.
    p.fim = { vencedor: j.result.matchWinner, motivo: j.result.reason === 'abandono' ? motivo : 'pontos' };
  } else if (j.phase === 'roundOver') {
    proximaRodada(p);                  // a saída fechou a rodada (todos os outros já tinham passado)
  } else {
    reiniciaRelogio(p);                // a vez pode ter passado pro próximo
  }
  return { tipo: motivo === 'tempo' ? 'tempo' : 'saiu', assento };
}

/** Nas duplas quem sai entrega o time: o outro time leva (W.O.). */
export function vencedorWO(p, ausente) {
  return 1 - p.jogo.timeDe(ausente);
}
