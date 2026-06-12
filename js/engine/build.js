// Build tools: tool state, placement rules, road drag-lines, bulldoze, ghost
// previews and floating cost texts. UI palette (ui.js) selects tools; main.js
// routes mouse events here when a tool is active.
(() => {
const G = globalThis.G ??= {};
const Build = G.Build = {
  tool: null,        // {mode:'road',tier} | {mode:'build',type} | {mode:'bulldoze'}
  drag: null,        // road: {x0,y0}; bulldoze: true while sweeping
  floats: [],        // {sx, sy, txt, color, age}
};

Build.select = (tool) => { Build.tool = tool; Build.drag = null; };
Build.cancel = () => { Build.tool = null; Build.drag = null; };

const addFloat = Build.addFloat = (tx, ty, txt, color) => {
  const [sx, sy] = G.ISO.toScreen(tx, ty);
  Build.floats.push({ sx, sy: sy - 20, txt, color, age: 0 });
};

function spend(amount) {
  if (G.city.funds < amount) return false;
  G.city.funds -= amount;
  return true;
}

// ------------------------------------------------------------- buildings
Build.buildingPlacement = (type, x, y) => {
  const def = G.Buildings.byId[type];
  const bad = [];
  for (let dy = 0; dy < def.fd; dy++) {
    for (let dx = 0; dx < def.fw; dx++) {
      const tx = x + dx, ty = y + dy;
      const ok = G.grid.inBounds(tx, ty)
        && G.T.isBuildable(G.grid.groundAt(tx, ty))
        && G.grid.occ[G.grid.idx(tx, ty)] === 0
        && !G.Roads.at(tx, ty);
      if (!ok) bad.push([tx, ty]);
    }
  }
  const road = G.Roads.touchesFootprint(x, y, def.fw, def.fd);
  return { ok: bad.length === 0 && road, bad, needsRoad: bad.length === 0 && !road };
};

Build.tryPlaceBuilding = (type, x, y) => {
  const def = G.Buildings.byId[type];
  const p = Build.buildingPlacement(type, x, y);
  if (!p.ok) {
    if (p.needsRoad) G.UI.toast?.('Needs a road next to it');
    return false;
  }
  if (!spend(def.cost)) {
    G.UI.toast?.('Not enough funds');
    return false;
  }
  G.grid.addStructure({ kind: 'building', type, x, y, w: def.fw, h: def.fd });
  addFloat(x + def.fw / 2 - 0.5, y + def.fd / 2 - 0.5, `-${def.cost}`, '#ffd98a');
  G.Audio?.sfxBuild?.();
  G.hooks?.built?.(type, x, y);
  return true;
};

// ------------------------------------------------------------- roads
Build.roadLineCost = (tiles, tier) => {
  let cost = 0, valid = 0;
  for (const [x, y] of tiles) {
    if (!G.Roads.canPlace(x, y, tier)) continue;
    if (G.grid.roads[G.grid.idx(x, y)] === tier) continue;
    cost += G.Roads.TIERS[tier].cost;
    valid++;
  }
  return { cost, valid };
};

Build.commitRoadLine = (tiles, tier) => {
  const { cost } = Build.roadLineCost(tiles, tier);
  if (cost === 0) return;
  if (!spend(cost)) {
    G.UI.toast?.('Not enough funds');
    return;
  }
  for (const [x, y] of tiles) {
    if (G.Roads.canPlace(x, y, tier)) G.Roads.place(x, y, tier);
  }
  const mid = tiles[Math.floor(tiles.length / 2)];
  addFloat(mid[0], mid[1], `-${cost}`, '#ffd98a');
  G.Audio?.sfxBuild?.();
  G.hooks?.builtRoad?.(tiles, tier);
};

// ------------------------------------------------------------- zoning
const ZONE_COST = 1; // per tile
Build.canZone = (x, y) => {
  if (!G.grid.inBounds(x, y)) return false;
  const i = G.grid.idx(x, y);
  return G.T.isBuildable(G.grid.ground[i]) && !G.grid.roads[i] && G.grid.occ[i] === 0;
};

Build.rectTiles = (x0, y0, x1, y1) => {
  const tiles = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) tiles.push([x, y]);
  }
  return tiles;
};

Build.commitZoneRect = (tiles, zone) => {
  let cost = 0;
  const todo = [];
  for (const [x, y] of tiles) {
    if (!Build.canZone(x, y)) continue;
    if (G.grid.zones[G.grid.idx(x, y)] === zone) continue;
    todo.push([x, y]);
    cost += ZONE_COST;
  }
  if (!todo.length) return;
  if (!spend(cost)) { G.UI.toast?.('Not enough funds'); return; }
  for (const [x, y] of todo) G.grid.zones[G.grid.idx(x, y)] = zone;
  const mid = todo[Math.floor(todo.length / 2)];
  addFloat(mid[0], mid[1], `-${cost}`, '#ffd98a');
};

// tree planting (parks tab): no road requirement
Build.tryPlantTree = (x, y) => {
  if (!Build.canZone(x, y)) return false; // same ground rules
  if (!spend(10)) { G.UI.toast?.('Not enough funds'); return false; }
  const rng = G.rng(x * 977 + y * 131 + G.grid.seed);
  G.grid.addStructure({ kind: 'tree', sp: G.TreeArt.pick(rng), v: rng.int(0, 4), x, y });
  addFloat(x, y, '-10', '#ffd98a');
  return true;
};

// ------------------------------------------------------------- bulldoze
Build.bulldozeAt = (x, y) => {
  const s = G.grid.structAt(x, y);
  if (s || G.grid.roads[G.grid.idx(x, y)]) G.Audio?.sfxDoze?.();
  if (s) {
    if (s.kind === 'building') {
      const refund = Math.floor((G.Buildings.byId[s.type]?.cost ?? 0) * 0.25);
      G.city.funds += refund;
      if (refund) addFloat(x, y, `+${refund}`, '#9ed47a');
      G.hooks?.demolished?.(s);
    }
    G.grid.removeStructure(s.id);
    return true;
  }
  if (G.Roads.remove(x, y)) return true;
  const i = G.grid.idx(x, y);
  if (G.grid.zones[i]) { G.grid.zones[i] = 0; return true; }
  return false;
};

// ------------------------------------------------------------- input
Build.onMouseDown = (tx, ty) => {
  const t = Build.tool;
  if (!t) return false;
  if (t.mode === 'build') {
    Build.tryPlaceBuilding(t.type, tx, ty);
  } else if (t.mode === 'tree') {
    Build.tryPlantTree(tx, ty);
  } else if (t.mode === 'road' || t.mode === 'zone') {
    Build.drag = { x0: tx, y0: ty };
  } else if (t.mode === 'bulldoze') {
    Build.drag = true;
    Build.bulldozeAt(tx, ty);
  }
  return true;
};

Build.onMouseMove = (tx, ty) => {
  if (Build.tool?.mode === 'bulldoze' && Build.drag) Build.bulldozeAt(tx, ty);
};

Build.onMouseUp = (tx, ty) => {
  const t = Build.tool;
  if (t?.mode === 'road' && Build.drag) {
    const tiles = G.Roads.lineTiles(Build.drag.x0, Build.drag.y0, tx, ty);
    Build.commitRoadLine(tiles, t.tier);
  } else if (t?.mode === 'zone' && Build.drag) {
    Build.commitZoneRect(Build.rectTiles(Build.drag.x0, Build.drag.y0, tx, ty), t.zone);
  }
  Build.drag = null;
};

// ------------------------------------------------------------- overlay
// drawn in world space after structures
Build.drawOverlay = (ctx, dt) => {
  const t = Build.tool, hov = G.input?.hoverTile;
  if (t && hov) {
    const [hx, hy] = hov;
    if (t.mode === 'build') {
      const def = G.Buildings.byId[t.type];
      const p = Build.buildingPlacement(t.type, hx, hy);
      // footprint tint
      for (let dy = 0; dy < def.fd; dy++) {
        for (let dx = 0; dx < def.fw; dx++) {
          const blocked = p.bad.some(([bx, by]) => bx === hx + dx && by === hy + dy);
          G.Render.drawTileCursor(ctx, hx + dx, hy + dy,
            p.ok ? '#9ed47a' : blocked ? '#e58a7a' : p.needsRoad ? '#ffcf6b' : '#e58a7a');
        }
      }
      // ghost sprite
      const spr = G.Render.getStructureSprite({ type: t.type });
      if (spr) {
        const [sx, sy] = G.ISO.toScreen(hx - 0.5, hy - 0.5);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(spr.cv, sx - spr.ax, sy - spr.ay,
          spr.cv.width / spr.scale, spr.cv.height / spr.scale);
        ctx.globalAlpha = 1;
      }
    } else if (t.mode === 'zone') {
      const tiles = Build.drag
        ? Build.rectTiles(Build.drag.x0, Build.drag.y0, hx, hy)
        : [[hx, hy]];
      const col = ['', '#9ed47a', '#88a4c4', '#d9b153'][t.zone];
      for (const [x, y] of tiles) {
        G.Render.drawTileCursor(ctx, x, y, Build.canZone(x, y) ? col : '#e58a7a');
      }
    } else if (t.mode === 'tree') {
      G.Render.drawTileCursor(ctx, hx, hy, Build.canZone(hx, hy) ? '#9ed47a' : '#e58a7a');
    } else if (t.mode === 'road') {
      const tiles = Build.drag
        ? G.Roads.lineTiles(Build.drag.x0, Build.drag.y0, hx, hy)
        : [[hx, hy]];
      for (const [x, y] of tiles) {
        G.Render.drawTileCursor(ctx, x, y, G.Roads.canPlace(x, y, t.tier) ? '#9ed47a' : '#e58a7a');
      }
      if (Build.drag) {
        const { cost } = Build.roadLineCost(tiles, t.tier);
        const [sx, sy] = G.ISO.toScreen(hx, hy);
        ctx.font = "700 13px 'Trebuchet MS', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#3a3147';
        ctx.fillText(`${cost}`, sx + 1, sy - 23);
        ctx.fillStyle = cost <= G.city.funds ? '#ffd98a' : '#e58a7a';
        ctx.fillText(`${cost}`, sx, sy - 24);
      }
    } else if (t.mode === 'bulldoze') {
      G.Render.drawTileCursor(ctx, hx, hy, '#e58a7a');
    }
  }

  // floating texts
  for (let i = Build.floats.length - 1; i >= 0; i--) {
    const f = Build.floats[i];
    f.age += dt;
    if (f.age > 1.1) { Build.floats.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, 2.2 - f.age * 2);
    ctx.font = "700 13px 'Trebuchet MS', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3a3147';
    ctx.fillText(f.txt, f.sx + 1, f.sy - f.age * 22 + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.sx, f.sy - f.age * 22);
    ctx.globalAlpha = 1;
  }
};
})();
