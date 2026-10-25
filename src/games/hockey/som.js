/**
 * Sons do Air Hockey Neon (base: games/patos/som.js), sintetizados na hora
 * (Web Audio), mais o locutor (speechSynthesis em pt-BR) e um zumbido de
 * fundo de fliperama. Nada pra baixar.
 */
let ctx = null;
let mestre = null;
let ruidoBuf = null;
let mudo = false;
let ultimaFala = 0;
let amb = null;

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
  /** Toc do taco no disco: mais forte, mais alto e mais agudo. */
  batida(f = 1, v = 1) {
    if (!pronto()) return;
    const k = Math.min(1, f);
    estouro({ dur: 0.05, de: 2500 + 2500 * k, ate: 900, vol: (0.25 + 0.4 * k) * v, tipo: 'bandpass', q: 2 });
    voz({ pontos: [[0, 300 + 500 * k], [0.09, 140]], vol: (0.12 + 0.2 * k) * v, onda: 'triangle' });
    if (k > 0.7) voz({ pontos: [[0, 1400], [0.25, 3200]], vol: 0.05 * v, onda: 'sawtooth', atraso: 0.02 });   // zuuum do disco disparado
  },
  /** Disco na borda: clac plástico. */
  parede(f = 1) {
    if (!pronto()) return;
    const k = Math.min(1, f);
    estouro({ dur: 0.04, de: 1800 + 1500 * k, vol: 0.15 + 0.25 * k, tipo: 'bandpass', q: 4 });
    voz({ pontos: [[0, 180], [0.06, 90]], vol: 0.12 * k, onda: 'sine' });
  },
  /** GOL: explosão, sirene de fliperama e a galera. */
  gol(meu) {
    if (!pronto()) return;
    estouro({ dur: 0.9, de: 1400, ate: 40, vol: 0.7 });
    voz({ pontos: [[0, 90], [0.6, 35]], vol: 0.35, onda: 'sine' });
    for (let k = 0; k < 4; k++) voz({ pontos: [[0, meu ? 660 : 440], [0.14, meu ? 990 : 330]], vol: 0.12, onda: 'square', atraso: 0.15 + k * 0.17 });
    estouro({ dur: 1.8, de: 900, ate: 1400, vol: meu ? 0.22 : 0.1, tipo: 'bandpass', q: 0.4, atraso: 0.1 });   // a torcida
  },
  saque() { if (!pronto()) return; voz({ pontos: [[0, 520], [0.12, 780]], vol: 0.1, onda: 'triangle' }); },
  bip(alto = false) { if (!pronto()) return; voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.35 : 0.12, alto ? 990 : 660]], vol: 0.16, onda: 'square' }); },
  apito() { if (!pronto()) return; voz({ pontos: [[0, 1800], [0.5, 1850]], vol: 0.12, onda: 'square', vibrato: 60 }); },
  ouro() { if (!pronto()) return; [784, 988, 1175, 1568].forEach((f, i) => voz({ pontos: [[0, f], [0.25, f]], vol: 0.13, onda: 'triangle', atraso: i * 0.09 })); },
  fanfarra() { if (!pronto()) return; [523, 659, 784, 1047, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [0.18, f]], vol: 0.18, onda: 'triangle', atraso: i * 0.11 })); },
  derrota() { if (!pronto()) return; [392, 370, 349, 262].forEach((f, i) => voz({ pontos: [[0, f], [0.3, f * 0.97]], vol: 0.14, onda: 'triangle', atraso: i * 0.28 })); },
  /** Zumbido grave do fliperama (liga uma vez, fica até `pararAmbiente`). */
  ambiente() {
    if (!pronto() || amb) return;
    const g = ctx.createGain(); g.gain.value = 0.035;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 6;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.15; lg.gain.value = 140; lfo.connect(lg).connect(f.frequency);
    const os = [55, 55.4, 82.4].map((hz) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(); return o; });
    f.connect(g).connect(mestre); lfo.start();
    amb = { os: [...os, lfo], g };
  },
  pararAmbiente() { if (!amb) return; for (const o of amb.os) o.stop(); amb.g.disconnect(); amb = null; },
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
  alternarMudo() { mudo = !mudo; if (mudo) { window.speechSynthesis?.cancel(); this.pararAmbiente(); } else this.ambiente(); return mudo; },
};
