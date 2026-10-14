/**
 * Sons da Forca (base: games/galinhas/som.js), sintetizados na hora (Web
 * Audio), mais o locutor (speechSynthesis em pt-BR). Nada pra baixar.
 * O navegador só libera áudio depois de um toque: `destravar()` no primeiro.
 */
let ctx = null;
let mestre = null;
let ruidoBuf = null;
let mudo = false;
let ultimaFala = 0;

export function destravar() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    mestre = ctx.createGain();
    mestre.gain.value = 0.5;
    mestre.connect(ctx.destination);
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const pronto = () => ctx && !mudo && ctx.state === 'running';

function estouro({ dur, de, ate = de, vol = 0.5, tipo = 'lowpass', q = 0.8, atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const src = ctx.createBufferSource();
  src.buffer = ruidoBuf;
  const f = ctx.createBiquadFilter();
  f.type = tipo; f.Q.value = q;
  f.frequency.setValueAtTime(de, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, ate), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(mestre);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** Oscilador com curva de frequência por pontos [[t, hz], ...] e vibrato opcional. */
function voz({ pontos, vol = 0.25, onda = 'sine', vibrato = 0, atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const o = ctx.createOscillator();
  o.type = onda;
  o.frequency.setValueAtTime(pontos[0][1], t);
  for (const [dt, hz] of pontos.slice(1)) o.frequency.exponentialRampToValueAtTime(hz, t + dt);
  const fim = pontos[pontos.length - 1][0];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.setValueAtTime(vol, t + fim * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + fim);
  if (vibrato) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 28; lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + fim + 0.05);
  }
  o.connect(g).connect(mestre);
  o.start(t); o.stop(t + fim + 0.05);
}

export const som = {
  tecla() {
    if (!pronto()) return;
    estouro({ dur: 0.04, de: 2400, vol: 0.18, tipo: 'bandpass', q: 3 });
  },
  certa(n = 1) {
    if (!pronto()) return;
    for (let k = 0; k < Math.min(4, n); k++) voz({ pontos: [[0, 784 * 2 ** (k / 6)], [0.16, 1047 * 2 ** (k / 6)]], vol: 0.13, onda: 'triangle', atraso: k * 0.07 });
  },
  errada() {
    if (!pronto()) return;
    voz({ pontos: [[0, 160], [0.25, 70]], vol: 0.22, onda: 'square' });
  },
  /** Corte: chiado rápido + baque seco. */
  corte() {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 6000, ate: 1500, vol: 0.3, tipo: 'highpass', q: 0.7 });
    estouro({ dur: 0.15, de: 500, ate: 90, vol: 0.45, atraso: 0.05 });
  },
  sangue() {
    if (!pronto()) return;
    estouro({ dur: 0.5, de: 1200, ate: 300, vol: 0.28, tipo: 'bandpass', q: 1.5 });
    for (let k = 0; k < 4; k++) estouro({ dur: 0.06, de: 900, vol: 0.12, tipo: 'bandpass', q: 3, atraso: 0.12 + k * 0.1 });
  },
  baque() {
    if (!pronto()) return;
    estouro({ dur: 0.18, de: 300, ate: 60, vol: 0.45 });
  },
  grito(v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 320], [0.1, 640], [0.7, 210]], vol: 0.17 * v, onda: 'sawtooth', vibrato: 22 });
  },
  estalo() {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 3000, vol: 0.6, tipo: 'bandpass', q: 2 });
    estouro({ dur: 0.6, de: 400, ate: 50, vol: 0.5, atraso: 0.05 });
    voz({ pontos: [[0, 90], [0.8, 40]], vol: 0.2, onda: 'sine', atraso: 0.05 });
  },
  tique(alto = false) {
    if (!pronto()) return;
    estouro({ dur: 0.03, de: alto ? 3200 : 2200, vol: alto ? 0.3 : 0.18, tipo: 'bandpass', q: 6 });
  },
  fanfarra() {
    if (!pronto()) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 }));
  },
  derrota() {
    if (!pronto()) return;
    [392, 349, 311, 262].forEach((f, i) => voz({ pontos: [[0, f], [0.3, f * 0.98]], vol: 0.16, onda: 'triangle', atraso: i * 0.25 }));
  },
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.7; u.rate = 1.0; u.volume = 0.9;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
