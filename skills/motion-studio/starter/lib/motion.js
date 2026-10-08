// Pure functions of time. Classic script (globals) so index.html works over file://.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// Closed-form damped spring, 0 -> 1. k = stiffness, d = damping.
function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // z >= 1 treated as critical
}

const SPRINGS = {
  snappy: [320, 30],  // buttons, toggles, leading edges
  base: [170, 26],    // cards, containers, camera
  heavy: [90, 20],    // big type, logo lockups
  playful: [220, 14], // mascots, stickers (visible overshoot)
};

// keys: [[time, value], ...] sorted by time. One spring per change, never restart.
function track(t, keys, k = 170, d = 26) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++)
    v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}

// Tab indicator that stretches: leading edge stiffer than trailing edge.
function indicator(t, stops, width = 120) {
  const lead = track(t, stops, 320, 30), trail = track(t, stops, 140, 22);
  return { left: Math.min(lead, trail), right: Math.max(lead, trail) + width };
}

// Text inside a morphing box: in after the morph starts, out before the next one.
const swapAlpha = (t, tIn, tOut) => Math.min(clamp((t - tIn - 0.08) / 0.12), clamp((tOut - 0.1 - t) / 0.1));

const loopT = (t, dur) => ((t % dur) + dur) % dur;

// Seeded noise (mulberry32), never Math.random.
function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
