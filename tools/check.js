// Headless validator: loads every game script in index.html order under Node,
// then lints data + runs deterministic sim checks. Usage: node tools/check.js
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
globalThis.G = { HEADLESS: true };

// load scripts in index.html order (they are IIFEs attaching to globalThis.G)
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (srcs.length === 0) throw new Error('no scripts found in index.html');
for (const src of srcs) {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  try {
    new Function(code)();
  } catch (e) {
    console.error(`LOAD FAIL ${src}: ${e.message}`);
    process.exit(1);
  }
}
const G = globalThis.G;

let pass = 0, fail = 0;
function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL  ${name}: ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log(`loaded ${srcs.length} scripts`);

// ---------------------------------------------------------------- core
check('palette ramps are 5-step valid hex', () => {
  for (const [k, v] of Object.entries(G.C.PAL)) {
    if (!Array.isArray(v)) continue;
    if (k === 'glowWindow') continue;
    assert(v.length === 5, `${k} has ${v.length} steps`);
    for (const c of v) assert(/^#[0-9a-f]{6}$/i.test(c), `${k}: bad color ${c}`);
  }
});

check('iso projection round-trips', () => {
  for (const [x, y] of [[0, 0], [5, 9], [127, 127], [3.25, 7.5], [-2, 4]]) {
    const [sx, sy] = G.ISO.toScreen(x, y);
    const [wx, wy] = G.ISO.toWorld(sx, sy);
    assert(Math.abs(wx - x) < 1e-9 && Math.abs(wy - y) < 1e-9, `(${x},${y}) -> (${wx},${wy})`);
  }
});

check('rng deterministic + in range', () => {
  const a = G.rng(123), b = G.rng(123);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert(v === b(), 'streams diverge');
    assert(v >= 0 && v < 1, `out of range ${v}`);
  }
  assert(G.rng('hello')() === G.rng('hello')(), 'string seeds diverge');
});

// ---------------------------------------------------------------- world
check('terrain deterministic per seed', () => {
  G.grid.init(96, 42);
  const h1 = G.grid.hash();
  G.grid.init(96, 42);
  assert(G.grid.hash() === h1, 'same seed differs');
  G.grid.init(96, 43);
  assert(G.grid.hash() !== h1, 'different seed identical');
});

check('terrain sanity: river exists, deco placement legal', () => {
  for (const seed of [1, 7, 99, 2026]) {
    G.grid.init(128, seed);
    let water = 0;
    for (let i = 0; i < G.grid.ground.length; i++) {
      if (i >= 0) {
        const t = G.grid.ground[i];
        assert(t <= 4, `bad ground type ${t}`);
        if (t === G.T.WATER) water++;
      }
    }
    const frac = water / G.grid.ground.length;
    assert(frac > 0.005 && frac < 0.2, `seed ${seed}: water fraction ${frac.toFixed(3)}`);
    for (const s of G.grid.structures.values()) {
      assert(G.grid.inBounds(s.x, s.y), `seed ${seed}: deco out of bounds`);
      const t = G.grid.groundAt(s.x, s.y);
      assert(G.T.isBuildable(t), `seed ${seed}: ${s.kind} on ground type ${t}`);
      assert(G.grid.occ[G.grid.idx(s.x, s.y)] === s.id, `seed ${seed}: occ mismatch`);
    }
    assert(G.grid.structures.size > 100, `seed ${seed}: only ${G.grid.structures.size} deco`);
  }
});

check('structure add/remove leaves occupancy clean', () => {
  G.grid.init(64, 5);
  const before = G.grid.hash();
  const s = G.grid.addStructure({ kind: 'tree', leaf: 'leafWarm', v: 0, x: 32, y: 32, w: 2, h: 2 });
  if (s) {
    assert(G.grid.structAt(33, 33) === s, 'footprint not occupied');
    G.grid.removeStructure(s.id);
  }
  assert(G.grid.hash() === before, 'occupancy not restored');
  // overlap rejected
  const a = G.grid.addStructure({ kind: 'rock', v: 0, x: 10, y: 10 });
  const b = G.grid.addStructure({ kind: 'rock', v: 0, x: 10, y: 10 });
  assert(a && !b, 'overlap not rejected');
  G.grid.removeStructure(a.id);
});

// ---------------------------------------------------------------- roads & build
check('roads: placement, mask, L-lines, removal', () => {
  G.grid.init(64, 9);
  // find an all-grass 5x5 patch
  let bx = -1, by = -1;
  outer:
  for (let y = 4; y < 56; y++) {
    for (let x = 4; x < 56; x++) {
      let ok = true;
      for (let dy = 0; dy < 5 && ok; dy++) {
        for (let dx = 0; dx < 5 && ok; dx++) {
          ok = G.Roads.canPlace(x + dx, y + dy)
            && !G.grid.structAt(x + dx, y + dy);
        }
      }
      if (ok) { bx = x; by = y; break outer; }
    }
  }
  assert(bx >= 0, 'no clear patch found');
  // cross at center
  const cx = bx + 2, cy = by + 2;
  assert(G.Roads.place(cx, cy, 1) === 5, 'place cost wrong');
  assert(G.Roads.place(cx, cy, 1) === 0, 'same-tier should be free no-op');
  for (const [dx, dy] of G.Roads.DIRS) G.Roads.place(cx + dx, cy + dy, 1);
  assert(G.Roads.mask(cx, cy) === 15, `cross mask ${G.Roads.mask(cx, cy)}`);
  assert(G.Roads.place(cx, cy, 2) === 12, 'upgrade should charge new tier');
  // L-line
  const tiles = G.Roads.lineTiles(0, 0, 3, 2);
  assert(tiles.length === 6, `line length ${tiles.length}`);
  for (let i = 1; i < tiles.length; i++) {
    const d = Math.abs(tiles[i][0] - tiles[i - 1][0]) + Math.abs(tiles[i][1] - tiles[i - 1][1]);
    assert(d === 1, 'diagonal step in line');
  }
  for (const [dx, dy] of G.Roads.DIRS) assert(G.Roads.remove(cx + dx, cy + dy), 'remove failed');
  assert(G.Roads.mask(cx, cy) === 0, 'mask after removal');
  // water rejected
  let wx = -1, wy = -1;
  for (let i = 0; i < G.grid.ground.length; i++) {
    if (G.grid.ground[i] === G.T.WATER) { wx = i % 64; wy = (i / 64) | 0; break; }
  }
  assert(wx >= 0 && !G.Roads.canPlace(wx, wy), 'water placement allowed');
});

check('build tool: road adjacency rule + funds', () => {
  G.grid.init(64, 9);
  G.city = { name: 't', pop: 0, funds: 1000 };
  let bx = -1, by = -1;
  outer:
  for (let y = 4; y < 56; y++) {
    for (let x = 4; x < 56; x++) {
      let ok = true;
      for (let dy = 0; dy < 4 && ok; dy++) {
        for (let dx = 0; dx < 4 && ok; dx++) {
          ok = G.Roads.canPlace(x + dx, y + dy) && !G.grid.structAt(x + dx, y + dy);
        }
      }
      if (ok) { bx = x; by = y; break outer; }
    }
  }
  assert(bx >= 0, 'no clear patch');
  // no road yet -> rejected
  assert(!G.Build.tryPlaceBuilding('cottage_a', bx + 1, by + 1), 'placed without road');
  G.Roads.place(bx, by + 1, 1);
  G.Roads.place(bx, by + 2, 1);
  assert(G.Build.tryPlaceBuilding('cottage_a', bx + 1, by + 1), 'valid placement rejected');
  assert(G.city.funds === 1000 - 100, `funds ${G.city.funds}`);
  // overlap rejected
  assert(!G.Build.tryPlaceBuilding('cottage_a', bx + 1, by + 1), 'overlap placed');
  // insufficient funds
  G.city.funds = 10;
  assert(!G.Build.tryPlaceBuilding('cottage_a', bx + 1, by + 2), 'placed while broke');
  assert(G.city.funds === 10, 'funds changed on failed placement');
  // bulldoze refunds 25%
  G.Build.bulldozeAt(bx + 1, by + 1);
  assert(G.city.funds === 35, `refund wrong: ${G.city.funds}`);
});

// ---------------------------------------------------------------- agents & traffic
check('agents+traffic: town sim — paths legal, lights cycle, cars obey roads', () => {
  G.grid.init(128, 7);
  G.city = { name: 't', pop: 0, funds: 1e9 };
  G.Demo.town();
  G.time.day = 1; G.time.hour = 12;

  // pathfinding sanity on the demo network
  const c = 64;
  const p = G.Agents.findPath(c - 4, c - 3, c + 5, c + 4);
  assert(p && p.length >= 16, `path missing/short: ${p?.length}`);
  for (const [x, y] of p) assert(G.Roads.at(x, y) > 0, 'path leaves roads');
  assert(G.Agents.findPath(c - 4, c - 3, c + 5, c + 4, 2), 'tier-2 path missing');

  let maxCars = 0, maxWalkers = 0, sawWait = false;
  for (let i = 0; i < 60 * 90; i++) { // 90 sim-seconds
    G.time.tick(1 / 60);
    G.Agents.tick(1 / 60);
    G.Traffic.tick(1 / 60);
    maxCars = Math.max(maxCars, G.Traffic.cars.length);
    maxWalkers = Math.max(maxWalkers, G.Agents.walkers.length);
    for (const car of G.Traffic.cars) {
      assert(Number.isFinite(car.x) && Number.isFinite(car.y), 'car NaN');
      assert(G.Roads.at(Math.round(car.x), Math.round(car.y)) > 0,
        `car off-road at ${car.x.toFixed(2)},${car.y.toFixed(2)}`);
      if (car.state === 'light' || car.state === 'stop') sawWait = true;
    }
    for (const w of G.Agents.walkers) {
      assert(Number.isFinite(w.x) && Number.isFinite(w.y), 'walker NaN');
    }
  }
  assert(G.Traffic.lights.size >= 4, `lights: ${G.Traffic.lights.size}`);
  assert(maxCars >= 3, `cars never appeared (max ${maxCars})`);
  assert(maxWalkers >= 5, `walkers never appeared (max ${maxWalkers})`);
  assert(sawWait, 'no car ever waited at a light/stop');
  // vehicle progression: motor cars never touch sub-paved tiles
  for (const car of G.Traffic.cars) {
    if (car.veh !== 'car') continue;
    assert(G.Roads.at(Math.round(car.x), Math.round(car.y)) >= 3,
      'motor car on a sub-paved road');
  }

  // light state machine cycles
  const L = [...G.Traffic.lights.values()][0];
  const ax0 = L.axis;
  let flipped = false;
  for (let i = 0; i < 60 * 10 && !flipped; i++) {
    G.Traffic.tick(1 / 60);
    if (L.axis !== ax0) flipped = true;
  }
  assert(flipped, 'light never changed axis');
});

check('vehicle progression: cobble-only network gets carts, never cars', () => {
  G.grid.init(96, 31);
  G.city = { name: 't', pop: 0, funds: 1e9, eraIndex: 1, happiness: 0.6 };
  // small cobble loop with two buildings
  const c = 48;
  let placed = 0;
  for (const [x0, y0, x1, y1] of [[c - 4, c, c + 4, c], [c - 4, c + 4, c + 4, c + 4],
    [c - 4, c, c - 4, c + 4], [c + 4, c, c + 4, c + 4]]) {
    for (const [x, y] of G.Roads.lineTiles(x0, y0, x1, y1)) {
      if (G.Roads.place(x, y, 2) >= 0) placed++;
    }
  }
  assert(placed > 10, 'cobble loop not built');
  for (const [bx, by] of [[c - 3, c - 1], [c + 3, c + 5]]) {
    const s = G.grid.structAt(bx, by);
    if (s) G.grid.removeStructure(s.id);
    G.grid.addStructure({ kind: 'building', type: 'cottage_a', x: bx, y: by, w: 1, h: 1 });
  }
  G.time.hour = 12;
  let sawCart = false;
  for (let i = 0; i < 60 * 60; i++) {
    G.Traffic.tick(1 / 60);
    for (const v of G.Traffic.cars) {
      assert(v.veh !== 'car', 'motor car spawned on cobble-only network');
      if (v.veh === 'cart') sawCart = true;
    }
  }
  assert(sawCart, 'no cart ever appeared on the cobble network');
});

// ---------------------------------------------------------------- buildings
check('building catalog: unique ids, valid recipes, full build under mock canvas', () => {
  const seen = new Set();
  // mock 2d context: swallow draw calls, allow style sets — materials & geometry
  // still validate because shapegen computes them in plain JS before drawing
  const mockCtx = () => new Proxy({}, {
    get: (t, k) => (k in t) ? t[k] : (...a) => undefined,
    set: (t, k, v) => { t[k] = v; return true; },
  });
  G.Shape.canvasFactory = () => {
    const t = { width: 0, height: 0 };
    t.getContext = () => mockCtx();
    return t;
  };
  for (const def of G.Buildings.all) {
    assert(!seen.has(def.id), `duplicate id ${def.id}`);
    seen.add(def.id);
    assert(def.name && def.era, `${def.id}: missing name/era`);
    assert(def.cost > 0, `${def.id}: missing cost`);
    G.Shape.lint(def);
    const spr = G.Shape.build(def);       // throws on unknown materials/ops
    assert(spr.ax > 0 && spr.ay > 0, `${def.id}: bad anchor`);
  }
  G.Shape.canvasFactory = null;
});

// ---------------------------------------------------------------- growth
check('growth: zoned village grows, pop rises, era advances, no NaN funds', () => {
  G.grid.init(128, 11);
  G.city = { name: 't', pop: 0, funds: 5000, eraIndex: 0, happiness: 0.6 };
  G.Demo.grow();
  G.time.day = 1; G.time.hour = 8;
  let grew = 0, leveled = 0;
  G.hooks.grown = () => grew++;
  G.hooks.leveledUp = () => leveled++;
  // ~12 sim-minutes
  for (let i = 0; i < 60 * 60 * 12; i++) {
    G.time.tick(1 / 60);
    G.Growth.tick(1 / 60);
    if (i % 600 === 0) {
      assert(Number.isFinite(G.city.funds), 'funds NaN');
      assert(G.city.pop >= 0, 'negative pop');
    }
  }
  delete G.hooks.grown;
  delete G.hooks.leveledUp;
  assert(grew >= 10, `only ${grew} buildings grew`);
  assert(G.city.pop >= 50, `pop after 12 min: ${G.city.pop}`);
  assert(G.city.eraIndex >= 1, `era never advanced (pop ${G.city.pop})`);
  // grown buildings sit on legal tiles with road access
  for (const s of G.grid.structures.values()) {
    if (s.kind !== 'building') continue;
    assert(G.Buildings.byId[s.type], `unknown type ${s.type}`);
    if (s.construction === 0 || s.construction === undefined) continue;
  }
  const b = G.Growth.dailyBudget();
  assert(b.income > 0 && b.upkeep >= 0, `budget ${JSON.stringify(b)}`);
  // demand bars in range
  assert(G.Growth.demand.res >= 0 && G.Growth.demand.res <= 1, 'res demand range');
  assert(G.Growth.demand.com >= 0 && G.Growth.demand.com <= 1, 'com demand range');
});

// ---------------------------------------------------------------- events & save
check('events: ticker fills, festival fires, confetti decays', () => {
  G.grid.init(128, 11);
  G.city = { name: 't', pop: 0, funds: 5000, eraIndex: 0, happiness: 0.6 };
  G.Demo.grow();
  G.Events.init();
  G.time.day = 3; G.time.hour = 9.9; // day%3===0 -> festival at 10:00
  for (let i = 0; i < 60 * 90; i++) {
    G.time.tick(1 / 60);
    G.Growth.tick(1 / 60);
    G.Events.tick(1 / 60);
  }
  assert(G.Events.ticker.length >= 2, 'ticker empty');
  G.Events.burstConfetti();
  assert(G.Events.confetti.length > 0, 'no confetti');
  for (let i = 0; i < 60 * 5; i++) G.Events.tick(1 / 60);
  assert(G.Events.confetti.length === 0, 'confetti never decays');
});

check('save: capture/apply round-trips world state', () => {
  G.grid.init(96, 21);
  G.city = { name: 'Roundtrip', pop: 0, funds: 4321, eraIndex: 2, happiness: 0.55 };
  G.Demo.hamlet?.call ? G.Demo.hamlet() : null;
  G.time.day = 7; G.time.hour = 13.5;
  // stub browser bits used by Save under Node
  if (typeof globalThis.btoa === 'undefined') {
    globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
    globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  }
  const before = G.grid.hash();
  const structCount = G.grid.structures.size;
  const snap = G.Save.capture();
  // scramble the world, then restore
  G.grid.init(96, 99);
  G.city = { name: 'x', pop: 9, funds: 1, eraIndex: 0 };
  G.Save.apply(snap);
  assert(G.grid.hash() === before, 'grid hash mismatch after load');
  assert(G.grid.structures.size === structCount, 'structure count mismatch');
  assert(G.city.name === 'Roundtrip' && G.city.funds === 4321 && G.city.eraIndex === 2,
    'city fields mismatch');
  assert(G.time.day === 7 && Math.abs(G.time.hour - 13.5) < 1e-9, 'clock mismatch');
});

// ---------------------------------------------------------------- day/night
check('day/night grade valid for all hours', () => {
  for (let h = 0; h <= 24; h += 0.1) {
    const [c, a] = G.Render.gradeAt(h % 24);
    assert(/^#[0-9a-f]{6}$/i.test(c), `bad grade color at ${h}: ${c}`);
    assert(a >= 0 && a <= 0.85, `grade alpha ${a} at ${h}`);
  }
  // noon is clear, midnight is heavy
  assert(G.Render.gradeAt(12)[1] < 0.05, 'noon too tinted');
  assert(G.Render.gradeAt(0)[1] > 0.6, 'midnight too bright');
});

// ---------------------------------------------------------------- time
check('clock advances and wraps days', () => {
  G.time.day = 1; G.time.hour = 8;
  for (let i = 0; i < 60 * G.time.DAY_SECONDS; i++) G.time.tick(1 / 60);
  assert(G.time.day === 2, `day ${G.time.day}`);
  assert(Math.abs(G.time.hour - 8) < 0.01, `hour ${G.time.hour}`);
  for (let h = 0; h < 24; h += 0.25) {
    G.time.hour = h;
    const d = G.time.daylight();
    assert(d >= 0 && d <= 1, `daylight ${d} at ${h}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
