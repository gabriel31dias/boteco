import Phaser from 'phaser';
// Runs for the whole session and is never restarted, so menu <-> game never flickers.
import { palette, bus, settings } from './state.js';
import { ensureTextures, gradientTexture } from './fx.js';

export class BackgroundScene extends Phaser.Scene {
  constructor() { super({ key: 'Background', active: true }); }

  create() {
    ensureTextures(this);
    const { width: w, height: h } = this.scale;

    this.bg = this.add.image(0, 0, gradientTexture(this, `bg_${settings.theme}`, palette().bg))
      .setOrigin(0).setDisplaySize(w, h);

    // Soft abstract shapes drifting behind everything.
    this.blobs = [0, 1, 2, 3].map((i) => {
      const img = this.add.image(0, 0, 'blob').setBlendMode(Phaser.BlendModes.ADD);
      img.seed = { ox: [0.18, 0.85, 0.5, 0.12][i], oy: [0.22, 0.35, 0.86, 0.68][i], s: [1.0, 1.25, 0.85, 0.7][i] };
      return img;
    });

    // Ambient light pooled behind the board.
    this.halo = this.add.image(0, 0, 'blob').setBlendMode(Phaser.BlendModes.ADD);

    this.parts = this.add.particles(0, 0, 'dot', {
      lifespan: { min: 9000, max: 17000 },
      speedY: { min: -14, max: -42 },
      speedX: { min: -10, max: 10 },
      scale: { min: 0.05, max: 0.2 },
      alpha: { start: 0.5, end: 0 },
      frequency: 380,
      quantity: 1,
      maxAliveParticles: 44,
      blendMode: Phaser.BlendModes.ADD,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, h, w, 30) },
    });

    this.applyTheme();
    this.layout(w, h);

    this.tweens.add({
      targets: this.halo,
      alpha: { from: palette().haloAlpha * 0.6, to: palette().haloAlpha },
      duration: 6200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const onTheme = () => this.applyTheme();
    const onResize = (size) => this.layout(size.width, size.height);
    bus.on('theme', onTheme);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      bus.off('theme', onTheme);
      this.scale.off('resize', onResize);
    });

    // Background is scene 0 and auto-starts; the UI rides on top of it.
    this.scene.launch('Menu');
  }

  applyTheme() {
    const pal = palette();
    this.bg.setTexture(gradientTexture(this, `bg_${settings.theme}`, pal.bg));
    this.blobs.forEach((b, i) => b.setTint(pal.blobs[i % pal.blobs.length]).setAlpha(pal.blobAlpha));
    this.halo.setTint(pal.halo).setAlpha(pal.haloAlpha);
    this.parts.setParticleTint ? this.parts.setParticleTint(pal.particle) : (this.parts.particleTint = pal.particle);
  }

  layout(w, h) {
    const u = Math.min(w, h) / 100;
    this.bg.setDisplaySize(w, h);
    this.blobs.forEach((b) => {
      b.base = { x: w * b.seed.ox, y: h * b.seed.oy, d: u * 90 * b.seed.s, drift: u * 7 };
    });
    this.halo.setPosition(w / 2, h * 0.54).setDisplaySize(u * 150, u * 150);
    const zone = this.parts.emitZones?.[0];
    if (zone) zone.source.setTo(0, h + 10, w, 30);
    this.drift(0);
  }

  // ponytail: sine drift instead of tweens — survives resize without re-authoring tweens.
  drift() {
    const t = this.time.now / 1000;
    this.blobs.forEach((b, i) => {
      const p = i * 1.7;
      const d = b.base.d * (1 + Math.sin(t * 0.11 + p) * 0.09);
      b.setPosition(
        b.base.x + Math.sin(t * 0.07 + p) * b.base.drift * 2.2,
        b.base.y + Math.cos(t * 0.053 + p * 1.4) * b.base.drift * 1.6,
      );
      b.setDisplaySize(d, d);
    });
  }

  update() { this.drift(); }
}
