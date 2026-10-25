import * as R from './regras.js';
import { destravar, som } from './som.js';
import SPR from './sprites.json';

// heróis: recortes de scripts/preparar-castelos.py (heroi-pose.webp), âncora no pé em sprites.json
const IMG = {};
for (const [k, url] of Object.entries(import.meta.glob('../../assets/castelos/*-*.webp', { eager: true, import: 'default' }))) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.webp$/, '')] = im;
}
const ALTURA_HEROI = 92;   // altura do herói parado no mundo

const { MUNDO, ALTURA: H, FW, TOPO, TORRE_TOPO, TORRE_L, BASE_H, ESTEIRA, RAIO_HEROI, HEROIS, PRATELEIRAS, RODADAS } = R;
const INFO = { canhoneiro: 'Foguete pesado', metralha: 'Rajada de 15 foguetinhos', bombardeiro: '4 balas de canhão', cavador: 'Fura a parede e explode dentro' };
const OX = 240, OY = 560, CW = 480, CH = 660;   // origem do castelo dentro do canvas dele
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Cliente de Castelos em Guerra: desenha o que o servidor manda e lê a mira.
 * Na minha vez: arrasto a partir do herói da vez e solto pra atirar (ou setas + espaço/FOGO).
 * Toda a arte é desenhada aqui (sem imagem): fachada, telhados, esteiras, heróis e tiros.
 */
export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.e = null;
    this.desvio = null;
    this.vistos = 0;
    this.gfx = [null, null];
    this.poses = new Map();   // `${lado}-${heroi}` -> { pose, ate }
    this.fx = [];
    this.textos = [];
    this.banner = null;
    this.tremor = 0;
    this.clarao = 0;
    this.mira = { a: 25, f: 0.7 };
    this.arrasto = null;
    this.teclas = new Set();
    this.cam = { x: 900, y: 600, z: 0.9 };
    this.segue = null;
    this.encerrado = false;
    this.chegou = performance.now();
    this.ultimoTique = 0;
    this.nuvens = Array.from({ length: 9 }, (_, k) => ({ x: Math.random() * 3400 - 200, y: 60 + (k % 3) * 70, r: 50 + Math.random() * 40 }));
    destravar();
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    const quadro = () => {
      if (!this.rodando) return;
      try { this.desenhar(); } catch (e) { console.error(e); }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); som.desligar(); }

  nome(i) { return (this.op.jogadores[i]?.name ?? `Jogador ${i + 1}`).split(' ')[0]; }
  agoraServ() { return performance.now() + (this.desvio ?? 0); }
  minhaVez() { const e = this.e; return !!e && !this.encerrado && !e.fim && e.fase === 'mira' && e.vez === this.eu; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    const novaVez = !this.e || this.e.vez !== e.vez || this.e.fase !== e.fase;
    this.e = e;
    if (!this.t || this.sementeT !== e.semente.join()) { this.t = R.terreno(e.semente); this.sementeT = e.semente.join(); }
    // mundo de consulta (prévia da mira): mesmo formato das regras
    this.p = {
      t: this.t,
      castelos: e.castelos.map((c, lado) => ({ x: c.x, ang: c.ang, baseY: c.baseY, lado, buracos: c.b, prox: c.prox,
        herois: c.h.map(([heroi, vida, max, x, y]) => ({ heroi, vida, max, x, y, oculto: x == null })) })),
    };
    this.p.castelos.forEach((c, i) => { this.gfx[i] ??= this.montar(c); });
    this.tiros = e.tiros.map(([x, y, vx, vy, heroi, cava]) => ({ x, y, vx, vy, heroi, cava }));
    this.tirosEm = agora;
    if (novaVez && this.minhaVez()) this.mira = { a: 25, f: 0.7 };
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.evento(ev); }
    if (e.fim && !this.encerrado) this.encerrar(e.fim);
  }

  evento(ev) {
    if (ev.tipo === 'tiro') {
      som.tiro(ev.heroi);
      this.poses.set(`${ev.de}-${ev.heroi}`, { pose: 'tiro', ate: performance.now() + 900 });
      const c = this.p.castelos[ev.de], h = c.herois.find((x) => x.heroi === ev.heroi);
      if (h && !h.oculto) { const m = R.centroHeroi(c, h); this.burst(m.x, m.y, 10, { v: 260, vida: 0.25, tam: 9, tipo: 'faisca', cores: ['#ffe27a', '#ff9a3c'], g: 0 }); }
    } else if (ev.tipo === 'boom') {
      const big = ev.raio / 60, cava = ev.heroi === 'cavador', metralha = ev.heroi === 'metralha';
      som.boom(big, cava);
      this.tremor = Math.min(24, (metralha ? 4 : 10) * big);
      this.clarao = metralha ? 0.08 : 0.3;
      this.fx.push({ x: ev.x, y: ev.y, vida: 0.32, max: 0.32, tam: ev.raio * 1.8, tipo: 'anel', vx: 0, vy: 0, g: 0 });
      this.burst(ev.x, ev.y, 22 * big, { v: 520 * big, vida: 0.5, tam: 14, tipo: 'faisca', cores: metralha ? ['#ffffff', '#fff4c0'] : ['#fff6c8', '#ffd04a', '#ff8a2b'], g: 300 });
      this.burst(ev.x, ev.y, 12 * big, { v: 160 * big, vida: 1.3, tam: 40 * big, tipo: 'fumaca', cores: ['#f2ede4cc', '#c8c0b4cc', '#8d857acc'], g: -50, sobe: 40 });
      this.burst(ev.x, ev.y, 12 * big, { v: 420, vida: 1.8, tam: 16, tipo: 'pedra', cores: ['#d8d1c4', '#b3ab9e', '#ece7de'], sobe: 260, g: 1100 });
    } else if (ev.tipo === 'dano') {
      som.dano();
      this.poses.set(`${ev.lado}-${ev.heroi}`, { pose: 'dano', ate: performance.now() + 700 });
      this.textos.push({ x: ev.x, y: ev.y - 40, txt: `-${ev.quanto}`, cor: ev.lado === this.eu ? '#ff6b5e' : '#fff', t0: performance.now() });
      this.burst(ev.x, ev.y, ev.morreu ? 40 : 14, { v: 380, vida: 1.4, tam: 7, tipo: 'sangue', cores: ['#d8262e', '#a3141c'], sobe: 160, g: 1100 });
      if (ev.morreu) this.anunciar(ev.lado === this.eu ? 'PERDEMOS UM HERÓI!' : 'HERÓI RIVAL ABATIDO!', ev.lado === this.eu ? '#ff8a7e' : '#ffd23d', 1600);
    } else if (ev.tipo === 'cava') {
      som.cava();
      this.burst(ev.x, ev.y, 18, { v: 260, vida: 0.9, tam: 10, tipo: 'pedra', cores: ['#b3ab9e', '#8d857a'], sobe: 120, g: 900 });
    } else if (ev.tipo === 'vez') {
      this.segue = null;
      if (ev.vez === this.eu) { som.vez(); this.anunciar(`SUA VEZ · ${HEROIS[ev.heroi].nome.toUpperCase()}`, '#ffd23d', 1400); }
      else this.anunciar(`VEZ DE ${this.nome(ev.vez).toUpperCase()}`, '#fff', 1200);
    } else if (ev.tipo === 'passou') this.anunciar(ev.vez === this.eu ? 'TEMPO ESGOTADO!' : `${this.nome(ev.vez).toUpperCase()} NÃO ATIROU`, '#fff', 1400);
    else if (ev.tipo === 'errou') this.anunciar('ERROU!', '#fff', 900);
  }

  encerrar(fim) {
    this.encerrado = true;
    this.arrasto = null;
    if (!fim) return;
    const ganhei = fim.vencedor === this.eu;
    if (fim.vencedor == null) this.anunciar('EMPATE!', '#fff', 3000);
    else this.anunciar(ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3400);
    if (ganhei) { som.vitoria(); navigator.vibrate?.([80, 60, 80, 60, 200]); } else som.derrota();
  }

  anunciar(txt, cor, dura) { this.banner = { txt, cor, t0: performance.now(), dura }; }

  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(o.v * 0.3, o.v), vida = rnd(o.vida * 0.5, o.vida);
      this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.sobe || 0), vida, max: vida, tam: rnd(o.tam * 0.5, o.tam), tipo: o.tipo, cor: o.cores[i % o.cores.length], rot: rnd(0, 6), vr: rnd(-8, 8), g: o.g ?? 700 });
    }
    if (this.fx.length > 1200) this.fx.splice(0, this.fx.length - 1200);
  }

  // ------------------------------------------------------- arte do castelo

  montar(c) {
    const tela = () => { const k = document.createElement('canvas'); k.width = CW; k.height = CH; return k; };
    const forma = (x) => {
      x.beginPath(); x.rect(-FW, TOPO, FW * 2, -TOPO);
      x.rect(-FW - 10, TORRE_TOPO, TORRE_L + 10, TOPO - TORRE_TOPO + 1); x.rect(FW - TORRE_L, TORRE_TOPO, TORRE_L + 10, TOPO - TORRE_TOPO + 1);
    };
    const r = (i) => ((Math.sin(i * 12.9898 + c.lado * 97 + 13) * 43758.5453) % 1 + 1) % 1;
    const fachada = tela(), f = fachada.getContext('2d');
    f.translate(OX, OY);
    forma(f); f.fillStyle = '#d8d1c4'; f.fill();
    f.save(); forma(f); f.clip();
    for (let i = 0; i < 90; i++) { f.fillStyle = r(i) > 0.5 ? '#b3ab9e' : '#ece7de'; f.beginPath(); f.roundRect(-FW + r(i + 99) * (FW * 2 - 30), TORRE_TOPO + 10 + r(i + 7) * 350, 24, 11, 4); f.fill(); }
    f.restore();
    f.fillStyle = '#0000001c'; f.fillRect(-FW + TORRE_L - 12, TOPO, 12, -TOPO); f.fillRect(FW - TORRE_L, TOPO, 12, -TOPO);
    f.strokeStyle = '#3a2d22'; f.lineWidth = 4;
    for (const x of [-FW + TORRE_L, FW - TORRE_L]) { f.beginPath(); f.moveTo(x, TOPO); f.lineTo(x, 0); f.stroke(); }
    f.fillStyle = '#ece7de';
    for (const x0 of [-FW - 10, FW - TORRE_L]) { f.fillRect(x0, TORRE_TOPO, TORRE_L + 10, 26); f.strokeRect(x0, TORRE_TOPO, TORRE_L + 10, 26); }
    for (let x = -FW + TORRE_L + 8; x < FW - TORRE_L - 20; x += 34) { f.fillRect(x, TOPO - 18, 22, 20); f.strokeRect(x, TOPO - 18, 22, 20); }
    for (const [x, y] of [[-FW + TORRE_L / 2 - 4, -270], [FW - TORRE_L / 2 + 4, -270], [-FW + TORRE_L / 2 - 4, -130], [FW - TORRE_L / 2 + 4, -130]]) {
      f.fillStyle = '#2b2125'; f.beginPath(); f.moveTo(x - 17, y + 40); f.lineTo(x - 17, y); f.arc(x, y, 17, Math.PI, 0); f.lineTo(x + 17, y + 40); f.closePath(); f.fill(); f.stroke();
      f.fillStyle = '#ece7de'; f.fillRect(x - 22, y + 38, 44, 8); f.strokeRect(x - 22, y + 38, 44, 8);
    }
    forma(f); f.lineWidth = 6; f.stroke();
    // telhados cônicos com telhas
    const [cor, escura] = c.lado === this.eu ? ['#3d7fc4', '#2a5a8f'] : ['#d2463c', '#962c25'];
    for (const x0 of [-FW - 10, FW - TORRE_L]) {
      const l = x0 - 10, rr = x0 + TORRE_L + 20, base = TORRE_TOPO + 4, topo = TORRE_TOPO - 150, meio = (l + rr) / 2;
      f.beginPath(); f.moveTo(l, base); f.lineTo(meio, topo); f.lineTo(rr, base); f.quadraticCurveTo(meio, base + 14, l, base); f.closePath();
      f.fillStyle = cor; f.fill();
      f.save(); f.clip(); f.strokeStyle = escura; f.lineWidth = 3;
      for (let k = 1; k < 6; k++) { const y = topo + (base - topo) * k / 6; f.beginPath(); f.moveTo(l, y + 6); f.quadraticCurveTo(meio, y + 14, rr, y + 6); f.stroke(); }
      f.fillStyle = '#ffffff22'; f.beginPath(); f.moveTo(meio, topo); f.lineTo(meio - 18, base); f.lineTo(meio - 40, base); f.closePath(); f.fill();
      f.restore();
      f.strokeStyle = '#2a1d14'; f.lineWidth = 5; f.beginPath(); f.moveTo(l, base); f.lineTo(meio, topo); f.lineTo(rr, base); f.quadraticCurveTo(meio, base + 14, l, base); f.stroke();
    }
    // base de madeira com portas em arco
    f.fillStyle = '#c47a3a'; f.strokeStyle = '#3a2416'; f.lineWidth = 5;
    f.beginPath(); f.roundRect(-FW - 16, 0, FW * 2 + 32, BASE_H, [4, 4, 22, 22]); f.fill(); f.stroke();
    f.fillStyle = '#9b5a28'; f.fillRect(-FW - 12, 42, FW * 2 + 24, 6);
    for (const x of [-40, 40]) {
      f.fillStyle = '#d8913f'; f.beginPath(); f.moveTo(x - 26, BASE_H - 6); f.lineTo(x - 26, 30); f.arc(x, 30, 26, Math.PI, 0); f.lineTo(x + 26, BASE_H - 6); f.fill(); f.stroke();
      f.beginPath(); f.moveTo(x, 6); f.lineTo(x, BASE_H - 6); f.stroke();
    }
    // silhueta (o meu castelo na minha vez) e interior
    const sil = tela(), s = sil.getContext('2d');
    s.drawImage(fachada, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#0d0b10'; s.fillRect(0, 0, CW, CH);
    const dentro = tela(), n = dentro.getContext('2d');
    n.translate(OX, OY);
    forma(n); n.fillStyle = '#2e2b35'; n.fill();
    n.save(); forma(n); n.clip(); n.strokeStyle = '#3d3946'; n.lineWidth = 2;
    for (let y = TORRE_TOPO; y < 0; y += 18) for (let x = -FW - 10 + ((y / 18) % 2 ? 20 : 0); x < FW + 10; x += 40) n.strokeRect(x, y, 40, 18);
    n.restore();
    for (const L of PRATELEIRAS) {
      n.fillStyle = '#9a6235'; n.strokeStyle = '#3a2416'; n.lineWidth = 3; n.fillRect(L.x, L.y, L.w, 14); n.strokeRect(L.x, L.y, L.w, 14);
      n.fillStyle = '#6b3f1f'; for (let x = L.x + 10; x < L.x + L.w; x += 40) n.fillRect(x, L.y + 5, 4, 4);
    }
    return { fachada, sil, dentro, buracos: 0 };
  }

  /** Buraco novo apaga a fachada (borda queimada) — só acima da base. */
  furar(i) {
    const k = this.gfx[i], bs = this.p.castelos[i].buracos;
    for (; k.buracos < bs.length; k.buracos++) {
      const [bx, by, br] = bs[k.buracos];
      for (const tela of [k.fachada, k.sil]) {
        const x = tela.getContext('2d');
        x.save(); x.setTransform(1, 0, 0, 1, OX, OY); x.beginPath(); x.rect(-OX, -OY, CW, OY); x.clip();
        const borda = (r) => { x.beginPath(); for (let j = 0; j < 18; j++) { const a = j / 18 * Math.PI * 2, q = r * (0.82 + Math.random() * 0.3); x[j ? 'lineTo' : 'moveTo'](bx + Math.cos(a) * q, by + Math.sin(a) * q); } x.closePath(); };
        if (tela === k.fachada) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#2a1d16b0'; borda(br + 12); x.fill(); }
        x.globalCompositeOperation = 'destination-out'; borda(br); x.fill();
        x.restore();
      }
    }
  }

  // ------------------------------------------------------------- entrada

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiro(ev),
      move: (ev) => { if (this.arrasto && this.minhaVez()) this.arrasto.d = this.mirarEm(this.paraMundo(this.paraVirtual(ev.clientX, ev.clientY))); },
      sobe: () => { if (this.arrasto && this.arrasto.d > 50 && this.minhaVez()) this.atirar(); this.arrasto = null; },
      tecla: (ev) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault();
        this.teclas.add(ev.key);
        if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { destravar(); this.atirar(); }
      },
      solta: (ev) => this.teclas.delete(ev.key),
      foco: () => { this.teclas.clear(); this.arrasto = null; },
      resize: () => this.redimensionar(),
      menu: (ev) => ev.preventDefault(),
      toque: () => destravar(),   // iOS só libera o áudio no fim do toque
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('pointerup', this.h.sobe);
    addEventListener('pointercancel', this.h.foco);
    addEventListener('keydown', this.h.tecla);
    addEventListener('keyup', this.h.solta);
    addEventListener('blur', this.h.foco);
    addEventListener('resize', this.h.resize);
    this.canvas.addEventListener('contextmenu', this.h.menu);
    addEventListener('touchend', this.h.toque);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('pointerup', this.h.sobe);
    removeEventListener('pointercancel', this.h.foco);
    removeEventListener('keydown', this.h.tecla);
    removeEventListener('keyup', this.h.solta);
    removeEventListener('blur', this.h.foco);
    removeEventListener('resize', this.h.resize);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
    removeEventListener('touchend', this.h.toque);
  }

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
  escala() { return this.k * this.cam.z; }
  paraMundo(v) { const s = this.escala(); return { x: (v.x - this.vw / 2) / s + this.cam.x, y: (v.y - this.vh / 2) / s + this.cam.y }; }

  ponteiro(ev) {
    destravar();
    ev.preventDefault();
    const v = this.paraVirtual(ev.clientX, ev.clientY);
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(this.B.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(this.B.mudo)) { som.alternarMudo(); return; }
    if (dentro(this.B.fogo)) { this.atirar(); return; }
    if (!this.minhaVez()) return;
    this.arrasto = { d: this.mirarEm(this.paraMundo(v)) };
  }

  /** Mira = direção do herói da vez até o dedo; força = distância. Devolve a distância em pixels de tela. */
  mirarEm(m) {
    const c = this.p.castelos[this.eu], h = R.daVez({ castelos: this.p.castelos }, this.eu);
    if (!h) return 0;
    const o = R.centroHeroi(c, h), dx = (m.x - o.x) * R.lado(c), dy = o.y - m.y, d = Math.hypot(dx, dy);
    this.mira = { a: Math.max(-60, Math.min(85, Math.atan2(dy, Math.max(1, dx)) * 180 / Math.PI)), f: Math.max(0.15, Math.min(1, d / (420 / this.cam.z))) };
    return d * this.escala();
  }

  atirar() {
    if (!this.minhaVez() || this.enviado === this.e.prazo) return;
    this.enviado = this.e.prazo;   // um tiro por vez, mesmo com toque duplo
    this.arrasto = null;
    this.op.onEntrada({ fogo: { a: Math.round(this.mira.a * 10) / 10, f: Math.round(this.mira.f * 1000) / 1000 } });
  }

  // ------------------------------------------------------------- desenho

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    this.girado = h > w * 1.05;
    this.vw = this.girado ? h : w;
    this.vh = this.girado ? w : h;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.k = Math.min(this.vh / H, this.vw / 1100);
    const s = 42, b = Math.max(56, Math.min(80, this.vh * 0.13));
    this.B = {
      sair: { x: this.vw - s - 8, y: 8, w: s, h: s }, mudo: { x: this.vw - (s + 8) * 2, y: 8, w: s, h: s },
      fogo: { x: this.vw - b * 2.1 - 12, y: this.vh - b - 22, w: b * 2.1, h: b },
    };
  }

  camera(dt) {
    const e = this.e, vivo = this.tirosVistos?.[0];
    let tx, ty, tz;
    if (vivo) { this.segue = { x: vivo.x, y: vivo.y }; tx = vivo.x; ty = Math.min(vivo.y, 700); tz = 0.85; }
    else if (e.fase === 'assenta' && this.segue) { tx = this.segue.x; ty = Math.min(this.segue.y, 700); tz = 0.95; }
    else {
      const i = e.fim ? (e.fim.vencedor == null ? this.eu : 1 - e.fim.vencedor) : e.fase === 'contagem' ? this.eu : e.vez;
      const c = this.p.castelos[i];
      tx = c.x + R.lado(c) * 330; ty = c.baseY - 140; tz = 0.9;
    }
    const meia = this.vw / 2 / (this.k * this.cam.z);
    tx = Math.max(meia, Math.min(MUNDO - meia, tx));
    const k = Math.min(1, dt * (vivo ? 5 : 2.5));
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; this.cam.z += (tz - this.cam.z) * k;
  }

  desenhar() {
    const g = this.g, e = this.e, agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    if (!this.encerrado && !this.travou && e && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }
    const base = g.getTransform();
    this.ceu(g, agora);
    if (!e) { this.aviso(g, 'Montando os castelos…'); return; }
    // teclado: setas mexem na mira
    if (this.minhaVez()) {
      const up = this.teclas.has('ArrowUp') - this.teclas.has('ArrowDown'), lr = this.teclas.has('ArrowRight') - this.teclas.has('ArrowLeft');
      if (up || lr) this.mira = { a: Math.max(-60, Math.min(85, this.mira.a + up * 40 * dt)), f: Math.max(0.15, Math.min(1, this.mira.f + lr * 0.45 * dt)) };
      const falta = Math.ceil((e.prazo - this.agoraServ()) / 1000);
      if (falta <= 5 && falta > 0 && falta !== this.ultimoTique) { this.ultimoTique = falta; som.tique(); }
    }
    // tiros: extrapola desde o último estado (chega a cada 50 ms)
    const s = Math.min(0.1, (agora - this.tirosEm) / 1000);
    this.tirosVistos = this.encerrado ? [] : this.tiros.map((b) => ({ ...b, x: b.x + b.vx * s, y: b.y + b.vy * s }));
    this.camera(dt);
    const esc = this.escala(), tx = (Math.random() - 0.5) * this.tremor, ty = (Math.random() - 0.5) * this.tremor;
    g.setTransform(base.multiply(new DOMMatrix([esc, 0, 0, esc, this.vw / 2 - this.cam.x * esc + tx, this.vh / 2 - this.cam.y * esc + ty])));
    this.morros(g);
    this.chao(g);
    this.p.castelos.forEach((c, i) => this.castelo(g, c, i, agora));
    this.previa(g);
    this.balas(g);
    this.particulas(g, dt);
    this.numeros(g, agora);
    g.setTransform(base);
    this.tremor = Math.max(0, this.tremor - dt * 40);
    if (this.clarao > 0) { g.fillStyle = `rgba(255,245,215,${this.clarao * 0.5})`; g.fillRect(0, 0, this.vw, this.vh); this.clarao = Math.max(0, this.clarao - dt * 2); }
    this.hud(g, agora);
  }

  ceu(g, agora) {
    const gr = g.createLinearGradient(0, 0, 0, this.vh);
    gr.addColorStop(0, '#5fb4d6'); gr.addColorStop(0.7, '#b9e3e0'); gr.addColorStop(1, '#d9efd0');
    g.fillStyle = gr; g.fillRect(0, 0, this.vw, this.vh);
    const px = this.cam.x * this.k * 0.05;
    g.fillStyle = '#ffffffd0';
    for (const n of this.nuvens) {
      const x = ((n.x + agora * 0.006 - px) % (this.vw + 400) + this.vw + 400) % (this.vw + 400) - 200, y = n.y * this.k;
      for (const [dx, dy, r] of [[0, 0, 1], [0.7, 0.15, 0.7], [-0.7, 0.18, 0.65], [0.3, -0.35, 0.6]]) { g.beginPath(); g.arc(x + dx * n.r * this.k, y + dy * n.r * this.k, r * n.r * this.k, 0, Math.PI * 2); g.fill(); }
    }
  }

  /** Montanhas e pinheiros em camadas (paralaxe), no espaço do mundo. */
  morros(g) {
    const camadas = [[0.35, '#8fc7c2', 560, 140, 0.0021], [0.6, '#6fae9a', 680, 90, 0.0034]];
    const meia = this.vw / 2 / this.escala();
    for (const [pr, cor, y0, amp, fr] of camadas) {
      const desl = this.cam.x * (1 - pr);
      g.fillStyle = cor; g.beginPath(); g.moveTo(this.cam.x - meia - 50, H + 200);
      for (let x = this.cam.x - meia - 50; x <= this.cam.x + meia + 50; x += 20) {
        const u = x - desl;
        g.lineTo(x, y0 - amp * (0.6 * Math.abs(Math.sin(u * fr)) + 0.4 * Math.abs(Math.sin(u * fr * 2.7 + 1))));
      }
      g.lineTo(this.cam.x + meia + 50, H + 200); g.closePath(); g.fill();
    }
    g.fillStyle = '#3f8a68';
    for (let x = Math.floor((this.cam.x - meia) / 90) * 90; x < this.cam.x + meia + 90; x += 90) {
      const y = R.chao(this.t, x) - 10, h = 60 + ((x * 7919) % 50);
      g.beginPath(); g.moveTo(x - 22, y); g.lineTo(x, y - h); g.lineTo(x + 22, y); g.closePath(); g.fill();
    }
  }

  chao(g) {
    const meia = this.vw / 2 / this.escala(), x0 = Math.max(0, this.cam.x - meia - 20), x1 = Math.min(MUNDO, this.cam.x + meia + 20);
    g.beginPath(); g.moveTo(x0, H + 600);
    for (let x = x0; x <= x1; x += 8) g.lineTo(x, R.chao(this.t, x));
    g.lineTo(x1, H + 600); g.closePath();
    const gr = g.createLinearGradient(0, 840, 0, H + 200); gr.addColorStop(0, '#6b4a2f'); gr.addColorStop(1, '#2b1d14');
    g.fillStyle = gr; g.fill();
    g.lineJoin = 'round';
    for (const [lw, cor, dy] of [[34, '#3f8a2f', 6], [22, '#69c23f', 0]]) {
      g.strokeStyle = cor; g.lineWidth = lw; g.beginPath();
      for (let x = x0; x <= x1; x += 8) g[x === x0 ? 'moveTo' : 'lineTo'](x, R.chao(this.t, x) + dy);
      g.stroke();
    }
  }

  /** Herói com o pé em (0,0). `lado` escolhe a pose temporária (tiro/dano); null = só parado (HUD). */
  heroi(g, heroi, vida, max, olha, ativo, agora, lado = null) {
    const m = SPR[heroi], r = RAIO_HEROI;
    const tmp = lado != null && this.poses.get(`${lado}-${heroi}`);
    const pose = vida <= 0 ? 'caido' : tmp && tmp.ate > agora ? tmp.pose : ativo ? 'mira' : 'parado';
    const im = IMG[`${heroi}-${pose}`];
    if (m && im?.complete && im.naturalWidth) {
      const k = ALTURA_HEROI / m.alt, pula = vida > 0 && pose === 'parado' ? Math.sin(agora / 300 + heroi.length) * 1.5 : 0;
      g.save(); g.scale(olha, 1);
      g.drawImage(im, -m.pe[0] * k, -m.pe[1] * k + pula, m.w * k, m.h * k);
      g.restore();
    } else {   // imagem ainda carregando: bolinha na cor do herói
      g.fillStyle = HEROIS[heroi].cor; g.beginPath(); g.arc(0, -r, r, 0, Math.PI * 2); g.fill();
    }
    if (vida <= 0) return;
    const topo = -ALTURA_HEROI - 14;
    g.fillStyle = '#0009'; g.fillRect(-28, topo, 56, 9);
    g.fillStyle = vida / max > 0.4 ? '#6be06a' : '#ff6b5e'; g.fillRect(-27, topo + 1, 54 * vida / max, 7);
    if (ativo) {
      const y = topo - 22 + Math.sin(agora / 160) * 5;
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath();
      g.moveTo(-10, y - 14); g.lineTo(10, y - 14); g.lineTo(10, y - 4); g.lineTo(16, y - 4); g.lineTo(0, y + 10); g.lineTo(-16, y - 4); g.lineTo(-10, y - 4); g.closePath(); g.fill(); g.stroke();
    }
  }

  castelo(g, c, i, agora) {
    this.furar(i);
    const k = this.gfx[i], e = this.e, revela = i === this.eu && this.minhaVez();
    const ativo = e.fase === 'mira' && e.vez === i ? R.daVez({ castelos: this.p.castelos }, i) : null;
    g.save(); g.translate(c.x, c.baseY); g.rotate(c.ang);
    // esteiras
    for (const sx of [-1, 1]) {
      g.fillStyle = '#3a3532'; g.strokeStyle = '#141110'; g.lineWidth = 5;
      g.beginPath(); g.roundRect(sx * ESTEIRA - 80, BASE_H - 12, 160, 62, 30); g.fill(); g.stroke();
      g.setLineDash([6, 6]); g.strokeStyle = '#d9d2c6'; g.lineWidth = 3; g.beginPath(); g.roundRect(sx * ESTEIRA - 74, BASE_H - 6, 148, 50, 25); g.stroke(); g.setLineDash([]);
      for (const wx of [-44, 0, 44]) {
        g.save(); g.translate(sx * ESTEIRA + wx, BASE_H + 19); g.rotate(c.x / 20);
        g.fillStyle = '#c98a3a'; g.strokeStyle = '#3a2416'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(-15, 0); g.lineTo(15, 0); g.moveTo(0, -15); g.lineTo(0, 15); g.stroke();
        g.restore();
      }
    }
    if (revela) {
      g.drawImage(k.sil, -OX, -OY);
      g.save(); g.beginPath(); g.rect(-FW + 12, TORRE_TOPO + 30, FW * 2 - 24, -TORRE_TOPO - 36); g.clip(); g.drawImage(k.dentro, -OX, -OY); g.restore();
    } else g.drawImage(k.dentro, -OX, -OY);
    for (const h of c.herois) {
      if (h.oculto) continue;
      g.save(); g.translate(h.x, h.y); this.heroi(g, h.heroi, h.vida, h.max, R.lado(c), revela && h === ativo, agora, i); g.restore();
    }
    if (!revela) g.drawImage(k.fachada, -OX, -OY);
    g.restore();
  }

  previa(g) {
    if (!this.minhaVez()) return;
    const h = R.daVez({ castelos: this.p.castelos }, this.eu);
    if (!h) return;
    const b = R.lancar(this.p, this.eu, this.mira.a, this.mira.f)[0];
    g.fillStyle = '#fff';
    for (let k = 0; k < 40; k++) {   // só o começo do arco
      if (R.avancar(this.p, b, 1 / 60)) break;
      if (k % 3 === 0) { g.globalAlpha = 1 - k / 45; g.beginPath(); g.arc(b.x, b.y, 6 - k / 10, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
  }

  balas(g) {
    for (const b of this.tirosVistos) {
      if (b.cava) continue;   // dentro da parede/terra
      const a = Math.atan2(b.vy, b.vx), atras = 22;
      const fogo = b.heroi === 'canhoneiro' || b.heroi === 'bombardeiro';
      this.fx.push({ x: b.x - Math.cos(a) * atras, y: b.y - Math.sin(a) * atras, vx: rnd(-12, 12), vy: rnd(-12, 12), vida: 0.7, max: 0.7, tam: b.heroi === 'metralha' ? 9 : 16, tipo: 'rastro', cor: fogo ? '#8f857a' : '#c9c4bb', g: -20 });
      if (fogo) this.fx.push({ x: b.x - Math.cos(a) * atras, y: b.y - Math.sin(a) * atras, vx: 0, vy: 0, vida: 0.15, max: 0.15, tam: 14, tipo: 'brasa', cor: '#ffb347', g: 0 });
      g.save(); g.translate(b.x, b.y); g.rotate(a);
      g.strokeStyle = '#1a1410'; g.lineWidth = 3;
      if (b.heroi === 'canhoneiro' || b.heroi === 'metralha') {   // foguete: corpo, bico, aletas
        const s = b.heroi === 'canhoneiro' ? 1 : 0.6;
        g.scale(s, s);
        g.fillStyle = '#9aa3a8'; g.beginPath(); g.moveTo(-28, -16); g.lineTo(-14, -6); g.lineTo(-14, 6); g.lineTo(-28, 16); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#e0392e'; g.beginPath(); g.roundRect(-24, -9, 34, 18, 6); g.fill(); g.stroke();
        g.fillStyle = '#e0392e'; g.beginPath(); g.moveTo(10, -9); g.quadraticCurveTo(30, 0, 10, 9); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#c9ced1'; g.fillRect(-4, -9, 7, 18); g.strokeRect(-4, -9, 7, 18);
      } else if (b.heroi === 'bombardeiro') {
        g.fillStyle = '#2d2f33'; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#ffffff66'; g.beginPath(); g.arc(-4, -4, 5, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = '#a9a39a'; g.beginPath(); g.moveTo(26, 0); g.lineTo(6, -11); g.lineTo(-16, -8); g.lineTo(-24, 0); g.lineTo(-14, 9); g.lineTo(8, 10); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = '#6f6a63'; g.beginPath(); g.moveTo(-10, -4); g.lineTo(8, 2); g.stroke();
      }
      g.restore();
    }
  }

  particulas(g, dt) {
    for (const p of this.fx) {
      p.vida -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot ?? 0) + (p.vr ?? 0) * dt;
      if ((p.tipo === 'pedra' || p.tipo === 'sangue') && p.y > R.chao(this.t, p.x) + 4) { p.y = R.chao(this.t, p.x) + 4; p.vy *= -0.25; p.vx *= 0.5; p.vr *= 0.5; }
      const k = Math.max(0, p.vida / p.max);
      g.globalAlpha = Math.min(1, k * 1.6);
      if (p.tipo === 'anel') { g.strokeStyle = '#fff'; g.lineWidth = 12 * k; g.beginPath(); g.arc(p.x, p.y, p.tam * (1 - k * k), 0, Math.PI * 2); g.stroke(); }
      else if (p.tipo === 'fumaca' || p.tipo === 'rastro') { g.fillStyle = p.cor; g.beginPath(); g.arc(p.x, p.y, p.tam * (p.tipo === 'rastro' ? 0.6 + (1 - k) : 1.6 - k * 0.6), 0, Math.PI * 2); g.fill(); }
      else if (p.tipo === 'brasa') { g.fillStyle = p.cor; g.beginPath(); g.arc(p.x, p.y, p.tam * k, 0, Math.PI * 2); g.fill(); }
      else if (p.tipo === 'pedra') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.cor; g.strokeStyle = '#2a1d14'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-p.tam / 2, -p.tam / 3); g.lineTo(p.tam / 3, -p.tam / 2); g.lineTo(p.tam / 2, p.tam / 3); g.lineTo(-p.tam / 4, p.tam / 2); g.closePath(); g.fill(); g.stroke(); g.restore();
      } else { g.fillStyle = p.cor; g.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam); }
    }
    g.globalAlpha = 1;
    this.fx = this.fx.filter((p) => p.vida > 0);
  }

  numeros(g, agora) {
    g.textAlign = 'center'; g.font = '900 40px system-ui, sans-serif'; g.lineWidth = 7; g.strokeStyle = '#1a1410';
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1300;
      g.globalAlpha = Math.max(0, 1 - k * k);
      g.strokeText(t.txt, t.x, t.y - k * 80); g.fillStyle = t.cor; g.fillText(t.txt, t.x, t.y - k * 80);
    }
    g.globalAlpha = 1;
    this.textos = this.textos.filter((t) => agora - t.t0 < 1300);
  }

  aviso(g, txt) {
    g.fillStyle = '#fff'; g.font = '800 22px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(txt, this.vw / 2, this.vh / 2);
  }

  painel(g, x, y, w, h) {
    g.fillStyle = '#2a1d14cc'; g.strokeStyle = '#000a'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); g.stroke();
  }

  time(g, i, x, y, alinhaDir, agora) {
    const c = this.p.castelos[i], ativo = this.e.fase === 'mira' && this.e.vez === i ? R.daVez({ castelos: this.p.castelos }, i) : null;
    const w = 26 + c.herois.length * 58, x0 = alinhaDir ? x - w : x;
    this.painel(g, x0, y, w, 78);
    g.fillStyle = '#fff4dc'; g.font = '900 12px system-ui, sans-serif'; g.textAlign = alinhaDir ? 'right' : 'left';
    g.fillText(i === this.eu ? 'VOCÊ' : this.nome(i).toUpperCase(), alinhaDir ? x0 + w - 12 : x0 + 12, y + 18);
    c.herois.forEach((h, k) => {
      const hx = x0 + 13 + k * 58 + 29;
      if (h === ativo) { g.strokeStyle = '#ffd23d'; g.lineWidth = 3; g.beginPath(); g.roundRect(hx - 27, y + 24, 54, 50, 8); g.stroke(); }
      g.save(); g.translate(hx, y + 74); g.scale(0.36, 0.36); this.heroi(g, h.heroi, h.vida, h.max, i === 0 ? 1 : -1, false, agora); g.restore();
    });
  }

  hud(g, agora) {
    const e = this.e, B = this.B;
    // cada painel do lado do seu castelo (assento 0 à esquerda)
    this.time(g, 0, 10, 10, false, agora);
    this.time(g, 1, this.vw - (42 + 8) * 2 - 6, 10, true, agora);
    // centro: de quem é a vez, relógio, rodada
    const falta = Math.max(0, Math.ceil((e.prazo - this.agoraServ()) / 1000));
    const txt = e.fim ? (e.fim.vencedor == null ? 'Empate' : e.fim.vencedor === this.eu ? 'Vitória!' : 'Derrota')
      : e.fase === 'contagem' ? `Começa em ${falta}` : e.fase === 'voo' ? 'Disparo!' : e.fase === 'assenta' ? '…'
      : e.vez === this.eu ? `Sua vez · ${falta}s` : `Vez de ${this.nome(e.vez)} · ${falta}s`;
    const cw = Math.min(260, this.vw * 0.3), cx = this.vw / 2 - cw / 2;
    if (this.vw > 640) {
      this.painel(g, cx, 10, cw, 52);
      g.textAlign = 'center'; g.fillStyle = e.fase === 'mira' && falta <= 5 ? '#ff8a7e' : '#fff4dc';
      g.font = '900 18px system-ui, sans-serif'; g.fillText(txt, this.vw / 2, 33);
      g.fillStyle = '#c9b9a3'; g.font = '700 12px system-ui, sans-serif'; g.fillText(`Rodada ${Math.min(e.rodada, RODADAS)} de ${RODADAS}`, this.vw / 2, 52);
    } else {   // celular deitado e estreito: o texto vai embaixo
      g.textAlign = 'center'; g.font = '900 16px system-ui, sans-serif'; g.lineWidth = 5; g.strokeStyle = '#000a';
      g.strokeText(txt, this.vw / 2, this.vh - 20); g.fillStyle = '#fff4dc'; g.fillText(txt, this.vw / 2, this.vh - 20);
    }
    // botões
    for (const [r, t] of [[B.sair, '✕'], [B.mudo, som.mudo ? '🔇' : '🔊']]) {
      this.painel(g, r.x, r.y, r.w, r.h);
      g.fillStyle = '#fff'; g.font = '700 18px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(t, r.x + r.w / 2, r.y + r.h / 2 + 6);
    }
    // herói da vez + FOGO (só na minha vez)
    if (this.minhaVez()) {
      const h = R.daVez({ castelos: this.p.castelos }, this.eu);
      if (h) {
        this.painel(g, 10, this.vh - 72, 230, 62);
        g.save(); g.translate(42, this.vh - 14); g.scale(0.5, 0.5); this.heroi(g, h.heroi, h.vida, h.max, 1, false, agora); g.restore();
        g.textAlign = 'left'; g.fillStyle = '#fff4dc'; g.font = '900 17px system-ui, sans-serif'; g.fillText(HEROIS[h.heroi].nome, 76, this.vh - 46);
        g.fillStyle = '#c9b9a3'; g.font = '700 11px system-ui, sans-serif'; g.fillText(INFO[h.heroi], 76, this.vh - 28);
      }
      const r = B.fogo;
      const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h); gr.addColorStop(0, '#ff7a5c'); gr.addColorStop(1, '#c7372b');
      g.fillStyle = gr; g.strokeStyle = '#2a1d14'; g.lineWidth = 3; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 14); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 24px system-ui, sans-serif'; g.fillText('FOGO!', r.x + r.w / 2, r.y + r.h / 2 + 8);
      g.font = '700 12px system-ui, sans-serif'; g.fillStyle = '#fff4dc';
      g.fillText(`${Math.round(this.mira.a)}° · ${Math.round(this.mira.f * 100)}%`, r.x + r.w / 2, r.y + r.h + 15);
      if (!this.arrasto && e.fase === 'mira') { g.fillStyle = '#ffffffcc'; g.font = '700 13px system-ui, sans-serif'; g.fillText('Arraste a partir do herói e solte para atirar', this.vw / 2, this.vh - 92); }
    }
    // faixa de anúncio
    const b = this.banner;
    if (b) {
      const k = (agora - b.t0) / b.dura;
      if (k > 1) this.banner = null;
      else {
        const sz = Math.min(56, this.vw / 14);
        g.globalAlpha = k < 0.1 ? k * 10 : k > 0.8 ? (1 - k) * 5 : 1;
        g.textAlign = 'center'; g.font = `900 ${sz}px system-ui, sans-serif`; g.lineWidth = 8; g.strokeStyle = '#2a1d14';
        g.strokeText(b.txt, this.vw / 2, this.vh * 0.32); g.fillStyle = b.cor; g.fillText(b.txt, this.vw / 2, this.vh * 0.32);
        g.globalAlpha = 1;
      }
    }
  }
}
