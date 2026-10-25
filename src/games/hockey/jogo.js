import { LARGURA as W, ALTURA as H, R_DISCO, R_TACO, GOLS, TEMPO, V_TACO, PRESO } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles do Air Hockey Neon (canvas 2D).
 *
 * O servidor manda disco e tacos ~30x/s; o disco e o taco do outro são
 * desenhados ATRASO ms no passado, interpolando. O MEU taco anda aqui na hora
 * (mesma regra de velocidade do servidor), senão o dedo sente a rede. Se o
 * disco desenhado entra no meu taco antes do servidor responder, ele é
 * empurrado pra borda do taco (só no desenho).
 *
 * Cada um vê o próprio gol embaixo (o assento 1 vê a mesa girada) — e com o
 * celular deitado, a mesa deita junto (meu gol à esquerda). Mesa, tacos,
 * disco, explosões e placares são recortes da prancha (scripts/preparar-hockey.py);
 * rastros, faíscas, confete e o fundo de fliperama são desenhados aqui.
 */

const A = import.meta.glob('../../assets/hockey/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.webp$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const TOM = { vermelho: '#ff3b4a', azul: '#2f9bff', verde: '#2ee860', amarelo: '#ffc21a' };
const PADRAO = ['vermelho', 'azul'];
const ATRASO = 70;
// a mesa recortada: o campo começa em (100, 108) dela; o desenho inteiro tem 710×990
const OX = 100, OY = 108, MW = 710, MH = 990;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const lerp = (a, b, t) => a + (b - a) * t;

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string, cor?: string}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.e = null;
    this.buf = [];
    this.desvio = null;
    this.vistos = 0;
    this.particulas = [];
    this.textos = [];
    this.rastro = [];
    this.fantasmas = [[], []];
    this.banner = null;
    this.tremor = 0;
    this.clarao = 0;
    this.pulso = [0, 0];
    this.golAceso = null;
    this.ultimoBip = null;
    this.encerrado = false;
    this.alvo = null;
    this.meu = null;
    this.enviado = 0;
    this.corBrilho = TOM[this.cor(this.eu)];
    this.chegou = performance.now();
    this.estrelas = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, f: Math.random() * 6 }));
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    // um erro num quadro não pode congelar o jogo: loga e segue
    const quadro = () => { if (!this.rodando) return; try { this.desenhar(); } catch (e) { console.error(e); } requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); som.pararAmbiente(); window.speechSynthesis?.cancel(); }

  cor(i) { const c = this.op.jogadores[i]?.cor; return TOM[c] ? c : PADRAO[i]; }
  tom(i) { return TOM[this.cor(i)]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? `Jogador ${i + 1}`).split(' ')[0]; }
  agoraServ() { return performance.now() + (this.desvio ?? 0); }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.e = e;
    this.buf.push({ t: e.agora, d: e.d, t2: e.t });
    while (this.buf.length > 2 && this.buf[1].t < this.agoraServ() - ATRASO - 300) this.buf.shift();
    if (!this.meu) this.meu = { x: e.t[this.eu][0], y: e.t[this.eu][1] };
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.evento(ev, agora); }
    if (e.fim && !this.encerrado) this.encerrar(e.fim);
  }

  evento(ev, agora) {
    if (ev.tipo === 'batida') {
      const meu = ev.de === this.eu, f = Math.min(1, ev.forca / 1800);
      som.batida(f, meu ? 1 : 0.7);
      this.efeito(`explode-${this.cor(ev.de)}`, ev.x, ev.y, 50 + 90 * f, 260);
      if (f > 0.55) this.efeito(meu ? 'faisca-azul' : 'faisca-verde', ev.x, ev.y, 70 + 60 * f, 300, Math.random() * 6);
      this.faiscas(ev.x, ev.y, this.tom(ev.de), Math.round(6 + 14 * f));
      this.tremor = Math.max(this.tremor, 3 + 9 * f * f);
      this.corBrilho = this.tom(ev.de);
      if (meu && navigator.vibrate) navigator.vibrate(f > 0.6 ? 30 : 12);
      if (f > 0.95 && !this.textos.length) this.textos.push({ x: ev.x, y: ev.y - 30, txt: ['PANCADA!', 'BOMBA!', 'FOGUETE!'][Math.floor(Math.random() * 3)], cor: this.tom(ev.de), t0: agora, tam: 26 });
    }
    if (ev.tipo === 'parede') {
      const f = Math.min(1, ev.forca / 1600);
      som.parede(f);
      this.faiscas(ev.x, ev.y, '#ffe9a0', Math.round(3 + 8 * f));
      if (f > 0.4) this.efeito('anel-vermelho', ev.x, ev.y, 40 + 40 * f, 220);
    }
    if (ev.tipo === 'gol') {
      const meu = ev.de === this.eu;
      const y = ev.de === 0 ? 0 : H;     // o 0 marca no gol de cima
      som.gol(meu);
      this.tremor = 22; this.clarao = agora;
      this.pulso[ev.de] = agora;
      this.golAceso = { y, t0: agora, cor: this.tom(ev.de) };
      this.corBrilho = this.tom(ev.de);
      for (let k = 0; k < 3; k++) this.efeito(`explode-${this.cor(ev.de)}`, ev.x + (k - 1) * 70, y, 260 - k * 40, 700 + k * 150);
      this.efeito(this.cor(ev.de) === 'azul' ? 'aro-azul' : 'aro-vermelho', ev.x, y, 300, 900, 0, true);
      this.confete(ev.x, y, ev.de === 0 ? 1 : -1, ev.de);
      this.rastro = [];
      this.anunciar(ev.ouro ? 'GOL DE OURO!' : 'GOOOL!', meu ? this.tom(ev.de) : '#fff', 1600, meu ? `${ev.placar[this.eu]} × ${ev.placar[1 - this.eu]}` : `${this.nome(ev.de)} marcou`);
      som.fala('Goool!');
      if (meu && navigator.vibrate) navigator.vibrate([60, 40, 120]);
    }
    if (ev.tipo === 'saque') {
      som.saque();
      this.textos = [];
      if (ev.de === this.eu) this.textos.push({ x: W / 2, y: H * 0.7 - 70, txt: 'SEU SAQUE', cor: this.tom(this.eu), t0: agora, tam: 24, dura: 1600 });
    }
    if (ev.tipo === 'preso') { this.anunciar('7 SEGUNDOS!', '#fff', 1300, 'o disco troca de lado'); som.apito(); }
    if (ev.tipo === 'ouro') { this.anunciar('GOL DE OURO', '#ffd23d', 2200, 'quem marcar leva'); som.ouro(); }
    if (ev.tipo === 'saiu') this.anunciar(`${this.nome(ev.i).toUpperCase()} SAIU`, '#fff', 1600);
  }

  encerrar(fim) {
    this.encerrado = true;
    const ganhei = fim.vencedor === this.eu;
    this.anunciar(ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3200);
    if (ganhei) {
      som.fanfarra();
      for (let k = 0; k < 5; k++) setTimeout(() => this.rodando && this.confete(Math.random() * W, H * (0.2 + Math.random() * 0.6), 0, this.eu), k * 350);
    } else som.derrota();
  }

  anunciar(txt, cor, dura, sub) { this.banner = { txt, cor, t0: performance.now(), dura, sub }; }
  efeito(nome, x, y, tam, vida, rot = 0, cresce = false) { this.particulas.push({ tipo: 'sprite', nome, x, y, tam, vida, rot, cresce, t0: performance.now() }); }
  faiscas(x, y, cor, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 150 + Math.random() * 500;
      this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, cor, t0: performance.now(), vida: 300 + Math.random() * 300 });
    }
  }
  confete(x, y, dir, quem) {
    const cores = [this.tom(quem), '#ffffff', '#ffd23d', this.tom(1 - quem)];
    for (let k = 0; k < 70; k++) {
      const a = dir === 0 ? Math.random() * Math.PI * 2 : (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + (Math.random() - 0.5) * 2.2;
      const v = 250 + Math.random() * 650;
      this.particulas.push({ tipo: 'confete', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20,
        cor: cores[k % cores.length], t0: performance.now(), vida: 1400 + Math.random() * 900, w: 6 + Math.random() * 8 });
    }
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiro(ev, true),
      move: (ev) => this.ponteiro(ev, false),
      resize: () => this.redimensionar(),
      menu: (ev) => ev.preventDefault(),
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    this.canvas.addEventListener('pointermove', this.h.move);
    addEventListener('resize', this.h.resize);
    this.canvas.addEventListener('contextmenu', this.h.menu);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    this.canvas.removeEventListener('pointermove', this.h.move);
    removeEventListener('resize', this.h.resize);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
  }

  ponteiro(ev, desceu) {
    ev.preventDefault();
    if (desceu) {
      destravar(); som.ambiente();
      const dentro = (r) => ev.clientX >= r.x && ev.clientX <= r.x + r.w && ev.clientY >= r.y && ev.clientY <= r.y + r.h;
      if (dentro(this.B.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
      if (dentro(this.B.mudo)) { som.alternarMudo(); return; }
    }
    // no toque só arrasta com o dedo na tela; no mouse, basta passar
    if (ev.pointerType !== 'mouse' && !desceu && ev.buttons === 0) return;
    if (!this.e || this.e.fim) return;
    const m = this.paraMundo(ev.clientX, ev.clientY);
    const [y0, y1] = this.eu === 0 ? [H / 2 + R_TACO, H - R_TACO] : [R_TACO, H / 2 - R_TACO];
    this.alvo = { x: Math.max(R_TACO, Math.min(W - R_TACO, m.x)), y: Math.max(y0, Math.min(y1, m.y)) };
  }

  /** Manda o alvo do taco no máximo a cada 30ms, e só se mudou. */
  enviar(agora) {
    if (!this.alvo || agora - this.enviado < 30) return;
    if (this.ultimoAlvo && this.ultimoAlvo.x === this.alvo.x && this.ultimoAlvo.y === this.alvo.y) return;
    this.enviado = agora;
    this.ultimoAlvo = this.alvo;
    this.op.onEntrada({ x: Math.round(this.alvo.x), y: Math.round(this.alvo.y) });
  }

  // ------------------------------------------------------------- tela

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr; this.vw = w; this.vh = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.deitado = w > h * 1.05;
    // em pé sobra altura: o placar ganha uma linha pros nomes embaixo das caixas
    this.estreito = w < 560;
    this.hud = this.estreito ? 84 : 66;
    const HUD = this.hud;
    // meu gol embaixo (em pé) ou à esquerda (deitado)
    this.ang = (this.deitado ? Math.PI / 2 : 0) + (this.eu === 1 ? Math.PI : 0);
    // o campo enche a tela: só a borda neon e as bocas dos gols aparecem, o resto da moldura sai pra fora
    const [tw, th] = this.deitado ? [H + 70, W + 24] : [W + 24, H + 70];
    this.esc = Math.min(w / tw, (h - HUD) / th);
    this.cx = w / 2; this.cy = HUD + (h - HUD) / 2;
    this.cos = Math.cos(this.ang); this.sin = Math.sin(this.ang);
    const meio = this.tela(W / 2, H / 2);
    this.cx += this.cx - meio.x; this.cy += this.cy - meio.y;
    const s = 40;
    const by = this.estreito ? 8 : (HUD - s) / 2;
    this.B = { sair: { x: 6, y: by, w: s, h: s }, mudo: { x: w - s - 6, y: by, w: s, h: s } };
    this.fundo = null;
  }

  /** Mundo (campo) -> tela. */
  tela(x, y) {
    const px = (x + OX - MW / 2) * this.esc, py = (y + OY - MH / 2) * this.esc;
    return { x: this.cx + px * this.cos - py * this.sin, y: this.cy + px * this.sin + py * this.cos };
  }

  paraMundo(sx, sy) {
    const dx = sx - this.cx, dy = sy - this.cy;
    const px = dx * this.cos + dy * this.sin, py = -dx * this.sin + dy * this.cos;
    return { x: px / this.esc - OX + MW / 2, y: py / this.esc - OY + MH / 2 };
  }

  /** Disco e tacos no instante t (relógio do servidor), interpolando entre dois estados. */
  interpolar(t) {
    const b = this.buf;
    if (!b.length) return null;
    let a = b[0], c = b[b.length - 1];
    for (let k = 0; k < b.length - 1; k++) if (b[k].t <= t && b[k + 1].t >= t) { a = b[k]; c = b[k + 1]; break; }
    if (t >= c.t) a = c;
    const k = c.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (c.t - a.t))) : 1;
    // o disco teleporta no gol/saque: não interpola por cima do salto
    const salto = Math.hypot(c.d[0] - a.d[0], c.d[1] - a.d[1]) > 200;
    const kd = salto ? (k < 0.5 ? 0 : 1) : k;
    return {
      d: { x: lerp(a.d[0], c.d[0], kd), y: lerp(a.d[1], c.d[1], kd), v: Math.hypot(c.d[2], c.d[3]) },
      t: [0, 1].map((i) => ({ x: lerp(a.t2[i][0], c.t2[i][0], k), y: lerp(a.t2[i][1], c.t2[i][1], k) })),
    };
  }

  // ------------------------------------------------------------- desenho

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    const e = this.e;
    if (!this.encerrado && !this.travou && e && e.fase !== 'fim' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }

    // meu taco: anda já, com o limite de velocidade do servidor
    if (this.meu && this.alvo) {
      const dx = this.alvo.x - this.meu.x, dy = this.alvo.y - this.meu.y, dist = Math.hypot(dx, dy);
      const k = dist > 0 ? Math.min(dist, V_TACO * dt) / dist : 0;
      this.meu.x += dx * k; this.meu.y += dy * k;
      this.meuVel = dt > 0 ? (dist * k) / dt : 0;
    }
    if (e && !e.fim) this.enviar(agora);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.desenharFundo(g, agora);
    this.tremor *= 0.86;
    const tx = (Math.random() - 0.5) * this.tremor, ty = (Math.random() - 0.5) * this.tremor;
    g.save();
    g.translate(tx, ty);
    this.desenharMesa(g, agora);
    if (e) this.desenharJogo(g, agora);
    this.desenharParticulas(g, agora, dt);
    this.desenharTextos(g, agora);
    g.restore();
    if (agora - this.clarao < 160) { g.fillStyle = `rgba(255,255,255,${0.35 * (1 - (agora - this.clarao) / 160)})`; g.fillRect(0, 0, this.vw, this.vh); }
    if (e) this.desenharHud(g, agora);
  }

  desenharFundo(g, agora) {
    const { vw, vh } = this;
    g.fillStyle = '#07040f'; g.fillRect(0, 0, vw, vh);
    // brilho da cor de quem bateu por último, respirando
    const r = Math.max(vw, vh) * 0.75;
    const gr = g.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, r);
    const resp = 0.18 + 0.06 * Math.sin(agora / 600);
    gr.addColorStop(0, hexA(this.corBrilho, resp)); gr.addColorStop(0.6, hexA('#5a1aa8', 0.12)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    // grade de fliperama correndo e poeira de luz
    g.save();
    g.strokeStyle = 'rgba(160,80,255,.10)'; g.lineWidth = 1;
    const p = 48, off = (agora / 40) % p;
    for (let x = -p + off; x < vw + p; x += p) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, vh); g.stroke(); }
    for (let y = -p + off; y < vh + p; y += p) { g.beginPath(); g.moveTo(0, y); g.lineTo(vw, y); g.stroke(); }
    g.globalCompositeOperation = 'lighter';
    for (const s of this.estrelas) {
      const y = ((s.y * vh + (agora / 1000) * 20 * s.z) % vh);
      g.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(agora / 700 + s.f));
      g.fillStyle = s.z > 0.8 ? '#ff5ad6' : '#6ab8ff';
      g.fillRect(s.x * vw, y, 2 * s.z, 2 * s.z);
    }
    g.restore();
  }

  desenharMesa(g, agora) {
    const im = IMG.mesa;
    if (!pronto(im)) return;
    g.save();
    g.translate(this.cx, this.cy); g.rotate(this.ang); g.scale(this.esc, this.esc);
    // sombra/brilho embaixo da mesa
    g.shadowColor = hexA(this.corBrilho, 0.55); g.shadowBlur = 40 * this.esc + 10;
    g.drawImage(im, -MW / 2, -MH / 2, MW, MH);
    g.shadowBlur = 0;
    // a boca do gol que sofreu acende piscando
    const ga = this.golAceso;
    if (ga) {
      const k = (agora - ga.t0) / 1500;
      if (k >= 1) this.golAceso = null;
      else {
        const gol = ga.y === 0 ? IMG['gol-vermelho'] : IMG['gol-azul'];
        if (pronto(gol)) {
          // por cima da barra do gol da própria mesa (medida na mesa.webp)
          const w = 360, h = (w * gol.naturalHeight) / gol.naturalWidth;
          const y = ga.y === 0 ? -MH / 2 + 8 : -MH / 2 + 830;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = (1 - k) * (0.6 + 0.4 * Math.sin(agora / 40));
          g.drawImage(gol, -w / 2, y, w, h);
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
      }
    }
    g.restore();
  }

  desenharJogo(g, agora) {
    const e = this.e;
    const s = this.interpolar(this.agoraServ() - ATRASO);
    if (!s) return;
    const meu = this.meu ?? s.t[this.eu];
    const tacos = [0, 1].map((i) => (i === this.eu ? meu : s.t[i]));
    // o disco desenhado não entra no meu taco (o servidor ainda vai rebater)
    let d = { x: s.d.x, y: s.d.y };
    const dx = d.x - meu.x, dy = d.y - meu.y, dist = Math.hypot(dx, dy), min = R_DISCO + R_TACO;
    if (dist < min && dist > 0.01 && e.fase === 'jogo') d = { x: meu.x + (dx / dist) * min, y: meu.y + (dy / dist) * min };
    const mostrarDisco = e.fase === 'jogo' || e.fase === 'contagem';

    // rastro do disco: mais rápido, mais comprido e mais quente
    if (mostrarDisco && e.fase === 'jogo') this.rastro.push({ ...this.tela(d.x, d.y), v: s.d.v, t: agora });
    // rastro de bolhas na cor de quem bateu: comprido e grosso, é ele que dá a velocidade
    this.rastro = this.rastro.filter((r) => agora - r.t < 520);
    if (this.rastro.length > 1) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [k, b] of this.rastro.entries()) {
        const kk = 1 - (agora - b.t) / 520, quente = Math.min(1, b.v / 1600);
        if (b.v < 120) continue;
        g.globalAlpha = 0.5 * kk * (0.5 + 0.5 * quente);
        g.fillStyle = k % 3 === 0 ? '#fff' : this.corBrilho;
        g.beginPath(); g.arc(b.x, b.y, R_DISCO * this.esc * (0.25 + 0.75 * kk) * (0.7 + 0.3 * Math.sin(k * 1.7)), 0, Math.PI * 2); g.fill();
      }
      g.restore();
      const ult = this.rastro[this.rastro.length - 1];
      if (ult.v > 1300 && Math.random() < 0.6) this.faiscas(d.x, d.y, '#ffb347', 1);
    }

    // tacos: fantasmas quando rápido, aro de luz embaixo, o sprite em pé por cima
    for (const i of [0, 1]) {
      const t = tacos[i], p = this.tela(t.x, t.y);
      const fs = this.fantasmas[i];
      fs.push({ ...p, t: agora });
      while (fs.length && agora - fs[0].t > 120) fs.shift();
      const rap = fs.length > 1 ? Math.hypot(p.x - fs[0].x, p.y - fs[0].y) / ((agora - fs[0].t) / 1000 || 1) / this.esc : 0;
      const im = IMG[`taco-${this.cor(i)}`];
      if (!pronto(im)) continue;
      const w = ((2 * R_TACO) / 0.95) * this.esc, h = (w * im.naturalHeight) / im.naturalWidth;
      if (rap > 900) {
        g.save(); g.globalCompositeOperation = 'lighter';
        fs.forEach((f, k) => { g.globalAlpha = 0.18 * (k / fs.length); g.drawImage(im, f.x - w / 2, f.y - h * 0.58, w, h); });
        g.restore();
      }
      g.save(); g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R_TACO * 1.9 * this.esc);
      halo.addColorStop(0, hexA(this.tom(i), 0.35 + (i === this.eu ? 0.1 : 0))); halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(p.x, p.y, R_TACO * 1.9 * this.esc, 0, Math.PI * 2); g.fill();
      g.restore();
      g.drawImage(im, p.x - w / 2, p.y - h * 0.58, w, h);
    }

    if (mostrarDisco) {
      const p = this.tela(d.x, d.y), im = IMG.disco;
      if (pronto(im)) {
        const w = R_DISCO * 2.5 * this.esc;
        g.save(); g.translate(p.x, p.y); g.rotate(agora / 120);
        g.globalCompositeOperation = 'lighter';
        const gl = g.createRadialGradient(0, 0, 0, 0, 0, w * 1.1);
        gl.addColorStop(0, 'rgba(255,210,60,.45)'); gl.addColorStop(1, 'rgba(255,160,0,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(0, 0, w * 1.1, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.drawImage(im, -w / 2, -w / 2, w, w);
        g.restore();
      }
      // contagem dos 7 segundos no meu lado
      if (e.fase === 'jogo' && e.lado === this.eu) {
        const falta = PRESO - (this.agoraServ() - e.ladoDesde);
        if (falta < 3000 && falta > 0) neon(g, String(Math.ceil(falta / 1000)), p.x, p.y - 40 * this.esc - 14, '#fff', 20);
      }
    }
  }

  desenharParticulas(g, agora, dt) {
    const vivas = [];
    for (const p of this.particulas) {
      const k = (agora - p.t0) / p.vida;
      if (k >= 1) continue;
      vivas.push(p);
      if (p.tipo === 'sprite') {
        const im = IMG[p.nome];
        if (!pronto(im)) continue;
        const c = this.tela(p.x, p.y);
        const w = p.tam * this.esc * (p.cresce ? 0.3 + 1.2 * sai(k) : 0.7 + 0.5 * sai(k)), h = (w * im.naturalHeight) / im.naturalWidth;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = k > 0.5 ? (1 - k) / 0.5 : 1;
        g.translate(c.x, c.y); g.rotate(p.rot + k * 0.6); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
      } else if (p.tipo === 'faisca') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92;
        const c = this.tela(p.x, p.y);
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - k;
        g.fillStyle = p.cor; g.beginPath(); g.arc(c.x, c.y, Math.max(1, 3 * this.esc * (1 - k) + 1), 0, Math.PI * 2); g.fill(); g.restore();
      } else if (p.tipo === 'confete') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; p.rot += p.vr * dt;
        const c = this.tela(p.x, p.y);
        g.save(); g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; g.translate(c.x, c.y); g.rotate(p.rot);
        g.fillStyle = p.cor; g.fillRect(-p.w * this.esc / 2, -p.w * this.esc / 4, p.w * this.esc, (p.w * this.esc) / 2 * Math.abs(Math.cos(p.rot * 2)) + 1);
        g.restore();
      }
    }
    this.particulas = vivas.slice(-600);
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < (t.dura ?? 1000));
    for (const t of this.textos) {
      const k = (agora - t.t0) / (t.dura ?? 1000);
      const c = this.tela(t.x, t.y);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const s = k < 0.15 ? volta(k / 0.15) : 1;
      neon(g, t.txt, c.x, c.y - 40 * sai(k), t.cor, t.tam * s);
    }
    g.globalAlpha = 1;
  }

  desenharHud(g, agora) {
    const e = this.e, { vw } = this, HUD = this.hud;
    // faixa de cima: eu à esquerda, o outro à direita, o relógio no meio
    const fx = g.createLinearGradient(0, 0, 0, HUD);
    fx.addColorStop(0, 'rgba(20,6,40,.95)'); fx.addColorStop(1, 'rgba(20,6,40,.6)');
    g.fillStyle = fx; g.fillRect(0, 0, vw, HUD);
    g.fillStyle = hexA('#b44dff', 0.6); g.fillRect(0, HUD - 2, vw, 2);
    const caixa = this.estreito ? 46 : 50, meio = vw / 2;
    const lados = [[this.eu, meio - (this.estreito ? 50 : 70) - caixa], [1 - this.eu, meio + (this.estreito ? 50 : 70)]];
    for (const [i, x] of lados) {
      const im = IMG[`placar-${this.cor(i)}`];
      const pul = agora - this.pulso[i] < 900 ? 1 + 0.25 * Math.sin(((agora - this.pulso[i]) / 900) * Math.PI) : 1;
      const y = this.estreito ? 6 : (HUD - caixa) / 2;
      g.save(); g.translate(x + caixa / 2, y + caixa / 2); g.scale(pul, pul);
      if (pronto(im)) g.drawImage(im, -caixa / 2, -caixa / 2, caixa, caixa);
      neon(g, String(e.placar[i]), 0, 1, this.tom(i), 26);
      g.restore();
      const nome = i === this.eu ? 'VOCÊ' : this.nome(i).slice(0, 10).toUpperCase();
      if (this.estreito) {
        g.font = '800 11px system-ui'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = this.tom(i);
        g.fillText(nome, x + caixa / 2, HUD - 14);
        continue;
      }
      const nx = i === this.eu ? x - 8 : x + caixa + 8;
      g.font = '800 12px system-ui'; g.textBaseline = 'middle'; g.textAlign = i === this.eu ? 'right' : 'left';
      {
        g.fillStyle = this.tom(i); g.fillText(nome, nx, HUD / 2 - 8);
        g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '700 10px system-ui'; g.fillText(`${GOLS} gols vence`, nx, HUD / 2 + 8);
      }
    }
    // relógio
    const resta = e.fase === 'contagem' ? TEMPO : Math.max(0, e.fimEm - this.agoraServ());
    const seg = Math.ceil(resta / 1000);
    if (e.fase === 'jogo' && !e.ouro && seg <= 10 && seg > 0 && seg !== this.ultimoBip) { this.ultimoBip = seg; som.bip(seg <= 3); }
    const ry = this.estreito ? 6 + caixa / 2 : HUD / 2;
    if (e.ouro) neon(g, 'OURO', meio, ry, '#ffd23d', 20 + 2 * Math.sin(agora / 150));
    else neon(g, `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, meio, ry, seg <= 10 && e.fase === 'jogo' ? '#ff4a5a' : '#38e8ff', 22);
    // botões
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = this.B[k];
      g.fillStyle = 'rgba(255,255,255,.08)'; g.strokeStyle = 'rgba(180,90,255,.7)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // contagem
    const cy = this.cy;
    if (e.fase === 'contagem') {
      const falta = Math.max(0, e.faseAte - this.agoraServ());
      const num = Math.ceil(falta / 1000);
      if (num !== this.ultimaContagem && num > 0 && num <= 3) { this.ultimaContagem = num; som.bip(false); }
      const k = 1 - (falta % 1000) / 1000;
      if (num > 0 && num <= 3) { g.globalAlpha = 1 - k * 0.6; neon(g, String(num), meio, cy, '#fff', 110 * (1.4 - 0.4 * sai(k))); g.globalAlpha = 1; }
      neon(g, matchMedia('(pointer: coarse)').matches ? 'Arraste o dedo pra mover o taco' : 'Mova o mouse pra mover o taco', meio, cy + 90, '#c9a7ff', 15);
    } else if (this.ultimaContagem && e.fase === 'jogo' && !this.jaFoi) {
      this.jaFoi = true; som.apito(); this.anunciar('JÁ!', '#3dff8c', 800);
    }
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(meio, cy - 20);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        const tam = Math.min(64, (vw * 0.85) / Math.max(5, this.banner.txt.length) * 1.7);
        neon(g, this.banner.txt, 0, 0, this.banner.cor, tam);
        if (this.banner.sub) neon(g, this.banner.sub, 0, tam * 0.85, '#fff', Math.max(14, tam * 0.32));
        g.restore();
      }
    }
  }
}

/** Miolo do letreiro: a cor clareada (o tubo de neon aceso). */
function mistura(hex) {
  const n = parseInt(hex.slice(1), 16), c = (v) => Math.round(v + (255 - v) * 0.65);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Texto de letreiro neon: brilho colorido em volta, miolo claro. */
function neon(g, txt, x, y, cor, tam) {
  g.save();
  g.font = `900 ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const brilho = cor === '#fff' ? '#b44dff' : cor;
  g.lineWidth = Math.max(4, tam / 5); g.strokeStyle = 'rgba(10,0,25,.9)'; g.strokeText(txt, x, y);
  g.shadowColor = brilho; g.shadowBlur = tam * 0.4;
  g.lineWidth = Math.max(2, tam / 10); g.strokeStyle = brilho; g.strokeText(txt, x, y);
  g.shadowBlur = 0; g.fillStyle = cor === '#fff' ? '#fff' : mistura(cor); g.fillText(txt, x, y);
  g.restore();
}

