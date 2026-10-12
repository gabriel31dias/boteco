import { ABATES_VITORIA, ALTURA, CAPIVARAS, ITENS, LARGURA, MAPA, PONTES, PRAIA, RAIO, RIO, SUPER, TEMPO_PARTIDA, mover } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles da Capivara Pistola (canvas 2D, vista de cima).
 * Mesma linha do tanque e dos ratos: o estado do servidor é desenhado ~90ms
 * no passado (interpolado); a MINHA capivara é prevista com os comandos que
 * ainda não voltaram confirmados. Efeitos saem dos eventos de cada quadro.
 *
 * Os passos usam os 5 quadros de andar da folha, no ritmo da distância andada;
 * cada pisada solta poeira e um "tuc" baixinho. Sangue: gotas com altura que
 * caem no chão e viram manchas que somem devagar.
 */

const A = import.meta.glob('../../assets/capivara/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const TOM = { vermelho: '#ff4646', azul: '#3b8cff', verde: '#56d364', rosa: '#ff6fc8' };
const AGUDO = { vermelho: 0.9, azul: 1.05, verde: 0.8, rosa: 1.3 };
const BALA = { vermelho: 'frigideira', azul: null, verde: 'coco', rosa: 'fatia' };
const BALA_Z = 45;                // as balas andam no chão; desenhadas na altura do peito
const ALTURA_CAPI = 112;          // altura desenhada da capivara (px do mundo; a arena inteira cabe na tela)
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const sorteio = (lista, id) => lista[Math.abs(id) % lista.length];

const FALA = {
  abate: ['TOMA, CAPIVARA!', 'VOLTA PRO RIO!', 'HA HA HA!', 'ENSOPADO!', 'QUEM MANDA AQUI?', 'UÍ-UÍ, SUA BOBA!'],
  morte: ['UÍÍÍÍÍ!', 'MEU CAPIM!', 'SOCORRO!', 'FOI SEM QUERER!', 'AAAAI!', 'CHAMA O IBAMA!'],
  dor: ['UÍ!', 'AI!', 'EI!', 'NO FOCINHO NÃO!'],
  fruta: ['NHAC!', 'DELÍCIA!', 'HUMMM!'],
  galinha: ['QUÉ-QUÉ!', 'NOVINHA EM FOLHA!'],
  renasce: ['VOLTEI!', 'SEGUNDO ROUND!', 'CADÊ ELA?'],
};
const VERBO = ['frigiu', 'deu um banho em', 'amassou', 'mandou pro rio', 'fez suco de', 'despachou'];
const POW = ['PLAFT!', 'SPLASH!', 'PÉÉM!', 'TUM!'];

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string, avatar?: string|null, cor?: string|null}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
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
    this.efeitos = [];
    this.particulas = [];
    this.textos = [];
    this.manchas = [];
    this.baloes = new Map();
    this.feed = [];
    this.caidos = new Map();         // assento -> capivara caída (até renascer)
    this.disparo = [0, 0, 0, 0];
    this.dor = [0, 0, 0, 0];
    this.fase = [0, 0, 0, 0];         // ciclo dos passos
    this.xy = [null, null, null, null];
    this.tremor = 0;
    this.clarao = null;
    this.ultimoBip = null;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });

    this.teclas = new Set();
    this.mouseV = null;
    this.mouseFogo = false;
    this.bombaPendente = false;
    this.toques = new Map();
    this.mira = op.assento % 2 ? Math.PI : 0;
    this.toque = matchMedia('(pointer: coarse)').matches;
    this.encerrado = false;   // acabou (ou a conexão caiu): para de mandar comando e de prever
    this.chegou = performance.now();
    this.mirou = false;       // já mirou nesta partida (a dica some)
    try { this.mirasAntes = Number(localStorage.getItem('capivara-miras')) || 0; } catch { this.mirasAntes = 0; }

    this.cmdSeq = 0;
    this.pendentes = [];
    this.acumulado = 0;
    this.ultimoQuadro = null;
    this.pred = null;
    this.predAntes = null;
    this.predVivo = false;
    this.corr = { x: 0, y: 0 };

    this.ligar();
    this.redimensionar();
    this.rodando = true;
    const quadro = () => { if (!this.rodando) return; this.desenhar(); requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); window.speechSynthesis?.cancel(); }

  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? ['vermelho', 'azul', 'verde', 'rosa'][i]; }
  tom(i) { return TOM[this.cor(i)]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? CAPIVARAS[this.cor(i)]?.nome ?? '?').split(' ')[0]; }
  get ultimo() { return this.quadros[this.quadros.length - 1] ?? null; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    if (this.encerrado) return;
    this.chegou = performance.now();
    this.travou = false;
    this.reconciliar(e);
    const agora = performance.now();
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.quadros.push(e);
    if (this.quadros.length > 30) this.quadros.shift();
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.eventosPendentes.push({ ...ev, t: e.agora }); }
    if (e.fim) this.encerrar();
  }

  /**
   * Fim da partida pra mim: solta os controles e congela a minha capivara. Sem
   * isso, quem perdia o último estado (conexão caiu) seguia andando sozinho.
   */
  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.toques.clear(); this.teclas.clear();
    this.mouseFogo = false; this.bombaPendente = false;
    this.pendentes = [];
    this.andando = false;
  }

  /** A dica de como mirar some depois que a pessoa mira de verdade (fica salvo no aparelho). */
  aprendeuMirar() {
    if (this.mirou) return;
    this.mirou = true;
    try { localStorage.setItem('capivara-miras', String(this.mirasAntes + 1)); } catch { /* sem storage */ }
  }

  mundo(e, eu) { return { cores: e.cores, capis: e.c.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1], vivo: !!o[4] })) }; }

  reconciliar(e) {
    const m = e.c[this.eu];
    this.pendentes = this.pendentes.filter((c) => c.s > (m[6] ?? 0));
    const pos = { x: m[0], y: m[1], kx: m[7], ky: m[8], vivo: true, movendo: false };
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
    const capis = b.c.map((rb, j) => {
      const ra = a.c[j] ?? rb;
      const kk = Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) > 120 ? 1 : k;
      return { x: lerp(ra[0], rb[0], kk), y: lerp(ra[1], rb[1], kk), ang: lerpAng(ra[2], rb[2], kk), vida: rb[3], vivo: !!rb[4], movendo: !!rb[5], protegido: !!rb[9] };
    });
    const extra = Math.max(0, t - b.agora) / 1000;
    const balas = b.b.map(([id, x, y, ang, dono]) => {
      const ba = a.b.find((z) => z[0] === id);
      const vel = CAPIVARAS[b.cores[dono]].bala;
      const px = ba ? lerp(ba[1], x, k) : x, py = ba ? lerp(ba[2], y, k) : y;
      const ex = k >= 1 ? extra : 0;
      return { id, x: px + Math.cos(ang) * vel * ex, y: py + Math.sin(ang) * vel * ex, ang, dono };
    });
    return { capis, balas, pegos: new Set(b.pegos ?? []), sb: b.sb ?? null, bs: new Set(b.bs ?? []), temSuper: b.c.map((x) => !!x[10]) };
  }

  // ----------------------------------------------------------- eventos

  falar(i, lista, id, alto = false) {
    const txt = sorteio(lista, id);
    this.baloes.set(i, { txt, ate: performance.now() + 1600, ini: performance.now() });
    if (alto) som.fala(txt.toLowerCase(), AGUDO[this.cor(i)]);
  }

  tratarEventos(t, est) {
    const meu = est?.capis[this.eu];
    const longe = (x, y) => (meu ? Math.max(0.35, 1 - Math.hypot(x - meu.x, y - meu.y) / 1400) : 1);
    while (this.eventosPendentes.length && this.eventosPendentes[0].t <= t) {
      let e = this.eventosPendentes.shift();
      const agora = performance.now();
      switch (e.tipo) {
        case 'tiro': {
          const c = this.cor(e.de);
          this.disparo[e.de] = agora + (c === 'azul' ? 80 : 220);
          if (c === 'azul') this.respingos(e.x, e.y - BALA_Z, 3, e.ang, '#7fd4ff');
          else this.poeira(e.x, e.y, 1, 0.4);
          som.tiro(c, longe(e.x, e.y));
          break;
        }
        case 'acerto': {
          e = { ...e, y: e.y - BALA_Z };
          const c = e.de != null ? this.cor(e.de) : 'verde';
          const alvo = est?.capis[e.alvo];
          const dir = alvo && e.de != null && est.capis[e.de] ? Math.atan2(alvo.y - est.capis[e.de].y, alvo.x - est.capis[e.de].x) : -Math.PI / 2;
          this.dor[e.alvo] = agora + 220;
          this.sangue(e.x, e.y, 6 + Math.min(18, e.dano / 2), dir);
          if (c === 'azul') this.respingos(e.x, e.y, 6, dir + Math.PI, '#9fdcff');
          if (c === 'rosa') this.respingos(e.x, e.y, 8, dir, '#ff4a5e');
          this.textos.push({ x: e.x, y: e.y - 40, txt: `-${e.dano}`, cor: '#fff', ini: agora, tam: 20 + Math.min(16, e.dano / 3) });
          if (e.dano >= 10) this.textos.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y - 70, txt: c === 'vermelho' ? 'PÉÉM!' : sorteio(POW, e.id), cor: '#ffd23d', ini: agora, tam: 30, pow: true });
          if (e.alvo === this.eu) this.tremor = Math.max(this.tremor, 8);
          som.acerto(c, longe(e.x, e.y));
          if (e.id % 2 === 0) som.ai(AGUDO[this.cor(e.alvo)], longe(e.x, e.y));
          if (e.id % 5 === 0) this.falar(e.alvo, FALA.dor, e.id, e.alvo === this.eu);
          break;
        }
        case 'abate': {
          const c = this.cor(e.alvo);
          this.caidos.set(e.alvo, { x: e.x, y: e.y, ini: agora, dir: e.dx || 1 });
          this.sangue(e.x, e.y, 40, -Math.PI / 2, 1.6);
          this.estrelas(e.x, e.y - 40);
          this.tremor = Math.max(this.tremor, e.alvo === this.eu ? 20 : 10);
          if (e.alvo === this.eu) this.clarao = { ini: agora };
          som.grito(AGUDO[c], longe(e.x, e.y));
          if (!e.saiu) {
            this.falar(e.alvo, FALA.morte, e.id, e.alvo === this.eu);
            if (e.de != null && e.de !== e.alvo) {
              setTimeout(() => this.falar(e.de, FALA.abate, e.id + 1, e.de === this.eu), 450);
              this.festa = { i: e.de, ate: agora + 1400 };
              this.feed.unshift({ txt: `${this.nome(e.de)} ${sorteio(VERBO, e.id)} ${this.nome(e.alvo)}`, de: e.de, ini: agora });
            } else this.feed.unshift({ txt: `${this.nome(e.alvo)} se explodiu sozinha`, de: e.alvo, ini: agora });
          } else this.feed.unshift({ txt: `${this.nome(e.alvo)} fugiu pro rio`, de: e.alvo, ini: agora });
          this.feed = this.feed.slice(0, 5);
          break;
        }
        case 'renasce':
          this.caidos.delete(e.i);
          this.respingos(e.x, e.y, 10, -Math.PI / 2, '#9fdcff');
          this.efeitos.push({ tipo: 'anel', x: e.x, y: e.y, cor: this.tom(e.i), ini: agora });
          if (e.i === this.eu) som.renasce();
          if (e.id % 2 === 0) this.falar(e.i, FALA.renasce, e.id, e.i === this.eu);
          break;
        case 'pega':
          this.brilho(e.x, e.y - 10, e.item === 'galinha' ? '#ffe14a' : '#7dff8a');
          this.textos.push({ x: e.x, y: e.y - 30, txt: e.item === 'galinha' ? 'VIDA CHEIA!' : `+${ITENS.find((x) => x.tipo === e.item)?.cura ?? ''}`, cor: '#5cff7a', ini: agora, tam: 24 });
          if (e.item === 'superbomba') {
            this.anuncio = { txt: `${this.nome(e.i).toUpperCase()} PEGOU A SUPER BOMBA!`, ini: agora, cor: this.tom(e.i) };
            if (e.i === this.eu) som.alarme();
            break;
          }
          if (e.i === this.eu) som.pega(e.item === 'galinha');
          this.falar(e.i, e.item === 'galinha' ? FALA.galinha : FALA.fruta, e.id, e.i === this.eu);
          break;
        case 'super':
          this.anuncio = { txt: e.caiu ? 'A SUPER BOMBA CAIU!' : '💣 SUPER BOMBA APARECEU!', ini: agora };
          this.brilho(e.x, e.y - 20, '#ff4d2e');
          som.alarme();
          break;
        case 'lanca':
          this.falar(e.de, ['LÁ VAI BOMBA!', 'SEGURA ESSA!', 'ADEUS, CAPIVARAS!'], e.id, e.de === this.eu);
          som.lanca();
          break;
        case 'explosao':
          if (e.super) {
            // super: várias explosões em anel, onda de choque, clarão, tremor enorme
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * Math.PI * 2, d = k ? SUPER.raio * 0.55 : 0;
              setTimeout(() => this.efeitos.push({ tipo: 'explosao', x: e.x + Math.cos(a) * d, y: e.y - 30 + Math.sin(a) * d * 0.6, ini: performance.now(), tam: k ? 1.4 : 2.6 }), k * 45);
            }
            this.efeitos.push({ tipo: 'onda', x: e.x, y: e.y, ini: agora });
            this.fumaca(e.x, e.y, 40, 3);
            this.lascas(e.x, e.y, 40);
            this.manchas.push({ x: e.x, y: e.y + 6, r: SUPER.raio * 0.55, ini: agora, queimado: true });
            this.tremor = 60;
            this.clarao = { ini: agora, branco: true };
            som.superExplosao();
            break;
          }
          this.efeitos.push({ tipo: 'explosao', x: e.x, y: e.y - 30, ini: agora });
          this.fumaca(e.x, e.y, 14, 1.4);
          this.lascas(e.x, e.y, 12);
          this.manchas.push({ x: e.x, y: e.y + 6, r: 34, ini: agora, queimado: true });
          this.tremor = Math.max(this.tremor, 16);
          som.explosao(longe(e.x, e.y));
          break;
        case 'impacto': {
          e = { ...e, y: e.y - BALA_Z };
          const c = e.de != null ? this.cor(e.de) : 'azul';
          if (c === 'azul') this.respingos(e.x, e.y, 5, -Math.PI / 2, '#9fdcff');
          else if (c === 'rosa') this.respingos(e.x, e.y, 6, -Math.PI / 2, '#ff4a5e');
          else this.faiscas(e.x, e.y, 6);
          if (e.id % 3 === 0) som.impacto(longe(e.x, e.y) * 0.7);
          break;
        }
        case 'fogo':
          som.bip(true);
          break;
      }
    }
  }

  // partículas: z = altura acima do chão (vista de cima, o "pulo" é desenhar mais acima)
  sangue(x, y, n, dir, forca = 1) {
    for (let k = 0; k < n; k++) {
      const a = dir + (Math.random() - 0.5) * 1.8, v = (60 + Math.random() * 200) * forca;
      this.particulas.push({ tipo: 'sangue', x, y, z: 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 120 + Math.random() * 200 * forca, r: 1.6 + Math.random() * 2.6 * forca, vida: 2, idade: 0 });
    }
  }
  respingos(x, y, n, dir, cor) {
    for (let k = 0; k < n; k++) {
      const a = dir + (Math.random() - 0.5) * 1.4, v = 60 + Math.random() * 160;
      this.particulas.push({ tipo: 'gota', x, y, z: 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 80 + Math.random() * 120, r: 1.5 + Math.random() * 2, cor, vida: 1.2, idade: 0 });
    }
  }
  poeira(x, y, n, tam) {
    for (let k = 0; k < n; k++) this.particulas.push({ tipo: 'poeira', x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 30, vy: -8, tam, vida: 0.5, idade: 0 });
  }
  fumaca(x, y, n, f) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (10 + Math.random() * 40) * f;
      this.particulas.push({ tipo: 'fumaca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15, r: 6 + Math.random() * 10 * f, vida: 0.8 + Math.random() * 0.7, idade: 0 });
    }
  }
  faiscas(x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
      this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0.25, idade: 0 });
    }
  }
  lascas(x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 240;
      this.particulas.push({ tipo: 'lasca', x, y, z: 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 150 + Math.random() * 150, rot: 0, vr: (Math.random() - 0.5) * 18, vida: 1, idade: 0 });
    }
  }
  estrelas(x, y) { for (let k = 0; k < 5; k++) this.particulas.push({ tipo: 'estrela', x, y, a: (k / 5) * Math.PI * 2, vida: 1.6, idade: 0 }); }
  brilho(x, y, cor) {
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, cor, vida: 0.45, idade: 0 }); }
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat && (k === 'e' || k === 'q')) this.bombaPendente = true;
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
    // no toque: tudo pequeno e encostado nos cantos, pra não tampar o jogo
    const joy = { x: m + s * 0.12, y: this.vh - m - s * 0.12, r: s * 0.12 };
    const fogo = { x: this.vw - m - s * 0.11, y: this.vh - m - s * 0.11, r: s * 0.11 };
    const br = s * 0.075;
    return {
      // ✕ e 🔊 empilhados na borda esquerda, acima do joystick
      sair: { x: 8, y: joy.y - joy.r - 84, w: 34, h: 34 },
      mudo: { x: 8, y: joy.y - joy.r - 44, w: 34, h: 34 },
      joy,
      fogo,
      bomba: { x: fogo.x, y: fogo.y - fogo.r - 12 - br, r: br },
    };
  }

  ponteiroDesce(e) {
    destravar();
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') this.toque = true;   // antes de `botoes()`: o layout muda no toque
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (b.bomba && this.ultimo?.c[this.eu]?.[10] && Math.hypot(v.x - b.bomba.x, v.y - b.bomba.y) < b.bomba.r * 1.45) { this.bombaPendente = true; return; }
    if (e.pointerType === 'mouse' && e.button === 2 && this.ultimo?.c[this.eu]?.[10]) { this.bombaPendente = true; return; }
    if (e.pointerType === 'mouse') { this.mouseV = v; if (e.button === 0 || e.button === 2) this.mouseFogo = true; return; }
    e.preventDefault();
    this.toque = true;
    if (v.x < this.vw / 2) {
      this.toques.set(e.pointerId, { tipo: 'mover', x0: v.x, y0: v.y, x: v.x, y: v.y });
      return;
    }
    // no botão de tiro: analógico preso no centro do botão (já mira no toque).
    // fora dele, na metade direita: mira no ponto tocado do mapa.
    const noFogo = Math.hypot(v.x - b.fogo.x, v.y - b.fogo.y) < b.fogo.r * 1.6;
    this.toques.set(e.pointerId, noFogo
      ? { tipo: 'mirar', x0: b.fogo.x, y0: b.fogo.y, x: v.x, y: v.y }
      : { tipo: 'apontar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  ponteiroMove(e) {
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { this.mouseV = v; this.toque = false; return; }
    const t = this.toques.get(e.pointerId);
    if (t) { t.x = v.x; t.y = v.y; }
  }

  ponteiroSobe(e) { if (e.pointerType === 'mouse') { this.mouseFogo = false; return; } this.toques.delete(e.pointerId); }

  enviarEntrada(est) {
    if (this.encerrado) return;
    let mx = 0, my = 0, fogo = false;
    const k = this.teclas;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has(' ') || this.mouseFogo) fogo = true;
    const meu = est?.capis[this.eu];
    const mouse = this.mouseV ? this.paraMundo(this.mouseV) : null;
    if (meu && mouse && !this.toque) this.mira = Math.atan2(mouse.y - (meu.y - 45), mouse.x - meu.x);
    const bt = this.botoes(), r = bt.joy?.r ?? 1;
    let mirando = false;
    for (const t of this.toques.values()) {
      const dx = t.x - t.x0, dy = t.y - t.y0, d = Math.hypot(dx, dy);
      if (t.tipo === 'mover' && d > 6) { const f = Math.min(1, d / r); mx = (dx / d) * f; my = (dy / d) * f; }
      if (t.tipo === 'mirar') { fogo = true; mirando = true; if (d > (bt.fogo?.r ?? 60) * 0.2) { this.mira = Math.atan2(dy, dx); this.aprendeuMirar(); } }
      if (t.tipo === 'apontar') {
        fogo = true; mirando = true;
        if (meu) { const m = this.paraMundo(t); this.mira = Math.atan2(m.y - (meu.y - 45), m.x - meu.x); this.aprendeuMirar(); }
      }
    }
    if (this.toque && !mirando && (mx || my)) this.mira = Math.atan2(my, mx);
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    mx = Math.round(mx * 100) / 100; my = Math.round(my * 100) / 100;
    const ang = Math.round(this.mira * 100) / 100;

    const agora = performance.now();
    this.acumulado = Math.min(150, this.acumulado + (this.ultimoQuadro == null ? 0 : agora - this.ultimoQuadro));
    this.ultimoQuadro = agora;
    const novos = [];
    const e = this.ultimo;
    while (this.acumulado >= 33) {
      this.acumulado -= 33;
      const c = { s: ++this.cmdSeq, mx, my, dt: 33, ang, fogo, bomba: this.bombaPendente };
      this.bombaPendente = false;
      novos.push(c);
      this.pendentes.push(c);
      if (e && this.pred && e.fase === 'jogo' && this.predVivo) {
        this.predAntes = { x: this.pred.x, y: this.pred.y };
        mover(this.mundo(e, this.pred), this.eu, c, 0.033);
      }
    }
    if (novos.length) this.op.onEntrada({ cmds: novos });
    this.andando = !!meu?.vivo && (mx !== 0 || my !== 0) && e?.fase === 'jogo';
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
    // a arena cabe inteira (sem câmera: todo mundo vê todo mundo); sobra vira moldura
    this.esc = Math.min(this.vw / LARGURA, this.vh / ALTURA);
    this.ox = (this.vw - LARGURA * this.esc) / 2;
    this.oy = (this.vh - ALTURA * this.esc) / 2;
  }

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, h, sx = 1, sy = 1, base = false } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale((virar ? -1 : 1) * sx, sy);
    g.globalAlpha = alfa;
    g.drawImage(im, -w / 2, base ? -hh : -hh / 2, w, hh);
    g.restore();
  }

  sombra(x, y, rx, ry, a = 0.3) {
    const g = this.ctx;
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }

  /**
   * Capivara: os 5 quadros de andar no ritmo da distância andada (a pata
   * acompanha o chão), quique em cada passo, amassada ao pisar, poeira e "tuc".
   * Atirando: o quadro de ataque. Levou tiro: pisca branco (a rosa tem quadro de dor).
   */
  desenharCapi(i, r, agora) {
    const g = this.ctx;
    const c = this.cor(i);
    const ant = this.xy[i];
    const dist = ant ? Math.hypot(r.x - ant[0], r.y - ant[1]) : 0;
    this.xy[i] = [r.x, r.y];
    const andando = dist > 0.25 && dist < 40;
    if (andando) {
      const antes = Math.floor(this.fase[i] / 2.5);
      this.fase[i] += dist * 0.055;
      if (Math.floor(this.fase[i] / 2.5) !== antes) {
        this.poeira(r.x - Math.cos(r.ang) * 10, r.y + 2, 1, 0.35);
        if (i === this.eu) som.passo(0.8);
      }
    }
    const quadroAndar = Math.floor(this.fase[i]) % 5;
    const esq = Math.cos(r.ang) < 0;
    let nome = `${c}-anda-${andando ? quadroAndar : 0}`;
    if (this.disparo[i] > agora) nome = `${c}-ataque`;
    else if (this.dor[i] > agora && pronto(IMG[`${c}-dor`])) nome = `${c}-dor`;
    else if (this.festa?.i === i && this.festa.ate > agora && !andando) nome = `${c}-festa`;
    const im = IMG[nome];
    if (!pronto(im)) return;
    const h = ALTURA_CAPI * (nome.endsWith('festa') ? 1.1 : 1);
    const w = (im.naturalWidth / im.naturalHeight) * h;
    const pulo = andando ? Math.abs(Math.sin(this.fase[i] * Math.PI / 2.5)) : 0;
    const respira = andando ? 0 : Math.sin(agora / 380 + i) * 0.03;
    this.sombra(r.x, r.y + 2, 36 - pulo * 4, 11 - pulo, 0.32);
    g.save();
    g.translate(r.x, r.y - pulo * 6);
    g.scale(1 + (andando ? (1 - pulo) * 0.06 : -respira), 1 - (andando ? (1 - pulo) * 0.06 : -respira));
    g.rotate((andando ? Math.sin(this.fase[i] * Math.PI / 2.5) * 0.06 : 0));
    if (esq) g.scale(-1, 1);
    g.globalAlpha = r.protegido ? (Math.floor(agora / 90) % 2 ? 0.35 : 0.9) : 1;
    g.drawImage(im, -w * 0.45, -h, w, h);
    if (this.dor[i] > agora) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5;
      g.drawImage(im, -w * 0.45, -h, w, h);
    }
    g.restore();
    if (r.protegido) {
      g.save(); g.strokeStyle = `${this.tom(i)}aa`; g.lineWidth = 3;
      g.beginPath(); g.ellipse(r.x, r.y - 50, 62, 70, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    if (this.ultimo?.c[i]?.[10] && Math.floor(agora / 250) % 2 === 0) this.sprite('bomba', r.x + 30, r.y - ALTURA_CAPI - 28, 34);
    // anel no chão na cor da capivara (dá pra achar a sua no meio da bagunça)
    g.save(); g.strokeStyle = `${this.tom(i)}cc`; g.lineWidth = i === this.eu ? 3 : 2;
    g.beginPath(); g.ellipse(r.x, r.y + 2, 40, 13, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    // vida e nome
    const k = CAPIVARAS[c];
    const bw = 70, bx = r.x - bw / 2, by = r.y - ALTURA_CAPI - 14;
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(bx - 2, by - 2, bw + 4, 11);
    const pv = r.vida / k.vida;
    g.fillStyle = pv > 0.5 ? '#3ddc5a' : pv > 0.25 ? '#ffc53d' : '#ff4d4d';
    g.fillRect(bx, by, bw * pv, 7);
    g.font = '800 18px "Barlow Semi Condensed", system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = this.tom(i);
    const rot = i === this.eu ? 'VOCÊ' : this.nome(i).toUpperCase();
    g.strokeText(rot, r.x, by - 5); g.fillText(rot, r.x, by - 5);
    // mira: só a minha. Parada, uma linha pontilhada curta; mirando, a linha do
    // tiro até o alcance da arma (a melancia mostra o leque) e um alvo.
    if (i === this.eu) {
      const k = CAPIVARAS[c];
      const mirando = this.mouseFogo || [...this.toques.values()].some((t) => t.tipo === 'mirar' || t.tipo === 'apontar');
      g.save(); g.translate(r.x, r.y - 45); g.rotate(r.ang);
      if (mirando) {
        const ini = RAIO + 22, alc = Math.min(k.bala * k.vidaBala, 560);
        const gr = g.createLinearGradient(ini, 0, ini + alc, 0);
        gr.addColorStop(0, 'rgba(255,90,70,.95)'); gr.addColorStop(1, 'rgba(255,90,70,0)');
        g.strokeStyle = gr; g.lineWidth = 3; g.setLineDash([12, 7]);
        const raios = k.balas > 1 ? [-k.espalha, 0, k.espalha] : [0];
        for (const a of raios) {
          g.beginPath(); g.moveTo(ini, 0); g.lineTo(ini + Math.cos(a) * alc, Math.sin(a) * alc); g.stroke();
        }
        g.setLineDash([]);
        const d = ini + (k.granada ? alc : Math.min(alc * 0.8, 240));   // o coco cai no fim do alcance
        g.strokeStyle = '#fff'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(d, 0, k.granada ? 20 : 11, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        for (const [x0, y0, x1, y1] of [[d - 17, 0, d - 6, 0], [d + 6, 0, d + 17, 0], [d, -17, d, -6], [d, 6, d, 17]]) { g.moveTo(x0, y0); g.lineTo(x1, y1); }
        g.stroke();
        g.fillStyle = '#ff5a46'; g.beginPath(); g.arc(d, 0, 3, 0, Math.PI * 2); g.fill();
      } else {
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([5, 7]); g.lineWidth = 2;
        g.beginPath(); g.moveTo(RAIO + 26, 0); g.lineTo(RAIO + 86, 0); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(RAIO + 96, 0, 6, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
  }

  desenharObjeto(o, agora) {
    const im = IMG[o.tipo];
    if (!pronto(im)) return;
    const h = (o.w * im.naturalHeight) / im.naturalWidth;
    if (o.tipo === 'guarda-sol') {   // cabo desenhado, copa do sprite
      this.sombra(o.x, o.y, 40, 12, 0.18);
      const g = this.ctx;
      g.fillStyle = '#7a4a22'; g.fillRect(o.x - 3, o.y - 120, 6, 120);
      this.sprite(o.tipo, o.x, o.y - 110, o.w, { virar: o.virar });
      return;
    }
    const balanca = o.tipo.startsWith('palmeira') || o.tipo.startsWith('moit') ? Math.sin(agora / 900 + o.x) * 0.02 : 0;
    this.sombra(o.x + 4, o.y, (o.pw ?? o.w * 0.6) * 0.62, Math.max(6, (o.ph ?? 20) * 0.35), 0.3);
    const g = this.ctx;
    g.save();
    g.translate(o.x, o.y + 4);
    g.rotate(balanca);
    if (o.virar) g.scale(-1, 1);
    g.drawImage(im, -o.w / 2, -h, o.w, h);
    g.restore();
  }

  /** Ondinhas e brilho andando na água (o chão parado está no `chao`). */
  desenharAgua(agora) {
    const g = this.ctx;
    g.save();
    g.beginPath();
    g.rect(0, 0, LARGURA, ALTURA);
    redondo(g, PRAIA.x0, PRAIA.y0, PRAIA.x1 - PRAIA.x0, PRAIA.y1 - PRAIA.y0, PRAIA.raio);
    g.rect(RIO.x0, PRAIA.y0, RIO.x1 - RIO.x0, PRAIA.y1 - PRAIA.y0);
    g.clip('evenodd');
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2;
    for (let y = 10; y < ALTURA; y += 34) {
      g.beginPath();
      for (let x = 0; x <= LARGURA; x += 24) {
        const yy = y + Math.sin(x / 60 + agora / 600 + y) * 4;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.setLineDash([18, 40]); g.lineDashOffset = -agora / 40 - y; g.stroke();
    }
    g.setLineDash([]);
    g.restore();
    // rio: correnteza descendo
    g.save();
    g.beginPath(); g.rect(RIO.x0, PRAIA.y0, RIO.x1 - RIO.x0, PRAIA.y1 - PRAIA.y0); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const x = RIO.x0 + 12 + k * 14;
      g.setLineDash([16, 30]); g.lineDashOffset = -agora / 18 - k * 9;
      g.beginPath(); g.moveTo(x, PRAIA.y0); g.lineTo(x + Math.sin(k) * 4, PRAIA.y1); g.stroke();
    }
    g.restore();
    // pontes por cima do rio
    for (const [a, b] of PONTES) desenharPonte(g, RIO.x0 - 22, a - 6, RIO.x1 - RIO.x0 + 44, b - a + 12);
  }

  desenharBalao(i, x, y, agora) {
    const b = this.baloes.get(i);
    if (!b) return;
    if (agora > b.ate) { this.baloes.delete(i); return; }
    const g = this.ctx;
    const entra = Math.min(1, (agora - b.ini) / 120);
    g.save(); g.translate(x, y); g.scale(entra, entra);
    g.font = '900 15px "Barlow Semi Condensed", system-ui, sans-serif';
    const w = g.measureText(b.txt).width + 18, h = 26;
    g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(-w / 2, -h - 10, w, h, 10); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-6, -11); g.lineTo(0, -1); g.lineTo(6, -11); g.closePath(); g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.txt, 0, -h / 2 - 10);
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
    // no meio do jogo o servidor manda estado ~30x por segundo: 3s calado é conexão com problema
    if (!this.encerrado && !this.travou && this.ultimo?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    this.enviarEntrada(est);
    if (est && this.pred && this.predVivo) {
      this.corr.x *= 0.82; this.corr.y *= 0.82;
      const f = Math.min(1, this.acumulado / 33);
      const r = est.capis[this.eu];
      const ax = this.predAntes ? lerp(this.predAntes.x, this.pred.x, f) : this.pred.x;
      const ay = this.predAntes ? lerp(this.predAntes.y, this.pred.y, f) : this.pred.y;
      Object.assign(r, { x: ax + this.corr.x, y: ay + this.corr.y, ang: this.mira, movendo: !!this.andando });
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#062a1c';
    g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }

    g.save();
    this.tremor *= 0.87;
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.chao ??= desenharChao();
    g.drawImage(this.chao, 0, 0);
    this.desenharAgua(agora);

    // manchas de sangue (e queimado das explosões)
    this.manchas = this.manchas.filter((m) => agora - m.ini < 10_000);
    for (const m of this.manchas) {
      const k = (agora - m.ini) / 10_000;
      g.save(); g.globalAlpha = 0.8 * (1 - k * k); g.translate(m.x, m.y);
      g.fillStyle = m.queimado ? '#2a1a10' : '#8f0c12';
      g.beginPath(); g.ellipse(0, 0, m.r * 1.4, m.r * 0.6, 0, 0, Math.PI * 2); g.fill();
      if (!m.queimado) { g.fillStyle = '#c4161d'; g.beginPath(); g.ellipse(-m.r * 0.3, -m.r * 0.1, m.r * 0.6, m.r * 0.25, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }

    if (est) {
      // super bomba no chão: pulsando, com brilho vermelho e anel no chão
      if (est.sb) {
        const [x, y] = est.sb;
        const pulso = 1 + Math.sin(agora / 120) * 0.08;
        g.save(); g.strokeStyle = `rgba(255,60,40,${0.5 + Math.sin(agora / 150) * 0.3})`; g.lineWidth = 4;
        g.beginPath(); g.ellipse(x, y + 2, 46 * pulso, 15 * pulso, 0, 0, Math.PI * 2); g.stroke(); g.restore();
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(x, y - 40, 0, x, y - 40, 70);
        gr.addColorStop(0, 'rgba(255,80,40,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - 70, y - 110, 140, 140); g.restore();
        this.sprite('bomba', x, y - 36 - Math.abs(Math.sin(agora / 250)) * 10, 76 * pulso);
        if (Math.random() < 0.4) this.particulas.push({ tipo: 'faisca', x: x + 10, y: y - 74, vx: (Math.random() - 0.5) * 100, vy: -90, cor: '#ffd23d', vida: 0.35, idade: 0 });
      }
      // frutas pulando no lugar
      for (const it of ITENS) {
        if (est.pegos.has(it.id)) continue;
        const bob = Math.abs(Math.sin(agora / 320 + it.x)) * 8;
        this.sombra(it.x, it.y + 4, 18 - bob / 3, 6);
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(it.x, it.y - 18 - bob, 0, it.x, it.y - 18 - bob, 32);
        gr.addColorStop(0, it.tipo === 'galinha' ? 'rgba(255,230,80,.5)' : 'rgba(120,255,140,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(it.x - 32, it.y - 50 - bob, 64, 64); g.restore();
        this.sprite(it.tipo, it.x, it.y - 22 - bob, it.tipo === 'galinha' ? 64 : 56, { rot: Math.sin(agora / 400 + it.x) * 0.15 });
      }
      // caídas
      for (const [i, cd] of this.caidos) {
        const c = this.cor(i);
        const k = Math.min(1, (agora - cd.ini) / 300);
        this.sombra(cd.x, cd.y + 2, 36, 9);
        this.sprite(`${c}-morto`, cd.x, cd.y + 4, 138, { base: true, virar: cd.dir < 0, alfa: Math.max(0.35, 1 - (agora - cd.ini) / 2600), sy: 0.6 + k * 0.4 });
      }
      // capivaras de cima pra baixo (quem está mais embaixo na tela fica na frente)
      // capivaras e objetos juntos, de cima pra baixo: quem está atrás fica atrás
      const fila = MAPA.map((o) => ({ y: o.y, o }));
      for (const [i, r] of est.capis.entries()) if (r.vivo && !this.ultimo?.fora?.[i]) fila.push({ y: r.y, r, i });
      fila.sort((a, b) => a.y - b.y);
      for (const f of fila) {
        if (f.o) this.desenharObjeto(f.o, agora);
        else this.desenharCapi(f.i, f.r, agora);
      }
      // projéteis
      for (const b of est.balas) {
        const c = this.cor(b.dono);
        if (c === 'azul') {
          g.save(); g.globalCompositeOperation = 'lighter';
          g.strokeStyle = 'rgba(80,180,255,.95)'; g.lineWidth = 11; g.lineCap = 'round';
          const by = b.y - BALA_Z;
          g.beginPath(); g.moveTo(b.x, by); g.lineTo(b.x - Math.cos(b.ang) * 40, by - Math.sin(b.ang) * 40); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4;
          g.beginPath(); g.moveTo(b.x, by); g.lineTo(b.x - Math.cos(b.ang) * 26, by - Math.sin(b.ang) * 26); g.stroke();
          g.restore();
          continue;
        }
        if (est.bs.has(b.id)) {   // super bomba voando: grande, girando, pavio soltando faísca
          this.sombra(b.x, b.y, 26, 8, 0.3);
          this.sprite('bomba', b.x, b.y - BALA_Z - 10, 78, { rot: agora / 70 });
          this.particulas.push({ tipo: 'faisca', x: b.x + 10, y: b.y - BALA_Z - 42, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 80, cor: '#ffb43a', vida: 0.3, idade: 0 });
          continue;
        }
        const giro = agora / (c === 'vermelho' ? 60 : 90) + b.id;
        this.sombra(b.x, b.y, 15, 5, 0.25);
        this.sprite(BALA[c], b.x, b.y - BALA_Z, c === 'vermelho' ? 60 : c === 'verde' ? 42 : 44, { rot: giro });
      }
    }

    this.desenharParticulas(dt);
    this.desenharEfeitos(agora);
    if (est) {
      for (const [i, r] of est.capis.entries()) if (r.vivo) this.desenharBalao(i, r.x, r.y - ALTURA_CAPI - 30, agora);
      for (const [i, cd] of this.caidos) this.desenharBalao(i, cd.x, cd.y - 100, agora);
    }
    this.desenharTextos(agora);
    g.restore();
    this.desenharHud(agora);
    this.desenharControles();
  }

  desenharParticulas(dt) {
    const g = this.ctx;
    this.particulas = this.particulas.filter((p) => (p.idade += dt) < p.vida);
    for (const p of this.particulas) {
      const k = p.idade / p.vida;
      if (p.tipo === 'estrela') {
        const a = p.a + p.idade * 5, rr = 24;
        g.fillStyle = `rgba(255,220,60,${1 - k})`;
        estrela(g, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.4, 7);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'sangue' || p.tipo === 'gota' || p.tipo === 'lasca') {
        p.vz -= 900 * dt; p.z += p.vz * dt;
        if (p.z <= 0) {
          if (p.tipo === 'sangue') this.manchas.push({ x: p.x, y: p.y, r: p.r * (1.4 + Math.random()), ini: performance.now() });
          if (this.manchas.length > 120) this.manchas.shift();
          p.idade = p.vida; continue;
        }
        if (p.tipo === 'lasca') {
          p.rot += p.vr * dt;
          g.save(); g.translate(p.x, p.y - p.z); g.rotate(p.rot); g.fillStyle = '#8a5a2b'; g.fillRect(-4, -2, 8, 4); g.restore();
        } else {
          g.fillStyle = p.tipo === 'sangue' ? '#c3141b' : p.cor;
          g.beginPath(); g.arc(p.x, p.y - p.z, p.r, 0, Math.PI * 2); g.fill();
        }
      } else if (p.tipo === 'fumaca') {
        p.vx *= 0.96; p.vy *= 0.96;
        g.fillStyle = `rgba(70,62,55,${0.42 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'faisca') {
        g.strokeStyle = p.cor ?? `rgba(255,${210 - k * 120},80,${1 - k})`;
        g.globalAlpha = 1 - k; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
        g.globalAlpha = 1;
      } else if (p.tipo === 'poeira') {
        this.sprite('poeira', p.x, p.y - 8 * p.tam, 54 * p.tam * (0.7 + k * 0.6), { alfa: 0.7 * (1 - k) });
      }
    }
  }

  desenharEfeitos(agora) {
    const g = this.ctx;
    this.efeitos = this.efeitos.filter((e) => agora - e.ini < (e.tipo === 'explosao' ? 3 * 90 : e.tipo === 'onda' ? 600 : 450));
    for (const e of this.efeitos) {
      const t = agora - e.ini;
      if (e.tipo === 'explosao') {
        const q = Math.min(2, Math.floor(t / 90));
        g.save(); g.globalCompositeOperation = q < 2 ? 'lighter' : 'source-over';
        this.sprite(`explosao-${q}`, e.x, e.y, (150 + q * 20) * (e.tam ?? 1));
        g.restore();
      } else if (e.tipo === 'onda') {
        const k = t / 600;
        g.save(); g.strokeStyle = `rgba(255,240,200,${1 - k})`; g.lineWidth = 14 * (1 - k) + 2;
        g.beginPath(); g.ellipse(e.x, e.y, SUPER.raio * (0.2 + k), SUPER.raio * (0.2 + k) * 0.55, 0, 0, Math.PI * 2); g.stroke(); g.restore();
      } else if (e.tipo === 'anel') {
        const k = t / 450;
        g.save(); g.strokeStyle = e.cor; g.globalAlpha = 1 - k; g.lineWidth = 4;
        g.beginPath(); g.ellipse(e.x, e.y, 20 + k * 60, (20 + k * 60) * 0.4, 0, 0, Math.PI * 2); g.stroke(); g.restore();
      }
    }
  }

  desenharTextos(agora) {
    const g = this.ctx;
    this.textos = this.textos.filter((t) => agora - t.ini < 900);
    for (const t of this.textos) {
      const k = (agora - t.ini) / 900;
      const pop = t.pow ? 1 + Math.max(0, 0.6 - k * 4) : 1;
      g.save(); g.globalAlpha = 1 - k * k; g.translate(t.x, t.y - k * 40); g.scale(pop, pop);
      if (t.pow) g.rotate(-0.15);
      g.font = `italic 900 ${t.tam}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = t.pow ? '#1d5a1a' : '#000'; g.strokeText(t.txt, 0, 0);
      g.fillStyle = t.cor; g.fillText(t.txt, 0, 0);
      g.restore();
    }
  }

  desenharHud(agora) {
    const g = this.ctx;
    if (this.clarao && agora - this.clarao.ini < 300) {
      g.fillStyle = this.clarao.branco ? `rgba(255,250,230,${0.8 * (1 - (agora - this.clarao.ini) / 300)})` : `rgba(255,30,30,${0.35 * (1 - (agora - this.clarao.ini) / 300)})`;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    const e = this.ultimo;
    if (!e) return;
    // tela baixa (celular deitado): placar e relógio menores
    const zoom = this.vh < 500 ? 0.72 : 1;
    g.save(); g.scale(zoom, zoom);
    let vw = this.vw / zoom;
    const n = e.c.length;
    const porLado = Math.ceil(n / 2);
    const w = Math.min(250, (vw - 160) / 2 / porLado - 8), h = 54, y = 8;
    const compacto = w < 190;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 1, k = Math.floor(i / 2);
      const x = dir ? vw - 10 - (k + 1) * w - k * 8 : 10 + k * (w + 8);
      g.save();
      if (e.fora?.[i]) g.globalAlpha = 0.4;
      g.fillStyle = 'rgba(6,30,20,.8)';
      g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
      g.strokeStyle = this.tom(i); g.lineWidth = i === this.eu ? 3 : 2; g.stroke();
      const lado = compacto ? 36 : 44, ax = dir ? x + w - lado - 6 : x + 6, ay = y + (h - lado) / 2;
      g.save(); g.beginPath(); g.roundRect(ax, ay, lado, lado, 8); g.clip();
      g.fillStyle = `${this.tom(i)}44`; g.fillRect(ax, ay, lado, lado);
      const foto = this.fotos[i];
      if (pronto(foto)) g.drawImage(foto, ax, ay, lado, lado);
      else {
        const im = IMG[`${this.cor(i)}-anda-0`];
        if (pronto(im)) { const s = (lado * 1.25) / im.naturalHeight; g.drawImage(im, ax + lado / 2 - im.naturalWidth * s * 0.5, ay, im.naturalWidth * s, im.naturalHeight * s); }
      }
      g.restore();
      const tx = dir ? ax - 8 : ax + lado + 8;
      g.textAlign = dir ? 'right' : 'left';
      g.font = `800 ${compacto ? 13 : 15}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(this.nome(i) + (i === this.eu ? ' ★' : '') + (e.fora?.[i] ? ' · saiu' : ''), tx, y + 20);
      g.font = `600 ${compacto ? 10 : 11}px system-ui, sans-serif`;
      g.fillStyle = '#b8ffcf';
      g.fillText(CAPIVARAS[this.cor(i)].arma.toUpperCase(), tx, y + 35);
      g.font = 'italic 900 22px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ffd23d';
      g.textAlign = dir ? 'left' : 'right';
      g.fillText(`${e.abates[i]}`, dir ? x + 10 : x + w - 10, y + 36);
      g.restore();
    }
    g.textAlign = 'center';
    g.fillStyle = 'rgba(6,30,20,.82)';
    g.beginPath(); g.roundRect(vw / 2 - 64, 8, 128, 50, 12); g.fill();
    g.font = '700 11px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = '#b8ffcf';
    g.fillText(`QUEM FIZER ${ABATES_VITORIA} LEVA`, vw / 2, 23);
    const resta = e.fase === 'jogo' && e.fimEm ? Math.max(0, e.fimEm - (agora + this.desvio)) : TEMPO_PARTIDA;
    const seg = Math.ceil(resta / 1000);
    g.font = '900 24px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = seg <= 15 && e.fase === 'jogo' ? '#ff6b6b' : '#fff';
    g.fillText(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 50);
    g.restore();
    vw = this.vw;

    this.feed = this.feed.filter((f) => agora - f.ini < 5000);
    g.font = '700 13px "Barlow Semi Condensed", system-ui, sans-serif';
    this.feed.forEach((f, k) => {
      const yy = 82 + k * 24, wt = g.measureText(f.txt).width + 20;
      g.globalAlpha = Math.min(1, (5000 - (agora - f.ini)) / 600);
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.beginPath(); g.roundRect(vw - wt - 12, yy - 15, wt, 21, 8); g.fill();
      g.fillStyle = this.tom(f.de); g.textAlign = 'right';
      g.fillText(f.txt, vw - 22, yy);
      g.globalAlpha = 1;
    });

    let faixa = null, cor = '#fff', grande = true;
    if (e.fase === 'contagem') {
      const s = Math.ceil((e.faseAte - (agora + this.desvio)) / 1000);
      if (s >= 1 && s !== this.ultimoBip) { this.ultimoBip = s; som.bip(false); }
      faixa = s >= 1 ? String(s) : 'BRIGA!'; cor = s >= 1 ? '#ffd23d' : '#ff5a3d';
    } else if (e.fase === 'jogo' && e.fimEm && agora + this.desvio - (e.fimEm - TEMPO_PARTIDA) < 800) {
      faixa = 'BRIGA!'; cor = '#ff5a3d';
    } else if (e.fase === 'jogo' && !e.c[this.eu]?.[4] && !e.fora?.[this.eu]) {
      faixa = 'VOCÊ VIROU ENSOPADO!'; cor = '#ffd23d'; grande = false;
    }
    // anúncio da super bomba (faixa no alto, piscando)
    if (this.anuncio && agora - this.anuncio.ini < 2200) {
      const k = (agora - this.anuncio.ini) / 2200;
      g.save(); g.globalAlpha = Math.min(1, (1 - k) * 3);
      g.translate(vw / 2, 110); g.scale(1 + Math.max(0, 0.3 - k * 2), 1 + Math.max(0, 0.3 - k * 2));
      g.font = 'italic 900 34px "Barlow Semi Condensed", system-ui, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(this.anuncio.txt, 0, 0);
      g.fillStyle = this.anuncio.cor ?? (Math.floor(agora / 150) % 2 ? '#ff4d2e' : '#ffd23d'); g.fillText(this.anuncio.txt, 0, 0);
      g.restore();
    }
    if (faixa) {
      const tam = grande ? Math.min(120, this.vh * 0.22) : Math.min(46, vw * 0.045);
      const pulso = 1 + Math.sin(agora / 90) * 0.04;
      g.save(); g.translate(vw / 2, this.vh / 2); g.scale(pulso, pulso); g.rotate(-0.04);
      g.font = `italic 900 ${tam}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = tam / 7; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(faixa, 0, 0);
      g.fillStyle = cor; g.fillText(faixa, 0, 0);
      if (!grande) {
        g.font = '700 18px "Barlow Semi Condensed", system-ui, sans-serif';
        g.fillStyle = '#fff'; g.lineWidth = 4;
        g.strokeText('voltando já já…', 0, tam * 0.9); g.fillText('voltando já já…', 0, tam * 0.9);
      }
      g.restore(); g.textBaseline = 'alphabetic';
    }
  }

  desenharControles() {
    const g = this.ctx;
    const b = this.botoes();
    for (const [r, txt] of [[b.sair, '✕'], [b.mudo, som.mudo ? '🔇' : '🔊']]) {
      g.fillStyle = 'rgba(6,30,20,.75)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.font = `${Math.round(r.w / 2)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.textBaseline = 'alphabetic';
    }
    if (!this.toque) {
      g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.65)';
      g.fillText('WASD/setas andam · mouse mira · clique/espaço atira · E (ou botão direito) solta a super bomba', this.vw - 12, this.vh - 14);
      return;
    }
    const mover = [...this.toques.values()].find((t) => t.tipo === 'mover');
    const jx = mover?.x0 ?? b.joy.x, jy = mover?.y0 ?? b.joy.y;
    g.save(); g.globalAlpha = mover ? 0.8 : 0.25;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(jx, jy, b.joy.r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (mover) {
      const dx = mover.x - mover.x0, dy = mover.y - mover.y0, d = Math.hypot(dx, dy), f = Math.min(1, b.joy.r / Math.max(1, d)) * 0.6;
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(jx + dx * f, jy + dy * f, b.joy.r * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    const mirar = [...this.toques.values()].find((t) => t.tipo === 'mirar');
    g.save(); g.globalAlpha = mirar ? 0.9 : 0.4;
    g.fillStyle = '#e8462f'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(b.fogo.x, b.fogo.y, b.fogo.r * (mirar ? 1.08 : 1), 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${b.fogo.r * 0.55}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText('💦', b.fogo.x, b.fogo.y + 2);
    if (mirar) {   // bolinha do analógico de mira
      const dx = mirar.x - mirar.x0, dy = mirar.y - mirar.y0, f = Math.min(1, b.fogo.r / Math.max(1, Math.hypot(dx, dy))) * 0.7;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(b.fogo.x + dx * f, b.fogo.y + dy * f, b.fogo.r * 0.28, 0, Math.PI * 2); g.fill();
    }
    // dica de como mirar: nas 3 primeiras partidas, até a pessoa mirar
    if (!mirar && !this.mirou && this.mirasAntes < 3 && this.ultimo?.fase !== 'fim') {
      const pulsa = (Math.sin(performance.now() / 260) + 1) / 2;
      g.save();
      g.globalAlpha = 0.55 + pulsa * 0.45;
      g.fillStyle = '#fff';
      const R = b.fogo.r + 8 + pulsa * 5;
      for (let q = 0; q < 4; q++) {   // setinhas em volta: dá pra arrastar pra qualquer lado
        const a = (q * Math.PI) / 2;
        g.save(); g.translate(b.fogo.x + Math.cos(a) * R, b.fogo.y + Math.sin(a) * R); g.rotate(a);
        g.beginPath(); g.moveTo(8, 0); g.lineTo(-2, -7); g.lineTo(-2, 7); g.closePath(); g.fill();
        g.restore();
      }
      g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)';
      ['ARRASTE O 💦 PRA MIRAR', 'ou toque no mapa onde quer atirar'].forEach((txt, n) => {
        const ty = b.bomba.y - b.bomba.r - 40 + n * 17, tx = this.vw - 12;
        g.strokeText(txt, tx, ty); g.fillText(txt, tx, ty);
      });
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    }
    if (this.ultimo?.c[this.eu]?.[10]) {   // super bomba na mão: botão pulsando
      const pul = 1 + Math.sin(performance.now() / 120) * 0.08;
      g.globalAlpha = 0.9; g.fillStyle = '#2a2a33'; g.strokeStyle = '#ff4d2e'; g.lineWidth = 3;
      g.beginPath(); g.arc(b.bomba.x, b.bomba.y, b.bomba.r * pul, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = `900 ${b.bomba.r}px system-ui, sans-serif`; g.fillStyle = '#fff';
      g.fillText('💣', b.bomba.x, b.bomba.y + 2);
    }
    g.restore(); g.textBaseline = 'alphabetic';
  }
}

function estrela(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}

function redondo(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function desenharPonte(g, x, y, w, h) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 4, y + h - 2, w, 8);
  for (let k = 0; k * 12 < w; k++) {
    const px = x + k * 12;
    g.fillStyle = k % 2 ? '#a8692e' : '#b9773a';
    g.fillRect(px, y, 11, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(px + 10, y, 1, h);
    g.fillStyle = '#5a3414'; g.fillRect(px + 4, y + 6, 2, 2); g.fillRect(px + 4, y + h - 8, 2, 2);
  }
  g.fillStyle = '#6b3f18';
  g.fillRect(x - 4, y - 4, w + 8, 6); g.fillRect(x - 4, y + h - 2, w + 8, 6);
  for (const px of [x - 6, x + w - 2]) for (const py of [y - 8, y + h - 6]) { g.fillStyle = '#4a2a0e'; g.fillRect(px, py, 10, 14); }
  g.restore();
}

/**
 * Chão parado (uma vez): água com degradê, praia de areia com borda molhada,
 * espuma e grãozinhos, o rio, pedrinhas e conchas espalhadas. Semente fixa:
 * todo mundo vê a mesma praia.
 */
function desenharChao() {
  const c = document.createElement('canvas');
  c.width = LARGURA; c.height = ALTURA;
  const g = c.getContext('2d');
  let semente = 11;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const agua = g.createRadialGradient(LARGURA / 2, ALTURA / 2, 200, LARGURA / 2, ALTURA / 2, LARGURA * 0.75);
  agua.addColorStop(0, '#3ec3e8'); agua.addColorStop(1, '#1477b4');
  g.fillStyle = agua; g.fillRect(0, 0, LARGURA, ALTURA);
  for (let k = 0; k < 90; k++) {   // manchas mais claras no fundo da água
    const x = rnd() * LARGURA, y = rnd() * ALTURA, r = 20 + rnd() * 60;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, 'rgba(160,240,255,.18)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const { x0, y0, x1, y1, raio } = PRAIA;
  // borda molhada + espuma
  g.save(); g.beginPath(); redondo(g, x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 28, raio + 14); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill(); g.restore();
  g.save(); g.beginPath(); redondo(g, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, raio + 4); g.fillStyle = '#c99a5a'; g.fill(); g.restore();
  g.save(); g.beginPath(); redondo(g, x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12, raio - 6);
  const areia = g.createLinearGradient(0, y0, 0, y1);
  areia.addColorStop(0, '#f2cf8a'); areia.addColorStop(1, '#e7bc72');
  g.fillStyle = areia; g.fill();
  g.clip();
  for (let k = 0; k < 40; k++) {   // dunas: manchas suaves
    const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), r = 60 + rnd() * 140;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, rnd() > 0.5 ? 'rgba(255,235,180,.35)' : 'rgba(200,150,80,.18)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let k = 0; k < 5000; k++) {   // grãos
    g.fillStyle = rnd() > 0.5 ? 'rgba(160,110,50,.28)' : 'rgba(255,245,210,.4)';
    g.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 1 + rnd() * 2, 1 + rnd() * 1.5);
  }
  for (let k = 0; k < 70; k++) {   // pedrinhas e conchas
    const x = x0 + 30 + rnd() * (x1 - x0 - 60), y = y0 + 30 + rnd() * (y1 - y0 - 60), r = 2 + rnd() * 4;
    g.fillStyle = rnd() > 0.7 ? '#f6e6d0' : '#9c7b5a';
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.25, 0, 0, Math.PI * 2); g.fill();
  }
  // pegadas de capivara bem fraquinhas (vida na praia)
  for (let k = 0; k < 14; k++) {
    let x = x0 + 80 + rnd() * (x1 - x0 - 160), y = y0 + 80 + rnd() * (y1 - y0 - 160);
    const a = rnd() * Math.PI * 2;
    for (let p = 0; p < 6; p++) {
      g.fillStyle = 'rgba(150,100,50,.18)';
      g.beginPath(); g.ellipse(x + (p % 2) * 8, y, 4, 3, a, 0, Math.PI * 2); g.fill();
      x += Math.cos(a) * 18; y += Math.sin(a) * 18;
    }
  }
  g.restore();
  // o rio corta a praia
  g.save();
  g.fillStyle = '#c99a5a'; g.fillRect(RIO.x0 - 6, y0, RIO.x1 - RIO.x0 + 12, y1 - y0);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(RIO.x0 - 3, y0, RIO.x1 - RIO.x0 + 6, y1 - y0);
  const rio = g.createLinearGradient(RIO.x0, 0, RIO.x1, 0);
  rio.addColorStop(0, '#1f8fc9'); rio.addColorStop(0.5, '#3ec3e8'); rio.addColorStop(1, '#1f8fc9');
  g.fillStyle = rio; g.fillRect(RIO.x0, y0 - 6, RIO.x1 - RIO.x0, y1 - y0 + 12);
  g.restore();
  // vitórias-régias e pedras na água
  for (let k = 0; k < 26; k++) {
    let x, y;
    do { x = rnd() * LARGURA; y = rnd() * ALTURA; } while (x > x0 - 20 && x < x1 + 20 && y > y0 - 20 && y < y1 + 20);
    g.fillStyle = '#3d9a3a'; g.beginPath(); g.arc(x, y, 9 + rnd() * 8, 0.3, Math.PI * 2 - 0.1); g.lineTo(x, y); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x - 3, y - 3, 3, 0, Math.PI * 2); g.fill();
  }
  return c;
}
