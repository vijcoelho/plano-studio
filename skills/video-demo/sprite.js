const sprite = (layers, px, cols, outline) => {
  const pad = (m) => [".".repeat(m[0].length + 2), ...m.map((r) => "." + r + "."), ".".repeat(m[0].length + 2)];
  layers = layers.map(([c, m]) => [c, pad(m)]);
  const base = layers[0][1], H = base.length, W = base[0].length;
  const filled = (x, y) => y >= 0 && y < H && x >= 0 && x < W && base[y][x] !== ".";
  const ol = base.map((row, y) => [...row].map((c, x) => (c === "." && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled(x + dx, y + dy)) ? "#" : ".")).join(""));
  layers = [["outline", ol], ...layers]; cols = { ...cols, "#": outline };
  const w = W * px, h = H * px;
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  for (const [cls, map] of layers) {
    s += `<g class="${cls}">`;
    map.forEach((row, y) => [...row].forEach((c, x) => {
      if (cols[c]) s += `<rect x="${x * px}" y="${y * px}" width="${px + 1}" height="${px + 1}" fill="${cols[c]}"/>`;
    }));
    s += "</g>";
  }
  return s + "</svg>";
};
// usage: el.innerHTML = sprite([["body", rows], ["eyes", rows]], pxSize, { O: "#e8774f", K: "#000" }, "#000")  // "." = empty, 1-cell outline auto
