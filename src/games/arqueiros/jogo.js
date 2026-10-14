import { ABATES_VITORIA, ARCO, COBERTURAS, ITENS, LARGURA, ALTURA, PLATAFORMAS, TEMPO_PARTIDA, VIDA, H, AGACHADO, altura, bocaDoArco, mover } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles de Arqueiros do Céu (canvas 2D). A rede, a
 * previsão do próprio arqueiro, a proteção de conexão e a tela girada no
 * celular em pé são as de Galinhas Psicopatas (games/galinhas/jogo.js).
 *
 * O que é daqui:
 *  - arqueiro da folha: parado, puxando a corda (2 quadros pela carga),
 *    soltando, correndo, pulando, agachado, deitado (o quadro girado, de barriga
 *    pra cima com o arco pro alto) e morrendo; o corpo inclina com a
 *    mira e a flecha encaixada aponta pra onde vai;
 *  - mira com a curva da flecha (pontilhada) e o anel de carga;
 *  - flechas cravam: em quem levou (ficam presas no corpo até renascer,
 *    viram de lado com ele e caem junto no corpo), nas coberturas e na grama
 *    (tremem ao cravar e ficam um tempo);
 *  - sangue: jorro no acerto, pingando de quem está ferido e manchas na
 *    grama; headshot arranca o elmo, que sai girando;
 *  - flecha de fogo explode (quadros da folha + tremor), a de gelo estilhaça
 *    e deixa o alvo azulado; poeira no pulo e no pouso.
 */

const A = import.meta.glob('../../assets/arqueiros/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const ESC = 0.56;               // escala dos quadros da folha
const TOM = { azul: '#3ba0ff', vermelho: '#ff4a3a', verde: '#4be05a', roxo: '#b26bff' };
const NOME = { azul: 'Celeste', vermelho: 'Brasa', verde: 'Musgo', roxo: 'Sombra' };
/** Quadros de cada animação (índices da folha, ver scripts/preparar-arqueiros.py). `x`: onde fica o corpo no quadro (fração da largura). */
const ANIM_AZUL = { parado: [0], puxa: [1, 2], solta: [4, 6], corre: [9, 10, 11, 10], pulo: [5], agacha: [11], morto: ['morto-0', 'morto-1'], x: 0.4 };
const ANIM = { azul: ANIM_AZUL, verde: ANIM_AZUL, roxo: ANIM_AZUL,
  vermelho: { parado: [5], puxa: [0, 1], solta: [2, 3], corre: [9, 10, 6, 10], pulo: [11], agacha: [11], morto: ['morto-0', 'morto-1'], x: 0.42 } };
const ELMO = { azul: 'elmo-azul', vermelho: 'elmo-vermelho', verde: 'elmo-verde', roxo: 'elmo-roxo' };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
/** Onde cai algo que desce em x: a grama de uma ilha (ou o abismo). */
function chaoEm(x, y) {
  let melhor = Infinity;
  for (const [x0, x1, top] of PLATAFORMAS) if (x >= x0 && x <= x1 && top >= y - 2 && top < melhor) melhor = top;
  for (const [x0, y0, x1] of COBERTURAS) if (x >= x0 && x <= x1 && y0 >= y - 2 && y0 < melhor) melhor = y0;
  return melhor;
}
const SERIE = { 3: 'TRÊS SEGUIDAS!', 5: 'IMPARÁVEL!', 7: 'OLHO DE ÁGUIA!', 10: 'LENDA DO CÉU!' };

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string, avatar?: string|null, cor?: string}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.quadros = [];
    this.desvio = null;
    this.eventosPendentes = [];
    this.vistos = 0;
    this.cravadas = [];            // flechas no cenário
    this.presas = [[], [], [], []]; // flechas presas em cada arqueiro (dx, dy no lado em que ele olhava)
    this.corpos = [];
    this.elmos = [];
    this.particulas = [];
    this.manchas = [];
    this.efeitos = [];
    this.textos = [];
    this.feed = [];
    this.anuncio = null;
    this.soltou = [0, 0, 0, 0];
    this.passos = [0, 0, 0, 0];
    this.chaoAntes = [true, true, true, true];
    this.serie = [0, 0, 0, 0];
    this.dor = [0, 0, 0, 0];
    this.tremor = 0;
    this.ferido = 0;
    this.acertei = 0;
    this.ultimoBip = null;
    this.brasas = Array.from({ length: 26 }, () => this.novaBrasa(Math.random() * ALTURA));
    this.nuvens = Array.from({ length: 5 }, (_, k) => ({ x: Math.random() * LARGURA, y: 60 + k * 70, v: 6 + Math.random() * 8, s: 0.6 + Math.random() * 0.8 }));

    this.teclas = new Set();
    this.puloPendente = false;
    this.mouseV = null;
    this.mousePuxa = false;
    this.toques = new Map();
    this.mira = op.assento % 2 ? Math.PI : 0;
    // celular: dedo grosso ou tela de toque (alguns aparelhos respondem errado a uma das duas)
    this.celular = matchMedia('(pointer: coarse)').matches;   // aparelho de dedo: nunca sai do modo toque
    this.toque = this.celular || navigator.maxTouchPoints > 0;
    this.encerrado = false;
    this.chegou = performance.now();
    this.cargaLocal = 0;
    this.deitar = false;

    this.cmdSeq = 0;
    this.pendentes = [];
    this.acumulado = 0;
    this.ultimoQuadro = null;
    this.pred = null;
    this.predAntes = null;
    this.corr = { x: 0, y: 0 };

    this.ligar();
    this.redimensionar();
    this.rodando = true;
    // um erro num quadro não pode congelar o jogo: loga e segue
    const quadro = () => { if (!this.rodando) return; try { this.desenhar(); } catch (e) { console.error(e); } requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() {
    this.rodando = false;
    this.desligar();
    som.puxar(0);
    window.speechSynthesis?.cancel();
  }

  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? ['azul', 'vermelho', 'verde', 'roxo'][i]; }
  tom(i) { return TOM[this.cor(i)]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? NOME[this.cor(i)] ?? '?').split(' ')[0]; }
  get ultimo() { return this.quadros[this.quadros.length - 1] ?? null; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    if (this.encerrado) return;
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    this.reconciliar(e);
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.quadros.push(e);
    if (this.quadros.length > 30) this.quadros.shift();
    for (const ev of e.ev ?? []) {
      if (ev.id > this.vistos) { this.vistos = ev.id; this.eventosPendentes.push({ ...ev, quando: e.agora }); }
    }
    if (e.fim) this.encerrar();
  }

  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.toques.clear(); this.teclas.clear();
    this.mousePuxa = false; this.puloPendente = false;
    this.pendentes = [];
    som.puxar(0);
  }

  mundo(e, eu) {
    return { arqueiros: e.r.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1] })) };
  }

  reconciliar(e) {
    const m = e.r[this.eu];
    const ack = m[6] ?? 0;
    this.pendentes = this.pendentes.filter((c) => c.s > ack);
    const pos = { x: m[0], y: m[1], vy: m[7], kx: m[8], chao: !!m[9], pulos: m[10], agachado: !!m[11], deitado: !!m[18], dir: m[13], geladoAte: m[17] ? 1 : 0, movendo: false };
    if (e.fase === 'jogo' && m[4]) {
      const w = this.mundo(e, pos);
      for (const c of this.pendentes) mover(w, this.eu, c, c.dt / 1000, 0);
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
    const arq = b.r.map((rb, j) => {
      const ra = a.r[j] ?? rb;
      const kk = Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) > 120 ? 1 : k;
      return { x: lerp(ra[0], rb[0], kk), y: lerp(ra[1], rb[1], kk), ang: lerpAng(ra[2], rb[2], kk), vida: rb[3], vivo: !!rb[4], movendo: !!rb[5],
        vy: rb[7], chao: !!rb[9], agachado: !!rb[11], protegido: !!rb[12], dir: rb[13], carga: rb[14], especial: rb[15], nEspecial: rb[16], gelado: !!rb[17], deitado: !!rb[18] };
    });
    const extra = Math.max(0, t - b.agora) / 1000;
    const flechas = b.f.map(([id, x, y, ang, dono, tipo]) => {
      const fa = a.f.find((z) => z[0] === id);
      if (fa && k < 1) return { id, x: lerp(fa[1], x, k), y: lerp(fa[2], y, k), ang: lerpAng(fa[3], ang, k), dono, tipo };
      const v = 900;   // passou do último quadro: segue reto um pouquinho
      return { id, x: x + Math.cos(ang) * v * Math.min(extra, 0.06), y: y + Math.sin(ang) * v * Math.min(extra, 0.06), ang, dono, tipo };
    });
    return { arq, flechas, pegos: new Set(b.pegos ?? []) };
  }

  // ----------------------------------------------------------- eventos

  tratarEventos(t, est) {
    const agora = performance.now();
    while (this.eventosPendentes.length && this.eventosPendentes[0].quando <= t) {
      const e = this.eventosPendentes.shift();
      const longe = t - e.quando > 1500;
      if (e.tipo === 'fogo') { this.anunciar('ATIREM!', '#ffd23d'); som.bip(true); som.fala('Atirem!'); }
      if (longe) {
        if (e.tipo === 'abate') this.presas[e.alvo] = [];
        if (e.tipo === 'renasce') this.presas[e.i] = [];
        continue;
      }
      if (e.tipo === 'tiro') {
        this.soltou[e.de] = agora;
        som.soltar(e.carga, e.de === this.eu ? 1 : 0.5);
        if (e.de === this.eu) this.cargaLocal = 0;
        for (let k = 0; k < 5; k++) this.particulas.push({ tipo: 'faisca', x: e.x, y: e.y, vx: Math.cos(e.ang) * 120 + (Math.random() - 0.5) * 80, vy: Math.sin(e.ang) * 120 + (Math.random() - 0.5) * 80, vida: 0.25, idade: 0, cor: this.tom(e.de) });
      }
      if (e.tipo === 'cravou') {
        this.cravar(e.x, e.y, e.ang, e.flecha, e.de);
        som.tunc(e.de === this.eu ? 1 : 0.5);
        const madeira = e.onde !== 'chao';
        for (let k = 0; k < (madeira ? 6 : 8); k++) this.particulas.push({ tipo: madeira ? 'lasca' : 'terra', x: e.x, y: e.y, vx: -Math.cos(e.ang) * 120 + (Math.random() - 0.5) * 140, vy: -Math.random() * 200, vida: 0.6, idade: 0, rot: Math.random() * 6 });
        if (e.flecha === 'g') this.gelo(e.x, e.y);
      }
      if (e.tipo === 'acerto') this.acerto(e, agora);
      if (e.tipo === 'abate') this.abate(e, est, agora);
      if (e.tipo === 'explosao') {
        this.efeitos.push({ tipo: 'explosao', x: e.x, y: e.y, t0: agora });
        this.tremor = Math.max(this.tremor, 14);
        som.explosao();
        for (let k = 0; k < 18; k++) { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260; this.particulas.push({ tipo: 'fogo', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vida: 0.5 + Math.random() * 0.3, idade: 0 }); }
        for (let k = 0; k < 6; k++) this.particulas.push({ tipo: 'fumaca', x: e.x + (Math.random() - 0.5) * 40, y: e.y, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 40, r: 14, vida: 1.2, idade: 0 });
        this.manchas.push({ x: e.x, y: chaoEm(e.x, e.y - 30), r: 34, cor: 'rgba(20,10,5,.55)', t0: agora });
      }
      if (e.tipo === 'pega') {
        som.pega();
        this.texto(e.x, e.y - 10, e.item === 'fogo' ? '🔥 FLECHAS DE FOGO ×3' : '❄️ FLECHAS DE GELO ×3', e.item === 'fogo' ? '#ff9a2a' : '#8fe0ff', 18);
        for (let k = 0; k < 14; k++) this.particulas.push({ tipo: 'faisca', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260, vida: 0.5, idade: 0, cor: e.item === 'fogo' ? '#ffb040' : '#9fe8ff' });
      }
      if (e.tipo === 'pulo') {
        som.pulo(e.duplo);
        this.efeitos.push({ tipo: 'poeira', x: e.x, y: e.y, t0: agora, s: e.duplo ? 0.5 : 0.7 });
      }
      if (e.tipo === 'renasce') {
        this.presas[e.i] = [];
        this.efeitos.push({ tipo: 'anel', x: e.x, y: e.y - 36, t0: agora, cor: this.tom(e.i) });
        if (e.i === this.eu) som.renasce();
      }
    }
  }

  cravar(x, y, ang, tipo, dono) {
    this.cravadas.push({ x, y, ang, tipo, dono, t0: performance.now() });
    if (this.cravadas.length > 70) this.cravadas.shift();
  }

  gelo(x, y) {
    this.efeitos.push({ tipo: 'gelo', x, y, t0: performance.now() });
    som.gelo();
    for (let k = 0; k < 12; k++) this.particulas.push({ tipo: 'faisca', x, y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, vida: 0.5, idade: 0, cor: '#bff0ff' });
  }

  acerto(e, agora) {
    const alvo = e.alvo, eu = e.alvo === this.eu, meu = e.de === this.eu;
    const dir = this.ultimo?.r?.[alvo]?.[13] ?? 1;
    const deitado = !!this.ultimo?.r?.[alvo]?.[18];   // a posição (dx, dy) é do corpo como estava: em pé ou deitado
    if (e.ang != null) this.presas[alvo].push({ dx: e.dx, dy: e.dy, ang: e.ang, dir, deitado, tipo: e.flecha, de: e.de, t0: agora });
    if (this.presas[alvo].length > 12) this.presas[alvo].shift();
    this.dor[alvo] = agora;
    const forte = e.cabeca ? 2 : 1;
    // jorro de sangue pra onde a flecha ia
    const a = e.ang ?? (e.x < (this.ultimo?.r?.[alvo]?.[0] ?? e.x) ? 0 : Math.PI);
    for (let k = 0; k < 10 * forte + Math.min(10, e.dano / 4); k++) {
      const d = a + (Math.random() - 0.5) * 1.6, v = 80 + Math.random() * 260 * forte;
      this.particulas.push({ tipo: 'sangue', x: e.x, y: e.y, vx: Math.cos(d) * v, vy: Math.sin(d) * v - 60, vida: 1.2, idade: 0, r: 1.5 + Math.random() * 2.5 });
    }
    som.carne(eu || meu ? 1 : 0.5);
    if (e.flecha === 'g') this.gelo(e.x, e.y);
    this.texto(e.x, e.y - 12, e.cabeca ? `${e.dano}!` : String(e.dano), e.cabeca ? '#ffd23d' : '#fff', e.cabeca ? 26 : 18);
    if (e.cabeca) {
      som.cabeca();
      this.texto(e.x, e.y - 40, 'NA CABEÇA!', '#ffd23d', 22);
    }
    if (eu) { this.ferido = agora; this.tremor = Math.max(this.tremor, 5 + e.dano / 8); som.grito(1.2, 0.6); }
    if (meu) this.acertei = agora;
  }

  abate(e, est, agora) {
    const i = e.alvo;
    const cor = this.cor(i);
    const dir = e.dir ?? this.ultimo?.r?.[i]?.[13] ?? 1;
    if (!e.saiu) {
      const presas = this.presas[i].map((f) => {
        // a flecha vai junto pro corpo deitado: o comprimento (dy) vira a horizontal
        const lado = f.dir === dir ? 1 : -1;
        return { dx: -f.dy * dir * 0.85, dy: -8 + (f.dx * lado) * 0.25, ang: (lado === 1 ? f.ang : Math.PI - f.ang) + dir * Math.PI / 2, tipo: f.tipo, de: f.de };
      });
      this.corpos.push({ i, cor, x: e.x, y: e.y - 20, vx: dir * (e.caiu ? 0 : -60), vy: e.caiu ? 200 : -160, dir: -dir, t0: agora, chao: false, presas, caiu: !!e.caiu });
      if (e.cabeca && ELMO[cor]) this.elmos.push({ nome: ELMO[cor], x: e.x, y: e.y - H, vx: -dir * (120 + Math.random() * 120), vy: -520, rot: 0, vr: (Math.random() < 0.5 ? -1 : 1) * 14, t0: agora });
      if (!e.caiu) for (let k = 0; k < 18; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 120 + Math.random() * 280;
        this.particulas.push({ tipo: 'sangue', x: e.x, y: e.y - 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 1.4, idade: 0, r: 2 + Math.random() * 3 });
      }
      som.grito(cor === 'vermelho' ? 0.8 : 1, i === this.eu ? 1 : 0.6);
    }
    this.presas[i] = [];
    this.serie[i] = 0;
    const quem = this.nome(i);
    const txt = e.saiu ? `${quem} saiu`
      : e.de != null ? `${this.nome(e.de)} ${e.caiu ? 'derrubou' : e.cabeca ? 'acertou a cabeça de' : e.fogo ? 'explodiu' : 'flechou'} ${quem}`
      : `${quem} caiu no abismo`;
    this.feed.push({ txt, t0: agora, cor: this.tom(e.de ?? i) });
    if (this.feed.length > 4) this.feed.shift();
    if (e.saiu) return;
    if (i === this.eu) {
      this.tremor = 16;
      this.anunciar(e.caiu ? 'CAIU!' : e.cabeca ? 'NA CABEÇA…' : 'ABATIDO!', '#ff4a3a');
    }
    if (e.de != null && e.de !== i) {
      const n = ++this.serie[e.de];
      if (e.de === this.eu) {
        this.tremor = Math.max(this.tremor, 6);
        som.fanfarra();
        const s = SERIE[n];
        this.anunciar(s ?? (e.cabeca ? 'NA CABEÇA!' : `FLECHOU ${quem.toUpperCase()}!`), '#ffd23d');
        if (s) som.fala(s.toLowerCase());
        else if (e.cabeca) som.fala('Na cabeça!');
      }
    }
  }

  anunciar(txt, cor) { this.anuncio = { txt, cor, t0: performance.now() }; }
  texto(x, y, txt, cor, tam = 18) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now() }); }
  novaBrasa(y = ALTURA + 10) { return { x: Math.random() * LARGURA, y, vy: -(12 + Math.random() * 22), f: Math.random() * 6, r: 1 + Math.random() * 1.6 }; }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat && (k === 'w' || k === ' ' || k === 'arrowup')) this.puloPendente = true;
        if (!e.repeat && k === 'c') this.deitar = !this.deitar;
        this.teclas.add(k);
        destravar();
      },
      teclaSobe: (e) => this.teclas.delete(e.key.toLowerCase()),
      desce: (e) => this.ponteiroDesce(e),
      move: (e) => this.ponteiroMove(e),
      sobe: (e) => this.ponteiroSobe(e),
      resize: () => this.redimensionar(),
      blur: () => { this.teclas.clear(); this.mousePuxa = false; this.toques.clear(); },
      menu: (e) => e.preventDefault(),
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
  }

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
  paraMundo(v) { return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc }; }

  botoes() {
    const s = Math.min(this.vw, this.vh), m = 12;
    if (!this.toque) return { sair: { x: 14, y: this.vh - 52, w: 40, h: 40 }, mudo: { x: 62, y: this.vh - 52, w: 40, h: 40 } };
    const joy = { x: m + s * 0.13, y: this.vh - m - s * 0.13, r: s * 0.13 };
    const pr = s * 0.08;
    return {
      sair: { x: 8, y: joy.y - joy.r - 84, w: 34, h: 34 },
      mudo: { x: 8, y: joy.y - joy.r - 44, w: 34, h: 34 },
      joy,
      pulo: { x: this.vw - m - pr, y: this.vh - m - pr, r: pr },
      deita: { x: this.vw - m - pr, y: this.vh - m - pr * 3.4, r: pr * 0.8 },
    };
  }

  ponteiroDesce(e) {
    destravar();
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') this.toque = true;
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (e.pointerType === 'mouse') {
      this.mouseV = v;
      if (e.button === 0) this.mousePuxa = true;
      if (e.button === 2) this.puloPendente = true;
      return;
    }
    e.preventDefault();
    if (Math.hypot(v.x - b.pulo.x, v.y - b.pulo.y) < b.pulo.r * 1.4) { this.puloPendente = true; return; }
    if (Math.hypot(v.x - b.deita.x, v.y - b.deita.y) < b.deita.r * 1.4) { this.deitar = !this.deitar; return; }
    if (v.x < this.vw * 0.4) {
      this.toques.set(e.pointerId, { tipo: 'mover', x0: v.x, y0: v.y, x: v.x, y: v.y, pulou: false });
      return;
    }
    // lado direito: encostou, começa a puxar; arrasta mirando; soltou, atira
    this.toques.set(e.pointerId, { tipo: 'mirar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  ponteiroMove(e) {
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { this.mouseV = v; if (!this.celular) this.toque = false; return; }
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
    if (e.pointerType === 'mouse') { if (e.button === 0) this.mousePuxa = false; return; }
    this.toques.delete(e.pointerId);
  }

  enviarEntrada(est) {
    if (this.encerrado) return;
    let mx = 0, agacha = false, puxa = this.mousePuxa;
    const k = this.teclas;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('s') || k.has('arrowdown')) agacha = true;
    const meu = est?.arq[this.eu];
    // deitado, pular só levanta; morreu ou caiu da ilha, levanta também
    if (this.deitar && (this.puloPendente || (meu && (!meu.vivo || !meu.chao) && !this.pred?.chao))) { this.deitar = false; this.puloPendente = false; }
    if (this.deitar) agacha = false;
    const peito = meu ? { x: meu.x, y: meu.y - altura(meu) * 0.62 } : null;
    if (peito && this.mouseV && !this.toque) { const m = this.paraMundo(this.mouseV); this.mira = Math.atan2(m.y - peito.y, m.x - peito.x); }
    const r = this.botoes().joy?.r ?? 1;
    for (const t of this.toques.values()) {
      const dx = t.x - t.x0, dy = t.y - t.y0;
      if (t.tipo === 'mover') {
        if (Math.abs(dx) > 8) mx = Math.max(-1, Math.min(1, dx / r));
        if (dy > r * 0.55) agacha = true;
      }
      if (t.tipo === 'mirar') {
        puxa = true;
        if (peito) { const m = this.paraMundo(t); this.mira = Math.atan2(m.y - peito.y, m.x - peito.x); }
      }
    }
    mx = Math.round(mx * 100) / 100;
    const ang = Math.round(this.mira * 100) / 100;
    this.puxando = puxa && !!meu?.vivo;

    const agora = performance.now();
    const passo = this.ultimoQuadro == null ? 0 : agora - this.ultimoQuadro;
    this.acumulado = Math.min(150, this.acumulado + passo);
    this.ultimoQuadro = agora;
    if (this.puxando && this.ultimo?.fase === 'jogo') this.cargaLocal = Math.min(1, this.cargaLocal + passo / 1000 / ARCO.puxar);
    else if (!this.puxando) this.cargaLocal = 0;
    som.puxar(this.puxando ? this.cargaLocal : 0);
    const novos = [];
    const e = this.ultimo;
    while (this.acumulado >= 33) {
      this.acumulado -= 33;
      const c = { s: ++this.cmdSeq, mx, pulo: this.puloPendente, agacha, deita: this.deitar, dt: 33, ang, puxa };
      this.puloPendente = false;
      novos.push(c);
      this.pendentes.push(c);
      if (e && this.pred && e.fase === 'jogo' && this.predVivo) {
        this.predAntes = { x: this.pred.x, y: this.pred.y };
        mover(this.mundo(e, this.pred), this.eu, c, 0.033, 0);
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
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.esc = Math.min(this.vw / LARGURA, this.vh / ALTURA);
    this.ox = (this.vw - LARGURA * this.esc) / 2;
    this.oy = (this.vh - ALTURA * this.esc) / 2;
  }

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, h, base = false } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return;
    const g = this.ctx;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    if (virar) g.scale(-1, 1);
    g.globalAlpha *= alfa;
    g.drawImage(im, -w / 2, base ? -hh : -hh / 2, w, hh);
    g.restore();
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.ultimoDesenho ?? agora)) / 1000);
    this.ultimoDesenho = agora;
    const tServ = this.desvio == null ? 0 : agora + this.desvio - ATRASO;
    const est = this.interpolar(tServ);
    this.tratarEventos(tServ, est);
    if (!this.encerrado && !this.travou && this.ultimo?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    this.enviarEntrada(est);
    if (est && this.pred && this.predVivo) {
      this.corr.x *= 0.82; this.corr.y *= 0.82;
      const r = est.arq[this.eu];
      const f = Math.min(1, this.acumulado / 33);
      const ax = this.predAntes ? lerp(this.predAntes.x, this.pred.x, f) : this.pred.x;
      const ay = this.predAntes ? lerp(this.predAntes.y, this.pred.y, f) : this.pred.y;
      Object.assign(r, { x: ax + this.corr.x, y: ay + this.corr.y, ang: this.mira, vy: this.pred.vy, chao: this.pred.chao, agachado: this.pred.agachado, deitado: this.pred.deitado,
        movendo: this.pred.movendo, dir: this.puxando ? (Math.cos(this.mira) >= 0 ? 1 : -1) : this.pred.dir, carga: this.puxando ? this.cargaLocal : 0 });
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#140a18';
    g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }

    g.save();
    this.tremor *= 0.86;
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharCeu(dt, agora);
    this.desenharManchas(agora);
    this.desenharCenario(est, agora);
    this.desenharCravadas(agora);
    if (est) {
      this.desenharCorpos(dt, agora);
      for (const [i, r] of est.arq.entries()) if (r.vivo && !this.ultimo?.fora?.[i]) this.desenharArqueiro(i, r, agora);
      for (const f of est.flechas) this.desenharFlecha(f);
      const meu = est.arq[this.eu];
      if (meu?.vivo && this.puxando && this.ultimo?.fase === 'jogo') this.desenharCurva(meu, agora);
    }
    this.desenharElmos(dt, agora);
    this.desenharParticulas(dt, agora);
    this.desenharEfeitos(agora);
    if (est) for (const [i, r] of est.arq.entries()) if (r.vivo && !this.ultimo?.fora?.[i]) this.desenharPlaca(i, r, agora);
    this.desenharTextos(agora);
    g.restore();

    this.desenharHud(agora, est);
    this.desenharControles(est);
  }

  desenharCeu(dt, agora) {
    const g = this.ctx;
    if (pronto(IMG.fundo)) g.drawImage(IMG.fundo, 0, 0, LARGURA, ALTURA);
    // nuvenzinhas passando na frente das ilhas longe
    g.save();
    for (const n of this.nuvens) {
      n.x += n.v * dt;
      if (n.x > LARGURA + 160) n.x = -160;
      g.globalAlpha = 0.18;
      g.fillStyle = '#ffe6dc';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(n.x + k * 34 * n.s, n.y + Math.sin(k * 2) * 8, 40 * n.s, 16 * n.s, 0, 0, Math.PI * 2); g.fill(); }
    }
    // tochas: brilho tremendo
    g.globalCompositeOperation = 'lighter';
    for (const [x, y] of [[325, 246], [955, 246]]) {
      const f = 0.8 + Math.sin(agora / 60 + x) * 0.1 + Math.sin(agora / 23 + x) * 0.06;
      const gr = g.createRadialGradient(x, y, 0, x, y, 70 * f);
      gr.addColorStop(0, 'rgba(255,170,60,.55)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - 80, y - 80, 160, 160);
    }
    // brasas subindo do abismo
    for (const [k, b] of this.brasas.entries()) {
      b.y += b.vy * dt; b.f += dt * 2;
      if (b.y < -10) this.brasas[k] = this.novaBrasa();
      g.globalAlpha = 0.4 + 0.4 * Math.sin(b.f * 3);
      g.fillStyle = '#ffb060';
      g.beginPath(); g.arc(b.x + Math.sin(b.f) * 12, b.y, b.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  desenharManchas(agora) {
    const g = this.ctx;
    // ponytail: teto de 220 manchas (as mais velhas somem); celular fraco sente centenas de elipses por quadro
    this.manchas = this.manchas.filter((m) => agora - m.t0 < 25_000).slice(-220);
    for (const m of this.manchas) {
      g.globalAlpha = Math.min(1, (25_000 - (agora - m.t0)) / 3000);
      g.fillStyle = m.cor;
      g.beginPath(); g.ellipse(m.x, m.y + 1, m.r, m.r * 0.28, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  desenharCenario(est, agora) {
    for (const [x0, y0, x1, y1, nome] of COBERTURAS) {
      const im = IMG[nome];
      if (!pronto(im)) continue;
      // a arte é mais larga que a caixa (paliçada, alvo): centra e assenta no chão
      const w = nome === 'palicada' ? (x1 - x0) * 1.6 : nome === 'alvo' ? (x1 - x0) * 1.9 : (x1 - x0) * 1.15;
      this.sprite(nome, (x0 + x1) / 2, y1 + 3, w, { base: true, h: Math.max(y1 - y0 + 6, (w * im.naturalHeight) / im.naturalWidth) });
    }
    for (const it of ITENS) {
      if (est?.pegos.has(it.id)) continue;
      const g = this.ctx;
      const bob = Math.sin(agora / 300 + it.x) * 4;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(it.x, it.y - 26 + bob, 0, it.x, it.y - 26 + bob, 40);
      gr.addColorStop(0, it.tipo === 'fogo' ? 'rgba(255,140,40,.6)' : 'rgba(120,220,255,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(it.x - 40, it.y - 66 + bob, 80, 80);
      g.restore();
      this.sprite(`aljava-${it.tipo}`, it.x, it.y - 26 + bob, 26, { rot: Math.sin(agora / 500) * 0.15 });
      if (Math.random() < 0.15) this.particulas.push({ tipo: 'faisca', x: it.x + (Math.random() - 0.5) * 20, y: it.y - 30, vx: 0, vy: -40, vida: 0.6, idade: 0, cor: it.tipo === 'fogo' ? '#ffb040' : '#bff0ff' });
    }
  }

  /** Flecha com a ponta em (x, y), apontando `ang` (a ponta entra `fundo` px). */
  flechaEm(x, y, ang, tipo, dono, { comp = 46, fundo = 0, alfa = 1 } = {}) {
    const nome = tipo === 'f' ? 'flecha-fogo' : tipo === 'g' ? 'flecha-gelo' : `flecha-${this.cor(dono)}`;
    const im = IMG[nome];
    if (!pronto(im)) return;
    const g = this.ctx;
    const h = (comp * im.naturalHeight) / im.naturalWidth;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.globalAlpha *= alfa;
    g.drawImage(im, -comp + fundo, -h / 2, comp, h);
    g.restore();
  }

  desenharCravadas(agora) {
    this.cravadas = this.cravadas.filter((c) => agora - c.t0 < 9000);
    for (const c of this.cravadas) {
      const k = (agora - c.t0) / 1000;
      const treme = k < 0.4 ? Math.sin(k * 70) * 0.12 * (1 - k / 0.4) : 0;   // a flecha vibra ao cravar
      this.flechaEm(c.x, c.y, c.ang + treme, c.tipo, c.dono, { fundo: 10, alfa: Math.min(1, (9 - k) / 1.5) });
    }
  }

  desenharFlecha(f) {
    const g = this.ctx;
    if (f.y < -8) {
      // lá em cima, fora da tela: setinha na borda (subindo ou já caindo), mais forte quanto mais perto
      const caindo = Math.sin(f.ang) > 0;
      g.save();
      g.globalAlpha = Math.max(0.35, 1 - -f.y / 1200);
      g.fillStyle = f.tipo === 'f' ? '#ff9a2a' : f.tipo === 'g' ? '#9fe8ff' : this.tom(f.dono);
      g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2;
      g.beginPath();
      if (caindo) { g.moveTo(f.x, 20); g.lineTo(f.x - 7, 8); g.lineTo(f.x + 7, 8); }
      else { g.moveTo(f.x, 6); g.lineTo(f.x - 7, 18); g.lineTo(f.x + 7, 18); }
      g.closePath(); g.fill(); g.stroke();
      g.restore();
      return;
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = f.tipo === 'f' ? 'rgba(255,140,40,.55)' : f.tipo === 'g' ? 'rgba(150,230,255,.55)' : 'rgba(255,255,255,.3)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(f.x - Math.cos(f.ang) * 40, f.y - Math.sin(f.ang) * 40); g.lineTo(f.x - Math.cos(f.ang) * 90, f.y - Math.sin(f.ang) * 90); g.stroke();
    g.restore();
    this.flechaEm(f.x, f.y, f.ang, f.tipo, f.dono);
    if (f.tipo === 'f' && Math.random() < 0.7) this.particulas.push({ tipo: 'fogo', x: f.x, y: f.y, vx: (Math.random() - 0.5) * 30, vy: -20, vida: 0.35, idade: 0 });
  }

  /** A curva que a flecha vai fazer (pontilhada), com a carga de agora. */
  desenharCurva(r, agora) {
    const g = this.ctx;
    const k = Math.min(1, r.carga);
    const [ox, oy] = bocaDoArco(r);
    const vel = lerp(ARCO.vel[0], ARCO.vel[1], k);
    let x = ox, y = oy, vx = Math.cos(r.ang) * vel, vy = Math.sin(r.ang) * vel;
    g.save();
    g.fillStyle = k >= 1 ? '#ffd23d' : '#fff';
    const pontos = 8 + Math.round(k * 14);
    for (let n = 0; n < pontos; n++) {
      for (let s = 0; s < 3; s++) { vy += ARCO.gravidade * 0.012; x += vx * 0.012; y += vy * 0.012; }
      g.globalAlpha = (1 - n / pontos) * 0.8;
      g.beginPath(); g.arc(x, y, n === 0 ? 2.5 : 2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    if (k >= 1 && Math.floor(agora / 120) % 2) { g.save(); g.globalCompositeOperation = 'lighter'; this.sprite('brilho', ox, oy, 16); g.restore(); }
  }

  quadro(i, r, agora) {
    const anim = ANIM[this.cor(i)];
    if (r.carga > 0) return anim.puxa[r.carga < 0.5 ? 0 : 1];
    if (agora - this.soltou[i] < 220) return anim.solta[agora - this.soltou[i] < 110 ? 0 : 1];
    if (r.deitado) return anim.parado[0];
    if (r.agachado) return anim.agacha[0];
    if (!r.chao) return anim.pulo[0];
    if (r.movendo) return anim.corre[Math.floor(this.passos[i] / 26) % anim.corre.length];
    return anim.parado[0];
  }

  desenharArqueiro(i, r, agora) {
    const g = this.ctx;
    const cor = this.cor(i);
    const anim = ANIM[cor];
    // passos (pela distância) e poeira ao pousar
    if (r.movendo && r.chao) this.passos[i] += Math.abs(r.x - (this.xAntes?.[i] ?? r.x)) + 0.6;
    (this.xAntes ??= [])[i] = r.x;
    if (r.chao && !this.chaoAntes[i]) this.efeitos.push({ tipo: 'poeira', x: r.x, y: r.y, t0: agora, s: 0.55 });
    this.chaoAntes[i] = r.chao;

    const q = this.quadro(i, r, agora);
    const im = IMG[`${cor}-${q}`];
    if (!pronto(im)) return;
    const w = im.naturalWidth * ESC, h = im.naturalHeight * ESC * (r.agachado ? 0.78 : 1);
    const dir = r.dir;
    // inclina o corpo com a mira enquanto puxa (o quadro só tem a mira reta)
    const mira = dir === 1 ? r.ang : Math.atan2(Math.sin(Math.PI - r.ang), Math.cos(Math.PI - r.ang));
    const incl = r.carga > 0 ? Math.max(-0.55, Math.min(0.55, mira)) * 0.45 : 0;
    const respira = r.movendo || !r.chao ? 0 : Math.sin(agora / 380 + i) * 0.015;
    const dor = agora - this.dor[i] < 160 ? (1 - (agora - this.dor[i]) / 160) * 0.12 : 0;

    g.save();
    if (r.protegido) g.globalAlpha = 0.45 + 0.35 * Math.sin(agora / 50);
    // sombra
    const chao = chaoEm(r.x, r.y);
    if (chao < ALTURA) {
      const alto = Math.min(1, (chao - r.y) / 200);
      g.fillStyle = `rgba(0,0,0,${0.3 * (1 - alto)})`;
      g.beginPath(); g.ellipse(r.x, chao, 22 * (1 - alto * 0.5), 5, 0, 0, Math.PI * 2); g.fill();
    }
    g.translate(r.x, r.y);
    g.scale(dir, 1);
    if (r.deitado) {
      // de barriga pra cima: a cabeça pra frente, o arco apontando pro alto; rastejando, o corpo serpenteia
      const rasteja = r.movendo ? Math.sin(agora / 90) * 0.05 : 0;
      g.translate(-h * 0.5, -w * anim.x * 0.55 + (r.movendo ? Math.abs(Math.sin(agora / 90)) * -2 : 0));
      g.scale(-1, 1);
      g.rotate(-Math.PI / 2 + rasteja - dor);
    } else {
      g.rotate(-dor);
      g.translate(0, -h * 0.55);
      g.rotate(incl);
      g.translate(0, h * 0.55);
      g.scale(1 + respira, 1 - respira);
    }
    g.drawImage(im, -w * anim.x, -h + 2, w, h);
    if (r.gelado) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(140,220,255,.45)';
      g.fillRect(-w * anim.x, -h, w, h);
    }
    g.restore();
    if (r.gelado && Math.random() < 0.3) this.particulas.push({ tipo: 'faisca', x: r.x + (Math.random() - 0.5) * 30, y: r.y - Math.random() * 70, vx: 0, vy: 20, vida: 0.5, idade: 0, cor: '#dff6ff' });

    // flecha encaixada no arco, apontando pra mira, recuando com a carga
    if (r.carga > 0) {
      const [bx, by] = bocaDoArco(r);
      const tipo = r.especial === 'fogo' ? 'f' : r.especial === 'gelo' ? 'g' : 'n';
      this.flechaEm(bx + Math.cos(r.ang) * 8, by + Math.sin(r.ang) * 8, r.ang, tipo, i, { comp: 44, fundo: -Math.min(1, r.carga) * 14 });
      if (r.carga >= 1) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + 0.3 * Math.sin(agora / 40); this.sprite('brilho', bx, by, 22); g.restore(); }
    }

    // flechas presas no corpo: se ele virou, a flecha vira junto
    for (const f of this.presas[i]) {
      const lado = f.dir === dir ? 1 : -1;
      const k = (agora - f.t0) / 1000;
      const treme = k < 0.3 ? Math.sin(k * 80) * 0.15 * (1 - k / 0.3) : 0;
      const a = lado === 1 ? f.ang : Math.PI - f.ang;   // no lado em que ele olha agora
      // ângulo no "lado de frente" (como se olhasse pra direita), pra girar junto com o corpo
      const af = dir === 1 ? a : Math.PI - a;
      const volta = (x) => (dir === 1 ? x : Math.PI - x);
      const fd = f.dx * f.dir;   // o dx no lado de frente, como estava na hora do acerto
      // deitar é girar + espelhar o quadro, que é a própria inversa: a mesma conta vale pros dois sentidos
      const gira = (x) => Math.atan2(-Math.cos(x), -Math.sin(x));
      if (r.deitado && !f.deitado) {
        // levou em pé, agora deitado: a altura vira o comprimento (cabeça na frente), o de frente vira o de cima
        const fx = -h * 0.5 + (-f.dy / H) * h, fy = -fd * 0.6 - 6;
        this.flechaEm(r.x + fx * dir, r.y + fy, volta(gira(af)) + treme, f.tipo, f.de, { comp: 40, fundo: 12 });
      } else if (!r.deitado && f.deitado) {
        // levou deitado, agora em pé: a conta ao contrário
        const dy = -(fd + h * 0.5) * (H / h), dx = -(f.dy + 6) / 0.6;
        this.flechaEm(r.x + dx * dir, r.y + dy, volta(gira(af)) + treme, f.tipo, f.de, { comp: 40, fundo: 12 });
      } else {
        const fy = r.agachado ? f.dy * AGACHADO : f.dy;
        this.flechaEm(r.x + f.dx * lado, r.y + fy, a + treme, f.tipo, f.de, { comp: 40, fundo: 12 });
      }
    }
    // ferido pinga sangue
    if (r.vida < VIDA * 0.4 && Math.random() < 0.12) this.particulas.push({ tipo: 'sangue', x: r.x + (Math.random() - 0.5) * 14, y: r.y - 30 - Math.random() * 20, vx: 0, vy: 20, vida: 1, idade: 0, r: 1.6 });
  }

  desenharPlaca(i, r, agora) {
    const g = this.ctx;
    const y = r.y - (r.deitado ? 52 : altura(r)) - 34;   // deitado o arco fica em pé: a placa vai acima dele
    const w = 46, v = Math.max(0, r.vida / VIDA);
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillRect(r.x - w / 2 - 1, y - 1, w + 2, 7);
    g.fillStyle = v > 0.5 ? '#4be05a' : v > 0.25 ? '#ffc53d' : '#ff4a3a';
    g.fillRect(r.x - w / 2, y, w * v, 5);
    g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)';
    const nome = i === this.eu ? 'VOCÊ' : this.nome(i);
    g.strokeText(nome, r.x, y - 2); g.fillStyle = this.tom(i); g.fillText(nome, r.x, y - 2);
    if (r.nEspecial > 0) { g.font = '13px system-ui'; g.fillText(`${r.especial === 'fogo' ? '🔥' : '❄️'}${r.nEspecial}`, r.x + w / 2 + 14, y + 6); }
  }

  /** Corpo: tomba, cai até a grama (ou some no abismo) e fica um tempo com as flechas. */
  desenharCorpos(dt, agora) {
    this.corpos = this.corpos.filter((c) => agora - c.t0 < 7000);
    for (const c of this.corpos) {
      if (!c.chao) {
        c.vy += 1900 * dt; c.x += c.vx * dt;
        const ny = c.y + c.vy * dt;
        const chao = chaoEm(c.x, c.y);
        if (ny >= chao && chao < ALTURA) {
          c.y = chao; c.chao = true; c.vx = 0;
          this.efeitos.push({ tipo: 'poeira', x: c.x, y: c.y, t0: agora, s: 0.8 });
          this.manchas.push({ x: c.x, y: c.y, r: 26 + Math.random() * 10, cor: 'rgba(120,0,0,.6)', t0: agora });
        } else c.y = ny;
      }
      if (c.y > ALTURA + 100) continue;
      const anim = ANIM[c.cor];
      const k = agora - c.t0;
      const q = c.chao ? anim.morto[anim.morto.length - 1] : anim.morto[0];
      const im = IMG[`${c.cor}-${q}`];
      const alfa = Math.min(1, (7000 - k) / 1000);
      if (pronto(im)) {
        const g = this.ctx;
        const w = im.naturalWidth * ESC * 0.95, h = im.naturalHeight * ESC * 0.95;
        g.save();
        g.globalAlpha = alfa;
        g.translate(c.x, c.y);
        g.scale(c.dir, 1);
        if (!c.chao) g.rotate(Math.min(1, k / 300) * -0.5);
        g.drawImage(im, -w / 2, -h + 4, w, h);
        g.restore();
        for (const f of c.presas) this.flechaEm(c.x + f.dx * -c.dir, c.y + f.dy, c.dir === -1 ? f.ang : Math.PI - f.ang, f.tipo, f.de, { comp: 36, fundo: 10, alfa });
      }
      if (c.chao && k < 3000 && Math.random() < 0.1) this.particulas.push({ tipo: 'sangue', x: c.x + (Math.random() - 0.5) * 40, y: c.y - 6, vx: 0, vy: 0, vida: 0.6, idade: 0, r: 1.5 });
    }
  }

  desenharElmos(dt, agora) {
    this.elmos = this.elmos.filter((e) => agora - e.t0 < 6000);
    for (const e of this.elmos) {
      if (!e.parado) {
        e.vy += 1700 * dt; e.x += e.vx * dt;
        const ny = e.y + e.vy * dt, chao = chaoEm(e.x, e.y);
        if (ny >= chao - 10 && chao < ALTURA) {
          e.y = chao - 10;
          if (Math.abs(e.vy) < 180) { e.parado = true; e.rot = Math.round(e.rot / Math.PI) * Math.PI; }
          else { e.vy *= -0.4; e.vx *= 0.6; e.vr *= 0.5; som.tunc(0.3); }
        } else e.y = ny;
        e.rot += e.vr * dt;
      }
      this.sprite(e.nome, e.x, e.y, 30, { rot: e.rot, alfa: Math.min(1, (6000 - (agora - e.t0)) / 800) });
    }
  }

  desenharParticulas(dt, agora) {
    const g = this.ctx;
    const vivas = [];
    for (const p of this.particulas) {
      p.idade += dt;
      if (p.idade >= p.vida) continue;
      const k = p.idade / p.vida;
      if (p.tipo === 'sangue' || p.tipo === 'lasca' || p.tipo === 'terra') {
        p.vy += 1500 * dt; p.x += p.vx * dt;
        const ny = p.y + p.vy * dt, chao = chaoEm(p.x, p.y);
        if (ny >= chao && chao < ALTURA) {
          if (p.tipo === 'sangue' && Math.random() < 0.5) this.manchas.push({ x: p.x, y: chao, r: 3 + Math.random() * 6, cor: 'rgba(130,0,0,.65)', t0: agora });
          continue;
        }
        p.y = ny;
        if (p.tipo === 'sangue') { g.fillStyle = `rgba(${150 + Math.random() * 40},0,0,${1 - k * 0.5})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
        else { g.save(); g.translate(p.x, p.y); g.rotate((p.rot += dt * 10)); g.fillStyle = p.tipo === 'lasca' ? '#b07a3e' : '#6b8a2e'; g.fillRect(-3, -1.5, 6, 3); g.restore(); }
      } else if (p.tipo === 'fumaca') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        g.fillStyle = `rgba(60,50,50,${0.45 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 2), 0, Math.PI * 2); g.fill();
      } else {
        p.vx *= 0.94; p.vy = p.vy * 0.94 + (p.tipo === 'fogo' ? -60 * dt : 0);
        p.x += p.vx * dt; p.y += p.vy * dt;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 1 - k;
        g.fillStyle = p.tipo === 'fogo' ? (k < 0.4 ? '#ffe08a' : '#ff6a1f') : p.cor;
        g.beginPath(); g.arc(p.x, p.y, (p.tipo === 'fogo' ? 5 : 2.4) * (1 - k * 0.6), 0, Math.PI * 2); g.fill();
        g.restore();
      }
      vivas.push(p);
    }
    this.particulas = vivas.slice(-700);
  }

  desenharEfeitos(agora) {
    const g = this.ctx;
    this.efeitos = this.efeitos.filter((e) => agora - e.t0 < 700);
    for (const e of this.efeitos) {
      const k = (agora - e.t0) / 700;
      if (e.tipo === 'explosao') {
        const q = Math.min(3, Math.floor(k * 4 * 1.4));
        this.sprite(`explosao-${q}`, e.x, e.y - 10, 120 * (0.8 + k * 0.6), { alfa: 1 - k * k });
      } else if (e.tipo === 'gelo') {
        this.sprite(`gelo-${Math.min(2, Math.floor(k * 4))}`, e.x, e.y, 60, { alfa: 1 - k });
      } else if (e.tipo === 'poeira') {
        this.sprite(`poeira-${k < 0.5 ? 0 : 1}`, e.x, e.y - 8, 70 * e.s * (0.7 + k), { alfa: (1 - k) * 0.8 });
      } else if (e.tipo === 'anel') {
        g.strokeStyle = e.cor; g.globalAlpha = 1 - k; g.lineWidth = 5 * (1 - k) + 1;
        g.beginPath(); g.arc(e.x, e.y, 10 + 60 * sai(k), 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  desenharTextos(agora) {
    const g = this.ctx;
    this.textos = this.textos.filter((t) => agora - t.t0 < 1000);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1000;
      g.globalAlpha = 1 - k * k;
      rotulo(g, t.txt, t.x, t.y - 40 * sai(k), t.cor, t.tam * (k < 0.15 ? volta(k / 0.15) : 1));
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hud

  desenharHud(agora, est) {
    const g = this.ctx;
    const e = this.ultimo;
    if (!e) return;
    const tServ = agora + (this.desvio ?? 0);
    const vw = this.vw;
    // vermelho nas bordas quando leva flecha
    const dor = agora - this.ferido;
    if (dor < 400) {
      const gr = g.createRadialGradient(vw / 2, this.vh / 2, Math.min(vw, this.vh) * 0.3, vw / 2, this.vh / 2, Math.max(vw, this.vh) * 0.7);
      gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(160,0,0,${0.5 * (1 - dor / 400)})`);
      g.fillStyle = gr; g.fillRect(0, 0, vw, this.vh);
    }
    // relógio
    const resta = e.fase === 'jogo' ? Math.max(0, e.fimEm - tServ) : TEMPO_PARTIDA;
    const seg = Math.ceil(resta / 1000);
    const urgente = e.fase === 'jogo' && seg <= 10;
    if (urgente && seg !== this.ultimoBip && seg > 0) { this.ultimoBip = seg; som.bip(seg <= 3); }
    pilula(g, vw / 2 - 44, 8, 88, 32, urgente ? 'rgba(160,20,10,.85)' : 'rgba(15,10,25,.75)', urgente ? '#ff6a4a' : '#d9a62a');
    g.font = '900 20px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 25);
    // placar de abates
    const ordem = [...e.abates.keys()].sort((a, b) => (e.fora[a] - e.fora[b]) || e.abates[b] - e.abates[a]);
    let x = 10;
    for (const i of ordem) {
      const eu = i === this.eu, w = 104;
      g.globalAlpha = e.fora[i] ? 0.4 : 1;
      pilula(g, x, 8, w, 28, eu ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.55)', this.tom(i));
      g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#fff';
      g.fillText((eu ? 'Você' : this.nome(i)).slice(0, 9), x + 10, 22.5);
      g.textAlign = 'right'; g.fillStyle = this.tom(i); g.font = '900 14px system-ui, sans-serif';
      g.fillText(`🎯${e.abates[i]}`, x + w - 8, 22.5);
      x += w + 6;
      if (x > vw / 2 - 160 && x < vw / 2 + 60) x = vw / 2 + 56;
    }
    g.globalAlpha = 1;
    g.font = '700 11px system-ui'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillText(`${ABATES_VITORIA} abates vence`, vw / 2, 50);

    // minha vida e flechas especiais
    const meu = est?.arq[this.eu];
    if (meu) {
      const v = Math.max(0, meu.vida / VIDA), bw = Math.min(220, vw * 0.3), by = this.vh - (this.toque ? 24 : 36);
      const bx = this.toque ? vw / 2 - bw / 2 : 120;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(bx - 2, by - 2, bw + 4, 16);
      g.fillStyle = v > 0.5 ? '#4be05a' : v > 0.25 ? '#ffc53d' : '#ff4a3a';
      g.fillRect(bx, by, bw * v, 12);
      g.font = '800 11px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(`${Math.ceil(meu.vida)} ❤`, bx + bw / 2, by + 6.5);
      if (meu.nEspecial > 0) { g.textAlign = 'left'; g.font = '800 14px system-ui'; g.fillText(`${meu.especial === 'fogo' ? '🔥' : '❄️'} ×${meu.nEspecial}`, bx + bw + 10, by + 6); }
    }

    // feed
    this.feed = this.feed.filter((f) => agora - f.t0 < 4500);
    g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'right';
    for (const [k, f] of this.feed.entries()) {
      g.globalAlpha = Math.min(1, (4500 - (agora - f.t0)) / 500);
      const w = g.measureText(f.txt).width + 16, yy = 70 + k * 22;
      pilula(g, vw - 10 - w, yy - 10, w, 20, 'rgba(0,0,0,.55)', f.cor);
      g.fillStyle = '#fff'; g.fillText(f.txt, vw - 18, yy + 0.5);
    }
    g.globalAlpha = 1;

    // mira do mouse com o anel de carga
    if (!this.toque && this.mouseV && meu?.vivo) {
      const { x: mx, y: my } = this.mouseV;
      const im = IMG[`mira-${this.cor(this.eu) === 'vermelho' ? 'vermelho' : 'azul'}`];
      if (pronto(im)) g.drawImage(im, mx - 16, my - 16, 32, 32);
      if (this.puxando) {
        g.strokeStyle = this.cargaLocal >= 1 ? '#ffd23d' : '#fff'; g.lineWidth = 3;
        g.beginPath(); g.arc(mx, my, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.cargaLocal); g.stroke();
      }
    }

    // contagem
    if (e.fase === 'contagem') {
      const falta = Math.max(0, e.faseAte - tServ);
      const n = Math.ceil(falta / 1000);
      if (n !== this.ultimaContagem && n > 0) { this.ultimaContagem = n; som.bip(false); }
      const k = 1 - (falta % 1000) / 1000;
      g.save();
      g.translate(vw / 2, this.vh * 0.4);
      const s = volta(Math.min(1, k * 2.2));
      g.scale(s, s);
      g.globalAlpha = 1 - k * 0.6;
      rotulo(g, String(n || ''), 0, 0, '#ffd23d', 110);
      g.restore();
      g.globalAlpha = 1;
      rotulo(g, 'Segure pra puxar a corda · solte pra atirar', vw / 2, this.vh * 0.4 + 80, '#fff', 17);
      rotulo(g, this.toque ? 'Esquerda anda (cima pula, baixo agacha) · DEITA no botão · direita mira' : 'A/D anda · W pula · S agacha · C deita · mouse mira', vw / 2, this.vh * 0.4 + 106, '#e8d9ff', 13);
    }
    if (meu && !meu.vivo && e.fase === 'jogo' && !e.fora[this.eu]) rotulo(g, 'Renascendo…', vw / 2, this.vh * 0.55, '#fff', 22);

    if (this.anuncio) {
      const k = (agora - this.anuncio.t0) / 1400;
      if (k >= 1) this.anuncio = null;
      else {
        g.save();
        g.translate(vw / 2, this.vh * 0.3);
        const s = k < 0.18 ? volta(k / 0.18) : 1;
        g.scale(s, s);
        g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        rotulo(g, this.anuncio.txt, 0, 0, this.anuncio.cor, Math.min(48, (vw * 0.9) / Math.max(4, this.anuncio.txt.length) * 1.6));
        g.restore();
      }
    }
  }

  desenharControles(est) {
    const g = this.ctx;
    const b = this.botoes();
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = b[k];
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    if (!this.toque) return;
    const { joy, pulo } = b;
    let kx = 0, ky = 0, mira = null;
    for (const t of this.toques.values()) {
      if (t.tipo === 'mover') { kx = Math.max(-1, Math.min(1, (t.x - t.x0) / joy.r)); ky = Math.max(-1, Math.min(1, (t.y - t.y0) / joy.r)); }
      if (t.tipo === 'mirar') mira = t;
    }
    g.fillStyle = 'rgba(255,255,255,.1)'; g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2;
    g.beginPath(); g.arc(joy.x, joy.y, joy.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.arc(joy.x + kx * joy.r * 0.6, joy.y + ky * joy.r * 0.6, joy.r * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.4)'; g.strokeStyle = '#ffd23d';
    g.beginPath(); g.arc(pulo.x, pulo.y, pulo.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${pulo.r * 0.7}px system-ui`; g.fillStyle = '#fff'; g.fillText('⤒', pulo.x, pulo.y + 2);
    const { deita } = b;
    g.fillStyle = this.deitar ? 'rgba(255,200,60,.55)' : 'rgba(0,0,0,.4)';
    g.beginPath(); g.arc(deita.x, deita.y, deita.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${deita.r * 0.42}px system-ui`; g.fillStyle = '#fff'; g.fillText(this.deitar ? 'LEVANTA' : 'DEITA', deita.x, deita.y + 1);
    // onde o dedo mira: anel de carga
    if (mira && est?.arq[this.eu]?.vivo) {
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(mira.x, mira.y, 26, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = this.cargaLocal >= 1 ? '#ffd23d' : '#fff'; g.lineWidth = 4;
      g.beginPath(); g.arc(mira.x, mira.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.cargaLocal); g.stroke();
    } else if (est?.arq[this.eu]?.vivo && this.ultimo?.fase !== 'fim') {
      g.font = '700 12px system-ui'; g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillText('toque e segure aqui pra mirar', this.vw * 0.72, this.vh * 0.62);
    }
  }
}

function rotulo(g, txt, x, y, cor, tam) {
  g.font = `900 ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, tam / 5); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
  g.strokeText(txt, x, y);
  g.fillStyle = cor; g.fillText(txt, x, y);
}

function pilula(g, x, y, w, h, fundo, borda) {
  g.fillStyle = fundo; g.strokeStyle = borda; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill(); g.stroke();
}

