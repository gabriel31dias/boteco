import { mulberry32 } from '../domino/regras.js';

/**
 * Regras puras do Texas Hold'em: baralho e avaliador. Roda igual no servidor
 * (que decide) e no cliente (que só mostra "Par de Reis" pra você).
 * Carta = 'As' (valor + naipe). Valor: 23456789TJQKA. Naipe: s h d c.
 */
export { mulberry32 };
export const VALORES = '23456789TJQKA';
export const NAIPES = 'shdc';
export const CATEGORIAS = ['Carta alta', 'Par', 'Dois pares', 'Trinca', 'Sequência', 'Flush',
  'Full house', 'Quadra', 'Straight flush'];
const PLURAL = { 14: 'Ases', 13: 'Reis', 12: 'Damas', 11: 'Valetes', 10: 'Dez', 9: 'Noves', 8: 'Oitos',
  7: 'Setes', 6: 'Seis', 5: 'Cincos', 4: 'Quatros', 3: 'Três', 2: 'Dois' };

export const baralho = () => [...NAIPES].flatMap((n) => [...VALORES].map((v) => v + n));

/** Fisher–Yates com o rng dado: a semente reproduz a mão nos testes. */
export function embaralhar(cartas, rng) {
  const c = [...cartas];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

const valor = (carta) => VALORES.indexOf(carta[0]) + 2;

/** Força de exatamente 5 cartas: [categoria, ...desempate], comparável em ordem. */
function avaliar5(c) {
  const vs = c.map(valor).sort((a, b) => b - a);
  const flush = c.every((x) => x[1] === c[0][1]);
  const unicos = [...new Set(vs)];
  let topo = 0;
  if (unicos.length === 5) {
    if (vs[0] - vs[4] === 4) topo = vs[0];
    else if (vs.join() === '14,5,4,3,2') topo = 5;     // roda: o Ás vale 1
  }
  // Grupos por quantidade e depois por valor: [3,3,3,2,2] vira trinca de 3 com par de 2.
  const grupos = unicos.map((v) => [vs.filter((x) => x === v).length, v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const porGrupo = grupos.map((g) => g[1]);
  const [g0, g1] = [grupos[0][0], grupos[1]?.[0]];
  if (topo && flush) return [8, topo];
  if (g0 === 4) return [7, ...porGrupo];
  if (g0 === 3 && g1 === 2) return [6, ...porGrupo];
  if (flush) return [5, ...vs];
  if (topo) return [4, topo];
  if (g0 === 3) return [3, ...porGrupo];
  if (g0 === 2 && g1 === 2) return [2, ...porGrupo];
  if (g0 === 2) return [1, ...porGrupo];
  return [0, ...vs];
}

export function comparar(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function* combinacoes(arr, k, de = 0, atual = []) {
  if (atual.length === k) { yield atual; return; }
  for (let i = de; i <= arr.length - (k - atual.length); i++) yield* combinacoes(arr, k, i + 1, [...atual, arr[i]]);
}

function nomeDe([cat, a, b]) {
  if (cat === 8 && a === 14) return 'Royal flush';
  if (cat === 1) return `Par de ${PLURAL[a]}`;
  if (cat === 2) return `Dois pares, ${PLURAL[a]} e ${PLURAL[b]}`;
  if (cat === 3) return `Trinca de ${PLURAL[a]}`;
  if (cat === 7) return `Quadra de ${PLURAL[a]}`;
  return CATEGORIAS[cat];
}

/**
 * Melhor mão de 5 entre 5 a 7 cartas. ponytail: força bruta nas 21
 * combinações; sobra velocidade pra uma mesa de 6 (avaliador por tabela
 * só se um dia isso aparecer no profiler).
 */
export function avaliar(cartas) {
  if (!cartas || cartas.length < 5) return null;
  let melhor = null;
  for (const c of combinacoes(cartas, 5)) {
    const forca = avaliar5(c);
    if (!melhor || comparar(forca, melhor.forca) > 0) melhor = { forca, melhores: c };
  }
  return { ...melhor, nome: nomeDe(melhor.forca) };
}
