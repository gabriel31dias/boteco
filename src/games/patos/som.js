/**
 * Sons da Caçada de Patos (base: games/galinhas/som.js), sintetizados na hora
 * (Web Audio), mais o locutor (speechSynthesis em pt-BR). Nada pra baixar.
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
  /** BUM da espingarda (os outros, mais longe). */
  tiro(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.08, de: 5000, ate: 1500, vol: 0.45 * v, tipo: 'bandpass', q: 0.7 });
    estouro({ dur: 0.55, de: 1100, ate: 50, vol: 0.7 * v });
    voz({ pontos: [[0, 120], [0.25, 45]], vol: 0.25 * v, onda: 'sine' });
  },
  /** Clec-clac: a bomba da espingarda / o cartucho caindo. */
  bomba(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.04, de: 2600, vol: 0.25 * v, tipo: 'bandpass', q: 3, atraso: 0.12 });
    estouro({ dur: 0.05, de: 1800, vol: 0.25 * v, tipo: 'bandpass', q: 3, atraso: 0.22 });
  },
  recarga() {
    if (!pronto()) return;
    for (let k = 0; k < 5; k++) estouro({ dur: 0.04, de: 2200, vol: 0.18, tipo: 'bandpass', q: 4, atraso: k * 0.16 });
    estouro({ dur: 0.06, de: 1500, vol: 0.3, tipo: 'bandpass', q: 2, atraso: 0.9 });
  },
  vazio() { if (!pronto()) return; estouro({ dur: 0.03, de: 3000, vol: 0.2, tipo: 'bandpass', q: 6 }); },
  /** Quack: o pato grasnando (tom pelo tipo). */
  quack(agudo = 1, v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 420 * agudo], [0.05, 560 * agudo], [0.16, 300 * agudo]], vol: 0.09 * v, onda: 'sawtooth', vibrato: 30 });
    estouro({ dur: 0.14, de: 900 * agudo, vol: 0.05 * v, tipo: 'bandpass', q: 4 });
  },
  acerto(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 700, ate: 200, vol: 0.35 * v });
    estouro({ dur: 0.35, de: 4000, ate: 1500, vol: 0.12 * v, tipo: 'highpass' });   // penas
    voz({ pontos: [[0, 700], [0.25, 260]], vol: 0.1 * v, onda: 'sawtooth', vibrato: 25, atraso: 0.03 });   // o último quack
  },
  ponto(n = 1) { if (!pronto()) return; [880, 1175, 1568].slice(0, Math.min(3, n)).forEach((f, i) => voz({ pontos: [[0, f], [0.1, f]], vol: 0.11, onda: 'triangle', atraso: i * 0.06 })); },
  splash() {
    if (!pronto()) return;
    estouro({ dur: 0.6, de: 2400, ate: 300, vol: 0.32, tipo: 'bandpass', q: 0.6 });
    estouro({ dur: 0.18, de: 500, ate: 120, vol: 0.22 });
  },
  cachorro() {
    if (!pronto()) return;
    for (let k = 0; k < 4; k++) voz({ pontos: [[0, 500 - k * 30], [0.12, 260]], vol: 0.12, onda: 'square', atraso: k * 0.16 });   // rá-rá-rá
  },
  apito() { if (!pronto()) return; voz({ pontos: [[0, 1800], [0.5, 1850]], vol: 0.12, onda: 'square', vibrato: 60 }); },
  bip(alto = false) { if (!pronto()) return; voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.35 : 0.12, alto ? 990 : 660]], vol: 0.16, onda: 'square' }); },
  fanfarra() { if (!pronto()) return; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 })); },
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.8; u.rate = 1.05; u.volume = 0.95;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
