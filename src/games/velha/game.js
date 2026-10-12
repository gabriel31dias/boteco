import Phaser from 'phaser';
import { palette, settings, bus, setSoundEnabled } from './state.js';
import { ensureTextures, glowStroke, glowDot, text, glowText, textWidth, css, setEmitterTint, makeButton } from './fx.js';
import { play } from './audio.js';
import { makeMascot } from './mascot.js';
import { fotoRedonda } from '../foto.js';

const E = Phaser.Math.Easing.Cubic.Out;
const clamp = Phaser.Math.Clamp;

// --- symbol painters: p is 0..1 "how much has been drawn" ---
function strokeSeg(g, x1, y1, x2, y2, t, color, w, alpha) {
  if (t <= 0) return;
  const tx = x1 + (x2 - x1) * t;
  const ty = y1 + (y2 - y1) * t;
  glowStroke(g, (gg) => { gg.beginPath(); gg.moveTo(x1, y1); gg.lineTo(tx, ty); gg.strokePath(); }, color, w, alpha);
  glowDot(g, x1, y1, w / 2, color, alpha);
  glowDot(g, tx, ty, w / 2, color, alpha);
}

function paintX(g, R, w, color, p, alpha = 1) {
  g.clear();
  strokeSeg(g, -R, -R, R, R, E(clamp(p / 0.54, 0, 1)), color, w, alpha);
  strokeSeg(g, R, -R, -R, R, E(clamp((p - 0.46) / 0.54, 0, 1)), color, w, alpha);
}

function paintO(g, R, w, color, p, alpha = 1) {
  g.clear();
  if (p <= 0) return;
  const a0 = -Math.PI / 2;
  // a hair short of a full turn — Phaser's arc is happier, and the cap dot hides the seam
  const a1 = a0 + (Math.PI * 2 - 0.004) * E(p);
  glowStroke(g, (gg) => { gg.beginPath(); gg.arc(0, 0, R, a0, a1, false); gg.strokePath(); }, color, w, alpha);
  glowDot(g, Math.cos(a0) * R, Math.sin(a0) * R, w / 2, color, alpha);
  glowDot(g, Math.cos(a1) * R, Math.sin(a1) * R, w / 2, color, alpha);
}

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create(dados) {
    ensureTextures(this);
    this.events.on('sfx', play);
    // Multiplayer: o servidor é dono do tabuleiro. Aqui só desenhamos o que ele
    // manda e pedimos jogada — nada de regra decidida no cliente.
    this.mp = dados;
    this.assento = dados.seat;
    this.meuSimbolo = dados.seat === 0 ? 'X' : 'O';
    this.rival = dados.players?.[1 - dados.seat]?.name ?? 'Adversário';
    this.prazo = 0;
    this.pal = palette();
    this.board = new Array(9).fill(null);
    this.symbols = new Array(9).fill(null);
    this.series = { player: 0, cpu: 0 };
    this.streak = 0;
    this.locked = true;
    this.turn = 'X';
    this.gridT = 0;
    this.winT = 0;
    this.winAlpha = 1;
    this.winLine = null;

    this.buildBoard();
    this.buildHud();
    this.buildOverlay();

    this.sparks = this.add.particles(0, 0, 'dot', {
      lifespan: { min: 260, max: 720 },
      speed: { min: 30, max: 150 },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.95, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(14);

    this.confetti = this.add.particles(0, 0, 'dot', {
      lifespan: { min: 900, max: 1800 },
      speed: { min: 120, max: 420 },
      angle: { min: 200, max: 340 },
      gravityY: 320,
      scale: { start: 0.30, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(23);

    this.layout();
    this.applyTheme();
    this.cameras.main.fadeIn(360, 0, 0, 0);
    this.startRound(true);
    // O primeiro `estado` já chegou antes desta cena existir: pega o último.
    const inicial = dados.getEstado?.();
    if (inicial) this.aplicar(inicial);

    const onTheme = () => { this.pal = palette(); this.applyTheme(); };
    bus.on('theme', onTheme);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      bus.off('theme', onTheme);
      this.scale.off('resize', this.layout, this);
    });
  }

  // ---------- construction ----------

  buildBoard() {
    this.panelG = this.add.graphics();
    this.noise = this.add.tileSprite(0, 0, 10, 10, 'noise')
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.05);
    this.gridG = this.add.graphics();
    this.hl = [];
    this.prev = [];
    for (let i = 0; i < 9; i++) {
      this.hl.push(this.add.graphics().setAlpha(0));
      this.prev.push(this.add.graphics().setAlpha(0));
    }
    this.winG = this.add.graphics();
    this.boardC = this.add.container(0, 0, [this.panelG, this.noise, this.gridG, ...this.hl, ...this.prev, this.winG])
      .setDepth(5);

    this.zones = [];
    for (let i = 0; i < 9; i++) {
      const z = this.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      z.on('pointerover', (p) => { if (!p.wasTouch) this.hover(i, true); });
      z.on('pointerout', () => this.hover(i, false));
      z.on('pointerdown', () => this.tryPlace(i));
      this.zones.push(z);
    }
  }

  buildHud() {
    this.menuBtn = makeButton(this, { label: 'SAIR', onClick: () => this.mp.onSair?.() }).setDepth(8);
    const soundLabel = () => (settings.sound ? 'SOM ATIVO' : 'SOM MUDO');
    this.soundBtn = makeButton(this, {
      label: soundLabel(),
      onClick: () => { setSoundEnabled(!settings.sound); this.soundBtn.setLabel(soundLabel()); },
    }).setDepth(8);

    this.lbl = {
      player: text(this, 0, 0, `VOCÊ ${this.meuSimbolo}`, 20, 0xffffff, 500, 4),
      draw: text(this, 0, 0, 'RODADA', 20, 0xffffff, 500, 4),
      cpu: text(this, 0, 0, this.rival.slice(0, 12).toUpperCase(), 20, 0xffffff, 500, 4),
    };
    this.num = {
      player: text(this, 0, 0, '0', 20, 0xffffff, 800, 1),
      draw: text(this, 0, 0, '0', 20, 0xffffff, 800, 1),
      cpu: text(this, 0, 0, '0', 20, 0xffffff, 800, 1),
    };
    this.turnText = text(this, 0, 0, 'SUA VEZ', 20, 0xffffff, 700, 6);
    this.clockText = text(this, 0, 0, '', 20, 0xffffff, 800, 2);
    this.clockText.setDepth(8);
    this.dots = [0, 1, 2].map(() => text(this, 0, 0, '.', 20, 0xffffff, 800, 0).setAlpha(0));
    this.seriesG = this.add.graphics();
    [...Object.values(this.lbl), ...Object.values(this.num), this.turnText, ...this.dots, this.seriesG]
      .forEach((o) => o.setDepth(8));

    // Foto de cada lado do placar: chega assíncrona, entra quando baixar.
    this.fotos = {};
    const lados = [['player', this.mp.players?.[this.assento], 'Você'],
      ['cpu', this.mp.players?.[1 - this.assento], this.rival]];
    for (const [k, p, nome] of lados) {
      fotoRedonda(this, { url: p?.avatar, nome: p?.name ?? nome }).then((key) => {
        if (!this.sys.displayList) return;               // saiu antes da foto chegar
        this.fotos[k] = this.add.image(0, 0, key).setDepth(8);
        // Foto do adversário abre o cartão dele no app (adicionar amigo).
        if (k === 'cpu' && p && this.mp.onPerfil) {
          this.fotos[k].setInteractive({ useHandCursor: true }).on('pointerup', () => this.mp.onPerfil(p));
        }
        this.placeFotos();
      });
    }
  }

  /** Você à esquerda da sua coluna, o adversário à direita da dele: por fora do placar. */
  placeFotos() {
    if (!this.geo) return;
    const { u } = this.geo;
    for (const [k, lado] of [['player', -1], ['cpu', 1]]) {
      const f = this.fotos[k];
      if (!f) continue;
      const lbl = this.lbl[k], num = this.num[k];
      const meia = Math.max(textWidth(lbl), textWidth(num)) / 2;
      // Nome comprido come o espaço até a borda: a foto encolhe pra caber.
      const livre = (lado < 0 ? lbl.x - meia : this.geo.w - (lbl.x + meia)) - u * 2.5;
      const size = Math.max(u * 6, Math.min((num.y - lbl.y) * 1.9, livre));
      const x = lbl.x + lado * (meia + u * 1.5 + size / 2);
      f.setDisplaySize(size, size)
        .setPosition(Phaser.Math.Clamp(x, size / 2 + u, this.geo.w - size / 2 - u), (lbl.y + num.y) / 2);
    }
  }

  buildOverlay() {
    this.veil = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setDepth(20);
    this.bannerPlate = this.add.image(0, 0, 'blob').setTint(0x000000).setAlpha(0.62);
    this.bannerTitle = text(this, 0, 0, '', 20, 0xffffff, 800, 8);
    this.bannerSub = text(this, 0, 0, '', 20, 0xffffff, 500, 5);
    this.mascot = makeMascot(this, this.pal);
    this.banner = this.add.container(0, 0, [this.bannerPlate, this.mascot.c, this.bannerTitle, this.bannerSub]).setDepth(22).setAlpha(0);
    this.countText = text(this, 0, 0, '', 20, 0xffffff, 800, 0).setDepth(22).setAlpha(0);
  }

  // ---------- layout ----------

  layout() {
    const { width: w, height: h } = this.scale;
    const u = Math.min(w, h) / 100;
    const cx = w / 2;
    const pad = clamp(w * 0.045, u * 4.5, u * 6);

    // Landscape has little height to spare, so the HUD stack compresses.
    const tight = w > h * 1.25 ? 0.75 : 1;
    const bw = Math.min(u * 24, w * 0.30);
    const bh = Math.max(u * 6.6, 34);
    const rowY = pad + u * 3.6;
    // ponytail: the score block hangs off the buttons' real bottom edge, not a
    // fixed offset — a fixed one slides under MENU/SOUND once `tight` squeezes.
    // Portrait stacks the score directly under the buttons and needs real
    // clearance; landscape sits beside them (they hug the edges), so a hair does.
    const lblY = rowY + bh * 0.6 + (tight === 1 ? u * 9 : u * 1.5);
    const numY = lblY + u * 6.2 * tight;
    const turnY = numY + u * 10 * tight;
    const pipsY = turnY + u * 5.2 * tight;
    // + the panel's overhang beyond the grid, so nothing crowds the board
    const topReserved = pipsY + u * 7;
    const bottom = u * 7;

    // PANEL_OVERHANG: the board panel is drawn wider than the 3x3 grid, so the
    // width budget has to account for it or the panel runs off screen.
    const avail = Math.min((w - pad * 2) / 1.10, h - topReserved - bottom);
    const board = clamp(avail, u * 34, u * 88);
    const cell = board / 3;
    const cy = topReserved + (h - topReserved - bottom - board) / 2 + board / 2;

    this.geo = { w, h, u, cx, cy, board, cell, pad, turnY };

    this.boardC.setPosition(cx, cy);
    this.noise.setSize(board * 0.94, board * 0.94).setPosition(0, 0);
    this.drawPanel();
    this.drawGrid(this.gridT);

    for (let i = 0; i < 9; i++) {
      const { x, y } = this.cellLocal(i);
      this.hl[i].setPosition(x, y);
      this.prev[i].setPosition(x, y);
      this.zones[i].setPosition(cx + x, cy + y).setSize(cell, cell)
        .input.hitArea.setTo(0, 0, cell, cell);
      this.symbols[i]?.c.setPosition(x, y);
    }
    this.drawCellArt();
    this.redrawSymbols();
    this.drawWinLine(this.winT);

    // HUD
    this.menuBtn.setGeom(bw, bh).setPosition(pad + bw / 2, rowY + bh * 0.1);
    this.soundBtn.setGeom(bw, bh).setPosition(w - pad - bw / 2, rowY + bh * 0.1);

    const col = Math.min(w * 0.30, u * 28);
    const lblSize = Math.round(Math.min(u * 3.1, w * 0.032));
    const numSize = Math.round(Math.min(u * 7.2, w * 0.085));
    const cols = [['player', -col], ['draw', 0], ['cpu', col]];
    for (const [k, dx] of cols) {
      this.lbl[k].setFontSize(lblSize).setPosition(cx + dx, lblY);
      this.num[k].setFontSize(numSize).setPosition(cx + dx, numY);
    }

    this.turnText.setFontSize(Math.round(Math.min(u * 4.2, w * 0.045))).setPosition(cx, turnY);
    // Entre os dois botões do topo: é o único vão livre do HUD.
    this.clockText.setFontSize(Math.round(Math.min(u * 5.6, w * 0.06)))
      .setPosition(cx, rowY + bh * 0.1);
    this.seriesG.setPosition(cx, pipsY);
    this.drawPips();
    this.placeDots();
    this.placeFotos();

    this.veil.setSize(w, h);
    this.banner.setPosition(cx, cy);
    this.bannerPlate.setDisplaySize(w * 1.5, u * 46).setPosition(0, u * 1);
    this.mascot.setSize(Math.min(u * 11, w * 0.10)).c.setPosition(0, -u * 23);
    this.bannerTitle.setFontSize(Math.round(Math.min(u * 13, w * 0.14))).setPosition(0, -u * 4);
    this.bannerSub.setFontSize(Math.round(Math.min(u * 3.8, w * 0.042))).setPosition(0, u * 6);
    this.countText.setFontSize(Math.round(u * 26)).setPosition(cx, cy);

    this.updateScore();
  }

  cellLocal(i) {
    const { cell, board } = this.geo;
    return {
      x: -board / 2 + ((i % 3) + 0.5) * cell,
      y: -board / 2 + (Math.floor(i / 3) + 0.5) * cell,
    };
  }

  worldOf(i) {
    const l = this.cellLocal(i);
    return { x: this.boardC.x + l.x, y: this.boardC.y + l.y };
  }

  // ---------- painting ----------

  drawPanel() {
    const { board } = this.geo;
    const pal = this.pal;
    const half = board / 2 + board * 0.045;
    const size = half * 2;
    const r = board * 0.065;
    const g = this.panelG;
    g.clear();
    // layered soft shadow
    g.fillStyle(0x000000, 0.16); g.fillRoundedRect(-half - board * 0.02, -half + board * 0.055, size + board * 0.04, size, r * 1.2);
    g.fillStyle(0x000000, 0.30); g.fillRoundedRect(-half, -half + board * 0.025, size, size, r);
    // body
    g.fillStyle(pal.panel, pal.panelAlpha); g.fillRoundedRect(-half, -half, size, size, r);
    // top sheen
    g.fillStyle(0xffffff, 0.030);
    g.fillRoundedRect(-half, -half, size, size * 0.42, { tl: r, tr: r, bl: 0, br: 0 });
    // rim + outer glow
    g.lineStyle(Math.max(2, board * 0.020), pal.stroke, pal.strokeAlpha * 0.18);
    g.strokeRoundedRect(-half, -half, size, size, r);
    g.lineStyle(Math.max(1, board * 0.0035), pal.stroke, pal.strokeAlpha);
    g.strokeRoundedRect(-half, -half, size, size, r);
  }

  drawGrid(t) {
    const { board, cell } = this.geo;
    const half = board / 2;
    const w = Math.max(1.5, cell * 0.026);
    const g = this.gridG;
    g.clear();
    for (let i = 0; i < 2; i++) {
      const len = half * E(clamp((t - i * 0.12) / 0.86, 0, 1)) * 0.94;
      if (len <= 0) continue;
      const o = -half + cell * (i + 1);
      glowStroke(g, (gg) => { gg.beginPath(); gg.moveTo(o, -len); gg.lineTo(o, len); gg.strokePath(); }, this.pal.grid, w, 0.75);
      glowStroke(g, (gg) => { gg.beginPath(); gg.moveTo(-len, o); gg.lineTo(len, o); gg.strokePath(); }, this.pal.grid, w, 0.75);
    }
  }

  drawCellArt() {
    const { cell } = this.geo;
    const s = cell * 0.86;
    const r = cell * 0.14;
    for (let i = 0; i < 9; i++) {
      const g = this.hl[i];
      g.clear();
      g.fillStyle(this.pal.accent, 0.13); g.fillRoundedRect(-s / 2, -s / 2, s, s, r);
      g.lineStyle(Math.max(1, cell * 0.012), this.pal.accent, 0.45); g.strokeRoundedRect(-s / 2, -s / 2, s, s, r);
    }
    this.redrawPreviews();
  }

  redrawPreviews() {
    const { cell } = this.geo;
    const R = cell * 0.255;
    const w = Math.max(2, cell * 0.058);
    const color = this.turn === 'X' ? this.pal.x : this.pal.o;
    for (let i = 0; i < 9; i++) {
      (this.turn === 'X' ? paintX : paintO)(this.prev[i], R, w, color, 1, 0.30);
    }
  }

  redrawSymbols() {
    const { cell } = this.geo;
    for (const s of this.symbols) {
      if (!s) continue;
      s.R = cell * 0.255;
      s.w = Math.max(2, cell * 0.058);
      s.color = s.kind === 'X' ? this.pal.x : this.pal.o;
      s.repaint();
    }
  }

  drawPips() {
    const g = this.seriesG;
    g.clear();
    const { u } = this.geo;
    const r = u * 1.05;
    const gap = u * 3.2;
    const draw = (x, color, on) => {
      if (on) { g.fillStyle(color, 0.16); g.fillCircle(x, 0, r * 2.4); }
      g.fillStyle(color, on ? 1 : 0.16); g.fillCircle(x, 0, r);
    };
    for (let i = 0; i < 2; i++) draw(-gap * 1.7 + i * gap, this.pal.x, this.series.player > i);
    for (let i = 0; i < 2; i++) draw(gap * 0.7 + i * gap, this.pal.o, this.series.cpu > i);
  }

  drawWinLine(t) {
    const g = this.winG;
    g.clear();
    if (!this.winLine || t <= 0) return;
    const [a, , c] = this.winLine;
    const A = this.cellLocal(a);
    const C = this.cellLocal(c);
    const ang = Math.atan2(C.y - A.y, C.x - A.x);
    const ext = this.geo.cell * 0.34;
    const x1 = A.x - Math.cos(ang) * ext;
    const y1 = A.y - Math.sin(ang) * ext;
    const x2 = C.x + Math.cos(ang) * ext;
    const y2 = C.y + Math.sin(ang) * ext;
    const color = this.board[a] === 'X' ? this.pal.x : this.pal.o;
    const w = Math.max(2, this.geo.cell * 0.055);
    strokeSeg(g, x1, y1, x2, y2, t, color, w, this.winAlpha);
    this.winTip = { x: this.boardC.x + x1 + (x2 - x1) * t, y: this.boardC.y + y1 + (y2 - y1) * t };
  }

  applyTheme() {
    const pal = this.pal;
    this.drawPanel();
    this.drawGrid(this.gridT);
    this.drawCellArt();
    this.redrawSymbols();
    this.drawPips();
    this.menuBtn.repaint(pal);
    this.soundBtn.repaint(pal);
    this.mascot.setPalette(pal);
    this.lbl.player.setColor(css(pal.x));
    this.lbl.cpu.setColor(css(pal.o));
    this.lbl.draw.setColor(css(pal.dim));
    this.num.player.setColor(css(pal.text));
    this.num.draw.setColor(css(pal.dim));
    this.num.cpu.setColor(css(pal.text));
    glowText(this.num.player, pal.x, 18);
    glowText(this.num.cpu, pal.o, 18);
    this.dots.forEach((d) => d.setColor(css(pal.text)));
    this.updateTurnText();
  }

  // ---------- interaction ----------

  hover(i, on) {
    if (this.locked || this.board[i]) return;
    this.tweens.add({ targets: this.hl[i], alpha: on ? 1 : 0, scale: on ? 1 : 0.94, duration: 180, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: this.prev[i], alpha: on ? 1 : 0, scale: on ? 1 : 0.9, duration: 220, ease: 'Sine.easeOut' });
    if (on) this.events.emit('sfx', 'hover');
  }

  minhaVez() { return this.turn === this.meuSimbolo; }

  tryPlace(i) {
    if (this.locked || this.board[i] || !this.minhaVez()) return;
    this.locked = true;               // solta quando o servidor confirmar
    play('press');
    // instant press feedback, matters most on touch where there is no hover
    this.hl[i].setAlpha(1).setScale(1);
    this.tweens.add({ targets: this.hl[i], alpha: 0, scale: 1.18, duration: 320, ease: 'Cubic.easeOut' });
    this.prev[i].setAlpha(0);
    this.mp.onJogada({ casa: i });              // quem aplica no tabuleiro é o servidor
  }

  spawn(i, kind, done) {
    const { cell } = this.geo;
    const l = this.cellLocal(i);
    const color = kind === 'X' ? this.pal.x : this.pal.o;
    const glowG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const g = this.add.graphics();
    const c = this.add.container(l.x, l.y, [glowG, g]);
    this.boardC.add(c);

    const s = { kind, i, c, g, glowG, color, R: cell * 0.255, w: Math.max(2, cell * 0.058), p: 0 };
    s.repaint = () => {
      const paint = kind === 'X' ? paintX : paintO;
      paint(s.g, s.R, s.w, s.color, s.p, 1);
      paint(s.glowG, s.R, s.w * 1.4, s.color, s.p, 0.55);
    };
    this.symbols[i] = s;

    const world = this.worldOf(i);
    const dur = kind === 'X' ? 340 : 430;
    setEmitterTint(this.sparks, color);

    if (kind === 'X') {
      this.time.delayedCall(dur * 0.52, () => this.burst(world.x + s.R, world.y + s.R, 7, color));
      this.time.delayedCall(dur, () => this.burst(world.x - s.R, world.y + s.R, 7, color));
    }

    this.tweens.add({
      targets: s, p: 1, duration: dur, ease: 'Linear',
      onUpdate: () => s.repaint(),
      onComplete: () => {
        s.repaint();
        this.tweens.add({ targets: c, scale: { from: 1.14, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        this.ringPop(l.x, l.y, s.R, color);
        this.cameras.main.shake(90, 0.0016);
        if (kind === 'O') {
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            this.burst(world.x + Math.cos(a) * s.R, world.y + Math.sin(a) * s.R, 1, color);
          }
        }
        done?.();
      },
    });
    return s;
  }

  burst(x, y, n, color) {
    setEmitterTint(this.sparks, color);
    this.sparks.emitParticleAt(x, y, n);
  }

  ringPop(x, y, R, color) {
    const g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(Math.max(2, R * 0.10), color, 0.85);
    g.strokeCircle(0, 0, R);
    g.setPosition(x, y);
    this.boardC.add(g);
    this.tweens.add({
      targets: g, scale: 1.55, alpha: 0, duration: 460, ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  hideHints() {
    this.hl.forEach((g) => this.tweens.add({ targets: g, alpha: 0, duration: 160 }));
    this.prev.forEach((g) => this.tweens.add({ targets: g, alpha: 0, duration: 160 }));
  }

  // ---------- turn flow ----------

  /**
   * Única porta de entrada do estado do servidor. Desenha o que apareceu de
   * novo no tabuleiro e, quando a rodada fecha, dispara a comemoração.
   */
  aplicar(e) {
    this.prazo = e.prazo ?? 0;
    this.rodadaAtual = e.rodada;
    // A próxima rodada pode abrir com o adversário: quem começa alterna.
    this.proximoTurno = e.comeca === this.assento ? this.meuSimbolo
      : (this.meuSimbolo === 'X' ? 'O' : 'X');
    this.series = { player: e.placar[this.assento], cpu: e.placar[1 - this.assento] };
    this.drawPips();
    this.updateScore();

    const novas = [];
    for (let i = 0; i < 9; i++) {
      if (e.board[i] && !this.board[i]) novas.push([i, e.board[i]]);
    }
    const fechou = e.ultima?.tipo === 'rodada';

    // Só a última peça anima com som; se chegou mais de uma (reconexão), o
    // resto entra direto pra não fazer fila de animação.
    novas.forEach(([i, kind], k) => {
      const ultima = k === novas.length - 1;
      this.board[i] = kind;
      this.hideHints();
      if (ultima) play(kind === 'X' ? 'drawX' : 'drawO');
      const s = this.spawn(i, kind, ultima ? () => this.depoisDaJogada(e) : undefined);
      if (!ultima) { s.p = 1; s.repaint(); }
    });

    if (!novas.length) this.depoisDaJogada(e);
  }

  depoisDaJogada(e) {
    if (e.ultima?.tipo === 'rodada') { this.fecharRodada(e); return; }
    this.turn = e.vez === this.assento ? this.meuSimbolo : (this.meuSimbolo === 'X' ? 'O' : 'X');
    this.redrawPreviews();
    this.updateTurnText();
    this.showThinking(!this.minhaVez());
    this.locked = !this.minhaVez();
  }

  /** Rodada acabou: linha vencedora, banner, e o servidor já abriu a próxima. */
  fecharRodada(e) {
    const venceu = e.ultima.vencedorRodada;
    this.locked = true;
    this.showThinking(false);
    this.prazo = 0;
    this.clockText.setText('');
    this.tweens.add({ targets: this.turnText, alpha: 0, duration: 220 });

    if (e.fim) { this.finalDaPartida(e); return; }
    if (venceu === null) { this.celebrateDraw(); return; }
    const euGanhei = venceu === this.assento;
    if (e.ultima.tempo) {
      this.showBanner('TEMPO!', euGanhei ? this.pal.x : this.pal.o,
        euGanhei ? `${this.rival.toUpperCase()} DEMOROU DEMAIS` : 'VOCÊ DEMOROU DEMAIS', euGanhei ? 'cheer' : 'sad');
      this.scheduleNext(false);
      return;
    }
    this.celebrateWin(e.ultima.linha, euGanhei);
  }

  /** Fim de tudo: quem leva a série. O pagamento é o React que mostra. */
  finalDaPartida(e) {
    this.partidaAcabou = true;
    const empate = e.fim.vencedor === null;
    const euGanhei = e.fim.vencedor === this.assento;
    const cor = empate ? this.pal.accent : (euGanhei ? this.pal.x : this.pal.o);
    if (e.ultima?.linha && !empate) this.celebrateWin(e.ultima.linha, euGanhei);
    play('series');
    const motivo = e.fim.motivo === 'tempo'
      ? (euGanhei ? 'VOCÊ PENSOU MAIS RÁPIDO' : 'ELE PENSOU MAIS RÁPIDO')
      : (empate ? 'APOSTA DEVOLVIDA' : `${this.series.player} A ${this.series.cpu} NA SÉRIE`);
    this.time.delayedCall(e.ultima?.linha && !empate ? 900 : 0, () => {
      this.showBanner(empate ? 'EMPATE' : (euGanhei ? 'VOCÊ VENCEU' : 'VOCÊ PERDEU'), cor, motivo,
        euGanhei ? 'cheer' : 'sad');
    });
  }

  updateTurnText() {
    const minha = this.minhaVez();
    const pal = this.pal;
    const cor = this.turn === 'X' ? pal.x : pal.o;
    this.turnText.setText(minha ? 'SUA VEZ' : `VEZ DE ${this.rival.slice(0, 12).toUpperCase()}`);
    this.turnText.setColor(css(cor));
    glowText(this.turnText, cor, 20);
    this.placeDots();
    // brief flare so the turn change is felt, not just read
    this.tweens.killTweensOf(this.turnText);
    this.turnText.setScale(1).setAlpha(1);
    this.tweens.add({ targets: this.turnText, scale: { from: 1.10, to: 1 }, duration: 420, ease: 'Back.easeOut' });
  }

  placeDots() {
    if (!this.geo) return;
    const { cx, turnY, u } = this.geo;
    const start = cx + textWidth(this.turnText) / 2 + u * 1.2;
    this.dots.forEach((d, i) => {
      d.setFontSize(this.turnText.style.fontSize).setColor(this.turnText.style.color);
      d.setPosition(start + i * u * 2.2, turnY);
    });
  }

  showThinking(on) {
    this.tweens.killTweensOf(this.dots);
    if (!on) { this.dots.forEach((d) => d.setAlpha(0)); return; }
    this.placeDots();
    this.dots.forEach((d, i) => {
      d.setAlpha(0);
      this.tweens.add({
        targets: d, alpha: 1, duration: 240, delay: i * 150,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });
  }

  // ---------- results ----------

  celebrateWin(line, playerWon) {
    this.winLine = line;
    const color = playerWon ? this.pal.x : this.pal.o;

    // 1. losers recede
    this.symbols.forEach((s) => {
      if (s && !line.includes(s.i)) this.tweens.add({ targets: s.c, alpha: 0.22, duration: 260, ease: 'Sine.easeOut' });
    });

    // 2. light sweeps across the three winners, trailing sparks
    this.time.delayedCall(200, () => {
      play('sweep');
      this.winT = 0;
      this.tweens.add({
        targets: this, winT: 1, duration: 520, ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          this.drawWinLine(this.winT);
          if (this.winTip && tw.progress < 0.98 && Math.random() < 0.6) {
            this.burst(this.winTip.x, this.winTip.y, 1, color);
          }
        },
        onComplete: () => this.winnersGlow(line, playerWon, color),
      });
    });
  }

  winnersGlow(line, playerWon, color) {
    // 3. pulse of light along the line
    this.tweens.add({
      targets: this, winAlpha: 0.5, duration: 260, yoyo: true, repeat: 1, ease: 'Sine.easeInOut',
      onUpdate: () => this.drawWinLine(1),
      onComplete: () => { this.winAlpha = 1; this.drawWinLine(1); },
    });

    line.forEach((i, k) => {
      const s = this.symbols[i];
      if (!s) return;
      this.time.delayedCall(k * 90, () => {
        this.tweens.add({ targets: s.glowG, alpha: { from: 0, to: 1 }, duration: 240, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: s.c, scale: 1.16, duration: 320, ease: 'Back.easeOut' });
        const wpos = this.worldOf(i);
        this.burst(wpos.x, wpos.y, 12, color);
      });
    });

    this.cameras.main.shake(220, 0.0035);
    this.cameras.main.zoomTo(1.045, 130, 'Sine.easeOut');
    this.time.delayedCall(150, () => this.cameras.main.zoomTo(1, 460, 'Sine.easeInOut'));
    play(playerWon ? 'win' : 'lose');
    if (playerWon) this.time.delayedCall(260, () => this.coinRain());
    this.time.delayedCall(360, () => {
      this.drawPips();
      // Partida acabada é o `finalDaPartida` que anuncia; aqui é só a rodada.
      if (this.partidaAcabou) return;
      this.showBanner(
        playerWon ? 'RODADA SUA!' : `RODADA DE ${this.rival.toUpperCase()}`,
        color, `SÉRIE  ${this.series.player} — ${this.series.cpu}`,
        playerWon ? 'cheer' : 'sad',
      );
      this.scheduleNext();
    });
  }

  // ponytail: the whole streak system is one counter and this flourish. It sits on
  // the turn line, which has already faded out by the time a round ends.
  streakFlare(n) {
    const { cx, u, turnY } = this.geo;
    const color = this.pal.x;
    play('streak', n);
    const t = text(this, cx, turnY, `${n} SEGUIDAS`, Math.round(Math.min(u * 6, this.geo.w * 0.062)), color, 800, 8)
      .setDepth(24).setAlpha(0);
    glowText(t, color, 34);
    this.tweens.add({ targets: t, alpha: 1, scale: { from: 0.6, to: 1 }, y: turnY - u * 2, duration: 620, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: turnY - u * 7, duration: 460, delay: 1000, onComplete: () => t.destroy() });
    setEmitterTint(this.confetti, color);
    this.confetti.emitParticleAt(cx, turnY, Math.min(10 + n * 6, 40));
  }

  // ponytail: a one-shot emitter built and thrown away per win — the launch speeds
  // are screen-relative, and rebuilding beats keeping a resize-aware emitter around.
  coinRain() {
    const { w, h, u } = this.geo;
    play('coins');
    const coins = this.add.particles(0, 0, 'coin', {
      lifespan: 2200,
      speedY: { min: -u * 95, max: -u * 135 },
      speedX: { min: -u * 16, max: u * 16 },
      gravityY: u * 92,
      // the coin texture is 48px, so this is a diameter of roughly 3.5u..5.5u
      scale: { min: u * 0.090, max: u * 0.140 },
      rotate: { start: 0, end: 360 },
      tint: [0xffe08a, 0xffc247, 0xffb01f],
      emitting: false,
    }).setDepth(26);

    for (let k = 0; k < 5; k++) {
      this.time.delayedCall(k * 150, () => coins.emitParticleAt(w * (0.12 + Math.random() * 0.76), h + u * 4, 4));
    }
    this.time.delayedCall(3600, () => coins.destroy());
  }

  celebrateDraw() {
    play('draw');
    this.symbols.forEach((s, k) => {
      if (!s) return;
      this.tweens.add({
        targets: s.c, angle: { from: 0, to: 7 }, duration: 210, delay: k * 45,
        yoyo: true, repeat: 1, ease: 'Sine.easeInOut',
      });
      this.tweens.add({ targets: s.c, alpha: 0.55, duration: 420, delay: k * 45 });
    });
    this.time.delayedCall(620, () => {
      if (this.partidaAcabou) return;
      this.showBanner('EMPATE!', this.pal.accent, `SÉRIE  ${this.series.player} — ${this.series.cpu}`);
      this.scheduleNext();
    });
  }

  showBanner(title, color, sub, mood = 'dance') {
    this.mascot.setMood(mood);
    this.bannerTitle.setText(title).setColor(css(color)).setScale(1);
    glowText(this.bannerTitle, color, 40);
    this.bannerSub.setText(sub).setColor(css(this.pal.dim)).setScale(1);
    // long verdicts ("CAMPEÃO DA SÉRIE") must not run off a phone screen
    const maxW = this.geo.w - this.geo.pad * 2;
    const k = Math.min(1, maxW / textWidth(this.bannerTitle));
    this.bannerSub.setScale(Math.min(1, maxW / textWidth(this.bannerSub)));
    this.banner.setAlpha(0).setY(this.geo.cy + this.geo.u * 5);
    this.tweens.add({ targets: this.veil, fillAlpha: 0.45, duration: 320, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 1, y: this.geo.cy, duration: 520, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.bannerTitle, scale: { from: k * 0.86, to: k }, duration: 560, ease: 'Back.easeOut' });
  }

  hideBanner(ms = 300) {
    this.tweens.add({ targets: this.veil, fillAlpha: 0, duration: ms });
    this.tweens.add({ targets: this.banner, alpha: 0, y: this.geo.cy - this.geo.u * 4, duration: ms });
  }

  // ---------- round lifecycle ----------

  scheduleNext() {
    this.time.delayedCall(1600, () => {
      this.hideBanner();
      this.clearBoard(() => this.startRound(false));
    });
  }

  clearBoard(done) {
    play('reset');
    this.tweens.add({ targets: this.winG, alpha: 0, duration: 260 });
    const live = this.symbols.filter(Boolean);
    live.forEach((s, k) => {
      this.tweens.add({
        targets: s.c, alpha: 0, scale: 0.75, duration: 300, delay: k * 45, ease: 'Cubic.easeIn',
        onComplete: () => s.c.destroy(),
      });
    });
    this.tweens.add({ targets: this, gridT: 0, duration: 320, delay: live.length * 45, ease: 'Cubic.easeIn',
      onUpdate: () => this.drawGrid(this.gridT) });
    this.time.delayedCall(live.length * 45 + 380, () => {
      this.symbols.fill(null);
      this.board.fill(null);
      this.winLine = null;
      this.winT = 0;
      this.winAlpha = 1;
      this.winG.setAlpha(1);
      this.drawWinLine(0);
      done();
    });
  }

  countdown() {
    let n = 3;
    const step = () => {
      if (n === 0) { this.startRound(false); return; }
      play('tick');
      this.countText.setText(String(n)).setColor(css(this.pal.text)).setAlpha(1).setScale(1.5);
      glowText(this.countText, this.pal.accent, 30);
      this.tweens.add({ targets: this.countText, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.countText, alpha: 0, duration: 200, delay: 260 });
      n--;
      this.time.delayedCall(470, step);
    };
    step();
  }

  startRound(first) {
    this.board.fill(null);
    this.turn = this.proximoTurno ?? 'X';
    this.locked = true;
    this.winLine = null;
    this.winT = 0;
    this.drawWinLine(0);
    this.redrawPreviews();
    this.turnText.setAlpha(1);
    this.updateTurnText();

    this.boardC.setAlpha(first ? 0 : 1).setScale(first ? 0.92 : 1);
    if (first) this.tweens.add({ targets: this.boardC, alpha: 1, scale: 1, duration: 520, ease: 'Back.easeOut' });

    this.gridT = 0;
    this.tweens.add({
      targets: this, gridT: 1, duration: first ? 760 : 480, delay: first ? 160 : 0, ease: 'Linear',
      onUpdate: () => this.drawGrid(this.gridT),
      onComplete: () => { this.locked = false; },
    });
  }

  updateScore() {
    const sc = { player: this.series.player, cpu: this.series.cpu, draw: this.rodadaAtual ?? 1 };
    for (const k of ['player', 'draw', 'cpu']) {
      const t = this.num[k];
      const next = String(sc[k]);
      if (t.text === next) continue;   // layout() calls this too — only a real change punches
      t.setText(next);
      this.tweens.killTweensOf(t);
      this.tweens.add({ targets: t, scale: { from: 1.75, to: 1 }, duration: 540, ease: 'Back.easeOut' });
    }
  }

  toMenu() { this.mp.onSair?.(); }

  update(_, dt) {
    // barely-there texture drift on the board surface
    this.noise.tilePositionX += dt * 0.004;
    this.noise.tilePositionY -= dt * 0.003;

    if (!this.prazo) { if (this.clockText.text) this.clockText.setText(''); return; }
    const seg = Math.max(0, Math.ceil((this.prazo - Date.now()) / 1000));
    const txt = String(seg);
    if (this.clockText.text !== txt) {
      this.clockText.setText(txt);
      this.clockText.setColor(css(seg <= 5 ? this.pal.o : this.pal.dim));
    }
  }
}
