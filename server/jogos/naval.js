import * as R from '../../src/games/naval/regras.js';

/** Árbitro da Batalha Naval: por turnos, igual à velha (ver server/jogos/velha.js), mas com informação escondida. */
export const novaPartida = () => R.novaPartida(Date.now());
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const estourou = (p) => R.estourou(p);
export const restante = (p) => R.restante(p);
