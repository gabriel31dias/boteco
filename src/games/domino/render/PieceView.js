import Phaser from 'phaser';
import { TILE_L, TILE_W } from './textures.js';

/**
 * Uma peça na tela: sombra + corpo + dois grupos de pips (ou o verso).
 *
 * O corpo tem luz assada de cima, então a peça NUNCA é rotacionada em 180°:
 * ela troca de lado os pips. Assim a iluminação continua coerente em toda a
 * mesa. `rotation` só é usada em animação (viagem, giro da carroça).
 */
export class PieceView extends Phaser.GameObjects.Container {
  constructor(scene, a = 0, b = 0) {
    super(scene, 0, 0);
    this.a = a;
    this.b = b;
    this.orient = 'h';
    this.flip = false;
    this.faceDown = false;
    this.lift = 0;

    this.shadow = scene.add.image(0, 0, 'shadow-h').setAlpha(0.45);
    this.body = scene.add.image(0, 0, 'tile-h');
    this.pipA = scene.add.image(-TILE_W / 2, 0, 'pip-0');
    this.pipB = scene.add.image(TILE_W / 2, 0, 'pip-0');
    this.tint = scene.add.image(0, 0, 'tile-h').setVisible(false);
    this.add([this.shadow, this.body, this.pipA, this.pipB, this.tint]);
    this.setFace(a, b);
    this.applyLift(0);
  }

  setFace(a, b) {
    this.a = a;
    this.b = b;
    this.pipA.setTexture(`pip-${a}`);
    this.pipB.setTexture(`pip-${b}`);
    return this;
  }

  setFaceDown(down) {
    this.faceDown = down;
    this.pipA.setVisible(!down);
    this.pipB.setVisible(!down);
    this.refreshTextures();
    return this;
  }

  /** Menor giro (em graus, com sinal) entre dois ângulos lógicos. */
  static shortest(from, to) {
    let d = (((to - from) % 360) + 540) % 360 - 180;
    return d;
  }

  /** angleDeg lógico da corrente: 0/90/180/270. */
  setLayoutAngle(angleDeg) {
    const a = ((angleDeg % 360) + 360) % 360;
    this.layoutAngle = a;
    this.orient = a === 90 || a === 270 ? 'v' : 'h';
    this.flip = a === 180 || a === 270;
    this.rotation = 0;
    this.refreshTextures();
    return this;
  }

  setOrient(o) {
    this.orient = o;
    this.refreshTextures();
    return this;
  }

  refreshTextures() {
    const v = this.orient === 'v';
    this.body.setTexture(this.faceDown ? (v ? 'back-v' : 'back-h') : v ? 'tile-v' : 'tile-h');
    this.shadow.setTexture(v ? 'shadow-v' : 'shadow-h');
    this.tint.setTexture(v ? 'tile-v' : 'tile-h');
    const d = TILE_W / 2;
    const s = this.flip ? -1 : 1;
    if (v) { this.pipA.setPosition(0, -d * s); this.pipB.setPosition(0, d * s); }
    else { this.pipA.setPosition(-d * s, 0); this.pipB.setPosition(d * s, 0); }
    this.applyLift(this.lift);
    return this;
  }

  /**
   * 0 = pousada (sombra curta e dura), 1 = na mão do jogador
   * (sombra grande e difusa). É o que dá a sensação de tirar a peça da mesa.
   */
  applyLift(t) {
    this.lift = t;
    const dist = 5 + t * 26;
    // a sombra cai sempre para baixo no MUNDO, mesmo com o container girado
    const r = this.rotation;
    this.shadow.setPosition(dist * Math.sin(r), dist * Math.cos(r));
    this.shadow.setAlpha(0.42 - t * 0.16);
    this.shadow.setScale(1 + t * 0.10);
    return this;
  }

  /** Escurece/realça a peça sem tapar os pips (jogável x não jogável). */
  setDim(on) {
    this.body.setTint(on ? 0xcfc7bb : 0xffffff);
    this.pipA.setAlpha(on ? 0.82 : 1);
    this.pipB.setAlpha(on ? 0.82 : 1);
    return this;
  }

  /** Realce quente para "peça recém-jogada" / "sua vez". */
  setHighlight(alpha) {
    if (alpha <= 0) { this.tint.setVisible(false); return this; }
    this.tint.setVisible(true).setTint(0xffe08a).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD);
    return this;
  }

  /** Meia-largura ocupada no eixo maior, em px de textura. */
  static get L() { return TILE_L; }
  static get W() { return TILE_W; }
}
