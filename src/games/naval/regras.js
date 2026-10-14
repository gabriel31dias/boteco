/**
 * Batalha Naval: 1 contra 1, por turnos, o servidor arbitra e esconde a frota
 * de cada um (estadoPara manda só o que o assento pode ver).
 *
 * 1) Posicionar: os dois ao mesmo tempo, até POSICIONAR_MS. Quem não mandar
 *    a frota (ou não apertar pronto) fica com a sorteada.
 * 2) Batalha: um tiro por vez, TEMPO_TIRO pra atirar. Acertou, atira de novo;
 *    água, passa a vez. Estourou o relógio: sai um tiro aleatório; ESTOUROS
 *    seguidos sem jogar perde a partida (quem largou o celular).
 * Ganha quem afundar a frota inteira do outro.
 *
 * Tabuleiro 10×10, casa = y * 10 + x (x coluna A-J, y linha 1-10).
 */

export const N = 10;
export const POSICIONAR_MS = Number(globalThis.process?.env?.NAVAL_POSICIONAR) || 45_000;
export const TEMPO_TIRO = Number(globalThis.process?.env?.NAVAL_TEMPO) || 20_000;
/** O cliente anima o tiro (canhão, bala voando, impacto): o relógio da próxima jogada só começa depois. */
export const ANIMA_MS = Number(globalThis.process?.env?.NAVAL_ANIMA ?? 1800);
export const ESTOUROS = 3;

export const FROTA = [
  { id: 'porta', nome: 'Porta-aviões', tam: 5 },
  { id: 'encouracado', nome: 'Encouraçado', tam: 4 },
  { id: 'cruzador', nome: 'Cruzador', tam: 3 },
  { id: 'submarino', nome: 'Submarino', tam: 3 },
  { id: 'contra1', nome: 'Contratorpedeiro', tam: 2 },
  { id: 'contra2', nome: 'Contratorpedeiro', tam: 2 },
];
const TAM = Object.fromEntries(FROTA.map((n) => [n.id, n.tam]));

/** Casas que um navio ocupa. */
export const casasDe = ({ id, x, y, horiz }) => Array.from({ length: TAM[id] }, (_, k) => (horiz ? y * N + x + k : (y + k) * N + x));

/** A frota é válida: todos os navios, dentro do mar, sem um em cima do outro. Devolve a frota limpa ou null. */
export function validarFrota(navios) {
  if (!Array.isArray(navios) || navios.length !== FROTA.length) return null;
  const limpos = [], ocupadas = new Set();
  for (const n of FROTA) {
    const v = navios.find((z) => z?.id === n.id);
    if (!v) return null;
    const x = Number(v.x), y = Number(v.y), horiz = v.horiz === true;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return null;
    if (horiz ? x + n.tam > N || y >= N : y + n.tam > N || x >= N) return null;
    const navio = { id: n.id, x, y, horiz };
    for (const c of casasDe(navio)) { if (ocupadas.has(c)) return null; ocupadas.add(c); }
    limpos.push(navio);
  }
  return limpos;
}

/** Frota sorteada (servidor no relógio, cliente no botão "sortear"). Navios não encostam um no outro. */
export function frotaAleatoria(rnd = Math.random) {
  for (;;) {
    const navios = [], perto = new Set();
    let ok = true;
    for (const n of FROTA) {
      let posto = false;
      for (let t = 0; t < 200 && !posto; t++) {
        const horiz = rnd() < 0.5;
        const x = Math.floor(rnd() * (horiz ? N - n.tam + 1 : N)), y = Math.floor(rnd() * (horiz ? N : N - n.tam + 1));
        const navio = { id: n.id, x, y, horiz };
        const casas = casasDe(navio);
        if (casas.some((c) => perto.has(c))) continue;
        for (const c of casas) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = (c % N) + dx, cy = Math.floor(c / N) + dy;
          if (cx >= 0 && cy >= 0 && cx < N && cy < N) perto.add(cy * N + cx);
        }
        navios.push(navio);
        posto = true;
      }
      if (!posto) { ok = false; break; }
    }
    if (ok) return navios;
  }
}

// ------------------------------------------------------------------ estado

export function novaPartida(agora = Date.now()) {
  return {
    fase: 'posicionar', prazo: agora + POSICIONAR_MS,
    frotas: [frotaAleatoria(), frotaAleatoria()], pronto: [false, false],
    tiros: [new Array(N * N).fill(null), new Array(N * N).fill(null)],   // tiros[i] = tiros que o i LEVOU: 'a' água, 'x' acerto
    vez: null, desde: 0, estouros: [0, 0], acertos: [0, 0], disparos: [0, 0], fim: null,
  };
}

const navioEm = (frota, casa) => frota.find((n) => casasDe(n).includes(casa));
const afundado = (p, alvo, navio) => casasDe(navio).every((c) => p.tiros[alvo][c] === 'x');

function comecarBatalha(p, agora) {
  p.fase = 'batalha';
  p.vez = Math.random() < 0.5 ? 0 : 1;
  p.desde = agora + ANIMA_MS;   // a tela anima "à batalha!" antes do primeiro relógio
  return { tipo: 'batalha', vez: p.vez };
}

/** Atira na casa do outro. Devolve o resultado (sem expor a frota inteira). */
function atirar(p, de, casa, agora, auto = false) {
  const alvo = 1 - de;
  p.disparos[de]++;
  const navio = navioEm(p.frotas[alvo], casa);
  const x = casa % N, y = Math.floor(casa / N);
  if (!navio) {
    p.tiros[alvo][casa] = 'a';
    p.vez = alvo;
    p.desde = agora + ANIMA_MS;
    return { tipo: 'tiro', de, casa, x, y, res: 'agua', auto };
  }
  p.tiros[alvo][casa] = 'x';
  p.acertos[de]++;
  p.desde = agora + ANIMA_MS;   // acertou: atira de novo
  if (!afundado(p, alvo, navio)) return { tipo: 'tiro', de, casa, x, y, res: 'acerto', auto };
  const r = { tipo: 'tiro', de, casa, x, y, res: 'afundou', navio: { ...navio }, auto };
  if (p.frotas[alvo].every((n) => afundado(p, alvo, n))) p.fim = { vencedor: de, motivo: 'frota' };
  return r;
}

/**
 * Ação de um assento: `{ tipo: 'frota', navios, pronto }` na hora de
 * posicionar; `{ tipo: 'tiro', casa }` na batalha. null = recusada.
 */
export function agir(p, assento, acao = {}, agora = Date.now()) {
  if (p.fim || (assento !== 0 && assento !== 1)) return null;
  if (acao.tipo === 'frota') {
    if (p.fase !== 'posicionar' || p.pronto[assento]) return null;
    const frota = validarFrota(acao.navios);
    if (!frota) return null;
    p.frotas[assento] = frota;
    if (acao.pronto === true) p.pronto[assento] = true;
    if (p.pronto[0] && p.pronto[1]) return comecarBatalha(p, agora);
    return { tipo: 'frota', assento, pronto: p.pronto[assento] };
  }
  if (acao.tipo === 'tiro') {
    if (p.fase !== 'batalha' || assento !== p.vez || agora < p.desde - ANIMA_MS * 0.5) return null;
    const casa = Number(acao.casa);
    if (!Number.isInteger(casa) || casa < 0 || casa >= N * N || p.tiros[1 - assento][casa]) return null;
    p.estouros[assento] = 0;
    return atirar(p, assento, casa, agora);
  }
  return null;
}

/** Relógio: posicionar acabou (fica a frota que está) ou o da vez não atirou (tiro aleatório). */
export function estourou(p, agora = Date.now()) {
  if (p.fim) return null;
  if (p.fase === 'posicionar') { p.pronto = [true, true]; return comecarBatalha(p, agora); }
  const de = p.vez;
  if (++p.estouros[de] >= ESTOUROS) {
    p.fim = { vencedor: 1 - de, motivo: 'ausente' };
    return { tipo: 'ausente', de };
  }
  const livres = p.tiros[1 - de].flatMap((v, c) => (v ? [] : [c]));
  return atirar(p, de, livres[Math.floor(Math.random() * livres.length)], agora, true);
}

export const restante = (p, agora = Date.now()) => Math.max(0, (p.fase === 'posicionar' ? p.prazo : p.desde + TEMPO_TIRO) - agora);

/**
 * O que o assento vê: a frota dele (com os tiros que levou), os tiros que deu
 * no outro e só os navios do outro que já afundaram. No fim, tudo aberto.
 */
export function estadoPara(p, assento, agora = Date.now()) {
  const outro = 1 - assento;
  const revela = p.fim ? p.frotas[outro] : p.frotas[outro].filter((n) => afundado(p, outro, n));
  return {
    fase: p.fase, vez: p.vez, fim: p.fim, agora,
    prazo: p.fase === 'posicionar' ? p.prazo : p.desde + TEMPO_TIRO, desde: p.desde,
    pronto: p.pronto,
    minhaFrota: p.frotas[assento],
    // 100 letras, uma por casa: '.' sem tiro, 'a' água, 'x' acerto
    levei: p.tiros[assento].map((v) => v ?? '.').join(''),
    dei: p.tiros[outro].map((v) => v ?? '.').join(''),
    afundados: revela,
    afundei: p.frotas[outro].filter((n) => afundado(p, outro, n)).map((n) => n.id),
    perdi: p.frotas[assento].filter((n) => afundado(p, assento, n)).map((n) => n.id),
    acertos: p.acertos, disparos: p.disparos, estouros: p.estouros,
  };
}
