import * as R from '../../src/games/golfe/regras.js';

/**
 * Árbitro do Mini-golfe: sem vez (todo mundo taca quando a bola para), o
 * relógio é o do buraco / do intervalo. A tacada é simulada inteira aqui.
 */
export const novaPartida = (n) => R.novaPartida(Date.now(), n);
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const estourou = (p) => R.estourou(p);
export const restante = (p) => R.restante(p);
export const eliminar = (p, i) => R.eliminar(p, i);
