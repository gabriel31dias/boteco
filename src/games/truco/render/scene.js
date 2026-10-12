import { Application, Assets, Container, Sprite } from 'pixi.js';
import { cardTexture, CARD_W, CARD_H, FULL_W, FULL_H } from './card.js';
import * as anim from './anim.js';
import versoAzulUrl from '../../../assets/truco/verso-azul.webp';
import versoVermelhoUrl from '../../../assets/truco/verso-vermelho.webp';

// Espaço de design = a arte de referência em pé (941x1672): as coordenadas
// abaixo são pixels dela. A mesa em si é o fundo (CSS); aqui só as cartas.
export const W = 941, H = 1672;
const MAO_OUTROS = 0.52;                         // escala da mão fechada dos outros
const MINHA_MAO = 1.18;
const NA_MESA = 0.78;
let versos = null;                               // { azul, vermelho }: verso da carta na arte

/**
 * Posições na mesa, RELATIVAS a quem olha: 0 é sempre você, embaixo à esquerda
 * (sua mão grande fica no pé da tela). A vez gira no sentido anti-horário da
 * tela: nas duplas 1 é embaixo à direita, 2 (parceiro, na diagonal) em cima à
 * direita e 3 em cima à esquerda — os lugares dos avatares da arte.
 */
const LAYOUT = {
  2: {
    deck: { x: 790, y: 735 },
    mao: [{ x: W / 2, y: 1120 }, { x: W / 2, y: 615 }],
    mesa: [{ x: W / 2 + 35, y: 870 }, { x: W / 2 - 35, y: 755 }],
  },
  4: {
    deck: { x: 790, y: 735 },
    mao: [{ x: W / 2, y: 1120 }, { x: 610, y: 935 }, { x: 645, y: 625 }, { x: 295, y: 625 }],
    mesa: [{ x: 410, y: 850 }, { x: 560, y: 820 }, { x: 540, y: 690 }, { x: 390, y: 700 }],
  },
};

/** Time de uma posição na tela: 0 = o meu. No 1×1 o time é a própria posição. */
const timeDa = (n, pos) => (n === 4 ? pos % 2 : pos);

/** O verso da arte não tem folga de sombra como a frente; o tamanho compensa. */
function tamanho(sprite, tex) {
  if (tex === versos?.azul || tex === versos?.vermelho) sprite.setSize(CARD_W * 1.05, CARD_H * 1.05);
  else sprite.setSize(FULL_W, FULL_H);
}

/** Carta na tela (sombra já vem assada na textura), com virada por escala. */
class CardView extends Container {
  constructor(texture) {
    super();
    const face = new Sprite(texture);
    face.anchor.set(0.5);
    tamanho(face, texture);
    this.addChild(face);
    this.face = face;
  }

  async flipTo(texture) {
    await anim.to(this, { scaleX: 0.02 }, 0.13, anim.Ease.inOut);
    this.face.texture = texture;
    tamanho(this.face, texture);
    await anim.to(this, { scaleX: this._base ?? 1 }, 0.16, anim.Ease.out);
  }

  setBase(s) { this._base = s; this.scale.set(s); }
}

export class Scene {
  static async create(canvas, jogadores = 2) {
    const app = new Application();
    await app.init({
      canvas,
      resizeTo: canvas.parentElement,            // o palco: a caixa com a proporção da arte
      antialias: true,
      preference: 'webgl',
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      backgroundAlpha: 0,
    });
    versos ??= { azul: await Assets.load(versoAzulUrl), vermelho: await Assets.load(versoVermelhoUrl) };
    return new Scene(app, jogadores);
  }

  constructor(app, jogadores = 2) {
    this.app = app;
    this.n = jogadores;
    this.lay = LAYOUT[jogadores];
    const DECK = this.lay.deck;
    this.root = new Container();
    app.stage.addChild(this.root);

    this.deckLayer = new Container();
    this.tableLayer = new Container();
    this.hands = Array.from({ length: this.n }, () => new Container());
    this.root.addChild(this.deckLayer, this.tableLayer, ...[...this.hands].reverse());

    this.cards = this.hands.map(() => []);      // CardViews na mão de cada posição
    this.played = this.hands.map(() => null);
    /** Trocado por quem hospeda a cena: recebe o índice da carta tocada. */
    this.onPlay = (indice) => indice;
    this.playable = false;

    for (let i = 0; i < 3; i++) {                // maço decorativo
      const s = new Sprite(versos.vermelho);
      s.anchor.set(0.5);
      tamanho(s, versos.vermelho);
      s.scale.set(s.scale.x * 0.7, s.scale.y * 0.7);
      s.position.set(DECK.x - i * 2, DECK.y - i * 3);
      s.rotation = -0.06 + i * 0.02;
      this.deckLayer.addChild(s);
    }

    app.ticker.add((t) => anim.update(Math.min(t.deltaMS / 1000, 0.05)));
    this.resize();
    app.renderer.on('resize', () => this.resize());
  }

  resize() {
    const s = Math.min(this.app.screen.width / W, this.app.screen.height / H);
    this.root.scale.set(s);
    this.root.position.set(
      (this.app.screen.width - W * s) / 2,
      (this.app.screen.height - H * s) / 2,
    );
  }

  // --------------------------------------------------------------- posições

  slot(player, i, n) {
    const base = this.lay.mao[player];
    const k = i - (n - 1) / 2;
    // a sua mão abre em leque grande; as dos outros ficam encavaladas, como na arte
    const spread = player === 0 ? 150 : 38;
    return { x: base.x + k * spread, y: base.y + (player === 0 ? Math.abs(k) * 10 : 0), rot: k * (player === 0 ? 0.08 : 0.1) };
  }

  relayout(player) {
    const list = this.cards[player];
    list.forEach((c, i) => {
      const p = this.slot(player, i, list.length);
      anim.to(c, { x: p.x, y: p.y, rotation: p.rot }, 0.25);
    });
  }

  // ------------------------------------------------------------- animações

  /** Distribui 3 pra cada, vira a carta do meio e devolve quando tudo assentou. */
  async deal(playerCards, vira, manilhaR) {
    this.clearAll();
    const DECK = this.lay.deck;
    const seq = [];
    for (let i = 0; i < 3; i++) {
      for (let player = 0; player < this.n; player++) {
        const cv = new CardView(timeDa(this.n, player) === 0 ? versos.azul : versos.vermelho);
        cv.setBase(player === 0 ? MINHA_MAO : MAO_OUTROS);
        cv.position.set(DECK.x, DECK.y);
        cv.rotation = -0.4;
        this.hands[player].addChild(cv);
        this.cards[player].push(cv);
        const p = this.slot(player, i, 3);
        const delay = (i * this.n + player) * 0.07;
        seq.push(anim.to(cv, { x: p.x, y: p.y, rotation: p.rot }, 0.34, anim.Ease.out, { delay })
          .then(async () => {
            if (player === 0) {
              await cv.flipTo(cardTexture(playerCards[i], playerCards[i].r === manilhaR));
              cv.card = playerCards[i];
              cv.index = i;
              this.bindCard(cv);
            }
          }));
      }
    }
    await Promise.all(seq);

    this.vira = new CardView(versos.vermelho);
    this.vira.setBase(0.62);
    this.vira.position.set(DECK.x, DECK.y);
    this.deckLayer.addChild(this.vira);
    await anim.to(this.vira, { x: DECK.x + 6, y: DECK.y - 10, rotation: 0.5 }, 0.28);
    await this.vira.flipTo(cardTexture(vira, false));
  }

  bindCard(cv) {
    cv.eventMode = 'static';
    cv.cursor = 'pointer';
    const base = cv.y;
    cv.on('pointerover', () => { if (this.playable) anim.to(cv, { y: base - 26 }, 0.15); });
    cv.on('pointerout', () => { if (this.playable) anim.to(cv, { y: base }, 0.15); });
    cv.on('pointertap', () => { if (this.playable) this.onPlay(this.cards[0].indexOf(cv)); });
  }

  setPlayable(v) {
    this.playable = v;
    for (const c of this.cards[0]) c.alpha = v ? 1 : 0.82;
  }

  /** Leva a carta da mão até a mesa, em arco. */
  async play(player, index, card, manilhaR) {
    const list = this.cards[player];
    const cv = list.splice(index, 1)[0];
    if (!cv) return;
    this.hands[player].removeChild(cv);
    this.tableLayer.addChild(cv);
    this.played[player] = cv;
    this.relayout(player);

    const jitter = (Math.random() - 0.5) * (this.n === 4 ? 16 : 34);
    const alvo = this.lay.mesa[player];
    const target = { x: alvo.x + jitter, y: alvo.y };
    if (player !== 0) {
      const p = anim.to(cv, { x: target.x, y: target.y, rotation: (Math.random() - 0.5) * 0.24 }, 0.34);
      cv._base = NA_MESA;
      anim.to(cv, { scaleY: NA_MESA }, 0.34);
      await cv.flipTo(cardTexture(card, card.r === manilhaR));
      await p;
    } else {
      await Promise.all([
        anim.to(cv, { x: target.x, y: target.y, rotation: (Math.random() - 0.5) * 0.2 }, 0.3),
        anim.to(cv, { scaleX: NA_MESA, scaleY: NA_MESA }, 0.3),
      ]);
      cv._base = NA_MESA;
    }
  }

  /**
   * Brilho na carta vencedora e recolhimento da vaza. `winner` é o lado (0 =
   * você/sua dupla, 1 = adversários, -1 = empate); `destaque` é a posição da
   * carta que ganhou — no 1×1 é o próprio lado.
   */
  async collect(winner, destaque = winner) {
    const cards = this.played.filter(Boolean);
    if (!cards.length) return;
    if (winner >= 0 && this.played[destaque]) {
      const c = this.played[destaque];
      this.tableLayer.setChildIndex(c, this.tableLayer.children.length - 1);
      await anim.to(c, { scale: (c._base ?? 1) * 1.16 }, 0.16, anim.Ease.back);
      await anim.to(c, { scale: c._base ?? 1 }, 0.16);
    }
    // a vaza vai pro lado de quem ganhou: o seu (embaixo) ou o dos adversários (em cima)
    const to = winner === 0 ? { x: 180, y: 1000 }
      : winner === 1 ? { x: W / 2, y: 470 }
        : { x: W / 2, y: H / 2 };
    await Promise.all(cards.map((c) => anim.to(c,
      winner < 0 ? { alpha: 0, scale: 0.5 } : { x: to.x, y: to.y, rotation: 0.8, alpha: 0.2 },
      0.4, anim.Ease.inOut)));
    for (const c of cards) c.destroy();
    this.played = this.hands.map(() => null);
  }

  clearAll() {
    anim.clear();
    for (let p = 0; p < this.n; p++) {
      for (const c of this.cards[p]) c.destroy();
      this.cards[p] = [];
    }
    for (const c of this.played) c?.destroy();
    this.played = this.hands.map(() => null);
    this.vira?.destroy();
    this.vira = null;
  }
}
