/**
 * Baralho de truco paulista: 40 cartas (sem 8, 9, 10).
 * Força das comuns, da mais fraca para a mais forte: 4 5 6 7 Q J K A 2 3.
 * A vira define a manilha — a carta SEGUINTE nessa sequência —, e as manilhas
 * se desempatam pelo naipe: ouros < espadas < copas < paus (zap).
 */
export const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
export const SUITS = ['ouros', 'espadas', 'copas', 'paus'];
export const SUIT_CHAR = ['♦', '♠', '♥', '♣'];

/** Carta = { r: índice em RANKS, s: índice em SUITS } */
export function newDeck() {
  const d = [];
  for (let r = 0; r < RANKS.length; r++) for (let s = 0; s < SUITS.length; s++) d.push({ r, s });
  return d;
}

export function shuffle(deck, rng = Math.random) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Rank da manilha dada a vira (3 vira → manilha é 4: a sequência é circular). */
export function manilhaRank(vira) {
  return (vira.r + 1) % RANKS.length;
}

/** 0..9 para cartas comuns, 10..13 para manilhas (por naipe). */
export function strength(card, manilhaR) {
  return card.r === manilhaR ? 10 + card.s : card.r;
}

export function isManilha(card, manilhaR) {
  return card.r === manilhaR;
}

export function cardName(c) {
  return RANKS[c.r] + SUIT_CHAR[c.s];
}
