// City flavor: news ticker fed by real sim events, park festivals, and the
// era-up celebration confetti.
(() => {
const G = globalThis.G ??= {};
const E = G.Events = { ticker: [], festival: null, confetti: [] };

const MAX_TICKER = 6;
let erng = G.rng(0xfeed);

function push(msg) {
  E.ticker.push({ msg, t: 0 });
  if (E.ticker.length > MAX_TICKER) E.ticker.shift();
  E.tickerDirty = true;
}
E.push = push;

const aCitizen = () => {
  const w = G.Agents.walkers[erng.int(0, Math.max(G.Agents.walkers.length, 1))];
  return w?.name ?? G.Names.person(erng);
};

// ------------------------------------------------------------- sim hooks
const milestones = [10, 25, 100, 500, 2000, 10000, 25000];
let milestoneIdx = 0;

E.init = () => {
  erng = G.rng(G.grid.seed ^ 0xfeed);
  E.ticker.length = 0;
  E.festival = null;
  E.confetti.length = 0;
  milestoneIdx = 0;
  push(`Welcome to ${G.city.name}! Lay a path, zone some land, and watch it bloom.`);

  G.hooks.constructed = (s) => {
    const def = G.Buildings.byId[s.type];
    if (!def) return;
    if (erng() < 0.35) {
      if (def.housing) push(`The ${G.Names.person(erng).split(' ')[1]} family moved into a new ${def.name.toLowerCase()}.`);
      else if (def.kind === 'farm') push(`${aCitizen()} planted a new ${def.name.toLowerCase()}.`);
      else if (def.jobs) push(`${aCitizen()} opened a ${def.name.toLowerCase()}.`);
    }
  };
  G.hooks.leveledUp = (s) => {
    const def = G.Buildings.byId[s.type];
    push(`A property was rebuilt as a ${def.name.toLowerCase()} — the neighborhood is looking up!`);
  };
  G.hooks.eraUp = (era) => {
    push(`✦ ${G.city.name} is now a ${era.name}! New buildings unlocked.`);
    E.burstConfetti();
    G.Audio?.fanfare?.();
  };
  G.hooks.budgetApplied = (b, day) => {
    if (day % 3 === 0) push(`Treasury report: +${b.income} taxes, −${b.upkeep} upkeep.`);
  };
  G.hooks.demolished = null;
};

// idle flavor lines
const FLAVOR = [
  () => `${aCitizen()} won the ${G.city.name} pie contest.`,
  () => `${aCitizen()} swears the ${G.time.isNight() ? 'stars' : 'clouds'} look extra pretty today.`,
  () => `The ducks by the river are thriving, reports ${aCitizen()}.`,
  () => `${aCitizen()} found a lucky coin on the path.`,
  () => `Fresh bread smell drifts over ${G.city.name} this morning.`,
];

// ------------------------------------------------------------- festivals
function startFestival() {
  const parks = [...G.grid.structures.values()].filter((s) =>
    s.kind === 'building' && G.Buildings.byId[s.type]?.kind === 'park');
  if (!parks.length) return;
  const park = parks[erng.int(0, parks.length)];
  E.festival = { park, until: G.time.day + (G.time.hour > 12 ? 1 : 0), endHour: 23 };
  push(`🎪 A festival begins at the ${G.Buildings.byId[park.type].name}! Everyone's invited.`);
}

E.festivalActive = () =>
  E.festival && G.grid.structures.has(E.festival.park.id);

// ------------------------------------------------------------- confetti
E.burstConfetti = () => {
  // burst above the town hall if built, else map center of mass
  let cx = 0, cy = 0, n = 0;
  for (const s of G.grid.structures.values()) {
    if (s.kind !== 'building') continue;
    if (s.type === 'town_hall') { cx = s.x + 1; cy = s.y + 1; n = 1; break; }
    cx += s.x; cy += s.y; n++;
  }
  if (!n) { cx = G.grid.size / 2; cy = G.grid.size / 2; n = 1; }
  const [sx, sy] = G.ISO.toScreen(cx / n, cy / n);
  const cols = ['#ffcf6b', '#e8909d', '#9ed47a', '#88a4c4', '#f0e2c4'];
  for (let i = 0; i < 80; i++) {
    E.confetti.push({
      x: sx + (erng() - 0.5) * 30, y: sy - 60 - erng() * 30,
      vx: (erng() - 0.5) * 70, vy: -40 - erng() * 60,
      col: cols[i % cols.length], age: 0, life: 2 + erng(),
      spin: erng() * 6,
    });
  }
};

// ------------------------------------------------------------- tick/draw
let flavorT = 30;
E.tick = (dt) => {
  flavorT -= dt;
  if (flavorT <= 0) {
    flavorT = 35 + erng() * 50;
    if (erng() < 0.7 && G.city.pop > 0) push(FLAVOR[erng.int(0, FLAVOR.length)]());
  }
  while (milestoneIdx < milestones.length && G.city.pop >= milestones[milestoneIdx]) {
    push(`Population reaches ${milestones[milestoneIdx].toLocaleString()}!`);
    milestoneIdx++;
  }
  // festivals: roughly every 3rd day at 10:00
  if (!E.festival && G.time.day % 3 === 0 && Math.abs(G.time.hour - 10) < 0.01) {
    startFestival();
  }
  if (E.festival && (G.time.hour >= E.festival.endHour || !E.festivalActive())) {
    if (E.festivalActive()) push('The festival winds down. What a lovely day!');
    E.festival = null;
  }
  // confetti physics (screen-ish world units)
  for (let i = E.confetti.length - 1; i >= 0; i--) {
    const p = E.confetti[i];
    p.age += dt;
    if (p.age > p.life) { E.confetti.splice(i, 1); continue; }
    p.vy += 90 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += dt * 5;
  }
};

// world-space extras (festival bunting, confetti) drawn after structures
E.drawWorld = (ctx) => {
  if (E.festivalActive()) {
    const p = E.festival.park;
    const w = p.w ?? 1, h = p.h ?? 1;
    const [ax, ay] = G.ISO.toScreen(p.x - 0.3, p.y + h - 0.7);
    const [bx, by] = G.ISO.toScreen(p.x + w - 0.7, p.y - 0.3);
    const cols = ['#ffcf6b', '#e8909d', '#9ed47a', '#88a4c4'];
    // bunting line with pennants
    ctx.strokeStyle = 'rgba(74,53,80,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 34);
    ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 26, bx, by - 34);
    ctx.stroke();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const px = G.M.lerp(ax, bx, t);
      const py = G.M.lerp(ay - 34, by - 34, t) + Math.sin(Math.PI * t) * -0 + (1 - Math.abs(t - 0.5) * 2) * 8;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.moveTo(px - 2.4, py);
      ctx.lineTo(px + 2.4, py);
      ctx.lineTo(px, py + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
  for (const p of E.confetti) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.globalAlpha = Math.min(1, (p.life - p.age) * 2);
    ctx.fillStyle = p.col;
    ctx.fillRect(-2, -1.2, 4, 2.4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
};
})();
