// Procedural music-box score, synced to the scene grid. Deterministic.
// node tools/gen-music.mjs  → assets/bgm.mp3 (via ffmpeg; fica em assets/bgm.wav se não houver ffmpeg)
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

// same step schedule the animation uses → footsteps land on every contact pose
const ctx = {};
vm.runInNewContext(readFileSync("assets/sketch.js", "utf8"), ctx);
const WALK = ctx.Sketch.walkPlan({ t0: 0.2, dist: 1000, stride: 60, stepDur: 0.19 });

const SR = 44100, DUR = 31.5, N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// music box: bright partials, fast decay. detune in semitones (for the "forgetting" wobble)
function bell(t0, midi, vel = 0.25, { detune = 0, decay = 1.6, pan = 0 } = {}) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(SR * decay * 3);
  const parts = [[1, 1], [2.0, 0.35], [3.01, 0.18], [5.4, 0.06]];
  for (let i = 0; i < len && s0 + i < N; i++) {
    const t = i / SR;
    const f = hz(midi + detune * Math.min(1, t / 0.8));
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
    let v = 0;
    for (const [m, a] of parts) v += a * Math.sin(2 * Math.PI * f * m * t) * Math.exp(-t * m * 0.6);
    v *= env * vel;
    L[s0 + i] += v * (1 - pan) * 0.8; R[s0 + i] += v * (1 + pan) * 0.8;
  }
}
// soft pad: detuned sines, slow swell
function pad(t0, dur, midis, vel = 0.05) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(SR * dur);
  for (let i = 0; i < len && s0 + i < N; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 1.2) * Math.min(1, (dur - t) / 1.0);
    let v = 0;
    for (const m of midis) for (const d of [-0.06, 0.06]) {
      const f = hz(m + d);
      v += Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t);
    }
    v *= env * vel / midis.length;
    L[s0 + i] += v; R[s0 + i] += v;
  }
}

// soft pencil-tap footstep: short filtered click, alternating pan
function tap(t0, vel = 0.05, pan = 0) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(SR * 0.06), r = ctx.Sketch.rng(Math.floor(t0 * 1000));
  let lp = 0;
  for (let i = 0; i < len && s0 + i < N; i++) {
    const t = i / SR, env = Math.exp(-t / 0.012);
    lp += 0.35 * ((r() * 2 - 1) - lp); // one-pole lowpass on noise
    const v = (lp * 0.8 + 0.5 * Math.sin(2 * Math.PI * 520 * t)) * env * vel;
    L[s0 + i] += v * (1 - pan); R[s0 + i] += v * (1 + pan);
  }
}
WALK.steps.forEach(({ t }, k) => tap(t + 0.005, 0.06 * (k < WALK.steps.length - 3 ? 1 : 0.7), k % 2 ? 0.25 : -0.25));

const B = 60 / 96; // beat
// 0–5: curious walk melody (C pentatonic)
const walk = [72, 76, 79, 76, 74, 72, 74, 79];
walk.forEach((m, i) => bell(0.3 + i * B, m, 0.22, { pan: i % 2 ? 0.3 : -0.3 }));
bell(0.3, 48, 0.18, { decay: 2.5 }); bell(0.3 + 4 * B, 43, 0.18, { decay: 2.5 });
// 5.3–9.5: memories dissolve — notes sag in pitch and thin out
const forget = [[5.4, 79, -0.8], [6.0, 76, -1.2], [6.9, 74, -1.8], [8.0, 72, -2.6]];
forget.forEach(([t, m, d]) => bell(t, m, 0.2, { detune: d, decay: 1.2 }));
pad(5.2, 4.6, [45, 52, 55], 0.035); // unresolved Am-ish
// 9.8–13: something glimmers — high suspended notes
[[9.9, 91], [10.5, 86], [11.1, 88], [11.7, 93], [12.2, 95]].forEach(([t, m]) => bell(t, m, 0.12, { decay: 0.9, pan: 0.4 }));
pad(10, 3.2, [50, 57, 62], 0.04); // Dsus
// 13–23: graph lights up — arpeggio builds over Am F C G
const chords = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]];
chords.forEach((c, k) => {
  const t0 = 13 + k * 2.5;
  pad(t0, 2.9, c.map((m) => m - 12), 0.05);
  bell(t0, c[0] - 24, 0.2, { decay: 2.2 });
  for (let j = 0; j < 8; j++) {
    const m = c[j % 3] + 12 + (j >= 4 ? 12 : 0);
    bell(t0 + j * 0.3125, m, 0.1 + 0.02 * k, { decay: 0.9, pan: j % 2 ? 0.35 : -0.35 });
  }
});
// 23–31: resolution in C — the walk melody returns, whole
pad(23, 8.3, [48, 55, 64], 0.06);
walk.forEach((m, i) => bell(23.2 + i * B * 0.75, m + 12 * (i === 7), 0.2, { pan: i % 2 ? 0.3 : -0.3 }));
bell(23.2, 36, 0.22, { decay: 3 });
[72, 76, 79, 84].forEach((m, i) => bell(26.95 + i * 0.06, m, 0.16, { decay: 2.6 })); // tagline chord (on the underline)

// echo (ping-pong) + master fade + normalize
const d1 = Math.floor(SR * 0.3125), d2 = Math.floor(SR * 0.47);
for (let i = 0; i < N; i++) {
  if (i >= d1) L[i] += R[i - d1] * 0.28;
  if (i >= d2) R[i] += L[i - d2] * 0.28;
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / 0.2, (DUR - t) / 1.5);
  const g = (0.85 / peak) * fade;
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
mkdirSync("assets", { recursive: true });
writeFileSync("assets/bgm.wav", buf);
const mp3 = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", "assets/bgm.wav", "-b:a", "192k", "assets/bgm.mp3"]);
if (mp3.status === 0) { rmSync("assets/bgm.wav"); console.log("assets/bgm.mp3", DUR + "s"); }
else console.log("assets/bgm.wav", DUR + "s — sem ffmpeg: converta para assets/bgm.mp3");
