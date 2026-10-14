import { LARGURA as W, ALTURA as H, MUNICAO, RECARGA, RODADAS, TEMPO_RODADA, TIPOS, posicao } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles da Caçada de Patos (canvas 2D). O servidor
 * manda os patos como fórmula (regras.js `posicao`), então aqui cada pato é
 * calculado no instante desenhado — liso em qualquer rede.
 *
 * O que é daqui:
 *  - patos batendo asa (quadros da folha), virados pro lado que voam;
 *  - acertou: clarão, explosão de penas, o pato rodopia caindo e espirra água
 *    no lago; as penas descem balançando; "+N" na cor de quem acertou;
 *  - as 4 espingardas embaixo: viram pro tiro, recuam, cospem o cartucho e
 *    soltam fumaça; cartuchos de cada um contados embaixo;
 *  - a mira de cada um pisca onde atirou; a minha segue o mouse;
 *  - o cachorro aparece entre as rodadas (e ri de quem não acertou nada);
 *  - celular em pé: a tela gira pra deitada (tiro ao alvo é na horizontal).
 */

const A = import.meta.glob('../../assets/patos/*.{webp,png}', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace(/\.(webp|png)$/, '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const CORES = ['vermelho', 'azul', 'verde', 'amarelo'];
// medidas do sprite arma-*.png (201x144): o cano sai a -30°; o pivô (no eixo do cano, no braço)
// fica em 10%/75% do sprite e a boca a 1 largura dele. Sprite novo = medir de novo.
const CANO = -0.52, PIVO = [0.1, 0.75], BOCA = 1.0;
const TOM = { vermelho: '#ff3b30', azul: '#2f8bff', verde: '#2ecc40', amarelo: '#ffb020' };
const MIRA = { vermelho: 'mira-vermelho', azul: 'mira-azul', verde: 'mira-verde', amarelo: 'mira-laranja' };
const QUADROS = { verde: 7, marrom: 7, branco: 5, colorido: 3 };
const AGUDO = { verde: 1, marrom: 1.1, branco: 0.75, colorido: 1.35 };
const ATRASO = 60;
const lerp = (a, b, t) => a + (b - a) * t;
const sai = (t) => 1 - (1 - t) * (1 - t);
const volta = (t) => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

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
    this.desvio = null;
    this.vistos = 0;
    this.caindo = [];
    this.mortos = new Set();
    this.particulas = [];
    this.textos = [];
    this.miras = [];          // flashes de mira (de todos)
    this.armas = [0, 1, 2, 3].map(() => ({ ang: -0.9, alvo: -0.9, recuo: 0, clarao: 0 }));
    this.banner = null;
    this.cachorro = null;
    this.tremor = 0;
    this.proxQuack = 0;
    this.ultimoBip = null;
    this.encerrado = false;
    this.mouse = null;
    this.toque = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.chegou = performance.now();
    this.nuvens = Array.from({ length: 4 }, (_, k) => ({ x: Math.random() * W, y: 40 + k * 55, r: 90 + Math.random() * 80, v: 8 + Math.random() * 10 }));
    this.ligar();
    this.redimensionar();
    this.rodando = true;
    // um erro num quadro não pode congelar o jogo: loga e segue
    const quadro = () => { if (!this.rodando) return; try { this.desenhar(); } catch (e) { console.error(e); } requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() { this.rodando = false; this.desligar(); window.speechSynthesis?.cancel(); }

  cor(i) { return CORES[i % 4]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? `Caçador ${i + 1}`).split(' ')[0]; }
  agoraServ() { return performance.now() + (this.desvio ?? 0); }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    const agora = performance.now();
    this.chegou = agora;
    this.travou = false;
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    const antes = this.e;
    this.e = e;
    for (const ev of e.ev ?? []) if (ev.id > this.vistos) { this.vistos = ev.id; this.evento(ev, antes, agora); }
    if (e.fim && !this.encerrado) this.encerrar(e.fim);
  }

  evento(ev, antes, agora) {
    if (ev.tipo === 'abate') {
      this.mortos.add(ev.pato);
      const meu = ev.de === this.eu;
      this.caindo.push({ tipo: ev.patoTipo, x: ev.x, y: ev.y, dir: ev.dir, t0: agora, vx: ev.dir * 60, vy: -140, rot: 0, agua: 560 + Math.random() * 120, splash: false });
      for (let k = 0; k < 16; k++) this.pena(ev.x, ev.y);
      this.particulas.push({ tipo: 'sprite', nome: 'clarao-2', x: ev.x, y: ev.y, t0: agora, vida: 220, tam: 90 });
      const mais = IMG[`mais-${ev.pontos}`] ? `mais-${ev.pontos}` : null;
      this.textos.push({ x: ev.x, y: ev.y - 40, sprite: mais, txt: mais ? null : `+${ev.pontos}`, cor: TOM[this.cor(ev.de)], t0: agora, tam: 34 });
      if (ev.dobra) this.textos.push({ x: ev.x, y: ev.y - 90, txt: 'DOBRADINHA!', cor: '#ffd23d', t0: agora, tam: 30 });
      som.acerto(meu ? 1 : 0.55);
      if (meu) { som.ponto(ev.pontos); this.tremor = 5; if (navigator.vibrate) navigator.vibrate(35); }
      if (ev.patoTipo === 'colorido' && meu) { this.anunciar('PATO RARO! +5', '#ffd23d', 1300); som.fala('Pato raro!'); }
    }
    if (ev.tipo === 'tiro' && ev.de !== this.eu) {
      this.disparo(ev.de, ev.x, ev.y, 0.45);
    }
    if (ev.tipo === 'tiro' && ev.de === this.eu && ev.recarrega) setTimeout(() => som.recarga(), 200);
    if (ev.tipo === 'recarga' && ev.de === this.eu) som.recarga();
    if (ev.tipo === 'rodada') {
      som.apito();
      this.anunciar(ev.rodada === RODADAS ? 'ÚLTIMA RODADA!' : `RODADA ${ev.rodada}`, '#fff', 1500);
      this.cachorro = null;
    }
    if (ev.tipo === 'fimRodada' && !this.e.fim) {
      // o cachorro aparece: com um pato se eu fui bem na rodada, rindo se não
      const pontos = this.e.pontos[this.eu] - (this.pontosRodada ?? 0);
      this.pontosRodada = this.e.pontos[this.eu];
      this.cachorro = { t0: agora, ri: pontos <= 0 };
      if (pontos <= 0) som.cachorro();
    }
    if (ev.tipo === 'saiu') this.textos.push({ x: W / 2, y: 300, txt: `${this.nome(ev.i)} saiu`, cor: '#fff', t0: agora, tam: 30 });
  }

  /** Efeito de tiro de um jogador (o meu sai na hora do toque, os outros quando o servidor avisa). */
  disparo(i, x, y, v) {
    const agora = performance.now();
    som.tiro(v);
    setTimeout(() => som.bomba(v), 120);
    this.miras.push({ i, x, y, t0: agora });
    const a = this.armas[i];
    a.recuo = 1; a.clarao = agora;
    const g = this.posArma(i);
    if (g) {
      const w = this.paraMundoTela(x, y);
      a.alvo = Math.atan2(w.y - (g.y + this.hb * 0.25), w.x - g.x);   // do pivô da arma (onde ela é desenhada)
      this.particulas.push({ tipo: 'cartucho', x: g.x, y: g.y - 30, vx: -g.lado * (120 + Math.random() * 80), vy: -260, rot: 0, t0: agora, vida: 900, tela: true });
      const boca = g.comp * 1.5 * BOCA;
      this.particulas.push({ tipo: 'fumaca', x: g.x + Math.cos(a.alvo) * boca, y: g.y + this.hb * 0.25 + Math.sin(a.alvo) * boca, t0: agora, vida: 800, tela: true });
    }
  }

  encerrar(fim) {
    this.encerrado = true;
    const ganhei = fim.vencedor === this.eu;
    this.anunciar(fim.vencedor == null ? 'EMPATE!' : ganhei ? 'VOCÊ VENCEU!' : `${this.nome(fim.vencedor).toUpperCase()} VENCEU!`, ganhei ? '#ffd23d' : '#fff', 3000);
    if (ganhei) { som.fanfarra(); som.fala('Melhor caçador!'); }
    this.cachorro = { t0: performance.now(), ri: !ganhei, fica: true };
  }

  anunciar(txt, cor, dura) { this.banner = { txt, cor, t0: performance.now(), dura }; }
  pena(x, y) {
    const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220;
    this.particulas.push({ tipo: 'pena', nome: `pena-${Math.floor(Math.random() * 10)}`, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, t0: performance.now(), vida: 2600 });
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      desce: (ev) => this.ponteiro(ev),
      move: (ev) => { if (ev.pointerType === 'mouse') { this.mouse = this.paraVirtual(ev.clientX, ev.clientY); if (!matchMedia('(pointer: coarse)').matches) this.toque = false; } },
      tecla: (ev) => { if (ev.key === 'r' || ev.key === 'R') this.recarregar(); },
      resize: () => this.redimensionar(),
      menu: (ev) => ev.preventDefault(),
    };
    this.canvas.addEventListener('pointerdown', this.h.desce);
    addEventListener('pointermove', this.h.move);
    addEventListener('keydown', this.h.tecla);
    addEventListener('resize', this.h.resize);
    this.canvas.addEventListener('contextmenu', this.h.menu);
  }

  desligar() {
    this.canvas.removeEventListener('pointerdown', this.h.desce);
    removeEventListener('pointermove', this.h.move);
    removeEventListener('keydown', this.h.tecla);
    removeEventListener('resize', this.h.resize);
    this.canvas.removeEventListener('contextmenu', this.h.menu);
  }

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
  paraMundo(v) { return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc }; }
  paraMundoTela(x, y) { return { x: this.ox + x * this.esc, y: this.oy + y * this.esc }; }

  recarregar() {
    const e = this.e;
    if (!e || e.fase !== 'jogo' || e.municao[this.eu] >= MUNICAO) return;
    this.op.onEntrada({ recarregar: true });
  }

  ponteiro(ev) {
    destravar();
    if (ev.pointerType !== 'mouse') this.toque = true;
    ev.preventDefault();
    const v = this.paraVirtual(ev.clientX, ev.clientY);
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(this.B.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(this.B.mudo)) { som.alternarMudo(); return; }
    const e = this.e;
    if (!e || e.fim) return;
    if (ev.button === 2 || dentro(this.B.recarga)) { this.recarregar(); return; }
    if (v.y > this.vh - this.hb) return;       // a cerca (embaixo) não é alvo
    if (e.fase !== 'jogo') return;
    if (e.municao[this.eu] <= 0 || this.agoraServ() < e.recarregaAte[this.eu]) { som.vazio(); this.textos.push({ x: this.paraMundo(v).x, y: this.paraMundo(v).y, txt: 'SEM BALA', cor: '#fff', t0: performance.now(), tam: 22 }); return; }
    if (performance.now() - (this.ultimoTiro ?? 0) < 230) return;
    this.ultimoTiro = performance.now();
    const m = this.paraMundo(v);
    this.disparo(this.eu, m.x, m.y, 1);
    this.op.onEntrada({ x: Math.round(m.x), y: Math.round(m.y), t: Math.round(this.agoraServ() - ATRASO) });
  }

  // ------------------------------------------------------------- desenho

  redimensionar() {
    const w = innerWidth, h = innerHeight;
    this.girado = h > w * 1.05;
    this.vw = this.girado ? h : w;
    this.vh = this.girado ? w : h;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.hb = Math.max(80, Math.min(this.vh * 0.24, 130));    // a cerca com as armas
    // do céu até o lago (y 0..610) cabe acima da cerca; sobrando dos lados, o cenário desfocado completa
    this.esc = Math.min(this.vw / W, (this.vh - this.hb * 0.55) / 610);
    this.ox = (this.vw - W * this.esc) / 2;
    this.oy = 0;
    const s = 42;
    this.B = { sair: { x: this.vw - s - 8, y: 60, w: s, h: s }, mudo: { x: this.vw - (s + 8) * 2, y: 60, w: s, h: s }, recarga: { x: 0, y: 0, w: 0, h: 0 } };   // abaixo do placar
  }

  /** Onde fica a espingarda do assento i (tela virtual). */
  posArma(i) {
    const n = this.e?.n ?? 4;
    if (i >= n) return null;
    const ordem = [...Array(n).keys()];
    const k = ordem.indexOf(i);
    const x = this.vw * (k + 0.5) / n;
    const lado = x < this.vw / 2 ? 1 : -1;
    const tam = i === this.eu ? 1.2 : 0.95;
    return { x, y: this.vh - this.hb * 0.35, lado, comp: this.hb * 0.9 * tam, tam };
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.antes ?? agora)) / 1000);
    this.antes = agora;
    const e = this.e;
    if (!this.encerrado && !this.travou && e?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#1a2a10'; g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }
    if (this.ox > 2 && pronto(IMG.cena)) {   // laterais: o cenário esticado, desfocado e escuro
      if (!this.fundoLado) {
        const c = document.createElement('canvas'); c.width = 320; c.height = 192;
        const cg = c.getContext('2d'); cg.filter = 'blur(6px) brightness(.55)'; cg.drawImage(IMG.cena, -20, -12, 360, 216);
        this.fundoLado = c;
      }
      g.drawImage(this.fundoLado, 0, 0, this.vw, this.vh);
    }
    this.tremor *= 0.85;
    g.save();
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharCena(g, agora, dt);
    if (e) this.desenharPatos(g, agora);
    this.desenharCaindo(g, agora, dt);
    this.desenharParticulas(g, agora, dt, false);
    this.desenharMiras(g, agora);
    this.desenharTextos(g, agora);
    g.restore();
    this.desenharCerca(g, agora, dt);
    this.desenharParticulas(g, agora, dt, true);
    if (e) this.desenharHud(g, agora);
  }

  desenharCena(g, agora, dt) {
    if (pronto(IMG.cena)) g.drawImage(IMG.cena, 0, 0, W, H);
    // nuvens passando e o brilho do lago
    for (const n of this.nuvens) {
      n.x += n.v * dt;
      if (n.x - n.r > W) n.x = -n.r;
      const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(n.x, n.y, n.r * 1.6, n.r * 0.6, 0, 0, Math.PI * 2); g.fill();
    }
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
      const x = (k * 137 + agora / 30) % W, y = 520 + ((k * 53) % 160);
      g.globalAlpha = 0.12 + 0.1 * Math.sin(agora / 400 + k);
      g.fillStyle = '#fff'; g.fillRect(x, y, 40 + (k % 3) * 20, 2);
    }
    g.restore();
  }

  desenharPatos(g, agora) {
    const t = this.agoraServ() - ATRASO;
    let algum = false;
    for (const [id, tipo, t0, x0, y0, dir, v, amp, freq, fase, sobe, morto] of this.e.d) {
      if (t < t0 || this.mortos.has(id)) continue;
      if (morto != null && t > morto + 600) continue;     // o aviso do abate se perdeu: some
      const d = { t0, x0, y0, dir, v, amp, freq, fase, sobe };
      const q = posicao(d, t);
      if (q.x < -150 || q.x > W + 150) continue;
      algum = true;
      const n = QUADROS[tipo], f = Math.floor((agora / (tipo === 'colorido' ? 55 : 85) + id * 3) % n);
      const im = IMG[`${tipo}-${f}`];
      if (!pronto(im)) continue;
      const larg = TIPOS[tipo].raio * 2.6, alt = (larg * im.naturalHeight) / im.naturalWidth;
      const incl = Math.atan2(posicao(d, t + 50).y - q.y, v * 0.05 * 1) * 0.6;
      g.save(); g.translate(q.x, q.y); g.scale(dir, 1); g.rotate(incl * dir);
      if (tipo === 'colorido') { g.shadowColor = '#ffe680'; g.shadowBlur = 18; }
      g.drawImage(im, -larg / 2, -alt / 2, larg, alt);
      g.restore();
    }
    if (algum && agora > this.proxQuack) {
      this.proxQuack = agora + 900 + Math.random() * 1800;
      const tipos = this.e.d.map((x) => x[1]);
      som.quack(AGUDO[tipos[Math.floor(Math.random() * tipos.length)]] ?? 1, 0.6);
    }
  }

  desenharCaindo(g, agora, dt) {
    this.caindo = this.caindo.filter((c) => {
      const k = agora - c.t0;
      if (k > 250) { c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += dt * 7 * c.dir; }
      if (!c.splash && c.y >= c.agua) {
        c.splash = true;
        som.splash();
        this.particulas.push({ tipo: 'agua', x: c.x, y: c.agua, t0: agora, vida: 700, tam: 120 });
        return false;
      }
      const nome = k < 250 ? 'cai-0' : `cai-${1 + (Math.floor(k / 120) % 3)}`;
      const im = IMG[nome];
      if (pronto(im)) {
        const larg = 110, alt = (larg * im.naturalHeight) / im.naturalWidth;
        g.save(); g.translate(c.x, c.y); g.scale(c.dir, 1); g.rotate(k < 250 ? 0 : c.rot);
        g.drawImage(im, -larg / 2, -alt / 2, larg, alt); g.restore();
      }
      return k < 6000;
    });
  }

  desenharParticulas(g, agora, dt, tela) {
    const vivas = [];
    for (const p of this.particulas) {
      if (!!p.tela !== tela) { vivas.push(p); continue; }
      const k = (agora - p.t0) / p.vida;
      if (k >= 1) continue;
      if (p.tipo === 'pena') {
        p.vx *= 0.95; p.vy = p.vy * 0.95 + 50 * dt; p.x += p.vx * dt + Math.sin(agora / 300 + p.rot) * 0.6; p.y += p.vy * dt; p.rot += p.vr * dt;
        const im = IMG[p.nome];
        if (pronto(im)) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1; g.drawImage(im, -6, -14, 12, 28); g.restore(); }
      } else if (p.tipo === 'agua' || p.tipo === 'sprite') {
        const im = p.tipo === 'agua' ? IMG[`agua-${Math.min(5, Math.floor(k * 6))}`] : IMG[p.nome];
        if (pronto(im)) {
          const w = p.tam * (p.tipo === 'agua' ? 1 : 0.8 + k * 0.6), h = (w * im.naturalHeight) / im.naturalWidth;
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          g.drawImage(im, p.x - w / 2, p.tipo === 'agua' ? p.y - h * 0.85 : p.y - h / 2, w, h); g.globalAlpha = 1;
        }
      } else if (p.tipo === 'cartucho') {
        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 14;
        const im = IMG['cartucho-1'];
        if (pronto(im)) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(im, -7, -12, 14, 24); g.restore(); }
      } else if (p.tipo === 'fumaca') {
        const im = IMG[`fumaca-${Math.min(2, Math.floor(k * 3))}`];
        p.y -= 30 * dt;
        if (pronto(im)) { const w = 50 + k * 50; g.globalAlpha = (1 - k) * 0.7; g.drawImage(im, p.x - w / 2, p.y - w / 2, w, w); g.globalAlpha = 1; }
      }
      vivas.push(p);
    }
    this.particulas = vivas.slice(-500);
  }

  desenharMiras(g, agora) {
    this.miras = this.miras.filter((m) => agora - m.t0 < 450);
    for (const m of this.miras) {
      const k = (agora - m.t0) / 450;
      const im = IMG[MIRA[this.cor(m.i)]];
      if (!pronto(im)) continue;
      const w = 70 * (1.3 - k * 0.4);
      g.globalAlpha = 1 - k;
      g.drawImage(im, m.x - w / 2, m.y - w / 2, w, w);
      if (k < 0.3) { const c = IMG.clarao; if (pronto(c)) g.drawImage(c, m.x - 30, m.y - 20, 60, 40); }
      g.globalAlpha = 1;
    }
    // minha mira segue o mouse (no computador)
    if (!this.toque && this.mouse && this.mouse.y < this.vh - this.hb) {
      const im = IMG[MIRA[this.cor(this.eu)]];
      const m = this.paraMundo(this.mouse);
      if (pronto(im)) g.drawImage(im, m.x - 32, m.y - 32, 64, 64);
    }
  }

  desenharTextos(g, agora) {
    this.textos = this.textos.filter((t) => agora - t.t0 < 1100);
    for (const t of this.textos) {
      const k = (agora - t.t0) / 1100;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const s = k < 0.15 ? volta(k / 0.15) : 1;
      const y = t.y - 50 * sai(k);
      if (t.sprite && pronto(IMG[t.sprite])) {
        const im = IMG[t.sprite], w = 60 * s, h = (w * im.naturalHeight) / im.naturalWidth;
        g.drawImage(im, t.x - w / 2, y - h / 2, w, h);
      } else rotulo(g, t.txt, t.x, y, t.cor, t.tam * s);
    }
    g.globalAlpha = 1;
  }

  /** A cerca de madeira embaixo, com as espingardas e os cartuchos de cada um. */
  desenharCerca(g, agora, dt) {
    const { vw, vh, hb } = this;
    const y0 = vh - hb;
    const gr = g.createLinearGradient(0, y0, 0, vh);
    gr.addColorStop(0, '#8a5a2b'); gr.addColorStop(0.15, '#6e4420'); gr.addColorStop(1, '#3d2410');
    g.fillStyle = gr; g.fillRect(0, y0, vw, hb);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    for (let y = y0 + hb * 0.33; y < vh; y += hb * 0.33) { g.beginPath(); g.moveTo(0, y); g.lineTo(vw, y); g.stroke(); }
    for (let x = 30; x < vw; x += 90) { g.fillStyle = 'rgba(40,20,5,.6)'; g.beginPath(); g.arc(x, y0 + hb * 0.16, 3, 0, Math.PI * 2); g.fill(); }
    // mourões
    g.fillStyle = '#7a4c22';
    for (let x = 0; x < vw + 60; x += vw / 6) { g.fillRect(x - 10, y0 - 22, 20, 24); g.fillStyle = '#5e3818'; g.fillRect(x - 10, y0 - 22, 20, 4); g.fillStyle = '#7a4c22'; }
    // capim na frente da cerca
    const capim = IMG['capim-0'];
    if (pronto(capim)) for (let x = -20; x < vw; x += 140) g.drawImage(capim, x, y0 - 40, 80, 50);
    const e = this.e;
    if (!e) return;
    for (let i = 0; i < e.n; i++) {
      const p = this.posArma(i), a = this.armas[i];
      if (!p) continue;
      a.ang = lerp(a.ang, a.alvo, Math.min(1, dt * 14));
      a.recuo = Math.max(0, a.recuo - dt * 6);
      a.alvo = lerp(a.alvo, -Math.PI / 2 + p.lado * 0.45, Math.min(1, dt * 0.6));   // volta devagar pra posição de descanso
      const im = IMG[`arma-${this.cor(i)}`];
      if (pronto(im)) {
        const w = p.comp * 1.5, h = (w * im.naturalHeight) / im.naturalWidth;
        // o cano do sprite aponta a CANO rad (cima-direita): gira pra onde mirou; do lado direito, espelha
        const rot = p.lado === 1 ? a.ang - CANO : Math.PI - a.ang - CANO;
        const px = p.x - Math.cos(a.ang) * a.recuo * 18, py = p.y + hb * 0.25 - Math.sin(a.ang) * a.recuo * 18;
        g.save();
        g.translate(px, py);
        g.scale(p.lado, 1);
        g.rotate(rot);
        g.globalAlpha = e.fora[i] ? 0.35 : 1;
        g.drawImage(im, -w * PIVO[0], -h * PIVO[1], w, h);
        g.restore();
        if (agora - a.clarao < 90) {
          const c = IMG.clarao;
          const bx = px + Math.cos(a.ang) * w * BOCA, by = py + Math.sin(a.ang) * w * BOCA;
          if (pronto(c)) { g.save(); g.translate(bx, by); g.rotate(a.ang); g.globalCompositeOperation = 'lighter'; g.drawImage(c, -10, -25, 80, 50); g.restore(); }
        }
      }
      // nome e cartuchos
      const cor = TOM[this.cor(i)];
      const recarregando = this.agoraServ() < e.recarregaAte[i];
      const bx = p.x - 52, by = vh - 22;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(bx - 4, by - 8, 112, 26, 8); g.fill();
      g.strokeStyle = cor; g.lineWidth = i === this.eu ? 2.5 : 1; g.stroke();
      if (recarregando) {
        const k = 1 - (e.recarregaAte[i] - this.agoraServ()) / RECARGA;
        g.fillStyle = cor; g.fillRect(bx, by + 10, 104 * Math.max(0, Math.min(1, k)), 4);
        rotulo(g, 'RECARREGANDO', p.x, by + 2, '#fff', 11);
      } else for (let k = 0; k < MUNICAO; k++) {
        const cheio = k < e.municao[i];
        g.fillStyle = cheio ? cor : 'rgba(255,255,255,.15)';
        g.beginPath(); g.roundRect(bx + 4 + k * 20, by - 4, 14, 18, 3); g.fill();
        if (cheio) { g.fillStyle = '#d9a640'; g.fillRect(bx + 4 + k * 20, by + 9, 14, 5); }
      }
      if (i === this.eu) this.B.recarga = { x: bx - 4, y: by - 30, w: 112, h: 56 };
    }
  }

  desenharHud(g, agora) {
    const e = this.e, vw = this.vw;
    // placar em cima: um cartão por caçador, e a rodada/tempo no meio
    const n = e.n, cw = Math.min(150, (vw - 200) / n), ch = 46;
    const ordem = [...Array(n).keys()];
    const meio = Math.ceil(n / 2);
    ordem.forEach((i, k) => {
      const x = k < meio ? 8 + k * (cw + 6) : vw - 8 - (n - k) * (cw + 6);
      const cor = TOM[this.cor(i)];
      g.globalAlpha = e.fora[i] ? 0.4 : 1;
      g.fillStyle = 'rgba(40,22,8,.85)'; g.strokeStyle = cor; g.lineWidth = i === this.eu ? 3 : 1.5;
      g.beginPath(); g.roundRect(x, 6, cw, ch, 10); g.fill(); g.stroke();
      g.font = '800 13px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText((i === this.eu ? 'Você' : this.nome(i)).slice(0, 9), x + 8, 20);
      const pato = IMG.patinho;
      if (pronto(pato)) g.drawImage(pato, x + 8, 28, 18, 18);
      g.font = '900 18px system-ui'; g.fillStyle = '#ffd23d'; g.fillText(String(e.pontos[i]), x + 30, 38);
      g.globalAlpha = 1;
    });
    // rodada e tempo
    const cx = vw / 2 + (n > 2 ? 0 : 0);
    const resta = e.fase === 'jogo' ? Math.max(0, e.fimRodada - this.agoraServ()) : e.fase === 'fim' ? 0 : TEMPO_RODADA;
    const seg = Math.ceil(resta / 1000);
    if (e.fase === 'jogo' && seg <= 5 && seg > 0 && seg !== this.ultimoBip) { this.ultimoBip = seg; som.bip(seg <= 2); }
    const px = n > 2 ? cx - 48 : cx - 48;
    g.fillStyle = 'rgba(40,22,8,.9)'; g.strokeStyle = '#d9a640'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(px, 4, 96, 50, 10); g.fill(); g.stroke();
    rotulo(g, `RODADA ${Math.max(1, e.rodada)}/${RODADAS}`, cx, 17, '#ffd23d', 11);
    rotulo(g, `00:${String(seg).padStart(2, '0')}`, cx, 38, seg <= 5 && e.fase === 'jogo' ? '#ff5a4a' : '#fff', 19);
    // botões
    for (const [k, ic] of [['sair', '✕'], ['mudo', som.mudo ? '🔇' : '🔊']]) {
      const r = this.B[k];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); g.fill();
      g.font = '17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(ic, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    // contagem / intervalo
    if (e.fase === 'contagem' || e.fase === 'intervalo') {
      const falta = Math.max(0, e.faseAte - this.agoraServ());
      const num = Math.ceil(falta / 1000);
      if (num !== this.ultimaContagem && num > 0 && num <= 3) { this.ultimaContagem = num; som.bip(false); }
      if (num <= 3) rotulo(g, String(num || ''), vw / 2, this.vh * 0.42, '#ffd23d', 90);
      if (e.fase === 'contagem') rotulo(g, this.toque ? 'Toque nos patos pra atirar · toque nos cartuchos pra recarregar' : 'Clique nos patos · R ou botão direito recarrega', vw / 2, this.vh * 0.42 + 70, '#fff', 15);
    }
    // cachorro entre as rodadas
    if (this.cachorro) {
      const k = (agora - this.cachorro.t0) / 1000;
      const sobe = this.cachorro.fica ? Math.min(1, k * 2) : k < 0.4 ? sai(k / 0.4) : k < 2.2 ? 1 : Math.max(0, 1 - (k - 2.2) * 3);
      const im = IMG.cachorro;
      if (pronto(im) && sobe > 0) {
        const h = this.hb * 1.4, w = (h * im.naturalWidth) / im.naturalHeight;
        const pulo = this.cachorro.ri ? Math.abs(Math.sin(agora / 110)) * 8 : 0;
        g.drawImage(im, vw / 2 - w / 2, this.vh - this.hb - h * 0.75 * sobe - pulo, w, h);
        if (!this.cachorro.ri && pronto(IMG['verde-0'])) g.drawImage(IMG['cai-0'], vw / 2 + w * 0.2, this.vh - this.hb - h * 0.85 * sobe, w * 0.6, w * 0.5);
      }
      if (k > 3 && !this.cachorro.fica) this.cachorro = null;
    }
    if (this.banner) {
      const k = (agora - this.banner.t0) / this.banner.dura;
      if (k >= 1) this.banner = null;
      else {
        g.save(); g.translate(vw / 2, this.vh * 0.28);
        const s = k < 0.15 ? volta(k / 0.15) : 1; g.scale(s, s);
        g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        const tam = Math.min(48, (vw * 0.8) / Math.max(5, this.banner.txt.length) * 1.7);
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
