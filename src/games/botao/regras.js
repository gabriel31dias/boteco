/**
 * Futebol de Botão: 1 contra 1, FLA (assento 0, defende embaixo) × VAS
 * (assento 1, defende em cima), 5 botões cada (o 0 é o goleiro).
 *
 * Na vez, o jogador peteleca um botão dele (`{ b, ang, forca }`). O servidor
 * simula a jogada inteira na hora (`chutar`) e manda os quadros (30/s) e os
 * acontecimentos (choque, trave, gol); os clientes só animam. Até a animação
 * acabar (`livre`) ninguém joga.
 *
 * Tocou na bola com um botão seu: joga de novo, até TOQUES por vez. Não
 * tocou ou acabaram os toques: passa a vez. Gol: volta tudo pro lugar e quem
 * levou dá a saída. Ganha quem fizer GOLS primeiro ou estiver na frente
 * quando acabar o TEMPO_JOGO; empatado no fim, gol de ouro. O relógio da vez
 * estourou: passa a vez; ESTOUROS seguidos perde (largou o celular).
 *
 * Mundo = o campo entre as linhas, LARG × COMP (a tela leva isso pra
 * perspectiva da mesa).
 */

export const LARG = 800;
export const COMP = 1131;
export const PAREDE = { x0: -32, x1: 832, y0: -36, y1: COMP + 36 };   // a borda de madeira
export const GOL = { x0: 285, x1: 515, fundo: 62 };                     // boca do gol (nos dois lados)
export const R_BOTAO = 46;
export const R_BOLA = 19;
export const R_TRAVE = 7;
const M_BOLA = 0.45;
export const VEL = [140, 1900];          // petelecada: força 0 -> 1
export const TOQUES = 3;
export const GOLS = 3;
export const ESTOUROS = 3;
export const N_BOTOES = 5;
export const TEMPO_VEZ = Number(globalThis.process?.env?.BOTAO_TEMPO) || 20_000;
export const TEMPO_JOGO = Number(globalThis.process?.env?.BOTAO_JOGO) || 300_000;
export const FESTA_GOL = Number(globalThis.process?.env?.BOTAO_FESTA ?? 3500);   // a comemoração antes da saída
const DT = 1 / 240, AMOSTRA = 8;           // 240 passos/s; guarda 1 a cada 8 (30 quadros/s)
const BOLA = 2 * N_BOTOES;                 // índice da bola em `pos`
const TRAVES = [[GOL.x0, 0], [GOL.x1, 0], [GOL.x0, COMP], [GOL.x1, COMP]];

/** Cada time no seu campo; quem dá a saída fica com um botão colado na bola. */
export function formacao(saida) {
  const meu = (s) => (s === saida
    ? [[400, 1083], [235, 935], [565, 935], [400, 640], [575, 700]]
    : [[400, 1083], [235, 935], [565, 935], [250, 760], [550, 760]]);
  const pos = [...meu(0), ...meu(1).map(([x, y]) => [LARG - x, COMP - y])];
  pos.push([LARG / 2, COMP / 2]);
  return pos;
}

/**
 * Simula a petelecada no botão `b` (0..9) com ângulo e força 0..1. Devolve
 * os quadros ([x0, y0, ..., x10, y10] por quadro), onde tudo parou, o gol
 * (assento que marcou ou null), quais times tocaram na bola e os
 * acontecimentos ([quadro, tipo, x, y, intensidade]).
 */
export function chutar(pos, b, ang, forca) {
  const o = pos.map(([x, y], i) => ({ x, y, vx: 0, vy: 0, r: i === BOLA ? R_BOLA : R_BOTAO, m: i === BOLA ? M_BOLA : 1 }));
  const v0 = VEL[0] + (VEL[1] - VEL[0]) * Math.min(1, Math.max(0, forca));
  o[b].vx = Math.cos(ang) * v0; o[b].vy = Math.sin(ang) * v0;
  const quadros = [o.flatMap((p) => [Math.round(p.x), Math.round(p.y)])];
  const eventos = [], ultimo = new Map(), tocou = [false, false];
  let gol = null;
  const ev = (k, tipo, x, y, f, chave) => {
    if (chave && k - (ultimo.get(chave) ?? -99) < 14) return;
    if (chave) ultimo.set(chave, k);
    if (f < 60 && tipo !== 'gol') return;
    eventos.push([Math.floor(k / AMOSTRA), tipo, Math.round(x), Math.round(y), Math.round(f)]);
  };
  for (let k = 1; k <= 9 / DT; k++) {
    // atrito: o botão desliza no feltro e para logo; a bola rola mais (e na rede, morre)
    for (const [i, p] of o.entries()) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp === 0) continue;
      const naRede = i === BOLA && (p.y < 0 || p.y > COMP) && p.x > GOL.x0 && p.x < GOL.x1;
      const desac = naRede ? 2600 + 6 * sp : i === BOLA ? 220 + 0.9 * sp : 520 + 1.1 * sp;
      const nova = Math.max(0, sp - desac * DT);
      p.vx *= nova / sp; p.vy *= nova / sp;
      if (nova < 4) { p.vx = 0; p.vy = 0; }
      p.x += p.vx * DT; p.y += p.vy * DT;
    }
    // choques entre todos (botão com botão, botão com bola)
    for (let i = 0; i < o.length; i++) for (let j = i + 1; j < o.length; j++) {
      const a = o[i], c = o[j];
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), min = a.r + c.r;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d, sobra = min - d;
      a.x -= nx * sobra * c.m / (a.m + c.m); a.y -= ny * sobra * c.m / (a.m + c.m);
      c.x += nx * sobra * a.m / (a.m + c.m); c.y += ny * sobra * a.m / (a.m + c.m);
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const bola = j === BOLA;
      const e = bola ? 0.85 : 0.78;
      const imp = -(1 + e) * vn / (1 / a.m + 1 / c.m);
      a.vx -= imp * nx / a.m; a.vy -= imp * ny / a.m;
      c.vx += imp * nx / c.m; c.vy += imp * ny / c.m;
      if (bola) tocou[i < N_BOTOES ? 0 : 1] = true;
      ev(k, bola ? 'bola' : 'choque', a.x + nx * a.r, a.y + ny * a.r, -vn, `${i}-${j}`);
    }
    for (const [i, p] of o.entries()) {
      const bola = i === BOLA;
      // traves
      for (const [t, [tx, ty]] of TRAVES.entries()) {
        const dx = p.x - tx, dy = p.y - ty, d = Math.hypot(dx, dy), min = p.r + R_TRAVE;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d, vn = p.vx * nx + p.vy * ny;
        p.x = tx + nx * min; p.y = ty + ny * min;
        if (vn < 0) { p.vx -= 1.6 * vn * nx; p.vy -= 1.6 * vn * ny; ev(k, 'trave', tx, ty, -vn, `t${i}-${t}`); }
      }
      // paredes; a bola entra na boca do gol até o fundo da rede
      const e = bola ? 0.65 : 0.55;
      const boca = bola && p.x > GOL.x0 && p.x < GOL.x1;
      const y0 = boca ? -GOL.fundo + p.r : PAREDE.y0 + p.r, y1 = boca ? COMP + GOL.fundo - p.r : PAREDE.y1 - p.r;
      if (bola && (p.y < 0 || p.y > COMP) && (p.x < GOL.x0 + p.r || p.x > GOL.x1 - p.r)) {   // lado da rede
        p.x = Math.min(GOL.x1 - p.r, Math.max(GOL.x0 + p.r, p.x)); p.vx = -p.vx * 0.3;
      }
      if (p.x < PAREDE.x0 + p.r) { p.x = PAREDE.x0 + p.r; ev(k, 'parede', p.x - p.r, p.y, -p.vx, `p${i}`); p.vx = -p.vx * e; }
      if (p.x > PAREDE.x1 - p.r) { p.x = PAREDE.x1 - p.r; ev(k, 'parede', p.x + p.r, p.y, p.vx, `p${i}`); p.vx = -p.vx * e; }
      if (p.y < y0) { p.y = y0; ev(k, boca ? 'rede' : 'parede', p.x, p.y - p.r, -p.vy, `p${i}`); p.vy = -p.vy * (boca ? 0.15 : e); }
      if (p.y > y1) { p.y = y1; ev(k, boca ? 'rede' : 'parede', p.x, p.y + p.r, p.vy, `p${i}`); p.vy = -p.vy * (boca ? 0.15 : e); }
      // passou inteira da linha, dentro da boca: gol
      if (bola && gol === null && p.x > GOL.x0 && p.x < GOL.x1 && (p.y < -p.r || p.y > COMP + p.r)) {
        gol = p.y < 0 ? 0 : 1;
        ev(k, 'gol', p.x, p.y, Math.hypot(p.vx, p.vy));
      }
    }
    const parado = o.every((p) => p.vx === 0 && p.vy === 0);
    if (k % AMOSTRA === 0 || parado) quadros.push(o.flatMap((p) => [Math.round(p.x), Math.round(p.y)]));
    if (parado) break;
  }
  return { quadros, pos: o.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]), gol, tocou, eventos };
}

/** Quanto tempo a animação dos quadros leva no cliente (ms). */
export const duracao = (quadros) => quadros.length * (1000 / 30);

// ------------------------------------------------------------------ estado

export function novaPartida(agora = Date.now(), rnd = Math.random) {
  const saida = rnd() < 0.5 ? 0 : 1;
  return {
    pos: formacao(saida), placar: [0, 0], vez: saida, toques: TOQUES, desde: agora + 1500, livre: agora + 1500,
    fimEm: agora + 1500 + TEMPO_JOGO, ouro: false, estouros: [0, 0], fim: null, seq: 0,
  };
}

const passarVez = (p, de, quando) => { p.vez = 1 - de; p.toques = TOQUES; p.desde = quando; };

/** Acabou o tempo de jogo: quem está na frente leva; empatado, gol de ouro. */
function apito(p) {
  if (p.placar[0] !== p.placar[1]) { p.fim = { vencedor: p.placar[0] > p.placar[1] ? 0 : 1, motivo: 'tempo' }; return { tipo: 'apito' }; }
  p.ouro = true;
  return { tipo: 'ouro' };
}

/** `{ b, ang, forca }`: b é o botão do assento (0..4). null = recusada (fora da vez, animando, lixo). */
export function agir(p, i, acao = {}, agora = Date.now()) {
  if (p.fim || i !== p.vez || agora < p.livre - 300) return null;
  const b = Number(acao.b), ang = Number(acao.ang), forca = Number(acao.forca);
  if (!Number.isInteger(b) || b < 0 || b >= N_BOTOES || !Number.isFinite(ang) || !Number.isFinite(forca) || forca <= 0.02) return null;
  const qual = i * N_BOTOES + b;
  const r = chutar(p.pos, qual, ang, Math.min(1, forca));
  const dur = duracao(r.quadros);
  p.estouros[i] = 0;
  p.livre = agora + dur + (r.gol !== null ? FESTA_GOL : 250);
  const res = { tipo: 'chute', de: i, b: qual, seq: ++p.seq, quadros: r.quadros, eventos: r.eventos, gol: r.gol, ang: Math.round(ang * 100) / 100, forca: Math.round(forca * 100) / 100 };
  if (r.gol !== null) {
    p.placar[r.gol]++;
    res.placar = [...p.placar];
    p.pos = formacao(1 - r.gol);              // quem levou dá a saída
    passarVez(p, r.gol, p.livre);
    if (p.placar[r.gol] >= GOLS || p.ouro) p.fim = { vencedor: r.gol, motivo: p.ouro ? 'ouro' : 'gols' };
    return res;
  }
  p.pos = r.pos;
  if (r.tocou[i] && --p.toques > 0) p.desde = p.livre;
  else passarVez(p, i, p.livre);
  res.passou = p.vez !== i;
  return res;
}

/** Relógio: acabou o tempo de jogo (apito) ou o da vez (passa; ESTOUROS seguidos perde). */
export function estourou(p, agora = Date.now()) {
  if (p.fim) return null;
  if (!p.ouro && agora >= p.fimEm - 5) return apito(p);
  const de = p.vez;
  if (++p.estouros[de] >= ESTOUROS) { p.fim = { vencedor: 1 - de, motivo: 'ausente' }; return { tipo: 'ausente', de }; }
  passarVez(p, de, agora);
  p.livre = agora;
  return { tipo: 'tempo', de };
}

export function restante(p, agora = Date.now()) {
  const vez = p.desde + TEMPO_VEZ;
  // o apito espera a jogada que está rolando terminar na tela
  const jogo = p.ouro ? Infinity : Math.max(p.fimEm, p.livre);
  return Math.max(0, Math.min(vez, jogo) - agora);
}

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, vez: p.vez, toques: p.toques, placar: p.placar, pos: p.pos, desde: p.desde, livre: p.livre,
  prazo: p.desde + TEMPO_VEZ, fimEm: p.fimEm, ouro: p.ouro, estouros: p.estouros, fim: p.fim,
});
