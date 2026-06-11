// Growth & economy: population, RCI demand, auto-growth on zoned land,
// level-ups driven by land value, era milestones, taxes and upkeep.
(() => {
const G = globalThis.G ??= {};
const Growth = G.Growth = {
  demand: { res: 0, com: 0 },
  stats: { housing: 0, jobs: 0, resBuildings: 0, comBuildings: 0, parks: 0 },
};

let grng = null; // deterministic stream, reseeded per map
Growth.reseed = (seed) => { grng = G.rng(seed ^ 0x9e3779b9); };

const STEP = 1.5;        // seconds between growth steps
const LV_STEP = 4;       // seconds between land-value passes
const CONSTRUCT_T = 6;   // seconds of scaffolding

let stepT = 0, lvT = LV_STEP; // land value computes on first tick

// ------------------------------------------------------------- land value
Growth.landValuePass = () => {
  const grid = G.grid, n = grid.size;
  const src = new Float32Array(n * n);
  // sources
  for (let i = 0; i < n * n; i++) {
    if (grid.ground[i] === G.T.WATER) src[i] = 0.5;
  }
  for (const s of grid.structures.values()) {
    const i = grid.idx(s.x, s.y);
    if (s.kind === 'tree') src[i] += 0.5;
    else if (s.kind === 'building') {
      const def = G.Buildings.byId[s.type];
      if (def.aura) {
        const w = s.w ?? 1, h = s.h ?? 1;
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) src[grid.idx(s.x + dx, s.y + dy)] += def.aura * 0.45;
        }
      }
      if (def.kind === 'ind' || def.flat && def.kind === 'farm') src[i] -= 1.2;
    }
  }
  // separable box blur, 2 passes radius 3
  const tmp = new Float32Array(n * n);
  const R = 3, W = 2 * R + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < n; y++) {     // horizontal
      let acc = 0;
      for (let x = -R; x <= R; x++) acc += x >= 0 ? src[y * n + Math.min(x, n - 1)] : 0;
      for (let x = 0; x < n; x++) {
        tmp[y * n + x] = acc / W;
        const xa = x + R + 1, xr = x - R;
        acc += xa < n ? src[y * n + xa] : 0;
        acc -= xr >= 0 ? src[y * n + xr] : 0;
      }
    }
    for (let x = 0; x < n; x++) {     // vertical
      let acc = 0;
      for (let y = -R; y <= R; y++) acc += y >= 0 ? tmp[Math.min(y, n - 1) * n + x] : 0;
      for (let y = 0; y < n; y++) {
        src[y * n + x] = acc / W;
        const ya = y + R + 1, yr = y - R;
        acc += ya < n ? tmp[ya * n + x] : 0;
        acc -= yr >= 0 ? tmp[yr * n + x] : 0;
      }
    }
  }
  for (let i = 0; i < n * n; i++) grid.landValue[i] = G.M.clamp(0.22 + src[i] * 0.85, 0, 1);
};

Growth.valueAt = (x, y) => G.grid.landValue[G.grid.idx(x, y)] ?? 0;

// ------------------------------------------------------------- stats & demand
function recount() {
  const st = Growth.stats;
  st.housing = 0; st.jobs = 0; st.resBuildings = 0; st.comBuildings = 0; st.parks = 0;
  let pop = 0, lvSum = 0;
  for (const s of G.grid.structures.values()) {
    if (s.kind !== 'building' || s.construction > 0) continue;
    const def = G.Buildings.byId[s.type];
    if (def.housing) {
      st.housing += def.housing;
      st.resBuildings++;
      pop += s.pop ?? 0;
      lvSum += Growth.valueAt(s.x, s.y);
    }
    if (def.jobs) st.jobs += def.jobs;
    if (def.kind === 'com' || def.kind === 'ind' || def.kind === 'farm') st.comBuildings++;
    if (def.kind === 'park' || def.kind === 'landmark') st.parks++;
  }
  G.city.pop = pop;
  const avgLV = st.resBuildings ? lvSum / st.resBuildings : 0.4;
  const employment = pop > 0 ? G.M.clamp(st.jobs / (pop * 0.45), 0, 1) : 1;
  G.city.happiness = G.M.clamp(0.45 * avgLV + 0.35 * employment + 0.2 * Math.min(st.parks / Math.max(st.resBuildings * 0.12, 1), 1), 0, 1);

  // baseline "ambition" keeps a happy city growing organically instead of
  // deadlocking (res waits for jobs, com waits for pop)
  const ambition = (G.city.happiness ?? 0.6) > 0.38 ? 0.12 : 0;
  Growth.demand.res = G.M.clamp((st.jobs * 1.25 + 14 - st.housing) / 40, ambition, 1);
  Growth.demand.com = pop === 0
    ? G.M.clamp((6 - st.jobs) / 12, ambition, 1)
    : G.M.clamp((pop * 0.5 - st.jobs) / 25, ambition, 1);
}

// ------------------------------------------------------------- growth events
function zonedCandidates(zone) {
  const grid = G.grid, n = grid.size, out = [];
  for (let i = 0; i < n * n; i++) {
    if (grid.zones[i] !== zone || grid.occ[i] !== 0 || grid.roads[i]) continue;
    const x = i % n, y = (i / n) | 0;
    if (!G.T.isBuildable(grid.ground[i])) continue;
    if (G.Roads.touchesFootprint(x, y, 1, 1)) out.push(i);
  }
  return out;
}

function growOn(zone, pool) {
  const cands = zonedCandidates(zone);
  if (!cands.length) return false;
  // bias toward higher land value: sample a few, take the best
  const rng = grng;
  let best = -1, bestV = -1;
  for (let k = 0; k < Math.min(5, cands.length); k++) {
    const i = cands[rng.int(0, cands.length)];
    if (G.grid.landValue[i] > bestV) { bestV = G.grid.landValue[i]; best = i; }
  }
  const x = best % G.grid.size, y = (best / G.grid.size) | 0;
  const type = pool[rng.int(0, pool.length)];
  const def = G.Buildings.byId[type];
  const s = G.grid.addStructure({
    kind: 'building', type, x, y, w: def.fw, h: def.fd,
    construction: CONSTRUCT_T, pop: 0,
  });
  if (s) G.hooks?.grown?.(s);
  return !!s;
}

function tryLevelUp() {
  // a random full, well-located building upgrades to the next era's type
  const rng = grng;
  const all = [...G.grid.structures.values()].filter((s) => {
    if (s.kind !== 'building' || s.construction > 0) return false;
    const up = G.Eras.upgrades[s.type];
    if (!up) return false;
    const def = G.Buildings.byId[s.type], updef = G.Buildings.byId[up];
    if (G.Eras.indexOf(updef.era) > G.city.eraIndex) return false;
    if (def.housing && (s.pop ?? 0) < def.housing * 0.8) return false;
    return Growth.valueAt(s.x, s.y) > 0.45;
  });
  if (!all.length) return;
  const s = all[rng.int(0, all.length)];
  const up = G.Eras.upgrades[s.type];
  const keepPop = s.pop ?? 0;
  s.type = up;
  s.construction = CONSTRUCT_T * 0.7;
  s.pop = Math.min(keepPop, G.Buildings.byId[up].housing ?? 0);
  G.hooks?.leveledUp?.(s);
}

function popFlow(rng) {
  const st = Growth.stats;
  const room = st.housing - G.city.pop;
  const jobPull = st.jobs * 2.2 + 20 - G.city.pop;
  const happy = G.city.happiness ?? 0.6;
  // immigration: needs room, jobs and decent happiness
  let moves = 0;
  if (room > 0 && jobPull > 0 && happy > 0.35) {
    moves = Math.max(1, Math.round(Math.min(room, jobPull) * 0.06 * (0.4 + happy)));
  } else if (happy < 0.3 && G.city.pop > 0) {
    moves = -1;
  }
  if (moves > 0) {
    const homes = [...G.grid.structures.values()].filter((s) =>
      s.kind === 'building' && !s.construction && (G.Buildings.byId[s.type].housing ?? 0) > (s.pop ?? 0));
    for (let i = 0; i < moves && homes.length; i++) {
      const s = homes[rng.int(0, homes.length)];
      s.pop = (s.pop ?? 0) + 1;
    }
  } else if (moves < 0) {
    const homes = [...G.grid.structures.values()].filter((s) => (s.pop ?? 0) > 0);
    if (homes.length) homes[rng.int(0, homes.length)].pop--;
  }
}

function checkEra() {
  const next = G.Eras.next();
  if (next && G.city.pop >= next.pop) {
    G.city.eraIndex++;
    G.hooks?.eraUp?.(G.Eras.current());
    G.UI?.toast?.(`✦ ${G.city.name} is now a ${G.Eras.current().name}!`);
  }
}

// ------------------------------------------------------------- economy
Growth.dailyBudget = () => {
  let upkeep = 0;
  const roadRate = { 1: 0.02, 2: 0.06, 3: 0.14, 4: 0.3 };
  for (let i = 0; i < G.grid.roads.length; i++) upkeep += roadRate[G.grid.roads[i]] ?? 0;
  for (const s of G.grid.structures.values()) {
    if (s.kind === 'building') upkeep += G.Buildings.byId[s.type].upkeep ?? 0;
  }
  const income = G.city.pop * 1.1 + Growth.stats.jobs * 0.8;
  return { income: Math.round(income), upkeep: Math.round(upkeep) };
};

G.hooks = G.hooks ?? {};
G.hooks.newDay = (day) => {
  const b = Growth.dailyBudget();
  G.city.funds += b.income - b.upkeep;
  G.hooks?.budgetApplied?.(b, day);
};

// ------------------------------------------------------------- tick
Growth.tick = (dt) => {
  // construction countdowns
  for (const s of G.grid.structures.values()) {
    if (s.construction > 0) {
      s.construction -= dt;
      if (s.construction <= 0) { s.construction = 0; G.hooks?.constructed?.(s); }
    }
  }

  lvT += dt;
  if (lvT >= LV_STEP) { lvT = 0; Growth.landValuePass(); }

  stepT += dt;
  if (stepT < STEP) return;
  stepT = 0;

  recount();
  if (!grng) Growth.reseed(G.grid.seed);
  const rng = grng;
  const era = G.Eras.current().id;
  const pools = G.Eras.growth[era];
  if (Growth.demand.res > 0 && rng() < 0.25 + Growth.demand.res * 0.75) {
    growOn(1, pools.res);
  }
  if (Growth.demand.com > 0 && rng() < 0.2 + Growth.demand.com * 0.7) {
    growOn(2, pools.com);
  }
  if (rng() < 0.12) tryLevelUp();
  popFlow(rng);
  checkEra();
};
})();
