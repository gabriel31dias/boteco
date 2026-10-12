/**
 * Efeitos sonoros sintetizados (nenhum asset): ruído filtrado para cartas,
 * seno para UI. ponytail: WebAudio direto, sem AudioManager.
 */
class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.last = 0;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  blip({ freq = 800, dur = 0.06, gain = 0.3, type = 'noise', q = 6 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.last < 0.012) return;          // throttle de colisões em rajada
    this.last = t;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    g.connect(this.master);

    if (type === 'noise') {
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      src.connect(f); f.connect(g); src.start(t); src.stop(t + dur);
    } else {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      o.connect(g); o.start(t); o.stop(t + dur);
    }
  }

  deal() { this.blip({ freq: 2200 + Math.random() * 600, dur: 0.07, gain: 0.16, q: 2 }); }
  play() { this.blip({ freq: 900 + Math.random() * 300, dur: 0.09, gain: 0.22, q: 2 }); }
  flip() { this.blip({ freq: 1500, dur: 0.08, gain: 0.18, q: 3 }); }
  truco() { this.blip({ freq: 140, dur: 0.35, gain: 0.45, q: 1.2 }); }
  win() { this.blip({ type: 'sine', freq: 880, dur: 0.35, gain: 0.25 }); }
  lose() { this.blip({ type: 'sine', freq: 220, dur: 0.35, gain: 0.22 }); }
  tap() { this.blip({ type: 'sine', freq: 660, dur: 0.07, gain: 0.14 }); }
}

export const sound = new Sound();
