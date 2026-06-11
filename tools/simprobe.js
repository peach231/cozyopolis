// Dev probe: runs the growth demo headlessly and prints pacing stats.
// node tools/simprobe.js [minutes]
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

const minutes = +process.argv[2] || 15;
G.grid.init(128, 11);
G.city = { name: 't', pop: 0, funds: 5000, eraIndex: 0, happiness: 0.6 };
G.Demo.grow();
G.time.day = 1; G.time.hour = 8;

for (let m = 1; m <= minutes; m++) {
  for (let i = 0; i < 60 * 60; i++) {
    G.time.tick(1 / 60);
    G.Growth.tick(1 / 60);
  }
  const st = G.Growth.stats;
  console.log(
    `min ${String(m).padStart(2)}  pop ${String(G.city.pop).padStart(4)}  ` +
    `housing ${String(st.housing).padStart(4)}  jobs ${String(st.jobs).padStart(4)}  ` +
    `res ${st.resBuildings}  com ${st.comBuildings}  hap ${G.city.happiness.toFixed(2)}  ` +
    `dem R ${G.Growth.demand.res.toFixed(2)} C ${G.Growth.demand.com.toFixed(2)}  ` +
    `funds ${G.city.funds}  era ${G.Eras.current().name}`);
}
