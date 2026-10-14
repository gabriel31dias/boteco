import { CAMPO, LARGURA, ALTURA, TEMPO_PARTIDA, TURBO, amostrar, aparar, raio, rastroInicial } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles de Cobras do Templo (canvas 2D). O servidor
 * simula; aqui só chegam as cabeças e o corpo é o rastro delas amostrado
 * igual ao servidor (regras.js `amostrar`).
 *
 * O que é daqui:
 *  - corpo de gomos da folha, afinando no rabo, rebolando de leve, e o
 *    "gole": a fruta comida desce pelo corpo como um caroço;
 *  - vista de cima: a cabeça gira com o rumo, a língua tremula de vez em
 *    quando (e sem parar perto de fruta), o bote e o nhac-nhac ao comer;
 *  - morte: os gomos espirram, a cabeça voa girando e vira bolinha;
 *  - o templo vivo: tochas tremendo, olhos da estátua, vaga-lumes, folhas
 *    caindo e brilho no ouro;
 *  - celular em pé: arrasta em qualquer lugar pra guiar, segura o ⚡ (ou
 *    outro dedo) pra turbo. Computador: o mouse guia, clique/espaço = turbo.
 *
 * ponytail: sem previsão local, a cabeça responde com o atraso da rede
 * (~ATRASO + ping/2); prever com `amostrar` no cliente se ficar pesado.
 */

const A = import.meta.glob('../../assets/cobras/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 100;
const TOM = { verde: '#6be43c', vermelho: '#ff4a3a', azul: '#3ba0ff', amarelo: '#ffd23d', rosa: '#ff6fc8', roxo: '#a46bff', preto: '#ff6a1f', arcoiris: '#ffffff' };
const NOME = { verde: 'Jararaca', vermelho: 'Coral', azul: 'Anil', amarelo: 'Sucuri', rosa: 'Chiclete', roxo: 'Viúva', preto: 'Lava', arcoiris: 'Arco-íris' };
const EMOJI = { maca: '🍎', morango: '🍓', banana: '🍌', uva: '🍇', melancia: '🍉', moeda: '👑' };
const SUCO = { maca: '#ff3b3b', morango: '#ff2f5a', banana: '#ffe14a', uva: '#a05cff', melancia: '#ff4f6d', moeda: '#ffd23d' };
const MASTIGA = 520;           // ms de nhac-nhac depois de comer fruta (bolinha: 220)
const TAM_FRUTA = { maca: 34, morango: 30, banana: 34, uva: 34, melancia: 42, moeda: 34 };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };   // easeOutBack
const arcoIris = (k, agora) => `hsl(${(k * 24 + agora / 6) % 360} 95% 62%)`;

/** Emoji desenhado uma vez num canvas (fillText de emoji a cada quadro pesa no celular). */
const CACHE = new Map();
function emoji(ch, px = 64) {
  const k = `${ch}${px}`;
  if (!CACHE.has(k)) {
    const c = document.createElement('canvas');
    c.width = c.height = px * 1.25;
    const g = c.getContext('2d');
    g.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, c.width / 2, c.height / 2 + px * 0.06);
    CACHE.set(k, c);
  }
  return CACHE.get(k);
}
/** Brilho redondo (gradiente) numa cor, também cacheado. */
function brilho(cor) {
  const k = `b${cor}`;
  if (!CACHE.has(k)) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, cor); gr.addColorStop(0.35, cor + 'aa'); gr.addColorStop(1, cor + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    CACHE.set(k, c);
  }
  return CACHE.get(k);
}

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
    this.frutas = new Map();     // id -> { id, x, y, tipo, dono, nasceu }
    this.rastros = [null, null, null, null];
    this.vivoAntes = [false, false, false, false];
    this.lenVis = [0, 0, 0, 0];
    this.mastiga = [null, null, null, null];
    this.lingua = [0, 0, 0, 0];
    this.goles = [[], [], [], []];
    this.sequencia = { n: 0, ate: 0 };
    this.sugadas = [];
    this.mortos = [];
    this.particulas = [];
    this.textos = [];
    this.aneis = [];
    this.feed = [];
    this.anuncio = null;
    this.tremor = 0;
    this.morri = 0;
    this.turboAntes = false;
    this.ultimoBip = null;
    this.vagalumes = Array.from({ length: 22 }, () => ({ x: Math.random() * LARGURA, y: 200 + Math.random() * 950, f: Math.random() * 9, v: 0.3 + Math.random() * 0.6 }));
    this.folhas = Array.from({ length: 7 }, () => this.novaFolha(Math.random() * ALTURA));

    this.teclas = new Set();
    this.mira = null;            // ângulo que eu quero
    this.mouseV = null;
    this.mouseTurbo = false;
    this.toques = new Map();
    this.toque = matchMedia('(pointer: coarse)').matches;
    this.enviado = { ang: null, turbo: false, em: 0 };
    this.encerrado = false;
    this.chegou = performance.now();

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
    window.speechSynthesis?.cancel();
  }

  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? 'verde'; }
  tom(i) { return TOM[this.cor(i)] ?? '#fff'; }
  nome(i) { return (this.op.jogadores[i]?.name ?? NOME[this.cor(i)] ?? '?').split(' ')[0]; }
  get ultimo() { return this.quadros[this.quadros.length - 1] ?? null; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    if (this.encerrado) return;
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.quadros.push(e);
    if (this.quadros.length > 30) this.quadros.shift();
    if (e.fr) {
      const vistas = new Set();
      for (const [id, x, y, tipo, dono] of e.fr) {
        vistas.add(id);
        if (!this.frutas.has(id)) this.frutas.set(id, { id, x, y, tipo, dono, nasceu: agora + (tipo === 'bola' ? 0 : Math.random() * 200) });
      }
      // some no tempo do desenho (que anda ATRASO atrás), não na chegada: senão a fruta some antes da boca chegar
      for (const f of this.frutas.values()) if (!vistas.has(f.id)) f.some ??= e.agora;
    }
    for (const ev of e.ev ?? []) {
      if (ev.id > this.vistos) { this.vistos = ev.id; this.eventosPendentes.push({ ...ev, quando: e.agora }); }
    }
    if (e.fim) this.encerrar();
  }

  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.toques.clear(); this.teclas.clear(); this.mouseTurbo = false;
    this.op.onEntrada({ ang: this.mira ?? 0, turbo: false });
  }

  interpolar(t) {
    const q = this.quadros;
    if (!q.length) return null;
    let i = q.length - 1;
    while (i > 0 && q[i - 1].agora > t) i--;
    const b = q[i], a = q[i - 1] ?? b;
    const k = b.agora === a.agora ? 1 : Math.min(1, Math.max(0, (t - a.agora) / (b.agora - a.agora)));
    return b.c.map((cb, j) => {
      const ca = a.c[j] ?? cb;
      const kk = !ca[4] || Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) > 80 ? 1 : k;
      return { x: lerp(ca[0], cb[0], kk), y: lerp(ca[1], cb[1], kk), ang: lerpAng(ca[2], cb[2], kk), len: cb[3], vivo: !!cb[4], turbo: !!cb[5], prot: !!cb[6] };
    });
  }

  /** O corpo: o rastro das cabeças que eu desenhei (mesma conta do servidor). */
  rastrear(cobras) {
    for (const [i, s] of cobras.entries()) {
      if (!s.vivo) { this.vivoAntes[i] = false; continue; }
      let r = this.rastros[i];
      if (!r || !this.vivoAntes[i] || Math.hypot(s.x - r[0][0], s.y - r[0][1]) > 60) {
        r = this.rastros[i] = rastroInicial(s.x, s.y, s.ang, s.len);
        this.lenVis[i] = s.len;
      } else if (Math.hypot(s.x - r[0][0], s.y - r[0][1]) > 0.8) r.unshift([s.x, s.y]);
      aparar(r, s.len + 2);
      this.vivoAntes[i] = true;
    }
  }

  // ----------------------------------------------------------- eventos

  tratarEventos(t, cobras, agora) {
    while (this.eventosPendentes.length && this.eventosPendentes[0].quando <= t) {
      const e = this.eventosPendentes.shift();
      const longe = t - e.quando > 1500;   // aba voltou do fundo: só o estado, sem festa
      if (e.tipo === 'fogo') { this.anunciar('VAI!', '#ffd23d'); som.bip(true); }
      if (e.tipo === 'come') this.comeu(e, cobras, agora, longe);
      if (e.tipo === 'abate') this.abate(e, agora, longe);
      if (e.tipo === 'renasce' && !longe) {
        this.aneis.push({ x: e.x, y: e.y, t0: agora, cor: this.tom(e.i) });
        for (let k = 0; k < 18; k++) this.faisca(e.x, e.y, this.tom(e.i), 220);
        if (e.i === this.eu) { som.renasce(); this.texto(e.x, e.y - 40, 'DE VOLTA!', '#fff', 26); }
      }
    }
  }

  comeu(e, cobras, agora, longe) {
    this.frutas.delete(e.f);
    if (longe) return;
    const eu = e.i === this.eu;
    this.sugadas.push({ x: e.x, y: e.y, tipo: e.t, dono: e.dono, i: e.i, t0: agora, giro: (Math.random() - 0.5) * 8 });
    this.mastiga[e.i] = { t0: agora, forte: e.t !== 'bola' };
    this.goles[e.i].push(agora + 200);
    if (this.goles[e.i].length > 6) this.goles[e.i].shift();
    if (e.t === 'bola') {
      if (eu) som.bolinha();
      return;
    }
    // suco espirrando da mordida, pra trás e pros lados da boca
    const a = cobras?.[e.i]?.ang ?? 0;
    for (let k = 0; k < (e.t === 'moeda' ? 22 : 14); k++) {
      const d = a + Math.PI + (Math.random() - 0.5) * 2.6, v = 90 + Math.random() * 170;
      this.particulas.push({ x: e.x, y: e.y, vx: Math.cos(d) * v, vy: Math.sin(d) * v, vida: 0.35 + Math.random() * 0.35, t: 0, cor: SUCO[e.t], r: 1.5 + Math.random() * 2.5 });
    }
    this.texto(e.x, e.y - 18, `+${e.v}`, e.t === 'moeda' ? '#ffd23d' : this.tom(e.i), e.v >= 5 ? 30 : 22);
    if (!eu) return;
    this.sequencia = agora < this.sequencia.ate ? { n: this.sequencia.n + 1, ate: agora + 1400 } : { n: 0, ate: agora + 1400 };
    if (e.t === 'moeda') { som.moeda(); this.anunciar('COROA DE OURO! +8', '#ffd23d', false); }
    else som.come(this.sequencia.n);
    if (this.sequencia.n === 4) this.anunciar('ESFOMEADA!', '#6be43c', false);
    if (this.sequencia.n === 8) this.anunciar('INSACIÁVEL!', '#ff6fc8', false);
  }

  abate(e, agora, longe) {
    const i = e.alvo;
    const r = this.rastros[i];
    this.rastros[i] = null;
    this.vivoAntes[i] = false;
    if (!longe && r) {
      const pts = amostrar(r, Math.max(2, e.len));
      const R = raio(e.len);
      const [cx, cy] = pts[Math.floor(pts.length / 2)];
      this.mortos.push({ i, cor: this.cor(i), t0: agora, R, ang: Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]),
        gomos: pts.slice(1).map(([x, y]) => { const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5); const v = 60 + Math.random() * 160; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v }; }),
        cab: { x: pts[0][0], y: pts[0][1], vx: (Math.random() - 0.5) * 360, vy: (Math.random() - 0.5) * 360, giro: (Math.random() < 0.5 ? -1 : 1) * 9 } });
      for (let k = 0; k < 26; k++) this.faisca(e.x, e.y, this.tom(i), 300);
    }
    const quem = this.nome(i);
    const txt = e.causa === 'saiu' ? `${quem} saiu`
      : e.de != null ? `${this.nome(e.de)} derrubou ${quem}`
      : e.causa === 'pedra' ? `${quem} bateu na pedra` : `${quem} bateu na parede`;
    this.feed.push({ txt, t0: agora, cor: this.tom(e.de ?? i) });
    if (this.feed.length > 4) this.feed.shift();
    if (longe || e.causa === 'saiu') return;
    if (i === this.eu) {
      this.tremor = 14; this.morri = agora;
      som.morte();
      this.anunciar(e.de != null ? 'ENGOLIDA!' : 'BATEU!', '#ff4a3a', false);
      if (e.de != null) som.fala(`${this.nome(e.de)} te pegou`);
    } else {
      som.morte(0.45);
      if (e.de === this.eu) {
        this.tremor = 6;
        som.engoliu();
        this.anunciar(`DERRUBOU ${quem.toUpperCase()}!`, '#ffd23d', false);
        som.fala('Pegou!');
      }
    }
  }

  anunciar(txt, cor, voz = false) {
    this.anuncio = { txt, cor, t0: performance.now() };
    if (voz) som.fala(txt);
  }
  texto(x, y, txt, cor, tam = 22) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now() }); }
  faisca(x, y, cor, forca = 160) {
    const a = Math.random() * Math.PI * 2, v = forca * (0.3 + Math.random() * 0.7);
    this.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0.5 + Math.random() * 0.4, t: 0, cor, r: 2 + Math.random() * 3 });
  }
  novaFolha(y = -30) {
    return { x: Math.random() * LARGURA, y, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 2, vy: 20 + Math.random() * 25, fase: Math.random() * 6, tam: 8 + Math.random() * 7, cor: Math.random() < 0.5 ? '#3e9b2e' : '#2f7d24' };
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        this.teclas.add(k);
        destravar();
      },
      teclaSobe: (e) => this.teclas.delete(e.key.toLowerCase()),
      desce: (e) => this.ponteiroDesce(e),
      move: (e) => this.ponteiroMove(e),
      sobe: (e) => this.ponteiroSobe(e),
      resize: () => this.redimensionar(),
      blur: () => { this.teclas.clear(); this.mouseTurbo = false; this.toques.clear(); },
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

  paraMundo(x, y) { return { x: (x - this.ox) / this.esc, y: (y - this.oy) / this.esc }; }

  botoes() {
    const s = Math.min(this.vw, this.vh);
    const r = Math.max(34, Math.min(52, s * 0.11));
    return {
      sair: { x: this.vw - 44, y: 10, w: 34, h: 34 },
      mudo: { x: this.vw - 84, y: 10, w: 34, h: 34 },
      turbo: { x: this.vw - r - 18, y: this.vh - r - 22, r },
    };
  }

  ponteiroDesce(e) {
    destravar();
    const v = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'mouse') this.toque = true;
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (e.pointerType === 'mouse') { this.mouseV = v; this.mouseTurbo = true; return; }
    e.preventDefault();
    const noTurbo = Math.hypot(v.x - b.turbo.x, v.y - b.turbo.y) < b.turbo.r * 1.4;
    const guiando = [...this.toques.values()].some((t) => t.tipo === 'guiar');
    // o primeiro dedo guia; o ⚡ ou um segundo dedo em qualquer lugar é turbo
    this.toques.set(e.pointerId, noTurbo || guiando ? { tipo: 'turbo' } : { tipo: 'guiar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  ponteiroMove(e) {
    const v = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse') { this.mouseV = v; this.toque = false; return; }
    const t = this.toques.get(e.pointerId);
    if (!t || t.tipo !== 'guiar') return;
    t.x = v.x; t.y = v.y;
    // joystick que acompanha o dedo: a base vem atrás se o dedo passar do raio
    const R = 60, dx = t.x - t.x0, dy = t.y - t.y0, d = Math.hypot(dx, dy);
    if (d > R) { t.x0 = t.x - dx / d * R; t.y0 = t.y - dy / d * R; }
  }

  ponteiroSobe(e) {
    if (e.pointerType === 'mouse') { this.mouseTurbo = false; return; }
    this.toques.delete(e.pointerId);
  }

  enviarEntrada(cobras) {
    if (this.encerrado) return;
    const meu = cobras?.[this.eu];
    let turbo = this.mouseTurbo || this.teclas.has(' ') || this.teclas.has('shift');
    const k = this.teclas;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (kx || ky) this.mira = Math.atan2(ky, kx);
    else if (!this.toque && this.mouseV && meu?.vivo) {
      const m = this.paraMundo(this.mouseV.x, this.mouseV.y);
      if (Math.hypot(m.x - meu.x, m.y - meu.y) > 12) this.mira = Math.atan2(m.y - meu.y, m.x - meu.x);
    }
    for (const t of this.toques.values()) {
      if (t.tipo === 'turbo') turbo = true;
      else if (Math.hypot(t.x - t.x0, t.y - t.y0) > 8) this.mira = Math.atan2(t.y - t.y0, t.x - t.x0);
    }
    if (this.mira == null) return;
    const ang = Math.round(this.mira * 100) / 100;
    const agora = performance.now();
    const mudou = ang !== this.enviado.ang || turbo !== this.enviado.turbo;
    if ((mudou && agora - this.enviado.em > 45) || agora - this.enviado.em > 400) {
      this.op.onEntrada({ ang, turbo });
      this.enviado = { ang, turbo, em: agora };
    }
    if (turbo && !this.turboAntes && meu?.vivo && meu.len > TURBO.min) som.turbo();
    this.turboAntes = turbo;
  }

  // ------------------------------------------------------------- desenho

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    this.vw = w; this.vh = h;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // em pé o piso enche a largura (a moldura do templo pode sobrar pros lados)
    this.esc = Math.min(w / (CAMPO.x1 - CAMPO.x0 + 24), h / ALTURA);
    this.ox = w / 2 - ((CAMPO.x0 + CAMPO.x1) / 2) * this.esc;
    this.oy = (h - ALTURA * this.esc) / 2;
    this.vinheta = null;
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    const est = this.ultimo;
    const t = agora + (this.desvio ?? 0) - ATRASO;
    const cobras = this.interpolar(t);
    this.tDesenho = t;
    if (cobras) {
      this.rastrear(cobras);
      this.tratarEventos(t, cobras, agora);
      this.enviarEntrada(cobras);
    }
    if (!this.encerrado && !this.travou && est?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#050c07';
    g.fillRect(0, 0, this.vw, this.vh);
    this.tremor = Math.max(0, this.tremor - dt * 40);
    const tx = (Math.random() - 0.5) * this.tremor, ty = (Math.random() - 0.5) * this.tremor;
    g.setTransform(this.dpr * this.esc, 0, 0, this.dpr * this.esc, this.dpr * (this.ox + tx), this.dpr * (this.oy + ty));

    this.desenharTemplo(g, agora, dt);
    this.desenharFrutas(g, agora);
    if (cobras) {
      const lider = this.lider(cobras);
      const ordem = [...cobras.keys()].filter((i) => cobras[i].vivo).sort((a, b) => (a === this.eu) - (b === this.eu) || cobras[a].len - cobras[b].len);
      this.desenharSugadas(g, cobras, agora);
      for (const i of ordem) this.desenharCobra(g, i, cobras[i], agora, dt, i === lider, est);
    }
    this.desenharMortos(g, agora, dt);
    this.desenharParticulas(g, dt);
    this.desenharTextos(g, agora);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.desenharVinheta(g);
    if (est && cobras) this.desenharHud(g, est, cobras, agora);
    this.desenharControles(g, cobras);
  }

  lider(cobras) {
    let melhor = null;
    for (const [i, c] of cobras.entries()) if (c.vivo && !this.ultimo?.fora?.[i] && (melhor == null || c.len > cobras[melhor].len)) melhor = i;
    if (melhor == null) return null;
    return cobras.filter((c) => c.vivo && c.len === cobras[melhor].len).length > 1 ? null : melhor;
  }

  // ---------------------------------------------------------- cenário

  desenharTemplo(g, agora, dt) {
    if (pronto(IMG.fundo)) g.drawImage(IMG.fundo, 0, 0, LARGURA, ALTURA);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // tochas
    for (const [x, y] of [[140, 58], [585, 58]]) {
      const f = 0.75 + Math.sin(agora / 70 + x) * 0.12 + Math.sin(agora / 23 + x * 3) * 0.08;
      g.globalAlpha = 0.55 * f;
      g.drawImage(brilho('#ff9a2a'), x - 110 * f, y - 90 * f, 220 * f, 220 * f);
    }
    // olhos da estátua
    const olho = 0.4 + 0.35 * Math.sin(agora / 600);
    g.globalAlpha = olho;
    for (const x of [333, 388]) g.drawImage(brilho('#ffcf3a'), x - 22, 92 - 22, 44, 44);
    // ouro brilhando nos cantos de baixo
    for (let k = 0; k < 6; k++) {
      const fase = (agora / 900 + k * 1.7) % 6;
      if (fase > 1) continue;
      const x = k % 2 ? 40 + ((k * 53) % 90) : 600 + ((k * 37) % 100), y = 1110 + ((k * 61) % 140);
      const s = Math.sin(fase * Math.PI);
      g.globalAlpha = s;
      estrela(g, x, y, 10 * s, '#fff6c0');
    }
    // vaga-lumes
    for (const v of this.vagalumes) {
      v.f += dt * v.v;
      const x = v.x + Math.sin(v.f * 1.3) * 40, y = v.y + Math.cos(v.f) * 30;
      g.globalAlpha = 0.25 + 0.55 * Math.max(0, Math.sin(v.f * 3));
      g.drawImage(brilho('#c8ff6a'), x - 10, y - 10, 20, 20);
    }
    g.restore();
    // folhas caindo
    for (const [k, f] of this.folhas.entries()) {
      f.y += f.vy * dt; f.rot += f.vr * dt; f.fase += dt * 1.5;
      if (f.y > ALTURA + 20) this.folhas[k] = this.novaFolha();
      g.save();
      g.translate(f.x + Math.sin(f.fase) * 30, f.y);
      g.rotate(f.rot);
      g.scale(1, 0.4 + Math.abs(Math.sin(f.fase)) * 0.6);
      g.fillStyle = f.cor; g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(0, 0, f.tam, f.tam * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1c4a15'; g.lineWidth = 1; g.beginPath(); g.moveTo(-f.tam, 0); g.lineTo(f.tam, 0); g.stroke();
      g.restore();
    }
    // anéis de quem renasceu
    this.aneis = this.aneis.filter((a) => agora - a.t0 < 700);
    for (const a of this.aneis) {
      const k = (agora - a.t0) / 700;
      g.strokeStyle = a.cor; g.globalAlpha = 1 - k; g.lineWidth = 6 * (1 - k) + 1;
      g.beginPath(); g.arc(a.x, a.y, 10 + 70 * sai(k), 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  }

  desenharFrutas(g, agora) {
    for (const f of this.frutas.values()) {
      if (f.some != null && this.tDesenho >= f.some) { this.frutas.delete(f.id); continue; }
      const nasce = Math.min(1, Math.max(0, (agora - f.nasceu) / 380));
      if (nasce <= 0) continue;
      const s = volta(nasce);
      if (f.tipo === 'bola') {
        const cor = f.dono >= 0 ? (this.cor(f.dono) === 'arcoiris' ? arcoIris(f.id, agora) : this.tom(f.dono)) : '#fff';
        const r = (7 + Math.sin(agora / 180 + f.id) * 1.5) * s;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.7;
        g.drawImage(brilho(cor.startsWith('#') ? cor : '#ffffff'), f.x - r * 2.6, f.y - r * 2.6, r * 5.2, r * 5.2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = cor;
        g.beginPath(); g.arc(f.x, f.y, r * 0.75, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.beginPath(); g.arc(f.x - r * 0.25, f.y - r * 0.25, r * 0.25, 0, Math.PI * 2); g.fill();
        continue;
      }
      const tam = TAM_FRUTA[f.tipo] * s;
      const bob = Math.sin(agora / 320 + f.id * 1.7) * 3;
      // sombra e brilho
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath(); g.ellipse(f.x, f.y + tam * 0.42, tam * 0.36 * (1 - bob / 12), tam * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.15 * Math.sin(agora / 250 + f.id);
      g.drawImage(brilho(f.tipo === 'moeda' ? '#ffcf3a' : '#ffefb0'), f.x - tam, f.y - tam + bob, tam * 2, tam * 2);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      if (f.tipo === 'moeda') {
        // moeda girando com a coroa
        const gira = Math.cos(agora / 260 + f.id);
        g.save();
        g.translate(f.x, f.y + bob);
        g.scale(Math.max(0.12, Math.abs(gira)), 1);
        const gr = g.createRadialGradient(-tam * 0.15, -tam * 0.15, 2, 0, 0, tam * 0.55);
        gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.6, '#f2b31c'); gr.addColorStop(1, '#a76a05');
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, tam * 0.52, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#7a4a00'; g.lineWidth = 2.5; g.stroke();
        if (gira > 0) g.drawImage(emoji('👑', 48), -tam * 0.38, -tam * 0.4, tam * 0.76, tam * 0.76);
        g.restore();
        if ((agora / 400 + f.id) % 3 < 0.5) { g.globalCompositeOperation = 'lighter'; estrela(g, f.x + tam * 0.35, f.y - tam * 0.35 + bob, 7, '#fff'); g.globalCompositeOperation = 'source-over'; }
        continue;
      }
      const balanco = Math.sin(agora / 500 + f.id) * 0.12;
      g.save();
      g.translate(f.x, f.y + bob);
      g.rotate(balanco);
      g.drawImage(emoji(EMOJI[f.tipo]), -tam * 0.625, -tam * 0.625, tam * 1.25, tam * 1.25);
      g.restore();
    }
  }

  // ------------------------------------------------------------ cobras

  desenharCobra(g, i, s, agora, dt, lider, est) {
    const r = this.rastros[i];
    if (!r) return;
    const cor = this.cor(i);
    // cresce aos poucos (a fruta "desce" e o rabo estica)
    this.lenVis[i] = this.lenVis[i] + (s.len - this.lenVis[i]) * Math.min(1, dt * 6);
    const n = Math.max(3, Math.round(this.lenVis[i]));
    const pts = amostrar(r, n);
    const R = raio(s.len);
    const gomo = IMG[`${cor}-gomo`];
    const goles = this.goles[i] = this.goles[i].filter((t0) => agora - t0 < (n / 22) * 1000 + 300);
    const piscando = s.prot && est?.fase === 'jogo';
    g.save();
    if (piscando) g.globalAlpha = 0.45 + 0.35 * Math.sin(agora / 55);

    const tamanhos = pts.map((_, k) => {
      const rabo = k > n * 0.6 ? 1 - ((k - n * 0.6) / (n * 0.4)) * 0.55 : 1;
      let gole = 0;
      for (const t0 of goles) { const pos = ((agora - t0) / 1000) * 22; gole += 0.55 * Math.exp(-((k - pos) ** 2) / 3); }
      return R * 2.3 * rabo * (1 + gole);
    });
    // rebolado: desloca de lado, mais no meio do corpo
    const onda = pts.map(([x, y], k) => {
      if (k === 0) return [x, y];
      const [px, py] = pts[k - 1];
      const d = Math.hypot(x - px, y - py) || 1;
      const o = Math.sin(agora / 110 - k * 0.55) * 1.8 * Math.min(1, k / 4);
      return [x - ((y - py) / d) * o, y + ((x - px) / d) * o];
    });

    // turbo: rastro de luz embaixo
    if (s.turbo) {
      g.globalCompositeOperation = 'lighter';
      const b = brilho(cor === 'arcoiris' ? '#ffffff' : TOM[cor]);
      for (let k = 0; k < n; k += 2) { const [x, y] = onda[k]; const sz = tamanhos[k] * 1.9; g.drawImage(b, x - sz / 2, y - sz / 2, sz, sz); }
      g.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.6) { const [x, y] = onda[n - 1]; this.faisca(x, y, TOM[cor], 60); }
    }
    // sombras primeiro, depois os gomos do rabo pra cabeça, cada um virado pro rumo do corpo
    g.fillStyle = 'rgba(0,0,0,.3)';
    for (let k = n - 1; k >= 1; k--) {
      const [x, y] = onda[k], sz = tamanhos[k];
      g.beginPath(); g.ellipse(x + 3, y + 5, sz * 0.48, sz * 0.42, 0, 0, Math.PI * 2); g.fill();
    }
    for (let k = n - 1; k >= 1; k--) {
      const [x, y] = onda[k], sz = tamanhos[k];
      const [px, py] = onda[k - 1];
      if (pronto(gomo)) { g.save(); g.translate(x, y); g.rotate(Math.atan2(py - y, px - x)); g.drawImage(gomo, -sz / 2, -sz / 2, sz, sz); g.restore(); }
      else { g.fillStyle = TOM[cor]; g.beginPath(); g.arc(x, y, sz / 2, 0, Math.PI * 2); g.fill(); }
    }

    // cabeça vista de cima: a folha olha pra cima, gira pro rumo. 0 = com língua, 1 = sem
    if (agora > this.lingua[i] + 1600 + ((i * 977) % 1400)) this.lingua[i] = agora;
    const [hx, hy] = pts[0];
    const larg = R * 2.9;
    // comendo: bote pra frente, depois nhac-nhac (a cabeça incha e achata no rumo)
    const m = this.mastiga[i], dm = m ? agora - m.t0 : Infinity, dur = m?.forte ? MASTIGA : 220;
    let quadro = !s.turbo && agora - this.lingua[i] < 320 && Math.floor((agora - this.lingua[i]) / 80) % 2 === 0 ? 0 : 1;
    let escala = 1, achata = 0, bote = 0;
    if (dm < dur) {
      const k = dm / dur, pulso = Math.sin(((dm % 90) / 90) * Math.PI) * (1 - k);
      quadro = 1;
      escala = 1 + pulso * (m.forte ? 0.24 : 0.12);
      achata = pulso * (m.forte ? 0.22 : 0.1);
      bote = dm < 110 ? Math.sin((dm / 110) * Math.PI) * R * 0.7 : 0;
    } else {
      // fruta logo à frente: língua tremendo e o pescoço esticando
      let perto = 0;
      for (const f of this.frutas.values()) {
        const d = Math.hypot(f.x - hx, f.y - hy);
        if (d < R + 80 && Math.cos(Math.atan2(f.y - hy, f.x - hx) - s.ang) > 0.35) perto = Math.max(perto, Math.min(1, 1 - (d - R - 10) / 70));
      }
      if (perto > 0) { quadro = Math.floor(agora / 70) % 2; escala = 1 + 0.1 * perto; bote = perto * R * 0.35; }
    }
    const cab = IMG[`${cor}-cabeca-${quadro}`];
    const cx = hx + Math.cos(s.ang) * bote, cy = hy + Math.sin(s.ang) * bote;
    g.fillStyle = 'rgba(0,0,0,.32)';
    g.beginPath(); g.ellipse(cx + 3, cy + 6, larg * 0.5, larg * 0.5, 0, 0, Math.PI * 2); g.fill();
    if (pronto(cab)) {
      const h = (larg * cab.naturalHeight) / cab.naturalWidth;
      g.save();
      g.translate(cx, cy);
      g.rotate(s.ang + Math.PI / 2 + Math.sin(agora / 140 + i) * 0.06);
      g.scale(escala * (1 + achata), escala * (1 - achata));
      g.drawImage(cab, -larg / 2, quadro === 0 ? -h * 0.6 : -h * 0.45, larg, h);
      g.restore();
    }
    g.restore();
    const h = larg;

    // coroa da maior, meu anel e nome
    const topo = hy - h * 0.75;
    if (lider != null && lider === i && est?.fase === 'jogo') {
      g.save();
      g.translate(hx, topo - 8 + Math.sin(agora / 250) * 3);
      g.rotate(Math.sin(agora / 400) * 0.2);
      g.drawImage(emoji('👑', 48), -15, -15, 30, 30);
      g.restore();
    }
    if (i === this.eu && (est?.fase === 'contagem' || (est?.fimEm && TEMPO_PARTIDA - (est.fimEm - est.agora) < 2500))) {
      const k = (agora / 900) % 1;
      g.strokeStyle = '#fff'; g.globalAlpha = 1 - k; g.lineWidth = 4;
      g.beginPath(); g.arc(hx, hy, R * 2 + k * 40, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      rotulo(g, 'VOCÊ', hx, topo - 26, '#fff', 20);
    } else if (i !== this.eu) rotulo(g, this.nome(i), hx, topo - (lider === i ? 26 : 4), TOM[cor], 15);
  }

  desenharMortos(g, agora, dt) {
    this.mortos = this.mortos.filter((m) => agora - m.t0 < 1100);
    for (const m of this.mortos) {
      const k = (agora - m.t0) / 1100;
      const gomo = IMG[`${m.cor}-gomo`];
      g.globalAlpha = 1 - k;
      for (const p of m.gomos) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
        const sz = m.R * 2.3 * (1 - k * 0.7);
        if (pronto(gomo)) g.drawImage(gomo, p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      const c = m.cab;
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.95; c.vy *= 0.95;   // de cima: escorrega girando, sem gravidade
      const cab = IMG[`${m.cor}-cabeca-1`];
      if (pronto(cab)) {
        const w = m.R * 2.9, h = (w * cab.naturalHeight) / cab.naturalWidth;
        g.save(); g.translate(c.x, c.y); g.rotate(m.ang + Math.PI / 2 + c.giro * k);
        g.drawImage(cab, -w / 2, -h / 2, w, h);
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  /** Fruta comida voa girando pra boca e encolhe (desenhada antes das cobras: some atrás da cabeça). */
  desenharSugadas(g, cobras, agora) {
    this.sugadas = this.sugadas.filter((s) => agora - s.t0 < 260);
    for (const s of this.sugadas) {
      const k = (agora - s.t0) / 260;
      const cab = this.rastros[s.i]?.[0], c = cobras?.[s.i];
      const alvo = cab && c ? [cab[0] + Math.cos(c.ang) * raio(c.len) * 0.6, cab[1] + Math.sin(c.ang) * raio(c.len) * 0.6] : [s.x, s.y];
      const x = lerp(s.x, alvo[0], sai(k)), y = lerp(s.y, alvo[1], sai(k)) - Math.sin(k * Math.PI) * 10;
      const tam = (s.tipo === 'bola' ? 12 : TAM_FRUTA[s.tipo]) * (1 + 0.15 * Math.sin(k * Math.PI) - k * 0.75);
      if (s.tipo === 'bola') { g.fillStyle = s.dono >= 0 ? this.tom(s.dono) : '#fff'; g.beginPath(); g.arc(x, y, tam / 2, 0, Math.PI * 2); g.fill(); continue; }
      g.save(); g.translate(x, y); g.rotate(s.giro * k);
      g.drawImage(emoji(EMOJI[s.tipo]), -tam * 0.625, -tam * 0.625, tam * 1.25, tam * 1.25);
      g.restore();
    }
  }

  desenharParticulas(g, dt) {
    g.globalCompositeOperation = 'lighter';
    this.particulas = this.particulas.filter((p) => (p.t += dt) < p.vida);
    for (const p of this.particulas) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
      const k = 1 - p.t / p.vida;
      g.globalAlpha = k;
      const sz = p.r * 3 * k + 2;
      g.drawImage(brilho(p.cor === '#ffffff' ? '#ffffff' : p.cor), p.x - sz, p.y - sz, sz * 2, sz * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 900);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 900;
      g.globalAlpha = 1 - k * k;
      rotulo(g, t.txt, t.x, t.y - 50 * sai(k), t.cor, t.tam * (k < 0.15 ? volta(k / 0.15) : 1));
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hud

  desenharVinheta(g) {
    if (!this.vinheta) {
      const gr = g.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.45, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
      this.vinheta = gr;
    }
    g.fillStyle = this.vinheta;
    g.fillRect(0, 0, this.vw, this.vh);
  }

  desenharHud(g, est, cobras, agora) {
    const tServ = agora + (this.desvio ?? 0);
    // relógio
    const resta = est.fase === 'jogo' ? Math.max(0, est.fimEm - tServ) : TEMPO_PARTIDA;
    const seg = Math.ceil(resta / 1000);
    const urgente = est.fase === 'jogo' && seg <= 10;
    if (urgente && seg !== this.ultimoBip && seg > 0) { this.ultimoBip = seg; som.bip(seg <= 3); }
    const txt = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
    const cx = this.vw / 2, pul = urgente ? 1 + 0.12 * Math.max(0, Math.sin((resta % 1000) / 1000 * Math.PI)) : 1;
    g.save();
    g.translate(cx, 30);
    g.scale(pul, pul);
    pilula(g, -46, -18, 92, 36, urgente ? 'rgba(160,20,10,.85)' : 'rgba(10,20,12,.75)', urgente ? '#ff6a4a' : '#d9a62a');
    g.font = '900 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.fillText(txt, 0, 1);
    g.restore();

    // placar
    const ordem = [...cobras.keys()].sort((a, b) => (est.fora[a] - est.fora[b]) || ((cobras[b].vivo ? cobras[b].len : 0) - (cobras[a].vivo ? cobras[a].len : 0)) || (est.comeu[b] - est.comeu[a]));
    const lider = this.lider(cobras);
    let y = 12;
    for (const [pos, i] of ordem.entries()) {
      const c = cobras[i], eu = i === this.eu, w = 124;
      g.globalAlpha = est.fora[i] ? 0.4 : 1;
      pilula(g, 8, y, w, 26, eu ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.55)', eu ? '#fff' : 'rgba(255,255,255,.15)');
      const gomo = IMG[`${this.cor(i)}-gomo`];
      if (pronto(gomo)) g.drawImage(gomo, 13, y + 4, 18, 18);
      g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(`${pos + 1}. ${eu ? 'Você' : this.nome(i)}`.slice(0, 13), 35, y + 13.5);
      g.textAlign = 'right'; g.fillStyle = c.vivo ? TOM[this.cor(i)] : '#888';
      g.font = '900 13px system-ui, sans-serif';
      g.fillText(est.fora[i] ? 'saiu' : c.vivo ? String(c.len) : '💀', 8 + w - 8, y + 13.5);
      if (lider === i) g.drawImage(emoji('👑', 32), 8 + w - 4, y - 2, 18, 18);
      y += 30;
    }
    g.globalAlpha = 1;

    // botões sair / som
    const b = this.botoes();
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = b[k];
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '16px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }

    // feed de abates
    this.feed = this.feed.filter((f) => agora - f.t0 < 4500);
    g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const [k, f] of this.feed.entries()) {
      const a = Math.min(1, (4500 - (agora - f.t0)) / 500);
      g.globalAlpha = a;
      const w = g.measureText(f.txt).width + 16, yy = 56 + k * 22;
      pilula(g, this.vw - 10 - w, yy - 10, w, 20, 'rgba(0,0,0,.55)', f.cor);
      g.fillStyle = '#fff'; g.fillText(f.txt, this.vw - 18, yy + 0.5);
    }
    g.globalAlpha = 1;

    // contagem
    if (est.fase === 'contagem') {
      const falta = Math.max(0, est.faseAte - tServ);
      const n = Math.ceil(falta / 1000);
      if (n !== this.ultimaContagem && n > 0) { this.ultimaContagem = n; som.bip(false); }
      const k = 1 - (falta % 1000) / 1000;
      g.save();
      g.translate(this.vw / 2, this.vh * 0.42);
      g.scale(volta(Math.min(1, k * 2.2)) * 1.0, volta(Math.min(1, k * 2.2)));
      g.globalAlpha = 1 - k * 0.6;
      g.font = '900 120px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(String(n || ''), 0, 0);
      g.fillStyle = '#ffd23d'; g.fillText(String(n || ''), 0, 0);
      g.restore();
      g.globalAlpha = 1;
      const dica = this.toque ? 'Arraste o dedo pra guiar · segure ⚡ pra correr' : 'O mouse guia · segure o clique (ou espaço) pra correr';
      rotulo(g, 'Coma frutas e fique a MAIOR cobra!', this.vw / 2, this.vh * 0.42 + 90, '#fff', 17);
      rotulo(g, dica, this.vw / 2, this.vh * 0.42 + 116, '#cfe9c4', 13);
    }

    // morri: falta pra renascer
    const meu = cobras[this.eu];
    if (!meu.vivo && est.fase === 'jogo' && !est.fora[this.eu] && this.morri) {
      const k = Math.max(0, 2.5 - (agora - this.morri) / 1000);
      rotulo(g, `Renasce em ${k.toFixed(1)}s`, this.vw / 2, this.vh * 0.55, '#fff', 20);
    }

    // anúncio
    if (this.anuncio) {
      const k = (agora - this.anuncio.t0) / 1300;
      if (k >= 1) this.anuncio = null;
      else {
        g.save();
        g.translate(this.vw / 2, this.vh * 0.3);
        const s = k < 0.2 ? volta(k / 0.2) : 1;
        g.scale(s, s);
        g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        const tam = Math.min(44, (this.vw * 0.9) / Math.max(4, this.anuncio.txt.length) * 1.6);
        rotulo(g, this.anuncio.txt, 0, 0, this.anuncio.cor, tam);
        g.restore();
      }
    }
  }

  desenharControles(g, cobras) {
    if (!this.toque) return;
    const b = this.botoes().turbo;
    const meu = cobras?.[this.eu];
    const pode = meu?.vivo && meu.len > TURBO.min;
    const ligado = [...this.toques.values()].some((t) => t.tipo === 'turbo');
    g.globalAlpha = pode ? 1 : 0.35;
    g.fillStyle = ligado ? 'rgba(255,190,40,.55)' : 'rgba(0,0,0,.45)';
    g.strokeStyle = '#ffcf3a'; g.lineWidth = 3;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `${b.r * 0.9}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.fillText('⚡', b.x, b.y + 2);
    g.globalAlpha = 1;
    for (const t of this.toques.values()) {
      if (t.tipo !== 'guiar') continue;
      g.fillStyle = 'rgba(255,255,255,.12)'; g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(t.x0, t.y0, 60, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.arc(t.x, t.y, 24, 0, Math.PI * 2); g.fill();
    }
  }
}

function estrela(g, x, y, r, cor) {
  g.fillStyle = cor;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.25 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
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

