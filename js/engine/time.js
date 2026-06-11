// Game clock. One in-game day = DAY_SECONDS real seconds at 1x speed.
// Speed multiplies the number of fixed logic steps per frame (see main.js),
// so tick() always advances at the base rate per logic step.
(() => {
const G = globalThis.G ??= {};

const DAY_SECONDS = 360; // 6 real minutes per day at 1x

const time = G.time = {
  day: 1,
  hour: 8,        // fractional hours [0,24)
  speed: 1,       // 1 | 2 | 4
  paused: false,
  DAY_SECONDS,
};

time.stepsPerFrame = () => time.paused ? 0 : time.speed;

time.tick = (dt) => {
  time.hour += (24 / DAY_SECONDS) * dt;
  while (time.hour >= 24) {
    time.hour -= 24;
    time.day++;
    G.hooks?.newDay?.(time.day);
  }
};

time.clockStr = () => {
  const h = Math.floor(time.hour), m = Math.floor((time.hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// daylight factor 0 (deep night) .. 1 (full day); smooth ramps at dawn/dusk
time.daylight = () => {
  const h = time.hour;
  if (h < 5 || h >= 21) return 0;
  if (h < 8) return G.M.smoothstep((h - 5) / 3);
  if (h < 18) return 1;
  return 1 - G.M.smoothstep((h - 18) / 3);
};
time.isNight = () => time.daylight() < 0.35;
})();
