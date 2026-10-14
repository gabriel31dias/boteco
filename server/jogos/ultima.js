import * as R from '../../src/games/ultima/regras.js';

/** Árbitro da Última Carta: por turnos, mãos escondidas, 2 a 4 (como o dominó individual). */
export const novaPartida = (n) => R.novaPartida(n, Date.now());
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const estourou = (p) => R.estourou(p);
export const restante = (p) => R.restante(p);
export const eliminar = (p, i) => R.eliminar(p, i);
