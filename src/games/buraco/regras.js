import { embaralhar } from '../poker/regras.js';

/**
 * Regras puras do buraco aberto (o dos apps brasileiros). Ver o plano em
 * docs/superpowers/plans/2026-10-09-buraco.md. Resumo:
 * - 2 baralhos sem coringa (104 cartas); o 2 é curinga.
 * - Só sequências do mesmo naipe, 3+ cartas, no máximo um curinga por jogo.
 *   O 2 do próprio naipe na casa do 2 (A-2-3) é natural. Ás alto ou baixo, sem dar a volta.
 * - 11 cartas pra cada, 2 mortos de 11. Lixo aberto: pega inteiro.
 * - Esvaziou a mão: pega o morto do time (baixando = continua; descartando = a vez passa).
 *   Sem morto, só esvazia quem pode bater: time com morto pego e canastra limpa.
 *
 * Carta = valor + naipe + baralho: 'As0', 'Th1'. O baralho vai no id porque
 * existem duas de cada.
 */
export const VALORES = 'A23456789TJQK';
export const NAIPES = 'shdc';
export const BONUS = { limpa: 200, suja: 100, batida: 100, mortoPerdido: -100 };

export const baralho = () => [0, 1].flatMap((d) => [...NAIPES].flatMap((n) => [...VALORES].map((v) => v + n + d)));
export const naipe = (c) => c[1];
export const ehDois = (c) => c[0] === '2';
const rank = (c, asAlto) => (c[0] === 'A' ? (asAlto ? 14 : 1) : VALORES.indexOf(c[0]) + 1);
export const pontos = (c) => (c[0] === 'A' ? 15 : c[0] === '2' || '89TJQK'.includes(c[0]) ? 10 : 5);
export const ehCanastra = (j) => j.cartas.length >= 7;
const somaPontos = (cartas) => cartas.reduce((s, c) => s + pontos(c), 0);

/**
 * Monta um jogo com essas cartas, ou null. Devolve as cartas na ordem da
 * sequência (o curinga já na casa que ele ocupa) e se é limpo.
 */
export function montarJogo(cartas) {
  if (!Array.isArray(cartas) || cartas.length < 3 || new Set(cartas).size !== cartas.length) return null;
  if (cartas.some((c) => typeof c !== 'string' || c.length !== 3)) return null;
  const naturais = cartas.filter((c) => !ehDois(c));
  const dois = cartas.filter(ehDois);
  if (!naturais.length) return null;
  const n = naipe(naturais[0]);
  if (naturais.some((c) => naipe(c) !== n)) return null;

  let melhor = null;
  // Um 2 do naipe pode ser natural (casa do 2); os outros 2 são curinga.
  for (const natDois of [null, dois.find((c) => naipe(c) === n) ?? null]) {
    const curingas = dois.filter((c) => c !== natDois);
    if (curingas.length > 1) continue;
    const nat = natDois ? [...naturais, natDois] : naturais;
    for (const asAlto of [false, true]) {
      const rk = (c) => (c === natDois ? 2 : rank(c, asAlto));
      const ords = nat.map(rk);
      if (new Set(ords).size !== ords.length) continue;
      const min = Math.min(...ords);
      const max = Math.max(...ords);
      const buracos = max - min + 1 - nat.length;
      if (buracos > curingas.length) continue;
      const porRank = new Map(nat.map((c) => [rk(c), c]));
      const slots = [];
      for (let r = min; r <= max; r++) slots.push(porRank.get(r) ?? curingas[0]);
      if (buracos === 0 && curingas.length === 1) {
        // Curinga sobrando vai numa ponta: em cima se couber, senão embaixo.
        if (max < (asAlto ? 14 : 13)) slots.push(curingas[0]);
        else if (min > 1) slots.unshift(curingas[0]);
        else continue;
      }
      const j = { cartas: slots, curinga: curingas[0] ?? null, limpa: curingas.length === 0 };
      if (!melhor || (j.limpa && !melhor.limpa)) melhor = j;
    }
  }
  return melhor;
}

export class Rodada {
  constructor({ jogadores = 2, inicio = 0, rng = Math.random }) {
    this.n = jogadores;
    const deck = embaralhar(baralho(), rng);
    this.maos = Array.from({ length: this.n }, () => deck.splice(0, 11));
    this.mortos = [deck.splice(0, 11), deck.splice(0, 11)];
    this.monte = deck;
    this.lixo = [];
    this.jogos = [[], []];                // por time (time = assento % 2)
    this.pegouMorto = [false, false];
    this.vez = inicio;
    this.fase = 'comprar';                // comprar → jogar → (descarte) → próximo
    this.fim = null;
    this.ultimaCompra = null;             // só pra quem comprou ver qual foi
  }

  time(s) { return s % 2; }
  podeBater(t) { return this.pegouMorto[t] && this.jogos[t].some((j) => ehCanastra(j) && j.limpa); }
  temMorto(t) { return !this.pegouMorto[t] && this.mortos.length > 0; }

  conferir(s, fase) {
    if (this.fim) throw new Error('rodada encerrada');
    if (s !== this.vez) throw new Error('fora da vez');
    if (this.fase !== fase) throw new Error(fase === 'comprar' ? 'já comprou' : 'compre antes');
  }

  comprar(s) {
    this.conferir(s, 'comprar');
    // Monte acabou: um morto ainda na mesa vira monte. Sem nenhum, a rodada acaba.
    if (!this.monte.length && this.mortos.length) this.monte = this.mortos.pop();
    if (!this.monte.length) { this.encerrar(null); return null; }
    const c = this.monte.pop();
    this.maos[s].push(c);
    this.ultimaCompra = c;
    this.fase = 'jogar';
    return c;
  }

  pegarLixo(s) {
    this.conferir(s, 'comprar');
    if (!this.lixo.length) throw new Error('lixo vazio');
    this.maos[s].push(...this.lixo);
    this.lixo = [];
    this.ultimaCompra = null;
    this.fase = 'jogar';
  }

  tirarDaMao(s, cartas) {
    if (!Array.isArray(cartas) || !cartas.length) throw new Error('jogo inválido');
    const mao = this.maos[s];
    if (new Set(cartas).size !== cartas.length || cartas.some((c) => !mao.includes(c))) throw new Error('carta fora da mão');
    return mao.filter((c) => !cartas.includes(c));
  }

  /**
   * Aplica um jogo novo ou estendido. Se a mão ficar com 0 ou 1 carta, tem que
   * dar pra esvaziar (morto ou batida) — senão desfaz e recusa.
   */
  aplicarJogo(s, resto, aplicar, desfazer) {
    const t = this.time(s);
    aplicar();
    if (resto.length <= 1 && !this.temMorto(t) && !this.podeBater(t)) {
      desfazer();
      throw new Error('só esvazia a mão quem pode bater (morto do time e canastra limpa)');
    }
    this.maos[s] = resto;
    if (!resto.length) this.esvaziou(s, false);
  }

  baixar(s, cartas) {
    this.conferir(s, 'jogar');
    const resto = this.tirarDaMao(s, cartas);
    const j = montarJogo(cartas);
    if (!j) throw new Error('jogo inválido');
    const jogos = this.jogos[this.time(s)];
    this.aplicarJogo(s, resto, () => jogos.push(j), () => jogos.pop());
  }

  adicionar(s, indice, cartas) {
    this.conferir(s, 'jogar');
    const jogos = this.jogos[this.time(s)];
    const antigo = jogos[indice];
    if (!Number.isInteger(indice) || !antigo) throw new Error('jogo não existe');
    const resto = this.tirarDaMao(s, cartas);
    const j = montarJogo([...antigo.cartas, ...cartas]);
    if (!j) throw new Error('jogo inválido');
    this.aplicarJogo(s, resto, () => { jogos[indice] = j; }, () => { jogos[indice] = antigo; });
  }

  descartar(s, carta) {
    this.conferir(s, 'jogar');
    const resto = this.tirarDaMao(s, [carta]);
    const t = this.time(s);
    if (!resto.length && !this.temMorto(t) && !this.podeBater(t)) {
      throw new Error('só esvazia a mão quem pode bater (morto do time e canastra limpa)');
    }
    this.maos[s] = resto;
    this.lixo.push(carta);
    if (!resto.length) { this.esvaziou(s, true); if (this.fim) return; }
    this.vez = (s + 1) % this.n;
    this.fase = 'comprar';
    this.ultimaCompra = null;
  }

  /** Mão vazia: pega o morto do time ou, sem morto, bate. */
  esvaziou(s, descartando) {
    const t = this.time(s);
    if (this.temMorto(t)) {
      this.maos[s] = this.mortos.shift();
      this.pegouMorto[t] = true;
      this.mortoAgora = s;                // o árbitro anuncia
      return;
    }
    if (this.podeBater(t)) this.encerrar(t);
    else if (!descartando) throw new Error('não pode bater');   // aplicarJogo já impede; defesa
  }

  encerrar(bateu) {
    const times = [0, 1].map((t) => {
      const mesa = this.jogos[t].reduce((s, j) => s + somaPontos(j.cartas), 0);
      const canastras = this.jogos[t].filter(ehCanastra).reduce((s, j) => s + (j.limpa ? BONUS.limpa : BONUS.suja), 0);
      const mao = this.maos.filter((_, s) => this.time(s) === t).reduce((s, m) => s + somaPontos(m), 0);
      const batida = bateu === t ? BONUS.batida : 0;
      const morto = this.pegouMorto[t] ? 0 : BONUS.mortoPerdido;
      return { mesa, canastras, batida, morto, mao, total: mesa + canastras + batida + morto - mao };
    });
    this.fim = { bateu, times };
    this.fase = 'fim';
    this.vez = null;
  }
}
