/**
 * Sons de Arqueiros do Céu (base: games/galinhas/som.js), sintetizados na hora
 * (Web Audio), mais o locutor (speechSynthesis em pt-BR). Nada pra baixar.
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

let rangido = null;

export const som = {
  /** Corda esticando: rangido que sobe com a carga (liga/desliga). */
  puxar(carga) {
    if (!pronto()) { rangido = null; return; }
    if (carga <= 0) { if (rangido) { rangido.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); rangido.o.stop(ctx.currentTime + 0.2); rangido = null; } return; }
    if (!rangido) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.Q.value = 6;
      g.gain.value = 0.0001;
      o.connect(f).connect(g).connect(mestre);
      o.start();
      rangido = { o, g, f };
    }
    const t = ctx.currentTime;
    rangido.o.frequency.setTargetAtTime(70 + carga * 90, t, 0.05);
    rangido.f.frequency.setTargetAtTime(600 + carga * 900, t, 0.05);
    rangido.g.gain.setTargetAtTime(0.025 + carga * 0.04, t, 0.05);
  },
  /** Soltou: estalo da corda + zunido da flecha. */
  soltar(carga = 1, v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 180 + carga * 120], [0.12, 90]], vol: 0.25 * v, onda: 'triangle' });
    estouro({ dur: 0.05, de: 2600, vol: 0.3 * v, tipo: 'bandpass', q: 2 });
    estouro({ dur: 0.35, de: 1800, ate: 500, vol: 0.12 * v * (0.5 + carga), tipo: 'bandpass', q: 1.5, atraso: 0.03 });
  },
  tunc(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.08, de: 900, ate: 200, vol: 0.4 * v });
    voz({ pontos: [[0, 320], [0.18, 260]], vol: 0.08 * v, onda: 'triangle', vibrato: 30 });   // a flecha tremendo
  },
  carne(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 600, ate: 120, vol: 0.5 * v });
    estouro({ dur: 0.18, de: 2200, ate: 700, vol: 0.18 * v, tipo: 'bandpass', q: 1, atraso: 0.02 });
  },
  cabeca() {
    if (!pronto()) return;
    [1568, 2093].forEach((f, i) => voz({ pontos: [[0, f], [0.3, f]], vol: 0.14, onda: 'sine', atraso: i * 0.05 }));
    estouro({ dur: 0.1, de: 4000, vol: 0.2, tipo: 'highpass' });
  },
  grito(agudo = 1, v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 300 * agudo], [0.12, 520 * agudo], [0.5, 140 * agudo]], vol: 0.16 * v, onda: 'sawtooth', vibrato: 18 });
  },
  explosao(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.8, de: 1200, ate: 50, vol: 0.7 * v });
    estouro({ dur: 0.25, de: 4000, ate: 800, vol: 0.25 * v, tipo: 'bandpass' });
  },
  gelo(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.4, de: 6000, ate: 2500, vol: 0.2 * v, tipo: 'highpass' });
    [2637, 3136, 3951].forEach((f, i) => voz({ pontos: [[0, f], [0.15, f]], vol: 0.05 * v, atraso: i * 0.04 }));
  },
  pulo(duplo = false) {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: duplo ? 1400 : 900, ate: 300, vol: 0.12, tipo: 'bandpass' });
  },
  pega() {
    if (!pronto()) return;
    [784, 1047, 1319].forEach((f, i) => voz({ pontos: [[0, f], [0.14, f]], vol: 0.13, onda: 'triangle', atraso: i * 0.08 }));
  },
  renasce() {
    if (!pronto()) return;
    voz({ pontos: [[0, 300], [0.3, 1200]], vol: 0.12, onda: 'triangle' });
  },
  bip(alto = false) {
    if (!pronto()) return;
    voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.45 : 0.15, alto ? 990 : 660]], vol: 0.22, onda: 'square' });
  },
  fanfarra() {
    if (!pronto()) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 }));
  },
  /** Locutor: uma fala por vez, no máximo a cada 1,4s. */
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1400) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.6; u.rate = 1.05; u.volume = 0.9;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) { window.speechSynthesis?.cancel(); som.puxar(0); } return mudo; },
};
