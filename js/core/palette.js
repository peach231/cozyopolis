// Storybook master palette + color utilities. Pure data/functions: used by the
// runtime renderer AND by tools/bake.js under Node. Ramps go light -> dark and
// darks are warm-shifted (toward #5a3c50 plum, never pure black).
(() => {
const G = globalThis.G ??= {};
const C = G.C = {};

C.hex2rgb = (h) => {
  const n = parseInt(h[0] === '#' ? h.slice(1) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
C.rgb2hex = (r, g, b) =>
  '#' + ((1 << 24) | (G.M.clamp(r | 0, 0, 255) << 16) | (G.M.clamp(g | 0, 0, 255) << 8) | G.M.clamp(b | 0, 0, 255)).toString(16).slice(1);

// mix two hex colors, t in [0,1]
C.mix = (a, b, t) => {
  const A = C.hex2rgb(a), B = C.hex2rgb(b);
  return C.rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
const WARM_DARK = '#4a3550';   // plum shadow anchor for the whole game
const WARM_LIGHT = '#fff3d6';  // sunny highlight anchor
C.shade = (hex, t) => C.mix(hex, WARM_DARK, t);   // t=0 unchanged, t=1 full plum
C.tint = (hex, t) => C.mix(hex, WARM_LIGHT, t);

// build a 5-step ramp [highlight, light, base, dark, deep] from one base color
C.ramp = (base) => [C.tint(base, 0.45), C.tint(base, 0.22), base, C.shade(base, 0.28), C.shade(base, 0.52)];

const PAL = C.PAL = {
  grass:   C.ramp('#8cbf63'),
  meadow:  C.ramp('#a4cc6e'),
  water:   C.ramp('#5fb7bd'),
  waterDeep: C.ramp('#3f8aa8'),
  sand:    C.ramp('#e3c98f'),
  dirt:    C.ramp('#b8946a'),
  stone:   C.ramp('#a9a3b8'),
  cobble:  C.ramp('#9c93a8'),
  pave:    C.ramp('#8d8798'),
  wood:    C.ramp('#a8784f'),
  woodDark: C.ramp('#7d5a3e'),
  plaster: C.ramp('#f0e2c4'),
  brick:   C.ramp('#c4705a'),
  roofRed: C.ramp('#c75b4e'),
  roofTeal: C.ramp('#4e8f86'),
  roofSlate: C.ramp('#6f6a85'),
  roofThatch: C.ramp('#cfa45e'),
  leafWarm: C.ramp('#79a84f'),
  leafCool: C.ramp('#5d9460'),
  leafGold: C.ramp('#c9a045'),
  bloomPink: C.ramp('#e8909d'),
  bloomYellow: C.ramp('#ecc35e'),
  glowWindow: ['#fff6c8', '#ffd98a', '#ffb95e'], // emissive ramp (not a shade ramp)
  uiPanel: '#3a3147',
  uiPanelLight: '#564a68',
  uiText: '#f6eedd',
  uiTextDim: '#b9aec9',
  uiAccent: '#ffcf6b',
  uiGood: '#9ed47a',
  uiBad: '#e58a7a',
  night: '#2b2e52',
};

C.withAlpha = (hex, a) => {
  const [r, g, b] = C.hex2rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
})();
