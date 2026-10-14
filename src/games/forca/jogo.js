import { PECAS, VIDAS, TEMPO } from './regras.js';
import DADOS from '../../assets/forca/pecas.json';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles da Forca (canvas 2D) sobre a maquete
 * (scripts/preparar-forca.py): o cenário sem o caubói, e o caubói em 7
 * pedaços recortados dela. Tudo em coordenadas da maquete (1024×1536),
 * escalado pra caber na tela.
 *
 * O que é daqui:
 *  - o caubói pendurado balançando na corda; cada erro arranca um pedaço
 *    (chapéu voa, braços e pernas despencam, no 6º o pescoço estala e o corpo
 *    cai, sobrando a cabeça na corda), com jorro de sangue, toco pingando,
 *    poça crescendo no tablado e os pedaços largados lá;
 *  - a lousa: letras viram na hora certa; no fim, as que faltaram em vermelho;
 *  - o teclado por cima do pintado (verde acertou, vermelho errou);
 *  - o rival no canto: um caubói pequeno que também vai perdendo pedaços;
 *  - lanterna tremendo, lua, poeira e um capim-seco rolando de vez em quando.
 */

const A = import.meta.glob('../../assets/forca/*.{webp,png}', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.(webp|png)$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;
const { pecas: PECA, tocos: TOCOS } = DADOS;   // tocos: 'braco-e>tronco' = a ferida que fica no tronco quando o braço sai

const W = 1024, H = 1536;
const PIVO = { x: 628, y: 262 };          // onde a corda pintada termina: o caubói balança daqui
const PESCOCO = { x: 614, y: 438 };
const TABLADO = { x0: 250, x1: 860, y: 742 };
const ORDEM_DESENHO = ['perna-d', 'perna-e', 'braco-e', 'braco-d', 'tronco', 'cabeca', 'chapeu'];
// teclado (medido na maquete): fileiras A-I e J-R alinhadas, S-Z um pouco mais largas
const COL12 = [51, 147, 243, 337, 427, 517, 604, 691, 779];
const COL3 = [51, 150, 248, 347, 445, 547, 648, 743];
const LIN = [[1015, 1096], [1109, 1191], [1204, 1294]];
const TECLAS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l, k) => {
  const lin = k < 9 ? 0 : k < 18 ? 1 : 2, col = lin < 2 ? k % 9 : k - 18;
  const x = (lin < 2 ? COL12 : COL3)[col];
  return { l, x, y: LIN[lin][0], w: lin < 2 ? 85 : 88, h: LIN[lin][1] - LIN[lin][0] };
});
const RIVAL = { x: 872, y: 1013, w: 124, h: 292 };
const STATUS = { x: 330, y: 1332, w: 365, h: 160 };
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

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
    this.soltas = [];            // pedaços caídos (física até parar no tablado)
    this.foram = new Set();      // pedaços que já saíram do meu caubói
    this.rivalForam = 0;
    this.tocos = [];             // de onde o sangue continua pingando
    this.particulas = [];
    this.manchas = [];           // sangue no tablado
    this.viradas = new Map();    // casa da lousa -> quando a letra apareceu
    this.pendente = null;        // letra que mandei e ainda não voltou
    this.apertou = new Map();
    this.textos = [];
    this.banner = null;
    this.tremor = 0;
    this.vermelho = 0;
    this.balanco = 0;            // empurrão no balanço (cada pedaço arrancado sacode)
    this.rivalPisca = 0;
    this.rivalTxt = null;
    this.capim = null;
    this.proxCapim = performance.now() + 9000;
    this.poeira = Array.from({ length: 18 }, () => ({ x: Math.random() * W, y: 200 + Math.random() * 600, v: 6 + Math.random() * 10, f: Math.random() * 6 }));
    this.ultimoTique = null;
    this.encerrado = false;
    this.mouse = null;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });

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

  nome(i) { return (this.op.jogadores[i]?.name ?? (i === this.eu ? 'Você' : 'Rival')).split(' ')[0]; }
  get rival() { return 1 - this.eu; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const antes = this.e;
    this.offset = e.agora - Date.now();
    this.e = e;
    const agora = performance.now();
    // letras novas na lousa: viram agora
    for (let k = 0; k < e.mascara.length; k++) if (e.mascara[k] !== '_' && (!antes || antes.mascara[k] === '_')) this.viradas.set(k, antes ? agora + k * 40 : 0);
    // reconexão / primeiro estado: os pedaços que já foram, sem animação
    if (!antes) for (let k = 0; k < e.erros; k++) this.foram.add(PECAS[k]);
    if (!antes) this.rivalForam = e.rival.erros;
    const u = e.ultima;
    if (u?.tipo === 'letra' && u.de === this.eu) {
      this.pendente = null;
      if (u.acertou) { som.certa(u.casas); this.texto(512, 800, `+${u.casas}`, '#7dff7a', 46); }
      else if (u.peca) this.arrancar(u.peca, agora);
    }
    if (u?.tipo === 'letra' && u.de !== this.eu) {
      this.rivalPisca = agora;
      this.rivalTxt = { txt: u.acertou ? 'acertou!' : 'errou!', cor: u.acertou ? '#7dff7a' : '#ff5a4a', t0: agora };
      if (!u.acertou) { this.rivalForam = e.rival.erros; som.baque(); }
    }
    if (e.fim && !this.encerrado) this.encerrar(e.fim, agora);
  }

  encerrar(fim, agora) {
    this.encerrado = true;
    this.pendente = null;
    const ganhei = fim.vencedor === this.eu;
    const txt = fim.motivo === 'palavra' ? (ganhei ? 'VOCÊ COMPLETOU!' : `${this.nome(this.rival).toUpperCase()} COMPLETOU`)
      : fim.motivo === 'enforcado' ? (ganhei ? 'O RIVAL FOI ENFORCADO!' : 'ENFORCADO!')
      : fim.motivo === 'empate' ? 'EMPATE' : 'ACABOU O TEMPO';
    setTimeout(() => {
      this.anunciar(txt, ganhei ? '#ffd23d' : '#ff5a4a', 2600);
      (ganhei ? som.fanfarra : fim.vencedor === null ? () => {} : som.derrota)();
      som.fala(ganhei ? 'Vitória!' : fim.motivo === 'enforcado' ? 'Enforcado!' : 'Fim de jogo');
      if (ganhei) for (let k = 0; k < 60; k++) this.confete(agora);
    }, fim.motivo === 'enforcado' && !ganhei ? 1400 : 300);
  }

  /** Arranca um pedaço do meu caubói: ele cai (ou voa), o sangue jorra do toco. */
  arrancar(peca, agora) {
    this.foram.add(peca);
    const p = PECA[peca];
    const ang = this.angulo(agora);
    const j = this.noMundo(p.jx, p.jy, ang);
    const lado = p.jx < PIVO.x ? -1 : 1;
    const chapeu = peca === 'chapeu', tronco = peca === 'tronco';
    this.soltas.push({ peca, x: j.x, y: j.y, ox: p.jx - p.x, oy: p.jy - p.y, rot: ang, vx: chapeu ? lado * 160 + 80 : tronco ? 0 : lado * (90 + Math.random() * 80),
      vy: chapeu ? -520 : tronco ? 0 : -120, vr: chapeu ? 7 : tronco ? 1.2 * (Math.random() < 0.5 ? -1 : 1) : lado * (3 + Math.random() * 3), parada: false, t0: agora });
    this.balanco += (tronco ? 0.05 : 0.14) * -lado;
    this.tremor = tronco ? 26 : 12;
    this.vermelho = agora;
    if (navigator.vibrate) navigator.vibrate(tronco ? [100, 60, 220] : 90);
    if (chapeu) {
      som.errada();
      this.texto(560, 230, 'O CHAPÉU!', '#ffb340', 38);
      return;
    }
    // sangue: jorro no corte e o toco pingando um tempo
    const toco = tronco ? { x: PESCOCO.x, y: PESCOCO.y + 6 } : { x: p.jx, y: p.jy };
    this.tocos.push({ ...toco, ate: agora + (tronco ? 9000 : 4500), forca: tronco ? 2 : 1 });
    for (let k = 0; k < (tronco ? 90 : 45); k++) this.sangue(j.x, j.y, lado, tronco ? 1.6 : 1);
    som.corte();
    setTimeout(() => som.sangue(), 80);
    if (tronco) { som.estalo(); setTimeout(() => som.grito(1.2), 120); this.texto(512, 300, 'CREC!', '#ff3a2a', 64); }
    else { som.grito(0.8); this.texto(j.x, j.y - 30, ['AAAI!', 'NÃO!', 'SOCORRO!', 'AAARGH!'][this.foram.size % 4], '#ff5a4a', 34); }
  }

  sangue(x, y, lado = 0, forca = 1) {
    const a = -Math.PI / 2 + lado * 0.8 + (Math.random() - 0.5) * 2.2, v = (120 + Math.random() * 380) * forca;
    this.particulas.push({ tipo: 'sangue', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 4, t0: performance.now(), vida: 2500 });
  }
  confete(agora) {
    const cores = ['#ffd23d', '#ff5a4a', '#7dff7a', '#5ab4ff', '#ff6fc8'];
    this.particulas.push({ tipo: 'confete', x: 512 + (Math.random() - 0.5) * 300, y: 300, vx: (Math.random() - 0.5) * 700, vy: -300 - Math.random() * 500, r: 5 + Math.random() * 5,
      t0: agora, vida: 3000, cor: cores[Math.floor(Math.random() * cores.length)], rot: Math.random() * 6 });
  }
  texto(x, y, txt, cor, tam) { this.textos.push({ x, y, txt, cor, tam, t0: performance.now() }); }
  anunciar(txt, cor, dura = 1600) { this.banner = { txt, cor, t0: performance.now(), dura }; }

  /** Balanço do caubói: devagar o tempo todo, mais forte depois de cada pedaço. */
  angulo(agora) { return Math.sin(agora / 900) * 0.035 + Math.sin(agora / 380) * this.balanco; }
  noMundo(x, y, ang) {
    const dx = x - PIVO.x, dy = y - PIVO.y, c = Math.cos(ang), s = Math.sin(ang);
    return { x: PIVO.x + dx * c - dy * s, y: PIVO.y + dx * s + dy * c };
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiroDesce(ev),
      move: (ev) => { if (ev.pointerType === 'mouse') this.mouse = this.paraMaquete(ev.clientX, ev.clientY); },
      tecla: (ev) => { const l = ev.key?.toUpperCase(); if (/^[A-Z]$/.test(l ?? '')) { destravar(); this.chutar(l); } },
      resize: () => this.redimensionar(),
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('keydown', this.h.tecla);
    addEventListener('resize', this.h.resize);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('keydown', this.h.tecla);
    removeEventListener('resize', this.h.resize);
  }

  paraMaquete(cx, cy) { return { x: (cx - this.ox) / this.esc, y: (cy - this.oy) / this.esc }; }

  ponteiroDesce(ev) {
    destravar();
    const { x, y } = this.paraMaquete(ev.clientX, ev.clientY);
    const dentro = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (dentro(this.botaoSair())) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(this.botaoMudo())) { som.alternarMudo(); return; }
    const t = TECLAS.find((k) => dentro(k));
    if (t) this.chutar(t.l);
  }

  chutar(l) {
    const e = this.e;
    if (!e || this.encerrado || this.pendente || e.chutes.includes(l) || e.erros >= VIDAS) return;
    this.pendente = l;
    this.apertou.set(l, performance.now());
    som.tecla();
    this.op.onEntrada({ letra: l });
  }

  botaoSair() { return { x: 952, y: 22, w: 56, h: 56 }; }
  botaoMudo() { return { x: 884, y: 22, w: 56, h: 56 }; }

  // ------------------------------------------------------------- desenho

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.w = w; this.h = h;
    this.esc = Math.min(w / W, h / H);
    this.ox = (w - W * this.esc) / 2;
    this.oy = (h - H * this.esc) / 2;
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    this.balanco *= Math.max(0, 1 - dt * 0.9);
    const f = IMG.fundo;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // sobra da tela (celular alto, deitado, desktop): madeira escura (o cenário borrado mostrava o "JOGAR" pintado da maquete)
    const fundo = g.createLinearGradient(0, 0, 0, this.h);
    fundo.addColorStop(0, '#0d0816'); fundo.addColorStop(0.5, '#1c0f08'); fundo.addColorStop(1, '#0c0603');
    g.fillStyle = fundo; g.fillRect(0, 0, this.w, this.h);
    this.tremor *= 0.86;
    g.setTransform(this.dpr * this.esc, 0, 0, this.dpr * this.esc, this.dpr * (this.ox + (Math.random() - 0.5) * this.tremor * this.esc), this.dpr * (this.oy + (Math.random() - 0.5) * this.tremor * this.esc));
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
    if (pronto(f)) g.drawImage(f, 0, 0, W, H);
    this.desenharAmbiente(g, agora, dt);
    this.desenharManchas(g);
    this.desenharCauboi(g, agora);
    this.desenharSoltas(g, agora, dt);
    this.desenharParticulas(g, agora, dt);
    if (this.e) {
      this.desenharPainel(g, agora);
      this.desenharLousa(g, agora);
      this.desenharTeclado(g, agora);
      this.desenharRival(g, agora);
      this.desenharStatus(g, agora);
    }
    this.desenharBotoes(g);
    this.desenharTextos(g, agora);
    // vermelho nas bordas quando arranca um pedaço
    const v = agora - this.vermelho;
    if (v < 500) {
      const gr = g.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 900);
      gr.addColorStop(0, 'rgba(150,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${0.55 * (1 - v / 500)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    this.desenharBanner(g, agora);
    g.restore();
  }

  desenharAmbiente(g, agora, dt) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    // lanterna e lua
    const fl = 0.8 + Math.sin(agora / 70) * 0.08 + Math.sin(agora / 23) * 0.06;
    let gr = g.createRadialGradient(872, 380, 0, 872, 380, 150 * fl);
    gr.addColorStop(0, 'rgba(255,190,80,.5)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.fillRect(700, 220, 340, 340);
    gr = g.createRadialGradient(755, 210, 40, 755, 210, 130);
    gr.addColorStop(0, `rgba(160,180,255,${0.12 + 0.04 * Math.sin(agora / 2000)})`); gr.addColorStop(1, 'rgba(160,180,255,0)');
    g.fillStyle = gr; g.fillRect(620, 80, 270, 270);
    // poeira no ar
    for (const p of this.poeira) {
      p.x += p.v * dt; p.f += dt;
      if (p.x > W + 10) p.x = -10;
      g.fillStyle = `rgba(255,210,150,${0.18 + 0.15 * Math.sin(p.f * 2)})`;
      g.beginPath(); g.arc(p.x, p.y + Math.sin(p.f) * 10, 2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // capim-seco rolando pelo tablado de vez em quando
    if (!this.capim && agora > this.proxCapim) this.capim = { x: W + 60, rot: 0 };
    if (this.capim) {
      const c = this.capim;
      c.x -= 190 * dt; c.rot -= dt * 4;
      const y = TABLADO.y - 34 - Math.abs(Math.sin(c.x / 60)) * 26;
      g.save(); g.translate(c.x, y); g.rotate(c.rot);
      g.strokeStyle = 'rgba(150,105,55,.9)'; g.lineWidth = 2.2;
      for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(0, 0, 30, 18 + (k % 4) * 3, k * 0.45, 0, Math.PI * 2); g.stroke(); }
      g.restore();
      if (c.x < -80) { this.capim = null; this.proxCapim = agora + 14000 + Math.random() * 12000; }
    }
  }

  desenharManchas(g) {
    for (const m of this.manchas) {
      g.fillStyle = m.cor;
      g.beginPath(); g.ellipse(m.x, m.y, m.r, m.r * 0.32, 0, 0, Math.PI * 2); g.fill();
    }
  }

  desenharCauboi(g, agora) {
    const ang = this.angulo(agora);
    g.save();
    g.translate(PIVO.x, PIVO.y); g.rotate(ang); g.translate(-PIVO.x, -PIVO.y);
    // a corda até o pescoço (por baixo do chapéu; aparece quando ele voa)
    g.strokeStyle = '#a8742f'; g.lineWidth = 11; g.lineCap = 'round';
    g.beginPath(); g.moveTo(PIVO.x, PIVO.y - 4); g.quadraticCurveTo(PIVO.x - 6, (PIVO.y + PESCOCO.y) / 2, PESCOCO.x, PESCOCO.y - 4); g.stroke();
    g.strokeStyle = '#6e4818'; g.lineWidth = 2;
    for (let y = PIVO.y; y < PESCOCO.y - 10; y += 12) { g.beginPath(); g.moveTo(PIVO.x - 5, y); g.lineTo(PIVO.x + 5, y + 7); g.stroke(); }
    for (const nome of ORDEM_DESENHO) {
      if (this.foram.has(nome)) continue;
      const p = PECA[nome], im = IMG[nome];
      if (pronto(im)) g.drawImage(im, p.x, p.y, p.w, p.h);
      if (nome === 'cabeca' && this.foram.has('chapeu')) { const c = PECA.cabelo; if (pronto(IMG.cabelo)) g.drawImage(IMG.cabelo, c.x, c.y, c.w, c.h); }
    }
    this.desenharTocos(g, this.foram);
    // o laço no pescoço (por cima do tronco, por baixo da barba)
    if (this.foram.has('tronco')) {
      g.strokeStyle = '#8a5a22'; g.lineWidth = 9;
      g.beginPath(); g.ellipse(PESCOCO.x, PESCOCO.y + 2, 26, 9, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
    // tocos pingando
    for (const t of this.tocos) {
      if (agora > t.ate) continue;
      const w = this.noMundo(t.x, t.y, ang);
      if (Math.random() < 0.35 * t.forca) this.particulas.push({ tipo: 'sangue', x: w.x + (Math.random() - 0.5) * 8, y: w.y, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 80, r: 1.5 + Math.random() * 2.5, t0: agora, vida: 2500 });
      if (t.forca > 1 && Math.random() < 0.25) this.sangue(w.x, w.y, 0, 0.5);   // pescoço: jorros
    }
  }

  /** As feridas que ficam no corpo: pedaço `a` saiu e `b` continua. */
  desenharTocos(g, foram) {
    for (const [k, v] of Object.entries(TOCOS)) {
      const [a, b] = k.split('>');
      if (!foram.has(a) || foram.has(b)) continue;
      const im = IMG[`toco-${a}-${b}`];
      if (pronto(im)) g.drawImage(im, v.x, v.y, v.w, v.h);
    }
  }

  desenharSoltas(g, agora, dt) {
    for (const s of this.soltas) {
      const p = PECA[s.peca], im = IMG[s.peca];
      if (!s.parada) {
        s.vy += 1600 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        s.x = Math.max(TABLADO.x0, Math.min(TABLADO.x1, s.x));
        const chao = TABLADO.y - Math.min(p.w, p.h) * 0.32;
        if (s.y >= chao) {
          s.y = chao;
          if (Math.abs(s.vy) > 260) { s.vy *= -0.32; s.vx *= 0.5; s.vr *= 0.5; som.baque(); this.respingo(s.x, TABLADO.y); }
          else {
            s.parada = true; s.vy = 0;
            if (s.peca !== 'chapeu') this.manchas.push({ x: s.x, y: TABLADO.y - 4, r: 22 + Math.random() * 16, cor: 'rgba(110,0,0,.75)' });
          }
        }
        // deitar no chão: gira pro ângulo deitado mais perto
        if (s.y >= chao - 2) { const alvo = Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2) + (s.peca === 'chapeu' ? 0 : 0.15); s.rot = lerp(s.rot, alvo, Math.min(1, dt * 8)); }
      }
      if (!pronto(im)) continue;
      g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
      g.drawImage(im, -s.ox, -s.oy, p.w, p.h);
      const fer = IMG[`ferida-${s.peca}`];   // a carne do corte no pedaço que caiu
      if (pronto(fer)) g.drawImage(fer, -s.ox, -s.oy, p.w, p.h);
      g.restore();
      // pedaço sangrando enquanto cai
      if (s.peca !== 'chapeu' && agora - s.t0 < 1500 && Math.random() < 0.5) this.particulas.push({ tipo: 'sangue', x: s.x, y: s.y, vx: 0, vy: 40, r: 2, t0: agora, vida: 1200 });
    }
  }

  respingo(x, y) { for (let k = 0; k < 8; k++) this.particulas.push({ tipo: 'sangue', x, y: y - 4, vx: (Math.random() - 0.5) * 260, vy: -80 - Math.random() * 160, r: 1.5 + Math.random() * 2, t0: performance.now(), vida: 900 }); }

  desenharParticulas(g, agora, dt) {
    const vivas = [];
    for (const p of this.particulas) {
      const k = (agora - p.t0) / p.vida;
      if (k >= 1) continue;
      p.vy += (p.tipo === 'confete' ? 500 : 1500) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'sangue') {
        // caiu no tablado: vira mancha (a poça vai crescendo)
        if (p.y >= TABLADO.y - 2 && p.x > TABLADO.x0 && p.x < TABLADO.x1) {
          if (Math.random() < 0.4) this.manchas.push({ x: p.x, y: TABLADO.y - 3 + Math.random() * 6, r: p.r * (1.5 + Math.random() * 2), cor: `rgba(${110 + Math.random() * 40},0,0,.7)` });
          continue;
        }
        g.fillStyle = `rgba(${150 + Math.random() * 30},0,0,${1 - k * 0.4})`;
        g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * (1 + Math.min(2, Math.abs(p.vy) / 400)), Math.atan2(p.vy, p.vx) - Math.PI / 2, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'confete') {
        p.vx *= 0.99; p.rot += dt * 8;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.cor; g.globalAlpha = 1 - k * k; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore();
      }
      vivas.push(p);
    }
    this.particulas = vivas.slice(-900);
    if (this.manchas.length > 260) this.manchas.splice(0, this.manchas.length - 260);
  }

  desenharPainel(g, agora) {
    const e = this.e;
    // tema
    texto(g, `🤠 ${e.tema}`, 80, 371, '#ffd27a', 34, 'left');
    // tempo
    const resta = Math.max(0, e.prazo - (Date.now() + this.offset));
    const seg = Math.ceil(resta / 1000);
    if (!e.fim && seg <= 10 && seg > 0 && seg !== this.ultimoTique) { this.ultimoTique = seg; som.tique(seg <= 3); }
    const urgente = seg <= 10 && !e.fim;
    const pul = urgente ? 1 + 0.08 * Math.max(0, Math.sin(((resta % 1000) / 1000) * Math.PI)) : 1;
    g.save(); g.translate(78, 500); g.scale(pul, pul);
    texto(g, `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`, 0, 0, urgente ? '#ff5a4a' : '#ffd23d', 58, 'left');
    g.restore();
    const k = Math.min(1, resta / TEMPO);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(70, 538, 286, 18, 9); g.fill();
    const gr = g.createLinearGradient(70, 0, 356, 0);
    gr.addColorStop(0, '#2bd94a'); gr.addColorStop(0.6, '#e8d52a'); gr.addColorStop(1, '#ff8a2a');
    g.fillStyle = k < 0.2 ? '#ff4a3a' : gr; g.beginPath(); g.roundRect(70, 538, 286 * k, 18, 9); g.fill();
    // corações: um por pedaço que ainda está no lugar
    for (let n = 0; n < VIDAS; n++) {
      const vivo = n < VIDAS - e.erros;
      const bate = vivo && n === VIDAS - e.erros - 1 ? 1 + 0.08 * Math.sin(agora / 140) : 1;
      coracao(g, 96 + n * 47, 660, 20 * bate, vivo ? '#ff2a3a' : 'rgba(20,10,10,.85)', vivo ? '#7a0010' : '#5a4a4a');
    }
  }

  desenharLousa(g, agora) {
    const e = this.e;
    const m = e.mascara, n = m.length;
    const x0 = 120, x1 = 910, cy = 900;
    const passo = Math.min(84, (x1 - x0) / n), larg = passo * 0.78;
    const tam = Math.min(78, passo * 1.05);
    const inicio = (x0 + x1) / 2 - (passo * n) / 2;
    for (let k = 0; k < n; k++) {
      const ch = m[k], cx = inicio + passo * (k + 0.5);
      if (ch === ' ') continue;
      if (ch !== '-') { g.fillStyle = '#e9dcc0'; g.fillRect(cx - larg / 2, cy + 40, larg, 6); }
      if (ch === '_') continue;
      const t0 = this.viradas.get(k) ?? 0;
      const v = Math.min(1, Math.max(0, (agora - t0) / 350));
      if (v <= 0) continue;
      const faltou = e.fim && !e.chutes.some((l) => l === ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()) && ch !== '-';
      g.save(); g.translate(cx, cy); g.scale(1, volta(v));
      if (v < 1) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,220,120,${0.5 * (1 - v)})`; g.fillRect(-larg / 2, -tam / 2, larg, tam); g.globalCompositeOperation = 'source-over'; }
      texto(g, ch, 0, 0, faltou ? '#ff6a5a' : '#f6ecd2', tam, 'center');
      g.restore();
    }
  }

  desenharTeclado(g, agora) {
    const e = this.e;
    const hover = this.mouse ? TECLAS.find((t) => this.mouse.x >= t.x && this.mouse.x <= t.x + t.w && this.mouse.y >= t.y && this.mouse.y <= t.y + t.h) : null;
    for (const t of TECLAS) {
      const usada = e.chutes.includes(t.l), certa = e.acertos.includes(t.l), esperando = this.pendente === t.l;
      const ap = this.apertou.get(t.l);
      const s = ap && agora - ap < 160 ? 0.9 + 0.1 * ((agora - ap) / 160) : hover === t && !usada ? 1.04 : 1;
      const [c1, c2, borda] = usada ? (certa ? ['#46d34a', '#178a2a', '#0b4a14'] : ['#e8443a', '#9a1a14', '#4a0a08']) : ['#a8683a', '#6e3a1c', '#2e160a'];
      g.save();
      g.translate(t.x + t.w / 2, t.y + t.h / 2); g.scale(s, s);
      const gr = g.createLinearGradient(0, -t.h / 2, 0, t.h / 2);
      gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.strokeStyle = borda; g.lineWidth = 4;
      g.beginPath(); g.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, 12); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(-t.w / 2 + 5, -t.h / 2 + 4, t.w - 10, t.h * 0.45, 8); g.stroke();
      g.globalAlpha = esperando ? 0.5 + 0.5 * Math.sin(agora / 80) : 1;
      texto(g, t.l, 0, 2, usada ? '#fff' : '#ffeacc', 44, 'center');
      if (usada && !certa) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-22, -22); g.lineTo(22, 22); g.stroke(); }
      g.restore();
    }
  }

  /** O rival: cartão com o caubói dele em miniatura, que também vai perdendo pedaços. */
  desenharRival(g, agora) {
    const e = this.e, r = RIVAL;
    const pisca = Math.max(0, 1 - (agora - this.rivalPisca) / 400);
    g.save();
    const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    gr.addColorStop(0, '#4a2a16'); gr.addColorStop(1, '#2a160a');
    g.fillStyle = gr; g.strokeStyle = pisca ? `rgba(255,${this.rivalTxt?.cor === '#7dff7a' ? 230 : 80},80,${0.5 + pisca / 2})` : '#1a0c04'; g.lineWidth = 5;
    g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 14); g.fill(); g.stroke();
    texto(g, this.nome(this.rival).slice(0, 9), r.x + r.w / 2, r.y + 22, '#ffd27a', 20, 'center');
    // mini caubói
    const esc = 0.27, mx = r.x + r.w / 2, my = r.y + 46;
    g.save();
    g.translate(mx, my); g.rotate(Math.sin(agora / 800 + 1) * 0.05); g.scale(esc, esc); g.translate(-PIVO.x, -(PIVO.y - 10));
    g.strokeStyle = '#a8742f'; g.lineWidth = 10; g.beginPath(); g.moveTo(PIVO.x, PIVO.y - 60); g.lineTo(PESCOCO.x, PESCOCO.y); g.stroke();
    const foram = new Set(PECAS.slice(0, this.rivalForam));
    for (const nome of ORDEM_DESENHO) {
      if (foram.has(nome)) continue;
      const p = PECA[nome], im = IMG[nome];
      if (pronto(im)) g.drawImage(im, p.x, p.y, p.w, p.h);
      if (nome === 'cabeca' && foram.has('chapeu') && pronto(IMG.cabelo)) g.drawImage(IMG.cabelo, PECA.cabelo.x, PECA.cabelo.y, PECA.cabelo.w, PECA.cabelo.h);
    }
    this.desenharTocos(g, foram);
    if (this.rivalForam > 1) { g.fillStyle = 'rgba(140,0,0,.8)'; g.beginPath(); g.ellipse(PIVO.x, 760, 60 + this.rivalForam * 14, 14, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    // vidas e letras
    for (let n = 0; n < VIDAS; n++) coracao(g, r.x + 16 + n * 18.5, r.y + 226, 8, n < VIDAS - e.rival.erros ? '#ff2a3a' : 'rgba(20,10,10,.85)', '#3a0008');
    const prog = e.rival.revelados / Math.max(1, e.letras);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.roundRect(r.x + 10, r.y + 246, r.w - 20, 12, 6); g.fill();
    g.fillStyle = '#ffd23d'; g.beginPath(); g.roundRect(r.x + 10, r.y + 246, (r.w - 20) * prog, 12, 6); g.fill();
    texto(g, `${e.rival.revelados}/${e.letras} letras`, r.x + r.w / 2, r.y + 274, '#f6ecd2', 17, 'center');
    if (this.rivalTxt && agora - this.rivalTxt.t0 < 1200) {
      const k = (agora - this.rivalTxt.t0) / 1200;
      g.globalAlpha = 1 - k;
      texto(g, this.rivalTxt.txt, r.x + r.w / 2, r.y + 120 - k * 30, this.rivalTxt.cor, 24, 'center');
      g.globalAlpha = 1;
    }
    g.restore();
  }

  desenharStatus(g, agora) {
    const e = this.e, r = STATUS;
    const ganhei = e.fim?.vencedor === this.eu;
    const [c1, c2, txt] = e.fim ? (ganhei ? ['#3ad84a', '#137a22', 'VITÓRIA!'] : e.fim.vencedor === null ? ['#a8a8a8', '#5a5a5a', 'EMPATE'] : ['#e8443a', '#8a1a14', 'DERROTA'])
      : this.pendente ? ['#c8902a', '#7a4a10', '...'] : ['#c8902a', '#7a4a10', 'ESCOLHA UMA LETRA'];
    g.save();
    g.shadowColor = 'rgba(255,200,80,.5)'; g.shadowBlur = e.fim ? 30 + 10 * Math.sin(agora / 200) : 16;
    const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.strokeStyle = '#f6c64a'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(r.x, r.y + 20, r.w, r.h - 40, 40); g.fill(); g.stroke();
    g.restore();
    texto(g, txt, r.x + r.w / 2, r.y + r.h / 2 + 2, '#fff', txt.length > 12 ? 34 : 60, 'center');
  }

  desenharBotoes(g) {
    for (const [b, ic] of [[this.botaoSair(), '✕'], [this.botaoMudo(), som.mudo ? '🔇' : '🔊']]) {
      g.fillStyle = 'rgba(20,10,4,.7)'; g.strokeStyle = '#c8902a'; g.lineWidth = 3;
      g.beginPath(); g.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '28px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, b.x + b.w / 2, b.y + b.h / 2 + 2);
    }
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1100);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1100;
      g.globalAlpha = 1 - k * k;
      texto(g, t.txt, t.x, t.y - 50 * sai(k), t.cor, t.tam * (k < 0.15 ? volta(k / 0.15) : 1), 'center');
    }
    g.globalAlpha = 1;
  }

  desenharBanner(g, agora) {
    if (!this.banner) return;
    const k = (agora - this.banner.t0) / this.banner.dura;
    if (k >= 1) { this.banner = null; return; }
    g.save();
    g.translate(W / 2, 470);
    const s = k < 0.15 ? volta(k / 0.15) : 1;
    g.scale(s, s);
    g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(-W / 2, -60, W, 120);
    texto(g, this.banner.txt, 0, 0, this.banner.cor, Math.min(76, 1500 / Math.max(6, this.banner.txt.length)), 'center');
    g.restore();
  }
}

function texto(g, txt, x, y, cor, tam, alinha = 'center') {
  g.font = `900 ${tam}px Georgia, 'Times New Roman', serif`; g.textAlign = alinha; g.textBaseline = 'middle';
  g.lineWidth = Math.max(4, tam / 6); g.strokeStyle = 'rgba(20,8,2,.9)'; g.lineJoin = 'round';
  g.strokeText(txt, x, y);
  g.fillStyle = cor; g.fillText(txt, x, y);
}

function coracao(g, x, y, r, cor, borda) {
  g.save(); g.translate(x, y);
  g.beginPath();
  g.moveTo(0, r * 0.9);
  g.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.8, -r * 1.3, 0, -r * 0.45);
  g.bezierCurveTo(r * 0.8, -r * 1.3, r * 1.6, -r * 0.1, 0, r * 0.9);
  g.fillStyle = cor; g.fill();
  g.strokeStyle = borda; g.lineWidth = Math.max(1.5, r * 0.15); g.stroke();
  g.restore();
}
