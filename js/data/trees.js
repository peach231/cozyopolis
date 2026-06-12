// Tree species recipes — interpreted by the tree painter in render.js, the
// same data-driven approach as building recipes. Each species defines trunk,
// silhouette and decoration; variants come from the per-tree rng.
(() => {
const G = globalThis.G ??= {};

G.TreeArt = {
  oak: {
    leaf: 'leafWarm', trunk: 'woodDark', shape: 'round',
    w: [14, 19], h: [12, 16], trunkH: [13, 17], trunkW: 5,
  },
  elm: {
    leaf: 'leafCool', trunk: 'woodDark', shape: 'round',
    w: [12, 16], h: [14, 18], trunkH: [15, 20], trunkW: 4.4,
  },
  birch: {
    leaf: 'leafGold', trunk: 'plaster', shape: 'round',
    w: [10, 13], h: [12, 16], trunkH: [16, 22], trunkW: 3.4, bark: true,
  },
  pine: {
    leaf: 'leafCool', trunk: 'woodDark', shape: 'cone',
    w: [11, 15], h: [26, 34], trunkH: [6, 9], trunkW: 4, tiers: 3,
  },
  blossom: {
    leaf: 'leafWarm', trunk: 'woodDark', shape: 'round',
    w: [12, 16], h: [10, 13], trunkH: [12, 15], trunkW: 4.6, blossom: 'bloomPink',
  },
};

// legacy structures stored only a palette name — map them to a species
G.TreeArt.fromLeaf = (leaf) =>
  ({ leafWarm: 'oak', leafCool: 'pine', leafGold: 'birch' })[leaf] ?? 'oak';

// weighted pick for terrain generation / planting
G.TreeArt.pick = (rng) => {
  const r = rng();
  if (r < 0.36) return 'oak';
  if (r < 0.58) return 'elm';
  if (r < 0.78) return 'pine';
  if (r < 0.92) return 'birch';
  return 'blossom';
};
})();
