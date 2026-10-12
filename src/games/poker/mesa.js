import { avaliar, baralho, comparar, embaralhar } from './regras.js';

/**
 * Uma mão de Texas Hold'em No-Limit: blinds, quatro ruas de aposta, side pots
 * e showdown. Pura (sem relógio, sem socket): o árbitro do servidor chama
 * agir() e lê os campos. Regras da TDA — ver docs/superpowers/plans/2026-10-09-poker.md.
 *
 * Fichas são inteiros. `pilha` é o que está atrás da linha; `aposta` é o que
 * foi posto nesta rua; `investido` é o total da mão (é dele que saem os potes).
 */
export class Mao {
  constructor({ fichas, botao, sb, bb, rng = Math.random }) {
    this.n = fichas.length;
    this.pilha = [...fichas];
    this.ativo = fichas.map((f) => f > 0);
    this.botao = botao;
    this.sb = sb;
    this.bb = bb;
    this.aposta = Array(this.n).fill(0);
    this.investido = Array(this.n).fill(0);
    this.foldou = Array(this.n).fill(false);
    this.jaAgiu = Array(this.n).fill(false);
    this.viu = Array(this.n).fill(0);      // aposta da rua quando agiu pela última vez (TDA 47)
    this.pendentes = new Set();
    this.board = [];
    this.resultado = null;
    this.fase = 'preflop';

    // Distribui uma por vez a partir da esquerda do botão, como na mesa de verdade.
    this.deck = embaralhar(baralho(), rng);
    this.cartas = this.pilha.map(() => null);
    const ordem = this.desde(this.prox(botao));
    for (const s of ordem) this.cartas[s] = [this.deck.pop()];
    for (const s of ordem) this.cartas[s].push(this.deck.pop());

    // Heads-up: o botão é o SB (e age primeiro no pré-flop).
    this.posSb = ordem.length === 2 ? botao : this.prox(botao);
    this.posBb = this.prox(this.posSb);
    this.pagar(this.posSb, sb);
    this.pagar(this.posBb, bb);
    this.maior = Math.max(...this.aposta);
    this.minRaise = bb;
    this.abrirRodada(this.prox(this.posBb));
  }

  /** Próximo assento que recebeu cartas, no sentido horário. */
  prox(s) {
    for (let i = 1; i <= this.n; i++) { const x = (s + i) % this.n; if (this.ativo[x]) return x; }
    return s;
  }

  /** Assentos com cartas, começando em `s`. */
  desde(s) {
    const r = [];
    for (let i = 0; i < this.n; i++) { const x = (s + i) % this.n; if (this.ativo[x]) r.push(x); }
    return r;
  }

  vivos() { return this.desde(0).filter((s) => !this.foldou[s]); }
  podeAgir(s) { return this.ativo[s] && !this.foldou[s] && this.pilha[s] > 0; }

  pagar(s, valor) {
    const v = Math.min(valor, this.pilha[s]);
    this.pilha[s] -= v;
    this.aposta[s] += v;
    this.investido[s] += v;
    return v;
  }

  abrirRodada(primeiro) {
    this.jaAgiu.fill(false);
    this.pendentes = new Set(this.desde(0).filter((s) => this.podeAgir(s)));
    if (this.soUmCobriu()) this.pendentes.clear();
    this.vez = this.desde(primeiro).find((s) => this.pendentes.has(s)) ?? null;
    if (this.vez === null) this.avancarRua();
  }

  acoesLegais(s) {
    if (this.fase === 'fim' || s !== this.vez) return null;
    const falta = this.maior - this.aposta[s];
    const total = this.aposta[s] + this.pilha[s];
    // TDA 47: quem já agiu só reabre se encara pelo menos um aumento completo
    // (all-ins curtos somados contam). E sem ninguém pra responder não há aumento.
    const reabriu = !this.jaAgiu[s] || this.maior - this.viu[s] >= this.minRaise;
    const temQuemResponda = this.desde(0).some((x) => x !== s && this.podeAgir(x));
    const podeAumentar = reabriu && temQuemResponda && total > this.maior;
    return {
      check: falta === 0,
      call: falta > 0 ? Math.min(falta, this.pilha[s]) : 0,
      minRaise: podeAumentar ? Math.min(this.maior + this.minRaise, total) : null,
      maxRaise: podeAumentar ? total : null,
    };
  }

  agir(s, { tipo, valor } = {}) {
    const L = this.acoesLegais(s);
    if (!L) throw new Error('fora da vez');
    let ev;
    if (tipo === 'fold') {
      this.foldou[s] = true;
      ev = { tipo: 'fold' };
    } else if (tipo === 'check') {
      if (!L.check) throw new Error('check inválido');
      ev = { tipo: 'check' };
    } else if (tipo === 'call' || (tipo === 'allin' && L.minRaise === null)) {
      if (!L.call) { if (L.check) return this.agir(s, { tipo: 'check' }); throw new Error('call inválido'); }
      this.pagar(s, L.call);
      ev = { tipo: this.pilha[s] === 0 ? 'allin' : 'call', valor: this.aposta[s] };
    } else if (tipo === 'raise' || tipo === 'allin') {
      const para = tipo === 'allin' ? L.maxRaise : Math.floor(Number(valor));
      if (L.minRaise === null || !Number.isFinite(para) || para < L.minRaise || para > L.maxRaise) {
        throw new Error('aposta inválida');
      }
      const abriu = this.maior === 0;
      const aumento = para - this.maior;
      this.pagar(s, para - this.aposta[s]);
      if (aumento >= this.minRaise) { this.minRaise = aumento; this.jaAgiu.fill(false); }
      this.maior = para;
      for (const x of this.desde(0)) if (x !== s && this.podeAgir(x)) this.pendentes.add(x);
      ev = { tipo: this.pilha[s] === 0 ? 'allin' : abriu ? 'bet' : 'raise', valor: para };
    } else {
      throw new Error('ação inválida');
    }
    this.jaAgiu[s] = true;
    this.viu[s] = this.maior;
    this.pendentes.delete(s);
    this.seguir(s);
    return ev;
  }

  /** Sai da mesa no meio da mão: larga sem mexer na vez de ninguém. */
  abandonar(s) {
    if (this.fase === 'fim' || !this.ativo[s] || this.foldou[s]) return;
    if (this.vez === s) { this.agir(s, { tipo: 'fold' }); return; }
    this.foldou[s] = true;
    this.pendentes.delete(s);
    if (this.vivos().length === 1) this.encerrar();
    else if (this.soUmCobriu()) this.avancarRua();
  }

  /** Sobrou um pra agir, ele já cobriu e ninguém mais pode responder: a rua fecha. */
  soUmCobriu() {
    if (this.pendentes.size !== 1) return false;
    const [x] = this.pendentes;
    return this.aposta[x] >= this.maior && !this.desde(0).some((y) => y !== x && this.podeAgir(y));
  }

  seguir(s) {
    if (this.vivos().length === 1) return this.encerrar();
    if (this.pendentes.size === 0 || this.soUmCobriu()) return this.avancarRua();
    this.vez = this.desde(this.prox(s)).find((x) => this.pendentes.has(x));
  }

  avancarRua() {
    this.vez = null;
    if (this.fase === 'river') return this.showdown();
    const [prox, qtd] = { preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] }[this.fase];
    this.deck.pop();                                  // queima
    for (let i = 0; i < qtd; i++) this.board.push(this.deck.pop());
    this.fase = prox;
    this.aposta.fill(0);
    this.maior = 0;
    this.minRaise = this.bb;
    // Menos de dois podendo apostar: o board corre sozinho até o river.
    if (this.desde(0).filter((x) => this.podeAgir(x)).length < 2) return this.avancarRua();
    this.abrirRodada(this.prox(this.botao));
  }

  /** Potes por nível de investimento. Quem largou paga, mas não disputa. */
  potes() {
    const niveis = [...new Set(this.investido.filter((v) => v > 0))].sort((a, b) => a - b);
    const potes = [];
    let anterior = 0;
    let sobra = 0;                                   // nível só de quem largou: vai pro pote seguinte
    for (const nivel of niveis) {
      const pagaram = this.desde(0).filter((s) => this.investido[s] >= nivel);
      const valor = (nivel - anterior) * pagaram.length + sobra;
      const elegiveis = pagaram.filter((s) => !this.foldou[s]);
      anterior = nivel;
      if (!elegiveis.length) { if (potes.length) potes.at(-1).valor += valor; else sobra = valor; continue; }
      sobra = 0;
      const igual = potes.at(-1);
      if (igual && igual.elegiveis.join() === elegiveis.join()) igual.valor += valor;
      else potes.push({ valor, elegiveis });
    }
    return potes;
  }

  encerrar() {
    const [w] = this.vivos();
    const total = this.investido.reduce((a, b) => a + b, 0);
    const ganhos = Array(this.n).fill(0);
    ganhos[w] = total;
    this.pilha[w] += total;
    this.resultado = { potes: [{ valor: total, elegiveis: [w], vencedores: [w] }], ganhos, mostradas: null, maos: null };
    this.fase = 'fim';
    this.vez = null;
  }

  showdown() {
    const vivos = this.vivos();
    const mao = Object.fromEntries(vivos.map((s) => [s, avaliar([...this.cartas[s], ...this.board])]));
    const ganhos = Array(this.n).fill(0);
    const esquerda = this.desde(this.prox(this.botao));
    const potes = this.potes().map(({ valor, elegiveis }) => {
      let melhor = null;
      let vencedores = [];
      for (const s of elegiveis) {
        const c = melhor ? comparar(mao[s].forca, melhor) : 1;
        if (c > 0) { melhor = mao[s].forca; vencedores = [s]; } else if (c === 0) vencedores.push(s);
      }
      // Ficha ímpar: primeiro vencedor à esquerda do botão.
      vencedores = esquerda.filter((s) => vencedores.includes(s));
      const parte = Math.floor(valor / vencedores.length);
      let resto = valor - parte * vencedores.length;
      for (const s of vencedores) ganhos[s] += parte + (resto-- > 0 ? 1 : 0);
      // Pote de um elegível só é aposta que ninguém pagou: volta, não é vitória.
      return elegiveis.length === 1 ? { valor, elegiveis, vencedores, devolvido: true } : { valor, elegiveis, vencedores };
    });
    for (let s = 0; s < this.n; s++) this.pilha[s] += ganhos[s];
    this.resultado = {
      potes, ganhos,
      mostradas: Object.fromEntries(vivos.map((s) => [s, this.cartas[s]])),
      maos: Object.fromEntries(vivos.map((s) => [s, { nome: mao[s].nome, melhores: mao[s].melhores }])),
    };
    this.fase = 'fim';
    this.vez = null;
  }
}
