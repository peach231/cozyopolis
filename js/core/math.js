// Core math helpers. Every module attaches to the shared global namespace G.
(() => {
const G = globalThis.G ??= {};
const M = G.M = {};

M.clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
M.lerp = (a, b, t) => a + (b - a) * t;
M.smoothstep = (t) => t * t * (3 - 2 * t);
// inclusive-exclusive integer range check
M.inRange = (v, lo, hi) => v >= lo && v < hi;
M.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

// fast integer hash of two coords + seed -> [0,1). Deterministic per (x,y,seed),
// used for stable per-tile visual variation.
M.hash2 = (x, y, seed) => {
  let h = (x * 374761393 + y * 668265263 + (seed | 0) * 2147483423) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// value noise on integer lattice, bilinear-smoothed; scale = lattice cell size in tiles
M.vnoise = (x, y, seed, scale) => {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = M.smoothstep(fx - x0), ty = M.smoothstep(fy - y0);
  const a = M.hash2(x0, y0, seed), b = M.hash2(x0 + 1, y0, seed);
  const c = M.hash2(x0, y0 + 1, seed), d = M.hash2(x0 + 1, y0 + 1, seed);
  return M.lerp(M.lerp(a, b, tx), M.lerp(c, d, tx), ty);
};

// fbm: 3 octaves of value noise, normalized roughly to [0,1)
M.fbm = (x, y, seed, scale) =>
  (M.vnoise(x, y, seed, scale) * 4 + M.vnoise(x, y, seed ^ 0x9e37, scale / 2) * 2 +
   M.vnoise(x, y, seed ^ 0x517c, scale / 4)) / 7;
})();
