import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.STUDIO_DATA = path.resolve('test-artifacts', 'checks-' + randomUUID());
const { ROOT, initStore, safe, id, createProject, updateProject, readProject, atomic, parseSrt, srtFor, validatePlan, validateSettings, settings, saveSecrets, secret, secretStatus } = await import('./store.mjs');
await initStore();
test('IDs, paths e junctions não escapam da pasta de dados', async () => {
  assert.throws(() => id('../secret'));
  assert.throws(() => id('123'));
  await assert.rejects(safe(ROOT, '..', 'secret'));
  await assert.rejects(safe(ROOT, '..\\secret'));
  const link = path.join(ROOT, 'junction');
  await fs.symlink(path.resolve('test-artifacts'), link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(safe(ROOT, 'junction', 'secret'));
  await fs.unlink(link);
});
test('JSON atômico e mutações concorrentes preservam todos os dados', async () => {
  const p = await createProject('Teste de persistência');
  await Promise.all(Array.from({ length: 30 }, (_, i) => updateProject(p.id, x => { x.chat.push({ role: 'user', text: String(i) }); })));
  assert.equal((await readProject(p.id)).chat.length, 30);
  const file = await safe(ROOT, 'atomic.json');
  await Promise.all(Array.from({ length: 12 }, (_, i) => atomic(file, { i, marker: 'válido' })));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { i: 11, marker: 'válido' });
  assert.equal((await fs.readdir(ROOT)).filter(x => x.endsWith('.tmp')).length, 0);
});
test('Escritas sobrevivem a leituras concorrentes do mesmo JSON (EPERM no Windows)', async () => {
  const p = await createProject('Leitura concorrente');
  let reading = true; const readers = Array.from({ length: 4 }, async () => { while (reading) { await readProject(p.id); await new Promise(r => setTimeout(r, 1)); } });
  try { await Promise.all(Array.from({ length: 60 }, (_, i) => updateProject(p.id, x => { x.chat.push({ role: 'user', text: String(i) }); }))); }
  finally { reading = false; await Promise.allSettled(readers); }
  assert.equal((await readProject(p.id)).chat.length, 60);
});
test('Ajustes padrão Opus 5.5 médio e chaves nunca voltam em texto', async () => {
  const s = await settings();
  assert.equal(s.provider, 'claude-cli'); assert.equal(s.models.claude, 'claude-opus-5-5'); assert.equal(s.effort, 'medium');
  await atomic(await safe(ROOT, 'settings.json'), { model: 'sonnet', skills: false });
  assert.equal((await settings()).models.claude, 'claude-opus-5-5');
  assert.throws(() => validateSettings({ ...s, provider: 'shell' }));
  assert.throws(() => validateSettings({ ...s, effort: 'turbo' }));
  assert.throws(() => validateSettings({ ...s, models: { claude: 'opus; rm -rf' } }));
  assert.equal(validateSettings({ ...s, models: {} }).models.openrouter, 'anthropic/claude-opus-5.5');
  await assert.rejects(saveSecrets({ PATH: 'x'.repeat(20) }));
  await assert.rejects(saveSecrets({ OPENAI_API_KEY: 'tem espaço no meio' }));
  const status = await saveSecrets({ OPENROUTER_API_KEY: 'sk-or-test-1234567890abcd' });
  assert.deepEqual(status.OPENROUTER_API_KEY, { set: true, source: 'saved', hint: '…abcd' });
  assert.equal(secret('OPENROUTER_API_KEY'), 'sk-or-test-1234567890abcd');
  assert.doesNotMatch(JSON.stringify(secretStatus()), /1234567890/);
  assert.equal((await saveSecrets({ OPENROUTER_API_KEY: '' })).OPENROUTER_API_KEY.set, false);
});
test('Planos, configurações e legendas rejeitam limites e conteúdo perigoso', () => {
  const p = { source: { duration: 10 } };
  assert.throws(() => validatePlan({ kind: 'cuts', message: 'corte', cuts: [{ start: 9, end: 20, title: 'A' }] }, p));
  assert.throws(() => validatePlan({ kind: 'create', message: 'criar', scenes: [{ duration: -1, title: 'A', text: '' }] }, p));
  assert.throws(() => validateSettings({ model: 'sonnet', igUserId: '../secret' }));
  assert.throws(() => parseSrt('1\n00:00:09,000 --> 00:00:12,000\nFora', 10));
  assert.throws(() => parseSrt('1\n00:00:00,000 --> 00:00:02,000\nA\n\n2\n00:00:01,000 --> 00:00:03,000\nB', 10));
  const cues = parseSrt('1\n00:00:00,000 --> 00:00:02,000\n<b>Texto</b> {\\an8}\n\n2\n00:00:02,000 --> 00:00:04,000\nSegundo', 10);
  assert.equal(cues[0].text, 'Texto an8');
  assert.match(srtFor(cues, 1, 3), /00:00:00,000 --> 00:00:01,000/);
  assert.match(srtFor(cues, 1, 3), /00:00:01,000 --> 00:00:02,000/);
  assert.doesNotMatch(cues.map(c => c.text).join(' '), /[{}<>\\]/);
});
