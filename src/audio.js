/** Web Audio: 5 distinct glass clinks, wave whoosh, soft fart.
 * Autoplay policy: AudioContext stays suspended until a user gesture.
 * Call unlockAudio() from pointer/key/touch handlers before sounds will play.
 */

let ctx = null;
let unlocked = false;

export function ensureAudio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Must run inside a user-gesture stack (pointer/key/touch). Unlocks iOS/Chrome autoplay. */
export function unlockAudio() {
  const c = ensureAudio();
  if (!c) return Promise.resolve(null);

  const finish = () => {
    unlocked = c.state === 'running';
    return c;
  };

  // Silent one-sample buffer — required unlock path on many iOS versions
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate || 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }

  if (c.state === 'suspended') {
    return c.resume().then(finish).catch(() => c);
  }
  return Promise.resolve(finish());
}

export function isAudioUnlocked() {
  return unlocked && ctx && ctx.state === 'running';
}

function canPlay() {
  const c = ensureAudio();
  if (!c) return null;
  if (c.state !== 'running') {
    // Best-effort resume if a gesture already happened but state lagged
    c.resume().catch(() => {});
    if (c.state !== 'running') return null;
  }
  return c;
}

function tone(freq, dur, type, gain, when = 0, slideTo = null) {
  const c = canPlay();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, gain, when = 0, hp = 800) {
  const c = canPlay();
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
  () => { tone(1840, 0.08, 'triangle', 0.18); tone(2760, 0.06, 'sine', 0.09, 0.02); },
  () => { tone(1520, 0.09, 'sine', 0.16); tone(2280, 0.05, 'triangle', 0.08, 0.015); },
  () => { tone(2100, 0.07, 'square', 0.08); tone(3150, 0.05, 'sine', 0.06, 0.02); },
  () => { tone(1320, 0.1, 'triangle', 0.17); tone(1980, 0.07, 'sine', 0.08, 0.025); },
  () => { tone(2450, 0.06, 'sine', 0.14); tone(1680, 0.08, 'triangle', 0.09, 0.01); },
];

export function playClink() {
  unlockAudio();
  CLINKS[Math.floor(Math.random() * CLINKS.length)]();
}

export function playWaveWhoosh(dir = 'in') {
  unlockAudio();
  if (dir === 'in') {
    noiseBurst(0.9, 0.08, 0, 200);
    tone(90, 0.85, 'sine', 0.06, 0, 55);
  } else {
    noiseBurst(1.1, 0.07, 0, 150);
    tone(70, 1.0, 'sine', 0.055, 0, 40);
  }
}

export function playFart() {
  unlockAudio();
  tone(110, 0.35, 'sawtooth', 0.22, 0, 45);
  tone(70, 0.45, 'square', 0.12, 0.05, 30);
  noiseBurst(0.4, 0.1, 0.08, 80);
}
