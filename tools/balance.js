// Balance pacing test: the shared autoplay bot (js/engine/demo.js) plays a
// fresh map; era arrival times are asserted against targets.
// Usage: node tools/balance.js [maxSimMinutes] [--full]
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
globalThis.G = { HEADLESS: true };
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, src] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  new Function(fs.readFileSync(path.join(root, src), 'utf8'))();
}
const G = globalThis.G;

const maxMin = +process.argv[2] || 200;
const FULL = process.argv.includes('--full');

G.grid.init(128, 4242);
G.city = { name: 'Botville', pop: 0, funds: 5000, eraIndex: 0, happiness: 0.6 };
G.Events.init();
G.time.day = 1; G.time.hour = 8;

const start = Date.now();
const eraTimes = G.Demo.autoplay(maxMin, {
  stopEra: FULL ? 4 : 3,
  onMinute: (m) => {
    if (m % 10 === 0 || G.city.pop > 4500) {
      const st = G.Growth.stats;
      console.log(`min ${String(m).padStart(3)}  pop ${String(G.city.pop).padStart(5)}  ` +
        `funds ${String(G.city.funds).padStart(6)}  hap ${G.city.happiness.toFixed(2)}  ` +
        `jobs ${st.jobs}  era ${G.Eras.current().id}`);
    }
    if (!Number.isFinite(G.city.funds)) { console.error('FUNDS NaN'); process.exit(1); }
  },
});

console.log(`\nera times (sim minutes): ${JSON.stringify(eraTimes)}`);
console.log(`wall time: ${((Date.now() - start) / 1000).toFixed(1)}s`);

let fail = false;
const t = (id) => eraTimes[id] ?? Infinity;
if (t('village') > 12) { console.error(`Village too slow: ${t('village')} min`); fail = true; }
if (t('town') > 60) { console.error(`Town too slow: ${t('town')} min`); fail = true; }
if (t('city') > 150) { console.error(`City too slow: ${t('city')} min`); fail = true; }
if (FULL && t('metropolis') > 200) { console.error(`Metropolis too slow: ${t('metropolis')} min`); fail = true; }
process.exit(fail ? 1 : 0);
