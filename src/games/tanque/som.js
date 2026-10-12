/**
 * Sons da batalha de tanques, sintetizados na hora (Web Audio): sem arquivo
 * pra baixar. Ruído filtrado faz tiro e explosão; oscilador faz o "ping" do
 * metal, os bipes da contagem e o ronco do motor.
 *
 * O navegador só libera áudio depois de um toque: `destravar()` no primeiro.
 */
let ctx = null;
let mestre = null;
let ruidoBuf = null;
let motor = null;
let mudo = false;

export function destravar() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    mestre = ctx.createGain();
    mestre.gain.value = 0.55;
    mestre.connect(ctx.destination);
    // 2s de ruído branco, reaproveitado por todo som de estouro
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = ruidoBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

const pronto = () => ctx && !mudo && ctx.state === 'running';

/** Ruído passando por um filtro que varre de `de` até `ate` Hz, com volume caindo. */
function estouro({ dur, de, ate = de, vol = 0.5, tipo = 'lowpass', q = 0.8, atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const src = ctx.createBufferSource();
  src.buffer = ruidoBuf;
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.Q.value = q;
  f.frequency.setValueAtTime(de, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, ate), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(mestre);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tom({ dur, de, ate = de, vol = 0.3, onda = 'sine', atraso = 0 }) {
  const t = ctx.currentTime + atraso;
  const o = ctx.createOscillator();
  o.type = onda;
  o.frequency.setValueAtTime(de, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, ate), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(mestre);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** `v`: 0..1 — o que acontece longe do meu tanque soa mais baixo. */
export const som = {
  tiro(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.16, de: 4000, ate: 900, vol: 0.45 * v, tipo: 'highpass' });
    estouro({ dur: 0.3, de: 900, ate: 120, vol: 0.5 * v });
    tom({ dur: 0.22, de: 150, ate: 45, vol: 0.6 * v });
  },
  explosao(grande = false, v = 1) {
    if (!pronto()) return;
    const dur = grande ? 1.5 : 0.9;
    estouro({ dur, de: grande ? 2200 : 1600, ate: 90, vol: (grande ? 1 : 0.8) * v });
    tom({ dur: dur * 0.8, de: grande ? 80 : 95, ate: 28, vol: (grande ? 0.9 : 0.7) * v });
    // estalos de destroço caindo
    for (let i = 0; i < (grande ? 6 : 3); i++) {
      estouro({ dur: 0.06, de: 2500 + Math.random() * 2000, vol: 0.18 * v, tipo: 'bandpass', q: 3, atraso: 0.1 + Math.random() * 0.5 });
    }
  },
  acerto(v = 1) {
    if (!pronto()) return;
    tom({ dur: 0.14, de: 1300, ate: 380, vol: 0.22 * v, onda: 'square' });
    tom({ dur: 0.4, de: 2400, ate: 2200, vol: 0.06 * v, onda: 'triangle' });   // o "ping" que fica
    estouro({ dur: 0.1, de: 3500, vol: 0.3 * v, tipo: 'bandpass', q: 2 });
  },
  impacto(v = 1) {
    if (!pronto()) return;
    estouro({ dur: 0.12, de: 1400, ate: 300, vol: 0.35 * v, tipo: 'bandpass', q: 1.5 });
  },
  caixa(quebrou = false, v = 1) {
    if (!pronto()) return;
    estouro({ dur: quebrou ? 0.35 : 0.15, de: 1800, ate: 500, vol: 0.4 * v, tipo: 'bandpass', q: 2 });
    for (let i = 0; i < (quebrou ? 5 : 2); i++) {
      estouro({ dur: 0.05, de: 900 + Math.random() * 1500, vol: 0.2 * v, tipo: 'bandpass', q: 4, atraso: Math.random() * 0.25 });
    }
  },
  bip(alto = false) {
    if (!pronto()) return;
    tom({ dur: alto ? 0.45 : 0.15, de: alto ? 990 : 660, vol: 0.25, onda: 'square' });
  },
  vitoria() {
    if (!pronto()) return;
    [523, 659, 784, 1047].forEach((f, i) => tom({ dur: 0.25, de: f, vol: 0.2, onda: 'triangle', atraso: i * 0.12 }));
  },
  /** Ronco contínuo enquanto o meu tanque anda; para sozinho quando ele para. */
  motor(ligado) {
    if (!ctx) return;
    if (!motor) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 42;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 170;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(mestre);
      o.start();
      motor = { o, g };
    }
    const alvo = ligado && !mudo ? 0.13 : 0;
    motor.g.gain.setTargetAtTime(alvo, ctx.currentTime, 0.08);
    motor.o.frequency.setTargetAtTime(ligado ? 55 : 42, ctx.currentTime, 0.2);
  },
  parar() {
    if (motor) { motor.o.stop(); motor = null; }
  },
  get mudo() { return mudo; },
  alternarMudo() { mudo = !mudo; if (mudo) som.motor(false); return mudo; },
};
