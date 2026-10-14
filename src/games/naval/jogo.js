import { N, FROTA, TEMPO_TIRO, casasDe, validarFrota, frotaAleatoria } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles da Batalha Naval (canvas 2D). O servidor
 * arbitra e esconde a frota do outro; aqui chega o estado de cada um
 * (regras.js estadoPara) e o último tiro (`ultima`), que é animado.
 *
 * O que é daqui:
 *  - oceano vivo (ondas passando, gaivotas, aviões cruzando de vez em quando);
 *  - os dois tabuleiros: o meu (azul, com a frota) e o do adversário
 *    (vermelho, com sonar varrendo na minha vez). Em pé o tabuleiro que
 *    importa fica grande e o outro vai pro canto; deitado, lado a lado;
 *  - posicionar: arrasta o navio, toca pra girar, sorteia de novo, pronto;
 *  - o tiro: clarão do canhão, a bala voando em arco (cresce no meio do voo,
 *    com a sombra no mar), e no impacto o esguicho (água) ou a explosão
 *    (acerto) — o resultado só aparece quando a bala chega;
 *  - acerto fica pegando fogo e soltando fumaça; afundou, o navio aparece
 *    afundando quadro a quadro (os quadros da folha) e o locutor avisa.
 */

const A = import.meta.glob('../../assets/naval/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const LETRAS = 'ABCDEFGHIJ';
const NOME = Object.fromEntries(FROTA.map((n) => [n.id, n.nome]));
const TAM = Object.fromEntries(FROTA.map((n) => [n.id, n.tam]));
const SPRITE = { porta: 'grande', encouracado: 'medio', cruzador: 'cruzador', submarino: 'submarino', contra1: 'contra', contra2: 'contra' };
const QUEIMADO = { porta: 'grande-fogo', encouracado: 'medio-fogo', cruzador: 'medio-fogo', submarino: 'submarino-dano', contra1: 'medio-fogo', contra2: 'medio-fogo' };
const AFUNDA = {
  porta: ['grande-afunda-0', 'grande-afunda-1', 'grande-afunda-2', 'grande-afunda-3'],
  submarino: ['submarino-explode-0', 'submarino-explode-1'],
};
const AFUNDA_MEDIO = ['medio-afunda-0', 'medio-afunda-1', 'medio-afunda-2', 'medio-afunda-3'];
const VOO = 850;          // ms da bala no ar
const IMPACTO = 700;
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const coord = (casa) => `${LETRAS[casa % N]}${Math.floor(casa / N) + 1}`;

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
    this.frota = null;           // a minha, editável enquanto posiciona
    this.enviei = false;         // mandei "pronto"
    this.arrasto = null;
    this.sel = null;             // casa mirada no tabuleiro do outro
    this.aguardando = false;     // atirei, esperando o servidor
    this.animas = [];            // tiros voando / explodindo
    this.ocultas = new Set();    // 'dei:12' / 'levei:40': resultado escondido até a bala chegar
    this.navioOculto = new Set();
    this.afundando = [];
    this.particulas = [];
    this.textos = [];
    this.banner = null;
    this.tremor = 0;
    this.foco = 'minha';
    this.focoK = 0;              // 0 = meu tabuleiro grande, 1 = o do outro grande
    this.espiando = 0;           // toquei no mini: mostra o outro por um tempo
    this.vezAntes = null;
    this.ultimoBip = null;
    this.avioes = [];
    this.proxAviao = performance.now() + 6000 + Math.random() * 8000;
    this.gaivotas = Array.from({ length: 5 }, () => this.novaGaivota(Math.random()));
    this.encerrado = false;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });
    this.mouse = null;
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
    window.speechSynthesis?.cancel();
  }

  nome(i) { return (this.op.jogadores[i]?.name ?? (i === this.eu ? 'Você' : 'Adversário')).split(' ')[0]; }
  get outro() { return 1 - this.eu; }
  agoraServ() { return Date.now() + this.offset; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const antes = this.e;
    this.offset = e.agora - Date.now();
    this.e = e;
    this.aguardando = false;
    if (e.fase === 'posicionar') {
      if (!this.frota || (!this.arrasto && !this.enviei && !antes)) this.frota = e.minhaFrota.map((n) => ({ ...n }));
      if (e.pronto?.[this.eu]) this.enviei = true;
    } else this.frota = e.minhaFrota;
    const u = e.ultima;
    if (u?.tipo === 'batalha' && antes?.fase !== 'batalha') {
      som.buzina();
      this.anunciar('À BATALHA!', '#ffd23d', 1600);
      som.fala('À batalha!');
    }
    if (u?.tipo === 'tiro' && antes) {
      const chave = u.de === this.eu ? 'dei' : 'levei';
      if (antes[chave][u.casa] === '.') this.disparar(u, chave);
    }
    if (u?.tipo === 'ausente') this.anunciar(u.de === this.eu ? 'VOCÊ PAROU DE JOGAR' : `${this.nome(u.de).toUpperCase()} PAROU DE JOGAR`, '#ff6a4a', 2200);
    if (this.sel != null && e.dei[this.sel] !== '.') this.sel = null;
    if (e.fim) this.encerrar();
  }

  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.arrasto = null;
    this.sel = null;
    const ganhei = this.e?.fim?.vencedor === this.eu;
    setTimeout(() => {
      if (this.e?.fim?.motivo === 'frota') { (ganhei ? som.fanfarra : som.derrota)(); som.fala(ganhei ? 'Vitória! Frota inimiga destruída!' : 'Sua frota foi afundada.'); }
    }, VOO + IMPACTO + 600);
  }

  /** Um tiro (meu ou do outro) chegou: anima o voo e só depois mostra o resultado. */
  disparar(u, chave) {
    const agora = performance.now();
    const lado = chave === 'dei' ? 'alvo' : 'minha';
    this.ocultas.add(`${chave}:${u.casa}`);
    if (u.res === 'afundou') this.navioOculto.add(`${lado}:${u.navio.id}`);
    this.animas.push({ u, chave, lado, t0: agora, impactou: false });
    this.focar(lado, true);
    som.canhao(u.de === this.eu ? 1 : 0.7);
    setTimeout(() => som.assobio(VOO / 1000, 0.8), 60);
    this.tremor = Math.max(this.tremor, 4);
  }

  impacto(a) {
    const { u, chave, lado } = a;
    const agora = performance.now();
    this.ocultas.delete(`${chave}:${u.casa}`);
    const meu = u.de === this.eu;
    const { x, y } = this.centroCasa(lado, u.casa);
    const c = this.tabuleiro(lado).c;
    if (u.res === 'agua') {
      som.agua(meu ? 1 : 0.7);
      this.efeito('agua', x, y, c * 1.8);
      for (let k = 0; k < 3; k++) this.efeito('anel', x, y, c, k * 120);
      for (let k = 0; k < 14; k++) this.gota(x, y, c);
      this.texto(x, y - c * 0.8, 'ÁGUA', '#bfe8ff', c * 0.55);
    } else {
      som.explosao(meu ? 1 : 0.8);
      this.tremor = Math.max(this.tremor, u.res === 'afundou' ? 18 : 10);
      this.efeito('explosao', x, y, c * (u.res === 'afundou' ? 3 : 2.2));
      for (let k = 0; k < 18; k++) this.estilhaco(x, y, c);
      this.texto(x, y - c * 0.8, u.res === 'afundou' ? 'AFUNDOU!' : 'FOGO!', '#ff6a3a', c * 0.6);
      if (navigator.vibrate && !meu) navigator.vibrate(u.res === 'afundou' ? [80, 40, 160] : 60);
    }
    if (u.auto) this.texto(x, y + c * 0.9, 'tiro automático', '#fff', c * 0.36);
    if (u.res === 'afundou') {
      this.navioOculto.delete(`${lado}:${u.navio.id}`);
      this.afundando.push({ lado, navio: u.navio, t0: agora });
      setTimeout(() => som.afundar(), 200);
      const nome = NOME[u.navio.id];
      if (meu) { this.anunciar(`AFUNDOU O ${nome.toUpperCase()}!`, '#ffd23d', 1900); som.fala(`Afundou o ${nome}!`); }
      else { this.anunciar(`SEU ${nome.toUpperCase()} AFUNDOU`, '#ff6a4a', 1900); som.fala(`Perdemos o ${nome}!`); }
    }
  }

  focar(lado, ja = false) { this.foco = lado; if (ja) this.espiando = 0; }

  anunciar(txt, cor, dura = 1500) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  texto(x, y, txt, cor, tam) {
    const meia = Math.max(12, tam) * txt.length * 0.32;   // cabe na tela (casa na beirada)
    this.textos.push({ x: Math.max(meia + 6, Math.min(this.w - meia - 6, x)), y, txt, cor, tam, t0: performance.now() });
  }
  efeito(tipo, x, y, tam, atraso = 0) { this.particulas.push({ tipo, x, y, tam, t0: performance.now() + atraso }); }
  gota(x, y, c) {
    const a = Math.random() * Math.PI * 2, v = c * (1 + Math.random() * 3);
    this.particulas.push({ tipo: 'gota', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - c * 2, t0: performance.now(), vida: 600, r: c * 0.05 });
  }
  estilhaco(x, y, c) {
    const a = Math.random() * Math.PI * 2, v = c * (2 + Math.random() * 5);
    this.particulas.push({ tipo: 'brasa', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: performance.now(), vida: 500 + Math.random() * 400, r: c * 0.06 });
  }
  novaGaivota(f = 0) { return { x: -60 + f * (innerWidth + 120), y: 40 + Math.random() * innerHeight * 0.7, v: 25 + Math.random() * 25, fase: Math.random() * 6, s: 0.6 + Math.random() * 0.6 }; }

  // ---------------------------------------------------------- layout

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.w = w; this.h = h;
    this.retrato = h >= w * 1.05;
  }

  /** Retângulo do tabuleiro (x, y, lado) e a casa (c) — muda com a orientação, a fase e o foco. */
  tabuleiro(lado) {
    const { w, h } = this;
    const hud = this.retrato ? 92 : 70;
    const posiciona = this.e?.fase === 'posicionar';
    if (!this.retrato) {
      const s = Math.min((w - 70) / 2, h - hud - 96);
      if (posiciona) { const S = Math.min(w * 0.5, h - hud - 96); return this.ret(lado === 'minha' ? (w - S) / 2 : w + 40, hud + 26, S); }
      return this.ret(lado === 'minha' ? w / 2 - s - 16 : w / 2 + 16, hud + 26, s);
    }
    const S = Math.min(w - 24, h - hud - 230);
    const grande = { x: (w - S) / 2, y: hud + 40, s: S };
    const m = Math.max(92, Math.min(w * 0.33, h - (grande.y + S) - 110));
    const mini = { x: 60, y: grande.y + S + 14, s: m };   // a coluna da esquerda é das reações (Reacoes.tsx)
    if (posiciona) return lado === 'minha' ? this.ret(grande.x, grande.y, S) : this.ret(w + 40, grande.y, S);
    const k = lado === 'alvo' ? this.focoK : 1 - this.focoK;
    return this.ret(lerp(mini.x, grande.x, k), lerp(mini.y, grande.y, k), lerp(mini.s, grande.s, k));
  }

  ret(x, y, s) { const L = s * 0.07; return { x, y, s, gx: x + L, gy: y + L, c: (s - L) / N }; }
  centroCasa(lado, casa) { const t = this.tabuleiro(lado); return { x: t.gx + ((casa % N) + 0.5) * t.c, y: t.gy + (Math.floor(casa / N) + 0.5) * t.c }; }
  casaEm(lado, px, py) {
    const t = this.tabuleiro(lado);
    const x = Math.floor((px - t.gx) / t.c), y = Math.floor((py - t.gy) / t.c);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y, casa: y * N + x } : null;
  }

  botoes() {
    const { w, h } = this;
    // em pé: logo abaixo do topo, à direita; deitado: no canto de baixo
    const hud = this.retrato ? 92 : 70, yb = this.retrato ? hud - 4 : h - 40;
    const b = { sair: { x: w - 38, y: yb, w: 30, h: 30 }, mudo: { x: w - 74, y: yb, w: 30, h: 30 } };
    if (this.e?.fase === 'posicionar') {
      const t = this.tabuleiro('minha');
      const y = t.y + t.s + 16, bw = Math.min(170, (t.s - 12) / 2);
      b.sortear = { x: w / 2 - bw - 6, y, w: bw, h: 50 };
      b.pronto = { x: w / 2 + 6, y, w: bw, h: 50 };
    } else {
      const bw = Math.min(200, w * 0.42);
      b.atirar = this.retrato ? { x: w - bw - 12, y: h - 72, w: bw, h: 58 } : { x: w / 2 - bw / 2, y: h - 66, w: bw, h: 54 };
    }
    return b;
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (e) => this.ponteiroDesce(e),
      move: (e) => this.ponteiroMove(e),
      sobe: (e) => this.ponteiroSobe(e),
      resize: () => this.redimensionar(),
      tecla: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.atirarSel(); } },
      menu: (e) => e.preventDefault(),
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('pointerup', this.h.sobe);
    addEventListener('pointercancel', this.h.sobe);
    addEventListener('resize', this.h.resize);
    addEventListener('keydown', this.h.tecla);
    this.canvas.addEventListener('contextmenu', this.h.menu);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('pointerup', this.h.sobe);
    removeEventListener('pointercancel', this.h.sobe);
    removeEventListener('resize', this.h.resize);
    removeEventListener('keydown', this.h.tecla);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
  }

  minhaVez() { return this.e?.fase === 'batalha' && this.e.vez === this.eu && !this.e.fim && !this.animas.length && !this.aguardando; }

  ponteiroDesce(ev) {
    destravar();
    if (ev.pointerType !== 'mouse') this.toque = true;
    const px = ev.clientX, py = ev.clientY;
    const b = this.botoes();
    const dentro = (r) => r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    const e = this.e;
    if (!e || this.encerrado) return;
    if (e.fase === 'posicionar') {
      if (this.enviei) return;
      if (dentro(b.sortear)) { this.frota = frotaAleatoria(); som.clique(); return; }
      if (dentro(b.pronto)) { this.enviei = true; this.op.onEntrada({ tipo: 'frota', navios: this.frota, pronto: true }); som.buzina(); return; }
      const casa = this.casaEm('minha', px, py);
      const navio = casa && this.frota.find((n) => casasDe(n).includes(casa.casa));
      if (navio) {
        ev.preventDefault();
        this.arrasto = { id: navio.id, dx: casa.x - navio.x, dy: casa.y - navio.y, x0: px, y0: py, px, py, moveu: false, cand: null, pid: ev.pointerId };
      }
      return;
    }
    if (dentro(b.atirar)) { this.atirarSel(); return; }
    // o tabuleiro pequeno: toca e espia (ou volta)
    const grandeAlvo = this.focoK > 0.5;
    const pequeno = this.tabuleiro(grandeAlvo ? 'minha' : 'alvo');
    if (this.retrato && px >= pequeno.x && px <= pequeno.x + pequeno.s && py >= pequeno.y && py <= pequeno.y + pequeno.s) {
      this.espiando = performance.now() + 4000;
      this.foco = grandeAlvo ? 'minha' : 'alvo';
      som.clique();
      return;
    }
    if (!this.minhaVez()) return;
    const casa = this.casaEm('alvo', px, py);
    if (!casa) return;
    if (e.dei[casa.casa] !== '.') { som.erro(); return; }
    if (this.sel === casa.casa) { this.atirarSel(); return; }
    this.sel = casa.casa;
    this.selEm = performance.now();
    som.clique();
  }

  atirarSel() {
    if (this.sel == null || !this.minhaVez()) return;
    this.aguardando = true;
    this.op.onEntrada({ tipo: 'tiro', casa: this.sel });
  }

  ponteiroMove(ev) {
    if (ev.pointerType === 'mouse') this.mouse = { x: ev.clientX, y: ev.clientY };
    const a = this.arrasto;
    if (!a || ev.pointerId !== a.pid) return;
    a.px = ev.clientX; a.py = ev.clientY;
    if (Math.hypot(a.px - a.x0, a.py - a.y0) > 8) a.moveu = true;
    if (!a.moveu) return;
    const t = this.tabuleiro('minha');
    const n = this.frota.find((z) => z.id === a.id);
    const x = Math.round((a.px - t.gx) / t.c - 0.5) - a.dx, y = Math.round((a.py - t.gy) / t.c - 0.5) - a.dy;
    const lim = (v, max) => Math.max(0, Math.min(max, v));
    const cand = { ...n, x: lim(x, n.horiz ? N - TAM[n.id] : N - 1), y: lim(y, n.horiz ? N - 1 : N - TAM[n.id]) };
    a.cand = { navio: cand, ok: !!validarFrota(this.frota.map((z) => (z.id === n.id ? cand : z))) };
  }

  ponteiroSobe(ev) {
    const a = this.arrasto;
    if (!a || ev.pointerId !== a.pid) return;
    this.arrasto = null;
    const i = this.frota.findIndex((z) => z.id === a.id);
    if (!a.moveu) {
      // tocou: gira (se não couber, tenta encostar pra dentro do mar)
      const n = this.frota[i], tam = TAM[n.id];
      const g = { ...n, horiz: !n.horiz };
      if (g.horiz) g.x = Math.min(g.x, N - tam); else g.y = Math.min(g.y, N - tam);
      const nova = this.frota.map((z, k) => (k === i ? g : z));
      if (validarFrota(nova)) { this.frota = nova; som.clique(); } else { som.erro(); this.tremerNavio = { id: n.id, t0: performance.now() }; }
      return;
    }
    if (a.cand?.ok) { this.frota = this.frota.map((z, k) => (k === i ? a.cand.navio : z)); som.clique(); }
    else { som.erro(); this.tremerNavio = { id: a.id, t0: performance.now() }; }
  }

  // ------------------------------------------------------------- desenho

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    const e = this.e;

    // foco: na minha vez o tabuleiro do outro fica grande; na dele, o meu
    if (e?.fase === 'batalha' && !this.animas.length && agora > this.espiando) {
      this.foco = e.vez === this.eu && !e.fim ? 'alvo' : 'minha';
    }
    this.focoK += ((this.foco === 'alvo' ? 1 : 0) - this.focoK) * Math.min(1, dt * 7);
    // vez mudou (e nada voando): avisa
    if (e?.fase === 'batalha' && !e.fim && !this.animas.length && !this.banner && e.vez !== this.vezAntes) {
      this.vezAntes = e.vez;
      if (e.vez === this.eu) { this.anunciar('SUA VEZ!', '#ffd23d', 1200); som.sonar(); if (navigator.vibrate) navigator.vibrate(40); }
      else this.anunciar(`VEZ DE ${this.nome(e.vez).toUpperCase()}`, '#9fd3ff', 1100);
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.tremor *= 0.86;
    g.save();
    g.translate((Math.random() - 0.5) * this.tremor, (Math.random() - 0.5) * this.tremor);
    this.desenharMar(g, agora, dt);
    if (e) {
      const ordem = this.focoK > 0.5 ? ['minha', 'alvo'] : ['alvo', 'minha'];   // o grande por cima
      for (const lado of ordem) this.desenharTabuleiro(g, lado, agora);
      this.desenharAnimas(g, agora);
    }
    this.desenharParticulas(g, agora, dt);
    this.desenharTextos(g, agora);
    g.restore();
    this.desenharAvioes(g, agora, dt);
    if (e) this.desenharHud(g, agora);
  }

  desenharMar(g, agora, dt) {
    const { w, h } = this;
    const f = IMG.fundo;
    if (pronto(f)) {
      // cobre a tela, balançando devagar
      const esc = Math.max(w / f.naturalWidth, h / f.naturalHeight) * 1.06;
      const fw = f.naturalWidth * esc, fh = f.naturalHeight * esc;
      g.drawImage(f, (w - fw) / 2 + Math.sin(agora / 5000) * 8, (h - fh) / 2 + Math.cos(agora / 6000) * 6, fw, fh);
    } else { g.fillStyle = '#06305a'; g.fillRect(0, 0, w, h); }
    // brilho das ondas passando
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) {
      const onda = IMG[`onda-${k % 3}`];
      if (!pronto(onda)) continue;
      const x = ((agora / 60 + k * 230) % (w + 300)) - 150, y = (k * 137) % h;
      g.globalAlpha = 0.1 + 0.06 * Math.sin(agora / 900 + k);
      g.drawImage(onda, x, y, 160, 70);
    }
    g.restore();
    // gaivotas
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (const [k, b] of this.gaivotas.entries()) {
      b.x += b.v * dt; b.fase += dt * 7;
      if (b.x > w + 60) this.gaivotas[k] = this.novaGaivota();
      const asa = Math.sin(b.fase) * 4 * b.s, s = 9 * b.s;
      g.beginPath(); g.moveTo(b.x - s, b.y - asa); g.quadraticCurveTo(b.x - s / 2, b.y - s / 2, b.x, b.y); g.quadraticCurveTo(b.x + s / 2, b.y - s / 2, b.x + s, b.y - asa); g.stroke();
    }
  }

  desenharAvioes(g, agora, dt) {
    if (agora > this.proxAviao) {
      this.proxAviao = agora + 18_000 + Math.random() * 16_000;
      const y = 60 + Math.random() * this.h * 0.6;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) this.avioes.push({ x: this.w + 80 + k * 70, y: y + k * 46, v: 170 + Math.random() * 30, q: k % 2 });
    }
    this.avioes = this.avioes.filter((a) => a.x > -160);
    for (const a of this.avioes) {
      a.x -= a.v * dt;
      const im = IMG[`aviao-${a.q}`];
      if (!pronto(im)) continue;
      const w = 74, hh = (w * im.naturalHeight) / im.naturalWidth;
      g.save();
      g.globalAlpha = 0.28; g.filter = 'brightness(0)';
      g.drawImage(im, a.x + 40, a.y + 60, w * 0.8, hh * 0.8);   // sombra no mar
      g.restore();
      g.drawImage(im, a.x, a.y, w, hh);
    }
  }

  desenharTabuleiro(g, lado, agora) {
    const e = this.e;
    const t = this.tabuleiro(lado);
    if (t.x > this.w) return;
    const meu = lado === 'minha';
    const { x, y, s, gx, gy, c } = t;
    const pequeno = s < Math.min(this.w, this.h) * 0.5 && this.retrato;
    // painel
    g.save();
    g.shadowColor = meu ? 'rgba(40,160,255,.6)' : 'rgba(255,60,60,.6)';
    g.shadowBlur = 18;
    g.fillStyle = meu ? 'rgba(4,28,60,.82)' : 'rgba(46,6,14,.8)';
    g.beginPath(); g.roundRect(x - 4, y - 4, s + 8, s + 8, 14); g.fill();
    g.restore();
    // água do tabuleiro: brilho correndo
    g.save();
    g.beginPath(); g.rect(gx, gy, c * N, c * N); g.clip();
    const gr = g.createLinearGradient(gx, gy, gx + c * N, gy + c * N);
    gr.addColorStop(0, meu ? 'rgba(20,110,190,.55)' : 'rgba(150,30,40,.45)');
    gr.addColorStop(1, meu ? 'rgba(6,50,110,.55)' : 'rgba(70,10,20,.5)');
    g.fillStyle = gr; g.fillRect(gx, gy, c * N, c * N);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = meu ? 'rgba(140,210,255,.12)' : 'rgba(255,140,140,.1)';
    g.lineWidth = Math.max(1, c * 0.08);
    for (let k = 0; k < 9; k++) {
      const yy = gy + ((k * c * 1.3 + agora / 40) % (c * N + c)) - c;
      g.beginPath();
      for (let xx = 0; xx <= c * N; xx += c / 2) g.lineTo(gx + xx, yy + Math.sin(xx / c + agora / 500 + k) * c * 0.12);
      g.stroke();
    }
    // sonar varrendo o tabuleiro do outro na minha vez
    if (!meu && this.minhaVez() && g.createConicGradient) {
      const cg = g.createConicGradient(agora / 900, gx + c * N / 2, gy + c * N / 2);
      cg.addColorStop(0, 'rgba(255,90,90,.28)'); cg.addColorStop(0.08, 'rgba(255,90,90,0)'); cg.addColorStop(1, 'rgba(255,90,90,0)');
      g.fillStyle = cg; g.fillRect(gx, gy, c * N, c * N);
    }
    g.restore();
    // grade e letras
    g.strokeStyle = meu ? 'rgba(120,200,255,.35)' : 'rgba(255,120,120,.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k <= N; k++) { g.moveTo(gx + k * c, gy); g.lineTo(gx + k * c, gy + c * N); g.moveTo(gx, gy + k * c); g.lineTo(gx + c * N, gy + k * c); }
    g.stroke();
    if (!pequeno || s > 150) {
      g.font = `800 ${Math.max(8, c * 0.42)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = meu ? '#9fd3ff' : '#ffb0b0';
      for (let k = 0; k < N; k++) { g.fillText(LETRAS[k], gx + (k + 0.5) * c, y + (gy - y) / 2 + 1); g.fillText(String(k + 1), x + (gx - x) / 2, gy + (k + 0.5) * c); }
    }
    // título
    g.font = `900 ${pequeno ? 11 : 13}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillStyle = meu ? '#cfe9ff' : '#ffd0d0';
    if (e.fase !== 'posicionar' && !pequeno) g.fillText(meu ? 'MEU TABULEIRO' : `TABULEIRO DE ${this.nome(this.outro).toUpperCase()}`, x + s / 2, y - 7);

    if (meu) this.desenharMinhaFrota(g, t, agora);
    else for (const n of e.afundados) if (!this.navioOculto.has(`alvo:${n.id}`) && !this.afundando.some((z) => z.lado === 'alvo' && z.navio.id === n.id)) this.navio(g, t, n, 'queimado', agora, 0.85);
    // marcas dos tiros
    const tiros = meu ? e.levei : e.dei;
    const chave = meu ? 'levei' : 'dei';
    for (let casa = 0; casa < N * N; casa++) {
      const v = tiros[casa];
      if (v === '.' || this.ocultas.has(`${chave}:${casa}`)) continue;
      const cx = gx + ((casa % N) + 0.5) * c, cy = gy + (Math.floor(casa / N) + 0.5) * c;
      if (v === 'a') {
        const p = 0.5 + 0.5 * Math.sin(agora / 600 + casa);
        g.strokeStyle = `rgba(220,240,255,${0.65 + p * 0.2})`; g.lineWidth = Math.max(1.2, c * 0.08);
        g.beginPath(); g.arc(cx, cy, c * 0.26, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(220,240,255,.5)'; g.beginPath(); g.arc(cx, cy, c * 0.07, 0, Math.PI * 2); g.fill();
      } else {
        // acerto: X vermelho, fogo tremendo e fumaça subindo
        g.strokeStyle = 'rgba(255,40,40,.85)'; g.lineWidth = Math.max(1.5, c * 0.1);
        const r = c * 0.26;
        g.beginPath(); g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r); g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r); g.stroke();
        const fogo = IMG[`fogo-${Math.floor(agora / 110 + casa) % 2}`];
        if (pronto(fogo)) { const fw = c * 0.9, fh = (fw * fogo.naturalHeight) / fogo.naturalWidth; g.drawImage(fogo, cx - fw / 2, cy - fh * 0.75, fw, fh); }
        if (Math.random() < 0.06) this.particulas.push({ tipo: 'fumaca', x: cx + (Math.random() - 0.5) * c * 0.3, y: cy - c * 0.3, vx: c * 0.15, vy: -c * 0.9, t0: agora, vida: 1500, r: c * 0.18 });
      }
    }
    // navios afundando (quadros da folha), por cima das marcas
    for (const a of this.afundando) if (a.lado === lado) this.desenharAfundando(g, t, a, agora);
    // mira na minha vez
    if (!meu && this.minhaVez()) {
      const hover = !this.toque && this.mouse ? this.casaEm('alvo', this.mouse.x, this.mouse.y) : null;
      if (hover && e.dei[hover.casa] === '.' && hover.casa !== this.sel) {
        g.fillStyle = 'rgba(255,220,120,.14)'; g.fillRect(gx + hover.x * c, gy + hover.y * c, c, c);
      }
      if (this.sel != null) this.desenharMira(g, t, this.sel, agora);
    }
  }

  desenharMinhaFrota(g, t, agora) {
    const e = this.e;
    const frota = this.frota ?? e.minhaFrota;
    const a = this.arrasto;
    for (const n of frota) {
      if (a?.moveu && a.id === n.id) continue;
      if (this.afundando.some((z) => z.lado === 'minha' && z.navio.id === n.id)) continue;
      const afundado = e.perdi.includes(n.id) && !this.navioOculto.has(`minha:${n.id}`);
      let treme = 0;
      if (this.tremerNavio?.id === n.id && agora - this.tremerNavio.t0 < 300) treme = Math.sin((agora - this.tremerNavio.t0) / 20) * t.c * 0.12;
      this.navio(g, t, n, afundado ? 'queimado' : 'ok', agora, afundado ? 0.7 : 1, treme);
    }
    // o navio sendo arrastado: segue o dedo, e a sombra mostra onde vai cair (verde cabe, vermelho não)
    if (a?.moveu) {
      const n = frota.find((z) => z.id === a.id);
      if (a.cand) {
        const { navio, ok } = a.cand;
        g.fillStyle = ok ? 'rgba(80,255,140,.28)' : 'rgba(255,60,60,.32)';
        for (const casa of casasDe(navio)) g.fillRect(t.gx + (casa % N) * t.c + 1, t.gy + Math.floor(casa / N) * t.c + 1, t.c - 2, t.c - 2);
      }
      const fx = (a.px - t.gx) / t.c - 0.5 - a.dx, fy = (a.py - t.gy) / t.c - 0.5 - a.dy;
      g.save(); g.globalAlpha = 0.9;
      this.navio(g, t, { ...n, x: fx, y: fy }, 'ok', agora, 0.9, 0, 1.08);
      g.restore();
    }
  }

  /** Desenha um navio da folha no tabuleiro: proa pra cima na folha; deitado, gira 90°. */
  navio(g, t, n, estado, agora, alfa = 1, treme = 0, escala = 1) {
    const tam = TAM[n.id];
    const nome = estado === 'queimado' ? QUEIMADO[n.id] : SPRITE[n.id];
    const im = IMG[nome];
    if (!pronto(im)) return;
    const cx = t.gx + (n.x + (n.horiz ? tam / 2 : 0.5)) * t.c + treme;
    const cy = t.gy + (n.y + (n.horiz ? 0.5 : tam / 2)) * t.c;
    const comp = tam * t.c * 0.96 * escala;
    const sub = n.id === 'submarino';
    g.save();
    g.globalAlpha *= alfa;
    g.translate(cx, cy + Math.sin(agora / 700 + tam) * t.c * 0.03);
    // a folha: navios em pé (proa pra cima); o submarino deitado (proa pra direita)
    if (sub) { if (!n.horiz) g.rotate(-Math.PI / 2); g.drawImage(im, -comp / 2, -t.c * 0.36 * escala, comp, t.c * 0.72 * escala); }
    else {
      if (n.horiz) g.rotate(Math.PI / 2);
      const larg = t.c * (tam >= 4 ? 1.05 : 0.95) * escala;
      g.drawImage(im, -larg / 2, -comp / 2, larg, comp);
    }
    g.restore();
  }

  desenharAfundando(g, t, a, agora) {
    const k = (agora - a.t0) / 1800;
    const quadros = AFUNDA[a.navio.id] ?? AFUNDA_MEDIO;
    const n = a.navio, tam = TAM[n.id];
    if (k >= 1) { this.afundando.splice(this.afundando.indexOf(a), 1); return; }
    const im = IMG[quadros[Math.min(quadros.length - 1, Math.floor(k * quadros.length * 1.1))]];
    if (!pronto(im)) return;
    const cx = t.gx + (n.x + (n.horiz ? tam / 2 : 0.5)) * t.c, cy = t.gy + (n.y + (n.horiz ? 0.5 : tam / 2)) * t.c;
    const comp = tam * t.c * (1.05 - k * 0.15);
    g.save();
    g.translate(cx, cy);
    if (n.horiz) g.rotate(Math.PI / 2);
    g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 * 0.6 + 0.4 : 1;
    const larg = (comp * im.naturalWidth) / im.naturalHeight;
    g.drawImage(im, -larg / 2, -comp / 2, larg, comp);
    g.restore();
    if (Math.random() < 0.4) this.particulas.push({ tipo: 'bolha', x: cx + (Math.random() - 0.5) * t.c, y: cy + (Math.random() - 0.5) * comp * (n.horiz ? 0.3 : 1), vx: 0, vy: -t.c * 0.6, t0: agora, vida: 700, r: t.c * 0.07 });
  }

  desenharMira(g, t, casa, agora) {
    const cx = t.gx + ((casa % N) + 0.5) * t.c, cy = t.gy + (Math.floor(casa / N) + 0.5) * t.c;
    const k = Math.min(1, (agora - (this.selEm ?? 0)) / 250);
    const r = t.c * (1.6 - 0.9 * sai(k)) * (1 + 0.06 * Math.sin(agora / 120));
    g.save();
    g.strokeStyle = '#ffd23d'; g.lineWidth = 2.5; g.shadowColor = '#ffb020'; g.shadowBlur = 10;
    g.beginPath(); g.arc(cx, cy, r * 0.55, 0, Math.PI * 2); g.stroke();
    g.rotate(0);
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2 + agora / 900;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); g.stroke();
    }
    g.restore();
    g.font = `900 ${Math.max(11, t.c * 0.45)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(coord(casa), cx, cy - r * 0.6); g.fillStyle = '#ffd23d'; g.fillText(coord(casa), cx, cy - r * 0.6);
  }

  /** A bala: sai do tabuleiro de quem atirou e cai em arco na casa do outro. */
  desenharAnimas(g, agora) {
    for (const a of [...this.animas]) {
      const k = (agora - a.t0) / VOO;
      const de = this.tabuleiro(a.lado === 'alvo' ? 'minha' : 'alvo');
      const ox = de.x + de.s / 2, oy = de.y + de.s / 2;
      const alvo = this.centroCasa(a.lado, a.u.casa);
      const c = this.tabuleiro(a.lado).c;
      if (k < 1) {
        if (k < 0.12) {   // clarão do canhão
          g.save(); g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(ox, oy, 0, ox, oy, 70 * (1 - k / 0.12) + 10);
          gr.addColorStop(0, 'rgba(255,230,150,.95)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
          g.fillStyle = gr; g.fillRect(ox - 90, oy - 90, 180, 180); g.restore();
        }
        const x = lerp(ox, alvo.x, k), y = lerp(oy, alvo.y, k);
        const alto = Math.sin(k * Math.PI);                    // altura do arco (vista de cima: cresce e sobe)
        const sx = x, sy = y - alto * c * 3.2;
        g.fillStyle = `rgba(0,0,0,${0.25 + 0.2 * k})`;           // sombra no mar
        g.beginPath(); g.ellipse(x, y, c * 0.25 * (1 - alto * 0.4), c * 0.12, 0, 0, Math.PI * 2); g.fill();
        const im = IMG.bala;
        if (pronto(im)) {
          const ang = Math.atan2((alvo.y - oy) - Math.cos(k * Math.PI) * c * 3.2 * Math.PI, alvo.x - ox);
          const w = c * (1.4 + alto * 0.9), h = (w * im.naturalHeight) / im.naturalWidth;
          g.save(); g.translate(sx, sy); g.rotate(ang); g.drawImage(im, -w * 0.7, -h / 2, w, h); g.restore();
        }
        if (Math.random() < 0.7) this.particulas.push({ tipo: 'fumaca', x: sx, y: sy, vx: 0, vy: 0, t0: agora, vida: 500, r: c * 0.12 });
        // mira de onde vai cair
        g.strokeStyle = `rgba(255,${a.u.de === this.eu ? 210 : 80},60,${0.4 + 0.4 * Math.sin(agora / 60)})`; g.lineWidth = 2;
        g.beginPath(); g.arc(alvo.x, alvo.y, c * 0.45 * (1.4 - k * 0.6), 0, Math.PI * 2); g.stroke();
      } else if (!a.impactou) { a.impactou = true; this.impacto(a); }
      if (k >= 1 + IMPACTO / VOO) this.animas.splice(this.animas.indexOf(a), 1);
    }
  }

  desenharParticulas(g, agora, dt) {
    const vivas = [];
    for (const p of this.particulas) {
      const idade = agora - p.t0;
      if (idade < 0) { vivas.push(p); continue; }
      if (p.tipo === 'agua' || p.tipo === 'explosao') {
        const dur = p.tipo === 'agua' ? 650 : 750, k = idade / dur;
        if (k >= 1) continue;
        const frames = p.tipo === 'agua' ? ['agua-0', 'agua-1', 'agua-2', 'agua-grande'] : ['explosao-0', 'explosao-3', 'explosao-1', 'explosao-2'];
        const im = IMG[frames[Math.min(frames.length - 1, Math.floor(k * frames.length))]];
        if (pronto(im)) {
          const w = p.tam * (0.7 + k * 0.5), h = (w * im.naturalHeight) / im.naturalWidth;
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          g.drawImage(im, p.x - w / 2, p.y - h * (p.tipo === 'agua' ? 0.85 : 0.55), w, h);
          g.globalAlpha = 1;
        }
        vivas.push(p); continue;
      }
      if (p.tipo === 'anel') {
        const k = idade / 900;
        if (k >= 1) continue;
        g.strokeStyle = `rgba(220,245,255,${0.7 * (1 - k)})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(p.x, p.y, p.tam * (0.3 + k * 1.1), p.tam * (0.2 + k * 0.7), 0, 0, Math.PI * 2); g.stroke();
        vivas.push(p); continue;
      }
      const k = idade / p.vida;
      if (k >= 1) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'gota') { p.vy += 900 * dt; g.fillStyle = `rgba(220,245,255,${1 - k})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
      else if (p.tipo === 'brasa') { p.vx *= 0.94; p.vy *= 0.94; g.fillStyle = k < 0.4 ? '#ffe08a' : '#ff5a1f'; g.globalAlpha = 1 - k; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      else if (p.tipo === 'fumaca') { g.fillStyle = `rgba(50,50,55,${0.4 * (1 - k)})`; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 1.8), 0, Math.PI * 2); g.fill(); }
      else if (p.tipo === 'bolha') { g.strokeStyle = `rgba(220,245,255,${0.8 * (1 - k)})`; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.stroke(); }
      vivas.push(p);
    }
    this.particulas = vivas.slice(-600);
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1100);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1100;
      g.globalAlpha = 1 - k * k;
      rotulo(g, t.txt, t.x, t.y - 30 * sai(k), t.cor, Math.max(12, t.tam) * (k < 0.15 ? volta(k / 0.15) : 1));
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hud

  desenharHud(g, agora) {
    const e = this.e;
    const { w, h } = this;
    const hudH = this.retrato ? 92 : 70;
    const gr = g.createLinearGradient(0, 0, 0, hudH);
    gr.addColorStop(0, 'rgba(2,10,26,.92)'); gr.addColorStop(1, 'rgba(2,10,26,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, hudH + 20);
    // jogadores: eu à esquerda, o outro à direita
    const vivos = (perdi) => FROTA.length - perdi.length;
    const card = (i, x, alinha) => {
      const vez = e.fase === 'batalha' && e.vez === i && !e.fim;
      const r = this.retrato ? 22 : 18, cy = this.retrato ? 34 : 30;
      const ax = alinha === 'esq' ? x + r : x - r;
      g.save();
      g.beginPath(); g.arc(ax, cy, r, 0, Math.PI * 2);
      g.fillStyle = i === this.eu ? '#1d5fbf' : '#a8202c'; g.fill();
      const foto = this.fotos[i];
      if (pronto(foto)) { g.save(); g.clip(); g.drawImage(foto, ax - r, cy - r, r * 2, r * 2); g.restore(); }
      else { g.font = `900 ${r}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(this.nome(i)[0]?.toUpperCase() ?? '?', ax, cy + 1); }
      g.lineWidth = vez ? 3 : 2; g.strokeStyle = vez ? '#ffd23d' : 'rgba(255,255,255,.5)';
      if (vez) { g.shadowColor = '#ffd23d'; g.shadowBlur = 12 + 6 * Math.sin(agora / 150); }
      g.beginPath(); g.arc(ax, cy, r, 0, Math.PI * 2); g.stroke();
      g.restore();
      const tx = alinha === 'esq' ? ax + r + 8 : ax - r - 8;
      g.textAlign = alinha === 'esq' ? 'left' : 'right'; g.textBaseline = 'middle';
      g.font = '900 14px system-ui'; g.fillStyle = '#fff';
      g.fillText(i === this.eu ? 'Você' : this.nome(i), tx, cy - 8);
      // navios que ainda flutuam
      const n = vivos(i === this.eu ? e.perdi : e.afundei), bw = 9;
      for (let k = 0; k < FROTA.length; k++) {
        const bx = alinha === 'esq' ? tx + k * (bw + 3) : tx - (k + 1) * (bw + 3) + 3;
        g.fillStyle = k < n ? (i === this.eu ? '#3ba0ff' : '#ff4a4a') : 'rgba(255,255,255,.18)';
        g.beginPath(); g.roundRect(bx, cy + 5, bw, 7, 2); g.fill();
      }
    };
    card(this.eu, 10, 'esq');
    card(this.outro, w - 10, 'dir');
    // VS e o relógio
    const vs = IMG.vs, vw = this.retrato ? 92 : 80;
    if (pronto(vs)) g.drawImage(vs, w / 2 - vw / 2, 2, vw, (vw * vs.naturalHeight) / vs.naturalWidth);
    const resta = Math.max(0, e.prazo - this.agoraServ());
    const seg = Math.ceil(resta / 1000);
    const total = e.fase === 'posicionar' ? 45_000 : TEMPO_TIRO;
    const vezMinha = e.fase === 'posicionar' ? !this.enviei : e.vez === this.eu;
    if (!e.fim && vezMinha && seg <= 5 && seg > 0 && seg !== this.ultimoBip && e.fase === 'batalha') { this.ultimoBip = seg; som.bip(seg <= 2); }
    const tx = w / 2, ty = this.retrato ? 78 : 62;
    if (!e.fim && (e.fase === 'posicionar' || !this.animas.length)) {
      pilula(g, tx - 40, ty - 13, 80, 26, seg <= 5 ? 'rgba(160,20,10,.9)' : 'rgba(5,20,45,.9)', seg <= 5 ? '#ff6a4a' : '#5ab4ff');
      g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(tx - 32, ty + 8, 64, 2);
      g.fillStyle = seg <= 5 ? '#ff6a4a' : '#5ab4ff'; g.fillRect(tx - 32, ty + 8, 64 * Math.min(1, resta / total), 2);
      g.font = '900 15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(`00:${String(Math.min(99, seg)).padStart(2, '0')}`, tx, ty);
    }

    const b = this.botoes();
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = b[k];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '14px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }

    if (e.fase === 'posicionar') this.hudPosicionar(g, b);
    else this.hudBatalha(g, b, agora);

    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save();
        g.translate(w / 2, h * 0.42);
        const s = k < 0.15 ? volta(k / 0.15) : 1;
        g.scale(s, s);
        g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        const tam = Math.min(46, (w * 0.92) / Math.max(5, this.banner.txt.length) * 1.7);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(-w / 2, -tam * 0.85, w, tam * 1.7);
        rotulo(g, this.banner.txt, 0, 0, this.banner.cor, tam);
        g.restore();
      }
    }
  }

  hudPosicionar(g, b) {
    const t = this.tabuleiro('minha');
    rotulo(g, this.enviei ? 'FROTA PRONTA!' : 'POSICIONE SUA FROTA', this.w / 2, t.y - 26, '#ffd23d', 18);
    if (!this.enviei) {
      botao(g, b.sortear, '🎲 SORTEAR', '#1d4f8f', '#5ab4ff');
      botao(g, b.pronto, '✔ PRONTO', '#1f7a3a', '#5be08a');
      g.font = '700 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(this.toque ? 'Arraste o navio pra mover · toque nele pra girar' : 'Arraste o navio pra mover · clique nele pra girar', this.w / 2, b.pronto.y + b.pronto.h + 10);
    } else {
      const outroPronto = this.e.pronto?.[this.outro];
      g.font = '800 14px system-ui'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = '#fff';
      g.fillText(outroPronto ? 'Os dois prontos!' : `Esperando ${this.nome(this.outro)} posicionar…`, this.w / 2, t.y + t.s + 22);
    }
  }

  hudBatalha(g, b, agora) {
    const e = this.e;
    if (!e.fim) {
      const pode = this.minhaVez() && this.sel != null;
      const r = b.atirar;
      g.save();
      if (pode) { g.shadowColor = '#ff3030'; g.shadowBlur = 14 + 8 * Math.sin(agora / 160); }
      g.globalAlpha = this.minhaVez() ? 1 : 0.45;
      botao(g, r, this.minhaVez() ? (this.sel != null ? `🎯 ATIRAR ${coord(this.sel)}` : '🎯 ESCOLHA O ALVO') : '⏳ AGUARDE', pode ? '#b0161c' : '#3a2a30', pode ? '#ff6a6a' : '#7a5a60');
      g.restore();
    }
    // frota inimiga: o que já afundou
    if (this.retrato && (this.focoK > 0.97 || this.focoK < 0.03)) {   // só com a troca de tabuleiro terminada
      const t = this.tabuleiro(this.focoK > 0.5 ? 'minha' : 'alvo');
      const x0 = t.x + t.s + 14, y0 = t.y + 4, larg = this.w - x0 - 12;
      if (larg > 90) {
        g.font = '900 11px system-ui'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#ffd0d0';
        g.fillText('FROTA INIMIGA', x0, y0);
        for (const [k, n] of FROTA.entries()) {
          const yy = y0 + 16 + k * 14, foi = e.afundei.includes(n.id);
          g.globalAlpha = foi ? 0.45 : 1;
          g.font = '700 11px system-ui'; g.fillStyle = '#fff'; g.fillText(`${n.nome}`, x0, yy);
          for (let q = 0; q < n.tam; q++) { g.fillStyle = foi ? '#ff4a4a' : 'rgba(255,255,255,.3)'; g.fillRect(x0 + larg - (n.tam - q) * 9, yy + 2, 7, 7); }
          if (foi) { g.strokeStyle = '#ff4a4a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, yy + 6); g.lineTo(x0 + larg, yy + 6); g.stroke(); }
          g.globalAlpha = 1;
        }
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

function pilula(g, x, y, w, h, fundo, borda) {
  g.fillStyle = fundo; g.strokeStyle = borda; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill(); g.stroke();
}

function botao(g, r, txt, fundo, borda) {
  const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  gr.addColorStop(0, borda); gr.addColorStop(0.12, fundo); gr.addColorStop(1, fundo);
  g.fillStyle = gr; g.strokeStyle = borda; g.lineWidth = 2;
  g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 14); g.fill(); g.stroke();
  g.font = `900 ${Math.min(18, r.h * 0.34)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
}
