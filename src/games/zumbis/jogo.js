import { LARGURA as W, ALTURA as H, CHAO, PLATAFORMAS, BARRIS, BARRIL, SOLDADO, ZUMBIS, ARMAS, NOMES_ARMAS, CORES, mover } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles do Zombie Rush (canvas 2D). Mesmo esquema de
 * Ratos Psicopatas (games/psicopatas/jogo.js): o meu soldado é previsto aqui com
 * `mover` e corrigido pelo servidor (ack); o resto é desenhado ATRASO ms no
 * passado, interpolado entre dois estados — liso em qualquer rede.
 *
 * O que é daqui:
 *  - cidade em ruínas à noite: lua gigante, prédios em 3 camadas (parallax com a
 *    câmera), incêndios nos telhados, fumaça subindo, névoa andando, cinzas no ar,
 *    postes com cone de luz;
 *  - soldado quadro a quadro (corrida, mira respirando, pulo inclinado, dano, morte),
 *    zumbis andando quadro a quadro, saindo do chão, piscando no acerto, pegando fogo;
 *    morte com corpo caindo (ragdoll simples), sangue, pedaços e sumindo devagar;
 *  - clarão na boca da arma, cápsulas, rastro de bala, faíscas, fumaça, chama do
 *    lança-chamas, foguete com rastro, explosão com onda de choque e destroços;
 *  - COMBO!/SUPER COMBO!, quem passou na frente, chefe tremendo a tela, últimos
 *    10s pulsando, câmera lenta no fim; partículas diminuem sozinhas em celular fraco;
 *  - celular em pé: a tela gira pra deitada.
 */

const A = import.meta.glob('../../assets/zumbis/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.webp$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const TOM = { azul: '#3b8cff', vermelho: '#ff4646', amarelo: '#ffc53d', verde: '#3ddc5a' };
const SPRITE_Z = { comum: 'comum', corredor: 'cachorro', saltador: 'capacete', explosivo: 'gordo', gigante: 'gigante' };
const QUADROS_Z = { comum: 9, cachorro: 6, capacete: 10, gordo: 7, gigante: 1 };
const ALTURA_Z = { comum: 92, corredor: 56, saltador: 100, explosivo: 108, gigante: 220 };   // altura do desenho
const PASSO_Z = { comum: 9, corredor: 22, saltador: 11, explosivo: 10, gigante: 18 };       // px andados por quadro
const ICONE = { pistola: 'arma-pistola', metralhadora: 'arma-metralhadora', escopeta: 'arma-escopeta', bazuca: 'arma-bazuca', lanca: 'gasolina' };
const COR_BALA = { pistola: '#ffe28a', metralhadora: '#fff0a8', escopeta: '#ffd27a' };
const FALA_MATA = ['Bum!', 'Na cabeça!', 'Mais um!', 'Volta pro túmulo!', 'Tchau, zumbi!'];
const FALA_MORRE = ['Fui mordido!', 'Me pegaram!', 'Socorro!'];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const sorteia = (a) => a[Math.floor(Math.random() * a.length)];
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Bolinha de luz pronta (gradiente radial) por cor "r,g,b": desenhar imagem é bem mais barato que criar gradiente todo quadro. */
const BRILHOS = new Map();
function brilho(cor) {
  let c = BRILHOS.get(cor);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${cor},1)`); gr.addColorStop(0.35, `rgba(${cor},.45)`); gr.addColorStop(1, `rgba(${cor},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    BRILHOS.set(cor, c);
  }
  return c;
}

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.quadros = [];
    this.desvio = null;
    this.vistos = 0;
    this.pendentesEv = [];
    this.part = [];          // partículas (pool: as mortas voltam pra `livres`)
    this.livres = [];
    this.corpos = [];        // zumbis/soldados mortos caindo
    this.textos = [];
    this.luzes = [];         // clarões que iluminam o cenário
    this.banner = null;
    this.tremor = 0;
    this.lento = 0;          // câmera lenta até (performance.now)
    this.flash = new Map();  // zumbi id -> quando piscou
    this.fogoZ = new Map();  // zumbi id -> pegando fogo até
    this.recuo = [0, 0, 0, 0];
    this.passos = [0, 0, 0, 0];
    this.xAntes = [null, null, null, null];
    this.morte = [0, 0, 0, 0];
    this.dano = [0, 0, 0, 0];
    this.ferido = 0;
    this.qualidade = 1;
    this.cam = W / 2;
    this.ultimoTique = null;
    this.teclas = new Set();
    this.puloPendente = false;
    this.mouseV = null;
    this.mouseFogo = false;
    this.toques = new Map();
    this.mira = op.assento % 2 ? Math.PI : 0;
    this.toque = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.encerrado = false;
    this.chegou = performance.now();
    this.cmdSeq = 0;
    this.pendentes = [];
    this.acumulado = 0;
    this.ultimoQuadro = null;
    this.pred = null;
    this.predAntes = null;
    this.predVivo = false;
    this.corr = { x: 0, y: 0 };
    // cenário gerado uma vez (prédios, janelas, estrelas)
    const rnd = (k) => hash(k * 13.7);
    this.estrelas = Array.from({ length: 70 }, (_, k) => ({ x: rnd(k) * 1.6 - 0.3, y: rnd(k + 99) * 0.5, r: 0.5 + rnd(k + 7) * 1.3, f: rnd(k + 3) * 6 }));
    this.predios = [0, 1, 2].map((c) => {
      const out = []; let x = -400;
      while (x < W + 400) {
        const w = 70 + rnd(x + c * 1000) * (110 - c * 20), h = 160 + rnd(x * 3 + c) * (300 - c * 70) + c * 30;
        out.push({ x, w, h, quebra: rnd(x + 5) < 0.5, janelas: Array.from({ length: 30 }, (_, k) => rnd(x + k * 31 + c) < (c === 2 ? 0.08 : 0.18)), fogo: rnd(x + 77 + c) < (c === 1 ? 0.25 : 0.12) });
        x += w + 4 + rnd(x + 9) * 20;
      }
      return out;
    });
    this.nevoa = Array.from({ length: 6 }, (_, k) => ({ x: rnd(k + 50) * W, y: 420 + rnd(k + 60) * 240, r: 200 + rnd(k + 70) * 200, v: 8 + rnd(k + 80) * 14 }));
    this.cinzas = Array.from({ length: 50 }, (_, k) => ({ x: rnd(k + 300) * W, y: rnd(k + 400) * H, v: 10 + rnd(k + 500) * 25, f: rnd(k + 600) * 6, brasa: rnd(k + 700) < 0.3 }));

    destravar();
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    let medio = 16, ant = performance.now();
    const criado = ant;   // `chegou` muda a cada estado: não serve pra "faz 3s que abriu"
    const quadro = (t) => {
      if (!this.rodando) return;
      // celular fraco: menos partícula (e menos pixel se ainda pesar)
      medio = medio * 0.95 + Math.min(100, t - ant) * 0.05; ant = t;
      if (t - criado > 3000) {
        if (medio > 24) this.qualidade = Math.max(0.35, this.qualidade - 0.01);
        else if (medio < 18) this.qualidade = Math.min(1, this.qualidade + 0.002);
        if (medio > 30 && this.dprMax !== 1) { this.dprMax = 1; this.redimensionar(); }
      }
      try { this.desenhar(); } catch (e) { console.error(e); }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); som.desligar(); }

  cor(i) { return this.ultimo?.cores?.[i] ?? CORES[i % CORES.length]; }
  tom(i) { return TOM[this.cor(i)]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? `Soldado ${i + 1}`).split(' ')[0]; }
  get ultimo() { return this.quadros[this.quadros.length - 1] ?? null; }
  agoraServ() { return performance.now() + (this.desvio ?? 0); }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    if (this.encerrado && !e.fim) return;
    this.chegou = performance.now();
    this.travou = false;
    this.reconciliar(e);
    const d = e.agora - performance.now();
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.quadros.push(e);
    if (this.quadros.length > 30) this.quadros.shift();
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.pendentesEv.push({ ...ev, t: e.agora }); }
    if (e.fim) this.encerrar(e.fim);
  }

  /** Fim (ou conexão perdida, sem `fim`): solta os controles e congela o meu soldado. */
  encerrar(fim) {
    if (!this.encerrado) {
      this.encerrado = true;
      this.toques.clear(); this.teclas.clear();
      this.mouseFogo = false; this.puloPendente = false;
      this.pendentes = [];
      if (!fim) som.parar();
    }
    if (!fim || this.fim) return;
    this.fim = fim;
    this.fimEm = performance.now();
    this.lento = performance.now() + 1800;   // câmera lenta no fim
    som.parar();
    const ganhei = fim.vencedor === this.eu;
    setTimeout(() => {
      if (fim.vencedor == null) this.anunciar('EMPATE!', '#fff', 3000);
      else this.anunciar(ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3400);
      if (ganhei) { som.fanfarra(); som.fala('Vitória! Rei dos zumbis!', true); navigator.vibrate?.([80, 60, 80, 60, 200]); for (let k = 0; k < 140; k++) this.confete(); }
      else { som.derrota(); if (fim.vencedor != null) som.fala(`${this.nome(fim.vencedor)} fez mais pontos!`, true); }
    }, 700);
  }

  mundo(e, eu) { return { soldados: e.s.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1] })) }; }

  reconciliar(e) {
    const m = e.s[this.eu];
    const ack = m[6] ?? 0;
    this.pendentes = this.pendentes.filter((c) => c.s > ack);
    const pos = { x: m[0], y: m[1], vy: m[7], kx: m[8], chao: !!m[9], pulos: m[10], atravessa: m[11], dir: m[13], movendo: false };
    if (e.fase === 'jogo' && m[4]) {
      const w = this.mundo(e, pos);
      for (const c of this.pendentes) mover(w, this.eu, c, c.dt / 1000);
    }
    if (this.pred && m[4] && this.predVivo) {
      if (this.predAntes) { this.predAntes.x += pos.x - this.pred.x; this.predAntes.y += pos.y - this.pred.y; }
      this.corr.x += this.pred.x - pos.x;
      this.corr.y += this.pred.y - pos.y;
      if (Math.hypot(this.corr.x, this.corr.y) > 80) this.corr = { x: 0, y: 0 };
    } else this.corr = { x: 0, y: 0 };
    if (!this.predAntes || !this.predVivo || !m[4]) this.predAntes = { x: pos.x, y: pos.y };
    this.pred = pos;
    this.predVivo = !!m[4];
  }

  interpolar(t) {
    const q = this.quadros;
    if (!q.length) return null;
    let i = q.length - 1;
    while (i > 0 && q[i - 1].agora > t) i--;
    const b = q[i], a = q[i - 1] ?? b;
    const k = b.agora === a.agora ? 1 : Math.min(1, Math.max(0, (t - a.agora) / (b.agora - a.agora)));
    const soldados = b.s.map((sb, j) => {
      const sa = a.s[j] ?? sb;
      const kk = Math.hypot(sa[0] - sb[0], sa[1] - sb[1]) > 120 ? 1 : k;
      return { x: lerp(sa[0], sb[0], kk), y: lerp(sa[1], sb[1], kk), ang: lerpAng(sa[2], sb[2], kk), vida: sb[3], vivo: !!sb[4], movendo: !!sb[5],
        vy: sb[7], chao: !!sb[9], protegido: !!sb[12], dir: sb[13], arma: sb[14], municao: sb[15] };
    });
    const za = new Map(a.z.map((z) => [z[0], z]));
    const zumbis = b.z.map((zb) => {
      const z0 = za.get(zb[0]) ?? zb;
      return { id: zb[0], tipo: zb[1], x: lerp(z0[2], zb[2], k), y: lerp(z0[3], zb[3], k), vida: zb[4], dir: zb[5], movendo: !!zb[6], surge: !!zb[7], morto: !!zb[8], chao: !!zb[9] };
    });
    const extra = Math.max(0, t - b.agora) / 1000;
    const balas = b.b.map(([id, x, y, ang, dono, arma]) => {
      const ba = a.b.find((z) => z[0] === id);
      const vel = ARMAS[arma].bala;
      const px = ba ? lerp(ba[1], x, k) : x, py = ba ? lerp(ba[2], y, k) : y;
      const ex = k >= 1 ? extra : 0;
      return { id, x: px + Math.cos(ang) * vel * ex, y: py + Math.sin(ang) * vel * ex, ang, dono, arma };
    });
    return { soldados, zumbis, balas, itens: b.it, barris: b.barris };
  }

  // ------------------------------------------------------------ eventos

  anunciar(txt, cor, dura = 1400) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  texto(x, y, txt, cor, tam, extra = {}) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now(), vida: 1100, ...extra }); }

  tratarEventos(t, est) {
    const meu = est?.soldados[this.eu];
    const longe = (x, y) => (meu ? Math.max(0.3, 1 - Math.hypot(x - meu.x, y - meu.y) / 1600) : 1);
    while (this.pendentesEv.length && this.pendentesEv[0].t <= t) {
      const e = this.pendentesEv.shift();
      const agora = performance.now();
      const eu = e.i === this.eu || e.de === this.eu;
      switch (e.tipo) {
        case 'largada':
          som.largada(); som.fala('Vai! Mata os zumbis!', true);
          this.anunciar('GO!', '#5cff7a', 1100);
          this.tremor = 8;
          break;
        case 'tiro': {
          this.recuo[e.de] = agora;
          const lado = Math.cos(e.ang) >= 0 ? 1 : -1;
          if (e.arma !== 'lanca') {
            this.part.length < 500 * this.qualidade && this.add({ tipo: 'sprite', nome: `clarao-${Math.floor(Math.random() * 4)}`, x: e.x + Math.cos(e.ang) * 14, y: e.y + Math.sin(e.ang) * 14, rot: e.ang, vida: 0.07, w: e.arma === 'escopeta' || e.arma === 'bazuca' ? 70 : 46 });
            this.luzes.push({ x: e.x, y: e.y, r: e.arma === 'escopeta' || e.arma === 'bazuca' ? 260 : 170, t0: agora, vida: 90, cor: '255,200,90' });
            if (e.arma !== 'bazuca') this.add({ tipo: 'capsula', x: e.x - lado * 22, y: e.y, vx: -lado * (60 + Math.random() * 90), vy: -200 - Math.random() * 120, rot: 0, vr: 20, vida: 1.4, gira: true });
            this.fumaca(e.x, e.y, e.arma === 'escopeta' || e.arma === 'bazuca' ? 4 : 1, 0.5);
          } else this.luzes.push({ x: e.x + lado * 60, y: e.y, r: 200, t0: agora, vida: 80, cor: '255,140,40' });
          if (e.de === this.eu) {
            if (e.arma === 'escopeta' || e.arma === 'bazuca') { this.tremor = Math.max(this.tremor, 7); navigator.vibrate?.(25); }
            else if (e.arma !== 'lanca') this.tremor = Math.max(this.tremor, 1.5);
          }
          som.tiro(e.arma, (e.de === this.eu ? 1 : 0.45) * longe(e.x, e.y));
          break;
        }
        case 'acerto':
          this.flash.set(e.z, agora);
          if (e.fogo) { this.fogoZ.set(e.z, agora + 1200); if (Math.random() < 0.4) this.fogo(e.x, e.y, 1); }
          else {
            this.sangue(e.x, e.y, e.cabeca ? 14 : 5, Math.sign((est?.soldados[e.de]?.x ?? e.x) < e.x ? 1 : -1));
            this.faiscas(e.x, e.y, 2);
            if (e.de === this.eu) som.acerto(0.8);
          }
          if (e.cabeca) { this.texto(e.x, e.y - 30, 'NA CABEÇA!', '#ffd23d', 22); if (e.de === this.eu) som.cabeca(); }
          if (e.de === this.eu && !e.fogo) this.texto(e.x + (Math.random() - 0.5) * 30, e.y - 10, `-${e.dano}`, '#fff', 16, { vida: 600 });
          break;
        case 'zumbiMorreu': {
          const zt = e.zt, k = ZUMBIS[zt];
          this.corpos.push({ zt, x: e.x, y: e.y + k.h / 2, vx: (e.dir || 1) * -(80 + Math.random() * 120) * (e.explodiu ? 3 : 1), vy: e.explodiu ? -420 : -160, rot: 0, vr: (Math.random() - 0.5) * (e.explodiu ? 9 : 3), dir: e.dir, t0: agora, chao: false, fogo: this.fogoZ.get(e.z) > agora });
          if (zt !== 'explosivo') { this.sangue(e.x, e.y, zt === 'gigante' ? 60 : 22, 0, 1.4); this.pedacos(e.x, e.y, zt === 'gigante' ? 8 : 3); }
          som.morte(zt, longe(e.x, e.y));
          if (e.de != null && e.pts) {
            const cor = this.tom(e.de);
            this.texto(e.x, e.y - k.h / 2 - 10, e.mult > 1 ? `+${e.pts} x${e.mult}` : `+${e.pts}`, cor, e.de === this.eu ? (zt === 'gigante' ? 52 : 30) : 20, { pop: true });
            if (e.de === this.eu) { som.ponto(); if (Math.random() < 0.12) som.fala(sorteia(FALA_MATA)); }
          }
          if (zt === 'gigante') {
            this.lento = agora + 1400; this.tremor = 24;
            this.anunciar(e.de === this.eu ? 'VOCÊ DERRUBOU O GIGANTE!' : `${this.nome(e.de ?? 0).toUpperCase()} DERRUBOU O GIGANTE!`, '#ffd23d', 2000);
            som.fala('O gigante caiu!', true);
          }
          break;
        }
        case 'explosao': {
          const grande = e.raio >= 130;
          this.explosao(e.x, e.y, e.raio / 120);
          this.tremor = Math.max(this.tremor, grande ? 14 : 9);
          som.explosao(longe(e.x, e.y), grande);
          if (e.barril != null) this.texto(e.x, e.y - 50, 'KABUM!', '#ff7a1a', 30, { pop: true });
          break;
        }
        case 'brota':
          for (let k = 0; k < 6 * this.qualidade; k++) this.add({ tipo: 'terra', x: e.x + (Math.random() - 0.5) * 40, y: e.y, vx: (Math.random() - 0.5) * 160, vy: -200 - Math.random() * 200, vida: 0.8, w: 3 + Math.random() * 4 });
          this.add({ tipo: 'poeira', x: e.x, y: e.y - 6, vx: 0, vy: -20, vida: 0.9, r: 20 });
          if (Math.random() < (e.zt === 'comum' ? 0.25 : 0.7)) som.gemido(e.zt, longe(e.x, e.y) * 0.8);
          break;
        case 'pulo': this.add({ tipo: 'poeira', x: e.x, y: e.y - 4, vx: 0, vy: -10, vida: 0.6, r: 14 }); break;
        case 'mordida':
          this.sangue(est?.soldados[e.i]?.x ?? e.x, (est?.soldados[e.i]?.y ?? e.y) - 50, 10, 0);
          som.mordida(e.i === this.eu ? 1 : 0.4 * longe(e.x, e.y));
          if (e.zt === 'gigante') this.tremor = Math.max(this.tremor, 12);
          break;
        case 'ferido':
          this.dano[e.i] = agora;
          if (e.i === this.eu) { this.ferido = agora; this.tremor = Math.max(this.tremor, 8); navigator.vibrate?.(60); som.ai(); }
          this.texto(e.x, e.y - 30, `-${e.dano}`, '#ff4646', e.i === this.eu ? 26 : 18);
          break;
        case 'morreu':
          this.morte[e.i] = agora;
          this.corpos.push({ soldado: e.i, x: e.x, y: e.y, vx: e.dir * 160, vy: -300, rot: 0, vr: e.dir * 5, dir: e.dir, t0: agora, chao: false });
          this.sangue(e.x, e.y - 40, 26, 0, 1.3);
          if (e.i === this.eu) { som.morri(); som.fala(sorteia(FALA_MORRE), true); this.anunciar('VOCÊ CAIU!', '#ff4646', 1600); navigator.vibrate?.([120, 60, 200]); }
          break;
        case 'perdeuCombo': if (e.i === this.eu) this.texto(est?.soldados[e.i]?.x ?? W / 2, (est?.soldados[e.i]?.y ?? 300) - 120, `COMBO x${e.combo} PERDIDO`, '#aaa', 22); break;
        case 'renasce':
          this.add({ tipo: 'anel', x: e.x, y: e.y - 40, vida: 0.6, cor: this.tom(e.i), r: 70 });
          this.xAntes[e.i] = null;
          break;
        case 'pulou':
          this.add({ tipo: 'poeira', x: e.x, y: e.y - 4, vx: 0, vy: -10, vida: 0.5, r: e.duplo ? 10 : 16 });
          if (e.duplo) this.faiscas(e.x, e.y - 10, 3, '#fff');
          if (e.i === this.eu) som.pulo(e.duplo);
          break;
        case 'item': this.add({ tipo: 'anel', x: e.x, y: e.y - 20, vida: 0.7, cor: e.arma ? '#ffd23d' : '#ff6b6b', r: 50 }); break;
        case 'pegou':
          this.add({ tipo: 'anel', x: e.x, y: e.y - 20, vida: 0.5, cor: '#fff', r: 40 });
          this.texto(e.x, e.y - 60, e.arma ? NOMES_ARMAS[e.arma].toUpperCase() + '!' : 'VIDA +60', e.arma ? '#ffd23d' : '#5cff7a', e.i === this.eu ? 28 : 18, { pop: true });
          if (e.i === this.eu) { som.pega(e.arma); if (e.arma) som.fala(NOMES_ARMAS[e.arma]); }
          break;
        case 'semMunicao': if (e.i === this.eu) { this.texto(meu?.x ?? W / 2, (meu?.y ?? 300) - 110, 'SEM MUNIÇÃO · PISTOLA', '#fff', 20); som.vazio(); } break;
        case 'onda':
          this.anunciar(e.nome, e.n >= 4 ? '#ff4646' : '#ffb020', 1900);
          som.sirene();
          som.fala(e.nome.toLowerCase().replace('!', ''), true);
          break;
        case 'chefe': this.tremor = 30; som.rugido(); break;
        case 'combo':
          if (e.i === this.eu) {
            this.anunciar(e.combo >= 10 ? (e.combo === 10 ? 'SUPER COMBO!' : `SUPER COMBO x${e.combo}!`) : 'COMBO!', e.combo >= 10 ? '#ff4fd8' : '#ffd23d', 1300);
            som.combo(e.combo); som.fala(e.combo >= 10 ? 'Super combo!' : 'Combo!', true);
            this.lento = Math.max(this.lento, agora + (e.combo >= 10 ? 500 : 250));
          } else if (meu) this.texto(est.soldados[e.i].x, est.soldados[e.i].y - 130, `COMBO x${e.combo}`, this.tom(e.i), 18);
          break;
        case 'lider':
          if (e.i === this.eu) { this.anunciar('VOCÊ PASSOU NA FRENTE!', '#ffd23d', 1500); this.passou = agora; som.combo(5); }
          else if (e.antes === this.eu) this.anunciar(`${this.nome(e.i).toUpperCase()} PASSOU VOCÊ!`, this.tom(e.i), 1400);
          break;
        case 'impacto': if (Math.random() < 0.5 * this.qualidade) this.faiscas(e.x, e.y, 2, '#ffd27a'); break;
        case 'saiu': this.texto(W / 2, 250, `${this.nome(e.i)} saiu`, '#fff', 24); break;
        default:
      }
    }
  }

  // --------------------------------------------------------- partículas (pool)

  add(p) {
    if (this.part.length > 420 * this.qualidade) return;
    const o = this.livres.pop() ?? {};
    for (const k in o) delete o[k];
    Object.assign(o, p, { idade: 0 });
    this.part.push(o);
  }
  sangue(x, y, n, lado = 0, forca = 1) {
    for (let k = 0; k < n * this.qualidade; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4 + lado * 0.6, v = (120 + Math.random() * 300) * forca;
      this.add({ tipo: 'gota', x, y, vx: Math.cos(a) * v + lado * 100, vy: Math.sin(a) * v, vida: 0.7 + Math.random() * 0.5, r: 1.5 + Math.random() * 3 });
    }
  }
  faiscas(x, y, n, cor) {
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 280; this.add({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vida: 0.25 + Math.random() * 0.3, cor: cor ?? (Math.random() < 0.5 ? '#ffd23d' : '#ff9a2a') }); }
  }
  fumaca(x, y, n, forca = 1) {
    for (let k = 0; k < n * this.qualidade; k++) this.add({ tipo: 'fumaca', x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 40, vida: 0.9 + Math.random() * 0.6, r: (8 + Math.random() * 10) * forca + 6, escura: false });
  }
  fogo(x, y, n) { for (let k = 0; k < n; k++) this.add({ tipo: 'chama', x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 60, vida: 0.5 + Math.random() * 0.3, r: 8 + Math.random() * 8 }); }
  pedacos(x, y, n) {
    for (let k = 0; k < n * this.qualidade; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 200 + Math.random() * 300;
      this.add({ tipo: 'pedaco', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, vida: 2.2, w: 6 + Math.random() * 8, gira: true });
    }
  }
  explosao(x, y, tam = 1) {
    const agora = performance.now();
    this.luzes.push({ x, y, r: 420 * tam, t0: agora, vida: 380, cor: '255,170,60' });
    this.add({ tipo: 'clarao', x, y, vida: 0.22, r: 220 * tam });
    this.add({ tipo: 'onda', x, y, vida: 0.45, r: 190 * tam });
    for (let k = 0; k < 3; k++) this.add({ tipo: 'sprite', nome: `explosao-${k}`, x: x + (Math.random() - 0.5) * 50 * tam, y: y + (Math.random() - 0.5) * 30 * tam, rot: Math.random() * 6, vida: 0.5, w: (120 + Math.random() * 50) * tam, atraso: k * 0.07, cresce: true });
    for (let k = 0; k < 5 * this.qualidade; k++) this.add({ tipo: 'sprite', nome: `fumaca-${k % 5}`, x: x + (Math.random() - 0.5) * 70 * tam, y: y - 10, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30, rot: 0, vida: 1.6, w: (80 + Math.random() * 40) * tam, atraso: 0.18 + k * 0.08, fumaca: true });
    for (let k = 0; k < 14 * this.qualidade; k++) { const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 450; this.add({ tipo: 'destroco', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, vida: 1.4, w: 4 + Math.random() * 8, gira: true }); }
    this.faiscas(x, y, Math.round(16 * this.qualidade));
    for (let k = 0; k < 4 * this.qualidade; k++) this.add({ tipo: 'sprite', nome: `fogo-${k % 4}`, x: x + (Math.random() - 0.5) * 90 * tam, y: Math.min(CHAO, y + 30), rot: 0, vida: 1.4, w: 34 + Math.random() * 20, atraso: 0.1, base: true });
  }
  confete() {
    const cores = ['#ff4646', '#ffd23d', '#3ddc5a', '#3b8cff', '#b86bff', '#fff'];
    this.add({ tipo: 'confete', tela: true, x: Math.random(), y: -0.05 - Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.15, vy: 0.1 + Math.random() * 0.15, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, cor: sorteia(cores), w: 8 + Math.random() * 8, vida: 5 });
  }

  // ------------------------------------------------------------ entrada

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat && (k === 'w' || k === ' ' || k === 'arrowup')) this.puloPendente = true;
        this.teclas.add(k);
        destravar();
      },
      teclaSobe: (e) => this.teclas.delete(e.key.toLowerCase()),
      desce: (e) => this.ponteiroDesce(e),
      move: (e) => this.ponteiroMove(e),
      sobe: (e) => this.ponteiroSobe(e),
      resize: () => this.redimensionar(),
      blur: () => { this.teclas.clear(); this.mouseFogo = false; this.toques.clear(); },
      menu: (e) => e.preventDefault(),
      solta: () => destravar(),   // iOS só libera o áudio no fim do toque
    };
    addEventListener('keydown', this.h.teclaDesce);
    addEventListener('keyup', this.h.teclaSobe);
    addEventListener('resize', this.h.resize);
    addEventListener('blur', this.h.blur);
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('pointerup', this.h.sobe);
    addEventListener('pointercancel', this.h.sobe);
    this.canvas.addEventListener('contextmenu', this.h.menu);
    addEventListener('touchend', this.h.solta);
  }

  desligar() {
    removeEventListener('keydown', this.h.teclaDesce);
    removeEventListener('keyup', this.h.teclaSobe);
    removeEventListener('resize', this.h.resize);
    removeEventListener('blur', this.h.blur);
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('pointerup', this.h.sobe);
    removeEventListener('pointercancel', this.h.sobe);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
    removeEventListener('touchend', this.h.solta);
  }

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
  paraMundo(v) { return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc }; }

  /** Controles: pequenos, transparentes e nos cantos de baixo (no toque); botões de som/sair em cima à direita. */
  botoes() {
    const s = Math.min(this.vw, this.vh), m = 14, b = 34;
    const cima = { sair: { x: this.vw - b - 8, y: 8, w: b, h: b }, efeitos: { x: this.vw - (b + 6) * 2 - 2, y: 8, w: b, h: b }, musica: { x: this.vw - (b + 6) * 3 - 2, y: 8, w: b, h: b } };
    if (!this.toque) return cima;
    const joy = { x: m + s * 0.13, y: this.vh - m - s * 0.13, r: s * 0.13 };
    const fogo = { x: this.vw - m - s * 0.12, y: this.vh - m - s * 0.12, r: s * 0.12 };
    const pr = s * 0.08;
    const pulo = { x: fogo.x - fogo.r - 14 - pr, y: this.vh - m - pr, r: pr };
    return { ...cima, joy, fogo, pulo };
  }

  ponteiroDesce(e) {
    destravar();
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') this.toque = true;
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x - 4 && v.x <= r.x + r.w + 4 && v.y >= r.y - 4 && v.y <= r.y + r.h + 4;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.efeitos)) { som.alternarEfeitos(); return; }
    if (dentro(b.musica)) { som.alternarMusica(); return; }
    if (e.pointerType === 'mouse') {
      this.mouseV = v;
      if (e.button === 0) this.mouseFogo = true;
      if (e.button === 2) this.puloPendente = true;
      return;
    }
    e.preventDefault();
    if (Math.hypot(v.x - b.pulo.x, v.y - b.pulo.y) < b.pulo.r * 1.45) { this.puloPendente = true; this.toques.set(e.pointerId, { tipo: 'pulo', x0: v.x, y0: v.y, x: v.x, y: v.y }); return; }
    if (v.x < this.vw / 2) { this.toques.set(e.pointerId, { tipo: 'mover', x0: v.x, y0: v.y, x: v.x, y: v.y, pulou: false }); return; }
    // no botão de tiro: analógico preso no centro (mira arrastando); fora dele, na metade direita: atira no ponto tocado
    const noFogo = Math.hypot(v.x - b.fogo.x, v.y - b.fogo.y) < b.fogo.r * 1.6;
    this.toques.set(e.pointerId, noFogo ? { tipo: 'mirar', x0: b.fogo.x, y0: b.fogo.y, x: v.x, y: v.y } : { tipo: 'apontar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  ponteiroMove(e) {
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { this.mouseV = v; this.toque = false; return; }
    const t = this.toques.get(e.pointerId);
    if (!t) return;
    t.x = v.x; t.y = v.y;
    if (t.tipo === 'mover') {
      const r = this.botoes().joy?.r ?? 1;
      if (!t.pulou && t.y0 - t.y > r * 0.55) { t.pulou = true; this.puloPendente = true; }
      if (t.y0 - t.y < r * 0.3) t.pulou = false;
    }
  }

  ponteiroSobe(e) {
    if (e.pointerType === 'mouse') { this.mouseFogo = false; return; }
    this.toques.delete(e.pointerId);
  }

  enviarEntrada(est) {
    if (this.encerrado) return;
    let mx = 0, fogo = false, desce = false;
    const k = this.teclas;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('s') || k.has('arrowdown')) desce = true;
    if (this.mouseFogo) fogo = true;
    const meu = est?.soldados[this.eu];
    const mouse = this.mouseV ? this.paraMundo(this.mouseV) : null;
    if (meu && mouse && !this.toque) this.mira = Math.atan2(mouse.y - (meu.y - SOLDADO.h * 0.55), mouse.x - meu.x);
    const bt = this.botoes(), r = bt.joy?.r ?? 1;
    let mirando = false;
    for (const t of this.toques.values()) {
      const dx = t.x - t.x0, dy = t.y - t.y0, d = Math.hypot(dx, dy);
      if (t.tipo === 'mover') {
        if (Math.abs(dx) > 8) mx = Math.max(-1, Math.min(1, dx / r));
        if (dy > r * 0.55) desce = true;
      }
      if (t.tipo === 'mirar') { fogo = true; mirando = true; if (d > (bt.fogo?.r ?? 60) * 0.2) this.mira = Math.atan2(dy, dx); }
      if (t.tipo === 'apontar') { fogo = true; mirando = true; if (meu) { const m = this.paraMundo(t); this.mira = Math.atan2(m.y - (meu.y - SOLDADO.h * 0.55), m.x - meu.x); } }
    }
    // no toque, sem mirar: atira pra onde anda (e mira sozinho no zumbi mais perto daquele lado)
    if (this.toque && !mirando) {
      if (mx) this.mira = mx > 0 ? 0 : Math.PI;
      if (fogo === false && this.toques.size === 0) { /* parado: mantém a mira */ }
    }
    if (this.toque && meu && fogo && [...this.toques.values()].some((t) => t.tipo === 'mirar' && Math.hypot(t.x - t.x0, t.y - t.y0) < (bt.fogo?.r ?? 60) * 0.2)) {
      // botão de tiro só tocado (sem arrastar): mira no zumbi mais perto pra frente
      const lado = Math.cos(this.mira) >= 0 ? 1 : -1;
      const alvo = est.zumbis.filter((z) => !z.morto && !z.surge && Math.sign(z.x - meu.x) === lado && Math.abs(z.y - meu.y) < 200).sort((a, b) => Math.abs(a.x - meu.x) - Math.abs(b.x - meu.x))[0];
      if (alvo) this.mira = Math.atan2(alvo.y - ZUMBIS[alvo.tipo].h * 0.5 - (meu.y - SOLDADO.h * 0.55), alvo.x - meu.x);
    }
    mx = Math.round(mx * 100) / 100;
    const ang = Math.round(this.mira * 100) / 100;
    const agora = performance.now();
    this.acumulado = Math.min(150, this.acumulado + (this.ultimoQuadro == null ? 0 : agora - this.ultimoQuadro));
    this.ultimoQuadro = agora;
    const novos = [];
    const e = this.ultimo;
    while (this.acumulado >= 33) {
      this.acumulado -= 33;
      const c = { s: ++this.cmdSeq, mx, pulo: this.puloPendente, desce, dt: 33, ang, fogo };
      this.puloPendente = false;
      novos.push(c);
      this.pendentes.push(c);
      if (e && this.pred && e.fase === 'jogo' && this.predVivo) {
        this.predAntes = { x: this.pred.x, y: this.pred.y };
        mover(this.mundo(e, this.pred), this.eu, c, 0.033);
      }
    }
    if (novos.length) this.op.onEntrada({ cmds: novos });
  }

  // ------------------------------------------------------------- desenho

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    this.girado = h > w * 1.05;
    this.vw = this.girado ? h : w;
    this.vh = this.girado ? w : h;
    const dpr = Math.min(this.dprMax ?? 2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // o mundo inteiro cabe; sobra vira cidade dos lados
    this.esc = Math.min(this.vw / W, this.vh / H);
    this.ox = (this.vw - W * this.esc) / 2;
    this.oy = (this.vh - H * this.esc) / 2;
    this.fundoCeu = null; this.camadas = null; this.vinheta = null;
  }

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, base = false, h } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return 0;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    if (virar) g.scale(-1, 1);
    if (alfa !== 1) g.globalAlpha *= alfa;
    g.drawImage(im, -w / 2, base ? -hh : -hh / 2, w, hh);
    g.restore();
    return hh;
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dtReal = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    const dt = dtReal * (agora < this.lento ? 0.3 : 1);   // câmera lenta: os efeitos andam devagar
    const e = this.ultimo;
    if (!this.encerrado && !this.travou && e?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    if (e && !this.encerrado) this.enviarEntrada(this.estadoAtual);
    const t = this.encerrado && this.fimEm ? (this.tFim ??= this.agoraServ() - ATRASO) + Math.min(400, (agora - this.fimEm) * 0.3) : this.agoraServ() - ATRASO;
    const est = this.interpolar(t);
    if (est && this.pred && this.predVivo && !this.encerrado) {
      // o meu soldado: previsão (com a correção sumindo aos poucos)
      this.corr.x *= 0.85; this.corr.y *= 0.85;
      const k = Math.min(1, this.acumulado / 33);
      const m = est.soldados[this.eu];
      const px = lerp(this.predAntes?.x ?? this.pred.x, this.pred.x, k) + this.corr.x, py = lerp(this.predAntes?.y ?? this.pred.y, this.pred.y, k) + this.corr.y;
      Object.assign(m, { x: px, y: py, ang: this.mira, dir: Math.cos(this.mira) >= 0 ? 1 : -1, chao: this.pred.chao, vy: this.pred.vy, movendo: Math.abs(px - (this.xAntes[this.eu] ?? px)) > 0.3 });
    }
    this.estadoAtual = est;
    if (est) this.tratarEventos(t, est);
    this.sons(est);

    // câmera: segue de leve o meu soldado (pra os prédios andarem em parallax)
    const meu = est?.soldados[this.eu];
    this.cam = lerp(this.cam, meu ? meu.x : W / 2, Math.min(1, dtReal * 2));
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }
    this.tremor *= Math.pow(0.0015, dtReal);
    const tx = (Math.random() - 0.5) * this.tremor, ty = (Math.random() - 0.5) * this.tremor;
    this.desenharCeu(g, agora, dtReal);
    g.save();
    g.translate(this.ox + tx, this.oy + ty);
    g.scale(this.esc, this.esc);
    this.desenharCidade(g, agora, dtReal);
    this.desenharPlataformas(g, agora, est);
    if (est) {
      this.desenharItens(g, agora, est);
      this.desenharCorpos(g, agora, dt);
      for (const z of est.zumbis) this.desenharZumbi(g, z, agora);
      for (const [i, s] of est.soldados.entries()) this.desenharSoldado(g, i, s, agora);
      this.desenharBalas(g, est, agora);
    }
    this.desenharParticulas(g, dt, agora, false);
    this.desenharLuzes(g, agora);
    this.desenharTextos(g, agora);
    g.restore();
    this.desenharParticulas(g, dt, agora, true);
    if (e) this.desenharHud(g, agora, est, e);
    this.desenharControles(g);
  }

  /** Passos dos soldados e o tique dos últimos 10s. */
  sons(est) {
    if (!est || this.encerrado) return;
    for (const [i, s] of est.soldados.entries()) {
      const antes = this.xAntes[i];
      this.xAntes[i] = s.x;
      if (antes == null || !s.vivo || !s.chao) continue;
      const passos = this.passos[i] + Math.abs(s.x - antes) / 34;
      if (Math.floor(passos) !== Math.floor(this.passos[i])) {
        if (i === this.eu) som.passo(0.8);
        if (Math.random() < 0.3 * this.qualidade) this.add({ tipo: 'poeira', x: s.x, y: s.y - 3, vx: -s.dir * 20, vy: -8, vida: 0.4, r: 7 });
      }
      this.passos[i] = passos;
    }
    const e = this.ultimo;
    if (e?.fase === 'jogo') {
      const falta = Math.ceil((e.fimEm - this.agoraServ()) / 1000);
      if (falta <= 10 && falta > 0 && falta !== this.ultimoTique) {
        this.ultimoTique = falta;
        som.bip(falta <= 3);
        if (falta === 10) { som.apertar(); som.fala('Dez segundos!', true); this.anunciar('10 SEGUNDOS!', '#ff4646', 1200); }
      }
    }
  }

  // -------------------------------------------------------- cenário

  desenharCeu(g, agora, dt) {
    if (!this.fundoCeu) {
      // céu, estrelas e a lua: desenhados uma vez por tamanho de tela
      const c = document.createElement('canvas'); c.width = Math.ceil(this.vw); c.height = Math.ceil(this.vh);
      this.pintarCeu(c.getContext('2d'));
      this.fundoCeu = c;
    }
    g.drawImage(this.fundoCeu, 0, 0, this.vw, this.vh);
    // nuvem passando na frente da lua
    const ly = this.oy + 150 * this.esc, lr = 110 * this.esc;
    const nx = ((agora / 60) % (this.vw + 600)) - 300;
    g.fillStyle = 'rgba(30,25,45,.55)';
    g.beginPath(); g.ellipse(nx, ly + lr * 0.4, 180 * this.esc, 26 * this.esc, 0, 0, Math.PI * 2); g.ellipse(nx + 120 * this.esc, ly + lr * 0.2, 120 * this.esc, 22 * this.esc, 0, 0, Math.PI * 2); g.fill();
    void dt;
  }

  pintarCeu(g) {
    const agora = 0;
    const gr = g.createLinearGradient(0, 0, 0, this.vh);
    gr.addColorStop(0, '#05060f'); gr.addColorStop(0.45, '#14122a'); gr.addColorStop(0.75, '#3a1a2a'); gr.addColorStop(1, '#5a2418');
    g.fillStyle = gr; g.fillRect(0, 0, this.vw, this.vh);
    for (const s of this.estrelas) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(agora / 900 + s.f));
      g.fillStyle = `rgba(255,255,255,${a * 0.8})`;
      g.fillRect(s.x * this.vw, s.y * this.vh, s.r, s.r);
    }
    // lua gigante com halo e crateras
    const lx = this.vw * 0.72, ly = this.oy + 150 * this.esc, lr = 110 * this.esc;
    const halo = g.createRadialGradient(lx, ly, lr * 0.8, lx, ly, lr * 3.2);
    halo.addColorStop(0, 'rgba(255,240,200,.35)'); halo.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, lr * 3.2, 0, Math.PI * 2); g.fill();
    const lua = g.createRadialGradient(lx - lr * 0.3, ly - lr * 0.3, lr * 0.1, lx, ly, lr);
    lua.addColorStop(0, '#fffbe8'); lua.addColorStop(0.7, '#f1e2b6'); lua.addColorStop(1, '#d8c48e');
    g.fillStyle = lua; g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(170,150,110,.35)';
    for (const [cx, cy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.24], [-0.1, 0.38, 0.12], [0.4, -0.35, 0.1]]) { g.beginPath(); g.arc(lx + cx * lr, ly + cy * lr, cr * lr, 0, Math.PI * 2); g.fill(); }
  }

  /** Uma camada de prédios (com janelas) pintada uma vez numa imagem; o fogo e a fumaça ficam ao vivo. */
  pintarCamada(c) {
    const XA = -600, WA = W + 1200, esc = this.esc;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(WA * esc); cv.height = Math.ceil(CHAO * esc);
    const g = cv.getContext('2d');
    g.scale(esc, esc); g.translate(-XA, 0);
    const CORES_P = ['#1a1626', '#120f1c', '#0b0912'];
    const base = CHAO - [60, 30, 0][c];
    for (const p of this.predios[c]) {
      const topo = base - p.h;
        g.fillStyle = CORES_P[c];
        g.beginPath(); g.moveTo(p.x, base); g.lineTo(p.x, topo);
        if (p.quebra) { g.lineTo(p.x + p.w * 0.3, topo + 18); g.lineTo(p.x + p.w * 0.45, topo - 6); g.lineTo(p.x + p.w * 0.7, topo + 26); g.lineTo(p.x + p.w, topo + 8); }
        else g.lineTo(p.x + p.w, topo);
      g.lineTo(p.x + p.w, base); g.closePath(); g.fill();
      for (let k = 0; k < p.janelas.length; k++) {
        if (!p.janelas[k]) continue;
        const col = k % 3, lin = Math.floor(k / 3);
        const wy = topo + 30 + lin * 26;
        if (wy > base - 20) break;
        g.fillStyle = c === 2 ? 'rgba(255,170,80,.55)' : 'rgba(255,210,140,.35)';
        g.fillRect(p.x + 10 + col * (p.w - 26) / 2, wy, 8, 11);
      }
    }
    return cv;
  }

  desenharCidade(g, agora, dt) {
    const x0 = -this.ox / this.esc - 20, x1 = (this.vw - this.ox) / this.esc + 20;
    const desvio = this.cam - W / 2;
    this.camadas ??= [0, 1, 2].map((c) => this.pintarCamada(c));
    for (const [c, lista] of this.predios.entries()) {
      const par = [0.06, 0.12, 0.2][c], base = CHAO - [60, 30, 0][c];
      g.drawImage(this.camadas[c], -600 - desvio * par, 0, W + 1200, CHAO);
      // fogo nos telhados + fumaça subindo (ao vivo)
      for (const p of lista) {
        if (!p.fogo) continue;
        const fx = p.x + p.w * 0.5 - desvio * par, fy = base - p.h + (p.quebra ? 10 : 0);
        if (fx < x0 - 60 || fx > x1 + 60) continue;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.28 + Math.sin(agora / 90 + p.x) * 0.06;
        g.drawImage(brilho('255,120,40'), fx - 120, fy - 120, 240, 240); g.restore();
        const f = IMG[`fogo-${Math.floor(agora / 110 + p.x) % 4}`];
        if (pronto(f)) { g.save(); g.globalAlpha = 0.9; g.drawImage(f, fx - 22, fy - 44, 44, 52); g.restore(); }
        if (Math.random() < 0.06 * this.qualidade) this.add({ tipo: 'fumaca', x: fx, y: fy - 30, vx: 8, vy: -26, vida: 3, r: 14, escura: true });
      }
      if (c === 1) {
        // névoa andando entre as camadas
        g.save(); g.globalAlpha = 0.13;
        for (const n of this.nevoa) {
          n.x += n.v * dt; if (n.x - n.r > x1) n.x = x0 - n.r;
          g.drawImage(brilho('120,110,150'), n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
        }
        g.restore();
      }
    }
    // coisas no chão, atrás da ação
    const bota = (nome, x, alt, virar = false, alfa = 1) => this.sprite(nome, x, CHAO + 2, (alt * (IMG[nome]?.naturalWidth || 1)) / (IMG[nome]?.naturalHeight || 1), { base: true, virar, alfa });
    bota('caminhao', 1120, 120, true, 0.9); bota('van', 140, 78, false, 0.9); bota('pneus', 360, 44); bota('barreira', 900, 52);
    bota('cerca', 560, 60, false, 0.8); bota('sacos', 1250, 46); bota('concreto', 20, 56);
    for (const [px, nome] of [[300, 'poste'], [990, 'poste-2']]) {
      bota(nome, px, 150);
      // cone de luz do poste, piscando de vez em quando
      const liga = Math.sin(agora / 70 + px) > -0.92 ? 1 : 0.3;
      const lx = px + (nome === 'poste' ? 18 : 6), ly = CHAO - 140;
      g.save(); g.globalCompositeOperation = 'lighter';
      const cone = g.createLinearGradient(0, ly, 0, CHAO);
      cone.addColorStop(0, `rgba(255,220,140,${0.22 * liga})`); cone.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(lx - 8, ly); g.lineTo(lx + 8, ly); g.lineTo(lx + 90, CHAO); g.lineTo(lx - 90, CHAO); g.closePath(); g.fill();
      g.restore();
    }
  }

  desenharPlataformas(g, agora, est) {
    const x0 = -this.ox / this.esc - 20, x1 = (this.vw - this.ox) / this.esc + 20;
    // chão: blocos de terra ao longo de toda a tela (e mais um pouco)
    const bloco = IMG['bloco-2'];
    if (pronto(bloco)) { const h = 82, w = (h * bloco.naturalWidth) / bloco.naturalHeight; for (let x = Math.floor(x0 / (w - 4)) * (w - 4); x < x1; x += w - 4) g.drawImage(bloco, x, CHAO - 12, w, h); }
    g.fillStyle = '#2a1a10'; g.fillRect(x0, CHAO + 60, x1 - x0, 300);
    for (const [px0, px1, top] of PLATAFORMAS) {
      if (top === CHAO) continue;
      const im = IMG['chao-2'];
      if (!pronto(im)) continue;
      const h = 46, w = (h * im.naturalWidth) / im.naturalHeight, larg = px1 - px0;
      const n = Math.max(1, Math.round(larg / (w - 6)));
      const ww = larg / n;
      for (let k = 0; k < n; k++) g.drawImage(im, px0 + k * ww - 2, top - 10, ww + 4, h);
    }
    // barris explosivos (balançam de leve; somem enquanto não voltam)
    for (const [k, [bx, by]] of BARRIS.entries()) {
      if (est?.barris?.[k]) continue;
      this.sprite('barril-explosivo', bx, by + 2, BARRIL.w + 6, { base: true, rot: Math.sin(agora / 600 + k) * 0.02 });
    }
  }

  desenharItens(g, agora, est) {
    for (const [id, tipo, arma, x, y] of est.itens) {
      const sobe = Math.sin(agora / 300 + id) * 5;
      g.save(); g.globalAlpha = 0.45 + Math.sin(agora / 250 + id) * 0.1;
      g.drawImage(brilho(tipo === 'kit' ? '255,90,90' : '255,220,90'), x - 46, y - 74, 92, 92); g.restore();
      if (tipo === 'kit') this.sprite('kit', x, y - 22 + sobe, 34);
      else {
        this.sprite('caixa-1', x, y + 2, 40, { base: true });
        this.sprite(ICONE[arma], x, y - 54 + sobe, arma === 'lanca' ? 20 : arma === 'bazuca' ? 70 : 54, { rot: Math.sin(agora / 500 + id) * 0.1 });
      }
    }
  }

  quadroZumbi(z, agora) {
    const nome = SPRITE_Z[z.tipo];
    if (z.tipo === 'gigante') return 'zumbi-gigante-anda-0';
    const n = QUADROS_Z[nome];
    const passo = Math.floor((z.x / PASSO_Z[z.tipo]) * (z.dir || 1) + (z.movendo ? 0 : agora / 260)) ;
    return `zumbi-${nome}-anda-${((passo % n) + n) % n}`;
  }

  desenharZumbi(g, z, agora) {
    if (z.morto) return;
    const alt = ALTURA_Z[z.tipo];
    let nome = this.quadroZumbi(z, agora);
    const bateu = z.tipo === 'gigante' && agora - (this.flash.get(z.id) ?? 0) < 120;
    if (z.tipo === 'gigante' && Math.sin(agora / 380) > 0.8) nome = 'zumbi-gigante-bate';
    const im = IMG[nome];
    if (!pronto(im)) return;
    const w = (alt * im.naturalWidth) / im.naturalHeight;
    // sombra
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(z.x, z.y + 2, w * 0.35, 6, 0, 0, Math.PI * 2); g.fill();
    g.save();
    // saindo do chão: corta embaixo e sobe
    let sub = 0;
    if (z.surge) {
      const k = Math.min(1, ((agora / 40) % 25) / 25);
      sub = alt * (0.55 - k * 0.3);
      g.beginPath(); g.rect(z.x - w, z.y - alt - 40, w * 2, alt + 40); g.clip();
    }
    const balanço = z.tipo === 'gigante' ? Math.sin(agora / 260) * 4 : z.movendo ? Math.sin(z.x / 8) * 1.5 : Math.sin(agora / 400 + z.id) * 1;
    g.translate(z.x, z.y + sub + balanço);
    if (z.dir < 0) g.scale(-1, 1);
    if (!z.chao) g.rotate(z.tipo === 'corredor' ? -0.25 : -0.1);
    if (z.tipo === 'gigante') g.scale(1 + Math.sin(agora / 260) * 0.015, 1 - Math.sin(agora / 260) * 0.015);
    g.drawImage(im, -w / 2, -alt, w, alt);
    // piscou branco no acerto
    const f = agora - (this.flash.get(z.id) ?? -1e9);
    if (f < 90 || bateu) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55 * (1 - f / 90);
      g.drawImage(im, -w / 2, -alt, w, alt);
    }
    g.restore();
    // pegando fogo
    if ((this.fogoZ.get(z.id) ?? 0) > agora && Math.random() < 0.6 * this.qualidade) this.fogo(z.x + (Math.random() - 0.5) * w * 0.5, z.y - alt * (0.2 + Math.random() * 0.6), 1);
    // vida (só quem já levou tiro; o gigante tem barra grande no HUD)
    if (z.vida < 1 && z.tipo !== 'gigante' && !z.surge) {
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(z.x - 20, z.y - alt - 10, 40, 5);
      g.fillStyle = z.vida > 0.5 ? '#7ddc3a' : z.vida > 0.25 ? '#ffc53d' : '#ff4646'; g.fillRect(z.x - 20, z.y - alt - 10, 40 * z.vida, 5);
    }
    if (z.tipo === 'explosivo' && !z.surge) {   // gordo piscando vermelho: vai explodir
      const p = (Math.sin(agora / 120 + z.id) + 1) / 2;
      g.fillStyle = `rgba(255,40,30,${0.25 + p * 0.35})`; g.beginPath(); g.arc(z.x, z.y - alt * 0.45, 9 + p * 4, 0, Math.PI * 2); g.fill();
    }
  }

  /** Mortos: o corpo voa (explosão) ou tomba, quica no chão e some devagar. */
  desenharCorpos(g, agora, dt) {
    this.corpos = this.corpos.filter((c) => agora - c.t0 < 2600);
    for (const c of this.corpos) {
      if (!c.chao) {
        c.vy += 1500 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
        const piso = PLATAFORMAS.filter(([x0, x1, top]) => c.x > x0 && c.x < x1 && top >= c.y - c.vy * dt - 1).reduce((m, [, , top]) => Math.min(m, top), CHAO);
        if (c.y >= piso && c.vy > 0) { c.y = piso; c.vy *= -0.25; c.vx *= 0.5; if (Math.abs(c.vy) < 60) { c.chao = true; c.rot = 0; } this.add({ tipo: 'poeira', x: c.x, y: piso - 4, vx: 0, vy: -10, vida: 0.5, r: 12 }); }
      }
      const k = (agora - c.t0) / 2600;
      const alfa = k > 0.65 ? (1 - k) / 0.35 : 1;
      if (c.soldado != null) {
        const im = `soldado-${this.cor(c.soldado)}-${c.chao ? 'morto' : 'dano'}`;
        this.sprite(im, c.x, c.y + 2, c.chao ? 96 : 60, { base: true, virar: c.dir < 0, rot: c.chao ? 0 : c.rot * 0.3, alfa });
        continue;
      }
      const nome = SPRITE_Z[c.zt];
      const im = c.zt === 'gigante' ? 'zumbi-gigante-bate' : `zumbi-${nome}-${c.chao ? 'morto' : 'morre'}`;
      const larg = c.zt === 'gigante' ? 200 : c.zt === 'corredor' ? 110 : c.chao ? 100 : 96;
      this.sprite(im, c.x, c.y + 4, larg, { base: true, virar: c.dir < 0, rot: c.chao ? 0 : c.rot * 0.4, alfa: c.zt === 'gigante' && c.chao ? alfa * 0.9 : alfa });
      if (c.fogo && Math.random() < 0.4 * this.qualidade) this.fogo(c.x, c.y - 10, 1);
    }
  }

  desenharSoldado(g, i, s, agora) {
    if (!s.vivo) return;
    const cor = this.cor(i);
    const lado = Math.cos(s.ang) >= 0 ? 1 : -1;
    const ferido = agora - this.dano[i] < 220;
    const nome = ferido ? 'dano' : !s.chao ? 'corre-2' : s.movendo ? `corre-${Math.floor(this.passos[i]) % 6}` : agora - this.recuo[i] < 400 ? 'mira' : `mira${Math.floor(agora / 700 + i) % 3 === 0 ? '-1' : ''}`;
    const im = IMG[`soldado-${cor}-${nome}`];
    if (!pronto(im)) return;
    const alt = 86, w = (alt * im.naturalWidth) / im.naturalHeight;
    // sombra no chão de baixo
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(s.x, s.y + 2, 20, 5, 0, 0, Math.PI * 2); g.fill();
    const k = Math.max(0, 1 - (agora - this.recuo[i]) / 110);
    const resp = s.movendo || !s.chao ? 0 : Math.sin(agora / 420 + i) * 1.4;
    const elev = Math.atan2(-Math.sin(s.ang), Math.abs(Math.cos(s.ang)));
    g.save();
    if (s.protegido) g.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(agora / 70));
    g.translate(s.x, s.y + resp * 0.5);
    g.scale(lado, 1);
    g.rotate(-Math.max(-0.45, Math.min(0.45, elev * 0.4)) + (!s.chao ? -0.08 : 0) + (s.movendo && s.chao ? 0.05 : 0));
    g.translate(-k * 6, 0);
    g.drawImage(im, -w * 0.45, -alt + resp, w, alt);
    if (ferido) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(im, -w * 0.45, -alt + resp, w, alt); }
    g.restore();
    // chama do lança-chamas na boca da arma
    if (s.arma === 'lanca' && agora - this.recuo[i] < 120) {
      const bx = s.x + Math.cos(s.ang) * 40, by = s.y - SOLDADO.h * 0.55 + Math.sin(s.ang) * 20;
      this.sprite('chama', bx + Math.cos(s.ang) * 40, by + Math.sin(s.ang) * 40, 90 + Math.random() * 20, { rot: s.ang, alfa: 0.9 });
    }
    // nome, arma e vida em cima
    const eu = i === this.eu;
    rotulo(g, eu ? 'VOCÊ' : this.nome(i), s.x, s.y - alt - 20, TOM[cor], eu ? 15 : 13);
    if (!eu || this.toque) {
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(s.x - 18, s.y - alt - 10, 36, 4);
      g.fillStyle = s.vida > 50 ? '#5cff7a' : s.vida > 25 ? '#ffc53d' : '#ff4646'; g.fillRect(s.x - 18, s.y - alt - 10, 36 * (s.vida / SOLDADO.vida), 4);
    }
    if (s.arma !== 'pistola') this.sprite(ICONE[s.arma], s.x + 30, s.y - alt - 20, s.arma === 'lanca' ? 10 : 30, { alfa: 0.9 });
  }

  desenharBalas(g, est, agora) {
    for (const b of est.balas) {
      if (b.arma === 'lanca') {
        // chama: bola de fogo que cresce e some
        const r = 20 + Math.random() * 16;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.85;
        g.drawImage(brilho('255,140,30'), b.x - r, b.y - r, r * 2, r * 2);
        g.drawImage(brilho('255,240,170'), b.x - r * 0.4, b.y - r * 0.4, r * 0.8, r * 0.8); g.restore();
        continue;
      }
      if (b.arma === 'bazuca') {
        this.sprite('foguete', b.x, b.y, 56, { rot: b.ang });
        if (Math.random() < 0.9) this.add({ tipo: 'fumaca', x: b.x - Math.cos(b.ang) * 26, y: b.y - Math.sin(b.ang) * 26, vx: 0, vy: -10, vida: 0.7, r: 7 });
        this.luzes.push({ x: b.x, y: b.y, r: 110, t0: agora, vida: 30, cor: '255,160,60' });
        continue;
      }
      const len = b.arma === 'escopeta' ? 18 : 30;
      // rastro: cauda apagada + ponta acesa (sem gradiente: barato com muita bala)
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,220,140,.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(b.x - Math.cos(b.ang) * len, b.y - Math.sin(b.ang) * len); g.lineTo(b.x, b.y); g.stroke();
      g.strokeStyle = COR_BALA[b.arma]; g.lineWidth = b.arma === 'escopeta' ? 2.5 : 3;
      g.beginPath(); g.moveTo(b.x - Math.cos(b.ang) * len * 0.35, b.y - Math.sin(b.ang) * len * 0.35); g.lineTo(b.x, b.y); g.stroke();
    }
  }

  desenharParticulas(g, dt, agora, tela) {
    const vivas = [];
    for (const p of this.part) {
      if (!!p.tela !== tela) { vivas.push(p); continue; }
      if (p.atraso > 0) { p.atraso -= dt; vivas.push(p); continue; }
      p.idade += dt;
      if (p.idade >= p.vida) { this.livres.push(p); continue; }
      vivas.push(p);
      const k = p.idade / p.vida;
      if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.gira) p.rot += p.vr * dt;
      switch (p.tipo) {
        case 'gota': p.vy += 1300 * dt; if (p.y > CHAO) { p.y = CHAO; p.vx = 0; p.vy = 0; } g.fillStyle = `rgba(150,10,10,${1 - k * 0.5})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); break;
        case 'faisca': p.vy += 700 * dt; g.strokeStyle = p.cor; g.globalAlpha = 1 - k; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke(); g.globalAlpha = 1; break;
        case 'fumaca': { const r = p.r * (1 + k * 2); g.fillStyle = p.escura ? `rgba(30,25,30,${0.4 * (1 - k)})` : `rgba(200,200,205,${0.4 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); break; }
        case 'poeira': { const r = p.r * (1 + k * 1.5); g.fillStyle = `rgba(160,130,100,${0.45 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); break; }
        case 'chama': { const r = p.r * (1 - k * 0.6); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,${Math.round(180 - k * 140)},40,${0.8 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); g.restore(); break; }
        case 'terra': p.vy += 1200 * dt; g.fillStyle = '#4a3020'; g.fillRect(p.x, p.y, p.w, p.w); break;
        case 'capsula': p.vy += 1400 * dt; if (p.y > CHAO) { p.y = CHAO; p.vy *= -0.4; p.vx *= 0.5; } this.sprite('capsula', p.x, p.y, 9, { rot: p.rot }); break;
        case 'pedaco': case 'destroco': {
          p.vy += 1300 * dt; if (p.y > CHAO) { p.y = CHAO; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5; }
          g.save(); g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; g.translate(p.x, p.y); g.rotate(p.rot);
          g.fillStyle = p.tipo === 'pedaco' ? '#6e1414' : '#3a3030'; g.fillRect(-p.w / 2, -p.w / 3, p.w, p.w * 0.66); g.restore(); break;
        }
        case 'clarao': { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - k; const r = p.r * (0.4 + k * 0.6); g.drawImage(brilho('255,190,90'), p.x - r, p.y - r, r * 2, r * 2); g.restore(); break; }
        case 'onda': g.strokeStyle = `rgba(255,230,190,${0.7 * (1 - k)})`; g.lineWidth = 8 * (1 - k) + 1; g.beginPath(); g.arc(p.x, p.y, p.r * k, 0, Math.PI * 2); g.stroke(); break;
        case 'anel': g.strokeStyle = p.cor; g.globalAlpha = 1 - k; g.lineWidth = 4; g.beginPath(); g.arc(p.x, p.y, p.r * (0.3 + k), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; break;
        case 'sprite': {
          const im = IMG[p.nome];
          if (!pronto(im)) break;
          const s = p.cresce ? 0.5 + volta(Math.min(1, k * 2.2)) * 0.7 : p.fumaca ? 0.7 + k * 0.8 : 1;
          const w = p.w * s, h = (w * im.naturalHeight) / im.naturalWidth;
          g.save(); g.globalAlpha = p.fumaca ? 0.85 * (1 - k) : k > 0.6 ? (1 - k) / 0.4 : 1;
          g.translate(p.x, p.y); g.rotate(p.rot ?? 0); g.drawImage(im, -w / 2, p.base ? -h : -h / 2, w, h); g.restore(); break;
        }
        case 'confete': {
          p.vy += 0.5 * dt; p.vx *= 0.99; if (p.vy > 0.25) p.vy = 0.25;
          g.save(); g.translate(p.x * this.vw, p.y * this.vh); g.rotate(p.rot);
          g.fillStyle = p.cor; g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2 * (0.5 + Math.abs(Math.sin(p.rot * 2)))); g.restore(); break;
        }
        default:
      }
    }
    this.part = vivas;
    if (!tela) {
      // cinzas e brasas flutuando
      for (const c of this.cinzas) {
        c.y -= c.v * dt * (c.brasa ? 1.4 : 0.6); c.x += Math.sin(agora / 1200 + c.f) * 12 * dt;
        if (c.y < -10) { c.y = H + 10; c.x = Math.random() * W; }
        g.fillStyle = c.brasa ? `rgba(255,${120 + Math.round(Math.sin(agora / 200 + c.f) * 60)},40,.8)` : 'rgba(200,190,190,.35)';
        g.fillRect(c.x, c.y, c.brasa ? 2.5 : 2, c.brasa ? 2.5 : 2);
      }
    }
  }

  /** Luz dinâmica: tiros, explosões e foguetes clareiam em volta; escurece as bordas. */
  desenharLuzes(g, agora) {
    this.luzes = this.luzes.filter((l) => agora - l.t0 < l.vida);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const l of this.luzes) {
      g.globalAlpha = 0.35 * (1 - (agora - l.t0) / l.vida);
      g.drawImage(brilho(l.cor), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    g.restore();
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < t.vida);
    for (const t of this.textos) {
      const k = (agora - t.t0) / t.vida;
      const s = t.pop ? (k < 0.15 ? volta(k / 0.15) : 1) : 1;
      rotulo(g, t.txt, t.x, t.y - k * 46, t.cor, t.tam * s, k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }

  // ------------------------------------------------------------- HUD

  desenharHud(g, agora, est, e) {
    const vw = this.vw, vh = this.vh;
    // tela vermelha quando apanha
    if (!this.vinheta) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const cg = c.getContext('2d'), vg = cg.createRadialGradient(128, 128, 70, 128, 128, 182);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
      cg.fillStyle = vg; cg.fillRect(0, 0, 256, 256);
      this.vinheta = c;
    }
    g.globalAlpha = 0.5; g.drawImage(this.vinheta, 0, 0, vw, vh); g.globalAlpha = 1;
    const f = Math.max(0, 1 - (agora - this.ferido) / 400);
    if (f) { g.fillStyle = `rgba(200,0,0,${0.3 * f})`; g.fillRect(0, 0, vw, vh); }
    // relógio no meio
    const falta = e.fase === 'contagem' ? e.fimEm - e.largada : Math.max(0, e.fimEm - (this.encerrado ? e.fimEm : this.agoraServ()));
    const seg = Math.ceil(falta / 1000);
    const urgente = seg <= 10 && e.fase === 'jogo' && !this.encerrado;
    const pul = urgente ? 1 + Math.max(0, 1 - ((falta / 1000) % 1) * 3) * 0.3 : 1;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(vw / 2 - 44, 6, 88, 36, 12); g.fill();
    if (urgente) { g.strokeStyle = '#ff4646'; g.lineWidth = 2; g.stroke(); }
    rotulo(g, `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 25, urgente ? '#ff4646' : '#fff', 22 * pul);
    // placar: os jogadores dos dois lados do relógio (eu com borda)
    const n = e.n, larg = Math.min(130, (vw / 2 - 70 - 120) / Math.ceil(n / 2));
    const lider = Math.max(...e.pontos);
    for (let i = 0; i < n; i++) {
      const esq = i % 2 === 0, k = Math.floor(i / 2);
      const x = esq ? vw / 2 - 52 - (k + 1) * (larg + 6) : vw / 2 + 52 + k * (larg + 6);
      const brilha = this.passou && i === this.eu && agora - this.passou < 1200;
      g.globalAlpha = e.fora[i] ? 0.4 : 1;
      g.fillStyle = brilha ? `rgba(255,210,61,${0.5 + Math.sin(agora / 60) * 0.3})` : 'rgba(0,0,0,.55)';
      g.beginPath(); g.roundRect(x, 6, larg, 36, 12); g.fill();
      g.strokeStyle = this.tom(i); g.lineWidth = i === this.eu ? 3 : 1.5; g.stroke();
      g.font = '700 11px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = this.tom(i);
      g.fillText(`${e.pontos[i] === lider && lider > 0 ? '👑' : ''}${i === this.eu ? 'VOCÊ' : this.nome(i)}`.slice(0, 11), x + 8, 16);
      g.font = '900 16px system-ui, sans-serif'; g.fillStyle = '#fff';
      g.fillText(String(e.pontos[i]), x + 8, 32);
      const c = e.combo[i];
      if (c >= 2) { g.textAlign = 'right'; g.font = '900 11px system-ui, sans-serif'; g.fillStyle = c >= 10 ? '#ff4fd8' : c >= 5 ? '#ffd23d' : '#bbb'; g.fillText(`x${c >= 10 ? 3 : c >= 5 ? 2 : 1} · ${c}`, x + larg - 6, 32); }
      g.globalAlpha = 1;
    }
    // minha vida + arma (em baixo, no meio)
    const meu = est?.soldados[this.eu];
    if (meu && !this.encerrado) {
      const bw = Math.min(180, vw * 0.22), bx = vw / 2 - bw / 2, by = vh - 22;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(bx - 4, by - 4, bw + 8, 14, 7); g.fill();
      const v = meu.vivo ? meu.vida / SOLDADO.vida : 0;
      g.fillStyle = v > 0.5 ? '#5cff7a' : v > 0.25 ? '#ffc53d' : '#ff4646';
      g.beginPath(); g.roundRect(bx, by, bw * v, 6, 3); g.fill();
      const icone = ICONE[meu.arma];
      if (icone) this.sprite(icone, bx - 30, by - 4, meu.arma === 'lanca' ? 12 : 40);
      rotulo(g, meu.municao == null ? '∞' : String(meu.municao), bx + bw + 22, by + 2, '#fff', 14);
      if (!meu.vivo) {
        const falta2 = Math.max(0, 2.5 - (agora - this.morte[this.eu]) / 1000);
        rotulo(g, `VOLTANDO EM ${falta2.toFixed(1)}s`, vw / 2, vh * 0.42, '#fff', 24);
      }
    }
    // chefe: barra grande
    const gig = est?.zumbis.find((z) => z.tipo === 'gigante' && !z.morto);
    if (gig) {
      const bw = Math.min(360, vw * 0.4), bx = vw / 2 - bw / 2, by = 50;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.roundRect(bx - 4, by - 4, bw + 8, 16, 8); g.fill();
      g.fillStyle = '#c3141b'; g.beginPath(); g.roundRect(bx, by, bw * gig.vida, 8, 4); g.fill();
      rotulo(g, 'GIGANTE', vw / 2, by + 22, '#ff8a8a', 12);
    }
    // contagem 3-2-1-GO
    if (e.fase === 'contagem') {
      const resta = Math.max(0, e.largada - this.agoraServ());
      const num = Math.ceil(resta / 1000);
      if (num !== this.ultimaContagem && num > 0 && num <= 3) { this.ultimaContagem = num; som.bip(false); }
      if (num <= 3 && num > 0) { const k = 1 - ((resta / 1000) % 1); rotulo(g, String(num), vw / 2, vh * 0.38, '#ffd23d', 120 * (k < 0.25 ? volta(k / 0.25) : 1)); }
      else rotulo(g, 'PREPARA…', vw / 2, vh * 0.38, '#ffd23d', 40);
      rotulo(g, this.toque ? 'Esquerda anda (arraste pra cima pula) · ⤒ pula · 🎯 atira (arraste pra mirar)' : 'A/D anda · W/espaço pula (2x no ar) · S desce · mouse mira · clique atira',
        vw / 2, vh * 0.38 + 78, '#fff', 15);
      rotulo(g, 'Mate mais zumbis que os outros · pegue as caixas de arma · combo multiplica os pontos', vw / 2, vh * 0.38 + 100, '#ffe7b0', 13);
    }
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(vw / 2, vh * 0.26);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        const tam = Math.min(60, (vw * 0.85) / Math.max(5, this.banner.txt.length) * 1.7);
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam, k > 0.8 ? (1 - k) / 0.2 : 1);
        g.restore();
      }
    }
  }

  desenharControles(g) {
    const b = this.botoes();
    for (const [r, txt, off] of [[b.sair, '✕', false], [b.efeitos, '🔊', som.semEfeitos], [b.musica, '🎵', som.semMusica]]) {
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.font = `${Math.round(r.w / 2.1)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = off ? 0.35 : 1; g.fillStyle = '#fff'; g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1); g.globalAlpha = 1;
      if (off) { g.strokeStyle = '#ff4646'; g.lineWidth = 2; g.beginPath(); g.moveTo(r.x + 6, r.y + r.h - 6); g.lineTo(r.x + r.w - 6, r.y + 6); g.stroke(); }
    }
    if (!this.toque || this.encerrado) return;
    const mover = [...this.toques.values()].find((t) => t.tipo === 'mover');
    const jx = mover?.x0 ?? b.joy.x, jy = mover?.y0 ?? b.joy.y;
    g.save();
    g.globalAlpha = mover ? 0.7 : 0.22;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(jx, jy, b.joy.r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (mover) {
      const dx = mover.x - mover.x0, dy = mover.y - mover.y0, d = Math.hypot(dx, dy), f = Math.min(1, b.joy.r / Math.max(1, d)) * 0.6;
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(jx + dx * f, jy + dy * f, b.joy.r * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    const mirar = [...this.toques.values()].find((t) => t.tipo === 'mirar');
    g.save();
    g.globalAlpha = mirar ? 0.75 : 0.3;
    g.fillStyle = '#b3121a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(b.fogo.x, b.fogo.y, b.fogo.r * (mirar ? 1.08 : 1), 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${b.fogo.r * 0.55}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText('🎯', b.fogo.x, b.fogo.y + 2);
    if (mirar) {
      const dx = mirar.x - mirar.x0, dy = mirar.y - mirar.y0, f = Math.min(1, b.fogo.r / Math.max(1, Math.hypot(dx, dy))) * 0.7;
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(b.fogo.x + dx * f, b.fogo.y + dy * f, b.fogo.r * 0.28, 0, Math.PI * 2); g.fill();
    }
    const pulo = [...this.toques.values()].some((t) => t.tipo === 'pulo');
    g.globalAlpha = pulo ? 0.75 : 0.3;
    g.fillStyle = '#2a7be0'; g.beginPath(); g.arc(b.pulo.x, b.pulo.y, b.pulo.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `900 ${b.pulo.r * 0.85}px system-ui, sans-serif`; g.fillText('⤒', b.pulo.x, b.pulo.y + 2);
    g.restore();
    g.textBaseline = 'alphabetic';
  }
}

function rotulo(g, txt, x, y, cor, tam, alfa = 1) {
  if (tam < 1) return;
  g.save();
  g.globalAlpha *= Math.max(0, alfa);
  g.font = `900 ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, tam / 5); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
  g.strokeText(txt, x, y); g.fillStyle = cor; g.fillText(txt, x, y);
  g.restore();
}
