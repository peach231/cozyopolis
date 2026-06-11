// Vehicles + traffic law. Cars drive the right-hand lane on tier>=2 roads,
// follow the car ahead, queue at stop signs (one car in the box) and obey
// traffic lights at paved (tier>=3) intersections of degree>=3.
(() => {
const G = globalThis.G ??= {};
const T = G.Traffic = { cars: [], lights: new Map(), nextId: 1, dirty: true };

T.reset = () => {
  T.cars.length = 0;
  T.lights.clear();
  occupied.clear();
  T.dirty = true;
};

const CAR_SPEED = 2.4;        // tiles/sec on paved
const COBBLE_SPEED = 1.7;
const LANE = 0.2;             // right-lane offset in tiles
const MAX_CARS = 26;
const GREEN = 7, AMBER = 1.3; // light timing (seconds, at 1x)

const COLORS = ['#c75b4e', '#4e8f86', '#ecc35e', '#7d6ba8', '#88a4c4', '#e8909d', '#f0e2c4'];

// ------------------------------------------------------------- lights
// rebuilt whenever roads change; staggered start phases so waves differ
T.rebuildLights = () => {
  const old = T.lights;
  T.lights = new Map();
  const n = G.grid.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (G.grid.roads[i] < 3) continue;
      let deg = 0;
      for (const [dx, dy] of G.Roads.DIRS) if (G.Roads.at(x + dx, y + dy)) deg++;
      if (deg < 3) continue;
      T.lights.set(i, old.get(i) ?? {
        x, y,
        t: G.M.hash2(x, y, 17) * GREEN,
        axis: G.M.hash2(x, y, 31) < 0.5 ? 0 : 1, // 0: x-axis green, 1: y-axis green
        amber: false,
      });
    }
  }
};

// does the light at idx allow movement along DIRS index d right now?
T.allows = (light, d) => {
  if (light.amber) return false;
  const axis = (d === 1 || d === 3) ? 0 : 1; // dirs 1,3 move along x
  return light.axis === axis;
};

function tickLights(dt) {
  for (const L of T.lights.values()) {
    L.t += dt;
    if (!L.amber && L.t >= GREEN) { L.amber = true; L.t = 0; }
    else if (L.amber && L.t >= AMBER) { L.amber = false; L.axis ^= 1; L.t = 0; }
  }
}

// ------------------------------------------------------------- helpers
const idxOf = (x, y) => y * G.grid.size + x;
const isIntersection = (x, y) => {
  let deg = 0;
  for (const [dx, dy] of G.Roads.DIRS) if (G.Roads.at(x + dx, y + dy)) deg++;
  return deg >= 3;
};
const dirIndex = (dx, dy) => dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3;

// reservation: one car inside an unsignaled intersection at a time
const occupied = new Map(); // idx -> car id

function lanePos(a, b, prog, drift = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return [
    a[0] + dx * prog + dy * (LANE + drift),
    a[1] + dy * prog - dx * (LANE + drift),
  ];
}

// ------------------------------------------------------------- trips
function spawnCar(rng) {
  const opts = [];
  for (const s of G.grid.structures.values()) {
    if (s.kind !== 'building') continue;
    const e = G.Agents.entryOf(s);
    if (e && G.Roads.at(e[0], e[1]) >= 2) opts.push([s, e]);
  }
  if (opts.length < 2) return;
  const [from, fe] = opts[rng.int(0, opts.length)];
  for (let tries = 0; tries < 4; tries++) {
    const [to, te] = opts[rng.int(0, opts.length)];
    if (to === from) continue;
    const path = G.Agents.findPath(fe[0], fe[1], te[0], te[1], 2);
    if (!path || path.length < 4) continue;
    const id = T.nextId++;
    const prng = G.rng(id * 271 + G.grid.seed);
    T.cars.push({
      id, kind: 'car',
      owner: G.Names.person(prng),
      color: prng.int(0, COLORS.length),
      path, pi: 0, prog: 0,
      x: fe[0], y: fe[1],
      speed: 0, dir: 1,
      stopT: 0, inBox: null,
      state: 'driving',
    });
    return;
  }
}

let spawnT = 0;
T.targetCount = () => {
  let n = 0;
  for (const s of G.grid.structures.values()) if (s.kind === 'building') n++;
  const dayScale = 0.2 + 0.8 * G.time.daylight();
  return Math.min(MAX_CARS, Math.round(n * 1.2 * dayScale));
};

// ------------------------------------------------------------- movement
T.tick = (dt) => {
  if (T.dirty) { T.rebuildLights(); T.dirty = false; }
  tickLights(dt);
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.8;
    if (T.cars.length < T.targetCount()) spawnCar(G.rng((Math.random() * 1e9) | 0));
  }

  for (let ci = T.cars.length - 1; ci >= 0; ci--) {
    const car = T.cars[ci];
    const a = car.path[car.pi], b = car.path[Math.min(car.pi + 1, car.path.length - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx || dy) car.dir = dirIndex(dx, dy);

    // target speed by surface
    const tierHere = G.Roads.at(a[0], a[1]);
    let target = tierHere >= 3 ? CAR_SPEED : COBBLE_SPEED;

    // --- obstacle: car ahead (same heading, within braking distance)
    const ax = car.x + (dx || 0) * 0.55, ay = car.y + (dy || 0) * 0.55;
    for (const o of T.cars) {
      if (o === car) continue;
      const d2 = (o.x - ax) * (o.x - ax) + (o.y - ay) * (o.y - ay);
      if (d2 < 0.16 && o.dir === car.dir) { target = 0; break; }
    }

    // --- intersection control on the NEXT tile
    if (target > 0 && car.pi + 1 < car.path.length - 1) {
      const nx = b[0], ny = b[1];
      const ni = idxOf(nx, ny);
      const atStopLine = car.prog > 0.52;
      if (isIntersection(nx, ny) && car.inBox !== ni) {
        const light = T.lights.get(ni);
        if (light) {
          if (atStopLine && !T.allows(light, car.dir)) {
            target = 0;
            car.prog = Math.min(car.prog, 0.6);
            car.state = 'light';
          }
        } else if (atStopLine) {
          // stop sign: pause, then claim the box
          const owner = occupied.get(ni);
          if (owner && owner !== car.id) {
            target = 0;
            car.prog = Math.min(car.prog, 0.6);
            car.state = 'stop';
          } else if (car.stopT < 0.35) {
            car.stopT += dt;
            target = 0;
            car.state = 'stop';
          } else {
            occupied.set(ni, car.id);
            car.inBox = ni;
          }
        }
      }
    }
    if (target > 0 && car.state !== 'driving') { car.state = 'driving'; }

    // accelerate / brake smoothly
    car.speed += G.M.clamp(target - car.speed, -8 * dt, 3.2 * dt);
    if (car.speed < 0.01 && target === 0) car.speed = 0;

    // advance along path
    let step = car.speed * dt;
    while (step > 0 && car.pi < car.path.length - 1) {
      const rem = 1 - car.prog;
      if (step < rem) { car.prog += step; step = 0; }
      else {
        step -= rem;
        car.pi++;
        car.prog = 0;
        car.stopT = 0;
        const here = idxOf(car.path[car.pi][0], car.path[car.pi][1]);
        // release intersection box once we've moved past it
        if (car.inBox !== null && car.inBox !== here) {
          if (occupied.get(car.inBox) === car.id) occupied.delete(car.inBox);
          car.inBox = null;
        }
      }
    }
    const p = lanePos(car.path[car.pi],
      car.path[Math.min(car.pi + 1, car.path.length - 1)], car.prog);
    car.x = p[0]; car.y = p[1];

    if (car.pi >= car.path.length - 1) {
      if (car.inBox !== null && occupied.get(car.inBox) === car.id) occupied.delete(car.inBox);
      T.cars.splice(ci, 1); // arrived: pulls into the destination
    }
  }
};

// ------------------------------------------------------------- drawing
function carSprite(color, dir) {
  // dirs: 0 NE(up-right), 1 SE(down-right), 2 SW(down-left), 3 NW(up-left)
  return G.Render.sprite(`car:${color}:${dir}`, 34, 24, 17, 16, (ctx) => {
    const c = COLORS[color];
    const mirror = (dir === 2 || dir === 3);
    const up = (dir === 0 || dir === 3);
    ctx.translate(17, 12);
    if (mirror) ctx.scale(-1, 1);
    // skew space: x' along the iso diagonal, y' vertical
    ctx.transform(0.894, up ? -0.447 : 0.447, 0, 1, 0, 0);
    // wheels
    ctx.fillStyle = '#3a3147';
    ctx.beginPath(); ctx.ellipse(-7, 1.6, 2.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, 1.6, 2.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = c;
    G.Render.roundRect(ctx, -11, -4.5, 22, 6.5, 3);
    ctx.fill();
    ctx.fillStyle = G.C.tint(c, 0.35);
    G.Render.roundRect(ctx, -11, -4.5, 22, 2.6, 2.5);
    ctx.fill();
    // cabin
    ctx.fillStyle = G.C.shade(c, 0.15);
    G.Render.roundRect(ctx, -6, -9.5, 11, 6, 2.5);
    ctx.fill();
    ctx.fillStyle = '#bfe2ea';
    G.Render.roundRect(ctx, -4.8, -8.6, 8.6, 3.6, 1.8);
    ctx.fill();
    // headlight nub at front (+x')
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath(); ctx.ellipse(10.5, -2.4, 1.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  });
}

T.collectDrawables = (rect, list) => {
  for (const car of T.cars) {
    const [sx, sy] = G.ISO.toScreen(car.x, car.y);
    if (sx < rect.x0 - 30 || sx > rect.x1 + 30 || sy < rect.y0 - 30 || sy > rect.y1 + 30) continue;
    list.push({
      x: car.x, y: car.y, agent: car,
      draw: (ctx) => {
        ctx.fillStyle = 'rgba(74,53,80,0.22)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 2, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        const spr = carSprite(car.color, car.dir);
        ctx.drawImage(spr.cv, sx - spr.ax, sy - spr.ay,
          spr.cv.width / spr.scale, spr.cv.height / spr.scale);
        if (G.UI.selected?.ref === car) {
          ctx.strokeStyle = G.C.PAL.uiAccent;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(sx, sy + 2, 13, 5.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
    });
  }
  // traffic light posts
  for (const L of T.lights.values()) {
    const [sx, sy] = G.ISO.toScreen(L.x, L.y);
    if (sx < rect.x0 - 40 || sx > rect.x1 + 40 || sy < rect.y0 - 40 || sy > rect.y1 + 40) continue;
    list.push({
      x: L.x + 0.45, y: L.y + 0.45,
      draw: (ctx) => drawLightPost(ctx, L),
    });
  }
};

function drawLightPost(ctx, L) {
  // post on the SE corner of the intersection tile
  const [sx, sy] = G.ISO.toScreen(L.x + 0.42, L.y + 0.42);
  ctx.strokeStyle = '#4a4458';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, sy - 22);
  ctx.stroke();
  ctx.fillStyle = '#3a3147';
  G.Render.roundRect(ctx, sx - 3, sy - 30, 6, 10, 2);
  ctx.fill();
  const green = '#7ed47a', red = '#e8655a', amber = '#ffcf6b';
  const xGreen = !L.amber && L.axis === 0;
  const yGreen = !L.amber && L.axis === 1;
  ctx.fillStyle = L.amber ? amber : (yGreen ? green : red);
  ctx.beginPath(); ctx.arc(sx, sy - 27, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = L.amber ? amber : (xGreen ? green : red);
  ctx.beginPath(); ctx.arc(sx, sy - 23, 1.8, 0, Math.PI * 2); ctx.fill();
}

T.statusOf = (car) => {
  if (car.state === 'light') return 'Waiting at the light';
  if (car.state === 'stop') return 'Waiting at a stop sign';
  return 'Out for a drive';
};
})();
