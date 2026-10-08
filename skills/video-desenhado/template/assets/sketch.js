// Hand-drawn video kit: pen strokes, the mascot, and character-motion helpers. Deterministic.
// Browser → window.Sketch. Node (vm.runInNewContext) → globalThis.Sketch for the pure helpers (walkPlan, rng).
(function (G) {
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const f = (n) => n.toFixed(1);

  // ── pen strokes ────────────────────────────────────────────────────────────
  // quadratic smoothing through midpoints → loose pen line
  const smooth = (p) => {
    let d = `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      d += ` Q${f(p[i][0])} ${f(p[i][1])} ${f(mx)} ${f(my)}`;
    }
    const l = p[p.length - 1];
    return d + ` L${f(l[0])} ${f(l[1])}`;
  };
  // every shape fn takes (…geometry, r, j): r = seeded rng, j = wobble in px
  function line(x1, y1, x2, y2, r, j = 1.6) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, n = Math.max(2, Math.round(len / 30));
    const dx = (x2 - x1) / len, dy = (y2 - y1) / len, o = 1.5 + r() * 3.5;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, e = i === 0 ? -o : i === n ? o : 0, k = (r() - 0.5) * 2 * j;
      pts.push([x1 + (x2 - x1) * t + dx * e - dy * k, y1 + (y2 - y1) * t + dy * e + dx * k]);
    }
    return smooth(pts);
  }
  const rect = (x, y, w, h, r, j) =>
    [line(x, y, x + w, y, r, j), line(x + w, y, x + w, y + h, r, j),
     line(x + w, y + h, x, y + h, r, j), line(x, y + h, x, y, r, j)].join(" ");
  function ellipse(cx, cy, rx, ry, r, j = 1.6) {
    const n = Math.max(14, Math.round((rx + ry) / 9)), a0 = r() * 6.283, pts = [];
    for (let i = 0; i <= n + 2; i++) {
      const a = a0 + (i / n) * 6.283, k = 1 + ((r() - 0.5) * 2 * j) / Math.max(rx, ry);
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return smooth(pts);
  }
  // two pen passes per shape; args = geometry followed by jitter j (the rng slots in before j)
  const pen = (fn, args, seed, b) => {
    const r = rng(seed * 7919 + b * 104729), geo = args.slice(0, -1), j = args[args.length - 1];
    return `<path d="${fn(...geo, r, j)}"/><path class="p2" d="${fn(...geo, r, j)}"/>`;
  };
  // three redrawn variants of the same shapes; `boil` flips between them
  function boiled(P, shapes, seed) {
    return [0, 1, 2].map((b) =>
      `<g class="${P}-b${b}"${b ? ' opacity="0"' : ""}>${shapes.map(([fn, args], i) => pen(fn, args, seed + i * 13, b)).join("")}</g>`
    ).join("");
  }
  // line boil: redraw at `fps` (8 ≈ "on threes", 12 = "on twos")
  function boil(tl, P, t0, t1, fps = 8) {
    for (let t = t0, i = 0; t < t1; t += 1 / fps, i++)
      [0, 1, 2].forEach((b) => tl.set(`.${P}-b${b}`, { opacity: b === i % 3 ? 1 : 0 }, t));
  }
  const INK = "#2a1d17";
  const INK_CSS = (P) => `.${P}-ink path{fill:none;stroke:${INK};stroke-width:4.4;stroke-linecap:round;stroke-linejoin:round}
    .${P}-ink path.p2{stroke-width:2.4;opacity:.55}`;

  // ── the mascot ─────────────────────────────────────────────────────────────
  // 400×300 box; body 60..340 × 34..202, feet at y≈266. Parts: legsA legsB upper armL armR eyes eyeL eyeR reflect happy
  function mascot(P, { color = "#d97757", shade = "#8e3a1e", happy = false } = {}) {
    const part = (id, rects, seed) =>
      `<g id="${P}-${id}">${rects.map((a) => `<rect x="${a[0]}" y="${a[1]}" width="${a[2]}" height="${a[3]}" rx="5" fill="${color}"/>`).join("")}
      <g class="${P}-ink">${boiled(P, rects.map((a) => [rect, [...a, 1.7]]), seed)}</g></g>`;
    const hatchLines = Array.from({ length: 70 }, (_, i) => {
      const r = rng(900 + i), x = 60 + r() * 280, y = 34 + r() * 168, l = 14 + r() * 26;
      return `<path d="M${f(x)} ${f(y)} l${f(l * 0.8)} ${f(-l * 0.6)}"/>`;
    }).join("");
    return `<svg viewBox="0 0 400 300" width="400" height="300" overflow="visible">
      <defs><pattern id="${P}-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="9" stroke="${shade}" stroke-width="1.3" opacity=".28"/></pattern>
        <clipPath id="${P}-bodyclip"><rect x="60" y="34" width="280" height="168" rx="5"/></clipPath></defs>
      <ellipse id="${P}-shadow" cx="200" cy="268" rx="150" ry="9" fill="${INK}" opacity=".13"/>
      ${part("legsA", [[92, 190, 26, 74], [228, 190, 26, 74]], 11)}
      ${part("legsB", [[148, 190, 26, 74], [284, 190, 26, 74]], 23)}
      <g id="${P}-upper">
        ${part("armL", [[16, 104, 50, 42]], 37)}
        ${part("armR", [[334, 104, 50, 42]], 41)}
        <rect x="60" y="34" width="280" height="168" rx="5" fill="${color}"/>
        <rect x="60" y="34" width="280" height="168" rx="5" fill="url(#${P}-hatch)"/>
        <g clip-path="url(#${P}-bodyclip)" stroke="${shade}" stroke-width="1.6" opacity=".3" stroke-linecap="round">${hatchLines}</g>
        <g class="${P}-ink">${boiled(P, [[rect, [60, 34, 280, 168, 1.9]]], 53)}</g>
        <g id="${P}-eyes"${happy ? ' opacity="0"' : ""}>
          <g id="${P}-eyeL"><rect x="126" y="76" width="30" height="54" rx="8" fill="#1d1512"/><rect x="133" y="83" width="9" height="13" rx="3" fill="#fbf6ec"/></g>
          <g id="${P}-eyeR"><rect x="244" y="76" width="30" height="54" rx="8" fill="#1d1512"/><rect x="251" y="83" width="9" height="13" rx="3" fill="#fbf6ec"/>
            <g id="${P}-reflect" opacity="0" stroke="#f2b54a" stroke-width="1.2" fill="#ffd27a">
              <path d="M252 112 L262 104 L268 116 M262 104 L266 96" fill="none"/>
              <circle cx="252" cy="112" r="1.8"/><circle cx="262" cy="104" r="2.2"/><circle cx="268" cy="116" r="1.6"/><circle cx="266" cy="96" r="1.4"/></g></g>
        </g>
        <g id="${P}-happy" opacity="${happy ? 1 : 0}" fill="none" stroke="#1d1512" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M122 110 L141 90 L160 110"/><path d="M240 110 L259 90 L278 110"/></g>
      </g>
    </svg>`;
  }
  const SHOULDER = { L: "66 125", R: "334 125" };

  // ── thought cloud: ink under every puff, paper fills on top hide the seams ─
  function cloud(P, puffs, seed, fill = "#fbf7ee") {
    return `<g id="${P}-puffs">` +
      puffs.map(([x, y, r], i) => `<g id="${P}-puffS${i}" class="${P}-ink ${P}-puffink">${boiled(P, [[ellipse, [x, y, r, r * 0.92, 2.4]]], seed + i * 7)}</g>`).join("") +
      puffs.map(([x, y, r], i) => `<ellipse id="${P}-puffF${i}" cx="${x}" cy="${y}" rx="${r - 4}" ry="${r * 0.92 - 4}" fill="${fill}"/>`).join("") + `</g>`;
  }
  const CLOUD_CSS = (P) => `.${P}-puffink path{stroke-width:9}.${P}-puffink path.p2{stroke-width:3}`;
  function popCloud(tl, P, puffs, t, stagger = 0.06) {
    const sp = spring({ response: 0.42, damping: 0.62 });
    puffs.forEach(([x, y], i) => tl.fromTo([`#${P}-puffS${i}`, `#${P}-puffF${i}`], { scale: 0, svgOrigin: `${x} ${y}` },
      { scale: 1, svgOrigin: `${x} ${y}`, duration: sp.duration, ease: sp.ease }, t + i * stagger));
    return t + (puffs.length - 1) * stagger + sp.duration;
  }

  // ── motion ─────────────────────────────────────────────────────────────────
  // damped spring as a pure ease (seek-safe). damping 1 = no overshoot, .6–.7 = playful
  function spring({ response = 0.5, damping = 1 } = {}) {
    const w = (2 * Math.PI) / response, z = damping;
    let pos;
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      pos = (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    } else if (z > 1) {
      const wo = w * Math.sqrt(z * z - 1);
      pos = (t) => 1 - Math.exp(-z * w * t) * (Math.cosh(wo * t) + ((z * w) / wo) * Math.sinh(wo * t));
    } else pos = (t) => 1 - Math.exp(-w * t) * (1 + w * t);
    const rate = z <= 1 ? z * w : (z - Math.sqrt(z * z - 1)) * w, SCAN = 12 / rate, N = 4800;
    let T = SCAN;
    for (let i = N; i >= 0; i--) if (Math.abs(1 - pos((i / N) * SCAN)) > 0.001) { T = ((i + 1) / N) * SCAN; break; }
    const xT = pos(T);
    return { duration: T, ease: (p) => pos(p * T) + p * (1 - xT) };
  }
  // spring pop entrance
  function pop(tl, sel, t, { response = 0.4, damping = 0.62, origin = "50% 50%", svgOrigin } = {}) {
    const sp = spring({ response, damping }), o = svgOrigin ? { svgOrigin } : { transformOrigin: origin };
    tl.fromTo(sel, { scale: 0, opacity: 0, ...o }, { scale: 1, opacity: 1, ...o, duration: sp.duration, ease: sp.ease }, t);
    return t + sp.duration;
  }

  // step schedule shared by the animation and the footstep SFX: steady steps, then a 3-step slowdown
  function walkPlan({ t0 = 0, dist, stride = 60, stepDur = 0.19 }) {
    const tailS = [0.7, 0.45, 0.25], tailD = [1.1, 1.25, 1.4];
    const tailDist = stride * tailS.reduce((a, b) => a + b, 0);
    const n = Math.max(1, Math.round((dist - tailDist) / stride)), s = (dist - tailDist) / n;
    const steps = [];
    let t = t0;
    for (let k = 0; k < n; k++) { const d = stepDur * (k < 2 ? 1.15 : 1); steps.push({ t, d, s }); t += d; }
    tailS.forEach((m, i) => { const d = stepDur * tailD[i]; steps.push({ t, d, s: stride * m }); t += d; });
    return { steps, end: t };
  }
  // side-on walk for the mascot: planted legs slide back exactly as fast as the body moves (no foot slide),
  // lifted legs arc forward, body bobs down on contact / up on passing, arms counter-swing, lean + follow-through.
  // `sel` moves in x; `inner` leans (transform-origin at the feet). Returns the time the walk has settled.
  function walk(tl, P, { sel, inner, t0, x0, dist, stride = 60, stepDur = 0.19, lift = 14 }) {
    const { steps, end } = walkPlan({ t0, dist, stride, stepDur });
    const kf = { body: [], A: [], B: [], Ay: [], By: [], up: [], armL: [], armR: [] };
    let x = x0;
    steps.forEach(({ d, s }, k) => {
      x += s;
      kf.body.push({ x, duration: d, ease: "none" });
      const [L, Pl] = k % 2 ? ["B", "A"] : ["A", "B"];
      kf[L].push({ x: s / 2, duration: d, ease: "sine.inOut" });
      kf[Pl].push({ x: -s / 2, duration: d, ease: "none" });
      kf[L + "y"].push({ y: -lift, duration: d / 2, ease: "power2.out" }, { y: 0, duration: d / 2, ease: "power2.in" });
      kf[Pl + "y"].push({ y: 0, duration: d });
      kf.up.push({ y: -5, duration: d / 2, ease: "sine.out" }, { y: 3, duration: d / 2, ease: "sine.in" });
      const a = k % 2 ? 13 : -13;
      kf.armL.push({ rotation: a, svgOrigin: SHOULDER.L, duration: d, ease: "sine.inOut" });
      kf.armR.push({ rotation: a, svgOrigin: SHOULDER.R, duration: d, ease: "sine.inOut" });
    });
    const settle = spring({ response: 0.45, damping: 0.55 });
    tl.fromTo(sel, { x: x0 }, { keyframes: kf.body }, t0);
    tl.fromTo(`#${P}-legsA`, { x: 0 }, { keyframes: [...kf.A, { x: 0, duration: 0.18, ease: "power2.out" }] }, t0);
    tl.fromTo(`#${P}-legsB`, { x: 0 }, { keyframes: [...kf.B, { x: 0, duration: 0.18, ease: "power2.out" }] }, t0);
    tl.fromTo(`#${P}-legsA`, { y: 0 }, { keyframes: kf.Ay }, t0);
    tl.fromTo(`#${P}-legsB`, { y: 0 }, { keyframes: kf.By }, t0);
    tl.fromTo(`#${P}-upper`, { y: 0 }, { keyframes: [...kf.up, { y: 0, duration: settle.duration, ease: settle.ease }] }, t0);
    tl.fromTo(`#${P}-armL`, { rotation: 0, svgOrigin: SHOULDER.L }, { keyframes: [...kf.armL, { rotation: 0, svgOrigin: SHOULDER.L, duration: settle.duration, ease: settle.ease }] }, t0);
    tl.fromTo(`#${P}-armR`, { rotation: 0, svgOrigin: SHOULDER.R }, { keyframes: [...kf.armR, { rotation: 0, svgOrigin: SHOULDER.R, duration: settle.duration, ease: settle.ease }] }, t0);
    // lean into the walk, overshoot back on the stop, spring upright
    tl.fromTo(inner, { rotation: 0 }, { keyframes: [
      { rotation: 4, duration: 0.3, ease: "power2.out" },
      { rotation: 4, duration: Math.max(0, end - t0 - 0.3) },
      { rotation: -3, duration: 0.14, ease: "power2.out" },
      { rotation: 0, duration: settle.duration, ease: settle.ease }] }, t0);
    return end + 0.14 + settle.duration;
  }
  // hop with anticipation (crouch), stretch on launch, squash on landing, spring recovery
  function hop(tl, sel, t, h = 50) {
    const sp = spring({ response: 0.35, damping: 0.5 });
    tl.fromTo(sel, { y: 0, scaleX: 1, scaleY: 1 }, { keyframes: [
      { scaleY: 0.86, scaleX: 1.08, duration: 0.12, ease: "power2.out" },
      { y: -h, scaleY: 1.1, scaleX: 0.93, duration: 0.22, ease: "power3.out" },
      { scaleY: 1, scaleX: 1, duration: 0.07, ease: "sine.inOut" },
      { y: 0, scaleY: 1.06, scaleX: 0.96, duration: 0.19, ease: "power2.in" },
      { scaleY: 0.84, scaleX: 1.1, duration: 0.06, ease: "power1.out" },
      { scaleY: 1, scaleX: 1, duration: sp.duration, ease: sp.ease }] }, t);
    return t + 0.66 + sp.duration;
  }
  // surprise take: squash, stretch up, spring back
  function surprise(tl, sel, t) {
    const sp = spring({ response: 0.4, damping: 0.5 });
    tl.fromTo(sel, { y: 0, scaleX: 1, scaleY: 1 }, { keyframes: [
      { scaleY: 0.86, scaleX: 1.1, duration: 0.09, ease: "power2.out" },
      { y: -22, scaleY: 1.14, scaleX: 0.9, duration: 0.14, ease: "power3.out" },
      { y: 0, scaleY: 1, scaleX: 1, duration: sp.duration, ease: sp.ease }] }, t);
    return t + 0.23 + sp.duration;
  }
  // handwriting write-on: each word is revealed left→right at pen speed (chars per second)
  function writeOn(tl, els, t, cps = 16, gap = 0.07) {
    const HID = "inset(-30% 104% -30% -8%)", SHOWN = "inset(-30% -8% -30% -8%)";
    [...els].forEach((el) => {
      const d = Math.max(0.16, el.textContent.trim().length / cps);
      tl.fromTo(el, { clipPath: HID }, { clipPath: SHOWN, duration: d, ease: "power1.inOut" }, t);
      t += d + gap;
    });
    return t;
  }

  G.Sketch = { rng, line, rect, ellipse, boiled, boil, INK, INK_CSS, mascot, SHOULDER, cloud, CLOUD_CSS, popCloud,
    spring, pop, walkPlan, walk, hop, surprise, writeOn };
})(typeof window !== "undefined" ? window : globalThis);
