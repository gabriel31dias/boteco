import { ABATES_VITORIA, ALTURA, BARRIL, BARRIS, BOMBA, CAIXAS, CHAO, LARGURA, RATOS, TEMPO_PARTIDA, itensEntre, mover, plataformasEntre } from './regras.js';
import { destravar, som } from './som.js';

/**
 * Desenho, animação e controles de Ratos em Guerra (canvas 2D). Mesma ideia
 * do tanque: o estado do servidor é desenhado ~90ms no passado (interpolado),
 * e o MEU rato é previsto com os comandos que ainda não voltaram confirmados.
 * Os efeitos (clarão, cápsula, faísca, explosão, poeira, fala) saem dos
 * eventos de cada quadro, na hora em que acontecem na linha do tempo.
 *
 * As falas e o kill feed escolhem a frase pelo id do evento: todo mundo na
 * mesa vê a mesma piada.
 */

const A = import.meta.glob('../../assets/ratos/*.webp', { eager: true, import: 'default' });
const IMG = {};
for (const [k, url] of Object.entries(A)) {
  const im = new Image();
  im.src = url;
  IMG[k.split('/').pop().replace('.webp', '')] = im;
}
const pronto = (im) => im && im.complete && im.naturalWidth > 0;

const ATRASO = 90;
const TOM = { azul: '#3b8cff', vermelho: '#ff4646', verde: '#56d364', roxo: '#b86bff' };
const AGUDO = { azul: 1.1, vermelho: 0.75, verde: 0.95, roxo: 1.25 };   // o Bolota tem voz grossa
const ESCALA = 0.58;          // sprite da folha -> mundo
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const sorteio = (lista, id) => lista[Math.abs(id) % lista.length];

// onde as pernas começam (fração da altura do quadro): o Bolota tem barriga até quase o chão
const QUADRIL = { azul: 0.8, vermelho: 0.92, verde: 0.8, roxo: 0.82 };   // abaixo da arma: senão ela vai junto com a perna
// quanto a perna abre e quanto o corpo rebola: o Bolota tem perninha curta e rebola mais
const PASSADA = { azul: 0.5, vermelho: 0.3, verde: 0.5, roxo: 0.5 };
const REBOLADO = { azul: 0.05, vermelho: 0.11, verde: 0.05, roxo: 0.06 };
const PERNAS = new WeakMap();
/**
 * Onde separar a perna de trás da da frente, em fração da largura do quadro:
 * no meio do vão entre os dois pés (as duas maiores manchas opacas nas linhas
 * de baixo). Lido do próprio sprite, uma vez por imagem.
 */
function pernasDe(im) {
  if (PERNAS.has(im)) return PERNAS.get(im);
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;
  const opaco = (x, y) => px[(y * W + x) * 4 + 3] > 128;
  const cols = new Array(W).fill(false);
  for (let y = Math.floor(H * 0.9); y < H; y++) for (let x = 0; x < W; x++) if (opaco(x, y)) cols[x] = true;
  const manchas = [];
  for (let x = 0; x < W; x++) {
    if (!cols[x]) continue;
    const ini = x;
    while (x < W && cols[x]) x++;
    manchas.push([ini, x]);
  }
  manchas.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  // pés: as duas maiores manchas; o recorte da perna fica só na largura deles
  // (com folga), senão a ponta da arma que desce abaixo do quadril gira junto
  let tras = [W * 0.3, W * 0.5], frente = [W * 0.5, W * 0.7];
  if (manchas.length >= 2) [tras, frente] = manchas.slice(0, 2).sort((m, n) => m[0] - n[0]);
  else if (manchas.length === 1) { const [a, b] = manchas[0], m = (a + b) / 2; tras = [a, m]; frente = [m, b]; }
  const folga = W * 0.06;
  const r = { corte: (tras[1] + frente[0]) / 2 / W, ini: Math.max(0, tras[0] - folga) / W, fim: Math.min(W, frente[1] + folga) / W };
  PERNAS.set(im, r);
  return r;
}

const FALA = {
  abate: ['QUEIJADA!', 'VOLTA PRO BUEIRO!', 'HA HA HA!', 'CHUPA ESSA!', 'FICOU SEM QUEIJO!', 'TÁ COM MEDO, RATO?', 'PRÓXIMO!', 'RATATATÁ!'],
  morte: ['AAAAAI!', 'MEU QUEIJO!', 'SOCORRO!', 'MAMÃE!', 'FOI SEM QUERER!', 'ISSO DOEU!', 'EEEEEEK!', 'VOU CONTAR PRA MINHA MÃE!'],
  dor: ['AI!', 'UI!', 'EI!', 'PARA!', 'OUCH!', 'NO RABO NÃO!'],
  queijo: ['NHAC!', 'QUEIJINHO!', 'DELÍCIA!', 'HUMMM!'],
  kit: ['NOVO EM FOLHA!', 'CURADO!'],
  renasce: ['VOLTEI!', 'AGORA É SÉRIO!', 'CADÊ ELE?', 'SEGUNDO ROUND!'],
  sozinho: ['ESTOUREI O BARRIL…', 'OPS!', 'NÃO OLHA!'],
  bomba: ['SURPRESINHA!', 'CUIDADO ONDE PISA!', 'PRESENTINHO!', 'HE HE HE…'],
};
const VERBO = ['fatiou', 'transformou em requeijão', 'mandou pro bueiro', 'ralou', 'derreteu', 'deu um queijo-tchau em', 'despachou', 'amassou'];
const POW = ['POW!', 'BAM!', 'PLAFT!', 'TUM!'];

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
    this.efeitos = [];       // explosões, clarões
    this.manchas = [];       // sangue no chão e nas plataformas (somem devagar)
    this.camY = 0;           // topo da tela no mundo: a câmera sobe com o meu rato
    this.particulas = [];
    this.textos = [];        // dano, POW, +35
    this.baloes = new Map(); // assento -> { txt, ate }
    this.feed = [];          // kill feed
    this.voando = new Map(); // assento -> rato abatido voando (até renascer)
    this.disparo = [0, 0, 0, 0];
    this.dor = [0, 0, 0, 0];
    this.amassa = [0, 0, 0, 0];   // squash do pouso
    this.chaoAntes = [true, true, true, true];
    this.fase = [0, 0, 0, 0];     // ciclo do andar
    this.andar = [0, 0, 0, 0];    // 0 parado .. 1 andando, suavizado (sem tranco ao parar/sair)
    this.tremor = 0;
    this.ultimoBip = null;
    this.fotos = op.jogadores.map((j) => { if (!j.avatar) return null; const im = new Image(); im.src = j.avatar; return im; });

    // controles
    this.teclas = new Set();
    this.puloPendente = false;
    this.bombaPendente = false;
    this.mouse = null;
    this.mouseFogo = false;
    this.toques = new Map();
    this.mira = op.assento % 2 ? Math.PI : 0;
    this.toque = matchMedia('(pointer: coarse)').matches;
    this.encerrado = false;   // acabou (ou a conexão caiu): para de mandar comando e de prever
    this.chegou = performance.now();
    this.mirou = false;   // já mirou nesta partida
    try { this.mirasAntes = Number(localStorage.getItem('ratos-miras')) || 0; } catch { this.mirasAntes = 0; }

    // previsão
    this.cmdSeq = 0;
    this.pendentes = [];
    this.acumulado = 0;
    this.ultimoQuadro = null;
    this.pred = null;
    this.predAntes = null;      // posição antes do último comando: o desenho desliza dela até `pred`
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

  cor(i) { return this.ultimo?.cores?.[i] ?? this.op.jogadores[i]?.cor ?? ['azul', 'vermelho', 'verde', 'roxo'][i]; }
  tom(i) { return TOM[this.cor(i)]; }
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
    this.mouseFogo = false; this.puloPendente = false; this.bombaPendente = false;
    this.pendentes = [];
  }

  /** O que `mover` precisa: cores, ratos (só o meu completo) e barris. */
  mundo(e, eu) {
    return { seed: e.seed, cores: e.cores, barris: e.barris, ratos: e.r.map((o, j) => (j === this.eu ? eu : { x: o[0], y: o[1] })) };
  }

  reconciliar(e) {
    const m = e.r[this.eu];
    const ack = m[6] ?? 0;
    this.pendentes = this.pendentes.filter((c) => c.s > ack);
    const pos = { x: m[0], y: m[1], vy: m[7], kx: m[8], chao: !!m[9], pulos: m[10], atravessa: m[11], dir: m[13], movendo: false };
    if (e.fase === 'jogo' && m[4]) {
      const w = this.mundo(e, pos);
      for (const c of this.pendentes) mover(w, this.eu, c, c.dt / 1000);
    }
    if (this.pred && m[4] && this.predVivo) {
      // o servidor corrigiu: a posição de antes anda junto, senão o desenho dá um salto
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
      const salto = Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) > 120;   // renasceu: não desliza pela tela
      const kk = salto ? 1 : k;
      return { x: lerp(ra[0], rb[0], kk), y: lerp(ra[1], rb[1], kk), ang: lerpAng(ra[2], rb[2], kk), vida: rb[3], vivo: !!rb[4], movendo: !!rb[5],
        vy: rb[7], chao: !!rb[9], protegido: !!rb[12], dir: rb[13] };
    });
    const extra = Math.max(0, t - b.agora) / 1000;
    const balas = b.b.map(([id, x, y, ang, dono]) => {
      const ba = a.b.find((z) => z[0] === id);
      const vel = RATOS[b.cores[dono]].bala;
      const px = ba ? lerp(ba[1], x, k) : x, py = ba ? lerp(ba[2], y, k) : y;
      const ex = k >= 1 ? extra : 0;
      return { id, x: px + Math.cos(ang) * vel * ex, y: py + Math.sin(ang) * vel * ex, ang, dono };
    });
    return { ratos, balas, barris: b.barris, pegos: new Set(b.pegos ?? []), seed: b.seed, bombas: b.bm ?? [] };
  }

  // ----------------------------------------------------------- eventos

  falar(i, lista, id, alto = false) {
    const txt = sorteio(lista, id);
    this.baloes.set(i, { txt, ate: performance.now() + 1600, ini: performance.now() });
    // a voz sai só do que é meu (ou de quem me acertou): 4 ratos falando junto não dá
    if (alto) som.fala(txt.toLowerCase(), AGUDO[this.cor(i)]);
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
          this.disparo[e.de] = agora + (c === 'roxo' ? 60 : 110);
          const tam = { azul: 0.9, vermelho: 1.5, verde: 1.2, roxo: 0.7 }[c];
          this.efeitos.push({ tipo: 'clarao', x: e.x, y: e.y, ang: e.ang, tam, ini: agora, q: e.id % 5 });
          // cápsula voando pra trás
          const lado = Math.cos(e.ang) >= 0 ? 1 : -1;
          this.particulas.push({ tipo: 'capsula', x: e.x - lado * 22, y: e.y, vx: -lado * (60 + Math.random() * 80), vy: -180 - Math.random() * 120, rot: 0, vr: 20, vida: 1.4, idade: 0 });
          if (c === 'vermelho' || c === 'verde') this.fumaca(e.x, e.y, c === 'vermelho' ? 6 : 3, 0.6);
          if (c === 'vermelho') this.tremor = Math.max(this.tremor, e.de === this.eu ? 6 : 2);
          som.tiro(c, longe(e.x, e.y));
          break;
        }
        case 'acerto': {
          this.dor[e.alvo] = agora + 220;
          this.faiscas(e.x, e.y, 10);
          this.pelos(e.x, e.y, 4);
          {   // sangue espirra pro lado de onde veio o tiro
            const de = e.de != null ? est?.ratos[e.de] : null, alvo = est?.ratos[e.alvo];
            const lado = de && alvo ? Math.sign(alvo.x - de.x) || 1 : 0;
            this.sangue(e.x, e.y, 6 + Math.min(16, e.dano / 2), lado);
          }
          this.textos.push({ x: e.x, y: e.y - 20, txt: `-${e.dano}`, cor: '#fff', ini: agora, tam: 22 + Math.min(16, e.dano / 3) });
          if (e.dano >= 11) this.textos.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y - 50, txt: sorteio(POW, e.id), cor: '#ffd23d', ini: agora, tam: 30, pow: true });
          if (e.alvo === this.eu) this.tremor = Math.max(this.tremor, 7);
          if (e.cabeca) {
            // HEADSHOT: chafariz de sangue da cabeça, letreiro e clarão na tela
            this.sangue(e.x, e.y, 40, 0, 1.7);
            this.textos.push({ x: e.x, y: e.y - 70, txt: 'HEADSHOT!', cor: '#ffd23d', ini: agora, tam: 44, pow: true, longo: true });
            this.clarao = { ini: agora, eu: e.de === this.eu || e.alvo === this.eu };
            this.tremor = Math.max(this.tremor, 22);
            som.headshot();
            som.fala('headshot!', 1, true);
          }
          som.acerto(longe(e.x, e.y));
          if (e.id % 3 === 0) som.guincho(AGUDO[this.cor(e.alvo)], longe(e.x, e.y));
          if (e.id % 5 === 0) this.falar(e.alvo, FALA.dor, e.id, e.alvo === this.eu);
          break;
        }
        case 'abate': {
          const c = this.cor(e.alvo);
          this.voando.set(e.alvo, { x: e.x, y: e.y, vx: (e.dir || 1) * (260 + (e.id % 5) * 40), vy: e.cabeca ? -820 : -620, rot: 0, vr: (e.dir || 1) * (e.cabeca ? 16 : 9), ini: agora });
          this.explosao(e.x, e.y, 0.8);
          this.pelos(e.x, e.y, 12);
          this.sangue(e.x, e.y, 34, e.dir || 0, 1.5);
          this.estrelas(e.x, e.y - 20);
          this.tremor = Math.max(this.tremor, e.alvo === this.eu ? 20 : 10);
          som.grito(AGUDO[c], longe(e.x, e.y));
          if (!e.saiu) {
            this.falar(e.alvo, FALA.morte, e.id, e.alvo === this.eu);
            if (e.de != null && e.de !== e.alvo) {
              setTimeout(() => this.falar(e.de, FALA.abate, e.id + 1, e.de === this.eu), 450);
              this.feed.unshift({ txt: e.cabeca ? `💀 ${this.nome(e.de)} deu HEADSHOT em ${this.nome(e.alvo)}` : `${this.nome(e.de)} ${sorteio(VERBO, e.id)} ${this.nome(e.alvo)}`, de: e.de, alvo: e.alvo, ini: agora });
            } else {
              this.feed.unshift({ txt: `${this.nome(e.alvo)} se explodiu sozinho`, de: e.alvo, alvo: e.alvo, ini: agora });
              setTimeout(() => this.falar(e.alvo, FALA.sozinho, e.id, e.alvo === this.eu), 300);
            }
          } else this.feed.unshift({ txt: `${this.nome(e.alvo)} fugiu da briga`, de: e.alvo, alvo: e.alvo, ini: agora });
          this.feed = this.feed.slice(0, 5);
          break;
        }
        case 'renasce':
          this.voando.delete(e.i);
          this.poeira(e.x, e.y, 3, 1.4);
          this.efeitos.push({ tipo: 'anel', x: e.x, y: e.y - 30, cor: this.tom(e.i), ini: agora });
          if (e.i === this.eu) som.renasce();
          if (e.id % 2 === 0) this.falar(e.i, FALA.renasce, e.id, e.i === this.eu);
          break;
        case 'pulo':
          this.poeira(e.x, e.y, e.duplo ? 1 : 2, e.duplo ? 0.6 : 0.8);
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
          this.explosao(e.x, e.y, 1.6);
          this.fumaca(e.x, e.y, 16, 1.5);
          this.lascas(e.x, e.y, 14);
          this.tremor = Math.max(this.tremor, 18);
          som.explosao(longe(e.x, e.y));
          break;
        case 'impacto':
          this.faiscas(e.x, e.y, 5);
          this.poeira(e.x, e.y, 1, 0.4);
          if (e.id % 3 === 0) som.impacto(longe(e.x, e.y) * 0.7);
          break;
        case 'volta':
          this.poeira(BARRIS[e.barril][0], BARRIS[e.barril][1], 2, 0.8);
          break;
        case 'bomba':
          this.poeira(e.x, e.y, 1, 0.5);
          if (e.i === this.eu) som.planta();
          if (e.id % 2 === 0) this.falar(e.i, FALA.bomba, e.id, e.i === this.eu);
          break;
        case 'fogo':
          som.bip(true);
          break;
      }
    }
  }

  explosao(x, y, escala) { this.efeitos.push({ tipo: 'explosao', x, y, escala, ini: performance.now(), rot: Math.random() * 0.4 - 0.2 }); }
  poeira(x, y, n, tam) {
    for (let k = 0; k < n; k++) this.particulas.push({ tipo: 'poeira', x: x + (k - (n - 1) / 2) * 22, y, vx: (k - (n - 1) / 2) * 40, vy: -20, tam, q: (k + Math.floor(x)) % 3, vida: 0.5, idade: 0 });
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
  /** Gotas de sangue: `lado` puxa o jorro pra um lado (0 = pra todo lado), `forca` o tamanho. */
  sangue(x, y, n, lado = 0, forca = 1) {
    for (let k = 0; k < n; k++) {
      // com lado: leque pra frente do tiro, um pouco pra cima; sem: chafariz pra cima
      const a = lado ? (lado > 0 ? -0.4 : Math.PI + 0.4) + (Math.random() - 0.5) * 1.6 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = (90 + Math.random() * 260) * forca;
      this.particulas.push({ tipo: 'sangue', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 * forca, r: 1.5 + Math.random() * 2.8 * forca, vida: 1.6, idade: 0 });
    }
  }

  /** Gota caiu em algo: vira mancha (achatada no chão). No máximo 80; as velhas saem. */
  manchar(x, y, r) {
    this.manchas.push({ x, y, r: r * (1.6 + Math.random()), ini: performance.now(), rot: Math.random() * 6 });
    if (this.manchas.length > 80) this.manchas.shift();
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
  estrelas(x, y) {
    for (let k = 0; k < 6; k++) this.particulas.push({ tipo: 'estrela', x, y, a: (k / 6) * Math.PI * 2, vida: 1.2, idade: 0 });
  }
  brilho(x, y, cor) {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      this.particulas.push({ tipo: 'faisca', x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, cor, vida: 0.45, idade: 0 });
    }
  }

  // ---------------------------------------------------------- controles

  ligar() {
    this.h = {
      teclaDesce: (e) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat && (k === 'w' || k === ' ' || k === 'arrowup')) this.puloPendente = true;
        if (!e.repeat && (k === 'e' || k === 'q')) this.bombaPendente = true;
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
  paraMundo(v) { return { x: (v.x - this.ox) / this.esc, y: (v.y - this.oy) / this.esc + this.camY }; }

  botoes() {
    const s = Math.min(this.vw, this.vh), m = 12;
    if (!this.toque) return { sair: { x: 14, y: this.vh - 52, w: 40, h: 40 }, mudo: { x: 62, y: this.vh - 52, w: 40, h: 40 } };
    // no toque: tudo pequeno e encostado nos cantos, pra não tampar o jogo
    const joy = { x: m + s * 0.12, y: this.vh - m - s * 0.12, r: s * 0.12 };
    const fogo = { x: this.vw - m - s * 0.11, y: this.vh - m - s * 0.11, r: s * 0.11 };
    const pr = s * 0.075, br = s * 0.06;
    return {
      // ✕ e 🔊 empilhados na borda esquerda, acima do joystick
      sair: { x: 8, y: joy.y - joy.r - 84, w: 34, h: 34 },
      mudo: { x: 8, y: joy.y - joy.r - 44, w: 34, h: 34 },
      joy,
      fogo,
      pulo: { x: fogo.x - fogo.r - 12 - pr, y: this.vh - m - pr, r: pr },
      bomba: { x: fogo.x, y: fogo.y - fogo.r - 12 - br, r: br },
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
      if (e.button === 2) this.puloPendente = true;   // botão direito pula
      return;
    }
    e.preventDefault();
    this.toque = true;
    if (Math.hypot(v.x - b.bomba.x, v.y - b.bomba.y) < b.bomba.r * 1.45) {
      this.bombaPendente = true;
      this.toques.set(e.pointerId, { tipo: 'bomba', x0: v.x, y0: v.y, x: v.x, y: v.y });
      return;
    }
    if (Math.hypot(v.x - b.pulo.x, v.y - b.pulo.y) < b.pulo.r * 1.45) {
      this.puloPendente = true;
      this.toques.set(e.pointerId, { tipo: 'pulo', x0: v.x, y0: v.y, x: v.x, y: v.y });
      return;
    }
    if (v.x < this.vw / 2) {
      this.toques.set(e.pointerId, { tipo: 'mover', x0: v.x, y0: v.y, x: v.x, y: v.y, pulou: false });
      return;
    }
    // no botão de tiro: analógico preso no centro do botão (já mira no toque).
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
    try { localStorage.setItem('ratos-miras', String(this.mirasAntes + 1)); } catch { /* sem storage */ }
  }

  ponteiroMove(e) {
    const v = this.paraVirtual(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { this.mouseV = v; this.toque = false; return; }
    const t = this.toques.get(e.pointerId);
    if (!t) return;
    t.x = v.x; t.y = v.y;
    // joystick pra cima pula (uma vez por subida)
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
    this.mouse = this.mouseV ? this.paraMundo(this.mouseV) : null;   // a câmera anda: converte toda vez
    if (meu && this.mouse && !this.toque) this.mira = Math.atan2(this.mouse.y - (meu.y - 34), this.mouse.x - meu.x);
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
        if (meu) { const m = this.paraMundo(t); this.mira = Math.atan2(m.y - (meu.y - 34), m.x - meu.x); this.aprendeuMirar(); }
      }
    }
    // no toque, sem mirar: atira pra onde anda
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
      const c = { s: ++this.cmdSeq, mx, pulo: this.puloPendente, desce, dt: 33, ang, fogo, bomba: this.bombaPendente };
      this.puloPendente = false;
      this.bombaPendente = false;
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

  sprite(nome, x, y, w, { rot = 0, virar = false, alfa = 1, h, sx = 1, sy = 1, base = false } = {}) {
    const im = IMG[nome];
    if (!pronto(im)) return;
    const hh = h ?? (w * im.naturalHeight) / im.naturalWidth;
    const g = this.ctx;
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale((virar ? -1 : 1) * sx, sy);
    g.globalAlpha = alfa;
    g.drawImage(im, -w / 2, base ? -hh : -hh / 2, w, hh);
    g.restore();
  }

  /**
   * Céu, fixo na tela: dia lá embaixo, entardecer no meio, noite estrelada lá
   * no alto. O fundo das torres desce mais devagar que o mundo (parallax) e
   * nuvens passam na altura do meio.
   */
  desenharCeu(agora) {
    const g = this.ctx;
    const h = -this.camY;                                 // quanto já subiu
    const t = Math.min(1, h / 7000);
    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    // azul fica bastante, a virada pro entardecer é curta (no meio, azul+laranja dá cinza)
    const AZUL = [86, 156, 228], OCASO = [244, 140, 96], NOITE = [16, 18, 48];
    const cima = t < 0.3 ? AZUL : t < 0.42 ? mix(AZUL, OCASO, (t - 0.3) / 0.12) : t < 0.6 ? OCASO : mix(OCASO, NOITE, Math.min(1, (t - 0.6) / 0.3));
    const baixo = mix(cima, [255, 214, 160], 0.35 * (1 - t));
    const gr = g.createLinearGradient(0, 0, 0, ALTURA);
    gr.addColorStop(0, `rgb(${cima})`); gr.addColorStop(1, `rgb(${baixo})`);
    g.fillStyle = gr; g.fillRect(-20, -20, LARGURA + 40, ALTURA + 40);
    if (t > 0.45) {   // estrelas
      g.fillStyle = `rgba(255,255,255,${Math.min(1, (t - 0.45) * 2.5)})`;
      for (let k = 0; k < 70; k++) {
        const x = (k * 7919) % LARGURA, y = ((k * 4813 + h * 0.08) % ALTURA + ALTURA) % ALTURA;
        const pisca = 0.6 + Math.sin(agora / 300 + k) * 0.4;
        g.globalAlpha = Math.min(1, (t - 0.45) * 2.5) * pisca;
        g.fillRect(x, y, k % 5 ? 2 : 3, k % 5 ? 2 : 3);
      }
      g.globalAlpha = 1;
    }
    // nuvens (parallax 0,3), uma faixa a cada 500 de altura
    const desloc = h * 0.3;
    for (let k = Math.floor((desloc - ALTURA) / 260); k <= Math.floor(desloc / 260) + 1; k++) {
      if (k < 1) continue;
      const y = ALTURA - (k * 260 - desloc);
      const x = ((k * 5347) % (LARGURA + 400)) - 200 + Math.sin(agora / 4000 + k) * 30;
      g.fillStyle = `rgba(255,255,255,${0.55 * (1 - t * 0.7)})`;
      for (const [dx, dy, r] of [[0, 0, 40], [45, -12, 52], [95, 0, 38], [50, 14, 46]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill(); }
    }
    // torres da arena: descem mais devagar que o mundo, somem conforme sobe,
    // e a borda de cima se desmancha no céu (sem linha dura)
    const y0 = h * 0.4, alfa = Math.max(0, 1 - h / 2600);
    if (pronto(IMG.fundo) && alfa > 0 && y0 < ALTURA) {
      g.globalAlpha = alfa;
      g.drawImage(IMG.fundo, 0, y0, LARGURA, ALTURA);
      g.globalAlpha = 1;
      const ceuAli = mix(cima, baixo, Math.min(1, Math.max(0, y0 / ALTURA)));
      const borda = g.createLinearGradient(0, y0 - 2, 0, y0 + 180);
      borda.addColorStop(0, `rgba(${ceuAli},1)`); borda.addColorStop(1, `rgba(${ceuAli},0)`);
      g.fillStyle = borda; g.fillRect(-20, y0 - 2, LARGURA + 40, 182);
    }
  }

  desenharCenario(est, agora) {
    const g = this.ctx;
    // pneus e bandeirinhas: enfeite
    this.sprite('pneus', 120, CHAO, 46, { base: true, alfa: 0.9 });
    this.sprite('pneus', 1160, CHAO, 46, { base: true, alfa: 0.9 });
    for (let x = 60; x < LARGURA; x += 120) this.sprite('bandeirinhas', x, 40 + Math.sin(agora / 600 + x) * 2, 70, { alfa: 0.85 });
    // chão: fileira de blocos de metal
    const lado = 68;
    for (let x = 0; x < LARGURA; x += lado) {
      if (pronto(IMG.bloco)) g.drawImage(IMG.bloco, x, CHAO - 4, lado, lado);
      if (pronto(IMG.bloco)) g.drawImage(IMG.bloco, x, CHAO - 4 + lado, lado, lado);
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, CHAO - 4, LARGURA, 5);
    // plataformas: tampa de madeira esticada (pontas inteiras, meio esticado)
    const im = IMG.plataforma;
    if (pronto(im)) {
      const iw = im.naturalWidth, ih = im.naturalHeight, ponta = 26, alt = 42;
      for (const [x0, x1, top] of plataformasEntre(est?.seed ?? 0, this.camY - 60, this.camY + ALTURA + 60)) {
        const y = top - 6;
        g.save(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x0 + 6, y + alt - 4, x1 - x0 - 12, 8); g.restore();
        g.drawImage(im, 0, 0, ponta, ih, x0, y, ponta * alt / ih, alt);
        g.drawImage(im, ponta, 0, iw - 2 * ponta, ih, x0 + ponta * alt / ih, y, x1 - x0 - 2 * ponta * alt / ih, alt);
        g.drawImage(im, iw - ponta, 0, ponta, ih, x1 - ponta * alt / ih, y, ponta * alt / ih, alt);
      }
    }
    for (const [x0, y0, x1, y1] of CAIXAS) {
      const alta = y1 - y0 > 70;
      this.sprite(alta ? 'caixa-alta' : 'caixa-p', (x0 + x1) / 2, y1, x1 - x0 + 4, { base: true, h: y1 - y0 + 4 });
    }
    if (!est) return;
    for (const [k, [x, y]] of BARRIS.entries()) {
      if (est.barris[k]) continue;
      this.sprite('barril', x, y, BARRIL.w + 8, { base: true, h: BARRIL.h + 6 });
    }
    // itens flutuando, com brilho (os da faixa que aparece na tela)
    for (const it of itensEntre(est.seed, this.camY - 80, this.camY + ALTURA + 80)) {
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
      this.sprite(it.tipo === 'kit' ? 'kit' : 'queijo', it.x, it.y - 22 + bob, it.tipo === 'kit' ? 34 : 38, { rot: Math.sin(agora / 500 + k) * 0.12 });
    }
  }

  /**
   * Qual quadro do rato agora: atirando, levando dor ou mirando. Os quadros de
   * corrida e pulo da folha não servem: neles o rato está sem arma (ou com
   * outra arma) e cada um tem um tamanho — a arma piscava a cada passo. O
   * andar é feito no desenho, em cima da pose de mira (ver `desenharRato`).
   */
  quadro(i, agora) {
    const c = this.cor(i);
    const tem = (n) => pronto(IMG[`${c}-${n}`]);
    if (this.dor[i] > agora && tem('dor')) return 'dor';
    if (this.disparo[i] > agora) return 'tiro';
    return tem('mira') ? 'mira' : 'parado';
  }

  desenharRato(i, r, agora) {
    const g = this.ctx;
    const c = this.cor(i);
    const k = RATOS[c];
    const esq = Math.cos(r.ang) < 0;
    // pouso: amassa e volta
    if (r.chao && !this.chaoAntes[i]) { this.amassa[i] = 1; if (i === this.eu) som.pouso(); this.poeira(r.x, r.y, 2, 0.5); }
    this.chaoAntes[i] = r.chao;
    this.amassa[i] *= 0.82;
    const a = this.amassa[i];
    // Andar de desenho animado. O ciclo anda com o tempo, no ritmo da
    // velocidade do rato (o Bolota pisa mais devagar); `andar` sobe e desce
    // suave, então parar e sair não dão tranco.
    const dt = this.dtQuadro ?? 0.016;
    const quer = r.chao && r.movendo ? 1 : 0;
    this.andar[i] += (quer - this.andar[i]) * Math.min(1, dt * 10);
    const n = this.andar[i];
    if (quer) {
      const pisou = (f) => Math.floor((f - Math.PI / 2) / Math.PI);
      const antes = pisou(this.fase[i]);
      this.fase[i] += k.vel * dt * 0.06;
      if (pisou(this.fase[i]) !== antes) {   // pé no chão (pernas abertas): poeirinha atrás
        this.particulas.push({ tipo: 'poeira', x: r.x + (esq ? 1 : -1) * k.w * 0.4, y: r.y, vx: (esq ? 1 : -1) * 30, vy: -10, tam: 0.35, q: Math.floor(this.fase[i]) % 3, vida: 0.35, idade: 0 });
      }
    }
    const ph = this.fase[i];
    // sin(ph) = abertura das pernas. Aberta = pé no chão (corpo baixo, amassa);
    // cruzando = corpo no alto. É isso que deixa o quique em sincronia com o passo.
    const abre = Math.sin(ph);
    const pulinho = 1 - Math.abs(abre);               // 1 = pernas cruzando (alto), 0 = pisando
    const pisada = Math.max(0, 0.3 - pulinho) * n;
    // pernas: tesoura no andar; no ar, uma pra frente e outra pra trás
    const perna = r.chao ? abre * PASSADA[c] * n : Math.max(-0.45, Math.min(0.45, r.vy / 1200)) + 0.3;
    const estica = !r.chao ? Math.min(0.12, Math.abs(r.vy) / 6000) : 0;
    const respira = r.chao ? Math.sin(agora / 420 + i * 2) * 0.025 * (1 - n) : 0;
    const sx = 1 + a * 0.22 - estica + pisada * 0.16 - respira;
    const sy = 1 - a * 0.22 + estica - pisada * 0.16 + respira + pulinho * 0.04 * n;
    const bob = -pulinho * (k.vida > 120 ? 5 : 7) * n;
    const rebola = abre * REBOLADO[c] * n;
    const frente = 0.06 * n;                         // inclina pra onde olha
    // inclina pra onde mira (só um pouco: o sprite é de lado)
    const relativo = esq ? Math.PI - r.ang : r.ang;
    const incl = Math.max(-0.35, Math.min(0.35, Math.atan2(Math.sin(relativo), Math.cos(relativo)))) * (esq ? -1 : 1);
    const nome = `${c}-${this.quadro(i, agora)}`;
    const im = IMG[nome];
    if (!pronto(im)) return;
    const w = im.naturalWidth * ESCALA, h = im.naturalHeight * ESCALA;
    // Os quadros têm larguras diferentes (o de tiro tem o clarão saindo pra
    // frente): todos alinham pela borda de trás do corpo, com a largura da pose
    // parada. Assim o corpo não pula de lado quando troca de quadro.
    const base = IMG[`${c}-parado`];
    const wb = pronto(base) ? base.naturalWidth * ESCALA : w;
    // sombra no chão de baixo
    g.save(); g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(r.x, r.y + 2, k.w * 0.7, 6, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.save();
    g.translate(r.x, r.y + bob);
    g.rotate(incl * 0.6 + rebola + frente * (esq ? -1 : 1));   // tudo pelos pés
    g.scale(sx, sy);
    g.translate(0, -h * 0.45);
    if (esq) g.scale(-1, 1);
    // protegido: pisca
    g.globalAlpha = r.protegido ? (Math.floor(agora / 90) % 2 ? 0.35 : 0.9) : 1;
    const X0 = -wb / 2, Y0 = -h * 0.55;
    const quadril = Y0 + h * QUADRIL[c];
    const pe = pernasDe(im);
    const corte = X0 + w * pe.corte, ini = X0 + w * pe.ini, fim = X0 + w * pe.fim;
    const baixo = Y0 + h + 20;
    const perna1 = (x0, x1, ang, px) => {
      g.save();
      g.beginPath(); g.rect(x0, quadril - 2, x1 - x0, baixo - quadril + 2); g.clip();
      g.translate(px, quadril); g.rotate(ang); g.translate(-px, -quadril);
      g.drawImage(im, X0, Y0, w, h);
      g.restore();
    };
    const desenhaRato = () => {
      if (!perna) { g.drawImage(im, X0, Y0, w, h); return; }
      perna1(ini, corte, -perna, corte - w * 0.06);   // de trás
      perna1(corte, fim, perna, corte + w * 0.06);    // da frente
      // o resto (corpo, rabo, arma) parado: tudo menos a faixa das pernas
      g.save();
      g.beginPath();
      g.rect(X0 - 40, Y0 - 40, w + 80, h + 80);
      g.rect(ini, quadril + 3, fim - ini, baixo - quadril);
      g.clip('evenodd');
      g.drawImage(im, X0, Y0, w, h);
      g.restore();
    };
    desenhaRato();
    if (this.dor[i] > agora) {   // leva tiro: pisca branco
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55;
      desenhaRato();
    }
    g.restore();
    // escudo de quem acabou de renascer
    if (r.protegido) {
      g.save(); g.strokeStyle = `${this.tom(i)}aa`; g.lineWidth = 3;
      g.beginPath(); g.arc(r.x, r.y - k.h / 2, k.h * 0.75 + Math.sin(agora / 100) * 2, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    // nome e vida
    const bw = 54, bx = r.x - bw / 2, by = r.y - k.h - 26;
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(bx - 2, by - 2, bw + 4, 9);
    const pv = r.vida / k.vida;
    g.fillStyle = pv > 0.5 ? '#3ddc5a' : pv > 0.25 ? '#ffc53d' : '#ff4d4d';
    g.fillRect(bx, by, bw * pv, 5);
    g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = this.tom(i);
    const rotulo = i === this.eu ? 'VOCÊ' : this.nome(i).toUpperCase();
    g.strokeText(rotulo, r.x, by - 5); g.fillText(rotulo, r.x, by - 5);
    // mira: só a minha. Parado, uma linha pontilhada curta; mirando, a linha
    // da bala até o alcance da arma (a escopeta mostra o leque) e um alvo.
    if (i === this.eu) {
      const mirando = this.mouseFogo || [...this.toques.values()].some((t) => t.tipo === 'mirar' || t.tipo === 'apontar');
      const lado = Math.cos(r.ang) >= 0 ? 1 : -1;
      g.save(); g.translate(r.x + lado * (k.w / 2 + 18), r.y - k.h * 0.52); g.rotate(r.ang);
      if (mirando) {
        const alc = Math.min(k.bala * k.vidaBala, 520);
        const gr = g.createLinearGradient(0, 0, alc, 0);
        gr.addColorStop(0, 'rgba(255,90,70,.95)'); gr.addColorStop(1, 'rgba(255,90,70,0)');
        g.strokeStyle = gr; g.lineWidth = 3; g.setLineDash([12, 7]);
        const raios = k.balas > 1 ? [-k.espalha, 0, k.espalha] : [0];
        for (const a of raios) {
          g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * alc, Math.sin(a) * alc); g.stroke();
        }
        g.setLineDash([]);
        const d = Math.min(alc * 0.8, 240);
        g.strokeStyle = '#fff'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(d, 0, 11, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        for (const [x0, y0, x1, y1] of [[d - 17, 0, d - 6, 0], [d + 6, 0, d + 17, 0], [d, -17, d, -6], [d, 6, d, 17]]) { g.moveTo(x0, y0); g.lineTo(x1, y1); }
        g.stroke();
        g.fillStyle = '#ff5a46'; g.beginPath(); g.arc(d, 0, 3, 0, Math.PI * 2); g.fill();
      } else {
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([5, 7]); g.lineWidth = 2;
        g.beginPath(); g.moveTo(12, 0); g.lineTo(72, 0); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(82, 0, 6, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
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
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
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
      // comandos saem de 33 em 33ms e a tela desenha a cada ~16: interpola pelo
      // tempo que já passou desde o último, senão o rato anda aos trancos
      const f = Math.min(1, this.acumulado / 33);
      const ax = this.predAntes ? lerp(this.predAntes.x, this.pred.x, f) : this.pred.x;
      const ay = this.predAntes ? lerp(this.predAntes.y, this.pred.y, f) : this.pred.y;
      Object.assign(r, { x: ax + this.corr.x, y: ay + this.corr.y, ang: this.mira, vy: this.pred.vy, chao: this.pred.chao, movendo: this.pred.movendo });
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#140c18';
    g.fillRect(0, 0, innerWidth, innerHeight);
    if (this.girado) { g.translate(innerWidth, 0); g.rotate(Math.PI / 2); }

    // câmera: sobe com o meu rato (nunca abaixo do térreo), suave
    const alvoR = est?.ratos[this.eu];
    if (alvoR && (alvoR.vivo || !this.ultimo?.r[this.eu]?.[4])) {
      const alvo = Math.min(0, (alvoR.vivo ? alvoR.y : this.camY + ALTURA * 0.6) - ALTURA * 0.6);
      this.camY += (alvo - this.camY) * Math.min(1, dt * 5);
    }
    g.save();
    this.tremor *= 0.87;
    g.translate(this.ox + (Math.random() - 0.5) * this.tremor, this.oy + (Math.random() - 0.5) * this.tremor);
    g.scale(this.esc, this.esc);
    this.desenharCeu(agora);
    g.translate(0, -this.camY);
    this.desenharCenario(est, agora);
    this.manchas = this.manchas.filter((m) => agora - m.ini < 9000);
    for (const m of this.manchas) {
      const k = (agora - m.ini) / 9000;
      g.save();
      g.globalAlpha = 0.85 * (1 - k * k);
      g.fillStyle = '#9b0d12';
      g.translate(m.x, m.y);
      g.beginPath(); g.ellipse(0, 0, m.r * 1.6, m.r * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c4161d';
      g.beginPath(); g.ellipse(-m.r * 0.3, -m.r * 0.08, m.r * 0.7, m.r * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    if (est) {
      for (const [, x, y, dono, armada] of est.bombas) {
        // anel no chão na cor do dono
        g.save(); g.strokeStyle = `${this.tom(dono)}cc`; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(x, y + 1, 18, 5, 0, 0, Math.PI * 2); g.stroke(); g.restore();
        this.sprite('bomba', x, y + 2, 26, { base: true, rot: armada ? Math.sin(agora / 120 + x) * 0.05 : 0 });
        // luz do pavio: armando pisca rápido amarelo; armada, devagar vermelho
        const acesa = armada ? Math.floor(agora / 380) % 2 === 0 : Math.floor(agora / 90) % 2 === 0;
        if (acesa) {
          g.save(); g.globalCompositeOperation = 'lighter';
          const lx = x + 4, ly = y - 34;
          const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 16);
          gr.addColorStop(0, armada ? 'rgba(255,60,40,.95)' : 'rgba(255,230,80,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(lx - 16, ly - 16, 32, 32); g.restore();
        }
        if (armada && Math.random() < 0.25) this.particulas.push({ tipo: 'faisca', x: x + 4, y: y - 34, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 60, cor: '#ffb43a', vida: 0.25, idade: 0 });
      }
      for (const [i, r] of est.ratos.entries()) if (r.vivo && !this.ultimo?.fora?.[i]) this.desenharRato(i, r, agora);
      // abatidos voando, girando, até renascer
      for (const [i, v] of this.voando) {
        v.vy += 1500 * dt; v.x += v.vx * dt; v.y += v.vy * dt; v.rot += v.vr * dt;
        if (agora - v.ini < 1200 && Math.random() < 0.5) this.particulas.push({ tipo: 'sangue', x: v.x, y: v.y, vx: (Math.random() - 0.5) * 60, vy: 0, r: 1.5 + Math.random() * 2, vida: 1.6, idade: 0 });
        if (v.y > CHAO - 20) { v.y = CHAO - 20; v.vy *= -0.35; v.vx *= 0.6; v.vr *= 0.5; }
        const c = this.cor(i);
        const nome = pronto(IMG[`${c}-morto`]) ? `${c}-morto` : pronto(IMG[`${c}-dor`]) ? `${c}-dor` : `${c}-parado`;
        const im = IMG[nome];
        if (pronto(im)) this.sprite(nome, v.x, v.y, im.naturalWidth * ESCALA, { rot: v.rot, alfa: Math.max(0.3, 1 - (agora - v.ini) / 2600) });
      }
      for (const b of est.balas) {
        const c = this.cor(b.dono);
        g.save(); g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `${TOM[c]}cc`; g.lineWidth = c === 'verde' ? 4 : 2.5;
        const rastro = c === 'verde' ? 60 : 26;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - Math.cos(b.ang) * rastro, b.y - Math.sin(b.ang) * rastro); g.stroke();
        g.restore();
        const tam = { azul: 34, vermelho: 12, verde: 44, roxo: 18 }[c];
        this.sprite(`bala-${c}`, b.x - Math.cos(b.ang) * tam * 0.3, b.y - Math.sin(b.ang) * tam * 0.3, tam, { rot: b.ang });
      }
    }

    this.desenharParticulas(dt);
    this.desenharEfeitos(agora);
    if (est) {
      for (const [i, r] of est.ratos.entries()) if (r.vivo) this.desenharBalao(i, r.x, r.y - RATOS[this.cor(i)].h - 34, agora);
      for (const [i, v] of this.voando) this.desenharBalao(i, v.x, v.y - 50, agora);
    }
    this.desenharTextos(agora);
    g.restore();

    this.desenharHud(agora);
    this.desenharControles();
  }

  desenharParticulas(dt) {
    const g = this.ctx;
    this.particulas = this.particulas.filter((p) => (p.idade += dt) < p.vida);
    for (const p of this.particulas) {
      const k = p.idade / p.vida;
      if (p.tipo === 'estrela') {
        const a = p.a + p.idade * 5, rr = 22 + p.idade * 10;
        g.fillStyle = `rgba(255,220,60,${1 - k})`;
        estrela(g, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.4 - p.idade * 30, 7);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tipo === 'fumaca') {
        p.vx *= 0.96; p.vy *= 0.96;
        g.fillStyle = `rgba(80,70,70,${0.42 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 1.6), 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'faisca') {
        g.strokeStyle = p.cor ? `${p.cor}` : `rgba(255,${210 - k * 120},80,${1 - k})`;
        g.globalAlpha = 1 - k;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
        g.globalAlpha = 1;
      } else if (p.tipo === 'capsula') {
        p.vy += 900 * dt; p.rot += p.vr * dt;
        if (p.y > CHAO - 3) { p.y = CHAO - 3; p.vy *= -0.4; p.vx *= 0.6; p.vr *= 0.6; }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - Math.max(0, k - 0.6) * 2.5;
        g.fillStyle = '#e8b04a'; g.fillRect(-4, -1.5, 8, 3); g.restore();
      } else if (p.tipo === 'sangue') {
        const antes = p.y - p.vy * dt;
        p.vy += 1300 * dt;
        let pousou = p.y >= CHAO - 2 ? CHAO - 2 : null;
        if (pousou == null && p.vy > 0) {
          for (const [x0, x1, top] of plataformasEntre(this.ultimo?.seed ?? 0, p.y - 40, p.y + 40)) if (p.x > x0 && p.x < x1 && antes <= top - 4 && p.y >= top - 4) { pousou = top - 4; break; }
        }
        if (pousou != null) { this.manchar(p.x, pousou, p.r); p.idade = p.vida; continue; }
        g.fillStyle = '#c3141b';
        g.beginPath();
        // gota esticada na direção em que voa
        const ang = Math.atan2(p.vy, p.vx), comp = Math.min(3, 1 + Math.hypot(p.vx, p.vy) / 250);
        g.ellipse(p.x, p.y, p.r * comp, p.r, ang, 0, Math.PI * 2); g.fill();
      } else if (p.tipo === 'pelo') {
        p.vy += 200 * dt; p.vx *= 0.97; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - k; g.fillStyle = '#8d7f7a';
        g.beginPath(); g.ellipse(0, 0, 5, 1.6, 0, 0, Math.PI * 2); g.fill(); g.restore();
      } else if (p.tipo === 'lasca') {
        p.vy += 900 * dt; p.rot += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = 1 - k; g.fillStyle = '#8a5a2b'; g.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); g.restore();
      } else if (p.tipo === 'poeira') {
        this.sprite(`poeira-${p.q}`, p.x, p.y - 10 * p.tam, 60 * p.tam * (0.7 + k * 0.6), { alfa: 0.85 * (1 - k) });
      }
    }
  }

  desenharEfeitos(agora) {
    const g = this.ctx;
    this.efeitos = this.efeitos.filter((e) => agora - e.ini < (e.tipo === 'explosao' ? 6 * 65 : e.tipo === 'anel' ? 450 : 80));
    for (const e of this.efeitos) {
      const t = agora - e.ini;
      if (e.tipo === 'clarao') {
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, 60 * e.tam);
        gr.addColorStop(0, 'rgba(255,220,120,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(e.x - 60 * e.tam, e.y - 60 * e.tam, 120 * e.tam, 120 * e.tam);
        g.restore();
        this.sprite(`clarao-${e.q}`, e.x + Math.cos(e.ang) * 16 * e.tam, e.y + Math.sin(e.ang) * 16 * e.tam, 44 * e.tam, { rot: e.ang });
      } else if (e.tipo === 'explosao') {
        const q = Math.min(5, Math.floor(t / 65));
        g.save(); g.globalCompositeOperation = q < 3 ? 'lighter' : 'source-over';
        this.sprite(`explosao-${q}`, e.x, e.y, [70, 100, 110, 110, 105, 90][q] * e.escala, { rot: e.rot });
        g.restore();
      } else if (e.tipo === 'anel') {
        const k = t / 450;
        g.save(); g.strokeStyle = e.cor; g.globalAlpha = 1 - k; g.lineWidth = 4;
        g.beginPath(); g.arc(e.x, e.y, 20 + k * 60, 0, Math.PI * 2); g.stroke(); g.restore();
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
      g.lineWidth = 5; g.strokeStyle = t.pow ? '#a3150f' : '#000'; g.strokeText(t.txt, 0, 0);
      g.fillStyle = t.cor; g.fillText(t.txt, 0, 0);
      g.restore();
    }
  }

  desenharHud(agora) {
    const g = this.ctx;
    if (this.clarao && agora - this.clarao.ini < 260) {
      const k = (agora - this.clarao.ini) / 260;
      g.fillStyle = this.clarao.eu ? `rgba(255,40,40,${0.35 * (1 - k)})` : `rgba(255,255,255,${0.18 * (1 - k)})`;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    const e = this.ultimo;
    if (!e) return;
    // tela baixa (celular deitado): placar e relógio menores
    const zoom = this.vh < 500 ? 0.72 : 1;
    g.save(); g.scale(zoom, zoom);
    const vw = this.vw / zoom, n = e.r.length;
    const porLado = Math.ceil(n / 2);
    const w = Math.min(260, (vw - 160) / 2 / porLado - 8), h = 54, y = 8;
    const compacto = w < 190;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 1, k = Math.floor(i / 2);
      const x = dir ? vw - 10 - (k + 1) * w - k * 8 : 10 + k * (w + 8);
      g.save();
      if (e.fora?.[i]) g.globalAlpha = 0.4;
      g.fillStyle = 'rgba(14,8,22,.78)';
      g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill();
      g.strokeStyle = this.tom(i); g.lineWidth = i === this.eu ? 3 : 2; g.stroke();
      const lado = compacto ? 36 : 44, ax = dir ? x + w - lado - 6 : x + 6, ay = y + (h - lado) / 2;
      const foto = this.fotos[i];
      g.save(); g.beginPath(); g.roundRect(ax, ay, lado, lado, 8); g.clip();
      g.fillStyle = `${this.tom(i)}44`; g.fillRect(ax, ay, lado, lado);
      if (pronto(foto)) g.drawImage(foto, ax, ay, lado, lado);
      else {
        const im = IMG[`${this.cor(i)}-parado`];
        if (pronto(im)) { const s = (lado * 1.7) / im.naturalHeight; g.drawImage(im, ax + lado / 2 - im.naturalWidth * s * 0.55, ay - 2, im.naturalWidth * s, im.naturalHeight * s); }
      }
      g.restore();
      const tx = dir ? ax - 8 : ax + lado + 8;
      g.textAlign = dir ? 'right' : 'left';
      g.font = `800 ${compacto ? 13 : 15}px "Barlow Semi Condensed", system-ui, sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(this.nome(i) + (i === this.eu ? ' ★' : '') + (e.fora?.[i] ? ' · saiu' : ''), tx, y + 20);
      g.font = `600 ${compacto ? 10 : 11}px system-ui, sans-serif`;
      g.fillStyle = '#c9b8ff';
      g.fillText(RATOS[this.cor(i)].arma.toUpperCase(), tx, y + 34);
      // abates, em destaque
      g.font = 'italic 900 22px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ffd23d';
      g.textAlign = dir ? 'left' : 'right';
      g.fillText(`${e.abates[i]}`, dir ? x + 10 : x + w - 10, y + 30);
      g.font = '800 12px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#ffe28a';
      g.fillText(`🧀 ${e.queijos?.[i] ?? 0}`, dir ? x + 10 : x + w - 10, y + 47);
      g.restore();
    }
    // relógio
    g.textAlign = 'center';
    g.fillStyle = 'rgba(14,8,22,.8)';
    g.beginPath(); g.roundRect(vw / 2 - 64, 8, 128, 50, 12); g.fill();
    g.font = '700 11px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = '#c9b8ff';
    g.fillText(`QUEM FIZER ${ABATES_VITORIA} LEVA`, vw / 2, 23);
    const resta = e.fase === 'jogo' && e.fimEm ? Math.max(0, e.fimEm - (agora + this.desvio)) : TEMPO_PARTIDA;
    const seg = Math.ceil(resta / 1000);
    g.font = '900 24px "Barlow Semi Condensed", system-ui, sans-serif';
    g.fillStyle = seg <= 15 && e.fase === 'jogo' ? '#ff6b6b' : '#fff';
    g.fillText(`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`, vw / 2, 50);
    // minha altura
    const meuR = e.r[this.eu];
    if (meuR) {
      const metros = Math.max(0, Math.round((CHAO - meuR[1]) / 40));
      g.fillStyle = 'rgba(14,8,22,.75)';
      g.beginPath(); g.roundRect(vw / 2 - 40, 62, 80, 22, 8); g.fill();
      g.font = '800 13px "Barlow Semi Condensed", system-ui, sans-serif';
      g.fillStyle = '#9fe7ff';
      g.fillText(`↑ ${metros} m`, vw / 2, 78);
    }
    g.restore();
    // quem está fora da tela: seta na borda, na cor dele, com a distância
    for (const [i, o] of e.r.entries()) {
      if (i === this.eu || !o[4] || e.fora?.[i]) continue;
      const sy = (o[1] - 34 - this.camY) * this.esc + this.oy;
      if (sy > 95 && sy < this.vh - 10) continue;
      const cima = sy <= 95;
      const sx = Math.min(this.vw - 30, Math.max(30, o[0] * this.esc + this.ox));
      const yy = cima ? 106 : this.vh - 70;
      const dist = Math.round(Math.abs((o[1] - (meuR?.[1] ?? o[1])) / 40));
      g.save(); g.translate(sx, yy);
      g.fillStyle = this.tom(i); g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath();
      if (cima) { g.moveTo(0, -12); g.lineTo(11, 6); g.lineTo(-11, 6); } else { g.moveTo(0, 12); g.lineTo(11, -6); g.lineTo(-11, -6); }
      g.closePath(); g.fill(); g.stroke();
      g.font = '800 11px "Barlow Semi Condensed", system-ui, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 3; g.strokeText(`${this.nome(i)} ${dist}m`, 0, cima ? 20 : -12);
      g.fillStyle = '#fff'; g.fillText(`${this.nome(i)} ${dist}m`, 0, cima ? 20 : -12);
      g.restore();
    }

    // kill feed
    this.feed = this.feed.filter((f) => agora - f.ini < 5000);
    g.font = '700 13px "Barlow Semi Condensed", system-ui, sans-serif';
    this.feed.forEach((f, k) => {
      const yy = 82 + k * 24;
      const wt = g.measureText(f.txt).width + 20;
      g.globalAlpha = Math.min(1, (5000 - (agora - f.ini)) / 600);
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.beginPath(); g.roundRect(this.vw - wt - 12, yy - 15, wt, 21, 8); g.fill();
      g.fillStyle = this.tom(f.de); g.textAlign = 'right';
      g.fillText(f.txt, this.vw - 22, yy);
      g.globalAlpha = 1;
    });

    // faixas do meio
    let faixa = null, cor = '#fff', grande = true;
    if (e.fase === 'contagem') {
      const s = Math.ceil((e.faseAte - (agora + this.desvio)) / 1000);
      if (s >= 1 && s !== this.ultimoBip) { this.ultimoBip = s; som.bip(false); }
      faixa = s >= 1 ? String(s) : 'BRIGA!'; cor = s >= 1 ? '#ffd23d' : '#ff5a3d';
    } else if (e.fase === 'jogo' && e.fimEm && agora + this.desvio - (e.fimEm - TEMPO_PARTIDA) < 800) {
      faixa = 'BRIGA!'; cor = '#ff5a3d';
    } else if (e.fase === 'jogo' && !e.r[this.eu]?.[4] && !e.fora?.[this.eu]) {
      faixa = 'VOCÊ VIROU QUEIJO!'; cor = '#ffd23d'; grande = false;
    }
    if (faixa) {
      const tam = grande ? Math.min(120, this.vh * 0.22) : Math.min(46, this.vw * 0.045);
      const pulso = 1 + Math.sin(agora / 90) * 0.04;
      g.save();
      g.translate(this.vw / 2, this.vh / 2);
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
      g.fillStyle = 'rgba(14,8,22,.7)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 10); g.fill();
      g.font = `${Math.round(r.w / 2)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.textBaseline = 'alphabetic';
    }
    if (!this.toque) {
      g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillText('A/D anda · W/espaço pula (2x no ar) · S desce · E planta bomba · mouse mira · clique atira', this.vw - 12, this.vh - 14);
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
    const mirar = [...this.toques.values()].find((t) => t.tipo === 'mirar');
    const pulo = [...this.toques.values()].find((t) => t.tipo === 'pulo');
    g.save();
    g.globalAlpha = mirar ? 0.9 : 0.4;
    g.fillStyle = '#d6332b'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(b.fogo.x, b.fogo.y, b.fogo.r * (mirar ? 1.08 : 1), 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = `900 ${b.fogo.r * 0.5}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText('🎯', b.fogo.x, b.fogo.y + 2);
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
      const linhas = ['ARRASTE O 🎯 PRA MIRAR', 'ou toque no mapa onde quer atirar'];
      linhas.forEach((txt, n) => {
        const ty = b.bomba.y - b.bomba.r - 40 + n * 17, tx = this.vw - 12;
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
    g.globalAlpha = pulo ? 0.9 : 0.4;
    g.fillStyle = '#2a7be0';
    g.beginPath(); g.arc(b.pulo.x, b.pulo.y, b.pulo.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `900 ${b.pulo.r * 0.9}px system-ui, sans-serif`;
    g.fillText('⤒', b.pulo.x, b.pulo.y + 2);
    // bomba: quantas ainda posso plantar
    const minhas = (this.ultimo?.bm ?? []).filter((x) => x[3] === this.eu).length;
    const livres = BOMBA.max - minhas;
    g.globalAlpha = [...this.toques.values()].some((t) => t.tipo === 'bomba') ? 0.9 : livres ? 0.4 : 0.2;
    g.fillStyle = '#3a3a44';
    g.beginPath(); g.arc(b.bomba.x, b.bomba.y, b.bomba.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `900 ${b.bomba.r * 0.85}px system-ui, sans-serif`;
    g.fillText('💣', b.bomba.x, b.bomba.y + 2);
    g.font = `900 ${b.bomba.r * 0.55}px system-ui, sans-serif`;
    g.fillText(String(livres), b.bomba.x + b.bomba.r * 0.75, b.bomba.y - b.bomba.r * 0.7);
    g.restore();
    g.textBaseline = 'alphabetic';
  }
}

function estrela(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}
