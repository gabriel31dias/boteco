/**
 * Sons de Castelos em Guerra, sintetizados na hora (Web Audio), sem arquivo pra baixar:
 * disparo de cada herói, explosão (abafada quando é o Cavador), pedra caindo, gemido de
 * dano, sino da vez, tique do relógio e as fanfarras de fim.
 */
let ctx = null;
let mestre = null;
let ruido = null;
let mudo = false;

export function destravar() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    mestre = ctx.createGain();
    mestre.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();   // rajada de 15 tiros não estoura
    comp.threshold.value = -18; comp.ratio.value = 6;
    mestre.connect(comp).connect(ctx.destination);
    ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const pronto = () => ctx && !mudo && ctx.state === 'running';

function chiado({ dur, de, ate = de, vol = 0.5, tipo = 'lowpass', atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = ruido;
  f.type = tipo; f.frequency.setValueAtTime(de, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, ate), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(mestre);
  src.start(t, Math.random()); src.stop(t + dur);
}

function nota({ freq, ate = freq, dur, vol = 0.2, tipo = 'triangle', atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = tipo; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, ate), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(mestre);
  o.start(t); o.stop(t + dur);
}

export const som = {
  alternarMudo() { mudo = !mudo; return mudo; },
  get mudo() { return mudo; },
  tiro(heroi) {
    if (!pronto()) return;
    if (heroi === 'metralha') { chiado({ dur: 0.12, de: 3000, ate: 900, vol: 0.18, tipo: 'bandpass' }); return; }
    if (heroi === 'cavador') { chiado({ dur: 0.5, de: 600, ate: 2400, vol: 0.3, tipo: 'bandpass' }); return; }
    chiado({ dur: heroi === 'bombardeiro' ? 0.45 : 0.6, de: 1400, ate: 120, vol: 0.55 });
    nota({ freq: heroi === 'bombardeiro' ? 110 : 160, ate: 40, dur: 0.35, vol: 0.4, tipo: 'sine' });
  },
  boom(tam = 1, abafado = false) {
    if (!pronto()) return;
    chiado({ dur: 0.5 + tam * 0.5, de: abafado ? 500 : 2200, ate: 60, vol: Math.min(0.9, 0.35 + tam * 0.35) });
    nota({ freq: 90, ate: 30, dur: 0.4 + tam * 0.3, vol: 0.5, tipo: 'sine' });
    chiado({ dur: 0.35, de: 4000, ate: 1500, vol: 0.08, tipo: 'highpass', atraso: 0.12 });   // pedrinhas
  },
  cava() { if (pronto()) chiado({ dur: 0.4, de: 300, ate: 1200, vol: 0.25, tipo: 'bandpass' }); },
  dano() { if (pronto()) { nota({ freq: 260, ate: 140, dur: 0.22, vol: 0.18, tipo: 'sawtooth' }); nota({ freq: 520, ate: 300, dur: 0.12, vol: 0.06, tipo: 'square' }); } },
  vez() { if (pronto()) { nota({ freq: 880, dur: 0.25, vol: 0.12 }); nota({ freq: 1320, dur: 0.3, vol: 0.08, atraso: 0.1 }); } },
  tique() { if (pronto()) nota({ freq: 1500, dur: 0.05, vol: 0.06, tipo: 'square' }); },
  vitoria() { if (pronto()) [523, 659, 784, 1047].forEach((f, i) => nota({ freq: f, dur: 0.35, vol: 0.16, atraso: i * 0.14 })); },
  derrota() { if (pronto()) [392, 330, 262, 196].forEach((f, i) => nota({ freq: f, dur: 0.4, vol: 0.14, atraso: i * 0.16 })); },
  parar() {},
  desligar() {},
};
