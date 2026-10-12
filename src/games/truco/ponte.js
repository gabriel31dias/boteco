import { wait } from './render/anim.js';
import { sound } from './sound.js';

const NOME = { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' };

/**
 * Ponte entre o servidor e a cena Pixi. A engine do truco devolve EVENTOS
 * ('play', 'round', 'raise'...), e é isso que o servidor repassa: aqui eles
 * viram animação, em fila, porque cada uma é assíncrona e não pode atropelar a
 * seguinte.
 */
export class Ponte {
  constructor(scene, assento, { onBanner }) {
    this.scene = scene;
    this.assento = assento;
    this.n = scene.n ?? 2;
    this.meuTime = assento % 2;         // placar, vaza e mão são do time
    this.onBanner = onBanner ?? (() => {});
    this.fila = [];
    this.rodando = false;
    this.meuIndice = 0;      // índice da carta que EU baixei, pra cena tirar a certa
    this.manilha = null;
  }

  /** Assento → posição na tela: 0 sou eu, e a vez gira pelas seguintes. */
  pos(assento) { return (assento - this.assento + this.n) % this.n; }

  /** Lado do vencedor pra cena: 0 = meu time, 1 = adversários, -1 = empate. */
  lado(time) { return time === null || time < 0 ? -1 : (time === this.meuTime ? 0 : 1); }

  quem(assento) {
    if (assento === this.assento) return 'VOCÊ';
    return this.n === 4 && assento % 2 === this.meuTime ? 'SEU PARCEIRO' : 'ADVERSÁRIO';
  }

  /** Enfileira o estado novo; a fila garante uma animação por vez. */
  aplicar(estado) {
    this.fila.push(estado);
    if (!this.rodando) this.rodar();
  }

  async rodar() {
    this.rodando = true;
    while (this.fila.length) {
      const estado = this.fila.shift();
      // eslint-disable-next-line no-await-in-loop
      await this.animar(estado);
    }
    this.rodando = false;
  }

  async animar(estado) {
    this.manilha = estado.manilha;
    // Rede de segurança: se a cena está vazia mas o servidor diz que tenho
    // cartas, distribui sem animação. Cobre reconexão e evento perdido.
    const temDeal = (estado.eventos ?? []).some((e) => e.t === 'deal');
    if (!temDeal && !this.scene.cards[0].length && estado.mao.length && estado.fase !== 'handEnd') {
      await this.scene.deal(estado.mao, estado.vira, estado.manilha);
    }
    for (const e of estado.eventos ?? []) {
      switch (e.t) {
        case 'deal':
          sound.deal();
          await this.scene.deal(estado.mao, estado.vira, estado.manilha);
          if (e.special === 'ferro') this.onBanner('MÃO DE FERRO');
          break;
        case 'play': {
          const meu = e.player === this.assento;
          sound.play();
          await this.scene.play(this.pos(e.player), meu ? this.meuIndice : 0, e.card, estado.manilha);
          break;
        }
        case 'round': {
          await wait(0.35);
          const lado = this.lado(e.winner);
          // `seat` é quem jogou a carta vencedora; sem ele (1×1 antigo) é o próprio lado.
          await this.scene.collect(lado, e.seat == null || e.seat < 0 ? lado : this.pos(e.seat));
          break;
        }
        case 'raise':
          sound.truco();
          this.onBanner(`${NOME[e.to]}!`, this.pos(e.player));   // posição: o balão sai de quem pediu
          await wait(0.7);
          break;
        case 'run':
          this.onBanner(`${this.quem(e.player)} CORREU`, this.pos(e.player));
          await wait(0.7);
          break;
        case 'onzeRun':
          this.onBanner(`${this.quem(e.player)} CORREU DA MÃO DE ONZE`);
          await wait(0.7);
          break;
        case 'onze':
          this.onBanner('MÃO DE ONZE');
          await wait(0.6);
          break;
        case 'handEnd': {
          const ganhei = e.winner === this.meuTime;
          await this.scene.collect(this.lado(e.winner));
          if (e.winner === null) this.onBanner('EMPATE — sem pontos');
          else {
            (ganhei ? sound.win() : sound.lose());
            this.onBanner(this.n === 4
              ? (ganhei ? `+${e.points} PRA SUA DUPLA` : `+${e.points} PROS ADVERSÁRIOS`)
              : (ganhei ? `+${e.points} PRA VOCÊ` : `+${e.points} PRO ADVERSÁRIO`));
          }
          await wait(0.9);
          break;
        }
        default:
          break;
      }
    }
    // Só libera as cartas quando a fila esvaziou: clicar no meio da animação
    // mandaria índice de uma mão que já mudou.
    const minhaVez = estado.fase === 'play' && estado.vez === this.assento && !this.fila.length;
    this.scene.setPlayable(minhaVez);
  }
}
