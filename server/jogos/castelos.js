import * as R from '../../src/games/castelos/regras.js';

/** Árbitro de Castelos em Guerra: por turnos, mas o voo é simulado no laço do servidor (TICK_MS), como a Bazuca. */
export const TEMPO_REAL = true;
export const TICK_MS = R.TICK_MS;

export const novaPartida = (n, _duplas, cores) => R.novaPartida(Date.now(), n, cores);
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const passo = (p) => R.passo(p, Date.now());
export const eliminar = (p, i) => R.eliminar(p, i);
