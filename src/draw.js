/** Original pixel-art drawing — original art only. */

const SCALE = 3;

/** Detailed crab sprite (16x12 logical pixels), facing down/camera. */
const CRAB = [
  // rows top→bottom; chars: . empty, R red, D dark, O orange, B black, W white, P pink claw tip
  '....RRRRRR....',
  '...RDDDDRRR...',
  '..RDWWDDWWRR..',
  '..RDBBDBBRDR..',
  '.RRDDDDDDDRR.',
  'RRRDDDDDDDRRR',
  'P.ROOOOOOOR.P',
  'PP.RDDDDRR.PP',
  '.P.RD..DR.P..',
  '..RR....RR...',
  '.R.R....R.R..',
  'R...........R',
].map((r) => r.padEnd(14, '.'));

const COLORS = {
  R: '#e85a3c',
  D: '#c43d22',
  O: '#f08a4a',
  B: '#1a1010',
  W: '#fff6e8',
  P: '#ff9a7a',
};

export function drawCrab(ctx, x, y, facing = 1, scale = SCALE) {
  const rows = CRAB.length;
  const cols = CRAB[0].length;
  const w = cols * scale;
  const h = rows * scale;
  const ox = Math.round(x - w / 2);
  const oy = Math.round(y - h / 2);
  ctx.save();
  if (facing < 0) {
    ctx.translate(Math.round(x), 0);
    ctx.scale(-1, 1);
    ctx.translate(-Math.round(x), 0);
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = CRAB[row][col];
      if (ch === '.' || !COLORS[ch]) continue;
      ctx.fillStyle = COLORS[ch];
      ctx.fillRect(ox + col * scale, oy + row * scale, scale, scale);
    }
  }
  ctx.restore();
  return { w, h };
}

export function drawTerryLabel(ctx, x, y) {
  ctx.save();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const label = 'Terry';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(20,16,12,0.55)';
  ctx.fillRect(x - tw / 2 - 4, y - 16, tw + 8, 14);
  ctx.fillStyle = '#fff8e7';
  ctx.fillText(label, x, y - 4);
  ctx.restore();
}

export function drawSeaGlass(ctx, g) {
  const s = 2;
  // Faceted pebble
  ctx.fillStyle = `hsla(${g.hue},55%,62%,0.95)`;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y - 6);
  ctx.lineTo(g.x + 7, g.y - 1);
  ctx.lineTo(g.x + 4, g.y + 6);
  ctx.lineTo(g.x - 5, g.y + 5);
  ctx.lineTo(g.x - 7, g.y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `hsla(${g.hue},70%,80%,0.7)`;
  ctx.fillRect(g.x - 2, g.y - 3, 3 * s, 2);
}

export function drawFartCloud(ctx, c) {
  const a = 1 - c.age / c.life;
  ctx.fillStyle = `rgba(90,140,70,${0.35 * a})`;
  const r = c.r * (0.6 + 0.4 * (c.age / c.life));
  // Blocky 8-bit gas puffs
  const px = 4;
  for (let dy = -r; dy < r; dy += px) {
    for (let dx = -r; dx < r; dx += px) {
      if (dx * dx + dy * dy < r * r * (0.7 + 0.3 * Math.sin(dx + dy))) {
        ctx.fillRect(Math.round(c.x + dx), Math.round(c.y + dy), px, px);
      }
    }
  }
  ctx.fillStyle = `rgba(60,100,40,${0.25 * a})`;
  ctx.fillRect(Math.round(c.x - r * 0.3), Math.round(c.y - r * 0.2), px * 2, px * 2);
}

/** Simple original pixel seagull */
export function drawSeagull(ctx, x, y) {
  const s = 3;
  const bird = [
    '......WW......',
    '.....WWWW.....',
    '...WWWWWWWW...',
    '..WWWBWWBWWW..',
    '.WWWWWWWWWWWW.',
    'WWWWYYYYWWWWWW',
    '..WW....WW....',
    '.W........W...',
  ];
  const pal = { W: '#f5f5f5', B: '#222', Y: '#f0c040', '.': null };
  const cols = bird[0].length;
  const rows = bird.length;
  const ox = Math.round(x - (cols * s) / 2);
  const oy = Math.round(y - (rows * s) / 2);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = bird[row][col];
      if (!pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(ox + col * s, oy + row * s, s, s);
    }
  }
}

/** Tasteful 8-bit poop (silly, not gross) — falling blob or ground stain. */
export function drawPoop(ctx, x, y, opts = {}) {
  const s = opts.scale ?? 2;
  const stain = !!opts.stain;
  // Tiny pixel splat: warm brown + lighter highlight
  const blob = stain
    ? [
        '..BB..',
        '.BmmB.',
        'BmmmmB',
        '.BmmB.',
        '..BB..',
      ]
    : [
        '..BB.',
        '.BmB.',
        'BmmmB',
        '.BBB.',
      ];
  const pal = { B: '#6b3e1f', m: '#8a5a2b', '.': null };
  const cols = blob[0].length;
  const rows = blob.length;
  const ox = Math.round(x - (cols * s) / 2);
  const oy = Math.round(y - (rows * s) / 2);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = blob[row][col];
      if (!pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(ox + col * s, oy + row * s, s, s);
    }
  }
}

/** Tiny stuck poop on crab shell (cleared on next seagull pickup). */
export function drawPoopStuckOnCrab(ctx, terryX, terryY) {
  drawPoop(ctx, terryX + 6, terryY - 8, { scale: 2, stain: false });
}

export function drawBeach(ctx, w, h, waterY, phase) {
  // Sky strip above water
  const skyH = Math.max(0, waterY * 0.35);
  ctx.fillStyle = '#6ec8ff';
  ctx.fillRect(0, 0, w, waterY);

  // Deep water bands (lapping)
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const t = i / bands;
    const y0 = skyH + t * (waterY - skyH);
    const y1 = skyH + ((i + 1) / bands) * (waterY - skyH);
    const shade = 40 + Math.floor(t * 50);
    ctx.fillStyle = `rgb(${30 + shade},${120 + shade},${180 + Math.floor(shade * 0.4)})`;
    ctx.fillRect(0, y0, w, y1 - y0 + 1);
  }

  // Foam / wave crest near edge
  const foam = 6 + Math.sin(phase * Math.PI * 2) * 3;
  ctx.fillStyle = 'rgba(230,245,255,0.85)';
  for (let x = 0; x < w; x += 8) {
    const bump = Math.sin(x * 0.08 + phase * Math.PI * 4) * 4;
    ctx.fillRect(x, waterY - foam + bump, 6, 4);
  }

  // Wet sand
  const wetH = h * 0.18;
  ctx.fillStyle = '#c9a878';
  ctx.fillRect(0, waterY, w, wetH);

  // Dry sand
  ctx.fillStyle = '#e8c98a';
  ctx.fillRect(0, waterY + wetH, w, h - waterY - wetH);

  // Sand pixel noise
  ctx.fillStyle = 'rgba(180,140,70,0.25)';
  for (let i = 0; i < 80; i++) {
    const sx = ((i * 97) % w);
    const sy = waterY + wetH + ((i * 53) % Math.max(1, h - waterY - wetH));
    ctx.fillRect(sx, sy, 2, 2);
  }
}

export function drawHUD(ctx, score, w) {
  ctx.save();
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const text = `Sea glass: ${score}\u00a2`;
  ctx.fillStyle = 'rgba(20,16,12,0.55)';
  ctx.fillRect(8, 8, ctx.measureText(text).width + 16, 28);
  ctx.fillStyle = '#fff8e7';
  ctx.fillText(text, 16, 14);
  ctx.restore();
}
