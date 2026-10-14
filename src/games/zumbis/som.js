/**
 * Sons do Zombie Rush (base: games/bazuca/som.js), sintetizados na hora (Web Audio):
 * cada arma com o seu tiro, lança-chamas chiando, zumbi gemendo/mordendo, gigante
 * rugindo, explosões, sirene de onda nova, música eletrônica que acelera nos
 * últimos 10s, vitória/derrota e o locutor (speechSynthesis em pt-BR).
 * Música e efeitos têm volume separado (dois botões).
 */
let ctx = null;
let efeitos = null;
let trilha = null;
let ruidoBuf = null;
let semEfeitos = false;
let semMusica = false;
let ultimaFala = 0;
let musica = null;

export function destravar() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();   // horda inteira atirando: não estoura
    comp.threshold.value = -16; comp.ratio.value = 6;
    comp.connect(ctx.destination);
    efeitos = ctx.createGain(); efeitos.gain.value = semEfeitos ? 0 : 0.55; efeitos.connect(comp);
    trilha = ctx.createGain(); trilha.gain.value = semMusica ? 0 : 0.32; trilha.connect(comp);
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const pronto = () => ctx && !semEfeitos && ctx.state === 'running';
const sorte = (a, b) => a + Math.random() * (b - a);

function estouro({ dur, de, ate = de, vol = 0.5, tipo = 'lowpass', q = 0.8, atraso = 0, saida = efeitos, ataque = 0 }) {
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

function voz({ pontos, vol = 0.25, onda = 'sine', vibrato = 0, vibHz = 28, atraso = 0, filtro = null, q = 1, saida = efeitos }) {
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
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(saida);
  o.start(t); o.stop(t + dur + 0.02);
}

// ------------------------------------------- trilha eletrônica de ação
// bumbo 4/4, chimbal, baixo serrote em semicolcheia (Ré menor), arpejo e um lead no fim. Agenda 0,3s à frente.
const BAIXO = [73.4, 73.4, 87.3, 73.4, 65.4, 65.4, 82.4, 65.4];
const ARPEJO = [293.7, 349.2, 440, 587.3, 440, 349.2];
function tocarMusica() {
  if (musica || !ctx) return;
  const saida = ctx.createGain(); saida.gain.value = 1; saida.connect(trilha);
  const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 900; filtro.Q.value = 6; filtro.connect(saida);
  musica = { saida, filtro, passo: 0, t: ctx.currentTime + 0.1, bpm: 128, timer: null, tenso: false };
  const agendar = () => {
    if (!ctx || !musica) return;
    while (musica.t < ctx.currentTime + 0.3) {
      const s = musica.passo % 16, compasso = Math.floor(musica.passo / 16), t = musica.t, a = t - ctx.currentTime;
      if (s % 4 === 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(g).connect(saida); o.start(t); o.stop(t + 0.25);
      }
      if (s % 4 === 2) estouro({ dur: 0.05, de: 9000, vol: 0.09, tipo: 'highpass', atraso: a, saida });
      if (s === 4 || s === 12) estouro({ dur: 0.14, de: 1800, ate: 700, vol: 0.18, tipo: 'bandpass', q: 0.7, atraso: a, saida });
      const sobe = compasso % 8 >= 4 ? 1.189 : 1;
      nota(t, BAIXO[Math.floor(s / 2) % 8] * sobe, 0.12, 0.22, 'sawtooth', filtro);
      if (s % 2 === 1 && compasso % 2) nota(t, ARPEJO[(musica.passo >> 1) % ARPEJO.length] * sobe, 0.1, 0.05, 'square', saida);
      if (musica.tenso && s % 2 === 0) nota(t, ARPEJO[(s >> 1) % ARPEJO.length] * 2 * sobe, 0.09, 0.05, 'sawtooth', saida);
      // o filtro abre e fecha devagar (respira)
      filtro.frequency.setValueAtTime(700 + 600 * (0.5 + 0.5 * Math.sin(musica.passo / 16)), t);
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
  try { m.saida.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => m.saida.disconnect(), 2500); } catch { /* fechou */ }
}

const TIROS = {
  pistola(v) {
    estouro({ dur: 0.09, de: 4000, ate: 600, vol: 0.45 * v, tipo: 'bandpass', q: 0.6 });
    voz({ pontos: [[0, 160], [0.08, 60]], vol: 0.3 * v });
  },
  metralhadora(v) {
    estouro({ dur: 0.06, de: 5000, ate: 900, vol: 0.35 * v, tipo: 'bandpass', q: 0.8 });
    voz({ pontos: [[0, 120], [0.05, 60]], vol: 0.22 * v });
  },
  escopeta(v) {
    estouro({ dur: 0.35, de: 2400, ate: 80, vol: 0.8 * v });
    estouro({ dur: 0.1, de: 6000, ate: 1500, vol: 0.3 * v, tipo: 'bandpass' });
    voz({ pontos: [[0, 90], [0.2, 35]], vol: 0.5 * v });
    estouro({ dur: 0.05, de: 2500, vol: 0.15 * v, tipo: 'bandpass', q: 8, atraso: 0.32 });   // claque-claque
    estouro({ dur: 0.05, de: 1800, vol: 0.15 * v, tipo: 'bandpass', q: 8, atraso: 0.42 });
  },
  bazuca(v) {
    estouro({ dur: 0.3, de: 1600, ate: 70, vol: 0.7 * v });
    voz({ pontos: [[0, 80], [0.2, 35]], vol: 0.45 * v });
    estouro({ dur: 0.9, de: 5000, ate: 1200, vol: 0.18 * v, tipo: 'bandpass', q: 1.4, atraso: 0.05, ataque: 0.06 });
  },
  lanca(v) { estouro({ dur: 0.12, de: 900, ate: 500, vol: 0.18 * v, tipo: 'bandpass', q: 0.5, ataque: 0.02 }); },
};

export const som = {
  tiro(arma, v = 1) { if (pronto()) (TIROS[arma] ?? TIROS.pistola)(v); },
  /** Plim de bala acertando carne (curto, pra não embolar). */
  acerto(v = 1) { if (pronto()) estouro({ dur: 0.07, de: 900, ate: 300, vol: 0.25 * v, tipo: 'bandpass', q: 2 }); },
  cabeca() { if (pronto()) { voz({ pontos: [[0, 1500], [0.08, 2200]], vol: 0.1, onda: 'triangle' }); estouro({ dur: 0.12, de: 1200, ate: 300, vol: 0.3 }); } },
  /** Zumbi caindo: splat + gemido final. */
  morte(tipo, v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.25, de: 700, ate: 120, vol: 0.4 * v });
    const g = tipo === 'gigante' ? 0.5 : tipo === 'corredor' ? 1.8 : 1;
    if (tipo === 'corredor') voz({ pontos: [[0, 700], [0.3, 300]], vol: 0.1 * v, onda: 'sawtooth', filtro: 900, vibrato: 30, vibHz: 18 });   // ganido
    else voz({ pontos: [[0, 180 * g], [0.5, 90 * g]], vol: 0.13 * v, onda: 'sawtooth', filtro: 500 * g, q: 2, vibrato: 8, vibHz: 7 });
  },
  /** Grunhido do zumbi brotando (cada tipo num tom). */
  gemido(tipo, v = 1) {
    if (!pronto()) return;
    if (tipo === 'corredor') { voz({ pontos: [[0, 300], [0.15, 420], [0.3, 260]], vol: 0.08 * v, onda: 'sawtooth', filtro: 800, vibrato: 25, vibHz: 22 }); return; }
    const g = tipo === 'gigante' ? 0.45 : tipo === 'explosivo' ? 0.75 : tipo === 'saltador' ? 1.2 : 1;
    voz({ pontos: [[0, 140 * g], [0.4, 175 * g], [0.9, 110 * g]], vol: 0.09 * v, onda: 'sawtooth', filtro: 420 * g + 100, q: 3, vibrato: 10, vibHz: 6 });
    estouro({ dur: 0.8, de: 600 * g, ate: 300, vol: 0.05 * v, tipo: 'bandpass', q: 2 });
  },
  mordida(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.08, de: 2500, vol: 0.4 * v, tipo: 'bandpass', q: 3 });
    estouro({ dur: 0.2, de: 600, ate: 150, vol: 0.4 * v, atraso: 0.04 });
  },
  ai() { if (pronto()) voz({ pontos: [[0, 520], [0.18, 330]], vol: 0.14, onda: 'triangle', vibrato: 20 }); },
  morri() { if (pronto()) { voz({ pontos: [[0, 600], [0.9, 120]], vol: 0.16, onda: 'sawtooth', filtro: 900, vibrato: 12 }); estouro({ dur: 0.5, de: 500, ate: 60, vol: 0.4 }); } },
  explosao(v = 1, grande = false) {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 6000, ate: 1500, vol: 0.5 * v, tipo: 'bandpass', q: 0.5 });
    estouro({ dur: grande ? 2 : 1.4, de: 1300, ate: 35, vol: 0.95 * v });
    voz({ pontos: [[0, 70], [0.6, 28]], vol: 0.5 * v });
    for (let k = 0; k < 6; k++) estouro({ dur: 0.05, de: sorte(1800, 4500), vol: 0.1 * v, tipo: 'bandpass', q: 4, atraso: 0.3 + Math.random() * 1 });
  },
  pulo(duplo) { if (pronto()) voz({ pontos: [[0, duplo ? 380 : 240], [0.12, duplo ? 760 : 480]], vol: 0.08, onda: 'triangle' }); },
  passo(v = 1) { if (pronto()) estouro({ dur: 0.04, de: sorte(700, 1100), vol: 0.07 * v, tipo: 'bandpass', q: 3 }); },
  pega(arma) {
    if (!pronto()) return;
    estouro({ dur: 0.05, de: 3500, vol: 0.2, tipo: 'bandpass', q: 6 });
    estouro({ dur: 0.06, de: 2200, vol: 0.22, tipo: 'bandpass', q: 6, atraso: 0.1 });
    if (arma) voz({ pontos: [[0, 500], [0.2, 900]], vol: 0.07, onda: 'square', filtro: 1500, atraso: 0.12 });
    else [660, 880, 1320].forEach((f, i) => voz({ pontos: [[0, f], [0.1, f]], vol: 0.08, onda: 'triangle', atraso: i * 0.06 }));
  },
  vazio() { if (pronto()) estouro({ dur: 0.04, de: 3000, vol: 0.2, tipo: 'bandpass', q: 8 }); },
  /** Onda nova: sirene curta. Chefe: rugido grave + tremor. */
  sirene() {
    if (!pronto()) return;
    voz({ pontos: [[0, 600], [0.5, 1000], [1, 600], [1.5, 1000], [2, 620]], vol: 0.1, onda: 'sawtooth', filtro: 1200 });
  },
  rugido() {
    if (!pronto()) return;
    voz({ pontos: [[0, 90], [0.5, 130], [1.6, 60]], vol: 0.45, onda: 'sawtooth', filtro: 300, q: 2, vibrato: 14, vibHz: 9 });
    estouro({ dur: 1.8, de: 700, ate: 90, vol: 0.4, ataque: 0.2 });
  },
  combo(n) {
    if (!pronto()) return;
    const base = n >= 10 ? 880 : 660;
    [1, 1.26, 1.5, 2].forEach((m, i) => voz({ pontos: [[0, base * m], [0.12, base * m]], vol: 0.1, onda: 'square', atraso: i * 0.06, filtro: 3000, q: 0.5 }));
  },
  ponto() { if (pronto()) voz({ pontos: [[0, 1320], [0.06, 1320]], vol: 0.04, onda: 'triangle' }); },
  bip(alto = false) { if (pronto()) voz({ pontos: [[0, alto ? 990 : 660], [alto ? 0.4 : 0.15, alto ? 990 : 660]], vol: 0.16, onda: 'square' }); },
  fanfarra() {
    if (!pronto()) return;
    [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => voz({ pontos: [[0, f], [i === 6 ? 0.8 : 0.16, f]], vol: 0.18, onda: 'square', atraso: i * 0.13, filtro: 2200, q: 0.5 }));
  },
  derrota() { if (pronto()) [392, 370, 349, 330].forEach((f, i) => voz({ pontos: [[0, f], [i === 3 ? 0.8 : 0.3, f * (i === 3 ? 0.97 : 1)]], vol: 0.13, onda: 'sawtooth', atraso: i * 0.32, vibrato: i === 3 ? 6 : 0, filtro: 900 })); },
  largada() { tocarMusica(); if (!pronto()) return; estouro({ dur: 0.8, de: 900, ate: 40, vol: 0.6 }); },
  /** Últimos 10s: a música acelera e ganha o lead. */
  apertar() { if (musica) { musica.bpm = 150; musica.tenso = true; } },
  parar() { pararMusica(); },
  desligar() { pararMusica(); window.speechSynthesis?.cancel(); },
  fala(texto, prioridade = false) {
    if (semEfeitos || !window.speechSynthesis) return;
    const agora = performance.now();
    if (!prioridade && agora - ultimaFala < 2000) return;
    ultimaFala = agora;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR'; u.pitch = 0.8; u.rate = 1.15; u.volume = 0.95;
    const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  get semEfeitos() { return semEfeitos; },
  get semMusica() { return semMusica; },
  alternarEfeitos() {
    semEfeitos = !semEfeitos;
    if (efeitos) efeitos.gain.setTargetAtTime(semEfeitos ? 0 : 0.55, ctx.currentTime, 0.05);
    if (semEfeitos) window.speechSynthesis?.cancel();
  },
  alternarMusica() {
    semMusica = !semMusica;
    if (trilha) trilha.gain.setTargetAtTime(semMusica ? 0 : 0.32, ctx.currentTime, 0.05);
  },
};
