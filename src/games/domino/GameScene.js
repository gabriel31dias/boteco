import Phaser from 'phaser';
import { DominoGame } from './regras.js';
import { layoutChain } from './layout.js';
import { faixasNoAlto, relDe } from './mesa.js';
import { buildTable, TILE_L, TILE_W } from './render/textures.js';
import { theme } from './render/theme.js';
import { PieceView } from './render/PieceView.js';
import { caps, FONT } from './render/ui.js';
import { audio, settings } from './audio/audio.js';

/** O app não tem o <div id="safe"> do projeto original. */
const safeInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

const clamp = Phaser.Math.Clamp;
const GAP = 12;              // folga entre peças, em px de textura
const DRAG_THRESHOLD = 11;   // px: separa tap de arraste
const D2R = Math.PI / 180;
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch {} };

export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create(dados) {
    // Multiplayer: a partida de verdade está no servidor (a mão do adversário
    // não pode existir aqui). `this.match` é um ESPELHO — um DominoGame com os
    // campos preenchidos pelo estado que chega, usado só pelas funções puras
    // (orient/validMoves/canPlay) e pelo desenho.
    this.mp = dados;
    this.match = new DominoGame({ target: 50 });
    this.match.hands = { player: [] };
    this.match.scores = [0, 0];
    this.n = dados.players?.length ?? 2;
    this.eu = dados.seat ?? 0;
    this.meuTime = dados.duplas ? this.eu % 2 : this.eu;
    /** Os outros assentos, na ordem da vez a partir de mim. */
    this.outrosAssentos = Array.from({ length: this.n - 1 }, (_, k) => (this.eu + k + 1) % this.n);
    /** Mão (só a contagem, até o fim da rodada) e peças na tela de cada um. */
    this.maosOutros = {};
    this.outrosViews = Object.fromEntries(this.outrosAssentos.map((s) => [s, []]));
    this.match.turn = null;
    this.match.phase = 'idle';
    this.rodadaNaTela = 0;
    this.pendente = null;        // jogada minha esperando confirmação do servidor
    this.boardViews = new Map();
    this.handViews = [];
    this.selected = null;
    this.drag = null;
    this.pan = { x: 0, y: 0 };
    this.busy = true;
    this.tutorial = !settings.get('tutorialDone', false);

    this.tableImg = this.add.image(0, 0, '__DEFAULT');
    this.handGlow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD)
      .setTint(theme.glow).setAlpha(0);
    this.boardLayer = this.add.container(0, 0);
    this.staticLayer = this.add.container(0, 0);
    this.dragLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);

    this.measure();
    this.drawTable();
    this.buildStock();
    this.espelhar(dados.getEstado?.());

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    this.scale.on('resize', this.onResize, this);
    const bus = this.game.events;
    bus.on('ui:menu', this.toMenu, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      bus.off('ui:menu', this.toMenu, this);
    });

    if (import.meta.env?.DEV) window.__G = this; // gancho de teste (só em dev)
    this.cameras.main.fadeIn(300, 0, 0, 0);
    if (this.estado) this.aplicar(this.estado, true);
  }

  toMenu() {
    this.scene.stop('UI');
    this.scene.start('Menu');
  }

  // ------------------------------------------------------------- medidas
  measure() {
    const { width: W, height: H } = this.scale;
    const ins = safeInsets();
    // mesma conta da moldura de madeira: nada de peça encostando no aro
    const frame = clamp(Math.min(W, H) * 0.055, 14, 46);
    const handL = clamp(H * 0.26, 84, 150);
    const hud = ins.top + clamp(H * 0.125, 38, 62);
    const cpuL = clamp(handL * 0.44, 30, 52);
    const handTop = H - ins.bottom - frame - 8 - handL;
    const stockW = TILE_W * (cpuL / TILE_L) * 1.15 + 26;
    const board = {
      x: ins.left + 12 + stockW,
      y: hud + cpuL + 10,
      w: W - ins.left - ins.right - 24 - stockW,
    };
    board.h = Math.max(90, handTop - board.y - 6);
    board.cx = board.x + board.w / 2;
    board.cy = board.y + board.h / 2;

    const dispL = clamp(Math.min(handL * 0.75, board.h * 0.42), 44, 120);
    this.m = {
      W, H, ins, hud, handL, cpuL, handTop, board, frame,
      handScale: handL / TILE_L,
      cpuScale: cpuL / TILE_L,
      baseScale: dispL / TILE_L,
      dispL,
      maxRow: (board.w * 0.9) / (dispL / TILE_L),
      stock: { x: ins.left + 12 + stockW / 2, y: board.y + board.h * 0.52 },
    };
  }

  drawTable() {
    const { W, H } = this.m;
    buildTable(this, 'table-game', W, H, theme);
    this.tableImg.setTexture('table-game').setPosition(W / 2, H / 2);
    const { handTop, handL } = this.m;
    this.handGlow.setPosition(W / 2, handTop + handL * 0.55).setDisplaySize(W * 1.05, handL * 2.6);
  }

  setHandGlow(on) {
    this.tweens.add({ targets: this.handGlow, alpha: on ? 0.085 : 0, duration: 420, ease: 'Sine.inOut' });
  }

  onResize() {
    if (this._rt) this._rt.remove();
    this._rt = this.time.delayedCall(140, () => {
      this.measure();
      this.drawTable();
      this.layoutStock();
      this.layoutHand(false);
      this.layoutOutros(false);
      this.syncBoard({ animate: false });
      this.game.events.emit('hud:metrics', this.m);
    });
  }

  // ------------------------------------------------------------- rodada
  startRound() {
    this.busy = true;
    this.selected = null;
    this.clearMarkers();
    for (const v of this.boardViews.values()) v.destroy();
    this.boardViews.clear();
    this.handViews.forEach((v) => v.destroy());
    for (const s of this.outrosAssentos) { this.outrosViews[s].forEach((v) => v.destroy()); this.outrosViews[s] = []; }
    this.handViews = [];
    this.pan = { x: 0, y: 0 };
    this.boardLayer.setScale(this.m.baseScale);

    this.syncBoard({ animate: false });
    this.emitHud();
    this.dealAnimation();
  }

  /** Embaralha no centro e distribui em ~1,4 s. */
  dealAnimation() {
    const { W, H, board } = this.m;
    const deck = [];
    for (let i = 0; i < 10; i++) {
      const v = new PieceView(this, 0, 0).setFaceDown(true);
      v.setPosition(board.cx, board.cy).setScale(this.m.baseScale * 0.9);
      v.rotation = Phaser.Math.FloatBetween(-0.4, 0.4);
      v.applyLift(0.5);
      this.fxLayer.add(v);
      deck.push(v);
      this.tweens.add({
        targets: v,
        x: board.cx + Phaser.Math.Between(-40, 40),
        y: board.cy + Phaser.Math.Between(-18, 18),
        rotation: Phaser.Math.FloatBetween(-0.5, 0.5),
        duration: 210, yoyo: true, repeat: 1, delay: i * 12, ease: 'Sine.inOut',
      });
    }
    audio.unlock();
    audio.deal(12, 620);

    this.time.delayedCall(560, () => {
      deck.forEach((v) => this.tweens.add({ targets: v, alpha: 0, scale: 0.2, duration: 200, onComplete: () => v.destroy() }));
      this.buildHands();
    });
  }

  buildHands() {
    const { board } = this.m;
    this.match.hands.player.forEach((p, i) => {
      const v = new PieceView(this, p.a, p.b).setLayoutAngle(90);
      v.pieceId = p.id;
      v.setScale(this.m.handScale).setPosition(board.cx, board.cy).setAlpha(0);
      v.applyLift(1);
      this.staticLayer.add(v);
      this.handViews.push(v);
      this.tweens.add({ targets: v, alpha: 1, duration: 120, delay: 60 + i * 62 });
    });
    for (const s of this.outrosAssentos) {
      (this.maosOutros[s] ?? []).forEach((p, i) => {
        const v = new PieceView(this, 0, 0).setFaceDown(true).setLayoutAngle(90);
        v.pieceId = p.id;
        v.setScale(this.m.cpuScale).setPosition(board.cx, board.cy).setAlpha(0);
        this.staticLayer.add(v);
        this.outrosViews[s].push(v);
        this.tweens.add({ targets: v, alpha: 1, duration: 120, delay: 60 + i * 62 });
      });
    }
    this.layoutHand(true, 62);
    this.layoutOutros(true, 62);
    this.time.delayedCall(700, () => {
      this.busy = false;
      this.nextTurn();
    });
  }

  // --------------------------------------------------------------- mão
  layoutHand(animate = true, stagger = 0) {
    const { W, handTop, handL, ins } = this.m;
    const n = this.handViews.length;
    if (!n) return;
    const shrink = clamp(9 / n, 0.6, 1);
    const scale = this.m.handScale * shrink;
    const tw = TILE_W * scale;
    const avail = W - ins.left - ins.right - 24;
    const spacing = Math.min(tw + 14, avail / n);
    const y = handTop + (handL * shrink) / 2 + (handL - handL * shrink) / 2;
    const startX = (W + ins.left - ins.right) / 2 - ((n - 1) * spacing) / 2;

    this.handViews.forEach((v, i) => {
      const t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      const tx = startX + i * spacing;
      const ty = y + t * t * 7 - (v === this.selected ? handL * 0.14 : 0);
      const rot = t * 0.05;
      v.setDepth(i);
      // alvo de toque confortável mesmo com peças sobrepostas
      const hitW = Math.max(TILE_W, 52 / scale, spacing / scale);
      v.setSize(hitW, TILE_L);
      v.setInteractive(new Phaser.Geom.Rectangle(-hitW / 2, -TILE_L / 2, hitW, TILE_L), Phaser.Geom.Rectangle.Contains);
      v.setData('kind', 'hand');
      if (animate) {
        this.tweens.add({ targets: v, x: tx, y: ty, rotation: rot, scale, duration: 300, delay: stagger ? i * stagger : 0, ease: 'Cubic.out' });
      } else {
        v.setPosition(tx, ty).setScale(scale);
        v.rotation = rot;
      }
      v.homeX = tx; v.homeY = ty; v.homeRot = rot; v.homeScale = scale;
      this.handSpacing = spacing;
      v.applyLift(v === this.selected ? 1 : 0.78);
    });
  }

  /** Mão fechada de cada adversário, cada uma na sua faixa do alto (ver mesa.js). */
  layoutOutros(animate = true, stagger = 0) {
    const { W, hud, cpuL, ins } = this.m;
    const faixas = faixasNoAlto(this.n, W, ins);
    for (const s of this.outrosAssentos) {
      const views = this.outrosViews[s];
      const n = views.length;
      if (!n) continue;
      const faixa = faixas[relDe(s, this.eu, this.n)];
      const shrink = clamp(9 / n, 0.62, 1) * (this.n > 2 ? 0.8 : 1);
      const scale = this.m.cpuScale * shrink;
      const tw = TILE_W * scale;
      const spacing = Math.min(tw + (this.n > 2 ? 3 : 8), faixa.w / n);
      const y = hud + (cpuL * shrink) / 2 + 2;
      const startX = faixa.cx - ((n - 1) * spacing) / 2;
      views.forEach((v, i) => {
        const tx = startX + i * spacing;
        v.setDepth(i);
        if (animate) this.tweens.add({ targets: v, x: tx, y, scale, duration: 300, delay: stagger ? i * stagger : 0, ease: 'Cubic.out' });
        else v.setPosition(tx, y).setScale(scale);
        v.applyLift(0.25);
      });
    }
  }

  // -------------------------------------------------------------- monte
  buildStock() {
    this.stock = this.add.container(0, 0);
    this.stockTiles = [];
    for (let i = 0; i < 3; i++) {
      const v = new PieceView(this, 0, 0).setFaceDown(true).setLayoutAngle(90);
      v.setPosition(i * 2.5, -i * 3.5);
      this.stock.add(v);
      this.stockTiles.push(v);
    }
    this.stockLabel = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: theme.goldCss,
    }).setOrigin(0.5);
    this.stock.add(this.stockLabel);
    this.staticLayer.add(this.stock);
    this.stock.setData('kind', 'stock');
    this.layoutStock();
  }

  layoutStock() {
    const { stock, cpuScale, cpuL } = this.m;
    this.stock.setPosition(stock.x, stock.y);
    this.stockTiles.forEach((v) => v.setScale(cpuScale * 1.15));
    this.stockLabel.setPosition(0, cpuL * 0.82).setFontSize(Math.max(11, cpuL * 0.26));
    const w = TILE_W * cpuScale * 1.15 + 24;
    const h = cpuL * 1.15 + 34;
    this.stock.setSize(w, h);
    this.stock.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    this.updateStock();
  }

  updateStock() {
    const n = this.match.boneyard.length;
    this.stockLabel.setText(n ? `× ${n}` : '');
    this.stockTiles.forEach((v, i) => v.setVisible(n > i));
    this.stock.setAlpha(n ? 1 : 0.25);
  }

  // ------------------------------------------------------------- tabuleiro
  computeLayout() {
    return layoutChain(this.match.chain, { tileL: TILE_L, tileW: TILE_W, gap: GAP, maxRow: this.m.maxRow });
  }

  /** Reposiciona a corrente inteira e reenquadra a "câmera" (o container). */
  syncBoard({ animate = true, spawn = null, focus = null } = {}) {
    const lay = this.computeLayout();
    this.layout = lay;
    const { board, baseScale } = this.m;
    const pad = 26;
    const fit = Math.min(
      (board.w - pad) / Math.max(1, lay.bounds.width),
      (board.h - pad) / Math.max(1, lay.bounds.height)
    );
    const scale = clamp(fit, baseScale * 0.68, baseScale);
    this.boardScale = scale;

    // Cabe inteira? centraliza. Não cabe? segue a última peça, sem sair da mesa.
    let px = 0, py = 0;
    if (fit < scale - 0.0001 || lay.bounds.width * scale > board.w - pad || lay.bounds.height * scale > board.h - pad) {
      const f = focus || lay.right;
      px = clamp(-f.x * scale, board.w / 2 - pad / 2 - lay.bounds.maxX * scale, -board.w / 2 + pad / 2 - lay.bounds.minX * scale);
      py = clamp(-f.y * scale, board.h / 2 - pad / 2 - lay.bounds.maxY * scale, -board.h / 2 + pad / 2 - lay.bounds.minY * scale);
    }
    this.pan = { x: px, y: py };
    const tx = board.cx + px, ty = board.cy + py;
    if (animate) this.tweens.add({ targets: this.boardLayer, x: tx, y: ty, scaleX: scale, scaleY: scale, duration: 420, ease: 'Cubic.out' });
    else this.boardLayer.setPosition(tx, ty).setScale(scale);

    const seen = new Set();
    lay.tiles.forEach((t, i) => {
      seen.add(t.entry.id);
      let v = this.boardViews.get(t.entry.id);
      const fresh = !v;
      if (!v) {
        v = new PieceView(this, t.entry.a, t.entry.b);
        this.boardViews.set(t.entry.id, v);
        this.boardLayer.add(v);
        if (spawn && spawn.id === t.entry.id) {
          v.setLayoutAngle(spawn.layoutAngle ?? t.angle);
          v.setPosition(spawn.x, spawn.y);
          v.rotation = spawn.rotation;
          v.setScale(spawn.scale);
          v.applyLift(1);
        } else {
          v.setPosition(t.x, t.y).setLayoutAngle(t.angle);
        }
      }
      v.setFace(t.entry.a, t.entry.b);
      v.setDepth(i);
      if (fresh && spawn && spawn.id === t.entry.id) return; // animada por playInto()
      if (animate) this.tweens.add({ targets: v, x: t.x, y: t.y, duration: 340, ease: 'Cubic.out' });
      else v.setPosition(t.x, t.y);
      v.setLayoutAngle(t.angle);
      v.applyLift(0);
      v.setScale(1);
    });
    for (const [id, v] of this.boardViews) if (!seen.has(id)) { v.destroy(); this.boardViews.delete(id); }
  }

  /** Converte ponto do mundo para dentro do container da mesa. */
  toBoard(x, y) {
    return { x: (x - this.boardLayer.x) / this.boardLayer.scaleX, y: (y - this.boardLayer.y) / this.boardLayer.scaleY };
  }
  toWorld(x, y) {
    return { x: x * this.boardLayer.scaleX + this.boardLayer.x, y: y * this.boardLayer.scaleY + this.boardLayer.y };
  }


  // ------------------------------------------------------- servidor manda

  /** Copia o estado que veio do servidor pro espelho local. */
  espelhar(e) {
    if (!e) return;
    this.estado = e;
    const m = this.match;
    m.hands = { player: e.mao };
    // Dos outros só a contagem é conhecida; a face aparece no fim da rodada.
    for (const s of this.outrosAssentos) {
      this.maosOutros[s] = e.maos?.[s] ?? Array.from({ length: e.naMao[s] }, (_, i) => ({ id: `oculta${s}-${i}`, a: 0, b: 0 }));
    }
    m.chain = e.corrente;
    m.ends = e.pontas;
    m.boneyard = new Array(e.monte).fill(null);
    m.turn = e.vez === e.assento ? 'player' : 'cpu';
    m.round = e.rodada;
    m.phase = e.fase;
    m.target = e.alvo;
    m.scores = e.placar;                       // por time: no individual, por assento
    m.vez = e.vez;
    // `winner` e `matchWinner` são times; `souVencedor` poupa a conta de quem desenha.
    m.result = e.resultado && { ...e.resultado, souVencedor: e.resultado.winner === this.meuTime };
  }

  /**
   * Porta de entrada de tudo. Compara o que mudou desde o último estado e anima
   * a diferença — peça nova na corrente, compra do adversário, fim de rodada.
   */
  aplicar(e, inicial = false) {
    const antes = this.estado;
    this.espelhar(e);
    this.prazo = e.prazo ?? 0;

    // Alguém saiu da mesa (individual): a mão dele some e a partida segue.
    if (antes) {
      for (const s of this.outrosAssentos) {
        if (antes.ativos?.[s] && e.ativos?.[s] === false) this.tirarDaMesa(s);
      }
    }

    if (inicial || e.rodada !== this.rodadaNaTela) {
      this.rodadaNaTela = e.rodada;
      this.startRound();
      return;
    }

    // Peça que apareceu na corrente e ainda não está desenhada: é de um
    // adversário (a minha eu animo na hora do toque). Quem jogou é quem perdeu
    // uma peça da mão; sem o estado anterior, quem estava na vez.
    const nova = e.corrente.find((t) => !this.boardViews.has(t.id));
    if (nova && !this.pendente) {
      const doLado = e.corrente[0].id === nova.id ? 'left' : 'right';
      const quem = this.outrosAssentos.find((s) => antes && e.naMao[s] < antes.naMao[s]) ?? antes?.vez;
      this.animarJogadaDoOutro(nova, doLado, this.outrosViews[quem] ? quem : this.outrosAssentos[0]);
      return;
    }
    if (this.pendente) {
      const { id, side, view } = this.pendente;
      this.pendente = null;
      this.animarJogada('player', id, side, view);
      return;
    }

    // Compra: a mão de alguém cresceu sem peça nova na mesa.
    if (antes && e.mao.length > antes.mao.length) { this.animarCompraMinha(e); return; }
    // (assento 0 é válido: compara com undefined, não com "falso")
    const comprou = antes ? this.outrosAssentos.find((s) => e.naMao[s] > antes.naMao[s]) : undefined;
    if (comprou !== undefined) { this.animarCompraDoOutro(comprou); return; }

    if (e.fase !== 'playing') { this.endRound(); return; }
    this.nextTurn();
  }

  /** Jogador eliminado: as peças dele saem de cena; o resto da mesa continua. */
  tirarDaMesa(seat) {
    const views = this.outrosViews[seat];
    this.outrosViews[seat] = [];
    views.forEach((v) => this.tweens.add({ targets: v, alpha: 0, duration: 380, onComplete: () => v.destroy() }));
    const nome = (this.mp.players?.[seat]?.name ?? 'Um jogador').split(' ')[0].toUpperCase();
    this.game.events.emit('hud:flash', `${nome} SAIU DA MESA`);
  }

  /** Peça do adversário: nasce virada no monte da mão dele e viaja até a ponta. */
  animarJogadaDoOutro(entry, side, seat) {
    const view = this.outrosViews[seat].pop() || new PieceView(this, 0, 0).setFaceDown(true).setLayoutAngle(90);
    if (!view.scene) { view.setScale(this.m.cpuScale).setPosition(this.m.board.cx, this.m.board.cy); this.staticLayer.add(view); }
    const anchor = side === 'left' ? this.layout.left : this.layout.right;
    const w = this.toWorld(anchor.x, anchor.y);
    view.setDepth(999);
    this.dragLayer.add(view);
    this.tweens.add({ targets: view, scaleX: 0.02, duration: 130, ease: 'Quad.in',
      onComplete: () => {
        view.setFaceDown(false).setFace(entry.a, entry.b).setLayoutAngle(90);
        this.tweens.add({ targets: view, scaleX: this.m.handScale * 0.8, scaleY: this.m.handScale * 0.8, duration: 150, ease: 'Quad.out' });
      } });
    audio.play('tick', { pan: 0.2 });
    this.time.delayedCall(300, () => {
      this.tweens.add({
        targets: view, x: w.x, y: w.y, duration: 340, ease: 'Cubic.inOut',
        onComplete: () => this.animarJogada('cpu', entry.id, side, view),
      });
    });
  }

  animarCompraMinha(e) {
    const p = e.mao[e.mao.length - 1];
    const v = new PieceView(this, p.a, p.b).setLayoutAngle(90);
    v.pieceId = p.id;
    v.setScale(this.m.cpuScale * 1.15).setPosition(this.stock.x, this.stock.y);
    v.applyLift(1);
    this.staticLayer.add(v);
    this.handViews.push(v);
    audio.play('slide', { pan: -0.5 });
    this.updateStock();
    this.emitHud();
    this.layoutHand();
    this.time.delayedCall(300, () => { audio.play('tick', { pan: 0 }); this.busy = false; this.nextTurn(); });
  }

  animarCompraDoOutro(seat) {
    const v = new PieceView(this, 0, 0).setFaceDown(true).setLayoutAngle(90);
    v.setScale(this.m.cpuScale).setPosition(this.stock.x, this.stock.y);
    this.staticLayer.add(v);
    this.outrosViews[seat].push(v);
    audio.play('slide', { pan: -0.4 });
    this.updateStock();
    this.emitHud();
    this.layoutOutros();
    this.time.delayedCall(280, () => this.nextTurn());
  }

  // --------------------------------------------------------------- jogada
  /** Minha jogada: quem aplica é o servidor. Guarda a peça e espera o estado. */
  commitMove(seat, id, side, view) {
    this.busy = true;
    this.clearMarkers();
    this.pendente = { id, side, view };
    this.mp.onJogada({ tipo: 'jogar', id, side });
  }

  /** Anima a peça `view` até o encaixe, com o espelho já atualizado. */
  animarJogada(seat, id, side, view) {
    let spawn = null;
    if (view) {
      const b = this.toBoard(view.x, view.y);
      spawn = { id, x: b.x, y: b.y, rotation: view.rotation, scale: view.scaleX / this.boardLayer.scaleX, layoutAngle: view.layoutAngle };
      view.destroy();
    }
    if (seat === 'player') this.handViews = this.handViews.filter((v) => v.pieceId !== id);
    this.syncBoard({ spawn });

    const target = this.layout.tiles.find((t) => t.entry.id === id);
    const v = this.boardViews.get(id);
    if (v && target) {
      // A peça já está na corrente do espelho: é de lá que sai a carroça.
      const dbl = !!this.match.chain.find((t) => t.id === id)?.double;
      const spin = PieceView.shortest(v.layoutAngle, target.angle) * D2R;
      this.tweens.add({
        targets: v, x: target.x, y: target.y, scale: 1, rotation: spin,
        duration: dbl ? 320 : 250, ease: 'Cubic.out',
        onUpdate: (tw) => v.applyLift(1 - tw.progress),
        onComplete: () => {
          v.setLayoutAngle(target.angle).applyLift(0);
          const pan = clamp((this.toWorld(target.x, target.y).x / this.m.W - 0.5) * 1.8, -1, 1);
          audio.play(dbl ? 'clack-strong' : 'clack', { pan });
          buzz(dbl ? 18 : 10);
          this.impact(v);
        },
      });
    }
    this.emitHud();
    this.time.delayedCall(360, () => this.afterMove(seat));
  }

  /** Micro-impacto do encaixe: 1.05 → 1.00. */
  impact(v) {
    this.tweens.add({ targets: v, scaleX: 1.06, scaleY: 1.06, duration: 80, yoyo: true, ease: 'Quad.out' });
    const g = this.add.image(v.x, v.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setAlpha(0.5).setTint(theme.glow);
    this.boardLayer.add(g);
    this.tweens.add({ targets: g, alpha: 0, scale: 3.2, duration: 420, onComplete: () => g.destroy() });
  }

  afterMove() {
    // Dois estados podem chegar coladas (minha jogada e a resposta dele). Se
    // sobrou peça na corrente sem desenho, roda de novo antes de liberar a vez.
    if (this.estado.corrente.some((t) => !this.boardViews.has(t.id))) {
      this.aplicar(this.estado);
      return;
    }
    if (this.match.phase !== 'playing') return this.endRound();
    this.nextTurn();
  }

  nextTurn() {
    this.clearMarkers();
    this.selected = null;
    this.emitHud();
    if (this.match.phase !== 'playing') return;
    if (this.match.turn === 'cpu') this.turnoDoOutro();
    else this.playerTurn();
  }

  /** Vez do adversário: só espera — quem joga por ele é ele (ou o relógio). */
  turnoDoOutro() {
    this.busy = true;
    this.handViews.forEach((v) => v.setDim(false));
    this.game.events.emit('hud:turn', { seat: 'cpu', vez: this.match.vez });
    this.setHandGlow(false);
  }

  // -------------------------------------------------------------- jogador
  playerTurn() {
    this.busy = false;
    const moves = this.match.validMoves('player');
    const playable = new Set(moves.map((m) => m.id));
    this.handViews.forEach((v) => v.setDim(!playable.has(v.pieceId)));
    this.layoutHand();
    this.game.events.emit('hud:turn', { seat: 'player', canPlay: moves.length > 0, boneyard: this.match.boneyard.length });
    this.setHandGlow(true);

    if (!moves.length) {
      if (this.match.boneyard.length) {
        this.pulseStock();
      } else {
        this.busy = true;
        this.game.events.emit('hud:flash', 'SEM JOGADAS');
        this.time.delayedCall(900, () => {
          this.game.events.emit('hud:flash', 'PASSANDO TURNO');
          this.mp.onJogada({ tipo: 'passar' });
        });
      }
    } else if (this.tutorial && this.match.round === 1) {
      this.hint('ARRASTE UMA PEÇA ATÉ A PONTA COMPATÍVEL');
    }
  }

  pulseStock() {
    this.stockPulse?.remove();
    this.stockPulse = this.tweens.add({
      targets: this.stock, scale: 1.07, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });
    this.hint('SEM JOGADA — TOQUE NO MONTE PARA COMPRAR');
  }
  stopPulse() {
    this.stockPulse?.remove();
    this.stockPulse = null;
    this.stock.setScale(1);
  }

  drawForPlayer() {
    if (this.busy || this.match.turn !== 'player' || !this.match.boneyard.length) return;
    if (this.match.canPlay('player')) return;
    this.busy = true;
    this.stopPulse();
    buzz(8);
    this.mp.onJogada({ tipo: 'comprar' });   // a peça chega no próximo estado
  }

  // ---------------------------------------------------------------- input
  overKind(over, kind) { return over.find((o) => o.getData?.('kind') === kind); }

  onDown(pointer, over) {
    audio.unlock();
    this._down = { x: pointer.x, y: pointer.y, t: this.time.now, moved: false };
    if (this.busy || this.match.phase !== 'playing') return;

    const stock = this.overKind(over, 'stock');
    if (stock) { this._down.kind = 'stock'; return; }

    const marker = over.find((o) => o.getData?.('kind') === 'end') || this.nearMarker(pointer);
    if (marker && this.selected) { this._down.kind = 'end'; this._down.side = marker.getData('side'); return; }

    if (this.match.turn === 'player') {
      const hand = this.overKind(over, 'hand') || this.nearHand(pointer);
      if (hand) {
        this._down.kind = 'hand';
        this._down.view = hand;
        const dx = hand.x - pointer.x, dy = hand.y - pointer.y;
        const max = this.m.handL * 0.35;
        this._down.offset = { x: clamp(dx, -max, max), y: clamp(dy, -max, max) };
        return;
      }
    }
    this._down.kind = 'pan';
    this._down.origin = { x: this.boardLayer.x, y: this.boardLayer.y };
  }

  /**
   * Toque não precisa ser preciso: se o dedo cair perto de uma peça da mão
   * (ou de um indicador de ponta), vale como se tivesse acertado em cheio.
   */
  nearHand(pointer) {
    if (!this.handViews.length) return null;
    const { handTop, handL } = this.m;
    if (pointer.y < handTop - handL * 0.30) return null;
    const tolX = (this.handSpacing || 60) * 0.8;
    let best = null;
    for (const v of this.handViews) {
      const dx = Math.abs(v.x - pointer.x);
      if (dx < tolX && (!best || dx < best.dx)) best = { v, dx };
    }
    return best ? best.v : null;
  }

  nearMarker(pointer) {
    if (!this.selected || !this.markers) return null;
    const r = this.m.dispL * 1.2;
    let best = null;
    for (const m of this.markers) {
      const w = this.toWorld(m.x, m.y);
      const d = Phaser.Math.Distance.Between(w.x, w.y, pointer.x, pointer.y);
      if (d < r && (!best || d < best.d)) best = { m, d };
    }
    return best ? best.m : null;
  }

  onMove(pointer) {
    const d = this._down;
    if (!d) return;
    const dist = Phaser.Math.Distance.Between(d.x, d.y, pointer.x, pointer.y);
    if (!d.moved && dist < DRAG_THRESHOLD) return;
    d.moved = true;

    if (d.kind === 'hand') {
      if (!this.drag) this.beginDrag(d.view, d.offset);
      this.updateDrag(pointer);
    } else if (d.kind === 'pan' && this.canPan()) {
      this.boardLayer.x = d.origin.x + (pointer.x - d.x);
      this.boardLayer.y = d.origin.y + (pointer.y - d.y);
      this.clampPan();
    }
  }

  onUp(pointer) {
    const d = this._down;
    this._down = null;
    if (!d) return;

    if (this.drag) return this.endDrag(pointer);
    if (d.moved) return;

    if (d.kind === 'stock') return this.drawForPlayer();
    if (d.kind === 'end') return this.playSelected(d.side);
    if (d.kind === 'hand') return this.toggleSelect(d.view);
    this.deselect();
  }

  canPan() {
    if (!this.layout) return false;
    const s = this.boardLayer.scaleX;
    return this.layout.bounds.width * s > this.m.board.w - 20 || this.layout.bounds.height * s > this.m.board.h - 20;
  }

  clampPan() {
    const { board } = this.m;
    const s = this.boardLayer.scaleX;
    const b = this.layout.bounds;
    const minX = board.x + board.w - 24 - b.maxX * s;
    const maxX = board.x + 24 - b.minX * s;
    const minY = board.y + board.h - 24 - b.maxY * s;
    const maxY = board.y + 24 - b.minY * s;
    this.boardLayer.x = clamp(this.boardLayer.x, Math.min(minX, maxX), Math.max(minX, maxX));
    this.boardLayer.y = clamp(this.boardLayer.y, Math.min(minY, maxY), Math.max(minY, maxY));
  }

  // ----------------------------------------------------------- seleção
  toggleSelect(view) {
    if (this.selected === view) return this.deselect();
    this.selected = view;
    audio.play('tick', { pan: (view.x / this.m.W - 0.5) * 1.2 });
    buzz(6);
    this.layoutHand();
    this.showMarkers(view.pieceId);
    this.hideHint();
  }

  deselect() {
    if (!this.selected) return;
    this.selected = null;
    this.clearMarkers();
    this.layoutHand();
  }

  validSides(pieceId) {
    return this.match.validMoves('player').filter((m) => m.id === pieceId).map((m) => m.side);
  }

  /** Indicadores discretos ◉ nas pontas onde a peça selecionada encaixa. */
  showMarkers(pieceId) {
    this.clearMarkers();
    const sides = this.validSides(pieceId);
    if (!sides.length) return;
    this.markers = sides.map((side) => {
      const a = side === 'left' ? this.layout.left : this.layout.right;
      const g = this.add.container(a.x, a.y);
      const ring = this.add.circle(0, 0, TILE_W * 0.30, theme.gold, 0).setStrokeStyle(5, theme.gold, 0.85);
      const dot = this.add.circle(0, 0, TILE_W * 0.13, theme.gold, 0.9);
      const halo = this.add.image(0, 0, 'glow').setTint(theme.glow).setAlpha(0.35).setScale(1.4).setBlendMode(Phaser.BlendModes.ADD);
      g.add([halo, ring, dot]);
      g.setData('kind', 'end');
      g.setData('side', side);
      const hit = TILE_L * 0.75;
      g.setSize(hit, hit);
      g.setInteractive(new Phaser.Geom.Rectangle(-hit / 2, -hit / 2, hit, hit), Phaser.Geom.Rectangle.Contains);
      g.setDepth(500);
      this.boardLayer.add(g);
      this.tweens.add({ targets: g, scale: 1.16, duration: 760, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      return g;
    });
  }

  clearMarkers() {
    this.markers?.forEach((m) => m.destroy());
    this.markers = null;
  }

  playSelected(side) {
    const view = this.selected;
    if (!view) return;
    this.selected = null;
    this.clearMarkers();
    this.busy = true;
    this.hideHint();
    const anchor = side === 'left' ? this.layout.left : this.layout.right;
    const w = this.toWorld(anchor.x, anchor.y);
    this.dragLayer.add(view);
    view.setDepth(999);
    this.tweens.add({
      targets: view, x: w.x, y: w.y, duration: 260, ease: 'Cubic.inOut',
      onComplete: () => this.finishPlayerMove(view.pieceId, side, view),
    });
  }

  // ------------------------------------------------------------- arraste
  beginDrag(view, offset) {
    this.deselectSilently();
    this.hideHint();
    this.drag = { view, offset, side: null };
    this.dragLayer.add(view);
    view.setDepth(1000);
    view.setDim(false);
    this.tweens.add({ targets: view, scale: view.homeScale * 1.05, rotation: 0, duration: 130, ease: 'Quad.out' });
    view.applyLift(1);
    audio.play('tick', { pan: (view.x / this.m.W - 0.5) * 1.2 });
    buzz(6);
  }

  deselectSilently() {
    this.selected = null;
    this.clearMarkers();
  }

  updateDrag(pointer) {
    const { view } = this.drag;
    view.x = pointer.x + this.drag.offset.x;
    view.y = pointer.y + this.drag.offset.y;

    const sides = this.validSides(view.pieceId);
    let best = null;
    const radius = this.m.dispL * 1.9;
    for (const side of sides) {
      const a = side === 'left' ? this.layout.left : this.layout.right;
      const w = this.toWorld(a.x, a.y);
      const dist = Phaser.Math.Distance.Between(view.x, view.y, w.x, w.y);
      if (dist < radius && (!best || dist < best.dist)) best = { side, dist, anchor: a, world: w };
    }
    if (best?.side !== this.drag.side) {
      this.drag.side = best?.side || null;
      this.showGhost(best ? best.side : null);
      this.tweens.add({
        targets: view,
        scale: best ? this.boardLayer.scaleX * 1.05 : view.homeScale * 1.05,
        rotation: best ? this.snapSpin(view, best) : 0,
        duration: 170, ease: 'Quad.out',
      });
      if (best) audio.play('tick', { pan: (best.world.x / this.m.W - 0.5) * 1.2 });
    }
    if (best) {
      // magnetismo: a peça é puxada para a posição final
      const k = 0.42;
      view.x += (best.world.x - view.x) * k;
      view.y += (best.world.y - view.y) * k;
    }
  }

  /** Giro necessário para a peça arrastada já mostrar a orientação do encaixe. */
  snapSpin(view, best) {
    const piece = this.match.hands.player.find((p) => p.id === view.pieceId);
    const entry = this.match.orient(piece, best.side);
    if (!entry) return 0;
    const ang = best.anchor.angle + (entry.double ? 90 : 0);
    return PieceView.shortest(view.layoutAngle, ang) * D2R;
  }

  showGhost(side) {
    this.ghost?.destroy();
    this.ghost = null;
    if (!side || !this.drag) return;
    const piece = this.match.hands.player.find((p) => p.id === this.drag.view.pieceId);
    const entry = this.match.orient(piece, side);
    if (!entry) return;
    const a = side === 'left' ? this.layout.left : this.layout.right;
    const g = new PieceView(this, entry.a, entry.b);
    g.setPosition(a.x, a.y).setLayoutAngle(entry.double ? a.angle + 90 : a.angle);
    g.setAlpha(0.34).applyLift(0);
    g.shadow.setVisible(false);
    g.setDepth(400);
    this.boardLayer.add(g);
    this.ghost = g;
    this.tweens.add({ targets: g, alpha: 0.5, duration: 420, yoyo: true, repeat: -1 });
  }

  endDrag(pointer) {
    const { view, side } = this.drag;
    this.drag = null;
    this.ghost?.destroy();
    this.ghost = null;
    if (side) return this.finishPlayerMove(view.pieceId, side, view);

    // solta em qualquer lugar da mesa: cai na ponta válida mais próxima
    const sides = this.validSides(view.pieceId);
    const b = this.m.board;
    const overBoard = view.x > b.x - 40 && view.x < b.x + b.w + 40 && view.y > b.y - 40 && view.y < b.y + b.h + 40;
    if (sides.length && overBoard) {
      let best = null;
      for (const sd of sides) {
        const a = sd === 'left' ? this.layout.left : this.layout.right;
        const w = this.toWorld(a.x, a.y);
        const d = Phaser.Math.Distance.Between(view.x, view.y, w.x, w.y);
        if (!best || d < best.d) best = { sd, d };
      }
      return this.finishPlayerMove(view.pieceId, best.sd, view);
    }
    this.returnToHand(view, sides.length === 0);
  }

  finishPlayerMove(id, side, view) {
    this.busy = true;
    this.commitMove('player', id, side, view);
    if (this.tutorial) {
      settings.set('tutorialDone', true);
      this.tutorial = false;
      this.time.delayedCall(500, () => {
        this.hint('PERFEITO! VOCÊ TAMBÉM PODE TOCAR NA PEÇA E DEPOIS NA PONTA.', 2600);
      });
    }
  }

  /** Jogada impossível: shake curto, "tok" e volta suave para a mão. */
  returnToHand(view, invalid) {
    this.staticLayer.add(view);
    if (invalid) {
      audio.play('tok');
      buzz(28);
      const x = view.x;
      this.tweens.add({ targets: view, x: x - 9, duration: 55, yoyo: true, repeat: 2,
        onComplete: () => this.tweens.add({
          targets: view, x: view.homeX, y: view.homeY, rotation: view.homeRot, scale: view.homeScale,
          duration: 280, ease: 'Back.out', onUpdate: (tw) => view.applyLift(1 - tw.progress * 0.22),
        }) });
    } else {
      audio.play('slide');
      this.tweens.add({
        targets: view, x: view.homeX, y: view.homeY, rotation: view.homeRot, scale: view.homeScale,
        duration: 260, ease: 'Cubic.out', onUpdate: (tw) => view.applyLift(1 - tw.progress * 0.22),
      });
    }
    this.time.delayedCall(340, () => this.layoutHand());
  }

  // ------------------------------------------------------------ fim da rodada
  endRound() {
    this.busy = true;
    this.stopPulse();
    this.clearMarkers();
    this.setHandGlow(false);
    this.game.events.emit('hud:turn', { seat: null });
    const res = this.match.result;

    // revela a mão de cada adversário
    for (const s of this.outrosAssentos) {
      this.outrosViews[s].forEach((v, i) => {
        const p = res.hands[s]?.[i];
        if (!p) return;
        const sx = v.scaleX;
        this.tweens.add({ targets: v, scaleX: 0.02, duration: 140, delay: i * 70, ease: 'Quad.in',
          onComplete: () => {
            v.setFaceDown(false).setFace(p.a, p.b);
            this.tweens.add({ targets: v, scaleX: sx, duration: 160, ease: 'Quad.out' });
          } });
      });
    }

    // a mesa "acende" discretamente
    const glow = this.add.rectangle(this.m.W / 2, this.m.H / 2, this.m.W, this.m.H, 0xffe6b0, 0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.fxLayer.add(glow);
    this.tweens.add({ targets: glow, fillAlpha: res.souVencedor ? 0.14 : 0.05, duration: 420, yoyo: true, onComplete: () => glow.destroy() });

    if (res.souVencedor) this.goldBurst();
    audio.play(res.souVencedor ? 'win' : 'lose');
    buzz(res.souVencedor ? [12, 60, 22] : 40);
    this.emitHud();
    this.time.delayedCall(1700, () => this.game.events.emit('hud:result', {
      ...res, match: this.match.phase === 'matchOver', scores: this.match.scores,
      eu: this.eu, meuTime: this.meuTime, n: this.n, duplas: !!this.mp.duplas,
    }));
  }

  /** Partículas douradas — discretas, nada de confete. */
  goldBurst() {
    const { board } = this.m;
    const p = this.add.particles(board.cx, board.cy - board.h * 0.1, 'glow', {
      speed: { min: 30, max: 150 },
      angle: { min: 200, max: 340 },
      gravityY: 90,
      lifespan: { min: 700, max: 1500 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffe9a8, 0xd4af57, 0xfff4d0],
      blendMode: 'ADD',
      quantity: 3,
      frequency: 26,
    });
    this.fxLayer.add(p);
    this.time.delayedCall(900, () => p.stop());
    this.time.delayedCall(2600, () => p.destroy());
  }

  // ---------------------------------------------------------------- HUD
  emitHud() {
    this.updateStock();
    this.game.events.emit('hud:state', {
      round: this.match.round,
      player: this.match.hands.player.length,
      naMao: this.estado?.naMao ?? [],
      ativos: this.estado?.ativos ?? [],
      scores: this.match.scores,
      eu: this.eu,
      meuTime: this.meuTime,
      vez: this.match.vez,
      alvo: this.match.target,
      boneyard: this.match.boneyard.length,
      turn: this.match.turn,
      phase: this.match.phase,
      metrics: this.m,
    });
  }

  hint(text, ms = 4200) {
    this.hideHint();
    const { W, handTop } = this.m;
    this._hint = caps(this, W / 2, handTop - 16, text, Math.max(10, Math.min(13, W * 0.018)), theme.text, 0);
    this._hint.setShadow(0, 2, 'rgba(0,0,0,0.7)', 6);
    this._hint.setDepth(900);
    this.fxLayer.add(this._hint);
    this.tweens.add({ targets: this._hint, alpha: 0.85, duration: 260 });
    this._hintTimer?.remove();
    this._hintTimer = this.time.delayedCall(ms, () => this.hideHint());
  }

  hideHint() {
    if (!this._hint) return;
    const h = this._hint;
    this._hint = null;
    this.tweens.add({ targets: h, alpha: 0, duration: 200, onComplete: () => h.destroy() });
  }
}
