/**
 * Ordem do triângulo. Recebe o gerador de números: online os dois clientes
 * usam a mesma semente e montam a mesma mesa sem trocar uma bola sequer.
 */

/** mulberry32 — PRNG de 32 bits, mesma sequência em qualquer engine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Triângulo padrão: 8 no centro, cantos traseiros com grupos opostos. */
export function rackOrder(rand = Math.random) {
  const solids = shuffled([1, 2, 3, 4, 5, 6, 7], rand);
  const stripes = shuffled([9, 10, 11, 12, 13, 14, 15], rand);
  const slots = new Array(15).fill(null);
  slots[4] = 8;
  slots[10] = solids.pop();
  slots[14] = stripes.pop();
  const rest = shuffled([...solids, ...stripes], rand);
  for (let i = 0; i < slots.length; i++) if (slots[i] === null) slots[i] = rest.pop();
  return slots;
}
