import * as R from '../../src/games/capivara/regras.js';

/** Árbitro da Capivara Pistola: tempo real, igual ao tanque (ver server/jogos/tanque.js). */
export const TEMPO_REAL = true;
export const TICK_MS = R.TICK_MS;

export const novaPartida = (n, _duplas, cores) => R.novaPartida(Date.now(), n, cores);
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.entrada(p, assento, acao);
export const passo = (p) => R.passo(p, Date.now());
export const eliminar = (p, i) => R.eliminar(p, i);
