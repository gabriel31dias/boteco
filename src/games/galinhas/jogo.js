import { ABATES_VITORIA, ARCO, ARMAS, BARRIL, BARRIS, CAIXA, CHAO, ESPINHOS, GALINHAS, ITENS, LARGURA, ALTURA, PLATAFORMAS, TEMPO_PARTIDA, mover } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles de Galinhas Psicopatas (canvas 2D). A rede, a
 * previsão, a proteção de conexão e os controles de toque são os de Ratos
 * Psicopatas (games/psicopatas/jogo.js); o cérebro, as explosões e a coroa
 * vêm dos assets de lá.
 *
 * O que é daqui:
 *  - andar com os quadros da folha (4 passos por ciclo), batendo asa no ar,
 *    planando, e a investida esticada com rastro;
 *  - a arma por cima da galinha: golpe 1 desce, golpe 2 sobe, o golpe final
 *    gira 360° com o arco vermelho; o forcado estoca pra frente;
 *  - morte conforme o golpe: corte decepa (a cabeça voa e o corpo sai
 *    correndo sem cabeça, jorrando), pancada esmaga (cérebro e olho voam),
 *    explosão vira pedaço e pena, espinho deixa espetada;
 *  - galinha sangrando pinga; penas voam em todo acerto;
 *  - o arco da morte (desenhado aqui, a folha não tem): gira com a mira, a
 *    corda puxa a cada flecha, e a contagem dos 10s fica em cima da cabeça.
 */

const A = import.meta.glob(['../../assets/galinhas/*.webp', '../../assets/psicopatas/cerebro-*.webp', '../../assets/psicopatas/explosao-*.webp',
  '../../assets/psicopatas/coroa.webp', '../../assets/psicopatas/caveira.webp'], { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const TOM = { branco: '#f2efe6', preto: '#8a8a99', amarelo: '#ffc93d', vermelho: '#ff4646' };
const AGUDO = { branco: 1.1, preto: 0.9, amarelo: 1.3, vermelho: 0.8 };
const QUADROS = { branco: 5, preto: 5, amarelo: 4, vermelho: 2 };   // quadros de andar na folha (o 0 é o parado)
const ALTO = 1.38;            // altura do desenho / altura do corpo (crista passa da caixa)
const PASSO = 30;             // px por pisada
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const sorteio = (lista, id) => lista[Math.abs(id) % lista.length];
const sai = (t) => 1 - (1 - t) * (1 - t);

/** Tamanho de cada arma na mão (altura no mundo). Todas desenhadas em pé: cabo embaixo, ponta em cima. */
const TAM_ARMA = { cutelo: 50, facao: 56, machete: 58, foice: 52, faca: 44, adaga: 40, machadinha: 48, machado: 58,
  porrete: 58, clava: 60, frigideira: 54, ossada: 52, marreta: 60, osso: 44, forcado: 78 };

const PES = new WeakMap();
function pesDe(im) {
  if (PES.has(im)) return PES.get(im);
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  const px = g.getImageData(0, Math.floor(H * 0.86), W, H - Math.floor(H * 0.86)).data;
  let soma = 0, n = 0;
  for (let k = 3; k < px.length; k += 4) if (px[k] > 128) { soma += ((k - 3) / 4) % W; n++; }
  const r = n ? soma / n / W : 0.5;
  PES.set(im, r);
  return r;
}

const FALA = {
  abate: ['VIROU CANJA!', 'QUEM QUER FRANGO?', 'NUGGETS!', 'COCORICÓ!', 'MAIS UMA PRO CALDO!', 'HAHAHA!', 'PÓ PÓ PÓ!', 'DESOSSADA!', 'CHURRASCO!'],
  morte: ['MEU PESCOÇO!', 'PÓÓÓÓÓ!', 'MINHAS ASAS!', 'NÃO NA PANELA!', 'AAAAARGH!', 'VOU VIRAR SOPA!', 'COCOR…', 'MAMÃÃÃE GALINHA!'],
  dor: ['PÓ!', 'AI MINHA ASA!', 'MEU BICO!', 'SANGUE!', 'POCÓ!', 'AAAI!', 'MINHA CRISTA!', 'ARGH!'],
  sangra: ['TÔ SANGRANDO!', 'UM OVO! UM OVO!', 'TÔ TONTA…'],
  arma: ['OLHA O TAMANHO DISSO!', 'AGORA SIM!', 'HEHEHE…', 'VEM PRA CÁ!'],
  ovo: ['NHAC!', 'OVINHO!'],
  gema: ['GEMA DE OURO!', 'NOVINHA!'],
  renasce: ['VOLTEI DO CALDO!', 'CADÊ VOCÊ?', 'QUERO SANGUE!', 'SEGUNDO ROUND!'],
  sozinho: ['OPS…', 'FOI DE PROPÓSITO!', 'NÃO OLHA!'],
  final: ['MORRE!', 'TOMA!', 'ACABOU!', 'HIIIIYA!'],
  arco: ['AGORA EU SOU ROBIN HOOD!', 'NINGUÉM ESCAPA!', 'HEHEHE… MIRA E…'],
};
const VERBO = {
  corte: ['decepou', 'degolou', 'fatiou', 'cortou a cabeça de', 'desmembrou'],
  pancada: ['esmagou', 'amassou', 'fez purê de', 'achatou', 'moeu'],
  perfura: ['espetou', 'espetinhou', 'furou', 'fez espetinho de'],
  bicada: ['bicou até a morte', 'depenou'],
  explosao: ['explodiu', 'fez pipoca de', 'mandou pelos ares'],
  sangue: ['sangrou', 'deixou sangrando'],
  espinho: ['empalou'],
  flecha: ['flechou', 'atravessou', 'pregou na parede', 'fez espetinho voador de'],
};
const POW = { corte: ['SHLAK!', 'SLICE!', 'CHOP!'], pancada: ['CRACK!', 'BONK!', 'TUM!', 'CRUNCH!'], perfura: ['SPLORT!', 'TCHAK!'], bicada: ['BICADA!'], flecha: ['FLECHADA!', 'TCHUNK!'] };
const MULTI = [null, null, 'MATANÇA DUPLA!', 'MATANÇA TRIPLA!', 'GALINHADA!'];
const SERIE = { 3: 'GALINHA PSICOPATA!', 5: 'AÇOUGUEIRA!', 7: 'MASSACRE NO GALINHEIRO!', 10: 'RAINHA DO CELEIRO!' };

/** Onde algo que cai em x, de y0 pra y1, pousa: chão ou topo de plataforma no caminho, ou null. */
function pousoEm(x, y0, y1) {
  if (y1 >= CHAO) return CHAO;
  let melhor = null;
  for (const [a, b, top] of PLATAFORMAS) if (x > a && x < b && y0 <= top && y1 >= top && (melhor == null || top < melhor)) melhor = top;
  return melhor;
}

export class Jogo {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ assento: number, jogadores: {name: string, avatar?: string|null, cor?: string}[], onEntrada: (e: object) => void, onSair: () => void, onCaiu?: () => void }} op
   */
  constructor(canvas, op) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = op;
    this.eu = op.assento;
    this.quadros = [];
    this.desvio = null;
    this.eventosPendentes = [];
    this.vistos = 0;
    this.efeitos = [];
    this.manchas = [];       // sangue no chão
    this.pocas = [];         // poças grandes (sprite) onde alguém morreu
    this.particulas = [];
    this.pedacos = [];       // gore e cabeças: voam, quicam e ficam no chão
    this.corpos = new Map(); // assento -> corpo (voando, correndo sem cabeça ou caído) até renascer
    this.textos = [];
    this.baloes = new Map();
    this.feed = [];
    this.anuncio = null;
    this.caixasVistas = new Map();
    this.golpes = [null, null, null, null];
    this.disparo = [0, 0, 0, 0];   // a corda do arco solta
    this.cravadas = [];            // flechas cravadas no chão (ficam um tempo)
    this.dor = [0, 0, 0, 0];
    this.gemido = [0, 0, 0, 0];
    this.amassa = [0, 0, 0, 0];
    this.chaoAntes = [true, true, true, true];
    this.passo = [0, 0, 0, 0];
    this.xAntes = [null, null, null, null];
    this.andar = [0, 0, 0, 0];
    this.serie = [0, 0, 0, 0];
    this.multi = [0, 0, 0, 0];
    this.ultimoAbate = [0, 0, 0, 0];
    this.asaSom = [0, 0, 0, 0];
    this.primeiroSangue = false;
    this.tremor = 0;
    this.ferido = 0;
    this.acertei = 0;
    this.batida = 0;
    this.ultimoBip = null;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });

    this.teclas = new Set();
    this.puloPendente = false;
    this.dashPendente = false;
    this.ovoPendente = false;
    this.mouse = null;
    this.mouseFogo = false;
    this.mouseAsa = false;
    this.toques = new Map();
    this.mira = op.assento % 2 ? Math.PI : 0;
    this.toque = matchMedia('(pointer: coarse)').matches;
    this.encerrado = false;
    this.chegou = performance.now();
    this.mirou = false;
    try { this.mirasAntes = Number(localStorage.getItem('galinhas-miras')) || 0; } catch { this.mirasAntes = 0; }

    this.cmdSeq = 0;
    this.pendentes = [];
    this.acumulado = 0;
    this.ultimoQuadro = null;
    this.pred = null;
    this.predAntes = null;
    this.corr = { x: 0, y: 0 };

    // penas caindo devagar pelo celeiro, o tempo todo
    for (let k = 0; k < 6; k++) this.penaNoAr(Math.random() * ALTURA);

    this.ligar();
    this.redimensionar();
    this.rodando = true;
    const quadro = () => { if (!this.rodando) return; this.desenhar(); requestAnimationFrame(quadro); };
    requestAnimationFrame(quadro);
  }

  destroy() {
    this.rodando = false;
    this.desligar();
    window.speechSynthesis?.cancel();
  }

  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? ['branco', 'preto', 'amarelo', 'vermelho'][i]; }
  tom(i) { return TOM[this.cor(i)]; }
  nome(i) { return (this.op.jogadores[i]?.name ?? GALINHAS[this.cor(i)]?.nome ?? '?').split(' ')[0]; }
  get ultimo() { return this.quadros[this.quadros.length - 1] ?? null; }

  // ------------------------------------------------------------ estado

  aplicar(e) {
    if (this.encerrado) return;
    this.chegou = performance.now();
    this.travou = false;
    this.reconciliar(e);
    const agora = performance.now();
    const d = e.agora - agora;
    this.desvio = this.desvio == null ? d : Math.max(d, this.desvio - 0.5);
    this.quadros.push(e);
    if (this.quadros.length > 30) this.quadros.shift();
    for (const ev of e.ev ?? []) {
      if (ev.id > this.vistos) { this.vistos = ev.id; this.eventosPendentes.push({ ...ev, t: e.agora }); }
    }
    if (e.fim) this.encerrar();
  }

  /** Fim da partida pra mim (ou conexão caiu): solta os controles e congela a minha galinha. */
  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.toques.clear(); this.teclas.clear();
    this.mouseFogo = false; this.mouseAsa = false; this.puloPendente = false; this.dashPendente = false; this.ovoPendente = false;
    this.pendentes = [];
  }

  mundo(e, eu) {
    return { seed: e.seed, cores: e.cores, barris: e.barris, ratos: e.r.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1] })) };
  }

  reconciliar(e) {
    const m = e.r[this.eu];
    const ack = m[6] ?? 0;
    this.pendentes = this.pendentes.filter((c) => c.s > ack);
    const pos = { x: m[0], y: m[1], vy: m[7], kx: m[8], chao: !!m[9], pulos: m[10], atravessa: m[11], dir: m[13], dash: m[15], dashCd: m[16], dashBateu: [], movendo: false };
    if (e.fase === 'jogo' && m[4]) {
      const w = this.mundo(e, pos);
      for (const c of this.pendentes) mover(w, this.eu, c, c.dt / 1000);
    }
    if (this.pred && m[4] && this.predVivo) {
      if (this.predAntes) { this.predAntes.x += pos.x - this.pred.x; this.predAntes.y += pos.y - this.pred.y; }
      this.corr.x += this.pred.x - pos.x;
      this.corr.y += this.pred.y - pos.y;
      if (Math.hypot(this.corr.x, this.corr.y) > 80) this.corr = { x: 0, y: 0 };
    } else this.corr = { x: 0, y: 0 };
    if (!this.predAntes || !this.predVivo || !m[4]) this.predAntes = { x: pos.x, y: pos.y };
    this.pred = pos;
    this.predVivo = !!m[4];
  }

  interpolar(t) {
    const q = this.quadros;
    if (!q.length) return null;
    let i = q.length - 1;
    while (i > 0 && q[i - 1].agora > t) i--;
    const b = q[i], a = q[i - 1] ?? b;
    const k = b.agora === a.agora ? 1 : Math.min(1, Math.max(0, (t - a.agora) / (b.agora - a.agora)));
    const ratos = b.r.map((rb, j) => {
      const ra = a.r[j] ?? rb;
      const kk = Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) > 120 ? 1 : k;
      return { x: lerp(ra[0], rb[0], kk), y: lerp(ra[1], rb[1], kk), ang: lerpAng(ra[2], rb[2], kk), vida: rb[3], vivo: !!rb[4], movendo: !!rb[5],
        vy: rb[7], chao: !!rb[9], protegido: !!rb[12], dir: rb[13], arma: rb[14], dash: rb[15], sangra: !!rb[17], ovo: !!rb[18], arco: rb[19] ?? 0 };
    });
    const ovos = b.ov.map(([id, x, y, dono]) => {
      const oa = a.ov.find((z) => z[0] === id);
      return { id, x: oa ? lerp(oa[1], x, k) : x, y: oa ? lerp(oa[2], y, k) : y, dono };
    });
    const extra = Math.max(0, t - b.agora) / 1000;
    const flechas = (b.fl ?? []).map(([id, x, y, ang, dono]) => {
      const fa = a.fl?.find((z) => z[0] === id);
      const ex = k >= 1 ? extra : 0;
      return { id, ang, dono, x: (fa ? lerp(fa[1], x, k) : x) + Math.cos(ang) * ARCO.vel * ex, y: (fa ? lerp(fa[2], y, k) : y) + Math.sin(ang) * ARCO.vel * ex };
    });
    return { ratos, ovos, flechas, caixas: b.cx, barris: b.barris, pegos: new Set(b.pegos ?? []) };
  }

  // ----------------------------------------------------------- eventos

  falar(i, lista, id, alto = false) {
    const txt = sorteio(lista, id);
    this.baloes.set(i, { txt, ate: performance.now() + 1600, ini: performance.now() });
    if (alto) som.fala(txt.toLowerCase(), AGUDO[this.cor(i)]);
  }

  anunciar(txt, cor = '#ff2a2a', voz = true) {
    this.anuncio = { txt, cor, ini: performance.now() };
    if (voz) som.fala(txt.toLowerCase(), 1, true);
  }

  tratarEventos(t, est) {
    const meu = est?.ratos[this.eu];
    const longe = (x, y) => (meu ? Math.max(0.35, 1 - Math.hypot(x - meu.x, y - meu.y) / 1500) : 1);
    while (this.eventosPendentes.length && this.eventosPendentes[0].t <= t) {
      const e = this.eventosPendentes.shift();
      const agora = performance.now();
      switch (e.tipo) {
        case 'golpe': {
          const a = ARMAS[e.arma];
          this.golpes[e.de] = { ini: agora, lado: e.lado, combo: e.combo, arma: e.arma };
          const final = e.combo === 3;
          this.efeitos.push({ tipo: 'corte', x: e.x, y: e.y, lado: e.lado, ini: agora, nome: final ? 'giro' : `corte-${e.combo - 1}`, final, sobe: e.combo === 2 });
          som.golpe(a.tipo !== 'corte' || final);
          if (final) {
            this.tremor = Math.max(this.tremor, e.de === this.eu ? 8 : 4);
            if (e.id % 2 === 0) this.falar(e.de, FALA.final, e.id, e.de === this.eu);
          }
          break;
        }
        case 'dash':
          this.efeitos.push({ tipo: 'rastro', i: e.i, x: e.x, y: e.y, dir: e.dir, ini: agora });
          this.poeira(e.x, e.y, 5);
          this.penas(e.x - e.dir * 20, e.y - 30, 4, -e.dir);
          if (e.i === this.eu) som.vupt();
          break;
        case 'acerto': this.acerto(e, est, agora, longe); break;
        case 'abate': this.abate(e, agora, longe); break;
        case 'renasce':
          this.corpos.delete(e.i);
          this.poeira(e.x, e.y, 6);
          this.penas(e.x, e.y - 40, 8, 0);
          this.efeitos.push({ tipo: 'anel', x: e.x, y: e.y - 30, cor: this.tom(e.i), ini: agora });
          this.xAntes[e.i] = null;
          if (e.i === this.eu) som.renasce();
          som.cacarejo(AGUDO[this.cor(e.i)], longe(e.x, e.y) * 0.8);
          if (e.id % 2 === 0) this.falar(e.i, FALA.renasce, e.id, e.i === this.eu);
          break;
        case 'pulo':
          this.poeira(e.x, e.y, e.duplo ? 2 : 4);
          if (e.duplo) { this.penas(e.x, e.y - 30, 3, 0); som.asa(longe(e.x, e.y)); }
          if (e.i === this.eu) som.pulo(e.duplo);
          break;
        case 'pega':
          this.brilho(e.x, e.y, e.item === 'gema' ? '#ffd23d' : '#fff6d8');
          this.textos.push({ x: e.x, y: e.y - 20, txt: e.item === 'gema' ? 'VIDA CHEIA!' : '+35', cor: '#5cff7a', ini: agora, tam: 24 });
          if (e.i === this.eu) som.pega(e.item === 'gema');
          this.falar(e.i, e.item === 'gema' ? FALA.gema : FALA.ovo, e.id, e.i === this.eu);
          break;
        case 'arma':
          this.brilho(e.x, e.y, e.arma === 'arco' ? '#ffd23d' : '#ff4040');
          this.lascas(e.x, e.y, 10);
          if (e.arma === 'arco') {
            this.anunciar(e.i === this.eu ? '🏹 ARCO DA MORTE! 10 SEGUNDOS!' : `🏹 ${this.nome(e.i).toUpperCase()} PEGOU O ARCO! CORRE!`, '#ffd23d', true);
            this.falar(e.i, FALA.arco, e.id, e.i === this.eu);
          } else {
            this.textos.push({ x: e.x, y: e.y - 30, txt: ARMAS[e.arma].nome.toUpperCase(), cor: '#ffd23d', ini: agora, tam: 26, pow: true });
            this.falar(e.i, FALA.arma, e.id, e.i === this.eu);
          }
          if (e.i === this.eu) som.troca(true);
          break;
        case 'caixa':
          if (e.arma === 'arco') this.anunciar('🏹 O ARCO DA MORTE CAIU!', '#ffd23d', false);
          else if (e.id % 2 === 0) this.textos.push({ x: e.x, y: 120, txt: '📦 ARMA CAINDO!', cor: '#fff', ini: agora, tam: 22 });
          break;
        case 'flecha':
          this.disparo[e.de] = agora;
          som.arco(longe(e.x, e.y));
          break;
        case 'cravou':
          this.cravadas.push({ x: e.x, y: e.y, ang: e.ang, ini: agora });
          if (this.cravadas.length > 20) this.cravadas.shift();
          this.poeira(e.x, e.y, 2);
          som.tunc(longe(e.x, e.y) * 0.8);
          break;
        case 'ovo':
          som.plop();
          break;
        case 'explosao':
          this.efeitos.push({ tipo: 'explosao', x: e.x, y: e.y, escala: e.ovo ? 1.2 : 1.6, ini: agora, rot: Math.random() * 0.4 - 0.2 });
          this.fumaca(e.x, e.y, 14, 1.4);
          this.lascas(e.x, e.y, e.ovo ? 6 : 14);
          if (e.ovo) for (let k = 0; k < 8; k++) this.particulas.push({ tipo: 'gema', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 500, vy: -200 - Math.random() * 300, vida: 1.2, idade: 0 });
          this.tremor = Math.max(this.tremor, 18);
          som.explosao(longe(e.x, e.y));
          break;
        case 'volta':
          this.poeira(BARRIS[e.barril][0], BARRIS[e.barril][1], 3);
          break;
        case 'fogo':
          som.bip(true);
          som.cacarejo(1, 1, 5);
          break;
      }
    }
  }

  acerto(e, est, agora, longe) {
    this.dor[e.alvo] = agora + 220;
    if (e.alvo === this.eu) { this.tremor = Math.max(this.tremor, e.sangrando ? 2 : 8); this.ferido = agora; }
    if (e.sangrando) {   // o sangramento: só pinga
      this.sangue(e.x, e.y, 6, 0, 0.6);
      return;
    }
    const de = e.de != null ? est?.ratos[e.de] : null, alvo = est?.ratos[e.alvo];
    const lado = de && alvo ? Math.sign(alvo.x - de.x) || 1 : 0;
    const forte = Math.min(1, e.dano / 50);
    this.sangue(e.x, e.y, 14 + Math.round(30 * forte), lado, 1 + forte);
    this.penas(e.x, e.y, 4 + Math.round(6 * forte), lado);
    this.efeitos.push({ tipo: 'jorro', x: e.x, y: e.y, lado, ini: agora, q: e.id % 7, tam: 36 + 44 * forte });
    this.textos.push({ x: e.x, y: e.y - 20, txt: `-${e.dano}`, cor: '#fff', ini: agora, tam: 22 + Math.min(16, e.dano / 3) });
    const pow = POW[e.jeito];
    if (pow) this.textos.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y - 50, txt: e.final ? 'GOLPE FINAL!' : sorteio(pow, e.id), cor: e.final ? '#ffd23d' : '#ff3a3a', ini: agora, tam: e.final ? 34 : 28, pow: true, longo: e.final });
    if (e.final) { this.clarao = { ini: agora, eu: e.de === this.eu || e.alvo === this.eu }; this.tremor = Math.max(this.tremor, 14); this.gibs(e.x, e.y, 2, lado); }
    if (e.de === this.eu) this.acertei = agora;
    if (e.jeito === 'corte' || e.jeito === 'perfura') som.corte(longe(e.x, e.y));
    else if (e.jeito === 'pancada') som.pancada(longe(e.x, e.y));
    else if (e.jeito === 'espinho') { som.corte(longe(e.x, e.y)); this.sangue(e.x, e.y, 20, 0, 1.4); }
    else if (e.jeito === 'flecha') { som.tunc(longe(e.x, e.y)); som.corte(longe(e.x, e.y)); this.sangue(e.x, e.y, 40, lado, 2); }
    else som.splat(longe(e.x, e.y));
    if (e.arma === 'frigideira') som.panela(longe(e.x, e.y));
    if (agora > this.gemido[e.alvo]) {
      this.gemido[e.alvo] = agora + 300;
      if (e.id % 2) som.cacarejo(AGUDO[this.cor(e.alvo)] * 1.3, longe(e.x, e.y), 3);
      else som.dor(AGUDO[this.cor(e.alvo)] * 1.4, longe(e.x, e.y));
    }
    if (e.id % 4 === 0) this.falar(e.alvo, e.jeito === 'corte' && e.id % 8 === 0 ? FALA.sangra : FALA.dor, e.id, e.alvo === this.eu);
  }

  /** Morte: cada jeito de morrer tem o seu show. Depois, kill feed e locutor. */
  abate(e, agora, longe) {
    const i = e.alvo, c = this.cor(i);
    const dir = e.dir || (Math.random() < 0.5 ? -1 : 1);
    this.serie[i] = 0;
    this.multi[i] = 0;
    const jeito = e.saiu ? 'saiu' : e.jeito;
    if (jeito === 'corte') {
      // DECEPADA: a cabeça voa girando, o corpo sai correndo sem cabeça e jorrando
      this.pedaco(`${c}-cabeca-${e.id % 6}`, e.x, e.y - 22, dir * (160 + Math.random() * 140), -720 - Math.random() * 160, 40, true);
      this.corpos.set(i, { modo: 'semcabeca', x: e.x, y: e.y + 30, vx: dir * 230, vy: 0, ini: agora, rot: 0 });
      this.sangue(e.x, e.y - 20, 50, 0, 2);
      this.textos.push({ x: e.x, y: e.y - 70, txt: 'DECEPADA!', cor: '#ffd23d', ini: agora, tam: 46, pow: true, longo: true });
      this.clarao = { ini: agora, eu: e.de === this.eu || e.alvo === this.eu };
      som.decepa(longe(e.x, e.y));
    } else if (jeito === 'pancada') {
      // ESMAGADA: cérebro e olho saltam, o corpo achata
      this.pedaco('cerebro-1', e.x, e.y - 20, dir * (120 + Math.random() * 120), -660, 30);
      this.pedaco('cerebro-0', e.x, e.y - 20, -dir * 80, -540, 18);
      this.pedaco(`olho-${e.id % 2}`, e.x, e.y - 15, -dir * (100 + Math.random() * 100), -500, 14);
      this.corpos.set(i, { modo: 'achatado', x: e.x, y: e.y + 30, ini: agora });
      this.sangue(e.x, e.y, 60, 0, 1.8);
      this.gibs(e.x, e.y, 4, dir);
      this.textos.push({ x: e.x, y: e.y - 70, txt: 'ESMAGADA!', cor: '#ffd23d', ini: agora, tam: 46, pow: true, longo: true });
      this.clarao = { ini: agora, eu: e.de === this.eu || e.alvo === this.eu };
      som.gore(longe(e.x, e.y));
    } else if (jeito === 'explosao') {
      // ESTOURADA: vira pedaço e pena
      this.gibs(e.x, e.y, 12, 0);
      this.penas(e.x, e.y, 30, 0);
      this.efeitos.push({ tipo: 'estouro', x: e.x, y: e.y + 10, ini: agora });
      this.sangue(e.x, e.y, 70, 0, 2.2);
      this.pedaco(`${c}-cabeca-${e.id % 6}`, e.x, e.y - 20, dir * 200, -800, 34, true);
      som.gore(longe(e.x, e.y));
    } else if (jeito === 'espinho') {
      this.corpos.set(i, { modo: 'caido', x: e.x, y: e.y + 30, ini: agora });
      this.sangue(e.x, e.y + 20, 40, 0, 1.4);
      this.textos.push({ x: e.x, y: e.y - 60, txt: 'EMPALADA!', cor: '#ffd23d', ini: agora, tam: 40, pow: true, longo: true });
      som.gore(longe(e.x, e.y));
    } else if (jeito === 'flecha') {
      // FLECHADA: o corpo é arrastado pela flecha, espetado, e cai
      this.corpos.set(i, { modo: 'voa', flecha: true, x: e.x, y: e.y, vx: dir * 520, vy: -260, rot: 0, vr: dir * 4, ini: agora });
      this.sangue(e.x, e.y, 60, dir, 2);
      this.textos.push({ x: e.x, y: e.y - 70, txt: 'FLECHADA!', cor: '#ffd23d', ini: agora, tam: 46, pow: true, longo: true });
      this.clarao = { ini: agora, eu: e.de === this.eu || e.alvo === this.eu };
      som.gore(longe(e.x, e.y));
    } else {
      // espetada, bicada, sangrou: o corpo voa girando e cai
      this.corpos.set(i, { modo: 'voa', x: e.x, y: e.y, vx: dir * (260 + (e.id % 5) * 40), vy: -560, rot: 0, vr: dir * 9, ini: agora });
      this.sangue(e.x, e.y, 50, dir, 1.8);
      this.gibs(e.x, e.y, 4, dir);
      som.gore(longe(e.x, e.y));
    }
    if (jeito !== 'saiu') {
      this.pocas.push({ x: e.x, y: pousoEm(e.x, e.y + 20, ALTURA) ?? CHAO, nome: `poca-${e.id % 9}`, ini: agora });
      if (this.pocas.length > 12) this.pocas.shift();
    }
    this.penas(e.x, e.y, 16, dir);
    this.tremor = Math.max(this.tremor, i === this.eu ? 22 : 12);
    som.berro(AGUDO[c], longe(e.x, e.y));
    if (e.saiu) { this.feed.unshift({ txt: `${this.nome(i)} fugiu do galinheiro`, de: i, ini: agora }); this.feed = this.feed.slice(0, 5); return; }
    this.falar(i, FALA.morte, e.id, i === this.eu);
    if (i === this.eu) som.fala(sorteio(['póóóóóó!', 'aaaaaaaaah!', 'nããão!'], e.id), AGUDO[c], true);
    const de = e.de;
    if (de != null && de !== i) {
      setTimeout(() => this.falar(de, FALA.abate, e.id + 1, de === this.eu), 500);
      setTimeout(() => som.cacarejo(AGUDO[this.cor(de)], 1, 5), 350);
      const verbo = sorteio(VERBO[e.jeito] ?? VERBO.corte, e.id);
      this.feed.unshift({ txt: `${{ corte: '🔪', pancada: '🔨', explosao: '🥚', espinho: '📌', flecha: '🏹' }[e.jeito] ?? '💀'} ${this.nome(de)} ${verbo} ${this.nome(i)}`, de, ini: agora });
      this.serie[de]++;
      this.multi[de] = agora - this.ultimoAbate[de] < 3500 ? this.multi[de] + 1 : 1;
      this.ultimoAbate[de] = agora;
      const quem = de === this.eu ? '' : `${this.nome(de).toUpperCase()}: `;
      const voz = de === this.eu || i === this.eu;
      if (!this.primeiroSangue) { this.primeiroSangue = true; this.anunciar(`${quem}PRIMEIRO SANGUE!`, '#ff2a2a', voz); }
      else if (this.multi[de] >= 2) this.anunciar(`${quem}${MULTI[Math.min(4, this.multi[de])]}`, '#ff8a1a', voz);
      else if (SERIE[this.serie[de]]) this.anunciar(`${quem}${SERIE[this.serie[de]]}`, '#c43bff', voz);
    } else {
      this.feed.unshift({ txt: `${this.nome(i)} ${e.jeito === 'espinho' ? 'se empalou sozinha' : 'morreu sozinha'}`, de: i, ini: agora });
      setTimeout(() => this.falar(i, FALA.sozinho, e.id, i === this.eu), 300);
    }
    this.feed = this.feed.slice(0, 5);
  }

  poeira(x, y, n) {
    for (let k = 0; k < n; k++) this.particulas.push({ tipo: 'fumaca', x: x + (k - (n - 1) / 2) * 8, y: y - 4, vx: (k - (n - 1) / 2) * 30, vy: -20 - Math.random() * 20, r: 4 + Math.random() * 4, cinza: true, vida: 0.5, idade: 0 });
  }
  fumaca(x, y, n, forca) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (10 + Math.random() * 40) * forca;
      this.particulas.push({ tipo: 'fumaca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, r: 6 + Math.random() * 10 * forca, vida: 0.8 + Math.random() * 0.7, idade: 0 });
    }
  }
  sangue(x, y, n, lado = 0, forca = 1) {
    for (let k = 0; k < n; k++) {
      const a = lado ? (lado > 0 ? -0.4 : Math.PI + 0.4) + (Math.random() - 0.5) * 1.6 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = (90 + Math.random() * 280) * forca;
      this.particulas.push({ tipo: 'sangue', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 * forca, r: 1.5 + Math.random() * 2.8 * Math.min(1.6, forca), vida: 2, idade: 0 });
    }
  }
  /** Penas brancas voando e caindo balançando. `lado` empurra pra um lado. */
  penas(x, y, n, lado = 0) {
    for (let k = 0; k < n; k++) {
      const a = lado ? (lado > 0 ? -0.6 : Math.PI + 0.6) + (Math.random() - 0.5) * 1.8 : Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 220;
      this.particulas.push({ tipo: 'pena', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, rot: Math.random() * 6, fase: Math.random() * 6, sangue: Math.random() < 0.35, vida: 2.5 + Math.random() * 2, idade: 0 });
    }
  }
  penaNoAr(y = -20) {
    this.particulas.push({ tipo: 'pena', ambiente: true, x: Math.random() * LARGURA, y, vx: 10 + Math.random() * 20, vy: 18 + Math.random() * 14, rot: Math.random() * 6, fase: Math.random() * 6, sangue: Math.random() < 0.2, vida: 40, idade: 0 });
  }
  lascas(x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = -Math.random() * Math.PI, v = 150 + Math.random() * 300;
      this.particulas.push({ tipo: 'lasca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, s: 3 + Math.random() * 5, vida: 0.9, idade: 0 });
    }
  }
  brilho(x, y, cor) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, cor, vida: 0.45, idade: 0 });
    }
  }
  pedaco(nome, x, y, vx, vy, w, cabeca = false) {
    this.pedacos.push({ nome, x, y, vx, vy, w, cabeca, rot: Math.random() * 6, vr: (Math.random() - 0.5) * (cabeca ? 26 : 18), ini: performance.now(), parado: false });
    if (this.pedacos.length > 70) this.pedacos.shift();
  }
  gibs(x, y, n, lado) {
    for (let k = 0; k < n; k++) {
      const a = lado ? (lado > 0 ? -0.9 : Math.PI + 0.9) + (Math.random() - 0.5) * 1.4 : -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 220 + Math.random() * 380;
      this.pedaco(Math.random() < 0.08 ? 'coxa-grande' : `pedaco-${Math.floor(Math.random() * 16)}`, x, y, Math.cos(a) * v, Math.sin(a) * v - 150, 18 + Math.random() * 14);
    }
  }
  manchar(x, y, r) {
    this.manchas.push({ x, y, r: r * (1.6 + Math.random()), ini: performance.now() });
    if (this.manchas.length > 140) this.manchas.shift();
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat && (k === 'w' || k === ' ' || k === 'arrowup')) this.puloPendente = true;
        if (!e.repeat && (k === 'shift' || k === 'q')) this.dashPendente = true;
        if (!e.repeat && k === 'e') this.ovoPendente = true;
        this.teclas.add(k);
        destravar();
      },
      teclaSobe: (e) => this.teclas.delete(e.key.toLowerCase()),
      desce: (e) => this.ponteiroDesce(e),
      move: (e) => this.ponteiroMove(e),
      sobe: (e) => this.ponteiroSobe(e),
      resize: () => this.redimensionar(),
      blur: () => { this.teclas.clear(); this.mouseFogo = false; this.mouseAsa = false; this.toques.clear(); },
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

  paraVirtual(cx, cy) { return this.girado ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; }
  paraMundo(v) { return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc }; }

  botoes() {
    const s = Math.min(this.vw, this.vh), m = 12;
    if (!this.toque) return { sair: { x: 14, y: this.vh - 52, w: 40, h: 40 }, mudo: { x: 62, y: this.vh - 52, w: 40, h: 40 } };
    // no toque: tudo pequeno e encostado nos cantos (igual Ratos em Guerra)
    const joy = { x: m + s * 0.12, y: this.vh - m - s * 0.12, r: s * 0.12 };
    const fogo = { x: this.vw - m - s * 0.11, y: this.vh - m - s * 0.11, r: s * 0.11 };
    const pr = s * 0.075, br = s * 0.06;
    const pulo = { x: fogo.x - fogo.r - 12 - pr, y: this.vh - m - pr, r: pr };
    const ovo = { x: fogo.x, y: fogo.y - fogo.r - 12 - br, r: br };
    return {
      sair: { x: 8, y: joy.y - joy.r - 84, w: 34, h: 34 },
      mudo: { x: 8, y: joy.y - joy.r - 44, w: 34, h: 34 },
      joy, fogo, pulo, ovo,
      dash: { x: pulo.x, y: ovo.y, r: br },
    };
  }

  ponteiroDesce(e) {
    destravar();
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') this.toque = true;
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (e.pointerType === 'mouse') {
      this.mouseV = v;
      if (e.button === 0) this.mouseFogo = true;
      if (e.button === 2) { this.puloPendente = true; this.mouseAsa = true; }   // direito pula (segurando, plana)
      if (e.button === 1) { e.preventDefault(); this.dashPendente = true; }
      return;
    }
    e.preventDefault();
    for (const nome of ['dash', 'ovo', 'pulo']) {
      if (Math.hypot(v.x - b[nome].x, v.y - b[nome].y) < b[nome].r * 1.45) {
        this[`${nome}Pendente`] = true;
        this.toques.set(e.pointerId, { tipo: nome, x0: v.x, y0: v.y, x: v.x, y: v.y });
        return;
      }
    }
    if (v.x < this.vw / 2) {
      this.toques.set(e.pointerId, { tipo: 'mover', x0: v.x, y0: v.y, x: v.x, y: v.y, pulou: false });
      return;
    }
    const noFogo = Math.hypot(v.x - b.fogo.x, v.y - b.fogo.y) < b.fogo.r * 1.6;
    this.toques.set(e.pointerId, noFogo
      ? { tipo: 'mirar', x0: b.fogo.x, y0: b.fogo.y, x: v.x, y: v.y }
      : { tipo: 'apontar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  aprendeuMirar() {
    if (this.mirou) return;
    this.mirou = true;
    try { localStorage.setItem('galinhas-miras', String(this.mirasAntes + 1)); } catch { /* sem storage */ }
  }

  ponteiroMove(e) {
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { this.mouseV = v; this.toque = false; return; }
    const t = this.toques.get(e.pointerId);
    if (!t) return;
    t.x = v.x; t.y = v.y;
    if (t.tipo === 'mover') {
      const r = this.botoes().joy?.r ?? 1;
      if (!t.pulou && t.y0 - t.y > r * 0.55) { t.pulou = true; this.puloPendente = true; }
      if (t.y0 - t.y < r * 0.3) t.pulou = false;
    }
  }

  ponteiroSobe(e) {
    if (e.pointerType === 'mouse') { if (e.button === 2) this.mouseAsa = false; else this.mouseFogo = false; return; }
    this.toques.delete(e.pointerId);
  }

  enviarEntrada(est) {
    if (this.encerrado) return;
    let mx = 0, fogo = false, desce = false, asa = false;
    const k = this.teclas;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('s') || k.has('arrowdown')) desce = true;
    if (k.has('w') || k.has(' ') || k.has('arrowup') || this.mouseAsa) asa = true;
    if (this.mouseFogo) fogo = true;
    const meu = est?.ratos[this.eu];
    this.mouse = this.mouseV ? this.paraMundo(this.mouseV) : null;
    if (meu && this.mouse && !this.toque) this.mira = Math.atan2(this.mouse.y - (meu.y - 32), this.mouse.x - meu.x);
    const bt = this.botoes(), r = bt.joy?.r ?? 1;
    let mirando = false;
    for (const t of this.toques.values()) {
      const dx = t.x - t.x0, dy = t.y - t.y0, d = Math.hypot(dx, dy);
      if (t.tipo === 'mover') {
        if (Math.abs(dx) > 8) mx = Math.max(-1, Math.min(1, dx / r));
        if (dy > r * 0.55) desce = true;
        if (t.pulou) asa = true;
      }
      if (t.tipo === 'pulo') asa = true;
      if (t.tipo === 'mirar') { fogo = true; mirando = true; if (d > (bt.fogo?.r ?? 60) * 0.2) { this.mira = Math.atan2(dy, dx); this.aprendeuMirar(); } }
      if (t.tipo === 'apontar') {
        fogo = true; mirando = true;
        if (meu) { const m = this.paraMundo(t); this.mira = Math.atan2(m.y - (meu.y - 32), m.x - meu.x); this.aprendeuMirar(); }
      }
    }
    if (this.toque && !mirando && mx) this.mira = mx > 0 ? 0 : Math.PI;
    mx = Math.round(mx * 100) / 100;
    const ang = Math.round(this.mira * 100) / 100;

    const agora = performance.now();
    this.acumulado = Math.min(150, this.acumulado + (this.ultimoQuadro == null ? 0 : agora - this.ultimoQuadro));
    this.ultimoQuadro = agora;
    const novos = [];
    const e = this.ultimo;
    while (this.acumulado >= 33) {
      this.acumulado -= 33;
      const c = { s: ++this.cmdSeq, mx, pulo: this.puloPendente, asa, desce, dt: 33, ang, fogo, dash: this.dashPendente, ovo: this.ovoPendente };
      this.puloPendente = false;
      this.dashPendente = false;
      this.ovoPendente = false;
      novos.push(c);
      this.pendentes.push(c);
      if (e && this.pred && e.fase === 'jogo' && this.predVivo) {
        this.predAntes = { x: this.pred.x, y: this.pred.y };
        mover(this.mundo(e, this.pred), this.eu, c, 0.033);
      }
    }
    if (novos.length) this.op.onEntrada({ cmds: novos });
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
    this.esc = Math.min(this.vw / LARGURA, this.vh / ALTURA);
    this.ox = (this.vw - LARGURA * this.esc) / 2;
    this.oy = (this.vh - ALTURA * this.esc) / 2;
  }

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, h, base = false, sy = 1 } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale(virar ? -1 : 1, sy);
    g.globalAlpha = alfa;
    g.drawImage(im, -w / 2, base ? -hh : -hh / 2, w, hh);
    g.restore();
  }

  /** O celeiro: a pintura e o que mexe nela (lâmpadas piscando, sol pulsando, raios de luz). */
  desenharFazenda(agora) {
    const g = this.ctx;
    if (pronto(IMG.fundo)) g.drawImage(IMG.fundo, 0, 0, LARGURA, ALTURA);
    else { g.fillStyle = '#3a1a10'; g.fillRect(0, 0, LARGURA, ALTURA); }
    g.save();
    g.globalCompositeOperation = 'lighter';
    // sol se pondo, pulsando devagar
    const sol = 0.18 + Math.sin(agora / 1600) * 0.04;
    let gr = g.createRadialGradient(1215, 255, 0, 1215, 255, 260);
    gr.addColorStop(0, `rgba(255,170,60,${sol})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(955, 0, 520, 520);
    // lâmpadas do celeiro: piscam de vez em quando
    for (const [x, y, r, k] of [[145, 145, 120, 1], [222, 398, 130, 2], [493, 425, 130, 3]]) {
      const pisca = Math.sin(agora / 70 + k * 9) > 0.95 ? 0.2 : 1;
      const a = (0.2 + Math.sin(agora / 900 + k) * 0.04) * pisca;
      gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,190,90,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // raios de luz atravessando o celeiro
    g.globalAlpha = 0.05 + Math.sin(agora / 2000) * 0.02;
    g.fillStyle = '#ffd59a';
    for (const x0 of [640, 760, 880]) { g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 60, 0); g.lineTo(x0 - 140, ALTURA); g.lineTo(x0 - 240, ALTURA); g.closePath(); g.fill(); }
    g.restore();
  }

  desenharCenario(est, agora) {
    const g = this.ctx;
    // poças onde alguém morreu (ficam bastante)
    this.pocas = this.pocas.filter((m) => agora - m.ini < 30_000);
    for (const m of this.pocas) {
      const k = (agora - m.ini) / 30_000, cresce = Math.min(1, (agora - m.ini) / 900);
      this.sprite(m.nome, m.x, m.y + 2, 110 * (0.4 + cresce * 0.6), { base: true, alfa: 0.9 * (1 - k * k) });
    }
    this.manchas = this.manchas.filter((m) => agora - m.ini < 20_000);
    for (const m of this.manchas) {
      const k = (agora - m.ini) / 20_000;
      g.save();
      g.globalAlpha = 0.9 * (1 - k * k);
      g.fillStyle = '#7d0a0e';
      g.beginPath(); g.ellipse(m.x, m.y, m.r * 1.7, m.r * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b3121a';
      g.beginPath(); g.ellipse(m.x - m.r * 0.3, m.y - m.r * 0.08, m.r * 0.7, m.r * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    this.cravadas = this.cravadas.filter((f) => agora - f.ini < 8000);
    for (const f of this.cravadas) {
      g.save(); g.globalAlpha = Math.min(1, (8000 - (agora - f.ini)) / 800);
      g.translate(f.x, f.y); g.rotate(Math.max(0.35, Math.min(1.2, Math.abs(f.ang))) * (Math.cos(f.ang) < 0 ? -1 : 1) + (Math.cos(f.ang) < 0 ? Math.PI : 0));
      flecha(g, 40, 0.6);
      g.restore();
    }
    for (const [a, b] of ESPINHOS) this.sprite('espinhos', (a + b) / 2, CHAO + 6, (b - a) + 16, { base: true });
    if (!est) return;
    for (const [k, [x, y]] of BARRIS.entries()) {
      if (est.barris[k]) continue;
      this.sprite('barril', x, y + 2, BARRIL.w + 10, { base: true, h: BARRIL.h + 8 });
    }
    for (const it of ITENS) {
      if (est.pegos.has(it.id)) continue;
      const k = it.x + it.y;
      const bob = Math.sin(agora / 300 + k) * 4;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(it.x, it.y - 22 + bob, 0, it.x, it.y - 22 + bob, 32);
      gr.addColorStop(0, it.tipo === 'gema' ? 'rgba(255,200,40,.5)' : 'rgba(255,240,200,.4)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(it.x - 32, it.y - 54 + bob, 64, 64);
      g.restore();
      this.sprite(it.tipo, it.x, it.y - 20 + bob, it.tipo === 'gema' ? 32 : 26, { rot: Math.sin(agora / 500 + k) * 0.15 });
    }
    // caixas de arma: caem do céu de paraquedas de sangue, e a arma brilha em cima
    for (const [id, x, y, arma] of est.caixas) {
      if (!this.caixasVistas.has(id)) this.caixasVistas.set(id, agora);
      const t = Math.min(1, (agora - this.caixasVistas.get(id)) / CAIXA.queda);
      const yy = lerp(-60, y, t * t);
      if (t < 1 && Math.random() < 0.4) this.particulas.push({ tipo: 'faisca', x: x + (Math.random() - 0.5) * 30, y: yy - 30, vx: 0, vy: -60, cor: '#ffcf6a', vida: 0.3, idade: 0 });
      if (t >= 1 && !this.caixasVistas.get(`p${id}`)) { this.caixasVistas.set(`p${id}`, 1); this.poeira(x, y, 6); this.lascas(x, y - 10, 5); }
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(x, yy - 50, 0, x, yy - 50, 46);
      gr.addColorStop(0, `rgba(255,60,40,${0.35 + Math.sin(agora / 200) * 0.15})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - 46, yy - 96, 92, 92);
      g.restore();
      this.sprite('caixa', x, yy, 40, { base: true });
      if (arma === 'arco') {   // o arco: brilho dourado forte e o arco girando em cima
        g.save(); g.globalCompositeOperation = 'lighter';
        const ga = g.createRadialGradient(x, yy - 55, 0, x, yy - 55, 70);
        ga.addColorStop(0, `rgba(255,210,60,${0.5 + Math.sin(agora / 120) * 0.2})`); ga.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ga; g.fillRect(x - 70, yy - 125, 140, 140); g.restore();
        g.save(); g.translate(x, yy - 60 + Math.sin(agora / 250) * 5); g.rotate(-Math.PI / 2 + Math.sin(agora / 300) * 0.3); arco(g, 46, 1); g.restore();
        if (Math.random() < 0.3) this.particulas.push({ tipo: 'faisca', x: x + (Math.random() - 0.5) * 50, y: yy - 60 + (Math.random() - 0.5) * 50, vx: 0, vy: -40, cor: '#ffe27a', vida: 0.4, idade: 0 });
      } else this.sprite(`arma-${arma}`, x, yy - 62 + Math.sin(agora / 250 + id) * 4, 22, { h: 40, rot: Math.sin(agora / 400 + id) * 0.25 });
    }
  }

  /** Quadro do corpo: no ar, batendo asa; no chão, o ciclo de passos (a pisada escolhe). */
  quadroCorpo(i, r, agora) {
    const c = this.cor(i), n = QUADROS[c];
    if (r.dash > 0) return `${c}-anda-${Math.min(2, n - 1)}`;
    if (!r.chao) return `${c}-anda-${n > 2 ? 1 + (Math.floor(agora / (r.vy > 0 && r.vy <= 175 ? 70 : 120)) % 2) : Math.floor(agora / 100) % 2}`;
    if (this.andar[i] < 0.15) return `${c}-anda-0`;
    return n > 2 ? `${c}-anda-${1 + (Math.floor(this.passo[i] * 2) % (n - 1))}` : `${c}-anda-${Math.floor(this.passo[i]) % 2}`;
  }

  desenharGalinha(i, r, agora) {
    const g = this.ctx;
    const c = this.cor(i), k = GALINHAS[c];
    const dt = this.dtQuadro ?? 0.016;
    const esq = Math.cos(r.ang) < 0;
    const lado = r.dash > 0 ? r.dir : esq ? -1 : 1;
    if (r.chao && !this.chaoAntes[i]) { this.amassa[i] = 1; if (i === this.eu) som.pouso(); this.poeira(r.x, r.y, 3); }
    this.chaoAntes[i] = r.chao;
    this.amassa[i] *= 0.82;
    const dx = this.xAntes[i] == null ? 0 : Math.abs(r.x - this.xAntes[i]);
    this.xAntes[i] = r.x;
    const andando = r.chao && dx > 0.3 && dx < 40;
    this.andar[i] += ((andando ? 1 : 0) - this.andar[i]) * Math.min(1, dt * 12);
    if (andando) {
      const antes = Math.floor(this.passo[i] * 2);
      this.passo[i] += dx / PASSO;
      if (Math.floor(this.passo[i] * 2) !== antes) {   // pé bateu
        this.amassa[i] = Math.max(this.amassa[i], 0.3);
        this.particulas.push({ tipo: 'fumaca', x: r.x - lado * k.w * 0.4, y: r.y - 3, vx: -lado * 30, vy: -12, r: 3 + Math.random() * 2, cinza: true, vida: 0.35, idade: 0 });
      }
    }
    // planando: bate asa (som e pena de vez em quando)
    const planando = !r.chao && r.vy > 0 && r.vy <= 175;
    if (planando && agora > this.asaSom[i]) { this.asaSom[i] = agora + 140; if (i === this.eu) som.asa(0.6); if (Math.random() < 0.3) this.penas(r.x, r.y - 30, 1, 0); }
    // sangrando: pinga
    if (r.sangra && Math.random() < 0.5) this.particulas.push({ tipo: 'sangue', x: r.x + (Math.random() - 0.5) * k.w, y: r.y - k.h * 0.5, vx: (Math.random() - 0.5) * 30, vy: 0, r: 1.5 + Math.random() * 1.5, vida: 2, idade: 0 });
    const fr = (this.passo[i] * 2) % 1;
    const n = this.andar[i];
    const bob = -Math.sin(fr * Math.PI) * 4 * n;
    const a = this.amassa[i];
    const estica = !r.chao ? Math.min(0.12, Math.abs(r.vy) / 6000) : 0;
    const respira = r.chao ? Math.sin(agora / 380 + i * 2) * 0.03 * (1 - n) : 0;
    let sx = 1 + a * 0.22 - estica - respira, sy = 1 - a * 0.22 + estica + respira;
    if (r.dash > 0) { sx = 1.25; sy = 0.82; }
    const rebola = Math.sin(fr * Math.PI * 2) * 0.05 * n;
    const inclina = (0.08 * n + (r.dash > 0 ? 0.35 : 0) + (r.chao ? 0 : Math.max(-0.15, Math.min(0.15, r.vy / 4000)))) * lado;

    const nome = this.quadroCorpo(i, r, agora);
    const im = IMG[nome], ref = IMG[`${c}-anda-0`];
    if (!pronto(im) || !pronto(ref)) return;
    const esc = (k.h * ALTO) / ref.naturalHeight;
    const w = im.naturalWidth * esc, h = im.naturalHeight * esc;
    const pe = pesDe(im);
    g.save(); g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(r.x, r.y + 2, k.w * 0.7, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();

    // investida: fantasmas atrás
    if (r.dash > 0) {
      for (let q = 1; q <= 3; q++) {
        g.save(); g.globalAlpha = 0.25 / q;
        g.translate(r.x - lado * q * 22, r.y); g.rotate(inclina); g.scale(sx * lado, sy);
        g.drawImage(im, -w * pe, -h, w, h); g.restore();
      }
    }
    g.save();
    g.translate(r.x, r.y + bob);
    g.rotate(inclina + rebola);
    g.scale(sx * lado, sy);
    g.globalAlpha = r.protegido ? (Math.floor(agora / 90) % 2 ? 0.35 : 0.9) : 1;
    const golpe = this.golpes[i] && agora - this.golpes[i].ini < 380 ? this.golpes[i] : null;
    const corpo = () => g.drawImage(im, -w * pe, -h, w, h);
    corpo();
    if (this.dor[i] > agora) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; corpo(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    if (r.sangra) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.18 + Math.sin(agora / 120) * 0.08; g.fillStyle = '#c00'; g.fillRect(-w, -h, w * 2, h); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    this.desenharArma(i, r, k, agora, golpe, esq === (lado < 0));
    g.restore();

    if (r.protegido) {
      g.save(); g.strokeStyle = `${this.tom(i)}aa`; g.lineWidth = 3;
      g.beginPath(); g.arc(r.x, r.y - k.h / 2, k.h * 0.75 + Math.sin(agora / 100) * 2, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    const e = this.ultimo;
    if (e) {
      const max = Math.max(...e.abates);
      if (max > 0 && e.abates[i] === max && e.abates.filter((v) => v === max).length === 1) {
        this.sprite('coroa', r.x, r.y - k.h * ALTO - 4 + bob + Math.sin(agora / 250) * 3, 30, { rot: Math.sin(agora / 400) * 0.15 });
      }
    }
    if (r.arco > 0) {   // contagem do arco: anel dourado que esvazia
      const cy = r.y - k.h * ALTO - 22, f = r.arco / ARCO.dura;
      g.save();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 6; g.beginPath(); g.arc(r.x, cy, 13, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = r.arco < 3000 && Math.floor(agora / 150) % 2 ? '#ff4040' : '#ffd23d'; g.lineWidth = 4;
      g.beginPath(); g.arc(r.x, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); g.stroke();
      g.font = '900 13px "Barlow Semi Condensed", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(String(Math.ceil(r.arco / 1000)), r.x, cy + 1);
      g.textBaseline = 'alphabetic';
      g.restore();
    }
    const bw = 54, bx = r.x - bw / 2, by = r.y - k.h - 34;
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
    const pv = r.vida / k.vida;
    g.fillStyle = r.sangra ? '#ff2020' : pv > 0.5 ? '#3ddc5a' : pv > 0.25 ? '#ffc53d' : '#ff4d4d';
    g.fillRect(bx, by, bw * Math.max(0, Math.min(1, pv)), 5);
    g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = this.tom(i);
    const rotulo = i === this.eu ? 'VOCÊ' : this.nome(i).toUpperCase();
    g.strokeText(rotulo, r.x, by - 5); g.fillText(rotulo, r.x, by - 5);
    // mira (a mesma dos ratos), mais curta: o alcance da arma
    if (i === this.eu) {
      const alc = r.arco > 0 ? 160 : ARMAS[r.arma]?.alcance ?? 60;
      g.save(); g.translate(r.x, r.y - k.h * 0.5); g.rotate(r.ang);
      g.strokeStyle = 'rgba(255,80,80,.6)'; g.setLineDash([5, 7]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(k.w / 2 + 6, 0); g.lineTo(k.w / 2 + alc - 8, 0); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(k.w / 2 + alc, 0, 6, 0, Math.PI * 2); g.stroke();
      if (agora - this.acertei < 160) {
        g.strokeStyle = '#ff3030'; g.lineWidth = 2.5;
        const cx = k.w / 2 + alc;
        g.beginPath(); g.moveTo(cx - 9, -9); g.lineTo(cx - 4, -4); g.moveTo(cx + 9, -9); g.lineTo(cx + 4, -4);
        g.moveTo(cx - 9, 9); g.lineTo(cx - 4, 4); g.moveTo(cx + 9, 9); g.lineTo(cx + 4, 4); g.stroke();
      }
      g.restore();
    }
  }

  /**
   * A arma, no espaço da galinha (pés na origem, olhando pra direita). Em
   * descanso, erguida pra frente. Golpe 1 desce, golpe 2 sobe, golpe final
   * dá a volta inteira; o forcado estoca reto pra frente.
   */
  desenharArma(i, r, k, agora, golpe, miraNoLado) {
    const g = this.ctx;
    const mira = Math.cos(r.ang) < 0 ? Math.PI - r.ang : r.ang;
    const rel = miraNoLado ? Math.atan2(Math.sin(mira), Math.cos(mira)) : 0;
    if (r.arco > 0) {
      // arco na mão, apontando pra mira; a corda volta devagar depois de soltar
      const solto = Math.min(1, (agora - this.disparo[i]) / ARCO.cd);
      g.save();
      g.translate(k.w * 0.45, -k.h * 0.5);   // na frente do peito
      g.rotate(rel);
      arco(g, 48, solto);
      g.restore();
      return;
    }
    const im = IMG[`arma-${r.arma}`];
    if (!pronto(im)) return;
    const perfura = ARMAS[r.arma]?.tipo === 'perfura';
    let ang, avanca = 0;
    if (golpe) {
      const t = Math.min(1, (agora - golpe.ini) / 380);
      if (perfura) { ang = Math.PI / 2 + rel; avanca = Math.sin(Math.min(1, t * 2.2) * Math.PI) * 30; }
      else if (golpe.combo === 3) ang = lerp(-1.4, -1.4 + Math.PI * 2, sai(t)) ;
      else if (golpe.combo === 2) ang = t < 0.5 ? lerp(1.7, -1.6, sai(t / 0.5)) : lerp(-1.6, -0.5, (t - 0.5) / 0.5);
      else ang = t < 0.45 ? lerp(-1.9, 1.5, sai(t / 0.45)) : lerp(1.5, -0.5, (t - 0.45) / 0.55);
      if (!perfura) ang += rel * 0.4;
    } else ang = perfura ? Math.PI / 2 + rel * 0.6 : 0.35 + rel * 0.3 + Math.sin(agora / 300 + i) * 0.06;   // erguida, a ponta pra frente
    // a arma é desenhada em pé (ponta pra cima): ângulo 0 da galinha = arma deitada pra frente
    g.save();
    g.translate(k.w * 0.12 + Math.cos(ang - Math.PI / 2) * avanca, -k.h * 0.45 + Math.sin(ang - Math.PI / 2) * avanca);
    g.rotate(ang);
    const hh = TAM_ARMA[r.arma] ?? 50, w = (hh * im.naturalWidth) / im.naturalHeight;
    g.drawImage(im, -w / 2, -hh * 0.88, w, hh);
    g.restore();
  }

  desenharBalao(i, x, y, agora) {
    const b = this.baloes.get(i);
    if (!b) return;
    if (agora > b.ate) { this.baloes.delete(i); return; }
    const g = this.ctx;
    const entra = Math.min(1, (agora - b.ini) / 120);
    g.save();
    g.translate(x, y);
    g.scale(entra, entra);
    g.font = '900 15px "Barlow Semi Condensed", system-ui, sans-serif';
    const w = g.measureText(b.txt).width + 18, h = 26;
    g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(-w / 2, -h - 10, w, h, 10); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-6, -11); g.lineTo(0, -1); g.lineTo(6, -11); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-6, -10); g.lineTo(0, -1); g.lineTo(6, -10); g.stroke();
    g.fillStyle = '#8b0000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.txt, 0, -h / 2 - 10);
    g.restore();
  }

  desenhar() {
    const g = this.ctx;
    const agora = performance.now();
    const dt = Math.min(0.05, (agora - (this.ultimoDesenho ?? agora)) / 1000);
    this.ultimoDesenho = agora;
    this.dtQuadro = dt;
    const tServ = this.desvio == null ? 0 : agora + this.desvio - ATRASO;
    const est = this.interpolar(tServ);
    this.tratarEventos(tServ, est);
    // no meio do jogo o servidor manda estado ~30x por segundo: 3s calado é conexão com problema
    if (!this.encerrado && !this.travou && this.ultimo?.fase === 'jogo' && agora - this.chegou > 3000) { this.travou = true; this.op.onCaiu?.(); }
    this.enviarEntrada(est);
    if (est && this.pred && this.predVivo) {
      this.corr.x *= 0.82; this.corr.y *= 0.82;
      const r = est.ratos[this.eu];
      const f = Math.min(1, this.acumulado / 33);
      const ax = this.predAntes ? lerp(this.predAntes.x, this.pred.x, f) : this.pred.x;
      const ay = this.predAntes ? lerp(this.predAntes.y, this.pred.y, f) : this.pred.y;
      Object.assign(r, { x: ax + this.corr.x, y: ay + this.corr.y, ang: this.mira, vy: this.pred.vy, chao: this.pred.chao, movendo: this.pred.movendo, dash: this.pred.dash, dir: this.pred.dir });
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#1a0a06';
    g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }

    g.save();
    this.tremor *= 0.87;
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharFazenda(agora);
    this.desenharCenario(est, agora);

    if (est) {
      this.desenharCorpos(dt, agora);
      this.desenharPedacos(dt, agora);
      for (const [i, r] of est.ratos.entries()) if (r.vivo && !this.ultimo?.fora?.[i]) this.desenharGalinha(i, r, agora);
      for (const o of est.ovos) {
        const pisca = Math.floor(agora / 90) % 2 === 0;
        this.sprite('ovo', o.x, o.y, 20, { rot: agora / 80 + o.id });
        if (pisca) {
          g.save(); g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, 18);
          gr.addColorStop(0, 'rgba(255,60,40,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(o.x - 18, o.y - 18, 36, 36); g.restore();
        }
        if (Math.random() < 0.5) this.particulas.push({ tipo: 'fumaca', x: o.x, y: o.y, vx: 0, vy: -10, r: 3, cinza: true, vida: 0.4, idade: 0 });
      }
      for (const f of est.flechas) {
        g.save(); g.translate(f.x, f.y); g.rotate(f.ang);
        g.globalAlpha = 0.35; g.strokeStyle = '#fff'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-40, 0); g.lineTo(-90, 0); g.stroke(); g.globalAlpha = 1;   // rastro
        flecha(g, 40);
        g.restore();
      }
    }

    this.desenharParticulas(dt);
    this.desenharEfeitos(agora);
    if (est) {
      for (const [i, r] of est.ratos.entries()) if (r.vivo) this.desenharBalao(i, r.x, r.y - GALINHAS[this.cor(i)].h - 44, agora);
      for (const [i, v] of this.corpos) this.desenharBalao(i, v.x, v.y - 60, agora);
    }
    this.desenharTextos(agora);
    g.restore();

    this.desenharHud(agora, est);
    this.desenharControles();
  }

  /**
   * Corpos até renascer: voando e girando; correndo sem cabeça (o clássico da
   * galinha), jorrando do pescoço, até tombar; achatado; ou caído.
   */
  desenharCorpos(dt, agora) {
    const g = this.ctx;
    for (const [i, v] of this.corpos) {
      const c = this.cor(i), k = GALINHAS[c];
      const vivo = agora - v.ini;
      const sumir = Math.max(0.35, 1 - vivo / 4000);
      if (v.modo === 'semcabeca' && vivo < 1700) {
        // corre pra lá e pra cá sem cabeça, tropeçando, jorrando do pescoço
        const antes = v.y;
        if (Math.random() < 0.025) v.vx = -v.vx;
        v.vy += 1500 * dt; v.x += v.vx * dt; v.y += v.vy * dt;
        if (v.x < 30 || v.x > LARGURA - 30) v.vx = -v.vx;
        const top = v.vy > 0 ? pousoEm(v.x, antes, v.y) : null;
        if (top != null) { v.y = top; v.vy = Math.random() < 0.06 ? -380 : 0; }
        const im = IMG[`${c}-anda-${1 + (Math.floor(vivo / 70) % (QUADROS[c] - 1 || 1))}`] ?? IMG[`${c}-anda-0`], ref = IMG[`${c}-anda-0`];
        if (pronto(im) && pronto(ref)) {
          const esc = (k.h * ALTO) / ref.naturalHeight, w = im.naturalWidth * esc, h = im.naturalHeight * esc;
          g.save();
          g.translate(v.x, v.y - Math.abs(Math.sin(vivo / 60)) * 5);
          g.rotate(Math.sin(vivo / 90) * 0.25);
          g.scale(v.vx < 0 ? -1 : 1, 1);
          g.beginPath(); g.rect(-w, -h * 0.52, w * 2, h * 0.6); g.clip();   // corta o pescoço pra cima: sem cabeça
          g.drawImage(im, -w * pesDe(im), -h, w, h);
          g.restore();
          // pescoço jorrando
          for (let q = 0; q < 3; q++) this.particulas.push({ tipo: 'sangue', x: v.x + (v.vx < 0 ? -1 : 1) * 6, y: v.y - h * 0.5, vx: (Math.random() - 0.5) * 140, vy: -260 - Math.random() * 220, r: 1.5 + Math.random() * 2.2, vida: 2, idade: 0 });
        }
        continue;
      }
      if (v.modo === 'semcabeca') { v.modo = 'caido'; this.sangue(v.x, v.y - 20, 20, 0, 1); this.poeira(v.x, v.y, 4); }
      if (v.modo === 'voa') {
        const antes = v.y;
        v.vy += 1500 * dt; v.x += v.vx * dt; v.y += v.vy * dt; v.rot += v.vr * dt;
        if (vivo < 1500 && Math.random() < 0.7) this.particulas.push({ tipo: 'sangue', x: v.x, y: v.y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, r: 1.5 + Math.random() * 2.5, vida: 2, idade: 0 });
        if (v.x < 20 || v.x > LARGURA - 20) v.vx = -v.vx * 0.5;
        const top = v.vy > 0 ? pousoEm(v.x, antes, v.y) : null;
        if (top != null) { v.y = top; v.vy *= -0.3; v.vx *= 0.5; v.vr *= 0.4; if (Math.abs(v.vy) < 60) { v.modo = 'caido'; } }
        this.sprite(`${c}-corpo`, v.x, v.y, 76, { rot: v.rot, alfa: sumir, virar: v.vx < 0 });
        if (v.flecha) { g.save(); g.translate(v.x, v.y - 6); g.rotate(v.rot + (v.vx < 0 ? Math.PI : 0)); flecha(g, 46); g.restore(); }
        continue;
      }
      const sy = v.modo === 'achatado' ? 0.55 : 1;
      this.sprite(`${c}-corpo`, v.x, v.y + 4, v.modo === 'achatado' ? 96 : 80, { base: true, sy, alfa: sumir });
    }
  }

  desenharPedacos(dt, agora) {
    this.pedacos = this.pedacos.filter((p) => agora - p.ini < 16_000);
    for (const p of this.pedacos) {
      if (!p.parado) {
        const antes = p.y;
        p.vy += 1400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.x < 5 || p.x > LARGURA - 5) { p.vx *= -0.5; p.x = Math.max(5, Math.min(LARGURA - 5, p.x)); }
        if (Math.random() < (p.cabeca ? 0.9 : 0.4)) this.particulas.push({ tipo: 'sangue', x: p.x, y: p.y, vx: 0, vy: 0, r: 1.2 + Math.random() * (p.cabeca ? 2.5 : 1.5), vida: 2, idade: 0 });
        const top = p.vy > 0 ? pousoEm(p.x, antes, p.y) : null;
        if (top != null) {
          p.y = top - 3;
          this.manchar(p.x, top - 2, p.cabeca ? 5 : 3);
          if (p.vy < 160) { p.parado = true; p.vy = 0; if (p.cabeca) p.rot = Math.PI / 2 * (p.vx < 0 ? -1 : 1); } else { p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
        }
      }
      const k = (agora - p.ini) / 16_000;
      this.sprite(p.nome, p.x, p.y - p.w * 0.3, p.w, { rot: p.rot, alfa: Math.min(1, (1 - k) * 4) });
    }
  }

  desenharParticulas(dt) {
    const g = this.ctx;
    this.particulas = this.particulas.filter((p) => (p.idade += dt) < p.vida && p.y < ALTURA + 40);
    if (this.particulas.length > 1500) this.particulas.splice(0, this.particulas.length - 1500);
    let noAr = 0;
    for (const p of this.particulas) {
      const k = p.idade / p.vida;
      const ay = p.y;
      if (p.tipo === 'pena') {
        // cai balançando de um lado pro outro, devagar
        if (p.ambiente) noAr++;
        p.vx *= 0.97; p.vy = Math.min(p.vy + 200 * dt, p.ambiente ? 30 : 60);
        p.x += (p.vx + Math.sin(p.idade * 3 + p.fase) * 40) * dt; p.y += p.vy * dt;
        p.rot = Math.sin(p.idade * 3 + p.fase) * 0.8;
        const top = pousoEm(p.x, ay, p.y);
        if (top != null) { p.y = top - 2; p.vx = 0; p.vy = 0; if (p.ambiente) p.vida = Math.min(p.vida, p.idade + 3); }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = Math.min(1, (1 - k) * 4) * 0.95;
        g.fillStyle = p.sangue ? '#f3d6d6' : '#fffaf0';
        g.beginPath(); g.ellipse(0, 0, 7, 2.6, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = p.sangue ? '#b3121a' : '#cfc8b8'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
        g.restore();
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'fumaca') {
        p.vx *= 0.96; p.vy *= 0.96;
        g.fillStyle = p.cinza ? `rgba(190,160,120,${0.35 * (1 - k)})` : `rgba(60,55,55,${0.45 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'faisca') {
        g.strokeStyle = p.cor ?? `rgba(255,${210 - k * 120},80,${1 - k})`;
        g.globalAlpha = 1 - k; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
        g.globalAlpha = 1;
      } else if (p.tipo === 'sangue') {
        p.vy += 1300 * dt;
        const top = p.vy > 0 ? pousoEm(p.x, ay, p.y) : null;
        if (top != null) { this.manchar(p.x, top - 2, p.r); p.idade = p.vida; continue; }
        g.fillStyle = '#b5101a';
        const ang = Math.atan2(p.vy, p.vx), comp = Math.min(3, 1 + Math.hypot(p.vx, p.vy) / 250);
        g.beginPath(); g.ellipse(p.x, p.y, p.r * comp, p.r, ang, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'gema') {
        p.vy += 1300 * dt;
        const top = p.vy > 0 ? pousoEm(p.x, ay, p.y) : null;
        if (top != null) { p.idade = p.vida; continue; }
        g.fillStyle = '#ffc21a'; g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'lasca') {
        p.vy += 900 * dt; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - k; g.fillStyle = '#8a5a2b'; g.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); g.restore();
      }
    }
    if (noAr < 6 && Math.random() < 0.02) this.penaNoAr();
  }

  desenharEfeitos(agora) {
    const g = this.ctx;
    const dura = { explosao: 5 * 70, anel: 450, jorro: 220, corte: 240, rastro: 260, estouro: 600 };
    this.efeitos = this.efeitos.filter((e) => agora - e.ini < dura[e.tipo]);
    for (const e of this.efeitos) {
      const t = agora - e.ini, k = t / dura[e.tipo];
      if (e.tipo === 'explosao') {
        const q = Math.min(4, Math.floor(t / 70));
        g.save(); g.globalCompositeOperation = q < 2 ? 'lighter' : 'source-over';
        this.sprite(`explosao-${q}`, e.x, e.y, [80, 110, 130, 140, 140][q] * e.escala, { rot: e.rot, alfa: q === 4 ? 1 - (t - 280) / 70 : 1 });
        g.restore();
      } else if (e.tipo === 'anel') {
        g.save(); g.strokeStyle = e.cor; g.globalAlpha = 1 - k; g.lineWidth = 4;
        g.beginPath(); g.arc(e.x, e.y, 20 + k * 60, 0, Math.PI * 2); g.stroke(); g.restore();
      } else if (e.tipo === 'jorro') {
        this.sprite(`jorro-${e.q}`, e.x + e.lado * k * 14, e.y, e.tam * (0.6 + k * 0.6), { alfa: 1 - k, virar: e.lado < 0, rot: (e.q - 3) * 0.2 });
      } else if (e.tipo === 'corte') {
        const w = e.final ? 150 : 74;
        this.sprite(e.nome, e.x, e.y, w * (0.8 + k * 0.4), { alfa: 1 - k * k, virar: e.lado < 0, rot: e.final ? 0 : (e.sobe ? -0.5 : 0.5) * e.lado, sy: e.sobe ? -1 : 1 });
      } else if (e.tipo === 'rastro') {
        g.save(); g.globalAlpha = 0.6 * (1 - k); g.strokeStyle = '#fff'; g.lineWidth = 3;
        for (let q = 0; q < 4; q++) { const yy = e.y - 15 - q * 12; g.beginPath(); g.moveTo(e.x - e.dir * (20 + k * 60), yy); g.lineTo(e.x - e.dir * (80 + k * 90), yy); g.stroke(); }
        g.restore();
      } else if (e.tipo === 'estouro') {
        this.sprite('estouro', e.x, e.y, 110 * (0.7 + k * 0.5), { base: true, alfa: 1 - k * k });
      }
    }
  }

  desenharTextos(agora) {
    const g = this.ctx;
    this.textos = this.textos.filter((t) => agora - t.ini < (t.longo ? 1500 : 900));
    for (const t of this.textos) {
      const k = (agora - t.ini) / (t.longo ? 1500 : 900);
      const pop = t.pow ? 1 + Math.max(0, 0.6 - k * 4) : 1;
      g.save();
      g.globalAlpha = 1 - k * k;
      g.translate(t.x, t.y - k * 40);
      g.scale(pop, pop);
      if (t.pow) g.rotate(-0.15);
      g.font = `italic 900 ${t.tam}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 5; g.strokeStyle = t.pow ? '#2a0000' : '#000'; g.strokeText(t.txt, 0, 0);
      g.fillStyle = t.cor; g.fillText(t.txt, 0, 0);
      g.restore();
    }
  }

  desenharHud(agora, est) {
    const g = this.ctx;
    const vw = this.vw, vh = this.vh;
    if (this.clarao && agora - this.clarao.ini < 260) {
      const k = (agora - this.clarao.ini) / 260;
      g.fillStyle = this.clarao.eu ? `rgba(255,40,40,${0.35 * (1 - k)})` : `rgba(255,255,255,${0.18 * (1 - k)})`;
      g.fillRect(0, 0, vw, vh);
    }
    const meu = est?.ratos[this.eu];
    const pv = meu?.vivo ? meu.vida / GALINHAS[this.cor(this.eu)].vida : 1;
    const ferido = Math.max(0, 1 - (agora - this.ferido) / 350);
    const baixa = pv < 0.35 ? (0.35 - pv) / 0.35 * (0.6 + Math.sin(agora / 140) * 0.4) : 0;
    if (pv < 0.35 && agora > this.batida) { this.batida = agora + 850; som.coracao(); }
    const forca = Math.max(ferido * 0.55, baixa * 0.7, meu?.sangra ? 0.25 : 0);
    if (forca > 0.01) {
      const gr = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(160,0,0,${forca})`);
      g.fillStyle = gr; g.fillRect(0, 0, vw, vh);
    }
    const e = this.ultimo;
    if (!e) return;
    const n = e.r.length;
    const porLado = Math.ceil(n / 2);
    const w = Math.min(260, (vw - 160) / 2 / porLado - 8), h = 54, y = 8;
    const compacto = w < 190;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 1, k = Math.floor(i / 2);
      const x = dir ? vw - 10 - (k + 1) * w - k * 8 : 10 + k * (w + 8);
      g.save();
      if (e.fora?.[i]) g.globalAlpha = 0.4;
      g.fillStyle = 'rgba(30,8,4,.82)';
      g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
      g.strokeStyle = this.tom(i); g.lineWidth = i === this.eu ? 3 : 2; g.stroke();
      const lado = compacto ? 36 : 44, ax = dir ? x + w - lado - 6 : x + 6, ay = y + (h - lado) / 2;
      const foto = this.fotos[i];
      g.save(); g.beginPath(); g.roundRect(ax, ay, lado, lado, 8); g.clip();
      g.fillStyle = `${this.tom(i)}44`; g.fillRect(ax, ay, lado, lado);
      const cara = IMG[`${this.cor(i)}-cabeca-0`];
      if (pronto(foto)) g.drawImage(foto, ax, ay, lado, lado);
      else if (pronto(cara)) g.drawImage(cara, ax, ay - 2, lado, lado * 1.25);
      if (!e.r[i]?.[4]) { g.fillStyle = 'rgba(140,0,0,.6)'; g.fillRect(ax, ay, lado, lado); }
      g.restore();
      const tx = dir ? ax - 8 : ax + lado + 8;
      g.textAlign = dir ? 'right' : 'left';
      g.font = `800 ${compacto ? 13 : 15}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(this.nome(i) + (i === this.eu ? ' ★' : '') + (e.fora?.[i] ? ' · saiu' : ''), tx, y + 20);
      g.font = `600 ${compacto ? 10 : 11}px system-ui, sans-serif`;
      g.fillStyle = '#ffcf9e';
      const arcoMs = e.r[i]?.[19] ?? 0;
      if (arcoMs > 0) g.fillStyle = '#ffd23d';
      g.fillText((arcoMs > 0 ? `🏹 ARCO ${Math.ceil(arcoMs / 1000)}s` : `${ARMAS[e.r[i]?.[14]]?.nome ?? ''}`.toUpperCase()) + (e.r[i]?.[18] ? '  🥚' : ''), tx, y + 34);
      g.font = 'italic 900 22px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ff3b3b';
      g.textAlign = dir ? 'left' : 'right';
      g.fillText(`${e.abates[i]}`, dir ? x + 10 : x + w - 10, y + 30);
      g.font = '800 12px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ffe28a';
      g.fillText(`💀 ${e.mortes?.[i] ?? 0}`, dir ? x + 10 : x + w - 10, y + 47);
      g.restore();
    }
    g.textAlign = 'center';
    g.fillStyle = 'rgba(30,8,4,.85)';
    g.beginPath(); g.roundRect(vw / 2 - 64, 8, 128, 50, 12); g.fill();
    g.font = '700 11px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = '#ff9a9a';
    g.fillText(`${ABATES_VITORIA} ABATES LEVA`, vw / 2, 23);
    const resta = e.fase === 'jogo' && e.fimEm ? Math.max(0, e.fimEm - (agora + this.desvio)) : TEMPO_PARTIDA;
    const seg = Math.ceil(resta / 1000);
    g.font = '900 24px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = seg <= 15 && e.fase === 'jogo' ? '#ff6b6b' : '#fff';
    g.fillText(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 50);
    // combo da minha galinha
    const meuGolpe = this.golpes[this.eu];
    if (meuGolpe && agora - meuGolpe.ini < 900 && meuGolpe.combo > 1) {
      g.save();
      g.font = `italic 900 ${meuGolpe.combo === 3 ? 30 : 24}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.fillStyle = meuGolpe.combo === 3 ? '#ffd23d' : '#ff6a3a'; g.strokeStyle = '#000'; g.lineWidth = 5;
      const txt = meuGolpe.combo === 3 ? 'GOLPE FINAL!' : `COMBO x${meuGolpe.combo}`;
      g.globalAlpha = 1 - (agora - meuGolpe.ini) / 900;
      g.strokeText(txt, vw / 2, 86); g.fillText(txt, vw / 2, 86);
      g.restore();
    }

    this.feed = this.feed.filter((f) => agora - f.ini < 5000);
    g.font = '700 13px "Barlow Semi Condensed", system-ui, sans-serif';
    this.feed.forEach((f, k) => {
      const yy = 82 + k * 24;
      const wt = g.measureText(f.txt).width + 20;
      g.globalAlpha = Math.min(1, (5000 - (agora - f.ini)) / 600);
      g.fillStyle = 'rgba(40,0,0,.7)';
      g.beginPath(); g.roundRect(vw - wt - 12, yy - 15, wt, 21, 8); g.fill();
      g.fillStyle = this.tom(f.de); g.textAlign = 'right';
      g.fillText(f.txt, vw - 22, yy);
      g.globalAlpha = 1;
    });

    if (this.anuncio && agora - this.anuncio.ini < 1800) {
      const t = (agora - this.anuncio.ini) / 1800;
      const tam = Math.min(60, vw * 0.055);
      const pop = 1 + Math.max(0, 0.5 - t * 5);
      g.save();
      g.translate(vw / 2, vh * 0.26);
      g.scale(pop, pop);
      g.rotate(-0.05 + Math.sin(agora / 60) * 0.01);
      g.globalAlpha = t < 0.8 ? 1 : (1 - t) / 0.2;
      g.font = `italic 900 ${tam}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = tam / 6; g.strokeStyle = '#000'; g.strokeText(this.anuncio.txt, 0, 0);
      g.fillStyle = this.anuncio.cor; g.fillText(this.anuncio.txt, 0, 0);
      g.restore();
      g.textBaseline = 'alphabetic';
    }

    let faixa = null, cor = '#fff', grande = true;
    if (e.fase === 'contagem') {
      const s = Math.ceil((e.faseAte - (agora + this.desvio)) / 1000);
      if (s >= 1 && s !== this.ultimoBip) { this.ultimoBip = s; som.bip(false); }
      faixa = s >= 1 ? String(s) : 'MATEM!'; cor = s >= 1 ? '#ff3b3b' : '#ff5a3d';
    } else if (e.fase === 'jogo' && e.fimEm && agora + this.desvio - (e.fimEm - TEMPO_PARTIDA) < 800) {
      faixa = 'MATEM!'; cor = '#ff2a2a';
    } else if (e.fase === 'jogo' && !e.r[this.eu]?.[4] && !e.fora?.[this.eu]) {
      faixa = 'VOCÊ VIROU CANJA!'; cor = '#ff3b3b'; grande = false;
    }
    if (faixa) {
      const tam = grande ? Math.min(120, vh * 0.22) : Math.min(46, vw * 0.045);
      const pulso = 1 + Math.sin(agora / 90) * 0.04;
      g.save();
      g.translate(vw / 2, vh / 2);
      g.scale(pulso, pulso);
      g.rotate(-0.04);
      g.font = `italic 900 ${tam}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = tam / 7; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(faixa, 0, 0);
      g.fillStyle = cor; g.fillText(faixa, 0, 0);
      if (!grande) {
        g.font = '700 18px "Barlow Semi Condensed", system-ui, sans-serif';
        g.fillStyle = '#fff'; g.lineWidth = 4;
        g.strokeText('voltando já já…', 0, tam * 0.9); g.fillText('voltando já já…', 0, tam * 0.9);
      }
      g.restore();
      g.textBaseline = 'alphabetic';
    }
  }

  desenharControles() {
    const g = this.ctx;
    const b = this.botoes();
    for (const [r, txt] of [[b.sair, '✕'], [b.mudo, som.mudo ? '🔇' : '🔊']]) {
      g.fillStyle = 'rgba(30,8,4,.7)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.font = `${Math.round(r.w / 2)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.textBaseline = 'alphabetic';
    }
    if (!this.toque) {
      g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.65)';
      g.fillText('A/D anda · W/espaço pula (2x; segure pra planar) · S desce · Shift/Q investida · E ovo-bomba · mouse mira · clique golpeia (3 seguidos = golpe final)', this.vw - 12, this.vh - 14);
      return;
    }
    const mover = [...this.toques.values()].find((t) => t.tipo === 'mover');
    const jx = mover?.x0 ?? b.joy.x, jy = mover?.y0 ?? b.joy.y;
    g.save();
    g.globalAlpha = mover ? 0.8 : 0.25;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(jx, jy, b.joy.r, 0, Math.PI * 2); g.fill(); g.stroke();
    if (mover) {
      const dx = mover.x - mover.x0, dy = mover.y - mover.y0, d = Math.hypot(dx, dy), f = Math.min(1, b.joy.r / Math.max(1, d)) * 0.6;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(jx + dx * f, jy + dy * f, b.joy.r * 0.32, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    const ativo = (tipo) => [...this.toques.values()].find((t) => t.tipo === tipo);
    const mirar = ativo('mirar');
    g.save();
    g.globalAlpha = mirar ? 0.9 : 0.4;
    g.fillStyle = '#b3121a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(b.fogo.x, b.fogo.y, b.fogo.r * (mirar ? 1.08 : 1), 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${b.fogo.r * 0.5}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText((this.ultimo?.r[this.eu]?.[19] ?? 0) > 0 ? '🏹' : '🔪', b.fogo.x, b.fogo.y + 2);
    if (!mirar && !this.mirou && this.mirasAntes < 3 && this.ultimo?.fase !== 'fim') {
      const pulsa = (Math.sin(performance.now() / 260) + 1) / 2;
      g.save();
      g.globalAlpha = 0.55 + pulsa * 0.45;
      g.fillStyle = '#fff';
      const R = b.fogo.r + 8 + pulsa * 5;
      for (let q = 0; q < 4; q++) {
        const a = (q * Math.PI) / 2;
        g.save(); g.translate(b.fogo.x + Math.cos(a) * R, b.fogo.y + Math.sin(a) * R); g.rotate(a);
        g.beginPath(); g.moveTo(8, 0); g.lineTo(-2, -7); g.lineTo(-2, 7); g.closePath(); g.fill();
        g.restore();
      }
      g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)';
      ['ARRASTE O 🔪 PRA GOLPEAR', 'ou toque onde quer bater', '💨 investida · 🥚 ovo-bomba'].forEach((txt, n) => {
        const ty = b.ovo.y - b.ovo.r - 57 + n * 17, tx = this.vw - 12;
        g.strokeText(txt, tx, ty); g.fillText(txt, tx, ty);
      });
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    }
    if (mirar) {
      const dx = mirar.x - mirar.x0, dy = mirar.y - mirar.y0, f = Math.min(1, b.fogo.r / Math.max(1, Math.hypot(dx, dy))) * 0.7;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(b.fogo.x + dx * f, b.fogo.y + dy * f, b.fogo.r * 0.28, 0, Math.PI * 2); g.fill();
    }
    const botao = (r, cor, txt, alfa) => {
      g.globalAlpha = alfa;
      g.fillStyle = cor;
      g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${r.r * 0.85}px system-ui, sans-serif`;
      g.fillText(txt, r.x, r.y + 2);
    };
    const meu = this.ultimo?.r[this.eu];
    botao(b.pulo, '#2a7be0', '⤒', ativo('pulo') ? 0.9 : 0.4);
    botao(b.ovo, '#7a5a20', '🥚', ativo('ovo') ? 0.9 : meu?.[18] ? 0.5 : 0.2);
    botao(b.dash, '#3a3a44', '💨', ativo('dash') ? 0.9 : (this.pred?.dashCd ?? 0) > 0 ? 0.2 : 0.5);
    g.restore();
    g.textBaseline = 'alphabetic';
  }
}

/**
 * Arco desenhado (a folha não tem): madeira curvada, corda e a flecha
 * encaixada. Origem na empunhadura, apontando pra +x. `solto`: 0 = acabou de
 * soltar (corda esticada pra frente, sem flecha), 1 = flecha puxada e pronta.
 */
function arco(g, tam, solto) {
  const h = tam / 2, puxa = 4 + 14 * solto;
  g.lineCap = 'round';
  g.strokeStyle = '#3a2210'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(-4, -h); g.quadraticCurveTo(16, 0, -4, h); g.stroke();
  g.strokeStyle = '#a0662c'; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(-4, -h); g.quadraticCurveTo(16, 0, -4, h); g.stroke();
  g.strokeStyle = '#e8e2d0'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-4, -h); g.lineTo(-puxa, 0); g.lineTo(-4, h); g.stroke();
  if (solto > 0.35) { g.save(); g.translate(-puxa + 34, 0); flecha(g, 40); g.restore(); }
}

/** Flecha com a ponta em (0, 0) apontando pra +x. `parte`: quanto aparece (cravada mostra só um pedaço). */
function flecha(g, comp, parte = 1) {
  const c = comp * parte;
  g.lineCap = 'round';
  g.strokeStyle = '#6b4520'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-6, 0); g.lineTo(-c, 0); g.stroke();
  if (parte >= 1) {
    g.fillStyle = '#c7ccd4'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-9, -4); g.lineTo(-7, 0); g.lineTo(-9, 4); g.closePath(); g.fill();
    g.fillStyle = '#b3121a';
    g.beginPath(); g.moveTo(-c + 8, 0); g.lineTo(-c, -5); g.lineTo(-c - 2, 0); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-c + 8, 0); g.lineTo(-c, 5); g.lineTo(-c - 2, 0); g.closePath(); g.fill();
  } else {
    g.fillStyle = '#b3121a';
    g.beginPath(); g.moveTo(-c, 0); g.lineTo(-c - 7, -5); g.lineTo(-c - 4, 0); g.lineTo(-c - 7, 5); g.closePath(); g.fill();
  }
}
