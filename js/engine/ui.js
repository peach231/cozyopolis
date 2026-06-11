// In-canvas HUD: top-left city panel, top-right clock, bottom-right controls.
// Buttons are laid out during draw into UI.buttons; main.js routes clicks here.
(() => {
const G = globalThis.G ??= {};
const UI = G.UI = {};

const FONT = "'Trebuchet MS', 'Segoe UI', sans-serif";
UI.buttons = [];
UI.hoverId = null;

const P = () => G.C.PAL;

function panel(ctx, x, y, w, h, r = 10) {
  G.Render.roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = G.C.withAlpha(P().uiPanel, 0.92);
  ctx.fill();
  ctx.strokeStyle = G.C.withAlpha(P().uiPanelLight, 0.9);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function button(ctx, id, x, y, w, h, active, drawGlyph) {
  UI.buttons.push({ id, x, y, w, h });
  const hov = UI.hoverId === id;
  G.Render.roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = active ? P().uiAccent : hov ? P().uiPanelLight : G.C.withAlpha(P().uiPanelLight, 0.55);
  ctx.fill();
  ctx.strokeStyle = G.C.withAlpha(active ? '#fff3d6' : P().uiPanelLight, 0.9);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  drawGlyph(ctx, active ? '#3a3147' : P().uiText);
  ctx.restore();
}

// small drawn icons (consistent across platforms, unlike emoji)
function iconPerson(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y - 3.4, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + 4.6, 4.4, Math.PI, 0); ctx.fill();
}
function iconCoin(ctx, x, y, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.stroke();
}
function iconSunMoon(ctx, x, y) {
  const day = G.time.daylight();
  if (day > 0.5) {
    ctx.fillStyle = P().uiAccent;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P().uiAccent; ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 6.4, y + Math.sin(a) * 6.4);
      ctx.lineTo(x + Math.cos(a) * 8.4, y + Math.sin(a) * 8.4);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#cfd3ff';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = G.C.withAlpha(P().uiPanel, 0.92);
    ctx.beginPath(); ctx.arc(x + 2.4, y - 1.6, 4.2, 0, Math.PI * 2); ctx.fill();
  }
}

UI.draw = (ctx) => {
  const view = G.view;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  UI.buttons.length = 0;
  const pal = P();

  // ---- top-left: city panel
  const PW = 296;
  panel(ctx, 12, 12, PW, 104);
  ctx.fillStyle = pal.uiText;
  ctx.font = `700 17px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(G.city.name, 26, 32);
  // era badge
  const eraName = G.Eras.current().name;
  ctx.font = `700 11px ${FONT}`;
  const ew = ctx.measureText(eraName).width + 14;
  G.Render.roundRect(ctx, 12 + PW - ew - 14, 22, ew, 20, 9);
  ctx.fillStyle = pal.uiAccent;
  ctx.fill();
  ctx.fillStyle = '#3a3147';
  ctx.fillText(eraName, 12 + PW - ew - 7, 33);

  iconPerson(ctx, 33, 56, pal.uiTextDim);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = pal.uiText;
  ctx.fillText(G.city.pop.toLocaleString(), 44, 57);
  iconCoin(ctx, 116, 56, pal.uiAccent);
  ctx.fillStyle = G.city.funds < 0 ? pal.uiBad : pal.uiText;
  ctx.fillText(G.city.funds.toLocaleString(), 128, 57);
  // happiness face
  const hap = G.city.happiness ?? 0.6;
  const fx = 12 + PW - 60, fy = 56;
  ctx.strokeStyle = hap > 0.55 ? pal.uiGood : hap > 0.35 ? pal.uiAccent : pal.uiBad;
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(fx, fy, 7.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(fx - 2.6, fy - 2, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(fx + 2.6, fy - 2, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  const bend = (hap - 0.45) * 8;
  ctx.moveTo(fx - 3.2, fy + 2.6);
  ctx.quadraticCurveTo(fx, fy + 2.6 + bend, fx + 3.2, fy + 2.6);
  ctx.stroke();
  // RCI demand bars
  const dem = G.Growth?.demand ?? { res: 0, com: 0 };
  for (const [i, [v, col]] of [[dem.res, pal.uiGood], [dem.com, '#88a4c4']].entries()) {
    const bx = 12 + PW - 38 + i * 12;
    ctx.fillStyle = G.C.withAlpha(pal.uiPanelLight, 0.6);
    ctx.fillRect(bx, 46, 7, 22);
    ctx.fillStyle = col;
    const hgt = Math.max(2, v * 22);
    ctx.fillRect(bx, 46 + 22 - hgt, 7, hgt);
  }
  // live street counts
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = pal.uiTextDim;
  const walkers = G.Agents?.walkers.filter((w) => !w.hide).length ?? 0;
  const cars = G.Traffic?.cars.length ?? 0;
  ctx.fillText(`${walkers} out walking · ${cars} driving`, 26, 78);
  // era progress bar
  const next = G.Eras.next();
  if (next) {
    const t = G.M.clamp(G.city.pop / next.pop, 0, 1);
    const bw = PW - 132;
    ctx.fillStyle = G.C.withAlpha(pal.uiPanelLight, 0.6);
    G.Render.roundRect(ctx, 26, 92, bw, 7, 3.5);
    ctx.fill();
    if (t > 0.02) {
      ctx.fillStyle = pal.uiAccent;
      G.Render.roundRect(ctx, 26, 92, bw * t, 7, 3.5);
      ctx.fill();
    }
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = pal.uiTextDim;
    ctx.fillText(`${next.name} at ${next.pop.toLocaleString()}`, 26 + bw + 8, 96);
  }

  // ---- top-right: clock panel
  const cw = 158, cx0 = view.w - cw - 12;
  panel(ctx, cx0, 12, cw, 44);
  iconSunMoon(ctx, cx0 + 24, 34);
  ctx.fillStyle = pal.uiText;
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText(G.time.clockStr(), cx0 + 42, 33);
  ctx.fillStyle = pal.uiTextDim;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(`Day ${G.time.day}`, cx0 + 104, 34);

  // ---- bottom-right: speed + zoom controls
  const bw = 38, gap = 6;
  const totalW = bw * 6 + gap * 5 + 14;
  let bx = view.w - totalW - 12, by = view.h - 12 - 46;
  panel(ctx, bx - 8, by - 8, totalW + 8, 54, 12);

  button(ctx, 'pause', bx, by, bw, 38, G.time.paused, (c, col) => {
    c.fillStyle = col;
    if (G.time.paused) { // play triangle
      c.beginPath(); c.moveTo(-4, -6); c.lineTo(7, 0); c.lineTo(-4, 6); c.fill();
    } else {
      c.fillRect(-5, -6, 3.6, 12); c.fillRect(1.5, -6, 3.6, 12);
    }
  });
  for (const [i, sp] of [[1, 1], [2, 2], [3, 4]]) {
    button(ctx, `speed${sp}`, bx + (bw + gap) * i, by, bw, 38,
      !G.time.paused && G.time.speed === sp, (c, col) => {
        c.fillStyle = col;
        c.font = `700 14px ${FONT}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`${sp}×`, 0, 1);
      });
  }
  const zx = bx + (bw + gap) * 4 + 8;
  button(ctx, 'zoomOut', zx, by, bw, 38, false, (c, col) => {
    c.strokeStyle = col; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.stroke();
  });
  button(ctx, 'zoomIn', zx + bw + gap, by, bw, 38, false, (c, col) => {
    c.strokeStyle = col; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0);
    c.moveTo(0, -6); c.lineTo(0, 6); c.stroke();
  });

  // ---- top-center: news ticker
  drawTicker(ctx);

  // ---- bottom-right: minimap (above the controls)
  drawMinimap(ctx);

  // ---- bottom-left: build palette
  drawPalette(ctx);

  // ---- inspector card (above palette)
  if (UI.selected) drawInspector(ctx);

  // ---- toasts (top-center)
  for (let i = UI.toasts.length - 1; i >= 0; i--) {
    const t = UI.toasts[i];
    t.age += 1 / 60;
    if (t.age > 2.2) { UI.toasts.splice(i, 1); continue; }
    const a = Math.min(1, 3 * (2.2 - t.age));
    ctx.globalAlpha = a;
    ctx.font = `700 14px ${FONT}`;
    const w = ctx.measureText(t.msg).width + 28;
    panel(ctx, (view.w - w) / 2, 64, w, 32);
    ctx.fillStyle = pal.uiBad;
    ctx.textAlign = 'center';
    ctx.fillText(t.msg, view.w / 2, 81);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // debug overlay
  if (G.hash?.debug) {
    ctx.fillStyle = pal.uiTextDim;
    ctx.font = `600 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`fps ${G.debug.fps | 0}  seed ${G.grid.seed}  zoom ${G.cam.zoom.toFixed(2)}`, 14, view.h - 14);
  }
};

UI.toasts = [];
UI.toast = (msg) => {
  if (UI.toasts.some((t) => t.msg === msg && t.age < 0.5)) return;
  UI.toasts.push({ msg, age: 0 });
};

// ------------------------------------------------------------- palette
UI.cat = 'roads';
const CATS = [
  ['roads', 'Roads'], ['zones', 'Zones'], ['parks', 'Parks'],
  ['civic', 'Civic'], ['landmarks', 'Landmarks'],
];
const ROAD_ERAS = { 1: 'hamlet', 2: 'village', 3: 'town', 4: 'city' };

function catItems() {
  const bld = (id) => {
    const def = G.Buildings.byId[id];
    return { id: `tool:bld:${id}`, name: def.name, cost: def.cost, bld: id, era: def.era, unique: def.unique };
  };
  switch (UI.cat) {
    case 'roads':
      return [1, 2, 3, 4].map((t) => ({
        id: `tool:road:${t}`, name: G.Roads.TIERS[t].name,
        cost: G.Roads.TIERS[t].cost, road: t, era: ROAD_ERAS[t],
      }));
    case 'zones':
      return [
        { id: 'tool:zone:1', name: 'Residential Zone', cost: 1, zone: 1, era: 'hamlet' },
        { id: 'tool:zone:2', name: 'Commercial Zone', cost: 1, zone: 2, era: 'hamlet' },
      ];
    case 'parks':
      return [
        { id: 'tool:tree', name: 'Plant Tree', cost: 10, tree: true, era: 'hamlet' },
        bld('green'), bld('plaza'), bld('fountain'),
      ];
    case 'civic':
      return [bld('well'), bld('farmhouse'), bld('barn'), bld('chapel'), bld('school')];
    case 'landmarks':
      return [bld('town_hall'), bld('clock_tower'), bld('museum'),
        bld('stadium'), bld('cathedral'), bld('spire')];
  }
  return [];
}

const eraLocked = (item) =>
  item.era && G.Eras.indexOf(item.era) > (G.city.eraIndex ?? 0);
const alreadyBuilt = (item) => {
  if (!item.unique) return false;
  for (const s of G.grid.structures.values()) {
    if (s.kind === 'building' && s.type === item.bld) return true;
  }
  return false;
};

const selectedToolId = () => {
  const t = G.Build.tool;
  if (!t) return null;
  if (t.mode === 'road') return `tool:road:${t.tier}`;
  if (t.mode === 'zone') return `tool:zone:${t.zone}`;
  if (t.mode === 'build') return `tool:bld:${t.type}`;
  if (t.mode === 'tree') return 'tool:tree';
  return 'tool:doze';
};

function drawPalette(ctx) {
  const view = G.view, pal = P();
  const items = catItems();
  const bs = 44, gap = 5, tabH = 24;
  const x0 = 12, y0 = view.h - 12 - bs - 8;
  const itemsW = (items.length + 1) * (bs + gap) - gap; // +1 for bulldoze
  const tabsW = CATS.length * 78;
  const panelW = Math.max(itemsW, tabsW) + 12;
  panel(ctx, x0 - 6, y0 - 8 - tabH - 4, panelW, bs + 16 + tabH + 4, 12);

  // category tabs
  CATS.forEach(([id, label], i) => {
    const tx = x0 + i * 78;
    const active = UI.cat === id;
    UI.buttons.push({ id: `cat:${id}`, x: tx, y: y0 - tabH - 6, w: 74, h: tabH });
    G.Render.roundRect(ctx, tx, y0 - tabH - 6, 74, tabH, 7);
    ctx.fillStyle = active ? pal.uiAccent : (UI.hoverId === `cat:${id}` ? pal.uiPanelLight : 'rgba(0,0,0,0)');
    ctx.fill();
    ctx.fillStyle = active ? '#3a3147' : pal.uiTextDim;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, tx + 37, y0 - tabH + 7);
  });
  ctx.textAlign = 'left';

  const sel = selectedToolId();
  let hovered = null;
  const drawItem = (it, i) => {
    const x = x0 + i * (bs + gap);
    const locked = eraLocked(it) || alreadyBuilt(it);
    button(ctx, it.id, x, y0, bs, bs, sel === it.id, (c, col) => {
      if (locked) c.globalAlpha = 0.35;
      if (it.road) {
        const surf = [null, G.C.PAL.dirt, G.C.PAL.cobble, G.C.PAL.pave, G.C.PAL.pave][it.road];
        c.fillStyle = surf[2];
        c.beginPath();
        c.moveTo(0, -9); c.lineTo(16, 0); c.lineTo(0, 9); c.lineTo(-16, 0);
        c.closePath(); c.fill();
        c.strokeStyle = surf[it.road === 4 ? 0 : 4]; c.lineWidth = 1.2; c.stroke();
      } else if (it.zone) {
        c.fillStyle = G.C.withAlpha(it.zone === 1 ? '#9ed47a' : '#88a4c4', 0.7);
        c.beginPath();
        c.moveTo(0, -9); c.lineTo(16, 0); c.lineTo(0, 9); c.lineTo(-16, 0);
        c.closePath(); c.fill();
        c.fillStyle = '#3a3147';
        c.font = `700 12px ${FONT}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(it.zone === 1 ? 'R' : 'C', 0, 0);
      } else if (it.tree) {
        c.fillStyle = G.C.PAL.woodDark[2];
        c.fillRect(-1.5, 2, 3, 7);
        c.fillStyle = G.C.PAL.leafWarm[2];
        c.beginPath(); c.arc(0, -3, 7.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = G.C.PAL.leafWarm[1];
        c.beginPath(); c.arc(-2.5, -5.5, 4, 0, Math.PI * 2); c.fill();
      } else if (it.bld) {
        const spr = G.Render.getStructureSprite({ type: it.bld });
        if (spr) {
          const w = spr.cv.width / spr.scale, h = spr.cv.height / spr.scale;
          const sc = Math.min(34 / w, 34 / h);
          c.drawImage(spr.cv, -w * sc / 2, -h * sc / 2, w * sc, h * sc);
        }
      } else { // bulldoze
        c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-7, -7); c.lineTo(7, 7);
        c.moveTo(7, -7); c.lineTo(-7, 7);
        c.stroke();
      }
      c.globalAlpha = 1;
      if (locked) { // padlock
        c.fillStyle = pal.uiTextDim;
        c.fillRect(-4, 8, 8, 7);
        c.strokeStyle = pal.uiTextDim; c.lineWidth = 1.6;
        c.beginPath(); c.arc(0, 8, 3, Math.PI, 0); c.stroke();
      }
    });
    if (UI.hoverId === it.id) hovered = { it, x, locked };
  };
  items.forEach(drawItem);
  drawItem({ id: 'tool:doze', name: 'Bulldoze', cost: 0, doze: true }, items.length);

  if (hovered) {
    let label = hovered.it.cost ? `${hovered.it.name} — ${hovered.it.cost}` : hovered.it.name;
    if (alreadyBuilt(hovered.it)) label = `${hovered.it.name} — already built`;
    else if (eraLocked(hovered.it)) {
      const era = G.Eras.list[G.Eras.indexOf(hovered.it.era)];
      label = `${hovered.it.name} — unlocks at ${era.name} (${era.pop.toLocaleString()} pop)`;
    }
    ctx.font = `600 13px ${FONT}`;
    const w = ctx.measureText(label).width + 20;
    panel(ctx, hovered.x, y0 - tabH - 40, w, 26, 8);
    ctx.fillStyle = pal.uiText;
    ctx.textAlign = 'left';
    ctx.fillText(label, hovered.x + 10, y0 - tabH - 27);
  }
}

UI.selected = null;

// ------------------------------------------------------------- ticker
let tickerText = '', tickerW = 0;
function drawTicker(ctx) {
  const view = G.view, pal = P();
  const x0 = 322, x1 = view.w - 186;
  if (x1 - x0 < 220 || !G.Events?.ticker.length) return;
  if (G.Events.tickerDirty || !tickerText) {
    G.Events.tickerDirty = false;
    tickerText = G.Events.ticker.map((t) => t.msg).join('      •      ');
    ctx.font = `600 13px ${FONT}`;
    tickerW = ctx.measureText(tickerText).width + 120;
  }
  panel(ctx, x0, 12, x1 - x0, 30, 10);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + 10, 12, x1 - x0 - 20, 30);
  ctx.clip();
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = pal.uiText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const off = (performance.now() / 1000 * 42) % tickerW;
  ctx.fillText(tickerText, x0 + (x1 - x0) - off, 28);
  ctx.fillText(tickerText, x0 + (x1 - x0) - off + tickerW, 28);
  ctx.restore();
}

// ------------------------------------------------------------- minimap
let mmCv = null, mmAge = 1e9;
const MM = 128;
UI.minimapRect = null;
function rebuildMinimap() {
  if (!mmCv) {
    mmCv = document.createElement('canvas');
    mmCv.width = MM; mmCv.height = MM;
  }
  const c = mmCv.getContext('2d');
  const grid = G.grid, n = grid.size, T = G.T;
  const img = c.createImageData(MM, MM);
  const px = img.data;
  const put = (i, hex) => {
    const [r, g, b] = G.C.hex2rgb(hex);
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
  };
  for (let y = 0; y < MM; y++) {
    for (let x = 0; x < MM; x++) {
      const gx = (x * n / MM) | 0, gy = (y * n / MM) | 0;
      const gi = gy * n + gx, i = y * MM + x;
      const t = grid.ground[gi];
      if (grid.roads[gi]) { put(i, '#8d8798'); continue; }
      const s = grid.structures.get(grid.occ[gi]);
      if (s) {
        if (s.kind === 'tree') put(i, '#3f6b35');
        else if (s.kind === 'building') {
          const def = G.Buildings.byId[s.type];
          put(i, def.housing ? '#c75b4e' : def.kind === 'park' ? '#84b95c' :
            def.kind === 'landmark' || def.kind === 'civic' ? '#ffcf6b' : '#88a4c4');
        } else put(i, '#7a8a6a');
        continue;
      }
      if (t === T.WATER) put(i, '#4a9ab0');
      else if (t === T.SAND) put(i, '#e3c98f');
      else if (grid.zones[gi] === 1) put(i, '#86b06b');
      else if (grid.zones[gi] === 2) put(i, '#7e98a8');
      else put(i, t === T.MEADOW ? '#97bd68' : '#86b061');
    }
  }
  c.putImageData(img, 0, 0);
}

function drawMinimap(ctx) {
  const view = G.view;
  if (view.h < 560) return;
  mmAge += 1 / 60;
  if (mmAge > 2) { mmAge = 0; rebuildMinimap(); }
  const x = view.w - 12 - MM - 12, y = view.h - 12 - 54 - 10 - MM - 12;
  panel(ctx, x, y, MM + 12, MM + 12, 10);
  ctx.drawImage(mmCv, x + 6, y + 6);
  UI.minimapRect = { x: x + 6, y: y + 6 };
  UI.buttons.push({ id: 'minimap', x: x + 6, y: y + 6, w: MM, h: MM });
  // viewport diamond
  const r = G.cam.viewRect(0);
  const corners = [
    G.ISO.toWorld(r.x0, r.y0), G.ISO.toWorld(r.x1, r.y0),
    G.ISO.toWorld(r.x1, r.y1), G.ISO.toWorld(r.x0, r.y1),
  ];
  ctx.strokeStyle = '#fff3d6';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  corners.forEach(([tx, ty], i) => {
    const mx = x + 6 + G.M.clamp(tx / G.grid.size, 0, 1) * MM;
    const my = y + 6 + G.M.clamp(ty / G.grid.size, 0, 1) * MM;
    i ? ctx.lineTo(mx, my) : ctx.moveTo(mx, my);
  });
  ctx.closePath();
  ctx.stroke();
}

function drawInspector(ctx) {
  const view = G.view, pal = P();
  const sel = UI.selected;
  // drop selection if the agent/building no longer exists
  if (sel.kind === 'walker' && !G.Agents.walkers.includes(sel.ref)) { UI.selected = null; return; }
  if (sel.kind === 'car' && !G.Traffic.cars.includes(sel.ref)) { UI.selected = null; return; }
  if (sel.kind === 'building' && !G.grid.structures.has(sel.ref.id)) { UI.selected = null; return; }

  let title = '', sub = '', status = '';
  if (sel.kind === 'walker') {
    title = sel.ref.name;
    sub = 'Villager';
    status = G.Agents.statusOf(sel.ref);
  } else if (sel.kind === 'car') {
    title = `${sel.ref.owner}'s car`;
    sub = 'On the road';
    status = G.Traffic.statusOf(sel.ref);
  } else {
    const def = G.Buildings.byId[sel.ref.type];
    title = def.name;
    sub = def.housing ? `Home · ${sel.ref.pop ?? 0}/${def.housing} residents` :
      def.jobs ? `Workplace · ${def.jobs} jobs` :
      def.kind === 'park' ? 'Park' :
      def.kind === 'landmark' ? 'Landmark' : 'Civic';
    status = sel.ref.construction > 0 ? 'Under construction' :
      def.kind === 'com' ? 'Open for business' :
      def.kind === 'farm' ? 'Tending the land' :
      def.kind === 'civic' ? 'Serving the town' :
      def.kind === 'landmark' ? `Pride of ${G.city.name}` :
      def.kind === 'park' ? 'A lovely spot' : 'A cozy home';
  }
  const x = 12, y = G.view.h - 12 - 52 - 16 - 86;
  panel(ctx, x, y, 250, 80);
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.uiAccent;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(title, x + 14, y + 20);
  ctx.fillStyle = pal.uiTextDim;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(sub, x + 14, y + 40);
  ctx.fillStyle = pal.uiText;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(status, x + 14, y + 60);
}

UI.hitTest = (vx, vy) => {
  for (const b of UI.buttons) {
    if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) return b.id;
  }
  return null;
};

UI.onClick = (id, vx, vy) => {
  G.Audio?.sfxClick?.();
  if (id === 'minimap' && UI.minimapRect) {
    const tx = (vx - UI.minimapRect.x) / MM * G.grid.size;
    const ty = (vy - UI.minimapRect.y) / MM * G.grid.size;
    G.cam.centerOnTile(tx, ty);
    return;
  }
  if (id === 'pause') G.time.paused = !G.time.paused;
  else if (id?.startsWith('speed')) { G.time.paused = false; G.time.speed = +id.slice(5); }
  else if (id === 'zoomIn') G.cam.zoomStep(1);
  else if (id === 'zoomOut') G.cam.zoomStep(-1);
  else if (id?.startsWith('cat:')) UI.cat = id.slice(4);
  else if (id?.startsWith('tool:')) {
    if (selectedToolId() === id) { G.Build.cancel(); return; }
    // refuse locked items with a hint
    const item = catItems().find((it) => it.id === id);
    if (item && eraLocked(item)) {
      const era = G.Eras.list[G.Eras.indexOf(item.era)];
      UI.toast(`Unlocks at ${era.name} (${era.pop.toLocaleString()} pop)`);
      return;
    }
    if (item && alreadyBuilt(item)) { UI.toast('Already built — one of a kind!'); return; }
    const [, kind, arg] = id.split(':');
    if (kind === 'road') G.Build.select({ mode: 'road', tier: +arg });
    else if (kind === 'zone') G.Build.select({ mode: 'zone', zone: +arg });
    else if (kind === 'tree') G.Build.select({ mode: 'tree' });
    else if (kind === 'bld') G.Build.select({ mode: 'build', type: arg });
    else G.Build.select({ mode: 'bulldoze' });
  }
};
})();
