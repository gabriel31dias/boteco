/**
 * Castelos em Guerra: 1 contra 1, por turnos. Cada castelo é uma fachada de pedra
 * sobre esteiras com 4 heróis em prateleiras lá dentro. Na sua vez, o herói da vez
 * atira de dentro do próprio castelo; o tiro abre buraco na fachada rival e só
 * quem está atrás de buraco (ou pego pela explosão) leva dano. Vence quem
 * eliminar os heróis do outro. Esgotadas as RODADAS, leva quem tiver mais vida
 * somada; vida igual devolve as entradas.
 *
 * O servidor é o dono do estado e simula o voo (passo a cada TICK_MS); o cliente
 * só manda `{ fogo: { a, f } }` (ângulo em graus, força 0..1) na sua vez.
 * Heróis rivais atrás da parede não vão no estado (estadoPara): sem espiar pelo console.
 * Voo: v = (v + a·dt)/(1 + arrasto·dt); p += v·dt. Mundo de MUNDO×ALTURA, y pra baixo.
 */

export const MUNDO = 3000;
export const ALTURA = 1080;
export const G = 980;
export const DT = 1 / 120;
export const TICK_MS = 50;
export const CONTAGEM = Number(globalThis.process?.env?.CASTELOS_CONTAGEM ?? 3000);
export const TEMPO_VEZ = Number(globalThis.process?.env?.CASTELOS_VEZ) || 15_000;
export const ASSENTA = 1200;            // pausa depois do último impacto
export const RODADAS = 12;              // tiros de cada um antes de decidir na vida
export const AUSENCIAS = 3;             // vezes seguidas sem atirar = perde
export const PODER = 1.1;               // multiplicador de destruição (raio e dano)

// castelo (coordenadas locais: origem no meio da base, y pra cima é negativo)
export const FW = 200, TOPO = -330, TORRE_TOPO = -372, TORRE_L = 120, BASE_H = 70, ESTEIRA = 120, RAIO_HEROI = 34;
export const PRATELEIRAS = [{ x: -180, y: -24, w: 360 }, { x: -180, y: -132, w: 150 }, { x: 30, y: -132, w: 150 }, { x: -180, y: -240, w: 150 }, { x: 30, y: -240, w: 150 }];

export const HEROIS = {
  canhoneiro:  { nome: 'Canhoneiro',  vida: 300, cor: '#e04a3a', tiro: { vel: 1750, arrasto: .04, grav: 1,    raio: 58, dano: 220 } },
  metralha:    { nome: 'Metralha',    vida: 240, cor: '#3fae4a', tiro: { vel: 1950, arrasto: .02, grav: .7,   raio: 22, dano: 20, qtd: 15, leque: 20 / 14, intervalo: .15 } },
  bombardeiro: { nome: 'Bombardeiro', vida: 280, cor: '#e8962e', tiro: { vel: 1550, arrasto: .1,  grav: 1.15, raio: 62, dano: 65, qtd: 4, leque: 8 / 3, intervalo: .25 } },
  cavador:     { nome: 'Cavador',     vida: 260, cor: '#8a5bd6', tiro: { vel: 1800, arrasto: .03, grav: .8,   raio: 52, dano: 160, cava: 300 } },
};
export const TIME = ['canhoneiro', 'metralha', 'bombardeiro', 'cavador'];

const limita = (v, a, b) => Math.max(a, Math.min(b, v));

/** Relevo a partir da semente (o cliente recalcula igual, não precisa ir no estado). Espelhado: ninguém começa em desvantagem. */
export function terreno([p1, p2]) {
  const t = [];
  for (let x = 0; x <= MUNDO; x += 4) {
    const m = Math.min(x, MUNDO - x);   // espelho no meio
    t.push(880 + (40 * Math.sin(m / 420 + p1) + 16 * Math.sin(m / 170 + p2)) * (1 - .6 * Math.exp(-(((m - 650) / 260) ** 2))));
  }
  return t;
}
export function chao(t, x) {   // interpolado: simétrico dos dois lados
  const k = limita(x / 4, 0, t.length - 1), i = Math.min(t.length - 2, Math.floor(k));
  return t[i] + (t[i + 1] - t[i]) * (k - i);
}

export const lado = (c) => (c.lado === 0 ? 1 : -1);
export function paraMundo(c, lx, ly) {
  const co = Math.cos(c.ang), si = Math.sin(c.ang);
  return { x: c.x + lx * co - ly * si, y: c.baseY + lx * si + ly * co };
}
export function paraLocal(c, x, y) {
  const dx = x - c.x, dy = y - c.baseY, co = Math.cos(c.ang), si = Math.sin(c.ang);
  return { x: dx * co + dy * si, y: -dx * si + dy * co };
}
export const centroHeroi = (c, h) => paraMundo(c, h.x, h.y - RAIO_HEROI - 2);
const naFachada = (x, y) => (Math.abs(x) <= FW && y >= TOPO && y <= 0) || (y >= TORRE_TOPO && y < TOPO && Math.abs(x) <= FW + 10 && Math.abs(x) >= FW - TORRE_L);
const naBase = (x, y) => Math.abs(x) <= FW + 16 && y > 0 && y <= BASE_H;
export const furado = (c, x, y) => c.buracos.some((b) => (x - b[0]) ** 2 + (y - b[1]) ** 2 < b[2] * b[2]);

export function daVez(p, i = p.vez) {
  const c = p.castelos[i];
  for (let k = 0; k < c.herois.length; k++) { const h = c.herois[(c.prox + k) % c.herois.length]; if (h.vida > 0) return h; }
  return null;
}

// ------------------------------------------------------------------ estado

export function novaPartida(agora = Date.now(), _n = 2, _cores = [], rnd = Math.random) {
  const semente = [Math.round(rnd() * 600) / 100, Math.round(rnd() * 600) / 100];
  const t = terreno(semente);
  // mesmas prateleiras pros dois (espelhadas pelo lado): sorteio justo
  const lugares = [1, 2, 3, 4, 0].sort(() => rnd() - .5);
  const posX = TIME.map((_, k) => { const L = PRATELEIRAS[lugares[k]]; return { x: L.x + 30 + rnd() * (L.w - 60), y: L.y }; });
  const castelos = [650, MUNDO - 650].map((x, lado) => {
    const c = {
      x, lado, ang: 0, baseY: 0, buracos: [], prox: 0,
      // as prateleiras são simétricas: -x cai na prateleira espelhada
      herois: TIME.map((heroi, k) => ({ heroi, vida: HEROIS[heroi].vida, max: HEROIS[heroi].vida, x: Math.round(lado === 0 ? posX[k].x : -posX[k].x), y: posX[k].y })),
    };
    const hl = chao(t, x - ESTEIRA), hr = chao(t, x + ESTEIRA);
    c.ang = Math.atan2(hr - hl, ESTEIRA * 2);
    c.baseY = (hl + hr) / 2 - BASE_H - 34;
    return c;
  });
  return {
    n: 2, semente, t, castelos, fase: 'contagem', vez: 0, prazo: agora + CONTAGEM, rodada: 1, ausencias: [0, 0],
    tiros: [], eventos: [], pendentes: [], seq: 0, fim: null, ultimo: agora,
  };
}

const evento = (p, e) => p.eventos.push({ id: ++p.seq, ...e });

/** `{ fogo: { a, f } }`: atira com o herói da vez (a em graus pra cima, f de 0.15 a 1). */
export function agir(p, i, acao = {}) {
  if (p.fim || p.fase !== 'mira' || i !== p.vez || !acao?.fogo || typeof acao.fogo !== 'object') return null;
  const a = Number(acao.fogo.a), f = Number(acao.fogo.f);
  if (!Number.isFinite(a) || !Number.isFinite(f)) return null;
  const h = daVez(p, i);
  if (!h) return null;
  p.tiros = lancar(p, i, limita(a, -60, 85), limita(f, .15, 1));
  p.fase = 'voo';
  p.ausencias[i] = 0;
  p.pendentes.push({ tipo: 'tiro', de: i, heroi: h.heroi });
  return { ok: true };
}

export function lancar(p, i, a, f) {
  const c = p.castelos[i], h = daVez(p, i), w = HEROIS[h.heroi].tiro, m = centroHeroi(c, h), vel = w.vel * (.3 + .7 * f);
  const n = w.qtd || 1;
  return Array.from({ length: n }, (_, k) => {
    const ang = (a + (k - (n - 1) / 2) * (w.leque || 0)) * Math.PI / 180;
    return { x: m.x, y: m.y, vx: Math.cos(ang) * vel * lado(c), vy: -Math.sin(ang) * vel, heroi: h.heroi, de: i, idade: 0, espera: k * (w.intervalo || 0), cava: 0, feito: false };
  });
}

/** O que existe no ponto: parede, base, herói, prateleira ou nada (passando por buraco). O próprio castelo não segura (atira de dentro). */
export function sonda(p, x, y, ignora = -1) {
  for (const c of p.castelos) {
    if (c.lado === ignora) continue;
    const l = paraLocal(c, x, y);
    if (naBase(l.x, l.y)) return { c, oque: 'base' };
    if (!naFachada(l.x, l.y)) continue;
    if (!furado(c, l.x, l.y)) return { c, oque: 'parede' };
    for (const h of c.herois) if (h.vida > 0 && Math.hypot(l.x - h.x, l.y - (h.y - RAIO_HEROI)) < RAIO_HEROI) return { c, oque: 'heroi', h };
    for (const L of PRATELEIRAS) if (l.x >= L.x && l.x <= L.x + L.w && l.y >= L.y && l.y <= L.y + 14) return { c, oque: 'prateleira' };
  }
  return null;
}

/** Um passo de voo (só mexe em `b`). null = voando; senão o impacto. */
export function avancar(p, b, dt = DT) {
  if (b.espera > 0) { b.espera -= dt; return null; }
  const w = HEROIS[b.heroi].tiro;
  if (b.cava > 0) {   // Cavador: segue reto abrindo túnel
    const v = Math.hypot(b.vx, b.vy) || 1, d = 800 * dt;
    b.x += b.vx / v * d; b.y += b.vy / v * d; b.cava -= d; b.cavou = true;
    return b.cava <= 0 ? { x: b.x, y: b.y, oque: 'fim' } : null;
  }
  b.vx = b.vx / (1 + w.arrasto * dt);
  b.vy = (b.vy + G * w.grav * dt) / (1 + w.arrasto * dt);
  b.x += b.vx * dt; b.y += b.vy * dt; b.idade += dt;
  if (b.x < -300 || b.x > MUNDO + 300 || b.y > ALTURA + 200 || b.idade > 12) return { x: b.x, y: b.y, oque: 'fora' };
  const s = sonda(p, b.x, b.y, b.de);
  if (s) return { x: b.x, y: b.y, ...s };
  if (b.y >= chao(p.t, b.x)) return { x: b.x, y: chao(p.t, b.x), oque: 'chao' };
  return null;
}

function explodir(p, x, y, raio, dano, direto, heroi) {
  for (const c of p.castelos) {
    const l = paraLocal(c, x, y);
    if (Math.abs(l.x) < FW + raio && l.y > TORRE_TOPO - raio && l.y < raio) c.buracos.push([Math.round(l.x), Math.round(l.y), Math.round(raio)]);
    for (const h of c.herois) {
      if (h.vida <= 0) continue;
      const q = centroHeroi(c, h), d = Math.hypot(q.x - x, q.y - y), alcance = raio * 1.7;
      const tira = h === direto ? dano * 1.25 : d < alcance ? dano * limita(1.1 - d / alcance, .2, 1) : 0;
      if (!tira) continue;
      const antes = h.vida;
      h.vida = Math.max(0, Math.round(h.vida - tira));
      evento(p, { tipo: 'dano', lado: c.lado, heroi: h.heroi, x: Math.round(q.x), y: Math.round(q.y), quanto: antes - h.vida, morreu: h.vida === 0 });
    }
  }
  evento(p, { tipo: 'boom', x: Math.round(x), y: Math.round(y), raio: Math.round(raio), heroi });
}

function impacto(p, b, r) {
  const w = HEROIS[b.heroi].tiro;
  if (r.oque === 'fora') { b.feito = true; evento(p, { tipo: 'errou' }); return; }
  if (w.cava && !b.cava && r.oque !== 'fim' && r.oque !== 'heroi') { b.cava = w.cava; evento(p, { tipo: 'cava', x: Math.round(r.x), y: Math.round(r.y) }); return; }
  b.feito = true;   // um impacto por projétil
  explodir(p, r.x, r.y, w.raio * PODER, w.dano * PODER, r.h, b.heroi);
}

const vivos = (c) => c.herois.some((h) => h.vida > 0);
const vidaTotal = (c) => c.herois.reduce((s, h) => s + h.vida / h.max, 0);

function decidir(p) {
  const fora = p.castelos.map((c) => !vivos(c));
  if (fora[0] || fora[1]) {
    // os dois zerados no mesmo tiro: perde quem atirou
    p.fim = fora[0] && fora[1] ? { vencedor: 1 - p.vez, motivo: 'herois' } : { vencedor: fora[1] ? 0 : 1, motivo: 'herois' };
  } else if (p.rodada > RODADAS) {
    const [a, b] = p.castelos.map(vidaTotal);
    p.fim = Math.abs(a - b) < 1e-9 ? { vencedor: null, motivo: 'empate' } : { vencedor: a > b ? 0 : 1, motivo: 'vida' };
  }
  if (p.fim) { p.fase = 'fim'; evento(p, { tipo: 'fim' }); }
  return !!p.fim;
}

function proximaVez(p, agora) {
  const c = p.castelos[p.vez], h = daVez(p);
  if (h) c.prox = (c.herois.indexOf(h) + 1) % c.herois.length;
  p.vez = 1 - p.vez;
  if (p.vez === 0) p.rodada++;
  if (decidir(p)) return;
  p.fase = 'mira'; p.prazo = agora + TEMPO_VEZ;
  evento(p, { tipo: 'vez', vez: p.vez, heroi: daVez(p).heroi });
}

export function eliminar(p, i) {
  if (p.fim) return null;
  p.fim = { vencedor: 1 - i, motivo: 'wo' };
  p.fase = 'fim';
  evento(p, { tipo: 'saiu', i });
  return { tipo: 'saiu', assento: i };
}

export function passo(p, agora = Date.now()) {
  p.eventos = [];
  for (const e of p.pendentes) evento(p, e);
  p.pendentes = [];
  const dt = Math.min(.2, Math.max(0, (agora - p.ultimo) / 1000));
  p.ultimo = agora;
  if (p.fim) return p;
  if (p.fase === 'contagem') {
    if (agora < p.prazo) return p;
    p.fase = 'mira'; p.prazo = agora + TEMPO_VEZ;
    evento(p, { tipo: 'vez', vez: p.vez, heroi: daVez(p).heroi });
  } else if (p.fase === 'mira') {
    if (agora < p.prazo) return p;
    evento(p, { tipo: 'passou', vez: p.vez });
    if (++p.ausencias[p.vez] >= AUSENCIAS) { p.fim = { vencedor: 1 - p.vez, motivo: 'ausente' }; p.fase = 'fim'; evento(p, { tipo: 'fim' }); return p; }
    proximaVez(p, agora);
  } else if (p.fase === 'voo') {
    for (let falta = dt; falta > 1e-9; falta -= DT) {
      for (const b of p.tiros) {
        if (b.feito) continue;
        const r = avancar(p, b, Math.min(DT, falta));
        if (b.cavou) {   // túnel do Cavador
          b.cavou = false;
          for (const c of p.castelos) { const l = paraLocal(c, b.x, b.y); if (naFachada(l.x, l.y)) c.buracos.push([Math.round(l.x), Math.round(l.y), 30]); }
        }
        if (r) impacto(p, b, r);
      }
      if (p.tiros.every((b) => b.feito)) { p.tiros = []; p.fase = 'assenta'; p.prazo = agora + ASSENTA; break; }
    }
  } else if (p.fase === 'assenta' && agora >= p.prazo) proximaVez(p, agora);
  return p;
}

/** Herói rival só aparece se dá pra ver (atrás de buraco) ou se já caiu. */
const visivel = (c, h, assento) => c.lado === assento || h.vida <= 0 || furado(c, h.x, h.y - RAIO_HEROI);

export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, vez: p.vez, prazo: p.prazo, rodada: p.rodada, rodadas: RODADAS, semente: p.semente, fim: p.fim,
  heroi: p.fim ? null : daVez(p)?.heroi ?? null,
  castelos: p.castelos.map((c) => ({
    x: c.x, ang: c.ang, baseY: c.baseY, b: c.buracos,
    // [heroi, vida, max, x, y] — x/y null quando escondido
    h: c.herois.map((h) => (visivel(c, h, assento) ? [h.heroi, h.vida, h.max, h.x, h.y] : [h.heroi, h.vida, h.max, null, null])),
    prox: c.prox,
  })),
  // [x, y, vx, vy, heroi, cavando]
  tiros: p.tiros.filter((b) => !b.feito && b.espera <= 0).map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.heroi, b.cava > 0 ? 1 : 0]),
  ev: p.eventos,
});
