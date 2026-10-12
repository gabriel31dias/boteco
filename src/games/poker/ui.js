/**
 * Helpers puros da mesa de pôquer (testados em test-ui.mjs). A tela é
 * desenhada na referência 1671x941 da arte; posições em % dela.
 */

// Lugar 0 é sempre você (embaixo). Os seguintes giram no sentido horário:
// quem age depois de você fica à sua esquerda, que é a esquerda da tela.
const LUGARES = {
  2: [[50, 82], [50, 31]],
  3: [[50, 82], [16, 38], [84, 38]],
  4: [[50, 82], [8, 56], [50, 31], [92, 56]],
  5: [[50, 82], [9, 66], [24, 34], [76, 34], [91, 66]],
  6: [[50, 82], [9, 70], [12, 40], [50, 31], [88, 40], [91, 70]],
};
export function lugarDe(assento, eu, n) {
  const [x, y] = LUGARES[n][(assento - eu + n) % n];
  return { x, y };
}

const DENOMINACOES = [[1000, 'dourada'], [100, 'preta'], [25, 'verde'], [10, 'azul'], [5, 'vermelha'], [1, 'branca']];
/** Pilha visual: guloso por cor. ponytail: corta em 10 fichas, é só desenho. */
export function fichasDe(valor) {
  const r = [];
  let resto = valor;
  for (const [v, cor] of DENOMINACOES) while (resto >= v && r.length < 10) { r.push(cor); resto -= v; }
  return r;
}

/** Atalhos do aumento: mínimo, ½ pote, pote, all-in — sempre dentro do permitido. */
export function presets(L, pote, apostaAtual) {
  if (L?.minRaise == null) return [];
  const limita = (v) => Math.max(L.minRaise, Math.min(L.maxRaise, Math.round(v)));
  const potePos = pote + L.call;                       // pote depois de pagar
  const lista = [
    { rotulo: 'Mín', valor: L.minRaise },
    { rotulo: '½ Pote', valor: limita(apostaAtual + L.call + potePos / 2) },
    { rotulo: 'Pote', valor: limita(apostaAtual + L.call + potePos) },
  ];
  // Valor repetido some; o All-in sempre fica (é o botão que todo mundo procura).
  const unicos = lista.filter((p, i) => p.valor !== L.maxRaise && lista.findIndex((q) => q.valor === p.valor) === i);
  return [...unicos, { rotulo: 'All-in', valor: L.maxRaise }];
}

const ROTULOS = { fold: 'LARGOU', check: 'CHECK', call: 'PAGOU', bet: 'APOSTOU', raise: 'AUMENTOU', allin: 'ALL-IN!' };
export const rotulo = (ev) => (ev.acao === 'allin' || ev.acao === 'fold' || ev.acao === 'check'
  ? ROTULOS[ev.acao] : `${ROTULOS[ev.acao]} ${ev.valor}`);

export const brl = (centavos) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
