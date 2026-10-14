/**
 * Sons de Bazuca x Helicópteros (base: games/jegues/som.js), sintetizados na hora
 * (Web Audio): hélice em loop (sobe com quantos helicópteros tem no céu), disparo
 * de bazuca, foguete chiando, explosão no ar, lata batendo, míssil assobiando e
 * estourando no chão, zumbido de atordoado, sirene, uma trilha de tambor de guerra
 * que aperta no fim, e o locutor (speechSynthesis em pt-BR). Nada pra baixar.
 */
let ctx = null;
let mestre = null;
let ruidoBuf = null;
let mudo = false;
let ultimaFala = 0;
let helice = null;
let musica = null;

export function destravar() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    mestre = ctx.createGain();
    mestre.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();   // muita explosão junta: não estoura
    comp.threshold.value = -18; comp.ratio.value = 6;
    mestre.connect(comp).connect(ctx.destination);
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const pronto = () => ctx && !mudo && ctx.state === 'running';
const sorte = (a, b) => a + Math.random() * (b - a);

function estouro({ dur, de, ate = de, vol = 0.5, tipo = 'lowpass', q = 0.8, atraso = 0, saida = mestre, ataque = 0 }) {
  const t = ctx.currentTime + atraso;
  const src = ctx.createBufferSource();
  src.buffer = ruidoBuf;
  const f = ctx.createBiquadFilter();
  f.type = tipo; f.Q.value = q;
  f.frequency.setValueAtTime(de, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, ate), t + dur);
  const g = ctx.createGain();
  if (ataque) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + ataque); } else g.gain.setValueAtTime(vol, t);
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

function nota(t, hz, dur, vol, onda, saida) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = onda; o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(saida);
  o.start(t); o.stop(t + dur + 0.02);
}

// ------------------------------------------------- trilha: tambor de guerra
// bumbo + caixa em marcha + baixo em ostinato (Lá menor) + metal grave. Agenda 0,3s à frente.
const BAIXO = [110, 110, 130.8, 110, 98, 98, 123.5, 98];
function tocarMusica() {
  if (musica) return;
  const saida = ctx.createGain(); saida.gain.value = 0.3; saida.connect(mestre);
  const metal = ctx.createBiquadFilter(); metal.type = 'lowpass'; metal.frequency.value = 1100; metal.connect(saida);
  musica = { saida, metal, passo: 0, t: ctx.currentTime + 0.1, bpm: 112, timer: null };
  const agendar = () => {
    if (!ctx || !musica) return;
    while (musica.t < ctx.currentTime + 0.3) {
      const s = musica.passo % 16, compasso = Math.floor(musica.passo / 16) % 8, t = musica.t, a = t - ctx.currentTime;
      if (s === 0 || s === 3 || s === 8 || s === 11) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
        g.gain.setValueAtTime(s % 8 === 0 ? 0.6 : 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g).connect(saida); o.start(t); o.stop(t + 0.32);
      }
      // caixa de marcha: toque no 2 e 4, rufo no fim do compasso
      if (s === 4 || s === 12 || (s >= 13 && compasso % 2)) estouro({ dur: s >= 13 ? 0.06 : 0.12, de: 2200, ate: 900, vol: s >= 13 ? 0.1 : 0.2, tipo: 'bandpass', q: 0.9, atraso: a, saida });
      if (s % 2 === 0) nota(t, 7000, 0.03, 0.015, 'square', saida);   // chimbal
      if (s % 2 === 0) nota(t, BAIXO[(s / 2) % 8] * (compasso >= 4 ? 1.122 : 1) / 2, 0.22, 0.2, 'sawtooth', metal);
      if (s === 0 && compasso % 2 === 0) for (const hz of [220, 261.6, 329.6]) nota(t, hz * (compasso >= 4 ? 1.122 : 1), 1.6, 0.03, 'sawtooth', metal);
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
  try { m.saida.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => m.saida.disconnect(), 2000); } catch { /* fechou */ }
}

// ------------------------------------------------------------- hélice
/** Tchop-tchop contínuo: ruído grave picotado por um LFO; `nivel` = quantos no céu, `rapido` = rotação. */
function ligarHelice() {
  if (helice) return;
  const src = ctx.createBufferSource();
  src.buffer = ruidoBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 1.2;
  const picote = ctx.createGain(); picote.gain.value = 0.5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 13;
  const lg = ctx.createGain(); lg.gain.value = 0.5;
  lfo.connect(lg).connect(picote.gain);
  const g = ctx.createGain(); g.gain.value = 0.0001;
  // zumbido da turbina por cima
  const tu = ctx.createOscillator(); tu.type = 'sawtooth'; tu.frequency.value = 190;
  const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 900; tf.Q.value = 4;
  const tg = ctx.createGain(); tg.gain.value = 0.025;
  tu.connect(tf).connect(tg).connect(g);
  src.connect(f).connect(picote).connect(g).connect(mestre);
  src.start(); lfo.start(); tu.start();
  helice = { src, lfo, tu, g };
}

export const som = {
  /** Começou: sirene, trilha e as hélices. */
  largada() {
    if (!pronto()) return;
    voz({ pontos: [[0, 500], [0.6, 900], [1.2, 500], [1.8, 900], [2.4, 520]], vol: 0.12, onda: 'sawtooth', filtro: 1100, q: 1 });
    estouro({ dur: 0.9, de: 900, ate: 40, vol: 0.6 });
    tocarMusica();
    ligarHelice();
  },
  /** Volume/rotação da hélice: `n` helicópteros, `perto` 0–1 (o mais baixo). */
  helices(n, perto = 0) {
    if (!helice || !ctx) return;
    const t = ctx.currentTime;
    helice.g.gain.setTargetAtTime(mudo ? 0.0001 : Math.min(0.55, 0.06 + n * 0.06 + perto * 0.15), t, 0.3);
    helice.lfo.frequency.setTargetAtTime(11 + Math.min(n, 8) * 0.6, t, 0.5);
  },
  /** FUMP! A bazuca: estampido grave, chiado de propelente e o foguete se afastando. */
  disparo(v = 1, meu = false) {
    if (!pronto()) return;
    estouro({ dur: 0.25, de: 1800, ate: 80, vol: 0.55 * v });
    estouro({ dur: 0.08, de: 5000, ate: 2000, vol: 0.25 * v, tipo: 'bandpass', q: 0.6 });
    voz({ pontos: [[0, 90], [0.15, 40]], vol: 0.4 * v, onda: 'sine' });
    estouro({ dur: 0.7, de: 6000, ate: 1500, vol: (meu ? 0.18 : 0.08) * v, tipo: 'bandpass', q: 1.5, atraso: 0.04, ataque: 0.05 });
  },
  /** Recarregou: claque-claque metálico. */
  recarga() {
    if (!pronto()) return;
    estouro({ dur: 0.04, de: 3500, vol: 0.18, tipo: 'bandpass', q: 6 });
    estouro({ dur: 0.05, de: 2400, vol: 0.2, tipo: 'bandpass', q: 6, atraso: 0.11 });
  },
  /** Acertou mas não derrubou: lata amassando. */
  lata(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.3, de: 900, ate: 120, vol: 0.5 * v });
    for (const hz of [520, 760, 1130]) voz({ pontos: [[0, hz], [0.4, hz * 0.94]], vol: 0.05 * v, onda: 'square', filtro: hz, q: 8 });
  },
  /** KABUM no ar: estouro, ronco grave, estilhaços chovendo. `grande` pro bege. */
  explosao(v = 1, grande = false) {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 6000, ate: 1500, vol: 0.5 * v, tipo: 'bandpass', q: 0.5 });
    estouro({ dur: grande ? 2.2 : 1.6, de: 1400, ate: 35, vol: 0.9 * v });
    voz({ pontos: [[0, 70], [0.6, 28]], vol: 0.5 * v, onda: 'sine' });
    for (let k = 0; k < (grande ? 10 : 6); k++) estouro({ dur: 0.05, de: sorte(1800, 4500), vol: 0.1 * v, tipo: 'bandpass', q: 4, atraso: 0.3 + Math.random() * 1.2 });
    estouro({ dur: 1.2, de: 400, ate: 60, vol: 0.25 * v, atraso: 0.9 });   // destroço batendo no chão
  },
  /** Míssil caindo: assobio que desce. */
  missil(dur = 1.6, v = 1) {
    if (!pronto()) return;
    voz({ pontos: [[0, 2400], [dur, 500]], vol: 0.07 * v, onda: 'sine', vibrato: 12, vibHz: 9 });
    estouro({ dur: 0.15, de: 1500, vol: 0.12 * v, tipo: 'bandpass' });
  },
  /** Míssil no chão. */
  impacto(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 1.1, de: 900, ate: 30, vol: 0.8 * v });
    voz({ pontos: [[0, 60], [0.4, 30]], vol: 0.45 * v, onda: 'sine' });
    for (let k = 0; k < 5; k++) estouro({ dur: 0.06, de: sorte(800, 2000), vol: 0.12 * v, tipo: 'bandpass', q: 3, atraso: 0.15 + k * 0.1 });
  },
  /** Fui pego: zumbido no ouvido. */
  zumbido() {
    if (!pronto()) return;
    voz({ pontos: [[0, 3600], [1.6, 3500]], vol: 0.05, onda: 'sine' });
  },
  /** Foguete pegou o míssil: estalo seco. */
  intercepta() {
    if (!pronto()) return;
    estouro({ dur: 0.5, de: 3000, ate: 200, vol: 0.5 });
    voz({ pontos: [[0, 1200], [0.15, 1800]], vol: 0.08, onda: 'triangle' });
  },
  /** Plim do abate (sobe com o combo). */
  ponto(combo = 1) {
    if (!pronto()) return;
    const base = 660 * 2 ** (Math.min(combo - 1, 5) / 6);
    [1, 1.25, 1.5].forEach((m, i) => voz({ pontos: [[0, base * m], [0.12, base * m]], vol: 0.09, onda: 'square', atraso: i * 0.06, filtro: 2500, q: 0.6 }));
  },
  bip(alto = false) { if (!pronto()) return; voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.4 : 0.15, alto ? 990 : 660]], vol: 0.16, onda: 'square' }); },
  tique() { if (!pronto()) return; voz({ pontos: [[0, 1500], [0.05, 1500]], vol: 0.06, onda: 'square' }); },
  fanfarra() {
    if (!pronto()) return;
    [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [i === 6 ? 0.8 : 0.16, f]], vol: 0.18, onda: 'square', atraso: i * 0.13, filtro: 2000, q: 0.5 }));
  },
  derrota() { if (!pronto()) return; [392, 370, 349, 330].forEach((f, i) => voz({ pontos: [[0, f], [i === 3 ? 0.8 : 0.3, f * (i === 3 ? 0.97 : 1)]], vol: 0.13, onda: 'sawtooth', atraso: i * 0.32, vibrato: i === 3 ? 6 : 0, filtro: 900 })); },
  /** Últimos segundos: trilha acelera. */
  apertar() { if (musica) musica.bpm = 140; },
  parar() { pararMusica(); if (helice && ctx) helice.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 1); },
  desligar() {
    pararMusica();
    if (helice) { try { helice.src.stop(); helice.lfo.stop(); helice.tu.stop(); } catch { /* já parou */ } helice = null; }
    window.speechSynthesis?.cancel();
  },
  fala(texto, prioridade = false) {
    if (mudo || !window.speechSynthesis) return;
    const agora = performance.now();
    if (!prioridade && agora - ultimaFala < 2200) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.9; u.rate = 1.2; u.volume = 0.95;
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
