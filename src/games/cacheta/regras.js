import { embaralhar } from '../poker/regras.js';

/**
 * Regras puras da cacheta (Copag / MegaJogos / Super Cacheta). Resumo:
 * - 2 baralhos sem coringa (104 cartas), 9 cartas pra cada, de 2 a 6 na mesa.
 * - A vira define o curinga: o valor logo acima dela (K → A), da mesma cor.
 *   Vira 8♣: os 9 pretos (9♠ 9♣) são curinga. No máximo um curinga por jogo;
 *   um curinga também pode entrar como carta natural.
 * - Jogo = trinca (mesmo valor; as três primeiras de naipes diferentes, a 4ª e
 *   a 5ª podem repetir naipe que já está no jogo) ou sequência (mesmo naipe,
 *   3+ seguidas, Ás embaixo ou em cima, sem dar a volta K-A-2).
 * - Na vez: compra do monte ou a carta de cima do lixo, depois descarta — ou bate.
 *   Bater com 9 (descarta uma e mostra as 9 em jogos): os outros perdem 1 ponto.
 *   Bater com 10 (as 10 em jogos, um deles com "ponta"): os outros perdem 2.
 * - Fora do escopo: "na boa" / furar a fila (pegar o lixo fora da vez).
 *
 * Carta = valor + naipe + baralho: 'As0', 'Th1' (são duas de cada).
 */
export const VALORES = 'A23456789TJQK';
export const NAIPES = 'shdc';
export const CARTAS_NA_MAO = 9;

export const baralho = () => [0, 1].flatMap((d) => [...NAIPES].flatMap((n) => [...VALORES].map((v) => v + n + d)));
export const naipe = (c) => c[1];
const vermelho = (n) => n === 'h' || n === 'd';

/** O curinga desta vira: { valor, vermelho }. */
export function curingaDe(vira) {
  return { valor: VALORES[(VALORES.indexOf(vira[0]) + 1) % 13], vermelho: vermelho(vira[1]) };
}
export const ehCuringa = (c, vira) => {
  const k = curingaDe(vira);
  return c[0] === k.valor && vermelho(c[1]) === k.vermelho;
};
const ok = (c) => typeof c === 'string' && c.length === 3 && VALORES.includes(c[0]) && NAIPES.includes(c[1]);

function trinca(nat, curinga) {
  if (nat.length < 2 || nat.some((c) => c[0] !== nat[0][0])) return null;
  const naipes = new Set(nat.map(naipe)).size;
  if (naipes < Math.min(3, nat.length)) return null;
  return { tipo: 'trinca', cartas: curinga ? [...nat, curinga] : nat, curinga };
}

function sequencia(nat, curinga) {
  if (nat.length < 2 || nat.some((c) => naipe(c) !== naipe(nat[0]))) return null;
  for (const asAlto of [false, true]) {
    const rk = (c) => (c[0] === 'A' ? (asAlto ? 14 : 1) : VALORES.indexOf(c[0]) + 1);
    const ords = nat.map(rk);
    if (new Set(ords).size !== ords.length) continue;
    const min = Math.min(...ords);
    const max = Math.max(...ords);
    const buracos = max - min + 1 - nat.length;
    if (buracos > (curinga ? 1 : 0)) continue;
    const porRank = new Map(nat.map((c) => [rk(c), c]));
    const cartas = [];
    for (let r = min; r <= max; r++) cartas.push(porRank.get(r) ?? curinga);
    if (curinga && !buracos) {
      // Curinga sobrando vai numa ponta: em cima se couber, senão embaixo.
      if (max < (asAlto ? 14 : 13)) cartas.push(curinga);
      else if (min > 1) cartas.unshift(curinga);
      else continue;
    }
    return { tipo: 'sequencia', cartas, curinga };
  }
  return null;
}

/**
 * Um jogo com essas cartas, ou null: { tipo, cartas (na ordem da mesa), curinga }.
 * Prefere o jogo sem curinga; se precisar, tenta cada carta-curinga como a coringa.
 */
export function jogoValido(cartas, vira) {
  if (!Array.isArray(cartas) || cartas.length < 3 || !cartas.every(ok) || new Set(cartas).size !== cartas.length) return null;
  const opcoes = [null, ...cartas.filter((c) => ehCuringa(c, vira))];
  for (const curinga of opcoes) {
    const nat = cartas.filter((c) => c !== curinga);
    const j = trinca(nat, curinga) ?? sequencia(nat, curinga);
    if (j) return j;
  }
  return null;
}

/** Subconjuntos de `cartas` com `min` a `max` elementos. */
function* subconjuntos(cartas, min, max) {
  const n = cartas.length;
  for (let m = 1; m < 1 << n; m++) {
    let bits = 0;
    for (let x = m; x; x &= x - 1) bits++;
    if (bits >= min && bits <= max) yield cartas.filter((_, i) => m & (1 << i));
  }
}

/**
 * As cartas divididas em jogos válidos (todas usadas), ou null. Só tenta jogos
 * de 3 a 5 cartas: qualquer jogo maior se parte em dois válidos (sequência em
 * dois pedaços, trinca em duas), e isso deixa a busca em microssegundos.
 */
export function particionar(cartas, vira) {
  if (!cartas.length) return [];
  const [primeira, ...resto] = cartas;
  // Só entra no jogo da primeira quem tem o mesmo valor, o mesmo naipe ou é curinga.
  const par = resto.filter((c) => c[0] === primeira[0] || naipe(c) === naipe(primeira) || ehCuringa(c, vira));
  for (const sub of subconjuntos(par, 2, 4)) {
    const sobra = resto.filter((c) => !sub.includes(c));
    if (sobra.length === 1 || sobra.length === 2) continue;
    const j = jogoValido([primeira, ...sub], vira);
    if (!j) continue;
    const r = particionar(sobra, vira);
    if (r) return [j, ...r];
  }
  return null;
}

const ordem = (c) => VALORES.indexOf(c[0]) + 1;
/** Podem estar no mesmo jogo: mesmo valor, curinga, ou mesmo naipe a até 2 casas (Ás nas duas pontas). */
export function vizinhas(a, b, vira) {
  if (a === b) return false;
  if (a[0] === b[0] || ehCuringa(a, vira) || ehCuringa(b, vira)) return true;
  if (naipe(a) !== naipe(b)) return false;
  const d = Math.abs(ordem(a) - ordem(b));
  return d <= 2 || d >= 11;
}

/**
 * Como esta mão de 10 bate, se bate: com 10 (todas em jogos) ou com 9
 * (descartando `descarte`, ou a primeira carta que deixar as 9 em jogos).
 * Devolve { jogos, descarte, cartas: 9|10 } ou null.
 */
export function batida(mao, vira, { descarte, proibida } = {}) {
  if (mao.length !== CARTAS_NA_MAO + 1) return null;
  // Filtro barato antes da busca: carta sem duas vizinhas não entra em jogo nenhum.
  const soltas = mao.filter((c) => mao.filter((o) => vizinhas(c, o, vira)).length < 2);
  if (soltas.length > 1) return null;
  if (descarte === undefined && !soltas.length) {
    const jogos = particionar(mao, vira);
    if (jogos) return { jogos, descarte: null, cartas: 10 };
  }
  const candidatas = descarte ? [descarte] : soltas.length ? soltas : mao;
  for (const d of candidatas) {
    if (!mao.includes(d) || d === proibida) continue;
    const jogos = particionar(mao.filter((c) => c !== d), vira);
    if (jogos) return { jogos, descarte: d, cartas: 9 };
  }
  return null;
}

/**
 * Uma mão de cacheta entre os `assentos` que ainda têm pontos. O índice das
 * mãos é o assento da mesa (quem já saiu fica com mão vazia).
 */
export class Rodada {
  constructor({ jogadores, assentos = [...Array(jogadores).keys()], inicio = assentos[0], rng = Math.random }) {
    this.n = jogadores;
    this.assentos = [...assentos];
    const deck = embaralhar(baralho(), rng);
    this.maos = Array.from({ length: jogadores }, () => []);
    for (let i = 0; i < CARTAS_NA_MAO; i++) for (const s of this.assentos) this.maos[s].push(deck.pop());
    this.vira = deck.pop();
    this.monte = deck;
    this.lixo = [];
    this.rng = rng;
    this.vez = inicio;
    this.fase = 'comprar';                // comprar → descartar (ou bater) → próximo
    this.fim = null;
    this.ultimaCompra = null;             // só quem comprou vê qual foi
    this.doLixo = null;                   // a carta que veio do lixo não volta pra ele na mesma vez
  }

  conferir(s, fase) {
    if (this.fim) throw new Error('rodada encerrada');
    if (s !== this.vez) throw new Error('fora da vez');
    if (this.fase !== fase) throw new Error(fase === 'comprar' ? 'já comprou' : 'compre antes');
  }

  comprar(s) {
    this.conferir(s, 'comprar');
    // Monte acabou: o lixo (menos a de cima) é embaralhado e vira monte. Nem assim? Mão anulada.
    if (!this.monte.length && this.lixo.length > 1) {
      const topo = this.lixo.pop();
      this.monte = embaralhar(this.lixo, this.rng);
      this.lixo = [topo];
    }
    if (!this.monte.length) { this.fim = { vencedor: null, perda: 0, motivo: 'monte' }; return null; }
    const c = this.monte.pop();
    this.maos[s].push(c);
    this.ultimaCompra = c;
    this.doLixo = null;
    this.fase = 'descartar';
    return c;
  }

  pegarLixo(s) {
    this.conferir(s, 'comprar');
    if (!this.lixo.length) throw new Error('lixo vazio');
    const c = this.lixo.pop();
    this.maos[s].push(c);
    this.ultimaCompra = null;
    this.doLixo = c;
    this.fase = 'descartar';
    return c;
  }

  descartar(s, carta) {
    this.conferir(s, 'descartar');
    if (!this.maos[s].includes(carta)) throw new Error('carta fora da mão');
    if (carta === this.doLixo) throw new Error('a carta do lixo não volta pro lixo na mesma vez');
    this.maos[s] = this.maos[s].filter((c) => c !== carta);
    this.lixo.push(carta);
    this.passar();
  }

  /** Bate com `descarte` (9 cartas) ou sem (10). Sem descarte dado, acha o melhor jeito. */
  bater(s, descarte) {
    this.conferir(s, 'descartar');
    const b = batida(this.maos[s], this.vira, { descarte, proibida: this.doLixo });
    if (!b) throw new Error('essa mão não bate');
    if (b.descarte) {
      this.maos[s] = this.maos[s].filter((c) => c !== b.descarte);
      this.lixo.push(b.descarte);
    }
    this.fim = { vencedor: s, perda: b.cartas === 10 ? 2 : 1, cartas: b.cartas, jogos: b.jogos, descarte: b.descarte, motivo: 'bateu' };
    return this.fim;
  }

  /** Saiu da mesa no meio da mão: as cartas dele saem do jogo. Sobrou um? A mão acaba sem perda. */
  sair(s) {
    if (this.fim || !this.assentos.includes(s)) return;
    const vez = this.vez === s;
    const proximo = this.depois(s);
    this.assentos = this.assentos.filter((x) => x !== s);
    this.maos[s] = [];
    if (this.assentos.length < 2) { this.fim = { vencedor: null, perda: 0, motivo: 'abandono' }; return; }
    if (vez) this.passar(proximo);
  }

  /** Próximo assento que está na mão depois de `s` (sentido da mesa). */
  depois(s) {
    for (let i = 1; i <= this.n; i++) { const x = (s + i) % this.n; if (this.assentos.includes(x)) return x; }
    return s;
  }

  passar(para = this.depois(this.vez)) {
    this.vez = para;
    this.fase = 'comprar';
    this.ultimaCompra = null;
    this.doLixo = null;
  }
}
