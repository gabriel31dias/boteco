/**
 * Última Carta (regras do UNO clássico, sem a marca): 2 a 4 jogadores, uma
 * rodada, quem zerar a mão primeiro leva. O servidor arbitra e esconde as
 * mãos (estadoPara manda só a do assento e a contagem dos outros).
 *
 * Baralho de 108: por cor um 0, dois de 1–9, dois Pula, dois Inverte e dois
 * +2; mais 4 Coringas e 4 Coringas +4. Joga carta da mesma cor, do mesmo
 * número/símbolo, ou coringa. Sem carta: compra uma; se der pra jogar a
 * comprada, pode jogar, senão passa. +2/+4: o próximo compra e perde a vez
 * (sem acumular). Inverte com 2 jogadores vale como Pula.
 *
 * ÚLTIMA!: quem fica com 1 carta tem que gritar (`ultima` na jogada ou a ação
 * `ultima` logo depois). Esqueceu: qualquer outro pode `denunciar` até a
 * próxima jogada, e quem esqueceu compra 2.
 *
 * Relógio por vez (TEMPO_VEZ): estourou, o servidor compra e passa por ele;
 * ESTOUROS seguidos e ele é eliminado (a mesa segue sem ele).
 */

export const CORES = ['r', 'y', 'g', 'b'];   // vermelho, amarelo, verde, azul
export const MAO_INICIAL = 7;
export const TEMPO_VEZ = Number(globalThis.process?.env?.ULTIMA_TEMPO) || 25_000;
export const ESTOUROS = 3;
export const MAX_JOGADORES = 4;

/** Carta: { id, c: 'r'|'y'|'g'|'b'|'w', v: '0'..'9' | 's' (pula) | 'r' (inverte) | '+2' | 'w' (coringa) | '+4' } */
export function baralho() {
  const cartas = [];
  let id = 0;
  for (const c of CORES) {
    cartas.push({ id: id++, c, v: '0' });
    for (let k = 0; k < 2; k++) for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 's', 'r', '+2']) cartas.push({ id: id++, c, v });
  }
  for (let k = 0; k < 4; k++) cartas.push({ id: id++, c: 'w', v: 'w' }, { id: id++, c: 'w', v: '+4' });
  return cartas;
}

export function embaralhar(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/** Pode jogar `carta` sobre o topo, com a cor valendo agora? */
export const podeJogar = (carta, topo, cor) => carta.c === 'w' || carta.c === cor || carta.v === topo.v;

// ------------------------------------------------------------------ estado

export function novaPartida(n = 2, agora = Date.now(), rnd = Math.random) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const monte = embaralhar(baralho(), rnd);
  const maos = Array.from({ length: n }, () => monte.splice(0, MAO_INICIAL));
  // a primeira da mesa é sempre número (coringa e ação voltam pro monte)
  let k = monte.findIndex((c) => /^\d$/.test(c.v));
  const topo = monte.splice(k, 1)[0];
  return {
    n, maos, monte, descarte: [topo], cor: topo.c, sentido: 1, vez: Math.floor(rnd() * n),
    fora: Array(n).fill(false), estouros: Array(n).fill(0), gritou: Array(n).fill(false),
    esqueceu: null, comprada: null, desde: agora, fim: null, seq: 0, rnd,
  };
}

const ativos = (p) => p.fora.flatMap((f, i) => (f ? [] : [i]));
/** Próximo assento ativo no sentido, pulando `pula` vezes. */
function proximo(p, de, passos = 1) {
  let i = de;
  for (let k = 0; k < passos; k++) {
    do { i = (i + p.sentido + p.n) % p.n; } while (p.fora[i]);
  }
  return i;
}

/** Compra `q` cartas pro assento (remonta o monte com o descarte quando acaba). */
function comprar(p, i, q) {
  const ganhou = [];
  for (let k = 0; k < q; k++) {
    if (!p.monte.length) {
      const topo = p.descarte.pop();
      p.monte = embaralhar(p.descarte, p.rnd);
      p.descarte = [topo];
      if (!p.monte.length) break;   // tudo na mão de alguém: acabou o que comprar
    }
    ganhou.push(p.monte.pop());
  }
  p.maos[i].push(...ganhou);
  if (p.maos[i].length > 1) p.gritou[i] = false;
  return ganhou;
}

function passarVez(p, agora, passos = 1) {
  p.vez = proximo(p, p.vez, passos);
  p.comprada = null;
  p.desde = agora;
}

function terminar(p, vencedor, motivo) {
  p.fim = { vencedor, motivo };
  p.vez = null;
}

/**
 * Ações de um assento:
 *  { tipo: 'jogar', id, cor?, ultima? } · { tipo: 'comprar' } · { tipo: 'passar' }
 *  { tipo: 'ultima' } · { tipo: 'denunciar' }
 * Devolve o resultado (o que animar) ou null se recusada.
 */
export function agir(p, i, acao = {}, agora = Date.now()) {
  if (p.fim || p.fora[i] || !acao || typeof acao !== 'object') return null;
  const mao = p.maos[i];
  const r = { de: i, seq: ++p.seq };

  if (acao.tipo === 'ultima') {
    if (mao.length > 2 || p.gritou[i]) return null;
    p.gritou[i] = true;
    if (p.esqueceu === i) p.esqueceu = null;
    return { ...r, tipo: 'ultima' };
  }
  if (acao.tipo === 'denunciar') {
    const alvo = p.esqueceu;
    if (alvo == null || alvo === i) return null;
    p.esqueceu = null;
    const cartas = comprar(p, alvo, 2);
    return { ...r, tipo: 'denuncia', alvo, qtd: cartas.length };
  }

  if (i !== p.vez) return null;
  const topo = p.descarte[p.descarte.length - 1];

  if (acao.tipo === 'comprar') {
    if (p.comprada != null) return null;
    const [c] = comprar(p, i, 1);
    p.estouros[i] = 0;
    p.esqueceu = null;
    if (c && podeJogar(c, topo, p.cor)) { p.comprada = c.id; return { ...r, tipo: 'comprou', qtd: 1, podeJogar: true }; }
    passarVez(p, agora);
    return { ...r, tipo: 'comprou', qtd: c ? 1 : 0, passou: true };
  }
  if (acao.tipo === 'passar') {
    if (p.comprada == null) return null;
    passarVez(p, agora);
    return { ...r, tipo: 'passou' };
  }
  if (acao.tipo !== 'jogar') return null;

  const k = mao.findIndex((c) => c.id === Number(acao.id));
  if (k < 0) return null;
  const carta = mao[k];
  if (p.comprada != null && carta.id !== p.comprada) return null;   // depois de comprar, só a comprada
  if (!podeJogar(carta, topo, p.cor)) return null;
  if (carta.c === 'w' && !CORES.includes(acao.cor)) return null;
  mao.splice(k, 1);
  p.descarte.push(carta);
  p.cor = carta.c === 'w' ? acao.cor : carta.c;
  p.estouros[i] = 0;
  p.esqueceu = null;
  const res = { ...r, tipo: 'jogou', carta, cor: p.cor };

  if (!mao.length) { terminar(p, i, 'bateu'); return res; }
  if (mao.length === 1) {
    if (acao.ultima === true || p.gritou[i]) { p.gritou[i] = true; res.ultima = true; }
    else p.esqueceu = i;   // esqueceu de gritar: dá pra denunciar até a próxima jogada
  }
  const vivos = ativos(p).length;
  if (carta.v === 'r') {
    p.sentido *= -1;
    res.inverteu = true;
    passarVez(p, agora, vivos === 2 ? 2 : 1);   // com 2, inverter é pular
  } else if (carta.v === 's') {
    res.pulou = proximo(p, i);
    passarVez(p, agora, 2);
  } else if (carta.v === '+2' || carta.v === '+4') {
    const alvo = proximo(p, i);
    const q = carta.v === '+2' ? 2 : 4;
    comprar(p, alvo, q);
    Object.assign(res, { alvo, compra: q });
    passarVez(p, agora, 2);
  } else passarVez(p, agora);
  return res;
}

/** Relógio da vez: compra e passa por quem dormiu; dormiu demais, sai da mesa. */
export function estourou(p, agora = Date.now()) {
  if (p.fim || p.vez == null) return null;
  const i = p.vez;
  if (++p.estouros[i] >= ESTOUROS) return { ...eliminar(p, i, agora), ausente: true };
  if (p.comprada == null) comprar(p, i, 1);
  passarVez(p, agora);
  return { tipo: 'tempo', de: i, seq: ++p.seq };
}

export const restante = (p, agora = Date.now()) => Math.max(0, p.desde + TEMPO_VEZ - agora);

export function eliminar(p, i, agora = Date.now()) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  p.monte.unshift(...p.maos[i]);       // as cartas dele voltam pro fundo do monte
  p.maos[i] = [];
  if (p.esqueceu === i) p.esqueceu = null;
  const vivos = ativos(p);
  if (vivos.length === 1) terminar(p, vivos[0], 'wo');
  else if (p.vez === i) { p.vez = proximo(p, i); p.comprada = null; p.desde = agora; }
  return { tipo: 'saiu', assento: i, seq: ++p.seq };
}

/** O que o assento vê: a própria mão, a contagem dos outros; no fim, todas as mãos. */
export function estadoPara(p, assento, agora = Date.now()) {
  const topo = p.descarte[p.descarte.length - 1];
  const mao = p.maos[assento] ?? [];
  const minhaVez = p.vez === assento && !p.fim;
  return {
    assento, agora, n: p.n, fim: p.fim, vez: p.vez, sentido: p.sentido, cor: p.cor,
    prazo: p.desde + TEMPO_VEZ,
    mesa: p.descarte.slice(-6),           // as últimas, pra desenhar a pilha
    monte: p.monte.length,
    mao,
    naMao: p.maos.map((m) => m.length),
    fora: p.fora, gritou: p.gritou, esqueceu: p.esqueceu,
    comprada: minhaVez ? p.comprada : null,
    jogaveis: minhaVez ? mao.filter((c) => (p.comprada == null || c.id === p.comprada) && podeJogar(c, topo, p.cor)).map((c) => c.id) : [],
    maos: p.fim ? p.maos : null,
  };
}
