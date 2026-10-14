import { JEGUES, CORES, OBSTACULOS, PISTA } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles da Corrida de Jegues (canvas 2D). O servidor
 * manda a posição de cada jegue 30 vezes por segundo; aqui a gente desenha um
 * pouquinho no passado (ATRASO) interpolando entre dois estados — liso em
 * qualquer rede.
 *
 * O que é daqui:
 *  - pista de lado com uma raia por jegue (a minha na frente, as outras atrás,
 *    menores: profundidade), céu, mesetas, cactos e a arquibancada pulando;
 *  - jegue correndo quadro a quadro (mais rápido = pata mais rápida), pulo com
 *    sombra, tombo rolando na poeira com estrelinhas, empacado tremendo de raiva,
 *    turbo de cenoura com raios e rastro, pum com nuvem verde;
 *  - poeira e torrões de terra saindo das patas, linhas de velocidade;
 *  - largada com 3-2-1, chegada com confete, troféu e a cara do vencedor;
 *  - celular em pé: a tela gira pra deitada (corrida é na horizontal).
 */

const A = import.meta.glob('../../assets/jegues/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.webp$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const DH = 540;                 // altura da tela em unidades de desenho
const ANCORA = 0.3;             // onde o meu jegue fica na tela (fração da largura)
const PX = 0.9;                 // pixel do sprite -> unidade
const QUADROS = { pepano: 6, costelinha: 5, misere: 5, relampago: 5, jerimum: 4 };
const TOM = { pepano: '#ff4b3a', costelinha: '#2f8bff', misere: '#2ecc40', relampago: '#ffb020', jerimum: '#b65cff' };
const SPRITE_OBST = {
  feno: ['feno', 58], pedras: ['pedras', 44], caveira: ['caveira', 46], cerca: ['cerca-curta', 66],
  cacto: ['cacto-2', 110], caixotes: ['caixotes', 58], carroca: ['carroca', 80],
};
const PUNS = ['PUM!', 'PRRRT!', 'FUUUM!', 'PÓÓ!', 'PRRR…'];
const FALA_TOMBO = ['Capotou!', 'Beijou o chão!', 'Que tombo, minha gente!', 'Caiu de cara!'];
const FALA_EMPACA = ['Empacou!', 'Jegue teimoso!', 'Não quer mais correr!'];
const FALA_PUM = ['Eita, que fedor!', 'Soltou um pum!', 'Foi o jegue, juro!', 'Propulsão a gás!'];
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const sorteia = (a) => a[Math.floor(Math.random() * a.length)];

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
    this.hist = [];
    this.desvio = null;
    this.vistos = 0;
    this.pista = null;
    this.comidas = [];
    this.anim = [0, 1, 2, 3].map(() => ({ fase: Math.random() * 6, poeira: 0, passos: 0, pum: 0, pumTxt: '', tombo: 0, empaca: 0, turbo: 0, zurro: 0, salto: 0, chicote: 0, x: 0, y: 0, vel: 0 }));
    this.particulas = [];
    this.tela = [];             // partículas em coordenada de tela (confete)
    this.textos = [];
    this.banner = null;
    this.tremor = 0;
    this.cam = 0;
    this.proxZurro = performance.now() + 2500;
    this.lider = null;
    this.retaFinal = false;
    this.encerrado = false;
    this.fimEm = 0;
    this.botao = { chicote: 0, pulo: 0 };
    this.toque = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.chegou = performance.now();
    this.nuvens = Array.from({ length: 5 }, (_, k) => ({ x: Math.random() * 1600, y: 30 + k * 32, r: 50 + Math.random() * 60, v: 6 + Math.random() * 8 }));
    // o clique de "Entrar no jogo" já deu o gesto: Chrome/Android libera o som da contagem aqui
    destravar();
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    // um erro num quadro não pode congelar o jogo: loga e segue
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
  nome(i) { return (this.op.jogadores[i]?.name ?? `Peão ${i + 1}`).split(' ')[0]; }
  jegue(i) { return JEGUES[this.cor(i)]?.nome ?? 'Jegue'; }
  agoraServ() { return performance.now() + (this.desvio ?? 0); }
  comprimento() { return this.e?.comprimento ?? PISTA; }

  /** Raia de cada assento: eu na frente (a última), os outros atrás na ordem dos assentos. */
  raia(i) {
    const n = this.e?.n ?? 2;
    const outros = [...Array(n).keys()].filter((k) => k !== this.eu);
    return i === this.eu ? n - 1 : outros.indexOf(i);
  }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    if (e.pista) this.pista = e.pista;
    if (e.comidas) this.comidas = e.comidas.map((c) => new Set(c));
    const antes = this.e;
    this.e = e;
    this.hist.push({ t: e.agora, j: e.j });
    if (this.hist.length > 12) this.hist.shift();
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.evento(ev, antes, agora); }
    if (e.fim && !this.encerrado) this.encerrar(e.fim);
  }

  /** Jegues no instante desenhado (interpolado entre dois estados do servidor). */
  posicoes() {
    const h = this.hist;
    if (!h.length) return null;
    const t = this.agoraServ() - ATRASO;
    let a = h[0], b = h[0];
    for (let k = 0; k < h.length - 1; k++) if (h[k].t <= t && h[k + 1].t >= t) { a = h[k]; b = h[k + 1]; break; }
    if (t >= h[h.length - 1].t) { a = b = h[h.length - 1]; }
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    // além do último estado (rede atrasou), segue andando por até 150ms
    const extra = a === b && t > b.t ? Math.min(0.15, (t - b.t) / 1000) : 0;
    return b.j.map((jb, i) => {
      const ja = a.j[i] ?? jb;
      return { x: lerp(ja[0], jb[0], f) + jb[2] * extra, y: lerp(ja[1], jb[1], f), vel: jb[2], cansaco: jb[3], tombo: jb[4], empaca: jb[5], turbo: jb[6] };
    });
  }

  evento(ev, antes, agora) {
    const meu = ev.i === this.eu;
    const v = meu ? 1 : 0.45;
    const an = this.anim[ev.i];
    if (ev.tipo === 'largada') {
      som.largada();
      som.fala('Foi dada a largada!', true);
      this.anunciar('VAI!', '#ffd23d', 1100);
      this.tremor = 8;
      for (let i = 0; i < (this.e?.n ?? 0); i++) for (let k = 0; k < 4; k++) this.poeira(i, 0, 1.3);
    }
    if (ev.tipo === 'pulo') { som.pulo(v); an.salto = agora; this.poeira(ev.i, -10, 0.8); }
    if (ev.tipo === 'pousou') { som.pouso(v * 0.8); for (let k = 0; k < 2; k++) this.poeira(ev.i, k * 20 - 10, 0.9); this.terra(ev.i, 4); }
    if (ev.tipo === 'tombo') {
      an.tombo = agora;
      som.tombo(v);
      som.ooo();
      this.terra(ev.i, 10);
      for (let k = 0; k < 5; k++) this.poeira(ev.i, k * 25 - 40, 1.6);
      this.efeito(ev.i, 'estouro', 0, 60, 500, 120);
      this.texto(ev.i, meu ? sorteia(['CAPOTOU!', 'POF!', 'TCHIBUM!']) : 'POF!', '#fff', meu ? 38 : 26);
      if (meu) { this.tremor = 14; navigator.vibrate?.([60, 40, 90]); som.fala(sorteia(FALA_TOMBO)); }
      else if (Math.random() < 0.4) som.fala(`Caiu o ${this.jegue(ev.i)}!`);
    }
    if (ev.tipo === 'empacou') {
      an.empaca = agora;
      som.empacou(v);
      this.texto(ev.i, meu ? 'EMPACOU!' : 'EMPACOU', '#ff6a3d', meu ? 36 : 24);
      if (meu) { this.tremor = 6; navigator.vibrate?.(120); som.fala(sorteia(FALA_EMPACA)); }
    }
    if (ev.tipo === 'pum') {
      an.pum = agora; an.pumTxt = sorteia(PUNS); an.pumForte = ev.forte;
      som.pum(meu ? 1 : 0.6, ev.forte);
      for (let k = 0; k < (ev.forte ? 9 : 5); k++) this.particulas.push({ tipo: 'pum', i: ev.i, x: null, dx: -40 - Math.random() * 30, y: 45 + Math.random() * 20, vx: -60 - Math.random() * 80, vy: (Math.random() - 0.3) * 40, t0: agora + k * 30, vida: 1300 + Math.random() * 600, r: 14 + Math.random() * 16 });
      if (meu && Math.random() < 0.6) som.fala(sorteia(FALA_PUM));
      if (ev.forte) som.vibra(0.6, 0.8);
    }
    if (ev.tipo === 'cenoura') {
      (this.comidas[ev.i] ??= new Set()).add(ev.c);
      an.turbo = agora;
      som.cenoura(v);
      this.efeito(ev.i, 'raio', 40, 60, 600, 80);
      this.texto(ev.i, 'TURBO!', '#ffd23d', meu ? 36 : 24);
      if (meu) { som.fala('Turbo de cenoura!'); navigator.vibrate?.(40); }
    }
    if (ev.tipo === 'passou' && meu) { som.passou(); if (Math.random() < 0.3) som.vibra(0.4, 0.6); }
    if (ev.tipo === 'chegou') {
      this.chegadaEm = agora;
      for (let k = 0; k < 160; k++) this.confete(k < 80);
    }
    if (ev.tipo === 'saiu') this.textos.push({ tela: true, x: 0.5, y: 0.4, txt: `${this.nome(ev.i)} saiu`, cor: '#fff', t0: agora, tam: 26 });
  }

  /** Fim da corrida (ou conexão perdida, sem `fim`: só congela). */
  encerrar(fim) {
    this.encerrado = true;
    this.fimEm = performance.now();
    if (!fim) { som.parar(); return; }
    this.vencedor = fim.vencedor;
    const ganhei = fim.vencedor === this.eu;
    som.parar();
    if (fim.vencedor == null) this.anunciar('EMPATE!', '#fff', 3000);
    else this.anunciar(ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3400);
    if (ganhei) { som.fanfarra(); som.fala(`${this.jegue(this.eu)} venceu! Que jegue!`, true); navigator.vibrate?.([80, 60, 80, 60, 200]); }
    else { som.derrota(); if (fim.vencedor != null) som.fala(`${this.nome(fim.vencedor)} venceu com o ${this.jegue(fim.vencedor)}!`, true); }
    setTimeout(() => som.zurro(1, 1), 900);
    if (!this.chegadaEm) for (let k = 0; k < 120; k++) this.confete(true);
  }

  anunciar(txt, cor, dura) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  texto(i, txt, cor, tam) { this.textos.push({ i, txt, cor, tam, t0: performance.now(), dx: (Math.random() - 0.5) * 30 }); }
  poeira(i, dx = 0, tam = 1) {
    this.particulas.push({ tipo: 'poeira', i, x: null, dx: dx - 30, y: 0, vx: -40 - Math.random() * 50, vy: 10 + Math.random() * 20, t0: performance.now(), vida: 650 + Math.random() * 300, tam: (50 + Math.random() * 30) * tam, f: Math.floor(Math.random() * 2) });
  }
  terra(i, q) {
    for (let k = 0; k < q; k++) this.particulas.push({ tipo: 'terra', i, x: null, dx: -10 + Math.random() * 30, y: 5, vx: -80 - Math.random() * 160, vy: 180 + Math.random() * 220, rot: Math.random() * 6, t0: performance.now(), vida: 900, f: Math.floor(Math.random() * 6) });
  }
  efeito(i, nome, dx, y, vida, tam) { this.particulas.push({ tipo: 'sprite', nome, i, x: null, dx, y, vx: 0, vy: 0, t0: performance.now(), vida, tam }); }
  confete(cima) {
    const cores = ['#ff3b30', '#ffd23d', '#2ecc40', '#2f8bff', '#ff6fc8', '#fff'];
    this.tela.push({ x: Math.random(), y: cima ? -0.05 - Math.random() * 0.3 : 0.6, vx: (Math.random() - 0.5) * 0.25, vy: cima ? 0.05 + Math.random() * 0.15 : -0.6 - Math.random() * 0.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, cor: sorteia(cores), t0: performance.now(), vida: 3500 + Math.random() * 1500, w: 6 + Math.random() * 6 });
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiro(ev),
      tecla: (ev) => {
        if (ev.repeat) return;
        if ([' ', 'ArrowUp', 'w', 'W'].includes(ev.key)) { ev.preventDefault(); destravar(); this.pular(); }
        if (['ArrowRight', 'd', 'D', 'Enter', 'x', 'X'].includes(ev.key)) { ev.preventDefault(); destravar(); this.chicotear(); }
      },
      resize: () => this.redimensionar(),
      menu: (ev) => ev.preventDefault(),
      solta: () => destravar(),   // iOS só libera o áudio no fim do toque
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('keydown', this.h.tecla);
    addEventListener('resize', this.h.resize);
    this.canvas.addEventListener('contextmenu', this.h.menu);
    addEventListener('touchend', this.h.solta);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('keydown', this.h.tecla);
    removeEventListener('resize', this.h.resize);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
    removeEventListener('touchend', this.h.solta);
  }

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }

  pular() {
    const e = this.e;
    if (!e || e.fim || e.fase !== 'corrida') return;
    this.botao.pulo = performance.now();
    this.op.onEntrada({ pular: true });
  }

  chicotear() {
    const e = this.e;
    if (!e || e.fim || e.fase !== 'corrida') return;
    const agora = performance.now();
    if (agora - this.botao.chicote < 90) return;
    this.botao.chicote = agora;
    this.anim[this.eu].chicote = agora;
    som.chicote(1);
    const me = e.j[this.eu];
    if (!me[4] && !me[5] && Math.random() < 0.25) this.texto(this.eu, sorteia(['ÊÊÊ!', 'VAI!', 'ARRE!', 'UPA!']), '#fff', 22);
    this.op.onEntrada({ chicote: true });
  }

  ponteiro(ev) {
    destravar();
    if (ev.pointerType !== 'mouse') this.toque = true;
    ev.preventDefault();
    const v = this.paraVirtual(ev.clientX, ev.clientY);
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(this.B.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(this.B.mudo)) { som.alternarMudo(); return; }
    // metade esquerda chicoteia, metade direita pula (os botões desenhados ficam nos cantos)
    if (v.x < this.vw / 2) this.chicotear(); else this.pular();
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
    this.esc = this.vh / DH;
    this.uw = this.vw / this.esc;          // largura da tela em unidades
    const s = 42;
    this.B = { sair: { x: this.vw - s - 8, y: 8, w: s, h: s }, mudo: { x: this.vw - (s + 8) * 2, y: 8, w: s, h: s } };
    this.rb = Math.max(38, Math.min(70, this.vh * 0.13));
  }

  /** Chão de cada raia (y em unidades) e escala da profundidade. */
  chao(k) {
    const n = this.e?.n ?? 2;
    const f = n > 1 ? k / (n - 1) : 1;
    return { y: 342 + f * 178, s: 0.7 + 0.3 * f };
  }

  /** x do mundo -> x na tela (unidades) na raia de escala s. */
  sx(x, s) { return this.uw * ANCORA + (x - this.cam) * s; }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    const e = this.e;
    if (!this.encerrado && !this.travou && e?.fase === 'corrida' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    let pos = this.posicoes();
    // depois do fim o servidor para: os jegues seguem e freiam sozinhos
    if (pos && this.encerrado) {
      const k = Math.min(1, (agora - this.fimEm) / 2500);
      this.fimPos ??= pos.map((p) => ({ ...p }));
      for (const [i, p] of this.fimPos.entries()) { p.vel *= 1 - dt * (i === this.vencedor ? 0.9 : 3); p.x += p.vel * dt; p.y = Math.max(0, p.y - 300 * dt); }
      pos = this.fimPos;
      void k;
    }
    if (pos) {
      for (const [i, p] of pos.entries()) {
        const an = this.anim[i];
        an.x = p.x; an.y = p.y; an.vel = p.vel;
      }
      const meu = pos[this.eu];
      this.cam = this.cam ? lerp(this.cam, meu.x, Math.min(1, dt * 12)) : meu.x;
      this.sons(pos, agora, dt);
    }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#e8b070'; g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }
    this.tremor *= 0.86;
    g.save();
    g.translate((Math.random() - 0.5) * this.tremor, (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharFundo(g, agora, dt);
    this.desenharPista(g, agora);
    if (pos && this.pista) {
      const n = e.n;
      const ordem = [...Array(n).keys()].sort((a, b) => this.raia(a) - this.raia(b));
      for (const i of ordem) {
        const { y, s } = this.chao(this.raia(i));
        this.desenharObstaculos(g, i, y, s, agora);
        this.desenharJegue(g, i, pos[i], y, s, agora, dt);
        this.desenharParticulas(g, i, y, s, agora, dt);
        this.desenharTextos(g, i, y, s, agora);
      }
    }
    this.desenharFrente(g, agora);
    g.restore();
    if (pos) this.desenharVelocidade(g, pos[this.eu], agora);
    this.desenharConfete(g, agora, dt);
    if (e) this.desenharHud(g, pos, agora);
  }

  /** Galope, zurros de vez em quando e as falas da corrida. */
  sons(pos, agora, dt) {
    const e = this.e;
    if (!e || e.fase !== 'corrida' || this.encerrado) return;
    for (const [i, p] of pos.entries()) {
      const an = this.anim[i];
      if (p.tombo || p.empaca || p.y > 0 || e.fora[i]) continue;
      an.passos += p.vel * dt;
      if (an.passos > 120) { an.passos = 0; som.galope(i === this.eu ? 0.9 : 0.25, p.vel / 350); }
    }
    if (agora > this.proxZurro) {
      this.proxZurro = agora + 3500 + Math.random() * 5500;
      const vivos = pos.map((_, i) => i).filter((i) => !e.fora[i]);
      const i = sorteia(vivos);
      this.anim[i].zurro = agora;
      som.zurro(i === this.eu ? 0.8 : 0.4, 0.85 + Math.random() * 0.3);
    }
    // liderança e reta final
    const ord = pos.map((p, i) => [p.x, i]).filter(([, i]) => !e.fora[i]).sort((a, b) => b[0] - a[0]);
    const lider = ord[0]?.[1];
    if (lider != null && lider !== this.lider && ord[0][0] > 600) {
      if (this.lider != null && agora - (this.trocaLider ?? 0) > 4000) {
        this.trocaLider = agora;
        som.fala(lider === this.eu ? 'Você assumiu a ponta!' : `${this.jegue(lider)} assume a ponta!`);
        som.vibra(0.8, 1);
        if (lider === this.eu) this.anunciar('NA FRENTE!', '#2ecc40', 1100);
      }
      this.lider = lider;
    }
    if (!this.retaFinal && ord[0] && ord[0][0] > this.comprimento() * 0.8) {
      this.retaFinal = true;
      som.retaFinal();
      som.fala('Reta final!', true);
      this.anunciar('RETA FINAL!', '#ff6a3d', 1400);
    }
  }

  // ---- céu, mesetas, cenário do meio e arquibancada (parallax)
  desenharFundo(g, agora, dt) {
    const W = this.uw;
    const ceu = g.createLinearGradient(0, 0, 0, 300);
    ceu.addColorStop(0, '#3d8fdc'); ceu.addColorStop(0.55, '#8cc4ec'); ceu.addColorStop(1, '#f6d29a');
    g.fillStyle = ceu; g.fillRect(0, 0, W, 300);
    // sol
    const sx = W * 0.78, sy = 70;
    const sol = g.createRadialGradient(sx, sy, 0, sx, sy, 120);
    sol.addColorStop(0, 'rgba(255,250,220,1)'); sol.addColorStop(0.2, 'rgba(255,236,160,.9)'); sol.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = sol; g.fillRect(sx - 120, sy - 120, 240, 240);
    // nuvens
    for (const n of this.nuvens) {
      n.x -= (n.v + (this.anim[this.eu]?.vel ?? 0) * 0.02) * dt;
      if (n.x + n.r * 2 < 0) n.x = W + n.r * 2;
      g.fillStyle = 'rgba(255,255,255,.75)';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(n.x + k * n.r * 0.6, n.y - (k === 1 ? n.r * 0.25 : 0), n.r * 0.6, n.r * 0.35, 0, 0, Math.PI * 2); g.fill(); }
    }
    // mesetas lá longe
    for (const [par, base, cor, alt] of [[0.05, 250, '#d9a07a', 90], [0.12, 268, '#c47a4c', 70]]) {
      g.fillStyle = cor;
      g.beginPath(); g.moveTo(0, 300);
      const per = 1400, off = (this.cam * par) % per;
      for (let x = -off - 200; x < W + 200; x += 40) {
        const k = Math.floor((x + off + 100000 * per) / 160);
        const hgt = hash(k * 3.1 + par) > 0.55 ? alt * (0.6 + hash(k) * 0.6) : alt * 0.15 * hash(k * 7);
        g.lineTo(x, base - hgt);
      }
      g.lineTo(W + 200, 300); g.closePath(); g.fill();
    }
    // deserto do meio com cactos, torres e caveiras
    g.fillStyle = '#e6b77c'; g.fillRect(0, 262, W, 50);
    const par = 0.3, passo = 170;
    const i0 = Math.floor((this.cam * par - 200) / passo), i1 = Math.ceil((this.cam * par + W) / passo);
    for (let k = i0; k <= i1; k++) {
      const h = hash(k * 1.7);
      if (h < 0.35) continue;
      const nome = h < 0.55 ? 'cacto' : h < 0.68 ? 'cacto-3' : h < 0.76 ? 'torre' : h < 0.84 ? 'placa' : h < 0.9 ? 'caveira' : h < 0.95 ? 'portal' : 'carroca';
      const im = IMG[nome];
      if (!pronto(im)) continue;
      const s = 0.42 + hash(k * 5.3) * 0.15;
      const x = k * passo + hash(k * 9.1) * 80 - this.cam * par;
      g.drawImage(im, x, 292 - im.naturalHeight * s, im.naturalWidth * s, im.naturalHeight * s);
    }
    // arquibancada: o público pulando atrás da cerca, bandeirolas por cima
    const pub = IMG.publico, cerca = IMG.cerca, band = IMG.bandeirolas;
    const pa = 0.7, tw = 230;
    const animacao = this.e?.fase === 'corrida' || this.encerrado ? 1 : 0.4;
    const j0 = Math.floor((this.cam * pa - 300) / tw), j1 = Math.ceil((this.cam * pa + W) / tw);
    for (let k = j0; k <= j1; k++) {
      const x = k * tw - this.cam * pa;
      const h = hash(k * 2.3);
      if (pronto(pub) && h > 0.15) {
        const pulo = Math.abs(Math.sin(agora / (150 + h * 60) + k)) * 6 * animacao * (this.encerrado ? 2.5 : 1);
        const s = 0.62;
        g.drawImage(pub, 0, 0, pub.naturalWidth, pub.naturalHeight * 0.52, x, 228 - pulo, pub.naturalWidth * s, pub.naturalHeight * 0.52 * s);
        const pulo2 = Math.abs(Math.sin(agora / (170 + h * 50) + k * 2)) * 5 * animacao * (this.encerrado ? 2.5 : 1);
        g.drawImage(pub, 0, pub.naturalHeight * 0.48, pub.naturalWidth, pub.naturalHeight * 0.52, x + 12, 268 - pulo2, pub.naturalWidth * s, pub.naturalHeight * 0.52 * s);
      } else if (pronto(IMG['cacto-2'])) {
        const c = IMG['cacto-2']; g.drawImage(c, x + 80, 330 - c.naturalHeight * 0.9, c.naturalWidth * 0.9, c.naturalHeight * 0.9);
      }
      if (pronto(cerca)) g.drawImage(cerca, x - 4, 296, tw + 8, 50);
      if (pronto(band) && h > 0.5) g.drawImage(band, x + 20, 214 + Math.sin(agora / 600 + k) * 2, 180, 60);
    }
  }

  // ---- areia, raias, largada e chegada
  desenharPista(g, agora) {
    const W = this.uw;
    const gr = g.createLinearGradient(0, 330, 0, DH);
    gr.addColorStop(0, '#d79c5a'); gr.addColorStop(1, '#b97b3e');
    g.fillStyle = gr; g.fillRect(0, 332, W, DH - 332);
    if (!this.e) return;
    const n = this.e.n;
    // pedrinhas e marcas no chão de cada raia (andam com a câmera na escala da raia)
    for (let k = 0; k < n; k++) {
      const { y, s } = this.chao(k);
      g.fillStyle = 'rgba(110,60,20,.25)';
      const passo = 70 * s, off = ((this.cam * s) % passo + passo) % passo;
      for (let x = -off; x < W; x += passo) {
        const q = Math.floor((x + this.cam * s) / passo);
        g.beginPath(); g.ellipse(x + hash(q + k * 99) * 40, y + 6 + hash(q * 3 + k) * 14 * s, 6 * s, 2 * s, 0, 0, Math.PI * 2); g.fill();
      }
      // linha de giz separando as raias
      if (k < n - 1) {
        const yb = (y + this.chao(k + 1).y) / 2 + 12;
        g.strokeStyle = 'rgba(255,245,225,.55)'; g.lineWidth = 3 * s; g.setLineDash([26 * s, 22 * s]);
        g.lineDashOffset = this.cam * s;
        g.beginPath(); g.moveTo(0, yb); g.lineTo(W, yb); g.stroke();
        g.setLineDash([]);
      }
    }
    // faixa quadriculada da largada e da chegada, de raia em raia
    for (const [xl, chegada] of [[0, false], [this.comprimento(), true]]) {
      for (let k = 0; k < n; k++) {
        const { y, s } = this.chao(k);
        const x = this.sx(xl, s);
        if (x < -80 || x > W + 80) continue;
        const topo = k ? (this.chao(k - 1).y + y) / 2 + 12 : 332;
        const fundo = k < n - 1 ? (y + this.chao(k + 1).y) / 2 + 12 : DH;
        const q = 9 * s;
        for (let yy = topo, l = 0; yy < fundo; yy += q, l++) for (let c = 0; c < 3; c++) {
          g.fillStyle = (l + c) % 2 ? (chegada ? '#111' : '#fff') : (chegada ? '#fff' : 'rgba(255,255,255,.2)');
          g.fillRect(x + c * q, yy, q, Math.min(q, fundo - yy));
        }
      }
      // placa em cima, com os postes
      const { s } = this.chao(0);
      const x = this.sx(xl, s);
      const im = IMG[chegada ? 'chegada' : 'largada'];
      if (pronto(im) && x > -300 && x < W + 300) {
        const w = 230, h = (w * im.naturalHeight) / im.naturalWidth;
        g.fillStyle = '#6b3e1a';
        g.fillRect(x - w / 2 + 10, 150, 9, 200); g.fillRect(x + w / 2 - 19, 150, 9, 200);
        g.drawImage(im, x - w / 2, 130 + Math.sin(agora / 500) * 2, w, h);
        const b = IMG.bandeira;
        if (pronto(b) && chegada) {
          const bal = Math.sin(agora / 160) * 0.08;
          for (const lado of [-1, 1]) { g.save(); g.translate(x + lado * (w / 2 + 10), 150); g.scale(lado, 1); g.rotate(bal); g.drawImage(b, -10, -60, 70, 65); g.restore(); }
        }
      }
    }
  }

  desenharObstaculos(g, i, y, s, agora) {
    const W = this.uw;
    for (const o of this.pista.obst) {
      const ob = OBSTACULOS[o.tipo];
      const x = this.sx(o.x + ob.w / 2, s);
      if (x < -150 || x > W + 150) continue;
      const [nome, alt] = SPRITE_OBST[o.tipo];
      const im = IMG[nome];
      if (!pronto(im)) continue;
      const h = alt * s, w = (h * im.naturalWidth) / im.naturalHeight;
      g.fillStyle = 'rgba(60,30,10,.25)'; g.beginPath(); g.ellipse(x, y + 2, w * 0.5, 6 * s, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(im, x - w / 2, y - h + 4 * s, w, h);
    }
    const comidas = this.comidas[i];
    const c = IMG.cenoura;
    if (!pronto(c)) return;
    for (const ce of this.pista.cenouras) {
      if (comidas?.has(ce.id)) continue;
      const x = this.sx(ce.x, s);
      if (x < -60 || x > W + 60) continue;
      const bob = Math.sin(agora / 250 + ce.id) * 5;
      const yy = y - (ce.y + 30) * s + bob;
      const brilho = g.createRadialGradient(x, yy, 0, x, yy, 34 * s);
      brilho.addColorStop(0, 'rgba(255,230,120,.7)'); brilho.addColorStop(1, 'rgba(255,230,120,0)');
      g.fillStyle = brilho; g.fillRect(x - 40 * s, yy - 40 * s, 80 * s, 80 * s);
      g.save(); g.translate(x, yy); g.rotate(Math.sin(agora / 300 + ce.id) * 0.25);
      g.drawImage(c, -18 * s, -20 * s, 36 * s, 40 * s); g.restore();
    }
  }

  desenharJegue(g, i, p, chao, s, agora, dt) {
    const e = this.e;
    const cor = this.cor(i);
    const an = this.anim[i];
    const x = this.sx(p.x, s);
    if (x < -200 || x > this.uw + 200) return;
    const yy = chao - p.y * s;
    // sombra (encolhe no pulo)
    const sombra = Math.max(0.3, 1 - p.y / 260);
    g.fillStyle = `rgba(50,25,5,${0.35 * sombra})`;
    g.beginPath(); g.ellipse(x, chao + 2, 46 * s * sombra, 9 * s * sombra, 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.globalAlpha = e.fora[i] ? 0.35 : 1;
    let im, rot = 0, dx = 0, sq = 1;
    const corrida = e.fase === 'corrida' || this.encerrado;
    if (p.tombo) {
      im = IMG[`${cor}-tombo`];
      dx = Math.sin(agora / 40) * 2;
    } else if (p.empaca) {
      im = IMG[`${cor}-parado-${Math.floor(agora / 300) % 2}`];
      dx = Math.sin(agora / 25) * 4;            // treme de raiva
      rot = Math.sin(agora / 90) * 0.06;
    } else if (!corrida || p.vel < 5) {
      im = IMG[`${cor}-parado-${Math.floor(agora / 700 + i) % 2}`];
      sq = 1 + Math.sin(agora / 300 + i) * 0.015;
    } else if (p.y > 0) {
      im = IMG[`${cor}-corre-${Math.min(2, QUADROS[cor] - 1)}`];
      rot = -Math.max(-0.25, Math.min(0.25, (p.y - (an.yAntes ?? p.y)) * 0.02));
    } else {
      an.fase += (p.vel * dt) / 26;
      im = IMG[`${cor}-corre-${Math.floor(an.fase) % QUADROS[cor]}`];
      // poeira das patas
      an.poeira += p.vel * dt;
      if (an.poeira > 90) { an.poeira = 0; this.poeira(i, -20, 0.55 + p.vel / 900); if (Math.random() < 0.3) this.terra(i, 1); }
    }
    an.yAntes = p.y;
    // pulinho do chicote
    const kc = (agora - an.chicote) / 180;
    if (kc < 1) sq = 1 + Math.sin(kc * Math.PI) * 0.06;
    if (pronto(im)) {
      const w = im.naturalWidth * PX * s, h = im.naturalHeight * PX * s * sq;
      // turbo: rastro fantasma
      if (p.turbo && !p.tombo) {
        g.save(); g.globalAlpha = 0.25;
        for (let k = 1; k <= 3; k++) g.drawImage(im, x - w / 2 - k * 22 * s, yy - h, w, h);
        g.restore();
        const r = IMG[Math.floor(agora / 80) % 2 ? 'raio' : 'raio-azul'];
        if (pronto(r)) { g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(r, x - w / 2 - 70 * s, yy - h * 0.6, 80 * s, 50 * s); g.restore(); }
      }
      g.save();
      g.translate(x + dx, yy);
      g.rotate(rot);
      if (i === this.eu) { g.shadowColor = 'rgba(255,230,120,.55)'; g.shadowBlur = 12; }
      g.drawImage(im, -w / 2, -h, w, h);
      g.restore();
      // tontura: estrelas girando e o anel em cima da cabeça
      if (p.tombo) {
        const est = IMG.estrela;
        if (pronto(est)) for (let k = 0; k < 4; k++) {
          const a = agora / 180 + (k * Math.PI) / 2;
          g.drawImage(est, x + Math.cos(a) * 40 * s - 9 * s, yy - h - 10 * s + Math.sin(a) * 10 * s, 18 * s, 18 * s);
        }
      }
      if (p.empaca) {
        // bufando: fumacinha pelas ventas e a cara de cansado no balão
        if (Math.random() < 0.2) this.particulas.push({ tipo: 'bafo', i, x: null, dx: w * 0.35 / s, y: h * 0.55 / s, vx: 60, vy: 40, t0: agora, vida: 500, r: 6 });
        this.balao(g, x + w * 0.1, yy - h - 30 * s, s, `${cor}-cara-2`, 'NÃO VOU!');
      } else if (agora - an.zurro < 1400 && !p.tombo) {
        this.balao(g, x + w * 0.15, yy - h - 30 * s, s, null, 'I-ÓÓ!');
      }
      // pum: nuvem verde e o letreiro
      const kp = (agora - an.pum) / 1100;
      if (kp < 1) rotulo(g, an.pumTxt, x - w * 0.55, yy - h * 0.55 - kp * 40 * s, '#9be23a', (an.pumForte ? 30 : 22) * s * (kp < 0.15 ? volta(kp / 0.15) : 1), 1 - Math.max(0, kp - 0.7) / 0.3);
      // nome em cima: número do jegue (cor) + o nome do jogador
      const num = IMG[`num-${CORES.indexOf(cor) + 1}`];
      const ty = yy - h - 12 * s;
      const nomeTxt = i === this.eu ? 'VOCÊ' : this.nome(i);
      g.font = `900 ${Math.round(15 * s)}px system-ui, sans-serif`;
      const tw = g.measureText(nomeTxt).width;
      if (pronto(num)) g.drawImage(num, x - tw / 2 - 26 * s, ty - 10 * s, 22 * s, 18 * s);
      rotulo(g, nomeTxt, x + 2 * s, ty, i === this.eu ? '#ffd23d' : '#fff', 15 * s);
      if (this.encerrado && i === this.vencedor) {
        const c = IMG.coroa;
        if (pronto(c)) g.drawImage(c, x - 18 * s, ty - 50 * s + Math.sin(agora / 200) * 4, 36 * s, 34 * s);
      }
    }
    g.restore();
  }

  /** Balão de fala com uma carinha (opcional) e texto. */
  balao(g, x, y, s, cara, txt) {
    const w = (cara ? 110 : 80) * s, h = 34 * s;
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = '#3a2410'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 12 * s); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - 6 * s, y + h / 2 - 1); g.lineTo(x - 14 * s, y + h / 2 + 12 * s); g.lineTo(x + 4 * s, y + h / 2 - 1); g.closePath(); g.fill();
    let tx = x;
    const im = cara && IMG[cara];
    if (pronto(im)) { const ch = 30 * s, cw = (ch * im.naturalWidth) / im.naturalHeight; g.drawImage(im, x - w / 2 + 4 * s, y - ch / 2, cw, ch); tx += 14 * s; }
    g.font = `900 ${Math.round(14 * s)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2410';
    g.fillText(txt, tx, y + 1);
  }

  desenharParticulas(g, i, chao, s, agora, dt) {
    const vivas = [];
    for (const p of this.particulas) {
      if (p.i !== i) { vivas.push(p); continue; }
      if (agora < p.t0) { vivas.push(p); continue; }
      const k = (agora - p.t0) / p.vida;
      if (k >= 1) continue;
      if (p.x == null) p.x = this.anim[i].x + p.dx;   // nasce onde o jegue está agora
      const x = this.sx(p.x, s);
      if (p.tipo === 'poeira') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const im = IMG[`poeira-${Math.min(4, p.f + Math.floor(k * 3))}`];
        if (pronto(im)) {
          const w = p.tam * s * (0.6 + k * 0.8), h = (w * im.naturalHeight) / im.naturalWidth;
          g.globalAlpha = (1 - k) * 0.85;
          g.drawImage(im, x - w / 2, chao - p.y * s - h * 0.8, w, h);
          g.globalAlpha = 1;
        }
      } else if (p.tipo === 'terra') {
        p.vy -= 900 * dt; p.x += p.vx * dt; p.y = Math.max(0, p.y + p.vy * dt); p.rot += dt * 8;
        const im = IMG[`terra-${p.f}`];
        if (pronto(im)) { g.save(); g.translate(x, chao - p.y * s); g.rotate(p.rot); g.globalAlpha = 1 - k; g.drawImage(im, -9 * s, -6 * s, 18 * s, 12 * s); g.restore(); }
      } else if (p.tipo === 'pum') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97;
        const r = p.r * s * (0.6 + k * 1.6);
        const yy = chao - p.y * s;
        const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
        gr.addColorStop(0, `rgba(170,220,60,${0.55 * (1 - k)})`); gr.addColorStop(0.6, `rgba(120,170,40,${0.35 * (1 - k)})`); gr.addColorStop(1, 'rgba(120,170,40,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, yy, r, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'bafo') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        g.fillStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
        g.beginPath(); g.arc(x, chao - p.y * s, p.r * s * (1 + k * 2), 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'sprite') {
        const im = IMG[p.nome];
        if (pronto(im)) {
          const w = p.tam * s * (0.7 + sai(k) * 0.6), h = (w * im.naturalHeight) / im.naturalWidth;
          g.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
          g.drawImage(im, x - w / 2 + p.dx * 0, chao - p.y * s - h / 2, w, h);
          g.globalAlpha = 1;
        }
      }
      vivas.push(p);
    }
    this.particulas = vivas.slice(-400);
  }

  desenharTextos(g, i, chao, s, agora) {
    for (const t of this.textos) {
      if (t.i !== i || t.tela) continue;
      const k = (agora - t.t0) / 1200;
      if (k >= 1) continue;
      const an = this.anim[i];
      const x = this.sx(an.x, s) + t.dx * s;
      const y = chao - an.y * s - 135 * s - 50 * sai(k) * s;
      const esc = k < 0.15 ? volta(k / 0.15) : 1;
      rotulo(g, t.txt, x, y, t.cor, t.tam * s * esc, k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }

  /** Mato e pedras passando bem na frente (mais rápidos que a pista: sensação de velocidade). */
  desenharFrente(g) {
    const pa = 1.35, passo = 260;
    const i0 = Math.floor((this.cam * pa - 200) / passo), i1 = Math.ceil((this.cam * pa + this.uw) / passo);
    for (let k = i0; k <= i1; k++) {
      const h = hash(k * 4.7);
      if (h < 0.55) continue;
      const im = IMG[h < 0.75 ? 'mato' : h < 0.88 ? 'mato-2' : 'pedras'];
      if (!pronto(im)) continue;
      const x = k * passo + hash(k) * 100 - this.cam * pa;
      const sc = 1.1;
      g.drawImage(im, x, DH - im.naturalHeight * sc * 0.6, im.naturalWidth * sc, im.naturalHeight * sc);
    }
  }

  /** Linhas de velocidade na tela quando o meu jegue voa (turbo ou chicote). */
  desenharVelocidade(g, p, agora) {
    if (!p || this.encerrado) return;
    const forca = p.turbo ? 1 : Math.max(0, (p.vel - 480) / 260);
    if (forca <= 0) return;
    g.save();
    g.strokeStyle = p.turbo ? 'rgba(255,240,150,.55)' : 'rgba(255,255,255,.4)';
    g.lineWidth = 2;
    for (let k = 0; k < 14 * forca; k++) {
      const y = hash(k * 13 + Math.floor(agora / 70)) * this.vh;
      const x = ((hash(k * 7) * this.vw - agora * 2.2) % this.vw + this.vw) % this.vw;
      const l = 60 + hash(k) * 120;
      g.globalAlpha = forca * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
    }
    g.restore();
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

  desenharHud(g, pos, agora) {
    const e = this.e, vw = this.vw, vh = this.vh;
    // progresso: a pista em miniatura com a cabecinha de cada jegue
    const bw = Math.min(vw * 0.46, 440), bx = (vw - bw) / 2, by = 30;
    g.fillStyle = 'rgba(40,22,8,.75)'; g.beginPath(); g.roundRect(bx - 34, by - 20, bw + 68, 40, 20); g.fill();
    g.strokeStyle = '#d9a640'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c48a4a'; g.beginPath(); g.roundRect(bx, by - 4, bw, 8, 4); g.fill();
    const fl = IMG.bandeira;
    if (pronto(fl)) g.drawImage(fl, bx + bw + 4, by - 16, 26, 24);
    if (pos) {
      const ordem = [...pos.keys()].sort((a, b) => (a === this.eu) - (b === this.eu));
      for (const i of ordem) {
        const f = Math.min(1, Math.max(0, pos[i].x / this.comprimento()));
        const im = IMG[`${this.cor(i)}-cara-${pos[i].tombo ? 3 : pos[i].empaca ? 2 : pos[i].turbo ? 0 : 1}`];
        const tam = i === this.eu ? 34 : 26;
        const cx = bx + f * bw;
        g.globalAlpha = e.fora[i] ? 0.35 : 1;
        g.fillStyle = TOM[this.cor(i)];
        g.beginPath(); g.arc(cx, by, tam * 0.42, 0, Math.PI * 2); g.fill();
        if (pronto(im)) { const h = tam * 1.1, w = (h * im.naturalWidth) / im.naturalHeight; g.drawImage(im, cx - w / 2, by - h * 0.62, w, h); }
        if (i === this.eu) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, by, tam * 0.42, 0, Math.PI * 2); g.stroke(); }
        g.globalAlpha = 1;
      }
      // minha colocação
      const lugar = 1 + pos.filter((p, i) => i !== this.eu && !e.fora[i] && p.x > pos[this.eu].x).length;
      g.fillStyle = 'rgba(40,22,8,.8)'; g.beginPath(); g.roundRect(8, 8, 86, 58, 14); g.fill();
      g.strokeStyle = lugar === 1 ? '#ffd23d' : '#d9a640'; g.lineWidth = 2; g.stroke();
      rotulo(g, `${lugar}º`, 50, 34, lugar === 1 ? '#ffd23d' : '#fff', 30);
      rotulo(g, `de ${e.n}`, 50, 56, '#d9c4a0', 11);
      // tempo
      const t = e.fase === 'corrida' || this.encerrado ? ((this.encerrado ? this.fimEm + (this.desvio ?? 0) : this.agoraServ()) - e.largada) / 1000 : 0;
      rotulo(g, `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`, 50, 82, '#fff', 14);
    }
    // botões de cima
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = this.B[k];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // controles: CHICOTE (esquerda, com o fôlego em volta) e PULAR (direita)
    if (!this.encerrado && pos) {
      const r = this.rb, m = 16;
      const cans = pos[this.eu].cansaco;
      const empacado = pos[this.eu].empaca;
      const cx = m + r + 6, cy = vh - m - r - 6;
      const kc = Math.max(0, 1 - (agora - this.botao.chicote) / 150);
      g.save(); g.translate(cx, cy); g.scale(1 - kc * 0.1, 1 - kc * 0.1);
      g.fillStyle = 'rgba(40,22,8,.6)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, r - 4, 0, Math.PI * 2); g.stroke();
      const corF = cans < 0.5 ? '#3ddc5a' : cans < 0.75 ? '#ffc53d' : '#ff4646';
      g.strokeStyle = corF; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, 1 - cans)); g.stroke();
      // o chicote desenhado
      g.strokeStyle = '#f2d7a6'; g.lineWidth = 4; g.lineCap = 'round';
      const bal = Math.sin(agora / 200) * 0.1 + kc * 0.8;
      g.beginPath(); g.moveTo(-r * 0.35, r * 0.4); g.lineTo(-r * 0.05, -r * 0.05); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.05, -r * 0.05);
      g.quadraticCurveTo(r * (0.5 + bal), -r * 0.6, r * 0.35, r * 0.15); g.stroke();
      g.restore();
      rotulo(g, empacado ? 'EMPACOU!' : 'CHICOTE', cx, cy + r * 0.62, empacado ? '#ff4646' : '#fff', Math.max(10, r * 0.2));
      if (cans > 0.7 && !empacado && Math.floor(agora / 180) % 2) rotulo(g, 'VAI EMPACAR!', cx + r * 0.3, cy - r - 14, '#ff4646', 15);
      const px = vw - m - r - 6;
      const kp = Math.max(0, 1 - (agora - this.botao.pulo) / 150);
      g.save(); g.translate(px, cy); g.scale(1 - kp * 0.1, 1 - kp * 0.1);
      g.fillStyle = 'rgba(40,22,8,.6)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffd23d'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#ffd23d'; g.beginPath(); g.moveTo(0, -r * 0.45); g.lineTo(r * 0.38, 0); g.lineTo(r * 0.14, 0); g.lineTo(r * 0.14, r * 0.3); g.lineTo(-r * 0.14, r * 0.3); g.lineTo(-r * 0.14, 0); g.lineTo(-r * 0.38, 0); g.closePath(); g.fill();
      g.restore();
      rotulo(g, 'PULAR', px, cy + r * 0.62, '#fff', Math.max(10, r * 0.2));
      if (!this.toque) {
        g.globalAlpha = 0.75;
        rotulo(g, '→ ou D', cx, cy - r - (cans > 0.7 ? 34 : 14), '#fff', 12);
        rotulo(g, 'ESPAÇO ou ↑', px, cy - r - 14, '#fff', 12);
        g.globalAlpha = 1;
      }
    }
    // contagem: 3, 2, 1 com as plaquinhas
    if (e.fase === 'contagem') {
      const falta = Math.max(0, e.largada - this.agoraServ());
      const num = Math.ceil(falta / 1000);
      if (num !== this.ultimaContagem && num > 0 && num <= 3) { this.ultimaContagem = num; som.bip(false); if (num === 3) som.zurro(0.5, 1); }
      if (num <= 3 && num > 0) {
        const im = IMG[`num-${num}`];
        const k = 1 - ((falta / 1000) % 1);
        const s = k < 0.25 ? volta(k / 0.25) : 1;
        if (pronto(im)) { const w = 120 * s, h = (w * im.naturalHeight) / im.naturalWidth; g.drawImage(im, vw / 2 - w / 2, vh * 0.36 - h / 2, w, h); }
      } else {
        rotulo(g, 'PREPARA…', vw / 2, vh * 0.36, '#ffd23d', 40);
      }
      rotulo(g, this.toque ? 'Toque na esquerda pra chicotear · na direita pra pular' : '→ / D chicoteia · ESPAÇO / ↑ pula', vw / 2, vh * 0.36 + 62, '#fff', 15);
      rotulo(g, 'Chicoteia demais e o jegue EMPACA! Pegue as cenouras 🥕', vw / 2, vh * 0.36 + 86, '#ffe7b0', 13);
    }
    // fim: a cara do vencedor e o troféu
    if (this.encerrado && this.vencedor != null) {
      const k = Math.min(1, (agora - this.fimEm) / 500);
      const s = volta(k);
      const im = IMG[`${this.cor(this.vencedor)}-cara-0`], tr = IMG.trofeu;
      const h = Math.min(vh * 0.32, 170) * s;
      if (pronto(im)) { const w = (h * im.naturalWidth) / im.naturalHeight; g.drawImage(im, vw / 2 - w - 10, vh * 0.42, w, h); }
      if (pronto(tr)) { const w = h * 0.8; g.save(); g.translate(vw / 2 + w / 2 + 10, vh * 0.42 + h / 2); g.rotate(Math.sin(agora / 250) * 0.08); g.drawImage(tr, -w / 2, -h * 0.45, w, h * 0.9); g.restore(); }
      rotulo(g, this.jegue(this.vencedor), vw / 2, vh * 0.42 + h + 18, TOM[this.cor(this.vencedor)], 22);
    }
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(vw / 2, vh * 0.26);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        const tam = Math.min(52, (vw * 0.8) / Math.max(5, this.banner.txt.length) * 1.7);
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam, k > 0.8 ? (1 - k) / 0.2 : 1);
        g.restore();
      }
    }
    this.textos = this.textos.filter((t) => agora - t.t0 < 1200);
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
