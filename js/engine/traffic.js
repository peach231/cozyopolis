// Vehicles + traffic law. Vehicle progression: horse carts ply cobblestone
// (tier 2), motor cars need paved roads (tier>=3). All drive the right-hand
// lane, follow the vehicle ahead, queue at stop signs (one in the box) and
// obey traffic lights at paved intersections of degree>=3.
(() => {
const G = globalThis.G ??= {};
const T = G.Traffic = { cars: [], lights: new Map(), nextId: 1, dirty: true };

T.reset = () => {
  T.cars.length = 0;
  T.lights.clear();
  occupied.clear();
  T.dirty = true;
};

// vehicle kinds: carts are the cobble-era intermediary before cars
const VEH = {
  cart: { minTier: 2, speed: 1.15, gap: 0.5 },
  car: { minTier: 3, speed: 2.4, gap: 0.45 },
};
const LANE = 0.2;             // right-lane offset in tiles
const MAX_CARS = 26;
const STUCK_LIMIT = 22;       // seconds at standstill before a vehicle gives up
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
  // entries grouped by best reachable road tier
  const paved = [], cobble = [];
  for (const s of G.grid.structures.values()) {
    if (s.kind !== 'building') continue;
    const e = G.Agents.entryOf(s);
    if (!e) continue;
    const tier = G.Roads.at(e[0], e[1]);
    if (tier >= 3) paved.push([s, e]);
    if (tier >= 2) cobble.push([s, e]);
  }
  // prefer a motor car on the paved network; fall back to a horse cart
  for (const [veh, opts] of [['car', paved], ['cart', cobble]]) {
    if (opts.length < 2) continue;
    const def = VEH[veh];
    const [from, fe] = opts[rng.int(0, opts.length)];
    for (let tries = 0; tries < 4; tries++) {
      const [to, te] = opts[rng.int(0, opts.length)];
      if (to === from) continue;
      const path = G.Agents.findPath(fe[0], fe[1], te[0], te[1], def.minTier);
      if (!path || path.length < 4) continue;
      const id = T.nextId++;
      const prng = G.rng(id * 271 + G.grid.seed);
      T.cars.push({
        id, kind: 'car', veh,
        owner: G.Names.person(prng),
        color: prng.int(0, COLORS.length),
        path, pi: 0, prog: 0,
        x: fe[0], y: fe[1],
        speed: 0, dir: 1,
        stopT: 0, stuckT: 0, inBox: null,
        state: 'driving',
      });
      return;
    }
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

    const def = VEH[car.veh] ?? VEH.car;
    let target = def.speed;

    // --- obstacle: vehicle ahead (same heading, within braking distance)
    const ax = car.x + (dx || 0) * 0.55, ay = car.y + (dy || 0) * 0.55;
    const gap2 = def.gap * def.gap * 0.8;
    for (const o of T.cars) {
      if (o === car) continue;
      const d2 = (o.x - ax) * (o.x - ax) + (o.y - ay) * (o.y - ay);
      if (d2 < gap2 && o.dir === car.dir) { target = 0; break; }
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
          // stop sign: pause, then claim the box — but never enter while the
          // exit is blocked (prevents gridlocked boxes)
          const owner = occupied.get(ni);
          let exitBlocked = false;
          const exit = car.path[Math.min(car.pi + 2, car.path.length - 1)];
          for (const o of T.cars) {
            if (o === car || o.dir !== car.dir) continue;
            const d2 = (o.x - exit[0]) * (o.x - exit[0]) + (o.y - exit[1]) * (o.y - exit[1]);
            if (d2 < 0.25) { exitBlocked = true; break; }
          }
          if ((owner && owner !== car.id) || exitBlocked) {
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

    // --- watchdog: a vehicle stuck for too long gives up and pulls off
    if (car.speed < 0.05 && target === 0) {
      car.stuckT += dt;
      if (car.stuckT > STUCK_LIMIT) {
        if (car.inBox !== null && occupied.get(car.inBox) === car.id) occupied.delete(car.inBox);
        T.cars.splice(ci, 1);
        continue;
      }
    } else {
      car.stuckT = 0;
    }

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
// shared skew-space setup: x' runs along the iso diagonal, y' stays vertical
function vehTransform(ctx, dir, cx, cy) {
  const mirror = (dir === 2 || dir === 3);
  const up = (dir === 0 || dir === 3);
  ctx.translate(cx, cy);
  if (mirror) ctx.scale(-1, 1);
  ctx.transform(0.894, up ? -0.447 : 0.447, 0, 1, 0, 0);
}

function carSprite(color, dir) {
  // dirs: 0 NE(up-right), 1 SE(down-right), 2 SW(down-left), 3 NW(up-left)
  return G.Render.sprite(`car:${color}:${dir}`, 38, 30, 19, 20, (ctx) => {
    const c = COLORS[color];
    vehTransform(ctx, dir, 19, 15);
    const rr = G.Render.roundRect;
    // wheels (4: two pairs, far pair peeking above the body line)
    ctx.fillStyle = '#2c2738';
    for (const wx of [-7.5, 7]) {
      ctx.beginPath(); ctx.ellipse(wx + 1.5, -1.2, 2.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const wx of [-7.5, 7]) {
      ctx.beginPath(); ctx.ellipse(wx, 2.2, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8d8798';
      ctx.beginPath(); ctx.ellipse(wx, 2.2, 1.2, 1.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c2738';
    }
    // lower side face (dark) gives the body thickness
    ctx.fillStyle = G.C.shade(c, 0.32);
    rr(ctx, -12, -3.4, 24, 6, 2.5);
    ctx.fill();
    // upper body / hood+deck (lit)
    ctx.fillStyle = c;
    rr(ctx, -12, -7.2, 24, 5.4, 3);
    ctx.fill();
    ctx.fillStyle = G.C.tint(c, 0.4);
    rr(ctx, -12, -7.2, 24, 2.2, 2.5);
    ctx.fill();
    // cabin with pillar-split windows
    ctx.fillStyle = G.C.shade(c, 0.12);
    rr(ctx, -7, -13, 13, 7, 3);
    ctx.fill();
    ctx.fillStyle = '#cfe8ef';
    rr(ctx, -5.6, -12, 5, 4.4, 1.6);   // side pane
    ctx.fill();
    rr(ctx, 0.6, -12, 4.2, 4.4, 1.6);  // windshield
    ctx.fill();
    ctx.fillStyle = G.C.tint(c, 0.5);
    rr(ctx, -7, -13.4, 13, 1.6, 1);    // roof shine
    ctx.fill();
    // bumper, headlight, taillight
    ctx.fillStyle = G.C.shade(c, 0.45);
    rr(ctx, 10.6, -4.6, 2.6, 6.4, 1.2);
    ctx.fill();
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath(); ctx.ellipse(11.6, -5.4, 1.3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8655a';
    ctx.beginPath(); ctx.ellipse(-11.6, -5.2, 1, 1.2, 0, 0, Math.PI * 2); ctx.fill();
  });
}

function cartSprite(color, dir) {
  // horse-drawn cart: the cobblestone-era ride
  return G.Render.sprite(`cart:${color}:${dir}`, 42, 30, 21, 20, (ctx) => {
    const wood = G.C.PAL.wood, dark = G.C.PAL.woodDark;
    vehTransform(ctx, dir, 21, 15);
    const rr = G.Render.roundRect;
    // cart wheel (big, spoked)
    ctx.strokeStyle = '#2c2738';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(-8, 0.5, 4.2, 4.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, -3.7); ctx.lineTo(-8, 4.7);
    ctx.moveTo(-12.2, 0.5); ctx.lineTo(-3.8, 0.5);
    ctx.stroke();
    // cart bed: dark side + lit top rim, cargo sacks
    ctx.fillStyle = dark[3];
    rr(ctx, -14, -6.5, 12.5, 7, 1.6);
    ctx.fill();
    ctx.fillStyle = wood[2];
    rr(ctx, -14, -7.6, 12.5, 2.4, 1.2);
    ctx.fill();
    ctx.fillStyle = '#d9b153';
    ctx.beginPath(); ctx.ellipse(-10.5, -8.2, 2.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c79c3f';
    ctx.beginPath(); ctx.ellipse(-6.5, -8, 1.9, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    // hitch
    ctx.strokeStyle = dark[4];
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-1.5, -3); ctx.lineTo(4, -3.6); ctx.stroke();
    // horse: body, neck/head, legs, tail, mane
    const hb = '#7d5a3e', hd = '#5a3c28';
    ctx.fillStyle = hb;
    ctx.beginPath(); ctx.ellipse(8, -5, 5.6, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12.6, -8.6, 1.9, 2.6, -0.5, 0, Math.PI * 2); ctx.fill(); // neck
    ctx.beginPath(); ctx.ellipse(14.4, -10.2, 2.1, 1.3, -0.25, 0, Math.PI * 2); ctx.fill(); // head
    ctx.strokeStyle = hb;
    ctx.lineWidth = 1.5;
    for (const lx of [4.6, 7.2, 9.8, 12]) {
      ctx.beginPath(); ctx.moveTo(lx, -3.4); ctx.lineTo(lx - 0.4, 2.4); ctx.stroke();
    }
    ctx.strokeStyle = hd;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(2.6, -6); ctx.quadraticCurveTo(1.2, -3.4, 2, -1.4); ctx.stroke(); // tail
    ctx.fillStyle = hd;
    ctx.beginPath(); ctx.ellipse(12, -9.6, 1, 1.8, -0.5, 0, Math.PI * 2); ctx.fill(); // mane
    ctx.beginPath(); ctx.moveTo(13.2, -11.6); ctx.lineTo(13.8, -13); ctx.lineTo(14.5, -11.7); ctx.closePath(); ctx.fill(); // ear
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
        ctx.ellipse(sx, sy + 2, 11, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const spr = car.veh === 'cart' ? cartSprite(car.color, car.dir)
          : carSprite(car.color, car.dir);
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

// Two 3-lens signal heads share one pole: upper head governs the y-axis
// (NE/SW) traffic, lower head the x-axis. Returns lens geometry so the night
// glow pass lights exactly the active lens.
const LENS = { red: '#e8655a', amber: '#ffcf6b', green: '#7ed47a' };
T.lightLensInfo = (L) => {
  const [sx, sy] = G.ISO.toScreen(L.x + 0.42, L.y + 0.42);
  const heads = [];
  for (const [hi, axis] of [[0, 1], [1, 0]]) {
    const topY = sy - 44 + hi * 15;
    const state = L.amber ? 'amber' : (L.axis === axis ? 'green' : 'red');
    heads.push({
      x: sx, topY, state,
      lenses: [
        { y: topY + 3, c: LENS.red, lit: state === 'red' },
        { y: topY + 7, c: LENS.amber, lit: state === 'amber' },
        { y: topY + 11, c: LENS.green, lit: state === 'green' },
      ],
    });
  }
  return { sx, sy, heads };
};

function drawLightPost(ctx, L) {
  const info = T.lightLensInfo(L);
  const { sx, sy } = info;
  // pole with a base
  ctx.fillStyle = '#36314a';
  ctx.beginPath(); ctx.ellipse(sx, sy + 1, 3.4, 1.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4a4458';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, sy - 46);
  ctx.stroke();
  ctx.strokeStyle = '#5d5774';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(sx - 0.7, sy - 2);
  ctx.lineTo(sx - 0.7, sy - 45);
  ctx.stroke();
  // signal heads: housing + visor notch + lenses
  for (const h of info.heads) {
    ctx.fillStyle = '#2c2738';
    G.Render.roundRect(ctx, h.x - 3.2, h.topY, 6.4, 14, 2.4);
    ctx.fill();
    ctx.fillStyle = '#46405c';
    G.Render.roundRect(ctx, h.x - 3.2, h.topY, 2.2, 14, 2);
    ctx.fill();
    for (const lens of h.lenses) {
      ctx.fillStyle = lens.lit ? lens.c : G.C.withAlpha(lens.c, 0.22);
      ctx.beginPath();
      ctx.arc(h.x, lens.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

T.statusOf = (car) => {
  if (car.state === 'light') return 'Waiting at the light';
  if (car.state === 'stop') return 'Waiting at a stop sign';
  return car.veh === 'cart' ? 'Clip-clopping along' : 'Out for a drive';
};
})();
