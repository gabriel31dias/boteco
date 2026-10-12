/**
 * Sons de Ratos em Guerra, sintetizados na hora (Web Audio), mais as falas
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
  /** Cada arma tem a sua voz. `v`: 0..1, mais longe soa mais baixo. */
  tiro(arma, v = 1) {
    if (!pronto()) return;
    if (arma === 'roxo') {               // metralhadora: tec curtinho
      estouro({ dur: 0.07, de: 3000, ate: 800, vol: 0.28 * v, tipo: 'bandpass', q: 1.2 });
      voz({ pontos: [[0, 180], [0.05, 70]], vol: 0.25 * v, onda: 'square' });
    } else if (arma === 'vermelho') {    // escopeta: BUM grave
      estouro({ dur: 0.45, de: 1400, ate: 80, vol: 0.85 * v });
      estouro({ dur: 0.12, de: 5000, ate: 1500, vol: 0.35 * v, tipo: 'highpass' });
      voz({ pontos: [[0, 120], [0.3, 35]], vol: 0.7 * v });
      estouro({ dur: 0.05, de: 2500, vol: 0.2 * v, tipo: 'bandpass', q: 5, atraso: 0.32 });   // trec-trec
      estouro({ dur: 0.05, de: 2000, vol: 0.2 * v, tipo: 'bandpass', q: 5, atraso: 0.42 });
    } else if (arma === 'verde') {       // sniper: estalo seco e eco
      estouro({ dur: 0.18, de: 6000, ate: 1200, vol: 0.6 * v, tipo: 'highpass' });
      voz({ pontos: [[0, 900], [0.2, 60]], vol: 0.45 * v, onda: 'sawtooth' });
      estouro({ dur: 0.5, de: 900, ate: 150, vol: 0.18 * v, atraso: 0.12 });
    } else {                             // fuzil
      estouro({ dur: 0.12, de: 4200, ate: 900, vol: 0.4 * v, tipo: 'highpass' });
      voz({ pontos: [[0, 160], [0.12, 50]], vol: 0.4 * v });
    }
  },
  /** Guincho de rato: sobe rápido, tremido. */
  guincho(agudo = 1, v = 1) {
    if (!pronto()) return;
    const b = 1400 * agudo * (0.9 + Math.random() * 0.25);
    voz({ pontos: [[0, b], [0.06, b * 2.1], [0.16, b * 1.3]], vol: 0.16 * v, onda: 'triangle', vibrato: 120 });
  },
  /** Grito de quem morre: guincho longo caindo, com chiado. */
  grito(agudo = 1, v = 1) {
    if (!pronto()) return;
    const b = 1700 * agudo;
    voz({ pontos: [[0, b], [0.08, b * 1.8], [0.55, b * 0.45], [0.75, b * 0.3]], vol: 0.22 * v, onda: 'sawtooth', vibrato: 180 });
    estouro({ dur: 0.5, de: 4000, ate: 1200, vol: 0.06 * v, tipo: 'bandpass', q: 2 });
  },
  acerto(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.08, de: 1800, ate: 400, vol: 0.35 * v, tipo: 'bandpass', q: 1.5 });
    voz({ pontos: [[0, 260], [0.08, 90]], vol: 0.25 * v });
  },
  /** Headshot: estalo seco + "plim" metálico que fica ecoando. */
  headshot() {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 5000, ate: 1500, vol: 0.5, tipo: 'bandpass', q: 1.5 });
    voz({ pontos: [[0, 2600], [0.9, 2500]], vol: 0.22, onda: 'sine' });
    voz({ pontos: [[0, 3900], [0.6, 3800]], vol: 0.1, onda: 'sine', atraso: 0.02 });
  },
  /** Plantou bomba: tic metálico + chiado curto do pavio. */
  planta() {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 3000, vol: 0.3, tipo: 'bandpass', q: 4 });
    estouro({ dur: 0.35, de: 6000, ate: 4000, vol: 0.08, tipo: 'highpass', atraso: 0.05 });
  },
  impacto(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.07, de: 2600, vol: 0.18 * v, tipo: 'bandpass', q: 3 });
  },
  explosao(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 1.3, de: 2000, ate: 70, vol: 1 * v });
    voz({ pontos: [[0, 90], [1, 25]], vol: 0.9 * v });
    for (let i = 0; i < 6; i++) estouro({ dur: 0.05, de: 2500 + Math.random() * 2500, vol: 0.18 * v, tipo: 'bandpass', q: 3, atraso: 0.1 + Math.random() * 0.6 });
  },
  pulo(duplo = false) {
    if (!pronto()) return;
    voz({ pontos: duplo ? [[0, 500], [0.14, 1300]] : [[0, 260], [0.16, 620]], vol: 0.14, onda: 'sine' });   // boing
  },
  pouso() {
    if (!pronto()) return;
    estouro({ dur: 0.09, de: 600, ate: 120, vol: 0.18 });
  },
  pega(kit = false) {
    if (!pronto()) return;
    estouro({ dur: 0.06, de: 1500, vol: 0.25, tipo: 'bandpass', q: 2 });                 // nhac
    estouro({ dur: 0.06, de: 1200, vol: 0.25, tipo: 'bandpass', q: 2, atraso: 0.09 });
    [784, 1047, kit ? 1568 : 1319].forEach((f, i) => voz({ pontos: [[0, f], [0.14, f]], vol: 0.13, onda: 'triangle', atraso: 0.12 + i * 0.08 }));
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
  /**
   * Fala de rato (voz fina e rápida). Uma de cada vez e no máximo a cada
   * 1,2s: em tiroteio de 4 ninguém aguenta todo mundo falando junto.
   */
  fala(texto, agudo = 1, locutor = false) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (!locutor && agora - ultimaFala < 1200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    u.pitch = locutor ? 0.6 : Math.min(2, 1.6 * agudo);   // locutor: voz grossa de anunciador
    u.rate = locutor ? 0.95 : 1.35;
    u.volume = 0.9;
    const voz = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (voz) u.voice = voz;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) window.speechSynthesis?.cancel(); return mudo; },
};
