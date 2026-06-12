// Weather: sunny / cloudy / rainy, transitioning every few in-game hours.
// Cosmetic-first: drifting cloud shadows, rain overlay, dimmer light, fewer
// strollers, ticker lines. Seeded per map but free-running.
(() => {
const G = globalThis.G ??= {};
const W = G.Weather = { kind: 'sun', t: 0, next: 3, clouds: [], drops: null };

let wrng = G.rng(7);

W.reset = () => {
  wrng = G.rng(G.grid.seed ^ 0x5eed);
  W.kind = 'sun';
  W.t = 0;
  W.next = wrng.range(2, 5);
  W.clouds = [];
  const n = G.grid.size;
  for (let i = 0; i < 7; i++) {
    W.clouds.push({
      x: wrng.range(0, n), y: wrng.range(0, n),
      rx: wrng.range(90, 200), ry: wrng.range(50, 110),
      vx: wrng.range(4, 9), wob: wrng.range(0, 6),
    });
  }
};

const LINES = {
  sun: ['The sun breaks through — a fine day in %c.', 'Clear skies over %c.'],
  clouds: ['Clouds roll in over %c.', 'A grey blanket settles over %c.'],
  rain: ['Rain patters on the rooftops of %c.', 'Umbrellas bloom across %c — rain has arrived.'],
};

function transition() {
  const r = wrng();
  const prev = W.kind;
  W.kind = r < 0.5 ? 'sun' : r < 0.8 ? 'clouds' : 'rain';
  W.next = wrng.range(2.5, 6); // in-game hours
  if (W.kind !== prev) {
    const line = wrng.pick(LINES[W.kind]).replace('%c', G.city.name);
    G.Events?.push?.(line);
  }
}

// scales walker counts: people stay inside when it pours
W.crowdScale = () => W.kind === 'rain' ? 0.45 : W.kind === 'clouds' ? 0.85 : 1;
// extra darkening of the scene
W.dim = () => W.kind === 'rain' ? 0.28 : W.kind === 'clouds' ? 0.11 : 0;

W.tick = (dt) => {
  const hours = dt * 24 / G.time.DAY_SECONDS;
  W.t += hours;
  if (W.t >= W.next) { W.t = 0; transition(); }
  // clouds drift in world-tile space (visible as ground shadows)
  for (const c of W.clouds) {
    c.x += c.vx * dt * 0.06;
    c.wob += dt * 0.3;
    if (c.x > G.grid.size + 14) { c.x = -14; c.y = wrng.range(0, G.grid.size); }
  }
};

// ------------------------------------------------------------- drawing
// cloud shadows: drawn in world space after structures, before the grade
W.drawShadows = (ctx, rect) => {
  if (W.kind === 'sun') return;
  const a = W.kind === 'rain' ? 0.16 : 0.11;
  ctx.fillStyle = `rgba(56,48,80,${a})`;
  for (const c of W.clouds) {
    const [sx, sy] = G.ISO.toScreen(c.x, c.y);
    const wy = sy + Math.sin(c.wob) * 8;
    if (sx < rect.x0 - c.rx || sx > rect.x1 + c.rx || wy < rect.y0 - c.ry || wy > rect.y1 + c.ry) continue;
    ctx.beginPath();
    ctx.ellipse(sx, wy, c.rx, c.ry * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + c.rx * 0.4, wy + c.ry * 0.14, c.rx * 0.6, c.ry * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

// rain streaks: screen space, after the grade
W.drawRain = (ctx) => {
  if (W.kind !== 'rain') return;
  const view = G.view;
  if (!W.drops) {
    W.drops = [];
    for (let i = 0; i < 170; i++) {
      W.drops.push({ x: Math.random(), y: Math.random(), s: 0.7 + Math.random() * 0.6 });
    }
  }
  ctx.strokeStyle = 'rgba(202,220,238,0.55)';
  ctx.lineWidth = 1;
  const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
  ctx.beginPath();
  for (const d of W.drops) {
    const fall = (d.y + t * d.s * 0.9) % 1;
    const x = d.x * view.w + fall * 28;
    const y = fall * view.h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3.5, y + 11 * d.s);
  }
  ctx.stroke();
};
})();
