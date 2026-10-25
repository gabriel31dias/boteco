/**
 * Air Hockey Neon: 1 contra 1, tempo real, o servidor simula tudo.
 *
 * Campo de LARGURA×ALTURA (as unidades são os pixels da mesa recortada, ver
 * scripts/preparar-hockey.py), y pra baixo. Assento 0 defende o gol de baixo
 * (y = ALTURA) e joga na metade de baixo; assento 1, o de cima. Cada um manda
 * só pra onde quer o taco (`{ x, y }`); o taco vai até lá com velocidade
 * limitada (ninguém teleporta) e a velocidade dele é o que dá força na tacada.
 *
 * Gol: o disco passa inteiro pela boca do gol. Quem sofreu saca (o disco
 * aparece parado do lado dele). Vence quem fizer GOLS primeiro; acabou o
 * TEMPO, vence quem tiver mais; empatado, o próximo gol decide (gol de ouro).
 * Regra dos 7 segundos: disco parado demais numa metade vai pro outro sacar
 * (quem está ganhando não consegue segurar o disco até o tempo acabar).
 */

export const LARGURA = 510;
export const ALTURA = 720;
export const TICK_MS = 33;
export const SUB = 6;                       // subpassos de física por tick (disco rápido não atravessa nada)
export const R_DISCO = 32;
export const R_TACO = 46;
export const GOL = 270;                     // largura da boca do gol
export const GOLS = 7;
export const TEMPO = Number(globalThis.process?.env?.HOCKEY_TEMPO) || 180_000;
export const CONTAGEM = Number(globalThis.process?.env?.HOCKEY_CONTAGEM ?? 3000);
export const PAUSA_GOL = Number(globalThis.process?.env?.HOCKEY_PAUSA ?? 1800);
export const PRESO = 7000;
export const V_TACO = 4500;                 // velocidade máxima do taco (u/s)
export const V_MAX = 2300;                  // velocidade máxima do disco
const ATRITO = 0.28;                        // perda por segundo (mesa de ar: quase nada)
const QUIQUE_PAREDE = 0.88;
const QUIQUE_TACO = 0.92;
const G0 = (LARGURA - GOL) / 2, G1 = (LARGURA + GOL) / 2;

const metade = (i) => (i === 0 ? [ALTURA / 2 + R_TACO, ALTURA - R_TACO] : [R_TACO, ALTURA / 2 - R_TACO]);
const limita = (v, a, b) => Math.max(a, Math.min(b, v));
const casa = (i) => ({ x: LARGURA / 2, y: i === 0 ? ALTURA - 90 : 90 });

export function novaPartida(agora = Date.now()) {
  return {
    n: 2, fase: 'contagem', faseAte: agora + CONTAGEM, fimEm: 0, ouro: false,
    placar: [0, 0], batidas: [0, 0], fora: [false, false],
    disco: { x: LARGURA / 2, y: ALTURA / 2, vx: 0, vy: 0 },
    tacos: [0, 1].map((i) => ({ ...casa(i), vx: 0, vy: 0, alvo: casa(i) })),
    saque: null, ladoDesde: agora, lado: null, ultimoToque: null,
    seq: 0, eventos: [], pendentes: [], fim: null, ultimo: agora,
  };
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });

/** `{ x, y }`: pra onde o jogador quer o taco (fica preso na metade dele). */
export function agir(p, i, acao) {
  if (p.fim || p.fora[i] || i == null || i < 0 || i > 1 || !acao || typeof acao !== 'object') return null;
  const x = Number(acao.x), y = Number(acao.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const [y0, y1] = metade(i);
  p.tacos[i].alvo = { x: limita(x, R_TACO, LARGURA - R_TACO), y: limita(y, y0, y1) };
  return { ok: true };
}

export function eliminar(p, i) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  p.fim = { vencedor: 1 - i, motivo: 'wo' };
  p.fase = 'fim';
  p.pendentes.push({ tipo: 'saiu', i });
  return { tipo: 'saiu', assento: i };
}

/** Disco parado do lado de quem vai sacar. */
function posicionar(p, quem) {
  p.disco = { x: LARGURA / 2, y: quem === 0 ? ALTURA * 0.7 : ALTURA * 0.3, vx: 0, vy: 0 };
  p.lado = quem; p.ultimoToque = null;
}

function gol(p, de, agora) {
  p.placar[de]++;
  evento(p, { tipo: 'gol', de, x: Math.round(p.disco.x), placar: [...p.placar], ouro: p.ouro });
  if (p.placar[de] >= GOLS || p.ouro) {
    p.fim = { vencedor: de, motivo: p.ouro ? 'ouro' : 'gols' };
    p.fase = 'fim';
    return;
  }
  p.fase = 'gol';
  p.faseAte = agora + PAUSA_GOL;
  p.saque = 1 - de;
  p.disco.vx = p.disco.vy = 0;
}

function passoFisica(p, dt, agora) {
  const d = p.disco;
  // tacos: andam até o alvo com velocidade limitada; a velocidade fica (é a força da tacada)
  for (const t of p.tacos) {
    const dx = t.alvo.x - t.x, dy = t.alvo.y - t.y, dist = Math.hypot(dx, dy);
    const passo = Math.min(dist, V_TACO * dt);
    const k = dist > 0 ? passo / dist : 0;
    t.vx = (dx * k) / dt; t.vy = (dy * k) / dt;
    t.x += dx * k; t.y += dy * k;
  }
  d.x += d.vx * dt; d.y += d.vy * dt;
  const f = Math.max(0, 1 - ATRITO * dt);
  d.vx *= f; d.vy *= f;

  // tacos x disco
  for (let i = 0; i < 2; i++) {
    const t = p.tacos[i];
    const dx = d.x - t.x, dy = d.y - t.y, dist = Math.hypot(dx, dy), min = R_DISCO + R_TACO;
    if (dist >= min) continue;
    const nx = dist > 0.001 ? dx / dist : 0, ny = dist > 0.001 ? dy / dist : (i === 0 ? -1 : 1);
    d.x = t.x + nx * min; d.y = t.y + ny * min;
    const rel = (d.vx - t.vx) * nx + (d.vy - t.vy) * ny;
    if (rel < 0) {
      d.vx -= (1 + QUIQUE_TACO) * rel * nx; d.vy -= (1 + QUIQUE_TACO) * rel * ny;
      const forca = -rel;
      if (forca > 120 && agora - (t.ultimaBatida ?? 0) > 80) {
        t.ultimaBatida = agora;
        p.batidas[i]++;
        p.pendentes.push({ tipo: 'batida', de: i, x: Math.round(d.x), y: Math.round(d.y), forca: Math.round(forca) });
      }
    }
    p.ultimoToque = i;
  }
  const v = Math.hypot(d.vx, d.vy);
  if (v > V_MAX) { d.vx *= V_MAX / v; d.vy *= V_MAX / v; }

  // paredes (a boca do gol é aberta)
  let bateu = 0;
  if (d.x < R_DISCO) { d.x = R_DISCO; bateu = Math.abs(d.vx); d.vx = Math.abs(d.vx) * QUIQUE_PAREDE; }
  if (d.x > LARGURA - R_DISCO) { d.x = LARGURA - R_DISCO; bateu = Math.abs(d.vx); d.vx = -Math.abs(d.vx) * QUIQUE_PAREDE; }
  const naBoca = d.x > G0 + R_DISCO * 0.4 && d.x < G1 - R_DISCO * 0.4;
  if (!naBoca) {
    if (d.y < R_DISCO) { d.y = R_DISCO; bateu = Math.abs(d.vy); d.vy = Math.abs(d.vy) * QUIQUE_PAREDE; }
    if (d.y > ALTURA - R_DISCO) { d.y = ALTURA - R_DISCO; bateu = Math.abs(d.vy); d.vy = -Math.abs(d.vy) * QUIQUE_PAREDE; }
  } else if (d.y < -R_DISCO) return gol(p, 0, agora);
  else if (d.y > ALTURA + R_DISCO) return gol(p, 1, agora);
  else if (d.y < R_DISCO || d.y > ALTURA - R_DISCO) {
    // dentro da boca: as quinas do gol são paredes
    if (d.x < G0 + R_DISCO) { d.x = G0 + R_DISCO; d.vx = Math.abs(d.vx); }
    if (d.x > G1 - R_DISCO) { d.x = G1 - R_DISCO; d.vx = -Math.abs(d.vx); }
  }
  if (bateu > 250 && agora - (p.ultimaParede ?? 0) > 60) {
    p.ultimaParede = agora;
    p.pendentes.push({ tipo: 'parede', x: Math.round(d.x), y: Math.round(d.y), forca: Math.round(bateu) });
  }
  // disco preso entre taco e parede: o taco é que sai (senão o disco atravessa a parede)
  for (const t of p.tacos) {
    const dx = t.x - d.x, dy = t.y - d.y, dist = Math.hypot(dx, dy), min = R_DISCO + R_TACO;
    if (dist < min && dist > 0.001) { t.x = d.x + (dx / dist) * min; t.y = d.y + (dy / dist) * min; }
  }
}

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  for (const e of p.pendentes) evento(p, e);
  p.pendentes = [];
  if (p.fim) return p;
  const dt = Math.min(0.1, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;

  if (p.fase === 'contagem') {
    if (agora >= p.faseAte) {
      p.fase = 'jogo'; p.fimEm = agora + TEMPO;
      posicionar(p, Math.random() < 0.5 ? 0 : 1);
      p.ladoDesde = agora;
      evento(p, { tipo: 'saque', de: p.lado });
    }
    for (let k = 0; k < SUB; k++) moverSo(p, dt / SUB);
    return p;
  }
  if (p.fase === 'gol') {
    for (let k = 0; k < SUB; k++) moverSo(p, dt / SUB);
    if (agora >= p.faseAte) {
      p.fase = 'jogo';
      posicionar(p, p.saque);
      p.ladoDesde = agora;
      evento(p, { tipo: 'saque', de: p.saque });
    }
    return p;
  }

  for (let k = 0; k < SUB && p.fase === 'jogo'; k++) passoFisica(p, dt / SUB, agora);
  for (const e of p.pendentes) evento(p, e);
  p.pendentes = [];
  if (p.fim || p.fase !== 'jogo') return p;

  // regra dos 7 segundos
  const lado = p.disco.y > ALTURA / 2 ? 0 : 1;
  if (lado !== p.lado) { p.lado = lado; p.ladoDesde = agora; }
  else if (agora - p.ladoDesde > PRESO) {
    evento(p, { tipo: 'preso', de: lado });
    posicionar(p, 1 - lado);
    p.ladoDesde = agora;
  }

  if (agora >= p.fimEm && !p.ouro) {
    const [a, b] = p.placar;
    if (a !== b) { p.fim = { vencedor: a > b ? 0 : 1, motivo: 'tempo' }; p.fase = 'fim'; }
    else { p.ouro = true; evento(p, { tipo: 'ouro' }); }
  }
  return p;
}

/** Fora do jogo (contagem, comemoração do gol) os tacos ainda andam: dá pra se posicionar. */
function moverSo(p, dt) {
  for (const t of p.tacos) {
    const dx = t.alvo.x - t.x, dy = t.alvo.y - t.y, dist = Math.hypot(dx, dy);
    const k = dist > 0 ? Math.min(dist, V_TACO * dt) / dist : 0;
    t.vx = dt > 0 ? (dx * k) / dt : 0; t.vy = dt > 0 ? (dy * k) / dt : 0;
    t.x += dx * k; t.y += dy * k;
  }
}

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, faseAte: p.faseAte, fimEm: p.fimEm, ouro: p.ouro, fim: p.fim, fora: p.fora,
  placar: p.placar, ladoDesde: p.ladoDesde, lado: p.lado,
  d: [Math.round(p.disco.x * 10) / 10, Math.round(p.disco.y * 10) / 10, Math.round(p.disco.vx), Math.round(p.disco.vy)],
  t: p.tacos.map((t) => [Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10]),
  ev: p.eventos,
});
