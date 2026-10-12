import { ABATES_VITORIA, ACIDO, AGUA, ALTURA, BARRIL, BARRIS, BOMBA, CAIXAS, ITENS, LARGURA, PLATAFORMAS, RATOS, TEMPO_PARTIDA, mover } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles de Ratos Psicopatas (canvas 2D). A rede, a
 * previsão do meu rato e os controles são os de Ratos em Guerra
 * (games/ratos/jogo.js); a mira também (linha pontilhada + anel).
 *
 * O que é daqui:
 *  - andar quadro a quadro: os dois quadros de passo da folha trocam a cada
 *    pisada, e a pisada anda com a distância percorrida (pé não escorrega);
 *    o corpo sobe entre as pisadas e amassa quando o pé bate;
 *  - a arma é desenhada por cima do rato e gira com a mira; a arma branca
 *    (Q) balança no golpe e deixa o rastro vermelho;
 *  - gore: jorro no acerto, respingo na parede que fica, pedaços que voam e
 *    ficam no chão, cérebro e olho voando no headshot, derretimento no ácido;
 *  - locutor de sequência (matança dupla, psicopata…) e coroa no líder.
 */

const A = import.meta.glob('../../assets/psicopatas/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const TOM = { azul: '#3b8cff', vermelho: '#ff4646', verde: '#56d364', amarelo: '#ffc93d' };
const AGUDO = { azul: 1.15, vermelho: 0.72, verde: 0.95, amarelo: 1.25 };
const ALTO = 1.32;            // altura do desenho / altura do corpo (orelhas passam da caixa)
const PASSO = { magrelo: 30, gordo: 26, bandana: 30, oculos: 30 };   // px andados por pisada
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const sorteio = (lista, id) => lista[Math.abs(id) % lista.length];
const sai = (t) => 1 - (1 - t) * (1 - t);

/** Arma de fogo: largura no mundo e o ponto da empunhadura (fração do sprite). */
const FOGO = { ak: { w: 66, px: 0.3, py: 0.45 }, escopeta: { w: 70, px: 0.32, py: 0.4 }, smg: { w: 50, px: 0.4, py: 0.4 }, sniper: { w: 88, px: 0.3, py: 0.45 } };
/** Arma branca: largura, cabo (fração) e o ângulo em que o desenho aponta (do cabo pra ponta). */
const BRANCA = {
  porrete: { w: 44, px: 0.18, py: 0.9, nat: -0.93, corte: 'corte-1' },
  frigideira: { w: 58, px: 0.05, py: 0.6, nat: -0.1, corte: 'corte-1' },
  faca: { w: 28, px: 0.12, py: 0.88, nat: -0.92, corte: 'corte-0' },
  motosserra: { w: 50, px: 0.15, py: 0.85, nat: -0.8, corte: 'corte-0' },
};

/** Centro dos pés (fração da largura), lido das linhas de baixo do quadro: todo quadro alinha por ele. */
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
  abate: ['HAHAHAHA!', 'MAIS SANGUE!', 'QUEM É O PRÓXIMO?', 'DELÍCIA!', 'QUE BAGUNÇA!', 'EU AMO ESSE CHEIRO!', 'SANGUE NO QUEIJO!', 'HIHIHIHI!', 'PICADINHO!'],
  morte: ['AAAAAAAAAH!', 'MEUS ÓRGÃOS!', 'MAMÃÃÃE!', 'MINHA CABEÇA!', 'NÃÃÃÃO!', 'ESTOU VENDO A LUZ!', 'MEU RABO!', 'AAARGH!'],
  dor: ['AAAI!', 'MINHA PERNA!', 'MEU OLHO!', 'SANGUE!', 'TÁ DOENDO!', 'NÃO NÃO NÃO!', 'SOCORRO!', 'ARGH!'],
  queima: ['TÁ QUENTE!', 'DERRETENDO!', 'ARDE!', 'MEU PELO!'],
  branca: ['VEM CÁ, QUEIJINHO!', 'HORA DO CORTE!', 'VOU TE FATIAR!', 'HEHEHE…', 'SÓ A PONTINHA!'],
  queijo: ['NHAC!', 'QUEIJO!', 'HUMMM!'],
  kit: ['REMENDADO!', 'PRONTO PRA OUTRA!'],
  renasce: ['VOLTEI PRA MATAR!', 'CADÊ VOCÊ?', 'QUERO SANGUE!', 'SEGUNDO ROUND!'],
  sozinho: ['OPS…', 'NÃO OLHA!', 'FOI DE PROPÓSITO!'],
  bomba: ['SURPRESINHA!', 'CUIDADO ONDE PISA!', 'HE HE HE…'],
};
const VERBO = ['estripou', 'desossou', 'fatiou', 'esfolou', 'triturou', 'picou', 'esmagou', 'espalhou'];
const VERBO_BRANCA = ['retalhou', 'picou em cubinhos', 'serrou', 'abriu no meio', 'descascou'];
const POW = ['SPLAT!', 'CRUNCH!', 'SPLORT!', 'CHOMP!'];
const MULTI = [null, null, 'MATANÇA DUPLA!', 'MATANÇA TRIPLA!', 'CHACINA!'];
const SERIE = { 3: 'PSICOPATA!', 5: 'SERIAL KILLER!', 7: 'MASSACRE!', 10: 'DEUS DO ESGOTO!' };

/** Onde algo que cai em x, vindo de y0 pra y1, pousa: topo de plataforma/caixa no caminho, ou null. */
function pousoEm(x, y0, y1) {
  let melhor = null;
  for (const [a, b, top] of PLATAFORMAS) if (x > a && x < b && y0 <= top && y1 >= top && (melhor == null || top < melhor)) melhor = top;
  for (const [a, top, b] of CAIXAS) if (x > a && x < b && y0 <= top && y1 >= top && (melhor == null || top < melhor)) melhor = top;
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
    this.manchas = [];       // sangue no chão (achatado)
    this.parede = [];        // respingos na parede do fundo (ficam bastante)
    this.particulas = [];
    this.pedacos = [];       // gore: voam, quicam e ficam no chão
    this.textos = [];
    this.baloes = new Map();
    this.feed = [];
    this.voando = new Map();
    this.anuncio = null;
    this.disparo = [0, 0, 0, 0];
    this.golpes = [null, null, null, null];
    this.dor = [0, 0, 0, 0];
    this.gemido = [0, 0, 0, 0];
    this.amassa = [0, 0, 0, 0];
    this.chaoAntes = [true, true, true, true];
    this.passo = [0, 0, 0, 0];   // pisadas andadas (a parte inteira escolhe o quadro)
    this.xAntes = [null, null, null, null];
    this.andar = [0, 0, 0, 0];
    this.serie = [0, 0, 0, 0];   // abates sem morrer
    this.multi = [0, 0, 0, 0];   // abates seguidos (até 3,5s um do outro)
    this.ultimoAbate = [0, 0, 0, 0];
    this.primeiroSangue = false;
    this.tremor = 0;
    this.ferido = 0;
    this.acertei = 0;
    this.batida = 0;
    this.ultimoBip = null;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });

    this.teclas = new Set();
    this.puloPendente = false;
    this.bombaPendente = false;
    this.trocaPendente = false;
    this.mouse = null;
    this.mouseFogo = false;
    this.toques = new Map();
    this.mira = op.assento % 2 ? Math.PI : 0;
    this.toque = matchMedia('(pointer: coarse)').matches;
    this.encerrado = false;   // acabou (ou a conexão caiu): para de mandar comando e de prever
    this.chegou = performance.now();
    this.mirou = false;       // já mirou nesta partida
    try { this.mirasAntes = Number(localStorage.getItem('psicopatas-miras')) || 0; } catch { this.mirasAntes = 0; }

    this.cmdSeq = 0;
    this.pendentes = [];
    this.acumulado = 0;
    this.ultimoQuadro = null;
    this.pred = null;
    this.predAntes = null;
    this.corr = { x: 0, y: 0 };

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

  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? ['azul', 'vermelho', 'verde', 'amarelo'][i]; }
  tom(i) { return TOM[this.cor(i)]; }
  bicho(i) { return RATOS[this.cor(i)].bicho; }
  nome(i) { return (this.op.jogadores[i]?.name ?? RATOS[this.cor(i)]?.nome ?? '?').split(' ')[0]; }
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

  /**
   * Fim da partida pra mim: solta os controles e congela o meu rato. Sem isso,
   * quem perdia o último estado (conexão caiu no fim) seguia andando sozinho
   * num jogo que o servidor já tinha fechado.
   */
  encerrar() {
    if (this.encerrado) return;
    this.encerrado = true;
    this.toques.clear(); this.teclas.clear();
    this.mouseFogo = false; this.puloPendente = false; this.bombaPendente = false; this.trocaPendente = false;
    this.pendentes = [];
  }

  mundo(e, eu) {
    return { seed: e.seed, cores: e.cores, barris: e.barris, ratos: e.r.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1] })) };
  }

  reconciliar(e) {
    const m = e.r[this.eu];
    const ack = m[6] ?? 0;
    this.pendentes = this.pendentes.filter((c) => c.s > ack);
    const pos = { x: m[0], y: m[1], vy: m[7], kx: m[8], chao: !!m[9], pulos: m[10], atravessa: m[11], dir: m[13], branca: !!m[14], movendo: false };
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
        vy: rb[7], chao: !!rb[9], protegido: !!rb[12], dir: rb[13], branca: !!rb[14] };
    });
    const extra = Math.max(0, t - b.agora) / 1000;
    const balas = b.b.map(([id, x, y, ang, dono]) => {
      const ba = a.b.find((z) => z[0] === id);
      const vel = RATOS[b.cores[dono]].bala;
      const px = ba ? lerp(ba[1], x, k) : x, py = ba ? lerp(ba[2], y, k) : y;
      const ex = k >= 1 ? extra : 0;
      return { id, x: px + Math.cos(ang) * vel * ex, y: py + Math.sin(ang) * vel * ex, ang, dono };
    });
    return { ratos, balas, barris: b.barris, pegos: new Set(b.pegos ?? []), bombas: b.bm ?? [] };
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
        case 'tiro': {
          const c = this.cor(e.de);
          this.disparo[e.de] = agora + (c === 'verde' ? 60 : 110);
          const tam = { azul: 0.9, vermelho: 1.5, verde: 0.75, amarelo: 1.3 }[c];
          this.efeitos.push({ tipo: 'clarao', x: e.x, y: e.y, ang: e.ang, tam, ini: agora, q: e.id % 2 });
          const lado = Math.cos(e.ang) >= 0 ? 1 : -1;
          this.particulas.push({ tipo: 'capsula', x: e.x - lado * 26, y: e.y, vx: -lado * (60 + Math.random() * 80), vy: -180 - Math.random() * 120, rot: 0, vr: 20, vida: 1.6, idade: 0 });
          if (c === 'vermelho' || c === 'amarelo') this.fumaca(e.x, e.y, c === 'vermelho' ? 6 : 3, 0.6);
          if (c === 'vermelho') this.tremor = Math.max(this.tremor, e.de === this.eu ? 6 : 2);
          som.tiro(c, longe(e.x, e.y));
          break;
        }
        case 'golpe': {
          const c = this.cor(e.de), b = RATOS[c].b;
          this.golpes[e.de] = { ini: agora, lado: e.lado };
          this.efeitos.push({ tipo: 'corte', x: e.x, y: e.y, lado: e.lado, ini: agora, nome: BRANCA[b.sprite].corte, grande: b.sprite === 'frigideira' || b.sprite === 'porrete' });
          if (b.sprite === 'motosserra') {
            som.motosserra(longe(e.x, e.y), e.acertou);
            this.faiscas(e.x + e.lado * 10, e.y, e.acertou ? 2 : 3, e.acertou ? '#c3141b' : null);
          } else som.golpe(b.sprite !== 'faca');
          break;
        }
        case 'troca':
          if (e.i === this.eu) som.troca(e.branca);
          if (e.branca && e.id % 2 === 0) this.falar(e.i, FALA.branca, e.id, e.i === this.eu);
          break;
        case 'acerto': {
          this.dor[e.alvo] = agora + 220;
          const de = e.de != null ? est?.ratos[e.de] : null, alvo = est?.ratos[e.alvo];
          const lado = de && alvo ? Math.sign(alvo.x - de.x) || 1 : 0;
          const forte = Math.min(1, e.dano / 50);
          this.sangue(e.x, e.y, 10 + Math.round(26 * forte), lado, 1 + forte);
          this.pelos(e.x, e.y, 3);
          this.efeitos.push({ tipo: 'jorro', x: e.x, y: e.y, lado, ini: agora, q: e.id % 7, tam: 34 + 40 * forte });
          this.respingar(e.x + lado * (20 + Math.random() * 40), e.y + (Math.random() - 0.4) * 30, 26 + 30 * forte, e.id);
          this.textos.push({ x: e.x, y: e.y - 20, txt: `-${e.dano}`, cor: '#fff', ini: agora, tam: 22 + Math.min(16, e.dano / 3) });
          if (e.dano >= 11 || e.branca) this.textos.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y - 50, txt: sorteio(e.branca && this.bicho(e.de) === 'gordo' ? ['BLOINNG!', 'PÉÉÉN!'] : POW, e.id), cor: '#ff3a3a', ini: agora, tam: 30, pow: true });
          if (e.alvo === this.eu) { this.tremor = Math.max(this.tremor, 8); this.ferido = agora; }
          if (e.de === this.eu) this.acertei = agora;
          if (e.branca) {
            if (this.bicho(e.de) === 'gordo') som.panela(longe(e.x, e.y));
            if (this.bicho(e.de) !== 'oculos' || e.id % 3 === 0) this.gibs(e.x, e.y, 1, lado);
            this.tremor = Math.max(this.tremor, 6);
          }
          if (e.cabeca) {
            this.sangue(e.x, e.y, 24, lado, 1.6);
            this.textos.push({ x: e.x, y: e.y - 70, txt: 'NA CABEÇA!', cor: '#ffd23d', ini: agora, tam: 30, pow: true });
            som.headshot();
          }
          som.splat(longe(e.x, e.y));
          if (agora > this.gemido[e.alvo]) {   // grito de dor, mas não a cada bala da metralhadora
            this.gemido[e.alvo] = agora + 280;
            som.dor(AGUDO[this.cor(e.alvo)], longe(e.x, e.y));
          }
          if (e.id % 4 === 0) this.falar(e.alvo, FALA.dor, e.id, e.alvo === this.eu);
          break;
        }
        case 'queima':
          this.bolhas(e.x, e.y, 5);
          this.dor[e.alvo] = agora + 150;
          if (e.alvo === this.eu) { this.ferido = agora; this.tremor = Math.max(this.tremor, 3); }
          if (agora > this.gemido[e.alvo]) { this.gemido[e.alvo] = agora + 500; som.dor(AGUDO[this.cor(e.alvo)] * 1.2, longe(e.x, e.y)); }
          if (e.id % 6 === 0) this.falar(e.alvo, FALA.queima, e.id, e.alvo === this.eu);
          break;
        case 'abate': this.abate(e, agora, longe); break;
        case 'renasce':
          this.voando.delete(e.i);
          this.poeira(e.x, e.y, 6);
          this.efeitos.push({ tipo: 'anel', x: e.x, y: e.y - 30, cor: this.tom(e.i), ini: agora });
          this.xAntes[e.i] = null;
          if (e.i === this.eu) som.renasce();
          if (e.id % 2 === 0) this.falar(e.i, FALA.renasce, e.id, e.i === this.eu);
          break;
        case 'pulo':
          this.poeira(e.x, e.y, e.duplo ? 2 : 4);
          if (e.duplo) this.faiscas(e.x, e.y - 10, 4, '#fff');
          if (e.i === this.eu) som.pulo(e.duplo);
          else if (e.duplo && e.id % 4 === 0) som.guincho(AGUDO[this.cor(e.i)], longe(e.x, e.y) * 0.6);
          break;
        case 'pega':
          this.brilho(e.x, e.y, e.item === 'kit' ? '#ff6b6b' : '#ffd23d');
          this.textos.push({ x: e.x, y: e.y - 20, txt: e.item === 'kit' ? 'VIDA CHEIA!' : '+35', cor: '#5cff7a', ini: agora, tam: 24 });
          if (e.i === this.eu) som.pega(e.item === 'kit');
          this.falar(e.i, e.item === 'kit' ? FALA.kit : FALA.queijo, e.id, e.i === this.eu);
          break;
        case 'explosao':
          this.efeitos.push({ tipo: 'explosao', x: e.x, y: e.y, escala: 1.6, ini: agora, rot: Math.random() * 0.4 - 0.2 });
          this.fumaca(e.x, e.y, 16, 1.5);
          this.lascas(e.x, e.y, 14);
          this.respingar(e.x, e.y, 90, e.id, '#1a1210');   // fuligem
          this.tremor = Math.max(this.tremor, 18);
          som.explosao(longe(e.x, e.y));
          break;
        case 'impacto':
          this.faiscas(e.x, e.y, 5);
          if (e.id % 3 === 0) som.impacto(longe(e.x, e.y) * 0.7);
          break;
        case 'respingo':
          this.bolhas(e.x, AGUA, 3);
          break;
        case 'volta':
          this.poeira(BARRIS[e.barril][0], BARRIS[e.barril][1], 3);
          break;
        case 'bomba':
          if (e.i === this.eu) som.planta();
          if (e.id % 2 === 0) this.falar(e.i, FALA.bomba, e.id, e.i === this.eu);
          break;
        case 'fogo':
          som.bip(true);
          break;
      }
    }
  }

  /** Morte: corpo voando, pedaços, grito, kill feed e o locutor. */
  abate(e, agora, longe) {
    const c = this.cor(e.alvo);
    const dir = e.dir || (Math.random() < 0.5 ? -1 : 1);
    this.serie[e.alvo] = 0;
    this.multi[e.alvo] = 0;
    if (e.acido) {
      // derreteu: sobe uma caveira da água verde
      this.bolhas(e.x, Math.min(e.y + 30, AGUA), 30);
      this.particulas.push({ tipo: 'caveira', x: e.x, y: Math.min(e.y + 30, AGUA), vida: 2.2, idade: 0 });
      this.gibs(e.x, Math.min(e.y, AGUA - 10), 3, 0);
      som.derrete(longe(e.x, e.y));
    } else {
      if (e.cabeca) {
        // HEADSHOT que mata: o cérebro sai voando, o olho junto, e o pescoço vira chafariz
        const lado = dir;
        this.sangue(e.x, e.y - 10, 70, 0, 2);
        this.pedaco('cerebro-1', e.x, e.y - 18, lado * (120 + Math.random() * 120), -680 - Math.random() * 160, 32);
        this.pedaco('cerebro-0', e.x, e.y - 18, -lado * (60 + Math.random() * 80), -560, 18);
        this.pedaco('olho', e.x, e.y - 10, -lado * (90 + Math.random() * 120), -520, 15);
        this.efeitos.push({ tipo: 'chafariz', i: e.alvo, ini: agora });
        this.textos.push({ x: e.x, y: e.y - 60, txt: 'HEADSHOT!', cor: '#ffd23d', ini: agora, tam: 48, pow: true, longo: true });
        this.clarao = { ini: agora, eu: e.de === this.eu || e.alvo === this.eu };
        this.tremor = Math.max(this.tremor, 24);
        som.fala('headshot!', 1, true);
      }
      this.voando.set(e.alvo, { x: e.x, y: e.y, vx: dir * (260 + (e.id % 5) * 40), vy: e.cabeca ? -820 : -620, rot: 0, vr: dir * (e.cabeca ? 16 : 9), ini: agora });
      this.sangue(e.x, e.y, 60, dir, 2);
      this.gibs(e.x, e.y, e.explodiu ? 10 : e.branca ? 8 : 5, dir);
      this.respingar(e.x + dir * 30, e.y, 80, e.id);
      this.respingar(e.x - dir * 20, e.y + 20, 50, e.id + 3);
      som.gore(longe(e.x, e.y));
    }
    this.pelos(e.x, e.y, 14);
    this.tremor = Math.max(this.tremor, e.alvo === this.eu ? 22 : 12);
    som.grito(AGUDO[c], longe(e.x, e.y));
    if (e.saiu) { this.feed.unshift({ txt: `${this.nome(e.alvo)} fugiu da briga`, de: e.alvo, ini: agora }); this.feed = this.feed.slice(0, 5); return; }
    this.falar(e.alvo, FALA.morte, e.id, e.alvo === this.eu);
    if (e.alvo === this.eu) som.fala(sorteio(['aaaaaaaaaaaah!', 'aaaaai socorro!', 'nããããão!'], e.id), AGUDO[c], true);
    const de = e.de;
    if (de != null && de !== e.alvo) {
      setTimeout(() => this.falar(de, FALA.abate, e.id + 1, de === this.eu), 500);
      const txt = e.cabeca ? `💀 ${this.nome(de)} estourou a cabeça de ${this.nome(e.alvo)}`
        : e.acido ? `☣ ${this.nome(de)} jogou ${this.nome(e.alvo)} no ácido`
        : e.branca ? `🔪 ${this.nome(de)} ${sorteio(VERBO_BRANCA, e.id)} ${this.nome(e.alvo)}`
        : `${this.nome(de)} ${sorteio(VERBO, e.id)} ${this.nome(e.alvo)}`;
      this.feed.unshift({ txt, de, ini: agora });
      // locutor: primeiro sangue, abates seguidos, sequência sem morrer
      this.serie[de]++;
      this.multi[de] = agora - this.ultimoAbate[de] < 3500 ? this.multi[de] + 1 : 1;
      this.ultimoAbate[de] = agora;
      const quem = de === this.eu ? '' : `${this.nome(de).toUpperCase()}: `;
      const voz = de === this.eu || e.alvo === this.eu;
      if (!this.primeiroSangue) { this.primeiroSangue = true; this.anunciar(`${quem}PRIMEIRO SANGUE!`, '#ff2a2a', voz); }
      else if (this.multi[de] >= 2) this.anunciar(`${quem}${MULTI[Math.min(4, this.multi[de])]}`, '#ff8a1a', voz);
      else if (SERIE[this.serie[de]]) this.anunciar(`${quem}${SERIE[this.serie[de]]}`, '#c43bff', voz);
    } else {
      this.feed.unshift({ txt: e.acido ? `☣ ${this.nome(e.alvo)} derreteu no esgoto` : `${this.nome(e.alvo)} se explodiu sozinho`, de: e.alvo, ini: agora });
      setTimeout(() => this.falar(e.alvo, FALA.sozinho, e.id, e.alvo === this.eu), 300);
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
  faiscas(x, y, n, cor) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
      this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, cor, vida: 0.2 + Math.random() * 0.25, idade: 0 });
    }
  }
  /** Gotas de sangue: `lado` puxa o jorro pra um lado (0 = chafariz pra cima). */
  sangue(x, y, n, lado = 0, forca = 1) {
    for (let k = 0; k < n; k++) {
      const a = lado ? (lado > 0 ? -0.4 : Math.PI + 0.4) + (Math.random() - 0.5) * 1.6 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = (90 + Math.random() * 280) * forca;
      this.particulas.push({ tipo: 'sangue', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 * forca, r: 1.5 + Math.random() * 2.8 * Math.min(1.6, forca), vida: 2, idade: 0 });
    }
  }
  bolhas(x, y, n) {
    for (let k = 0; k < n; k++) this.particulas.push({ tipo: 'bolha', x: x + (Math.random() - 0.5) * 40, y: y - Math.random() * 20, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 80, r: 2 + Math.random() * 5, vida: 0.5 + Math.random() * 0.9, idade: 0 });
  }
  pelos(x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
      this.particulas.push({ tipo: 'pelo', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, vida: 0.9 + Math.random() * 0.6, idade: 0 });
    }
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
  /** Um pedaço de gore (sprite) voando. Quica, pousa e fica um tempo no chão. */
  pedaco(nome, x, y, vx, vy, w) {
    this.pedacos.push({ nome, x, y, vx, vy, w, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, ini: performance.now(), parado: false });
    if (this.pedacos.length > 70) this.pedacos.shift();
  }
  gibs(x, y, n, lado) {
    for (let k = 0; k < n; k++) {
      const a = lado ? (lado > 0 ? -0.9 : Math.PI + 0.9) + (Math.random() - 0.5) * 1.4 : -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 220 + Math.random() * 380;
      this.pedaco(`pedaco-${Math.floor(Math.random() * 19)}`, x, y, Math.cos(a) * v, Math.sin(a) * v - 150, 16 + Math.random() * 14);
    }
  }
  /** Respingo na parede do fundo: fica lá ~25s (no máximo 70; os velhos saem). */
  respingar(x, y, tam, id, cor) {
    this.parede.push({ x, y, tam, nome: id % 2 ? `jorro-${id % 7}` : `gota-${id % 5}`, rot: (id * 1.7) % 6.28, ini: performance.now(), cor });
    if (this.parede.length > 70) this.parede.shift();
  }
  manchar(x, y, r) {
    this.manchas.push({ x, y, r: r * (1.6 + Math.random()), ini: performance.now() });
    if (this.manchas.length > 120) this.manchas.shift();
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat && (k === 'w' || k === ' ' || k === 'arrowup')) this.puloPendente = true;
        if (!e.repeat && k === 'e') this.bombaPendente = true;
        if (!e.repeat && k === 'q') this.trocaPendente = true;
        this.teclas.add(k);
        destravar();
      },
      teclaSobe: (e) => this.teclas.delete(e.key.toLowerCase()),
      desce: (e) => this.ponteiroDesce(e),
      move: (e) => this.ponteiroMove(e),
      sobe: (e) => this.ponteiroSobe(e),
      resize: () => this.redimensionar(),
      blur: () => { this.teclas.clear(); this.mouseFogo = false; this.toques.clear(); },
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
    // no toque: tudo pequeno e encostado nos cantos, pra não tampar o jogo (igual Ratos em Guerra)
    const joy = { x: m + s * 0.12, y: this.vh - m - s * 0.12, r: s * 0.12 };
    const fogo = { x: this.vw - m - s * 0.11, y: this.vh - m - s * 0.11, r: s * 0.11 };
    const pr = s * 0.075, br = s * 0.06;
    const pulo = { x: fogo.x - fogo.r - 12 - pr, y: this.vh - m - pr, r: pr };
    const bomba = { x: fogo.x, y: fogo.y - fogo.r - 12 - br, r: br };
    return {
      sair: { x: 8, y: joy.y - joy.r - 84, w: 34, h: 34 },
      mudo: { x: 8, y: joy.y - joy.r - 44, w: 34, h: 34 },
      joy, fogo, pulo, bomba,
      // arma branca: em cima do pulo, do lado da bomba
      troca: { x: pulo.x, y: bomba.y, r: br },
    };
  }

  ponteiroDesce(e) {
    destravar();
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') this.toque = true;   // antes de `botoes()`: o layout muda no toque
    const b = this.botoes();
    const dentro = (r) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h;
    if (dentro(b.sair)) { if (confirm('Sair da partida? Quem sai no meio perde a entrada.')) this.op.onSair(); return; }
    if (dentro(b.mudo)) { som.alternarMudo(); return; }
    if (e.pointerType === 'mouse') {
      this.mouseV = v;
      if (e.button === 0) this.mouseFogo = true;
      if (e.button === 2) this.puloPendente = true;
      if (e.button === 1) { e.preventDefault(); this.trocaPendente = true; }   // rodinha troca
      return;
    }
    e.preventDefault();
    this.toque = true;
    for (const nome of ['troca', 'bomba', 'pulo']) {
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
    // no botão de ataque: analógico preso no centro do botão (já mira no toque).
    // fora dele, na metade direita: mira no ponto tocado do mapa.
    const noFogo = Math.hypot(v.x - b.fogo.x, v.y - b.fogo.y) < b.fogo.r * 1.6;
    this.toques.set(e.pointerId, noFogo
      ? { tipo: 'mirar', x0: b.fogo.x, y0: b.fogo.y, x: v.x, y: v.y }
      : { tipo: 'apontar', x0: v.x, y0: v.y, x: v.x, y: v.y });
  }

  /** A dica de como mirar some depois que a pessoa mira de verdade umas vezes (fica salvo no aparelho). */
  aprendeuMirar() {
    if (this.mirou) return;
    this.mirou = true;
    try { localStorage.setItem('psicopatas-miras', String(this.mirasAntes + 1)); } catch { /* sem storage */ }
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
    if (e.pointerType === 'mouse') { this.mouseFogo = false; return; }
    this.toques.delete(e.pointerId);
  }

  enviarEntrada(est) {
    if (this.encerrado) return;
    let mx = 0, fogo = false, desce = false;
    const k = this.teclas;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('s') || k.has('arrowdown')) desce = true;
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
      }
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
      const c = { s: ++this.cmdSeq, mx, pulo: this.puloPendente, desce, dt: 33, ang, fogo, bomba: this.bombaPendente, troca: this.trocaPendente };
      this.puloPendente = false;
      this.bombaPendente = false;
      this.trocaPendente = false;
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

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, h, base = false } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    if (virar) g.scale(-1, 1);
    g.globalAlpha = alfa;
    g.drawImage(im, -w / 2, base ? -hh : -hh / 2, w, hh);
    g.restore();
  }

  /** O esgoto: a pintura de fundo e o que mexe nela (luz piscando, ácido escorrendo, água borbulhando). */
  desenharEsgoto(agora) {
    const g = this.ctx;
    if (pronto(IMG.fundo)) g.drawImage(IMG.fundo, 0, 0, LARGURA, ALTURA);
    else { g.fillStyle = '#10201a'; g.fillRect(0, 0, LARGURA, ALTURA); }
    g.save();
    g.globalCompositeOperation = 'lighter';
    // lâmpadas: piscam de vez em quando
    for (const [x, y, r, k] of [[848, 165, 170, 1], [663, 385, 150, 2]]) {
      const pisca = Math.sin(agora / 70 + k * 9) > 0.93 ? 0.25 : 1;
      const a = (0.16 + Math.sin(agora / 900 + k) * 0.03) * pisca;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,190,90,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // cascatas de ácido: riscos descendo e brilho
    for (const [x0, y0, x1, y1] of [...ACIDO, [312, 612, 352, AGUA]]) {
      g.fillStyle = 'rgba(120,255,60,.10)'; g.fillRect(x0 - 6, y0, x1 - x0 + 12, y1 - y0);
      g.strokeStyle = 'rgba(200,255,120,.35)'; g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const x = x0 + ((k * 37) % (x1 - x0)), off = ((agora / 3 + k * 53) % (y1 - y0));
        g.beginPath(); g.moveTo(x, y0 + off); g.lineTo(x, Math.min(y1, y0 + off + 26)); g.stroke();
      }
    }
    // água tóxica: superfície que ondula, brilho e bolhas
    const gr = g.createLinearGradient(0, AGUA - 30, 0, ALTURA);
    gr.addColorStop(0, 'rgba(90,255,40,0)'); gr.addColorStop(0.4, 'rgba(90,255,40,.18)'); gr.addColorStop(1, 'rgba(60,200,30,.28)');
    g.fillStyle = gr; g.fillRect(0, AGUA - 30, LARGURA, ALTURA - AGUA + 30);
    g.strokeStyle = 'rgba(190,255,120,.45)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= LARGURA; x += 16) g.lineTo(x, AGUA + 6 + Math.sin(x / 40 + agora / 400) * 2.5);
    g.stroke();
    g.restore();
    if (Math.random() < 0.25) this.particulas.push({ tipo: 'bolha', x: Math.random() * LARGURA, y: AGUA + 20 + Math.random() * 16, vx: 0, vy: -20 - Math.random() * 20, r: 2 + Math.random() * 4, vida: 0.6 + Math.random() * 0.6, idade: 0 });
    if (Math.random() < 0.06) {   // pinga ácido das plataformas
      const [x0, x1, top] = PLATAFORMAS[Math.floor(Math.random() * PLATAFORMAS.length)];
      this.particulas.push({ tipo: 'pingo', x: x0 + Math.random() * (x1 - x0), y: top + 14, vx: 0, vy: 30, vida: 2, idade: 0 });
    }
  }

  desenharCenario(est, agora) {
    const g = this.ctx;
    // respingos na parede (atrás de tudo)
    this.parede = this.parede.filter((m) => agora - m.ini < 25_000);
    for (const m of this.parede) {
      const k = (agora - m.ini) / 25_000;
      const im = IMG[m.nome];
      if (!pronto(im)) continue;
      g.save();
      g.globalAlpha = 0.62 * (1 - k * k) * Math.min(1, (agora - m.ini) / 80);
      if (m.cor) g.filter = 'brightness(0.15)';
      g.translate(m.x, m.y); g.rotate(m.rot);
      const w = m.tam, h = (w * im.naturalHeight) / im.naturalWidth;
      g.drawImage(im, -w / 2, -h / 2, w, h);
      g.restore();
    }
    if (!est) return;
    for (const [k, [x, y]] of BARRIS.entries()) {
      if (est.barris[k]) continue;
      this.sprite('barril-caveira', x, y + 2, BARRIL.w + 10, { base: true, h: BARRIL.h + 8 });
    }
    for (const it of ITENS) {
      if (est.pegos.has(it.id)) continue;
      const k = it.x + it.y;
      const bob = Math.sin(agora / 300 + k) * 4;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(it.x, it.y - 22 + bob, 0, it.x, it.y - 22 + bob, 34);
      gr.addColorStop(0, it.tipo === 'kit' ? 'rgba(255,90,90,.45)' : 'rgba(255,220,80,.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(it.x - 34, it.y - 56 + bob, 68, 68);
      g.restore();
      this.sprite(it.tipo === 'kit' ? 'kit' : 'queijo', it.x, it.y - 22 + bob, it.tipo === 'kit' ? 32 : 36, { rot: Math.sin(agora / 500 + k) * 0.12 });
    }
    // sangue no chão
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
  }

  /**
   * Qual quadro do corpo: no ar, o do pulo; levando tiro, o de dor; no chão,
   * os dois do passo (o número da pisada escolhe). Parado fica no primeiro.
   */
  quadroCorpo(i, r, agora) {
    const b = this.bicho(i);
    if (!r.chao) return `${b}-pulo`;
    if (this.dor[i] > agora) return `${b}-dor`;
    return `${b}-anda-${this.andar[i] > 0.15 ? Math.floor(this.passo[i]) % 2 : 0}`;
  }

  desenharRato(i, r, agora) {
    const g = this.ctx;
    const c = this.cor(i), k = RATOS[c], b = k.bicho;
    const dt = this.dtQuadro ?? 0.016;
    const esq = Math.cos(r.ang) < 0;
    const lado = esq ? -1 : 1;
    // pouso: amassa e levanta poeira
    if (r.chao && !this.chaoAntes[i]) { this.amassa[i] = 1; if (i === this.eu) som.pouso(); this.poeira(r.x, r.y, 3); }
    this.chaoAntes[i] = r.chao;
    this.amassa[i] *= 0.82;
    // Andar: a pisada avança com a distância de verdade (x do desenho), então
    // o quadro troca no mesmo ritmo em que o chão passa — o pé não escorrega.
    const dx = this.xAntes[i] == null ? 0 : Math.abs(r.x - this.xAntes[i]);
    this.xAntes[i] = r.x;
    const andando = r.chao && dx > 0.3 && dx < 40;
    this.andar[i] += ((andando ? 1 : 0) - this.andar[i]) * Math.min(1, dt * 12);
    if (andando) {
      const antes = Math.floor(this.passo[i]);
      this.passo[i] += dx / PASSO[b];
      if (Math.floor(this.passo[i]) !== antes) {   // pé bateu no chão
        this.amassa[i] = Math.max(this.amassa[i], 0.35);
        this.particulas.push({ tipo: 'fumaca', x: r.x - lado * k.w * 0.4, y: r.y - 3, vx: -lado * 30, vy: -12, r: 3 + Math.random() * 2, cinza: true, vida: 0.35, idade: 0 });
      }
    }
    const fr = this.passo[i] % 1;                         // 0 = pé batendo .. 1 = próxima batida
    const n = this.andar[i];
    const bob = -Math.sin(fr * Math.PI) * (b === 'gordo' ? 3 : 5) * n;   // sobe no meio do passo
    const a = this.amassa[i];
    const estica = !r.chao ? Math.min(0.12, Math.abs(r.vy) / 6000) : 0;
    const respira = r.chao ? Math.sin(agora / 420 + i * 2) * 0.025 * (1 - n) : 0;
    const sx = 1 + a * 0.2 - estica - respira;
    const sy = 1 - a * 0.2 + estica + respira;
    const rebola = Math.sin(fr * Math.PI * 2) * (b === 'gordo' ? 0.06 : 0.035) * n;
    const inclina = (0.07 * n + (r.chao ? 0 : Math.max(-0.15, Math.min(0.15, r.vy / 4000)))) * lado;

    const nome = this.quadroCorpo(i, r, agora);
    const im = IMG[nome], ref = IMG[`${b}-anda-0`];
    if (!pronto(im) || !pronto(ref)) return;
    const esc = (k.h * ALTO) / ref.naturalHeight;   // todos os quadros na mesma escala
    const w = im.naturalWidth * esc, h = im.naturalHeight * esc;
    const pe = pesDe(im);
    // sombra
    g.save(); g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(r.x, r.y + 2, k.w * 0.7, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();

    g.save();
    g.translate(r.x, r.y + bob);
    g.rotate(inclina + rebola);
    g.scale(sx * lado, sy);
    g.globalAlpha = r.protegido ? (Math.floor(agora / 90) % 2 ? 0.35 : 0.9) : 1;
    const corpo = () => g.drawImage(im, -w * pe, -h, w, h);
    const golpe = this.golpes[i] && agora - this.golpes[i].ini < 320 ? this.golpes[i] : null;
    corpo();
    if (this.dor[i] > agora) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; corpo(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    this.desenharArma(i, r, k, agora, golpe);
    g.restore();

    if (r.protegido) {
      g.save(); g.strokeStyle = `${this.tom(i)}aa`; g.lineWidth = 3;
      g.beginPath(); g.arc(r.x, r.y - k.h / 2, k.h * 0.75 + Math.sin(agora / 100) * 2, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    // coroa no líder
    const e = this.ultimo;
    if (e) {
      const max = Math.max(...e.abates);
      if (max > 0 && e.abates[i] === max && e.abates.filter((v) => v === max).length === 1) {
        this.sprite('coroa', r.x, r.y - k.h * ALTO - 4 + bob + Math.sin(agora / 250) * 3, 30, { rot: Math.sin(agora / 400) * 0.15 });
      }
    }
    // nome e vida
    const bw = 54, bx = r.x - bw / 2, by = r.y - k.h - 30;
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
    const pv = r.vida / k.vida;
    g.fillStyle = pv > 0.5 ? '#3ddc5a' : pv > 0.25 ? '#ffc53d' : '#ff4d4d';
    g.fillRect(bx, by, bw * pv, 5);
    g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = this.tom(i);
    const rotulo = i === this.eu ? 'VOCÊ' : this.nome(i).toUpperCase();
    g.strokeText(rotulo, r.x, by - 5); g.fillText(rotulo, r.x, by - 5);
    // mira (a mesma de Ratos em Guerra): só a minha, linha pontilhada curta e anel
    if (i === this.eu) {
      g.save(); g.translate(r.x, r.y - k.h * 0.5); g.rotate(r.ang);
      const alc = r.branca ? k.b.alcance * 0.6 : 0;
      g.strokeStyle = r.branca ? 'rgba(255,80,80,.6)' : 'rgba(255,255,255,.5)'; g.setLineDash([5, 7]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(k.w / 2 + 30, 0); g.lineTo(k.w / 2 + 90 - alc, 0); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(k.w / 2 + 100 - alc, 0, 6, 0, Math.PI * 2); g.stroke();
      if (agora - this.acertei < 160) {   // acertou: um X no anel
        g.strokeStyle = '#ff3030'; g.lineWidth = 2.5;
        const cx = k.w / 2 + 100 - alc;
        g.beginPath(); g.moveTo(cx - 9, -9); g.lineTo(cx - 4, -4); g.moveTo(cx + 9, -9); g.lineTo(cx + 4, -4);
        g.moveTo(cx - 9, 9); g.lineTo(cx - 4, 4); g.moveTo(cx + 9, 9); g.lineTo(cx + 4, 4); g.stroke();
      }
      g.restore();
    }
  }

  /**
   * A arma, já no espaço do rato (pés na origem, olhando pra direita). De
   * fogo: na mão, girando com a mira, com coice. Branca: erguida, e no golpe
   * desce num arco.
   */
  desenharArma(i, r, k, agora, golpe) {
    const g = this.ctx;
    const esq = Math.cos(r.ang) < 0;
    // ângulo da mira no espaço do rato (que já foi espelhado se olha pra esquerda)
    const mira = esq ? Math.PI - r.ang : r.ang;
    const rel = Math.atan2(Math.sin(mira), Math.cos(mira));
    const mx = k.w * 0.18, my = -k.h * 0.5;
    g.save();
    g.translate(mx, my);
    if (!r.branca) {
      const f = FOGO[k.sprite], im = IMG[`arma-${k.sprite}`];
      if (!pronto(im)) { g.restore(); return; }
      const coice = this.disparo[i] > agora ? 6 : 0;
      g.rotate(rel);
      const w = f.w, hh = (w * im.naturalHeight) / im.naturalWidth;
      g.drawImage(im, -w * f.px - coice, -hh * f.py, w, hh);
    } else {
      const bb = BRANCA[k.b.sprite], im = IMG[`branca-${k.b.sprite}`];
      if (!pronto(im)) { g.restore(); return; }
      let ang;
      if (k.b.sprite === 'motosserra') {
        ang = rel * 0.6 + (Math.random() - 0.5) * 0.08 + (golpe ? Math.sin((agora - golpe.ini) / 18) * 0.12 : 0);
      } else if (golpe) {
        const t = (agora - golpe.ini) / 320;
        ang = t < 0.45 ? lerp(-2.1, 1.0, sai(t / 0.45)) : lerp(1.0, -1.0, (t - 0.45) / 0.55);
      } else ang = -0.65 + Math.sin(agora / 300 + i) * 0.06;
      g.rotate(ang - bb.nat);
      const w = bb.w, hh = (w * im.naturalHeight) / im.naturalWidth;
      g.drawImage(im, -w * bb.px, -hh * bb.py, w, hh);
    }
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
      Object.assign(r, { x: ax + this.corr.x, y: ay + this.corr.y, ang: this.mira, vy: this.pred.vy, chao: this.pred.chao, movendo: this.pred.movendo, branca: this.pred.branca });
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a120e';
    g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }

    g.save();
    this.tremor *= 0.87;
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharEsgoto(agora);
    this.desenharCenario(est, agora);

    if (est) {
      for (const [, x, y, dono, armada] of est.bombas) {
        g.save(); g.strokeStyle = `${this.tom(dono)}cc`; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(x, y + 1, 18, 5, 0, 0, Math.PI * 2); g.stroke(); g.restore();
        this.sprite('mina', x, y + 2, 34, { base: true });
        const acesa = armada ? Math.floor(agora / 380) % 2 === 0 : Math.floor(agora / 90) % 2 === 0;
        if (acesa) {
          g.save(); g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(x, y - 14, 0, x, y - 14, 14);
          gr.addColorStop(0, armada ? 'rgba(255,60,40,.95)' : 'rgba(255,230,80,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x - 14, y - 28, 28, 28); g.restore();
        }
      }
      this.desenharPedacos(dt, agora);
      for (const [i, r] of est.ratos.entries()) if (r.vivo && !this.ultimo?.fora?.[i]) this.desenharRato(i, r, agora);
      // abatidos voando, girando, sangrando, até renascer
      for (const [i, v] of this.voando) {
        const antes = v.y;
        v.vy += 1500 * dt; v.x += v.vx * dt; v.y += v.vy * dt; v.rot += v.vr * dt;
        if (agora - v.ini < 1500 && Math.random() < 0.7) this.particulas.push({ tipo: 'sangue', x: v.x, y: v.y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, r: 1.5 + Math.random() * 2.5, vida: 2, idade: 0 });
        const top = v.vy > 0 ? pousoEm(v.x, antes + 10, v.y + 10) : null;
        if (top != null) { v.y = top - 10; v.vy *= -0.3; v.vx *= 0.5; v.vr *= 0.4; if (Math.abs(v.vy) < 60) { v.vy = 0; v.vr = 0; v.vx *= 0.8; } }
        if (v.y > AGUA + 30) { this.bolhas(v.x, AGUA, 2); continue; }
        const nome = `${this.bicho(i)}-morto`;
        const im = IMG[nome];
        if (pronto(im)) this.sprite(nome, v.x, v.y, im.naturalWidth * 0.62, { rot: v.vy ? v.rot : 0, alfa: Math.max(0.35, 1 - (agora - v.ini) / 3000), virar: v.vx < 0 });
      }
      for (const b of est.balas) {
        const c = this.cor(b.dono);
        g.save(); g.globalCompositeOperation = 'lighter';
        const rastro = c === 'amarelo' ? 80 : c === 'vermelho' ? 18 : 34;
        const gr = g.createLinearGradient(b.x, b.y, b.x - Math.cos(b.ang) * rastro, b.y - Math.sin(b.ang) * rastro);
        gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
        g.strokeStyle = gr; g.lineWidth = c === 'amarelo' ? 4 : 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - Math.cos(b.ang) * rastro, b.y - Math.sin(b.ang) * rastro); g.stroke();
        g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(b.x, b.y, 2.2, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }

    this.desenharParticulas(dt);
    this.desenharEfeitos(agora);
    if (est) {
      for (const [i, r] of est.ratos.entries()) if (r.vivo) this.desenharBalao(i, r.x, r.y - RATOS[this.cor(i)].h - 40, agora);
      for (const [i, v] of this.voando) this.desenharBalao(i, v.x, v.y - 50, agora);
    }
    this.desenharTextos(agora);
    g.restore();

    this.desenharHud(agora, est);
    this.desenharControles();
  }

  /** Gore no chão: voa, quica nas plataformas, fica parado sangrando um pouco e some devagar. */
  desenharPedacos(dt, agora) {
    this.pedacos = this.pedacos.filter((p) => agora - p.ini < 16_000);
    for (const p of this.pedacos) {
      if (!p.parado) {
        const antes = p.y;
        p.vy += 1400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.x < 5 || p.x > LARGURA - 5) { p.vx *= -0.5; p.x = Math.max(5, Math.min(LARGURA - 5, p.x)); }
        if (Math.random() < 0.4) this.particulas.push({ tipo: 'sangue', x: p.x, y: p.y, vx: 0, vy: 0, r: 1.2 + Math.random() * 1.5, vida: 2, idade: 0 });
        const top = p.vy > 0 ? pousoEm(p.x, antes, p.y) : null;
        if (top != null) {
          p.y = top - 3;
          this.manchar(p.x, top - 2, 3);
          if (p.vy < 160) { p.parado = true; p.vy = 0; } else { p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
        }
        if (p.y > AGUA + 10) { this.bolhas(p.x, AGUA, 3); p.ini = -1e9; continue; }
      }
      const k = (agora - p.ini) / 16_000;
      this.sprite(p.nome, p.x, p.y - p.w * 0.25, p.w, { rot: p.rot, alfa: Math.min(1, (1 - k) * 4) });
    }
  }

  desenharParticulas(dt) {
    const g = this.ctx;
    this.particulas = this.particulas.filter((p) => (p.idade += dt) < p.vida);
    if (this.particulas.length > 1400) this.particulas.splice(0, this.particulas.length - 1400);
    for (const p of this.particulas) {
      const k = p.idade / p.vida;
      const ay = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'fumaca') {
        p.vx *= 0.96; p.vy *= 0.96;
        g.fillStyle = p.cinza ? `rgba(150,140,130,${0.35 * (1 - k)})` : `rgba(60,55,55,${0.45 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'faisca') {
        g.strokeStyle = p.cor ?? `rgba(255,${210 - k * 120},80,${1 - k})`;
        g.globalAlpha = 1 - k; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
        g.globalAlpha = 1;
      } else if (p.tipo === 'capsula') {
        p.vy += 900 * dt; p.rot += p.vr * dt;
        const top = p.vy > 0 ? pousoEm(p.x, ay, p.y) : null;
        if (top != null) { p.y = top - 2; p.vy *= -0.4; p.vx *= 0.6; p.vr *= 0.6; }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - Math.max(0, k - 0.6) * 2.5;
        g.fillStyle = '#e8b04a'; g.fillRect(-4, -1.5, 8, 3); g.restore();
      } else if (p.tipo === 'sangue') {
        p.vy += 1300 * dt;
        const top = p.vy > 0 ? pousoEm(p.x, ay, p.y) : null;
        if (top != null) { this.manchar(p.x, top - 2, p.r); p.idade = p.vida; continue; }
        if (p.y > AGUA) { p.idade = p.vida; continue; }
        g.fillStyle = '#b5101a';
        const ang = Math.atan2(p.vy, p.vx), comp = Math.min(3, 1 + Math.hypot(p.vx, p.vy) / 250);
        g.beginPath(); g.ellipse(p.x, p.y, p.r * comp, p.r, ang, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'bolha') {
        g.strokeStyle = `rgba(190,255,110,${0.8 * (1 - k)})`; g.lineWidth = 1.5;
        g.fillStyle = `rgba(120,255,60,${0.25 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 0.5), 0, Math.PI * 2); g.fill(); g.stroke();
      } else if (p.tipo === 'pingo') {
        p.vy += 900 * dt;
        if (p.y > AGUA) { this.bolhas(p.x, AGUA, 1); p.idade = p.vida; continue; }
        g.fillStyle = 'rgba(150,255,70,.85)';
        g.beginPath(); g.ellipse(p.x, p.y, 2, 4, 0, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'caveira') {
        p.y -= 30 * dt;
        this.sprite('caveira', p.x + Math.sin(p.idade * 6) * 4, p.y - 20, 34, { alfa: k < 0.7 ? 1 : (1 - k) / 0.3, rot: Math.sin(p.idade * 4) * 0.2 });
      } else if (p.tipo === 'pelo') {
        p.vy += 200 * dt; p.vx *= 0.97; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - k; g.fillStyle = '#8d7f7a';
        g.beginPath(); g.ellipse(0, 0, 5, 1.6, 0, 0, Math.PI * 2); g.fill(); g.restore();
      } else if (p.tipo === 'lasca') {
        p.vy += 900 * dt; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - k; g.fillStyle = '#5a4030'; g.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); g.restore();
      }
    }
  }

  desenharEfeitos(agora) {
    const g = this.ctx;
    const dura = { explosao: 5 * 70, anel: 450, clarao: 80, jorro: 200, corte: 220, chafariz: 1100 };
    this.efeitos = this.efeitos.filter((e) => agora - e.ini < dura[e.tipo]);
    for (const e of this.efeitos) {
      const t = agora - e.ini, k = t / dura[e.tipo];
      if (e.tipo === 'clarao') {
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 60 * e.tam);
        gr.addColorStop(0, 'rgba(255,220,120,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(e.x - 60 * e.tam, e.y - 60 * e.tam, 120 * e.tam, 120 * e.tam);
        g.restore();
        this.sprite(`clarao-${e.q}`, e.x + Math.cos(e.ang) * 18 * e.tam, e.y + Math.sin(e.ang) * 18 * e.tam, 46 * e.tam, { rot: e.ang });
      } else if (e.tipo === 'explosao') {
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
        this.sprite(e.nome, e.x, e.y, (e.grande ? 70 : 46) * (0.8 + k * 0.4), { alfa: 1 - k * k, virar: e.lado < 0 });
      } else if (e.tipo === 'chafariz') {
        // o pescoço jorrando, enquanto o corpo voa
        const v = this.voando.get(e.i);
        if (v && Math.random() < 0.9) this.sangue(v.x, v.y - 10, 2, 0, 1.3);
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
    // borda vermelha: levou dano agora, ou vida baixa (pulsando com o coração)
    const meu = est?.ratos[this.eu];
    const pv = meu?.vivo ? meu.vida / RATOS[this.cor(this.eu)].vida : 1;
    const ferido = Math.max(0, 1 - (agora - this.ferido) / 350);
    const baixa = pv < 0.35 ? (0.35 - pv) / 0.35 * (0.6 + Math.sin(agora / 140) * 0.4) : 0;
    if (pv < 0.35 && agora > this.batida) { this.batida = agora + 850; som.coracao(); }
    const forca = Math.max(ferido * 0.55, baixa * 0.7);
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
      g.fillStyle = 'rgba(20,6,6,.8)';
      g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
      g.strokeStyle = this.tom(i); g.lineWidth = i === this.eu ? 3 : 2; g.stroke();
      const lado = compacto ? 36 : 44, ax = dir ? x + w - lado - 6 : x + 6, ay = y + (h - lado) / 2;
      const foto = this.fotos[i];
      g.save(); g.beginPath(); g.roundRect(ax, ay, lado, lado, 8); g.clip();
      g.fillStyle = `${this.tom(i)}44`; g.fillRect(ax, ay, lado, lado);
      const cara = IMG[`${this.bicho(i)}-cara`];
      if (pronto(foto)) g.drawImage(foto, ax, ay, lado, lado);
      else if (pronto(cara)) g.drawImage(cara, ax, ay, lado, lado);
      if (!e.r[i]?.[4]) { g.fillStyle = 'rgba(140,0,0,.6)'; g.fillRect(ax, ay, lado, lado); }
      g.restore();
      const tx = dir ? ax - 8 : ax + lado + 8;
      g.textAlign = dir ? 'right' : 'left';
      g.font = `800 ${compacto ? 13 : 15}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(this.nome(i) + (i === this.eu ? ' ★' : '') + (e.fora?.[i] ? ' · saiu' : ''), tx, y + 20);
      g.font = `600 ${compacto ? 10 : 11}px system-ui, sans-serif`;
      const k2 = RATOS[this.cor(i)];
      const branca = i === this.eu && this.pred ? this.pred.branca : !!e.r[i]?.[14];
      g.fillStyle = branca ? '#ff7070' : '#ffcf9e';
      g.fillText((branca ? `🔪 ${k2.b.nome}` : k2.arma).toUpperCase(), tx, y + 34);
      g.font = 'italic 900 22px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ff3b3b';
      g.textAlign = dir ? 'left' : 'right';
      g.fillText(`${e.abates[i]}`, dir ? x + 10 : x + w - 10, y + 30);
      g.font = '800 12px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ffe28a';
      g.fillText(`💀 ${e.mortes?.[i] ?? 0}`, dir ? x + 10 : x + w - 10, y + 47);
      g.restore();
    }
    // relógio
    g.textAlign = 'center';
    g.fillStyle = 'rgba(20,6,6,.85)';
    g.beginPath(); g.roundRect(vw / 2 - 64, 8, 128, 50, 12); g.fill();
    g.font = '700 11px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = '#ff9a9a';
    g.fillText(`${ABATES_VITORIA} ABATES LEVA`, vw / 2, 23);
    const resta = e.fase === 'jogo' && e.fimEm ? Math.max(0, e.fimEm - (agora + this.desvio)) : TEMPO_PARTIDA;
    const seg = Math.ceil(resta / 1000);
    g.font = '900 24px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = seg <= 15 && e.fase === 'jogo' ? '#ff6b6b' : '#fff';
    g.fillText(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 50);

    // kill feed
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

    // locutor: matança dupla, psicopata…
    if (this.anuncio && agora - this.anuncio.ini < 1800) {
      const t = (agora - this.anuncio.ini) / 1800;
      const tam = Math.min(64, vw * 0.06);
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

    // faixas do meio
    let faixa = null, cor = '#fff', grande = true;
    if (e.fase === 'contagem') {
      const s = Math.ceil((e.faseAte - (agora + this.desvio)) / 1000);
      if (s >= 1 && s !== this.ultimoBip) { this.ultimoBip = s; som.bip(false); }
      faixa = s >= 1 ? String(s) : 'MATEM!'; cor = s >= 1 ? '#ff3b3b' : '#ff5a3d';
    } else if (e.fase === 'jogo' && e.fimEm && agora + this.desvio - (e.fimEm - TEMPO_PARTIDA) < 800) {
      faixa = 'MATEM!'; cor = '#ff2a2a';
    } else if (e.fase === 'jogo' && !e.r[this.eu]?.[4] && !e.fora?.[this.eu]) {
      faixa = 'VOCÊ VIROU CARNE MOÍDA!'; cor = '#ff3b3b'; grande = false;
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
      g.fillStyle = 'rgba(20,6,6,.7)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.font = `${Math.round(r.w / 2)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.textBaseline = 'alphabetic';
    }
    if (!this.toque) {
      g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillText('A/D anda · W/espaço pula (2x no ar) · S desce · Q arma branca · E mina · mouse mira · clique ataca', this.vw - 12, this.vh - 14);
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
    const branca = !!this.pred?.branca;
    g.save();
    g.globalAlpha = mirar ? 0.9 : 0.4;
    g.fillStyle = '#b3121a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(b.fogo.x, b.fogo.y, b.fogo.r * (mirar ? 1.08 : 1), 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${b.fogo.r * 0.5}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(branca ? '🔪' : '🎯', b.fogo.x, b.fogo.y + 2);
    // dica de como mirar: nas 3 primeiras partidas, até a pessoa mirar
    if (!mirar && !this.mirou && this.mirasAntes < 3 && this.ultimo?.fase !== 'fim') {
      const pulsa = (Math.sin(performance.now() / 260) + 1) / 2;
      g.save();
      g.globalAlpha = 0.55 + pulsa * 0.45;
      g.fillStyle = '#fff';
      const R = b.fogo.r + 8 + pulsa * 5;
      for (let q = 0; q < 4; q++) {   // setinhas em volta: dá pra arrastar pra qualquer lado
        const a = (q * Math.PI) / 2;
        g.save(); g.translate(b.fogo.x + Math.cos(a) * R, b.fogo.y + Math.sin(a) * R); g.rotate(a);
        g.beginPath(); g.moveTo(8, 0); g.lineTo(-2, -7); g.lineTo(-2, 7); g.closePath(); g.fill();
        g.restore();
      }
      g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
      g.textAlign = 'right'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)';
      ['ARRASTE O 🎯 PRA MIRAR', 'ou toque no mapa onde quer atirar', '🔪 troca pra arma branca'].forEach((txt, n) => {
        const ty = b.bomba.y - b.bomba.r - 57 + n * 17, tx = this.vw - 12;
        g.strokeText(txt, tx, ty); g.fillText(txt, tx, ty);
      });
      g.restore();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    }
    if (mirar) {   // bolinha do analógico de mira
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
    botao(b.pulo, '#2a7be0', '⤒', ativo('pulo') ? 0.9 : 0.4);
    // bomba: quantas ainda posso plantar
    const minhas = (this.ultimo?.bm ?? []).filter((x) => x[3] === this.eu).length;
    const livres = BOMBA.max - minhas;
    botao(b.bomba, '#3a3a44', '💣', ativo('bomba') ? 0.9 : livres ? 0.4 : 0.2);
    g.font = `900 ${b.bomba.r * 0.55}px system-ui, sans-serif`;
    g.fillText(String(livres), b.bomba.x + b.bomba.r * 0.75, b.bomba.y - b.bomba.r * 0.7);
    botao(b.troca, branca ? '#6b1010' : '#3a3a44', branca ? '🔫' : '🔪', ativo('troca') ? 0.9 : 0.5);
    g.restore();
    g.textBaseline = 'alphabetic';
  }
}
