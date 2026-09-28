import {
  FIXED_DT,
  createState,
  update,
  activeGlass,
  waterEdgeY,
  isGlassSubmerged,
  applyWaveHit,
  setKeyboardMode,
  setMouseMode,
  setHeldCents,
  GLASS_SPAWN_BELOW_WATER,
  FINALE_CENTS,
  WAVE_GLASS_PUSH_FRAC,
} from './game.js';
import {
  drawBeach,
  drawCrab,
  drawTerryLabel,
  drawSeaGlass,
  drawFartCloud,
  drawSeagull,
  drawHUD,
} from './draw.js';
import {
  unlockAudio,
  playClink,
  playWaveWhoosh,
  playFart,
  playBoing,
  playSeagull,
  isAudioUnlocked,
  getAudioState,
  AUDIO_UNLOCK_EVENTS,
} from './audio.js';

const canvas = document.getElementById('beach');
const ctx = canvas.getContext('2d');

let state = null;
let accum = 0;
let last = performance.now();
let facing = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!state) {
    state = createState(w, h);
  } else {
    const ox = state.terry.x / state.w;
    const oy = state.terry.y / state.h;
    state.w = w;
    state.h = h;
    state.terry.x = ox * w;
    state.terry.y = oy * h;
  }
}

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches && e.touches[0] ? e.touches[0] : e;
  return {
    x: ((src.clientX - r.left) / r.width) * state.w,
    y: ((src.clientY - r.top) / r.height) * state.h,
  };
}

function onPointer(e, active) {
  unlockAudio();
  if (!state || state.mode !== 'play') return;
  const p = canvasPos(e);
  if (active) {
    setMouseMode(state, p.x, p.y);
  } else {
    state.pointer.active = false;
    state.pointer.x = p.x;
    state.pointer.y = p.y;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  canvas.setPointerCapture?.(e.pointerId);
  onPointer(e, true);
});
canvas.addEventListener('mousedown', () => { unlockAudio(); });
canvas.addEventListener('click', () => { unlockAudio(); });
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || (e.pointerType === 'touch' && state?.pointer.active)) onPointer(e, true);
  else if (e.pointerType === 'mouse') {
    if (!state) return;
    unlockAudio();
    const p = canvasPos(e);
    setMouseMode(state, p.x, p.y);
  }
});
canvas.addEventListener('pointerup', () => {
  if (state) state.pointer.active = false;
});
canvas.addEventListener('pointerleave', () => {
  if (state) state.pointer.active = false;
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  unlockAudio();
  onPointer(e, true);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointer(e, true); }, { passive: false });
canvas.addEventListener('touchend', () => { if (state) state.pointer.active = false; });

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (!state) return;
  const k = e.key.toLowerCase();
  if (k in state.keys) {
    state.keys[k] = true;
    setKeyboardMode(state);
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (!state) return;
  const k = e.key.toLowerCase();
  if (k in state.keys) state.keys[k] = false;
});

function unlockOnce() {
  unlockAudio();
}
for (const ev of AUDIO_UNLOCK_EVENTS) {
  window.addEventListener(ev, unlockOnce, { capture: true, passive: true });
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

function render() {
  const w = state.w;
  const h = state.h;
  const waterY = waterEdgeY(state.wavePhase, h);
  drawBeach(ctx, w, h, waterY, state.wavePhase);

  for (const g of activeGlass(state)) {
    if (isGlassSubmerged(g, waterY)) continue;
    drawSeaGlass(ctx, g);
  }

  for (const c of state.fartClouds) drawFartCloud(ctx, c);

  if (state.seagull) drawSeagull(ctx, state.seagull.x, state.seagull.y);

  if (state.terry.vx < -5) facing = -1;
  else if (state.terry.vx > 5) facing = 1;

  if (state.terry.y > -80) {
    drawCrab(ctx, state.terry.x, state.terry.y, facing);
    drawTerryLabel(ctx, state.terry.x, state.terry.y - 22);
  }

  drawHUD(ctx, state.currentCents, w);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  accum += dt;
  while (accum >= FIXED_DT) {
    const ev = update(state, FIXED_DT);
    if (ev.clinks) for (let i = 0; i < ev.clinks; i++) playClink();
    if (ev.waveWhoosh) playWaveWhoosh(ev.waveWhoosh);
    if (ev.fart) playFart();
    if (ev.waveHit) playBoing();
    if (ev.seagull) playSeagull();
    accum -= FIXED_DT;
  }
  render();
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);

window.__TERRY__ = {
  getState: () => state,
  getScore: () => state?.currentCents ?? 0,
  getCurrentCents: () => state?.currentCents ?? 0,
  setHeldCents: (n) => (state ? setHeldCents(state, n) : null),
  unlockAudio,
  isAudioUnlocked,
  getAudioState,
  AUDIO_UNLOCK_EVENTS,
  applyWaveHit: () => (state ? applyWaveHit(state) : null),
  GLASS_SPAWN_BELOW_WATER,
  FINALE_CENTS,
  WAVE_GLASS_PUSH_FRAC,
};
