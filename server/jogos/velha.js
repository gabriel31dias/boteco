import { result } from '../../src/games/velha/regras.js';

/**
 * Árbitro do jogo da velha. O servidor é dono do tabuleiro: valida cada jogada,
 * conta o placar e decide o vencedor sozinho — 9 casas não precisam do consenso
 * que a física da sinuca exige.
 *
 * Melhor de 3: quem chega a 2 vitórias leva. Empate de rodada não pontua e não
 * paga nada, só troca quem começa. Se as 3 rodadas passarem sem ninguém chegar
 * a 2 — o que é o caso NORMAL entre dois jogadores decentes, porque velha é jogo
 * resolvido — decide o relógio: leva quem gastou menos tempo pensando.
 */
export const RODADAS = 3;
// VELHA_TEMPO encurta o relógio nos testes; em produção vale o padrão.
export const TEMPO_JOGADA = Number(process.env.VELHA_TEMPO) || 15_000;
// O cliente leva ~3s animando o fim da rodada (linha vencedora, banner, limpar
// o tabuleiro). O relógio da rodada seguinte só começa depois disso, senão o
// jogador perde 3 dos 15 segundos assistindo animação.
export const PAUSA_RODADA = Number(process.env.VELHA_PAUSA ?? 3000);

export const novaPartida = () => ({
  board: new Array(9).fill(null),
  vez: 0,              // assento de quem joga agora
  comeca: 0,           // assento que abre a rodada (alterna)
  rodada: 1,
  placar: [0, 0],
  tempo: [0, 0],       // ms gastos pensando, o desempate
  desde: Date.now(),   // início do turno atual
  fim: null,           // { vencedor, motivo } quando a partida acaba
});

/** Assento 0 é sempre o X. */
export const simbolo = (assento) => (assento === 0 ? 'X' : 'O');

/**
 * O que vai pro cliente. Velha é informação perfeita: os dois veem a mesma
 * coisa, então o assento não muda nada — a assinatura só existe porque jogos
 * com mão escondida (dominó) precisam dela.
 */
export const estadoPara = (p) => ({
  board: p.board, vez: p.vez, rodada: p.rodada, placar: p.placar,
  comeca: p.comeca, prazo: p.desde + TEMPO_JOGADA, fim: p.fim,
});

const cobraTempo = (p) => {
  p.tempo[p.vez] += Math.max(0, Date.now() - p.desde);   // pausa entre rodadas não conta
  p.desde = Date.now();
};

/** Fecha a rodada e decide se a partida acabou. `vencedor` null = empate. */
function fecharRodada(p, vencedor) {
  if (vencedor !== null) p.placar[vencedor]++;

  const alvo = Math.ceil((RODADAS + 1) / 2);        // 2 numa melhor de 3
  if (p.placar[0] >= alvo || p.placar[1] >= alvo) {
    p.fim = { vencedor: p.placar[0] > p.placar[1] ? 0 : 1, motivo: 'placar' };
    return;
  }
  if (p.rodada >= RODADAS) {
    // Placar empatado no fim das rodadas: o relógio decide.
    if (p.placar[0] !== p.placar[1]) {
      p.fim = { vencedor: p.placar[0] > p.placar[1] ? 0 : 1, motivo: 'placar' };
    } else if (p.tempo[0] !== p.tempo[1]) {
      p.fim = { vencedor: p.tempo[0] < p.tempo[1] ? 0 : 1, motivo: 'tempo' };
    } else {
      p.fim = { vencedor: null, motivo: 'empate' };   // devolve a aposta
    }
    return;
  }

  p.rodada++;
  p.comeca = 1 - p.comeca;
  p.vez = p.comeca;
  p.board.fill(null);
  p.desde = Date.now() + PAUSA_RODADA;
}

/**
 * Aplica a jogada de um assento. Devolve null quando a jogada é inválida —
 * quem não é da vez, casa ocupada ou partida acabada não mexem em nada.
 */
export function agir(p, assento, { casa } = {}) {
  if (p.fim || assento !== p.vez) return null;
  casa = Number(casa);
  if (!Number.isInteger(casa) || casa < 0 || casa > 8 || p.board[casa]) return null;

  cobraTempo(p);
  p.board[casa] = simbolo(assento);

  const r = result(p.board);
  if (!r) {
    p.vez = 1 - p.vez;
    return { tipo: 'jogada', linha: null };
  }
  const linha = r.line;
  fecharRodada(p, r.player === null ? null : assento);
  return { tipo: 'rodada', linha, vencedorRodada: r.player === null ? null : assento };
}

/** Estourou o relógio: perde a rodada, não a partida. */
export function estourou(p) {
  if (p.fim) return null;
  cobraTempo(p);
  const perdedor = p.vez;
  fecharRodada(p, 1 - perdedor);
  return { tipo: 'rodada', linha: null, vencedorRodada: 1 - perdedor, tempo: true };
}

/** Quanto falta do relógio do turno atual, em ms. */
export const restante = (p) => Math.max(0, p.desde + TEMPO_JOGADA - Date.now());
