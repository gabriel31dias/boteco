/**
 * Áudio 100% sintetizado (WebAudio). Nada de arquivo: o "CLACK" é ruído
 * filtrado + um corpo ressonante grave, o que soa como peça batendo na mesa
 * e permite variar material (feltro abafa, madeira é mais seco) e pan estéreo.
 */

const store = {
  get(k, d) { try { const v = localStorage.getItem('dr_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dr_' + k, JSON.stringify(v)); } catch {} },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfx = store.get('sfx', true);
    this.music = store.get('music', true);
    this.material = 'felt';
    this._musicNodes = null;
  }

  unlock() {
    try { this._unlock(); } catch { this.ctx = null; }
  }

  _unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.music) this.startMusic();
  }

  setSfx(on) { this.sfx = on; store.set('sfx', on); }
  setMusic(on) {
    this.music = on;
    store.set('music', on);
    on ? this.startMusic() : this.stopMusic();
  }
  setMaterial(m) { this.material = m; }

  _out(pan = 0) {
    const g = this.ctx.createGain();
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  _noiseBurst({ pan = 0, freq = 1800, q = 1.1, dur = 0.09, gain = 0.5, type = 'bandpass' }) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this._out(pan);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _body({ pan = 0, freq = 190, dur = 0.11, gain = 0.28, type = 'triangle' }) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
    const g = this._out(pan);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  }

  play(name, opt = {}) {
    if (!this.sfx || !this.ctx) return;
    try { this._play(name, opt); } catch {}
  }

  _play(name, opt = {}) {
    const pan = opt.pan || 0;
    const felt = this.material === 'felt';
    switch (name) {
      case 'clack':
        this._noiseBurst({ pan, freq: felt ? 1500 : 2400, q: 1.0, dur: felt ? 0.075 : 0.1, gain: 0.42 });
        this._body({ pan, freq: felt ? 170 : 230, dur: felt ? 0.08 : 0.13, gain: 0.22 });
        break;
      case 'clack-strong':
        this._noiseBurst({ pan, freq: felt ? 1700 : 2600, q: 0.9, dur: 0.12, gain: 0.6 });
        this._body({ pan, freq: felt ? 140 : 190, dur: 0.18, gain: 0.34 });
        break;
      case 'tick':
        this._noiseBurst({ pan, freq: 3600, q: 2.2, dur: 0.028, gain: 0.20 });
        break;
      case 'tok':
        this._noiseBurst({ pan, freq: 620, q: 2.4, dur: 0.07, gain: 0.30 });
        this._body({ pan, freq: 110, dur: 0.1, gain: 0.16, type: 'sine' });
        break;
      case 'slide':
        this._noiseBurst({ pan, freq: 900, q: 0.6, dur: 0.16, gain: 0.07, type: 'lowpass' });
        break;
      case 'win':
        [0, 4, 7, 12].forEach((s, i) => setTimeout(() => this._chime(523.25 * Math.pow(2, s / 12), 0.9), i * 95));
        break;
      case 'lose':
        [0, -3, -8].forEach((s, i) => setTimeout(() => this._chime(392 * Math.pow(2, s / 12), 1.1, 0.16), i * 150));
        break;
      case 'ui':
        this._noiseBurst({ pan, freq: 2600, q: 3, dur: 0.03, gain: 0.14 });
        this._body({ pan, freq: 620, dur: 0.06, gain: 0.06, type: 'sine' });
        break;
    }
  }

  _chime(freq, dur = 1, gain = 0.2) {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const g = this._out(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [m, a] of [[1, 1], [2, 0.3], [3, 0.12]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * m;
      const og = this.ctx.createGain();
      og.gain.value = a;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  /** Distribuição: uma rajada de clacks curtos e desalinhados. */
  deal(n = 14, spread = 900) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.play('tick', { pan: (Math.random() - 0.5) * 1.2 }), (i / n) * spread + Math.random() * 40);
    }
  }

  // ----- música ambiente: pad lento + nota solta ocasional (opcional) -----
  startMusic() {
    if (!this.ctx || this._musicNodes) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.055, this.ctx.currentTime + 3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    lp.connect(g); g.connect(this.master);
    lfo.start();

    const oscs = [];
    const chords = [[110, 164.81, 196], [98, 146.83, 174.61], [123.47, 146.83, 185], [110, 130.81, 164.81]];
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = chords[0][i];
      const og = this.ctx.createGain();
      og.gain.value = 0.34 - i * 0.06;
      o.detune.value = (i - 1) * 6;
      o.connect(og); og.connect(lp);
      o.start();
      oscs.push(o);
    }
    let step = 0;
    const timer = setInterval(() => {
      step = (step + 1) % chords.length;
      const t = this.ctx.currentTime;
      oscs.forEach((o, i) => o.frequency.linearRampToValueAtTime(chords[step][i], t + 2.5));
    }, 8000);
    this._musicNodes = { g, oscs, lfo, timer, lp };
  }

  stopMusic() {
    const m = this._musicNodes;
    if (!m) return;
    this._musicNodes = null;
    clearInterval(m.timer);
    const t = this.ctx.currentTime;
    m.g.gain.cancelScheduledValues(t);
    m.g.gain.setValueAtTime(m.g.gain.value, t);
    m.g.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => { m.oscs.forEach((o) => o.stop()); m.lfo.stop(); }, 1500);
  }
}

export const audio = new AudioEngine();
export const settings = store;
