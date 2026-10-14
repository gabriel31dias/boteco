/**
 * Sons da Última Carta (base: games/galinhas/som.js), sintetizados na hora (Web
 * Audio), mais o locutor (speechSynthesis em pt-BR). Nada pra baixar.
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
  /** Carta deslizando (comprar, distribuir). */
  desliza(v = 1) { if (!pronto()) return; estouro({ dur: 0.12, de: 5200, ate: 2400, vol: 0.12 * v, tipo: 'bandpass', q: 0.9 }); },
  /** Carta batendo na mesa. */
  bate(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.07, de: 2600, ate: 900, vol: 0.32 * v, tipo: 'bandpass', q: 1.3 });
    estouro({ dur: 0.1, de: 380, ate: 120, vol: 0.28 * v });
  },
  embaralha() { if (!pronto()) return; for (let k = 0; k < 12; k++) estouro({ dur: 0.05, de: 3800, vol: 0.09, tipo: 'bandpass', q: 1.5, atraso: k * 0.045 }); },
  pula() { if (!pronto()) return; voz({ pontos: [[0, 520], [0.12, 240], [0.3, 520]], vol: 0.14, onda: 'square' }); },
  inverte() { if (!pronto()) return; voz({ pontos: [[0, 300], [0.25, 900]], vol: 0.12, onda: 'triangle' }); voz({ pontos: [[0, 900], [0.25, 300]], vol: 0.1, onda: 'triangle', atraso: 0.18 }); },
  mais(q = 2) {
    if (!pronto()) return;
    estouro({ dur: 0.5, de: 900, ate: 60, vol: 0.55 });
    voz({ pontos: [[0, 160], [0.4, 70]], vol: 0.25, onda: 'sawtooth' });
    if (q >= 4) estouro({ dur: 0.6, de: 3000, ate: 400, vol: 0.2, tipo: 'bandpass', atraso: 0.1 });
  },
  cor() { if (!pronto()) return; [523, 659, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.12, f]], vol: 0.1, onda: 'sine', atraso: i * 0.05 })); },
  ultima() { if (!pronto()) return; [784, 988, 1175, 1568].forEach((f, i) => voz({ pontos: [[0, f], [0.15, f]], vol: 0.15, onda: 'square', atraso: i * 0.07 })); },
  pego() { if (!pronto()) return; voz({ pontos: [[0, 700], [0.35, 200]], vol: 0.18, onda: 'sawtooth' }); },
  vez() { if (!pronto()) return; voz({ pontos: [[0, 880], [0.1, 1320]], vol: 0.1, onda: 'sine' }); },
  erro() { if (!pronto()) return; voz({ pontos: [[0, 200], [0.15, 150]], vol: 0.12, onda: 'square' }); },
  tique(alto = false) { if (!pronto()) return; estouro({ dur: 0.03, de: alto ? 3200 : 2200, vol: alto ? 0.28 : 0.16, tipo: 'bandpass', q: 6 }); },
  fanfarra() { if (!pronto()) return; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 })); },
  derrota() { if (!pronto()) return; [392, 349, 311, 262].forEach((f, i) => voz({ pontos: [[0, f], [0.3, f * 0.98]], vol: 0.15, onda: 'triangle', atraso: i * 0.25 })); },
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 900) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 1; u.rate = 1.1; u.volume = 0.95;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
