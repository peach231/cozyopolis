// Isometric projection. World coords are tile units (floats allowed for agents);
// screen coords are world-pixels before camera transform.
// Tile (x,y): +x runs screen right-down, +y runs screen left-down.
(() => {
const G = globalThis.G ??= {};
const ISO = G.ISO = {
  TILE_W: 64,
  TILE_H: 32,
  HALF_W: 32,
  HALF_H: 16,
};

// world tile coords -> world-pixel coords of the tile's diamond CENTER
ISO.toScreen = (x, y) => [(x - y) * ISO.HALF_W, (x + y) * ISO.HALF_H];

// world-pixel coords -> fractional tile coords (inverse of toScreen)
ISO.toWorld = (sx, sy) => [
  sx / ISO.TILE_W + sy / ISO.TILE_H,
  sy / ISO.TILE_H - sx / ISO.TILE_W,
];

// integer tile under a world-pixel point (diamond-accurate, not bbox)
ISO.tileAt = (sx, sy) => {
  const [wx, wy] = ISO.toWorld(sx, sy);
  return [Math.round(wx), Math.round(wy)];
};

// painter's-algorithm depth for a world position
ISO.depth = (x, y) => x + y;
})();
