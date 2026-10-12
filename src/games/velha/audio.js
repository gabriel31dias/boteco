// Every sound in the game is synthesised here. No audio files, no loading screen.
import { settings, bus } from './state.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let ambient = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = settings.sound ? 0.85 : 0;
  master.connect(ctx.destination);

  const len = ctx.sampleRate * 1.2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

/** Call from the first pointerdown — browsers block audio before a gesture. */
export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (settings.sound) startAmbient();
}

function tone({ freq, to = null, dur = 0.18, type = 'sine', vol = 0.2, delay = 0, cutoff = 0, attack = 0.008 }) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur * 0.85);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  let node = osc;
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.9;
    node.connect(f);
    node = f;
  }
  node.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.12, from = 400, to = 3000, q = 4, delay = 0 }) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const chord = (freqs, opts, gap = 0.085) =>
  freqs.forEach((f, i) => tone({ freq: f, delay: i * gap, ...opts }));

export const SFX = {
  hover: () => tone({ freq: 1180, to: 1320, dur: 0.05, type: 'sine', vol: 0.035, cutoff: 4000 }),
  button: () => {
    tone({ freq: 620, to: 880, dur: 0.07, type: 'triangle', vol: 0.10, cutoff: 3200 });
    tone({ freq: 1240, dur: 0.05, type: 'sine', vol: 0.04, delay: 0.03 });
  },
  press: () => tone({ freq: 300, to: 190, dur: 0.09, type: 'triangle', vol: 0.11, cutoff: 1800 }),

  drawX: () => {
    noise({ dur: 0.16, vol: 0.05, from: 900, to: 4200, q: 2 });
    tone({ freq: 540, to: 810, dur: 0.13, type: 'triangle', vol: 0.11, cutoff: 2800 });
    tone({ freq: 660, to: 990, dur: 0.14, type: 'triangle', vol: 0.10, cutoff: 3000, delay: 0.11 });
    tone({ freq: 1320, dur: 0.20, type: 'sine', vol: 0.045, delay: 0.20 });
  },
  drawO: () => {
    tone({ freq: 300, to: 620, dur: 0.30, type: 'sine', vol: 0.12, cutoff: 2200 });
    tone({ freq: 620, dur: 0.42, type: 'sine', vol: 0.05, delay: 0.26 });
    noise({ dur: 0.22, vol: 0.035, from: 600, to: 2200, q: 3, delay: 0.22 });
  },
  cpuThink: () => tone({ freq: 420, dur: 0.09, type: 'sine', vol: 0.045, cutoff: 1600 }),

  win: () => {
    chord([523.25, 659.25, 783.99, 1046.5], { dur: 0.6, type: 'triangle', vol: 0.10, cutoff: 3400 }, 0.085);
    tone({ freq: 130.81, dur: 1.1, type: 'sine', vol: 0.09, delay: 0.02 });
    noise({ dur: 0.5, vol: 0.045, from: 1200, to: 6000, q: 1.4, delay: 0.05 });
  },
  lose: () => {
    chord([440, 392, 329.63, 261.63], { dur: 0.65, type: 'sine', vol: 0.09, cutoff: 1500 }, 0.115);
    tone({ freq: 98, dur: 1.2, type: 'sine', vol: 0.075, delay: 0.1 });
  },
  draw: () => {
    tone({ freq: 392, dur: 0.42, type: 'triangle', vol: 0.09, cutoff: 2000 });
    tone({ freq: 415.3, dur: 0.55, type: 'triangle', vol: 0.075, cutoff: 2000, delay: 0.13 });
  },
  series: () => {
    chord([523.25, 659.25, 783.99, 1046.5, 1318.5], { dur: 0.9, type: 'triangle', vol: 0.10, cutoff: 4000 }, 0.075);
    chord([392, 523.25, 659.25], { dur: 1.4, type: 'sine', vol: 0.06, cutoff: 2400 }, 0.0);
    noise({ dur: 0.9, vol: 0.05, from: 900, to: 7000, q: 1.1 });
  },

  sweep: () => noise({ dur: 0.42, vol: 0.06, from: 500, to: 5200, q: 1.8 }),
  tick: () => tone({ freq: 880, dur: 0.08, type: 'sine', vol: 0.06, cutoff: 3000 }),
  // cha-ching, then a scatter of coins hitting the pile
  coins: () => {
    tone({ freq: 1568, dur: 0.16, type: 'triangle', vol: 0.10, cutoff: 6000 });
    tone({ freq: 2093, dur: 0.32, type: 'triangle', vol: 0.09, cutoff: 6000, delay: 0.07 });
    noise({ dur: 0.5, vol: 0.028, from: 3000, to: 6500, q: 3, delay: 0.10 });
    for (let i = 0; i < 9; i++) {
      const f = 1400 + Math.random() * 1700;
      tone({
        freq: f, to: f * 0.82, dur: 0.09, type: 'sine', vol: 0.05, cutoff: 7000,
        delay: 0.14 + i * 0.055 + Math.random() * 0.03,
      });
    }
  },

  // climbs a semitone per win, so a long streak audibly escalates
  streak: (n = 2) => {
    const base = 523.25 * 2 ** (Math.min(n - 2, 7) / 12);
    [0, 4, 7, 12].forEach((st, i) => tone({
      freq: base * 2 ** (st / 12), delay: i * 0.055, dur: 0.34,
      type: 'triangle', vol: 0.085, cutoff: 4600,
    }));
  },
  reset: () => {
    noise({ dur: 0.32, vol: 0.05, from: 2600, to: 500, q: 2 });
    tone({ freq: 220, to: 560, dur: 0.26, type: 'sine', vol: 0.07, cutoff: 1800 });
  },
};

export function play(name, arg) {
  if (!settings.sound) return;
  SFX[name]?.(arg);
}

// --- ambient pad: three detuned oscillators through a slowly breathing lowpass ---
function startAmbient() {
  if (ambient || !ensure()) return;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 620;
  filter.Q.value = 1.2;
  filter.connect(gain).connect(master);

  const oscs = [110, 164.81, 220.5, 329.63].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'sine' : 'triangle';
    o.frequency.value = f * (1 + (i - 1.5) * 0.0015);
    const g = ctx.createGain();
    g.gain.value = i === 3 ? 0.10 : 0.30;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });

  // slow LFO on cutoff + volume so the pad never sits still
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.055;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);
  ambient = { gain, oscs, lfo, filter };
}

bus.on('sound', (on) => {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(on ? 0.85 : 0, ctx.currentTime + 0.25);
  if (on) startAmbient();
});
