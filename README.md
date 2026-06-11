# Cozyopolis

A cozy isometric city-builder. Start with a dirt path and a few cottages by the
river; grow a hamlet into a glittering metropolis with traffic lights, festivals,
and a skyline full of glowing windows.

**Play:** double-click `index.html` (no build step, no dependencies).

## How to play

- **Lay paths first** (Roads tab), then **paint zones** next to them (Zones tab):
  green = residential, blue = commercial. Buildings grow in on their own when
  there's demand — watch the R/C bars in the top-left panel.
- People need **jobs** (commercial/farms) and **homes** (residential); demand
  feeds back between them. Parks, trees and landmarks raise land value, which
  makes buildings level up (cottage → house → townhouse → apartments → towers).
- **Population milestones unlock eras** — Hamlet → Village (50) → Town (250) →
  City (1,000) → Metropolis (5,000) — each opening new roads, buildings and
  one-of-a-kind landmarks.
- Watch the clock: shops glow at dusk, lamps flicker on, streets empty at night,
  and every third day a festival fills the park.
- Click any citizen, car or building to see who they are and what they're up to.

## Controls

| Input | Action |
|---|---|
| Left click / drag | use selected tool, select things |
| Right/middle drag (or Space+drag) | pan |
| Mouse wheel, `+` / `−` | zoom |
| `WASD` / arrows | pan |
| `Space` | pause |
| `1` `2` `3` | speed 1× / 2× / 4× |
| `M` | mute |
| `Esc` | cancel tool / deselect |
| Right-click | cancel tool |
| Minimap click | jump there |

Saves automatically every in-game day (localStorage).

## Development

- `node tools/check.js` — full validation suite (data lints + deterministic sim tests)
- `node tools/balance.js [--full]` — auto-player pacing test (era arrival targets)
- `node tools/simprobe.js [min]` — growth pacing probe
- See `BUILD_NOTES.md` for architecture, hash debug modes and screenshot workflow.
