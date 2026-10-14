import { LARG, COMP, R_BOTAO, R_BOLA, N_BOTOES, TEMPO_VEZ, TOQUES, PAREDE } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles do Futebol de Botão (canvas 2D) sobre a mesa
 * da maquete (scripts/preparar-botao.py). O servidor simula a petelecada e
 * manda os quadros (`ultima.quadros`, 30/s); aqui é só animar.
 *
 * O que é daqui:
 *  - a mesa em perspectiva (o campo da arte encolhe lá no fundo): o mundo das
 *    regras (LARG × COMP) vai pra arte por `naArte`, e o toque volta por `doMundo`;
 *  - cada um vê o próprio gol embaixo (o VAS vê a mesa girada) e, deitado, o
 *    campo gira de lado; botões, bola e textos ficam sempre de pé;
 *  - mirar: encosta num botão seu, puxa pra trás e solta; a linha guia mostra
 *    em quem ele bate e pra onde o outro vai (igual sinuca);
 *  - efeitos: rastro no botão rápido, faísca no choque, bola pegando fogo no
 *    chutaço, poeira na madeira, tremida, UUUH na trave;
 *  - gol: a rede estufa, GOOOL, torcida, confete, fogos, locutor e o time
 *    que marcou girando os botões.
 */

const A = import.meta.glob('../../assets/botao/*.{webp,png}', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.(webp|png)$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

// A arte da mesa (mesa.webp, 941×1328): onde as linhas do campo caem nela.
// ponytail: medido nesta arte (linha de cima y=90, meio 645, de baixo 1221;
// laterais 95.5→45.5 e 846.5→893.5). Arte nova = medir de novo.
const MW = 941, MH = 1328, TOPO = 90, ALTURA = 1131, CURVA = [1089, 42];
const GOLS_ARTE = { cima: [348, 16], baixo: [338, 1207] };
/** Mundo -> arte: [x, y, escala] (escala = quanto 1px do mundo vale ali). */
function naArte(x, y) {
  const t = y / COMP;
  const yi = TOPO + CURVA[0] * t + CURVA[1] * t * t;
  const s = (yi - TOPO) / ALTURA;
  const larg = 751 + 97 * s;
  return [95.5 - 50 * s + (x / LARG) * larg, yi, larg / LARG];
}
function doMundo(xi, yi) {
  const t = (-CURVA[0] + Math.sqrt(Math.max(0, CURVA[0] ** 2 + 4 * CURVA[1] * (yi - TOPO)))) / (2 * CURVA[1]);
  const s = (TOPO + CURVA[0] * t + CURVA[1] * t * t - TOPO) / ALTURA;
  return [((xi - (95.5 - 50 * s)) / (751 + 97 * s)) * LARG, t * COMP];
}

const TIME = ['fla', 'vas'];
const NOME_TIME = ['FLA', 'VAS'];
const CLUBE = ['Flamengo', 'Vasco'];
const TOM = ['#ff3b3b', '#f2f2f2'];
const RISCO = ['risco-vermelho', 'risco-azul'];
const BOLA = 2 * N_BOTOES;
const QUADRO = 1000 / 30;
const FESTA = 2300;                     // depois do gol: festa, aí todo mundo volta pro lugar
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const GIRO = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];   // o botão girando (a 2ª metade espelhada)

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
    this.offset = 0;
    this.pos = null;              // onde cada um está desenhado agora (mundo)
    this.vel = [];                // velocidade na arte (px/s), pros rastros
    this.anim = null;             // petelecada animando: { q, t0, ev, u }
    this.trans = null;            // voltando pro lugar depois do gol
    this.particulas = [];
    this.textos = [];
    this.banner = null;
    this.mira = null;
    this.tremor = 0;
    this.giroBola = 0;
    this.fogoAte = 0;
    this.golAnim = null;          // { cima, t0 }
    this.festa = null;            // { time, t0 }: os botões de quem marcou giram
    this.seqVisto = 0;
    this.vezVista = null;
    this.saidaPendente = true;
    this.esperando = 0;
    this.encerrado = false;
    this.flashes = [];
    this.toque = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

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
    som.torcidaFundo(false);
    window.speechSynthesis?.cancel();
  }

  nome(i) { return (this.op.jogadores[i]?.name ?? `Jogador ${i + 1}`).split(' ')[0]; }
  agoraServ() { return Date.now() + this.offset; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    const primeiro = !this.e;
    this.offset = e.agora - Date.now();
    this.e = e;
    this.esperando = 0;
    if (primeiro) {
      this.pos = e.pos.map((p) => [...p]);
      this.anunciar(`${NOME_TIME[0]} × ${NOME_TIME[1]}`, '#ffd23d', 2000);
    }
    const u = e.ultima;
    if (u?.tipo === 'chute' && u.seq > this.seqVisto) { this.seqVisto = u.seq; this.chutou(u, agora); }
    else if (!this.anim && !this.trans && this.difere(e.pos)) this.trans = { de: this.pos.map((p) => [...p]), para: e.pos, t0: agora, dur: 500 };
    if (u?.tipo === 'tempo') { this.texto(LARG / 2, COMP / 2, u.de === this.eu ? 'TEMPO! PASSOU A VEZ' : 'O OUTRO NÃO JOGOU', '#ff8a4a', 30); som.bip(true); }
    if (u?.tipo === 'ouro') { this.anunciar('GOL DE OURO!', '#ffd23d', 2600); som.apito(2); som.fala('Empate! Quem fizer o próximo, leva!'); }
    if (u?.tipo === 'apito' || u?.tipo === 'ausente') som.apito(3);
  }

  difere(pos) { return pos.some((p, i) => Math.hypot(p[0] - this.pos[i][0], p[1] - this.pos[i][1]) > 1); }

  chutou(u, agora) {
    // a anterior ainda rolando (relógio adiantado): pula pro fim dela
    if (this.anim) this.terminarAnim(agora);
    this.trans = null;
    this.mira = null;
    this.anim = { q: u.quadros, t0: agora, ev: u.eventos.map(([k, t, x, y, f]) => ({ k, t, x, y, f, feito: false })), u };
    const meu = u.de === this.eu;
    som.peteleco(u.forca);
    if (meu && navigator.vibrate) navigator.vibrate(15 + u.forca * 25);
    const [x, y] = this.pos[u.b];
    const tras = u.ang + Math.PI;
    this.sprite('poeira-0', x + Math.cos(tras) * R_BOTAO, y + Math.sin(tras) * R_BOTAO, 40 + u.forca * 50, 500);
  }

  terminarAnim(agora) {
    const a = this.anim;
    this.anim = null;
    const fim = a.q[a.q.length - 1];
    this.pos = this.pos.map((_, i) => [fim[2 * i], fim[2 * i + 1]]);
    this.vel = [];
    for (const ev of a.ev) if (!ev.feito) { ev.feito = true; if (ev.t === 'gol') this.gol(ev, agora); }
    // gol: a festa e depois todo mundo volta pro lugar (a saída do servidor)
    if (this.e && this.difere(this.e.pos)) this.trans = { de: this.pos.map((p) => [...p]), para: this.e.pos, t0: agora + (a.u.gol !== null ? FESTA : 0), dur: 900 };
    if (a.u.gol !== null) this.saidaPendente = true;
  }

  // ------------------------------------------------------------ efeitos

  efeito(ev, agora) {
    const f = Math.min(1, ev.f / 1500);
    if (ev.t === 'bola') {
      som.bola(f);
      if (ev.f > 450) this.sprite('faisca', ev.x, ev.y, 40 + f * 70, 320);
      if (ev.f > 1250) { this.fogoAte = agora + 420; this.tremer(6); som.emocao(0.7); }
      this.tremer(f * 4);
    } else if (ev.t === 'choque') {
      som.choque(f);
      if (ev.f > 600) this.sprite(Math.random() < 0.5 ? 'faisca-laranja' : 'faisca-azul', ev.x, ev.y, 40 + f * 50, 280);
      this.faiscas(ev.x, ev.y, 6 + f * 10, '#ffe08a');
      this.tremer(f * 5);
    } else if (ev.t === 'parede') {
      som.parede(f);
      this.sprite(`poeira-${1 + Math.floor(Math.random() * 2)}`, ev.x, ev.y, 30 + f * 50, 500);
      this.tremer(f * 3);
    } else if (ev.t === 'trave') {
      som.trave(); som.lamento();
      this.texto(ev.x, ev.y + (ev.y < COMP / 2 ? 80 : -80), 'NA TRAVE!', '#ffd23d', 34);
      this.faiscas(ev.x, ev.y, 18, '#fff');
      this.tremer(9);
    } else if (ev.t === 'rede') som.rede();
    else if (ev.t === 'gol') this.gol(ev, agora);
  }

  gol(ev, agora) {
    if (this.golAnim && agora - this.golAnim.t0 < 3000) return;
    const marcou = ev.y < COMP / 2 ? 0 : 1;   // gol em cima é do FLA
    const meu = marcou === this.eu;
    this.golAnim = { cima: ev.y < COMP / 2, t0: agora };
    this.festa = { time: marcou, t0: agora };
    this.anunciar('GOOOOL!', marcou === 0 ? '#ff4a3a' : '#ffffff', 2400, meu ? 'DO SEU TIME!' : `DO ${CLUBE[marcou].toUpperCase()}`);
    som.gol(meu); som.rede(); som.emocao(1);
    som.fala(`Gooool do ${CLUBE[marcou]}!`, true);
    this.confete(ev.x, ev.y, 160);
    if (meu) { som.fogos(); for (let k = 0; k < 6; k++) setTimeout(() => this.fogo(), k * 260); }
    this.tremer(16);
    if (navigator.vibrate) navigator.vibrate(meu ? [80, 50, 160] : 60);
  }

  encerrar(fim) {
    this.encerrado = true;
    this.mira = null;
    if (!fim) return;   // a conexão caiu (ConexaoPerdida cuida do aviso)
    const ganhei = fim.vencedor === this.eu;
    som.apito(3);
    setTimeout(() => {
      this.anunciar(ganhei ? 'VOCÊ VENCEU!' : 'FIM DE JOGO', ganhei ? '#ffd23d' : '#fff', 3200, `${CLUBE[0]} ${this.e.placar[0]} × ${this.e.placar[1]} ${CLUBE[1]}`);
      if (ganhei) { som.fanfarra(); som.fogos(); for (let k = 0; k < 10; k++) setTimeout(() => this.fogo(), k * 250); }
    }, 1300);
  }

  anunciar(txt, cor, dura = 1500, sub = '') { this.banner = { txt, cor, sub, t0: performance.now(), dura }; }
  texto(x, y, txt, cor, tam) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now() }); }
  tremer(v) { this.tremor = Math.max(this.tremor, v); }
  /** Sprite que aparece e some (faísca, poeira) num ponto do mundo. */
  sprite(nome, x, y, tam, vida) { this.particulas.push({ tipo: 'sprite', nome, x, y, tam, vida, t0: performance.now(), rot: Math.random() * 0.6 - 0.3 }); }
  faiscas(x, y, n, cor) {
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = 150 + Math.random() * 250; this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, cor, r: 3, t0: performance.now(), vida: 380 + Math.random() * 200 }); }
  }
  confete(x, y, n) {
    const cores = ['#ffd23d', '#ff3b3b', '#111', '#fff', '#7dff7a', '#5ab4ff'];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 600;
      this.particulas.push({ tipo: 'confete', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 5 + Math.random() * 5, cor: cores[k % cores.length], rot: Math.random() * 6, t0: performance.now(), vida: 2000 + Math.random() * 900 });
    }
  }
  fogo() {
    const x = 100 + Math.random() * (LARG - 200), y = 150 + Math.random() * (COMP - 300);
    const cor = ['#ffd23d', '#ff4a3a', '#7dff7a', '#5ab4ff', '#fff'][Math.floor(Math.random() * 5)];
    for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2, v = 220 + Math.random() * 80; this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, cor, r: 4, t0: performance.now(), vida: 1100 }); }
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiroDesce(ev),
      move: (ev) => this.ponteiroMove(ev),
      sobe: (ev) => this.ponteiroSobe(ev),
      resize: () => this.redimensionar(),
      menu: (ev) => ev.preventDefault(),
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('pointerup', this.h.sobe);
    addEventListener('pointercancel', this.h.sobe);
    addEventListener('resize', this.h.resize);
    this.canvas.addEventListener('contextmenu', this.h.menu);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('pointerup', this.h.sobe);
    removeEventListener('pointercancel', this.h.sobe);
    removeEventListener('resize', this.h.resize);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
  }

  botoes() {
    const s = 42;
    return { sair: { x: 10, y: this.vh - s - 10, w: s, h: s }, mudo: { x: 10 + s + 8, y: this.vh - s - 10, w: s, h: s } };
  }

  podeJogar() {
    const e = this.e;
    return !!(e && !e.fim && !this.encerrado && e.vez === this.eu && !this.anim && !this.trans && this.agoraServ() >= e.livre - 150
      && (!this.esperando || performance.now() - this.esperando > 1500));
  }

  /** Tela -> mundo (passa pela mesa girada e pela perspectiva da arte). */
  telaPraMundo(cx, cy) {
    const p = this.m.inverse().transformPoint(new DOMPoint(cx, cy));
    return doMundo(p.x, p.y);
  }
  mundoPraTela(x, y) {
    const [xi, yi] = naArte(x, y);
    const p = this.m.transformPoint(new DOMPoint(xi, yi));
    return [p.x, p.y];
  }

  ponteiroDesce(ev) {
    destravar();
    som.torcidaFundo(true);
    if (ev.pointerType !== 'mouse') this.toque = true;
    const b = this.botoes();
    const dentro = (r) => ev.clientX >= r.x && ev.clientX <= r.x + r.w && ev.clientY >= r.y && ev.clientY <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { if (!som.alternarMudo()) som.torcidaFundo(true); return; }
    if (!this.podeJogar()) {
      if (this.e && !this.e.fim && this.e.vez !== this.eu) this.texto(LARG / 2, COMP * 0.75, 'ESPERE SUA VEZ', '#fff', 26);
      return;
    }
    // o botão meu mais perto do dedo (com folga: dedo é grosso)
    const [x, y] = this.telaPraMundo(ev.clientX, ev.clientY);
    let melhor = -1, dmin = R_BOTAO * 1.9;
    for (let k = 0; k < N_BOTOES; k++) {
      const [bx, by] = this.pos[this.eu * N_BOTOES + k];
      const d = Math.hypot(bx - x, by - y);
      if (d < dmin) { dmin = d; melhor = k; }
    }
    if (melhor < 0) { this.texto(x, y, 'TOQUE NUM BOTÃO SEU', '#ffd23d', 22); return; }
    ev.preventDefault();
    this.mira = { b: melhor, id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  }

  ponteiroMove(ev) {
    if (!this.mira || ev.pointerId !== this.mira.id) return;
    this.mira.x = ev.clientX; this.mira.y = ev.clientY;
  }

  ponteiroSobe(ev) {
    const m = this.mira;
    if (!m || ev.pointerId !== m.id) return;
    this.mira = null;
    const { ang, forca } = this.lerMira(m);
    if (forca < 0.06 || !this.podeJogar()) return;   // soltou em cima: desistiu
    this.esperando = performance.now();
    this.op.onEntrada({ b: m.b, ang: Math.round(ang * 1000) / 1000, forca: Math.round(forca * 1000) / 1000 });
  }

  /** Estilingue: puxa pra trás, o botão vai pro lado oposto. A força é pela distância na tela. */
  lerMira(m) {
    const [bx, by] = this.pos[this.eu * N_BOTOES + m.b];
    const [sx, sy] = this.mundoPraTela(bx, by);
    const [fx, fy] = this.telaPraMundo(m.x, m.y);
    const arrasto = Math.min(200, Math.max(110, Math.min(this.vw, this.vh) * 0.3));
    return { ang: Math.atan2(by - fy, bx - fx), forca: Math.min(1, Math.max(0, Math.hypot(m.x - sx, m.y - sy) - 14) / arrasto) };
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
    this.deitado = w > h;
    // meu gol sempre embaixo (em pé) ou à esquerda (deitado)
    this.rot = this.deitado ? (this.eu === 0 ? 90 : -90) : (this.eu === 0 ? 0 : 180);
    this.topo = this.deitado ? 50 : 66;
    const baixo = this.deitado ? 4 : 56;
    const [bw, bh] = this.deitado ? [MH, MW] : [MW, MH];
    this.esc = Math.min((w - 8) / bw, (h - this.topo - baixo) / bh);
    // em pé a mesa encosta no placar: a sobra fica embaixo, pra dica e os botões
    this.centro = [w / 2, this.deitado ? this.topo + (h - this.topo - baixo) / 2 : this.topo + (bh * this.esc) / 2];
    this.rodape = this.deitado ? h - 24 : Math.min(h - 24, this.topo + bh * this.esc + 22);
    this.montar(0, 0);
  }

  montar(dx, dy) {
    this.m = new DOMMatrix().translate(this.centro[0] + dx, this.centro[1] + dy).rotate(this.rot).scale(this.esc).translate(-MW / 2, -MH / 2);
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    this.animar(agora, dt);
    this.tremor *= Math.pow(0.002, dt);
    const tr = this.tremor > 0.3 ? this.tremor : 0;
    this.montar((Math.random() - 0.5) * tr, (Math.random() - 0.5) * tr);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.desenharFundo(g, agora, dt);
    g.setTransform(new DOMMatrix([this.dpr, 0, 0, this.dpr, 0, 0]).multiply(this.m));
    if (pronto(IMG.mesa)) g.drawImage(IMG.mesa, 0, 0, MW, MH);
    if (this.e && this.pos) {
      this.desenharGols(g, 'fundo');
      this.desenharMira(g, agora);
      // de cima pra baixo na tela: quem está mais embaixo passa na frente
      const ordem = this.pos.map((p, i) => [i, this.mundoPraTela(...p)[1]]).sort((a, b) => a[1] - b[1]).map(([i]) => i);
      for (const i of ordem) this.desenharPeca(g, i, agora);
      this.desenharGols(g, 'frente');
      this.desenharRedeBalancando(g, agora);
    }
    this.desenharParticulas(g, agora, dt);
    this.desenharTextos(g, agora);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.e) this.desenharHud(g, agora);
  }

  /** Avança a petelecada (quadros + acontecimentos), a volta pro lugar e os avisos de vez. */
  animar(agora, dt) {
    const e = this.e;
    if (!e || !this.pos) return;
    const a = this.anim;
    if (a) {
      const idx = (agora - a.t0) / QUADRO, n = a.q.length - 1;
      const i0 = Math.min(n, Math.floor(idx)), i1 = Math.min(n, i0 + 1), f = Math.min(1, idx - i0);
      const antes = this.pos.map((p) => naArte(...p));
      this.pos = this.pos.map((_, i) => [lerp(a.q[i0][2 * i], a.q[i1][2 * i], f), lerp(a.q[i0][2 * i + 1], a.q[i1][2 * i + 1], f)]);
      this.vel = this.pos.map((p, i) => { const d = naArte(...p); return [(d[0] - antes[i][0]) / Math.max(0.001, dt), (d[1] - antes[i][1]) / Math.max(0.001, dt)]; });
      const vb = Math.hypot(...this.vel[BOLA]);
      this.giroBola += vb * dt;
      // a torcida enche com a bola rápida indo pro gol de alguém
      const [, by] = this.pos[BOLA];
      if (vb > 500 && (by < 260 || by > COMP - 260) && agora - (this.emocaoEm ?? 0) > 900) { this.emocaoEm = agora; som.emocao(0.8); }
      for (const ev of a.ev) if (!ev.feito && idx >= ev.k) { ev.feito = true; this.efeito(ev, agora); }
      if (idx >= n) this.terminarAnim(agora);
    } else if (this.trans) {
      const t = this.trans;
      const k = Math.min(1, Math.max(0, (agora - t.t0) / t.dur));
      if (k > 0) this.pos = t.de.map((p, i) => [lerp(p[0], t.para[i][0], sai(k)), lerp(p[1], t.para[i][1], sai(k))]);
      if (k >= 1) { this.pos = t.para.map((p) => [...p]); this.trans = null; }
    }
    if (this.anim || this.trans) return;
    // parado: a vez de quem?
    if (e.fim) { if (!this.encerrado) this.encerrar(e.fim); return; }
    if (this.saidaPendente && this.agoraServ() >= e.livre - 100) {
      this.saidaPendente = false;
      som.apito(1); som.torcidaFundo(true);
      if (this.seqVisto) this.anunciar('SAÍDA DE BOLA', '#fff', 1300, e.vez === this.eu ? 'É SUA!' : `DO ${CLUBE[e.vez].toUpperCase()}`);
    }
    const chave = `${e.vez}:${e.desde}`;
    if (this.vezVista !== chave && this.agoraServ() >= e.livre - 100) {
      const repete = this.vezVista?.startsWith(`${e.vez}:`);
      this.vezVista = chave;
      if (e.vez === this.eu) {
        if (!this.banner) this.anunciar(repete ? 'JOGA DE NOVO!' : 'SUA VEZ!', '#7dff7a', 1100, repete ? `TOCOU NA BOLA · ${e.toques} TOQUE${e.toques > 1 ? 'S' : ''}` : '');
        som.bip();
        if (navigator.vibrate) navigator.vibrate(25);
      }
    }
  }

  /** Fora da mesa: arquibancada no escuro, flashes de câmera piscando. */
  desenharFundo(g, agora, dt) {
    const w = this.vw, h = this.vh;
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, '#123a22'); gr.addColorStop(1, '#030a06');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (Math.random() < dt * (this.festa && agora - this.festa.t0 < 3000 ? 30 : 3)) this.flashes.push({ x: Math.random() * w, y: Math.random() * h, t0: agora });
    this.flashes = this.flashes.filter((f) => agora - f.t0 < 220);
    for (const f of this.flashes) {
      const k = 1 - (agora - f.t0) / 220;
      const r = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26);
      r.addColorStop(0, `rgba(255,255,240,${0.8 * k})`); r.addColorStop(1, 'rgba(255,255,240,0)');
      g.fillStyle = r; g.fillRect(f.x - 26, f.y - 26, 52, 52);
    }
  }

  /** Os dois gols por cima da arte: o fundo debaixo da bola, a malha por cima. Na mesa girada ficam de pé. */
  desenharGols(g, camada) {
    for (const lado of ['cima', 'baixo']) {
      const im = IMG[`gol-${lado}-${camada}`];
      if (!pronto(im)) continue;
      const [x, y] = GOLS_ARTE[lado], w = im.naturalWidth, h = im.naturalHeight;
      g.save();
      g.translate(x + w / 2, y + h / 2);
      if (this.eu === 1) g.rotate(Math.PI);
      g.drawImage(im, -w / 2, -h / 2, w, h);
      g.restore();
    }
  }

  /** A rede estufando com a bola (quadros da cartela) por cima do gol que levou. */
  desenharRedeBalancando(g, agora) {
    const a = this.golAnim;
    if (!a) return;
    const t = agora - a.t0;
    if (t > 2200) { this.golAnim = null; return; }
    const k = Math.min(3, Math.floor(t / 110));
    const im = IMG[`gol-${t > 1500 ? 0 : k}`];
    if (!pronto(im)) return;
    const lado = a.cima ? 'cima' : 'baixo';
    const base = IMG[`gol-${lado}-fundo`];
    if (!pronto(base)) return;
    const [x, y] = GOLS_ARTE[lado], w = base.naturalWidth * 1.04, h = (w * im.naturalHeight) / im.naturalWidth;
    g.save();
    g.translate(x + base.naturalWidth / 2, y + base.naturalHeight / 2);
    if (this.eu === 1) g.rotate(Math.PI);
    g.globalAlpha = t > 1700 ? Math.max(0, (2200 - t) / 500) : 1;
    g.drawImage(im, -w / 2, -h / 2 - (h - base.naturalHeight) / 2, w, h);
    g.restore();
  }

  /** Desenha de pé na tela (desfaz o giro da mesa) em volta do ponto da arte. */
  dePe(g, xi, yi, fn) {
    g.save();
    g.translate(xi, yi);
    g.rotate((-this.rot * Math.PI) / 180);
    fn();
    g.restore();
  }

  desenharPeca(g, i, agora) {
    const [x, y] = this.pos[i];
    const [xi, yi, s] = naArte(x, y);
    const [vx, vy] = this.vel[i] ?? [0, 0];
    const v = Math.hypot(vx, vy);
    if (i === BOLA) {
      const r = R_BOLA * s * 1.12;
      // rastro de vento atrás da bola rápida
      if (v > 450) {
        const comp = Math.min(130, v / 11), a = Math.atan2(vy, vx);
        const gr = g.createLinearGradient(xi, yi, xi - Math.cos(a) * comp, yi - Math.sin(a) * comp);
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = gr; g.lineWidth = r * 1.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(xi, yi); g.lineTo(xi - Math.cos(a) * comp, yi - Math.sin(a) * comp); g.stroke();
      }
      this.dePe(g, xi, yi, () => {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(r * 0.25, r * 0.45, r * 0.95, r * 0.6, 0, 0, Math.PI * 2); g.fill();
        const fogo = agora < this.fogoAte && IMG['bola-fogo'];
        const im = fogo ? IMG['bola-fogo'] : v > 1000 ? IMG['bola-rapida'] : IMG[`bola-${Math.floor(this.giroBola / 16) % 4}`];
        if (!pronto(im)) return;
        const tam = fogo ? r * 3.2 : r * 2;
        const hh = (tam * im.naturalHeight) / im.naturalWidth;
        g.drawImage(im, -tam * (fogo ? 0.62 : 0.5), -hh / 2, tam, hh);
      });
      return;
    }
    const time = i < N_BOTOES ? 0 : 1;
    const r = R_BOTAO * s * 1.1;
    // rastro colorido do botão rápido
    const risco = IMG[RISCO[time]];
    if (v > 380 && pronto(risco)) {
      const comp = Math.min(r * 3.2, v / 7), hh = r * 1.1;
      g.save(); g.translate(xi, yi); g.rotate(Math.atan2(vy, vx)); g.globalAlpha = Math.min(1, v / 1000);
      g.drawImage(risco, -comp - r * 0.3, -hh / 2, comp, hh); g.restore();
    }
    const meuTime = time === this.eu;
    const vezMinha = meuTime && this.podeJogar();
    const sel = this.mira && meuTime && i === this.eu * N_BOTOES + this.mira.b;
    // comemoração: os botões de quem marcou giram e pulam
    let quadro = 0, espelho = 1, pulo = 0;
    if (this.festa && this.festa.time === time) {
      const t = agora - this.festa.t0;
      if (t < FESTA) {
        const q = Math.floor(t / 45 + i * 2) % GIRO.length;
        quadro = GIRO[q]; espelho = q >= 8 ? -1 : 1;
        pulo = Math.abs(Math.sin(t / 160 + i)) * r * 0.5;
      } else this.festa = null;
    }
    this.dePe(g, xi, yi, () => {
      g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(r * 0.18, r * 0.3, r * 1.0, r * 0.82, 0, 0, Math.PI * 2); g.fill();
      if (vezMinha || sel) {
        const k = 0.5 + 0.5 * Math.sin(agora / 220 + i);
        g.strokeStyle = sel ? '#ffd23d' : `rgba(125,255,122,${0.45 + 0.5 * k})`;
        g.lineWidth = sel ? 5 : 3;
        g.beginPath(); g.arc(0, 0, r * (sel ? 1.18 : 1.1 + 0.05 * k), 0, Math.PI * 2); g.stroke();
      }
      const im = IMG[`${TIME[time]}-${quadro}`];
      if (!pronto(im)) return;
      const ww = r * 2.12 * (quadro ? im.naturalWidth / IMG[`${TIME[time]}-0`].naturalWidth : 1), hh = (ww * im.naturalHeight) / im.naturalWidth;
      g.scale(espelho, 1);
      g.drawImage(im, -ww / 2, -hh / 2 - pulo, ww, hh);
    });
  }

  /** A linha guia: até onde vai, em quem bate primeiro e pra onde o outro sai. */
  desenharMira(g, agora) {
    if (!this.mira) return;
    const qual = this.eu * N_BOTOES + this.mira.b;
    const [bx, by] = this.pos[qual];
    const { ang, forca } = this.lerMira(this.mira);
    if (forca <= 0) return;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const alcance = 80 + forca * 520;
    // primeiro a ser tocado: varredura do círculo do botão pela reta
    let tMin = alcance, alvo = -1;
    for (const [j, [ox, oy]] of this.pos.entries()) {
      if (j === qual) continue;
      const rr = R_BOTAO + (j === BOLA ? R_BOLA : R_BOTAO);
      const fx = ox - bx, fy = oy - by, proj = fx * dx + fy * dy;
      if (proj <= 0) continue;
      const d2 = fx * fx + fy * fy - proj * proj;
      if (d2 > rr * rr) continue;
      const t = proj - Math.sqrt(rr * rr - d2);
      if (t < tMin) { tMin = t; alvo = j; }
    }
    // e não passa da madeira
    const parede = Math.min(
      dx > 0 ? (PAREDE.x1 - R_BOTAO - bx) / dx : dx < 0 ? (PAREDE.x0 + R_BOTAO - bx) / dx : Infinity,
      dy > 0 ? (PAREDE.y1 - R_BOTAO - by) / dy : dy < 0 ? (PAREDE.y0 + R_BOTAO - by) / dy : Infinity,
    );
    if (parede < tMin) { tMin = Math.max(0, parede); alvo = -1; }
    const cor = forca < 0.4 ? '#7dff7a' : forca < 0.75 ? '#ffd23d' : '#ff5a4a';
    const px = 1 / this.esc;   // espessuras em px de tela
    const linha = (pts, larg, cc, tracejado) => {
      g.strokeStyle = cc; g.lineWidth = larg * px * 0.8; g.setLineDash(tracejado ? [12 * px, 9 * px] : []); g.lineDashOffset = (-agora / 20) * px;
      g.beginPath();
      pts.forEach(([x, y], k) => { const [xi, yi] = naArte(x, y); if (k) g.lineTo(xi, yi); else g.moveTo(xi, yi); });
      g.stroke(); g.setLineDash([]);
    };
    const pontos = (x0, y0, ddx, ddy, comp) => Array.from({ length: 13 }, (_, k) => [x0 + ddx * comp * (k / 12), y0 + ddy * comp * (k / 12)]);
    g.save();
    g.lineCap = 'round';
    linha(pontos(bx, by, dx, dy, tMin), 9, 'rgba(0,0,0,.35)', false);
    linha(pontos(bx, by, dx, dy, tMin), 5, cor, true);
    const cx = bx + dx * tMin, cy = by + dy * tMin;
    const [ci, cj, cs] = naArte(cx, cy);
    // o fantasma do botão onde ele encosta
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.5 * px;
    g.beginPath(); g.ellipse(ci, cj, R_BOTAO * cs, R_BOTAO * cs * 0.98, 0, 0, Math.PI * 2); g.stroke();
    if (alvo >= 0) {
      const [ox, oy] = this.pos[alvo];
      const nx = ox - cx, ny = oy - cy, nn = Math.hypot(nx, ny) || 1;
      linha(pontos(ox, oy, nx / nn, ny / nn, 70 + forca * 220), 5, alvo === BOLA ? '#fff' : 'rgba(255,170,170,.9)', false);
      // e o meu desvia pro lado
      const tx = dx - (nx / nn) * (dx * nx + dy * ny) / nn, ty = dy - (ny / nn) * (dx * nx + dy * ny) / nn;
      const tn = Math.hypot(tx, ty);
      if (tn > 0.05) linha(pontos(cx, cy, tx / tn, ty / tn, (40 + forca * 120) * tn), 3, 'rgba(255,255,255,.45)', false);
    } else {
      // ponta de seta no fim
      const [pi, pj] = naArte(cx + dx * 10, cy + dy * 10), [qi, qj] = naArte(cx - dx * 18, cy - dy * 18);
      const a = Math.atan2(pj - qj, pi - qi);
      g.fillStyle = cor; g.beginPath();
      g.moveTo(pi + Math.cos(a) * 8 * px, pj + Math.sin(a) * 8 * px);
      g.lineTo(pi + Math.cos(a + 2.5) * 13 * px, pj + Math.sin(a + 2.5) * 13 * px);
      g.lineTo(pi + Math.cos(a - 2.5) * 13 * px, pj + Math.sin(a - 2.5) * 13 * px);
      g.fill();
    }
    // o elástico até o dedo
    const p = this.m.inverse().transformPoint(new DOMPoint(this.mira.x, this.mira.y));
    const [oi, oj] = naArte(bx, by);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.5 * px;
    g.beginPath(); g.moveTo(oi, oj); g.lineTo(p.x, p.y); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(p.x, p.y, 18 * px, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  desenharParticulas(g, agora, dt) {
    const vivas = [];
    for (const p of this.particulas) {
      const k = (agora - p.t0) / p.vida;
      if (k >= 1) continue;
      vivas.push(p);
      if (p.tipo !== 'sprite') { p.x += p.vx * dt; p.y += p.vy * dt; }
      const [xi, yi] = naArte(p.x, p.y);
      if (p.tipo === 'sprite') {
        const im = IMG[p.nome];
        if (!pronto(im)) continue;
        this.dePe(g, xi, yi, () => {
          g.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          g.rotate(p.rot);
          const w = p.tam * (0.7 + k * 0.6), h = (w * im.naturalHeight) / im.naturalWidth;
          g.drawImage(im, -w / 2, -h / 2, w, h);
        });
      } else if (p.tipo === 'confete') {
        p.vx *= 0.97; p.vy *= 0.97; p.rot += dt * 9;
        this.dePe(g, xi, yi, () => {
          g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.rot * 1.3)));
          g.globalAlpha = 1 - k * k; g.fillStyle = p.cor; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        });
      } else if (p.tipo === 'faisca') {
        p.vx *= 0.96; p.vy *= 0.96;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - k; g.fillStyle = p.cor;
        g.beginPath(); g.arc(xi, yi, p.r * (1 - k * 0.5), 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    g.globalAlpha = 1;
    this.particulas = vivas.slice(-700);
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1500);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1500;
      const [xi, yi] = naArte(t.x, t.y);
      this.dePe(g, xi, yi, () => {
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        rotulo(g, t.txt, 0, -50 * sai(k), t.cor, (t.tam / this.esc) * (k < 0.12 ? volta(k / 0.12) : 1));
      });
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hud

  desenharHud(g, agora) {
    const e = this.e, vw = this.vw, vh = this.vh;
    // placar: FLA à esquerda, VAS à direita, relógio no meio
    const W = Math.min(vw - 16, 560), x0 = (vw - W) / 2, h = this.topo - 14, y0 = 6;
    const meio = Math.min(118, W * 0.26), lado = (W - meio) / 2 - 4;
    for (const t of [0, 1]) {
      const x = t === 0 ? x0 : x0 + W - lado;
      const gr = g.createLinearGradient(x, y0, x, y0 + h);
      if (t === 0) { gr.addColorStop(0, '#d8141c'); gr.addColorStop(1, '#7a0a0e'); } else { gr.addColorStop(0, '#2a2e36'); gr.addColorStop(1, '#0c0e12'); }
      g.fillStyle = gr; g.strokeStyle = e.vez === t && !e.fim ? '#ffd23d' : 'rgba(255,255,255,.25)'; g.lineWidth = e.vez === t && !e.fim ? 2.5 : 1.5;
      g.beginPath(); g.roundRect(x, y0, lado, h, 10); g.fill(); g.stroke();
      const ic = IMG[`${TIME[t]}-0`], tam = h - 10;
      const ix = t === 0 ? x + 6 : x + lado - 6 - tam;
      if (pronto(ic)) g.drawImage(ic, ix, y0 + 5, tam, tam);
      g.textBaseline = 'middle';
      g.textAlign = t === 0 ? 'left' : 'right';
      const tx = t === 0 ? ix + tam + 7 : ix - 7;
      g.font = `900 ${Math.round(h * 0.36)}px system-ui, sans-serif`; g.fillStyle = '#fff';
      g.fillText(NOME_TIME[t], tx, y0 + h * 0.34);
      const larguraTime = g.measureText(NOME_TIME[t]).width;
      g.font = `700 ${Math.round(h * 0.24)}px system-ui, sans-serif`; g.fillStyle = 'rgba(255,255,255,.75)';
      let nome = t === this.eu ? 'Você' : this.op.jogadores[t]?.name ?? '';
      while (nome.length > 3 && g.measureText(nome).width > lado - tam - 22) nome = `${nome.slice(0, -2)}…`;
      g.fillText(nome, tx, y0 + h * 0.7);
      // toques que sobram na vez (bolinhas verdes)
      if (e.vez === t && !e.fim) {
        for (let k = 0; k < TOQUES; k++) {
          const bx = t === 0 ? tx + larguraTime + 10 + k * 12 : tx - larguraTime - 10 - k * 12;   // logo depois do nome do time
          g.fillStyle = k < e.toques ? '#3cff5a' : 'rgba(0,0,0,.45)';
          g.beginPath(); g.arc(bx, y0 + h * 0.34, 4.5, 0, Math.PI * 2); g.fill();
        }
        // relógio da vez
        const resta = Math.max(0, e.prazo - this.agoraServ()), seg = Math.ceil(resta / 1000);
        if (!this.anim && this.agoraServ() >= e.livre) {
          g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + 8, y0 + h - 5, lado - 16, 3);
          g.fillStyle = seg <= 5 ? '#ff5a4a' : '#ffd23d'; g.fillRect(x + 8, y0 + h - 5, (lado - 16) * Math.min(1, resta / TEMPO_VEZ), 3);
          if (t === this.eu && seg <= 5 && seg > 0 && seg !== this.ultimoBip) { this.ultimoBip = seg; som.bip(seg <= 2); }
        }
      }
    }
    // o meio: gols e o relógio do jogo
    const mx = x0 + lado + 4;
    g.fillStyle = '#0d1420'; g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(mx, y0, meio, h, 10); g.fill(); g.stroke();
    g.textAlign = 'center';
    g.font = `900 ${Math.round(h * 0.5)}px system-ui, sans-serif`; g.fillStyle = '#ffc61a';
    g.fillText(`${e.placar[0]} - ${e.placar[1]}`, mx + meio / 2, y0 + h * 0.38);
    const resta = Math.max(0, e.fimEm - this.agoraServ());
    g.font = `800 ${Math.round(h * 0.27)}px system-ui, sans-serif`;
    g.fillStyle = e.ouro ? '#ffd23d' : resta < 30_000 ? '#ff7a5a' : '#8fd4ff';
    g.fillText(e.ouro ? 'GOL DE OURO' : `${String(Math.floor(resta / 60000)).padStart(2, '0')}:${String(Math.floor(resta / 1000) % 60).padStart(2, '0')}`, mx + meio / 2, y0 + h * 0.77);
    // dica / força embaixo
    if (this.mira) {
      const { forca } = this.lerMira(this.mira);
      const bw = Math.min(360, vw * 0.55), bx = vw / 2 - bw / 2, by = this.rodape - 4;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(bx - 6, by - 6, bw + 12, 22, 11); g.fill();
      const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, '#2bd94a'); gr.addColorStop(0.5, '#ffd23d'); gr.addColorStop(1, '#e8282a');
      g.fillStyle = gr; g.beginPath(); g.roundRect(bx, by, Math.max(4, bw * forca), 10, 5); g.fill();
      rotulo(g, `${Math.round(forca * 100)}%`, vw / 2, by - 16, '#fff', 15);
    } else if (this.podeJogar()) {
      g.globalAlpha = 0.65 + 0.35 * Math.sin(agora / 300);
      rotulo(g, this.toque ? '👆 Toque num botão, puxe pra trás e solte' : '🖱 Clique num botão, puxe pra trás e solte', vw / 2, this.rodape, '#fff', Math.min(16, vw / 26));
      g.globalAlpha = 1;
    } else if (!e.fim && e.vez !== this.eu && !this.anim) {
      rotulo(g, `Vez do ${CLUBE[e.vez]}…`, vw / 2, this.rodape, 'rgba(255,255,255,.75)', Math.min(15, vw / 26));
    }
    // botões
    const bt = this.botoes();
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = bt[k];
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // anúncio no meio da mesa
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        const [cx, cy] = this.centro;
        g.save(); g.translate(cx, cy);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        const gol = this.banner.txt.startsWith('GOO');
        g.font = '900 100px system-ui, sans-serif';
        const tam = Math.min(gol ? 84 : 52, (100 * vw * 0.82) / g.measureText(this.banner.txt).width);   // cabe na largura
        g.fillStyle = gol ? 'rgba(0,0,0,.6)' : 'rgba(0,20,8,.6)';
        g.beginPath(); g.roundRect(-vw * 0.45, -tam * 0.9, vw * 0.9, tam * (this.banner.sub ? 2.3 : 1.8), 18); g.fill();
        if (gol) g.rotate(Math.sin(agora / 70) * 0.03);
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam);
        if (this.banner.sub) rotulo(g, this.banner.sub, 0, tam * 0.95, '#ffd23d', tam * 0.36);
        g.restore();
      }
    }
  }
}

function rotulo(g, txt, x, y, cor, tam) {
  g.font = `900 ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, tam / 5); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
  g.strokeText(txt, x, y);
  g.fillStyle = cor; g.fillText(txt, x, y);
}

