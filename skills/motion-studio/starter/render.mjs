// node render.mjs --fps 60 --dur 15 --sub 4 [--out out/silent.mp4]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('fps', 60)), SUB = Number(arg('sub', 4)), OUT = arg('out', 'out/silent.mp4');
mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve('index.html')).href);
await page.evaluate(async () => { await document.fonts.ready; await window.ready; }); // fonts + images (set window.ready in index.html)
const { w, h, dur } = await page.evaluate(() => { const c = document.getElementById('c'); return { w: c.width, h: c.height, dur: window.DUR }; });
await page.setViewportSize({ width: w, height: h });
const DUR = Number(arg('dur', dur ?? 15));

// tmix averages SUB consecutive subframes; select keeps one per group (motion blur)
const vf = SUB > 1 ? `tmix=frames=${SUB},select='eq(mod(n\,${SUB})\,${SUB - 1})',setpts=N/${FPS}/TB` : 'null';
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', OUT],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round(DUR * FPS * SUB);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.seek(t), i / (FPS * SUB));
  const png = await page.locator('#c').screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (FPS * SUB) === 0) console.log(`rendered ${i / (FPS * SUB)}s / ${DUR}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(OUT);
