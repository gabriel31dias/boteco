/**
 * Sons da Corrida de Jegues (base: games/patos/som.js), sintetizados na hora
 * (Web Audio): galope, zurro, pum, chicote, pulo, tombo, torcida, um forró de
 * fundo que acelera na reta final, e o locutor (speechSynthesis em pt-BR).
 * Nada pra baixar.
 */
let ctx = null;
let mestre = null;
let ruidoBuf = null;
let mudo = false;
let ultimaFala = 0;
let torcida = null;
let musica = null;

export function destravar() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    mestre = ctx.createGain();
    mestre.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();   // muito som junto: não estoura
    mestre.connect(comp).connect(ctx.destination);
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const pronto = () => ctx && !mudo && ctx.state === 'running';
const sorte = (a, b) => a + Math.random() * (b - a);

function estouro({ dur, de, ate = de, vol = 0.5, tipo = 'lowpass', q = 0.8, atraso = 0, saida = mestre }) {
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
  src.connect(f).connect(g).connect(saida);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** Oscilador com curva de frequência por pontos [[t, hz], ...], vibrato e filtro opcionais. */
function voz({ pontos, vol = 0.25, onda = 'sine', vibrato = 0, vibHz = 28, atraso = 0, filtro = null, q = 1, saida = mestre }) {
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
    lfo.frequency.value = vibHz; lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + fim + 0.05);
  }
  let no = o;
  if (filtro) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filtro; f.Q.value = q; o.connect(f); no = f; }
  no.connect(g).connect(saida);
  o.start(t); o.stop(t + fim + 0.05);
}

/** Uma "nota" curta de instrumento pra música. */
function nota(t, hz, dur, vol, onda = 'triangle', saida) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = onda; o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(saida);
  o.start(t); o.stop(t + dur + 0.02);
}

// --------------------------------------------------------------- forró
// zabumba + triângulo + baixo + sanfona (quadrada filtrada), C F G C. Agenda 0,3s à frente.
const ACORDES = [[261.6, 329.6, 392], [349.2, 440, 523.3], [392, 493.9, 587.3], [261.6, 329.6, 392]];
const MELODIA = [0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1, 2, 2, 1, 0];

function tocarMusica() {
  if (musica) return;
  const saida = ctx.createGain(); saida.gain.value = 0.32; saida.connect(mestre);
  const sanf = ctx.createBiquadFilter(); sanf.type = 'lowpass'; sanf.frequency.value = 1800; sanf.connect(saida);
  musica = { saida, sanf, passo: 0, t: ctx.currentTime + 0.1, bpm: 128, timer: null };
  const agendar = () => {
    if (!ctx) return;
    while (musica.t < ctx.currentTime + 0.3) {
      const s = musica.passo % 16, compasso = Math.floor(musica.passo / 16) % 4, t = musica.t;
      const ac = ACORDES[compasso];
      // zabumba: TUM no 1 e no "e" do 2; o bacalhau (estalo) no 2 e no 4
      if (s === 0 || s === 6 || s === 8 || s === 14) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        g.gain.setValueAtTime(s === 0 || s === 8 ? 0.5 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(saida); o.start(t); o.stop(t + 0.25);
      }
      if (s === 4 || s === 12) estouro({ dur: 0.05, de: 2500, vol: 0.12, tipo: 'bandpass', q: 2, atraso: t - ctx.currentTime, saida });
      // triângulo: todo 16º, abafado nos fracos
      nota(t, 4200, s % 4 === 2 ? 0.25 : 0.06, s % 4 === 2 ? 0.05 : 0.02, 'sine', saida);
      // baixo: tônica e quinta
      if (s % 4 === 0) nota(t, (s % 8 === 0 ? ac[0] : ac[2]) / 4, 0.25, 0.22, 'triangle', saida);
      // sanfona: arpejo do acorde
      if (s % 2 === 0) nota(t, ac[MELODIA[s]] * (s >= 8 && compasso % 2 ? 2 : 1), 0.2, 0.05, 'square', sanf);
      if (s === 0) for (const hz of ac) nota(t, hz, 0.5, 0.025, 'sawtooth', sanf);
      musica.t += 60 / musica.bpm / 4;
      musica.passo++;
    }
  };
  agendar();
  musica.timer = setInterval(agendar, 100);
}

function pararMusica() {
  if (!musica) return;
  clearInterval(musica.timer);
  const m = musica;
  musica = null;
  try { m.saida.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => m.saida.disconnect(), 1500); } catch { /* fechou */ }
}

// ------------------------------------------------------------- torcida
function ligarTorcida() {
  if (torcida) return;
  const src = ctx.createBufferSource();
  src.buffer = ruidoBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 0.0001;
  src.connect(f).connect(g).connect(mestre);
  src.start();
  torcida = { src, g, base: 0.05 };
  g.gain.setTargetAtTime(torcida.base, ctx.currentTime, 0.8);
}

export const som = {
  /** Clip-clop: uma passada (4 batidas), mais forte/rápida com a velocidade. */
  galope(v = 1, rapido = 1) {
    if (!pronto()) return;
    const dt = 0.07 / rapido;
    [0, 1, 2.2, 3].forEach((k, n) => {
      estouro({ dur: 0.04, de: sorte(1300, 1900), vol: 0.13 * v * (n === 3 ? 1.3 : 1), tipo: 'bandpass', q: 5, atraso: k * dt });
      estouro({ dur: 0.06, de: 260, ate: 90, vol: 0.12 * v, atraso: k * dt });
    });
  },
  /** I-Ó! O zurro do jegue: inspira agudo, solta grave, 2 ou 3 vezes. */
  zurro(v = 1, grave = 1) {
    if (!pronto()) return;
    const vezes = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < vezes; k++) {
      const a = k * 0.62;
      voz({ pontos: [[0, 820 * grave], [0.08, 980 * grave], [0.26, 760 * grave]], vol: 0.14 * v, onda: 'sawtooth', vibrato: 18, vibHz: 22, atraso: a, filtro: 1500, q: 1.5 });
      voz({ pontos: [[0, 300 * grave], [0.1, 340 * grave], [0.32, 210 * grave]], vol: 0.2 * v, onda: 'sawtooth', vibrato: 12, vibHz: 16, atraso: a + 0.28, filtro: 700, q: 1.2 });
      estouro({ dur: 0.3, de: 1200, vol: 0.05 * v, tipo: 'bandpass', q: 2, atraso: a + 0.28 });
    }
  },
  /** PRRRT. `forte`: mais longo, mais grave, com o chiadinho no fim. */
  pum(v = 1, forte = false) {
    if (!pronto()) return;
    const dur = forte ? sorte(0.8, 1.2) : sorte(0.25, 0.55);
    const hz = forte ? sorte(55, 75) : sorte(80, 130);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.linearRampToValueAtTime(hz * sorte(0.6, 1.4), t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.setValueAtTime(sorte(18, 32), t); lfo.frequency.linearRampToValueAtTime(sorte(8, 40), t + dur);
    lg.gain.value = hz * 0.6;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = forte ? 520 : 800; f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.03);
    g.gain.setValueAtTime(0.45 * v, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // "bate" a amplitude também: o pum gagueja
    const trem = ctx.createOscillator(), tg = ctx.createGain(), amp = ctx.createGain();
    trem.frequency.value = sorte(9, 16); tg.gain.value = 0.35; amp.gain.value = 0.65;
    trem.connect(tg).connect(amp.gain);
    o.connect(f).connect(amp).connect(g).connect(mestre);
    for (const x of [o, lfo, trem]) { x.start(t); x.stop(t + dur + 0.05); }
    estouro({ dur: dur * 0.9, de: 400, ate: 150, vol: 0.18 * v });
    if (forte) voz({ pontos: [[0, 700], [0.25, 1300]], vol: 0.06 * v, onda: 'square', atraso: dur - 0.1, vibrato: 60, filtro: 1100, q: 3 });
  },
  /** Estalo do chicote (e o "ê!" do peão). */
  chicote(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 6000, ate: 2500, vol: 0.4 * v, tipo: 'highpass', q: 0.7 });
    estouro({ dur: 0.12, de: 2500, ate: 600, vol: 0.18 * v, tipo: 'bandpass', q: 1, atraso: 0.02 });
    voz({ pontos: [[0, 1600], [0.06, 500]], vol: 0.05 * v, onda: 'sine' });
  },
  /** Boing do pulo. */
  pulo(v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 180], [0.12, 520], [0.3, 380]], vol: 0.18 * v, onda: 'sine', vibrato: 30, vibHz: 18 });
    estouro({ dur: 0.12, de: 900, ate: 300, vol: 0.12 * v });
  },
  pouso(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.18, de: 300, ate: 60, vol: 0.4 * v });
    estouro({ dur: 0.25, de: 1800, ate: 500, vol: 0.08 * v, tipo: 'bandpass' });
  },
  /** POF! Capotou: pancada, rolamento na terra, apito de desenho caindo e os passarinhos da tontura. */
  tombo(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.35, de: 500, ate: 50, vol: 0.7 * v });
    estouro({ dur: 0.9, de: 2200, ate: 300, vol: 0.18 * v, tipo: 'bandpass', q: 0.5, atraso: 0.05 });
    voz({ pontos: [[0, 1400], [0.5, 300]], vol: 0.09 * v, onda: 'sine', vibrato: 20 });
    for (let k = 0; k < 6; k++) voz({ pontos: [[0, 2600 + (k % 2) * 500], [0.07, 3400]], vol: 0.05 * v, onda: 'sine', atraso: 0.7 + k * 0.17 });
  },
  /** Empacou: zurro bravo e bufada. */
  empacou(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.4, de: 700, ate: 200, vol: 0.25 * v, tipo: 'bandpass', q: 0.8 });
    setTimeout(() => som.zurro(v * 1.1, 0.85), 250);
  },
  /** Cenoura: crec-crec e o zap do turbo. */
  cenoura(v = 1) {
    if (!pronto()) return;
    for (let k = 0; k < 4; k++) estouro({ dur: 0.04, de: sorte(2500, 4000), vol: 0.25 * v, tipo: 'bandpass', q: 3, atraso: k * 0.07 });
    voz({ pontos: [[0, 200], [0.35, 1400]], vol: 0.12 * v, onda: 'sawtooth', atraso: 0.25, filtro: 1200, q: 0.8 });
    estouro({ dur: 0.4, de: 3000, ate: 8000, vol: 0.1 * v, tipo: 'highpass', atraso: 0.25 });
  },
  /** Passou o obstáculo: plim. */
  passou() { if (!pronto()) return; voz({ pontos: [[0, 1320], [0.12, 1320]], vol: 0.05, onda: 'triangle' }); },
  /** Tiro de largada. */
  largada() {
    if (!pronto()) return;
    estouro({ dur: 0.08, de: 5000, ate: 1500, vol: 0.5, tipo: 'bandpass', q: 0.7 });
    estouro({ dur: 0.7, de: 1100, ate: 50, vol: 0.8 });
    ligarTorcida();
    som.vibra(1.2, 2);
    tocarMusica();
  },
  bip(alto = false) { if (!pronto()) return; voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.4 : 0.15, alto ? 990 : 660]], vol: 0.16, onda: 'square' }); },
  fanfarra() {
    if (!pronto()) return;
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => voz({ pontos: [[0, f], [i === 6 ? 0.6 : 0.16, f]], vol: 0.18, onda: 'square', atraso: i * 0.12, filtro: 2000, q: 0.5 }));
  },
  derrota() { if (!pronto()) return; [392, 370, 349, 330].forEach((f, i) => voz({ pontos: [[0, f], [i === 3 ? 0.8 : 0.3, f * (i === 3 ? 0.97 : 1)]], vol: 0.13, onda: 'sawtooth', atraso: i * 0.32, vibrato: i === 3 ? 6 : 0, filtro: 900 })); },
  /** Torcida: `forca` sobe a gritaria por `dura` segundos. */
  vibra(forca = 1, dura = 1.2) {
    if (!pronto() || !torcida) return;
    const t = ctx.currentTime;
    torcida.g.gain.cancelScheduledValues(t);
    torcida.g.gain.setTargetAtTime(torcida.base + 0.12 * forca, t, 0.08);
    torcida.g.gain.setTargetAtTime(torcida.base, t + dura, 0.6);
    for (let k = 0; k < 4 * forca; k++) voz({ pontos: [[0, sorte(250, 400)], [0.5, sorte(500, 700)]], vol: 0.03, onda: 'sawtooth', atraso: Math.random() * 0.3, filtro: 900, q: 2 });
  },
  /** "Ôôôô": torcida lamentando o tombo. */
  ooo() {
    if (!pronto()) return;
    for (let k = 0; k < 5; k++) voz({ pontos: [[0, sorte(380, 480)], [0.8, sorte(200, 260)]], vol: 0.035, onda: 'sawtooth', atraso: Math.random() * 0.15, filtro: 700, q: 2 });
  },
  /** Reta final: a música acelera. */
  retaFinal() { if (musica) musica.bpm = 150; som.vibra(1.5, 2); },
  parar() { pararMusica(); if (torcida && ctx) { torcida.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.5); } },
  desligar() {
    pararMusica();
    if (torcida) { try { torcida.src.stop(); } catch { /* já parou */ } torcida = null; }
    window.speechSynthesis?.cancel();
  },
  fala(texto, prioridade = false) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (!prioridade && agora - ultimaFala < 2200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 1.1; u.rate = 1.2; u.volume = 0.95;
    const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get mudo() { return mudo; },
  alternarMudo() {
    mudo = !mudo;
    if (mestre && ctx) mestre.gain.setTargetAtTime(mudo ? 0 : 0.55, ctx.currentTime, 0.05);
    if (mudo) window.speechSynthesis?.cancel();
    return mudo;
  },
};
