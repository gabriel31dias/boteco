import { ponto, desgira } from './gira.js';
import { BALL, SHOT, TABLE, AIM_LEVELS } from './config.js';
import { CORES as CORES_BOLA } from './bolas.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { applyCueStrike } from './physics/CuePhysics.js';
import { GameState, State, saveSettings } from './game/GameState.js';
import { TurnManager } from './game/TurnManager.js';
import { Renderer } from './render.js';
import { sound } from './sound.js';
import { mulberry32 } from './game/rack.js';
import { modoDe, recolocar } from './game/modos.js';

// Relógio da tacada. 30s dá tempo de mirar sem deixar a mesa parada; o
// contador só aparece no terço final pra não pressionar a jogada inteira.
const TEMPO_TACADA = 30;
const AVISO = 10;

const HEAD_SPOT = -TABLE.playWidth / 4;
const MAX_DT = 0.05;
// Câmera lenta: a física roda com o relógio mais devagar, então as trajetórias
// e a força da tacada são exatamente as mesmas — só dá pra acompanhar a bola.
// Baixar SHOT.maxSpeed também deixaria lento, mas encurtaria a tacada: a saída
// ficaria fraca e a bola não cruzaria a mesa.
const RITMO = 0.81;
const PULL_GRAB = 0.55;   // até onde atrás da branca conta como "pegar o taco" (m)
const PULL_LARGURA = 0.07; // meia-largura da faixa do taco que conta como pegar (m)
const PULL_FULL = 0.32;   // arrasto que equivale a 100% de força (m)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const $ = (sel) => document.querySelector(sel);

/**
 * A mesa. Não sabe de lobby, de conta nem de dinheiro: recebe a partida pronta
 * (semente, assento, nomes), joga, e avisa quem terminou.
 */
export class Sinuca {
  constructor(renderer, { net, seed, seat, players, onFinish, onExit, modo }) {
    this.modo = modoDe(modo);   // bola 8, 9, 10, sinuca brasileira ou snooker (game/modos.js)
    this.state = new GameState();
    this.world = new PhysicsWorld();
    this.turns = new TurnManager(this.state, this.modo);
    this.renderer = renderer;

    this.angle = Math.PI / 2;
    this.power = 0;
    this.spinX = 0;
    this.spinY = 0;
    this.phase = State.MENU;
    this.pendingShot = null;
    this.placementValid = true;
    this.hintsLeft = 2;

    this.net = net ?? null;       // sem net = 2 jogadores no mesmo aparelho
    this.seat = seat ?? null;
    this.onFinish = onFinish ?? (() => {});
    this.onExit = onExit ?? (() => {});
    this.myPotted = 0;            // bolas que eu encaçapei (alimenta a missão)
    this.myTurn = true;
    this.waitingSnapshot = false; // resolvi a tacada do outro, falta o estado dele
    this.pendingSnapshot = null;
    this.turnTimer = null;
    this.restante = 0;      // segundos da vez atual
    this.segNaTela = -1;

    this.cueBall = this.world.addBall(0, HEAD_SPOT, 0);
    this.cueBall.number = 0;
    for (const [i, n] of this.modo.bolas.entries()) {
      const b = this.world.addBall(i + 1, 0, 0);
      b.number = n;
      b.visual = this.modo.visual(n);
    }

    this.bindPhysics();
    this.bindInput();
    this.bindNet();
    $('#menu-btn')?.addEventListener('click', () => this.onExit());

    this.ticker = (ticker) => this.tick(Math.min(ticker.deltaMS / 1000, MAX_DT));
    this.renderer.app.ticker.add(this.ticker);
    sound.enabled = this.state.settings.sound !== false;
    const som = $('#som');
    som?.classList.toggle('mudo', !sound.enabled);
    som?.addEventListener('click', () => {
      sound.enabled = this.state.settings.sound = !sound.enabled;
      saveSettings(this.state.settings);
      som.classList.toggle('mudo', !sound.enabled);
    });
    // 2D: gira a mesa (deitada ↔ em pé) e lembra da escolha
    if (typeof this.state.settings.mesaEmPe === 'boolean') renderer.setEmPe(this.state.settings.mesaEmPe);
    $('#camera')?.addEventListener('click', () => {
      const r = this.renderer;
      const agora = r.world.rotation !== 0;
      this.state.settings.mesaEmPe = !agora;
      saveSettings(this.state.settings);
      r.setEmPe(!agora);
    });
    this.start(seed, players);
  }

  /** Solta tudo: sem isso, o StrictMode do React deixa duas mesas rodando. */
  destroy() {
    this.renderer.app.ticker.remove(this.ticker);
    clearTimeout(this.turnTimer);
    clearTimeout(this._toast);
    for (const el of [$('#banner'), $('#toast')]) if (el) clearInterval(el._digita);
    for (const off of this.offNet ?? []) off();
    this.renderer.destroy();
  }

  bindNet() {
    if (!this.net) return;
    this.offNet = [
      this.net.on('shot', (shot) => this.applyShot(shot)),
      this.net.on('resolved', (snap) => { this.pendingSnapshot = snap; this.applyPendingSnapshot(); }),
    ];
  }

  get level() { return AIM_LEVELS[this.state.settings.aim] || AIM_LEVELS.normal; }

  bindPhysics() {
    this.world.on('ballBall', (a, b, speed) => {
      this.turns.onBallBall(a, b, speed);
      if (speed > 2.5) {
        this.renderer.burst((a.position.x + b.position.x) / 2, (a.position.z + b.position.z) / 2,
          2, speed * 0.12);
      }
      sound.click(speed);
    });
    this.world.on('cushion', (ball, speed) => {
      this.turns.onCushion(ball);
      sound.cushion(speed);
    });
    this.world.on('pocket', (ball, index) => {
      this.turns.onPocket(ball);
      const p = this.world.pockets[index].center;
      this.renderer.burst(p.x, p.z, 10, 0.8);
      sound.pocket();
    });
  }

  // ------------------------------------------------------------------ partida

  start(seed, players) {
    const online = this.seat !== null;
    this.state.reset();
    if (players?.length === 2) {
      this.state.players[0].name = players[0].name;
      this.state.players[1].name = players[1].name;
    }
    this.waitingSnapshot = false;
    this.pendingSnapshot = null;
    this.esperandoEco = false;
    this.myPotted = 0;
    this.resetRack(online ? mulberry32(seed) : Math.random);
    this.state.breakDone = false;
    this.refreshHud();
    this.beginTurn(true);
  }

  resetRack(rand) {
    const { branca, bolas } = this.modo.rack(rand);
    this.cueBall.reset(branca.x, branca.z);
    for (const { n, x, z } of bolas) this.world.balls.find((b) => b.number === n).reset(x, z);
    this.angle = Math.PI / 2;
  }

  beginTurn(isBreak = false) {
    this.turnTimer = null;
    this.restante = TEMPO_TACADA;
    this.myTurn = this.seat === null || this.seat === this.state.current;
    this.phase = !this.myTurn ? State.REMOTE
      : this.state.ballInHand ? State.BALL_IN_HAND : State.AIMING;
    this.turns.begin(isBreak || !this.state.breakDone);
    this.power = 0;
    this.spinX = this.spinY = 0;
    this.drawSpin();
    this.setPowerUi(0);
    this.refreshHud();
    this.banner(this.phase === State.REMOTE
      ? `Vez de ${this.state.player.name}`
      : this.phase === State.BALL_IN_HAND
        ? 'Bola na mão — arraste a branca e solte'
        : (this.hintsLeft-- > 0 ? 'Puxe o taco atrás da branca e solte' : ''));
    $('#power').classList.toggle('off', this.phase !== State.AIMING);
    $('#spin').classList.toggle('off', this.phase !== State.AIMING);
  }

  shoot(power) {
    if (this.phase !== State.AIMING) return;
    this.phase = State.SHOOTING;
    this.banner('');
    $('#power').classList.add('off');
    $('#spin').classList.add('off');
    const shot = {
      angle: this.angle,
      power: clamp(power, SHOT.minPower, 1),
      spinX: this.spinX,
      spinY: this.spinY,
      cue: { x: this.cueBall.position.x, z: this.cueBall.position.z },
    };
    // Online o servidor devolve a tacada pros dois: mesmo caminho, mesmo timing.
    // Até o eco chegar nada se mexe, e sem essa trava o fim da tacada era
    // declarado ali (bolas paradas): com ping acima de ~0,2s a tacada saía
    // vazia aqui e o adversário via as bolas voltarem pro lugar.
    if (this.net) { this.esperandoEco = true; this.net.emit('shot', shot); }
    else this.applyShot(shot);
  }

  /** Carrega uma tacada (minha, ecoada, ou do adversário) e solta a física. */
  applyShot(shot) {
    // A tacada pode chegar durante a pausa entre turnos: quem tacou resolve
    // antes, então o beginTurn dele dispara antes do meu. Adianta o meu em vez
    // de deixar a tacada cair num turno que ainda não começou.
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.beginTurn(false); }
    this.esperandoEco = false;
    this.angle = shot.angle;
    this.spinX = shot.spinX;
    this.spinY = shot.spinY;
    this.cueBall.position.x = shot.cue.x;
    this.cueBall.position.z = shot.cue.z;
    this.cueBall.stop();
    this.state.ballInHand = false;
    this.phase = State.SHOOTING;
    this.pendingShot = { power: shot.power, delay: 0.06 };
  }

  executeShot() {
    const { power } = this.pendingShot;
    this.pendingShot = null;
    applyCueStrike(this.cueBall, {
      direction: { x: Math.sin(this.angle), y: 0, z: Math.cos(this.angle) },
      power,
      spinX: this.spinX,
      spinY: this.spinY,
      elevation: 0,   // ponytail: sem masse/elevação na visão 2D
    });
    sound.cue(power);
    this.power = 0;
    this.setPowerUi(0);
  }

  onShotResolved(result) {
    this.phase = State.RESOLVING;
    if (!this.myTurn) {           // tacada do outro: a verdade é o snapshot dele
      this.waitingSnapshot = true;
      this.applyPendingSnapshot();
      return;
    }
    if (result.shot.cueScratched) this.cueBall.reset(HEAD_SPOT, 0);
    if (result.respot?.length) recolocar(this.world, this.modo, result.respot);
    this.myPotted += result.shot.pocketed.filter((n) => n !== 8).length;
    if (this.net) this.net.emit('resolved', this.snapshot(result));
    this.finishShot(result);
  }

  finishShot(result) {
    if (result.gameOver) {
      this.state.winner = result.winner;
      this.finish(result);
      return;
    }
    if (result.foul) this.toast(`Falta · ${result.reason}`);
    else if (result.respot?.length && result.reason) this.toast(result.reason);
    else if (this.modo.pontuada && Math.max(...(result.pontos ?? [0])) > 0) this.toast(`+${Math.max(...result.pontos)} pontos`);
    else if (result.assigned) this.toast(`${this.state.players[this.state.current].name}: ${this.state.player.group}`);
    else if (result.continueTurn && result.shot.pocketed.length) this.toast('Boa! Continua');

    this.refreshHud();
    this.turnTimer = setTimeout(() => this.beginTurn(false), result.foul ? 900 : 550);
  }

  // ------------------------------------------------------------------- rede

  /**
   * Estado autoritativo do fim da tacada. A física é determinística, mas
   * Math.sin/cos não são bit-exatas entre engines: replay pro visual, snapshot
   * pra verdade.
   * ponytail: bolas por índice — o rack semeado garante a mesma numeração.
   */
  snapshot(result) {
    const s = this.state;
    return {
      balls: this.world.balls.map((b) => ({ x: b.position.x, z: b.position.z, pocketed: b.pocketed })),
      state: {
        current: s.current,
        pocketed: s.pocketed,
        ballInHand: s.ballInHand,
        open: s.open,
        groups: [s.players[0].group, s.players[1].group],
        pontos: s.pontos,
        fase: s.fase,
      },
      result,
    };
  }

  applySnapshot({ balls, state, result }) {
    balls.forEach((b, i) => {
      const body = this.world.balls[i];
      body.reset(b.x, b.z);
      if (b.pocketed) { body.pocketed = true; body.active = false; }
    });
    const s = this.state;
    s.current = state.current;
    s.pocketed = state.pocketed;
    s.ballInHand = state.ballInHand;
    s.open = state.open;
    s.players[0].group = state.groups[0];
    s.players[1].group = state.groups[1];
    if (state.pontos) s.pontos = state.pontos;
    if (state.fase !== undefined) s.fase = state.fase;
    this.finishShot(result);
  }

  /**
   * O snapshot pode chegar antes ou depois das bolas pararem aqui. Numa falta
   * por tempo não houve tacada nenhuma deste lado: aí o gatilho é estar parado
   * esperando a vez do outro.
   */
  applyPendingSnapshot() {
    if (!this.pendingSnapshot) return;
    const parado = this.phase === State.REMOTE && !this.world.anyMoving();
    if (!this.waitingSnapshot && !parado) return;
    const snap = this.pendingSnapshot;
    this.waitingSnapshot = false;
    this.pendingSnapshot = null;
    this.applySnapshot(snap);
  }

  finish(result) {
    sound.win();
    // Cada lado relata o vencedor pela SUA simulação; o servidor só paga
    // quando os dois dizem o mesmo.
    this.net?.emit('over', { winner: result.winner, potted: this.myPotted });
    this.onFinish({
      winner: result.winner,
      won: this.seat === null ? null : result.winner === this.seat,
      reason: result.reason || this.modo.motivo,
      names: this.state.players.map((p) => p.name),
    });
  }

  // -------------------------------------------------------------------- HUD

  refreshHud() {
    const s = this.state;
    for (let i = 0; i < 2; i++) {
      const el = $(`.player.p${i}`);
      el.classList.toggle('turn', s.current === i && this.phase !== State.MENU);
      el.querySelector('.name').textContent = s.players[i].name;
      const { score, bolas } = this.modo.placar(s, i);
      el.classList.toggle('pontos', !!this.modo.pontuada);   // snooker e brasileira: o placar é em pontos
      el.querySelector('.score').textContent = score;
      const lisa = (n) => this.modo.visual(n);
      // bola 8: o atlas das 15 bolas; as outras: bolinha da cor (com o número, se tiver)
      el.querySelector('.balls').innerHTML = bolas
        ? bolas.map(({ n, feita, vez }) => (this.modo.id === 'sinuca'
          ? `<i class="on ${feita ? 'done' : ''}" style="--n:${n - 1}"></i>`
          : `<i class="cor ${feita ? 'done' : ''} ${vez ? 'vez' : ''}" style="--c:${lisa(n)?.cor ?? CORES_BOLA[(n - 1) % 15]}">${lisa(n) ? '' : n}</i>`)).join('')
        : this.modo.pontuada ? '' : '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    }
  }

  /**
   * Escreve letra a letra. O que falta digitar fica no DOM invisível, ocupando
   * o espaço: sem isso a moldura cresceria a cada caractere. Texto puro, em nó
   * de texto — nome de jogador vem do servidor e não pode virar HTML.
   */
  digitar(el, text) {
    clearInterval(el._digita);   // timer por elemento: toast e banner digitam juntos
    el.textContent = '';
    if (!text) return;
    const linha = document.createElement('span');
    linha.className = 'txt';
    const feito = document.createTextNode('');
    const resto = document.createElement('i');
    resto.className = 'oculto';
    resto.textContent = text;
    linha.append(feito, resto);
    el.append(linha);
    let i = 0;
    el._digita = setInterval(() => {
      feito.textContent = text.slice(0, ++i);
      resto.textContent = text.slice(i);
      if (i >= text.length) clearInterval(el._digita);
    }, 18);
  }

  banner(text) {
    const el = $('#banner');
    this.digitar(el, text);
    // Reinicia a animação: trocar o texto sozinho não faz o CSS rodar de novo.
    el.classList.remove('pop');
    void el.offsetWidth;
    if (text) el.classList.add('pop');
  }

  toast(text) {
    const el = $('#toast');
    this.digitar(el, text);
    el.classList.add('show');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove('show'), 1500);
  }

  setPowerUi(p) {
    $('#power .fill').style.height = `${p * 100}%`;
    $('#power .knob').style.top = `calc(${(1 - p) * 100}% - 7px)`;
  }

  drawSpin() {
    const c = $('#spin canvas');
    const g = c.getContext('2d');
    const R = c.width / 2 - 6;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(10,22,36,.65)';
    g.beginPath(); g.arc(c.width / 2, c.height / 2, R + 5, 0, Math.PI * 2); g.fill();
    const sh = g.createRadialGradient(c.width / 2 - R * 0.3, c.height / 2 - R * 0.35, R * 0.1,
      c.width / 2, c.height / 2, R * 1.2);
    sh.addColorStop(0, '#ffffff'); sh.addColorStop(1, '#b9c4d0');
    g.fillStyle = sh;
    g.beginPath(); g.arc(c.width / 2, c.height / 2, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
    g.beginPath(); g.arc(c.width / 2, c.height / 2, R * SHOT.maxSpinOffset, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e2564a';
    g.beginPath();
    g.arc(c.width / 2 + this.spinX * R, c.height / 2 - this.spinY * R, R * 0.16, 0, Math.PI * 2);
    g.fill();
  }

  // ------------------------------------------------------------- bola na mão

  moveBallInHand(pt) {
    const hw = TABLE.playWidth / 2 - BALL.radius * 1.05;
    const hd = TABLE.playDepth / 2 - BALL.radius * 1.05;
    const x = clamp(pt.x, -hw, hw);
    const z = clamp(pt.z, -hd, hd);
    this.cueBall.position.x = x;
    this.cueBall.position.z = z;
    this.cueBall.stop();
    this.placementValid = this.isValidCuePosition(x, z);
  }

  isValidCuePosition(x, z) {
    const hw = TABLE.playWidth / 2 - BALL.radius;
    const hd = TABLE.playDepth / 2 - BALL.radius;
    if (Math.abs(x) > hw || Math.abs(z) > hd) return false;
    for (const p of this.world.pockets) {
      if (Math.hypot(x - p.center.x, z - p.center.z) < p.radius + BALL.radius * 0.6) return false;
    }
    for (const b of this.world.balls) {
      if (b === this.cueBall || !b.active || b.pocketed) continue;
      if (Math.hypot(x - b.position.x, z - b.position.z) < BALL.radius * 2.06) return false;
    }
    return true;
  }

  placeBallInHand() {
    if (!this.isValidCuePosition(this.cueBall.position.x, this.cueBall.position.z)) return;
    this.state.ballInHand = false;
    this.phase = State.AIMING;
    this.banner('');
    $('#power').classList.remove('off');
    $('#spin').classList.remove('off');
    sound.tap();
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const canvas = $('#game');
    let mode = null;
    let pullStart = 0;

    const at = (e) => { const p = ponto(e); return this.renderer.toWorld(p.x, p.y); };
    /** quanto o dedo está ATRÁS da branca, no eixo da mira (metros) */
    const behindOf = (p) => -((p.x - this.cueBall.position.x) * Math.sin(this.angle)
                            + (p.z - this.cueBall.position.z) * Math.cos(this.angle));

    const aimTo = (p) => {
      const dx = p.x - this.cueBall.position.x;
      const dz = p.z - this.cueBall.position.z;
      if (Math.hypot(dx, dz) < BALL.radius * 1.2) return;
      this.angle = Math.atan2(dx, dz);
    };

    canvas.addEventListener('pointerdown', (e) => {
      sound.resume();
      canvas.setPointerCapture(e.pointerId);
      const p = at(e);
      if (this.phase === State.BALL_IN_HAND) {
        mode = 'hand';
        this.moveBallInHand(p);
      } else if (this.phase === State.AIMING) {
        // pegar o taco (atrás da branca) = carregar a tacada; resto = mirar
        const dist = Math.hypot(p.x - this.cueBall.position.x, p.z - this.cueBall.position.z);
        const behind = behindOf(p);
        // Só "pega o taco" quem toca perto do próprio taco (faixa estreita no eixo da
        // mira) e não em cima de uma bola: antes qualquer toque atrás da branca
        // carregava a tacada, e não dava pra mirar numa bola que estivesse ali.
        const lateral = Math.abs((p.x - this.cueBall.position.x) * Math.cos(this.angle)
                               - (p.z - this.cueBall.position.z) * Math.sin(this.angle));
        const naBola = this.world.balls.some((bb) => bb !== this.cueBall && !bb.pocketed
          && Math.hypot(p.x - bb.position.x, p.z - bb.position.z) < BALL.radius * 1.6);
        if (behind > 0 && dist < PULL_GRAB && lateral < PULL_LARGURA && !naBola) {
          mode = 'pull';
          pullStart = behind;
        } else {
          mode = 'aim';
          aimTo(p);
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const p = at(e);
      if (mode === 'aim') aimTo(p);
      else if (mode === 'hand') this.moveBallInHand(p);
      else if (mode === 'pull') {
        this.power = clamp((behindOf(p) - pullStart) / PULL_FULL, 0, 1);
        this.setPowerUi(this.power);
      }
    });
    const end = () => {
      if (mode === 'hand') this.placeBallInHand();
      else if (mode === 'pull') {
        if (this.power > SHOT.minPower) this.shoot(this.power);
        else { this.power = 0; this.setPowerUi(0); }
      }
      mode = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // --- barra de força: arrasta para cima e solta para dar a tacada ---
    const bar = $('#power');
    let start = null;
    bar.addEventListener('pointerdown', (e) => {
      if (this.phase !== State.AIMING) return;
      sound.resume();
      bar.setPointerCapture(e.pointerId);
      start = ponto(e).y;
    });
    bar.addEventListener('pointermove', (e) => {
      if (start === null) return;
      const h = bar.querySelector('.track').clientHeight;
      this.power = clamp((start - ponto(e).y) / h, 0, 1);   // Boteco: puxa pra CIMA (o knob sobe junto)
      this.setPowerUi(this.power);
    });
    const release = () => {
      if (start === null) return;
      start = null;
      if (this.power > SHOT.minPower) this.shoot(this.power);
      else { this.power = 0; this.setPowerUi(0); }
    };
    bar.addEventListener('pointerup', release);
    bar.addEventListener('pointercancel', release);

    // --- widget de efeito ---
    const spin = $('#spin');
    let spinning = false;
    const setSpin = (e) => {
      const r = spin.getBoundingClientRect();
      const R = r.width / 2 - 6;
      const [dx, dy] = desgira(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
      let x = dx / R;
      let y = -dy / R;
      const m = Math.hypot(x, y);
      const max = SHOT.maxSpinOffset;
      if (m > max) { x = (x / m) * max; y = (y / m) * max; }
      this.spinX = x; this.spinY = y;
      this.drawSpin();
    };
    spin.addEventListener('pointerdown', (e) => {
      if (this.phase !== State.AIMING) return;
      sound.resume();
      spin.classList.add('open');
      spin.setPointerCapture(e.pointerId);
      spinning = true;
      setSpin(e);
    });
    spin.addEventListener('pointermove', (e) => { if (spinning) setSpin(e); });
    const spinEnd = () => { spinning = false; };
    spin.addEventListener('pointerup', spinEnd);
    spin.addEventListener('pointercancel', spinEnd);
    // fecha ao tocar fora
    document.addEventListener('pointerdown', (e) => {
      if (!spin.contains(e.target)) spin.classList.remove('open');
    }, true);
  }

  // ------------------------------------------------------------------- loop

  tick(dt) {
    this.update(dt);
    this.render(dt);
  }

  update(dt) {
    this.tiquetaque(dt);
    if (this.pendingShot) {
      this.pendingShot.delay -= dt;
      if (this.pendingShot.delay <= 0) this.executeShot();
    }
    if (this.phase === State.SHOOTING || this.world.anyMoving()) this.world.step(dt * RITMO);
    if (this.phase === State.SHOOTING && !this.pendingShot && !this.esperandoEco) {
      const result = this.turns.update(dt, this.world);
      if (result) this.onShotResolved(result);
    }
  }

  /**
   * Conta o tempo da vez e mostra o contador no fim. Só quem está jogando
   * declara a falta: o outro lado recebe pelo mesmo 'resolved' de uma tacada.
   */
  tiquetaque(dt) {
    const el = $('#relogio');
    const contando = this.state.winner === null &&
      (this.phase === State.AIMING || this.phase === State.BALL_IN_HAND || this.phase === State.REMOTE);
    if (!contando) {
      if (el && this.segNaTela !== -1) { el.className = ''; this.segNaTela = -1; }
      return;
    }
    this.restante = Math.max(0, this.restante - dt);
    const seg = Math.ceil(this.restante);
    if (el && seg !== this.segNaTela) {
      this.segNaTela = seg;
      el.textContent = `00:${String(seg).padStart(2, '0')}`;
      el.className = this.restante > AVISO ? '' : (seg <= 5 ? 'show urgente' : 'show');
    }
    if (this.restante === 0 && this.myTurn) this.faltaPorTempo();
  }

  faltaPorTempo() {
    const result = this.turns.timeout();
    this.phase = State.RESOLVING;
    if (this.net) this.net.emit('resolved', this.snapshot(result));
    this.finishShot(result);
  }

  render(dt) {
    const r = this.renderer;
    const aiming = this.phase === State.AIMING;
    r.syncBalls(this.world.balls, dt);
    if (aiming) r.drawAim(this.world, this.cueBall, this.angle, this.level);
    else { r.aim.clear(); r.ghost.visible = false; }
    r.drawCue(this.cueBall, this.angle, this.power, aiming);
    r.drawPlacement(this.cueBall.position, this.placementValid, this.phase === State.BALL_IN_HAND);
    r.updateFx(dt);
  }
}

