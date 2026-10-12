import Phaser from 'phaser';
import { theme } from '../render/theme.js';
import { makeButton, panelTexture, caps, FONT, SERIF } from '../render/ui.js';
import { audio, settings } from '../audio/audio.js';
import { chaveFoto, fotoRedonda } from '../../foto.js';
import { faixasNoAlto, relDe } from '../mesa.js';

/** O app não tem o <div id="safe"> do projeto original. */
const safeInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * HUD e overlays. Fica em cena separada para não sofrer o zoom/pan da mesa
 * e para o placar continuar legível enquanto a corrente cresce.
 */
export default class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.state = null;
    this.build();
    const bus = this.game.events;
    bus.on('hud:state', this.onState, this);
    bus.on('hud:turn', this.onTurn, this);
    bus.on('hud:flash', this.flash, this);
    bus.on('hud:result', this.showResult, this);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => {
      bus.off('hud:state', this.onState, this);
      bus.off('hud:turn', this.onTurn, this);
      bus.off('hud:flash', this.flash, this);
      bus.off('hud:result', this.showResult, this);
      this.scale.off('resize', this.onResize, this);
    });
  }

  onResize() {
    if (this._t) this._t.remove();
    this._t = this.time.delayedCall(150, () => { this.build(); if (this.state) this.onState(this.state); });
  }

  /** A mesa vista daqui: eu, os outros (na ordem da vez) e como nomear cada um. */
  jogadores() {
    // Do registry, não da cena Game: o Boot sobe a UI ANTES dela, e no primeiro
    // build a Game ainda não tinha `mp` — a HUD nascia sem foto e sem nome.
    const mp = this.game.registry.get('mp') ?? {};
    const players = mp.players ?? [];
    const n = players.length || 2;
    const eu = mp.seat ?? 0;
    const duplas = !!mp.duplas;
    const outros = Array.from({ length: n - 1 }, (_, k) => (eu + k + 1) % n);
    const nome = (s) => players[s]?.name ?? 'Adversário';
    return {
      players, n, eu, duplas, outros, nome,
      meuTime: duplas ? eu % 2 : eu,
      rival: players[outros[0]], rivalNome: nome(outros[0]),
    };
  }

  /**
   * Foto redonda pronta, ou pede e refaz a HUD quando ela chegar. `tocavel`:
   * foto de adversário abre o cartão dele no app (adicionar amigo).
   */
  foto(p, x, y, lado, tocavel = false) {
    const opts = { url: p?.avatar, nome: p?.name ?? '?', aro: '#d9a94e' };
    const key = chaveFoto(opts);
    if (this.textures.exists(key)) {
      const img = this.add.image(x, y, key).setDisplaySize(lado, lado);
      const onPerfil = this.game.registry.get('mp')?.onPerfil;
      if (tocavel && p && onPerfil) img.setInteractive({ useHandCursor: true }).on('pointerup', () => onPerfil(p));
      return img;
    }
    if (p) fotoRedonda(this, opts).then(() => { if (this.sys.displayList) { this.build(); if (this.state) this.onState(this.state); } });
    return null;
  }

  /** Encurta com reticências até o texto caber em `largura`. */
  caber(t, cheio, largura) {
    let nome = cheio;
    t.setText(nome);
    while (t.width > largura && nome.length > 3) {
      nome = nome.slice(0, -1);
      t.setText(`${nome.trimEnd()}…`);
    }
  }

  build() {
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    const ins = safeInsets();
    const top = ins.top + Math.max(8, H * 0.028);
    const s = Math.max(10, Math.min(13, H * 0.032));
    const big = s * 1.15;
    const padX = ins.left + Math.max(14, W * 0.022);
    const padR = W - ins.right - Math.max(14, W * 0.022);
    const { players, n, eu, duplas, outros, rival, rivalNome } = this.jogadores();

    // Eu: foto no canto, nome e peças ao lado dela.
    const FOTO = 1.2;                             // fotos 20% maiores que o bloco de texto pedia
    const foto = (big * 1.35 + s * 1.1) * FOTO;
    this.foto(players[eu], padX + foto / 2, top + foto / 2, foto);
    const gap = foto + s * 0.6;
    this.pName = this.text(padX + gap, top, 'VOCÊ', big, theme.text, 0, 0);
    this.pSub = this.text(padX + gap, top + big * 1.35, '7 peças', s * 0.85, theme.textDim, 0, 0);

    this.cName = null;
    this.chips = {};
    if (n === 2) {
      // 1×1: o adversário no canto oposto, espelhado.
      this.foto(rival, padR - foto / 2, top + foto / 2, foto, true);
      this.cName = this.text(padR - gap, top, rivalNome.slice(0, 14).toUpperCase(), big, theme.text, 1, 0);
      this.cSub = this.text(padR - gap, top + big * 1.35, '7 peças', s * 0.85, theme.textDim, 1, 0);
    } else {
      // 3 ou 4: cada adversário tem uma etiqueta logo abaixo da mão dele. As
      // medidas são as do GameScene.measure (a mão do alto encolhe 0,8 com 3+).
      const hud = ins.top + Phaser.Math.Clamp(H * 0.125, 38, 62);
      const handL = Phaser.Math.Clamp(H * 0.26, 84, 150);
      const cpuL = Phaser.Math.Clamp(handL * 0.44, 30, 52);
      const y = hud + cpuL * 0.8 + 6;
      const faixas = faixasNoAlto(n, W, ins);
      const lado = s * 2.1 * FOTO;
      for (const seat of outros) {
        const f = faixas[relDe(seat, eu, n)];
        const x = f.x0 + 4 + lado / 2;
        this.foto(players[seat], x, y + lado / 2, lado, true);
        const nome = this.text(x + lado / 2 + 5, y, '', s * 0.85, theme.text, 0, 0);
        this.caber(nome, (players[seat]?.name ?? 'Adversário').toUpperCase(), f.x1 - nome.x - 4);
        const sub = this.text(nome.x, y + s * 1.1, '', s * 0.72, theme.textDim, 0, 0);
        this.chips[seat] = { nome, sub, largura: f.x1 - nome.x - 4, parceiro: duplas && seat % 2 === eu % 2 };
      }
    }

    this.round = this.text(W / 2, top, 'ROUND 1', s * 0.85, theme.textDim, 0.5, 0);
    this.turn = this.text(W / 2, top + big * 1.35, '', s * 1.0, theme.goldCss, 0.5, 0);
    this.turn.setAlpha(0);

    // engrenagem: no 1×1 abaixo do adversário; com 3+ o canto de cima está livre
    const gx = W - ins.right - Math.max(14, W * 0.022);
    const gy = n === 2 ? top + big * 3.4 : top + s * 1.1;
    this.gear = this.add.container(gx, gy);
    const ring = this.add.circle(0, 0, s * 1.05, 0x000000, 0.28).setStrokeStyle(1.2, theme.gold, 0.5);
    const icon = this.add.text(0, 0, '⚙', { fontFamily: FONT, fontSize: `${Math.round(s * 1.2)}px`, color: theme.goldCss }).setOrigin(0.5);
    this.gear.add([ring, icon]);
    const hit = Math.max(48, s * 3);
    this.gear.setSize(hit, hit).setInteractive(new Phaser.Geom.Rectangle(-hit / 2, -hit / 2, hit, hit), Phaser.Geom.Rectangle.Contains);
    this.gear.on('pointerup', () => { audio.play('ui'); this.showSettings(); });

    this.flashText = this.text(W / 2, H * 0.42, '', Math.min(26, W * 0.035), theme.text, 0.5, 0.5);
    this.flashText.setAlpha(0);
    this.encaixarNome();
  }

  text(x, y, str, size, color, ox = 0, oy = 0) {
    const t = this.add.text(x, y, str, {
      fontFamily: FONT, fontSize: `${Math.round(size)}px`, fontStyle: '700', color: color || theme.text,
    }).setOrigin(ox, oy);
    t.setLetterSpacing?.(Math.max(1, size * 0.12));
    t.setShadow(0, 2, 'rgba(0,0,0,0.6)', 5);
    return t;
  }

  onState(st) {
    this.state = st;
    const { n, eu, duplas, outros, meuTime } = this.jogadores();
    const pc = (k) => `${k} ${k === 1 ? 'peça' : 'peças'}`;
    const placar = st.scores ?? [];
    const naMao = st.naMao ?? [];
    this.pSub.setText(n > 2 && !duplas ? `${pc(st.player)} · ${placar[eu] ?? 0} pts` : pc(st.player));
    if (n === 2) {
      this.cSub.setText(pc(naMao[outros[0]] ?? 7));
      this.round.setText(`ROUND ${st.round}   ·   ${placar[eu] ?? 0} — ${placar[outros[0]] ?? 0}`);
    } else if (duplas) {
      this.round.setText(`ROUND ${st.round}  ·  NÓS ${placar[meuTime] ?? 0} — ${placar[1 - meuTime] ?? 0} ELES`);
    } else {
      this.round.setText(`ROUND ${st.round}  ·  PRIMEIRO A ${st.alvo ?? 50}`);
    }
    for (const seat of outros) {
      const c = this.chips?.[seat];
      if (!c?.sub.active) continue;
      if (st.ativos?.[seat] === false) {
        c.sub.setText('saiu da mesa');
        c.nome.setAlpha(0.45);
        c.sub.setAlpha(0.6);
        continue;
      }
      const pontos = duplas ? '' : ` · ${placar[seat] ?? 0} pts`;
      c.sub.setText(`${c.parceiro ? 'parceiro · ' : ''}${pc(naMao[seat] ?? 7)}${pontos}`);
    }
    this.encaixarNome();
  }

  /**
   * 1×1: nome do adversário entre o placar do meio e a foto — em tela estreita
   * ele encosta no "ROUND 1 · 0 — 0". Encurta com reticências até caber.
   */
  encaixarNome() {
    if (!this.cName?.active || !this.round?.active) return;
    const limite = this.round.x + this.round.width / 2 + 10;   // borda direita do placar + folga
    this.caber(this.cName, this.jogadores().rivalNome.slice(0, 14).toUpperCase(), this.cName.x - limite);
  }

  onTurn({ seat, vez }) {
    this.tweens.killTweensOf(this.turn);
    if (!seat) { this.tweens.add({ targets: this.turn, alpha: 0, duration: 240 }); return; }
    const you = seat === 'player';
    const { nome, rivalNome } = this.jogadores();
    const quem = (vez != null ? nome(vez) : rivalNome).slice(0, 14).toUpperCase();
    this.turn.setText(you ? 'SUA VEZ' : `${quem} PENSANDO...`);
    this.turn.setColor(you ? theme.goldCss : theme.text);
    this.turn.setAlpha(0).setScale(0.94);
    this.tweens.add({ targets: this.turn, alpha: you ? 0.95 : 0.6, scale: 1, duration: 260, ease: 'Back.out' });
    if (!you) {
      this.tweens.add({ targets: this.turn, alpha: 0.28, duration: 700, yoyo: true, repeat: -1, delay: 260 });
    }
  }

  flash(msg) {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(msg).setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.flashText, alpha: 0.92, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: this.flashText, alpha: 0, duration: 300, delay: 850 });
  }

  // ------------------------------------------------------------- overlays
  overlay(w, h) {
    const { width: W, height: H } = this.scale;
    const layer = this.add.container(W / 2, H / 2).setDepth(100);
    const shade = this.add.rectangle(0, 0, W * 2, H * 2, 0x000000, 0.45).setInteractive();
    const key = `panel-${Math.round(w)}x${Math.round(h)}`;
    panelTexture(this, key, w, h);
    layer.add([shade, this.add.image(0, 0, key)]);
    layer.setScale(0.92).setAlpha(0);
    this.tweens.add({ targets: layer, scale: 1, alpha: 1, duration: 240, ease: 'Back.out' });
    return layer;
  }

  showResult(res) {
    const { width: W, height: H } = this.scale;
    const w = Math.min(W * 0.56, 430), h = Math.min(H * 0.76, 310);
    const layer = this.overlay(w, h);
    const fs = Math.max(11, Math.min(15, h * 0.05));
    const { n, eu, duplas, meuTime, nome } = this.jogadores();

    // `winner`, `scores` e `matchWinner` são por time (no individual, assento).
    const won = res.winner === meuTime;
    const quemTime = (t) => (duplas ? (t === meuTime ? 'Sua dupla' : 'A dupla adversária')
      : (t === eu ? 'Você' : nome(t)));
    const title = res.reason === 'blocked' ? 'JOGO FECHADO' : won ? 'VITÓRIA' : 'DERROTA';
    const t = this.add.text(0, -h * 0.28, title, {
      fontFamily: SERIF, fontSize: `${Math.round(fs * 2.3)}px`, fontStyle: '700',
      color: won ? theme.goldCss : theme.text,
    }).setOrigin(0.5);
    t.setLetterSpacing?.(fs * 0.25);
    t.setShadow(0, 3, 'rgba(0,0,0,0.6)', 10);
    layer.add(t);

    let sub;
    if (res.reason === 'blocked') {
      sub = res.winner === null
        ? 'Ninguém pôde jogar.\nEmpate no menor número de pontos na mão.'
        : `Ninguém pôde jogar.\n${quemTime(res.winner)} tinha menos pontos na mão.`;
    } else {
      sub = won ? `${duplas ? 'Sua dupla bateu' : 'Você bateu'} e venceu a rodada.`
        : `${quemTime(res.winner)} bateu e venceu a rodada.`;
    }
    layer.add(this.add.text(0, -h * 0.09, sub, {
      fontFamily: FONT, fontSize: `${Math.round(fs)}px`, color: theme.textDim, align: 'center', lineSpacing: 4,
      wordWrap: { width: w * 0.86 },
    }).setOrigin(0.5));

    if (res.points) {
      const pts = this.add.text(0, h * 0.06, `${won ? '+' : ''}${res.points} pontos`, {
        fontFamily: FONT, fontSize: `${Math.round(fs * 1.5)}px`, fontStyle: '700',
        color: won ? theme.goldCss : theme.text,
      }).setOrigin(0.5);
      layer.add(pts);
      pts.setScale(0.7).setAlpha(0);
      this.tweens.add({ targets: pts, scale: 1, alpha: 1, duration: 320, delay: 260, ease: 'Back.out' });
    }
    const sc = res.scores ?? [];
    const placar = duplas ? `NÓS ${sc[meuTime]}  ·  ${sc[1 - meuTime]} ELES`
      : n === 2 ? `${sc[eu]}  ·  ${sc[1 - eu]}`
      : sc.map((x, k) => `${k === eu ? 'VOCÊ' : nome(k).split(' ')[0].toUpperCase()} ${x}`).join('  ·  ');
    layer.add(caps(this, 0, h * 0.19, `PLACAR  ${placar}`, fs * (n > 2 && !duplas ? 0.7 : 0.85), theme.textDim));

    const bw = Math.min(w * 0.42, 200), bh = Math.max(46, h * 0.15);
    if (res.match) {
      layer.add(caps(this, 0, -h * 0.4, res.matchWinner === meuTime ? 'PARTIDA VENCIDA' : 'PARTIDA PERDIDA', fs * 0.8, theme.goldCss));
    }
    // A próxima rodada é o servidor que abre — aqui o botão só tira o aviso da
    // frente. Sair da partida é o botão do app, não daqui.
    if (!res.match) {
      layer.add(makeButton(this, 0, h * 0.34, bw, bh, 'CONTINUAR', () => layer.destroy(),
        { primary: true, fontSize: Math.round(bh * 0.3) }));
    }
  }

  showSettings() {
    const { width: W, height: H } = this.scale;
    const w = Math.min(W * 0.5, 380), h = Math.min(H * 0.82, 300);
    const layer = this.overlay(w, h);
    const fs = Math.max(11, Math.min(14, h * 0.055));
    layer.add(caps(this, 0, -h * 0.32, 'CONFIGURAÇÕES', fs * 1.3, theme.goldCss));

    const bw = w * 0.68, bh = Math.max(44, h * 0.16);
    const sfx = makeButton(this, 0, -h * 0.10, bw, bh, `SOM ${audio.sfx ? 'ON' : 'OFF'}`, () => {
      audio.setSfx(!audio.sfx);
      sfx.label.setText(`SOM ${audio.sfx ? 'ON' : 'OFF'}`);
    }, { fontSize: Math.round(bh * 0.3) });
    const mus = makeButton(this, 0, h * 0.08, bw, bh, `MÚSICA ${audio.music ? 'ON' : 'OFF'}`, () => {
      audio.setMusic(!audio.music);
      mus.label.setText(`MÚSICA ${audio.music ? 'ON' : 'OFF'}`);
    }, { fontSize: Math.round(bh * 0.3) });
    layer.add([sfx, mus]);
    layer.add(makeButton(this, -bw * 0.28, h * 0.30, bw * 0.52, bh, 'VOLTAR', () => layer.destroy(), { fontSize: Math.round(bh * 0.28) }));
    layer.add(makeButton(this, bw * 0.28, h * 0.30, bw * 0.52, bh, 'MENU', () => {
      layer.destroy();
      this.game.events.emit('ui:menu');
    }, { fontSize: Math.round(bh * 0.28) }));
  }
}
