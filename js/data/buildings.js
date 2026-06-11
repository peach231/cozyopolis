// Building catalog: gameplay data + art recipes (interpreted by shapegen).
// fw/fd = footprint in tiles. height = max sprite height in px (canvas sizing).
// Recipe coords are tile-space 0..fw / 0..fd, z up in px.
(() => {
const G = globalThis.G ??= {};
const B = G.Buildings = { all: [], byId: {} };

const add = (def) => {
  B.all.push(def);
  B.byId[def.id] = def;
  return def;
};

// crop rows painter (fields): bumpy rows following the +x direction
const cropRows = (color1, color2, leafy) => (ctx, proj) => {
  for (let row = 0; row < 4; row++) {
    const ty = 0.18 + row * 0.22;
    for (let i = 0; i < 9; i++) {
      const tx = 0.1 + i * 0.1;
      const [sx, sy] = proj(tx, ty, 0);
      ctx.fillStyle = i % 2 ? color1 : color2;
      ctx.beginPath();
      if (leafy) ctx.ellipse(sx, sy - 1.4, 2.4, 1.8, 0, 0, Math.PI * 2);
      else ctx.ellipse(sx, sy - 2.2, 1.3, 2.6, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// ------------------------------------------------------------- HAMLET era
const cottage = (id, name, wall, roof, axis, doorFace, winFace) => add({
  id, name, era: 'hamlet', fw: 1, fd: 1, height: 52, inset: 0.11,
  cost: 100, housing: 4, kind: 'res',
  ops: [
    ['box', 0.11, 0.11, 0.78, 0.78, 0, 21, wall],
    ['gable', 0.03, 0.03, 0.94, 0.94, 21, 14, roof, axis, wall],
    ['door', doorFace, 0.32, 0, { h: 13 }],
    ['win', winFace, 1, 7, { us: [0.65], w: 6, h: 7 }],
    ['win', doorFace, 1, 7, { us: [0.72], w: 6, h: 7 }],
    ['chimney', 0.74, 0.3, 30, 8],
  ],
});
cottage('cottage_a', 'Thatch Cottage', 'plaster', 'roofThatch', 'x', 'se', 'sw');
cottage('cottage_b', 'Red-Roof Cottage', 'plaster', 'roofRed', 'y', 'sw', 'se');
cottage('cottage_c', 'Timber Cottage', 'wood', 'roofTeal', 'x', 'se', 'sw');

add({
  id: 'farmhouse', name: 'Farmhouse', era: 'hamlet', fw: 2, fd: 1, height: 60,
  inset: 0.12, cost: 250, housing: 6, jobs: 2, kind: 'res',
  ops: [
    ['box', 0.12, 0.12, 1.76, 0.76, 0, 24, 'plaster'],
    ['gable', 0.04, 0.04, 1.92, 0.92, 24, 14, 'roofRed', 'x', 'plaster'],
    ['door', 'sw', 0.26, 0, { h: 13 }],
    ['win', 'sw', 2, 8, { us: [0.55, 0.8], w: 6, h: 7 }],
    ['win', 'se', 1, 8, { us: [0.5], w: 6, h: 7 }],
    ['chimney', 1.6, 0.3, 34, 8],
  ],
});

add({
  id: 'barn', name: 'Barn', era: 'hamlet', fw: 2, fd: 2, height: 78,
  inset: 0.14, cost: 300, jobs: 3, kind: 'farm',
  ops: [
    ['box', 0.14, 0.14, 1.72, 1.72, 0, 30, 'wood'],
    ['gable', 0.05, 0.05, 1.9, 1.9, 30, 20, 'roofRed', 'y', 'wood'],
    ['door', 'sw', 0.5, 0, { w: 14, h: 18, m: 'woodDark' }],
    ['win', 'se', 2, 10, { us: [0.3, 0.7], w: 5, h: 6 }],
    ['win', 'sw', 1, 34, { us: [0.5], w: 7, h: 6 }], // hayloft
  ],
});

const field = (id, name, c1, c2, leafy) => add({
  id, name, era: 'hamlet', fw: 1, fd: 1, height: 12, emissive: false,
  cost: 30, jobs: 2, kind: 'farm', flat: true,
  ops: [
    ['floor', 0.03, 0.03, 0.94, 0.94, 'dirt', 2],
    ['paint', cropRows(c1, c2, leafy)],
  ],
});
field('field_wheat', 'Wheat Field', '#d9b153', '#c79c3f', false);
field('field_greens', 'Garden Field', '#76a84e', '#5c9148', true);

add({
  id: 'well', name: 'Village Well', era: 'hamlet', fw: 1, fd: 1, height: 38,
  emissive: false, cost: 80, aura: 4, kind: 'civic',
  ops: [
    ['floor', 0.2, 0.2, 0.6, 0.6, 'stone', 3],
    ['cyl', 0.5, 0.5, 0.2, 0, 9, 'stone'],
    ['box', 0.3, 0.66, 0.06, 0.06, 0, 22, 'woodDark'],
    ['box', 0.66, 0.3, 0.06, 0.06, 0, 22, 'woodDark'],
    ['gable', 0.22, 0.22, 0.56, 0.56, 22, 7, 'roofTeal', 'x', 'woodDark'],
  ],
});

add({
  id: 'stall', name: 'Market Stall', era: 'hamlet', fw: 1, fd: 1, height: 34,
  cost: 120, jobs: 2, kind: 'com',
  ops: [
    ['floor', 0.08, 0.08, 0.84, 0.84, 'wood', 2],
    ['box', 0.2, 0.2, 0.6, 0.55, 0, 8, 'wood'],          // counter
    ['paint', (ctx, proj) => {                             // produce baskets
      const spots = [[0.32, 0.34, '#e8909d'], [0.52, 0.3, '#ecc35e'], [0.68, 0.42, '#76a84e']];
      for (const [tx, ty, c] of spots) {
        const [sx, sy] = proj(tx, ty, 9);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(sx - 3 + (i % 3) * 3, sy - ((i / 3) | 0) * 2.4, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }],
    ['box', 0.16, 0.16, 0.05, 0.05, 0, 22, 'woodDark'],   // posts
    ['box', 0.79, 0.16, 0.05, 0.05, 0, 22, 'woodDark'],
    ['box', 0.16, 0.79, 0.05, 0.05, 0, 22, 'woodDark'],
    ['box', 0.79, 0.79, 0.05, 0.05, 0, 22, 'woodDark'],
    ['gable', 0.06, 0.06, 0.88, 0.88, 22, 6, 'roofRed', 'y', 'roofRed'],
  ],
});

// ------------------------------------------------------------- VILLAGE era
const houseV = (id, name, wall, roof, axis) => add({
  id, name, era: 'village', fw: 1, fd: 1, height: 62, inset: 0.1,
  cost: 180, housing: 8, kind: 'res',
  ops: [
    ['box', 0.1, 0.1, 0.8, 0.8, 0, 30, wall],
    ['gable', 0.03, 0.03, 0.94, 0.94, 30, 14, roof, axis, wall],
    ['door', 'sw', 0.3, 0, { h: 12 }],
    ['win', 'sw', 1, 4, { us: [0.7], w: 6, h: 7 }],
    ['winGrid', 'se', 2, 1, 18, 0, { w: 6, h: 7 }],
    ['win', 'sw', 2, 18, { us: [0.3, 0.7], w: 6, h: 7 }],
    ['chimney', 0.75, 0.28, 40, 8],
  ],
});
houseV('house_a', 'Gable House', 'plaster', 'roofTeal', 'x');
houseV('house_b', 'Brick House', 'brick', 'roofSlate', 'y');

add({
  id: 'bakery', name: 'Bakery', era: 'village', fw: 1, fd: 1, height: 56,
  inset: 0.1, cost: 200, jobs: 4, kind: 'com',
  ops: [
    ['box', 0.1, 0.1, 0.8, 0.8, 0, 26, 'plaster'],
    ['gable', 0.03, 0.03, 0.94, 0.94, 26, 12, 'roofRed', 'y', 'plaster'],
    ['awning', 'sw', 0.14, 0.62, 16, 3, 7, 'roofRed', 'plaster'],
    ['door', 'sw', 0.32, 0, { h: 12 }],
    ['win', 'sw', 1, 3, { us: [0.72], w: 8, h: 8 }],   // shop window
    ['win', 'se', 1, 15, { us: [0.5], w: 6, h: 6 }],
    ['chimney', 0.3, 0.7, 36, 9],
  ],
});

add({
  id: 'chapel', name: 'Chapel', era: 'village', fw: 1, fd: 2, height: 84,
  inset: 0.12, cost: 250, aura: 6, upkeep: 2, kind: 'civic',
  ops: [
    ['box', 0.12, 0.12, 0.76, 1.76, 0, 26, 'plaster'],
    ['gable', 0.05, 0.05, 0.9, 1.9, 26, 14, 'roofSlate', 'y', 'plaster'],
    ['box', 0.3, 1.36, 0.4, 0.4, 0, 52, 'plaster'],         // bell tower
    ['pyramid', 0.24, 1.3, 0.52, 0.52, 52, 14, 'roofSlate'],
    ['win', 'sw', 1, 38, { us: [0.83], w: 5, h: 7 }],       // tower window
    ['win', 'sw', 2, 8, { us: [0.2, 0.45], w: 5, h: 10 }],  // tall nave windows
    ['door', 'se', 0.78, 0, { h: 13, w: 8 }],
  ],
});

add({
  id: 'green', name: 'Village Green', era: 'village', fw: 2, fd: 2, height: 30,
  emissive: false, cost: 150, aura: 8, upkeep: 1, kind: 'park', flat: true,
  ops: [
    ['floor', 0.05, 0.05, 1.9, 1.9, 'meadow', 1],
    ['paint', (ctx, proj) => {
      const rng = G.rng(771);
      for (let i = 0; i < 12; i++) { // flowers
        const [sx, sy] = proj(0.2 + rng() * 1.6, 0.2 + rng() * 1.6, 0);
        ctx.fillStyle = rng() < 0.5 ? '#e8909d' : '#ecc35e';
        ctx.beginPath(); ctx.arc(sx, sy - 1, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      // central tree
      const [tx, ty] = proj(1, 1, 0);
      ctx.fillStyle = '#7d5a3e';
      ctx.fillRect(tx - 2, ty - 14, 4, 14);
      for (const [ox, oy, r, c] of [[1, -20, 11, '#47763a'], [-2, -23, 9, '#639a48'], [-4, -26, 6, '#84b95c']]) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(tx + ox, ty + oy, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      // bench
      const [bx, by] = proj(0.45, 1.5, 0);
      ctx.fillStyle = '#a8784f';
      ctx.fillRect(bx - 6, by - 5, 12, 3);
      ctx.fillRect(bx - 6, by - 2, 2, 3);
      ctx.fillRect(bx + 4, by - 2, 2, 3);
    }],
  ],
});

// ------------------------------------------------------------- TOWN era
const townhouse = (id, name, wall, roof) => add({
  id, name, era: 'town', fw: 1, fd: 1, height: 76, inset: 0.08,
  cost: 300, housing: 16, kind: 'res',
  ops: [
    ['box', 0.08, 0.08, 0.84, 0.84, 0, 46, wall],
    ['gable', 0.02, 0.02, 0.96, 0.96, 46, 12, roof, 'x', wall],
    ['door', 'sw', 0.25, 0, { h: 12 }],
    ['winGrid', 'sw', 2, 2, 16, 15, { w: 6, h: 7 }],
    ['winGrid', 'se', 2, 3, 5, 15, { w: 6, h: 7 }],
    ['chimney', 0.8, 0.25, 56, 8],
  ],
});
townhouse('townhouse_a', 'Townhouse', 'brick', 'roofSlate');
townhouse('townhouse_b', 'Corner Townhouse', 'plaster', 'roofTeal');

add({
  id: 'store', name: 'General Store', era: 'town', fw: 1, fd: 1, height: 62,
  inset: 0.08, cost: 350, jobs: 8, kind: 'com',
  ops: [
    ['box', 0.08, 0.08, 0.84, 0.84, 0, 34, 'brick'],
    ['box', 0.04, 0.04, 0.92, 0.92, 34, 4, 'stone'], // flat parapet roof
    ['awning', 'sw', 0.1, 0.9, 18, 3, 8, 'roofTeal', 'plaster'],
    ['door', 'sw', 0.5, 0, { h: 12 }],
    ['win', 'sw', 2, 2, { us: [0.18, 0.82], w: 9, h: 9 }],
    ['winGrid', 'se', 2, 1, 22, 0, { w: 6, h: 7 }],
  ],
});

add({
  id: 'workshop', name: 'Workshop', era: 'town', fw: 1, fd: 1, height: 58,
  inset: 0.08, cost: 400, jobs: 10, kind: 'ind',
  ops: [
    ['box', 0.08, 0.08, 0.84, 0.84, 0, 28, 'woodDark'],
    ['gable', 0.02, 0.02, 0.96, 0.96, 28, 10, 'stone', 'y', 'woodDark'],
    ['door', 'sw', 0.4, 0, { w: 11, h: 14, m: 'woodDark' }],
    ['win', 'se', 2, 14, { us: [0.3, 0.7], w: 6, h: 6 }],
    ['chimney', 0.25, 0.25, 40, 14, 'brick'],
  ],
});

add({
  id: 'school', name: 'Schoolhouse', era: 'town', fw: 2, fd: 1, height: 70,
  inset: 0.1, cost: 500, aura: 7, upkeep: 5, kind: 'civic',
  ops: [
    ['box', 0.1, 0.12, 1.8, 0.76, 0, 30, 'brick'],
    ['gable', 0.04, 0.04, 1.92, 0.92, 30, 14, 'roofTeal', 'x', 'brick'],
    ['box', 0.85, 0.3, 0.3, 0.3, 44, 10, 'plaster'],     // bell cupola
    ['pyramid', 0.8, 0.25, 0.4, 0.4, 54, 9, 'roofTeal'],
    ['door', 'sw', 0.5, 0, { h: 13 }],
    ['winGrid', 'sw', 4, 1, 14, 0, { w: 6, h: 8 }],
    ['win', 'se', 1, 14, { us: [0.5], w: 6, h: 8 }],
  ],
});

add({
  id: 'plaza', name: 'Plaza', era: 'town', fw: 1, fd: 1, height: 14,
  emissive: false, cost: 100, aura: 4, kind: 'park', flat: true,
  ops: [
    ['floor', 0.03, 0.03, 0.94, 0.94, 'stone', 1],
    ['paint', (ctx, proj) => {
      const [cx, cy] = proj(0.5, 0.5, 0);
      ctx.strokeStyle = 'rgba(74,53,80,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, 14, 7, 0, 0, Math.PI * 2); ctx.stroke();
      for (const [px, py] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) {
        const [sx, sy] = proj(px, py, 0);
        ctx.fillStyle = '#8a6a42';
        ctx.fillRect(sx - 2, sy - 5, 4, 5); // planter
        ctx.fillStyle = '#79a84f';
        ctx.beginPath(); ctx.arc(sx, sy - 7, 3.4, 0, Math.PI * 2); ctx.fill();
      }
    }],
  ],
});

add({
  id: 'town_hall', name: 'Town Hall', era: 'town', fw: 2, fd: 2, height: 96,
  inset: 0.08, cost: 800, aura: 12, upkeep: 6, kind: 'landmark', unique: true,
  ops: [
    ['box', 0.08, 0.08, 1.84, 1.84, 0, 38, 'plaster'],
    ['gable', 0.02, 0.02, 1.96, 1.96, 38, 16, 'roofSlate', 'x', 'plaster'],
    ['box', 0.75, 0.75, 0.5, 0.5, 54, 18, 'plaster'],     // clock cupola
    ['pyramid', 0.68, 0.68, 0.64, 0.64, 72, 14, 'roofTeal'],
    ['paint', (ctx, proj) => {                            // clock face
      const [sx, sy] = proj(1.27, 1.27, 63);
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath(); ctx.arc(sx, sy, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a3147'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 2, sy + 1); ctx.stroke();
    }],
    ['door', 'sw', 0.5, 0, { h: 15, w: 9 }],
    ['winGrid', 'sw', 4, 2, 12, 14, { w: 6, h: 8 }],
    ['winGrid', 'se', 4, 2, 12, 14, { w: 6, h: 8 }],
  ],
});

// ------------------------------------------------------------- CITY era
const apartment = (id, name, wall, accent) => add({
  id, name, era: 'city', fw: 1, fd: 1, height: 102, inset: 0.06,
  cost: 600, housing: 36, kind: 'res',
  ops: [
    ['box', 0.06, 0.06, 0.88, 0.88, 0, 70, wall],
    ['box', 0.02, 0.02, 0.96, 0.96, 70, 5, accent],   // cornice
    ['box', 0.3, 0.3, 0.4, 0.4, 75, 7, wall],         // roof access
    ['door', 'sw', 0.25, 0, { h: 13 }],
    ['winGrid', 'sw', 3, 4, 17, 14, { w: 5.4, h: 6.6 }],
    ['winGrid', 'se', 3, 4, 17, 14, { w: 5.4, h: 6.6 }],
  ],
});
apartment('apartment_a', 'Apartments', 'brick', 'stone');
apartment('apartment_b', 'Court Apartments', 'plaster', 'roofTeal');

add({
  id: 'office', name: 'Office Block', era: 'city', fw: 1, fd: 1, height: 96,
  inset: 0.06, cost: 800, jobs: 24, kind: 'com',
  ops: [
    ['box', 0.06, 0.06, 0.88, 0.88, 0, 64, 'stone'],
    ['box', 0.02, 0.02, 0.96, 0.96, 64, 5, 'roofSlate'],
    ['door', 'sw', 0.5, 0, { h: 13, w: 9 }],
    ['winGrid', 'sw', 3, 3, 18, 15, { w: 7, h: 9 }],
    ['winGrid', 'se', 3, 3, 18, 15, { w: 7, h: 9 }],
  ],
});

add({
  id: 'fountain', name: 'Fountain Park', era: 'city', fw: 2, fd: 2, height: 40,
  emissive: false, cost: 400, aura: 10, upkeep: 2, kind: 'park', flat: true,
  ops: [
    ['floor', 0.05, 0.05, 1.9, 1.9, 'meadow', 1],
    ['floor', 0.6, 0.6, 0.8, 0.8, 'stone', 2],
    ['cyl', 1, 1, 0.3, 0, 5, 'stone'],
    ['paint', (ctx, proj) => {
      const [sx, sy] = proj(1, 1, 5);
      ctx.fillStyle = '#8fd4d0';
      ctx.beginPath(); ctx.ellipse(sx, sy, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#bfe8e2';
      ctx.beginPath(); ctx.ellipse(sx, sy - 8, 2.4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx, sy - 1, 5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }],
  ],
});

add({
  id: 'clock_tower', name: 'Clock Tower', era: 'city', fw: 1, fd: 1, height: 130,
  inset: 0.2, cost: 1500, aura: 14, upkeep: 6, kind: 'landmark', unique: true,
  ops: [
    ['box', 0.2, 0.2, 0.6, 0.6, 0, 88, 'brick'],
    ['box', 0.14, 0.14, 0.72, 0.72, 88, 10, 'stone'],
    ['pyramid', 0.16, 0.16, 0.68, 0.68, 98, 22, 'roofTeal'],
    ['paint', (ctx, proj) => {
      const [sx, sy] = proj(0.62, 0.62, 76);
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a3147'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 4.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 3, sy + 1.4); ctx.stroke();
    }],
    ['door', 'sw', 0.5, 0, { h: 12 }],
    ['winGrid', 'sw', 1, 3, 20, 20, { w: 5, h: 7 }],
  ],
});

add({
  id: 'museum', name: 'Museum', era: 'city', fw: 2, fd: 2, height: 86,
  inset: 0.08, cost: 2500, aura: 16, upkeep: 10, kind: 'landmark', unique: true,
  ops: [
    ['box', 0.08, 0.08, 1.84, 1.84, 0, 34, 'stone'],
    ['gable', 0.04, 0.3, 1.92, 1.4, 34, 14, 'stone', 'x', 'stone'],
    ['paint', (ctx, proj) => { // colonnade on the sw face
      for (let i = 0; i < 5; i++) {
        const [sx, sy] = proj(0.25 + i * 0.38, 1.92, 0);
        ctx.fillStyle = '#cfc9dd';
        ctx.fillRect(sx - 1.6, sy - 30, 3.2, 30);
        ctx.fillStyle = '#8d87a0';
        ctx.fillRect(sx + 0.6, sy - 30, 1, 30);
      }
    }],
    ['door', 'se', 0.5, 0, { h: 14, w: 9 }],
    ['winGrid', 'se', 3, 1, 16, 0, { w: 6, h: 9 }],
  ],
});

// ------------------------------------------------------------- METROPOLIS era
const resTower = (id, name, wall, accent) => add({
  id, name, era: 'metropolis', fw: 1, fd: 1, height: 150, inset: 0.05,
  cost: 1200, housing: 90, kind: 'res',
  ops: [
    ['box', 0.05, 0.05, 0.9, 0.9, 0, 92, wall],
    ['box', 0.12, 0.12, 0.76, 0.76, 92, 26, wall],     // setback
    ['box', 0.08, 0.08, 0.84, 0.84, 92, 4, accent],
    ['box', 0.3, 0.3, 0.4, 0.4, 118, 6, accent],
    ['door', 'sw', 0.3, 0, { h: 13 }],
    ['winGrid', 'sw', 3, 6, 14, 13, { w: 5, h: 6 }],
    ['winGrid', 'se', 3, 6, 14, 13, { w: 5, h: 6 }],
    ['winGrid', 'sw', 2, 2, 96, 11, { w: 5, h: 6, inset: 0.12 }],
  ],
});
resTower('tower_a', 'Residence Tower', 'brick', 'stone');
resTower('tower_b', 'Skyline Tower', 'plaster', 'roofTeal');

add({
  id: 'officetower', name: 'Office Tower', era: 'metropolis', fw: 1, fd: 1,
  height: 170, inset: 0.05, cost: 1600, jobs: 60, kind: 'com',
  ops: [
    ['box', 0.05, 0.05, 0.9, 0.9, 0, 124, 'roofSlate'],
    ['box', 0.02, 0.02, 0.96, 0.96, 124, 5, 'stone'],
    ['box', 0.42, 0.42, 0.16, 0.16, 129, 14, 'stone'], // antenna base
    ['door', 'sw', 0.5, 0, { h: 14, w: 9 }],
    ['winGrid', 'sw', 3, 8, 14, 13.5, { w: 6.4, h: 8 }],
    ['winGrid', 'se', 3, 8, 14, 13.5, { w: 6.4, h: 8 }],
  ],
});

add({
  id: 'boutique', name: 'Boutique Row', era: 'metropolis', fw: 1, fd: 1, height: 70,
  inset: 0.07, cost: 500, jobs: 6, kind: 'com',
  ops: [
    ['box', 0.07, 0.07, 0.86, 0.86, 0, 40, 'plaster'],
    ['box', 0.03, 0.03, 0.94, 0.94, 40, 4, 'bloomPink'],
    ['awning', 'sw', 0.08, 0.92, 17, 3, 8, 'bloomPink', 'plaster'],
    ['door', 'sw', 0.5, 0, { h: 12 }],
    ['win', 'sw', 2, 2, { us: [0.18, 0.82], w: 9, h: 10 }],
    ['winGrid', 'se', 2, 2, 8, 16, { w: 6, h: 7 }],
  ],
});

add({
  id: 'stadium', name: 'Stadium', era: 'metropolis', fw: 3, fd: 3, height: 80,
  emissive: false, cost: 6000, aura: 20, upkeep: 25, kind: 'landmark', unique: true,
  ops: [
    ['cyl', 1.5, 1.5, 1.25, 0, 26, 'stone'],
    ['paint', (ctx, proj) => {
      const [sx, sy] = proj(1.5, 1.5, 26);
      const rx = 1.05 * 32 * Math.SQRT2, ry = 1.05 * 16 * Math.SQRT2;
      // bowl interior
      ctx.fillStyle = '#6f6a85';
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#84b95c';
      ctx.beginPath(); ctx.ellipse(sx, sy + 1, rx * 0.66, ry * 0.66, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f6eedd'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(sx, sy + 1, rx * 0.4, ry * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - rx * 0.66, sy + 1); ctx.lineTo(sx + rx * 0.66, sy + 1); ctx.stroke();
      // floodlight posts
      for (const [px, py] of [[0.35, 0.35], [2.65, 0.35], [0.35, 2.65], [2.65, 2.65]]) {
        const [lx, ly] = proj(px, py, 0);
        ctx.strokeStyle = '#4a4458'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 44); ctx.stroke();
        ctx.fillStyle = '#fff3d6';
        ctx.fillRect(lx - 4, ly - 50, 8, 5);
      }
    }],
  ],
});

add({
  id: 'cathedral', name: 'Cathedral', era: 'metropolis', fw: 2, fd: 3, height: 150,
  inset: 0.1, cost: 5000, aura: 18, upkeep: 15, kind: 'landmark', unique: true,
  ops: [
    ['box', 0.1, 0.1, 1.8, 2.8, 0, 44, 'stone'],
    ['gable', 0.04, 0.04, 1.92, 2.92, 44, 22, 'roofSlate', 'y', 'stone'],
    ['box', 0.25, 2.2, 0.55, 0.55, 0, 92, 'stone'],     // bell tower
    ['pyramid', 0.18, 2.13, 0.69, 0.69, 92, 26, 'roofSlate'],
    ['box', 1.2, 2.2, 0.55, 0.55, 0, 92, 'stone'],      // second tower
    ['pyramid', 1.13, 2.13, 0.69, 0.69, 92, 26, 'roofSlate'],
    ['paint', (ctx, proj) => {                          // rose window
      const [sx, sy] = proj(1, 2.92, 28);
      ctx.fillStyle = '#7d6ba8';
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.stroke();
    }],
    ['door', 'sw', 0.5, 0, { h: 18, w: 10 }],
    ['winGrid', 'sw', 3, 1, 18, 0, { w: 5, h: 14 }],
    ['winGrid', 'se', 2, 1, 14, 0, { w: 5, h: 12 }],
  ],
});

add({
  id: 'spire', name: 'Observation Spire', era: 'metropolis', fw: 1, fd: 1,
  height: 210, inset: 0.18, cost: 8000, aura: 22, upkeep: 20, kind: 'landmark', unique: true,
  ops: [
    ['box', 0.18, 0.18, 0.64, 0.64, 0, 70, 'stone'],
    ['box', 0.26, 0.26, 0.48, 0.48, 70, 56, 'plaster'],
    ['box', 0.14, 0.14, 0.72, 0.72, 126, 16, 'roofTeal'],  // observation deck
    ['box', 0.38, 0.38, 0.24, 0.24, 142, 22, 'stone'],
    ['pyramid', 0.4, 0.4, 0.2, 0.2, 164, 26, 'roofTeal'],
    ['winGrid', 'sw', 2, 3, 16, 17, { w: 5, h: 6 }],
    ['winGrid', 'se', 2, 3, 16, 17, { w: 5, h: 6 }],
    ['win', 'sw', 3, 130, { us: [0.25, 0.5, 0.75], w: 6, h: 8, inset: 0.14 }],
    ['win', 'se', 3, 130, { us: [0.25, 0.5, 0.75], w: 6, h: 8, inset: 0.14 }],
    ['door', 'sw', 0.5, 0, { h: 13 }],
  ],
});
})();
