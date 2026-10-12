import { Group, groupOf } from './GameState.js';

/**
 * Regras de 8-ball (versão de bar, amplamente usada):
 * mesa aberta até a primeira encaçapada válida fora da saída, falta dá bola na
 * mão ao adversário, e a bola 8 só vale depois de limpar o próprio grupo.
 */
export class RulesEngine {
  /**
   * @param {object} shot  { firstContact, pocketed[], cueScratched, railAfterContact, isBreak }
   * @param {GameState} state
   */
  evaluate(shot, state) {
    const me = state.current;
    const player = state.players[me];
    const potted = shot.pocketed.filter((n) => n !== 0);
    const eight = potted.includes(8);
    const result = {
      foul: false, reason: null, continueTurn: false,
      gameOver: false, winner: null, assigned: null,
    };

    const clearedBefore = state.hasClearedGroup(me);

    // --- Faltas ---
    if (shot.cueScratched) { result.foul = true; result.reason = 'Bola branca encaçapada'; }
    else if (shot.firstContact === null) { result.foul = true; result.reason = 'Nenhuma bola foi atingida'; }
    else if (shot.firstContact === 8 && !clearedBefore) {
      result.foul = true; result.reason = 'Primeiro contato na bola 8';
    } else if (!state.open && player.group && groupOf(shot.firstContact) &&
               groupOf(shot.firstContact) !== player.group && !clearedBefore) {
      result.foul = true; result.reason = `Primeiro contato em bola ${groupOf(shot.firstContact)}`;
    } else if (potted.length === 0 && !shot.railAfterContact) {
      result.foul = true; result.reason = 'Nenhuma bola atingiu a tabela';
    }

    // --- Bola 8 ---
    if (eight) {
      const legal = clearedBefore && !result.foul && potted.length >= 1;
      result.gameOver = true;
      result.winner = legal ? me : 1 - me;
      result.reason = legal ? null : (result.reason || 'Bola 8 encaçapada fora de hora');
      return result;
    }

    // --- Definição dos grupos ---
    if (state.open && !result.foul && potted.length > 0 && !shot.isBreak) {
      const first = potted.find((n) => groupOf(n));
      if (first) {
        const g = groupOf(first);
        result.assigned = { [me]: g, [1 - me]: g === Group.SOLIDS ? Group.STRIPES : Group.SOLIDS };
      }
    }

    if (result.foul) return result;

    // --- Continua a vez? ---
    const myGroup = result.assigned ? result.assigned[me] : player.group;
    if (!myGroup) {
      result.continueTurn = potted.length > 0;   // mesa aberta na saída
    } else {
      result.continueTurn = potted.some((n) => groupOf(n) === myGroup);
    }
    return result;
  }
}
