import { BURACOS, LARGURA as W, ALTURA as H, RAIO_BOLA, RAIO_BURACO, VEL, TEMPO_BURACO } from './regras.js';
import { destravar, som } from './som.js';
import BANDEIRA from '../../assets/golfe/bandeira.json';   // onde fica o buraco no sprite da bandeira

/**
 * Desenho, animação e controles do Mini-golfe (canvas 2D) sobre o campo da
 * maquete (scripts/preparar-golfe.py). O servidor simula a tacada e manda o
 * caminho da bola (`ultima.caminho`, 30 pontos/s); aqui é só animar.
 *
 * O que é daqui:
 *  - golfistas da folha: parado respirando, mirando, a tacada em 4 tempos
 *    (sobe, topo, desce, segue), andando até a bola e a comemoração pulando;
 *  - a bola rolando com rastro colorido e sombra, poeira na tabela, areia
 *    espirrando no bunker, raspando na beirada, e caindo no buraco;
 *  - bandeira balançando, sombras de nuvem passando, borboletas;
 *  - câmera: no celular chega perto e acompanha a bola (🗺 mostra o campo);
 *  - mirar: arrasta pra trás (estilingue), a seta e a barra mostram a força;
 *  - festa: confete, fogos, torcida e o locutor (birdie, par, hole in one).
 */

const A = import.meta.glob('../../assets/golfe/*.{webp,png}', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.(webp|png)$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const CORES = ['azul', 'rosa', 'vermelho', 'roxo'];
const TOM = { azul: '#3ba0ff', rosa: '#ff6fc8', vermelho: '#ff4a3a', roxo: '#b56bff' };
const RASTRO = { azul: 'rastro-azul', rosa: 'rastro-rosa', vermelho: 'rastro-ouro', roxo: 'rastro-lilas' };
const SETA = { azul: 'seta-azul', rosa: 'seta-vermelho', vermelho: 'seta-amarelo', roxo: 'seta-verde' };
const ALTO = 66;                       // altura do golfista no mundo
const SWING = [['sobe', 170], ['topo', 160], ['desce', 70], ['segue', 520]];   // quadros e ms; o contato é no fim do "desce"
const CONTATO = 400;
const ARRASTO_MAX = 170;               // px de tela pra força cheia
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const NOME_RES = (g, par) => (g === 1 ? ['HOLE IN ONE!', 'Hole in one!'] : g - par <= -3 ? ['ALBATROZ!', 'Albatroz!'] : g - par === -2 ? ['EAGLE!', 'Eagle!']
  : g - par === -1 ? ['BIRDIE!', 'Birdie!'] : g - par === 0 ? ['PAR', 'Par'] : g - par === 1 ? ['BOGEY', 'Bogey'] : g - par === 2 ? ['DOUBLE BOGEY', 'Double bogey'] : [`+${g - par}`, null]);

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string, avatar?: string|null}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.e = null;
    this.offset = 0;
    this.vis = [];                // por jogador: bola, golfista e animação
    this.seqVisto = 0;
    this.particulas = [];
    this.textos = [];
    this.banner = null;
    this.mira = null;             // arrastando: { x0, y0, x, y }
    this.cam = { x: W / 2, y: H / 2, z: 1 };
    this.mapa = false;            // 🗺: campo inteiro
    this.nuvens = Array.from({ length: 4 }, (_, k) => ({ x: Math.random() * W, y: 120 + k * 230, r: 160 + Math.random() * 120, v: 10 + Math.random() * 8 }));
    this.borboletas = Array.from({ length: 5 }, () => ({ x: Math.random() * W, y: Math.random() * H, f: Math.random() * 6, cor: ['#ffd23d', '#ff8ad8', '#8fe3ff'][Math.floor(Math.random() * 3)] }));
    this.ultimoBip = null;
    this.buracoAntes = null;
    this.encerrado = false;
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
    som.rolar(0);
    window.speechSynthesis?.cancel();
  }

  cor(i) { return CORES[i % CORES.length]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? `Jogador ${i + 1}`).split(' ')[0]; }
  agoraServ() { return Date.now() + this.offset; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    const antes = this.e;
    this.offset = e.agora - Date.now();
    this.e = e;
    // buraco novo (ou o primeiro estado): todo mundo no tee
    if (this.buracoAntes !== e.buraco) {
      const primeiro = this.buracoAntes == null;
      this.buracoAntes = e.buraco;
      this.vis = e.j.map((j, i) => this.novoVis(j, i, agora));
      const b = BURACOS[e.buraco];
      this.anunciar(`BURACO ${e.buraco + 1} · PAR ${b.par}`, '#ffd23d', 2200);
      if (!primeiro) som.aplausos(0.8, 0.5);
      this.cam = { ...this.cam, x: b.tee[0], y: b.tee[1] };
    }
    const u = e.ultima;
    if (u?.tipo === 'tacada' && u.seq > this.seqVisto) { this.seqVisto = u.seq; this.tacou(u, agora); }
    if (u?.tipo === 'tempo') {
      this.anunciar('ACABOU O TEMPO! +2 pra quem não terminou', '#ff8a4a', 2200);
      som.bip(true);
    }
    if (u?.tipo === 'saiu') this.textos.push({ x: W / 2, y: H / 2, txt: `${this.nome(u.assento)} saiu`, cor: '#fff', tam: 40, t0: agora });
    // quem não está animando fica onde o servidor diz
    for (const [i, j] of e.j.entries()) {
      const v = this.vis[i];
      if (!v || v.anim !== 'parado') continue;
      if (Math.hypot(v.bx - j.x, v.by - j.y) > 1) { v.bx = j.x; v.by = j.y; this.andar(v, agora); }
    }
    if (e.fase === 'intervalo' && antes?.fase === 'jogo') this.cartaoAte = agora + 99999;
    if (e.fase === 'jogo') this.cartaoAte = 0;
    if (e.fim && !this.encerrado) this.encerrar(e.fim, agora);
  }

  novoVis(j, i, agora) {
    const b = BURACOS[this.e.buraco];
    const dir = b.copa[0] >= j.x ? 1 : -1;
    return { bx: j.x, by: j.y, gx: j.x - 20 * dir, gy: j.y + 3, dir, anim: 'parado', t0: agora, dentro: j.dentro, alfa: 0, path: null, eventos: [] };
  }

  /** O golfista vai andando até a bola (fica do lado, de frente pro buraco). */
  andar(v, agora) {
    const copa = BURACOS[this.e.buraco].copa;
    v.dir = copa[0] >= v.bx ? 1 : -1;
    v.alvo = { x: v.bx - 20 * v.dir, y: v.by + 3 };
    if (Math.hypot(v.alvo.x - v.gx, v.alvo.y - v.gy) > 6) { v.anim = 'anda'; v.t0 = agora; v.passoEm = 0; }
  }

  tacou(u, agora) {
    const v = this.vis[u.de];
    if (!v) return;
    const path = [];
    for (let k = 0; k < u.caminho.length; k += 2) path.push([u.caminho[k], u.caminho[k + 1]]);
    // o golfista se acerta na bola e vira pro lado da tacada
    v.bx = u.desde[0]; v.by = u.desde[1];
    v.dir = Math.cos(u.ang) >= 0 ? 1 : -1;
    v.gx = v.bx - 20 * v.dir; v.gy = v.by + 3;
    Object.assign(v, { anim: 'swing', t0: agora, path, ang: u.ang, forca: u.forca, eventos: u.eventos.map(([k, t]) => ({ k, t, feito: false })), u });
    const meu = u.de === this.eu;
    setTimeout(() => som.zunido(meu ? 1 : 0.5), CONTATO - 120);
    setTimeout(() => { som.tacada(u.forca, meu ? 1 : 0.5); if (meu && navigator.vibrate) navigator.vibrate(20 + u.forca * 30); }, CONTATO);
  }

  /** A bola acabou de parar: entrou (festa), estourou o teto, ou o golfista vai até ela. */
  parou(i, v, agora) {
    const u = v.u;
    som.rolar(0);
    v.path = null;
    const meu = i === this.eu;
    if (u.entrou) {
      v.anim = 'festa'; v.t0 = agora; v.dentro = true;
      const [txt, fala] = NOME_RES(u.golpes, u.par);
      const otimo = u.golpes - u.par <= -1 || u.golpes === 1;
      if (!meu && !otimo) this.texto(BURACOS[u.buraco].copa[0], BURACOS[u.buraco].copa[1] - 70, txt, TOM[this.cor(i)], 40);   // o meu e os ótimos vão no anúncio
      if (meu || otimo) this.anunciar(meu ? txt : `${this.nome(i).toUpperCase()}: ${txt}`, otimo ? '#ffd23d' : TOM[this.cor(i)], 1800);
      if (meu && fala) som.fala(fala);
      som.torcida(otimo ? 1.3 : meu ? 0.9 : 0.5);
      if (otimo) { som.fogos(); for (let k = 0; k < 6; k++) setTimeout(() => this.fogo(), k * 300); }
      this.confete(BURACOS[u.buraco].copa, otimo ? 140 : 70);
      if (meu && navigator.vibrate) navigator.vibrate([60, 40, 120]);
      return;
    }
    if (u.teto) { v.dentro = true; this.texto(v.bx, v.by - 60, `${u.golpes} TACADAS: CHEGA!`, '#ff8a4a', 34); }
    v.anim = 'parado';
    this.andar(v, agora);
  }

  encerrar(fim, agora) {
    this.encerrado = true;
    if (!fim) { this.mira = null; return; }   // a conexão caiu (ConexaoPerdida cuida do aviso)
    this.mira = null;
    setTimeout(() => {
      const ganhei = fim.vencedor === this.eu;
      this.anunciar(fim.vencedor === null ? 'EMPATE!' : ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3000);
      if (ganhei) { som.fanfarra(); som.fogos(); for (let k = 0; k < 10; k++) setTimeout(() => this.fogo(), k * 250); }
    }, 1500);
    void agora;
  }

  anunciar(txt, cor, dura = 1500) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  texto(x, y, txt, cor, tam) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now() }); }
  confete([x, y], n) {
    const cores = ['#ffd23d', '#ff5a4a', '#7dff7a', '#5ab4ff', '#ff6fc8', '#fff'];
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 200 + Math.random() * 450;
      this.particulas.push({ tipo: 'confete', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4 + Math.random() * 4, cor: cores[k % cores.length], rot: Math.random() * 6, t0: performance.now(), vida: 2200 + Math.random() * 800 });
    }
  }
  fogo() {
    const x = this.cam.x + (Math.random() - 0.5) * 600, y = this.cam.y - 150 - Math.random() * 200;
    const cor = ['#ffd23d', '#ff5a4a', '#7dff7a', '#5ab4ff', '#ff6fc8'][Math.floor(Math.random() * 5)];
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2, v = 160 + Math.random() * 60; this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, cor, r: 3, t0: performance.now(), vida: 1100 }); }
  }
  poeira(x, y, cor, n = 8, forca = 120) {
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, v = forca * (0.4 + Math.random() * 0.6); this.particulas.push({ tipo: 'poeira', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, cor, r: 3 + Math.random() * 3, t0: performance.now(), vida: 500 + Math.random() * 300 }); }
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

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }

  botoes() {
    const s = 42;
    return {
      sair: { x: 10, y: this.vh - s - 10, w: s, h: s },
      mudo: { x: 10 + s + 8, y: this.vh - s - 10, w: s, h: s },
      mapa: { x: 10, y: 82, w: s, h: s },   // embaixo fica a caixa de reações (Reacoes.tsx)
    };
  }

  podeTacar() {
    const e = this.e, v = this.vis[this.eu], j = e?.j[this.eu];
    return !!(e && j && e.fase === 'jogo' && !e.fim && !e.fora[this.eu] && !j.dentro && v?.anim !== 'swing' && v?.anim !== 'rola' && !v?.path && this.agoraServ() >= j.livreEm);
  }

  ponteiroDesce(ev) {
    destravar();
    const p = this.paraVirtual(ev.clientX, ev.clientY);
    if (ev.pointerType !== 'mouse') this.toque = true;
    const b = this.botoes();
    const dentro = (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (dentro(b.mapa)) { this.mapa = !this.mapa; return; }
    if (!this.podeTacar()) return;
    ev.preventDefault();
    this.mira = { x0: p.x, y0: p.y, x: p.x, y: p.y, id: ev.pointerId };
    this.mapa = false;
  }

  ponteiroMove(ev) {
    if (!this.mira || ev.pointerId !== this.mira.id) return;
    const p = this.paraVirtual(ev.clientX, ev.clientY);
    this.mira.x = p.x; this.mira.y = p.y;
  }

  ponteiroSobe(ev) {
    const m = this.mira;
    if (!m || ev.pointerId !== m.id) return;
    this.mira = null;
    const { ang, forca } = this.lerMira(m);
    if (forca < 0.05 || !this.podeTacar()) return;   // soltou perto: desistiu
    this.vis[this.eu].anim = 'swing-espera';
    this.vis[this.eu].esperaDesde = performance.now();
    this.op.onEntrada({ ang: Math.round(ang * 1000) / 1000, forca: Math.round(forca * 1000) / 1000 });
  }

  /** Estilingue: puxa pra trás, a bola vai pro lado oposto. */
  lerMira(m) {
    const dx = m.x0 - m.x, dy = m.y0 - m.y;
    return { ang: Math.atan2(dy, dx), forca: Math.min(1, Math.hypot(dx, dy) / ARRASTO_MAX) };
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
    this.escCampo = Math.min(this.vw / W, this.vh / H);       // 🗺: o campo inteiro cabe
    this.escPerto = Math.max(this.vw / W, this.vh / H, Math.min(this.vw / 760, this.vh / 480));   // jogando: perto, cobrindo a tela
  }

  /** Pra onde a câmera olha: minha bola rolando > minha bola > o buraco. */
  alvoCamera() {
    const e = this.e;
    if (!e || this.mapa) return { x: W / 2, y: H / 2, z: this.escCampo };
    const v = this.vis[this.eu];
    const z = this.escPerto;
    if (v && !e.fora[this.eu] && !e.j[this.eu]?.dentro) return { x: v.bx, y: v.by - 20, z };
    // terminei: segue quem ainda está jogando (a bola rolando mais recente)
    const rolando = this.vis.findIndex((x, i) => x?.path && i !== this.eu);
    if (rolando >= 0) return { x: this.vis[rolando].bx, y: this.vis[rolando].by, z };
    const copa = BURACOS[e.buraco].copa;
    return { x: copa[0], y: copa[1], z };
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    this.animar(agora, dt);

    const alvo = this.alvoCamera();
    const k = Math.min(1, dt * 3.5);
    this.cam.x = lerp(this.cam.x, alvo.x, k); this.cam.y = lerp(this.cam.y, alvo.y, k); this.cam.z = lerp(this.cam.z || alvo.z, alvo.z, k);
    const z = this.cam.z;
    // não mostra fora do campo
    const meiaW = this.vw / 2 / z, meiaH = this.vh / 2 / z;
    const cx = meiaW * 2 >= W ? W / 2 : Math.min(W - meiaW, Math.max(meiaW, this.cam.x));
    const cy = meiaH * 2 >= H ? H / 2 : Math.min(H - meiaH, Math.max(meiaH, this.cam.y));
    this.ox = this.vw / 2 - cx * z; this.oy = this.vh / 2 - cy * z;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a3a20'; g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }
    g.save();
    g.translate(this.ox, this.oy); g.scale(z, z);
    if (pronto(IMG.campo)) g.drawImage(IMG.campo, 0, 0, W, H);
    this.desenharAmbiente(g, agora, dt);
    if (this.e) {
      this.desenharBuraco(g, agora);
      // de cima pra baixo: quem está mais embaixo na tela passa na frente
      const ordem = [...this.vis.keys()].filter((i) => !this.e.fora[i]).sort((a, b) => (a === this.eu) - (b === this.eu) || this.vis[a].gy - this.vis[b].gy);   // o meu por cima
      for (const i of ordem) this.desenharBola(g, i, agora);
      this.desenharMira(g, agora);
      for (const i of ordem) this.desenharGolfista(g, i, agora);
    }
    this.desenharParticulas(g, agora, dt);
    this.desenharTextos(g, agora);
    this.desenharNuvens(g, dt);
    g.restore();
    if (this.e) this.desenharHud(g, agora);
  }

  /** Avança as animações: swing -> bola rolando (eventos no caminho) -> parou / andando. */
  animar(agora, dt) {
    for (const [i, v] of this.vis.entries()) {
      if (!v) continue;
      v.alfa = Math.min(1, v.alfa + dt * 3);
      if (v.anim === 'swing-espera' && agora - (v.esperaDesde ??= agora) > 1500) { v.anim = 'parado'; v.esperaDesde = null; }   // o servidor recusou
      if (v.anim === 'swing' && v.path) {
        const t = agora - v.t0 - CONTATO;
        if (t < 0) continue;
        const idx = t / (1000 / 30);
        const n = v.path.length - 1;
        const a = Math.min(n, Math.floor(idx)), b = Math.min(n, a + 1), f = Math.min(1, idx - a);
        const ax = v.bx, ay = v.by;
        v.bx = lerp(v.path[a][0], v.path[b][0], f); v.by = lerp(v.path[a][1], v.path[b][1], f);
        v.vel = Math.hypot(v.bx - ax, v.by - ay) / Math.max(0.001, dt);
        if (i === this.eu || this.e?.j[this.eu]?.dentro) som.rolar(Math.min(1, v.vel / VEL[1]) * (i === this.eu ? 1 : 0.5));
        if (v.vel > 250 && Math.random() < 0.3) this.particulas.push({ tipo: 'brilho', x: v.bx, y: v.by, vx: 0, vy: 0, cor: TOM[this.cor(i)], r: 3, t0: agora, vida: 350 });
        for (const ev of v.eventos) {
          if (ev.feito || idx < ev.k) continue;
          ev.feito = true;
          if (ev.t === 'tabela') { som.tabela(i === this.eu ? 1 : 0.5); this.poeira(v.bx, v.by, 'rgba(255,240,200,.8)', 6, 90); }
          if (ev.t === 'areia') { som.areia(); this.poeira(v.bx, v.by, 'rgba(230,200,140,.95)', 16, 180); this.particulas.push({ tipo: 'sprite', nome: 'torrao', x: v.bx, y: v.by - 10, t0: agora, vida: 600, tam: 60 }); }
          if (ev.t === 'beirada') { som.beirada(); som.lamento(); this.texto(v.bx, v.by - 40, 'UUUH!', '#fff', 36); }
          if (ev.t === 'buraco') som.buraco();
        }
        if (idx >= n) { v.bx = v.path[n][0]; v.by = v.path[n][1]; this.parou(i, v, agora); }
      } else if (v.anim === 'anda') {
        const d = Math.hypot(v.alvo.x - v.gx, v.alvo.y - v.gy);
        if (d < 3) { v.gx = v.alvo.x; v.gy = v.alvo.y; v.anim = 'parado'; continue; }
        const passo = Math.min(d, 200 * dt);
        v.gx += ((v.alvo.x - v.gx) / d) * passo; v.gy += ((v.alvo.y - v.gy) / d) * passo;
        v.dirAnda = v.alvo.x >= v.gx ? 1 : -1;
        if (agora - (v.passoEm ?? 0) > 260 && i === this.eu) { v.passoEm = agora; som.passo(); }
      } else if (v.anim === 'festa' && agora - v.t0 > 2600) v.anim = 'parado';
    }
  }

  desenharAmbiente(g, agora, dt) {
    // borboletas
    for (const b of this.borboletas) {
      b.f += dt * 3; b.x += Math.cos(b.f * 0.3) * 30 * dt; b.y += Math.sin(b.f * 0.21) * 20 * dt;
      if (b.x < 0) b.x = W; if (b.x > W) b.x = 0; if (b.y < 0) b.y = H; if (b.y > H) b.y = 0;
      const asa = Math.abs(Math.sin(b.f * 6)) * 6;
      g.fillStyle = b.cor;
      g.beginPath(); g.ellipse(b.x - 3, b.y, asa, 4, -0.4, 0, Math.PI * 2); g.ellipse(b.x + 3, b.y, asa, 4, 0.4, 0, Math.PI * 2); g.fill();
    }
  }

  desenharNuvens(g, dt) {
    for (const n of this.nuvens) {
      n.x += n.v * dt;
      if (n.x - n.r > W) n.x = -n.r;
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      gr.addColorStop(0, 'rgba(0,20,0,.12)'); gr.addColorStop(1, 'rgba(0,20,0,0)');
      g.fillStyle = gr; g.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
  }

  desenharBuraco(g, agora) {
    const b = BURACOS[this.e.buraco];
    const [x, y] = b.copa;
    // a bandeira da folha já tem o buraco na base: o centro dele (BANDEIRA.ax/ay) fica na copa
    const im = IMG.bandeira;
    if (!pronto(im)) { g.fillStyle = '#111'; g.beginPath(); g.ellipse(x, y, RAIO_BURACO * 1.3, RAIO_BURACO * 0.7, 0, 0, Math.PI * 2); g.fill(); return; }
    const ww = (RAIO_BURACO * 2.6) / BANDEIRA.larguraBuraco, hh = (ww * im.naturalHeight) / im.naturalWidth;
    const festa = this.vis.some((v) => v?.anim === 'festa') ? 3 : 1;
    g.save();
    g.translate(x, y);
    g.transform(1, 0, Math.sin(agora / 260) * 0.05 * festa, 1, 0, 0);   // balança a partir do buraco
    g.drawImage(im, -ww * BANDEIRA.ax, -hh * BANDEIRA.ay, ww, hh);
    g.restore();
    // tee: um pino colorido
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(b.tee[0], b.tee[1] + 12, 3, 0, Math.PI * 2); g.fill();
  }

  desenharBola(g, i, agora) {
    const v = this.vis[i];
    const cor = this.cor(i);
    if (v.dentro && v.anim !== 'swing') return;          // está no copo
    let esc = 1;
    if (v.anim === 'swing' && v.path) {
      const t = agora - v.t0 - CONTATO, n = v.path.length - 1;
      if (v.u?.entrou && t / (1000 / 30) > n - 3) esc = Math.max(0.2, 1 - ((t / (1000 / 30)) - (n - 3)) / 3);   // sumindo no copo
      // rastro colorido quando vem rápido
      const rastro = IMG[RASTRO[cor]];
      if (pronto(rastro) && v.vel > 300 && t > 0) {
        const a = Math.atan2(v.path[Math.min(n, Math.floor(t / (1000 / 30)) + 1)][1] - v.by, v.path[Math.min(n, Math.floor(t / (1000 / 30)) + 1)][0] - v.bx);
        const comp = Math.min(70, v.vel / 18), hh = (comp * rastro.naturalHeight) / rastro.naturalWidth;
        g.save(); g.translate(v.bx, v.by); g.rotate(a); g.globalAlpha = Math.min(1, v.vel / 900);
        g.drawImage(rastro, -comp + 8, -hh / 2, comp, hh); g.restore();
      }
    }
    const r = RAIO_BOLA * esc;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(v.bx + 2, v.by + 3, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    if (pronto(IMG.bola)) g.drawImage(IMG.bola, v.bx - r, v.by - r, r * 2, r * 2);
    g.strokeStyle = TOM[cor]; g.lineWidth = 2; g.beginPath(); g.arc(v.bx, v.by, r, 0, Math.PI * 2); g.stroke();
  }

  quadro(v, agora) {
    if (v.anim === 'swing' || v.anim === 'swing-espera') {
      if (v.anim === 'swing-espera') return 'sobe';
      let t = agora - v.t0;
      for (const [q, ms] of SWING) { if (t < ms) return q; t -= ms; }
      return 'frente';
    }
    if (v.anim === 'anda') return `anda-${Math.floor(agora / 120) % 4}`;
    if (v.anim === 'festa') return 'festa';
    if (this.mira && v === this.vis[this.eu]) return this.lerMira(this.mira).forca > 0.5 ? 'sobe' : 'mira';
    return v.dentro ? 'costas' : 'mira';
  }

  desenharGolfista(g, i, agora) {
    const v = this.vis[i];
    const cor = this.cor(i);
    const q = this.quadro(v, agora);
    const im = IMG[`${cor}-${q}`];
    if (!pronto(im)) return;
    const pulo = v.anim === 'festa' ? Math.abs(Math.sin((agora - v.t0) / 170)) * 22 : 0;
    const resp = v.anim === 'parado' || q === 'mira' ? Math.sin(agora / 500 + i) * 0.02 : 0;
    const hh = ALTO * (1 + resp) * (q === 'festa' ? 1.08 : 1), ww = (hh * im.naturalWidth) / im.naturalHeight;
    const dir = v.anim === 'anda' ? v.dirAnda ?? v.dir : v.dir;
    g.save();
    g.globalAlpha = v.alfa;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(v.gx, v.gy, 16, 6, 0, 0, Math.PI * 2); g.fill();
    g.translate(v.gx, v.gy - pulo);
    g.scale(dir, 1);
    g.drawImage(im, -ww / 2, -hh, ww, hh);
    g.restore();
    // nome e seta da cor
    const seta = IMG[SETA[cor]];
    const ty = v.gy - ALTO - 14 - pulo + Math.sin(agora / 300 + i) * 3;
    if (pronto(seta)) g.drawImage(seta, v.gx - 8, ty, 16, 15);
    rotulo(g, i === this.eu ? 'VOCÊ' : this.nome(i), v.gx, ty - 10, i === this.eu ? '#fff' : TOM[cor], 15);
  }

  desenharMira(g, agora) {
    if (!this.mira) return;
    const v = this.vis[this.eu];
    const { ang, forca } = this.lerMira(this.mira);
    // seta pontilhada na direção, comprimento pela força
    const comp = 40 + forca * 200;
    const cor = forca < 0.4 ? '#7dff7a' : forca < 0.75 ? '#ffd23d' : '#ff5a4a';
    g.save();
    g.strokeStyle = cor; g.lineWidth = 4; g.setLineDash([10, 9]); g.lineDashOffset = -agora / 25;
    g.beginPath(); g.moveTo(v.bx, v.by); g.lineTo(v.bx + Math.cos(ang) * comp, v.by + Math.sin(ang) * comp); g.stroke();
    g.setLineDash([]);
    const px = v.bx + Math.cos(ang) * comp, py = v.by + Math.sin(ang) * comp;
    g.fillStyle = cor; g.beginPath();
    g.moveTo(px + Math.cos(ang) * 14, py + Math.sin(ang) * 14);
    g.lineTo(px + Math.cos(ang + 2.5) * 12, py + Math.sin(ang + 2.5) * 12);
    g.lineTo(px + Math.cos(ang - 2.5) * 12, py + Math.sin(ang - 2.5) * 12);
    g.fill();
    // elástico do estilingue até o dedo
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(v.bx, v.by); g.lineTo(v.bx - Math.cos(ang) * forca * 70, v.by - Math.sin(ang) * forca * 70); g.stroke();
    g.restore();
    v.dir = Math.cos(ang) >= 0 ? 1 : -1;
    v.gx = v.bx - 20 * v.dir; v.gy = v.by + 3;
  }

  desenharParticulas(g, agora, dt) {
    const vivas = [];
    for (const p of this.particulas) {
      const k = (agora - p.t0) / p.vida;
      if (k >= 1) continue;
      if (p.tipo === 'sprite') {
        const im = IMG[p.nome];
        if (pronto(im)) { g.globalAlpha = 1 - k; const w = p.tam * (0.7 + k * 0.5), h = (w * im.naturalHeight) / im.naturalWidth; g.drawImage(im, p.x - w / 2, p.y - h / 2, w, h); g.globalAlpha = 1; }
        vivas.push(p); continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'confete') {
        p.vy += 420 * dt; p.vx *= 0.985; p.rot += dt * 9;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.rot * 1.3)));
        g.globalAlpha = 1 - k * k; g.fillStyle = p.cor; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore();
      } else if (p.tipo === 'faisca') {
        p.vy += 140 * dt; p.vx *= 0.97;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - k; g.fillStyle = p.cor;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, Math.PI * 2); g.fill(); g.restore();
      } else if (p.tipo === 'poeira') {
        p.vx *= 0.92; p.vy *= 0.92;
        g.fillStyle = p.cor; g.globalAlpha = 1 - k; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      } else if (p.tipo === 'brilho') {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - k) * 0.8; g.fillStyle = p.cor;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k), 0, Math.PI * 2); g.fill(); g.restore();
      }
      vivas.push(p);
    }
    this.particulas = vivas.slice(-800);
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1500);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1500;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      rotulo(g, t.txt, t.x, t.y - 50 * sai(k), t.cor, t.tam * (k < 0.12 ? volta(k / 0.12) : 1));
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hud

  desenharHud(g, agora) {
    const e = this.e, vw = this.vw, vh = this.vh;
    const b = BURACOS[e.buraco];
    // buraco e relógio (canto de cima à esquerda)
    painel(g, 10, 10, 180, 62);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = '900 20px system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(`Buraco ${e.buraco + 1}/${BURACOS.length}`, 22, 30);
    g.font = '700 14px system-ui'; g.fillStyle = '#cfe9c4'; g.fillText(`Par ${b.par}`, 22, 54);
    if (e.fase === 'jogo' && !e.fim) {
      const resta = Math.max(0, e.prazo - this.agoraServ()), seg = Math.ceil(resta / 1000);
      if (seg <= 10 && seg > 0 && seg !== this.ultimoBip && !e.j[this.eu]?.dentro) { this.ultimoBip = seg; som.bip(seg <= 3); }
      g.font = '900 18px system-ui'; g.fillStyle = seg <= 10 ? '#ff6a4a' : '#ffd23d'; g.textAlign = 'right';
      g.fillText(`⏱ ${seg}s`, 180, 54);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(22, 66, 156, 3);
      g.fillStyle = seg <= 10 ? '#ff6a4a' : '#7dff7a'; g.fillRect(22, 66, 156 * Math.min(1, resta / TEMPO_BURACO), 3);
    }
    // placar (canto de cima à direita): total + tacadas neste buraco
    const ordem = [...e.j.keys()].sort((a, c) => (e.fora[a] - e.fora[c]) || (e.j[a].total + e.j[a].golpes) - (e.j[c].total + e.j[c].golpes));
    const pw = Math.min(230, vw * 0.36), ph = 40;
    painel(g, vw - pw - 10, 10, pw, ordem.length * (ph + 4) + 8);
    for (const [pos, i] of ordem.entries()) {
      const y = 18 + pos * (ph + 4), x = vw - pw - 2;
      const j = e.j[i], cor = this.cor(i);
      g.globalAlpha = e.fora[i] ? 0.4 : 1;
      if (i === this.eu) { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(x, y, pw - 16, ph, 10); g.fill(); }
      g.fillStyle = ['#e8b520', '#b8c4d0', '#d07a3a', '#5a6a7a'][pos]; g.beginPath(); g.roundRect(x + 4, y + 9, 22, 22, 6); g.fill();
      g.font = '900 13px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(String(pos + 1), x + 15, y + 21);
      const rosto = IMG[`${cor}-rosto`];
      if (pronto(rosto)) g.drawImage(rosto, x + 30, y + 3, 34, 34);
      g.textAlign = 'left'; g.font = '800 13px system-ui'; g.fillStyle = TOM[cor];
      g.fillText((i === this.eu ? 'Você' : this.nome(i)).slice(0, 10), x + 68, y + 14);
      g.font = '700 11px system-ui'; g.fillStyle = '#d8e8d0';
      g.fillText(j.dentro ? '✓ no buraco' : `${j.golpes} tacada${j.golpes === 1 ? '' : 's'}`, x + 68, y + 30);
      g.textAlign = 'right'; g.font = '900 18px system-ui'; g.fillStyle = '#fff';
      g.fillText(String(j.total + j.golpes), x + pw - 24, y + 22);
    }
    g.globalAlpha = 1;
    // barra de força (embaixo, no meio) enquanto mira
    if (this.mira) {
      const { forca } = this.lerMira(this.mira);
      const bw = Math.min(420, vw * 0.5), bx = vw / 2 - bw / 2, by = vh - 46;
      painel(g, bx - 8, by - 10, bw + 16, 36);
      const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, '#2bd94a'); gr.addColorStop(0.5, '#ffd23d'); gr.addColorStop(1, '#e8282a');
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(bx, by, bw, 16, 8); g.fill();
      g.fillStyle = gr; g.beginPath(); g.roundRect(bx, by, bw * forca, 16, 8); g.fill();
      g.fillStyle = '#fff'; g.fillRect(bx + bw * forca - 2, by - 5, 4, 26);
      rotulo(g, `${Math.round(forca * 100)}%`, vw / 2, by - 18, '#fff', 16);
    } else if (this.podeTacar() && !this.mapa) {
      const k = 0.6 + 0.4 * Math.sin(agora / 300);
      g.globalAlpha = k;
      rotulo(g, this.toque ? '👆 Puxe pra trás e solte pra tacar' : '🖱 Puxe pra trás e solte pra tacar', vw / 2, vh - 34, '#fff', 17);
      g.globalAlpha = 1;
    } else if (e.j[this.eu]?.dentro && e.fase === 'jogo' && !e.fim) {
      rotulo(g, 'Esperando os outros terminarem…', vw / 2, vh - 34, '#cfe9c4', 16);
    }
    // botões
    const bt = this.botoes();
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊'], ['mapa', this.mapa ? '🔍' : '🗺']]) {
      const r = bt[k];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // cartão no intervalo
    if (e.fase === 'intervalo' || (e.fim && agora - (this.fimEm ??= agora) > 1400)) this.desenharCartao(g);
    // anúncio
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(vw / 2, vh * 0.3);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        const tam = Math.min(50, (vw * 0.9) / Math.max(6, this.banner.txt.length) * 1.7);
        g.fillStyle = 'rgba(0,30,10,.55)'; g.beginPath(); g.roundRect(-vw * 0.42, -tam * 0.85, vw * 0.84, tam * 1.7, 18); g.fill();
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam);
        g.restore();
      }
    }
  }

  desenharCartao(g) {
    const e = this.e, vw = this.vw, vh = this.vh;
    const n = e.j.length, w = Math.min(560, vw * 0.9), h = 90 + n * 36;
    const x = vw / 2 - w / 2, y = vh / 2 - h / 2 + 20;
    painel(g, x, y, w, h);
    rotulo(g, e.fim ? 'CARTÃO FINAL' : `FIM DO BURACO ${e.buraco + 1}`, vw / 2, y + 24, '#ffd23d', 20);
    const col = (k) => x + 150 + k * ((w - 230) / BURACOS.length);
    g.font = '800 12px system-ui'; g.textAlign = 'center'; g.fillStyle = '#cfe9c4';
    BURACOS.forEach((b, k) => g.fillText(`${k + 1} (par ${b.par})`, col(k) + 20, y + 54));
    g.fillText('TOTAL', x + w - 44, y + 54);
    const ordem = [...e.j.keys()].sort((a, c) => e.j[a].total - e.j[c].total);
    for (const [pos, i] of ordem.entries()) {
      const yy = y + 80 + pos * 36, j = e.j[i];
      g.textAlign = 'left'; g.font = '800 15px system-ui'; g.fillStyle = TOM[this.cor(i)];
      g.fillText(`${pos + 1}. ${i === this.eu ? 'Você' : this.nome(i)}`.slice(0, 16), x + 18, yy);
      g.textAlign = 'center'; g.font = '900 16px system-ui';
      j.cartao.forEach((s, k) => { const d = s - BURACOS[k].par; g.fillStyle = d < 0 ? '#7dff7a' : d === 0 ? '#fff' : '#ff8a6a'; g.fillText(String(s), col(k) + 20, yy); });
      g.fillStyle = '#ffd23d'; g.fillText(String(j.total), x + w - 44, yy);
    }
  }
}

function rotulo(g, txt, x, y, cor, tam) {
  g.font = `900 ${tam}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, tam / 5); g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineJoin = 'round';
  g.strokeText(txt, x, y);
  g.fillStyle = cor; g.fillText(txt, x, y);
}

function painel(g, x, y, w, h) {
  g.fillStyle = 'rgba(8,24,14,.78)'; g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); g.stroke();
}
