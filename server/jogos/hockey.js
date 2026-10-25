import * as R from '../../src/games/hockey/regras.js';

/** Árbitro do Air Hockey Neon: tempo real, 1 contra 1, o servidor simula a física (ver regras.js). */
export const TEMPO_REAL = true;
export const TICK_MS = R.TICK_MS;

export const novaPartida = () => R.novaPartida(Date.now());
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const passo = (p) => R.passo(p, Date.now());
export const eliminar = (p, i) => R.eliminar(p, i);
