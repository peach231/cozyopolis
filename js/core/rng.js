// Seeded RNG (mulberry32). G.rng(seed) -> callable stream with helpers.
(() => {
const G = globalThis.G ??= {};

G.seedFrom = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

G.rng = (seed) => {
  let s = (typeof seed === 'string' ? G.seedFrom(seed) : seed) >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo));       // [lo, hi)
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.range = (lo, hi) => lo + next() * (hi - lo);
  return next;
};
})();
