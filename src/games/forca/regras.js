import { TEMAS } from './palavras.js';

/**
 * Forca: duelo 1 contra 1. Os dois recebem a mesma palavra secreta (do mesmo
 * tema) e chutam letras ao mesmo tempo, cada um no seu caubói — sem vez.
 * Cada erro arranca um pedaço do caubói (PECAS, na ordem); o 6º mata.
 *
 * Ganha quem completar a palavra primeiro. Morreu, o outro ganha. Acabou o
 * tempo: mais letras reveladas leva; empatou, quem errou menos; empatou de
 * novo, empate (devolve a entrada).
 *
 * O servidor arbitra e esconde: cada um só vê as próprias letras; do outro,
 * só quantas casas revelou e quantos pedaços perdeu. A palavra abre no fim.
 */

export const TEMPO = Number(globalThis.process?.env?.FORCA_TEMPO) || 120_000;
export const PECAS = ['chapeu', 'braco-e', 'braco-d', 'perna-e', 'perna-d', 'tronco'];
export const VIDAS = PECAS.length;

/** Letra do teclado: sem acento, Ç vira C. */
export const base = (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const ehLetra = (ch) => /^[A-Z]$/.test(base(ch));

export function sortear(rnd = Math.random) {
  const temas = Object.keys(TEMAS);
  const tema = temas[Math.floor(rnd() * temas.length)];
  const lista = TEMAS[tema];
  return { tema, palavra: lista[Math.floor(rnd() * lista.length)] };
}

export function novaPartida(agora = Date.now(), escolha = sortear()) {
  const letras = [...escolha.palavra].filter(ehLetra).length;
  return {
    tema: escolha.tema, palavra: escolha.palavra, letras,
    jogadores: [0, 1].map(() => ({ chutes: [], erros: 0, revelados: 0 })),
    prazo: agora + TEMPO, vez: null, fim: null,
  };
}

const revelados = (p, chutes) => [...p.palavra].filter((ch) => ehLetra(ch) && chutes.includes(base(ch))).length;

/** `{ letra }`: chute de um assento. null = recusado (repetido, não é letra, já acabou). */
export function agir(p, assento, acao = {}) {
  if (p.fim || (assento !== 0 && assento !== 1)) return null;
  const letra = typeof acao.letra === 'string' ? acao.letra.toUpperCase() : '';
  if (!/^[A-Z]$/.test(letra)) return null;
  const j = p.jogadores[assento];
  if (j.chutes.includes(letra) || j.erros >= VIDAS) return null;
  j.chutes.push(letra);
  const casas = [...p.palavra].flatMap((ch, k) => (ehLetra(ch) && base(ch) === letra ? [k] : []));
  const r = { tipo: 'letra', de: assento, letra, acertou: casas.length > 0, casas: casas.length };
  if (casas.length) {
    j.revelados = revelados(p, j.chutes);
    if (j.revelados === p.letras) p.fim = { vencedor: assento, motivo: 'palavra' };
  } else {
    r.peca = PECAS[j.erros];
    j.erros++;
    if (j.erros >= VIDAS) p.fim = { vencedor: 1 - assento, motivo: 'enforcado' };
  }
  return r;
}

/** Acabou o tempo: mais letras reveladas; depois menos erros; depois empate. */
export function estourou(p) {
  if (p.fim) return null;
  const [a, b] = p.jogadores;
  p.fim = a.revelados !== b.revelados ? { vencedor: a.revelados > b.revelados ? 0 : 1, motivo: 'tempo' }
    : a.erros !== b.erros ? { vencedor: a.erros < b.erros ? 0 : 1, motivo: 'erros' }
    : { vencedor: null, motivo: 'empate' };
  return { tipo: 'tempo' };
}

export const restante = (p, agora = Date.now()) => Math.max(0, p.prazo - agora);

/**
 * O que o assento vê: a palavra com as letras dele (as outras viram '_'),
 * os chutes dele, os erros dele; do rival só os números. No fim, a palavra toda.
 */
export function estadoPara(p, assento, agora = Date.now()) {
  const eu = p.jogadores[assento], rival = p.jogadores[1 - assento];
  return {
    agora, prazo: p.prazo, fim: p.fim, tema: p.tema, letras: p.letras,
    mascara: [...p.palavra].map((ch) => (!ehLetra(ch) || eu.chutes.includes(base(ch)) || p.fim ? ch : '_')).join(''),
    chutes: eu.chutes, erros: eu.erros, revelados: eu.revelados,
    acertos: eu.chutes.filter((l) => [...p.palavra].some((ch) => ehLetra(ch) && base(ch) === l)),
    rival: { erros: rival.erros, revelados: rival.revelados, chutes: rival.chutes.length },
  };
}
