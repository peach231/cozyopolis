// Terrain generation: seeded, deterministic. Produces ground types + nature
// deco (trees/rocks/flowers) on a fresh grid. Ground type ids live here (data).
(() => {
const G = globalThis.G ??= {};
const M = G.M;

// ground types
const T = G.T = { GRASS: 0, MEADOW: 1, WATER: 2, SAND: 3, DIRT: 4 };
T.isWater = (t) => t === T.WATER;
T.isBuildable = (t) => t === T.GRASS || t === T.MEADOW || t === T.DIRT;

const Terrain = G.Terrain = {};

// Carve a meandering river from the NW edge region to the SE edge region.
// Path is a parametric walk with sine meander; width varies 1..2 tiles.
function carveRiver(grid, rng) {
  const n = grid.size;
  // enter on x edge or y edge, exit on the opposite side
  const vertical = rng.chance(0.5);
  const offset = rng.int(Math.floor(n * 0.25), Math.floor(n * 0.75));
  const amp = rng.range(6, 14), freq = rng.range(1.5, 2.6), phase = rng.range(0, 6.28);
  const wob = rng.int(0, 1 << 30);
  for (let i = -2; i <= n + 1; i++) {
    const t = i / n;
    const meander = Math.sin(t * freq * Math.PI * 2 + phase) * amp
      + (M.vnoise(i, 0, wob, 9) - 0.5) * 10;
    const c = Math.round(offset + meander);
    const w = 1 + M.vnoise(i, 7, wob, 14) * 1.6; // half-width
    for (let d = -3; d <= 3; d++) {
      const x = vertical ? c + d : i;
      const y = vertical ? i : c + d;
      if (!grid.inBounds(x, y)) continue;
      const ad = Math.abs(d);
      if (ad <= w) grid.ground[grid.idx(x, y)] = T.WATER;
      else if (ad <= w + 0.7 && grid.ground[grid.idx(x, y)] !== T.WATER
               && M.vnoise(x, y, wob ^ 0x5A, 5) < 0.62) { // grassy gaps break up the band
        grid.ground[grid.idx(x, y)] = T.SAND;
      }
    }
  }
}

function scatterNature(grid, rng, seed) {
  const n = grid.size;
  const cx = n / 2, cy = n / 2;
  // tree clusters — each grove leans toward one species with strays mixed in
  const clusters = rng.int(26, 36);
  for (let c = 0; c < clusters; c++) {
    const kx = rng.int(4, n - 4), ky = rng.int(4, n - 4);
    const sp = G.TreeArt.pick(rng);
    const count = rng.int(6, 18), spread = rng.range(2.5, 6);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.abs(rng() + rng() - 1) * spread;
      const x = Math.round(kx + Math.cos(a) * r * 2), y = Math.round(ky + Math.sin(a) * r);
      plantTree(grid, rng, x, y, rng.chance(0.8) ? sp : G.TreeArt.pick(rng), cx, cy);
    }
  }
  // lone trees + rocks + flowers
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const g = grid.ground[grid.idx(x, y)];
      if (grid.occ[grid.idx(x, y)] !== 0) continue;
      const h = M.hash2(x, y, seed ^ 0xBEEF);
      if (T.isBuildable(g)) {
        if (h < 0.006) plantTree(grid, rng, x, y, G.TreeArt.pick(rng), cx, cy);
        else if (h > 0.9985) grid.addStructure({ kind: 'rock', v: (h * 997 | 0) % 3, x, y });
        else if (g === T.MEADOW && h > 0.986) {
          grid.addStructure({ kind: 'flowers', v: (h * 991 | 0) % 2, x, y });
        }
      }
    }
  }
}

function plantTree(grid, rng, x, y, sp, cx, cy) {
  if (!grid.inBounds(x, y)) return;
  const i = grid.idx(x, y);
  if (grid.occ[i] !== 0 || !G.T.isBuildable(grid.ground[i])) return;
  // keep the starting area near map center airy so the first hamlet has room
  const d2 = G.M.dist2(x, y, cx, cy);
  if (d2 < 14 * 14 && rng.chance(0.75)) return;
  grid.addStructure({ kind: 'tree', sp, v: rng.int(0, 4), x, y });
}

// Fill ground + deco on an initialized empty grid. Deterministic per seed.
Terrain.gen = (grid, seed) => {
  const rng = G.rng(seed);
  const n = grid.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const m = M.fbm(x, y, seed, 24);
      grid.ground[grid.idx(x, y)] = m > 0.62 ? T.MEADOW : T.GRASS;
    }
  }
  carveRiver(grid, rng);
  scatterNature(grid, rng, seed);
};
})();
