// Save/load via localStorage. Terrain regenerates from the seed; only deltas
// (roads, zones, structures, city, clock, camera) are stored. Autosaves daily.
(() => {
const G = globalThis.G ??= {};
const S = G.Save = { KEY: 'cozyopolis_save_v1' };

const b64 = (arr) => {
  let out = '';
  const CH = 0x8000;
  for (let i = 0; i < arr.length; i += CH) {
    out += String.fromCharCode.apply(null, arr.subarray(i, i + CH));
  }
  return btoa(out);
};
const unb64 = (str) => {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

S.capture = () => ({
  v: 1,
  seed: G.grid.seed,
  size: G.grid.size,
  name: G.city.name,
  funds: G.city.funds,
  eraIndex: G.city.eraIndex,
  happiness: G.city.happiness,
  day: G.time.day,
  hour: G.time.hour,
  roads: b64(G.grid.roads),
  zones: b64(G.grid.zones),
  structures: [...G.grid.structures.values()].map((s) => ({
    kind: s.kind, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h,
    pop: s.pop, construction: s.construction, sp: s.sp, leaf: s.leaf, v: s.v,
  })),
  camX: G.cam.x, camY: G.cam.y, zoomIndex: G.cam.zoomIndex,
});

S.apply = (d) => {
  G.grid.init(d.size, d.seed);
  // replace generated nature with the saved structure set
  G.grid.structures.clear();
  G.grid.occ.fill(0);
  G.grid.nextId = 1;
  for (const s of d.structures) G.grid.addStructure({ ...s });
  G.grid.roads.set(unb64(d.roads));
  G.grid.zones.set(unb64(d.zones));
  G.city.name = d.name;
  G.city.funds = d.funds;
  G.city.eraIndex = d.eraIndex ?? 0;
  G.city.happiness = d.happiness ?? 0.6;
  G.time.day = d.day;
  G.time.hour = d.hour;
  G.time.paused = false;
  G.cam.x = d.camX; G.cam.y = d.camY;
  G.cam.zoomIndex = d.zoomIndex ?? 2;
  G.cam.zoomTarget = G.cam.zoom = [0.5, 0.75, 1, 1.5, 2][G.cam.zoomIndex];
  G.Render.invalidateAll();
  G.Roads.markLampsDirty();
  if (G.Traffic) G.Traffic.dirty = true;
  G.Growth.landValuePass();
};

S.save = () => {
  try {
    localStorage.setItem(S.KEY, JSON.stringify(S.capture()));
    return true;
  } catch (e) {
    return false;
  }
};
S.has = () => {
  try { return !!localStorage.getItem(S.KEY); } catch (e) { return false; }
};
S.load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(S.KEY));
    if (!d || d.v !== 1) return false;
    S.apply(d);
    return true;
  } catch (e) {
    return false;
  }
};

// autosave at each new day (chained after the budget hook)
S.installAutosave = () => {
  const prev = G.hooks.newDay;
  G.hooks.newDay = (day) => {
    prev?.(day);
    if (G.scene === 'game') S.save();
  };
  window.addEventListener('pagehide', () => { if (G.scene === 'game') S.save(); });
};
})();
