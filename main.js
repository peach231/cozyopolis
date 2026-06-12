// Boot, scenes (title/game), fixed-timestep loop, input. Hash modes for dev:
//   #seed=N world seed     #t=HOUR force clock     #ff=N fast-forward N steps
//   #zoom=Z                #debug fps overlay      #gallery sprite catalog
//   #hamlet / #town / #grow demo settlements (skip title, no autosave)
(() => {
const G = globalThis.G ??= {};

const LOGIC_DT = 1 / 60;
const MAP_SIZE = 128;

G.city = { name: 'Cozyopolis', pop: 0, funds: 5000, eraIndex: 0, happiness: 0.6 };
G.debug = { fps: 0 };
G.hooks = G.hooks ?? {};
G.scene = 'title';

function parseHash() {
  const h = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    h[k] = v === undefined ? true : v;
  }
  return h;
}

// one fixed logic step — all simulation systems tick here
function logicStep() {
  G.time.tick(LOGIC_DT);
  G.Weather.tick(LOGIC_DT);
  G.Growth.tick(LOGIC_DT);
  G.Agents.tick(LOGIC_DT);
  G.Traffic.tick(LOGIC_DT);
  G.Events.tick(LOGIC_DT);
}

function boot() {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  G.hash = parseHash();
  G.view = { w: 0, h: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    G.view.w = window.innerWidth;
    G.view.h = window.innerHeight;
    G.view.dpr = dpr;
    cv.width = Math.round(G.view.w * dpr);
    cv.height = Math.round(G.view.h * dpr);
    G.cam.setViewport(G.view.w, G.view.h);
  }
  window.addEventListener('resize', resize);
  resize();

  const seed = G.hash.seed ? (+G.hash.seed >>> 0) : ((Math.random() * 1e9) >>> 0);
  G.grid.init(MAP_SIZE, seed);
  G.cam.centerOnTile(MAP_SIZE / 2, MAP_SIZE / 2);

  const devMode = G.hash.hamlet || G.hash.town || G.hash.grow || G.hash.autoplay ||
    G.hash.ff || G.hash.t !== undefined || G.hash.debug || G.hash.gallery !== undefined;

  if (G.hash.hamlet) G.Demo.hamlet();
  if (G.hash.town) G.Demo.town();
  if (G.hash.grow) G.Demo.grow();
  if (G.hash.zoom) { G.cam.zoomTarget = G.cam.zoom = +G.hash.zoom; }
  if (devMode) {
    G.scene = 'game';
    G.Events.init();
  }
  if (G.hash.autoplay) G.Demo.autoplay(+G.hash.autoplay || 60);
  if (G.hash.t !== undefined) G.time.hour = +G.hash.t % 24;
  if (G.hash.ff) for (let i = 0, n = +G.hash.ff; i < n; i++) logicStep();
  if (G.hash.rain) { G.Weather.kind = 'rain'; G.Weather.t = 0; G.Weather.next = 999; }

  // #gallery: render the building catalog on a flat backdrop and stop
  if (G.hash.gallery !== undefined) {
    const draw = () => {
      ctx.setTransform(G.view.dpr, 0, 0, G.view.dpr, 0, 0);
      ctx.fillStyle = '#5e7a52';
      ctx.fillRect(0, 0, G.view.w, G.view.h);
      const cellW = 210, cellH = 190, cols = Math.max(1, Math.floor(G.view.w / cellW));
      G.Buildings.all.forEach((def, i) => {
        const gx = (i % cols) * cellW + cellW / 2;
        const gy = Math.floor(i / cols) * cellH + 120;
        const spr = G.Render.getStructureSprite({ type: def.id });
        ctx.drawImage(spr.cv, gx - spr.ax, gy - spr.ay,
          spr.cv.width / spr.scale, spr.cv.height / spr.scale);
        ctx.fillStyle = '#f6eedd';
        ctx.font = "600 13px 'Trebuchet MS', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(`${def.name} (${def.fw}×${def.fd})`, gx, gy + 44);
      });
    };
    draw();
    window.addEventListener('resize', () => requestAnimationFrame(draw));
    return;
  }

  // ------------------------------------------------------------- title
  const title = { mode: 'menu', name: '', buttons: [], caret: 0, t: 0, hover: null };
  if (G.scene === 'title') {
    G.Demo.hamlet(); // a cozy hamlet to gaze at behind the menu
    G.cam.zoomTarget = G.cam.zoom = 1.25;
  }

  function startNewGame() {
    const name = title.name.trim() || 'Cozyopolis';
    G.grid.init(MAP_SIZE, (Math.random() * 1e9) >>> 0);
    G.city = { name, pop: 0, funds: 5000, eraIndex: 0, happiness: 0.6 };
    G.time.day = 1; G.time.hour = 8; G.time.paused = false; G.time.speed = 1;
    G.cam.centerOnTile(MAP_SIZE / 2, MAP_SIZE / 2);
    G.cam.zoomIndex = 2; G.cam.zoomTarget = G.cam.zoom = 1;
    G.Events.init();
    G.Save.installAutosave();
    G.scene = 'game';
  }

  function continueGame() {
    if (!G.Save.load()) return;
    G.Events.init();
    G.Events.push(`Welcome back to ${G.city.name}.`);
    G.Save.installAutosave();
    G.scene = 'game';
  }

  function drawTitle(ctx, dtReal) {
    // gentle sway over the hamlet at golden hour
    title.t += dtReal;
    G.time.hour = 17.2;
    const [hx, hy] = G.ISO.toScreen(G.grid.size / 2, G.grid.size / 2);
    G.cam.x = hx + Math.sin(title.t * 0.12) * 90;
    G.cam.y = hy + 40 + Math.cos(title.t * 0.09) * 30;
    G.Render.drawWorld(ctx);

    const view = G.view;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    // vignette + top sky wash for legibility
    const grd = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.28,
      view.w / 2, view.h / 2, view.h);
    grd.addColorStop(0, 'rgba(40,32,56,0)');
    grd.addColorStop(1, 'rgba(40,32,56,0.6)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, view.w, view.h);
    const sky = ctx.createLinearGradient(0, 0, 0, view.h * 0.45);
    sky.addColorStop(0, 'rgba(46,36,64,0.55)');
    sky.addColorStop(1, 'rgba(46,36,64,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h * 0.45);

    const cx = view.w / 2, ty = view.h * 0.27;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // warm halo behind the wordmark
    const halo = ctx.createRadialGradient(cx, ty, 10, cx, ty, 280);
    halo.addColorStop(0, 'rgba(255,207,107,0.32)');
    halo.addColorStop(1, 'rgba(255,207,107,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 300, ty - 130, 600, 240);
    // tiny cottage crest above the wordmark
    {
      const cyT = ty - 66;
      ctx.fillStyle = '#f0e2c4';
      ctx.fillRect(cx - 11, cyT - 2, 22, 13);
      ctx.fillStyle = '#c75b4e';
      ctx.beginPath();
      ctx.moveTo(cx - 15, cyT - 2); ctx.lineTo(cx, cyT - 15); ctx.lineTo(cx + 15, cyT - 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a8784f';
      ctx.fillRect(cx - 2.6, cyT + 4, 5.2, 7);
      ctx.fillStyle = '#ffd98a';
      ctx.fillRect(cx + 4.5, cyT + 1.5, 4, 4);
      ctx.fillStyle = '#b8946a';
      ctx.fillRect(cx + 5.5, cyT - 12, 3.4, 6);
    }
    // wordmark: per-letter bounce, deep shadow, warm gradient fill
    const word = 'Cozyopolis';
    ctx.font = "700 64px 'Trebuchet MS', 'Segoe UI', sans-serif";
    const widths = [...word].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const fillGrad = ctx.createLinearGradient(0, ty - 32, 0, ty + 32);
    fillGrad.addColorStop(0, '#ffe8a8');
    fillGrad.addColorStop(0.55, '#ffcf6b');
    fillGrad.addColorStop(1, '#f2a35c');
    let lx = cx - total / 2;
    [...word].forEach((ch, i) => {
      const bounce = Math.sin(title.t * 1.6 + i * 0.7) * 2.5;
      const chx = lx + widths[i] / 2;
      ctx.fillStyle = 'rgba(42,33,56,0.9)';
      ctx.fillText(ch, chx + 3, ty + bounce + 4);
      ctx.fillStyle = fillGrad;
      ctx.fillText(ch, chx, ty + bounce);
      ctx.strokeStyle = 'rgba(255,243,214,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeText(ch, chx, ty + bounce - 1);
      lx += widths[i];
    });
    ctx.font = "600 17px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = '#f6eedd';
    ctx.fillText('grow a tiny hamlet into a glittering metropolis', cx, ty + 54);

    title.buttons = [];
    const btn = (label, y, id, primary) => {
      const w = 280, h = 52, x = cx - w / 2;
      title.buttons.push({ id, x, y, w, h });
      const hov = title.hover === id;
      const lift = hov ? -2 : 0;
      ctx.fillStyle = 'rgba(30,24,44,0.45)';
      G.Render.roundRect(ctx, x + 2, y + 4, w, h, 14);
      ctx.fill();
      G.Render.roundRect(ctx, x, y + lift, w, h, 14);
      ctx.fillStyle = primary ? (hov ? '#ffdf8e' : '#ffcf6b') : (hov ? '#564a68' : 'rgba(58,49,71,0.92)');
      ctx.fill();
      ctx.strokeStyle = primary ? '#fff3d6' : '#6b5e82';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.font = "700 19px 'Trebuchet MS', sans-serif";
      ctx.fillStyle = primary ? '#3a3147' : '#f6eedd';
      ctx.fillText(label, cx, y + lift + h / 2 + 1);
    };

    if (title.mode === 'menu') {
      btn('New City', view.h * 0.52, 'new', true);
      if (G.Save.has()) btn('Continue', view.h * 0.52 + 68, 'continue', false);
    } else {
      // name entry
      ctx.font = "600 16px 'Trebuchet MS', sans-serif";
      ctx.fillStyle = '#f6eedd';
      ctx.fillText('Name your city', cx, view.h * 0.48);
      const w = 340, h = 50, x = cx - w / 2, y = view.h * 0.51;
      G.Render.roundRect(ctx, x, y, w, h, 12);
      ctx.fillStyle = 'rgba(58,49,71,0.95)';
      ctx.fill();
      ctx.strokeStyle = '#ffcf6b';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      title.caret += dtReal;
      const shown = title.name + ((title.caret % 1) < 0.55 ? '|' : '');
      ctx.font = "700 20px 'Trebuchet MS', sans-serif";
      ctx.fillStyle = '#fff3d6';
      ctx.fillText(shown || ' ', cx, y + h / 2 + 1);
      ctx.font = "600 13px 'Trebuchet MS', sans-serif";
      ctx.fillStyle = '#b9aec9';
      ctx.fillText('press Enter to found your city', cx, y + h + 26);
      btn('Found the City', y + h + 50, 'found', true);
    }
    ctx.font = "600 12px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = 'rgba(185,174,201,0.8)';
    ctx.fillText('a tiny city story · made with canvas & care', cx, view.h - 22);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
  }

  function titleClick(vx, vy) {
    for (const b of title.buttons) {
      if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) {
        G.Audio?.sfxClick?.();
        if (b.id === 'new') { title.mode = 'name'; title.name = ''; }
        else if (b.id === 'continue') continueGame();
        else if (b.id === 'found') startNewGame();
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------- input
  const input = G.input = {
    keys: new Set(),
    mouse: { x: 0, y: 0, panning: false, lastX: 0, lastY: 0, panDist: 0 },
    hoverTile: null,
  };

  const tileUnderMouse = (e) => {
    const [wx, wy] = G.cam.toWorldPx(e.clientX, e.clientY);
    return G.ISO.tileAt(wx, wy);
  };

  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (G.scene === 'game' && (input.mouse.panDist ?? 0) < 5) G.Build.cancel();
  });

  cv.addEventListener('mousedown', (e) => {
    G.Audio?.unlock?.();
    if (G.scene === 'title') {
      if (e.button === 0) titleClick(e.clientX, e.clientY);
      return;
    }
    const m = input.mouse;
    m.lastX = e.clientX; m.lastY = e.clientY;
    if (e.button === 1 || e.button === 2 || (e.button === 0 && input.keys.has(' '))) {
      m.panning = true;
      m.panDist = 0;
      cv.style.cursor = 'grabbing';
    } else if (e.button === 0) {
      const id = G.UI.hitTest(e.clientX, e.clientY);
      if (id) { G.UI.onClick(id, e.clientX, e.clientY); return; }
      const [tx, ty] = tileUnderMouse(e);
      if (G.grid.inBounds(tx, ty) && G.Build.onMouseDown(tx, ty)) return;
      // inspect: nearest agent within reach, else the structure under the tile
      const [wx, wy] = G.cam.toWorldPx(e.clientX, e.clientY);
      let best = null, bestD = 16 * 16;
      const consider = (agent) => {
        const [ax, ay] = G.ISO.toScreen(agent.x, agent.y);
        const d = (ax - wx) * (ax - wx) + (ay - wy - 8) * (ay - wy - 8);
        if (d < bestD) { bestD = d; best = agent; }
      };
      for (const w of G.Agents.walkers) if (!w.hide && w.state === 'walking') consider(w);
      for (const c of G.Traffic.cars) consider(c);
      if (best) {
        G.UI.selected = { kind: best.kind, ref: best };
      } else {
        const s = G.grid.structAt(tx, ty);
        G.UI.selected = (s && s.kind === 'building') ? { kind: 'building', ref: s } : null;
      }
    }
  });
  window.addEventListener('mouseup', (e) => {
    input.mouse.panning = false;
    cv.style.cursor = 'default';
    if (G.scene === 'game' && e.button === 0) {
      const [tx, ty] = tileUnderMouse(e);
      G.Build.onMouseUp(tx, ty);
    }
  });
  window.addEventListener('mousemove', (e) => {
    const m = input.mouse;
    m.x = e.clientX; m.y = e.clientY;
    if (G.scene === 'title') {
      title.hover = null;
      for (const b of title.buttons) {
        if (e.clientX >= b.x && e.clientX <= b.x + b.w &&
            e.clientY >= b.y && e.clientY <= b.y + b.h) title.hover = b.id;
      }
      cv.style.cursor = title.hover ? 'pointer' : 'default';
      return;
    }
    if (G.scene !== 'game') return;
    if (m.panning) {
      G.cam.x -= (e.clientX - m.lastX) / G.cam.zoom;
      G.cam.y -= (e.clientY - m.lastY) / G.cam.zoom;
      m.panDist = (m.panDist ?? 0) + Math.abs(e.clientX - m.lastX) + Math.abs(e.clientY - m.lastY);
      G.cam.clampToMap();
    }
    m.lastX = e.clientX; m.lastY = e.clientY;
    G.UI.hoverId = G.UI.hitTest(e.clientX, e.clientY);
    const [tx, ty] = tileUnderMouse(e);
    input.hoverTile = G.grid.inBounds(tx, ty) ? [tx, ty] : null;
    if (input.hoverTile && e.buttons & 1) G.Build.onMouseMove(tx, ty);
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (G.scene !== 'game') return;
    G.cam.zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    G.Audio?.unlock?.();
    if (G.scene === 'title') {
      if (title.mode === 'name') {
        if (e.key === 'Enter') startNewGame();
        else if (e.key === 'Backspace') title.name = title.name.slice(0, -1);
        else if (e.key === 'Escape') title.mode = 'menu';
        else if (e.key.length === 1 && title.name.length < 18) title.name += e.key;
        e.preventDefault();
      } else if (e.key === 'Enter') {
        title.mode = 'name';
      }
      return;
    }
    if (e.repeat) return;
    input.keys.add(e.key.toLowerCase());
    if (e.key === ' ') { G.time.paused = !G.time.paused; e.preventDefault(); }
    else if (e.key === '1') { G.time.paused = false; G.time.speed = 1; }
    else if (e.key === '2') { G.time.paused = false; G.time.speed = 2; }
    else if (e.key === '3') { G.time.paused = false; G.time.speed = 4; }
    else if (e.key === '+' || e.key === '=') G.cam.zoomStep(1);
    else if (e.key === '-') G.cam.zoomStep(-1);
    else if (e.key === 'm' || e.key === 'M') G.Audio?.toggleMute?.();
    else if (e.key === 'f' || e.key === 'F') G.UI.onClick('fullscreen');
    else if (e.key === 'Escape') { G.Build.cancel(); G.UI.selected = null; }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));

  // ------------------------------------------------------------- loop
  let last = performance.now(), acc = 0, fpsEma = 60, frameNo = 0;

  function frame(now) {
    const dtReal = Math.min((now - last) / 1000, 0.1);
    last = now;
    fpsEma = fpsEma * 0.95 + (1 / Math.max(dtReal, 1e-4)) * 0.05;
    G.debug.fps = fpsEma;

    if (G.scene === 'title') {
      drawTitle(ctx, dtReal);
      G.Audio?.tick?.(dtReal);
      requestAnimationFrame(frame);
      return;
    }

    // keyboard pan (real-time, unaffected by pause)
    const k = input.keys, pan = 540 * dtReal / G.cam.zoom;
    if (k.has('w') || k.has('arrowup')) G.cam.y -= pan;
    if (k.has('s') || k.has('arrowdown')) G.cam.y += pan;
    if (k.has('a') || k.has('arrowleft')) G.cam.x -= pan;
    if (k.has('d') || k.has('arrowright')) G.cam.x += pan;

    acc += dtReal;
    const mult = G.time.stepsPerFrame();
    while (acc >= LOGIC_DT) {
      acc -= LOGIC_DT;
      for (let i = 0; i < mult; i++) logicStep();
    }
    G.cam.update(dtReal);

    G.Render.drawWorld(ctx);
    if (input.hoverTile && !G.UI.hoverId && !G.Build.tool) {
      G.Render.drawTileCursor(ctx, input.hoverTile[0], input.hoverTile[1],
        G.C.PAL.uiAccent);
    }
    G.Build.drawOverlay(ctx, dtReal);
    G.UI.draw(ctx);
    G.Audio?.tick?.(dtReal);
    // #once: stop after a few frames (headless screenshots of huge cities
    // are slow per-frame without GPU; one settled frame is all we need)
    if (G.hash.once && ++frameNo >= 3) return;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (!G.HEADLESS && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
})();
