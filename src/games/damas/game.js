import Phaser from 'phaser';
import { Rules, VARIANTS } from './rules.js';

// O index.html original publicava isto como global lendo um <div id="safe">.
// No app não existe esse div: as áreas seguras vêm do próprio CSS do container.
const SAFE = { t: 0, r: 0, b: 0, l: 0 };
import { LEVELS } from './ai.js';
import { THEMES, THEME_ORDER } from './theme.js';
import { audio } from './audio.js';
import * as art from './art.js';
import { fotoRedonda } from '../foto.js';
import tabuleiroUrl from '../../assets/damas/tabuleiro.jpg';
import pecaPretaUrl from '../../assets/damas/peca-preta.webp';
import pecaVermelhaUrl from '../../assets/damas/peca-vermelha.webp';
import damaPretaUrl from '../../assets/damas/dama-preta.webp';
import damaVermelhaUrl from '../../assets/damas/dama-vermelha.webp';
import estouroPretoUrl from '../../assets/damas/estouro-preto.webp';
import estouroVermelhoUrl from '../../assets/damas/estouro-vermelho.webp';

// Arte "Dama Aposta": peças e tabuleiro vêm da folha de sprites. Assento 0 joga
// de pretas (as de baixo na referência), assento 1 de vermelhas.
const ARTE = { tab_art: tabuleiroUrl, pc_p: pecaPretaUrl, pc_pk: damaPretaUrl, pc_c: pecaVermelhaUrl,
  pc_ck: damaVermelhaUrl, estouro_p: estouroPretoUrl, estouro_c: estouroVermelhoUrl };
const TRANSPARENTE = 'rgba(0,0,0,0)';          // o cenário é o CSS da tela React

const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const TEX = 224;                                   // resolucao da textura de peca
/** Vermelho fixo, não do tema: em alguns temas o `hud.bad` puxa pra laranja. */
const VERMELHO_CAPTURA = 0xe5243b;

const KEYS = ['board_p', 'board_d', 'contact', 'shadow', 'bg', 'vig', 'dust', 'spark', 'beam', 'lightpool', 'coin'];

// --- preferencias -------------------------------------------------------
const PREFS = Object.assign(
  { theme: 'blackMarble', level: 'normal', variant: 'brazilian', sound: true },
  JSON.parse(localStorage.getItem('pc.prefs') || '{}'));
const savePrefs = () => localStorage.setItem('pc.prefs', JSON.stringify(PREFS));
const theme = () => THEMES[PREFS.theme];

// --- helpers de UI ------------------------------------------------------
const wait = (scene, ms) => new Promise((r) => scene.time.delayedCall(ms, r));
function tw(scene, cfg) {
  return new Promise((res) => scene.tweens.add(Object.assign({}, cfg, {
    onComplete: () => { if (cfg.onComplete) cfg.onComplete(); res(); },
  })));
}

function label(scene, x, y, text, size, color, spacing = 0.28, family = SANS, weight = '400') {
  const t = scene.add.text(x, y, text, {
    fontFamily: family, fontSize: `${Math.round(size)}px`, color, fontStyle: weight,
  }).setOrigin(0.5);
  t.setLetterSpacing(size * spacing);
  t.x += t.letterSpacing / 2;                        // compensa o espaco final
  return t;
}

function button(scene, x, y, text, size, onClick, opts = {}) {
  const T = theme();
  const c = scene.add.container(x, y);
  const t = label(scene, 0, 0, text, size, opts.color || T.hud.text, 0.30, opts.family || SANS, opts.weight || '400');
  t.x = 0;
  const w = t.width + size * 2.2, h = size * 2.5;
  const line = scene.add.rectangle(0, h * 0.42, t.width, Math.max(1, size * 0.045), Phaser.Display.Color.HexStringToColor(opts.color || T.hud.accent).color, 0.30);
  const hit = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
  c.add([hit, t, line]);
  c.setSize(w, h);
  const set = (s, a, la) => scene.tweens.add({ targets: c, scale: s, duration: 160, ease: 'Sine.easeOut' })
    && scene.tweens.add({ targets: t, alpha: a, duration: 160 })
    && scene.tweens.add({ targets: line, alpha: la, scaleX: la > 0.4 ? 1 : 0.8, duration: 200 });
  hit.on('pointerover', () => set(1.045, 1, 0.85));
  hit.on('pointerout', () => set(1, 0.86, 0.30));
  hit.on('pointerdown', () => { audio.play('button'); scene.tweens.add({ targets: c, scale: 0.96, duration: 70, yoyo: true }); });
  hit.on('pointerup', () => onClick(c, t));
  t.setAlpha(0.86);
  c.setLabel = (s) => { t.setText(s); line.width = t.width; };
  return c;
}

// =======================================================================
// BOOT: gera todas as texturas do tema atual
// =======================================================================
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  // Sem menu no app: o lobby já escolheu jogo e sala, então o Boot gera as
  // texturas e cai direto na partida.
  init(data) { this.next = (data && data.next) || 'Match'; }

  preload() {
    for (const [k, url] of Object.entries(ARTE)) if (!this.textures.exists(k)) this.load.image(k, url);
  }

  create() {
    const T = theme();
    this.cameras.main.setBackgroundColor(TRANSPARENTE);
    const W = this.scale.width, H = this.scale.height;
    const u = Math.min(W, H) / 400;
    const txt = label(this, W / 2, H / 2, 'DAMAS PREMIUM', 13 * u, T.hud.dim, 0.34);
    this.tweens.add({ targets: txt, alpha: { from: 0.35, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.time.delayedCall(30, () => this.build(T, txt));
  }

  build(T, txt) {
    const N = VARIANTS[PREFS.variant].size;
    for (const k of KEYS) if (this.textures.exists(k)) this.textures.remove(k);

    tabuleiroTex(this, N, T, this.scale.width > this.scale.height);
    this.textures.addCanvas('contact', art.contactCanvas(360));
    this.textures.addCanvas('shadow', art.shadowCanvas(TEX));
    this.textures.addCanvas('bg', art.bgCanvas(T, 900, 1400));
    this.textures.addCanvas('vig', art.vignetteCanvas(900, 1400));
    this.textures.addCanvas('dust', art.dotCanvas(24, T.env.dust));
    this.textures.addCanvas('spark', art.dotCanvas(20, T.hud.accent));
    this.textures.addCanvas('beam', art.beamCanvas(700, 1200, T.env.glow));
    this.textures.addCanvas('coin', art.coinCanvas(96));
    this.textures.addCanvas('lightpool', art.dotCanvas(360, T.env.glow));

    const done = () => {
      document.getElementById('boot')?.classList.add('gone');
      this.scene.start(this.next, this.game.registry.get('mp'));
    };
    this.tweens.add({ targets: txt, alpha: 0, duration: 220, onComplete: done });
  }
}

/**
 * Textura do tabuleiro na perspectiva da orientação: a arte (já retificada,
 * moldura = FRAME_FRAC) entortada como a câmera de cada referência a vê.
 */
function tabuleiroTex(scene, N, T, deitado) {
  Object.assign(art.PERSP, deitado ? art.PERSP_DEITADO : art.PERSP_PE);
  scene.deitado = deitado;
  const key = deitado ? 'board_d' : 'board_p';          // uma por orientação: trocar, nunca apagar em uso
  if (scene.textures.exists(key)) return key;
  const plano = art.cv(1200, 1200);
  plano.getContext('2d').drawImage(scene.textures.get('tab_art').getSourceImage(), 0, 0, 1200, 1200);
  scene.textures.addCanvas(key, art.warp(N === 8 ? plano : art.boardFlat(T, N, 1200), 1200));
  return key;
}

// =======================================================================
// Fundo compartilhado (cenario vivo)
// =======================================================================
// O horizonte da textura fica a 30% da altura dela; ancora nesse ponto da tela.
function placeBg(bg, W, H) {
  bg.setScale(Math.max(W / bg.width, H / bg.height));
  bg.x = W / 2;
  bg.y = H * 0.30 + 0.20 * bg.displayHeight;
}

function scenery(scene) {
  const W = scene.scale.width, H = scene.scale.height, T = theme();
  const bg = scene.add.image(W / 2, H / 2, 'bg').setDepth(-100);
  placeBg(bg, W, H);

  const beam = scene.add.image(W * 0.18, H * 0.4, 'beam').setDepth(-90)
    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
  beam.setScale(Math.max(W / beam.width, H / beam.height) * 1.35);
  // respiracao da luz: nunca para, mas quase imperceptivel
  scene.tweens.add({ targets: beam, alpha: { from: 0.42, to: 0.78 }, x: beam.x + W * 0.05,
    duration: 7200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

  const dust = scene.add.particles(0, 0, 'dust', {
    x: { min: -20, max: W + 20 }, y: { min: -20, max: H + 20 },
    lifespan: { min: 7000, max: 15000 },
    speedY: { min: -7, max: 2 }, speedX: { min: -5, max: 5 },
    scale: { min: 0.08 * (W / 800), max: 0.42 * (W / 800) },
    alpha: { start: 0.32, end: 0 },
    quantity: 1, frequency: 380, maxAliveParticles: 30,
    blendMode: Phaser.BlendModes.ADD,
  }).setDepth(-80);

  const vig = scene.add.image(W / 2, H / 2, 'vig').setDepth(900);
  vig.setScale(Math.max(W / vig.width, H / vig.height) * 1.02);
  return { bg, beam, dust, vig };
}

// =======================================================================
// MENU
// =======================================================================
class Menu extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const W = this.scale.width, H = this.scale.height, T = theme();
    const u = Math.min(W, H) / 400;
    this.u = u;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cameras.main.setBackgroundColor(T.env.top);
    const sc = scenery(this);

    // tabuleiro como elemento cenografico: entra pela base, cortado pela borda
    const bw = Math.min(W * 1.3, H * 0.92);
    const bh = bw * art.PERSP.vs;
    const bcx = W / 2, bcy = H * 0.78 + bh / 2;
    const board = this.add.image(bcx, bcy, 'board').setDepth(-60).setAlpha(0.92);
    board.displayWidth = bw; board.displayHeight = bh;
    this.add.rectangle(W / 2, H / 2, W, H, Phaser.Display.Color.HexStringToColor(T.env.top).color, 0.30).setDepth(-55);

    // algumas pecas repousando sobre ele
    const N = VARIANTS[PREFS.variant].size, F = art.FRAME_FRAC;
    const cell = bw * (1 - 2 * F) / N;
    const spot = (r, c) => {
      const bu = F + (c + 0.5) / N * (1 - 2 * F), bv = F + (r + 0.5) / N * (1 - 2 * F);
      const t = art.toScreenV(bv), s2 = art.widthAt(t);
      return { x: bcx + (bu - 0.5) * bw * s2, y: bcy + (t - 0.5) * bh, s: s2 };
    };
    const deco = [[0, 3, 'pc_c'], [1, 2, 'pc_p'], [1, 6, 'pc_ck'], [2, 1, 'pc_p'], [2, 5, 'pc_c'], [3, 4, 'pc_pk']];
    deco.forEach(([r, c, k], i) => {
      const p = spot(r, c);
      const sh = this.add.image(p.x, p.y, 'shadow').setDepth(-52).setAlpha(0.45);
      sh.displayWidth = cell * 1.22 * p.s; sh.scaleY = sh.scaleX;
      const sp = this.add.image(p.x, p.y, k).setOrigin(0.5, 0.652).setDepth(-50 + r);
      sp.displayWidth = cell * 1.20 * p.s; sp.scaleY = sp.scaleX;
      this.tweens.add({ targets: sp, y: p.y - cell * 0.05, duration: 3200 + i * 340, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // --- titulo em duas linhas: a marca respira melhor assim
    const cx = W / 2, top = Math.max(H * 0.17, SAFE.t * this.dpr + 60 * u);
    const kicker = label(this, cx, top, 'PREMIUM', 13 * u, T.hud.dim, 0.62, SANS, '400');
    const title = label(this, cx, top + 40 * u, 'DAMAS', 44 * u, T.hud.accent, 0.16, SERIF, '300');
    if (title.width > W * 0.84) title.setScale(W * 0.84 / title.width);   // nunca estoura a tela
    const g = title.context.createLinearGradient(0, 0, 0, title.height);
    g.addColorStop(0, art.shade(T.hud.accent, 0.60));
    g.addColorStop(0.46, T.hud.accent);
    g.addColorStop(1, art.shade(T.hud.accent, -0.45));
    title.setFill(g);
    const rule = this.add.rectangle(cx, top + 70 * u, title.displayWidth * 0.9, Math.max(1, u * 0.9),
      Phaser.Display.Color.HexStringToColor(T.hud.accent).color, 0.45);
    const sub = label(this, cx, top + 88 * u, 'Estrategia classica. Refinada.', 10.5 * u, T.hud.dim, 0.30, SANS, '300');

    // --- botoes, na faixa livre acima do tabuleiro
    const bx = cx, by0 = H * 0.50;
    const gap = 36 * u;
    const play = button(this, bx, by0, 'JOGAR', 18 * u, () => this.go(), { color: T.hud.text, weight: '500' });
    const diff = button(this, bx, by0 + gap, `DIFICULDADE  ${LEVELS[PREFS.level].label}`, 11 * u, (c) => {
      const order = ['easy', 'normal', 'hard'];
      PREFS.level = order[(order.indexOf(PREFS.level) + 1) % 3]; savePrefs();
      c.setLabel(`DIFICULDADE  ${LEVELS[PREFS.level].label}`);
    });
    const th = button(this, bx, by0 + gap * 2, `TEMA  ${theme().label}`, 11 * u, () => {
      PREFS.theme = THEME_ORDER[(THEME_ORDER.indexOf(PREFS.theme) + 1) % THEME_ORDER.length]; savePrefs();
      audio.play('menu');
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Boot', { next: 'Menu' }));
    });
    const snd = button(this, bx, by0 + gap * 3, `SOM  ${PREFS.sound ? 'LIGADO' : 'DESLIGADO'}`, 11 * u, (c) => {
      PREFS.sound = !PREFS.sound; savePrefs();
      audio.setEnabled(PREFS.sound);
      c.setLabel(`SOM  ${PREFS.sound ? 'LIGADO' : 'DESLIGADO'}`);
    });

    label(this, cx, H * 0.72, VARIANTS[PREFS.variant].label.toUpperCase(), 8 * u, T.hud.dim, 0.42)
      .setAlpha(0.45).setDepth(10);

    // entrada
    const all = [kicker, title, rule, sub, play, diff, th, snd];
    all.forEach((o, i) => {
      o.alpha = 0; o.y += 14 * u;
      this.tweens.add({ targets: o, alpha: o === sub || o === rule || o === kicker ? 0.75 : 1, y: o.y - 14 * u,
        duration: 620, delay: 90 + i * 60, ease: 'Cubic.easeOut' });
    });
    this.cameras.main.fadeIn(340, 0, 0, 0);

    // som so pode iniciar apos um gesto do usuario
    this.input.once('pointerdown', () => { audio.setEnabled(PREFS.sound); if (PREFS.sound) audio.startMusic(); });

    // parallax discreto
    this.input.on('pointermove', (p) => {
      const dx = (p.x / W - 0.5), dy = (p.y / H - 0.5);
      this.tweens.add({ targets: board, x: bcx + dx * 20 * u, y: bcy + dy * 10 * u, duration: 700, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: sc.beam, x: W * 0.18 - dx * 26 * u, duration: 900, ease: 'Sine.easeOut' });
    });

    const onResize = () => this.scene.restart();
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  go() {
    audio.setEnabled(PREFS.sound);
    if (PREFS.sound) audio.startMusic();
    audio.play('menu');
    this.cameras.main.fadeOut(260, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Match'));
  }
}

// =======================================================================
// MATCH
// =======================================================================
class Match extends Phaser.Scene {
  constructor() { super('Match'); }

  create(dados) {
    const T = this.T = theme();
    // Multiplayer: a partida vive no SERVIDOR. A cena mantém um espelho do
    // tabuleiro só pra desenhar e pra resolver o toque. E ela sempre desenha o
    // jogador local como +1 embaixo: quando eu sou o assento 1, o tabuleiro que
    // chega é espelhado (sinal trocado e girado 180°), então nada aqui dentro
    // precisa saber que existe um "outro lado".
    this.mp = dados ?? {};
    this.assento = this.mp.seat ?? 0;
    this.cfg = VARIANTS[PREFS.variant];
    this.rules = new Rules(this.cfg);
    this.N = this.cfg.size;
    this.state = this.rules.initial();
    this.lances = [];              // lances legais do servidor, já em coordenada local
    this.pendente = null;          // lance meu esperando confirmação
    this.fila = [];                // estados do servidor, aplicados um por vez
    this.processando = false;
    this.events.once('shutdown', () => clearTimeout(this.semResposta));
    this.history = [];
    this.pieces = new Map();
    this.trays = { p: [], c: [] };
    this.selected = null;
    this.busy = true;
    this.over = false;
    this.lastMove = null;
    this.jobId = 0;
    this.cameras.main.setBackgroundColor(TRANSPARENTE);

    this.scenery = scenery(this);
    // o cenário do tema dá lugar ao da arte (CSS atrás do canvas)
    for (const o of Object.values(this.scenery)) o.setVisible(false);
    this.world = this.add.container(0, 0).setDepth(0);
    this.ui = this.add.container(0, 0).setDepth(500);

    this.contact = this.add.image(0, 0, 'contact').setAlpha(0.95);
    this.boardImg = this.add.image(0, 0, tabuleiroTex(this, this.N, T, this.scale.width > this.scale.height));
    this.pool = this.add.image(0, 0, 'lightpool').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.09);
    this.hl = this.add.graphics();
    // Captura obrigatória: casas das peças que TÊM de capturar, em vermelho
    // pulsando. Camada própria pra pulsar sem mexer nos outros destaques.
    this.hlCap = this.add.graphics();
    this.tweens.add({ targets: this.hlCap, alpha: { from: 1, to: 0.45 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.shadowLayer = this.add.container(0, 0);
    this.pieceLayer = this.add.container(0, 0);
    this.world.add([this.contact, this.boardImg, this.pool, this.hl, this.hlCap, this.shadowLayer, this.pieceLayer]);
    this.contact.setDepth(-1); this.boardImg.setDepth(0); this.pool.setDepth(1); this.hl.setDepth(2);
    this.shadowLayer.setDepth(3); this.pieceLayer.setDepth(4);

    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: { min: 340, max: 900 }, speed: { min: 20, max: 150 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.85, end: 0 },
      gravityY: 90, blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(400);

    this.buildHud();
    this.layout();
    this.spawnPieces(true);
    this.drawHighlights();
    this.intro();

    this.input.on('pointerdown', (p) => this.onTap(p.x, p.y));
    const inicial = this.mp.getEstado?.();
    if (inicial) this.aplicar(inicial);
    const onResize = () => { this.pendingLayout = true; if (!this.busy) this.relayout(); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  // --- geometria --------------------------------------------------------
  layout() {
    const W = this.scale.width, H = this.scale.height;
    this.dpr = window.devicePixelRatio ? Math.min(2, window.devicePixelRatio) : 1;
    const u = this.u = Math.min(W, H) / 400;
    // O canvas é o palco com a proporção da arte (em pé 941x1672, deitado
    // 1673x940): o tabuleiro vai onde ele está na referência.
    const portrait = this.portrait = H > W;
    // girou a tela: a mesa troca de perspectiva (e a textura junto)
    if (this.boardImg && this.deitado !== !portrait) {
      this.boardImg.setTexture(tabuleiroTex(this, this.N, this.T, !portrait));
    }
    if (portrait) {
      this.bw = W * 0.985;
      this.bh = this.bw * art.PERSP.vs;
      this.by = H * 0.715 - this.bh / 2;
    } else {
      // como na referência deitada: base da moldura com 70% da largura, pé a 85% da altura
      this.bw = W * 0.70;
      this.bh = this.bw * art.PERSP.vs;
      this.by = H * 0.85 - this.bh / 2;
    }
    this.bx = W / 2;
    this.hudTop = 0; this.hudBottom = this.by - this.bh / 2; this.ctlY = H;
    this.cell = this.bw * (1 - 2 * art.FRAME_FRAC) / this.N;

    // capturadas: nas laterais deitado (onde a arte tem as caixas), senão em faixas
    const side = (W - this.bw) / 2;
    this.trayMode = !portrait || side > this.cell * 2.0 ? 'side' : 'flat';
    this.traySize = this.cell * (this.trayMode === 'side' ? 0.66 : 0.44);
    this.trayCols = this.trayMode === 'side' ? 2 : 12;

    this.toastY = this.by;
  }

  sq(r, c) {
    const F = art.FRAME_FRAC, N = this.N;
    const bu = F + (c + 0.5) / N * (1 - 2 * F), bv = F + (r + 0.5) / N * (1 - 2 * F);
    const t = art.toScreenV(bv), s = art.widthAt(t);
    return { x: this.bx + (bu - 0.5) * this.bw * s, y: this.by + (t - 0.5) * this.bh, s };
  }
  sqi(i) { return this.sq((i / this.N) | 0, i % this.N); }

  corner(r, c, dr, dc) {
    const F = art.FRAME_FRAC, N = this.N;
    const bu = F + (c + dc) / N * (1 - 2 * F), bv = F + (r + dr) / N * (1 - 2 * F);
    const t = art.toScreenV(bv), s = art.widthAt(t);
    return { x: this.bx + (bu - 0.5) * this.bw * s, y: this.by + (t - 0.5) * this.bh };
  }

  pick(px, py) {
    const F = art.FRAME_FRAC, N = this.N, q = art.PERSP.q;
    const t = (py - this.by) / this.bh + 0.5;
    if (t < 0 || t > 1) return -1;
    const bv = t * (1 + q) / (1 + q * t);
    const s = art.widthAt(t);
    const bu = (px - this.bx) / (this.bw * s) + 0.5;
    const r = Math.floor((bv - F) / (1 - 2 * F) * N), c = Math.floor((bu - F) / (1 - 2 * F) * N);
    if (r < 0 || r >= N || c < 0 || c >= N) return -1;
    return r * N + c;
  }

  traySlot(who, i) {
    const W = this.scale.width, sz = this.traySize, gap = sz * 0.60;
    if (this.trayMode === 'side') {
      const col = i % this.trayCols, row = (i / this.trayCols) | 0;
      const inner = this.bx - this.bw / 2, outer = (W - this.bw) / 2;
      const baseX = who === 'p' ? inner - outer * 0.5 : this.bx + this.bw / 2 + outer * 0.5;
      // deitado as duas ficam no alto, onde a arte tem as caixas (embaixo são as falas)
      const y0 = this.portrait ? (who === 'p' ? this.by + this.bh * 0.36 : this.by - this.bh * 0.36) : this.by - this.bh * 0.2;
      return { x: baseX + (col - (this.trayCols - 1) / 2) * gap,
               y: y0 + (who === 'p' && this.portrait ? -1 : 1) * row * gap * 0.85 };
    }
    const y = who === 'p' ? this.by + this.bh / 2 + sz * 0.80 : this.by - this.bh / 2 - sz * 0.80;
    const col = i % this.trayCols, row = (i / this.trayCols) | 0;
    const span = (this.trayCols - 1) * gap;
    return { x: this.bx - span / 2 + col * gap,
             y: y + (who === 'p' ? 1 : -1) * row * sz * 0.55 };
  }

  // --- HUD --------------------------------------------------------------
  buildHud() {
    const T = this.T, W = this.scale.width;
    const u = Math.min(W, this.scale.height) / 400;
    const eu = this.mp.players?.[this.assento], rival = this.mp.players?.[1 - this.assento];
    this.hudName1 = label(this, 0, 0, 'VOCE', 9.5 * u, T.hud.dim, 0.34);
    this.hudName2 = label(this, 0, 0, (rival?.name ?? 'Adversario').slice(0, 12).toUpperCase(), 9.5 * u, T.hud.dim, 0.34);
    // Foto ao lado de cada nome; chega assíncrona e o placeHud abre espaço pra ela.
    this.hudFotos = [null, null];
    [eu, rival].forEach((p, i) => {
      if (!p) return;
      fotoRedonda(this, { url: p.avatar, nome: p.name }).then((key) => {
        if (!this.sys.displayList) return;
        this.hudFotos[i] = this.add.image(0, 0, key);
        // Foto do adversário abre o cartão dele no app (adicionar amigo).
        if (i === 1 && this.mp.onPerfil) {
          this.hudFotos[i].setInteractive({ useHandCursor: true }).on('pointerup', () => this.mp.onPerfil(p));
        }
        this.ui.add(this.hudFotos[i]);
        this.placeHud();
      });
    });
    this.hudN1 = label(this, 0, 0, '12', 19 * u, T.hud.text, 0.06, SANS, '300');
    this.hudN2 = label(this, 0, 0, '12', 19 * u, T.hud.text, 0.06, SANS, '300');
    this.hudVs = label(this, 0, 0, 'VS', 8.5 * u, T.hud.accent, 0.36).setAlpha(0.55);
    this.hudBar1 = this.add.rectangle(0, 0, 10, 2, Phaser.Display.Color.HexStringToColor(T.hud.accent).color, 0.5);
    this.hudBar2 = this.add.rectangle(0, 0, 10, 2, Phaser.Display.Color.HexStringToColor(T.hud.bad).color, 0.5);
    this.status = label(this, 0, 0, '', 8.5 * u, T.hud.dim, 0.42);
    this.toastTxt = label(this, 0, 0, '', 13 * u, T.hud.accent, 0.34, SANS, '500').setAlpha(0);

    // Sem REINICIAR: a partida vive no servidor, e recomeçar só na cena de um
    // jogador deixava o tabuleiro dele diferente do real.
    this.btnUndo = button(this, 0, 0, 'VOLTAR', 8.5 * u, () => this.undo());
    this.btnSound = button(this, 0, 0, PREFS.sound ? 'SOM LIGADO' : 'SOM DESLIGADO', 8.5 * u, (c) => {
      PREFS.sound = !PREFS.sound; savePrefs(); audio.setEnabled(PREFS.sound);
      c.setLabel(PREFS.sound ? 'SOM LIGADO' : 'SOM DESLIGADO');
    });
    this.btnMenu = button(this, 0, 0, 'MENU', 8.5 * u, () => {
      audio.play('menu');
      this.cameras.main.fadeOut(240, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
    });
    this.ui.add([this.hudName1, this.hudName2, this.hudN1, this.hudN2, this.hudVs,
      this.hudBar1, this.hudBar2, this.status, this.toastTxt,
      this.btnUndo, this.btnSound, this.btnMenu]);
  }

  placeHud() {
    // ponytail: a HUD do canvas continua existindo (o resto da cena mexe nela),
    // mas quem aparece é a HUD React da arte.
    [this.hudName1, this.hudName2, this.hudN1, this.hudN2, this.hudVs, this.hudBar1, this.hudBar2,
      this.status, this.btnUndo, this.btnSound, this.btnMenu, ...(this.hudFotos ?? [])].forEach((o) => o?.setVisible(false));
    const W = this.scale.width, u = this.u;
    const y = this.hudTop + 14 * u;
    const half = Math.min(this.bw / 2, W / 2 - 14 * u);
    // Foto na ponta (nome em cima, contador embaixo, ao lado dela).
    const foto = 30 * u, recuo = this.hudFotos?.some(Boolean) ? foto + 6 * u : 0;
    this.hudFotos?.forEach((f, i) => f?.setDisplaySize(foto, foto)
      .setPosition(i === 0 ? this.bx - half + foto / 2 : this.bx + half - foto / 2, y + 2 * u));
    this.hudName1.setPosition(this.bx - half + recuo + this.hudName1.width / 2, y - 9 * u);
    this.hudN1.setPosition(this.bx - half + recuo + this.hudN1.width / 2 + 2 * u, y + 12 * u);
    this.hudName2.setPosition(this.bx + half - recuo - this.hudName2.width / 2, y - 9 * u);
    this.hudN2.setPosition(this.bx + half - recuo - this.hudN2.width / 2 - 2 * u, y + 12 * u);
    this.hudVs.setPosition(this.bx, y + 2 * u);
    const barW = half * 0.78;
    this.hudBar1.setOrigin(0, 0.5).setPosition(this.bx - half, y + 25 * u).setSize(barW, Math.max(1, u * 1.2));
    this.hudBar2.setOrigin(1, 0.5).setPosition(this.bx + half, y + 25 * u).setSize(barW, Math.max(1, u * 1.2));
    this.status.setPosition(this.bx, y + 38 * u);
    this.toastTxt.setPosition(this.bx, this.toastY);

    const btns = [this.btnUndo, this.btnSound, this.btnMenu];
    const gap = Math.min(W * 0.24, this.bw * 0.26);
    btns.forEach((b, i) => b.setPosition(this.bx + (i - (btns.length - 1) / 2) * gap, this.ctlY));
  }

  updateHud() {
    const n = this.rules.count(this.state);
    this.hudN1.setText(String(n.p)); this.hudN2.setText(String(n.c));
    const tot = Math.max(1, n.p + n.c);
    this.tweens.add({ targets: this.hudBar1, scaleX: Math.max(0.06, (n.p / tot) * 2), duration: 420, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.hudBar2, scaleX: Math.max(0.06, (n.c / tot) * 2), duration: 420, ease: 'Cubic.easeOut' });
    this.btnUndo.setAlpha(this.history.length > 1 && !this.over ? 1 : 0.28);
    this.placeHud();
  }

  setStatus(s) {
    if (this.status.text === s) return;
    this.status.setText(s);
    this.status.x = this.bx;
    this.tweens.add({ targets: this.status, alpha: { from: 0.15, to: 0.8 }, duration: 340 });
  }

  toast(text, opts = {}) {
    const t = this.toastTxt;
    this.tweens.killTweensOf(t);
    t.setText(text);
    t.setFontSize(Math.round((opts.size || 13) * this.u));
    t.setLetterSpacing((opts.size || 13) * this.u * 0.34);
    t.setColor(opts.color || this.T.hud.accent);
    t.setPosition(this.bx, this.toastY);
    t.setScale(0.94); t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, scale: 1.03, delay: opts.hold || 900, duration: 380, ease: 'Sine.easeIn' });
  }

  // --- pecas ------------------------------------------------------------
  /**
   * Textura pela cor REAL da peça, não pelo lado local: o tabuleiro chega
   * espelhado pro assento 1 (as dele viram +1, embaixo), mas as dele são as
   * pretas. Sem isto os dois jogadores se viam de brancas.
   */
  pieceKey(v) {
    const real = this.assento === 0 ? v : -v;   // assento 0 = brancas (+1 no servidor)
    return real > 0 ? (real === 2 ? 'pc_pk' : 'pc_p') : (real === -2 ? 'pc_ck' : 'pc_c');
  }

  spawnPieces(hidden) {
    for (const p of this.pieces.values()) { p.spr.destroy(); p.shd.destroy(); }
    this.pieces.clear();
    const b = this.state.b;
    for (let i = 0; i < b.length; i++) {
      if (!b[i]) continue;
      const shd = this.add.image(0, 0, 'shadow').setAlpha(0.5);
      const spr = this.add.image(0, 0, this.pieceKey(b[i])).setOrigin(0.5, 0.56);
      this.shadowLayer.add(shd); this.pieceLayer.add(spr);
      const p = { sq: i, side: Math.sign(b[i]), king: Math.abs(b[i]) === 2, spr, shd };
      this.pieces.set(i, p);
      this.place(p);
      if (hidden) { spr.alpha = 0; shd.alpha = 0; }
    }
  }

  place(p) {
    const g = this.sqi(p.sq);
    p.spr.setPosition(g.x, g.y);
    p.spr.displayWidth = this.cell * (p.king ? 1.0 : 0.94) * g.s;
    p.spr.scaleY = p.spr.scaleX;
    p.spr.setDepth(100 + ((p.sq / this.N) | 0) * 2);
    p.shd.setPosition(g.x, g.y + this.cell * 0.05);
    p.shd.displayWidth = this.cell * 1.22 * g.s;
    p.shd.scaleY = p.shd.scaleX;
    p.base = g;
  }

  placeTray(spr, who, i) {
    const s = this.traySlot(who, i);
    spr.setPosition(s.x, s.y);
    spr.displayWidth = this.traySize; spr.scaleY = spr.scaleX;
    spr.setRotation(0).setDepth(520);
  }

  relayout() {
    this.pendingLayout = false;
    const W = this.scale.width, H = this.scale.height;
    this.layout();
    const sc = this.scenery;
    placeBg(sc.bg, W, H);
    sc.vig.setPosition(W / 2, H / 2).setScale(Math.max(W / sc.vig.width, H / sc.vig.height) * 1.02);
    sc.beam.setScale(Math.max(W / sc.beam.width, H / sc.beam.height) * 1.35);
    this.boardImg.setPosition(this.bx, this.by);
    this.boardImg.displayWidth = this.bw; this.boardImg.displayHeight = this.bh;
    this.contact.setPosition(this.bx, this.by + this.bh * 0.16);
    this.contact.displayWidth = this.bw * 1.42; this.contact.displayHeight = this.bh * 1.30;
    this.pool.setPosition(this.bx - this.bw * 0.22, this.by - this.bh * 0.18);
    this.pool.displayWidth = this.bw * 1.5; this.pool.scaleY = this.pool.scaleX;
    for (const p of this.pieces.values()) this.place(p);
    this.trays.p.forEach((s, i) => this.placeTray(s, 'p', i));
    this.trays.c.forEach((s, i) => this.placeTray(s, 'c', i));
    this.drawHighlights();
    this.updateHud();
    if (this.resultUI) this.resultUI.forEach((o) => o.destroy());
    this.resultUI = null;
    if (this.over) this.showResult(this.winner, true);
  }

  // --- destaques --------------------------------------------------------
  drawHighlights() {
    const g = this.hl, T = this.T;
    g.clear();
    const poly = (r, c) => [this.corner(r, c, 0, 0), this.corner(r, c, 0, 1), this.corner(r, c, 1, 1), this.corner(r, c, 1, 0)]
      .map((p) => new Phaser.Math.Vector2(p.x, p.y));
    const acc = Phaser.Display.Color.HexStringToColor(T.hud.accent).color;

    // Captura obrigatória na minha vez: toda peça que pode capturar ganha a
    // casa em vermelho — é a única que o jogo deixa mexer. Some ao selecionar
    // uma delas, pra não brigar com o destaque dos destinos.
    const cap = this.hlCap;
    cap?.clear();
    const obrigado = !this.over && !this.busy && this.state?.turn === 1 && this.legal?.[0]?.captures.length > 0;
    if (cap && obrigado && this.selected === null) {
      for (const from of new Set(this.legal.map((m) => m.from))) {
        const r = (from / this.N) | 0, c = from % this.N;
        // A peça cobre o miolo da casa: o que aparece é a borda. Por isso ela é grossa.
        cap.fillStyle(VERMELHO_CAPTURA, 0.7);
        cap.fillPoints(poly(r, c), true);
        cap.lineStyle(Math.max(2.5, this.u * 3), VERMELHO_CAPTURA, 1);
        cap.strokePoints(poly(r, c), true);
      }
    }

    // historico: origem contornada, destino levemente iluminado
    if (this.lastMove) {
      const a = this.lastMove.from, b = this.lastMove.to;
      g.lineStyle(Math.max(1, this.u * 0.9), acc, 0.34);
      g.strokePoints(poly((a / this.N) | 0, a % this.N), true);
      g.fillStyle(acc, 0.10);
      g.fillPoints(poly((b / this.N) | 0, b % this.N), true);
      g.lineStyle(Math.max(1, this.u * 0.9), acc, 0.22);
      g.strokePoints(poly((b / this.N) | 0, b % this.N), true);
    }

    if (this.selected !== null) {
      const r = (this.selected / this.N) | 0, c = this.selected % this.N;
      g.fillStyle(acc, 0.14); g.fillPoints(poly(r, c), true);
      g.lineStyle(Math.max(1.2, this.u * 1.2), acc, 0.6); g.strokePoints(poly(r, c), true);
      for (const m of this.destinations()) {
        const rr = (m.to / this.N) | 0, cc = m.to % this.N;
        const cap = m.captures.length > 0;
        g.fillStyle(acc, cap ? 0.16 : 0.09);
        g.fillPoints(poly(rr, cc), true);
        g.lineStyle(Math.max(1, this.u * 0.8), acc, cap ? 0.55 : 0.30);
        g.strokePoints(poly(rr, cc), true);
        const p = this.sq(rr, cc);
        g.fillStyle(acc, cap ? 0.8 : 0.5);
        g.fillEllipse(p.x, p.y, this.cell * 0.16 * p.s, this.cell * 0.16 * p.s * 0.56);
      }
    }
  }

  destinations() {
    if (this.selected === null) return [];
    return this.legal.filter((m) => m.from === this.selected);
  }

  // --- fluxo ------------------------------------------------------------
  async intro() {
    this.updateHud();
    this.relayout();
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.boardImg.setAlpha(0);
    this.world.setScale(1.05);
    this.world.setPosition(this.bx * (1 - 1.05), this.by * (1 - 1.05));
    this.contact.setAlpha(0);
    this.tweens.add({ targets: this.boardImg, alpha: 1, duration: 420, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: this.contact, alpha: 0.95, duration: 700, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: this.world, scale: 1, x: 0, y: 0, duration: 760, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.pool, alpha: { from: 0, to: 0.09 }, duration: 900 });
    // luz do tabuleiro respirando
    this.tweens.add({ targets: this.pool, alpha: { from: 0.06, to: 0.13 }, duration: 6400, yoyo: true, repeat: -1, delay: 900, ease: 'Sine.easeInOut' });

    const arr = [...this.pieces.values()].sort((a, b) => a.sq - b.sq);
    arr.forEach((p, i) => {
      const y = p.spr.y;
      p.spr.y = y - this.cell * 0.9;
      p.spr.setScale(p.spr.scaleX * 1.18);
      const sx = p.spr.scaleX / 1.18;
      this.time.delayedCall(120 + i * 16, () => {
        this.tweens.add({ targets: p.spr, y, scaleX: sx, scaleY: sx, alpha: 1, duration: 320, ease: 'Back.easeOut' });
        this.tweens.add({ targets: p.shd, alpha: 0.5, duration: 320 });
        if (i % 5 === 0) audio.play('land', -2);
      });
    });

    await wait(this, 120 + arr.length * 16 + 320);
    this.toast('SUA VEZ', { size: 14, hold: 800 });
    this.busy = false;
    this.beginTurn();
  }


  // --------------------------------------------------- servidor manda

  /** Espelha o índice de casa quando eu sou o assento 1. */
  vira(sq) { return this.assento === 0 ? sq : this.N * this.N - 1 - sq; }

  /** Tabuleiro do servidor → tabuleiro local (eu sempre sou +1, embaixo). */
  tabuleiroLocal(t) {
    const n = this.N * this.N;
    const b = new Int8Array(n);
    for (let i = 0; i < n; i++) b[i] = this.assento === 0 ? t[i] : -t[n - 1 - i];
    return b;
  }

  lanceLocal(m) {
    return {
      ...m,
      from: this.vira(m.from), to: this.vira(m.to),
      path: m.path.map((x) => this.vira(x)),
      captures: m.captures.map((x) => this.vira(x)),
    };
  }

  /**
   * Porta de entrada do estado do servidor: enfileira e processa um por vez.
   * Antes, um estado que chegava durante a animação do anterior era marcado
   * como aplicado sem ser desenhado — a peça ficava na casa velha e o toque
   * deixava de achar o lance ("a dama trava").
   */
  aplicar(estado) {
    clearTimeout(this.semResposta);
    this.fila.push(estado);
    if (!this.processando) this.processarFila();
  }

  async processarFila() {
    this.processando = true;
    try {
      while (this.fila.length) await this.aplicarUm(this.fila.shift());
    } finally {
      this.processando = false;
    }
  }

  /**
   * A ordem importa: o lance é animado a partir do tabuleiro ANTERIOR (é o
   * motor local que aplica durante a animação). Sincronizar antes deixaria a
   * peça já no destino e a captura sem alvo.
   */
  async aplicarUm(estado) {
    const primeiro = !this.estado;
    this.estado = estado;
    this.lances = (estado.lances ?? []).map((m) => this.lanceLocal(m));

    const novo = estado.ultimo && estado.ultimo !== this.ultimoAplicado;
    this.ultimoAplicado = estado.ultimo;
    const lance = novo && !primeiro ? this.lanceLocal(estado.ultimo) : null;
    let animou = false;
    if (lance && this.pieces.has(lance.from)) {
      try {
        await this.execute(lance, true);      // termina sincronizando e abrindo o turno
        animou = true;
      } catch (e) {
        console.error('damas: animação falhou, redesenhando do servidor', e);
      }
    }
    if (!animou) this.sincronizar(primeiro || !!lance);   // tela desencontrada: redesenha tudo

    if (estado.fim) { this.over = true; this.busy = true; return; }
    if (!animou) { this.busy = false; this.beginTurn(); }
  }

  /** Snap: se a tela diverge do servidor em QUALQUER casa, redesenha do servidor. */
  sincronizar(primeiro) {
    this.state.b = this.tabuleiroLocal(this.estado.tabuleiro);
    this.state.turn = this.estado.vez === this.assento ? 1 : -1;
    this.state.half = 0;
    const b = this.state.b;
    const ocupadas = Array.from(b).filter((v) => v !== 0).length;
    const difere = this.pieces.size !== ocupadas
      || [...this.pieces].some(([sq, p]) => Math.sign(b[sq]) !== p.side || (Math.abs(b[sq]) === 2) !== !!p.king);
    if (primeiro || difere) {
      this.spawnPieces(false);
      this.drawHighlights();
    }
  }

  beginTurn() {
    if (this.over) return;
    if (this.pendingLayout) this.relayout();
    // Quem diz o que é legal é o servidor — o motor local só desenha.
    this.legal = this.lances;
    this.selected = null;
    this.updateHud();
    this.drawHighlights();

    if (this.state.turn === 1) {
      this.setStatus('SUA VEZ');
      const hasCap = this.legal[0] && this.legal[0].captures.length > 0;
      if (hasCap) {
        const multi = this.legal.some((m) => m.captures.length > 1);
        this.toast(multi ? 'CAPTURA MULTIPLA' : 'CAPTURA DISPONIVEL', { size: 10, hold: 700 });
      }
      this.updateHud();
    } else {
      this.setStatus('VEZ DO ADVERSARIO');
    }
  }

  onTap(px, py) {
    audio.resume();
    if (this.busy || this.over || this.state.turn !== 1) return;
    const sq = this.pick(px, py);
    if (sq < 0) { if (this.selected !== null) this.deselect(); return; }

    if (this.selected !== null) {
      const mv = this.destinations().find((m) => m.to === sq);
      if (mv) return this.execute(mv);
      if (sq === this.selected) return this.deselect();
    }
    const p = this.pieces.get(sq);
    if (p && p.side === 1) {
      if (!this.legal.some((m) => m.from === sq)) {
        audio.play('warn');
        this.tweens.add({ targets: p.spr, x: p.spr.x + this.cell * 0.05, duration: 55, yoyo: true, repeat: 2 });
        if (this.legal[0].captures.length) this.toast('CAPTURA OBRIGATORIA', { size: 9.5, hold: 800, color: this.T.hud.bad });
        return;
      }
      this.select(sq);
    } else if (this.selected !== null) this.deselect();
  }

  select(sq) {
    if (this.selected !== null && this.selected !== sq) this.deselect(true);
    this.selected = sq;
    const p = this.pieces.get(sq);
    audio.play('select');
    const sb = this.cell * 1.22 * p.base.s / p.shd.width;
    this.tweens.add({ targets: p.spr, y: p.base.y - this.cell * 0.16 * p.base.s, duration: 190, ease: 'Back.easeOut' });
    this.tweens.add({ targets: p.shd, alpha: 0.62, scaleX: sb * 1.16, scaleY: sb * 1.16, duration: 190 });
    p.spr.setDepth(880);
    this.drawHighlights();
  }

  deselect(silent) {
    const p = this.pieces.get(this.selected);
    this.selected = null;
    if (p) {
      if (!silent) audio.play('deselect');
      this.tweens.add({ targets: p.spr, y: p.base.y, duration: 260, ease: 'Sine.easeOut' });
      const sb = this.cell * 1.22 * p.base.s / p.shd.width;
      this.tweens.add({ targets: p.shd, alpha: 0.5, scaleX: sb, scaleY: sb, duration: 260,
        onComplete: () => this.place(p) });
    }
    this.drawHighlights();
  }

  // --- execucao animada de um lance -------------------------------------
  /**
   * `doServidor` = já confirmado (lance do adversário, ou eco do meu). Sem ele,
   * o toque só PEDE: quem move a peça de verdade é o servidor.
   */
  async execute(mv, doServidor = false) {
    if (!doServidor) {
      this.busy = true;
      this.selected = null;
      this.hl.clear();
      this.hlCap.clear();
      this.mp.onJogada?.({ indice: mv.i });
      // Servidor recusou (lance velho, conexão caiu): ele não responde nada.
      // Sem isto o toque ficava bloqueado pra sempre.
      clearTimeout(this.semResposta);
      this.semResposta = setTimeout(() => {
        if (this.over || this.processando) return;
        this.busy = false;
        if (this.estado) this.sincronizar(false);
        this.beginTurn();
      }, 4000);
      return;
    }
    this.busy = true;
    this.selected = null;
    this.hl.clear();
    this.hlCap.clear();
    const p = this.pieces.get(mv.from);
    const lift = this.cell * 0.30;

    audio.play('lift');
    p.spr.setDepth(900);
    await tw(this, { targets: p.spr, y: p.spr.y - lift, duration: 130, ease: 'Back.easeOut' });
    this.tweens.add({ targets: p.shd, alpha: 0.30, scaleX: p.shd.scaleX * 1.34, scaleY: p.shd.scaleY * 1.34, duration: 130 });

    let combo = 0;
    for (let i = 1; i < mv.path.length; i++) {
      const to = mv.path[i], capSq = mv.captures[i - 1];
      const isCap = capSq !== undefined;
      const g = this.sqi(to);
      const x0 = p.spr.x, y0 = p.spr.y, s0 = p.spr.scaleX;
      const x1 = g.x, y1 = g.y - lift, s1 = this.cell * (p.king ? 1.0 : 0.94) * g.s / p.spr.width;
      const dist = Math.hypot(x1 - x0, y1 - y0) / this.cell;
      let dur = (isCap ? 260 : 210) + dist * 44;
      dur *= Math.pow(0.87, combo);                        // cada salto fica mais rapido
      const arc = isCap ? this.cell * (0.55 + 0.06 * combo) : this.cell * 0.10;
      const o = { t: 0 };
      audio.play(isCap ? 'lift' : 'slide');

      let fired = false;
      await tw(this, {
        targets: o, t: 1, duration: dur, ease: isCap ? 'Sine.easeInOut' : 'Cubic.easeInOut',
        onUpdate: () => {
          const t = o.t, h = Math.sin(Math.PI * t) * arc;
          p.spr.x = x0 + (x1 - x0) * t;
          p.spr.y = y0 + (y1 - y0) * t - h;
          const s = s0 + (s1 - s0) * t;
          p.spr.setScale(s * (1 + Math.sin(Math.PI * t) * 0.05));
          p.shd.x = p.spr.x;
          p.shd.y = (y0 + lift) + ((y1 + lift) - (y0 + lift)) * t + this.cell * 0.05;
          const k = 1 + (h + lift) / this.cell * 0.42;
          p.shd.displayWidth = this.cell * 1.22 * (p.base.s + (g.s - p.base.s) * t) * k;
          p.shd.scaleY = p.shd.scaleX;
          p.shd.alpha = 0.5 - (h + lift) / this.cell * 0.22;
          if (isCap && !fired && t > 0.46) { fired = true; this.capture(capSq, ++combo); }
        },
      });

      p.sq = to; p.base = g;
      if (i < mv.path.length - 1) {
        this.sparks.setParticleTint(Phaser.Display.Color.HexStringToColor(this.T.hud.accent).color);
        this.sparks.explode(4 + combo * 2, p.spr.x, p.spr.y + this.cell * 0.1);
        audio.play('combo', combo);
        if (combo >= 2) this.toast(`COMBO x${combo}`, { size: 12, hold: 520 });
        // foco visual na continuacao obrigatoria: anel de luz sob a peca
        const ring = this.add.image(p.spr.x, g.y, 'lightpool')
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setDepth(62);
        ring.displayWidth = this.cell * 0.9; ring.scaleY = ring.scaleX * 0.56;
        this.world.add(ring);
        this.tweens.add({ targets: ring, alpha: 0, scaleX: ring.scaleX * 2.2, scaleY: ring.scaleY * 2.2,
          duration: 460, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        this.tweens.add({ targets: this.pool, alpha: 0.22, duration: 130, yoyo: true });
      }
    }

    // pouso final
    await tw(this, { targets: p.spr, y: p.base.y, duration: 140, ease: 'Back.easeIn' });
    this.tweens.add({ targets: p.shd, alpha: 0.5, duration: 160, onComplete: () => this.place(p) });
    const r = (p.sq / this.N) | 0, c = p.sq % this.N;
    const onEdge = r === 0 || c === 0 || r === this.N - 1 || c === this.N - 1;
    audio.play(onEdge ? 'edge' : 'land', combo);
    this.impact(p);

    // aplica no motor
    this.pieces.delete(mv.from);
    this.pieces.set(mv.to, p);
    this.rules.do(this.state, mv);
    this.lastMove = mv;

    if (mv.promote) await this.promote(p);
    else if (combo >= 2 && this.state.turn === -1) this.toast('OTIMA JOGADA', { size: 12, hold: 800 });

    this.updateHud();
    await wait(this, 130);
    this.busy = false;
    if (this.estado) this.sincronizar(false);   // a verdade é a do servidor
    this.beginTurn();
  }

  impact(p) {
    const s = p.spr.scaleX;
    this.tweens.add({ targets: p.spr, scaleX: s * 1.07, scaleY: s * 0.93, duration: 70, yoyo: true, ease: 'Sine.easeOut' });
    const ring = this.add.image(p.spr.x, p.base.y, 'lightpool')
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.30).setDepth(60);
    ring.displayWidth = this.cell * 0.5; ring.scaleY = ring.scaleX * 0.56;
    this.world.add(ring);
    this.tweens.add({ targets: ring, alpha: 0, scaleX: ring.scaleX * 3.4, scaleY: ring.scaleY * 3.4,
      duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  capture(sq, combo) {
    const p = this.pieces.get(sq);
    if (!p) return;
    this.pieces.delete(sq);
    audio.play('capture', combo);
    // estouro da arte no lugar da peça comida, na cor dela
    const boom = this.add.image(p.spr.x, p.spr.y, this.pieceKey(p.side).startsWith('pc_p') ? 'estouro_p' : 'estouro_c')
      .setDepth(950).setBlendMode(Phaser.BlendModes.ADD);
    boom.displayWidth = this.cell * 0.6; boom.scaleY = boom.scaleX;
    this.tweens.add({ targets: boom, scale: boom.scale * 2.6, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => boom.destroy() });
    this.sparks.setParticleTint(Phaser.Display.Color.HexStringToColor(p.side === 1 ? this.T.hud.text : this.T.hud.bad).color);
    this.sparks.explode(10 + combo * 3, p.spr.x, p.spr.y - this.cell * 0.1);

    const who = p.side === 1 ? 'c' : 'p';           // vai para a bandeja do adversario
    const idx = this.trays[who].length;
    this.trays[who].push(p.spr);
    const slot = this.traySlot(who, idx);

    // impacto: recua, gira, perde brilho e desliza para a bandeja
    this.pieceLayer.remove(p.spr); this.ui.add(p.spr); p.spr.setDepth(520);
    this.tweens.add({ targets: p.shd, alpha: 0, scaleX: p.shd.scaleX * 0.5, scaleY: p.shd.scaleY * 0.5,
      duration: 240, onComplete: () => p.shd.destroy() });
    this.tweens.add({ targets: p.spr, scaleX: p.spr.scaleX * 1.14, scaleY: p.spr.scaleY * 1.14,
      duration: 90, yoyo: true, ease: 'Sine.easeOut' });
    this.tweens.add({
      targets: p.spr, x: slot.x, y: slot.y, rotation: (Math.random() - 0.5) * 0.9,
      displayWidth: this.traySize, alpha: 0.82,
      delay: 130, duration: 520, ease: 'Cubic.easeInOut',
      onUpdate: () => { p.spr.scaleY = p.spr.scaleX; },
      onComplete: () => { p.spr.setRotation(0); this.placeTray(p.spr, who, idx); p.spr.setAlpha(0.85); },
    });
  }

  async promote(p) {
    p.king = true;
    audio.play('promote');
    const glow = this.add.image(p.spr.x, p.base.y, 'lightpool')
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(70);
    glow.displayWidth = this.cell * 0.8; glow.scaleY = glow.scaleX * 0.6;
    this.world.add(glow);
    this.tweens.add({ targets: glow, alpha: 0.75, duration: 220, yoyo: true, hold: 240,
      scaleX: glow.scaleX * 2.6, scaleY: glow.scaleY * 2.6, ease: 'Sine.easeOut',
      onComplete: () => glow.destroy() });

    await tw(this, { targets: p.spr, y: p.spr.y - this.cell * 0.34, duration: 230, ease: 'Sine.easeOut' });
    this.sparks.setParticleTint(Phaser.Display.Color.HexStringToColor(this.T.hud.accent).color);
    this.sparks.explode(26, p.spr.x, p.spr.y);
    p.spr.setTexture(this.pieceKey(this.state.b[p.sq]));
    this.place(p);
    p.spr.y -= this.cell * 0.34;
    this.toast('DAMA', { size: 16, hold: 700 });
    await tw(this, { targets: p.spr, y: p.base.y, duration: 260, ease: 'Back.easeIn' });
    audio.play('land', 2);
    this.impact(p);
    await wait(this, 260);
  }

  // --- undo / restart / fim ---------------------------------------------
  undo() {
    if (this.busy || this.over || this.history.length < 2) return;
    this.history.pop();                 // snapshot do turno atual
    const h = this.history.pop();       // posicao antes da jogada anterior
    this.state.b.set(h.b);
    this.state.turn = 1; this.state.half = h.half;
    this.lastMove = h.last || null;
    for (const who of ['p', 'c']) {
      while (this.trays[who].length > (who === 'p' ? h.tp : h.tc)) this.trays[who].pop().destroy();
    }
    this.selected = null;
    this.spawnPieces(false);
    audio.play('menu');
    this.beginTurn();
  }

  restart() {
    audio.play('button');
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
  }

  endGame(winner) {
    this.over = true; this.winner = winner;
    this.busy = true;
    this.selected = null;
    this.drawHighlights();
    this.setStatus(winner === 1 ? 'VITORIA' : winner === -1 ? 'DERROTA' : 'EMPATE');
    audio.play(winner === 1 ? 'victory' : winner === -1 ? 'defeat' : 'draw');
    this.time.delayedCall(420, () => this.showResult(winner));
  }

  // ponytail: tween parabolico + quique, sem physics engine (nao ha nenhuma na cena).
  rainCoins(n = 26) {
    const W = this.scale.width, H = this.scale.height, u = this.u;
    for (let i = 0; i < n; i++) {
      const delay = 500 + i * 90 + Math.random() * 120;
      const x = W * (0.12 + Math.random() * 0.76);
      const floor = H * (0.72 + Math.random() * 0.2);
      const c = this.add.image(x, -30 * u, 'coin')
        .setDisplaySize(22 * u, 22 * u).setDepth(620).setAlpha(0);
      this.resultUI.push(c);
      this.tweens.add({ targets: c, alpha: 1, duration: 1, delay });
      this.tweens.add({ targets: c, x: x + (Math.random() - 0.5) * 70 * u, duration: 1800, delay, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: c, angle: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540), duration: 1800, delay });
      this.tweens.add({ targets: c, scaleX: { from: c.scaleX, to: -c.scaleX }, duration: 190, delay, yoyo: true, repeat: -1 }); // giro da moeda
      this.tweens.add({ targets: c, y: floor, duration: 950 + Math.random() * 300, delay, ease: 'Bounce.easeOut',
        onStart: () => audio.play('coin', i) });
      this.tweens.add({ targets: c, alpha: 0, duration: 500, delay: delay + 2100, onComplete: () => c.destroy() });
    }
  }

  showResult(winner, instant) {
    const W = this.scale.width, H = this.scale.height, T = this.T, u = this.u;
    // a cena escurece e o tabuleiro se aproxima
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(600);
    const k = 1.06;
    this.tweens.add({ targets: dim, fillAlpha: 0.62, duration: instant ? 0 : 900, ease: 'Sine.easeInOut' });
    // clarao escuro atras do texto, para o resultado nunca competir com o tabuleiro
    const scrim = this.add.image(W / 2, this.by + 22 * this.u, 'contact')
      .setTint(0x000000).setAlpha(0).setDepth(601);
    scrim.displayWidth = W * 1.4; scrim.displayHeight = 300 * this.u;
    this.tweens.add({ targets: scrim, alpha: 0.72, duration: instant ? 0 : 900 });
    this.tweens.add({ targets: this.world, scale: k, x: this.bx * (1 - k), y: this.by * (1 - k),
      duration: instant ? 0 : 1400, ease: 'Cubic.easeInOut' });

    // pecas sobreviventes ganham destaque
    if (!instant) {
      for (const p of this.pieces.values()) {
        if (winner !== 0 && p.side !== winner) continue;
        this.tweens.add({ targets: p.spr, y: p.spr.y - this.cell * 0.10, duration: 700,
          delay: Math.random() * 400, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      }
      this.sparks.setParticleTint(Phaser.Display.Color.HexStringToColor(winner === 1 ? T.hud.accent : T.hud.dim).color);
      for (let i = 0; i < 5; i++) {
        this.time.delayedCall(300 + i * 210, () => this.sparks.explode(7,
          this.bx + (Math.random() - 0.5) * this.bw * 0.8, this.by + (Math.random() - 0.5) * this.bh * 0.6));
      }
    }

    const cy = this.by;
    const big = winner === 1 ? 'VITORIA' : winner === -1 ? 'DERROTA' : 'EMPATE';
    const sub = winner === 1 ? 'Jogo excelente' : winner === -1 ? 'Por pouco. Domine o centro.' : 'Equilibrado ate o fim';
    const title = label(this, W / 2, cy - 32 * u, big, 30 * u, winner === 1 ? T.hud.accent : T.hud.text, 0.26, SERIF, '400').setDepth(610);
    const line = this.add.rectangle(W / 2, cy - 6 * u, title.width * 0.7, Math.max(1, u), Phaser.Display.Color.HexStringToColor(T.hud.accent).color, 0.45).setDepth(610);
    const s2 = label(this, W / 2, cy + 12 * u, sub, 10 * u, T.hud.text, 0.24, SANS, '300').setDepth(610);
    const b1 = button(this, W / 2, cy + 58 * u, winner === 1 ? 'JOGAR DE NOVO' : 'TENTAR DE NOVO', 13 * u, () => this.restart()).setDepth(610);
    const b2 = button(this, W / 2, cy + 98 * u, 'MENU PRINCIPAL', 10 * u, () => {
      audio.play('menu');
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
    }).setDepth(610);

    this.resultUI = [dim, scrim, title, line, s2, b1, b2];
    if (winner === 1 && !instant) this.rainCoins();
    if (!instant) {
      [title, line, s2, b1, b2].forEach((o, i) => {
        o.alpha = 0; o.y += 12 * u;
        this.tweens.add({ targets: o, alpha: o === s2 ? 0.7 : o === line ? 0.8 : 1, y: o.y - 12 * u,
          duration: 620, delay: 620 + i * 90, ease: 'Cubic.easeOut' });
      });
    }
  }
}

export { Boot, Match };

// =======================================================================
export function boot() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * dpr, height: window.innerHeight * dpr },
    backgroundColor: '#08090b',
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [Boot, Menu, Match],
  });

  const fit = () => {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    game.scale.resize(w * d, h * d);
    game.canvas.style.width = w + 'px';
    game.canvas.style.height = h + 'px';
  };
  window.__game = game;
  window.addEventListener("resize", fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 120));
  fit();
  return game;
}
