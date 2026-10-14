import TERRENO from './terreno.json' with { type: 'json' };

/**
 * Mini-golfe Tropical: 2 a 4 jogadores, 3 buracos, todo mundo joga ao mesmo
 * tempo, cada um com a sua bola (as bolas não se batem). Menos tacadas no
 * total leva; empate devolve a entrada.
 *
 * O servidor simula a tacada inteira na hora (`tacar`) sobre o terreno
 * (terreno.json, grade de 4px: g grama, a areia, # tabela) e devolve o
 * caminho da bola; os clientes só animam. Até a animação acabar (`livreEm`)
 * o jogador não tacar de novo.
 *
 * Cada buraco tem relógio (TEMPO_BURACO): quem não terminou leva +2 tacadas.
 * Teto de MAX_GOLPES por buraco. Mundo = a maquete, 1536×1024.
 */

export const LARGURA = 1536;
export const ALTURA = 1024;
export const TEMPO_BURACO = Number(globalThis.process?.env?.GOLFE_TEMPO) || 90_000;
export const INTERVALO = Number(globalThis.process?.env?.GOLFE_INTERVALO ?? 4500);
export const MAX_GOLPES = 8;
export const RAIO_BOLA = 7;
export const RAIO_BURACO = 12;
export const VEL = [140, 1350];           // tacada: força 0 -> 1
export const CAPTURA = 620;               // mais rápido que isso, a bola passa pela beirada
const DT = 1 / 240, AMOSTRA = 8;          // simulação a 240 passos/s; o caminho guarda 1 a cada 8 (30/s)

export const BURACOS = [
  { tee: [400, 820], copa: [1085, 192], par: 4 },
  { tee: [805, 268], copa: [560, 560], par: 3 },
  { tee: [1232, 700], copa: [1372, 652], par: 2 },
];
export const CORES = ['azul', 'rosa', 'vermelho', 'roxo'];
export const MAX_JOGADORES = 4;

const { cel: CEL, w: GW, h: GH, mapa: MAPA } = TERRENO;
export function tipo(x, y) {
  const gx = Math.floor(x / CEL), gy = Math.floor(y / CEL);
  if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return '#';
  return MAPA[gy][gx];
}

/**
 * Simula a tacada de (x, y) com ângulo e força 0..1. Devolve o caminho
 * ([x0, y0, x1, y1, ...], 30 pontos/s), onde parou, se entrou e os
 * acontecimentos pelo caminho ([índice do ponto, tipo]).
 */
export function tacar(x, y, ang, forca, copa) {
  const v0 = VEL[0] + (VEL[1] - VEL[0]) * Math.min(1, Math.max(0, forca));
  let vx = Math.cos(ang) * v0, vy = Math.sin(ang) * v0;
  const caminho = [Math.round(x), Math.round(y)], eventos = [];
  let entrou = false, naAreia = false, ultimaTabela = -99;
  for (let k = 1; k <= 12 / DT; k++) {
    const sp = Math.hypot(vx, vy);
    const t = tipo(x, y);
    // atrito: a areia segura muito
    const desac = t === 'a' ? 1500 + 2.6 * sp : 230 + 0.5 * sp;
    const nova = Math.max(0, sp - desac * DT);
    if (sp > 0) { vx *= nova / sp; vy *= nova / sp; }
    if (t === 'a' && !naAreia) { naAreia = true; eventos.push([Math.floor(k / AMOSTRA), 'areia']); }
    if (t !== 'a') naAreia = false;
    // tabela: quica no eixo que bateu
    let nx = x + vx * DT, ny = y + vy * DT;
    let bateu = false;
    if (tipo(nx, y) === '#') { vx = -vx * 0.62; vy *= 0.9; nx = x; bateu = true; }
    if (tipo(x, ny) === '#') { vy = -vy * 0.62; vx *= 0.9; ny = y; bateu = true; }
    if (tipo(nx, ny) === '#') {   // quina em diagonal: volta pelos dois eixos
      if (!bateu) { vx = -vx * 0.62; vy = -vy * 0.62; bateu = true; }
      nx = x; ny = y;
    }
    if (bateu && k - ultimaTabela > 20 && sp > 90) { eventos.push([Math.floor(k / AMOSTRA), 'tabela']); ultimaTabela = k; }
    x = nx; y = ny;
    // o buraco: devagar entra; rápido passa raspando (e perde força na beirada)
    const d = Math.hypot(x - copa[0], y - copa[1]);
    if (d < RAIO_BURACO) {
      if (nova < CAPTURA) { entrou = true; x = copa[0]; y = copa[1]; eventos.push([Math.floor(k / AMOSTRA) + 1, 'buraco']); }
      else if (d < RAIO_BURACO * 0.6 && !eventos.some((e) => e[1] === 'beirada')) {
        eventos.push([Math.floor(k / AMOSTRA), 'beirada']);
        const a = Math.atan2(vy, vx) + (x < copa[0] ? 0.35 : -0.35);
        vx = Math.cos(a) * nova * 0.7; vy = Math.sin(a) * nova * 0.7;
      }
    }
    if (k % AMOSTRA === 0 || entrou || Math.hypot(vx, vy) < 6) caminho.push(Math.round(x), Math.round(y));
    if (entrou || Math.hypot(vx, vy) < 6) break;
  }
  return { caminho, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, entrou, eventos };   // 1 casa: arredondar inteiro podia cair na tabela
}

/** Quanto tempo a animação do caminho leva no cliente (ms). */
export const duracao = (caminho) => (caminho.length / 2) * (1000 / 30);

// ------------------------------------------------------------------ estado

const vazio = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));

function prepararBuraco(p, b, agora) {
  const [tx, ty] = BURACOS[b].tee;
  p.buraco = b;
  p.fase = 'jogo';
  p.prazo = agora + TEMPO_BURACO;
  // no tee, um do lado do outro: o primeiro ponto de grama livre (longe da tabela e dos outros)
  const usados = [];
  const firme = (x, y) => [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]].every(([dx, dy]) => tipo(x + dx, y + dy) === 'g');
  const volta = [[0, 0], [34, 0], [-34, 0], [0, 32], [0, -32], [34, 32], [-34, 32], [34, -32], [-34, -32], [68, 0], [-68, 0], [0, 64], [0, -64]];
  p.jogadores.forEach((j) => {
    const [dx, dy] = volta.find(([dx, dy]) => firme(tx + dx, ty + dy) && !usados.some(([ux, uy]) => Math.hypot(ux - tx - dx, uy - ty - dy) < 30)) ?? [0, 0];
    usados.push([tx + dx, ty + dy]);
    Object.assign(j, { x: tx + dx, y: ty + dy, golpes: 0, dentro: false, livreEm: agora + 800 });
  });
}

export function novaPartida(agora = Date.now(), n = 2) {
  n = Math.min(MAX_JOGADORES, Math.max(2, n));
  const p = { jogadores: vazio(n, () => ({ cartao: [], total: 0 })), fora: vazio(n, false), fim: null, seq: 0 };
  prepararBuraco(p, 0, agora);
  return p;
}

const ativos = (p) => p.jogadores.flatMap((_, i) => (p.fora[i] ? [] : [i]));

/** Fecha o buraco: anota o cartão de todo mundo e passa pro intervalo (ou acaba). */
function fecharBuraco(p, agora, espera = 0) {
  for (const j of p.jogadores) {
    if (!j.dentro) j.golpes = Math.min(MAX_GOLPES, j.golpes + 2);   // não terminou: +2
    j.cartao.push(j.golpes);
    j.total += j.golpes;
  }
  if (p.buraco >= BURACOS.length - 1) {
    const vivos = ativos(p);
    const menor = Math.min(...vivos.map((i) => p.jogadores[i].total));
    const lideres = vivos.filter((i) => p.jogadores[i].total === menor);
    p.fim = lideres.length === 1 ? { vencedor: lideres[0], motivo: 'tacadas' } : { vencedor: null, motivo: 'empate' };
    p.fase = 'fim';
    p.mostraAte = agora + espera;
    return;
  }
  p.fase = 'intervalo';
  p.pausaAte = agora + espera + INTERVALO;
}

/** `{ ang, forca }`: tacada do assento. null = recusada (não é hora, já entrou, lixo). */
export function agir(p, i, acao = {}, agora = Date.now()) {
  if (p.fim || p.fase !== 'jogo' || p.fora[i] || !p.jogadores[i]) return null;
  const j = p.jogadores[i];
  const ang = Number(acao.ang), forca = Number(acao.forca);
  if (j.dentro || agora < j.livreEm || !Number.isFinite(ang) || !Number.isFinite(forca) || forca <= 0.02) return null;
  const b = BURACOS[p.buraco];
  const r = tacar(j.x, j.y, ang, Math.min(1, forca), b.copa);
  j.golpes++;
  const de = [j.x, j.y];
  Object.assign(j, { x: r.x, y: r.y, dentro: r.entrou, livreEm: agora + duracao(r.caminho) + 350 });
  if (!r.entrou && j.golpes >= MAX_GOLPES) j.dentro = true;   // teto: sai do buraco com o máximo
  const res = { tipo: 'tacada', de: i, seq: ++p.seq, desde: de, ang: Math.round(ang * 100) / 100, forca: Math.round(forca * 100) / 100,
    caminho: r.caminho, eventos: r.eventos, entrou: r.entrou, golpes: j.golpes, par: b.par, buraco: p.buraco, teto: !r.entrou && j.dentro };
  if (ativos(p).every((k) => p.jogadores[k].dentro)) {
    fecharBuraco(p, agora, duracao(r.caminho) + 2500);   // deixa a bola entrar e a festa antes
    res.fechou = true;
  }
  return res;
}

/** Relógio: acabou o intervalo (próximo buraco) ou o tempo do buraco (quem não terminou leva +2). */
export function estourou(p, agora = Date.now()) {
  if (p.fim) return null;
  if (p.fase === 'intervalo') { prepararBuraco(p, p.buraco + 1, agora); return { tipo: 'buraco', buraco: p.buraco }; }
  fecharBuraco(p, agora);
  return { tipo: 'tempo', buraco: p.buraco };
}

export const restante = (p, agora = Date.now()) => Math.max(0, (p.fase === 'intervalo' ? p.pausaAte : p.prazo) - agora);

export function eliminar(p, i, agora = Date.now()) {
  if (p.fim || p.fora[i]) return null;
  p.fora[i] = true;
  const vivos = ativos(p);
  if (vivos.length === 1) { p.fim = { vencedor: vivos[0], motivo: 'wo' }; p.fase = 'fim'; }
  else if (p.fase === 'jogo' && vivos.every((k) => p.jogadores[k].dentro)) fecharBuraco(p, agora, 1500);
  return { tipo: 'saiu', assento: i };
}

/** Informação perfeita: todo mundo vê o mesmo. */
export const estadoPara = (p, assento, agora = Date.now()) => ({
  assento, agora, fase: p.fase, buraco: p.buraco, fim: p.fim, fora: p.fora,
  prazo: p.fase === 'intervalo' ? p.pausaAte : p.prazo,
  j: p.jogadores.map((j) => ({ x: j.x, y: j.y, golpes: j.golpes, dentro: j.dentro, livreEm: j.livreEm, cartao: j.cartao, total: j.total })),
});
