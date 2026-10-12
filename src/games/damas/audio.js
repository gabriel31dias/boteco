// Audio 100% sintetizado. Nenhum sample: cada som e montado com osciladores,
// ruido filtrado e envelopes, para soar como material solido em madeira/marmore.

export class Audio {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.musicOn = true;
    this.noiseBuf = null;
    this.timer = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // reverb curto de sala, gerado (sem arquivo de impulso)
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.6, 2.6);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.30;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 1;
    this.sfx.connect(this.master); this.sfx.connect(this.verb);

    this.music = ctx.createGain(); this.music.gain.value = 0.0;
    const mFilter = ctx.createBiquadFilter();
    mFilter.type = 'lowpass'; mFilter.frequency.value = 1500; mFilter.Q.value = 0.4;
    this.musicFilter = mFilter;
    this.music.connect(mFilter); mFilter.connect(this.master); mFilter.connect(this.verb);

    // buffer de ruido reutilizado (object pooling do audio)
    const n = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _impulse(dur, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 200));
      }
    }
    return buf;
  }

  get t() { return this.ctx.currentTime; }

  // rajada de ruido com passa-banda: o "corpo" de um objeto solido batendo
  _noise({ freq = 900, q = 3, dur = 0.09, gain = 0.4, type = 'bandpass', at = 0.002, sweep = 0 }) {
    const ctx = this.ctx, t0 = this.t;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  _tone({ freq = 440, dur = 0.25, type = 'sine', gain = 0.2, at = 0.005, delay = 0, glide = 0, dest = null }) {
    const ctx = this.ctx, t0 = this.t + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _duck(amount = 0.5, dur = 0.35) {
    if (!this.musicOn) return;
    const g = this.music.gain, t0 = this.t;
    const cur = g.value;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(cur, t0);
    g.linearRampToValueAtTime(cur * amount, t0 + 0.04);
    g.linearRampToValueAtTime(this.MUSIC_VOL, t0 + dur);
  }

  MUSIC_VOL = 0.11;

  play(name, arg = 0) {
    if (!this.on) return;
    this.resume();
    if (!this.ctx) return;
    switch (name) {
      case 'select':   // dedo tocando a peca
        this._noise({ freq: 2600, q: 1.6, dur: 0.045, gain: 0.10 });
        this._tone({ freq: 1180, dur: 0.07, gain: 0.045, type: 'sine' });
        break;
      case 'deselect':
        this._noise({ freq: 1700, q: 2, dur: 0.05, gain: 0.06 });
        break;
      case 'lift':     // peca saindo do tabuleiro
        this._noise({ freq: 1400, q: 1.2, dur: 0.07, gain: 0.07, sweep: 0.5 });
        break;
      case 'slide':    // deslizando sobre a pedra
        this._noise({ freq: 700, q: 0.8, dur: 0.19, gain: 0.055, sweep: 0.55 });
        break;
      case 'land': {   // impacto solido: estalo + corpo grave
        const p = 1 + arg * 0.06;
        this._noise({ freq: 820 * p, q: 4.5, dur: 0.085, gain: 0.30 });
        this._noise({ freq: 3200, q: 1.2, dur: 0.028, gain: 0.10 });
        this._tone({ freq: 148 * p, dur: 0.13, gain: 0.20, type: 'sine', glide: 0.55 });
        this._tone({ freq: 296 * p, dur: 0.07, gain: 0.07, type: 'triangle', glide: 0.6 });
        break;
      }
      case 'edge':     // peca encostando na moldura metalica
        this._noise({ freq: 1900, q: 6, dur: 0.14, gain: 0.16 });
        this._tone({ freq: 2350, dur: 0.32, gain: 0.05, type: 'sine' });
        this._tone({ freq: 3510, dur: 0.22, gain: 0.025, type: 'sine' });
        break;
      case 'capture': {
        const p = Math.pow(1.09, Math.min(arg, 6));
        this._duck(0.55, 0.4);
        this._noise({ freq: 1500 * p, q: 2.2, dur: 0.10, gain: 0.34 });
        this._noise({ freq: 620, q: 5, dur: 0.13, gain: 0.24 });
        this._tone({ freq: 190 * p, dur: 0.20, gain: 0.24, type: 'sine', glide: 0.45 });
        this._tone({ freq: 520 * p, dur: 0.13, gain: 0.09, type: 'triangle', glide: 0.5, delay: 0.01 });
        break;
      }
      case 'combo':    // reforco a cada salto extra da sequencia
        this._tone({ freq: 660 * Math.pow(1.1225, Math.min(arg, 8)), dur: 0.28, gain: 0.10, type: 'triangle' });
        this._tone({ freq: 990 * Math.pow(1.1225, Math.min(arg, 8)), dur: 0.20, gain: 0.05, type: 'sine', delay: 0.03 });
        break;
      case 'promote': {
        this._duck(0.4, 0.9);
        this._noise({ freq: 5200, q: 0.9, dur: 0.5, gain: 0.06, sweep: 2.4 });
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
          this._tone({ freq: f, dur: 0.9 - i * 0.08, gain: 0.11, type: 'sine', delay: i * 0.055, at: 0.01 });
          this._tone({ freq: f * 2, dur: 0.5, gain: 0.03, type: 'sine', delay: i * 0.055 });
        });
        break;
      }
      case 'victory':
        this._duck(0.25, 2.4);
        [[261.6, 0], [329.6, 0.10], [392, 0.20], [523.3, 0.30], [659.3, 0.42]].forEach(([f, d]) => {
          this._tone({ freq: f, dur: 2.0, gain: 0.10, type: 'triangle', delay: d, at: 0.03 });
          this._tone({ freq: f * 2, dur: 1.2, gain: 0.035, type: 'sine', delay: d + 0.02 });
        });
        break;
      case 'defeat':
        this._duck(0.25, 2.4);
        [[349.2, 0], [277.2, 0.16], [233.1, 0.32], [174.6, 0.5]].forEach(([f, d]) => {
          this._tone({ freq: f, dur: 1.8, gain: 0.10, type: 'sine', delay: d, at: 0.04 });
        });
        break;
      case 'draw':
        this._duck(0.35, 1.6);
        this._tone({ freq: 329.6, dur: 1.4, gain: 0.09, type: 'sine', at: 0.05 });
        this._tone({ freq: 392, dur: 1.4, gain: 0.07, type: 'sine', delay: 0.18, at: 0.05 });
        break;
      case 'coin': {   // tilintar metalico de moeda caindo
        const p = Math.pow(1.06, arg % 7) * (0.9 + Math.random() * 0.25);
        this._noise({ freq: 5200 * p, q: 3, dur: 0.05, gain: 0.10 });
        [2637, 3520, 5274].forEach((f, i) => this._tone({
          freq: f * p, dur: 0.34 - i * 0.08, gain: 0.055 / (i + 1), type: 'sine', delay: i * 0.012 }));
        break;
      }
      case 'button':
        this._noise({ freq: 3000, q: 2.2, dur: 0.035, gain: 0.08 });
        this._tone({ freq: 1560, dur: 0.06, gain: 0.05, type: 'sine' });
        break;
      case 'menu':     // transicao de tela
        this._noise({ freq: 380, q: 0.6, dur: 0.42, gain: 0.10, sweep: 4.5 });
        this._tone({ freq: 196, dur: 0.5, gain: 0.05, type: 'sine', glide: 1.5 });
        break;
      case 'warn':     // aviso discreto (captura obrigatoria ignorada)
        this._noise({ freq: 520, q: 3, dur: 0.09, gain: 0.10 });
        this._tone({ freq: 165, dur: 0.14, gain: 0.07, type: 'sine', glide: 0.85 });
        break;
    }
  }

  // --- trilha ambiente --------------------------------------------------
  // Pad de cordas + piano esparso em pentatonica. Sempre abaixo dos efeitos.
  startMusic() {
    this.resume();
    if (!this.ctx || this.timer) return;
    this.musicOn = true;
    const g = this.music.gain;
    g.cancelScheduledValues(this.t);
    g.setValueAtTime(0.0001, this.t);
    g.linearRampToValueAtTime(this.on ? this.MUSIC_VOL : 0, this.t + 3);

    const PENTA = [220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33];
    const PAD = [[110, 164.81, 220], [98, 146.83, 196], [123.47, 185, 246.94], [87.31, 130.81, 174.61]];
    let step = 0;

    const tick = () => {
      if (!this.ctx) return;
      const chord = PAD[step % PAD.length];
      chord.forEach((f, i) => {
        this._tone({ freq: f, dur: 8.5, gain: 0.055, type: 'sawtooth', at: 2.4, dest: this.music });
        this._tone({ freq: f * 1.005, dur: 8.5, gain: 0.04, type: 'sawtooth', at: 2.6, delay: 0.05, dest: this.music });
        if (i === 0) this._tone({ freq: f / 2, dur: 8, gain: 0.05, type: 'sine', at: 2, dest: this.music });
      });
      // notas soltas, tipo piano
      const notes = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < notes; i++) {
        const f = PENTA[(Math.random() * PENTA.length) | 0];
        const d = 0.6 + Math.random() * 5.5;
        this._tone({ freq: f, dur: 2.6, gain: 0.045, type: 'triangle', at: 0.008, delay: d, dest: this.music });
        this._tone({ freq: f * 2, dur: 1.1, gain: 0.012, type: 'sine', at: 0.006, delay: d, dest: this.music });
      }
      // respiracao do filtro
      const fq = this.musicFilter.frequency;
      fq.cancelScheduledValues(this.t);
      fq.linearRampToValueAtTime(900 + Math.random() * 1400, this.t + 4);
      step++;
    };
    tick();
    this.timer = setInterval(tick, 7600);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ctx) {
      const g = this.music.gain;
      g.cancelScheduledValues(this.t);
      g.setValueAtTime(g.value, this.t);
      g.linearRampToValueAtTime(0.0001, this.t + 0.8);
    }
  }

  setEnabled(v) {
    this.on = v;
    this.resume();
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(v ? 0.9 : 0.0001, this.t, 0.05);
    if (v) this.startMusic();
  }
}

export const audio = new Audio();
