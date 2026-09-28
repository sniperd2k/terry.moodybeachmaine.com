import {
  FIXED_DT,
  createState,
  update,
  activeGlass,
  waterEdgeY,
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
import { ensureAudio, playClink, playWaveWhoosh, playFart } from './audio.js';

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
  ensureAudio();
  if (!state || state.mode !== 'play') return;
  const p = canvasPos(e);
  state.pointer.active = active;
  state.pointer.x = p.x;
  state.pointer.y = p.y;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  onPointer(e, true);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || (e.pointerType === 'touch' && state?.pointer.active)) onPointer(e, true);
  else if (e.pointerType === 'mouse') {
    // soft follow while mouse is over canvas
    if (!state) return;
    const p = canvasPos(e);
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.active = true;
  }
});
canvas.addEventListener('pointerup', () => {
  if (state) state.pointer.active = false;
});
canvas.addEventListener('pointerleave', () => {
  if (state) state.pointer.active = false;
});
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointer(e, true); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); onPointer(e, true); }, { passive: false });
canvas.addEventListener('touchend', () => { if (state) state.pointer.active = false; });

window.addEventListener('keydown', (e) => {
  ensureAudio();
  if (!state) return;
  const k = e.key.toLowerCase();
  if (k in state.keys) {
    state.keys[k] = true;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (!state) return;
  const k = e.key.toLowerCase();
  if (k in state.keys) state.keys[k] = false;
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

function render() {
  const w = state.w;
  const h = state.h;
  const waterY = waterEdgeY(state.wavePhase, h);
  drawBeach(ctx, w, h, waterY, state.wavePhase);

  for (const g of activeGlass(state)) drawSeaGlass(ctx, g);

  for (const c of state.fartClouds) drawFartCloud(ctx, c);

  if (state.seagull) drawSeagull(ctx, state.seagull.x, state.seagull.y);

  if (state.terry.vx < -5) facing = -1;
  else if (state.terry.vx > 5) facing = 1;

  // Only hide crab if far off-screen during pure fly-away (seagull mode still shows)
  if (state.terry.y > -80) {
    drawCrab(ctx, state.terry.x, state.terry.y, facing);
    drawTerryLabel(ctx, state.terry.x, state.terry.y - 22);
  }

  drawHUD(ctx, state.score, w);
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
    accum -= FIXED_DT;
  }
  render();
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);

// Expose for e2e / debugging
window.__TERRY__ = {
  getState: () => state,
  getScore: () => state?.score ?? 0,
};
