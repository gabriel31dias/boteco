import { randomInt } from 'node:crypto';
import { Rodada } from '../../src/games/buraco/regras.js';

/**
 * Árbitro do buraco (1×1 e duplas). A rodada é a Rodada (regras puras); aqui
 * entram placar entre rodadas, relógio, sigilo e a tradução de ação do socket.
 * Time = assento % 2: no 1×1 cada um é um time, nas duplas o parceiro senta em frente.
 *
 * A partida vai até ALVO pontos (não os 3000 clássicos: valendo dinheiro,
 * partida de uma hora cansa antes de pagar).
 */
export const ALVO = Number(process.env.BURACO_ALVO) || 1000;
export const TEMPO_JOGADA = Number(process.env.BURACO_TEMPO) || 45_000;
export const PAUSA_RODADA = Number(process.env.BURACO_PAUSA ?? 7000);   // placar da rodada na tela
export const AUSENCIAS_MAX = 3;

const rngSeguro = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function novaPartida(jogadores = 2) {
  const p = {
    n: jogadores, placar: [0, 0], rodadaNum: 0, inicio: randomInt(0, jogadores), r: null,
    desde: Date.now(), vez: null, fim: null, resultado: null, ausencias: Array(jogadores).fill(0),
  };
  novaRodada(p);
  return p;
}

function novaRodada(p) {
  p.rodadaNum++;
  p.r = new Rodada({ jogadores: p.n, inicio: p.inicio, rng: rngSeguro });
  p.inicio = (p.inicio + 1) % p.n;          // quem começa gira a cada rodada
  p.resultado = null;
  p.desde = Date.now();
  p.vez = p.r.vez;
}

/** Depois de qualquer ação: se a rodada fechou, soma no placar e vê se a partida acabou. */
function depois(p, r) {
  p.desde = Date.now();
  const rd = p.r;
  if (rd.fim && !p.resultado) {
    p.resultado = { ...rd.fim, rodada: p.rodadaNum };
    for (const t of [0, 1]) p.placar[t] += rd.fim.times[t].total;
    const [a, b] = p.placar;
    if (Math.max(a, b) >= ALVO && a !== b) p.fim = { vencedor: a > b ? 0 : 1, motivo: 'pontos' };
    r = { ...r, rodadaFim: p.resultado };
  }
  if (rd.mortoAgora != null) { r = { ...r, morto: rd.mortoAgora }; rd.mortoAgora = null; }
  p.vez = rd.fim ? null : rd.vez;
  return r;
}

export const restante = (p) => Math.max(0, p.desde + (p.resultado ? PAUSA_RODADA : TEMPO_JOGADA) - Date.now());

export function agir(p, assento, { tipo, cartas, jogo, carta } = {}) {
  const rd = p.r;
  if (p.fim || rd.fim) return null;
  const antes = rd.lixo.length;
  try {
    if (tipo === 'comprar') rd.comprar(assento);
    else if (tipo === 'lixo') rd.pegarLixo(assento);
    else if (tipo === 'baixar') rd.baixar(assento, cartas);
    else if (tipo === 'adicionar') rd.adicionar(assento, jogo, cartas);
    else if (tipo === 'descartar') rd.descartar(assento, carta);
    else return null;
  } catch {
    return null;                             // regra recusou: nada muda
  }
  p.ausencias[assento] = 0;
  // O que vai pra mesa inteira: o que é público (jogos, descarte, quantas do lixo). A carta comprada não.
  const pub = tipo === 'baixar' || tipo === 'adicionar' ? { cartas, jogo }
    : tipo === 'descartar' ? { carta } : tipo === 'lixo' ? { qtd: antes } : {};
  return depois(p, { tipo, assento, ...pub });
}

/**
 * Relógio: no fim da rodada abre a próxima. No meio, joga pelo ausente
 * (compra e descarta a última carta); três estouros seguidos é W.O.
 */
export function estourou(p) {
  if (p.fim) return null;
  if (p.resultado) { novaRodada(p); return { tipo: 'novaRodada' }; }
  const rd = p.r;
  const s = rd.vez;
  if (++p.ausencias[s] >= AUSENCIAS_MAX) {
    p.fim = { vencedor: vencedorWO(p, s), motivo: 'tempo' };
    return { tipo: 'tempo', assento: s };
  }
  if (rd.fase === 'comprar') rd.comprar(s);
  let carta = null;
  if (!rd.fim && rd.fase === 'jogar' && rd.vez === s) {
    for (const c of [...rd.maos[s]].reverse()) {
      try { rd.descartar(s, c); carta = c; break; } catch { /* não pode esvaziar com essa */ }
    }
  }
  return depois(p, { tipo: 'tempo', assento: s, carta });
}

/** Quem sai entrega a partida: o outro time leva. */
export function vencedorWO(p, ausente) {
  return 1 - (ausente % 2);
}

/** Só o que este assento pode ver: a própria mão; das outras, a contagem. */
export const estadoPara = (p, assento) => {
  const rd = p.r;
  return {
    assento, jogadores: p.n, time: assento % 2,
    mao: rd.maos[assento],
    naMao: rd.maos.map((m) => m.length),
    jogos: rd.jogos,
    lixo: rd.lixo,
    monte: rd.monte.length,
    mortos: rd.mortos.length,
    pegouMorto: rd.pegouMorto,
    vez: p.vez, fase: rd.fase,
    // A carta recém-comprada (pra tela destacar), só enquanto ela ainda está na mão de quem comprou.
    comprada: rd.vez === assento && rd.maos[assento].includes(rd.ultimaCompra) ? rd.ultimaCompra : null,
    placar: p.placar, alvo: ALVO, rodada: p.rodadaNum,
    resultado: p.resultado,
    prazo: p.desde + (p.resultado ? PAUSA_RODADA : TEMPO_JOGADA), tempo: TEMPO_JOGADA,
    fim: p.fim,
  };
};
