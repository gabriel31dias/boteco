import { girada } from './gira.js';
import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { BALL } from './config.js';
import { Bola, girar, mapaDeLuz } from './bolas.js';
import mesaUrl from './assets/sinuca/mesa.webp';
import tacoUrl from './assets/sinuca/taco.webp';
import miraUrl from './assets/sinuca/mira.webp';

// mesa.webp é a arte da mesa retificada (sem perspectiva) com o pano exatamente
// na área de jogo: 600 px por metro, centrada. As caçapas desenhadas batem com
// POCKET — se trocar a arte, confira isso antes de tudo.
const PX_M = 600;
let tex = null;

// Desenho em "unidades" (1 u = 1 cm). Pixi tesselaria círculos de raio 0.03
// como polígonos grosseiros; com números grandes as curvas saem lisas.
const U = 100;
const u = (m) => m * U;

const R = BALL.radius;                   // metros
// Caixa que a mesa ocupa na tela, medida nas artes de referência (fração da
// largura, da altura e o centro vertical). A HUD mora em volta dela.
const CAIXA = { deitada: [0.8, 0.72, 0.505], empe: [0.98, 0.71, 0.55] };
// Boteco: mesa deitada (e as bolas, que estão nela) 32% maior que a caixa acima (1,2 × 1,1).
const ZOOM_DEITADA = 1.32;
const ESTICA_LARGURA = 1.21;   // mesa deitada 21% mais larga (1,1 × 1,1; só na horizontal; bolas seguem redondas)
const REDUZ_DEITADA = 0.8;     // mesa deitada 20% menor na largura e na altura
const MARGEM_DEITADA = 0.05;   // fração da altura, em cima e embaixo
const ESTICA_ALTURA = 1.1;     // mesa deitada 10% mais alta (cresce pra baixo; bolas seguem redondas)
const DESCE_DEITADA = 0.05;    // mesa deitada desce 5% da altura da tela (longe do placar)

// A bola é desenhada no tamanho físico exato: a textura tem 10% de borda
// transparente (`pad`) e o `R * 2.2` cancela isso. No celular a mesa é pequena e
// o número não se lê, então trocamos um pouco de realismo por legibilidade.
// ponytail: passando disso as bolas se sobrepõem visivelmente no contato.
// Boteco: +10% a pedido (1,14 × 1,1).
const ESCALA_BOLA = 1.254;
// Boteco: no celular (toque) as bolas ficam mais 10% maiores, só no desenho.
const BOLA_MOBILE = matchMedia('(pointer: coarse)').matches ? 1.1 : 1;
const R_VIS = R * ESCALA_BOLA * BOLA_MOBILE;

/**
 * Render 2D em PixiJS v8 (WebGL). A cena é montada uma vez; o resize só ajusta
 * escala e posição do container raiz — nada é reconstruído.
 */
export class Renderer {
  static async create(canvas) {
    const app = new Application();
    await app.init({
      canvas,
      resizeTo: canvas.parentElement,    // o .sinuca: em pé ele vira uma coluna no meio
      antialias: true,
      preference: 'webgl',               // ponytail: webgpu ainda irregular em Android
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      backgroundAlpha: 0,
    });
    tex ??= {
      mesa: await Assets.load(mesaUrl),
      taco: await Assets.load(tacoUrl), mira: await Assets.load(miraUrl),
    };
    return new Renderer(app);
  }

  constructor(app) {
    this.app = app;
    this.world = new Container();
    app.stage.addChild(this.world);
    this.world.addChild(buildTable());

    this.shadows = new Container();
    this.ballLayer = new Container();
    this.aim = new Graphics();
    this.cue = buildCue();
    this.placement = new Graphics();
    this.fx = new Container();
    this.ghost = new Sprite(tex.mira);    // a mira da arte no lugar da bola fantasma
    this.ghost.anchor.set(0.5);
    this.ghost.setSize(u(R_VIS * 2.6));
    this.ghost.visible = false;
    this.world.addChild(this.shadows, this.aim, this.ghost, this.ballLayer, this.cue, this.placement, this.fx);

    this.shadowTex = radialTexture('rgba(0,0,0,0.55)');
    this.sparkTex = radialTexture('rgba(255,235,170,1)');
    this.emPe = null;
    this.luz = null;                      // mapa de luz das bolas; refeito se a mesa girar

    this.sprites = new Map();
    this.particles = [];
    this.resize();
    app.renderer.on('resize', () => this.resize());
  }

  /** Some com a app do Pixi: canvas, contexto WebGL e ticker. */
  destroy() {
    this.app.destroy(true, { children: true, texture: true });
  }

  /** Botão 2D: força a mesa em pé (true), deitada (false) ou segue a tela (null). */
  setEmPe(v) {
    this.emPe = v;
    this.resize();
  }

  resize() {
    // Em pé é um layout inteiro (classe .em-pe no .sinuca), não só a mesa girada:
    // a decisão olha a janela, e a área do jogo muda de tamanho junto.
    // ponytail: no Boteco a mesa é sempre deitada (igual ao desktop), também no celular em pé.
    // Pra voltar a seguir a tela: `this.emPe ?? innerWidth < innerHeight`.
    const emPe = this.emPe ?? false;
    const host = this.app.canvas.parentElement;
    if (host && host.classList.contains('em-pe') !== emPe) {
      host.classList.toggle('em-pe', emPe);
      this.app.resize();                  // o Pixi só mede sozinho no resize da janela
    }
    const w = this.app.screen.width, h = this.app.screen.height;
    const [cw, ch, cy] = emPe ? CAIXA.empe : CAIXA.deitada;
    const mw = tex.mesa.width / PX_M, md = tex.mesa.height / PX_M;
    this.scale = emPe ? Math.min((w * cw) / md, (h * ch) / mw) : Math.min((w * cw) / mw, (h * ch) / md) * ZOOM_DEITADA;
    // Boteco: deitada, a mesa deixa 5% de margem em cima e embaixo (ocupa no máximo 90% da altura, centrada).
    if (!emPe) this.scale = Math.min(this.scale, (h * (1 - 2 * MARGEM_DEITADA)) / md);
    if (!emPe) this.scale *= REDUZ_DEITADA;   // Boteco: mesa (e bolas) 20% menor que o encaixe acima
    // Boteco: deitada, a mesa estica só na largura (eixo x do mundo = comprimento da mesa).
    // ponytail: esticar o mundo também alarga as bolas e o taco no mesmo tanto.
    // Altura (eixo z = profundidade da mesa) também estica, crescendo só pra baixo:
    // a borda de cima fica onde estava, longe do placar. Bolas compensam (syncBalls).
    this.ky = emPe ? 1 : ESTICA_ALTURA;
    this.kx = emPe ? 1 : ESTICA_LARGURA;
    this.world.scale.set((this.scale / U) * (emPe ? 1 : ESTICA_LARGURA), (this.scale / U) * this.ky);
    this.ghostBase ??= this.ghost.scale.x;
    this.ghost.scale.set(this.ghostBase / this.kx, this.ghostBase / this.ky);
    // Em pé o triângulo fica em cima e a branca embaixo, como na arte vertical.
    this.world.rotation = emPe ? -Math.PI / 2 : 0;
    this.world.position.set(w / 2, emPe ? h * cy : h * (0.5 + DESCE_DEITADA) + (md * this.scale * (this.ky - 1)) / 2);
  }

  /** tela → mundo em metros (mira e bola na mão) */
  toWorld(px, py) {
    // Girada: px/py já vêm de ponto() (sem giro) e o canvas começa no 0 da mesa.
    const r = girada() ? { left: 0, top: 0 } : this.app.canvas.getBoundingClientRect();   // em pé o canvas não começa no 0
    const p = this.world.toLocal({ x: px - r.left, y: py - r.top });
    return { x: p.x / U, z: p.y / U };
  }

  // ------------------------------------------------------------------ bolas

  /** Posição, sombra e o giro 3D de cada bola (ω da física × dt). */
  syncBalls(balls, dt = 0) {
    if (this.luz?.giro !== this.world.rotation) {
      this.luz = mapaDeLuz(this.world.rotation);
      for (const s of this.sprites.values()) s.sujo = true;
    }
    for (const b of balls) {
      let s = this.sprites.get(b);
      if (!s || s.bola.n !== b.number) {
        s?.sprite.destroy({ texture: true }); s?.shadow.destroy();
        const bola = new Bola(b.number);
        const sprite = new Sprite(Texture.from(bola.canvas));
        sprite.anchor.set(0.5);
        sprite.setSize(u(R_VIS * 2.2));
        const shadow = new Sprite(this.shadowTex);
        shadow.anchor.set(0.5);
        shadow.setSize(u(R_VIS * 3));
        shadow.alpha = 0.45;
        this.ballLayer.addChild(sprite);
        this.shadows.addChild(shadow);
        s = { sprite, shadow, bola, sujo: true, base: sprite.scale.x, baseSombra: shadow.scale.x };
        this.sprites.set(b, s);
      }
      const vis = b.active && !b.pocketed;
      s.sprite.visible = s.shadow.visible = vis;
      if (!vis) continue;
      const w = b.angularVelocity;
      if (dt > 0 && w && girar(s.bola.M, w.x, w.y, w.z, dt)) s.sujo = true;
      if (s.sujo) {
        s.bola.desenhar(this.luz);
        s.sprite.texture.source.update();
        s.sujo = false;
      }
      s.sprite.position.set(u(b.position.x), u(b.position.z));
      // bola redonda mesmo com a mesa esticada (desfaz o kx/ky do mundo)
      s.sprite.scale.set(s.base / (this.kx ?? 1), s.base / (this.ky ?? 1));
      s.shadow.scale.set(s.baseSombra / (this.kx ?? 1), s.baseSombra / (this.ky ?? 1));
      s.shadow.position.set(u(b.position.x + R * 0.16), u(b.position.z + R * 0.2));
    }
  }

  // ------------------------------------------------------------------- mira

  drawAim(world, cue, angle, level) {
    const g = this.aim;
    g.clear();
    this.ghost.visible = false;
    if (!cue.active || cue.pocketed) return;
    const dir = { x: Math.sin(angle), z: Math.cos(angle) };
    const hit = world.raycastBall(cue.position, dir, cue);

    if (hit) {
      const gx = cue.position.x + dir.x * hit.distance;
      const gz = cue.position.z + dir.z * hit.distance;
      dotted(g, cue.position.x, cue.position.z, gx, gz, 0xffffff, 0.6);
      if (level.ghost) {
        this.ghost.visible = true;
        this.ghost.position.set(u(gx), u(gz));
      }

      let ox = hit.ball.position.x - gx, oz = hit.ball.position.z - gz;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const cut = dir.x * ox + dir.z * oz;

      if (level.targetLine > 0) {
        const len = level.targetLine * Math.max(0.25, cut);
        g.moveTo(u(hit.ball.position.x), u(hit.ball.position.z))
          .lineTo(u(hit.ball.position.x + ox * len), u(hit.ball.position.z + oz * len))
          .stroke({ width: u(R * 0.13), color: 0xffd66e, alpha: 0.8, cap: 'round' });
      }
      const tx = dir.x - ox * cut, tz = dir.z - oz * cut;
      const tl = Math.hypot(tx, tz);
      if (level.cueLine > 0 && tl > 0.02) {
        const len = level.cueLine * tl;
        g.moveTo(u(gx), u(gz))
          .lineTo(u(gx + (tx / tl) * len), u(gz + (tz / tl) * len))
          .stroke({ width: u(R * 0.1), color: 0xbfe6ff, alpha: 0.6, cap: 'round' });
      }
    } else {
      let p = { x: cue.position.x, z: cue.position.z };
      let d = dir;
      let bounces = level.cushion;
      for (let i = 0; ; i++) {
        const c = world.raycastCushion(p, d);
        if (!c) { dotted(g, p.x, p.z, p.x + d.x * 0.5, p.z + d.z * 0.5, 0xffffff, 0.5); break; }
        dotted(g, p.x, p.z, c.point.x, c.point.z, 0xffffff, i === 0 ? 0.6 : 0.3);
        if (bounces-- <= 0) break;
        const dn = d.x * c.normal.x + d.z * c.normal.z;
        d = { x: d.x - 2 * dn * c.normal.x, z: d.z - 2 * dn * c.normal.z };
        p = { x: c.point.x + d.x * 0.004, z: c.point.z + d.z * 0.004 };
      }
    }
  }

  drawCue(cue, angle, power, visible) {
    this.cue.visible = visible && cue.active && !cue.pocketed;
    if (!this.cue.visible) return;
    this.cue.position.set(u(cue.position.x), u(cue.position.z));
    // o taco fica atrás da branca, apontando para a direção de mira
    this.cue.rotation = Math.atan2(Math.cos(angle), Math.sin(angle)) + Math.PI;
    this.cue.children[0].x = u(R * (1.4 + power * 6.5));
  }

  drawPlacement(pos, valid, visible) {
    const g = this.placement;
    g.clear();
    if (!visible) return;
    g.circle(u(pos.x), u(pos.z), u(R * 1.6))
      .stroke({ width: u(R * 0.16), color: valid ? 0x2fd18c : 0xe2564a, alpha: 0.9 });
  }

  // -------------------------------------------------------------------- fx

  burst(x, z, n = 10, speed = 0.7) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(this.sparkTex);
      s.anchor.set(0.5);
      s.setSize(u(R * 0.8));
      s.position.set(u(x), u(z));
      this.fx.addChild(s);
      const a = Math.random() * Math.PI * 2;
      const v = u(speed) * (0.3 + Math.random());
      this.particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 });
    }
  }

  updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { p.s.destroy(); this.particles.splice(i, 1); continue; }
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.alpha = Math.max(0, p.life / 0.45);
      p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3;
    }
  }
}

// ---------------------------------------------------------------- construção

function buildTable() {
  const s = new Sprite(tex.mesa);
  s.anchor.set(0.5);
  s.setSize(u(tex.mesa.width / PX_M), u(tex.mesa.height / PX_M));
  return s;
}

function buildCue() {
  const c = new Container();
  const s = new Sprite(tex.taco);
  s.anchor.set(0, 0.5);
  const len = R * 30;
  // Boteco: taco 20% mais comprido; a grossura fica a mesma.
  s.setSize(u(len * 1.2), u(len * tex.taco.height / tex.taco.width));
  c.addChild(s);
  return c;
}

/** Linha pontilhada (Pixi não tem dash nativo). */
function dotted(g, x0, z0, x1, z1, color, alpha) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const step = R * 0.9;
  const n = Math.min(40, Math.floor(len / step));
  for (let i = 1; i <= n; i++) {
    const t = (i * step) / len;
    g.circle(u(x0 + dx * t), u(z0 + dz * t), u(R * 0.13));
  }
  g.fill({ color, alpha });
}

// ------------------------------------------------------- texturas (canvas 2D)

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function radialTexture(color) {
  const s = 64;
  const c = canvasOf(s, s);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, color);
  rg.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  return Texture.from(c);
}
