import { randomInt } from 'node:crypto';
import { Rodada } from '../../src/games/cacheta/regras.js';

/**
 * Árbitro da cacheta: cada um por si, de 2 a 6. Todos pagam a entrada e
 * começam com PONTOS; quem bate tira 1 (com 9) ou 2 (com 10) de cada um dos
 * outros. Zerou, saiu. O último na mesa leva o pote — o settleMatch de um
 * vencedor só, como no pôquer.
 *
 * A mão em si é a Rodada (regras puras). Aqui entram pontos, carteador
 * girando, relógio, eliminação e sigilo.
 */
export const PONTOS = Number(process.env.CACHETA_PONTOS) || 10;
export const TEMPO_JOGADA = Number(process.env.CACHETA_TEMPO) || 30_000;
export const PAUSA_RODADA = Number(process.env.CACHETA_PAUSA ?? 6000);   // a batida na tela antes da próxima
export const AUSENCIAS_MAX = 3;

/** Embaralho com dinheiro em jogo: crypto, não Math.random. */
const rngSeguro = () => randomInt(0, 2 ** 32) / 2 ** 32;

const vivos = (p) => p.pontos.flatMap((pt, s) => (pt > 0 && !p.saiu[s] ? [s] : []));
/** Próximo vivo depois de `s`, no sentido da mesa. */
const depoisDe = (p, s) => {
  for (let i = 1; i <= p.n; i++) { const x = (s + i) % p.n; if (p.pontos[x] > 0 && !p.saiu[x]) return x; }
  return s;
};

export function novaPartida(jogadores = 2) {
  const p = {
    n: jogadores, pontos: Array(jogadores).fill(PONTOS), saiu: Array(jogadores).fill(false), colocacao: [],
    carteador: randomInt(0, jogadores), rodadaNum: 0, r: null, resultado: null,
    desde: Date.now(), vez: null, fim: null, ausencias: Array(jogadores).fill(0),
  };
  novaRodada(p);
  return p;
}

/** Carteador gira; começa quem senta depois dele. */
function novaRodada(p) {
  p.rodadaNum++;
  p.carteador = depoisDe(p, p.carteador);
  p.r = new Rodada({ jogadores: p.n, assentos: vivos(p), inicio: depoisDe(p, p.carteador), rng: rngSeguro });
  p.resultado = null;
  p.desde = Date.now();
  p.vez = p.r.vez;
}

/** Depois de qualquer ação: se a mão fechou, desconta os pontos e vê quem sobrou. */
function depois(p, r) {
  p.desde = Date.now();
  const rd = p.r;
  if (rd.fim && !p.resultado) {
    const { vencedor, perda } = rd.fim;
    const perdas = Array(p.n).fill(0);
    if (vencedor != null) {
      for (const s of rd.assentos) {
        if (s === vencedor || p.saiu[s]) continue;
        perdas[s] = Math.min(perda, p.pontos[s]);
        p.pontos[s] -= perdas[s];
        if (!p.pontos[s] && !p.colocacao.includes(s)) p.colocacao.push(s);
      }
    }
    // Na batida as mãos de todos vão pra mesa: é o "mostra" da cacheta.
    p.resultado = { ...rd.fim, rodada: p.rodadaNum, perdas, maos: rd.maos, pontos: [...p.pontos] };
    r = { ...r, rodadaFim: p.resultado };
  }
  const restam = vivos(p);
  if (restam.length <= 1 && !p.fim) {
    const motivo = r?.ausencia ? 'tempo' : r?.tipo === 'saiu' ? 'abandono' : 'pontos';
    p.fim = { vencedor: restam[0] ?? null, motivo };
  }
  p.vez = rd.fim || p.fim ? null : rd.vez;
  return r;
}

export const restante = (p) => Math.max(0, p.desde + (p.resultado ? PAUSA_RODADA : TEMPO_JOGADA) - Date.now());

export function agir(p, assento, { tipo, carta } = {}) {
  const rd = p.r;
  if (p.fim || rd.fim) return null;
  let pub = {};
  try {
    if (tipo === 'comprar') rd.comprar(assento);
    else if (tipo === 'lixo') pub = { carta: rd.pegarLixo(assento) };     // todo mundo viu qual era
    else if (tipo === 'descartar') { rd.descartar(assento, carta); pub = { carta }; }
    else if (tipo === 'bater') rd.bater(assento, typeof carta === 'string' ? carta : undefined);
    else return null;
  } catch {
    return null;                             // regra recusou: nada muda
  }
  p.ausencias[assento] = 0;
  return depois(p, { tipo, assento, ...pub });
}

/**
 * Relógio: no fim da mão abre a próxima. No meio, joga pelo ausente (compra
 * do monte e descarta a que comprou); três estouros seguidos e ele sai da mesa.
 */
export function estourou(p) {
  if (p.fim) return null;
  if (p.resultado) { novaRodada(p); return { tipo: 'novaRodada' }; }
  const rd = p.r;
  const s = rd.vez;
  if (++p.ausencias[s] >= AUSENCIAS_MAX) return eliminar(p, s, 'tempo');
  if (rd.fase === 'comprar') rd.comprar(s);
  let carta = null;
  if (!rd.fim) {
    carta = rd.ultimaCompra ?? rd.maos[s].find((c) => c !== rd.doLixo);
    rd.descartar(s, carta);
  }
  return depois(p, { tipo: 'tempo', assento: s, carta });
}

/**
 * Saiu (ou sumiu três vezes): zera os pontos e as cartas dele saem da mão. A
 * entrada fica no pote. Sobrou um vivo: ele leva.
 */
export function eliminar(p, assento, motivo = 'abandono') {
  if (p.fim || p.saiu[assento]) return null;
  p.saiu[assento] = true;
  p.pontos[assento] = 0;
  if (!p.colocacao.includes(assento)) p.colocacao.push(assento);
  if (!p.resultado) p.r.sair(assento);
  return depois(p, { tipo: motivo === 'tempo' ? 'tempo' : 'saiu', assento, ausencia: motivo === 'tempo' });
}

/** Só o que este assento pode ver: a própria mão; das outras, a contagem. Na batida, todas. */
export const estadoPara = (p, assento) => {
  const rd = p.r;
  return {
    assento, jogadores: p.n,
    mao: rd.maos[assento],
    naMao: rd.maos.map((m) => m.length),
    vira: rd.vira,
    lixo: rd.lixo.at(-1) ?? null, lixoQtd: rd.lixo.length,
    monte: rd.monte.length,
    vez: p.vez, fase: rd.fase,
    // A carta recém-comprada / pega do lixo, só pra quem está com ela.
    comprada: rd.vez === assento ? rd.ultimaCompra : null,
    doLixo: rd.vez === assento ? rd.doLixo : null,
    pontos: p.pontos, inicial: PONTOS, saiu: p.saiu, colocacao: p.colocacao,
    naRodada: rd.assentos, carteador: p.carteador, rodada: p.rodadaNum,
    resultado: p.resultado,
    prazo: p.desde + (p.resultado ? PAUSA_RODADA : TEMPO_JOGADA), tempo: TEMPO_JOGADA,
    fim: p.fim,
  };
};

/** Assentos já eliminados: o index libera essas contas pra outra partida antes da mesa acabar. */
export const fora = (p) => p.colocacao;
