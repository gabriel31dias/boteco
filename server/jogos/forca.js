import * as R from '../../src/games/forca/regras.js';

/** Árbitro da Forca: os dois chutam ao mesmo tempo (sem vez); o relógio é um só, da partida. Informação escondida. */
export const novaPartida = () => R.novaPartida(Date.now());
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const estourou = (p) => R.estourou(p);
export const restante = (p) => R.restante(p);
