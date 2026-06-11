// Iso shape grammar: interprets building recipes (js/data/buildings.js) into
// sprites. Tile-space: recipe coords run 0..fw / 0..fd across the footprint,
// z in screen px upward. Light is always upper-left: top faces lightest, the
// SW (left) wall mid, the SE (right) wall dark.
(() => {
const G = globalThis.G ??= {};
const S = G.Shape = {};
const HW = 32, HH = 16;

// tile-space (tx,ty,z) -> sprite-local screen px (before canvas offset)
const proj = S.proj = (tx, ty, z = 0) => [(tx - ty) * HW, (tx + ty) * HH - z];

const mat = (name) => {
  const m = G.C.PAL[name];
  if (!m || !Array.isArray(m)) throw new Error(`unknown material ${name}`);
  return m;
};

// shade index per face normal; top=1, sw(left)=2, se(right)=3, nw=1, ne=2
const FACE_SHADE = { top: 1, sw: 2, se: 3, nw: 1, ne: 2 };

function poly(ctx, pts, fill, outline) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Build context passed to ops: {ctx, ectx (emissive), r (recipe)}
const ops = S.ops = {};

// extruded box: walls + flat top
ops.box = (b, x0, y0, w, d, z0, h, m, opt = {}) => {
  const P = mat(m);
  const x1 = x0 + w, y1 = y0 + d;
  const N = proj(x0, y0, z0), E = proj(x1, y0, z0), Sc = proj(x1, y1, z0), W = proj(x0, y1, z0);
  const Nt = proj(x0, y0, z0 + h), Et = proj(x1, y0, z0 + h),
        St = proj(x1, y1, z0 + h), Wt = proj(x0, y1, z0 + h);
  const line = G.C.withAlpha(P[4], 0.45);
  if (h > 0) {
    poly(b.ctx, [W, Sc, St, Wt], P[FACE_SHADE.sw], line);   // left (SW) wall
    poly(b.ctx, [Sc, E, Et, St], P[FACE_SHADE.se], line);   // right (SE) wall
  }
  poly(b.ctx, [Nt, Et, St, Wt], P[opt.topShade ?? FACE_SHADE.top], line); // top
};

// flat diamond patch on the ground (fields, plazas)
ops.floor = (b, x0, y0, w, d, m, shade = 2) => {
  const P = mat(m);
  poly(b.ctx, [proj(x0, y0), proj(x0 + w, y0), proj(x0 + w, y0 + d), proj(x0, y0 + d)],
    P[shade], G.C.withAlpha(P[4], 0.3));
};

// gable roof: ridge along 'x' or 'y', eaves at z0, ridge at z0+h.
// Gable end triangles filled with endMat (wall material) unless 'roof'.
ops.gable = (b, x0, y0, w, d, z0, h, m, axis = 'x', endMat = null) => {
  const P = mat(m);
  const x1 = x0 + w, y1 = y0 + d;
  const line = G.C.withAlpha(P[4], 0.5);
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    const R1 = proj(x0, ym, z0 + h), R2 = proj(x1, ym, z0 + h);
    poly(b.ctx, [proj(x0, y0, z0), proj(x1, y0, z0), R2, R1], P[FACE_SHADE.ne], line); // back slope
    poly(b.ctx, [proj(x0, y1, z0), proj(x1, y1, z0), R2, R1], P[FACE_SHADE.sw], line); // front slope
    const EP = endMat ? mat(endMat) : P;
    poly(b.ctx, [proj(x1, y0, z0), proj(x1, y1, z0), R2], EP[FACE_SHADE.se],
      G.C.withAlpha(EP[4], 0.4)); // visible gable end (SE side)
    // ridge highlight
    b.ctx.strokeStyle = G.C.withAlpha(P[0], 0.85);
    b.ctx.lineWidth = 1.4;
    b.ctx.beginPath(); b.ctx.moveTo(R1[0], R1[1]); b.ctx.lineTo(R2[0], R2[1]); b.ctx.stroke();
  } else {
    const xm = (x0 + x1) / 2;
    const R1 = proj(xm, y0, z0 + h), R2 = proj(xm, y1, z0 + h);
    poly(b.ctx, [proj(x0, y0, z0), proj(x0, y1, z0), R2, R1], P[FACE_SHADE.nw], line);
    poly(b.ctx, [proj(x1, y0, z0), proj(x1, y1, z0), R2, R1], P[FACE_SHADE.se], line);
    const EP = endMat ? mat(endMat) : P;
    poly(b.ctx, [proj(x0, y1, z0), proj(x1, y1, z0), R2], EP[FACE_SHADE.sw],
      G.C.withAlpha(EP[4], 0.4)); // visible gable end (SW side)
    b.ctx.strokeStyle = G.C.withAlpha(P[0], 0.85);
    b.ctx.lineWidth = 1.4;
    b.ctx.beginPath(); b.ctx.moveTo(R1[0], R1[1]); b.ctx.lineTo(R2[0], R2[1]); b.ctx.stroke();
  }
};

// face helpers: a wall face is addressed 'sw' (W->S along +x) or 'se' (S->E along -y).
// Returns {at(u,z): px point, along: unit step vec per tile, len: tiles}
function face(r, which, inset = 0) {
  const fw = r.fw, fd = r.fd;
  if (which === 'sw') {
    const A = [0 + inset, fd - inset], B = [fw - inset, fd - inset];
    return { A, B, len: fw };
  }
  // 'se'
  const A = [fw - inset, fd - inset], B = [fw - inset, 0 + inset];
  return { A, B, len: fd };
}
function facePoint(f, u, z) {
  const tx = f.A[0] + (f.B[0] - f.A[0]) * u;
  const ty = f.A[1] + (f.B[1] - f.A[1]) * u;
  return proj(tx, ty, z);
}
function faceDir(f) {
  const a = facePoint(f, 0, 0), b = facePoint(f, 1, 0);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  return [dx / L, dy / L];
}

// quad following a wall face at parameter u, half-width hw px, base z, height h
function wallQuad(b, f, u, z, hwPx, hPx) {
  const [cx, cy] = facePoint(f, u, z);
  const [dx, dy] = faceDir(f);
  return [
    [cx - dx * hwPx, cy - dy * hwPx],
    [cx + dx * hwPx, cy + dy * hwPx],
    [cx + dx * hwPx, cy + dy * hwPx - hPx],
    [cx - dx * hwPx, cy - dy * hwPx - hPx],
  ];
}

// windows: n of them spread along a face; records emissive glass for night
ops.win = (b, which, n, z, opt = {}) => {
  const f = face(b.r, which, opt.inset ?? b.r.inset ?? 0.12);
  const wpx = opt.w ?? 5, hpx = opt.h ?? 7;
  const frame = mat(opt.frame ?? 'woodDark');
  for (let i = 0; i < n; i++) {
    const u = opt.us ? opt.us[i] : (i + 1) / (n + 1);
    const q = wallQuad(b, f, u, z, wpx / 2 + 1.4, hpx + 2.4);
    poly(b.ctx, q, frame[3]);
    const g = wallQuad(b, f, u, z + 1.2, wpx / 2, hpx);
    poly(b.ctx, g, which === 'sw' ? '#b9d7e0' : '#9cc0cf');
    // glint
    b.ctx.strokeStyle = G.C.withAlpha('#ffffff', 0.55);
    b.ctx.lineWidth = 1;
    b.ctx.beginPath();
    b.ctx.moveTo(g[0][0] + 1, g[3][1] + 2);
    b.ctx.lineTo(g[1][0] - 1, g[2][1] + hpx - 2);
    b.ctx.stroke();
    if (b.ectx) poly(b.ectx, g, G.C.PAL.glowWindow[1]);
  }
};

// grid of windows on a face: rows stacked from z0 upward, cols spread along u
ops.winGrid = (b, which, cols, rows, z0, zStep, opt = {}) => {
  const us = [];
  for (let i = 0; i < cols; i++) us.push((i + 1) / (cols + 1));
  for (let r = 0; r < rows; r++) {
    ops.win(b, which, cols, z0 + r * zStep, { ...opt, us });
  }
};

// pyramid roof to an apex above the rect center (clock towers, spires)
ops.pyramid = (b, x0, y0, w, d, z0, h, m) => {
  const P = mat(m);
  const x1 = x0 + w, y1 = y0 + d;
  const A = proj((x0 + x1) / 2, (y0 + y1) / 2, z0 + h);
  const line = G.C.withAlpha(P[4], 0.5);
  poly(b.ctx, [proj(x0, y0, z0), proj(x1, y0, z0), A], P[FACE_SHADE.ne], line); // back-right
  poly(b.ctx, [proj(x0, y0, z0), proj(x0, y1, z0), A], P[FACE_SHADE.nw], line); // back-left
  poly(b.ctx, [proj(x0, y1, z0), proj(x1, y1, z0), A], P[FACE_SHADE.sw], line); // front-left
  poly(b.ctx, [proj(x1, y0, z0), proj(x1, y1, z0), A], P[FACE_SHADE.se], line); // front-right
};

ops.door = (b, which, u, z = 0, opt = {}) => {
  const f = face(b.r, which, opt.inset ?? b.r.inset ?? 0.12);
  const wpx = opt.w ?? 7, hpx = opt.h ?? 11;
  const wood = mat(opt.m ?? 'wood');
  const q = wallQuad(b, f, u, z, wpx / 2 + 1.2, hpx + 1.6);
  poly(b.ctx, q, mat('woodDark')[4]);
  const d = wallQuad(b, f, u, z, wpx / 2, hpx);
  poly(b.ctx, d, wood[which === 'sw' ? 2 : 3]);
  // knob
  b.ctx.fillStyle = G.C.PAL.uiAccent;
  const [kx, ky] = facePoint(f, u, z + hpx * 0.45);
  b.ctx.beginPath();
  b.ctx.arc(kx + (which === 'sw' ? 2 : -2), ky, 0.9, 0, Math.PI * 2);
  b.ctx.fill();
  if (b.ectx) { // doors leak a little warm light at night
    poly(b.ectx, wallQuad(b, f, u, z + 1, wpx / 2 - 1, hpx - 2), G.C.withAlpha(G.C.PAL.glowWindow[2], 0.5));
  }
};

ops.chimney = (b, x, y, z, h = 8, m = 'brick') => {
  ops.box(b, x - 0.07, y - 0.07, 0.14, 0.14, z, h, m);
  const [sx, sy] = proj(x, y, z + h);
  b.ctx.fillStyle = mat(m)[4];
  b.ctx.beginPath();
  b.ctx.ellipse(sx, sy, 3.4, 1.7, 0, 0, Math.PI * 2);
  b.ctx.fill();
};

// iso cylinder (wells, silos): circle r in tile units centered (cx,cy)
ops.cyl = (b, cx, cy, r, z0, h, m) => {
  const P = mat(m);
  const rx = r * HW * Math.SQRT2, ry = r * HH * Math.SQRT2;
  const [sx, sy0] = proj(cx, cy, z0);
  const syT = sy0 - h;
  b.ctx.fillStyle = P[3];
  b.ctx.beginPath();
  b.ctx.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI);
  b.ctx.lineTo(sx - rx, syT);
  b.ctx.ellipse(sx, syT, rx, ry, 0, Math.PI, 0, true);
  b.ctx.closePath();
  b.ctx.fill();
  // lit left strip
  b.ctx.fillStyle = G.C.withAlpha(P[1], 0.55);
  b.ctx.fillRect(sx - rx * 0.85, syT, rx * 0.5, h);
  b.ctx.fillStyle = P[1];
  b.ctx.beginPath();
  b.ctx.ellipse(sx, syT, rx, ry, 0, 0, Math.PI * 2);
  b.ctx.fill();
};

// striped awning sloping off a wall face
ops.awning = (b, which, u0, u1, z, drop, out, m1, m2) => {
  const f = face(b.r, which, b.r.inset ?? 0.12);
  const A = facePoint(f, u0, z), B = facePoint(f, u1, z);
  // outward normal (screen-space): sw face juts toward lower-left, se toward lower-right
  const nx = which === 'sw' ? -out : out, ny = out * 0.55;
  const A2 = [A[0] + nx, A[1] + ny + drop], B2 = [B[0] + nx, B[1] + ny + drop];
  const P1 = mat(m1), P2 = mat(m2);
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const t0 = i / stripes, t1 = (i + 1) / stripes;
    const p = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    const p2 = (t) => [A2[0] + (B2[0] - A2[0]) * t, A2[1] + (B2[1] - A2[1]) * t];
    poly(b.ctx, [p(t0), p(t1), p2(t1), p2(t0)], (i % 2 ? P2 : P1)[2]);
  }
  b.ctx.strokeStyle = G.C.withAlpha(P1[4], 0.5);
  b.ctx.lineWidth = 1;
  b.ctx.beginPath(); b.ctx.moveTo(A2[0], A2[1]); b.ctx.lineTo(B2[0], B2[1]); b.ctx.stroke();
};

// arbitrary painter escape hatch: fn(ctx, proj, b)
ops.paint = (b, fn) => fn(b.ctx, proj, b);

// ---------------------------------------------------------------- build
// Renders a recipe to {cv, ecv, ax, ay, scale}. Canvas origin: tile-space
// (0,0) at (ax,ay). Sprites are baked at 2x for crisp high zoom.
S.build = (recipe, scale = 2) => {
  const fw = recipe.fw, fd = recipe.fd, H = recipe.height ?? 48;
  const pad = 6;
  const wpx = (fw + fd) * HW + pad * 2;
  const hpx = (fw + fd) * HH + H + pad * 2;
  const ax = fd * HW + pad, ay = H + pad;
  const mk = () => {
    const cv = S.canvasFactory ? S.canvasFactory() : document.createElement('canvas');
    cv.width = Math.ceil(wpx * scale);
    cv.height = Math.ceil(hpx * scale);
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, ax * scale, ay * scale);
    ctx.lineJoin = 'round';
    return [cv, ctx];
  };
  const [cv, ctx] = mk();
  let ecv = null, ectx = null;
  if (recipe.emissive !== false) {
    [ecv, ectx] = mk();
  }
  const b = { ctx, ectx, r: recipe };
  for (const op of recipe.ops) {
    const [name, ...args] = op;
    if (!ops[name]) throw new Error(`unknown op ${name} in ${recipe.id}`);
    ops[name](b, ...args);
  }
  return { cv, ecv, ax, ay, scale };
};

// validate a recipe without a canvas (used by tools/check.js under Node)
S.lint = (recipe) => {
  if (!recipe.id) throw new Error('recipe missing id');
  if (!(recipe.fw >= 1 && recipe.fd >= 1)) throw new Error(`${recipe.id}: bad footprint`);
  for (const op of recipe.ops) {
    if (!ops[op[0]]) throw new Error(`${recipe.id}: unknown op ${op[0]}`);
  }
};
})();
