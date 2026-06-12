# Cozyopolis — build notes (development continuity)

Isometric city-builder: hamlet → metropolis. Vanilla JS + Canvas, no build step —
double-click `index.html`. Plan: `~/.claude/plans/build-an-isometric-city-immutable-lemon.md`.

## Workflows (CRITICAL)

- **Validate everything**: `node tools/check.js` — loads all scripts in index.html
  order under Node (G.HEADLESS=true), lints data, runs deterministic sim checks
  (terrain, roads, traffic law, growth-to-Village, save round-trip, day/night).
- **Pacing**: `node tools/balance.js [maxMin] [--full]` — shared autoplay bot
  (G.Demo.autoplay in demo.js) plays a fresh map; asserts Village≤12, Town≤60,
  City≤150 (and Metropolis≤200 with --full) sim-minutes. ~2s wall.
- **Visual review**: headless Edge screenshots:
  `& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless
  --disable-gpu --screenshot=tools\shot.png --window-size=1280,800
  --force-device-scale-factor=1 "file:///...index.html#HASH"` then Read the png.
  **For big cities add `&once`** (stops rAF after 3 frames) and **omit
  --virtual-time-budget** — software raster is seconds/frame on a metropolis and
  virtual-time capture comes back blank once rAF stops. Small scenes can use
  `--virtual-time-budget=4000`.
- **Hash modes**: `#seed=N` · `#t=HOUR` force clock · `#ff=N` fast-forward logic
  steps · `#zoom=Z` · `#once` stop after 3 frames · `#rain` pin rainy weather ·
  `#debug` fps/weather overlay + autoplay minute logs · `#gallery` building
  catalog · `#hamlet` `#town` `#grow` demo settlements · `#autoplay=MIN`
  bot-plays a city (e.g. 135 → metropolis).
  Any hash mode skips the title screen and disables autosave.
  NOTE: rain/grade effects are subtle in downscaled previews — crop screenshots
  at full resolution before judging them missing.

## Architecture decisions

- Global namespace `G`; every file is an IIFE doing `const G = globalThis.G ??= {}`.
  Script order in index.html: core → data → engine → main; check.js parses it.
- **Art is NOT pre-baked to files**: storybook art is smooth, so recipes
  (js/data/buildings.js) rasterize at load via the shape grammar
  (js/engine/shapegen.js) into a sprite cache (render.js), at **2× scale**.
  Light ALWAYS upper-left: top faces ramp[1], SW wall ramp[2], SE wall ramp[3].
  Ramps via `G.C.ramp(base)`: 5 steps, darks warm-shifted to plum #4a3550.
  Shape ops: box, gable, pyramid, floor, win, winGrid, door, chimney, cyl,
  awning, paint(fn). Faces: 'sw' = W→S wall, 'se' = S→E wall. Window emissives
  collected into spr.ecv during build (drawn additively at night).
- Iso 64×32: `toScreen(x,y)=((x−y)*32,(x+y)*16)`. Buildings: (x,y)=min corner,
  anchor = toScreen(x−0.5,y−0.5); depth = x+y+(w−1)+(h−1).
- Ground: 16×16-tile chunk canvases, LRU pool 40, keyed (cx,cy,scale).
  `R.invalidateTile` on ground/road edits. Roads paint INSIDE chunks
  (roads.js Roads.paintTile): dirt bands / cobble / paved+dashes / wooden
  bridge deck on water (tier≥3 may cross water).
- Sim: fixed 60 Hz; speed = steps/frame. Clock: 1 day = 360s. logicStep =
  time → growth → agents → traffic → events.
- **Growth** (growth.js): zones (grid.zones 1 res / 2 com), demand with a small
  "ambition" floor when happiness > 0.38 (prevents res↔com deadlock), growth on
  road-adjacent zoned tiles biased by land value, level-up chains in eras.js,
  pop immigration gated by jobs+happiness, land value = blurred source field
  (parks/trees/water/landmarks +, ind/farm −) every 4s, era milestones
  (50/250/1000/5000), daily budget (income pop*1.1+jobs*0.8 − road/civic upkeep).
  Growth RNG is a deterministic stream (Growth.reseed per map).
- **Traffic** (traffic.js): cars on tier≥2 roads, right-lane offset 0.2, A*/BFS
  (agents.js findPath, minTier param), car-following, stop signs (one-car box
  reservation), traffic lights at tier≥3 deg≥3 intersections (7s green/1.3s
  amber, axis pairs). Walkers (agents.js) also wait at red (same allows() rule).
  Agent counts scale with daylight; walkers are a sampled cast, pop is the
  real number.
- **Day/night** (render.js): GRADE keyframes → full-screen multiply overlay;
  additive light pass when daylight<0.72: window emissives (staggered per
  building, night owls only after 23:00), street-lamp pools (auto lamps on
  tier≥2 roads from Village era — Roads.getLamps), signal bulb glows, headlight
  cones. Shadows fade by daylight. Water sparkle pass animates glints.
- **Flavor** (events.js): ticker (hooks → headlines, milestone + idle flavor),
  festival every 3rd day at a park (bunting + walker bias), era-up confetti.
- **Audio** (audio.js): all synthesized. Era-layered loop (pad → melody → bass
  → arp → hats), bird chirps by day / crickets at night, SFX (click, build,
  coin, doze, fanfare). Unlocks on first gesture; M mutes. **Not yet
  human-audited** — composed blind; volumes in tone()/noise() peaks.
- **Save** (save.js): localStorage `cozyopolis_save_v1`; terrain from seed +
  deltas (roads/zones/structures b64/JSON). Autosave each day via chained
  newDay hook (installed only when entering through the title screen).
- UI (ui.js): all in-canvas. City panel (pop/funds/happiness face/RCI bars/era
  progress), clock, ticker marquee, minimap (2s rebuild, click-to-jump),
  category palette with era locks, inspector card, toasts.

## Status: ALL 8 PHASES + PLAYTEST PATCH 1 COMPLETE

Era pacing (autoplay bot, seed 4242 after patch): Village 1 · Town 3 · City 71 ·
Metropolis 144 sim-minutes. check.js: 16/16.

Playtest patch 1 (Eric's feedback): zones split into Res/Com/Farm (player picks
what grows; com builds ~2x faster, small lots 3.2s, fields 2s) · vehicle
progression (horse carts on cobble tier 2, motor cars only on paved tier>=3;
VEH table in traffic.js) · 3D-ier car sprites + horse cart sprite · stuck-vehicle
watchdog (22s standstill → despawn; box entry refused when exit blocked) ·
walkers keep to sidewalk edge (offset 0.34 on tier>=2) · demand bars labeled
R/C with hover tooltips (+ happiness tooltip) · ~11 new buildings (cafe, pond,
playground, library, cinema, botanic, hospital, promenade, university,
ferris_wheel, opera) · recipe-driven trees (js/data/trees.js: oak/elm/birch/
pine/blossom; painter in render.js; legacy saves map leaf→species) · weather
(js/engine/weather.js: sun/clouds/rain, cloud shadows, rain streaks, dim grade,
crowd scale, rain patter in audio) · title screen beauty pass (hamlet backdrop,
gradient wordmark with letter bounce, cottage crest, hover states).

## Known rough edges (future passes)

- Audio composed blind — needs a human listen (channel peaks in audio.js).
- Rocks/flowers still simple painter art (trees are now recipe-driven).
- No road tunnels/elevation; bridges are flat decks (tier≥3 over water).
- Headless screenshots of metropolis-scale cities need `&once` (see Workflows).
- Pedestrians cross with the parallel green but no crosswalk art.
- Weather is cosmetic (no sim effects beyond fewer strollers); not saved.
- Town era arrives fast for the bot (min 3) — human pacing is slower; revisit
  era thresholds if real play feels rushed.
