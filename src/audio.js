/** Web Audio: 5 distinct glass clinks, wave whoosh, soft fart. */

let ctx = null;

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type, gain, when = 0, slideTo = null) {
  const c = ensureAudio();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, gain, when = 0, hp = 800) {
  const c = ensureAudio();
  if (!c) return;
  const t0 = c.currentTime + when;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const CLINKS = [
  () => { tone(1840, 0.08, 'triangle', 0.12); tone(2760, 0.06, 'sine', 0.06, 0.02); },
  () => { tone(1520, 0.09, 'sine', 0.1); tone(2280, 0.05, 'triangle', 0.05, 0.015); },
  () => { tone(2100, 0.07, 'square', 0.05); tone(3150, 0.05, 'sine', 0.04, 0.02); },
  () => { tone(1320, 0.1, 'triangle', 0.11); tone(1980, 0.07, 'sine', 0.05, 0.025); },
  () => { tone(2450, 0.06, 'sine', 0.09); tone(1680, 0.08, 'triangle', 0.06, 0.01); },
];

export function playClink() {
  ensureAudio();
  CLINKS[Math.floor(Math.random() * CLINKS.length)]();
}

export function playWaveWhoosh(dir = 'in') {
  ensureAudio();
  // Soft whoosh: filtered noise + low sweep
  if (dir === 'in') {
    noiseBurst(0.9, 0.045, 0, 200);
    tone(90, 0.85, 'sine', 0.035, 0, 55);
  } else {
    noiseBurst(1.1, 0.04, 0, 150);
    tone(70, 1.0, 'sine', 0.03, 0, 40);
  }
}

export function playFart() {
  ensureAudio();
  tone(110, 0.35, 'sawtooth', 0.14, 0, 45);
  tone(70, 0.45, 'square', 0.08, 0.05, 30);
  noiseBurst(0.4, 0.06, 0.08, 80);
}
