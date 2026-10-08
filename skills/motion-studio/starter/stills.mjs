// node stills.mjs 2.5 10 24.5  -> out/s_<t>.png at those times, no full render (fast critique loop)
import { chromium } from 'playwright'; import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path';
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(pathToFileURL(resolve('index.html')).href); await p.evaluate(async () => { await document.fonts.ready; await window.ready; });
for (const t of process.argv.slice(2)) { await p.evaluate(x => seek(x), Number(t)); await p.locator('#c').screenshot({ path: `out/s_${t}.png` }); }
await b.close();
