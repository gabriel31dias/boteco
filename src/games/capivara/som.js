/**
 * Sons da Capivara Pistola, sintetizados na hora (Web Audio), mais as falas
 * (speechSynthesis em pt-BR, voz bem fina de rato). Nada pra baixar.
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
  /** Cada arma tem a sua voz. `v`: 0..1, longe soa mais baixo. */
  tiro(arma, v = 1) {
    if (!pronto()) return;
    if (arma === 'azul') {               // pistola d'água: psssh curtinho
      estouro({ dur: 0.09, de: 5000, ate: 2500, vol: 0.22 * v, tipo: 'highpass' });
      estouro({ dur: 0.06, de: 1800, vol: 0.12 * v, tipo: 'bandpass', q: 3 });
    } else if (arma === 'vermelho') {    // frigideira arremessada: vuuush metálico
      estouro({ dur: 0.35, de: 600, ate: 2400, vol: 0.3 * v, tipo: 'bandpass', q: 2 });
      voz({ pontos: [[0, 300], [0.3, 700]], vol: 0.08 * v, onda: 'triangle' });
    } else if (arma === 'verde') {       // coco lançado: tunc + assobio
      estouro({ dur: 0.1, de: 700, ate: 200, vol: 0.5 * v });
      voz({ pontos: [[0, 1400], [0.5, 700]], vol: 0.07 * v, onda: 'sine', atraso: 0.05 });
    } else {                             // melancia: fiuu molhado
      estouro({ dur: 0.18, de: 1200, ate: 3000, vol: 0.28 * v, tipo: 'bandpass', q: 1.5 });
    }
  },
  /** Bateu: frigideira = PÉÉM, coco/melancia = SPLAT, água = chuá. */
  acerto(arma, v = 1) {
    if (!pronto()) return;
    if (arma === 'vermelho') {
      voz({ pontos: [[0, 900], [0.9, 860]], vol: 0.3 * v, onda: 'square' });
      voz({ pontos: [[0, 1370], [0.7, 1300]], vol: 0.12 * v, onda: 'sine' });
      estouro({ dur: 0.08, de: 3000, vol: 0.4 * v, tipo: 'bandpass', q: 2 });
    } else if (arma === 'azul') {
      estouro({ dur: 0.12, de: 2200, ate: 900, vol: 0.25 * v, tipo: 'bandpass', q: 1 });
    } else {
      estouro({ dur: 0.18, de: 900, ate: 250, vol: 0.55 * v });
      estouro({ dur: 0.25, de: 2500, ate: 700, vol: 0.2 * v, tipo: 'bandpass', q: 1, atraso: 0.02 });
    }
  },
  /**
   * Capivara gritando: o "uí-uí" agudo e anasalado delas (parece apito),
   * tremido. `agudo` muda de capivara pra capivara.
   */
  grito(agudo = 1, v = 1) {
    if (!pronto()) return;
    const b = 900 * agudo;
    for (let k = 0; k < 3; k++) {
      voz({ pontos: [[0, b * 1.1], [0.07, b * 1.9], [0.16, b * 1.2]], vol: 0.2 * v, onda: 'sawtooth', vibrato: 60, atraso: k * 0.17 });
    }
    estouro({ dur: 0.5, de: 3000, ate: 1200, vol: 0.05 * v, tipo: 'bandpass', q: 2 });
  },
  /** Levou um tiro: um "uíc!" só. */
  ai(agudo = 1, v = 1) {
    if (!pronto()) return;
    const b = 1000 * agudo * (0.9 + Math.random() * 0.2);
    voz({ pontos: [[0, b], [0.05, b * 1.7], [0.12, b * 1.1]], vol: 0.15 * v, onda: 'triangle', vibrato: 80 });
  },
  /** Passinho na areia (pata gordinha): chamado a cada pisada. */
  passo(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 900 + Math.random() * 400, ate: 300, vol: 0.06 * v });
  },
  explosao(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 1.2, de: 2000, ate: 70, vol: 0.95 * v });
    voz({ pontos: [[0, 90], [1, 25]], vol: 0.85 * v });
    for (let i = 0; i < 6; i++) estouro({ dur: 0.05, de: 2500 + Math.random() * 2500, vol: 0.16 * v, tipo: 'bandpass', q: 3, atraso: 0.1 + Math.random() * 0.6 });
  },
  /** Sirene curtinha: a super bomba apareceu / alguém pegou. */
  alarme() {
    if (!pronto()) return;
    for (let k = 0; k < 3; k++) voz({ pontos: [[0, 700], [0.18, 1100], [0.3, 700]], vol: 0.14, onda: 'square', atraso: k * 0.32 });
  },
  /** Lançou a super bomba: assobio descendo. */
  lanca() {
    if (!pronto()) return;
    voz({ pontos: [[0, 1800], [0.8, 500]], vol: 0.16, onda: 'sine' });
  },
  /** Super explosão: grave longo, estouro, destroços caindo por um tempão. */
  superExplosao() {
    if (!pronto()) return;
    estouro({ dur: 2.6, de: 2500, ate: 40, vol: 1 });
    voz({ pontos: [[0, 70], [2.2, 18]], vol: 1 });
    voz({ pontos: [[0, 140], [1, 40]], vol: 0.6, onda: 'sawtooth' });
    for (let i = 0; i < 16; i++) estouro({ dur: 0.06, de: 2000 + Math.random() * 3000, vol: 0.2, tipo: 'bandpass', q: 3, atraso: 0.2 + Math.random() * 1.6 });
  },
  impacto(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.07, de: 2200, vol: 0.16 * v, tipo: 'bandpass', q: 3 });
  },
  pega(galinha = false) {
    if (!pronto()) return;
    if (galinha) {   // squeak de galinha de borracha
      voz({ pontos: [[0, 1200], [0.1, 2200], [0.25, 1600]], vol: 0.2, onda: 'square', vibrato: 40 });
      return;
    }
    estouro({ dur: 0.06, de: 1500, vol: 0.25, tipo: 'bandpass', q: 2 });
    estouro({ dur: 0.06, de: 1200, vol: 0.25, tipo: 'bandpass', q: 2, atraso: 0.09 });
    [784, 1047, 1319].forEach((f, i) => voz({ pontos: [[0, f], [0.14, f]], vol: 0.12, onda: 'triangle', atraso: 0.12 + i * 0.08 }));
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
  /** Fala (voz fina), uma por vez e no máximo a cada 1,2s. */
  fala(texto, agudo = 1) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (agora - ultimaFala < 1200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = Math.min(2, 1.5 * agudo); u.rate = 1.3; u.volume = 0.9;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
