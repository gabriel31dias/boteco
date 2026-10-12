/**
 * Efeitos do pôquer, sintetizados (nenhum arquivo): ruído filtrado pra carta
 * e ficha, seno pra UI. ponytail: WebAudio direto, igual ao truco.
 */
class Sound {
  enabled = true;
  ctx = null;

  pronto() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  ruido(dur, freq, vol = 0.4, atraso = 0) {
    const c = this.pronto(); if (!c) return;
    const t = c.currentTime + atraso;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  tom(freq, dur, vol = 0.15, atraso = 0, tipo = 'sine') {
    const c = this.pronto(); if (!c) return;
    const t = c.currentTime + atraso;
    const o = c.createOscillator(); o.type = tipo; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur);
  }

  carta(atraso = 0) { this.ruido(0.08, 2500, 0.35, atraso); }
  ficha(qtd = 3) { for (let i = 0; i < qtd; i++) this.ruido(0.05, 5200 + i * 300, 0.3, i * 0.045); }
  check() { this.ruido(0.06, 300, 0.6); this.ruido(0.06, 300, 0.6, 0.12); }   // duas batidinhas na mesa
  fold() { this.ruido(0.18, 1200, 0.25); }
  allin() { this.ficha(8); this.tom(110, 0.6, 0.2, 0, 'sawtooth'); }
  suaVez() { this.tom(880, 0.12); this.tom(1320, 0.18, 0.12, 0.1); navigator.vibrate?.(40); }
  tick() { this.tom(1000, 0.05, 0.08); }
  vitoria() { [523, 659, 784, 1047].forEach((f, i) => this.tom(f, 0.35, 0.18, i * 0.12, 'triangle')); }
}

export const sound = new Sound();
