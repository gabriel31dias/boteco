/**
 * Sons de Cobras do Templo (base: games/galinhas/som.js), sintetizados na hora
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

export const som = {
  /** Nhac: estalo + nota que sobe com a sequência (n-ésima fruta seguida). */
  come(n = 0, v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 1800, vol: 0.22 * v, tipo: 'bandpass', q: 3 });
    const f = 520 * 2 ** (Math.min(n, 12) / 12);
    voz({ pontos: [[0, f], [0.09, f * 1.5]], vol: 0.14 * v, onda: 'triangle', atraso: 0.02 });
  },
  bolinha(v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 900 + Math.random() * 300], [0.05, 1400]], vol: 0.06 * v, onda: 'sine' });
  },
  moeda() {
    if (!pronto()) return;
    [988, 1319].forEach((f, i) => voz({ pontos: [[0, f], [0.25, f]], vol: 0.16, onda: 'square', atraso: i * 0.08 }));
  },
  sibilo(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.45, de: 5000, ate: 3000, vol: 0.13 * v, tipo: 'highpass', q: 0.5 });
  },
  turbo() {
    if (!pronto()) return;
    estouro({ dur: 0.35, de: 400, ate: 2400, vol: 0.2, tipo: 'bandpass', q: 1.2 });
  },
  morte(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.35, de: 900, ate: 60, vol: 0.5 * v });
    voz({ pontos: [[0, 440], [0.5, 90]], vol: 0.18 * v, onda: 'sawtooth' });
  },
  engoliu() {
    if (!pronto()) return;
    [392, 523, 659, 784].forEach((f, i) => voz({ pontos: [[0, f], [0.12, f]], vol: 0.15, onda: 'square', atraso: i * 0.07 }));
  },
  renasce() {
    if (!pronto()) return;
    voz({ pontos: [[0, 300], [0.3, 1200]], vol: 0.12, onda: 'triangle' });
    estouro({ dur: 0.3, de: 3000, ate: 600, vol: 0.12, tipo: 'bandpass' });
  },
  bip(alto = false) {
    if (!pronto()) return;
    voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.45 : 0.15, alto ? 990 : 660]], vol: 0.22, onda: 'square' });
  },
  fanfarra() {
    if (!pronto()) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 }));
  },
  /** Locutor: uma fala por vez, no máximo a cada 1,5s. */
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1500) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.7; u.rate = 1.05; u.volume = 0.9;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
