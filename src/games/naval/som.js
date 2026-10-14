/**
 * Sons da Batalha Naval (base: games/galinhas/som.js), sintetizados na hora
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
  canhao(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.6, de: 700, ate: 40, vol: 0.75 * v });
    voz({ pontos: [[0, 90], [0.35, 38]], vol: 0.35 * v, onda: 'sine' });
  },
  /** A bala caindo: assobio que desce (dura o voo). */
  assobio(dur = 0.8, v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 1900], [dur, 520]], vol: 0.06 * v, onda: 'sine', vibrato: 12 });
  },
  agua(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.7, de: 2600, ate: 400, vol: 0.4 * v, tipo: 'bandpass', q: 0.7 });
    estouro({ dur: 0.25, de: 600, ate: 120, vol: 0.3 * v });
  },
  explosao(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.9, de: 1400, ate: 45, vol: 0.85 * v });
    estouro({ dur: 0.3, de: 4200, ate: 900, vol: 0.25 * v, tipo: 'bandpass' });
    voz({ pontos: [[0, 70], [0.6, 32]], vol: 0.3 * v });
  },
  afundar() {
    if (!pronto()) return;
    voz({ pontos: [[0, 120], [1.6, 45]], vol: 0.22, onda: 'sawtooth', vibrato: 6 });   // casco rangendo
    for (let k = 0; k < 9; k++) voz({ pontos: [[0, 300 + Math.random() * 500], [0.08, 900 + Math.random() * 400]], vol: 0.05, atraso: 0.4 + k * 0.17 });   // bolhas
  },
  sonar() {
    if (!pronto()) return;
    voz({ pontos: [[0, 1250], [0.9, 1200]], vol: 0.12, onda: 'sine' });
    voz({ pontos: [[0, 1250], [0.6, 1200]], vol: 0.04, onda: 'sine', atraso: 0.45 });
  },
  buzina() {
    if (!pronto()) return;
    voz({ pontos: [[0, 110], [1.1, 108]], vol: 0.2, onda: 'sawtooth' });
    voz({ pontos: [[0, 165], [1.1, 162]], vol: 0.12, onda: 'sawtooth' });
  },
  clique() {
    if (!pronto()) return;
    voz({ pontos: [[0, 1400], [0.05, 1800]], vol: 0.08, onda: 'square' });
  },
  erro() {
    if (!pronto()) return;
    voz({ pontos: [[0, 220], [0.18, 160]], vol: 0.12, onda: 'square' });
  },
  bip(alto = false) {
    if (!pronto()) return;
    voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.35 : 0.12, alto ? 990 : 660]], vol: 0.18, onda: 'square' });
  },
  fanfarra() {
    if (!pronto()) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 }));
  },
  derrota() {
    if (!pronto()) return;
    [392, 349, 311, 262].forEach((f, i) => voz({ pontos: [[0, f], [0.3, f * 0.98]], vol: 0.16, onda: 'triangle', atraso: i * 0.25 }));
  },
  /** Locutor: uma fala por vez, no máximo a cada 1,2s. */
  fala(texto) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.75; u.rate = 1.05; u.volume = 0.9;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
