import { RulesEngine } from './RulesEngine.js';
import { groupOf } from './GameState.js';
import { rackOrder } from './rack.js';
import { TABLE, BALL } from '../config.js';

/**
 * As variantes da mesa. Cada modo diz:
 *  - `bolas`: os números das bolas (a branca é a 0, sempre);
 *  - `visual(n)`: como a bola é desenhada (cor, listrada, com número ou lisa);
 *  - `rack(rand)`: onde cada bola começa ({ n, x, z }) e onde fica a branca;
 *  - `avaliar(shot, state)`: as regras da tacada, no formato do RulesEngine
 *    ({ foul, reason, continueTurn, gameOver, winner, assigned }) mais
 *    `respot` (bolas que voltam pra mesa), `pontos` (somar a cada jogador) e
 *    `fase` (o que vale na próxima tacada, no snooker);
 *  - `placar(state, i)`: o que a HUD mostra de cada jogador.
 *
 * Mesa (metros): x no comprimento (-hw..hw, a cabeceira é o lado negativo),
 * z na largura. Vale online: os dois lados rodam as mesmas regras e o
 * servidor só paga quando concordam no vencedor (então empate nunca sai —
 * todo modo decide um vencedor).
 */

const HW = TABLE.playWidth / 2;
const HEAD = -TABLE.playWidth / 4;
const FOOT = TABLE.playWidth / 4;
const GAP = BALL.radius * 2 * 1.004;
const COS30 = Math.cos(Math.PI / 6);

/** Triângulo/losango a partir do ápice no FOOT: `linhas` = bolas por fileira. */
function grade(linhas, x0 = FOOT) {
  const pos = [];
  linhas.forEach((q, r) => { for (let i = 0; i < q; i++) pos.push({ x: x0 + r * GAP * COS30, z: (i - (q - 1) / 2) * GAP }); });
  return pos;
}
function embaralha(a, rand) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const naMesa = (bolas, s) => bolas.filter((n) => !s.pocketed.includes(n));
const base = () => ({ foul: false, reason: null, continueTurn: false, gameOver: false, winner: null, assigned: null, respot: [], pontos: null, fase: undefined });

// ---------------------------------------------------------------- bola 8

const regras8 = new RulesEngine();
const BOLA8 = {
  id: 'sinuca', nome: 'Bola 8', bolas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  visual: () => null,
  rack(rand) {
    const ordem = rackOrder(rand), pos = grade([1, 2, 3, 4, 5]);
    return { branca: { x: HEAD, z: 0 }, bolas: ordem.map((n, k) => ({ n, ...pos[k] })) };
  },
  avaliar: (shot, s) => ({ ...base(), ...regras8.evaluate(shot, s) }),
  placar(s, i) {
    const g = s.players[i].group;
    const nums = g ? (g === 'lisas' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]) : null;
    return { score: nums ? nums.filter((n) => s.pocketed.includes(n)).length : 0, bolas: nums ? nums.map((n) => ({ n, feita: s.pocketed.includes(n) })) : null };
  },
  motivo: 'Bola 8 encaçapada na regra',
};

// ------------------------------------------------- bola 9 e bola 10 (rotação)

/** Bola 9 / 10: primeiro toque sempre na menor da mesa; a bola da vitória entra na regra e ganha. */
function rotacao(id, nome, ultima, linhas, posUltima) {
  const bolas = Array.from({ length: ultima }, (_, k) => k + 1);
  return {
    id, nome, bolas, visual: () => null,
    rack(rand) {
      const pos = grade(linhas);
      const resto = embaralha(bolas.filter((n) => n !== 1 && n !== ultima), rand);
      return { branca: { x: HEAD, z: 0 }, bolas: pos.map((p, k) => ({ n: k === 0 ? 1 : k === posUltima ? ultima : resto.pop(), ...p })) };
    },
    avaliar(shot, s) {
      const r = base();
      const antes = naMesa(bolas, { pocketed: s.pocketed.filter((n) => !shot.pocketed.includes(n)) });
      const menor = Math.min(...antes);
      const caiu = shot.pocketed.filter((n) => n !== 0);
      if (shot.cueScratched) { r.foul = true; r.reason = 'Bola branca encaçapada'; }
      else if (shot.firstContact === null) { r.foul = true; r.reason = 'Nenhuma bola foi atingida'; }
      else if (shot.firstContact !== menor) { r.foul = true; r.reason = `Tem que tocar primeiro na ${menor}`; }
      else if (!caiu.length && !shot.railAfterContact) { r.foul = true; r.reason = 'Nenhuma bola atingiu a tabela'; }
      const venceu = caiu.includes(ultima);
      if (venceu && !r.foul) {
        // bola 10: só vale como a última da mesa; antes disso volta pro lugar (e segue jogando)
        if (ultima === 10 && antes.some((n) => n !== 10 && !caiu.includes(n))) { r.respot = [10]; r.continueTurn = true; r.reason = 'A 10 só vale por último: volta pra mesa'; return r; }
        r.gameOver = true; r.winner = s.current; return r;
      }
      if (venceu) r.respot = [ultima];        // caiu na falta: volta pra mesa
      if (!r.foul) r.continueTurn = caiu.length > 0;
      return r;
    },
    placar(s) {
      const resta = naMesa(bolas, s);
      return { score: bolas.length - resta.length, bolas: bolas.map((n) => ({ n, feita: !resta.includes(n), vez: n === Math.min(...resta) })) };
    },
    motivo: `Bola ${ultima} encaçapada na regra`,
  };
}
const BOLA9 = rotacao('sinuca9', 'Bola 9', 9, [1, 2, 3, 2, 1], 4);
const BOLA10 = rotacao('sinuca10', 'Bola 10', 10, [1, 2, 3, 4], 4);

// -------------------------------------------------- snooker e sinuca brasileira

const COR = { vermelha: '#c8102e', amarela: '#ffd200', verde: '#0a8a3c', marrom: '#6b3a1e', azul: '#1046c9', rosa: '#ff6fb0', preta: '#141414' };
const BAULK = -TABLE.playWidth * 0.3, D = 0.16;
/** Pontos de cada cor (o "spot" pra onde ela volta). */
const SPOT = {
  2: { x: BAULK, z: D }, 3: { x: BAULK, z: -D }, 4: { x: BAULK, z: 0 },
  5: { x: 0, z: 0 }, 6: { x: HW / 2, z: 0 }, 7: { x: HW - 0.17, z: 0 },
};
const NOME_COR = { 1: 'vermelha', 2: 'amarela', 3: 'verde', 4: 'marrom', 5: 'azul', 6: 'rosa', 7: 'preta' };

/**
 * Sinuca brasileira: 1 vermelha e as 6 cores (valem 1 a 7). A "bola da vez" é
 * a de menor valor na mesa: o primeiro toque tem que ser nela. Encaçapou a da
 * vez, soma o valor e continua; outra que cair junto volta pro lugar. Falta dá
 * ao outro o valor da bola da vez (mínimo 4) e as que caíram voltam. Mesa
 * limpa: mais pontos ganha (empate: quem encaçapou a preta).
 */
const BRASILEIRA = {
  id: 'sinucabr', nome: 'Sinuca brasileira', bolas: [1, 2, 3, 4, 5, 6, 7], pontuada: true,
  visual: (n) => ({ cor: COR[NOME_COR[n]], lisa: true }),
  valor: (n) => n,
  rack: () => ({ branca: { x: BAULK - 0.07, z: 0.08 }, bolas: [{ n: 1, x: SPOT[6].x + GAP * 1.05, z: 0 }, ...[2, 3, 4, 5, 6, 7].map((n) => ({ n, ...SPOT[n] }))] }),
  spot: (n) => SPOT[n] ?? { x: SPOT[6].x + GAP * 1.05, z: 0 },
  avaliar(shot, s) {
    const r = base();
    const antes = naMesa(this.bolas, { pocketed: s.pocketed.filter((n) => !shot.pocketed.includes(n)) });
    const daVez = Math.min(...antes);
    const caiu = shot.pocketed.filter((n) => n !== 0);
    if (shot.cueScratched) { r.foul = true; r.reason = 'Bola branca encaçapada'; }
    else if (shot.firstContact === null) { r.foul = true; r.reason = 'Nenhuma bola foi atingida'; }
    else if (shot.firstContact !== daVez) { r.foul = true; r.reason = `A bola da vez é a ${NOME_COR[daVez]}`; }
    const me = s.current;
    r.pontos = [0, 0];
    if (r.foul) {
      r.pontos[1 - me] = Math.max(4, daVez);
      r.reason += ` · +${r.pontos[1 - me]} pro adversário`;
      r.respot = caiu;
    } else {
      if (caiu.includes(daVez)) { r.pontos[me] = daVez; r.continueTurn = true; }
      r.respot = caiu.filter((n) => n !== daVez);
    }
    const sobra = antes.filter((n) => !caiu.includes(n) || r.respot.includes(n));
    if (!sobra.length) {
      const fim = [s.pontos[0] + r.pontos[0], s.pontos[1] + r.pontos[1]];
      r.gameOver = true;
      r.winner = fim[0] === fim[1] ? me : fim[0] > fim[1] ? 0 : 1;
      r.reason = `Mesa limpa · ${fim[0]} x ${fim[1]}`;
    }
    return r;
  },
  placar(s, i) {
    const resta = naMesa(this.bolas, s);
    return { score: s.pontos[i], bolas: i === s.current ? resta.map((n) => ({ n, feita: false, vez: n === Math.min(...resta) })) : null };
  },
  motivo: 'Mais pontos na mesa limpa',
};

/**
 * Snooker de 6 vermelhas (formato oficial curto): vermelha (1), depois uma
 * cor à escolha (o primeiro toque escolhe; volta pro lugar), de novo
 * vermelha... Acabaram as vermelhas: a cor seguinte livre e depois as cores na
 * ordem (amarela→preta), que ficam fora. Falta: o outro ganha o valor da bola
 * envolvida (mínimo 4); vermelhas que caem na falta ficam fora, cores voltam.
 * Fim na preta: mais pontos ganha (empate: quem encaçapou a preta).
 */
const REDS = [11, 12, 13, 14, 15, 16];
const valorSn = (n) => (n >= 11 ? 1 : n);
const SNOOKER = {
  id: 'snooker', nome: 'Snooker', bolas: [...REDS, 2, 3, 4, 5, 6, 7], pontuada: true,
  visual: (n) => ({ cor: COR[n >= 11 ? 'vermelha' : NOME_COR[n]], lisa: true }),
  valor: valorSn,
  rack() {
    const pos = grade([1, 2, 3], SPOT[6].x + GAP * 1.05);
    return { branca: { x: BAULK - 0.07, z: 0.08 }, bolas: [...REDS.map((n, k) => ({ n, ...pos[k] })), ...[2, 3, 4, 5, 6, 7].map((n) => ({ n, ...SPOT[n] }))] };
  },
  spot: (n) => SPOT[n],
  /** O que vale agora: 'vermelha', 'cor' (qualquer, depois de vermelha) ou o número da cor na limpeza. */
  alvo(s, antes) {
    const vermelhas = antes.filter((n) => n >= 11).length;
    if (s.fase === 'cor') return 'cor';
    if (vermelhas) return 'vermelha';
    return Math.min(...antes);
  },
  avaliar(shot, s) {
    const r = base();
    const antes = naMesa(this.bolas, { pocketed: s.pocketed.filter((n) => !shot.pocketed.includes(n)) });
    const alvo = this.alvo(s, antes);
    const caiu = shot.pocketed.filter((n) => n !== 0);
    const me = s.current;
    const fc = shot.firstContact;
    const ehVerm = (n) => n >= 11;
    // a bola "da vez" desta tacada: na fase de cor, a cor que tocou primeiro
    const daVez = alvo === 'vermelha' ? 'vermelha' : alvo === 'cor' ? (fc != null && !ehVerm(fc) ? fc : null) : alvo;
    const envolvidas = [fc, ...caiu].filter((n) => n != null).map(valorSn);
    const multa = Math.max(4, typeof daVez === 'number' ? daVez : 1, ...envolvidas);
    if (shot.cueScratched) { r.foul = true; r.reason = 'Bola branca encaçapada'; }
    else if (fc === null) { r.foul = true; r.reason = 'Nenhuma bola foi atingida'; }
    else if (daVez === 'vermelha' ? !ehVerm(fc) : daVez == null || fc !== daVez) { r.foul = true; r.reason = alvo === 'vermelha' ? 'Tinha que tocar numa vermelha' : alvo === 'cor' ? 'Tinha que tocar numa cor' : `A bola da vez é a ${NOME_COR[alvo]}`; }
    else if (caiu.some((n) => (daVez === 'vermelha' ? !ehVerm(n) : n !== daVez))) { r.foul = true; r.reason = 'Encaçapou bola que não era a da vez'; }
    r.pontos = [0, 0];
    if (r.foul) {
      r.pontos[1 - me] = multa;
      r.reason += ` · +${multa} pro adversário`;
      r.respot = caiu.filter((n) => !ehVerm(n));            // na falta: vermelha fica fora, cor volta pro lugar
      r.fase = 'vermelha';
    } else if (!caiu.length) {
      r.fase = 'vermelha';                                   // errou: o outro começa pela vermelha (ou pela cor da vez)
    } else {
      r.continueTurn = true;
      r.pontos[me] = caiu.reduce((t, n) => t + valorSn(n), 0);
      if (daVez === 'vermelha') r.fase = 'cor';
      else if (alvo === 'cor') { r.respot = caiu; r.fase = 'vermelha'; }   // cor depois de vermelha: volta pro lugar
      else r.fase = 'vermelha';                              // limpeza: a cor fica fora
    }
    const sobra = antes.filter((n) => !caiu.includes(n) || r.respot.includes(n));
    if (!sobra.length) {
      const fim = [s.pontos[0] + r.pontos[0], s.pontos[1] + r.pontos[1]];
      r.gameOver = true;
      r.winner = fim[0] === fim[1] ? (r.foul ? 1 - me : me) : fim[0] > fim[1] ? 0 : 1;
      r.reason = `Fim na preta · ${fim[0]} x ${fim[1]}`;
    }
    return r;
  },
  placar(s, i) {
    const resta = naMesa(this.bolas, s);
    const alvo = this.alvo(s, resta);
    const mostrar = alvo === 'vermelha' ? [11] : alvo === 'cor' ? [2, 3, 4, 5, 6, 7].filter((n) => resta.includes(n)) : [alvo];
    return { score: s.pontos[i], bolas: i === s.current ? mostrar.map((n) => ({ n, feita: false, vez: true })) : null };
  },
  motivo: 'Mais pontos no fim da preta',
};

/**
 * Bolas que voltam pro lugar (cor do snooker, bola 9/10 na falta...): no spot
 * do modo; se estiver ocupado, a posição livre mais perto ao longo da mesa.
 */
export function recolocar(world, modo, numeros) {
  for (const n of numeros) {
    const body = world.balls.find((b) => b.number === n);
    if (!body) continue;
    const alvo = modo.spot?.(n) ?? { x: FOOT, z: 0 };
    let { x } = alvo;
    const livre = (px, pz) => world.balls.every((o) => o === body || o.pocketed || !o.active || Math.hypot(o.position.x - px, o.position.z - pz) > BALL.radius * 2.05);
    for (let k = 0; k < 40 && !livre(x, alvo.z); k++) x = alvo.x + ((k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2)) * BALL.radius * 2.1;
    x = Math.max(-HW + BALL.radius * 1.5, Math.min(HW - BALL.radius * 1.5, x));
    body.reset(x, alvo.z);
    body.pocketed = false;
    body.active = true;
  }
}

export const MODOS = { sinuca: BOLA8, sinuca9: BOLA9, sinuca10: BOLA10, sinucabr: BRASILEIRA, snooker: SNOOKER };
export const modoDe = (id) => MODOS[id] ?? BOLA8;
export { COR as CORES_SNOOKER, groupOf };
