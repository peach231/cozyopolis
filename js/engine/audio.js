// WebAudio: gentle era-layered music, day/night ambience, synthesized SFX.
// Everything is generated — no audio files. Unlocked on first user gesture.
(() => {
const G = globalThis.G ??= {};
const A = G.Audio = { ctx: null, muted: false };

let master = null, musicG = null, ambG = null;

A.unlock = () => {
  if (A.ctx) {
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  A.ctx = new AC();
  master = A.ctx.createGain();
  master.gain.value = A.muted ? 0 : 0.5;
  master.connect(A.ctx.destination);
  musicG = A.ctx.createGain();
  musicG.gain.value = 0.7;
  musicG.connect(master);
  ambG = A.ctx.createGain();
  ambG.gain.value = 0.8;
  ambG.connect(master);
};

A.toggleMute = () => {
  A.muted = !A.muted;
  if (master) master.gain.value = A.muted ? 0 : 0.5;
  G.UI?.toast?.(A.muted ? 'Sound off' : 'Sound on');
};

// ------------------------------------------------------------- helpers
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq, t, dur, type, peak, dest, detune = 0) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g);
  g.connect(dest ?? master);
  env(g, t, 0.01, peak, dur);
  o.start(t);
  o.stop(t + dur + 0.3);
}
let noiseBuf = null;
function noise(t, dur, peak, hp, dest) {
  if (!noiseBuf) {
    noiseBuf = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = A.ctx.createBufferSource(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
  s.buffer = noiseBuf;
  s.loop = true;
  f.type = hp ? 'highpass' : 'lowpass';
  f.frequency.value = hp || 800;
  s.connect(f);
  f.connect(g);
  g.connect(dest ?? master);
  env(g, t, 0.005, peak, dur);
  s.start(t);
  s.stop(t + dur + 0.2);
}

// ------------------------------------------------------------- SFX
const now = () => A.ctx?.currentTime ?? 0;
A.sfxClick = () => { if (A.ctx) tone(880, now(), 0.05, 'square', 0.04); };
A.sfxBuild = () => {
  if (!A.ctx) return;
  const t = now();
  tone(140, t, 0.18, 'sine', 0.18);
  noise(t + 0.02, 0.1, 0.06, 0, null);
};
A.sfxCoin = () => {
  if (!A.ctx) return;
  const t = now();
  tone(1180, t, 0.07, 'triangle', 0.08);
  tone(1568, t + 0.07, 0.12, 'triangle', 0.08);
};
A.sfxDoze = () => { if (A.ctx) noise(now(), 0.22, 0.12, 0, null); };
A.fanfare = () => {
  if (!A.ctx) return;
  const t = now();
  [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, dt]) => {
    tone(f, t + dt, 0.4, 'triangle', 0.12);
    tone(f * 2, t + dt, 0.3, 'sine', 0.04);
  });
};

// ------------------------------------------------------------- music
// C major pentatonic, lookahead scheduler; layers join as the city grows.
const PENT = [261.6, 293.7, 329.6, 392.0, 440.0, 523.2, 587.3, 659.2, 784.0];
const CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
const BPM = 74, SPB = 60 / BPM;
let nextBeat = 0, beatNo = 0, melIdx = 4;
let mrng = G.rng(0xabcd);

function scheduleMusic() {
  const t = A.ctx.currentTime;
  while (nextBeat < t + 0.25) {
    if (nextBeat < t - 1) nextBeat = t; // resync after tab sleep
    const era = G.city?.eraIndex ?? 0;
    const bar = (beatNo >> 2) % 4, beat = beatNo % 4;
    if (beat === 0) { // pad chord each bar
      for (const f of CHORDS[bar]) {
        tone(f, nextBeat, SPB * 3.6, 'triangle', 0.028, musicG, mrng.int(-6, 6));
      }
    }
    if (era >= 0 && mrng() < (beat === 0 ? 0.7 : 0.4)) { // melody pluck
      melIdx = G.M.clamp(melIdx + mrng.int(-2, 3), 0, PENT.length - 1);
      tone(PENT[melIdx], nextBeat + (mrng() < 0.3 ? SPB / 2 : 0), 0.5, 'triangle', 0.05, musicG);
    }
    if (era >= 2 && (beat === 0 || beat === 2)) { // bass
      tone(CHORDS[bar][0] / 2, nextBeat, SPB * 0.9, 'sine', 0.07, musicG);
    }
    if (era >= 3 && mrng() < 0.8) { // soft arp 8ths
      tone(CHORDS[bar][(beatNo % 3)] * 2, nextBeat + SPB / 2, 0.16, 'square', 0.012, musicG);
    }
    if (era >= 4) { // hats
      noise(nextBeat, 0.04, 0.02, 7000, musicG);
      if (beat === 2) noise(nextBeat + SPB / 2, 0.05, 0.014, 7000, musicG);
    }
    nextBeat += SPB;
    beatNo++;
  }
}

// ------------------------------------------------------------- ambience
let chirpT = 0, cricketT = 0, rainT = 0;
function ambience(dt) {
  const dl = G.time.daylight();
  chirpT -= dt;
  if (dl > 0.5 && chirpT <= 0) {
    chirpT = 1.2 + mrng() * 5;
    const t = now() + 0.05;
    const f = 2400 + mrng() * 1600;
    for (let i = 0; i < 2 + mrng.int(0, 3); i++) {
      tone(f * (1 + mrng() * 0.12), t + i * 0.09, 0.06, 'sine', 0.012, ambG);
    }
  }
  cricketT -= dt;
  if (dl < 0.25 && cricketT <= 0) {
    cricketT = 0.4 + mrng() * 1.2;
    const t = now() + 0.02;
    for (let i = 0; i < 3; i++) noise(t + i * 0.07, 0.03, 0.008, 4200, ambG);
  }
  rainT -= dt;
  if (G.Weather?.kind === 'rain' && rainT <= 0) {
    rainT = 0.22;
    noise(now() + 0.02, 0.3, 0.018, 0, ambG); // soft lowpassed patter bed
  }
}

A.tick = (dt) => {
  if (!A.ctx || A.muted || A.ctx.state !== 'running') return;
  scheduleMusic();
  ambience(dt);
};
})();
