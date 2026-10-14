import { CORES, TEMPO_VEZ } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles da Última Carta (canvas 2D). O servidor
 * arbitra e esconde as mãos; aqui chega o estado do assento (regras.js
 * estadoPara) e o último lance (`ultima`), que é animado.
 *
 * O que é daqui:
 *  - a mesa na cor que está valendo (troca com um clarão quando muda);
 *  - setas girando no sentido do jogo (invertem com efeito);
 *  - a mão em leque: as que servem sobem e brilham; toca pra jogar;
 *  - cartas voando da mão de quem jogou pra pilha (girando) e do monte pra
 *    mão de quem compra (a minha vira de face no caminho);
 *  - personagens da cartela com expressão: ri quando joga, chora/brava com +4,
 *    susto quando pula, festa no ÚLTIMA! e na vitória;
 *  - anel do relógio em volta de quem tem a vez; confete no fim.
 */

const A = import.meta.glob('../../assets/ultima/*.{webp,png}', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.(webp|png)$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const TOM = { r: '#ff3b30', y: '#ffcc00', g: '#2ecc40', b: '#1e7bff', w: '#222' };
const NOME_COR = { r: 'VERMELHO', y: 'AMARELO', g: 'VERDE', b: 'AZUL' };
const PERS = ['gabriel', 'mariana', 'lucas', 'rafael'];
const EXPR = { rafael: { festa: 'joia', bravo: 'susto', pisca: 'riso' } };   // o Rafael tem menos caras
const VOO = 420;
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const face = (c) => `${c.c}${c.v}`;   // nome do sprite: r7, gs, b+2, ww, w+4
const giroDe = (id) => (((id * 7919) % 100) / 100 - 0.5) * 0.5;

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
    this.e = null;
    this.offset = 0;
    this.pos = new Map();         // id da minha carta -> posição animada {x, y, r, s}
    this.voando = [];             // cartas no ar
    this.escondidas = new Set();  // cartas da mesa ainda chegando
    this.naMaoVis = [];           // contagem mostrada (sobe quando a carta chega)
    this.cara = [];               // expressão de cada um: { e, ate }
    this.particulas = [];
    this.textos = [];
    this.banner = null;
    this.escolhendo = null;       // carta coringa esperando a cor
    this.corVis = null; this.corAntes = null; this.corEm = 0;
    this.sentidoVis = 1; this.giroSeta = 0;
    this.seqVisto = 0;
    this.aguardando = false;
    this.tremor = 0;
    this.ultimoTique = null;
    this.encerrado = false;
    this.mouse = null;
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    // um erro num quadro não pode congelar o jogo: loga e segue
    const quadro = () => { if (!this.rodando) return; try { this.desenhar(); } catch (e) { console.error(e); } requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); window.speechSynthesis?.cancel(); }

  nome(i) { return (this.op.jogadores[i]?.name ?? `Jogador ${i + 1}`).split(' ')[0]; }
  pers(i) { return PERS[i % PERS.length]; }
  agoraServ() { return Date.now() + this.offset; }
  /** Onde fica cada assento na tela: eu embaixo, os outros em volta no sentido horário. */
  lugar(i) {
    const n = this.e?.n ?? 2, rel = (i - this.eu + n) % n;
    const ordem = n === 2 ? ['baixo', 'cima'] : n === 3 ? ['baixo', 'esq', 'dir'] : ['baixo', 'esq', 'cima', 'dir'];
    return this.L.lugares[ordem[rel]];
  }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const antes = this.e;
    const agora = performance.now();
    this.offset = e.agora - Date.now();
    this.e = e;
    this.aguardando = false;
    if (!antes) {
      this.naMaoVis = [...e.naMao];
      this.corVis = e.cor; this.sentidoVis = e.sentido;
      this.anunciar('BOA SORTE!', '#ffd23d', 1400);
      som.embaralha();
    }
    const u = e.ultima;
    if (u && u.seq > this.seqVisto) { this.seqVisto = u.seq; this.lance(u, antes, agora); }
    // cartas que chegaram (compra, +2, +4, denúncia): voam do monte
    if (antes) {
      for (let i = 0; i < e.n; i++) {
        const mais = e.naMao[i] - antes.naMao[i];
        if (mais > 0) this.comprar(i, mais, i === this.eu ? e.mao.filter((c) => !antes.mao.some((x) => x.id === c.id)) : null, u?.tipo === 'jogou' ? 380 : 0);
        else if (mais < 0) this.naMaoVis[i] = e.naMao[i];
      }
    }
    if (antes && e.vez === this.eu && antes.vez !== this.eu && !e.fim) { som.vez(); if (navigator.vibrate) navigator.vibrate(30); }
    if (e.cor !== this.corVis) setTimeout(() => this.trocarCor(e.cor), u?.tipo === 'jogou' ? VOO : 0);
    if (e.sentido !== this.sentidoVis) { this.sentidoVis = e.sentido; this.giroSeta = agora; }
    if (e.fim && !this.encerrado) this.encerrar(e.fim);
    if (this.escolhendo && !e.mao.some((c) => c.id === this.escolhendo)) this.escolhendo = null;
  }

  lance(u, antes, agora) {
    const de = u.de;
    if (u.tipo === 'jogou') {
      const c = u.carta;
      const L = this.lugar(de);
      const ini = de === this.eu && this.pos.get(c.id) ? { ...this.pos.get(c.id) } : { x: L.x, y: L.y, r: 0, s: 0.6 };
      this.pos.delete(c.id);
      this.escondidas.add(c.id);
      this.voando.push({ c, de: ini, para: { x: this.L.pilha.x, y: this.L.pilha.y, r: giroDe(c.id), s: 1 }, t0: agora, dur: VOO, face: true, fim: () => {
        this.escondidas.delete(c.id);
        som.bate();
        this.respingo(this.L.pilha.x, this.L.pilha.y, TOM[u.cor]);
        if (c.v === 's') { som.pula(); this.marca(u.pulou, '🚫', 'PULOU!'); this.expr(u.pulou, 'susto'); }
        if (c.v === 'r') { som.inverte(); this.texto(this.L.mesa.x, this.L.mesa.y - this.L.mesa.r * 0.55, '⇄ INVERTEU!', '#fff', 30); }
        if (c.v === '+2' || c.v === '+4') {
          som.mais(c.v === '+4' ? 4 : 2);
          this.tremor = c.v === '+4' ? 16 : 9;
          this.marca(u.alvo, c.v === '+4' ? '+4' : '+2', null, c.v === '+4' ? '#ff3b30' : '#ffcc00');
          this.expr(u.alvo, 'bravo');
          this.expr(de, 'joia');
          if (u.alvo === this.eu && navigator.vibrate) navigator.vibrate([60, 40, 90]);
        } else if (!'sr'.includes(c.v)) this.expr(de, 'riso');
        if (c.c === 'w') { som.cor(); this.anunciar(`${NOME_COR[u.cor]}!`, TOM[u.cor], 1100); }
        if (u.ultima) this.gritar(de);
      } });
      som.desliza(0.7);
      this.naMaoVis[de] = Math.max(0, this.naMaoVis[de] - 1);
    }
    if (u.tipo === 'ultima') this.gritar(de);
    if (u.tipo === 'denuncia') {
      som.pego();
      this.anunciar(`PEGOU ${this.nome(u.alvo).toUpperCase()}! +2`, '#ff8a3a', 1500);
      this.expr(u.alvo, 'bravo'); this.expr(de, 'riso');
    }
    if (u.tipo === 'tempo') { this.marca(de, '⏰', 'DORMIU!'); this.expr(de, 'susto'); }
    if (u.tipo === 'saiu') this.texto(this.lugar(u.assento).x, this.lugar(u.assento).y, `${this.nome(u.assento)} saiu`, '#fff', 22);
  }

  /** `q` cartas do monte pra mão de `i`; as minhas (`minhas`) viram de face no caminho. */
  comprar(i, q, minhas, atraso = 0) {
    const L = this.lugar(i);
    for (let k = 0; k < q; k++) {
      const c = minhas?.[k] ?? null;
      setTimeout(() => {
        const t0 = performance.now();
        this.voando.push({ c, de: { x: this.L.monte.x, y: this.L.monte.y, r: 0, s: 0.9 }, para: { x: L.x, y: L.y, r: (Math.random() - 0.5) * 0.4, s: i === this.eu ? 1 : 0.55 },
          t0, dur: 380, face: false, vira: !!c, fim: () => { this.naMaoVis[i] = Math.min(this.e.naMao[i], this.naMaoVis[i] + 1); if (c) this.pos.set(c.id, { x: L.x, y: L.y, r: 0, s: 1 }); } });
        som.desliza(i === this.eu ? 1 : 0.5);
      }, atraso + k * 130);
    }
  }

  gritar(i) {
    som.ultima();
    som.fala('Última!');
    this.expr(i, 'festa');
    this.anunciar(i === this.eu ? 'ÚLTIMA!' : `${this.nome(i).toUpperCase()}: ÚLTIMA!`, '#ffd23d', 1400);
    const L = this.lugar(i);
    for (let k = 0; k < 30; k++) this.faisca(L.x, L.y, ['#ffd23d', '#ff3b30', '#2ecc40', '#1e7bff'][k % 4]);
  }

  trocarCor(cor) {
    if (cor === this.corVis) return;
    this.corAntes = this.corVis; this.corVis = cor; this.corEm = performance.now();
    for (let k = 0; k < 24; k++) this.faisca(this.L.mesa.x, this.L.mesa.y, TOM[cor], 260);
  }

  encerrar(fim) {
    this.encerrado = true;
    this.escolhendo = null;
    setTimeout(() => {
      if (fim.vencedor == null) return;
      const ganhei = fim.vencedor === this.eu;
      this.expr(fim.vencedor, 'festa', 99999);
      this.anunciar(ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3000);
      (ganhei ? som.fanfarra : som.derrota)();
      if (ganhei) for (let k = 0; k < 120; k++) this.confete();
    }, VOO + 200);
  }

  expr(i, e, dura = 1600) { if (i != null) this.cara[i] = { e, ate: performance.now() + dura }; }
  anunciar(txt, cor, dura) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  texto(x, y, txt, cor, tam) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now() }); }
  marca(i, icone, txt, cor = '#fff') {
    if (i == null) return;
    const L = this.lugar(i);
    this.textos.push({ x: L.x, y: L.y - 10, txt: icone, cor, tam: 56, t0: performance.now(), grande: true });
    if (txt) this.texto(L.x, L.y + 40, txt, cor, 20);
  }
  faisca(x, y, cor, forca = 200) {
    const a = Math.random() * Math.PI * 2, v = forca * (0.4 + Math.random() * 0.6);
    this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, cor, t0: performance.now(), vida: 600, r: 3 });
  }
  respingo(x, y, cor) { for (let k = 0; k < 14; k++) this.faisca(x, y, cor, 180); }
  confete() {
    const cores = ['#ffd23d', '#ff3b30', '#2ecc40', '#1e7bff', '#ff6fc8', '#fff'];
    this.particulas.push({ tipo: 'confete', x: Math.random() * this.w, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160,
      r: 5 + Math.random() * 4, cor: cores[Math.floor(Math.random() * 6)], rot: Math.random() * 6, t0: performance.now(), vida: 4500 });
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (ev) => this.toque(ev),
      move: (ev) => { if (ev.pointerType === 'mouse') this.mouse = { x: ev.clientX, y: ev.clientY }; },
      resize: () => this.redimensionar(),
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('resize', this.h.resize);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('resize', this.h.resize);
  }

  minhaVez() { return this.e && !this.e.fim && this.e.vez === this.eu && !this.aguardando && !this.voando.some((v) => v.face); }

  toque(ev) {
    destravar();
    const x = ev.clientX, y = ev.clientY, e = this.e;
    const dentro = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const B = this.L.botoes;
    if (dentro(B.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(B.mudo)) { som.alternarMudo(); return; }
    if (!e || e.fim) return;
    // escolhendo a cor do coringa
    if (this.escolhendo) {
      const k = this.L.cores.findIndex((c) => Math.hypot(x - c.x, y - c.y) < c.r);
      if (k >= 0) { this.enviar({ tipo: 'jogar', id: this.escolhendo, cor: CORES[k] }); this.escolhendo = null; }
      else this.escolhendo = null;
      return;
    }
    const grito = this.botaoGrito();
    if (grito && dentro(grito.r)) { grito.acao(); return; }
    if (e.comprada != null && dentro(this.L.passar)) { this.enviar({ tipo: 'passar' }); return; }
    // o monte: comprar
    const M = this.L.monte;
    if (Math.abs(x - M.x) < this.L.cw * 0.6 && Math.abs(y - M.y) < this.L.ch * 0.6) {
      if (this.minhaVez() && e.comprada == null) { if (e.jogaveis.length) this.texto(M.x, M.y - this.L.ch * 0.7, 'Você tem carta pra jogar!', '#fff', 15); this.enviar({ tipo: 'comprar' }); }
      return;
    }
    // uma carta da minha mão (a de cima primeiro)
    const mao = e.mao;
    for (let k = mao.length - 1; k >= 0; k--) {
      const c = mao[k], p = this.alvoMao(k, mao.length);
      const dx = x - p.x, dy = y - p.y, cs = Math.cos(-p.r), sn = Math.sin(-p.r);
      const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
      if (Math.abs(lx) > this.L.cw / 2 || Math.abs(ly) > this.L.ch / 2) continue;
      if (!this.minhaVez()) { this.texto(p.x, p.y - this.L.ch * 0.7, 'Espere a sua vez', '#fff', 15); return; }
      if (!e.jogaveis.includes(c.id)) { som.erro(); this.tremeCarta = { id: c.id, t0: performance.now() }; return; }
      if (c.c === 'w') { this.escolhendo = c.id; return; }
      this.enviar({ tipo: 'jogar', id: c.id, ultima: this.vouGritar && mao.length === 2 });
      return;
    }
  }

  enviar(a) { if (a.tipo !== 'ultima' && a.tipo !== 'denunciar') this.aguardando = true; this.op.onEntrada(a); }

  /** O botão grande do canto: ÚLTIMA! (com 2 cartas) ou PEGA! (alguém esqueceu de gritar). */
  botaoGrito() {
    const e = this.e;
    if (!e || e.fim) return null;
    const r = this.L.grito;
    if (e.esqueceu != null && e.esqueceu !== this.eu) return { r, txt: 'PEGA! +2', cor: '#ff8a3a', acao: () => this.op.onEntrada({ tipo: 'denunciar' }) };
    if (e.mao.length <= 2 && e.mao.length > 0 && !e.gritou[this.eu]) return { r, txt: 'ÚLTIMA!', cor: '#e8202a', acao: () => { this.vouGritar = true; this.op.onEntrada({ tipo: 'ultima' }); } };
    return null;
  }

  // ------------------------------------------------------------- layout

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    const retrato = h > w;
    const cw = Math.max(50, Math.min(110, retrato ? w / 5.2 : h / 6.2)), ch = cw * 1.4;
    const mesa = retrato ? { x: w / 2, y: h * 0.43, r: Math.min(w * 0.5, w * 0.42) } : { x: w / 2, y: h * 0.44, r: Math.min(h * 0.33, w * 0.3) };
    const lado = retrato ? 0.15 : 0.12;
    this.L = {
      cw, ch, mesa, retrato,
      monte: { x: mesa.x - cw * 0.75, y: mesa.y },
      pilha: { x: mesa.x + cw * 0.75, y: mesa.y },
      lugares: {
        baixo: { x: w / 2, y: h - ch * 0.62 - 6, eu: true },
        cima: { x: w / 2, y: retrato ? h * 0.12 : h * 0.12 },
        esq: { x: w * lado, y: retrato ? mesa.y - mesa.r * 1.05 : mesa.y - mesa.r * 0.35 },   // em pé: acima da mesa
        dir: { x: w * (1 - lado), y: retrato ? mesa.y - mesa.r * 1.05 : mesa.y - mesa.r * 0.35 },
      },
      botoes: { sair: { x: 10, y: 10, w: 40, h: 40 }, mudo: { x: 58, y: 10, w: 40, h: 40 } },
      grito: { x: w - Math.min(170, w * 0.4) - 12, y: h - ch * 1.05 - 74, w: Math.min(170, w * 0.4), h: 58 },
      passar: { x: mesa.x - 70, y: mesa.y + ch * 0.75, w: 140, h: 44 },
      cores: CORES.map((c, k) => ({ c, x: mesa.x + Math.cos(-Math.PI * 0.75 + k * Math.PI / 2) * cw * 0.95, y: mesa.y + Math.sin(-Math.PI * 0.75 + k * Math.PI / 2) * cw * 0.95, r: cw * 0.6 })),
    };
  }

  /** Posição da k-ésima carta da minha mão em leque. */
  alvoMao(k, n) {
    const { cw, ch } = this.L;
    const larg = Math.min(this.w * 0.94, cw * 0.62 * (n - 1) + cw);
    const passo = n > 1 ? (larg - cw) / (n - 1) : 0;
    const t = n > 1 ? k / (n - 1) - 0.5 : 0;
    const x = this.w / 2 - larg / 2 + cw / 2 + k * passo;
    const y = this.h - ch * 0.62 - 6 + (t * t) * ch * 0.25;
    return { x, y, r: t * Math.min(0.5, n * 0.05), s: 1 };
  }

  // ------------------------------------------------------------- desenho

  desenhar() {
    const g = this.ctx, agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.tremor *= 0.86;
    g.save();
    g.translate((Math.random() - 0.5) * this.tremor, (Math.random() - 0.5) * this.tremor);
    this.desenharSala(g);
    const e = this.e;
    if (e) {
      this.desenharMesa(g, agora);
      for (let i = 0; i < e.n; i++) if (i !== this.eu) this.desenharOponente(g, i, agora);
      this.desenharMonte(g, agora);
      this.desenharPilha(g);
      this.desenharMao(g, agora, dt);
      this.desenharVoando(g, agora);
      this.desenharEu(g, agora);
    }
    this.desenharParticulas(g, agora, dt);
    this.desenharTextos(g, agora);
    g.restore();
    if (e) this.desenharHud(g, agora);
  }

  desenharSala(g) {
    const f = IMG.fundo;
    if (pronto(f)) {
      const esc = Math.max(this.w / f.naturalWidth, this.h / f.naturalHeight);
      g.drawImage(f, (this.w - f.naturalWidth * esc) / 2, (this.h - f.naturalHeight * esc) / 2, f.naturalWidth * esc, f.naturalHeight * esc);
    } else { g.fillStyle = '#0c1630'; g.fillRect(0, 0, this.w, this.h); }
  }

  desenharMesa(g, agora) {
    const { x, y, r } = this.L.mesa;
    const k = Math.min(1, (agora - this.corEm) / 500);
    const desenha = (cor, alfa) => {
      const im = IMG[`mesa-${cor === 'w' ? 'b' : cor}`];
      if (!pronto(im)) return;
      const w = r * 2, h = (w * im.naturalHeight) / im.naturalWidth;
      g.globalAlpha = alfa; g.drawImage(im, x - w / 2, y - h / 2, w, h); g.globalAlpha = 1;
    };
    if (this.corAntes && k < 1) desenha(this.corAntes, 1);
    desenha(this.corVis ?? 'b', this.corAntes ? k : 1);
    // clarão da troca de cor
    if (k < 1) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.5 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    }
    // setas do sentido, girando (rápido quando acabou de inverter)
    const sp = agora - this.giroSeta < 900 ? 6 : 0.6;
    this.angSeta = (this.angSeta ?? 0) + this.sentidoVis * sp * 0.016;
    g.save(); g.translate(x, y); g.rotate(this.angSeta);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6; g.lineCap = 'round';
    const rr = r * 0.42;
    for (let q = 0; q < 2; q++) {
      const a0 = q * Math.PI + 0.3, a1 = a0 + Math.PI * 0.6;
      g.beginPath(); g.arc(0, 0, rr, a0, a1); g.stroke();
      const px = Math.cos(a1) * rr, py = Math.sin(a1) * rr, d = this.sentidoVis;
      g.beginPath(); g.moveTo(px, py);
      g.lineTo(px + Math.cos(a1 + d * 2.4) * 14, py + Math.sin(a1 + d * 2.4) * 14); g.moveTo(px, py);
      g.lineTo(px + Math.cos(a1 - d * 0.8 + Math.PI) * 14, py + Math.sin(a1 - d * 0.8 + Math.PI) * 14); g.stroke();
    }
    g.restore();
  }

  /** Carta (face ou verso) centrada em (x, y) com giro e escala. */
  carta(g, c, x, y, r = 0, s = 1, { brilho = 0, apagada = false } = {}) {
    const { cw, ch } = this.L;
    const w = cw * s, h = ch * s;
    g.save(); g.translate(x, y); g.rotate(r);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.roundRect(-w / 2 + 3, -h / 2 + 5, w, h, w * 0.12); g.fill();
    if (brilho) { g.shadowColor = '#fff7b0'; g.shadowBlur = 18 * brilho; }
    const im = c ? IMG[face(c)] : null;
    if (pronto(im)) g.drawImage(im, -w / 2, -h / 2, w, h);
    else this.verso(g, w, h);
    g.shadowBlur = 0;
    if (apagada) { g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, w * 0.12); g.fill(); }
    g.restore();
  }

  /** O verso (desenhado: preto, borda branca, elipse vermelha e um "?" — sem marca). */
  verso(g, w, h) {
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, w * 0.12); g.fill();
    g.fillStyle = '#141414'; g.beginPath(); g.roundRect(-w / 2 + w * 0.06, -h / 2 + w * 0.06, w * 0.88, h - w * 0.12, w * 0.09); g.fill();
    g.save(); g.rotate(-0.5);
    const gr = g.createLinearGradient(-w * 0.3, 0, w * 0.3, 0);
    gr.addColorStop(0, '#ff3b30'); gr.addColorStop(0.33, '#ffcc00'); gr.addColorStop(0.66, '#2ecc40'); gr.addColorStop(1, '#1e7bff');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, w * 0.3, h * 0.36, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.font = `900 ${w * 0.32}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = w * 0.05; g.strokeStyle = '#141414'; g.strokeText('?', 0, 2); g.fillText('?', 0, 2);
  }

  desenharMonte(g, agora) {
    const { x, y } = this.L.monte;
    for (let k = 4; k >= 0; k--) this.carta(g, null, x - k * 1.2, y - k * 1.5, 0, 0.92);
    const pode = this.minhaVez() && this.e.comprada == null;
    if (pode && !this.e.jogaveis.length) {   // sem jogada: o monte chama
      g.strokeStyle = `rgba(255,220,80,${0.5 + 0.5 * Math.sin(agora / 180)})`; g.lineWidth = 4;
      g.beginPath(); g.roundRect(x - this.L.cw * 0.5, y - this.L.ch * 0.5, this.L.cw * 0.92, this.L.ch * 0.92, 10); g.stroke();
      rotulo(g, 'COMPRAR', x, y + this.L.ch * 0.62, '#ffd23d', 14);
    }
    rotulo(g, String(this.e.monte), x, y - this.L.ch * 0.58, '#fff', 13);
  }

  desenharPilha(g) {
    const { x, y } = this.L.pilha;
    const mesa = this.e.mesa.filter((c) => !this.escondidas.has(c.id));
    mesa.forEach((c, k) => this.carta(g, c, x + (k - mesa.length) * 0.8, y, giroDe(c.id), 1, { brilho: k === mesa.length - 1 ? 0.5 : 0 }));
    // a cor que vale, num anel em volta da pilha (importante depois de coringa)
    const cor = TOM[this.corVis] ?? '#fff';
    g.strokeStyle = cor; g.lineWidth = 5; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(x, y, this.L.ch * 0.66, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  }

  desenharMao(g, agora, dt) {
    const e = this.e, mao = e.mao, n = mao.length;
    const hover = this.mouse;
    const ids = new Set(mao.map((c) => c.id));
    for (const id of [...this.pos.keys()]) if (!ids.has(id)) this.pos.delete(id);
    const chegando = new Set(this.voando.filter((v) => v.c && !v.face).map((v) => v.c.id));
    mao.forEach((c, k) => {
      if (chegando.has(c.id)) return;
      const alvo = this.alvoMao(k, n);
      const serve = e.jogaveis.includes(c.id) && this.minhaVez();
      let sobe = serve ? this.L.ch * 0.18 : 0;
      if (hover && serve && Math.abs(hover.x - alvo.x) < this.L.cw * 0.35 && Math.abs(hover.y - alvo.y) < this.L.ch * 0.6) sobe += this.L.ch * 0.12;
      const p = this.pos.get(c.id) ?? { ...alvo };
      const kk = Math.min(1, dt * 12);
      p.x = lerp(p.x, alvo.x, kk); p.y = lerp(p.y, alvo.y - sobe, kk); p.r = lerp(p.r, alvo.r, kk);
      this.pos.set(c.id, p);
      let tx = 0;
      if (this.tremeCarta?.id === c.id && agora - this.tremeCarta.t0 < 300) tx = Math.sin((agora - this.tremeCarta.t0) / 25) * 6;
      this.carta(g, c, p.x + tx, p.y, p.r, 1, { brilho: serve ? 0.6 + 0.4 * Math.sin(agora / 250) : 0, apagada: this.minhaVez() && !serve });
    });
  }

  desenharVoando(g, agora) {
    this.voando = this.voando.filter((v) => {
      const k = Math.min(1, (agora - v.t0) / v.dur);
      const t = sai(k);
      const x = lerp(v.de.x, v.para.x, t), y = lerp(v.de.y, v.para.y, t) - Math.sin(k * Math.PI) * 40;
      const r = lerp(v.de.r, v.para.r, t) + (v.face ? Math.sin(k * Math.PI) * 0.6 : 0);
      const s = lerp(v.de.s, v.para.s, t) * (1 + Math.sin(k * Math.PI) * 0.15);
      // virar no caminho (compra minha): escala horizontal passa por zero
      if (v.vira) {
        const fx = Math.abs(Math.cos(k * Math.PI));
        g.save(); g.translate(x, y); g.scale(Math.max(0.05, fx), 1); g.translate(-x, -y);
        this.carta(g, k > 0.5 ? v.c : null, x, y, r, s); g.restore();
      } else this.carta(g, v.face ? v.c : null, x, y, r, s);
      if (k >= 1) { v.fim?.(); return false; }
      return true;
    });
  }

  /** O rosto de um assento com o anel do relógio. */
  rosto(g, i, x, y, raio, agora) {
    const e = this.e;
    const c = this.cara[i];
    let ex = c && agora < c.ate ? c.e : (e.vez === i && !e.fim ? 'normal' : 'normal');
    if (!c || agora >= c.ate) { if (e.naMao[i] === 1) ex = 'festa'; if (e.fora[i]) ex = 'susto'; }
    const p = this.pers(i);
    const im = IMG[`${p}-${EXPR[p]?.[ex] ?? ex}`] ?? IMG[`${p}-normal`];
    const vez = e.vez === i && !e.fim;
    g.save();
    if (vez) { g.shadowColor = '#ffe066'; g.shadowBlur = 22 + 8 * Math.sin(agora / 200); }
    g.fillStyle = 'rgba(10,20,40,.85)'; g.beginPath(); g.arc(x, y, raio, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    if (pronto(im)) {
      g.save(); g.beginPath(); g.arc(x, y, raio - 3, 0, Math.PI * 2); g.clip();
      const pulo = c && agora < c.ate && (ex === 'festa' || ex === 'riso') ? Math.abs(Math.sin(agora / 120)) * 4 : 0;
      const w = raio * 2.2, h = (w * im.naturalHeight) / im.naturalWidth;
      g.drawImage(im, x - w / 2, y - h * 0.55 - pulo, w, h); g.restore();
    }
    g.strokeStyle = e.fora[i] ? '#666' : vez ? '#ffd23d' : 'rgba(255,255,255,.7)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, raio, 0, Math.PI * 2); g.stroke();
    if (vez) {   // relógio
      const resta = Math.max(0, e.prazo - this.agoraServ()) / TEMPO_VEZ;
      g.strokeStyle = resta < 0.25 ? '#ff3b30' : '#2ecc40'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, raio + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * resta); g.stroke();
    }
    g.restore();
    if (e.gritou[i] && e.naMao[i] === 1) rotulo(g, 'ÚLTIMA!', x, y - raio - 10, '#ffd23d', 13);
  }

  desenharOponente(g, i, agora) {
    const L = this.lugar(i), e = this.e;
    const raio = Math.min(38, this.L.cw * 0.48);
    const n = this.naMaoVis[i] ?? e.naMao[i];
    // leque de versos (até 12 desenhados)
    const q = Math.min(n, 12), s = L === this.L.lugares.cima ? 0.5 : 0.42;
    const abre = L === this.L.lugares.cima ? Math.min(this.w * 0.4, q * 16) : Math.min(this.w * 0.2, q * 9);
    for (let k = 0; k < q; k++) {   // leque de versos atrás do nome
      const t = q > 1 ? k / (q - 1) - 0.5 : 0;
      this.carta(g, null, L.x + t * abre, L.y + raio + 18 + t * t * 10, t * 0.6, s);
    }
    this.rosto(g, i, L.x, L.y, raio, agora);
    // nome e contagem
    const ny = L.y + raio + 14;
    pilula(g, L.x - 46, ny - 2, 92, 34, 'rgba(8,16,36,.85)', e.vez === i ? '#ffd23d' : 'rgba(255,255,255,.25)');
    g.font = '800 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(this.nome(i).slice(0, 10), L.x, ny + 8);
    g.font = '900 13px system-ui'; g.fillStyle = n <= 1 ? '#ffd23d' : '#9fd3ff';
    g.fillText(e.fora[i] ? 'saiu' : `🂠 ${n}`, L.x, ny + 23);
  }

  desenharEu(g, agora) {
    // meu rosto pequeno à esquerda, acima da mão
    const raio = 26, x = 14 + raio, y = this.h - this.L.ch * 1.1 - raio - 12;
    this.rosto(g, this.eu, x, y, raio, agora);
    rotulo(g, 'Você', x + raio + 26, y, '#fff', 14);
  }

  desenharParticulas(g, agora, dt) {
    this.particulas = this.particulas.filter((p) => {
      const k = (agora - p.t0) / p.vida;
      if (k >= 1 || p.y > this.h + 30) return false;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'confete') {
        p.rot += dt * 6; p.vx += Math.sin(agora / 300 + p.rot) * 6;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.rot))); g.fillStyle = p.cor; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore();
      } else {
        p.vx *= 0.93; p.vy *= 0.93;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - k; g.fillStyle = p.cor;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, Math.PI * 2); g.fill(); g.restore();
      }
      return true;
    });
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1300);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1300;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const s = k < 0.15 ? volta(k / 0.15) : 1;
      rotulo(g, t.txt, t.x, t.y - (t.grande ? 0 : 40 * sai(k)), t.cor, t.tam * s);
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hud

  desenharHud(g, agora) {
    const e = this.e, { botoes } = this.L;
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = botoes[k];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // de quem é a vez + relógio (meu)
    if (!e.fim) {
      const minha = e.vez === this.eu;
      const seg = Math.ceil(Math.max(0, e.prazo - this.agoraServ()) / 1000);
      if (minha && seg <= 5 && seg > 0 && seg !== this.ultimoTique) { this.ultimoTique = seg; som.tique(seg <= 2); }
      const txt = minha ? (e.comprada != null ? 'Jogue a carta comprada ou passe' : e.jogaveis.length ? `SUA VEZ · ${seg}s` : `Sem carta: compre · ${seg}s`) : `Vez de ${this.nome(e.vez)}`;
      const y = this.L.mesa.y + this.L.ch * (e.comprada != null && minha ? 1.55 : 0.95);
      rotulo(g, txt, this.w / 2, y, minha ? '#ffd23d' : '#cfe0ff', minha ? 17 : 14);
      if (minha && e.comprada != null) botao(g, this.L.passar, 'PASSAR', '#2a3a5a', '#7aa7ff');
    }
    const grito = this.botaoGrito();
    if (grito) {
      g.save();
      g.translate(grito.r.x + grito.r.w / 2, grito.r.y + grito.r.h / 2);
      const s = 1 + 0.06 * Math.sin(agora / 140);
      g.scale(s, s); g.translate(-(grito.r.x + grito.r.w / 2), -(grito.r.y + grito.r.h / 2));
      g.shadowColor = grito.cor; g.shadowBlur = 20;
      botao(g, grito.r, grito.txt, grito.cor, '#ffd23d', 24);
      g.restore();
    }
    if (this.escolhendo) {
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, this.w, this.h);
      rotulo(g, 'ESCOLHA A COR', this.L.mesa.x, this.L.mesa.y - this.L.cw * 1.9, '#fff', 22);
      for (const c of this.L.cores) {
        const pul = 1 + 0.05 * Math.sin(agora / 160 + c.x);
        g.fillStyle = TOM[c.c]; g.strokeStyle = '#fff'; g.lineWidth = 4;
        g.beginPath(); g.arc(c.x, c.y, c.r * pul, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(this.w / 2, this.h * 0.24);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        const tam = Math.min(46, (this.w * 0.9) / Math.max(5, this.banner.txt.length) * 1.7);
        g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(-this.w * 0.45, -tam * 0.85, this.w * 0.9, tam * 1.7, 18); g.fill();
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam);
        g.restore();
      }
    }
  }
}

function rotulo(g, txt, x, y, cor, tam) {
  g.font = `900 ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, tam / 5); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
  g.strokeText(txt, x, y); g.fillStyle = cor; g.fillText(txt, x, y);
}
function pilula(g, x, y, w, h, fundo, borda) {
  g.fillStyle = fundo; g.strokeStyle = borda; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill(); g.stroke();
}
function botao(g, r, txt, fundo, borda, tam = 17) {
  const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  gr.addColorStop(0, borda); gr.addColorStop(0.15, fundo); gr.addColorStop(1, fundo);
  g.fillStyle = gr; g.strokeStyle = borda; g.lineWidth = 3;
  g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, r.h / 2); g.fill(); g.stroke();
  rotulo(g, txt, r.x + r.w / 2, r.y + r.h / 2 + 1, '#fff', tam);
}
