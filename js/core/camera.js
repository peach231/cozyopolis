// Camera: position in world-pixels (center of view), stepped zoom with smooth
// animation, cursor-anchored wheel zoom, bounds clamped to the map diamond.
(() => {
const G = globalThis.G ??= {};
const M = G.M, ISO = G.ISO;

const ZOOMS = [0.5, 0.75, 1, 1.5, 2];

const cam = G.cam = {
  x: 0, y: 0,
  zoom: 1,
  zoomIndex: 2,
  zoomTarget: 1,
  viewW: 1280, viewH: 720, // CSS pixels, set by resize
};

cam.setViewport = (w, h) => { cam.viewW = w; cam.viewH = h; };

// world-pixel -> canvas CSS pixel
cam.toView = (sx, sy) => [
  (sx - cam.x) * cam.zoom + cam.viewW / 2,
  (sy - cam.y) * cam.zoom + cam.viewH / 2,
];
// canvas CSS pixel -> world-pixel
cam.toWorldPx = (vx, vy) => [
  (vx - cam.viewW / 2) / cam.zoom + cam.x,
  (vy - cam.viewH / 2) / cam.zoom + cam.y,
];

// visible world-pixel rect (with margin in world px for sprite overhang)
cam.viewRect = (margin = 0) => {
  const hw = cam.viewW / 2 / cam.zoom, hh = cam.viewH / 2 / cam.zoom;
  return {
    x0: cam.x - hw - margin, y0: cam.y - hh - margin,
    x1: cam.x + hw + margin, y1: cam.y + hh + margin,
  };
};

cam.zoomStep = (dir, anchorVx, anchorVy) => {
  const ni = M.clamp(cam.zoomIndex + dir, 0, ZOOMS.length - 1);
  if (ni === cam.zoomIndex) return;
  // keep the world point under the cursor fixed while zoom animates toward target
  const ax = anchorVx ?? cam.viewW / 2, ay = anchorVy ?? cam.viewH / 2;
  const [wx, wy] = cam.toWorldPx(ax, ay);
  cam.zoomIndex = ni;
  cam.zoomTarget = ZOOMS[ni];
  cam._anchor = { wx, wy, vx: ax, vy: ay };
};

cam.update = (dt) => {
  if (Math.abs(cam.zoom - cam.zoomTarget) > 0.0005) {
    cam.zoom = M.lerp(cam.zoom, cam.zoomTarget, Math.min(1, dt * 14));
    if (Math.abs(cam.zoom - cam.zoomTarget) <= 0.0005) cam.zoom = cam.zoomTarget;
    if (cam._anchor) {
      // re-solve cam position so the anchored world point stays under the cursor
      const a = cam._anchor;
      cam.x = a.wx - (a.vx - cam.viewW / 2) / cam.zoom;
      cam.y = a.wy - (a.vy - cam.viewH / 2) / cam.zoom;
    }
  } else if (cam._anchor) {
    cam._anchor = null;
  }
  cam.clampToMap();
};

cam.clampToMap = () => {
  if (!G.grid) return;
  const n = G.grid.size;
  // map diamond extents in world px (centers; allow half-screen of slack)
  const xMax = n * ISO.HALF_W, yMax = n * ISO.HALF_H;
  cam.x = M.clamp(cam.x, -xMax, xMax);
  cam.y = M.clamp(cam.y, -ISO.TILE_H * 4, yMax * 2 + ISO.TILE_H * 4);
};

cam.centerOnTile = (tx, ty) => {
  const [sx, sy] = ISO.toScreen(tx, ty);
  cam.x = sx; cam.y = sy;
};
})();
