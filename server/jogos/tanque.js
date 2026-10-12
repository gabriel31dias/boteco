import * as R from '../../src/games/tanque/regras.js';

/**
 * Árbitro da batalha de tanques. Diferente dos jogos de turno: em vez de
 * relógio de jogada, o servidor chama `passo` TICK_MS em TICK_MS e transmite o
 * estado (ver `TEMPO_REAL` em server/index.js). `agir` só guarda o que o
 * jogador quer; quem decide tiro, acerto e vencedor é a simulação.
 */
export const TEMPO_REAL = true;
export const TICK_MS = R.TICK_MS;

export const novaPartida = (n, _duplas, cores) => R.novaPartida(Date.now(), n, cores);
export const eliminar = (p, i) => R.eliminar(p, i);
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.entrada(p, assento, acao);
export const passo = (p) => R.passo(p, Date.now());
