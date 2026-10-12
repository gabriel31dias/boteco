import { ALTURA, DECORACAO, LARGURA, MAPA, RAIO_TANQUE, TEMPO_RODADA, VEL_BALA, VIDA, mover } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho e controles da batalha de tanques (canvas 2D). O servidor manda o
 * estado 30x por segundo; aqui ele é desenhado ~90ms no passado, interpolando
 * entre dois quadros — fica liso mesmo com a rede tremendo. Os efeitos
 * (explosão, faísca, fumaça, tremor) disparam pelos eventos de cada quadro, na
 * mesma linha do tempo.
 *
 * O meu tanque não espera a rede: cada 33ms de controle vira um comando
 * numerado que move o tanque aqui na hora (previsão) e vai pro servidor. Quando
 * o estado volta, a posição oficial + os comandos que o servidor ainda não
 * confirmou dão a posição certa; a diferença (se houver) some aos poucos.
 *
 * Celular em pé: o jogo inteiro (mundo, placar e controles) é desenhado girado
 * 90°, em paisagem; o toque é desgirado em `paraVirtual`.
 */

const A = import.meta.glob('../../assets/tanque/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}

const ATRASO = 90;            // ms de atraso do desenho: folga pra interpolar
// Cor escolhida no lobby -> tom da interface e sprites do atlas.
const TOM = { azul: '#3b8cff', vermelho: '#ff4646', verde: '#3ddc5a', amarelo: '#ffc53d' };
const BRILHO = { azul: 'rgba(90,170,255,.8)', vermelho: 'rgba(255,90,60,.8)', verde: 'rgba(110,255,120,.8)', amarelo: 'rgba(255,210,80,.8)' };
const BALA = { azul: 'bala-azul', vermelho: 'bala-vermelha', verde: 'bala-verde', amarelo: 'bala-amarela' };
const CORES_PADRAO = ['azul', 'vermelho', 'verde', 'amarelo'];
const ESCALA_TANQUE = 0.6;    // sprite do atlas -> mundo (raio 22 no fundo do deserto)
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string, avatar?: string|null}[], onEntrada: (e: object) => void, onSair: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.quadros = [];          // estados recebidos, em ordem
    this.desvio = null;         // relógio do servidor - performance.now()
    this.eventosPendentes = []; // eventos esperando a hora deles no desenho
    this.vistos = 0;            // maior id de evento já tratado
    this.efeitos = [];          // explosões animadas
    this.particulas = [];
    this.textos = [];           // dano subindo
    this.crateras = [];
    this.flash = [0, 0, 0, 0];  // até quando cada tanque pisca (acerto)
    this.disparo = [0, 0, 0, 0]; // até quando aparece o clarão do cano
    this.tremor = 0;
    this.rodadaVista = 0;
    this.ultimoBip = null;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });

    // controles
    this.teclas = new Set();
    this.mouse = null;          // posição no mundo
    this.mouseFogo = false;
    this.toques = new Map();    // pointerId -> { tipo: 'mover'|'mirar', x0, y0, x, y }
    this.mira = [0, Math.PI, Math.PI / 2, -Math.PI / 2][op.assento] ?? 0;
    this.cmdSeq = 0;
    this.pendentes = [];        // comandos ainda não confirmados pelo servidor
    this.acumulado = 0;         // ms de controle ainda não virados em comando
    this.pred = null;           // posição prevista do meu tanque
    this.corr = { x: 0, y: 0 }; // correção visual que vai sumindo
    this.ultimoQuadro = null;
    this.toque = matchMedia('(pointer: coarse)').matches;

    this.ligar();
    this.redimensionar();
    this.rodando = true;
    const quadro = (t) => { if (!this.rodando) return; this.desenhar(t); requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() {
    this.rodando = false;
    this.desligar();
    som.motor(false);
    som.parar();
  }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    this.reconciliar(e);
    const agora = performance.now();
    // O pacote que chegou mais rápido é o que mais se aproxima do relógio do
    // servidor; o desvio só sobe na hora e desce devagar (deriva do relógio).
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.quadros.push(e);
    if (this.quadros.length > 30) this.quadros.shift();
    for (const ev of e.ev ?? []) {
      if (ev.id > this.vistos) { this.vistos = ev.id; this.eventosPendentes.push({ ...ev, t: e.agora }); }
    }
    if (e.rodada !== this.rodadaVista) {
      this.rodadaVista = e.rodada;
      this.crateras = [];
      this.efeitos = [];
      this.particulas = [];
    }
  }

  /** Mundo mínimo pra `mover`: os obstáculos do quadro e o outro tanque onde o servidor disse. */
  mundo(e, eu) {
    const tanques = e.t.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1], vivo: !!o[4] }));
    return { tanques, obstaculos: e.o };
  }

  /** Posição oficial + comandos que o servidor ainda não aplicou = onde eu estou agora. */
  reconciliar(e) {
    const meu = e.t[this.eu];
    const ack = meu[6] ?? 0;
    this.pendentes = this.pendentes.filter((c) => c.s > ack);
    const pos = { x: meu[0], y: meu[1], vivo: !!meu[4] };
    if (e.fase === 'jogo' && pos.vivo) {
      const m = this.mundo(e, pos);
      for (const c of this.pendentes) mover(m, this.eu, c.mx, c.my, c.dt / 1000);
    }
    if (this.pred) {
      this.corr.x += this.pred.x - pos.x;
      this.corr.y += this.pred.y - pos.y;
      // salto grande (rodada nova, nasceu de novo): vai direto, sem deslizar
      if (Math.hypot(this.corr.x, this.corr.y) > 60) this.corr = { x: 0, y: 0 };
    }
    this.pred = { x: pos.x, y: pos.y };
  }

  /** Cor do assento `i`: a do estado, a do `start`, ou a padrão do assento. */
  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? CORES_PADRAO[i]; }
  tom(i) { return TOM[this.cor(i)]; }

  get ultimo() { return this.quadros[this.quadros.length - 1] ?? null; }

  /** Estado interpolado no instante `t` (relógio do servidor). */
  interpolar(t) {
    const q = this.quadros;
    if (!q.length) return null;
    let i = q.length - 1;
    while (i > 0 && q[i - 1].agora > t) i--;
    const b = q[i], a = q[i - 1] ?? b;
    const k = b.agora === a.agora ? 1 : Math.min(1, Math.max(0, (t - a.agora) / (b.agora - a.agora)));
    const tanques = b.t.map((tb, j) => {
      const ta = a.t[j] ?? tb;
      return { x: lerp(ta[0], tb[0], k), y: lerp(ta[1], tb[1], k), ang: lerpAng(ta[2], tb[2], k), vida: tb[3], vivo: !!tb[4], movendo: !!tb[5] };
    });
    // bala: anda reto, então é extrapolar a partir do quadro dela
    const extra = Math.max(0, t - b.agora) / 1000;
    const balas = b.b.map(([id, x, y, ang, dono]) => {
      const ba = a.b.find((z) => z[0] === id);
      const px = ba ? lerp(ba[1], x, k) : x, py = ba ? lerp(ba[2], y, k) : y;
      return { id, x: px + Math.cos(ang) * VEL_BALA * extra * (k >= 1 ? 1 : 0), y: py + Math.sin(ang) * VEL_BALA * extra * (k >= 1 ? 1 : 0), ang, dono };
    });
    return { tanques, balas, obst: b.o };
  }

  // ----------------------------------------------------------- eventos

  tratarEventos(t, estado) {
    const meu = estado?.tanques[this.eu];
    const longe = (x, y) => (meu ? Math.max(0.35, 1 - Math.hypot(x - meu.x, y - meu.y) / 1400) : 1);
    while (this.eventosPendentes.length && this.eventosPendentes[0].t <= t) {
      const e = this.eventosPendentes.shift();
      const agora = performance.now();
      switch (e.tipo) {
        case 'tiro':
          this.disparo[e.de] = agora + 90;
          this.explosao(e.x, e.y, 0.35, 3);
          this.fumaca(e.x, e.y, 5, 0.6);
          som.tiro(longe(e.x, e.y));
          break;
        case 'acerto':
          this.flash[e.alvo] = agora + 160;
          this.faiscas(e.x, e.y, 14);
          this.explosao(e.x, e.y, 0.5, 3);
          this.textos.push({ x: e.x, y: e.y - 30, txt: `-${e.dano}`, cor: this.tom(e.alvo), ini: agora });
          this.tremor = Math.max(this.tremor, e.alvo === this.eu ? 9 : 4);
          som.acerto(longe(e.x, e.y));
          break;
        case 'impacto':
          this.faiscas(e.x, e.y, 8);
          this.fumaca(e.x, e.y, 3, 0.5);
          som.impacto(longe(e.x, e.y));
          break;
        case 'caixa':
          this.estilhacos(e.x, e.y, e.vida <= 0 ? 18 : 7);
          this.fumaca(e.x, e.y, e.vida <= 0 ? 6 : 2, 0.7);
          som.caixa(e.vida <= 0, longe(e.x, e.y));
          break;
        case 'explosao':
          this.explosao(e.x, e.y, 1.25, 6);
          this.crateras.push({ x: e.x, y: e.y, s: 1.1 });
          this.fumaca(e.x, e.y, 14, 1.4);
          this.estilhacos(e.x, e.y, 12);
          this.tremor = Math.max(this.tremor, 16);
          som.explosao(false, longe(e.x, e.y));
          break;
        case 'abate':
          this.explosao(e.x, e.y, 1.8, 6);
          setTimeout(() => this.explosao(e.x + 25, e.y - 15, 1.1, 6), 180);
          setTimeout(() => this.explosao(e.x - 20, e.y + 10, 0.9, 6), 360);
          this.crateras.push({ x: e.x, y: e.y + 10, s: 1.4 });
          this.fumaca(e.x, e.y, 22, 1.8);
          this.estilhacos(e.x, e.y, 26);
          this.tremor = 26;
          som.explosao(true, 1);
          break;
        case 'fogo':
          som.bip(true);
          break;
        case 'rodada':
          if (e.vencedor === this.eu) som.vitoria();
          break;
      }
    }
  }

  explosao(x, y, escala, quadros) {
    this.efeitos.push({ x, y, escala, quadros, ini: performance.now(), rot: Math.random() * Math.PI * 2 });
  }

  fumaca(x, y, n, forca) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (10 + Math.random() * 40) * forca;
      this.particulas.push({ tipo: 'fumaca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12, r: 6 + Math.random() * 10 * forca, vida: 0.9 + Math.random() * 0.8, idade: 0 });
    }
  }

  faiscas(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
      this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0.2 + Math.random() * 0.3, idade: 0 });
    }
  }

  estilhacos(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220;
      this.particulas.push({ tipo: 'lasca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, s: 3 + Math.random() * 5, vida: 0.6 + Math.random() * 0.6, idade: 0 });
    }
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
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

  /** Tela (clientX/Y) -> tela virtual em paisagem (desfaz o giro do celular em pé). */
  paraVirtual(cx, cy) {
    return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy };
  }

  /** Tela virtual -> mundo. */
  paraMundo(v) {
    return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc };
  }

  botoes() {
    const s = Math.min(this.vw, this.vh);
    return {
      sair: { x: 14, y: this.vh - 52, w: 40, h: 40 },
      mudo: { x: 62, y: this.vh - 52, w: 40, h: 40 },
      joy: { x: s * 0.2, y: this.vh - s * 0.24, r: s * 0.15 },
      fogo: { x: this.vw - s * 0.2, y: this.vh - s * 0.24, r: s * 0.14 },
    };
  }

  ponteiroDesce(e) {
    destravar();
    const v = this.paraVirtual(e.clientX, e.clientY);
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (e.pointerType === 'mouse') {
      this.mouse = this.paraMundo(v);
      if (e.button === 0 || e.button === 2) this.mouseFogo = true;
      return;
    }
    e.preventDefault();
    this.toque = true;
    // metade esquerda anda, metade direita mira e atira
    this.toques.set(e.pointerId, { tipo: v.x < this.vw / 2 ? 'mover' : 'mirar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  ponteiroMove(e) {
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { this.mouse = this.paraMundo(v); this.toque = false; return; }
    const t = this.toques.get(e.pointerId);
    if (t) { t.x = v.x; t.y = v.y; }
  }

  ponteiroSobe(e) {
    if (e.pointerType === 'mouse') { this.mouseFogo = false; return; }
    this.toques.delete(e.pointerId);
  }

  /** O que eu quero agora; manda pro servidor quando muda (e de 250 em 250ms). */
  enviarEntrada(estado) {
    let mx = 0, my = 0, fogo = false;
    const k = this.teclas;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has(' ') || this.mouseFogo) fogo = true;
    const meu = estado?.tanques[this.eu];
    if (meu && this.mouse && !this.toque) this.mira = Math.atan2(this.mouse.y - meu.y, this.mouse.x - meu.x);

    const r = this.botoes().joy.r;
    for (const t of this.toques.values()) {
      const dx = t.x - t.x0, dy = t.y - t.y0, d = Math.hypot(dx, dy);
      if (t.tipo === 'mover' && d > 6) { const f = Math.min(1, d / r); mx = (dx / d) * f; my = (dy / d) * f; }
      if (t.tipo === 'mirar') { fogo = true; if (d > 12) this.mira = Math.atan2(dy, dx); }
    }
    // no toque, andando sem mirar: o canhão acompanha o caminho
    if (this.toque && ![...this.toques.values()].some((t) => t.tipo === 'mirar') && (mx || my)) this.mira = Math.atan2(my, mx);

    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    mx = Math.round(mx * 100) / 100; my = Math.round(my * 100) / 100;
    const ang = Math.round(this.mira * 100) / 100;

    // 33ms de controle = 1 comando: anda aqui na hora e vai pro servidor
    const agora = performance.now();
    this.acumulado = Math.min(150, this.acumulado + (this.ultimoQuadro == null ? 0 : agora - this.ultimoQuadro));
    this.ultimoQuadro = agora;
    const novos = [];
    const e = this.ultimo;
    while (this.acumulado >= 33) {
      this.acumulado -= 33;
      const c = { s: ++this.cmdSeq, mx, my, dt: 33, ang, fogo };
      novos.push(c);
      this.pendentes.push(c);
      if (e && this.pred && e.fase === 'jogo' && e.t[this.eu]?.[4]) mover(this.mundo(e, this.pred), this.eu, mx, my, 0.033);
    }
    if (novos.length) this.op.onEntrada({ cmds: novos });
    this.andando = !!meu?.vivo && (mx !== 0 || my !== 0) && e?.fase === 'jogo';
    som.motor(this.andando);
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
    // mundo ocupa o máximo da tela virtual, centrado; sobra vira moldura
    this.esc = Math.min(this.vw / LARGURA, this.vh / ALTURA);
    this.ox = (this.vw - LARGURA * this.esc) / 2;
    this.oy = (this.vh - ALTURA * this.esc) / 2;
  }

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, h } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    if (virar) g.scale(-1, 1);
    g.globalAlpha = alfa;
    g.drawImage(im, -w / 2, -hh / 2, w, hh);
    g.restore();
  }

  sombra(x, y, rx, ry) {
    const g = this.ctx;
    g.fillStyle = 'rgba(0,0,0,.32)';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.ultimoDesenho ?? agora)) / 1000);
    this.ultimoDesenho = agora;
    const tServ = this.desvio == null ? 0 : agora + this.desvio - ATRASO;
    const est = this.interpolar(tServ);
    // o meu tanque é desenhado onde a previsão diz, não 90ms no passado
    if (est && this.pred) {
      this.corr.x *= 0.82; this.corr.y *= 0.82;
      const t = est.tanques[this.eu];
      t.x = this.pred.x + this.corr.x;
      t.y = this.pred.y + this.corr.y;
      t.ang = this.mira;
      t.movendo = !!this.andando;
    }
    this.tratarEventos(tServ, est);
    this.enviarEntrada(est);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#120c06';
    g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }

    // ---- mundo
    g.save();
    this.tremor *= 0.88;
    const tx = (Math.random() - 0.5) * this.tremor, ty = (Math.random() - 0.5) * this.tremor;
    g.translate(this.ox + tx, this.oy + ty);
    g.scale(this.esc, this.esc);
    if (pronto(IMG.fundo)) g.drawImage(IMG.fundo, 0, 0, LARGURA, ALTURA);
    for (const c of this.crateras) this.sprite('cratera', c.x, c.y + 6, 80 * c.s, { alfa: 0.9 });

    if (est) {
      // obstáculos (sombra antes, sprite depois)
      for (const [i, o] of MAPA.entries()) {
        const vida = est.obst[i];
        if (o.fixo || (o.tipo === 'barril' && vida === 0)) continue;   // o fixo já está no fundo
        this.sombra(o.x + 4, o.y + o.h / 2 - 2, o.w * 0.55, 7);
      }
      for (const [i, o] of MAPA.entries()) {
        const vida = est.obst[i];
        if (o.tipo === 'caixa') {
          if (vida <= 0) this.sprite('caixa-quebrada', o.x, o.y + 6, o.w * 1.25, { alfa: 0.85 });
          else this.sprite(vida === 1 ? 'caixa-rachada' : 'caixa', o.x, o.y, o.w * 1.12);
        } else if (o.tipo === 'barril') {
          if (vida > 0) this.sprite('barril', o.x, o.y, o.w * 1.15);
        }
      }

      // tanques
      for (const [i, t] of est.tanques.entries()) this.desenharTanque(i, t, agora);

      // balas: rastro brilhante + sprite
      for (const b of est.balas) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 18);
        grad.addColorStop(0, BRILHO[this.cor(b.dono)]);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.fillRect(b.x - 18, b.y - 18, 36, 36);
        g.restore();
        const bala = BALA[this.cor(b.dono)];
        // as balas verde e amarela do atlas não têm rastro de fogo: são menores
        this.sprite(bala, b.x - Math.cos(b.ang) * 10, b.y - Math.sin(b.ang) * 10, bala === 'bala-azul' || bala === 'bala-vermelha' ? 46 : 24, { rot: b.ang });
      }
    }

    // partículas
    this.particulas = this.particulas.filter((p) => (p.idade += dt) < p.vida);
    for (const p of this.particulas) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.idade / p.vida;
      if (p.tipo === 'fumaca') {
        p.vx *= 0.96; p.vy *= 0.96;
        g.fillStyle = `rgba(70,62,55,${0.45 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'faisca') {
        g.strokeStyle = `rgba(255,${200 - k * 120},80,${1 - k})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      } else if (p.tipo === 'lasca') {
        p.vx *= 0.94; p.vy *= 0.94; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = `rgba(120,80,40,${1 - k * 0.7})`;
        g.fillRect(-p.s, -p.s / 2, p.s * 2, p.s);
        g.restore();
      } else if (p.tipo === 'fogo') {
        p.vy -= 30 * dt;
        g.fillStyle = `rgba(255,${150 - k * 100},40,${0.8 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, 4 + 6 * (1 - k), 0, Math.PI * 2); g.fill();
      }
    }

    // explosões: 6 quadros do atlas, 55ms cada
    this.efeitos = this.efeitos.filter((e) => agora - e.ini < e.quadros * 55);
    for (const e of this.efeitos) {
      const q = Math.min(e.quadros - 1, Math.floor((agora - e.ini) / 55));
      const tam = [50, 66, 80, 96, 120, 140][q] * e.escala;
      g.save(); g.globalCompositeOperation = 'lighter';
      this.sprite(`explosao-${q}`, e.x, e.y, tam, { rot: e.rot * 0.2, alfa: 0.95 });
      g.restore();
    }

    // árvores por cima de tudo
    for (const [nome, x, y] of DECORACAO) {
      const w = nome === 'pinheiro' || nome === 'palmeira' ? 90 : nome === 'moita' ? 60 : 78;
      this.sombra(x + 6, y + 24, w * 0.4, 9);
      this.sprite(nome, x, y, w);
    }

    // dano subindo
    this.textos = this.textos.filter((t) => agora - t.ini < 900);
    for (const t of this.textos) {
      const k = (agora - t.ini) / 900;
      g.save();
      g.globalAlpha = 1 - k;
      g.font = '900 26px "Barlow Semi Condensed", system-ui, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(t.txt, t.x, t.y - k * 40);
      g.fillStyle = '#fff'; g.fillText(t.txt, t.x, t.y - k * 40);
      g.restore();
    }
    g.restore();

    this.desenharPlacar(agora);
    this.desenharControles();
  }

  desenharTanque(i, t, agora) {
    const g = this.ctx;
    const virar = Math.cos(t.ang) < 0;   // o sprite é de lado: olha pra onde mira
    const w = 96 * ESCALA_TANQUE;
    if (!t.vivo) {
      this.sombra(t.x, t.y + 26, 46, 12);
      if (this.ultimo?.fora?.[i]) return;   // saiu da partida: some de vez
      this.sprite(`destrocos-${this.cor(i)}`, t.x, t.y - 4, 96, { virar });
      if (Math.random() < 0.5) this.particulas.push({ tipo: 'fogo', x: t.x + (Math.random() - 0.5) * 30, y: t.y - 10, vx: (Math.random() - 0.5) * 20, vy: -20, vida: 0.7, idade: 0 });
      if (Math.random() < 0.15) this.fumaca(t.x, t.y - 20, 1, 0.5);
      return;
    }
    // esteira: o tanque balança e solta poeira quando anda
    const balanco = t.movendo ? Math.sin(agora / 45 + i) * 1.6 : 0;
    if (t.movendo && Math.random() < 0.35) {
      this.particulas.push({ tipo: 'fumaca', x: t.x + (virar ? 26 : -26), y: t.y + 22, vx: (virar ? 30 : -30), vy: -5, r: 4, vida: 0.6, idade: 0 });
    }
    this.sombra(t.x, t.y + 22, 32, 9);
    // mira: setinha em volta do tanque
    g.save();
    g.translate(t.x, t.y);
    g.rotate(t.ang);
    g.strokeStyle = i === this.eu ? 'rgba(255,255,255,.55)' : `${this.tom(i)}66`;
    g.lineWidth = 3;
    g.setLineDash([6, 8]);
    g.beginPath(); g.moveTo(RAIO_TANQUE + 16, 0); g.lineTo(RAIO_TANQUE + (i === this.eu ? 90 : 40), 0); g.stroke();
    g.setLineDash([]);
    g.fillStyle = i === this.eu ? 'rgba(255,255,255,.75)' : `${this.tom(i)}aa`;
    const ponta = RAIO_TANQUE + (i === this.eu ? 100 : 48);
    g.beginPath(); g.moveTo(ponta, 0); g.lineTo(ponta - 12, -7); g.lineTo(ponta - 12, 7); g.closePath(); g.fill();
    g.restore();

    const nome = `tanque-${this.cor(i)}`;
    // recuo do canhão no tiro
    const recuo = this.disparo[i] > agora ? (virar ? 4 : -4) : 0;
    this.sprite(nome, t.x + recuo, t.y - 6 + balanco, w, { virar });
    if (this.flash[i] > agora) {
      g.save(); g.globalCompositeOperation = 'lighter';
      this.sprite(nome, t.x + recuo, t.y - 6 + balanco, w, { virar, alfa: 0.6 });
      g.restore();
    }
    // vida baixa: fumaça preta e fagulha
    if (t.vida <= 40 && Math.random() < (t.vida <= 20 ? 0.5 : 0.2)) {
      this.particulas.push({ tipo: 'fumaca', x: t.x + (Math.random() - 0.5) * 20, y: t.y - 30, vx: (Math.random() - 0.5) * 10, vy: -35, r: 5, vida: 1, idade: 0 });
      if (t.vida <= 20) this.particulas.push({ tipo: 'fogo', x: t.x, y: t.y - 24, vx: 0, vy: -25, vida: 0.5, idade: 0 });
    }
    // barra de vida
    const bw = 54, bx = t.x - bw / 2, by = t.y - 50;
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(bx - 2, by - 2, bw + 4, 10);
    const k = t.vida / VIDA;
    g.fillStyle = k > 0.5 ? '#3ddc5a' : k > 0.25 ? '#ffc53d' : '#ff4d4d';
    g.fillRect(bx, by, bw * k, 6);
    g.font = '800 14px "Barlow Semi Condensed", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = this.tom(i);
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)';
    const rotulo = i === this.eu ? 'VOCÊ' : (this.op.jogadores[i]?.name ?? '').split(' ')[0].toUpperCase();
    g.strokeText(rotulo, t.x, by - 6); g.fillText(rotulo, t.x, by - 6);
  }

  desenharPlacar(agora) {
    const g = this.ctx;
    const e = this.ultimo;
    if (!e) return;
    const vw = this.vw;
    // até 4 painéis: metade à esquerda do relógio, metade à direita
    const n = e.t.length;
    const porLado = Math.ceil(n / 2);
    const w = Math.min(300, (vw - 150) / 2 / porLado - 8), h = 58, y = 10;
    const compacto = w < 200;
    const painel = (i) => {
      const dir = i % 2 === 1;                    // assentos pares à esquerda, ímpares à direita
      const k = Math.floor(i / 2);                // 0 = encostado na borda
      const x = dir ? vw - 10 - (k + 1) * w - k * 8 : 10 + k * (w + 8);
      const fora = e.fora?.[i];
      g.save();
      if (fora) g.globalAlpha = 0.4;
      g.fillStyle = 'rgba(10,8,20,.72)';
      g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
      g.strokeStyle = this.tom(i); g.lineWidth = i === this.eu ? 3 : 2; g.stroke();
      const lado = compacto ? 34 : 46;
      const ax = dir ? x + w - lado - 6 : x + 6, ay = y + (h - lado) / 2;
      const foto = this.fotos[i];
      if (pronto(foto)) {
        g.save(); g.beginPath(); g.roundRect(ax, ay, lado, lado, 8); g.clip(); g.drawImage(foto, ax, ay, lado, lado); g.restore();
      } else {
        // sem foto: o soldado da cor (azul e vermelho têm no atlas) ou o próprio tanque
        const im = IMG[`soldado-${this.cor(i)}`] ?? IMG[`tanque-${this.cor(i)}`];
        if (pronto(im)) {
          const r = Math.min(lado / im.naturalWidth, lado / im.naturalHeight);
          g.drawImage(im, ax + (lado - im.naturalWidth * r) / 2, ay + (lado - im.naturalHeight * r) / 2, im.naturalWidth * r, im.naturalHeight * r);
        }
      }
      const tx = dir ? ax - 8 : ax + lado + 8;
      g.textAlign = dir ? 'right' : 'left';
      g.font = `800 ${compacto ? 13 : 16}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.fillStyle = '#fff';
      const nome = (this.op.jogadores[i]?.name ?? this.cor(i).toUpperCase()).split(' ')[0] + (i === this.eu ? (compacto ? ' ★' : ' (você)') : '') + (fora ? ' · saiu' : '');
      g.fillText(nome, tx, y + 22);
      // vida
      const vida = e.t[i]?.[3] ?? 0;
      const bw = w - lado - 26, bx = dir ? tx - bw : tx;
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(bx, y + 30, bw, 9);
      g.fillStyle = this.tom(i); g.fillRect(dir ? bx + bw * (1 - vida / VIDA) : bx, y + 30, bw * (vida / VIDA), 9);
      // rodadas ganhas
      for (let s = 0; s < 2; s++) {
        const sx = dir ? tx - 8 - s * 18 : tx + 8 + s * 18;
        g.fillStyle = s < e.placar[i] ? '#ffd23d' : 'rgba(255,255,255,.18)';
        estrela(g, sx, y + 49, 7);
      }
      g.restore();
    };
    for (let i = 0; i < n; i++) painel(i);

    // relógio e rodada
    g.textAlign = 'center';
    g.fillStyle = 'rgba(10,8,20,.72)';
    g.beginPath(); g.roundRect(vw / 2 - 60, 10, 120, 50, 12); g.fill();
    g.font = '700 12px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = '#c4b5fd';
    g.fillText(`RODADA ${e.rodada}/3`, vw / 2, 26);
    const resta = e.fase === 'jogo' && e.rodadaAte ? Math.max(0, e.rodadaAte - (agora + this.desvio)) : null;
    g.font = '900 24px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = resta != null && resta < 10_000 ? '#ff6b6b' : '#fff';
    const seg = resta == null ? 60 : Math.ceil(resta / 1000);
    g.fillText(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 52);

    // faixas do meio: contagem e fim de rodada
    let faixa = null, cor = '#fff';
    if (e.fase === 'contagem') {
      const s = Math.ceil((e.faseAte - (agora + this.desvio)) / 1000);
      if (s >= 1 && s !== this.ultimoBip) { this.ultimoBip = s; som.bip(false); }
      faixa = s >= 1 ? String(s) : 'FOGO!';
      cor = s >= 1 ? '#ffd23d' : '#ff5a3d';
    } else if (e.fase === 'fim-rodada') {
      const v = e.vencedorRodada;
      const nomeV = (this.op.jogadores[v]?.name ?? '').split(' ')[0].toUpperCase();
      faixa = v == null ? 'NINGUÉM LEVOU A RODADA' : v === this.eu ? 'VOCÊ VENCEU A RODADA!'
        : e.t.length > 2 ? `${nomeV} VENCEU A RODADA` : 'VOCÊ PERDEU A RODADA';
      cor = v == null ? '#fff' : this.tom(v);
    } else if (e.fase === 'jogo' && e.rodadaAte && agora + this.desvio - (e.rodadaAte - TEMPO_RODADA) < 700) {
      faixa = 'FOGO!'; cor = '#ff5a3d';
    }
    if (faixa) {
      const tam = faixa.length <= 5 ? Math.min(120, this.vh * 0.22) : Math.min(54, this.vw * 0.05);
      const pulso = 1 + Math.sin(agora / 90) * 0.04;
      g.save();
      g.translate(vw / 2, this.vh / 2);
      g.scale(pulso, pulso);
      g.font = `italic 900 ${tam}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = tam / 8; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(faixa, 0, 0);
      g.fillStyle = cor; g.fillText(faixa, 0, 0);
      g.restore();
      g.textBaseline = 'alphabetic';
    }
  }

  desenharControles() {
    const g = this.ctx;
    const b = this.botoes();
    // sair e som
    for (const [r, txt] of [[b.sair, '✕'], [b.mudo, som.mudo ? '🔇' : '🔊']]) {
      g.fillStyle = 'rgba(10,8,20,.7)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.font = '20px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.textBaseline = 'alphabetic';
    }
    if (!this.toque) {
      g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillText('WASD/setas andam · mouse mira · clique/espaço atira', this.vw - 12, this.vh - 14);
      return;
    }
    // joystick: nasce onde o dedo encostou; parado, fica no canto
    const mover = [...this.toques.values()].find((t) => t.tipo === 'mover');
    const jx = mover?.x0 ?? b.joy.x, jy = mover?.y0 ?? b.joy.y;
    g.save();
    g.globalAlpha = mover ? 0.9 : 0.45;
    const base = IMG.joystick;
    if (pronto(base)) g.drawImage(base, jx - b.joy.r, jy - b.joy.r, b.joy.r * 2, b.joy.r * 2);
    if (mover) {
      const dx = mover.x - mover.x0, dy = mover.y - mover.y0, d = Math.hypot(dx, dy), f = Math.min(1, b.joy.r / Math.max(1, d)) * 0.6;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(jx + dx * f, jy + dy * f, b.joy.r * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // botão de tiro: arrastar a partir dele mira
    const mirar = [...this.toques.values()].find((t) => t.tipo === 'mirar');
    g.save();
    g.globalAlpha = mirar ? 1 : 0.6;
    const fogo = IMG['botao-tiro'];
    const r = b.fogo.r * (mirar ? 1.08 : 1);
    if (pronto(fogo)) g.drawImage(fogo, b.fogo.x - r, b.fogo.y - r, r * 2, r * 2);
    g.restore();
  }
}

function estrela(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}
