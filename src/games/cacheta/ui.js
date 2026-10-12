import { ehCuringa } from './regras.js';

/**
 * Helpers puros da mesa de cacheta (testados em test-ui.mjs). Posições em % da
 * referência 1671x941 (a mesma do pôquer e do buraco), na sala do fundo.webp.
 */

// Lugar 0 é você (embaixo, à esquerda da mão). Os seguintes giram no sentido
// horário: quem joga depois de você fica à sua esquerda. Os de cima sentam na
// borda de trás da mesa; os dos lados, nas bordas.
const LUGARES = {
  2: [[9, 86], [50, 30]],
  3: [[9, 86], [16, 37], [84, 37]],
  4: [[9, 86], [7, 58], [50, 30], [93, 58]],
  5: [[9, 86], [7, 60], [26, 32], [74, 32], [93, 60]],
  6: [[9, 86], [7, 62], [16, 36], [50, 30], [84, 36], [93, 62]],
};
export function lugarDe(assento, eu, n) {
  const [x, y] = LUGARES[n][(assento - eu + n) % n];
  return { x, y };
}

// ♠ ♥ ♣ ♦: cores alternadas pra mão ficar legível.
const NAIPE = 'shcd';
const VALOR = 'A23456789TJQK';
/** Ordena a mão: por naipe (ou por valor), crescente, com os curingas da vira no fim. */
export function ordenar(mao, vira, modo = 'naipe') {
  const chave = (c) => (vira && ehCuringa(c, vira) ? [99, NAIPE.indexOf(c[1])] : modo === 'valor'
    ? [VALOR.indexOf(c[0]), NAIPE.indexOf(c[1])] : [NAIPE.indexOf(c[1]), VALOR.indexOf(c[0])]);
  return [...mao].sort((a, b) => { const [x1, y1] = chave(a), [x2, y2] = chave(b); return x1 - x2 || y1 - y2; });
}
