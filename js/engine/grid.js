// World grid: ground layer + structure occupancy. Structures (trees, rocks,
// later buildings) live in a Map by id; occ holds the owning id per cell (0 = free).
(() => {
const G = globalThis.G ??= {};

const grid = G.grid = {
  size: 0,
  ground: null,     // Uint8Array of G.T types
  occ: null,        // Int32Array of structure ids (0 = empty)
  structures: new Map(),
  nextId: 1,
  seed: 0,
};

grid.init = (size, seed) => {
  grid.size = size;
  grid.seed = seed;
  grid.ground = new Uint8Array(size * size);
  grid.roads = new Uint8Array(size * size);
  grid.zones = new Uint8Array(size * size);   // 0 none, 1 residential, 2 commercial
  grid.landValue = new Float32Array(size * size);
  grid.occ = new Int32Array(size * size);
  grid.structures = new Map();
  grid.nextId = 1;
  G.Terrain.gen(grid, seed);
  G.Render?.invalidateAll?.();
  G.Agents?.reset?.();
  G.Traffic?.reset?.();
  G.Growth?.reseed?.(seed);
};

grid.idx = (x, y) => y * grid.size + x;
grid.inBounds = (x, y) => x >= 0 && y >= 0 && x < grid.size && y < grid.size;
grid.groundAt = (x, y) => grid.inBounds(x, y) ? grid.ground[grid.idx(x, y)] : G.T.WATER;
grid.structAt = (x, y) =>
  grid.inBounds(x, y) ? grid.structures.get(grid.occ[grid.idx(x, y)]) : undefined;

// s: {kind, x, y, w?, h?, ...} footprint w×h tiles (default 1×1), anchored at (x,y)
// being the footprint's minimum corner. Returns the structure or null if blocked.
grid.addStructure = (s) => {
  const w = s.w ?? 1, h = s.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (!grid.inBounds(s.x + dx, s.y + dy)) return null;
      if (grid.occ[grid.idx(s.x + dx, s.y + dy)] !== 0) return null;
    }
  }
  s.id = grid.nextId++;
  grid.structures.set(s.id, s);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      grid.occ[grid.idx(s.x + dx, s.y + dy)] = s.id;
    }
  }
  return s;
};

grid.removeStructure = (id) => {
  const s = grid.structures.get(id);
  if (!s) return;
  const w = s.w ?? 1, h = s.h ?? 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      grid.occ[grid.idx(s.x + dx, s.y + dy)] = 0;
    }
  }
  grid.structures.delete(id);
};

// cheap content hash for determinism tests
grid.hash = () => {
  let h = 2166136261;
  for (let i = 0; i < grid.ground.length; i++) {
    h ^= grid.ground[i] + (grid.occ[i] ? 7 : 0) + grid.roads[i] * 31;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
})();
