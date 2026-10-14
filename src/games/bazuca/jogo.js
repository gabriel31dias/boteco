import { LARGURA as W, ALTURA as H, CHAO, CORES, FOGUETE, CADENCIA, ANDA, BEIRA, mira, posHeli } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles de Bazuca x Helicópteros (canvas 2D).
 * Helicóptero, foguete e míssil andam por fórmula: o desenho usa o relógio do
 * servidor um pouco no passado (ATRASO), então tudo bate exatamente onde o
 * servidor conferiu. O meu foguete sai na hora do toque (fantasma) e é trocado
 * pelo do servidor quando ele chega.
 *
 * O que é daqui:
 *  - céu do deserto, sol, nuvens, panorama com torres, chão com sacos de areia e barris;
 *  - helicóptero com hélice girando, balanço, sombra no chão; avariado solta fumaça;
 *    abatido explode, cai girando pegando fogo e estoura no chão;
 *  - soldado que anda pro lado pra fugir do míssil (◀ ▶ / A D), se inclina pra mirar,
 *    coice e clarão no tiro, cai atordoado com estrelinhas;
 *  - foguete com rastro de fumaça, míssil com luz piscando e alvo no chão;
 *  - placar, relógio, combos (DOBRADINHA!), 3-2-1, confete no fim;
 *  - celular em pé: a tela gira pra deitada.
 */

const A = import.meta.glob('../../assets/bazuca/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.webp$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const TOM = { azul: '#3b8cff', vermelho: '#ff4646', amarelo: '#ffc53d', roxo: '#b86bff', verde: '#3ddc5a' };
const PATENTE = { azul: 'Recruta', vermelho: 'Cabo', amarelo: 'Sargento', roxo: 'Tenente', verde: 'Capitão' };
const COMBO = ['', '', 'DOBRADINHA!', 'TRIPLA!', 'QUÁDRUPLA!', 'IMPARÁVEL!'];
const FALA_ABATE = ['Abatido!', 'Derrubou!', 'Na mosca!', 'Caiu feio!', 'Bum!'];
const FALA_COMBO = { 2: 'Dobradinha!', 3: 'Tripla!', 4: 'Quádrupla!', 5: 'Imparável!' };
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const sorteia = (a) => a[Math.floor(Math.random() * a.length)];
const LARG_HELI = { verde: 236, bege: 250 };

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
    this.e = null;
    this.desvio = null;
    this.vistos = 0;
    this.helis = new Map();       // id -> helicóptero (fórmula do servidor)
    this.fog = new Map();         // id -> foguete
    this.mis = new Map();         // id -> míssil
    this.fantasmas = [];          // os meus foguetes antes do servidor confirmar
    this.agenda = [];             // efeitos marcados pro instante do servidor em que acontecem
    this.quedas = [];             // destroços caindo
    this.part = [];               // partículas do mundo
    this.tela = [];               // confete
    this.textos = [];
    this.banner = null;
    this.tremor = 0;
    this.anim = CORES.map(() => ({ tiro: 0, mira: -Math.PI / 4, caiu: 0, festa: 0 }));
    this.seq = 0;
    this.hx = [];
    this.meuX = null;
    this.andando = 0;
    this.teclas = { esq: false, dir: false };
    this.dedos = new Map();      // dedo segurando ◀ ou ▶
    this.prontoLocal = 0;
    this.alvo = null;
    this.encerrado = false;
    this.fimEm = 0;
    this.toque = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.chegou = performance.now();
    this.nuvens = Array.from({ length: 6 }, (_, k) => ({ x: Math.random() * 1600 - 160, y: 40 + k * 34, r: 40 + Math.random() * 50, v: 5 + Math.random() * 10 }));
    destravar();
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    // celular fraco (média > 28ms por quadro): cai pra 1 pixel por ponto, uma vez só
    let medio = 16, ant = performance.now();
    const criado = ant;   // `chegou` muda a cada estado: não serve pra "faz 3s que abriu"
    const quadro = (t) => {
      if (!this.rodando) return;
      medio = medio * 0.95 + Math.min(100, t - ant) * 0.05; ant = t;
      if (medio > 28 && this.dprMax !== 1 && t - criado > 3000) { this.dprMax = 1; this.redimensionar(); }
      try { this.desenhar(); } catch (e) { console.error(e); }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); som.desligar(); }

  cor(i) { return this.e?.cores?.[i] ?? CORES[i % CORES.length]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? `Soldado ${i + 1}`).split(' ')[0]; }
  agoraServ() { return performance.now() + (this.desvio ?? 0); }
  /** O instante do servidor que está sendo desenhado. */
  tDesenho() { return this.agoraServ() - ATRASO; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.e = e;
    this.hx.push({ t: e.agora, x: e.x });
    if (this.hx.length > 12) this.hx.shift();
    if (this.meuX == null) this.meuX = e.x[this.eu];
    const vivos = new Set();
    for (const [id, tipo, t0, x0, y0, dir, v, amp, freq, fase, morto, vida] of e.h) {
      vivos.add(id);
      const h = this.helis.get(id);
      if (h) { h.morto = morto; h.vida = vida; } else this.helis.set(id, { id, tipo, t0, x0, y0, dir, v, amp, freq, fase, morto, vida, giro: Math.random() * 10 });
    }
    for (const [id, h] of this.helis) if (!vivos.has(id) && h.morto == null) this.helis.delete(id);
    for (const [id, de, t0, x0, y0, vx, vy, seq] of e.f) {
      if (this.fog.has(id)) continue;
      this.fog.set(id, { id, de, t0, x0, y0, vx, vy, seq, fim: null });
      this.anim[de].mira = Math.atan2(vy, vx);
      if (de === this.eu) this.fantasmas = this.fantasmas.filter((f) => f.seq !== seq);
    }
    for (const [id, t0, x0, y0, tx, dur] of e.m) if (!this.mis.has(id)) this.mis.set(id, { id, t0, x0, y0, tx, dur, fim: null });
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.evento(ev, agora); }
    if (e.fim && !this.encerrado) this.encerrar(e.fim);
  }

  /** x do soldado i: o meu é previsto aqui (anda na hora); os outros, interpolados no instante desenhado. */
  xDe(i) {
    if (i === this.eu && this.meuX != null) return this.meuX;
    const h = this.hx;
    if (!h.length) return W / 2;
    const t = this.tDesenho();
    let a = h[0], b = h[0];
    for (let k = 0; k < h.length - 1; k++) if (h[k].t <= t && h[k + 1].t >= t) { a = h[k]; b = h[k + 1]; break; }
    if (t >= h[h.length - 1].t) a = b = h[h.length - 1];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    return a.x[i] + (b.x[i] - a.x[i]) * f;
  }

  /** Muda a direção que eu ando (manda pro servidor só quando muda). */
  andar(d) {
    if (d === this.andando) return;
    this.andando = d;
    if (this.e && !this.encerrado) this.op.onEntrada({ andar: d });
  }
  direcao() {
    const dedos = [...this.dedos.values()];
    const esq = this.teclas.esq || dedos.includes(-1), dir = this.teclas.dir || dedos.includes(1);
    return esq === dir ? 0 : esq ? -1 : 1;
  }

  /** Efeito na hora certa do desenho (o evento chega antes, por causa do ATRASO). */
  marcar(t, fn) { this.agenda.push({ t, fn }); }

  evento(ev, agora) {
    const meu = ev.de === this.eu;
    if (ev.tipo === 'largada') {
      som.largada();
      som.fala('Fogo à vontade!', true);
      this.anunciar('FOGO!', '#ff7a1a', 1200);
      this.tremor = 10;
    }
    if (ev.tipo === 'tiro' && !meu) {
      const f = this.fog.get(ev.foguete);
      this.marcar(f?.t0 ?? this.tDesenho(), () => this.disparo(ev.de, f ? Math.atan2(f.vy, f.vx) : this.anim[ev.de].mira, false));
    }
    if (ev.tipo === 'dano') {
      const f = this.fog.get(ev.foguete); if (f) f.fim = ev.t;
      this.marcar(ev.t, () => {
        som.lata(meu ? 1 : 0.6);
        this.explosao(ev.x, ev.y, 0.45);
        this.faiscas(ev.x, ev.y, 14);
        this.texto(ev.x, ev.y - 40, 'TOC!', '#fff', meu ? 30 : 22);
        if (meu) som.fala('Mais um!');
      });
    }
    if (ev.tipo === 'abate') {
      const f = this.fog.get(ev.foguete); if (f) f.fim = ev.t;
      this.marcar(ev.t, () => {
        const grande = ev.heliTipo === 'bege';
        som.explosao(meu ? 1 : 0.7, grande);
        this.explosao(ev.x, ev.y, grande ? 1.35 : 1.1, ev.heliTipo);
        this.faiscas(ev.x, ev.y, 30);
        this.quedas.push({ tipo: ev.heliTipo, x: ev.x, y: ev.y, vx: ev.dir * 120, vy: -60, rot: 0, vr: ev.dir * (1.5 + Math.random() * 1.5), dir: ev.dir, t0: performance.now() });
        this.tremor = Math.max(this.tremor, meu ? 16 : 9);
        this.texto(ev.x, ev.y - 70, meu ? '+1' : `+1 ${this.nome(ev.de)}`, TOM[this.cor(ev.de)], meu ? 46 : 28);
        this.anim[ev.de].festa = performance.now();
        if (meu) {
          navigator.vibrate?.(ev.combo > 1 ? [60, 40, 120] : 70);
          som.ponto(ev.combo);
          if (ev.combo > 1) { this.anunciar(COMBO[Math.min(ev.combo, 5)], '#ffd23d', 1300); som.fala(FALA_COMBO[Math.min(ev.combo, 5)], true); }
          else som.fala(sorteia(FALA_ABATE));
        } else if (ev.combo > 2) this.anunciar(`${this.nome(ev.de).toUpperCase()}: ${COMBO[Math.min(ev.combo, 5)]}`, TOM[this.cor(ev.de)], 1100);
      });
    }
    if (ev.tipo === 'intercepta') {
      const f = this.fog.get(ev.foguete); if (f) f.fim = ev.t;
      const m = this.mis.get(ev.missil); if (m) m.fim = ev.t;
      this.marcar(ev.t, () => {
        som.intercepta();
        this.explosao(ev.x, ev.y, 0.6);
        this.texto(ev.x, ev.y - 40, meu ? 'INTERCEPTOU!' : 'NA MOSCA!', '#7df9ff', meu ? 30 : 22);
      });
    }
    if (ev.tipo === 'missil') {
      const m = this.mis.get(ev.missil);
      if (m) m.alvo = ev.alvo;
      this.marcar(m?.t0 ?? this.tDesenho(), () => {
        som.missil((m?.dur ?? 1600) / 1000, ev.alvo === this.eu ? 1 : 0.5);
        if (ev.alvo === this.eu) { this.texto(this.xDe(this.eu), CHAO - 170, 'CUIDADO! CORRE! ⚠', '#ff4646', 28); som.fala('Cuidado, míssil! Corre!'); }
      });
    }
    if (ev.tipo === 'boom') {
      const m = this.mis.get(ev.missil); if (m) m.fim = ev.t;
      this.marcar(ev.t, () => {
        som.impacto(ev.pegos.includes(this.eu) ? 1 : 0.6);
        this.explosao(ev.x, CHAO - 30, 0.95);
        this.terra(ev.x, 18);
        this.tremor = Math.max(this.tremor, ev.pegos.includes(this.eu) ? 20 : 8);
        ev.pegos.forEach((i, k) => {
          const resta = ev.vidas?.[k] ?? 1, eu = i === this.eu;
          this.anim[i].caiu = performance.now();
          if (resta > 0) this.texto(this.xDe(i), CHAO - 150, eu ? `MORREU! ${'❤'.repeat(resta)}` : `${this.nome(i)} -❤`, '#ff4646', eu ? 32 : 22);
          else if (eu) { this.anunciar('ELIMINADO!', '#ff4646', 2600); som.fala('Fui eliminado!', true); }
          else { this.textos.push({ tela: true, x: 0.5, y: 0.42, txt: `💀 ${this.nome(i)} foi eliminado`, cor: TOM[this.cor(i)], t0: performance.now(), tam: 24 }); som.fala(`${this.nome(i)} foi eliminado!`); }
        });
        const k = ev.pegos.indexOf(this.eu);
        if (k >= 0) { som.zumbido(); navigator.vibrate?.([100, 50, 200]); if (ev.vidas?.[k] > 0) som.fala(ev.vidas[k] === 1 ? 'Última vida!' : sorteia(['Ai! Fui atingido!', 'Médico!', 'Perdi uma vida!'])); }
      });
    }
    if (ev.tipo === 'saiu') this.textos.push({ tela: true, x: 0.5, y: 0.4, txt: `${this.nome(ev.i)} saiu`, cor: '#fff', t0: agora, tam: 26 });
  }

  /** Fim (ou conexão perdida, sem `fim`: só congela). */
  encerrar(fim) {
    this.encerrado = true;
    this.fimEm = performance.now();
    som.parar();
    if (!fim) return;
    this.vencedor = fim.vencedor;
    const ganhei = fim.vencedor === this.eu;
    if (fim.vencedor == null) this.anunciar('EMPATE!', '#fff', 3000);
    else this.anunciar(ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3400);
    if (ganhei) { som.fanfarra(); som.fala('Vitória! Você é o rei do céu!', true); navigator.vibrate?.([80, 60, 80, 60, 200]); for (let k = 0; k < 160; k++) this.confete(); }
    else { som.derrota(); if (fim.vencedor != null) som.fala(`${this.nome(fim.vencedor)} derrubou mais!`, true); }
  }

  anunciar(txt, cor, dura) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  texto(x, y, txt, cor, tam) { this.textos.push({ x: x + (Math.random() - 0.5) * 20, y, txt, cor, tam, t0: performance.now() }); }

  // --------------------------------------------------------- partículas

  explosao(x, y, tam = 1, heli = null) {
    const t0 = performance.now();
    if (this.part.length > 500) this.part.splice(0, 120);
    this.part.push({ tipo: 'clarao', x, y, t0, vida: 180, tam: 260 * tam });
    this.part.push({ tipo: 'onda', x, y, t0, vida: 450, tam: 200 * tam });
    if (heli) this.part.push({ tipo: 'sprite', nome: `heli-${heli}-boom`, x, y, t0, vida: 420, tam: 220 * tam, rot: 0 });
    for (let k = 0; k < 3; k++) this.part.push({ tipo: 'sprite', nome: `explosao-${k}`, x: x + (Math.random() - 0.5) * 60 * tam, y: y + (Math.random() - 0.5) * 40 * tam, t0: t0 + k * 70, vida: 520, tam: (110 + Math.random() * 50) * tam, rot: Math.random() * 6, cresce: true });
    for (let k = 0; k < 4; k++) this.part.push({ tipo: 'sprite', nome: `fumaca-${k}`, x: x + (Math.random() - 0.5) * 80 * tam, y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, t0: t0 + 200 + k * 90, vida: 1600, tam: (90 + Math.random() * 40) * tam, rot: 0, fumaca: true });
  }
  faiscas(x, y, q) {
    const t0 = performance.now();
    for (let k = 0; k < q; k++) {
      const a = Math.random() * Math.PI * 2, v = 150 + Math.random() * 420;
      this.part.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, t0, vida: 500 + Math.random() * 600, cor: Math.random() < 0.5 ? '#ffd23d' : '#ff7a1a' });
    }
    for (let k = 0; k < q / 3; k++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
      this.part.push({ tipo: 'caco', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, t0, vida: 1400, w: 6 + Math.random() * 10 });
    }
  }
  terra(x, q) {
    const t0 = performance.now();
    for (let k = 0; k < q; k++) this.part.push({ tipo: 'caco', x: x + (Math.random() - 0.5) * 40, y: CHAO - 20, vx: (Math.random() - 0.5) * 380, vy: -250 - Math.random() * 380, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, t0, vida: 1300, w: 5 + Math.random() * 9, terra: true });
  }
  confete() {
    const cores = ['#ff4646', '#ffd23d', '#3ddc5a', '#3b8cff', '#b86bff', '#fff'];
    this.tela.push({ x: Math.random(), y: -0.05 - Math.random() * 0.3, vx: (Math.random() - 0.5) * 0.15, vy: 0.1 + Math.random() * 0.15, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, cor: sorteia(cores), w: 8 + Math.random() * 8, t0: performance.now(), vida: 5000 });
  }
  /** Clarão, coice e fumaça na boca da bazuca. */
  disparo(i, a, meu) {
    const an = this.anim[i];
    an.tiro = performance.now(); an.mira = a;
    som.disparo(meu ? 1 : 0.45, meu);
    const s = { x: this.xDe(i), y: CHAO };
    const bx = s.x + Math.cos(a) * 62, by = s.y - 78 + Math.sin(a) * 62;
    this.part.push({ tipo: 'clarao', x: bx, y: by, t0: an.tiro, vida: 110, tam: 110 });
    // o sopro pra trás da bazuca
    for (let k = 0; k < 5; k++) this.part.push({ tipo: 'bafo', x: s.x - Math.cos(a) * 40, y: s.y - 78 - Math.sin(a) * 40, vx: -Math.cos(a) * (80 + Math.random() * 120) + (Math.random() - 0.5) * 60, vy: -Math.sin(a) * (80 + Math.random() * 120) - 20, t0: an.tiro, vida: 700 + Math.random() * 400, r: 12 + Math.random() * 12 });
    if (meu) { this.tremor = Math.max(this.tremor, 5); navigator.vibrate?.(25); }
  }

  // ------------------------------------------------------------ entrada

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiro(ev),
      move: (ev) => { if (ev.pointerType === 'mouse') this.alvo = this.paraMundo(this.paraVirtual(ev.clientX, ev.clientY)); },
      tecla: (ev) => {
        const esq = ['ArrowLeft', 'a', 'A'].includes(ev.key), dir = ['ArrowRight', 'd', 'D'].includes(ev.key);
        if (esq || dir) { ev.preventDefault(); destravar(); this.teclas[esq ? 'esq' : 'dir'] = true; this.andar(this.direcao()); return; }
        if (ev.repeat) return;
        if ([' ', 'Enter'].includes(ev.key) && this.alvo) { ev.preventDefault(); destravar(); this.atirar(this.alvo); }
      },
      solta2: (ev) => {
        const esq = ['ArrowLeft', 'a', 'A'].includes(ev.key), dir = ['ArrowRight', 'd', 'D'].includes(ev.key);
        if (esq || dir) { this.teclas[esq ? 'esq' : 'dir'] = false; this.andar(this.direcao()); }
      },
      larga: (ev) => { if (this.dedos.delete(ev.pointerId)) this.andar(this.direcao()); },
      foco: () => { this.teclas = { esq: false, dir: false }; this.dedos.clear(); this.andar(0); },
      resize: () => this.redimensionar(),
      menu: (ev) => ev.preventDefault(),
      solta: () => destravar(),   // iOS só libera o áudio no fim do toque
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    this.canvas.addEventListener('pointermove', this.h.move);
    addEventListener('keydown', this.h.tecla);
    addEventListener('keyup', this.h.solta2);
    addEventListener('pointerup', this.h.larga);
    addEventListener('pointercancel', this.h.larga);
    addEventListener('blur', this.h.foco);
    addEventListener('resize', this.h.resize);
    this.canvas.addEventListener('contextmenu', this.h.menu);
    addEventListener('touchend', this.h.solta);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    this.canvas.removeEventListener('pointermove', this.h.move);
    removeEventListener('keydown', this.h.tecla);
    removeEventListener('keyup', this.h.solta2);
    removeEventListener('pointerup', this.h.larga);
    removeEventListener('pointercancel', this.h.larga);
    removeEventListener('blur', this.h.foco);
    removeEventListener('resize', this.h.resize);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
    removeEventListener('touchend', this.h.solta);
  }

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
  paraMundo(v) { return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc }; }

  ponteiro(ev) {
    destravar();
    if (ev.pointerType !== 'mouse') this.toque = true;
    ev.preventDefault();
    const v = this.paraVirtual(ev.clientX, ev.clientY);
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(this.B.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(this.B.mudo)) { som.alternarMudo(); return; }
    // ◀ ▶: segura pra andar
    for (const [k, d] of [['esq', -1], ['dir', 1]]) {
      const r = this.B[k];
      if (Math.hypot(v.x - (r.x + r.w / 2), v.y - (r.y + r.h / 2)) < r.w * 0.62) { this.dedos.set(ev.pointerId, d); this.andar(this.direcao()); return; }
    }
    const m = this.paraMundo(v);
    this.alvo = { ...m, toque: performance.now() };
    this.atirar(m);
  }

  atirar(m) {
    const e = this.e;
    if (!e || e.fim || this.encerrado || e.fase !== 'jogo') return;
    const agora = performance.now();
    if (!e.vidas[this.eu]) return;
    if (agora < this.prontoLocal || this.agoraServ() < e.atordoado[this.eu]) { if (agora - (this.avisouRecarga ?? 0) > 400) { this.avisouRecarga = agora; som.tique(); } return; }
    this.prontoLocal = agora + CADENCIA + 20;
    this.recargaDe = agora;
    const t = Math.round(this.tDesenho());
    const r = mira(this.xDe(this.eu), m.x, m.y);
    const seq = ++this.seq;
    this.fantasmas.push({ seq, de: this.eu, t0: t, x0: Math.round(r.ox + Math.cos(r.a) * 50), y0: Math.round(r.oy + Math.sin(r.a) * 50), vx: Math.round(r.vx), vy: Math.round(r.vy), fim: null });
    this.disparo(this.eu, r.a, true);
    setTimeout(() => som.recarga(), CADENCIA - 120);
    this.op.onEntrada({ x: Math.round(m.x), y: Math.round(m.y), t, seq });
  }

  // ------------------------------------------------------------- desenho

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    this.girado = h > w * 1.05;
    this.vw = this.girado ? h : w;
    this.vh = this.girado ? w : h;
    const dpr = Math.min(this.dprMax ?? 2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    // o mundo inteiro cabe; sobra vira céu em cima e deserto dos lados
    this.esc = Math.min(this.vw / W, this.vh / H);
    this.ox = (this.vw - W * this.esc) / 2;
    this.oy = this.vh - H * this.esc;
    const s = 42;
    const b = Math.max(54, Math.min(84, this.vh * 0.15));
    this.B = {
      sair: { x: this.vw - s - 8, y: 8, w: s, h: s }, mudo: { x: this.vw - (s + 8) * 2, y: 8, w: s, h: s },
      esq: { x: 12, y: this.vh - b - 12, w: b, h: b }, dir: { x: 24 + b, y: this.vh - b - 12, w: b, h: b },
    };
  }

  desenhar() {
    const g = this.ctx, e = this.e;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    if (!this.encerrado && !this.travou && e?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    const T = this.encerrado ? (this.tCongelado ??= this.tDesenho()) : this.tDesenho();
    // efeitos marcados que já chegaram no instante desenhado
    if (this.agenda.length) {
      const prontos = this.agenda.filter((a) => a.t <= T);
      this.agenda = this.agenda.filter((a) => a.t > T);
      for (const a of prontos) a.fn();
    }
    this.sons(T);
    if (e && this.meuX != null) {
      const parado = this.encerrado || e.fase !== 'jogo' || !e.vidas[this.eu] || this.agoraServ() < e.atordoado[this.eu];
      if (!parado) this.meuX = Math.min(W - BEIRA, Math.max(BEIRA, this.meuX + this.andando * ANDA * dt));
      // o servidor manda: parado, encosta devagar; muito longe, pula pra lá
      const xs = e.x[this.eu];
      if (Math.abs(xs - this.meuX) > 80) this.meuX = xs;
      else if (!this.andando || parado) this.meuX += (xs - this.meuX) * Math.min(1, dt * 8);
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }
    this.desenharCeu(g, agora, dt);
    this.tremor *= 0.86;
    g.save();
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharFundo(g, agora);
    if (e) {
      this.desenharHelis(g, T, agora);
      this.desenharQuedas(g, agora, dt);
      this.desenharMisseis(g, T, agora);
      this.desenharFoguetes(g, T);
      this.desenharChao(g);
      this.desenharSoldados(g, agora);
    } else this.desenharChao(g);
    this.desenharParticulas(g, agora, dt);
    this.desenharMira(g, agora);
    this.desenharTextos(g, agora);
    g.restore();
    this.desenharConfete(g, agora, dt);
    if (e) this.desenharHud(g, agora);
  }

  /** Hélice mais alta com mais helicóptero no céu (e mais perto do chão). */
  sons(T) {
    if (!this.e || this.encerrado) return;
    let n = 0, perto = 0;
    for (const h of this.helis.values()) {
      if (h.morto != null && T >= h.morto) continue;
      const c = posHeli(h, T);
      if (c.x < -100 || c.x > W + 100) continue;
      n++; perto = Math.max(perto, c.y / 400);
    }
    som.helices(n, Math.min(1, perto));
    if (this.e.fase === 'jogo') {
      const falta = Math.ceil((this.e.fimEm - this.agoraServ()) / 1000);
      if (falta <= 10 && falta > 0 && falta !== this.ultimoTique) { this.ultimoTique = falta; som.bip(falta <= 3); if (falta === 10) { som.apertar(); som.fala('Dez segundos!', true); } }
    }
  }

  desenharCeu(g, agora, dt) {
    const gr = g.createLinearGradient(0, 0, 0, this.vh);
    gr.addColorStop(0, '#3d7fd1'); gr.addColorStop(0.55, '#8cc4ea'); gr.addColorStop(0.8, '#f6d39a'); gr.addColorStop(1, '#e8b070');
    g.fillStyle = gr; g.fillRect(0, 0, this.vw, this.vh);
    // sol com brilho
    const sx = this.vw * 0.78, sy = this.oy + 120 * this.esc;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 140 * this.esc);
    sg.addColorStop(0, 'rgba(255,250,210,1)'); sg.addColorStop(0.25, 'rgba(255,230,140,.9)'); sg.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, 140 * this.esc, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (const n of this.nuvens) {
      n.x += n.v * dt; if (n.x > W + 250) n.x = -250;
      const x = this.ox + n.x * this.esc, y = this.oy + n.y * this.esc, r = n.r * this.esc;
      g.beginPath(); g.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); g.ellipse(x + r * 0.6, y - r * 0.2, r * 0.7, r * 0.4, 0, 0, Math.PI * 2); g.ellipse(x - r * 0.6, y + r * 0.05, r * 0.6, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    }
  }

  /** Extremos do mundo visíveis na tela (o mundo é 1280 de largura; a tela pode ser mais). */
  bordas() { return { x0: -this.ox / this.esc, x1: (this.vw - this.ox) / this.esc, y0: -this.oy / this.esc }; }

  desenharFundo(g) {
    const { x0, x1 } = this.bordas();
    const p = IMG.panorama;
    if (pronto(p)) {
      const h = 300, w = (h * p.naturalWidth) / p.naturalHeight;
      for (let x = Math.floor((x0 - 200) / w) * w; x < x1; x += w) g.drawImage(p, x, CHAO - h + 14, w + 1, h);
    }
    // torres e palmeiras de canto
    const bota = (n, x, alt, esp = false) => { const im = IMG[n]; if (!pronto(im)) return; const w = (alt * im.naturalWidth) / im.naturalHeight; g.save(); g.translate(x, CHAO - 6); if (esp) g.scale(-1, 1); g.drawImage(im, -w / 2, -alt, w, alt); g.restore(); };
    bota('torre', 40, 230); bota('palmeira', W - 40, 220); bota('palmeira', W + 120, 180, true); bota('torre-aco', -150, 210);
    // bandeira tremulando
    const b = IMG.bandeira;
    if (pronto(b)) { g.save(); g.translate(W - 120, CHAO - 10); g.scale(0.9 + Math.sin(performance.now() / 160) * 0.1, 1); g.drawImage(b, 0, -90, 62, 90); g.restore(); }
  }

  desenharChao(g) {
    const { x0, x1 } = this.bordas();
    g.fillStyle = '#7a4a26'; g.fillRect(x0 - 10, CHAO - 6, x1 - x0 + 20, H - CHAO + 400);
    const c = IMG.chao;
    if (pronto(c)) { const h = 92, w = (h * c.naturalWidth) / c.naturalHeight; for (let x = Math.floor((x0 - 10) / (w - 2)) * (w - 2); x < x1; x += w - 2) g.drawImage(c, x, CHAO - 26, w, h); }
    // trincheira entre os soldados: sacos e barris (ficam na frente do pé)
    const n = this.e?.n ?? 2;
    const bota = (nome, x, alt) => { const im = IMG[nome]; if (!pronto(im)) return; const w = (alt * im.naturalWidth) / im.naturalHeight; g.drawImage(im, x - w / 2, CHAO + 22 - alt, w, alt); };
    for (let k = 0; k <= n; k++) {
      const x = (W * (k + 0.5)) / (n + 1);
      bota(k % 2 ? 'sacos' : 'sacos-2', x, k % 2 ? 46 : 36);
      if (k % 3 === 1) bota('barril', x + 46, 44);
      if (k % 3 === 2) bota('caixas', x - 50, 36);
    }
    bota('barreira', x0 + 70, 56); bota('barril-cinza', x1 - 60, 44); bota('moita', W * 0.02, 40); bota('moita-2', W * 0.98, 40);
  }

  desenharHelis(g, T, agora) {
    for (const h of this.helis.values()) {
      if (T < h.t0) continue;
      if (h.morto != null && T >= h.morto) continue;
      const c = posHeli(h, T);
      if (c.x < -260 || c.x > W + 260) continue;
      // sombra no chão
      const k = 1 - Math.min(1, c.y / CHAO);
      g.fillStyle = `rgba(40,20,5,${0.12 + (1 - k) * 0.15})`;
      g.beginPath(); g.ellipse(c.x, CHAO + 6, 90 * (1 - k * 0.5), 10 * (1 - k * 0.5), 0, 0, Math.PI * 2); g.fill();
      // quadro: hélice girando (alterna 0/1); avariado fumega
      const avariado = h.tipo === 'bege' && h.vida === 1;
      const nome = avariado ? `heli-${h.tipo}-fumaca` : `heli-${h.tipo}-${Math.floor(agora / 70 + h.giro) % 2}`;
      const im = IMG[nome];
      const w = LARG_HELI[h.tipo], hh = pronto(im) ? (w * im.naturalHeight) / im.naturalWidth : 120;
      // inclina pra frente e balança com a subida/descida
      const s = (T - h.t0) / 1000;
      const sobe = h.amp * h.freq * Math.cos(s * h.freq + h.fase);
      g.save(); g.translate(c.x, c.y);
      g.scale(h.dir, 1);
      g.rotate(0.08 + sobe * 0.0015 + Math.sin(agora / 300 + h.giro) * 0.02);
      if (pronto(im)) g.drawImage(im, -w / 2, -hh / 2, w, hh);
      g.restore();
      if (avariado && Math.random() < 0.35) this.part.push({ tipo: 'bafo', x: c.x - h.dir * 20, y: c.y - 10, vx: -h.dir * 40, vy: -40, t0: agora, vida: 900, r: 10 + Math.random() * 10, escuro: true });
    }
  }

  /** Destroço caindo girando, pegando fogo; no chão vira explosão. */
  desenharQuedas(g, agora, dt) {
    for (const q of this.quedas) {
      q.vy += 520 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (Math.random() < 0.7) this.part.push({ tipo: 'bafo', x: q.x, y: q.y, vx: (Math.random() - 0.5) * 30, vy: -30, t0: agora, vida: 1100, r: 14 + Math.random() * 14, escuro: true });
      if (Math.random() < 0.5) this.part.push({ tipo: 'faisca', x: q.x, y: q.y, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, t0: agora, vida: 400, cor: '#ff7a1a' });
      if (q.y >= CHAO - 30 && !q.fim) {
        q.fim = true;
        this.explosao(q.x, CHAO - 40, 1.1);
        this.terra(q.x, 20);
        this.tremor = Math.max(this.tremor, 10);
        som.impacto(0.6);
      }
      const im = IMG[`heli-${q.tipo}-destroco`];
      if (!q.fim && pronto(im)) {
        const w = LARG_HELI[q.tipo] * 0.95, hh = (w * im.naturalHeight) / im.naturalWidth;
        g.save(); g.translate(q.x, q.y); g.scale(q.dir, 1); g.rotate(q.rot * 0.4); g.drawImage(im, -w / 2, -hh / 2, w, hh); g.restore();
      }
    }
    this.quedas = this.quedas.filter((q) => !q.fim && agora - q.t0 < 5000);
  }

  desenharFoguetes(g, T) {
    const im = IMG.foguete;
    const todos = [...this.fog.values(), ...this.fantasmas];
    for (const f of todos) {
      const fimT = f.fim ?? f.t0 + FOGUETE.vida;
      if (T < f.t0) continue;
      if (T >= fimT) { if (T - fimT > 2000) { this.fog.delete(f.id); this.fantasmas = this.fantasmas.filter((x) => x !== f); } continue; }
      const s = (T - f.t0) / 1000;
      const x = f.x0 + f.vx * s, y = f.y0 + f.vy * s;
      if (y < -200 || x < -300 || x > W + 300) continue;
      const a = Math.atan2(f.vy, f.vx);
      // rastro: fumaça atrás
      this.part.push({ tipo: 'bafo', x: x - Math.cos(a) * 30, y: y - Math.sin(a) * 30, vx: (Math.random() - 0.5) * 20, vy: -10, t0: performance.now(), vida: 650, r: 6 + Math.random() * 5 });
      g.save(); g.translate(x, y); g.rotate(a);
      // chama piscando
      g.fillStyle = `rgba(255,${150 + Math.random() * 100},40,.9)`;
      g.beginPath(); g.ellipse(-40, 0, 18 + Math.random() * 10, 6, 0, 0, Math.PI * 2); g.fill();
      if (pronto(im)) g.drawImage(im, -40, -11, 80, 22);
      g.restore();
    }
  }

  desenharMisseis(g, T, agora) {
    const im = IMG['foguete-2'];
    for (const m of this.mis.values()) {
      const fimT = m.fim ?? m.t0 + m.dur;
      if (T < m.t0) continue;
      if (T >= fimT) { if (T - fimT > 2000) this.mis.delete(m.id); continue; }
      const k = (T - m.t0) / m.dur;
      // alvo no chão: círculo vermelho piscando que aperta
      const pisca = Math.floor(agora / (k > 0.6 ? 80 : 160)) % 2;
      g.strokeStyle = pisca ? '#ff2020' : 'rgba(255,60,60,.4)'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(m.tx, CHAO + 6, 70 * (1.2 - k * 0.5), 12, 0, 0, Math.PI * 2); g.stroke();
      const x = m.x0 + (m.tx - m.x0) * k, y = m.y0 + (CHAO - 30 - m.y0) * k * k;
      const a = Math.atan2(2 * Math.max(k, 0.05) * (CHAO - 30 - m.y0), m.tx - m.x0);   // aponta pra onde vai
      this.part.push({ tipo: 'bafo', x, y: y - 14, vx: 0, vy: -15, t0: agora, vida: 500, r: 5 + Math.random() * 4 });
      g.save(); g.translate(x, y); g.rotate(a);
      if (pronto(im)) g.drawImage(im, -34, -10, 68, 20);
      g.fillStyle = pisca ? '#ff3030' : '#ffd0d0'; g.beginPath(); g.arc(30, 0, 4, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  desenharSoldados(g, agora) {
    const e = this.e;
    const T = this.agoraServ();
    for (let i = 0; i < e.n; i++) {
      const s = { x: this.xDe(i) }, an = this.anim[i], cor = this.cor(i);
      // anda? (o meu pelo controle; os outros pelo que o servidor manda)
      const anda = i === this.eu ? this.andando : e.anda[i];
      const eliminado = !e.vidas[i];
      const atordoado = (e.atordoado[i] > T || eliminado) && !this.encerrado;
      const caindo = atordoado && agora - an.caiu < 350;
      const ganhou = this.encerrado && this.vencedor === i;
      const festa = ganhou || agora - an.festa < 500;
      const atirando = agora - an.tiro < 140;
      const correndo = anda && !atordoado && !atirando && !festa && e.fase === 'jogo' && !this.encerrado;
      if (correndo) an.lado = anda;
      const q = caindo ? 'cai' : atordoado ? 'caido' : festa ? 'pulo' : atirando ? 'tiro' : correndo ? (Math.floor(agora / 110) % 2 ? 'corre' : 'pulo') : `mira-${Math.floor(agora / 600 + i) % 2}`;
      if (correndo && Math.random() < 0.25) this.part.push({ tipo: 'bafo', x: s.x - anda * 20, y: CHAO - 4, vx: -anda * 40, vy: -20, t0: agora, vida: 450, r: 6 + Math.random() * 5, terra: true });
      const im = IMG[`soldado-${cor}-${q}`];
      g.globalAlpha = e.fora[i] ? 0.3 : eliminado && !caindo ? 0.6 : 1;
      // sombra
      g.fillStyle = 'rgba(40,20,5,.3)'; g.beginPath(); g.ellipse(s.x, CHAO + 2, 40, 8, 0, 0, Math.PI * 2); g.fill();
      if (pronto(im)) {
        const alt = q === 'caido' ? 62 : q === 'cai' ? 96 : q === 'corre' ? 100 : 112;
        const w = (alt * im.naturalWidth) / im.naturalHeight;
        const esq = correndo ? anda < 0 : Math.cos(an.mira) < 0;
        const elev = Math.atan2(-Math.sin(an.mira), Math.abs(Math.cos(an.mira)));
        const mirando = q.startsWith('mira') || q === 'tiro';
        const incl = mirando ? -Math.min(0.7, Math.max(0, elev) * 0.55) : 0;
        const coice = atirando ? (1 - (agora - an.tiro) / 140) * 10 : 0;
        const pulo = festa ? Math.abs(Math.sin(agora / 140)) * 26 : correndo ? Math.abs(Math.sin(agora / 70)) * 6 : 0;
        const resp = mirando ? Math.sin(agora / 380 + i) * 1.5 : 0;
        g.save();
        g.translate(s.x, CHAO - 56 - pulo + resp);
        if (esq) g.scale(-1, 1);
        g.rotate(incl);
        g.translate(-coice, 0);
        g.drawImage(im, -w * 0.45, 56 - alt, w, alt);
        g.restore();
      }
      if (eliminado && !caindo) rotulo(g, '💀', s.x, CHAO - 80 + Math.sin(agora / 400 + i) * 4, '#fff', 30);
      else if (atordoado && !caindo) for (let k = 0; k < 3; k++) {
        const a = agora / 260 + (k * Math.PI * 2) / 3;
        rotulo(g, '★', s.x + Math.cos(a) * 30, CHAO - 66 + Math.sin(a) * 8, '#ffd23d', 18);
      }
      // nome e placar em cima
      const eu = i === this.eu;
      rotulo(g, eu ? 'VOCÊ' : this.nome(i), s.x, CHAO - 150, TOM[cor], eu ? 22 : 17);
      // vidas: corações embaixo do nome
      for (let k = 0; k < 3; k++) rotulo(g, '❤', s.x + (k - 1) * 16, CHAO - 168 + (eu ? -4 : 0), k < e.vidas[i] ? '#ff4646' : 'rgba(60,60,60,.7)', 13);
      if (eu) { const b = Math.sin(agora / 200) * 4; g.fillStyle = TOM[cor]; g.beginPath(); g.moveTo(s.x - 9, CHAO - 136 + b); g.lineTo(s.x + 9, CHAO - 136 + b); g.lineTo(s.x, CHAO - 124 + b); g.fill(); }
      g.globalAlpha = 1;
    }
    // recarga do meu: anelzinho sob os pés
    const r = Math.min(1, (agora - (this.recargaDe ?? 0)) / CADENCIA);
    if (r < 1 && !this.encerrado) {
      const s = { x: this.xDe(this.eu) };
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 6; g.beginPath(); g.arc(s.x, CHAO + 34, 13, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#ffd23d'; g.lineWidth = 6; g.beginPath(); g.arc(s.x, CHAO + 34, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r); g.stroke();
    }
  }

  /** Mira: no mouse, segue o ponteiro com a linha pontilhada; no toque, marca onde tocou. */
  desenharMira(g, agora) {
    const e = this.e, a = this.alvo;
    if (!e || !a || this.encerrado || e.fase !== 'jogo') return;
    const vida = a.toque ? 1 - (agora - a.toque) / 500 : 1;
    if (vida <= 0) return;
    const r = mira(this.xDe(this.eu), a.x, a.y);
    g.save(); g.globalAlpha = vida;
    if (!a.toque) {
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.setLineDash([8, 10]);
      g.beginPath(); g.moveTo(r.ox + Math.cos(r.a) * 60, r.oy + Math.sin(r.a) * 60); g.lineTo(a.x, a.y); g.stroke(); g.setLineDash([]);
    }
    const pronto = performance.now() >= this.prontoLocal;
    g.strokeStyle = pronto ? '#ff3b3b' : '#999'; g.lineWidth = 3;
    const k = a.toque ? 1 + (1 - vida) * 0.6 : 1 + Math.sin(agora / 150) * 0.06;
    g.beginPath(); g.arc(a.x, a.y, 20 * k, 0, Math.PI * 2); g.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(a.x + dx * 12 * k, a.y + dy * 12 * k); g.lineTo(a.x + dx * 30 * k, a.y + dy * 30 * k); g.stroke(); }
    g.restore();
  }

  desenharParticulas(g, agora, dt) {
    this.part = this.part.filter((p) => agora - p.t0 < p.vida);
    for (const p of this.part) {
      const k = (agora - p.t0) / p.vida;
      if (k < 0) continue;
      if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.tipo === 'clarao') {
        g.save(); g.globalCompositeOperation = 'lighter';
        const r = p.tam * (0.4 + k * 0.6);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,255,220,${1 - k})`); gr.addColorStop(0.4, `rgba(255,190,60,${0.7 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,120,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); g.restore();
      } else if (p.tipo === 'onda') {
        g.strokeStyle = `rgba(255,240,200,${0.7 * (1 - k)})`; g.lineWidth = 8 * (1 - k) + 1;
        g.beginPath(); g.arc(p.x, p.y, p.tam * k, 0, Math.PI * 2); g.stroke();
      } else if (p.tipo === 'sprite') {
        const im = IMG[p.nome];
        if (!pronto(im)) continue;
        const s = p.cresce ? 0.5 + volta(Math.min(1, k * 2.2)) * 0.7 : p.fumaca ? 0.7 + k * 0.8 : 1;
        const w = p.tam * s, h = (w * im.naturalHeight) / im.naturalWidth;
        g.save(); g.globalAlpha = p.fumaca ? 0.85 * (1 - k) : k > 0.6 ? (1 - k) / 0.4 : 1;
        g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
      } else if (p.tipo === 'faisca') {
        p.vy += 500 * dt;
        g.strokeStyle = p.cor; g.globalAlpha = 1 - k; g.lineWidth = 3;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke(); g.globalAlpha = 1;
      } else if (p.tipo === 'caco') {
        p.vy += 900 * dt; p.rot += p.vr * dt;
        if (p.y > CHAO + 10) { p.y = CHAO + 10; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5; }
        g.save(); g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.terra ? '#6b3f1d' : '#3d4a2a'; g.fillRect(-p.w / 2, -p.w / 3, p.w, p.w * 0.66); g.restore();
      } else if (p.tipo === 'bafo') {
        const r = p.r * (1 + k * 2.2);
        g.fillStyle = p.escuro ? `rgba(50,45,40,${0.5 * (1 - k)})` : p.terra ? `rgba(190,140,90,${0.5 * (1 - k)})` : `rgba(235,230,220,${0.55 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
      }
    }
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1300);
    for (const t of this.textos) {
      if (t.tela) continue;
      const k = (agora - t.t0) / 1300;
      const s = k < 0.15 ? volta(k / 0.15) : 1;
      rotulo(g, t.txt, t.x, t.y - k * 50, t.cor, t.tam * s, k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }

  desenharConfete(g, agora, dt) {
    this.tela = this.tela.filter((c) => agora - c.t0 < c.vida);
    for (const c of this.tela) {
      c.vy += 0.5 * dt; c.vx *= 0.99; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.vy > 0.25) c.vy = 0.25;
      g.save(); g.translate(c.x * this.vw, c.y * this.vh); g.rotate(c.rot);
      g.fillStyle = c.cor; g.fillRect(-c.w / 2, -c.w / 4, c.w, c.w / 2 * (0.5 + Math.abs(Math.sin(c.rot * 2))));
      g.restore();
    }
  }

  desenharHud(g, agora) {
    const e = this.e, vw = this.vw, vh = this.vh;
    // placar: ordem de abates, eu destacado
    const ordem = [...Array(e.n).keys()].sort((a, b) => e.abates[b] - e.abates[a] || a - b);
    const lh = 26, pw = 186;
    g.fillStyle = 'rgba(20,24,16,.7)'; g.beginPath(); g.roundRect(8, 8, pw, 12 + lh * e.n, 12); g.fill();
    g.strokeStyle = '#c9a43d'; g.lineWidth = 2; g.stroke();
    ordem.forEach((i, k) => {
      const y = 8 + 6 + lh * k + lh / 2, cor = TOM[this.cor(i)];
      g.globalAlpha = e.fora[i] ? 0.4 : 1;
      if (i === this.eu) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(12, y - lh / 2 + 2, pw - 8, lh - 4); }
      g.fillStyle = cor; g.beginPath(); g.arc(24, y, 7, 0, Math.PI * 2); g.fill();
      g.font = `${i === this.eu ? 900 : 700} 14px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(`${k === 0 && e.abates[i] > 0 ? '👑 ' : ''}${i === this.eu ? 'Você' : this.nome(i)}`.slice(0, 13), 36, y + 1);
      g.textAlign = 'right'; g.font = '900 16px system-ui, sans-serif'; g.fillStyle = '#ffd23d';
      g.fillText(`${e.abates[i]} 🚁`, pw + 2, y + 1);
      g.font = '11px system-ui'; g.fillStyle = e.vidas[i] ? '#ff4646' : '#888';
      g.fillText(e.vidas[i] ? '❤'.repeat(e.vidas[i]) : '💀', pw - 46, y + 1);
      g.globalAlpha = 1;
    });
    // relógio
    const falta = e.fase === 'contagem' ? e.fimEm - e.largada : Math.max(0, e.fimEm - (this.encerrado ? e.fimEm : this.agoraServ()));
    const seg = Math.ceil(falta / 1000);
    const urgente = seg <= 10 && e.fase === 'jogo' && !this.encerrado;
    g.fillStyle = 'rgba(20,24,16,.75)'; g.beginPath(); g.roundRect(vw / 2 - 58, 8, 116, 44, 14); g.fill();
    g.strokeStyle = urgente ? '#ff4646' : '#c9a43d'; g.lineWidth = 2; g.stroke();
    const pul = urgente ? 1 + Math.max(0, 1 - ((falta / 1000) % 1) * 3) * 0.25 : 1;
    rotulo(g, `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 31, urgente ? '#ff4646' : '#fff', 26 * pul);
    // botões de cima
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = this.B[k];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // ◀ ▶ (segura pra andar)
    if (!this.encerrado && e.vidas[this.eu]) for (const [k, d, txt] of [['esq', -1, '◀'], ['dir', 1, '▶']]) {
      const r = this.B[k], ativo = this.andando === d;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      g.fillStyle = ativo ? 'rgba(255,210,61,.55)' : 'rgba(20,24,16,.5)'; g.beginPath(); g.arc(cx, cy, r.w / 2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ativo ? '#ffd23d' : 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.stroke();
      rotulo(g, txt, cx + d * 2, cy + 1, '#fff', r.w * 0.42);
    }
    if (!this.toque && !this.encerrado && e.fase === 'jogo') rotulo(g, 'A / D anda', this.B.dir.x + this.B.dir.w + 50, this.B.dir.y + this.B.dir.h / 2, 'rgba(255,255,255,.8)', 13);
    // contagem 3-2-1
    if (e.fase === 'contagem') {
      const resta = Math.max(0, e.largada - this.agoraServ());
      const num = Math.ceil(resta / 1000);
      if (num !== this.ultimaContagem && num > 0 && num <= 3) { this.ultimaContagem = num; som.bip(false); }
      if (num <= 3 && num > 0) {
        const k = 1 - ((resta / 1000) % 1);
        rotulo(g, String(num), vw / 2, vh * 0.36, '#ffd23d', 110 * (k < 0.25 ? volta(k / 0.25) : 1));
      } else rotulo(g, 'PREPARA A BAZUCA…', vw / 2, vh * 0.36, '#ffd23d', 34);
      rotulo(g, this.toque ? 'Toque no céu pra atirar · segura ◀ ▶ pra correr' : 'Clique no céu pra atirar · A / D (ou ← →) pra correr', vw / 2, vh * 0.36 + 72, '#fff', 17);
      rotulo(g, 'Míssil vindo? CORRE de baixo! Você tem 3 vidas ❤❤❤ · mire na FRENTE do helicóptero', vw / 2, vh * 0.36 + 98, '#ffe7b0', 13);
    }
    if (!e.vidas[this.eu] && !this.encerrado) {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, vw, vh);
      rotulo(g, '💀 ELIMINADO · assistindo', vw / 2, vh * 0.5, '#ff4646', 26);
    } else if (e.atordoado[this.eu] > this.agoraServ() && !this.encerrado) {
      g.fillStyle = `rgba(255,60,60,${0.15 + Math.sin(agora / 90) * 0.05})`; g.fillRect(0, 0, vw, vh);
      rotulo(g, `VOLTANDO… ${'❤'.repeat(e.vidas[this.eu])}`, vw / 2, vh * 0.5, '#fff', 30);
    }
    // fim: o soldado vencedor grande pulando
    if (this.encerrado && this.vencedor != null) {
      const k = Math.min(1, (agora - this.fimEm) / 500), s = volta(k);
      const im = IMG[`soldado-${this.cor(this.vencedor)}-pulo`];
      const h = Math.min(vh * 0.34, 190) * s;
      if (pronto(im)) { const w = (h * im.naturalWidth) / im.naturalHeight; g.drawImage(im, vw / 2 - w / 2, vh * 0.36 - Math.abs(Math.sin(agora / 160)) * 16, w, h); }
      rotulo(g, `${PATENTE[this.cor(this.vencedor)]} ${this.nome(this.vencedor)} · ${e.abates[this.vencedor]} 🚁`, vw / 2, vh * 0.36 + h + 20, TOM[this.cor(this.vencedor)], 22);
    }
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(vw / 2, vh * 0.24);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        const tam = Math.min(56, (vw * 0.8) / Math.max(5, this.banner.txt.length) * 1.7);
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam, k > 0.8 ? (1 - k) / 0.2 : 1);
        g.restore();
      }
    }
    for (const t of this.textos) if (t.tela) rotulo(g, t.txt, t.x * vw, t.y * vh, t.cor, t.tam);
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
