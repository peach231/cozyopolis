// Seeded demo settlements for screenshots, tests and balance sims.
// Used by hash modes (#hamlet, #town) and tools/check.js.
(() => {
const G = globalThis.G ??= {};
const Demo = G.Demo = {};

function clearRect(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const s = G.grid.structAt(x, y);
      if (s) G.grid.removeStructure(s.id);
    }
  }
}

const road = (x0, y0, x1, y1, tier) => {
  for (const [x, y] of G.Roads.lineTiles(x0, y0, x1, y1)) G.Roads.place(x, y, tier);
};
const put = (type, x, y) => {
  const def = G.Buildings.byId[type];
  return G.grid.addStructure({ kind: 'building', type, x, y, w: def.fw, h: def.fd });
};

// small starting village on dirt paths
Demo.hamlet = () => {
  const cx = G.grid.size / 2, cy = G.grid.size / 2;
  clearRect(cx - 8, cy - 8, cx + 8, cy + 8);
  road(cx - 5, cy + 1, cx + 4, cy + 1, 1);
  road(cx + 1, cy - 4, cx + 1, cy + 5, 1);
  road(cx - 5, cy + 3, cx - 1, cy + 3, 1);
  put('well', cx, cy);
  put('cottage_a', cx - 3, cy - 2);
  put('cottage_b', cx - 1, cy - 3);
  put('cottage_c', cx + 2, cy - 2);
  put('cottage_a', cx + 3, cy - 1);
  put('farmhouse', cx - 4, cy + 2);
  put('barn', cx + 2, cy + 2);
  put('field_wheat', cx - 4, cy + 4);
  put('field_wheat', cx - 3, cy + 4);
  put('field_greens', cx - 2, cy + 4);
  put('field_greens', cx - 4, cy + 5);
  put('field_wheat', cx - 3, cy + 5);
  put('stall', cx - 2, cy - 1);
};

// paved grid with 4-way intersections (traffic lights) for testing traffic law
Demo.town = () => {
  const cx = G.grid.size / 2, cy = G.grid.size / 2;
  clearRect(cx - 10, cy - 9, cx + 11, cy + 10);
  // two horizontals + two verticals, tier 3 -> four 4-way intersections
  road(cx - 8, cy - 3, cx + 9, cy - 3, 3);
  road(cx - 8, cy + 4, cx + 9, cy + 4, 3);
  road(cx - 4, cy - 7, cx - 4, cy + 8, 3);
  road(cx + 5, cy - 7, cx + 5, cy + 8, 3);
  // cobble side lanes
  road(cx - 8, cy - 3, cx - 8, cy + 4, 2);
  road(cx + 9, cy - 3, cx + 9, cy + 4, 2);
  // buildings lining the streets (every entry touches a road)
  put('cottage_a', cx - 6, cy - 4);
  put('cottage_b', cx - 2, cy - 4);
  put('cottage_c', cx + 1, cy - 4);
  put('cottage_a', cx + 7, cy - 4);
  put('cottage_b', cx - 6, cy + 5);
  put('cottage_c', cx - 1, cy + 5);
  put('cottage_a', cx + 3, cy + 5);
  put('cottage_b', cx + 7, cy + 5);
  put('stall', cx - 3, cy - 2);
  put('stall', cx + 6, cy + 2);
  put('farmhouse', cx - 3, cy + 2);
  put('farmhouse', cx + 6, cy - 6);
  put('barn', cx - 7, cy - 2);
  put('well', cx + 2, cy - 2);
  put('cottage_c', cx - 5, cy - 6);
  put('cottage_a', cx - 3, cy + 6);
};

// zoned starter village: roads + zones only, lets the growth sim do the rest.
// Used by #grow and the balance/e2e checks.
Demo.grow = () => {
  const cx = G.grid.size / 2, cy = G.grid.size / 2;
  clearRect(cx - 11, cy - 11, cx + 11, cy + 11);
  // path grid: 3 horizontal x 3 vertical lanes
  for (const dy of [-6, 0, 6]) road(cx - 9, cy + dy, cx + 9, cy + dy, 1);
  for (const dx of [-8, 0, 8]) road(cx + dx, cy - 8, cx + dx, cy + 8, 1);
  const zone = (x0, y0, x1, y1, z) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (G.Build.canZone(x, y)) G.grid.zones[G.grid.idx(x, y)] = z;
      }
    }
  };
  // residential ribbons along the outer lanes, commercial spine in the middle
  zone(cx - 9, cy - 7, cx + 9, cy - 4, 1);
  zone(cx - 9, cy + 4, cx + 9, cy + 7, 1);
  zone(cx - 9, cy - 2, cx + 9, cy + 2, 2);
  put('well', cx + 1, cy + 3);
  put('green', cx - 3, cy + 1) || put('green', cx - 7, cy + 1);
  G.Growth.landValuePass();
};

// ---------------------------------------------------------------- autoplay
// A simple bot "player": expands a street grid, zones blocks, places parks and
// era civics. Drives balance tests (tools/balance.js) and the #autoplay=N hash
// mode for reviewing late-game cities. Returns {era: simMinuteReached}.
Demo.autoplay = (maxMinutes, opts = {}) => {
  const C = G.grid.size / 2;
  const SPACING = 4;
  let radius = 0;
  const placedOnce = new Set();
  const tierForEra = () => [1, 2, 2, 3, 3][G.city.eraIndex];

  const ringCost = () => {
    const r = radius + SPACING;
    const lines = Math.floor(2 * r / SPACING) + 1;
    return lines * (2 * r + 1) * 2 * G.Roads.TIERS[tierForEra()].cost;
  };
  const buildRing = () => {
    const r = radius + SPACING, tier = tierForEra();
    for (let k = -r; k <= r; k += SPACING) {
      G.Build.commitRoadLine(G.Roads.lineTiles(C + k, C - r, C + k, C + r), tier);
      G.Build.commitRoadLine(G.Roads.lineTiles(C - r, C + k, C + r, C + k), tier);
    }
    radius = r;
  };
  const zoneBlocks = () => {
    let block = 0;
    for (let by = -radius; by < radius; by += SPACING) {
      for (let bx = -radius; bx < radius; bx += SPACING) {
        block++;
        const z = (block % 3 === 0) ? 2 : 1;
        G.Build.commitZoneRect(G.Build.rectTiles(C + bx + 1, C + by + 1,
          C + bx + SPACING - 1, C + by + SPACING - 1), z);
      }
    }
  };
  const freeZoned = (z) => {
    let n = 0;
    const grid = G.grid, size = grid.size;
    for (let i = 0; i < grid.zones.length; i++) {
      if (grid.zones[i] !== z || grid.occ[i] !== 0 || grid.roads[i]) continue;
      if (G.Roads.touchesFootprint(i % size, (i / size) | 0, 1, 1)) n++;
    }
    return n;
  };
  const placeOnceFn = (type) => {
    if (placedOnce.has(type)) return;
    const def = G.Buildings.byId[type];
    if (G.Eras.indexOf(def.era) > G.city.eraIndex) return;
    if (G.city.funds < def.cost + 600) return;
    for (let r = 2; r < radius + 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (G.Build.buildingPlacement(type, C + dx, C + dy).ok &&
              G.Build.tryPlaceBuilding(type, C + dx, C + dy)) {
            placedOnce.add(type);
            return;
          }
        }
      }
    }
  };
  const think = () => {
    if ((freeZoned(1) < 8 || freeZoned(2) < 4) && radius < 55 &&
        G.city.funds > ringCost() + 300) {
      buildRing();
      zoneBlocks();
    }
    placeOnceFn('well');
    if (G.city.eraIndex >= 1) { placeOnceFn('chapel'); placeOnceFn('green'); }
    if (G.city.eraIndex >= 2) { placeOnceFn('school'); placeOnceFn('town_hall'); placeOnceFn('plaza'); }
    if (G.city.eraIndex >= 3) { placeOnceFn('clock_tower'); placeOnceFn('museum'); placeOnceFn('fountain'); }
    if (G.city.eraIndex >= 4) { placeOnceFn('cathedral'); placeOnceFn('stadium'); placeOnceFn('spire'); }
  };

  buildRing();
  buildRing();
  zoneBlocks();

  const eraTimes = { hamlet: 0 };
  const stopEra = opts.stopEra ?? 4;
  let botT = 0;
  const t0 = Date.now();
  for (let m = 0; m < maxMinutes; m++) {
    if (typeof console !== 'undefined' && G.hash?.debug) {
      console.log(`autoplay min ${m} pop ${G.city.pop} wall ${Date.now() - t0}ms`);
    }
    for (let i = 0; i < 60 * 60; i++) {
      G.time.tick(1 / 60);
      G.Growth.tick(1 / 60);
      G.Events.tick(1 / 60);
      botT += 1 / 60;
      if (botT >= 8) { botT = 0; think(); }
    }
    const era = G.Eras.current().id;
    if (!(era in eraTimes)) eraTimes[era] = m + 1;
    opts.onMinute?.(m + 1);
    if (G.city.eraIndex >= stopEra) break;
  }
  return eraTimes;
};
})();
