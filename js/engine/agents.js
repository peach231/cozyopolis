// Pedestrians: spawned from residential buildings with road access, they take
// trips along the road/path network (BFS), linger, and head elsewhere. Counts
// scale with daylight so streets empty out at night. (Phase 6 ties walkers to
// the real citizen roster + commutes; for now trips are ambient life.)
(() => {
const G = globalThis.G ??= {};
const A = G.Agents = { walkers: [], nextId: 1 };

A.reset = () => { A.walkers.length = 0; };

const WALK_SPEED = 1.15;       // tiles/sec
const MAX_WALKERS = 48;

// ------------------------------------------------------------- pathfinding
// BFS over road cells, 4-connected. Returns [[x,y],...] or null.
let visited = null, visitStamp = 0, cameFrom = null;
A.findPath = (sx, sy, gx, gy, minTier = 1) => {
  const grid = G.grid, n = grid.size;
  if (!G.Roads.at(sx, sy) || !G.Roads.at(gx, gy)) return null;
  if (!visited || visited.length !== n * n) {
    visited = new Int32Array(n * n);
    cameFrom = new Int32Array(n * n);
    visitStamp = 0;
  }
  const stamp = ++visitStamp;
  const q = [sy * n + sx];
  visited[q[0]] = stamp;
  cameFrom[q[0]] = -1;
  const goal = gy * n + gx;
  let head = 0, explored = 0;
  while (head < q.length && explored < 6000) {
    const cur = q[head++];
    explored++;
    if (cur === goal) {
      const path = [];
      for (let c = cur; c !== -1; c = cameFrom[c]) path.push([c % n, (c / n) | 0]);
      path.reverse();
      return path;
    }
    const cx = cur % n, cy = (cur / n) | 0;
    for (const [dx, dy] of G.Roads.DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (visited[ni] === stamp) continue;
      if (grid.roads[ni] < minTier) continue;
      visited[ni] = stamp;
      cameFrom[ni] = cur;
      q.push(ni);
    }
  }
  return null;
};

// first road tile adjacent to a structure's footprint (its "door step")
A.entryOf = (s) => {
  const w = s.w ?? 1, h = s.h ?? 1;
  for (let dx = 0; dx < w; dx++) {
    if (G.Roads.at(s.x + dx, s.y + h)) return [s.x + dx, s.y + h];
    if (G.Roads.at(s.x + dx, s.y - 1)) return [s.x + dx, s.y - 1];
  }
  for (let dy = 0; dy < h; dy++) {
    if (G.Roads.at(s.x + w, s.y + dy)) return [s.x + w, s.y + dy];
    if (G.Roads.at(s.x - 1, s.y + dy)) return [s.x - 1, s.y + dy];
  }
  return null;
};

const OUTFITS = ['#c75b4e', '#4e8f86', '#ecc35e', '#7d6ba8', '#9ed47a', '#e8909d'];
const HAIR = ['#5a3c28', '#2e2a3a', '#c9a045', '#8a6a42', '#d8d3c8'];

function buildingsWithEntry() {
  const out = [];
  for (const s of G.grid.structures.values()) {
    if (s.kind !== 'building') continue;
    const e = A.entryOf(s);
    if (e) out.push([s, e]);
  }
  return out;
}

function startTrip(w) {
  const opts = buildingsWithEntry();
  if (opts.length < 2) { w.linger = 3; return; }
  const rng = G.rng(w.id * 7919 + ((G.time.day * 24 + G.time.hour) | 0));
  // festivals draw a crowd
  const fest = G.Events?.festivalActive?.() ? G.Events.festival.park : null;
  for (let tries = 0; tries < 4; tries++) {
    let pick = opts[rng.int(0, opts.length)];
    if (fest && rng() < 0.6) {
      const fe = opts.find(([s]) => s.id === fest.id);
      if (fe) pick = fe;
    }
    const [dest, dentry] = pick;
    if (dest.id === w.at) continue;
    const path = A.findPath(w.tx, w.ty, dentry[0], dentry[1]);
    if (path && path.length > 1) {
      w.path = path;
      w.pi = 0;
      w.prog = 0;
      w.state = 'walking';
      w.hide = false;
      w.dest = dest;
      return;
    }
  }
  w.linger = 4;
}

function spawnWalker(rng) {
  const homes = buildingsWithEntry().filter(([s]) => G.Buildings.byId[s.type]?.housing);
  if (!homes.length) return;
  const [home, entry] = homes[rng.int(0, homes.length)];
  const id = A.nextId++;
  const prng = G.rng(id * 1013 + G.grid.seed);
  A.walkers.push({
    id, kind: 'walker',
    name: G.Names.person(prng),
    outfit: prng.int(0, OUTFITS.length),
    hair: prng.int(0, HAIR.length),
    jitter: (prng() - 0.5) * 0.12,
    home: home.id, at: home.id,
    tx: entry[0], ty: entry[1],
    x: entry[0], y: entry[1],
    path: null, pi: 0, prog: 0,
    state: 'lingering', linger: prng.range(0.5, 2), hide: false,
    phase: prng.range(0, 6),
    speed: WALK_SPEED * prng.range(0.85, 1.15),
    mood: 'Content',
  });
}

let spawnT = 0;
A.targetCount = () => {
  const homes = buildingsWithEntry().filter(([s]) => G.Buildings.byId[s.type]?.housing).length;
  const dayScale = 0.15 + 0.85 * G.time.daylight();
  return Math.min(MAX_WALKERS, Math.round(homes * 2.2 * dayScale));
};

A.tick = (dt) => {
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.6;
    const target = A.targetCount();
    if (A.walkers.length < target) spawnWalker(G.rng((Math.random() * 1e9) | 0));
    else if (A.walkers.length > target + 4) {
      // retire a hidden lingering walker
      const i = A.walkers.findIndex((w) => w.state === 'lingering' && w.hide);
      if (i >= 0) A.walkers.splice(i, 1);
    }
  }

  for (const w of A.walkers) {
    if (w.state === 'lingering') {
      w.linger -= dt;
      if (w.linger <= 0) startTrip(w);
      continue;
    }
    // walking — wait at the curb when the next tile's signal is against us
    const na = w.path[Math.min(w.pi, w.path.length - 1)];
    const nb = w.path[Math.min(w.pi + 1, w.path.length - 1)];
    let held = false;
    if (G.Traffic && w.prog > 0.5 && (nb[0] !== na[0] || nb[1] !== na[1])) {
      const light = G.Traffic.lights.get(nb[1] * G.grid.size + nb[0]);
      if (light) {
        const d = nb[1] < na[1] ? 0 : nb[0] > na[0] ? 1 : nb[1] > na[1] ? 2 : 3;
        if (!G.Traffic.allows(light, d)) held = true;
      }
    }
    if (held) { w.prog = Math.min(w.prog, 0.55); continue; }
    w.phase += dt * 7;
    let step = w.speed * dt;
    while (step > 0 && w.pi < w.path.length - 1) {
      const rem = 1 - w.prog;
      if (step < rem) { w.prog += step; step = 0; }
      else { step -= rem; w.pi++; w.prog = 0; }
    }
    const done = w.pi >= w.path.length - 1;
    const a = w.path[Math.min(w.pi, w.path.length - 1)];
    const b = w.path[Math.min(w.pi + 1, w.path.length - 1)];
    // lateral offset: keep right + personal jitter
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const off = 0.16 + w.jitter;
    w.x = a[0] + dx * w.prog + dy * off;
    w.y = a[1] + dy * w.prog - dx * off;
    w.tx = b[0]; w.ty = b[1];
    if (done) {
      w.state = 'lingering';
      w.at = w.dest?.id;
      const rng = G.rng(w.id * 31 + ((G.time.hour * 60) | 0));
      w.linger = rng.range(3, 14);
      w.hide = true; // stepped inside
      w.dest = null;
    }
  }
};

// ------------------------------------------------------------- drawing
function walkerSprite(w) {
  return G.Render.sprite(`walker:${w.outfit}:${w.hair}`, 12, 16, 6, 14, (ctx) => {
    const body = OUTFITS[w.outfit], hair = HAIR[w.hair];
    // body capsule
    ctx.fillStyle = body;
    G.Render.roundRect(ctx, 3.4, 6, 5.2, 7.5, 2.5);
    ctx.fill();
    // arm hint
    ctx.fillStyle = G.C.shade(body, 0.25);
    G.Render.roundRect(ctx, 7.2, 6.8, 1.8, 5, 1);
    ctx.fill();
    // head
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath();
    ctx.arc(6, 4, 2.7, 0, Math.PI * 2);
    ctx.fill();
    // hair cap
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(6, 3.4, 2.6, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  });
}

A.collectDrawables = (rect, list) => {
  for (const w of A.walkers) {
    if (w.hide || w.state === 'lingering') continue;
    const [sx, sy] = G.ISO.toScreen(w.x, w.y);
    if (sx < rect.x0 - 20 || sx > rect.x1 + 20 || sy < rect.y0 - 30 || sy > rect.y1 + 20) continue;
    list.push({
      x: w.x, y: w.y, agent: w,
      draw: (ctx) => {
        const bob = Math.abs(Math.sin(w.phase)) * 1.4;
        const spr = walkerSprite(w);
        ctx.fillStyle = 'rgba(74,53,80,0.25)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1, 3.2, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(spr.cv, sx - spr.ax, sy - spr.ay - bob,
          spr.cv.width / spr.scale, spr.cv.height / spr.scale);
        if (G.UI.selected?.ref === w) {
          ctx.strokeStyle = G.C.PAL.uiAccent;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(sx, sy + 1, 6, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
    });
  }
};

// status line for the inspector card
A.statusOf = (w) => {
  if (w.state === 'walking' && w.dest) {
    const def = G.Buildings.byId[w.dest.type];
    return `Heading to the ${def?.name ?? 'village'}`;
  }
  if (w.state === 'walking') return 'Out for a stroll';
  return w.at === w.home ? 'At home' : 'Visiting';
};
})();
