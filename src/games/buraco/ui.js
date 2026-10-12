/**
 * Helpers puros da mesa de buraco (testados em test-ui.mjs). Posições em % da
 * referência 1671x941, a mesma do pôquer.
 */

// Lugar 0 é você (embaixo, à esquerda da mão). Os seguintes giram no sentido
// horário: quem joga depois de você fica à sua esquerda.
const LUGARES = {
  2: [[9, 86], [50, 12]],
  4: [[9, 86], [5, 48], [50, 12], [95, 48]],
};
export function lugarDe(assento, eu, n) {
  const [x, y] = LUGARES[n][(assento - eu + n) % n];
  return { x, y };
}

// ♠ ♥ ♣ ♦: cores alternadas pra mão ficar legível.
const NAIPE = 'shcd';
const VALOR = 'A3456789TJQK';
/** Ordena a mão: por naipe (ou por valor), crescente, com os 2 (curingas) no fim. */
export function ordenar(mao, modo = 'naipe') {
  const chave = (c) => (c[0] === '2' ? [99, 0] : modo === 'valor'
    ? [VALOR.indexOf(c[0]), NAIPE.indexOf(c[1])] : [NAIPE.indexOf(c[1]), VALOR.indexOf(c[0])]);
  return [...mao].sort((a, b) => { const [x1, y1] = chave(a), [x2, y2] = chave(b); return x1 - x2 || y1 - y2; });
}
