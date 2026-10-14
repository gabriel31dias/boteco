/**
 * Sons do Futebol de Botão (base: games/golfe/som.js), sintetizados na hora
 * (Web Audio): petelecada, toc de botão, bola, madeira, trave, apito, torcida
 * de fundo e o grito de gol, mais o locutor (speechSynthesis em pt-BR).
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


let fundo = null;

export const som = {
  /** Tec: o dedo petelecando o botão. */
  peteleco(forca = 0.5) {
    if (!pronto()) return;
    estouro({ dur: 0.04, de: 3200 + forca * 1500, vol: 0.3 + forca * 0.3, tipo: 'bandpass', q: 5 });
    voz({ pontos: [[0, 1300 + forca * 400], [0.05, 700]], vol: 0.14, onda: 'triangle' });
  },
  /** Toc: botão com botão (acrílico). */
  choque(f = 0.5) {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 1900 + f * 900, vol: 0.18 + f * 0.35, tipo: 'bandpass', q: 6 });
    voz({ pontos: [[0, 900 + f * 300], [0.06, 600]], vol: 0.1 + f * 0.1, onda: 'square' });
  },
  /** Pof: botão na bola. */
  bola(f = 0.5) {
    if (!pronto()) return;
    estouro({ dur: 0.07, de: 1400, ate: 500, vol: 0.3 + f * 0.4, tipo: 'bandpass', q: 2 });
    voz({ pontos: [[0, 260 + f * 120], [0.09, 120]], vol: 0.22 + f * 0.15, onda: 'sine' });
  },
  /** Tum: na borda de madeira. */
  parede(f = 0.5) {
    if (!pronto()) return;
    estouro({ dur: 0.09, de: 600, ate: 160, vol: 0.2 + f * 0.35, tipo: 'lowpass', q: 1 });
    voz({ pontos: [[0, 170], [0.1, 110]], vol: 0.12 + f * 0.1, onda: 'triangle' });
  },
  /** Plim: na trave (metal). */
  trave() {
    if (!pronto()) return;
    [1180, 1770, 2650].forEach((hz, i) => voz({ pontos: [[0, hz], [0.7, hz * 0.98]], vol: 0.12 / (i + 1), onda: 'sine' }));
    estouro({ dur: 0.04, de: 5000, vol: 0.2, tipo: 'highpass' });
  },
  /** A bola estufando a rede. */
  rede() {
    if (!pronto()) return;
    estouro({ dur: 0.35, de: 3000, ate: 900, vol: 0.3, tipo: 'bandpass', q: 0.7 });
  },
  /** Apito do juiz: trinado (curto na saída, três no fim). */
  apito(vezes = 1) {
    if (!pronto()) return;
    for (let k = 0; k < vezes; k++) {
      const a = k * 0.42, longo = k === vezes - 1 ? 0.55 : 0.25;
      voz({ pontos: [[0, 2900], [longo, 2850]], vol: 0.13, onda: 'sine', vibrato: 140, atraso: a });
      estouro({ dur: longo, de: 3000, vol: 0.05, tipo: 'bandpass', q: 3, atraso: a });
    }
  },
  /** Torcida de fundo: um murmúrio que não para (e sobe nos lances). */
  torcidaFundo(liga = true) {
    if (!pronto()) { fundo = null; return; }
    if (!liga) { if (fundo) { fundo.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); fundo.src.stop(ctx.currentTime + 1.5); fundo = null; } return; }
    if (fundo) return;
    const src = ctx.createBufferSource(); src.buffer = ruidoBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    // ondula devagar, como gente falando
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.23; lg.gain.value = 0.012;
    lfo.connect(lg).connect(g.gain); lfo.start();
    src.connect(f).connect(g).connect(mestre); src.start();
    g.gain.setTargetAtTime(0.04, ctx.currentTime, 1);
    fundo = { src, f, g };
  },
  /** A torcida enchendo: perto do gol, chute forte. */
  emocao(k = 1) {
    if (!pronto() || !fundo) return;
    const t = ctx.currentTime;
    fundo.g.gain.cancelScheduledValues(t);
    fundo.g.gain.setTargetAtTime(0.04 + 0.1 * k, t, 0.15);
    fundo.g.gain.setTargetAtTime(0.04, t + 1.2, 0.6);
  },
  /** GOOOL: a torcida explode (vozes subindo + aplausos), corneta. */
  gol(meu = true) {
    if (!pronto()) return;
    const f = meu ? 1.4 : 0.8;
    for (let k = 0; k < 7; k++) voz({ pontos: [[0, 190 + k * 33], [0.35, 360 + k * 45], [2.6, 300 + k * 38]], vol: 0.04 * f, onda: 'sawtooth', vibrato: 7, atraso: k * 0.025 });
    som.aplausos(3, f);
    [392, 392, 523].forEach((hz, i) => voz({ pontos: [[0, hz], [i === 2 ? 0.6 : 0.16, hz]], vol: 0.12, onda: 'sawtooth', atraso: 0.25 + i * 0.2 }));
  },
  aplausos(dur = 1.5, v = 1) {
    if (!pronto()) return;
    const n = Math.round(dur * 30);
    for (let k = 0; k < n; k++) estouro({ dur: 0.03, de: 1500 + Math.random() * 2500, vol: (0.05 + Math.random() * 0.08) * v * (1 - (k / n) * 0.7), tipo: 'bandpass', q: 1.2, atraso: Math.random() * dur });
  },
  /** Uuuh: na trave, quase. */
  lamento() {
    if (!pronto()) return;
    for (let k = 0; k < 5; k++) voz({ pontos: [[0, 300 + k * 30], [1, 180 + k * 20]], vol: 0.04, onda: 'sawtooth', vibrato: 5, atraso: k * 0.04 });
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
  fala(texto, rapido = false) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 800) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 1; u.rate = rapido ? 1.3 : 1.1; u.volume = 1;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) { window.speechSynthesis?.cancel(); som.torcidaFundo(false); } return mudo; },
};
