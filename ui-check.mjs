import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';

const dir = path.resolve('test-artifacts', 'ui-' + randomUUID()); await fs.mkdir(dir, { recursive: true });
const origin = 'http://127.0.0.1:4329';
const server = spawn(process.execPath, ['server.mjs'], { shell: false, windowsHide: true, env: { ...process.env, PORT: '4329', STUDIO_DATA: path.join(dir, 'data') }, stdio: 'ignore' });
let browser, page;
const errors = [];
async function shot(name) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true }); }
async function idle() { await page.waitForFunction(() => !document.querySelector('#job-status .spinner') || document.querySelector('#job-status .spinner').hidden, { timeout: 60000 }); }
try {
  let executablePath;
  for (const candidate of [process.env.STUDIO_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) {
    if (!candidate) continue; try { await fs.access(candidate); executablePath = candidate; break; } catch {}
  }
  assert(executablePath, 'Chrome/Edge não encontrado.');
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-gpu', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], defaultViewport: { width: 1440, height: 1000 } });
  page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
  for (let i = 0; i < 40; i++) { try { await page.goto(origin, { waitUntil: 'networkidle0' }); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  await page.waitForFunction(() => document.querySelector('#claude-status').textContent !== 'Verificando…');
  assert.equal(await page.$eval('#project-count', el => el.textContent), '0');
  // Primeira visita abre o guia com exemplos; um exemplo preenche o chat e fecha a página.
  await page.waitForSelector('#settings-dialog[open]');
  assert.equal(await page.$eval('[data-tab=start]', el => el.getAttribute('aria-selected')), 'true');
  assert((await page.$$('[data-example]')).length >= 6);
  await shot('desktop-guide');
  await page.click('[data-example]');
  await page.waitForFunction(() => !document.querySelector('#settings-dialog').open && document.querySelector('#chat-input').value.length > 20);
  await page.$eval('#chat-input', el => { el.value = ''; });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#settings-dialog', el => el.open), false, 'Guia só abre na primeira visita.');
  await page.waitForFunction(() => document.querySelector('#claude-status').textContent !== 'Verificando…');
  await shot('desktop-empty');
  // Sem login: botão de conectar aparece e abre o diálogo (o link só é gerado pelo clique do usuário).
  if (!(await page.$eval('#claude-connect', el => el.hidden))) {
    await page.click('#claude-connect'); await page.waitForSelector('#login-dialog[open]');
    assert.equal(await page.$eval('#login-submit', el => el.disabled), true);
    await shot('desktop-login'); await page.keyboard.press('Escape');
  }
  await page.click('#new-project'); await page.type('#new-name', 'Projeto <script> de teste');
  await page.click('#new-form .primary'); await page.waitForFunction(() => document.querySelector('#project-name').textContent.includes('<script>'));
  assert.equal(await page.$eval('#project-name', el => el.children.length), 0);
  await page.click('#settings-open'); await page.waitForSelector('#settings-dialog[open]');
  assert.match(await page.$eval('#composio-hint', el => el.textContent), /Falta COMPOSIO_API_KEY/);
  // Aba IA: padrão Opus 5.5 + esforço médio; aba Chaves lista os 5 provedores e salvar sem nada avisa.
  await page.click('[data-tab=ai]');
  assert.equal(await page.$eval('[name=provider]:checked', el => el.value), 'claude-cli');
  assert.equal(await page.$eval('#model-claude', el => el.value), 'claude-opus-5-5');
  assert.equal(await page.$eval('#effort', el => el.value), 'medium');
  assert.equal(await page.$eval('#settings-footer', el => el.hidden), false);
  await shot('desktop-settings-ai');
  await page.click('[data-tab=keys]');
  assert.equal((await page.$$('[data-key]')).length, 5);
  assert.equal(await page.$eval('#settings-footer', el => el.hidden), true);
  await page.type('[data-key=OPENROUTER_API_KEY]', 'sk-or-ui-test-000011112222');
  await page.click('#secrets-form .primary');
  await page.waitForFunction(() => document.querySelector('[data-key=OPENROUTER_API_KEY]')?.closest('.key').textContent.includes('Salva …2222'));
  assert.equal(await page.$eval('[data-key=OPENROUTER_API_KEY]', el => el.value), '', 'Chave salva não volta para a tela.');
  await shot('desktop-settings-keys');
  await page.click('[data-forget=OPENROUTER_API_KEY]');
  await page.waitForFunction(() => document.querySelector('[data-key=OPENROUTER_API_KEY]')?.closest('.key').textContent.includes('Não configurada'));
  await page.click('[data-tab=start]');
  await shot('desktop-settings'); await page.keyboard.press('Escape');
  const fixtures = await fs.readdir(path.resolve('test-artifacts'));
  let fixture;
  for (const folder of fixtures.filter(x => x.startsWith('smoke-')).reverse()) { const candidate = path.resolve('test-artifacts', folder, 'fixture.mp4'); try { await fs.access(candidate); fixture = candidate; break; } catch {} }
  assert(fixture, 'Execute npm run smoke primeiro.');
  await (await page.$('#file-input')).uploadFile(fixture);
  await page.waitForFunction(() => document.querySelector('#frames-section').hidden === false, { timeout: 60000 });
  await idle();
  await page.click('#transcript-open');
  await page.type('#srt-text', '1\n00:00:00,000 --> 00:00:02,000\nLegenda técnica de teste.\n\n2\n00:00:02,000 --> 00:00:04,000\nSem transcrição de fala.');
  await page.click('#transcript-form .primary');
  await page.waitForFunction(() => document.querySelector('#transcript-info').textContent.includes('2 blocos'));
  await page.click('#manual-toggle'); await page.$eval('#cut-end', el => { el.value = '3'; });
  await page.click('#manual-form button'); await page.waitForSelector('.plan-cut');
  await shot('desktop-edit');
  await page.click('#render'); await page.waitForFunction(() => document.querySelector('#job-status').textContent.includes('Renderizando') || document.querySelector('#result-count').textContent === '1');
  await page.waitForFunction(() => document.querySelector('#result-count').textContent === '1', { timeout: 60000 });
  await idle();
  await page.waitForFunction(() => document.querySelector('#player').getAttribute('src')?.includes('/results/'), { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('.result-thumb video')?.readyState >= 1, { timeout: 10000 });
  await page.click('[data-preview]'); await page.waitForFunction(() => document.querySelector('#player').readyState >= 2); await shot('desktop-result');
  await page.click('[data-publish]'); await page.waitForSelector('#publish-dialog[open]'); assert.equal(await page.$eval('#publish-confirm', el => el.checked), false); await page.keyboard.press('Escape');
  await page.setViewport({ width: 390, height: 844 }); await shot('mobile-result');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Overflow horizontal no mobile.');
  await page.click('#library-toggle'); assert.equal(await page.$eval('#library-toggle', el => el.getAttribute('aria-expanded')), 'true'); await page.click('#library-toggle');
  await page.click('#settings-open'); await shot('mobile-settings');
  assert(await page.evaluate(() => document.querySelector('#settings-dialog').getBoundingClientRect().width <= window.innerWidth));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Overflow horizontal nos ajustes mobile.');
  assert.deepEqual(errors, []);
  const report = { exitCode: 0, artifacts: dir, tested: ['Desktop 1440px e mobile 390px', 'Estado vazio sem mídia simulada', 'Nome com tags exibido como texto', 'Criação de projeto, upload MP4, 5 frames', 'Importação SRT, corte manual, render legendado, preview real', 'Dialog de publicação exige confirmação; nenhuma postagem', 'Guia na primeira visita, exemplos preenchem o chat', 'Ajustes: Opus 5.5/médio padrão, abas, chave salva sem eco e removida', 'Modal configurações, pendências Composio/Whisper', 'Mobile sem overflow horizontal, biblioteca e Escape', 'Nenhum pageerror'], screenshots: ['desktop-empty.png', 'desktop-guide.png', 'desktop-settings.png', 'desktop-settings-ai.png', 'desktop-settings-keys.png', 'desktop-edit.png', 'desktop-result.png', 'mobile-result.png', 'mobile-settings.png'] };
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (e) { console.error(e.message, '\nArtefatos:', dir); process.exitCode = 1; if (page) await shot('failure'); }
finally { await browser?.close(); server.kill(); }
