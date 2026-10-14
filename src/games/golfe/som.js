/**
 * Sons do Mini-golfe (base: games/galinhas/som.js), sintetizados na hora (Web
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

let rolando = null;

export const som = {
  /** O swing cortando o ar (antes do contato). */
  zunido(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.22, de: 900, ate: 3200, vol: 0.12 * v, tipo: 'bandpass', q: 1.6 });
  },
  /** TOC: o taco na bola. Mais forte, mais seco e mais alto. */
  tacada(forca = 0.5, v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 2600 + forca * 1800, vol: (0.35 + forca * 0.35) * v, tipo: 'bandpass', q: 4 });
    voz({ pontos: [[0, 820 + forca * 500], [0.07, 520]], vol: 0.18 * v, onda: 'triangle' });
    estouro({ dur: 0.09, de: 300, ate: 90, vol: 0.25 * v * forca, atraso: 0.005 });
  },
  /** Bola rolando: chiado baixinho que acompanha a velocidade (0 desliga). */
  rolar(vel) {
    if (!pronto()) { rolando = null; return; }
    if (vel <= 0.02) {
      if (rolando) { rolando.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); rolando.src.stop(ctx.currentTime + 0.3); rolando = null; }
      return;
    }
    if (!rolando) {
      const src = ctx.createBufferSource(); src.buffer = ruidoBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      src.connect(f).connect(g).connect(mestre); src.start();
      rolando = { src, f, g };
    }
    rolando.f.frequency.setTargetAtTime(300 + vel * 1600, ctx.currentTime, 0.05);
    rolando.g.gain.setTargetAtTime(Math.min(0.12, vel * 0.14), ctx.currentTime, 0.05);
  },
  tabela(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.08, de: 700, ate: 200, vol: 0.4 * v, tipo: 'bandpass', q: 2 });
    voz({ pontos: [[0, 240], [0.08, 160]], vol: 0.12 * v, onda: 'triangle' });
  },
  areia() {
    if (!pronto()) return;
    estouro({ dur: 0.35, de: 2400, ate: 700, vol: 0.32, tipo: 'bandpass', q: 0.8 });
  },
  /** A bola caindo no copo: tlim-tlim-tloc. */
  buraco() {
    if (!pronto()) return;
    [2200, 1900, 1650].forEach((f, i) => voz({ pontos: [[0, f], [0.05, f * 0.9]], vol: 0.14, onda: 'sine', atraso: i * 0.07 }));
    estouro({ dur: 0.12, de: 500, ate: 120, vol: 0.4, atraso: 0.22 });
    voz({ pontos: [[0, 180], [0.15, 110]], vol: 0.2, onda: 'sine', atraso: 0.22 });
  },
  beirada() {
    if (!pronto()) return;
    voz({ pontos: [[0, 2600], [0.12, 2300]], vol: 0.12, onda: 'sine' });
    estouro({ dur: 0.05, de: 4000, vol: 0.15, tipo: 'highpass' });
  },
  /** Torcida: um "uaaau" (vozes) com aplausos (muitos estalos curtos). */
  torcida(forca = 1) {
    if (!pronto()) return;
    for (let k = 0; k < 5; k++) voz({ pontos: [[0, 200 + k * 37], [0.25, 330 + k * 41], [1.1 * forca, 240 + k * 30]], vol: 0.035 * forca, onda: 'sawtooth', vibrato: 6, atraso: k * 0.03 });
    som.aplausos(1.6 * forca, forca);
  },
  aplausos(dur = 1.5, v = 1) {
    if (!pronto()) return;
    const n = Math.round(dur * 26);
    for (let k = 0; k < n; k++) estouro({ dur: 0.03, de: 1500 + Math.random() * 2500, vol: (0.05 + Math.random() * 0.08) * v * (1 - (k / n) * 0.7), tipo: 'bandpass', q: 1.2, atraso: Math.random() * dur });
  },
  /** Ooooh: a bola raspou. */
  lamento() {
    if (!pronto()) return;
    for (let k = 0; k < 4; k++) voz({ pontos: [[0, 300 + k * 30], [0.9, 190 + k * 20]], vol: 0.035, onda: 'sawtooth', vibrato: 5, atraso: k * 0.04 });
  },
  passo() {
    if (!pronto()) return;
    estouro({ dur: 0.04, de: 600, vol: 0.06, tipo: 'bandpass', q: 1.5 });
  },
  bip(alto = false) {
    if (!pronto()) return;
    voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.35 : 0.12, alto ? 990 : 660]], vol: 0.16, onda: 'square' });
  },
  fanfarra() {
    if (!pronto()) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 }));
  },
  fogos() {
    if (!pronto()) return;
    for (let k = 0; k < 5; k++) {
      voz({ pontos: [[0, 600], [0.4, 1800]], vol: 0.05, onda: 'sine', atraso: k * 0.35 });
      estouro({ dur: 0.5, de: 2000, ate: 200, vol: 0.3, atraso: k * 0.35 + 0.4 });
    }
  },
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1000) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.9; u.rate = 1.05; u.volume = 0.95;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) { window.speechSynthesis?.cancel(); som.rolar(0); } return mudo; },
};
