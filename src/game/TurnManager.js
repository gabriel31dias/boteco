import { RulesEngine } from './RulesEngine.js';
import { groupOf } from './GameState.js';

const SETTLE_GRACE = 0.18;   // segundos de folga após a última bola parar
const FALTAS_WO = 2;         // faltas por tempo seguidas que entregam a partida

/**
 * Ciclo de uma tacada: registra os eventos da física, espera TUDO parar e só
 * então aplica as regras. Nunca libera outra tacada com bolas em movimento.
 */
export class TurnManager {
  constructor(state) {
    this.state = state;
    this.rules = new RulesEngine();
    this.shot = null;
    this.settleTimer = 0;
    this.semTacada = [0, 0];   // faltas por tempo seguidas de cada jogador
  }

  begin(isBreak) {
    this.shot = {
      isBreak,
      firstContact: null,
      pocketed: [],
      cueScratched: false,
      railAfterContact: false,
      cushionAfterContact: false,
      maxImpact: 0,
    };
    this.settleTimer = 0;
    this.state.player.stats.shots++;
  }

  onBallBall(a, b, speed) {
    if (!this.shot) return;
    if (this.shot.firstContact === null) {
      const other = a.number === 0 ? b : (b.number === 0 ? a : null);
      if (other) this.shot.firstContact = other.number;
    }
    this.shot.maxImpact = Math.max(this.shot.maxImpact, speed);
  }

  onCushion(ball) {
    if (!this.shot) return;
    if (this.shot.firstContact !== null) this.shot.railAfterContact = true;
  }

  onPocket(ball) {
    if (!this.shot) return;
    if (ball.number === 0) this.shot.cueScratched = true;
    else this.shot.pocketed.push(ball.number);
  }

  /** @returns {null|object} resultado quando a jogada termina */
  update(dt, world) {
    if (!this.shot) return null;
    if (world.anyMoving()) { this.settleTimer = 0; return null; }
    this.settleTimer += dt;
    if (this.settleTimer < SETTLE_GRACE) return null;
    return this.resolve();
  }

  resolve() {
    const s = this.state;
    const shot = this.shot;
    this.shot = null;

    const result = this.rules.evaluate(shot, s);
    const me = s.current;
    this.semTacada[me] = 0;   // tacou: a contagem de faltas por tempo zera

    for (const n of shot.pocketed) if (!s.pocketed.includes(n)) s.pocketed.push(n);
    if (result.assigned) {
      s.players[0].group = result.assigned[0];
      s.players[1].group = result.assigned[1];
      s.open = false;
    }
    const myGroup = s.players[me].group;
    s.players[me].stats.potted += shot.pocketed.filter(
      (n) => n !== 8 && (!myGroup || groupOf(n) === myGroup)).length;

    if (result.gameOver) {
      s.winner = result.winner;
      s.loseReason = result.reason;
      return { ...result, shot };
    }

    if (result.foul) {
      s.players[me].stats.fouls++;
      s.switchPlayer();
      s.ballInHand = true;
    } else if (!result.continueTurn) {
      s.switchPlayer();
      s.ballInHand = false;
    } else {
      s.ballInHand = false;
    }
    s.breakDone = true;
    return { ...result, shot };
  }

  /**
   * Falta sem tacada: o relógio da vez zerou. Mesma consequência de qualquer
   * outra falta — o adversário joga com bola na mão.
   */
  timeout() {
    const s = this.state;
    const me = s.current;
    s.players[me].stats.fouls++;
    this.semTacada[me]++;
    s.switchPlayer();
    s.ballInHand = true;
    s.breakDone = true;
    this.shot = null;
    // Duas seguidas sem tacar entrega a partida: senão dá pra segurar a mesa do
    // adversário pra sempre só deixando o relógio correr.
    const wo = this.semTacada[me] >= FALTAS_WO;
    if (wo) { s.winner = 1 - me; s.loseReason = 'Duas faltas por tempo seguidas'; }
    return {
      foul: true, continueTurn: false, assigned: null,
      reason: wo ? 'Duas faltas por tempo seguidas' : 'Tempo esgotado',
      gameOver: wo, winner: wo ? 1 - me : null,
      shot: { isBreak: false, pocketed: [], firstContact: null, cueScratched: false },
    };
  }
}
