import * as R from '../../src/games/botao/regras.js';

/** Árbitro do Futebol de Botão: por turnos, 1 contra 1; a petelecada é simulada inteira aqui. */
export const novaPartida = () => R.novaPartida(Date.now());
export const estadoPara = (p, assento) => R.estadoPara(p, assento);
export const agir = (p, assento, acao) => R.agir(p, assento, acao);
export const estourou = (p) => R.estourou(p);
export const restante = (p) => R.restante(p);
