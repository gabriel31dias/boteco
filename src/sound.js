/**
 * Efeitos sonoros sintetizados (nenhum asset): ruído filtrado curto para as
 * batidas, seno para o UI. ponytail: WebAudio direto, sem AudioManager.
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

  click(speed) { this.blip({ freq: 1400 + Math.random() * 500, dur: 0.05, gain: Math.min(0.5, 0.06 + speed / 12) }); }
  cushion(speed) { this.blip({ freq: 320 + Math.random() * 120, dur: 0.09, gain: Math.min(0.4, 0.05 + speed / 16), q: 3 }); }
  pocket() { this.blip({ freq: 180, dur: 0.22, gain: 0.35, q: 1.5 }); }
  cue(power) { this.blip({ freq: 900, dur: 0.05, gain: 0.15 + power * 0.3 }); }
  tap() { this.blip({ type: 'sine', freq: 660, dur: 0.07, gain: 0.15 }); }
  win() { this.blip({ type: 'sine', freq: 880, dur: 0.4, gain: 0.25 }); }
}

export const sound = new Sound();
