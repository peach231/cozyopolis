// Road layer: per-cell tier in G.grid.roads (0 none, 1 dirt path, 2 cobblestone,
// 3 paved, 4 avenue). Flat — painted inside ground chunks. Adjacency doubles as
// the vehicle/pedestrian graph (4-connected).
(() => {
const G = globalThis.G ??= {};
const Roads = G.Roads = {};

Roads.TIERS = {
  1: { name: 'Dirt Path', cost: 5 },
  2: { name: 'Cobblestone', cost: 12 },
  3: { name: 'Paved Road', cost: 25 },
  4: { name: 'Avenue', cost: 60 },
};

// direction order for bitmask: bit0 NE (x,y-1), bit1 SE (x+1,y), bit2 SW (x,y+1), bit3 NW (x-1,y)
const DIRS = Roads.DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

Roads.at = (x, y) => G.grid.inBounds(x, y) ? G.grid.roads[G.grid.idx(x, y)] : 0;

Roads.mask = (x, y) => {
  let m = 0;
  for (let d = 0; d < 4; d++) {
    if (Roads.at(x + DIRS[d][0], y + DIRS[d][1])) m |= 1 << d;
  }
  return m;
};

// tier>=3 (paved and up) may cross water as a bridge
Roads.canPlace = (x, y, tier = 1) => {
  if (!G.grid.inBounds(x, y)) return false;
  const t = G.grid.groundAt(x, y);
  if (t === G.T.WATER && tier < 3) return false;
  if (t !== G.T.WATER && !G.T.isBuildable(t) && t !== G.T.SAND) return false;
  return G.grid.occ[G.grid.idx(x, y)] === 0;
};

// returns cost charged, or -1 if invalid. Upgrading pays the new tier in full;
// same tier is a no-op.
Roads.place = (x, y, tier) => {
  if (!Roads.canPlace(x, y, tier)) return -1;
  const i = G.grid.idx(x, y);
  const cur = G.grid.roads[i];
  if (cur === tier) return 0;
  G.grid.roads[i] = tier;
  G.Render.invalidateTile(x, y);
  for (const [dx, dy] of DIRS) G.Render.invalidateTile(x + dx, y + dy);
  if (G.Traffic) G.Traffic.dirty = true;
  Roads.markLampsDirty();
  return Roads.TIERS[tier].cost;
};

Roads.remove = (x, y) => {
  const i = G.grid.idx(x, y);
  if (!G.grid.roads[i]) return false;
  G.grid.roads[i] = 0;
  G.Render.invalidateTile(x, y);
  for (const [dx, dy] of DIRS) G.Render.invalidateTile(x + dx, y + dy);
  if (G.Traffic) G.Traffic.dirty = true;
  Roads.markLampsDirty();
  return true;
};

// L-shaped line of tiles from a to b, dominant axis first
Roads.lineTiles = (x0, y0, x1, y1) => {
  const tiles = [];
  const dx = x1 - x0, dy = y1 - y0;
  const xFirst = Math.abs(dx) >= Math.abs(dy);
  let x = x0, y = y0;
  tiles.push([x, y]);
  const stepAxis = (vx, vy, n) => {
    for (let i = 0; i < n; i++) {
      x += vx; y += vy;
      tiles.push([x, y]);
    }
  };
  if (xFirst) {
    stepAxis(Math.sign(dx), 0, Math.abs(dx));
    stepAxis(0, Math.sign(dy), Math.abs(dy));
  } else {
    stepAxis(0, Math.sign(dy), Math.abs(dy));
    stepAxis(Math.sign(dx), 0, Math.abs(dx));
  }
  return tiles;
};

// does any cell adjacent to footprint (x,y,w,h) have a road?
Roads.touchesFootprint = (x, y, w, h) => {
  for (let dx = 0; dx < w; dx++) {
    if (Roads.at(x + dx, y - 1) || Roads.at(x + dx, y + h)) return true;
  }
  for (let dy = 0; dy < h; dy++) {
    if (Roads.at(x - 1, y + dy) || Roads.at(x + w, y + dy)) return true;
  }
  return false;
};

// ---------------------------------------------------------------- lamps
// street lamps appear automatically on tier>=2 roads (from Village era on),
// deterministically scattered so streets glow at night with zero busywork
let lamps = [], lampsDirty = true;
Roads.markLampsDirty = () => { lampsDirty = true; };
Roads.getLamps = () => {
  if (lampsDirty) {
    lampsDirty = false;
    lamps = [];
    const n = G.grid.size;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (G.grid.roads[y * n + x] < 2) continue;
        const h = G.M.hash2(x, y, 0x1a3b);
        if (h < 0.2) {
          const side = h < 0.1 ? 0.38 : -0.38;
          lamps.push({ x: x + side, y: y + side * (h < 0.05 || h > 0.15 ? 1 : -1) });
        }
      }
    }
  }
  return lamps;
};

// ---------------------------------------------------------------- painting
// Called from render.js inside chunk rendering, after the base ground fill.
const HW = 32, HH = 16;
// unit step in screen px toward each DIR (half-tile)
const DIR_PX = [[HW / 2, -HH / 2], [HW / 2, HH / 2], [-HW / 2, HH / 2], [-HW / 2, -HH / 2]];

function bandQuad(ctx, sx, sy, d, halfW, len) {
  // quad from tile center toward edge midpoint of direction d, width halfW*2
  const [ux, uy] = DIR_PX[d];
  // perpendicular unit (screen) for width: rotate (ux,uy) -> for iso use the other diagonal
  const pd = (d + 1) % 4;
  const [px, py] = DIR_PX[pd];
  const pl = Math.hypot(px, py);
  const nx = px / pl * halfW, ny = py / pl * halfW;
  ctx.beginPath();
  ctx.moveTo(sx - nx, sy - ny);
  ctx.lineTo(sx + nx, sy + ny);
  ctx.lineTo(sx + ux * len + nx, sy + uy * len + ny);
  ctx.lineTo(sx + ux * len - nx, sy + uy * len - ny);
  ctx.closePath();
  ctx.fill();
}

Roads.paintTile = (ctx, x, y, sx, sy) => {
  const tier = Roads.at(x, y);
  if (!tier) return;
  const m = Roads.mask(x, y);
  const C = G.C, M = G.M;
  const h = M.hash2(x, y, G.grid.seed ^ 0x60AD);

  if (tier === 1) {
    // dirt path: soft band along connections, worn center
    const P = C.PAL.dirt;
    ctx.fillStyle = C.mix(P[2], P[1], h * 0.3);
    ctx.beginPath();
    ctx.ellipse(sx, sy, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let d = 0; d < 4; d++) {
      if (m & (1 << d)) bandQuad(ctx, sx, sy, d, 6.5, 1.12);
    }
    if (m === 0) { // isolated stub: small patch already drawn
      ctx.fillStyle = C.withAlpha(P[3], 0.6);
      ctx.beginPath();
      ctx.ellipse(sx, sy, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // wheel ruts/pebbles
    ctx.fillStyle = C.withAlpha(P[4], 0.35);
    for (let i = 0; i < 3; i++) {
      const ox = (M.hash2(x, y, i * 17 + 1) - 0.5) * 18;
      const oy = (M.hash2(x, y, i * 23 + 2) - 0.5) * 8;
      ctx.fillRect(sx + ox, sy + oy, 1.6, 1.2);
    }
    return;
  }

  const onWater = G.T.isWater(G.grid.groundAt(x, y));
  if (onWater) {
    // bridge deck: wooden planks slightly proud of the water, posts at corners
    const W = C.PAL.wood;
    ctx.beginPath();
    ctx.moveTo(sx, sy - HH - 2.5);
    ctx.lineTo(sx + HW + 2, sy - 2);
    ctx.lineTo(sx, sy + HH - 1.5);
    ctx.lineTo(sx - HW - 2, sy - 2);
    ctx.closePath();
    ctx.fillStyle = C.mix(W[2], W[3], h * 0.3);
    ctx.fill();
    ctx.strokeStyle = C.withAlpha(W[4], 0.6);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // plank seams
    ctx.strokeStyle = C.withAlpha(W[4], 0.3);
    ctx.lineWidth = 1;
    for (const f of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(sx + f * HW, sy - 2 - (1 - Math.abs(f)) * (HH - 2));
      ctx.lineTo(sx + f * HW, sy - 2 + (1 - Math.abs(f)) * (HH - 2));
      ctx.stroke();
    }
    // support posts on the south corner
    ctx.fillStyle = W[4];
    ctx.fillRect(sx - HW * 0.55 - 1.4, sy - 2, 2.8, 8);
    ctx.fillRect(sx + HW * 0.55 - 1.4, sy - 2, 2.8, 8);
    return;
  }

  // cobble / paved / avenue: full-diamond surface with curbs on open edges
  const surf = tier === 2 ? C.PAL.cobble : C.PAL.pave;
  ctx.beginPath();
  ctx.moveTo(sx, sy - HH - 0.5);
  ctx.lineTo(sx + HW + 1, sy);
  ctx.lineTo(sx, sy + HH + 0.5);
  ctx.lineTo(sx - HW - 1, sy);
  ctx.closePath();
  ctx.fillStyle = C.mix(surf[2], surf[3], h * 0.25);
  ctx.fill();

  // curbs along edges with no connection (light sidewalk strip for paved+)
  const edges = [ // [corner A, corner B] per DIR: NE edge, SE edge, SW edge, NW edge
    [[0, -HH], [HW, 0]], [[HW, 0], [0, HH]], [[0, HH], [-HW, 0]], [[-HW, 0], [0, -HH]],
  ];
  for (let d = 0; d < 4; d++) {
    if (m & (1 << d)) continue;
    const [[ax, ay], [bx, by]] = edges[d];
    ctx.strokeStyle = tier >= 3 ? surf[1] : C.withAlpha(surf[4], 0.7);
    ctx.lineWidth = tier >= 3 ? 4 : 1.6;
    ctx.beginPath();
    // inset curb slightly toward center
    ctx.moveTo(sx + ax * 0.92, sy + ay * 0.92);
    ctx.lineTo(sx + bx * 0.92, sy + by * 0.92);
    ctx.stroke();
  }

  if (tier === 2) {
    // cobblestone speckle
    for (let i = 0; i < 12; i++) {
      const ox = (M.hash2(x, y, i * 13 + 3) - 0.5) * 44;
      const oy = (M.hash2(x, y, i * 31 + 9) - 0.5) * 20;
      if (Math.abs(ox) / HW + Math.abs(oy) / HH > 0.82) continue;
      ctx.fillStyle = C.withAlpha(i % 2 ? surf[1] : surf[4], 0.5);
      ctx.beginPath();
      ctx.ellipse(sx + ox, sy + oy, 2.2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // paved: dashed center lines along connected directions
    ctx.strokeStyle = C.withAlpha('#f2e6b8', 0.65);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]);
    for (let d = 0; d < 4; d++) {
      if (!(m & (1 << d))) continue;
      const [ux, uy] = DIR_PX[d];
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ux, sy + uy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
};
})();
