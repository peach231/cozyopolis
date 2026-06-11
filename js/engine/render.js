// Renderer. Two layers:
//  1) ground (flat, never occludes) cached into 16x16-tile chunk canvases (LRU pool)
//  2) structures + agents drawn each frame, depth-sorted, viewport-culled
// Deco art is painted once into a runtime sprite cache; Phase 2's bake pipeline
// replaces painters with baked data behind the same getSprite() interface.
(() => {
const G = globalThis.G ??= {};
const R = G.Render = {};
const ISO = G.ISO, M = G.M;

const CHUNK = 16;      // tiles per chunk side
const PAD = 6;         // px padding around chunk canvas
const POOL_MAX = 40;   // max cached chunk canvases

// ---------------------------------------------------------------- sprites
const spriteCache = new Map();
// builder(ctx, w, h) paints in logical px; sprites bake at 2x for crisp zoom.
// anchor (ax,ay) is the logical point placed at the tile center.
R.sprite = (key, w, h, ax, ay, builder, scale = 2) => {
  let s = spriteCache.get(key);
  if (!s) {
    const cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    builder(ctx, w, h);
    s = { cv, ax, ay, scale };
    spriteCache.set(key, s);
  }
  return s;
};

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
R.roundRect = rr;

const blob = (ctx, x, y, rx, ry, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};

// storybook tree: layered cloud canopy, light from upper-left
function paintTree(ctx, leaf, v) {
  const P = G.C.PAL[leaf] || G.C.PAL.leafWarm;
  const wood = G.C.PAL.woodDark;
  const rng = G.rng(0xA11CE + v * 977);
  const cx = 24, base = 56;
  const W = 15 + rng.int(0, 6), H = 13 + rng.int(0, 5), top = base - 22 - rng.int(0, 6);
  // trunk
  ctx.fillStyle = wood[3];
  rr(ctx, cx - 2.5, base - 16, 5, 16, 2.2);
  ctx.fill();
  ctx.fillStyle = wood[2];
  rr(ctx, cx - 2.5, base - 16, 2.6, 16, 2.2);
  ctx.fill();
  // canopy silhouette (dark base), then mid, then highlight upper-left
  blob(ctx, cx + 1, top + 2, W, H, P[4]);
  blob(ctx, cx + 5, top + 5, W * 0.72, H * 0.72, P[4]);
  blob(ctx, cx, top, W * 0.92, H * 0.92, P[3]);
  blob(ctx, cx - 3, top - 2, W * 0.7, H * 0.7, P[2]);
  blob(ctx, cx - 5, top - 4, W * 0.46, H * 0.46, P[1]);
  // specular leaves
  ctx.fillStyle = P[0];
  for (let i = 0; i < 4; i++) {
    blob(ctx, cx - 8 + rng.int(0, 8), top - 7 + rng.int(0, 6), 1.6, 1.2, P[0]);
  }
}

function paintRock(ctx, v) {
  const P = G.C.PAL.stone;
  const rng = G.rng(0x0C4 + v * 131);
  const cx = 14, cy = 13;
  blob(ctx, cx + 1, cy + 1, 9 + rng.int(0, 3), 6, P[4]);
  blob(ctx, cx, cy, 8 + rng.int(0, 3), 5.4, P[2]);
  blob(ctx, cx - 2.5, cy - 1.5, 4.5, 2.8, P[1]);
}

function paintFlowers(ctx, v) {
  const rng = G.rng(0xF10 + v * 53);
  const col = v === 0 ? G.C.PAL.bloomPink : G.C.PAL.bloomYellow;
  for (let i = 0; i < 7; i++) {
    const x = 6 + rng.int(0, 24), y = 5 + rng.int(0, 10);
    blob(ctx, x, y + 1.5, 1.2, 1.6, G.C.PAL.leafWarm[3]);
    blob(ctx, x, y, 1.7, 1.7, col[rng.int(1, 4)]);
  }
}

function getDecoSprite(s) {
  if (s.kind === 'tree') {
    return R.sprite(`tree:${s.leaf}:${s.v}`, 48, 60, 24, 52,
      (ctx) => paintTree(ctx, s.leaf, s.v));
  }
  if (s.kind === 'rock') {
    return R.sprite(`rock:${s.v}`, 28, 22, 14, 15, (ctx) => paintRock(ctx, s.v));
  }
  if (s.kind === 'flowers') {
    return R.sprite(`flowers:${s.v}`, 36, 20, 18, 11, (ctx) => paintFlowers(ctx, s.v));
  }
  if (s.type && G.Buildings.byId[s.type]) {
    const key = `bld:${s.type}`;
    let spr = spriteCache.get(key);
    if (!spr) {
      spr = G.Shape.build(G.Buildings.byId[s.type]);
      spriteCache.set(key, spr);
    }
    return spr;
  }
  return null;
}
R.getStructureSprite = getDecoSprite; // later phases extend this dispatch

// ---------------------------------------------------------------- ground
function groundColor(type, x, y) {
  const T = G.T, C = G.C, seed = G.grid.seed;
  const h = M.hash2(x, y, seed);
  const n = M.vnoise(x, y, seed ^ 0x77, 7); // broad patchiness
  switch (type) {
    case T.GRASS: {
      const base = C.mix(C.PAL.grass[2], C.PAL.grass[1], n * 0.55);
      return C.mix(base, C.PAL.grass[3], h * 0.18);
    }
    case T.MEADOW: {
      const base = C.mix(C.PAL.meadow[2], C.PAL.meadow[1], n * 0.6);
      return C.mix(base, C.PAL.bloomYellow[1], h * 0.08);
    }
    case T.WATER:
      return C.mix(C.PAL.water[2], C.PAL.waterDeep[2], 0.35 + n * 0.4);
    case T.SAND:
      return C.mix(C.PAL.sand[2], C.PAL.sand[1], n * 0.5);
    case T.DIRT:
      return C.mix(C.PAL.dirt[2], C.PAL.dirt[3], h * 0.25);
  }
  return '#f0f';
}

function diamondPath(ctx, sx, sy, grow = 1) {
  const w = ISO.HALF_W + grow, h = ISO.HALF_H + grow * 0.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - h);
  ctx.lineTo(sx + w, sy);
  ctx.lineTo(sx, sy + h);
  ctx.lineTo(sx - w, sy);
  ctx.closePath();
}

function paintGroundTile(ctx, x, y, sx, sy) {
  const grid = G.grid, T = G.T;
  const type = grid.ground[grid.idx(x, y)];
  diamondPath(ctx, sx, sy, 1);
  ctx.fillStyle = groundColor(type, x, y);
  ctx.fill();

  const h = M.hash2(x, y, grid.seed ^ 0x5151);
  if (type === T.GRASS || type === T.MEADOW) {
    // sparse grass tufts
    if (h > 0.55) {
      const P = G.C.PAL.grass;
      ctx.strokeStyle = h > 0.8 ? P[1] : P[3];
      ctx.lineWidth = 1;
      const n = 1 + ((h * 13) | 0) % 3;
      for (let i = 0; i < n; i++) {
        const ox = ((M.hash2(x, y, i * 31 + 7) - 0.5) * 36) | 0;
        const oy = ((M.hash2(x, y, i * 57 + 3) - 0.5) * 14) | 0;
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + oy + 2);
        ctx.lineTo(sx + ox + (i % 2 ? 1.5 : -1.5), sy + oy - 2);
        ctx.stroke();
      }
    }
  } else if (type === T.WATER) {
    // shoreline highlight on edges that touch land (the two "far" edges read as banks)
    const C = G.C;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = C.withAlpha(C.PAL.water[0], 0.7);
    if (!T.isWater(grid.groundAt(x, y - 1))) {       // NE edge
      ctx.beginPath();
      ctx.moveTo(sx, sy - ISO.HALF_H + 1);
      ctx.lineTo(sx + ISO.HALF_W - 2, sy);
      ctx.stroke();
    }
    if (!T.isWater(grid.groundAt(x - 1, y))) {       // NW edge
      ctx.beginPath();
      ctx.moveTo(sx, sy - ISO.HALF_H + 1);
      ctx.lineTo(sx - ISO.HALF_W + 2, sy);
      ctx.stroke();
    }
    // sparse ripple glints
    if (h > 0.75) {
      ctx.strokeStyle = C.withAlpha(C.PAL.water[1], 0.8);
      ctx.beginPath();
      const ox = ((h * 100) % 20) - 10;
      ctx.moveTo(sx + ox - 5, sy);
      ctx.quadraticCurveTo(sx + ox, sy - 2, sx + ox + 5, sy);
      ctx.stroke();
    }
  } else if (type === T.SAND && h > 0.7) {
    ctx.fillStyle = G.C.withAlpha(G.C.PAL.sand[3], 0.5);
    ctx.fillRect(sx - 6 + ((h * 53) % 12), sy - 2 + ((h * 29) % 5), 1.6, 1.6);
  }
  G.Roads.paintTile(ctx, x, y, sx, sy);
}

// ---------------------------------------------------------------- chunks
// pool: key "cx,cy,scale" -> {cv, ox, oy, w, h, stamp}
const chunkPool = new Map();
let poolStamp = 0;

function chunkScreenBox(cx, cy) {
  const X0 = cx * CHUNK, Y0 = cy * CHUNK, L = CHUNK - 1;
  const ox = (X0 - Y0 - L) * ISO.HALF_W - ISO.HALF_W - PAD;
  const oy = (X0 + Y0) * ISO.HALF_H - ISO.HALF_H - PAD;
  const w = (2 * L + 2) * ISO.HALF_W + PAD * 2;
  const h = (2 * L + 2) * ISO.HALF_H + PAD * 2;
  return { ox, oy, w, h };
}

function renderChunk(cx, cy, scale) {
  const box = chunkScreenBox(cx, cy);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(box.w * scale);
  cv.height = Math.ceil(box.h * scale);
  const ctx = cv.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -box.ox * scale, -box.oy * scale);
  const n = G.grid.size;
  // paint in depth order within the chunk (water bank strokes overlap correctly)
  for (let y = cy * CHUNK; y < Math.min((cy + 1) * CHUNK, n); y++) {
    for (let x = cx * CHUNK; x < Math.min((cx + 1) * CHUNK, n); x++) {
      const [sx, sy] = ISO.toScreen(x, y);
      paintGroundTile(ctx, x, y, sx, sy);
    }
  }
  return { cv, ...box, stamp: ++poolStamp };
}

function getChunk(cx, cy, scale) {
  const key = `${cx},${cy},${scale}`;
  let c = chunkPool.get(key);
  if (!c) {
    c = renderChunk(cx, cy, scale);
    chunkPool.set(key, c);
    if (chunkPool.size > POOL_MAX) {
      // evict least-recently-used
      let oldK = null, old = Infinity;
      for (const [k, v] of chunkPool) if (v.stamp < old) { old = v.stamp; oldK = k; }
      chunkPool.delete(oldK);
    }
  }
  c.stamp = ++poolStamp;
  return c;
}

const dropChunk = (cx, cy) => {
  for (const k of [...chunkPool.keys()]) {
    if (k.startsWith(`${cx},${cy},`)) chunkPool.delete(k);
  }
};
R.invalidateTile = (x, y) => {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
  dropChunk(cx, cy);
  // tiles on chunk borders affect the adjacent chunk's bank/road strokes
  if (x % CHUNK === 0 && cx > 0) dropChunk(cx - 1, cy);
  if (y % CHUNK === 0 && cy > 0) dropChunk(cx, cy - 1);
};
R.invalidateAll = () => chunkPool.clear();

// ---------------------------------------------------------------- day/night
// grade keyframes: [hour, multiply color, strength]
const GRADE = [
  [0.0, '#353a6b', 0.78],
  [4.5, '#3d3d6e', 0.74],
  [6.0, '#b07b8e', 0.45],
  [7.5, '#f2d9b0', 0.18],
  [9.0, '#ffffff', 0.0],
  [16.0, '#fff3d2', 0.06],
  [18.0, '#f5b878', 0.26],
  [19.5, '#9a6f9e', 0.5],
  [21.0, '#46497e', 0.7],
  [24.0, '#353a6b', 0.78],
];

function gradeAt(hour) {
  let a = GRADE[0], b = GRADE[GRADE.length - 1];
  for (let i = 0; i < GRADE.length - 1; i++) {
    if (hour >= GRADE[i][0] && hour <= GRADE[i + 1][0]) { a = GRADE[i]; b = GRADE[i + 1]; break; }
  }
  const t = (hour - a[0]) / Math.max(b[0] - a[0], 1e-6);
  return [G.C.mix(a[1], b[1], t), G.M.lerp(a[2], b[2], t)];
}
R.gradeAt = gradeAt; // exposed for tests

// staggered window lighting: each building has its own dusk threshold;
// deep night sends most of the village to bed
function windowGlow(s) {
  const dl = G.time.daylight();
  const h = G.M.hash2(s.x, s.y, 0x611);
  const threshold = 0.42 + h * 0.25;
  let a = G.M.clamp((threshold - dl) * 7, 0, 1);
  const hour = G.time.hour;
  if (hour >= 23 || hour < 5) a *= h > 0.55 ? 0.15 : 0.7; // night owls only
  return a;
}

// ---------------------------------------------------------------- frame
R.bgColor = '#322b42';

R.drawWorld = (ctx) => {
  const cam = G.cam, view = G.view;
  const dl = G.time.daylight();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = G.C.mix('#1c1a2e', R.bgColor, 0.35 + dl * 0.65);
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  // camera transform (world px -> device px)
  const z = cam.zoom * view.dpr;
  ctx.setTransform(z, 0, 0, z,
    (cam.viewW / 2 - cam.x * cam.zoom) * view.dpr,
    (cam.viewH / 2 - cam.y * cam.zoom) * view.dpr);

  const rect = cam.viewRect(0);
  const scale = cam.zoomTarget >= 1.5 ? 2 : 1;
  const nChunks = Math.ceil(G.grid.size / CHUNK);
  for (let cy = 0; cy < nChunks; cy++) {
    for (let cx = 0; cx < nChunks; cx++) {
      const box = chunkScreenBox(cx, cy);
      if (box.ox > rect.x1 || box.ox + box.w < rect.x0 ||
          box.oy > rect.y1 || box.oy + box.h < rect.y0) continue;
      const c = getChunk(cx, cy, scale);
      ctx.drawImage(c.cv, c.ox, c.oy, c.w, c.h);
    }
  }

  drawWaterSparkle(ctx, rect);
  drawZoneOverlay(ctx, rect);
  drawStructures(ctx, rect);
  G.Events?.drawWorld?.(ctx);

  // ---- time-of-day grade (multiply over the whole scene; UI drawn later is unaffected)
  const [gc, ga] = gradeAt(G.time.hour);
  if (ga > 0.004) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = G.C.withAlpha(gc, ga);
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- additive light pass (windows, signal bulbs, headlights) after the grade
  if (dl < 0.72) {
    const z2 = cam.zoom * view.dpr;
    ctx.setTransform(z2, 0, 0, z2,
      (cam.viewW / 2 - cam.x * cam.zoom) * view.dpr,
      (cam.viewH / 2 - cam.y * cam.zoom) * view.dpr);
    ctx.globalCompositeOperation = 'lighter';

    // glowing windows (reuse this frame's culled draw list)
    for (const s of drawList) {
      if (!s.type || s.construction > 0) continue;
      const spr = getDecoSprite(s);
      if (!spr?.ecv) continue;
      const dark = G.M.clamp((0.55 - dl) * 3.2, 0, 1); // how dark the scene is
      const a = windowGlow(s) * dark;
      if (a <= 0.01) continue;
      const [sx, sy] = ISO.toScreen(s.x - 0.5, s.y - 0.5);
      ctx.globalAlpha = a * 0.6;
      ctx.drawImage(spr.ecv, sx - spr.ax, sy - spr.ay,
        spr.ecv.width / spr.scale, spr.ecv.height / spr.scale);
      // soft spill on the ground by the door
      ctx.globalAlpha = a * 0.18;
      const grd = ctx.createRadialGradient(sx, sy + 14, 2, sx, sy + 14, 26);
      grd.addColorStop(0, '#ffd98a');
      grd.addColorStop(1, 'rgba(255,217,138,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(sx, sy + 14, 26, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // street lamp pools
    if ((G.city.eraIndex ?? 0) >= 1) {
      const lampA = G.M.clamp((0.5 - dl) * 3.5, 0, 1);
      if (lampA > 0) {
        for (const L of G.Roads.getLamps()) {
          const [sx, sy] = ISO.toScreen(L.x, L.y);
          if (sx < rect.x0 - 50 || sx > rect.x1 + 50 || sy < rect.y0 - 50 || sy > rect.y1 + 50) continue;
          ctx.globalAlpha = lampA * 0.55;
          const g = ctx.createRadialGradient(sx, sy - 2, 2, sx, sy - 2, 30);
          g.addColorStop(0, '#ffd98a');
          g.addColorStop(1, 'rgba(255,217,138,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(sx, sy - 2, 30, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = lampA * 0.9;
          ctx.fillStyle = '#fff3c0';
          rr(ctx, sx - 2.2, sy - 23.6, 4.4, 5.4, 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // traffic signal bulbs glow
    if (G.Traffic) {
      const nightA = G.M.clamp((0.6 - dl) * 3, 0, 1);
      for (const L of G.Traffic.lights.values()) {
        const [sx, sy] = ISO.toScreen(L.x + 0.42, L.y + 0.42);
        if (sx < rect.x0 - 40 || sx > rect.x1 + 40 || sy < rect.y0 - 40 || sy > rect.y1 + 40) continue;
        const cols = L.amber ? ['#ffcf6b', '#ffcf6b']
          : [L.axis === 1 ? '#7ed47a' : '#e8655a', L.axis === 0 ? '#7ed47a' : '#e8655a'];
        ctx.globalAlpha = 0.5 * nightA + 0.25;
        for (const [i, c] of cols.entries()) {
          const g = ctx.createRadialGradient(sx, sy - 27 + i * 4, 0.5, sx, sy - 27 + i * 4, 5);
          g.addColorStop(0, c);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(sx - 5, sy - 32 + i * 4, 10, 10);
        }
      }
      // headlights
      const hlA = G.M.clamp((0.5 - dl) * 4, 0, 1);
      if (hlA > 0) {
        const DIRV = [[16, -8], [16, 8], [-16, 8], [-16, -8]]; // screen px per half tile
        for (const car of G.Traffic.cars) {
          const [sx, sy] = ISO.toScreen(car.x, car.y);
          if (sx < rect.x0 - 60 || sx > rect.x1 + 60 || sy < rect.y0 - 60 || sy > rect.y1 + 60) continue;
          const [vx, vy] = DIRV[car.dir];
          const fx = sx + vx * 0.55, fy = sy - 5 + vy * 0.55;
          ctx.globalAlpha = hlA * 0.5;
          const g = ctx.createRadialGradient(fx + vx * 0.5, fy + vy * 0.5, 2, fx + vx * 0.5, fy + vy * 0.5, 22);
          g.addColorStop(0, '#fff3c0');
          g.addColorStop(1, 'rgba(255,243,192,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(fx + vx * 0.6, fy + vy * 0.6, 22, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = hlA * 0.9;
          ctx.fillStyle = '#fff8d8';
          ctx.beginPath();
          ctx.arc(fx, fy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // overlays drawn after drawWorld (cursor, ghosts, floats) expect world space
  const zr = cam.zoom * view.dpr;
  ctx.setTransform(zr, 0, 0, zr,
    (cam.viewW / 2 - cam.x * cam.zoom) * view.dpr,
    (cam.viewH / 2 - cam.y * cam.zoom) * view.dpr);
};

// drifting glints on visible water tiles — the river breathes
function drawWaterSparkle(ctx, rect) {
  const grid = G.grid, n = grid.size, M = G.M;
  const tNow = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
  const sMin = Math.max(0, Math.floor(rect.y0 / ISO.HALF_H) - 1);
  const sMax = Math.min(2 * n - 2, Math.ceil(rect.y1 / ISO.HALF_H) + 1);
  const dMin = Math.floor(rect.x0 / ISO.HALF_W) - 1;
  const dMax = Math.ceil(rect.x1 / ISO.HALF_W) + 1;
  const glow = 0.35 + 0.55 * G.time.daylight();
  for (let s = sMin; s <= sMax; s++) {
    for (let d = dMin; d <= dMax; d++) {
      if ((s + d) & 1) continue;
      const x = (s + d) >> 1, y = (s - d) >> 1;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      if (grid.ground[y * n + x] !== G.T.WATER || grid.roads[y * n + x]) continue;
      const h = M.hash2(x, y, 0x5a7);
      if (h > 0.13) continue;
      const phase = (tNow * (0.25 + h) + h * 37) % 1;
      const a = Math.sin(Math.PI * phase) * glow;
      if (a < 0.05) continue;
      const [sx, sy] = ISO.toScreen(x, y);
      ctx.strokeStyle = `rgba(235,250,250,${a.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      const ox = (h * 530 % 30) - 15, oy = (h * 970 % 12) - 6;
      ctx.beginPath();
      ctx.moveTo(sx + ox - 3.5, sy + oy);
      ctx.lineTo(sx + ox + 3.5, sy + oy);
      ctx.stroke();
    }
  }
}

// faint tint on zoned-but-unbuilt tiles; brighter while a zone tool is active
function drawZoneOverlay(ctx, rect) {
  const grid = G.grid, n = grid.size;
  if (!grid.zones) return;
  const active = G.Build?.tool?.mode === 'zone';
  const alpha = active ? 0.3 : 0.13;
  const cols = ['', G.C.withAlpha('#9ed47a', alpha), G.C.withAlpha('#88a4c4', alpha)];
  for (let i = 0; i < n * n; i++) {
    const z = grid.zones[i];
    if (!z || grid.occ[i] !== 0) continue;
    const x = i % n, y = (i / n) | 0;
    const [sx, sy] = ISO.toScreen(x, y);
    if (sx < rect.x0 - 40 || sx > rect.x1 + 40 || sy < rect.y0 - 20 || sy > rect.y1 + 20) continue;
    diamondPath(ctx, sx, sy, -2);
    ctx.fillStyle = cols[z];
    ctx.fill();
  }
}

// wooden scaffold drawn over buildings under construction
function drawScaffold(ctx, s) {
  const w = s.w ?? 1, h = s.h ?? 1;
  const wood = G.C.PAL.woodDark;
  const hgt = 18 + 6 * (w + h);
  const corners = [
    ISO.toScreen(s.x - 0.4, s.y - 0.4), ISO.toScreen(s.x + w - 0.6, s.y - 0.4),
    ISO.toScreen(s.x + w - 0.6, s.y + h - 0.6), ISO.toScreen(s.x - 0.4, s.y + h - 0.6),
  ];
  ctx.strokeStyle = wood[3];
  ctx.lineWidth = 1.8;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - hgt);
    ctx.stroke();
  }
  // beams between visible posts (front three corners)
  ctx.strokeStyle = wood[2];
  ctx.lineWidth = 1.2;
  for (const lvl of [0.45, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(corners[1][0], corners[1][1] - hgt * lvl);
    ctx.lineTo(corners[2][0], corners[2][1] - hgt * lvl);
    ctx.lineTo(corners[3][0], corners[3][1] - hgt * lvl);
    ctx.stroke();
  }
}

const drawList = [];
const depthOf = (s) => s.x + s.y + (s.w ?? 1) - 1 + (s.h ?? 1) - 1;
function drawStructures(ctx, rect) {
  drawList.length = 0;
  const m = 140; // overhang margin in world px
  for (const s of G.grid.structures.values()) {
    const [sx, sy] = ISO.toScreen(s.x, s.y);
    if (sx < rect.x0 - m || sx > rect.x1 + m || sy < rect.y0 - m || sy > rect.y1 + m) continue;
    drawList.push(s);
  }
  G.Agents?.collectDrawables(rect, drawList);
  G.Traffic?.collectDrawables(rect, drawList);
  // street lamps (auto on cobble+ roads, village era onward)
  if ((G.city.eraIndex ?? 0) >= 1) {
    for (const L of G.Roads.getLamps()) {
      const [sx, sy] = ISO.toScreen(L.x, L.y);
      if (sx < rect.x0 - 20 || sx > rect.x1 + 20 || sy < rect.y0 - 40 || sy > rect.y1 + 20) continue;
      drawList.push({
        x: L.x, y: L.y,
        draw: (c) => {
          c.strokeStyle = '#4a4458';
          c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(sx, sy);
          c.lineTo(sx, sy - 19);
          c.stroke();
          c.fillStyle = G.time.daylight() < 0.5 ? '#ffd98a' : '#cfc9dd';
          rr(c, sx - 2.4, sy - 24, 4.8, 6, 2);
          c.fill();
          c.fillStyle = '#4a4458';
          c.fillRect(sx - 3, sy - 25, 6, 1.6);
        },
      });
    }
  }
  drawList.sort((a, b) => depthOf(a) - depthOf(b));
  const shadow = G.C.withAlpha('#4a3550', 0.05 + 0.17 * G.time.daylight());
  for (const s of drawList) {
    if (s.draw) { s.draw(ctx); continue; }
    const spr = getDecoSprite(s);
    if (!spr) continue;
    if (s.type) {
      // soft footprint shadow, sun upper-left -> cast lower-right
      const def = G.Buildings.byId[s.type];
      if (!def.flat) { // flat structures (fields, plazas) cast no shadow
        const w = s.w ?? 1, h = s.h ?? 1;
        const c = [
          ISO.toScreen(s.x - 0.42, s.y - 0.42), ISO.toScreen(s.x + w - 0.3, s.y - 0.35),
          ISO.toScreen(s.x + w - 0.05, s.y + h - 0.05), ISO.toScreen(s.x - 0.35, s.y + h - 0.3),
        ];
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.moveTo(c[0][0] + 4, c[0][1] + 2);
        for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0] + 4, c[i][1] + 2);
        ctx.closePath();
        ctx.fill();
      }
      // buildings anchor tile-space (0,0) = N corner of their min tile
      const [sx, sy] = ISO.toScreen(s.x - 0.5, s.y - 0.5);
      if (s.construction > 0) {
        ctx.globalAlpha = 0.4;
        ctx.drawImage(spr.cv, sx - spr.ax, sy - spr.ay,
          spr.cv.width / spr.scale, spr.cv.height / spr.scale);
        ctx.globalAlpha = 1;
        drawScaffold(ctx, s);
      } else {
        ctx.drawImage(spr.cv, sx - spr.ax, sy - spr.ay,
          spr.cv.width / spr.scale, spr.cv.height / spr.scale);
      }
    } else {
      const [sx, sy] = ISO.toScreen(s.x, s.y);
      if (s.kind === 'tree') {
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.ellipse(sx + 5, sy + 3, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.drawImage(spr.cv, sx - spr.ax, sy - spr.ay,
        spr.cv.width / spr.scale, spr.cv.height / spr.scale);
    }
  }
}

// hover/selection cursor on a tile
R.drawTileCursor = (ctx, x, y, color) => {
  const [sx, sy] = ISO.toScreen(x, y);
  diamondPath(ctx, sx, sy, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = G.C.withAlpha(color, 0.12);
  ctx.fill();
};
})();
