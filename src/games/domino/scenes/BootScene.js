import Phaser from 'phaser';
import { buildPieceTextures } from '../render/textures.js';
import { theme, setTheme } from '../render/theme.js';
import { settings, audio } from '../audio/audio.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    setTheme(settings.get('theme', 'royalGreen'));
    buildPieceTextures(this, theme);
    audio.setMaterial(theme.material);
    // Sem menu: a partida já vem escolhida pelo lobby do app. Os dados da
    // cena de jogo vêm de quem iniciou o Phaser.
    this.scene.start('UI');
    this.scene.start('Game', this.game.registry.get('mp'));
  }
}
